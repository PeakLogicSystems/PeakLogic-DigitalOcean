'use strict';

const persistence = require('../persistence');
const { normalizeCloudRemote } = require('../settings/cloudRemoteSettings');

function cloudRemoteFromSettings() {
  const settings = persistence.readJson('settings.json', {});
  return normalizeCloudRemote(settings.cloudRemote, settings.cloudRemote);
}

function cloudApiBase(cfg) {
  const url = String(cfg?.cloudApiUrl || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  return url;
}

function applianceHeaders(cfg) {
  const headers = { Accept: 'application/json' };
  if (cfg?.tenantId) headers['X-Peaklogic-Tenant-Id'] = String(cfg.tenantId);
  if (cfg?.applianceId) headers['X-Peaklogic-Appliance-Id'] = String(cfg.applianceId);
  return headers;
}

async function cloudFetch(path, opts = {}) {
  const cfg = opts.cloudRemote || cloudRemoteFromSettings();
  const base = cloudApiBase(cfg);
  if (!base) {
    throw Object.assign(new Error('Cloud API URL not configured (pair appliance or set cloudRemote.cloudApiUrl)'), { status: 400 });
  }
  if (!cfg.tenantId || !cfg.applianceId) {
    throw Object.assign(new Error('Appliance not paired to a cloud tenant'), { status: 400 });
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...applianceHeaders(cfg),
      ...(opts.headers || {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `Cloud request failed (${res.status})`), { status: res.status });
  }
  return data;
}

async function listCloudCatalog(cloudRemote) {
  const data = await cloudFetch('/api/project-hub/catalog', { cloudRemote });
  return Array.isArray(data.projects) ? data.projects : [];
}

async function fetchCloudEst(id, cloudRemote) {
  const data = await cloudFetch(`/api/project-hub/catalog/${encodeURIComponent(id)}/est`, { cloudRemote });
  if (!data?.doc) throw Object.assign(new Error('Cloud project payload missing'), { status: 502 });
  return data.doc;
}

async function publishToCloud(doc, meta = {}, cloudRemote) {
  return cloudFetch('/api/project-hub/publish', {
    method: 'POST',
    cloudRemote,
    body: {
      name: meta.name || doc?.project?.name,
      description: meta.description || '',
      doc,
    },
    headers: cloudRemote?.pairingKey ? { 'X-Peaklogic-Pairing-Key': String(cloudRemote.pairingKey) } : {},
  });
}

module.exports = {
  cloudRemoteFromSettings,
  listCloudCatalog,
  fetchCloudEst,
  publishToCloud,
};
