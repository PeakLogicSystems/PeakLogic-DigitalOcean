'use strict';

const express = require('express');
const { tenantStore } = require('../../tenants/tenantStore');
const { applianceAuthStore } = require('../../auth/applianceAuthStore');
const { FEATURE_CATALOG } = require('../../auth/featureCatalog');
const mongoSysLog = require('../../logger/mongoSysLog');
const {
  requireAuth,
  requirePlatformAdmin,
  requireTenantAccess,
  requireApplianceAdmin,
  activeTenantId,
  isPartnerHome,
  setSessionCookie,
  clearSessionCookie,
  logoutToken,
  extractToken,
} = require('../../tenants/authMiddleware');
const { isTenantRole, isPartnerRole, PARTNER_ROLES, TENANT_ROLES } = require('../../tenants/tenantRoles');
const { isPartnerHomeSession } = require('../../tenants/partnerAccess');
const { siteStore } = require('../../cloud/siteStore');
const {
  cloudAccessCatalogPayload,
  cloudUserHasFeature,
} = require('../../tenants/cloudCapabilityMatrix');
const { isCloudDeployment } = require('../../cloud/agentProtocol');
const { requireFeature } = require('../../auth/featureGate');
const { isMailConfigured } = require('../../mail/mailer');
const { publicSiteKeyFields } = require('../../parc/commissionFence');
const {
  sendInviteEmail,
  sendMfaCodeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require('../../mail/accountEmails');

function authUserForLog(user) {
  if (!user) return null;
  return {
    id: user.userId || user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

function isUserAdmin(req) {
  const r = req.mvAuth?.user?.role;
  if (r === 'platform_admin' || r === 'tenant_admin') return true;
  if (r === 'partner_admin' && isPartnerHome(req)) return true;
  return false;
}

/** Tenant admin, platform admin, partner admin (home org), or supervisor (people capability). */
function canManagePeople(req) {
  const user = req.mvAuth?.user;
  if (!user) return false;
  if (user.role === 'platform_admin' || user.role === 'tenant_admin') return true;
  if (user.role === 'partner_admin' && isPartnerHome(req)) return true;
  if (isPartnerRole(user.role) && !isPartnerHome(req)) return false;
  return cloudUserHasFeature(user, 'people');
}

/** Tenant/platform admin or people-capable supervisor can change roles. */
function canChangeRoles(req) {
  return canManagePeople(req);
}

/** Only tenant/platform admin may assign or create tenant_admin. */
function canAssignTenantAdmin(req) {
  return isUserAdmin(req);
}

function roleOptionsMessage() {
  return `Invalid role — use: ${[...TENANT_ROLES, ...PARTNER_ROLES].join(', ')}`;
}

function partnerBillingSummary(partnerId) {
  const customers = tenantStore.listLinkedCustomers(partnerId);
  const sites = siteStore.listSites();
  const rows = customers.map((c) => {
    const customerSites = sites.filter((s) => s.tenantId === c.tenantId);
    return {
      tenantId: c.tenantId,
      tenantSlug: c.tenantSlug,
      name: c.name,
      cmmsEnabled: c.cmmsEnabled,
      entitlements: c.entitlements,
      billing: c.billing || {},
      siteCount: customerSites.length,
      sitesOnline: customerSites.filter((s) => !!s.agentOnline).length,
      ...publicSiteKeyFields(c.globalSiteKey),
    };
  });
  const partner = tenantStore.publicTenant(tenantStore.getTenant(partnerId));
  return {
    partner,
    customerCount: rows.length,
    totalSites: rows.reduce((n, r) => n + r.siteCount, 0),
    customers: rows,
  };
}

function assertTargetTenantUser(target, tenantId) {
  if (!target) throw Object.assign(new Error('user not found'), { status: 404 });
  if (target.role === 'platform_admin') {
    throw Object.assign(new Error('Cannot modify platform admin here'), { status: 403 });
  }
  if (tenantId && target.tenantId !== tenantId) {
    throw Object.assign(new Error('User belongs to another organization'), { status: 403 });
  }
}

async function createCloudUserWithInvite(body) {
  const invite = body.invite !== false && body.invite !== 'false';
  if (invite && !isMailConfigured()) {
    throw Object.assign(
      new Error('Email is not configured — set SMTP_* in saas.env (or Messaging settings) before inviting users'),
      { status: 503 },
    );
  }
  const created = tenantStore.createUser({ ...body, invite });
  const user = created.user;
  let inviteSent = false;
  if (created.inviteToken) {
    try {
      const tenant = tenantStore.getTenant(user.tenantId);
      const mail = await sendInviteEmail({
        tenant: tenant ? { ...tenant, slug: tenant.tenantSlug } : null,
        user,
        token: created.inviteToken,
      });
      inviteSent = !!mail.sent;
      if (!mail.sent) {
        throw new Error(mail.reason === 'mail_not_configured'
          ? 'Email is not configured — invite not sent'
          : 'Failed to send invite email');
      }
    } catch (e) {
      try { tenantStore.deleteUser(user.userId); } catch { /* ignore */ }
      throw Object.assign(
        new Error(e.message || 'Failed to send invite email'),
        { status: e.status || 503 },
      );
    }
  }
  return { user, inviteSent };
}

function createTenantAuthRoutes() {
  const router = express.Router();

  router.post('/auth/login', async (req, res) => {
    try {
      const body = req.body || {};
      let result;
      if (isCloudDeployment()) {
        result = tenantStore.login({
          ...body,
          tenantSlug: body.tenantSlug || body.organizationId || body.tenantId,
        });
        if (result.mfaRequired) {
          const mail = await sendMfaCodeEmail({
            tenant: result._tenant
              ? { ...result._tenant, slug: result._tenant.tenantSlug }
              : null,
            user: result._user,
            code: result._mfaCode,
          });
          if (!mail.sent) {
            const devMfa = process.env.PEAKLOGIC_MFA_DEV === '1'
              || process.env.PEAKLOGIC_MFA_DEV === 'true';
            if (devMfa && mail.reason === 'mail_not_configured') {
              console.warn(
                `[auth] MFA dev mode — SMTP not configured; sign-in code for ${result._user.email}: ${result._mfaCode}`,
              );
              return res.json({
                mfaRequired: true,
                mfaToken: result.mfaToken,
                expiresAt: result.expiresAt,
                emailHint: result.emailHint,
                devMfa: true,
              });
            }
            return res.status(503).json({
              error: mail.reason === 'mail_not_configured'
                ? 'Email is not configured — cannot complete two-factor sign-in'
                : 'Failed to send verification code',
            });
          }
          return res.json({
            mfaRequired: true,
            mfaToken: result.mfaToken,
            expiresAt: result.expiresAt,
            emailHint: result.emailHint,
          });
        }
      } else {
        result = applianceAuthStore.login({
          email: body.email,
          password: body.password,
        });
      }
      setSessionCookie(res, result.token, result.expiresAt);
      mongoSysLog.info('auth', 'User signed in', {
        email: result.user.email,
        role: result.user.role,
      }, { user: authUserForLog(result.user) });
      res.json({
        user: result.user,
        tenant: result.tenant,
        expiresAt: result.expiresAt,
        features: result.user.features || null,
        accessibleTenants: result.accessibleTenants || null,
        featureCatalog: isCloudDeployment() ? null : FEATURE_CATALOG,
      });
    } catch (e) {
      mongoSysLog.warn('auth', 'Sign-in failed', {
        email: String(req.body?.email || '').trim() || null,
        reason: e.message || String(e),
      });
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/auth/mfa/verify', (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const result = tenantStore.verifyMfa({
        mfaToken: req.body?.mfaToken,
        code: req.body?.code,
      });
      setSessionCookie(res, result.token, result.expiresAt);
      mongoSysLog.info('auth', 'User signed in (2FA)', {
        email: result.user.email,
        role: result.user.role,
      }, { user: authUserForLog(result.user) });
      res.json({
        user: result.user,
        tenant: result.tenant,
        expiresAt: result.expiresAt,
        features: result.user.features || null,
        accessibleTenants: result.accessibleTenants || null,
      });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/auth/invite/:token', (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const info = tenantStore.findInvite(req.params.token);
      if (!info) return res.status(404).json({ error: 'Invalid or expired invite' });
      if (info.expired) return res.status(410).json({ error: 'Invite has expired', user: info.user });
      res.json({ user: info.user, tenant: info.tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/auth/accept-invite', (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const user = tenantStore.acceptInvite({
        token: req.body?.token,
        password: req.body?.password,
        name: req.body?.name,
      });
      mongoSysLog.info('auth', 'Invite accepted', {
        email: user.email,
      }, { user: authUserForLog(user) });
      res.json({ user });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/auth/forgot-password', async (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const email = String(req.body?.email || '').trim().toLowerCase();
      const generic = {
        ok: true,
        message: 'If that account exists, a reset email was sent.',
      };
      if (!email || !isMailConfigured()) {
        return res.json(generic);
      }
      const issued = tenantStore.issuePasswordReset(email);
      if (issued) {
        const tenant = issued.tenant
          ? { ...issued.tenant, slug: issued.tenant.tenantSlug }
          : null;
        await sendPasswordResetEmail({
          tenant,
          user: issued.user,
          token: issued.token,
        });
        mongoSysLog.info('auth', 'Password reset requested', {
          email: issued.user.email,
        }, { user: authUserForLog(issued.user) });
      }
      res.json(generic);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/auth/reset-password/:token', (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const info = tenantStore.findPasswordReset(req.params.token);
      if (!info) return res.status(404).json({ error: 'Invalid or expired reset link' });
      if (info.expired) return res.status(410).json({ error: 'Reset link has expired', user: info.user });
      res.json({ user: info.user, tenant: info.tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/auth/reset-password', async (req, res) => {
    try {
      if (!isCloudDeployment()) {
        return res.status(404).json({ error: 'Not available on appliance' });
      }
      const user = tenantStore.completePasswordReset({
        token: req.body?.token,
        password: req.body?.password,
      });
      const tenant = tenantStore.getTenant(user.tenantId);
      try {
        await sendPasswordChangedEmail({
          tenant: tenant ? { ...tenant, slug: tenant.tenantSlug } : null,
          user,
        });
      } catch { /* non-fatal */ }
      mongoSysLog.info('auth', 'Password reset completed', {
        email: user.email,
      }, { user: authUserForLog(user) });
      res.json({ user, ok: true });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/auth/logout', (req, res) => {
    const user = req.mvAuth?.user;
    if (req.mvToken) logoutToken(req.mvToken);
    clearSessionCookie(res);
    if (user) {
      mongoSysLog.info('auth', 'User signed out', {
        email: user.email,
      }, { user: authUserForLog(user) });
    }
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const user = req.mvAuth.user;
    const rawUser = tenantStore.getUser(user.userId);
    res.json({
      user,
      tenant: req.mvAuth.tenant,
      cmmsEnabled: !!user.cmmsEnabled,
      features: user.features || null,
      accessibleTenants: rawUser
        ? tenantStore.listAccessibleTenantsForUser(rawUser)
        : (req.mvAuth.accessibleTenants || []),
      isPartner: isPartnerRole(user.role),
      isPartnerHome: isPartnerHomeSession(user, activeTenantId(req)),
      featureCatalog: isCloudDeployment() ? null : FEATURE_CATALOG,
    });
  });

  router.get('/auth/features', (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Not available on cloud deployment' });
    }
    res.json({ features: FEATURE_CATALOG });
  });

  router.get('/auth/users', requireAuth, requireApplianceAdmin, (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Use /tenant/users on cloud deployment' });
    }
    res.json({ users: applianceAuthStore.listUsers(), features: FEATURE_CATALOG });
  });

  router.post('/auth/users', requireAuth, requireApplianceAdmin, (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Use /tenant/users on cloud deployment' });
    }
    try {
      const user = applianceAuthStore.createUser(req.body || {});
      mongoSysLog.maintenance('users', 'Created user account', {
        email: user.email,
        role: user.role,
      }, { user: authUserForLog(req.mvAuth.user) });
      res.status(201).json({ user });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.put('/auth/users/:id', requireAuth, requireApplianceAdmin, (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Use /tenant/users on cloud deployment' });
    }
    try {
      const user = applianceAuthStore.updateUser(req.params.id, req.body || {});
      mongoSysLog.maintenance('users', 'Updated user account', {
        email: user.email,
        role: user.role,
      }, { user: authUserForLog(req.mvAuth.user) });
      res.json({ user });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.put('/auth/users/features-matrix', requireAuth, requireFeature('users'), (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Not available on cloud deployment' });
    }
    try {
      const users = applianceAuthStore.updateFeaturesMatrix(req.body?.matrix || req.body || {});
      mongoSysLog.maintenance('users', 'Updated user feature access matrix', {
        userCount: users.length,
      }, { user: authUserForLog(req.mvAuth.user) });
      res.json({ users, features: FEATURE_CATALOG });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/auth/users/:id', requireAuth, requireApplianceAdmin, (req, res) => {
    if (isCloudDeployment()) {
      return res.status(404).json({ error: 'Use cloud admin routes' });
    }
    try {
      const victim = applianceAuthStore.getUser(req.params.id);
      applianceAuthStore.deleteUser(req.params.id);
      mongoSysLog.maintenance('users', 'Deleted user account', {
        email: victim?.email || req.params.id,
      }, { user: authUserForLog(req.mvAuth.user) });
      res.status(204).end();
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/tenant', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    const tenant = tid ? tenantStore.publicTenant(tenantStore.getTenant(tid)) : req.mvAuth.tenant;
    if (!tenant && req.mvAuth.user.role !== 'platform_admin') {
      return res.status(404).json({ error: 'No tenant' });
    }
    res.json({
      tenant: tenant || null,
      cmmsEnabled: !!(tenant && tenant.cmmsEnabled),
      user: req.mvAuth.user,
    });
  });

  router.get('/admin/tenants', requireAuth, requirePlatformAdmin, (req, res) => {
    res.json({ tenants: tenantStore.listTenants() });
  });

  router.get('/admin/partners', requireAuth, requirePlatformAdmin, (req, res) => {
    res.json({ partners: tenantStore.listPartnerTenants() });
  });

  router.get('/admin/customers', requireAuth, requirePlatformAdmin, (req, res) => {
    res.json({ customers: tenantStore.listCustomerTenants() });
  });

  router.post('/admin/tenants', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const tenant = tenantStore.createTenant(req.body || {});
      res.status(201).json({ tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.patch('/admin/tenants/:id/cmms', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const tenant = tenantStore.patchTenantCmms(req.params.id, req.body || {});
      res.json({ tenant, cmmsEnabled: tenant.cmmsEnabled });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.patch('/admin/tenants/:id/partner', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const tenant = tenantStore.patchTenantPartner(req.params.id, {
        partnerId: body.partnerId || body.partnerSlug,
        clear: body.clear,
      });
      res.json({ tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.patch('/admin/tenants/:id/type', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const tenantType = req.body?.tenantType || req.body?.type;
      if (!tenantType) return res.status(400).json({ error: 'tenantType required (partner or customer)' });
      const tenant = tenantStore.patchTenantType(req.params.id, tenantType);
      res.json({ tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.patch('/admin/tenants/:id', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const tenant = tenantStore.patchTenant(req.params.id, {
        name: body.name,
        tenantType: body.tenantType || body.type,
      });
      res.json({ tenant });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/admin/tenants/:id', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const result = tenantStore.deleteTenant(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/admin/users', requireAuth, requirePlatformAdmin, (req, res) => {
    let tid = req.query.tenantId || req.query.tenantSlug || null;
    if (tid) {
      const t = tenantStore.getTenant(tid);
      if (!t) return res.status(404).json({ error: 'Unknown organization' });
      tid = t.tenantId;
    }
    res.json({ users: tenantStore.listUsers(tid) });
  });

  router.post('/admin/users', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      const orgKey = body.tenantId || body.tenantSlug;
      if (orgKey) {
        const t = tenantStore.getTenant(orgKey);
        if (!t) return res.status(404).json({ error: 'Unknown organization' });
        body.tenantId = t.tenantId;
      }
      if (body.role !== 'platform_admin' && !body.tenantId) {
        return res.status(400).json({ error: 'tenantId or tenantSlug required' });
      }
      if (body.role !== 'platform_admin' && !isTenantRole(body.role) && !isPartnerRole(body.role)) {
        return res.status(400).json({ error: roleOptionsMessage() });
      }
      if (body.role === 'platform_admin') {
        const created = tenantStore.createUser({ ...body, invite: false });
        return res.status(201).json({ user: created.user, inviteSent: false });
      }
      const { user, inviteSent } = await createCloudUserWithInvite(body);
      res.status(201).json({ user, inviteSent });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.put('/admin/users/:id', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      const target = tenantStore.getUser(req.params.id);
      if (!target) return res.status(404).json({ error: 'user not found' });
      if (target.role !== 'platform_admin' && req.body?.role === 'platform_admin') {
        return res.status(403).json({ error: 'Cannot promote to platform admin here' });
      }
      if (target.role !== 'platform_admin' && req.body?.role && !isTenantRole(req.body.role) && !isPartnerRole(req.body.role)) {
        return res.status(400).json({ error: roleOptionsMessage() });
      }
      const user = tenantStore.updateUser(req.params.id, req.body || {});
      res.json({ user });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/admin/users/:id/resend-invite', requireAuth, requirePlatformAdmin, async (req, res) => {
    try {
      if (!isMailConfigured()) {
        return res.status(503).json({ error: 'Email is not configured — set SMTP_* in saas.env' });
      }
      const issued = tenantStore.issueInvite(req.params.id);
      const tenant = tenantStore.getTenant(issued.user.tenantId);
      const mail = await sendInviteEmail({
        tenant: tenant ? { ...tenant, slug: tenant.tenantSlug } : null,
        user: issued.user,
        token: issued.inviteToken,
      });
      if (!mail.sent) {
        return res.status(503).json({ error: 'Failed to send invite email' });
      }
      res.json({ user: issued.user, inviteSent: true });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/admin/users/:id', requireAuth, requirePlatformAdmin, (req, res) => {
    try {
      if (req.mvAuth.user.userId === req.params.id) {
        return res.status(403).json({ error: 'Cannot delete your own account' });
      }
      tenantStore.deleteUser(req.params.id);
      res.status(204).end();
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/tenant/access-catalog', requireAuth, requireTenantAccess, (req, res) => {
    res.json(cloudAccessCatalogPayload());
  });

  router.get('/tenant/notification-scope-catalog', requireAuth, requireTenantAccess, (req, res) => {
    if (!canManagePeople(req)) {
      return res.status(403).json({ error: 'People access required' });
    }
    let tid = activeTenantId(req);
    if (req.user?.role === 'platform_admin' && (req.query.tenantId || req.query.tenantSlug)) {
      const t = tenantStore.getTenant(req.query.tenantId || req.query.tenantSlug);
      if (!t) return res.status(404).json({ error: 'Unknown organization' });
      tid = t.tenantId;
    }
    if (!tid) return res.status(400).json({ error: 'No organization in session' });
    const { buildTenantScopeCatalog } = require('../../users/notificationScopeCatalog');
    res.json(buildTenantScopeCatalog(tid));
  });

  router.get('/tenant/users', requireAuth, requireTenantAccess, (req, res) => {
    const tid = activeTenantId(req);
    if (!canManagePeople(req)) {
      return res.status(403).json({ error: 'People access required' });
    }
    res.json({ users: tenantStore.listUsers(tid) });
  });

  router.post('/tenant/users', requireAuth, requireTenantAccess, async (req, res) => {
    if (!canManagePeople(req)) {
      return res.status(403).json({ error: 'People access required' });
    }
    try {
      const tid = activeTenantId(req);
      if (!tid) {
        return res.status(400).json({
          error: 'No organization in session. Sign out, then sign in again with Organization ID set.',
        });
      }
      const body = { ...(req.body || {}), tenantId: tid, role: req.body?.role || 'operator' };
      if (body.role === 'platform_admin') {
        return res.status(403).json({ error: 'Cannot create platform admin here' });
      }
      if (isPartnerHome(req)) {
        if (!isPartnerRole(body.role)) {
          return res.status(400).json({ error: 'Invalid role — use: partner_admin, partner_technician' });
        }
      } else if (!isTenantRole(body.role)) {
        return res.status(400).json({ error: roleOptionsMessage() });
      }
      if (body.role === 'tenant_admin' && !canAssignTenantAdmin(req)) {
        return res.status(403).json({ error: 'Only tenant admin can create tenant admins' });
      }
      const { user, inviteSent } = await createCloudUserWithInvite(body);
      res.status(201).json({ user, inviteSent });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.put('/tenant/users/:id', requireAuth, requireTenantAccess, (req, res) => {
    if (!canManagePeople(req)) return res.status(403).json({ error: 'People access required' });
    try {
      const tid = activeTenantId(req);
      if (!tid) return res.status(400).json({ error: 'No organization in session' });
      const target = tenantStore.getUser(req.params.id);
      assertTargetTenantUser(target, tid);
      const body = { ...(req.body || {}) };
      if (body.role != null) {
        if (!canChangeRoles(req)) {
          return res.status(403).json({ error: 'People access required to change roles' });
        }
        if (isPartnerHome(req)) {
          if (!isPartnerRole(body.role)) {
            return res.status(400).json({ error: 'Invalid role — use: partner_admin, partner_technician' });
          }
        } else if (!isTenantRole(body.role)) {
          return res.status(400).json({ error: roleOptionsMessage() });
        }
        if (body.role === 'tenant_admin' && !canAssignTenantAdmin(req)) {
          return res.status(403).json({ error: 'Only tenant admin can assign tenant admin role' });
        }
        if (target.role === 'tenant_admin' && body.role !== 'tenant_admin' && !canAssignTenantAdmin(req)) {
          return res.status(403).json({ error: 'Only tenant admin can change tenant admin role' });
        }
      }
      if (body.features != null && !canAssignTenantAdmin(req)) {
        return res.status(403).json({ error: 'Only tenant admin can change access matrix' });
      }
      const user = tenantStore.updateUser(req.params.id, body);
      res.json({ user });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.post('/tenant/users/:id/resend-invite', requireAuth, requireTenantAccess, async (req, res) => {
    if (!canManagePeople(req)) return res.status(403).json({ error: 'People access required' });
    try {
      if (!isMailConfigured()) {
        return res.status(503).json({ error: 'Email is not configured — set SMTP_* in saas.env' });
      }
      const tid = activeTenantId(req);
      if (!tid) return res.status(400).json({ error: 'No organization in session' });
      const target = tenantStore.getUser(req.params.id);
      assertTargetTenantUser(target, tid);
      const issued = tenantStore.issueInvite(req.params.id);
      const tenant = tenantStore.getTenant(issued.user.tenantId);
      const mail = await sendInviteEmail({
        tenant: tenant ? { ...tenant, slug: tenant.tenantSlug } : null,
        user: issued.user,
        token: issued.inviteToken,
      });
      if (!mail.sent) {
        return res.status(503).json({ error: 'Failed to send invite email' });
      }
      res.json({ user: issued.user, inviteSent: true });
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.delete('/tenant/users/:id', requireAuth, requireTenantAccess, (req, res) => {
    if (!isUserAdmin(req)) return res.status(403).json({ error: 'Admin required' });
    try {
      if (req.mvAuth.user.userId === req.params.id) {
        return res.status(403).json({ error: 'Cannot delete your own account' });
      }
      const tid = activeTenantId(req);
      if (!tid) return res.status(400).json({ error: 'No organization in session' });
      const target = tenantStore.getUser(req.params.id);
      assertTargetTenantUser(target, tid);
      tenantStore.deleteUser(req.params.id);
      res.status(204).end();
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  router.get('/partner/accessible-tenants', requireAuth, (req, res) => {
    const user = tenantStore.getUser(req.mvAuth.user.userId);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role !== 'platform_admin' && !isPartnerRole(user.role)) {
      return res.status(403).json({ error: 'Partner access required' });
    }
    res.json({ tenants: tenantStore.listAccessibleTenantsForUser(user) });
  });

  router.get('/partner/customers', requireAuth, (req, res) => {
    const user = tenantStore.getUser(req.mvAuth.user.userId);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    let partnerId = null;
    if (user.role === 'platform_admin') {
      const key = req.query.partnerId || req.query.partnerSlug;
      if (!key) return res.status(400).json({ error: 'partnerId required for platform admin' });
      const p = tenantStore.getTenant(key);
      if (!p || p.tenantType !== 'partner') return res.status(404).json({ error: 'Partner not found' });
      partnerId = p.tenantId;
    } else if (isPartnerRole(user.role)) {
      partnerId = user.tenantId;
    } else {
      return res.status(403).json({ error: 'Partner access required' });
    }
    res.json({ customers: tenantStore.listLinkedCustomers(partnerId) });
  });

  router.get('/partner/billing', requireAuth, (req, res) => {
    const user = tenantStore.getUser(req.mvAuth.user.userId);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role === 'platform_admin') {
      const key = req.query.partnerId || req.query.partnerSlug;
      if (!key) return res.status(400).json({ error: 'partnerId required for platform admin' });
      const p = tenantStore.getTenant(key);
      if (!p || p.tenantType !== 'partner') return res.status(404).json({ error: 'Partner not found' });
      return res.json(partnerBillingSummary(p.tenantId));
    }
    if (user.role !== 'partner_admin') {
      return res.status(403).json({ error: 'Partner admin required' });
    }
    res.json(partnerBillingSummary(user.tenantId));
  });

  router.post('/partner/switch-tenant', requireAuth, (req, res) => {
    try {
      const tenantId = req.body?.tenantId || req.body?.tenantSlug;
      if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
      const t = tenantStore.getTenant(tenantId);
      if (!t) return res.status(404).json({ error: 'Unknown organization' });
      const result = tenantStore.switchActiveTenant(req.mvToken, t.tenantId);
      mongoSysLog.info('auth', 'Partner switched organization', {
        email: result.user.email,
        tenantSlug: result.tenant?.tenantSlug,
      }, { user: authUserForLog(result.user) });
      res.json(result);
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createTenantAuthRoutes };
