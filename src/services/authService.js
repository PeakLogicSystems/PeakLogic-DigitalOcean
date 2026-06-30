'use strict';

const { randomUUID, randomBytes } = require('crypto');
const { getDb } = require('../db/mongo');
const { LIMITS } = require('../config');
const { hashPassword } = require('../auth/password');
const { normalizeSlug, isValidSlug } = require('../util/slug');
const { normalizeProfile, defaultProfile } = require('../users/userProfileSchema');
const { defaultCmmsEntitlement, normalizeCmmsEntitlement, publicCmmsEntitlement } = require('../tenants/cmmsEntitlement');

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const USER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function now() {
  return new Date();
}

function publicUser(doc) {
  if (!doc) return null;
  const email = doc.email;
  return {
    id: doc._id,
    tenantId: doc.tenantId,
    email,
    role: doc.role,
    active: doc.active !== false,
    invitePending: !!doc.invitePending,
    profile: doc.profile || defaultProfile(email),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function issueAccountToken({ tenantId, userId, email, purpose, ttlMs }) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  await getDb().collection('password_reset_tokens').insertOne({
    _id: token,
    tenantId,
    userId,
    email,
    purpose,
    expiresAt,
    createdAt: now(),
  });
  return token;
}

function publicTenant(doc) {
  if (!doc) return null;
  const cmms = publicCmmsEntitlement(doc.cmms);
  return {
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    plan: doc.plan,
    maxLocations: doc.maxLocations,
    maxSystemsPerLocation: doc.maxSystemsPerLocation,
    maxDevicesPerSystem: doc.maxDevicesPerSystem,
    cmms,
    cmmsEnabled: cmms.enabled,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Create tenant + admin user atomically.
 * @param {{ tenantName: string, tenantSlug?: string, email: string, password: string, cmms?: object, cmmsEnabled?: boolean }} input
 * @param {{ platformAdmin?: boolean, enabledBy?: string|null }} [opts]
 */
async function signup(input, opts = {}) {
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const name = String(input.tenantName || '').trim();
  let slug = normalizeSlug(input.tenantSlug || name);

  if (!name) return { ok: false, status: 400, error: 'tenantName is required' };
  if (!email || !email.includes('@')) return { ok: false, status: 400, error: 'Valid email is required' };
  if (password.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };
  if (!isValidSlug(slug)) return { ok: false, status: 400, error: 'Invalid tenant slug' };

  const db = getDb();
  const tenants = db.collection('tenants');
  const users = db.collection('users');

  const existingTenant = await tenants.findOne({ slug });
  if (existingTenant) {
    return { ok: false, status: 409, error: 'Tenant slug already in use' };
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const ts = now();
  const passwordHash = await hashPassword(password);

  const wantsCmms = input.cmms?.enabled === true || input.cmmsEnabled === true;
  if (wantsCmms && !opts.platformAdmin) {
    return { ok: false, status: 403, error: 'CMMS entitlement requires platform admin' };
  }

  const cmms = wantsCmms
    ? normalizeCmmsEntitlement({ ...input.cmms, enabled: true }, { enabledAt: ts, enabledBy: opts.enabledBy || 'signup' })
    : defaultCmmsEntitlement();

  const tenantDoc = {
    _id: tenantId,
    slug,
    name,
    plan: 'standard',
    maxLocations: LIMITS.locationsPerTenant,
    maxSystemsPerLocation: LIMITS.systemsPerLocation,
    maxDevicesPerSystem: LIMITS.devicesPerSystem,
    cmms,
    createdAt: ts,
    updatedAt: ts,
  };

  const userDoc = {
    _id: userId,
    tenantId,
    email,
    passwordHash,
    role: 'admin',
    active: true,
    profile: normalizeProfile(input.profile, { email }),
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await tenants.insertOne(tenantDoc);
    await users.insertOne(userDoc);
  } catch (err) {
    await tenants.deleteOne({ _id: tenantId });
    if (err.code === 11000) {
      return { ok: false, status: 409, error: 'Account already exists' };
    }
    throw err;
  }

  return {
    ok: true,
    tenant: publicTenant(tenantDoc),
    user: publicUser(userDoc),
  };
}

/**
 * @param {{ tenantSlug: string, email: string, password: string }} input
 */
async function login(input) {
  const tenantSlug = normalizeSlug(input.tenantSlug);
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');

  if (!isValidSlug(tenantSlug)) return { ok: false, status: 400, error: 'tenantSlug is required' };
  if (!email) return { ok: false, status: 400, error: 'email is required' };
  if (!password) return { ok: false, status: 400, error: 'password is required' };

  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
  if (!tenant) return { ok: false, status: 401, error: 'Invalid credentials' };

  const user = await db.collection('users').findOne({ tenantId: tenant._id, email });
  if (!user) return { ok: false, status: 401, error: 'Invalid credentials' };
  if (user.invitePending) {
    return {
      ok: false,
      status: 403,
      error: 'Check your email for an invite link to set your password.',
    };
  }

  const { verifyPassword } = require('../auth/password');
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, status: 401, error: 'Invalid credentials' };

  return {
    ok: true,
    tenant: publicTenant(tenant),
    user: publicUser(user),
  };
}

async function getUserById(tenantId, userId) {
  const user = await getDb().collection('users').findOne({ _id: userId, tenantId });
  return publicUser(user);
}

async function getTenantById(tenantId) {
  const tenant = await getDb().collection('tenants').findOne({ _id: tenantId });
  return publicTenant(tenant);
}

async function updateUserProfile(tenantId, userId, input, opts = {}) {
  const db = getDb();
  const user = await db.collection('users').findOne({ _id: userId, tenantId });
  if (!user) return { ok: false, status: 404, error: 'User not found' };

  const updates = { updatedAt: now() };
  if (input.email != null) {
    const email = String(input.email).trim().toLowerCase();
    if (!email.includes('@')) return { ok: false, status: 400, error: 'Valid email is required' };
    const dup = await db.collection('users').findOne({ tenantId, email, _id: { $ne: userId } });
    if (dup) return { ok: false, status: 409, error: 'Email already in use' };
    updates.email = email;
  }
  if (input.profile != null) {
    updates.profile = normalizeProfile(input.profile, {
      email: updates.email || user.email,
    });
  }
  if (opts.admin && input.role != null && ['admin', 'operator', 'viewer'].includes(input.role)) {
    updates.role = input.role;
  }
  if (opts.admin && input.active != null) updates.active = !!input.active;

  const result = await db.collection('users').findOneAndUpdate(
    { _id: userId, tenantId },
    { $set: updates },
    { returnDocument: 'after' },
  );
  if (!result) return { ok: false, status: 404, error: 'User not found' };
  return { ok: true, user: publicUser(result) };
}

async function listTenantUsers(tenantId) {
  const docs = await getDb().collection('users')
    .find({ tenantId })
    .sort({ email: 1 })
    .toArray();
  return docs.map(publicUser);
}

async function createTenantUser(tenantId, input, actorRole) {
  if (actorRole !== 'admin') return { ok: false, status: 403, error: 'Forbidden' };
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!email.includes('@')) return { ok: false, status: 400, error: 'Valid email is required' };
  if (password.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };

  const ts = now();
  const userDoc = {
    _id: randomUUID(),
    tenantId,
    email,
    passwordHash: await hashPassword(password),
    role: ['admin', 'operator', 'viewer'].includes(input.role) ? input.role : 'operator',
    active: input.active !== false,
    profile: normalizeProfile(input.profile, { email }),
    createdAt: ts,
    updatedAt: ts,
  };
  try {
    await getDb().collection('users').insertOne(userDoc);
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Email already in use' };
    throw err;
  }
  const user = publicUser(userDoc);
  const tenant = await getTenantById(tenantId);
  const { sendWelcomeEmail } = require('../mail/accountEmails');
  sendWelcomeEmail({ tenant, user, temporaryPassword: password }).catch((err) => {
    console.warn('[mail] welcome:', err?.message || err);
  });
  return { ok: true, user };
}

/**
 * Invite a user by email — they set their password via the invite link.
 * @param {string} tenantId
 * @param {object} input
 * @param {string} actorRole
 */
async function inviteTenantUser(tenantId, input, actorRole) {
  if (actorRole !== 'admin') return { ok: false, status: 403, error: 'Forbidden' };
  const email = String(input.email || '').trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, status: 400, error: 'Valid email is required' };

  const { isMailConfigured } = require('../mail/mailConfig');
  if (!isMailConfigured()) {
    return { ok: false, status: 503, error: 'SMTP is not configured on the server' };
  }

  const db = getDb();
  const existing = await db.collection('users').findOne({ tenantId, email });
  if (existing) return { ok: false, status: 409, error: 'Email already in use' };

  const ts = now();
  const placeholderPassword = randomBytes(24).toString('hex');
  const userDoc = {
    _id: randomUUID(),
    tenantId,
    email,
    passwordHash: await hashPassword(placeholderPassword),
    role: ['admin', 'operator', 'viewer'].includes(input.role) ? input.role : 'operator',
    active: input.active !== false,
    invitePending: true,
    profile: normalizeProfile(input.profile, { email }),
    createdAt: ts,
    updatedAt: ts,
  };

  try {
    await db.collection('users').insertOne(userDoc);
  } catch (err) {
    if (err.code === 11000) return { ok: false, status: 409, error: 'Email already in use' };
    throw err;
  }

  const tenant = await getTenantById(tenantId);
  const user = publicUser(userDoc);
  const token = await issueAccountToken({
    tenantId,
    userId: userDoc._id,
    email,
    purpose: 'invite',
    ttlMs: USER_INVITE_TTL_MS,
  });

  const { sendInviteEmail } = require('../mail/accountEmails');
  try {
    await sendInviteEmail({ tenant, user, token });
  } catch (err) {
    await db.collection('users').deleteOne({ _id: userDoc._id });
    await db.collection('password_reset_tokens').deleteOne({ _id: token });
    console.warn('[mail] invite:', err?.message || err);
    return { ok: false, status: 503, error: 'Unable to send invite email. Try again later.' };
  }

  return { ok: true, user, invited: true };
}

/**
 * @param {string} tenantId
 * @param {string} userId
 * @param {string} actorRole
 */
async function resendUserInvite(tenantId, userId, actorRole) {
  if (actorRole !== 'admin') return { ok: false, status: 403, error: 'Forbidden' };

  const { isMailConfigured } = require('../mail/mailConfig');
  if (!isMailConfigured()) {
    return { ok: false, status: 503, error: 'SMTP is not configured on the server' };
  }

  const db = getDb();
  const userDoc = await db.collection('users').findOne({ _id: userId, tenantId });
  if (!userDoc) return { ok: false, status: 404, error: 'User not found' };
  if (!userDoc.invitePending) {
    return { ok: false, status: 400, error: 'User has already accepted their invite' };
  }

  const tenant = await getTenantById(tenantId);
  const user = publicUser(userDoc);
  const token = await issueAccountToken({
    tenantId,
    userId: userDoc._id,
    email: userDoc.email,
    purpose: 'invite',
    ttlMs: USER_INVITE_TTL_MS,
  });

  const { sendInviteEmail } = require('../mail/accountEmails');
  try {
    await sendInviteEmail({ tenant, user, token });
  } catch (err) {
    await db.collection('password_reset_tokens').deleteOne({ _id: token });
    console.warn('[mail] resend invite:', err?.message || err);
    return { ok: false, status: 503, error: 'Unable to send invite email. Try again later.' };
  }

  return { ok: true, user, invited: true };
}

/**
 * @param {string} token
 */
async function getInviteTokenMeta(token) {
  const doc = await getDb().collection('password_reset_tokens').findOne({
    _id: String(token || '').trim(),
    purpose: 'invite',
  });
  if (!doc || doc.usedAt || doc.expiresAt < new Date()) return null;
  const tenant = await getTenantById(doc.tenantId);
  return {
    email: doc.email,
    tenantName: tenant?.name || tenant?.slug || 'your organization',
    tenantSlug: tenant?.slug || '',
  };
}

async function listNotificationRecipients(tenantId, alarmLevel) {
  const { shouldNotifyForLevel, isWithinQuietHours } = require('../users/userProfileSchema');
  const docs = await getDb().collection('users').find({ tenantId, active: { $ne: false } }).toArray();
  return docs
    .map(publicUser)
    .filter((u) => shouldNotifyForLevel(u.profile?.alarmNotifications, alarmLevel))
    .filter((u) => !isWithinQuietHours(u.profile?.alarmNotifications));
}

/**
 * Request password reset email. Always returns ok to avoid account enumeration.
 * @param {{ tenantSlug: string, email: string }} input
 */
async function requestPasswordReset(input) {
  const tenantSlug = normalizeSlug(input.tenantSlug);
  const email = String(input.email || '').trim().toLowerCase();
  if (!email) return { ok: false, status: 400, error: 'email is required' };

  if (!isValidSlug(tenantSlug)) return { ok: true };

  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
  if (!tenant) return { ok: true };

  const user = await db.collection('users').findOne({
    tenantId: tenant._id,
    email,
    active: { $ne: false },
  });
  if (!user) return { ok: true };

  const token = await issueAccountToken({
    tenantId: tenant._id,
    userId: user._id,
    email,
    purpose: 'reset',
    ttlMs: PASSWORD_RESET_TTL_MS,
  });

  const { sendPasswordResetEmail } = require('../mail/accountEmails');
  try {
    await sendPasswordResetEmail({ tenant: publicTenant(tenant), user: publicUser(user), token });
  } catch (err) {
    console.warn('[mail] password reset:', err?.message || err);
    return { ok: false, status: 503, error: 'Unable to send reset email. Try again later.' };
  }
  return { ok: true };
}

/**
 * @param {{ token: string, password: string, purpose?: string }} input
 */
async function resetPasswordWithToken(input) {
  const token = String(input.token || '').trim();
  const password = String(input.password || '');
  if (!token) return { ok: false, status: 400, error: 'Reset token is required' };
  if (password.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };

  const db = getDb();
  const doc = await db.collection('password_reset_tokens').findOne({ _id: token });
  if (!doc || doc.usedAt || doc.expiresAt < new Date()) {
    return { ok: false, status: 400, error: 'Invalid or expired reset link' };
  }
  if (input.purpose === 'invite' && doc.purpose !== 'invite') {
    return { ok: false, status: 400, error: 'Invalid or expired link' };
  }
  if (input.purpose === 'reset' && doc.purpose === 'invite') {
    return { ok: false, status: 400, error: 'Invalid or expired reset link' };
  }

  const passwordHash = await hashPassword(password);
  const userResult = await db.collection('users').findOneAndUpdate(
    { _id: doc.userId, tenantId: doc.tenantId },
    { $set: { passwordHash, invitePending: false, updatedAt: now() } },
    { returnDocument: 'after' },
  );
  if (!userResult) return { ok: false, status: 400, error: 'Invalid or expired reset link' };

  await db.collection('password_reset_tokens').updateOne(
    { _id: token },
    { $set: { usedAt: now() } },
  );

  const tenant = await getTenantById(doc.tenantId);
  const user = publicUser(userResult);
  const { sendPasswordChangedEmail } = require('../mail/accountEmails');
  sendPasswordChangedEmail({ tenant, user }).catch((err) => {
    console.warn('[mail] password changed:', err?.message || err);
  });

  return { ok: true };
}

/**
 * @param {string} tenantId
 * @param {string} userId
 * @param {{ currentPassword: string, newPassword: string }} input
 */
async function changePassword(tenantId, userId, input) {
  const currentPassword = String(input.currentPassword || '');
  const newPassword = String(input.newPassword || '');
  if (!currentPassword) return { ok: false, status: 400, error: 'currentPassword is required' };
  if (newPassword.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };

  const db = getDb();
  const user = await db.collection('users').findOne({ _id: userId, tenantId });
  if (!user) return { ok: false, status: 404, error: 'User not found' };

  const { verifyPassword } = require('../auth/password');
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, status: 401, error: 'Current password is incorrect' };

  const passwordHash = await hashPassword(newPassword);
  await db.collection('users').updateOne(
    { _id: userId, tenantId },
    { $set: { passwordHash, updatedAt: now() } },
  );

  const tenant = await getTenantById(tenantId);
  const { sendPasswordChangedEmail } = require('../mail/accountEmails');
  sendPasswordChangedEmail({ tenant, user: publicUser(user) }).catch((err) => {
    console.warn('[mail] password changed:', err?.message || err);
  });

  return { ok: true };
}

module.exports = {
  signup,
  login,
  getUserById,
  getTenantById,
  updateUserProfile,
  listTenantUsers,
  createTenantUser,
  inviteTenantUser,
  resendUserInvite,
  getInviteTokenMeta,
  listNotificationRecipients,
  requestPasswordReset,
  resetPasswordWithToken,
  changePassword,
  publicUser,
  publicTenant,
};
