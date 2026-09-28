'use strict';

const { randomUUID } = require('crypto');
const persistence = require('../persistence');
const { hashPassword, verifyPassword, randomToken, hashToken } = require('../tenants/authCrypto');
const {
  FEATURE_KEYS,
  defaultFeaturesForRole,
  normalizeFeatures,
} = require('./featureCatalog');

const FILE = 'appliance_auth.json';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TENANT_ID = 'local';

function empty() {
  return {
    tenantId: TENANT_ID,
    tenantName: 'Local Site',
    users: {},
    sessions: {},
    seededAt: null,
  };
}

function load() {
  const raw = persistence.readJson(FILE, null);
  if (!raw || typeof raw !== 'object') return empty();
  return {
    tenantId: raw.tenantId || TENANT_ID,
    tenantName: raw.tenantName || 'Local Site',
    users: raw.users && typeof raw.users === 'object' ? raw.users : {},
    sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
    seededAt: raw.seededAt || null,
  };
}

function save(store) {
  persistence.writeJson(FILE, store);
}

function publicTenant(store) {
  return {
    tenantId: store.tenantId,
    id: store.tenantId,
    tenantSlug: 'local',
    name: store.tenantName,
  };
}

function publicUser(u) {
  if (!u) return null;
  return {
    userId: u.userId,
    id: u.userId,
    email: u.email,
    name: u.name || u.email,
    role: u.role || 'operator',
    tenantId: TENANT_ID,
    tenantSlug: 'local',
    active: u.active !== false,
    features: normalizeFeatures(u.features, u.role),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

class ApplianceAuthStore {
  constructor() {
    this._store = load();
    this.ensureSeed();
  }

  ensureSeed() {
    if (this._store.seededAt && Object.keys(this._store.users).length) return;
    const adminEmail = (process.env.PEAKLOGIC_SEED_ADMIN_EMAIL || 'admin@local').toLowerCase();
    const adminPass = process.env.PEAKLOGIC_SEED_ADMIN_PASSWORD || 'ChangeMeAdmin!';
    const opEmail = (process.env.PEAKLOGIC_SEED_OPERATOR_EMAIL || 'operator@local').toLowerCase();
    const opPass = process.env.PEAKLOGIC_SEED_OPERATOR_PASSWORD || 'operator';

    if (!Object.values(this._store.users).some((u) => u.role === 'admin')) {
      const id = `user_${randomToken(6)}`;
      const ts = new Date().toISOString();
      this._store.users[id] = {
        userId: id,
        email: adminEmail,
        name: 'Administrator',
        role: 'admin',
        passwordHash: hashPassword(adminPass),
        features: defaultFeaturesForRole('admin'),
        active: true,
        createdAt: ts,
        updatedAt: ts,
      };
    }
    if (!Object.values(this._store.users).some((u) => u.email === opEmail)) {
      const id = `user_${randomToken(6)}`;
      const ts = new Date().toISOString();
      this._store.users[id] = {
        userId: id,
        email: opEmail,
        name: 'Operator',
        role: 'operator',
        passwordHash: hashPassword(opPass),
        features: defaultFeaturesForRole('operator'),
        active: true,
        createdAt: ts,
        updatedAt: ts,
      };
    }
    this._store.seededAt = new Date().toISOString();
    save(this._store);
    console.log(`[auth] seeded appliance users — admin ${adminEmail}, operator ${opEmail}`);
  }

  findUserByEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return Object.values(this._store.users).find((u) => u.email === e) || null;
  }

  getUser(userId) {
    return this._store.users[userId] || null;
  }

  listUsers() {
    return Object.values(this._store.users)
      .map((u) => publicUser(u))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  createUser({ email, password, name, role, features, active } = {}) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !password) {
      throw Object.assign(new Error('email and password required'), { status: 400 });
    }
    if (this.findUserByEmail(e)) {
      throw Object.assign(new Error('user exists'), { status: 409 });
    }
    const r = ['admin', 'operator', 'technician', 'viewer', 'homeowner'].includes(role) ? role : 'operator';
    const id = `user_${randomToken(6)}`;
    const ts = new Date().toISOString();
    const rec = {
      userId: id,
      email: e,
      name: String(name || e).trim(),
      role: r,
      passwordHash: hashPassword(password),
      features: normalizeFeatures(features, r),
      active: active !== false,
      createdAt: ts,
      updatedAt: ts,
    };
    this._store.users[id] = rec;
    save(this._store);
    return publicUser(rec);
  }

  updateUser(userId, patch = {}) {
    const cur = this.getUser(userId);
    if (!cur) throw Object.assign(new Error('user not found'), { status: 404 });
    const email = patch.email != null ? String(patch.email).trim().toLowerCase() : cur.email;
    if (!email) throw Object.assign(new Error('email required'), { status: 400 });
    const dup = Object.values(this._store.users).find((u) => u.email === email && u.userId !== userId);
    if (dup) throw Object.assign(new Error('email already in use'), { status: 409 });

    const next = { ...cur, email, updatedAt: new Date().toISOString() };
    if (patch.name != null) next.name = String(patch.name).trim() || email;
    if (patch.role != null && ['admin', 'operator', 'technician', 'viewer', 'homeowner'].includes(patch.role)) {
      next.role = patch.role;
    }
    if (patch.active != null) next.active = !!patch.active;
    if (patch.password) next.passwordHash = hashPassword(patch.password);
    if (patch.features != null) {
      next.features = normalizeFeatures(patch.features, next.role);
    } else if (patch.role != null) {
      next.features = normalizeFeatures(cur.features, next.role);
    }
    this._store.users[userId] = next;
    save(this._store);
    return publicUser(next);
  }

  updateFeaturesMatrix(matrix) {
    if (!matrix || typeof matrix !== 'object') {
      throw Object.assign(new Error('matrix required'), { status: 400 });
    }
    const updated = [];
    for (const [userId, features] of Object.entries(matrix)) {
      const cur = this.getUser(userId);
      if (!cur) continue;
      if (cur.role === 'admin') continue;
      cur.features = normalizeFeatures(features, cur.role);
      cur.updatedAt = new Date().toISOString();
      updated.push(publicUser(cur));
    }
    if (updated.length) save(this._store);
    return updated;
  }

  deleteUser(userId) {
    const admins = Object.values(this._store.users).filter((u) => u.role === 'admin' && u.active !== false);
    const cur = this.getUser(userId);
    if (!cur) throw Object.assign(new Error('user not found'), { status: 404 });
    if (cur.role === 'admin' && admins.length <= 1) {
      throw Object.assign(new Error('Cannot delete the last admin'), { status: 403 });
    }
    delete this._store.users[userId];
    for (const [sid, sess] of Object.entries(this._store.sessions)) {
      if (sess.userId === userId) delete this._store.sessions[sid];
    }
    save(this._store);
    return true;
  }

  login({ email, password } = {}) {
    const user = this.findUserByEmail(email);
    if (!user || user.active === false || !verifyPassword(password, user.passwordHash)) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }
    this.purgeExpiredSessions();
    const token = randomToken(24);
    const sid = hashToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    this._store.sessions[sid] = {
      sessionId: sid,
      userId: user.userId,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    save(this._store);
    const tenant = publicTenant(this._store);
    return {
      token,
      expiresAt,
      user: publicUser(user),
      tenant,
    };
  }

  sessionFromToken(token) {
    if (!token) return null;
    this.purgeExpiredSessions();
    const sid = hashToken(token);
    const sess = this._store.sessions[sid];
    if (!sess || sess.expiresAt < Date.now()) return null;
    const user = this._store.users[sess.userId];
    if (!user || user.active === false) return null;
    const tenant = publicTenant(this._store);
    return {
      session: sess,
      user: publicUser(user),
      tenant,
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

  featureCatalog() {
    return FEATURE_KEYS.slice();
  }
}

const applianceAuthStore = new ApplianceAuthStore();

module.exports = {
  applianceAuthStore,
  ApplianceAuthStore,
  TENANT_ID,
};
