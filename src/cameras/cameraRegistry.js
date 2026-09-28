'use strict';

const persistence = require('../persistence');

function discoveryVendorFromHit(hit) {
  const existing = String(hit?.vendor || '').trim();
  if (existing) return existing;
  const blob = [hit?.manufacturer, hit?.model, hit?.name].join(' ').toLowerCase();
  if (blob.includes('reolink')) return 'reolink';
  const modelToken = String(hit?.model || hit?.manufacturer || '').trim();
  if (/^RL[CN]-\d/i.test(modelToken)) return 'reolink';
  return '';
}

const CAMERAS_FILE = 'cameras.json';

function camerasSystemEnabled(settings) {
  return settings?.camerasEnabled !== false;
}

function defaultSettings() {
  return {
    camerasEnabled: true,
    discoverTimeoutMs: 4000,
    defaultUsername: '',
    defaultPassword: '',
    autoAddDiscovered: false,
    autoProbeOnDiscover: true,
    preferSubstream: true,
    rtspPort: 554,
    rtspReachabilityCheckEnabled: true,
    rtspReachabilityTimeoutMs: 1500,
    rtspReachabilityCacheMs: 30000,
    onvifPort: 8000,
    mjpegIntervalMs: 200,
    go2rtcEnabled: true,
    go2rtcPort: 1984,
    streamBackend: 'go2rtc',
    snapshotArchiveEnabled: true,
    snapshotIntervalMs: 60000,
    snapshotRetentionDays: 30,
    gridfsMirrorAssets: true,
    cameraAiEnabled: true,
    cameraAiBackend: 'stub',
    cameraAiHttpUrl: '',
    cameraAiModelId: 'camera-vision',
    cameraAiTimeoutMs: 30000,
    cameraAiPostCaptureEnabled: true,
    cameraAiLiveEnabled: true,
    cameraAiLiveIntervalMs: 5000,
    cameraAiMotionEnabled: true,
    cameraAiMotionCooldownMs: 10000,
    cameraAiAlarmThreshold: 0.85,
    cameraAiAlarmTagId: '',
    cameraAiAssetPrefix: 'cam',
    cameraTagBridgeEnabled: true,
    cameraTagBridgeIntervalMs: 500,
  };
}

function emptyStore() {
  return { cameras: {}, settings: defaultSettings() };
}

function loadStore() {
  const raw = persistence.readJson(CAMERAS_FILE, null);
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    cameras: raw.cameras && typeof raw.cameras === 'object' ? raw.cameras : {},
    settings: { ...defaultSettings(), ...(raw.settings || {}) },
  };
}

function saveStore(store) {
  persistence.writeJson(CAMERAS_FILE, store);
}

function normalizeCameraId(id) {
  const s = String(id || '').trim();
  if (!s) throw Object.assign(new Error('cameraId required'), { status: 400 });
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) {
    throw Object.assign(new Error('cameraId must be 1-64 chars: letters, digits, . _ -'), { status: 400 });
  }
  return s;
}

function slugFromHost(host) {
  const base = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `cam_${Date.now()}`;
}

function uniqueCameraId(base, cameras) {
  let id = slugFromHost(base);
  if (!cameras[id]) return id;
  let n = 2;
  while (cameras[`${id}_${n}`]) n += 1;
  return `${id}_${n}`;
}

function parseHostPort(urlOrHost) {
  const raw = String(urlOrHost || '').trim();
  if (!raw) return { host: '', port: 80 };
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80),
    };
  } catch {
    const [host, port] = raw.split(':');
    return { host: host || raw, port: port ? Number(port) : 80 };
  }
}

function cameraSummary(rec, { redact = true } = {}) {
  const out = {
    cameraId: rec.cameraId,
    name: rec.name || rec.cameraId,
    host: rec.host || '',
    port: rec.port || 80,
    onvifUrl: rec.onvifUrl || '',
    viewerUrl: rec.viewerUrl || '',
    rtspUrl: rec.rtspUrl || '',
    manufacturer: rec.manufacturer || '',
    model: rec.model || '',
    firmware: rec.firmware || '',
    onvifProfile: rec.onvifProfile || '',
    vendor: rec.vendor || '',
    source: rec.source || 'manual',
    discoveredAt: rec.discoveredAt || null,
    lastSeenAt: rec.lastSeenAt || null,
    probedAt: rec.probedAt || null,
    probeStatus: rec.probeStatus || '',
    probeError: rec.probeError || '',
    notes: rec.notes || '',
    hasCredentials: !!(rec.username || rec.password),
    hasStream: !!(rec.snapshotUrl || rec.rtspUrl),
    overlayCount: Array.isArray(rec.overlays) ? rec.overlays.length : 0,
  };
  if (!redact) {
    out.username = rec.username || '';
    out.password = rec.password || '';
  }
  return out;
}

function normalizeCameraInput(body, existing = null) {
  const cameraId = normalizeCameraId(body.cameraId || existing?.cameraId);
  const hostInfo = parseHostPort(body.host || body.onvifUrl || existing?.host);
  const host = String(body.host || hostInfo.host || existing?.host || '').trim();
  if (!host) throw Object.assign(new Error('host required'), { status: 400 });

  const rec = {
    cameraId,
    name: String(body.name || existing?.name || cameraId).trim() || cameraId,
    host,
    port: Number(body.port) || hostInfo.port || existing?.port || 80,
    onvifUrl: String(body.onvifUrl ?? existing?.onvifUrl ?? '').trim(),
    viewerUrl: String(body.viewerUrl ?? existing?.viewerUrl ?? '').trim(),
    rtspUrl: String(body.rtspUrl ?? existing?.rtspUrl ?? '').trim(),
    manufacturer: String(body.manufacturer ?? existing?.manufacturer ?? '').trim(),
    model: String(body.model ?? existing?.model ?? '').trim(),
    firmware: String(body.firmware ?? existing?.firmware ?? '').trim(),
    onvifProfile: String(body.onvifProfile ?? existing?.onvifProfile ?? '').trim(),
    vendor: String(body.vendor ?? existing?.vendor ?? '').trim(),
    mediaUrl: String(body.mediaUrl ?? existing?.mediaUrl ?? '').trim(),
    eventsUrl: String(body.eventsUrl ?? existing?.eventsUrl ?? '').trim(),
    snapshotUrl: String(body.snapshotUrl ?? existing?.snapshotUrl ?? '').trim(),
    profileToken: String(body.profileToken ?? existing?.profileToken ?? '').trim(),
    serial: String(body.serial ?? existing?.serial ?? '').trim(),
    probeStatus: String(body.probeStatus ?? existing?.probeStatus ?? '').trim(),
    probeError: String(body.probeError ?? existing?.probeError ?? '').trim(),
    probedAt: body.probedAt ?? existing?.probedAt ?? null,
    username: String(body.username ?? existing?.username ?? '').trim(),
    password: String(body.password ?? existing?.password ?? '').trim(),
    notes: String(body.notes ?? existing?.notes ?? '').trim(),
    source: existing?.source || body.source || 'manual',
    discoveredAt: existing?.discoveredAt || body.discoveredAt || null,
    lastSeenAt: body.lastSeenAt || existing?.lastSeenAt || null,
    overlays: body.overlays != null
      ? require('./cameraOverlays').normalizeOverlays(body.overlays)
      : (existing?.overlays ? require('./cameraOverlays').normalizeOverlays(existing.overlays) : []),
  };
  if (!rec.onvifUrl && rec.host) {
    const scheme = rec.port === 443 ? 'https' : 'http';
    const portPart = (rec.port === 80 || rec.port === 443) ? '' : `:${rec.port}`;
    rec.onvifUrl = `${scheme}://${rec.host}${portPart}/onvif/device_service`;
  }
  return rec;
}

function discoveryDraft(hit, now) {
  const hostInfo = parseHostPort(hit.host || hit.onvifUrl || '');
  const host = String(hit.host || hostInfo.host || '').trim();
  const port = Number(hit.port) || hostInfo.port || 80;
  const draft = {
    name: String(hit.name || host || 'Camera').trim(),
    host,
    port,
    onvifUrl: String(hit.onvifUrl || '').trim(),
    viewerUrl: String(hit.viewerUrl || '').trim(),
    rtspUrl: String(hit.rtspUrl || '').trim(),
    manufacturer: String(hit.manufacturer || '').trim(),
    model: String(hit.model || '').trim(),
    firmware: String(hit.firmware || '').trim(),
    onvifProfile: String(hit.onvifProfile || '').trim(),
    vendor: discoveryVendorFromHit(hit),
    username: String(hit.username || '').trim(),
    password: String(hit.password || '').trim(),
    notes: String(hit.notes || '').trim(),
    source: 'discovered',
    discoveredAt: hit.discoveredAt || now,
    lastSeenAt: now,
  };
  if (!draft.onvifUrl && draft.host) {
    const scheme = draft.port === 443 ? 'https' : 'http';
    const portPart = (draft.port === 80 || draft.port === 443) ? '' : `:${draft.port}`;
    draft.onvifUrl = `${scheme}://${draft.host}${portPart}/onvif/device_service`;
  }
  return draft;
}

function matchKey(rec) {
  const host = String(rec.host || '').toLowerCase();
  const onvif = String(rec.onvifUrl || '').toLowerCase();
  return `${host}|${rec.port || 80}|${onvif}`;
}

class CameraRegistry {
  constructor() {
    this._store = loadStore();
  }

  settings() {
    return { ...defaultSettings(), ...this._store.settings };
  }

  updateSettings(patch) {
    const clean = {};
    for (const [k, v] of Object.entries(patch || {})) {
      if (v !== undefined) clean[k] = v;
    }
    this._store.settings = { ...defaultSettings(), ...this._store.settings, ...clean };
    saveStore(this._store);
    return this.settings();
  }

  listCameras() {
    return Object.values(this._store.cameras)
      .map((c) => cameraSummary(c))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getCamera(cameraId, { redact = true } = {}) {
    const id = normalizeCameraId(cameraId);
    const rec = this._store.cameras[id];
    if (!rec) return null;
    return cameraSummary(rec, { redact });
  }

  getCameraRecord(cameraId) {
    const id = normalizeCameraId(cameraId);
    return this._store.cameras[id] || null;
  }

  upsertCamera(body) {
    const existing = body.cameraId ? this._store.cameras[normalizeCameraId(body.cameraId)] : null;
    const rec = normalizeCameraInput(body, existing);
    if (!existing && !body.cameraId) {
      rec.cameraId = uniqueCameraId(rec.host, this._store.cameras);
    }
    this._store.cameras[rec.cameraId] = rec;
    saveStore(this._store);
    return cameraSummary(rec);
  }

  createCamera(body) {
    const hostInfo = parseHostPort(body.host || body.onvifUrl || '');
    const host = String(body.host || hostInfo.host || '').trim();
    const cameraId = body.cameraId
      ? normalizeCameraId(body.cameraId)
      : uniqueCameraId(host || `cam_${Date.now()}`, this._store.cameras);
    if (this._store.cameras[cameraId]) {
      throw Object.assign(new Error('cameraId already exists'), { status: 409 });
    }
    const rec = normalizeCameraInput({ ...body, cameraId });
    this._store.cameras[rec.cameraId] = rec;
    saveStore(this._store);
    return cameraSummary(rec);
  }

  updateCamera(cameraId, body) {
    const id = normalizeCameraId(cameraId);
    const existing = this._store.cameras[id];
    if (!existing) return null;
    const rec = normalizeCameraInput({ ...body, cameraId: id }, existing);
    this._store.cameras[id] = rec;
    saveStore(this._store);
    return cameraSummary(rec);
  }

  deleteCamera(cameraId) {
    const id = normalizeCameraId(cameraId);
    if (!this._store.cameras[id]) return false;
    delete this._store.cameras[id];
    saveStore(this._store);
    return true;
  }

  /**
   * Merge ONVIF discovery hits into inventory.
   * @param {Array<object>} discovered
   * @param {{ autoAdd?: boolean }} [opts]
   */
  mergeDiscovered(discovered, opts = {}) {
    const autoAdd = opts.autoAdd != null ? !!opts.autoAdd : !!this._store.settings.autoAddDiscovered;
    const now = new Date().toISOString();
    const byKey = new Map();
    for (const rec of Object.values(this._store.cameras)) {
      byKey.set(matchKey(rec), rec);
    }

    const added = [];
    const updated = [];
    const skipped = [];

    for (const hit of discovered || []) {
      const draft = discoveryDraft(hit, now);
      if (!draft.host) continue;
      const key = matchKey(draft);
      const existing = byKey.get(key);
      if (existing) {
        const merged = {
          ...existing,
          name: existing.name || draft.name,
          manufacturer: draft.manufacturer || existing.manufacturer,
          model: draft.model || existing.model,
          firmware: draft.firmware || existing.firmware,
          onvifProfile: draft.onvifProfile || existing.onvifProfile,
          onvifUrl: draft.onvifUrl || existing.onvifUrl,
          rtspUrl: draft.rtspUrl || existing.rtspUrl,
          viewerUrl: draft.viewerUrl || existing.viewerUrl,
          vendor: draft.vendor || existing.vendor,
          snapshotUrl: draft.snapshotUrl || existing.snapshotUrl,
          mediaUrl: draft.mediaUrl || existing.mediaUrl,
          profileToken: draft.profileToken || existing.profileToken,
          probeStatus: draft.probeStatus || existing.probeStatus,
          probeError: draft.probeError || existing.probeError,
          probedAt: draft.probedAt || existing.probedAt,
          lastSeenAt: now,
        };
        this._store.cameras[existing.cameraId] = merged;
        updated.push(cameraSummary(merged));
        continue;
      }
      if (!autoAdd) {
        skipped.push(hit);
        continue;
      }
      draft.cameraId = uniqueCameraId(draft.host, this._store.cameras);
      draft.discoveredAt = now;
      this._store.cameras[draft.cameraId] = draft;
      byKey.set(matchKey(draft), draft);
      added.push(cameraSummary(draft));
    }

    if (added.length || updated.length) saveStore(this._store);
    return { added, updated, skipped };
  }

  applyProbe(cameraId, probe) {
    const { applyProbeToRecord } = require('./cameraProbe');
    const id = normalizeCameraId(cameraId);
    const existing = this._store.cameras[id];
    if (!existing) return null;
    const rec = applyProbeToRecord(existing, probe);
    this._store.cameras[id] = rec;
    saveStore(this._store);
    return cameraSummary(rec);
  }

  listCameraRecords() {
    return Object.values(this._store.cameras);
  }

  exportForProject() {
    return {
      cameras: this.listCameraRecords().map((rec) => ({ ...rec })),
      settings: { ...this._store.settings },
    };
  }

  importFromProject(payload) {
    if (!payload || typeof payload !== 'object') return { imported: 0, skipped: true };
    const incoming = payload.cameras;
    if (!incoming || typeof incoming !== 'object') return { imported: 0, skipped: true };
    let imported = 0;
    for (const rec of Object.values(incoming)) {
      if (!rec?.cameraId) continue;
      const id = normalizeCameraId(rec.cameraId);
      this._store.cameras[id] = normalizeCameraInput({ ...rec, cameraId: id }, this._store.cameras[id]);
      imported += 1;
    }
    if (payload.settings && typeof payload.settings === 'object') {
      this._store.settings = { ...this._store.settings, ...payload.settings };
    }
    if (imported) saveStore(this._store);
    return { imported };
  }
}

const registry = new CameraRegistry();

module.exports = {
  CameraRegistry,
  registry,
  defaultSettings,
  camerasSystemEnabled,
  normalizeCameraId,
  cameraSummary,
  parseHostPort,
  slugFromHost,
};
