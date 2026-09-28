'use strict';

const { randomUUID } = require('crypto');
const persistence = require('../persistence');
const { hashPassword, verifyPassword, randomToken, hashToken } = require('./authCrypto');
const { normalizeFeatures, CLOUD_ADMIN_ROLES, isCloudMatrixEditableRole } = require('../auth/featureCatalog');

const FILE = 'cloud_tenants.json';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function empty() {
  return {
    tenants: {},
    users: {},
    sessions: {},
    assets: {},
    devices: {},
    seededAt: null,
  };
}

function load() {
  const raw = persistence.readJson(FILE, null);
  if (!raw || typeof raw !== 'object') return empty();
  return {
    tenants: raw.tenants && typeof raw.tenants === 'object' ? raw.tenants : {},
    users: raw.users && typeof raw.users === 'object' ? raw.users : {},
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    assets: raw.assets && typeof raw.assets === 'object' ? raw.assets : {},
    devices: raw.devices && typeof raw.devices === 'object' ? raw.devices : {},
    seededAt: raw.seededAt || null,
  };
}

function save(store) {
  persistence.writeJson(FILE, store);
}

function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

class TenantStore {
  constructor() {
    this._store = load();
    this.ensureSeed();
  }

  ensureSeed() {
    if (this._store.seededAt && Object.keys(this._store.tenants).length) return;
    const tenantSlug = process.env.PEAKLOGIC_SEED_TENANT || 'demo';
    const adminEmail = process.env.PEAKLOGIC_SEED_ADMIN_EMAIL || 'admin@demo.local';
    const adminPass = process.env.PEAKLOGIC_SEED_ADMIN_PASSWORD || 'ChangeMeAdmin!';
    const opEmail = process.env.PEAKLOGIC_SEED_OPERATOR_EMAIL || 'operator@demo.local';
    const opPass = process.env.PEAKLOGIC_SEED_OPERATOR_PASSWORD || 'demo';
    const hoEmail = process.env.PEAKLOGIC_SEED_HOMEOWNER_EMAIL || 'homeowner@demo.local';
    const hoPass = process.env.PEAKLOGIC_SEED_HOMEOWNER_PASSWORD || 'demo';

    const existingBySlug = Object.values(this._store.tenants).find((t) => t.tenantSlug === tenantSlug);
    if (!existingBySlug && !this._store.tenants[tenantSlug]) {
      const tenantId = randomUUID();
      this._store.tenants[tenantId] = {
        tenantId,
        tenantSlug,
        name: 'Demo Organization',
        cmms: { enabled: true, externalUrl: '' },
        entitlements: {
          cameras: { remoteView: true },
          studio: true,
          cmms: true,
        },
        createdAt: new Date().toISOString(),
      };
    }
    const demoTenant = this.getTenant(tenantSlug);
    const demoTenantId = demoTenant?.tenantId || null;
    if (!Object.values(this._store.users).some((u) => u.role === 'platform_admin')) {
      const id = `user_${randomToken(6)}`;
      this._store.users[id] = {
        userId: id,
        email: adminEmail.toLowerCase(),
        name: 'Platform Admin',
        role: 'platform_admin',
        tenantId: null,
        passwordHash: hashPassword(adminPass),
        createdAt: new Date().toISOString(),
      };
    }
    if (!Object.values(this._store.users).some((u) => u.email === opEmail.toLowerCase())) {
      const id = `user_${randomToken(6)}`;
      this._store.users[id] = {
        userId: id,
        email: opEmail.toLowerCase(),
        name: 'Demo Operator',
        role: 'tenant_admin',
        tenantId: demoTenantId,
        passwordHash: hashPassword(opPass),
        createdAt: new Date().toISOString(),
      };
    }
    if (!Object.values(this._store.users).some((u) => u.email === hoEmail.toLowerCase())) {
      const id = `user_${randomToken(6)}`;
      this._store.users[id] = {
        userId: id,
        email: hoEmail.toLowerCase(),
        name: 'Demo Homeowner',
        role: 'homeowner',
        tenantId: demoTenantId,
        passwordHash: hashPassword(hoPass),
        createdAt: new Date().toISOString(),
      };
    }
    this._store.seededAt = new Date().toISOString();
    save(this._store);
    console.log(`[tenants] seeded org "${tenantSlug}" (${demoTenantId}) — admin ${adminEmail} / operator ${opEmail} / homeowner ${hoEmail}`);
  }

  listTenants() {
    return Object.values(this._store.tenants)
      .map((t) => this.publicTenant(t))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getTenant(idOrSlug) {
    const key = String(idOrSlug || '').trim();
    const t = this._store.tenants[key]
      || Object.values(this._store.tenants).find((x) => x.tenantId === key || x.tenantSlug === key);
    return t || null;
  }

  publicTenant(t) {
    if (!t) return null;
    return {
      tenantId: t.tenantId,
      id: t.tenantId,
      tenantSlug: t.tenantSlug,
      name: t.name,
      cmmsEnabled: !!(t.cmms && t.cmms.enabled),
      cmmsExternalUrl: (t.cmms && t.cmms.externalUrl) || '',
      entitlements: { ...(t.entitlements || {}) },
      createdAt: t.createdAt,
    };
  }

  createTenant({ tenantSlug, name, cmmsEnabled } = {}) {
    const slug = slugify(tenantSlug || name);
    if (!slug) throw Object.assign(new Error('tenantSlug required'), { status: 400 });
    if (Object.values(this._store.tenants).some((t) => t.tenantSlug === slug)) {
      throw Object.assign(new Error('tenant already exists'), { status: 409 });
    }
    const tenantId = randomUUID();
    const rec = {
      tenantId,
      tenantSlug: slug,
      name: String(name || slug).trim() || slug,
      cmms: { enabled: !!cmmsEnabled, externalUrl: '' },
      entitlements: {
        cameras: { remoteView: true },
        studio: true,
        cmms: !!cmmsEnabled,
      },
      createdAt: new Date().toISOString(),
    };
    this._store.tenants[tenantId] = rec;
    save(this._store);
    return this.publicTenant(rec);
  }

  patchTenantCmms(tenantId, { enabled, externalUrl } = {}) {
    const t = this.getTenant(tenantId);
    if (!t) throw Object.assign(new Error('tenant not found'), { status: 404 });
    if (!t.cmms) t.cmms = { enabled: false, externalUrl: '' };
    if (enabled !== undefined) t.cmms.enabled = !!enabled;
    if (externalUrl !== undefined) t.cmms.externalUrl = String(externalUrl || '').trim();
    if (!t.entitlements) t.entitlements = {};
    t.entitlements.cmms = !!t.cmms.enabled;
    save(this._store);
    return this.publicTenant(t);
  }

  findUserByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return Object.values(this._store.users).find((u) => u.email === e) || null;
  }

  publicUser(u, tenant) {
    if (!u) return null;
    const t = tenant || (u.tenantId ? this.getTenant(u.tenantId) : null);
    const role = u.role || 'operator';
    return {
      userId: u.userId,
      email: u.email,
      name: u.name,
      role,
      tenantId: u.tenantId,
      tenantSlug: t ? t.tenantSlug : null,
      cmmsEnabled: !!(t && t.cmms && t.cmms.enabled),
      features: normalizeFeatures(u.features, role),
    };
  }

  createUser({ email, password, name, role, tenantId, features } = {}) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !password) throw Object.assign(new Error('email and password required'), { status: 400 });
    if (this.findUserByEmail(e)) throw Object.assign(new Error('user exists'), { status: 409 });
    const allowed = ['operator', 'tenant_admin', 'technician', 'homeowner', 'viewer'];
    const r = allowed.includes(role) ? role : 'operator';
    if (r !== 'platform_admin' && !this.getTenant(tenantId)) {
      throw Object.assign(new Error('valid tenantId required'), { status: 400 });
    }
    const id = `user_${randomToken(6)}`;
    const rec = {
      userId: id,
      email: e,
      name: String(name || e).trim(),
      role: r,
      tenantId: r === 'platform_admin' ? null : String(tenantId),
      passwordHash: hashPassword(password),
      features: normalizeFeatures(features, r),
      createdAt: new Date().toISOString(),
    };
    this._store.users[id] = rec;
    save(this._store);
    return this.publicUser(rec, this.getTenant(rec.tenantId));
  }

  updateFeaturesMatrix(tenantId, matrix) {
    if (!matrix || typeof matrix !== 'object') {
      throw Object.assign(new Error('matrix required'), { status: 400 });
    }
    const tid = String(tenantId || '').trim();
    if (!tid) throw Object.assign(new Error('tenantId required'), { status: 400 });
    const updated = [];
    for (const [userId, features] of Object.entries(matrix)) {
      const cur = this._store.users[userId];
      if (!cur || String(cur.tenantId) !== tid) continue;
      if (CLOUD_ADMIN_ROLES.has(cur.role) || !isCloudMatrixEditableRole(cur.role)) continue;
      cur.features = normalizeFeatures(features, cur.role);
      updated.push(this.publicUser(cur, this.getTenant(tid)));
    }
    if (updated.length) save(this._store);
    return updated;
  }

  listUsers(tenantId) {
    return Object.values(this._store.users)
      .filter((u) => {
        if (tenantId == null) return true;
        return u.tenantId === tenantId || u.role === 'platform_admin';
      })
      .map((u) => this.publicUser(u, u.tenantId ? this.getTenant(u.tenantId) : null));
  }

  login({ tenantId, tenantSlug, organizationId, email, password } = {}) {
    const user = this.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }
    const orgKey = String(tenantId || tenantSlug || organizationId || '').trim();
    if (user.role !== 'platform_admin') {
      const t = this.getTenant(user.tenantId);
      if (!t) throw Object.assign(new Error('User has no tenant'), { status: 403 });
      if (orgKey) {
        const want = this.getTenant(orgKey);
        if (!want || want.tenantId !== t.tenantId) {
          throw Object.assign(new Error('Organization ID does not match this user'), { status: 403 });
        }
      }
    } else if (orgKey) {
      const t = this.getTenant(orgKey);
      if (!t) throw Object.assign(new Error('Unknown organization'), { status: 404 });
    }
    this.purgeExpiredSessions();
    const token = randomToken(24);
    const sid = hashToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    this._store.sessions[sid] = {
      sessionId: sid,
      userId: user.userId,
      activeTenantId: user.role === 'platform_admin' && orgKey
        ? this.getTenant(orgKey)?.tenantId || null
        : user.tenantId,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    save(this._store);
    const activeTenant = this.getTenant(this._store.sessions[sid].activeTenantId);
    return {
      token,
      expiresAt,
      user: this.publicUser(user, activeTenant),
      tenant: this.publicTenant(activeTenant),
    };
  }

  sessionFromToken(token) {
    if (!token) return null;
    this.purgeExpiredSessions();
    const sid = hashToken(token);
    const sess = this._store.sessions[sid];
    if (!sess || sess.expiresAt < Date.now()) return null;
    const user = this._store.users[sess.userId];
    if (!user) return null;
    const tenant = this.getTenant(sess.activeTenantId);
    return {
      session: sess,
      user: this.publicUser(user, tenant),
      tenant: this.publicTenant(tenant),
      token,
    };
  }

  logout(token) {
    if (!token) return;
    delete this._store.sessions[hashToken(token)];
    save(this._store);
  }

  purgeExpiredSessions() {
    const now = Date.now();
    let dirty = false;
    for (const [k, s] of Object.entries(this._store.sessions)) {
      if (!s || s.expiresAt < now) {
        delete this._store.sessions[k];
        dirty = true;
      }
    }
    if (dirty) save(this._store);
  }

  listAssets(tenantId) {
    return Object.values(this._store.assets)
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  upsertAsset(tenantId, body = {}) {
    const assetId = String(body.assetId || `asset_${randomToken(4)}`).trim();
    const key = `${tenantId}|${assetId}`;
    const prev = this._store.assets[key] || {};
    const rec = {
      ...prev,
      assetId,
      tenantId,
      siteId: String(body.siteId || prev.siteId || '').trim(),
      name: String(body.name || prev.name || assetId).trim(),
      kind: String(body.kind || prev.kind || 'equipment').trim(),
      status: String(body.status || prev.status || 'ok').trim(), // ok|warn|alarm|offline
      x: Number.isFinite(Number(body.x)) ? Number(body.x) : (prev.x ?? 50),
      y: Number.isFinite(Number(body.y)) ? Number(body.y) : (prev.y ?? 50),
      meta: body.meta && typeof body.meta === 'object' ? body.meta : (prev.meta || {}),
      updatedAt: new Date().toISOString(),
    };
    this._store.assets[key] = rec;
    save(this._store);
    return rec;
  }

  deleteAsset(tenantId, assetId) {
    const key = `${tenantId}|${assetId}`;
    if (!this._store.assets[key]) return false;
    delete this._store.assets[key];
    save(this._store);
    return true;
  }

  listDevices(tenantId) {
    return Object.values(this._store.devices)
      .filter((d) => d.tenantId === tenantId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  upsertDevice(tenantId, body = {}) {
    const deviceId = String(body.deviceId || `dev_${randomToken(4)}`).trim();
    const key = `${tenantId}|${deviceId}`;
    const prev = this._store.devices[key] || {};
    const rec = {
      ...prev,
      deviceId,
      tenantId,
      siteId: String(body.siteId || prev.siteId || '').trim(),
      name: String(body.name || prev.name || deviceId).trim(),
      kind: String(body.kind || prev.kind || 'controller').trim(),
      serial: String(body.serial || prev.serial || '').trim(),
      sim: String(body.sim || prev.sim || '').trim(),
      online: body.online != null ? !!body.online : !!prev.online,
      commissioning: String(body.commissioning || prev.commissioning || 'unknown').trim(),
      firmware: String(body.firmware || prev.firmware || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    this._store.devices[key] = rec;
    save(this._store);
    return rec;
  }
}

const tenantStore = new TenantStore();

module.exports = {
  tenantStore,
  TenantStore,
  slugify,
};
