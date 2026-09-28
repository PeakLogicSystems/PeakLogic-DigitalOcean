'use strict';

const crypto = require('crypto');
const persistence = require('../persistence');

const SITES_FILE = 'cloud_sites.json';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function randomCode(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function emptyStore() {
  return {
    sites: {},
    cameras: {},
    settings: {
      maxViewersPerSite: 4,
      inventoryStaleMs: 120000,
      entitlementRemoteView: true,
    },
  };
}

function loadStore() {
  const raw = persistence.readJson(SITES_FILE, null);
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    sites: raw.sites && typeof raw.sites === 'object' ? raw.sites : {},
    cameras: raw.cameras && typeof raw.cameras === 'object' ? raw.cameras : {},
    settings: { ...emptyStore().settings, ...(raw.settings || {}) },
  };
}

function saveStore(store) {
  persistence.writeJson(SITES_FILE, store);
}

function cameraKey(siteId, cameraId) {
  return `${String(siteId)}|${String(cameraId)}`;
}

class SiteStore {
  constructor() {
    this._store = loadStore();
  }

  settings() {
    return { ...this._store.settings };
  }

  updateSettings(patch = {}) {
    const clean = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    this._store.settings = { ...this._store.settings, ...clean };
    saveStore(this._store);
    return this.settings();
  }

  listSites() {
    return Object.values(this._store.sites)
      .map((s) => this._publicSite(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getSite(siteId) {
    const s = this._store.sites[String(siteId || '').trim()];
    return s ? this._publicSite(s) : null;
  }

  getSiteRecord(siteId) {
    return this._store.sites[String(siteId || '').trim()] || null;
  }

  /**
   * Create a site and return one-time pairing code (plaintext only once).
   */
  createSite({ siteId, name, tenantId, address, county, lat, lng, cloudProject, hmiScreenId } = {}) {
    const id = String(siteId || `site_${Date.now()}`).trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 64);
    if (!id) throw Object.assign(new Error('siteId required'), { status: 400 });
    if (this._store.sites[id]) {
      throw Object.assign(new Error('siteId already exists'), { status: 409 });
    }
    const pairingCode = randomCode(12);
    const agentToken = randomCode(24);
    const rec = {
      siteId: id,
      name: String(name || id).trim() || id,
      tenantId: String(tenantId || process.env.PEAKLOGIC_TENANT_ID || 'demo').trim() || 'demo',
      address: String(address || '').trim(),
      county: String(county || '').trim().toLowerCase(),
      lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
      lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
      cloudProject: String(cloudProject || 'duplex-lift-station').trim(),
      hmiScreenId: String(hmiScreenId || 'screen_1').trim(),
      pairingCodeHash: hashToken(pairingCode),
      agentTokenHash: hashToken(agentToken),
      agentOnline: false,
      lastHeartbeatAt: null,
      pairedAt: null,
      createdAt: new Date().toISOString(),
      viewerCount: 0,
    };
    this._store.sites[id] = rec;
    saveStore(this._store);
    return {
      site: this._publicSite(rec),
      pairingCode,
      // Returned once so cloud admin can show it; appliance exchanges pairing for agentToken via welcome.
      agentToken,
    };
  }

  deleteSite(siteId) {
    const id = String(siteId || '').trim();
    if (!this._store.sites[id]) return false;
    delete this._store.sites[id];
    for (const key of Object.keys(this._store.cameras)) {
      if (key.startsWith(`${id}|`)) delete this._store.cameras[key];
    }
    saveStore(this._store);
    return true;
  }

  /** Validate pairing code; returns site record or null. */
  authenticatePairing(siteId, pairingCode) {
    const rec = this.getSiteRecord(siteId);
    if (!rec || !pairingCode) return null;
    if (rec.pairingCodeHash !== hashToken(pairingCode)) return null;
    return rec;
  }

  /** Validate long-lived agent token. */
  authenticateAgentToken(siteId, agentToken) {
    const rec = this.getSiteRecord(siteId);
    if (!rec || !agentToken) return null;
    if (rec.agentTokenHash !== hashToken(agentToken)) return null;
    return rec;
  }

  markPaired(siteId) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    rec.pairedAt = rec.pairedAt || new Date().toISOString();
    // Invalidate one-time pairing code after first successful pair.
    rec.pairingCodeHash = hashToken(randomCode(12));
    saveStore(this._store);
    return this._publicSite(rec);
  }

  /**
   * Issue a new agent token (plaintext returned once) and mark site paired.
   * Invalidates the one-time pairing code.
   */
  rotateAgentToken(siteId) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    const agentToken = randomCode(24);
    rec.agentTokenHash = hashToken(agentToken);
    rec.pairedAt = rec.pairedAt || new Date().toISOString();
    rec.pairingCodeHash = hashToken(randomCode(12));
    saveStore(this._store);
    return { site: this._publicSite(rec), agentToken };
  }

  /** Fresh pairing; invalidates current agent token. */
  reissuePairing(siteId) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    const pairingCode = randomCode(12);
    const agentToken = randomCode(24);
    rec.pairingCodeHash = hashToken(pairingCode);
    rec.agentTokenHash = hashToken(agentToken);
    rec.agentOnline = false;
    rec.pairedAt = null;
    saveStore(this._store);
    return { site: this._publicSite(rec), pairingCode, agentToken };
  }

  updateSite(siteId, { name, address, county, lat, lng, cloudProject, hmiScreenId } = {}) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    if (name != null) {
      const next = String(name).trim();
      if (next) rec.name = next;
    }
    if (address != null) rec.address = String(address).trim();
    if (county != null) rec.county = String(county).trim().toLowerCase();
    if (lat != null) rec.lat = Number.isFinite(Number(lat)) ? Number(lat) : null;
    if (lng != null) rec.lng = Number.isFinite(Number(lng)) ? Number(lng) : null;
    if (cloudProject != null) rec.cloudProject = String(cloudProject).trim();
    if (hmiScreenId != null) rec.hmiScreenId = String(hmiScreenId).trim();
    saveStore(this._store);
    return this._publicSite(rec);
  }

  setAgentOnline(siteId, online) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    rec.agentOnline = !!online;
    if (online) rec.lastHeartbeatAt = new Date().toISOString();
    saveStore(this._store);
    return this._publicSite(rec);
  }

  heartbeat(siteId) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return null;
    rec.agentOnline = true;
    rec.lastHeartbeatAt = new Date().toISOString();
    saveStore(this._store);
    return this._publicSite(rec);
  }

  mergeInventory(siteId, cameras) {
    const id = String(siteId || '').trim();
    if (!this._store.sites[id]) {
      throw Object.assign(new Error('site not found'), { status: 404 });
    }
    const now = new Date().toISOString();
    const keep = new Set();
    let upserted = 0;
    for (const cam of cameras || []) {
      if (!cam?.cameraId) continue;
      const key = cameraKey(id, cam.cameraId);
      keep.add(key);
      this._store.cameras[key] = {
        ...cam,
        siteId: id,
        cameraId: cam.cameraId,
        updatedAt: now,
      };
      upserted += 1;
    }
    for (const key of Object.keys(this._store.cameras)) {
      if (key.startsWith(`${id}|`) && !keep.has(key)) {
        delete this._store.cameras[key];
      }
    }
    saveStore(this._store);
    return { upserted, total: keep.size };
  }

  listCameras(siteId = null) {
    const rows = Object.values(this._store.cameras);
    const filtered = siteId
      ? rows.filter((c) => c.siteId === String(siteId))
      : rows;
    return filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  getCamera(siteId, cameraId) {
    return this._store.cameras[cameraKey(siteId, cameraId)] || null;
  }

  setViewerCount(siteId, count) {
    const rec = this.getSiteRecord(siteId);
    if (!rec) return;
    rec.viewerCount = Math.max(0, Number(count) || 0);
    saveStore(this._store);
  }

  _publicSite(rec) {
    const staleMs = Number(this._store.settings.inventoryStaleMs) || 120000;
    const last = rec.lastHeartbeatAt ? new Date(rec.lastHeartbeatAt).getTime() : 0;
    const fresh = last && (Date.now() - last) < staleMs;
    return {
      siteId: rec.siteId,
      name: rec.name,
      tenantId: rec.tenantId || null,
      address: rec.address || '',
      county: rec.county || '',
      lat: rec.lat != null ? rec.lat : null,
      lng: rec.lng != null ? rec.lng : null,
      cloudProject: rec.cloudProject || '',
      hmiScreenId: rec.hmiScreenId || '',
      agentOnline: !!(rec.agentOnline && fresh),
      lastHeartbeatAt: rec.lastHeartbeatAt || null,
      pairedAt: rec.pairedAt || null,
      createdAt: rec.createdAt || null,
      viewerCount: Number(rec.viewerCount) || 0,
      maxViewers: Number(this._store.settings.maxViewersPerSite) || 4,
      cameraCount: this.listCameras(rec.siteId).length,
    };
  }
}

const siteStore = new SiteStore();

module.exports = {
  SiteStore,
  siteStore,
  hashToken,
  cameraKey,
  SITES_FILE,
};
