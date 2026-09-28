'use strict';

const API = (typeof window !== 'undefined' && window.PEAKLOGIC_API_BASE) || '/api';

function isCloudContext() {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.PEAKLOGIC_DEPLOYMENT === 'cloud') return true;
  const host = window.location.hostname || '';
  const port = window.location.port || '';
  return port === '3100' || /peaklogic\.io$/i.test(host);
}

function fetchErrorHint(origin) {
  if (isCloudContext()) {
    return `Cannot reach the PeakLogic Cloud server at ${origin}. The site may be down or HTTPS/nginx needs attention on the SaaS host (port 3100).`;
  }
  return `Cannot reach the PeakLogic server at ${origin}. Start MVP Suite with npm start (default http://127.0.0.1:3090/).`;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const hint = e.message === 'Failed to fetch'
      ? fetchErrorHint(location.origin)
      : e.message;
    throw new Error(hint);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error
      || (Array.isArray(data.errors) && data.errors.length ? data.errors.join('; ') : null)
      || res.statusText;
    if (res.status === 413 && !data.error && !(Array.isArray(data.errors) && data.errors.length)) {
      msg = `Request body too large (HTTP 413, limit may be too low). Restart PeakLogic (npm stop && npm start), then try again. Large projects need the current server — tags alone can be ~500 KB.`;
    }
    const err = new Error(msg);
    if (data.errors) err.errors = data.errors;
    if (data.unknownTags) err.unknownTags = data.unknownTags;
    if (data.tagIds) err.tagIds = data.tagIds;
    if (data.activeProgram) err.activeProgram = data.activeProgram;
    throw err;
  }
  return data;
}

window.api = {
  getDashboard: (graphTags, opts = {}) => {
    const params = [];
    if (graphTags?.length) params.push(`graphTags=${graphTags.join(',')}`);
    if (opts.lite) params.push('lite=1');
    let q = '/dashboard';
    if (params.length) q += `?${params.join('&')}`;
    return request('GET', q);
  },
  getLive: (graphTags) => {
    let q = '/live';
    if (graphTags?.length) q += `?graphTags=${graphTags.join(',')}`;
    return request('GET', q);
  },
  openEst: (doc) => request('POST', '/project/est', doc),
  saveEstBlob: async (name) => {
    let res;
    try {
      res = await fetch(`${API}/project/est?name=${encodeURIComponent(name || 'project')}`);
    } catch (e) {
      const hint = e.message === 'Failed to fetch'
        ? fetchErrorHint(location.origin)
        : e.message;
      throw new Error(hint);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || 'Export project failed');
    }
    return res.blob();
  },
  exportSavedProjectBlob: async (id) => {
    let res;
    try {
      res = await fetch(`${API}/projects/export?id=${encodeURIComponent(id)}`);
    } catch (e) {
      const hint = e.message === 'Failed to fetch'
        ? fetchErrorHint(location.origin)
        : e.message;
      throw new Error(hint);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || 'Export project failed');
    }
    return res.blob();
  },
  saveWorkspace: (project) => request('POST', '/workspace/save', { project }),
  listProjects: () => request('GET', '/projects'),
  listImportableProjects: () => request('GET', '/projects/importable'),
  importProjectFromLibrary: (file) => request('POST', '/projects/import/library', { file }),
  importProjectNativePick: () => request('POST', '/projects/import/native-pick', {}),
  importProjectFromPath: (path) => request('POST', '/projects/import/path', { path }),
  async importProjectFile(file) {
    if (!file) throw new Error('No file selected');
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return request('POST', '/projects/import/file', {
      filename: file.name || 'project.est.zip',
      contentBase64: btoa(binary),
    });
  },
  async deployProjectHubFile(fileOrBlob) {
    if (!fileOrBlob) throw new Error('No project file selected');
    if (typeof window.api?.importProjectFile === 'function') {
      return window.api.importProjectFile(fileOrBlob);
    }
    const name = String(fileOrBlob.name || 'project');
    if (/\.est\.zip$/i.test(name)) {
      throw new Error('This server cannot import .est.zip yet — deploy the latest PeakLogic build, or use Project → Import after upgrading.');
    }
    const text = await fileOrBlob.text();
    const doc = JSON.parse(text);
    return request('POST', '/project/est', doc);
  },
  async exportEstDoc(name) {
    const res = await fetch(`${API}/project/est?name=${encodeURIComponent(name || 'project')}`, {
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Export failed');
    return data;
  },
  openProjectsFolder: () => request('POST', '/projects/open-folder', {}),
  saveProject: (name) => request('POST', '/projects/save', { name }),
  newProject: (name) => request('POST', '/projects/new', { name }),
  openProject: (id) => request('POST', '/projects/open', { id }),
  deleteProject: (id) => request('DELETE', `/projects?id=${encodeURIComponent(id)}`),
  putTags: (tags) => request('PUT', '/tags', { tags }),
  putDrivers: (drivers) => request('PUT', '/drivers', { drivers }),
  saveNextcenturySetup: (body) => request('PUT', '/drivers/nextcentury/setup', body),
  connectDriver: (driverId) => request('POST', '/drivers/connect', { driverId }),
  disconnectDriver: (driverId) => request('POST', '/drivers/disconnect', { driverId }),
  testDriver: (cfg) => request('POST', '/drivers/test', cfg),
  getNextcenturyExample: () => request('GET', '/drivers/nextcentury/example'),
  nextcenturyDeployEstimate: (body) => request('POST', '/drivers/nextcentury/deploy-estimate', body),
  openNextcenturyPortal: (body) => request('POST', '/drivers/nextcentury/portal-session', body),
  loadNextcenturyExampleTags: (body) => request('POST', '/drivers/nextcentury/load-example-tags', body),
  listDevicePresets: () => request('GET', '/devices/presets'),
  applyDevicePreset: (body) => request('POST', '/devices/apply', body),
  listPrograms: () => request('GET', '/programs'),
  openProgramFolder: () => request('POST', '/programs/open-folder', {}),
  loadProgram: (path, opts = {}) => request('POST', '/programs/load', {
    path,
    loadFixtures: opts.loadFixtures === true,
  }),
  reloadProgram: (path) => request('POST', '/programs/reload', path ? { path } : {}),
  clearActiveProgram: () => request('POST', '/programs/clear', {}),
  loadProgramFixtures: (path) => request('POST', '/programs/load-fixtures', { path }),
  saveProgram: (path, source) => request('POST', '/programs/save', { path, source }),
  importProgram: (path, source) => request('POST', '/programs/import', { path, source }),
  getProgramFile: (path) => request('GET', `/program/file?path=${encodeURIComponent(path)}`),
  putProgram: (source) => request('PUT', '/program', { source }),
  validateProgram: (source) => request('POST', '/program/validate', { source }),
  programTrace: (source) => request('POST', '/program/trace', { source }),
  deployEstimate: (source, driverId) => request('POST', '/program/deploy-estimate', {
    source,
    ...(driverId ? { driverId } : {}),
  }),
  ackAlarm: (tagId) => request('POST', '/alarms/ack', { tagId }),
  ackAllAlarms: () => request('POST', '/alarms/ack', { all: true }),
  listAlarms: () => request('GET', '/alarms'),
  runtimeStart: () => request('POST', '/runtime/start'),
  runtimePause: () => request('POST', '/runtime/pause'),
  runtimeResume: () => request('POST', '/runtime/resume'),
  runtimeStop: () => request('POST', '/runtime/stop'),
  putSettings: (s) => request('PUT', '/settings', s),
  setForce: (body) => request('POST', '/debug/force', body),
  setTagValue: (body) => request('POST', '/tags/write', body),
  clearForce: (tagId) => request('DELETE', `/debug/force?tagId=${encodeURIComponent(tagId)}`),
  clearGraph: () => request('POST', '/graph/clear', {}),
  modbusMove: (body) => request('POST', '/modbus/move', body),
  modbusProbe: (body) => request('POST', '/modbus/probe', body),
  getSerialPorts: () => request('GET', '/system/serial-ports'),
  getTags: () => request('GET', '/tags'),
  ensureMotorTags: () => request('POST', '/tags/ensure-motor', {}),
  ensureTpoTags: () => request('POST', '/tags/ensure-tpo', {}),
  ensureProgramTags: (source) => request('POST', '/tags/ensure-program', source != null ? { source } : {}),
  mongoLoggerStatus: () => request('GET', '/logger/mongo/status'),
  getMongoHistory: ({ from, to, tags, project, limit }) => {
    const q = new URLSearchParams({ from, to });
    if (tags?.length) q.set('tags', tags.join(','));
    if (project) q.set('project', project);
    if (limit != null) q.set('limit', String(limit));
    return request('GET', `/logger/mongo/history?${q}`);
  },
  purgeMongoHistory: (body) => request('POST', '/logger/mongo/purge', body),
  seedMongoHistory: (body) => request('POST', '/logger/mongo/seed', body),
  pdmStatus: () => request('GET', '/pdm/status'),
  pdmAssets: () => request('GET', '/pdm/assets'),
  getPdmView: ({ asset, from, to }) => {
    const q = new URLSearchParams({ asset });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return request('GET', `/pdm/view?${q}`);
  },
  putPdmSettings: (pdm) => request('PUT', '/pdm/settings', { pdm }),
  buildPdmFeatures: () => request('POST', '/pdm/build', {}),
  simulateMotorPdm: (body) => request('POST', '/pdm/sim/motor', body || {}),
  listHmiAssets: async () => {
    const data = await request('GET', '/hmi/assets');
    if (Array.isArray(data?.assets)) return data.assets;
    if (Array.isArray(data)) return data;
    return [];
  },
  importHmiGraphic: (filename, contentBase64) => request('POST', '/hmi/assets/import', { filename, contentBase64 }),
  parcDevices: () => request('GET', '/parc/devices'),
  parcDevice: (id) => request('GET', `/parc/devices/${encodeURIComponent(id)}`),
  parcReport: (body) => request('POST', '/parc/report', body),
  parcAttach: (id, body) => request('POST', `/parc/devices/${encodeURIComponent(id)}/attach`, body || {}),
  parcDetach: (id) => request('POST', `/parc/devices/${encodeURIComponent(id)}/detach`, {}),
  parcCmd: (id, op, body) => request('POST', `/parc/devices/${encodeURIComponent(id)}/cmd`, { op, body }),
  parcScanExpansions: (deviceId) => request('POST', `/parc/devices/${encodeURIComponent(deviceId)}/scan-expansions`, {}),
  parcSyncTags: (deviceId, driverId) => request('POST', `/parc/devices/${encodeURIComponent(deviceId)}/sync-tags`, { driverId }),
  syncParcTags: (driverId) => request('POST', '/drivers/sync-parc-tags', { driverId }),
  bulkAddParcOpta: (body) => request('POST', '/drivers/parc-opta/bulk', body),
  replaceParcOptaHardware: (body) => request('POST', '/drivers/parc-opta/replace-hardware', body),
  renameParcOptaPosition: (body) => request('POST', '/drivers/parc-opta/rename-position', body),
  hardwareHistory: (params) => {
    const q = new URLSearchParams();
    if (params?.positionId) q.set('positionId', params.positionId);
    if (params?.serial) q.set('serial', params.serial);
    if (params?.recent || params?.all) q.set('recent', '1');
    if (params?.limit != null) q.set('limit', String(params.limit));
    return request('GET', `/hardware-history?${q}`);
  },
  hardwareHistoryStatus: () => request('GET', '/hardware-history/status'),
  sysLogStatus: () => request('GET', '/sys-log/status'),
  sysLogQuery: (params) => {
    const q = new URLSearchParams();
    if (params?.level) q.set('level', params.level);
    if (params?.category) q.set('category', params.category);
    if (params?.since) q.set('since', params.since);
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.userId) q.set('userId', params.userId);
    return request('GET', `/sys-log?${q}`);
  },
  sysLogMaintenance: (body) => request('POST', '/sys-log/maintenance', body),
  getIoMap: () => request('GET', '/io-map'),
  patchIoMapTag: (tagId, body) => request('PATCH', `/io-map/tags/${encodeURIComponent(tagId)}`, body),
  putIoMapBindings: (bindings) => request('PUT', '/io-map/bindings', { bindings }),
  bindIoMapRoomTemplate: (body) => request('POST', '/io-map/bindings/room-template', body),
  parcDeployProgram: (id, body) => request('POST', `/parc/devices/${encodeURIComponent(id)}/program`, body || {}),
  parcSettings: () => request('GET', '/parc/settings'),
  putParcSettings: (settings) => request('PUT', '/parc/settings', settings),
  getReportConfig: () => request('GET', '/reports/config'),
  putReportConfig: (reportConfig) => request('PUT', '/reports/config', { reportConfig }),
  listUsers: () => request('GET', '/users'),
  getUser: (id) => request('GET', `/users/${encodeURIComponent(id)}`),
  createUser: (body) => request('POST', '/users', body),
  updateUser: (id, body) => request('PUT', `/users/${encodeURIComponent(id)}`, body),
  deleteUser: (id) => request('DELETE', `/users/${encodeURIComponent(id)}`),
  downloadReportPdf: async (body) => {
    let res;
    try {
      res = await fetch(`${API}/reports/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(e.message === 'Failed to fetch'
        ? fetchErrorHint(location.origin)
        : e.message);
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || 'PDF export failed');
    }
    return res.blob();
  },
  getCloudSimsStatus: () => request('GET', '/cloud/sims/status'),
  getCloudSims: () => request('GET', '/cloud/sims'),
  createCloudSim: (body) => request('POST', '/cloud/sims', body),
  getCloudSim: (id) => request('GET', `/cloud/sims/${encodeURIComponent(id)}`),
  updateCloudSim: (id, body) => request('PUT', `/cloud/sims/${encodeURIComponent(id)}`, body),
  startCloudSim: (id) => request('POST', `/cloud/sims/${encodeURIComponent(id)}/start`, {}),
  stopCloudSim: (id) => request('POST', `/cloud/sims/${encodeURIComponent(id)}/stop`, {}),
  deleteCloudSim: (id) => request('DELETE', `/cloud/sims/${encodeURIComponent(id)}`),
  getCellularSimsStatus: () => request('GET', '/cellular/sims/status'),
  getCellularVendorCatalog: () => request('GET', '/cellular/vendors/catalog'),
  getCellularVendors: () => request('GET', '/cellular/vendors'),
  addCellularVendor: (body) => request('POST', '/cellular/vendors', body),
  updateCellularVendor: (id, body) => request('PUT', `/cellular/vendors/${encodeURIComponent(id)}`, body),
  deleteCellularVendor: (id) => request('DELETE', `/cellular/vendors/${encodeURIComponent(id)}`),
  testCellularVendor: (id) => request('POST', `/cellular/vendors/${encodeURIComponent(id)}/test`, {}),
  syncCellularSims: () => request('POST', '/cellular/sync', {}),
  getCellularSims: (sync) => request('GET', sync ? '/cellular/sims?sync=1' : '/cellular/sims'),
  getCellularSim: (id) => request('GET', `/cellular/sims/${encodeURIComponent(id)}`),
  linkCellularSim: (id, body) => request('PUT', `/cellular/sims/${encodeURIComponent(id)}/link`, body),
  activateCellularSim: (id) => request('POST', `/cellular/sims/${encodeURIComponent(id)}/activate`, {}),
  deactivateCellularSim: (id) => request('POST', `/cellular/sims/${encodeURIComponent(id)}/deactivate`, {}),
  getCellularSimUsage: (id) => request('GET', `/cellular/sims/${encodeURIComponent(id)}/usage`),
  syncCellularBilling: (body) => request('POST', '/cellular/billing/sync', body || {}),
  getCellularBillingReport: (query) => {
    const qs = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value != null && value !== '') qs.set(key, String(value));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request('GET', `/cellular/billing/report${suffix}`);
  },
  exportCellularBillingCsv: (query) => {
    const qs = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value != null && value !== '') qs.set(key, String(value));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return fetch(`${API}/cellular/billing/export${suffix}`, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText || 'Export failed');
        }
        return res.text();
      });
  },
  getCellularGatewayReports: () => request('GET', '/cellular/gateway/reports'),
  autoLinkCellularGateway: (body) => request('POST', '/cellular/gateway/auto-link', body || {}),
  getMessagingStatus: () => request('GET', '/messaging/status'),
  saveMessagingConfig: (body) => request('PUT', '/messaging/config', body),
  testMessagingMail: (body) => request('POST', '/messaging/test/mail', body),
  testMessagingSms: (body) => request('POST', '/messaging/test/sms', body),
  listProjectHubLocal: () => request('GET', '/project-hub/catalog'),
  async listProjectHubCloud() {
    if (typeof window !== 'undefined' && window.PEAKLOGIC_PLATFORM_API) {
      const platform = window.PEAKLOGIC_PLATFORM_API;
      const res = await fetch(`${platform}/project-hub/catalog`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Cloud catalog failed');
      return data;
    }
    return request('GET', '/project-hub/cloud/catalog');
  },
  publishProjectHubLocal: (body) => request('POST', '/project-hub/publish', body || {}),
  publishProjectHubCloud: (body) => request('POST', '/project-hub/cloud/publish', body || {}),
  deployProjectHub: (body) => request('POST', '/project-hub/deploy', body),
  async fetchCloudProjectDoc(id) {
    if (typeof window !== 'undefined' && window.PEAKLOGIC_PLATFORM_API) {
      const platform = window.PEAKLOGIC_PLATFORM_API;
      const res = await fetch(`${platform}/project-hub/catalog/${encodeURIComponent(id)}/est`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Cloud fetch failed');
      return data.doc;
    }
    const data = await request('GET', `/project-hub/cloud/catalog/${encodeURIComponent(id)}/est`);
    return data.doc;
  },
  async downloadProjectHubFile(id) {
    const res = await fetch(`${API}/project-hub/catalog/${encodeURIComponent(id)}/file`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || 'Download failed');
    }
    return res.blob();
  },
  async publishProjectHubPlatform(body) {
    const platform = (typeof window !== 'undefined' && window.PEAKLOGIC_PLATFORM_API) || '/api';
    const res = await fetch(`${platform}/project-hub/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Cloud publish failed');
    return data;
  },

  async listLocations() {
    const data = await request('GET', '/sites');
    const locations = (data.sites || []).map((s) => ({
      id: s.siteId || s.id,
      name: s.name || s.siteId || s.id,
      slug: s.slug || s.siteId || s.id,
    }));
    return { locations };
  },
  async listProjectHubCatalog(locationId) {
    const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    const data = await request('GET', `/project-hub/catalog${qs}`);
    let projects = data.projects || [];
    if (locationId) {
      projects = projects.filter((p) => !p.locationId || p.locationId === locationId);
    }
    return { projects };
  },
  fetchProjectHubEst: (id) => request('GET', `/project-hub/catalog/${encodeURIComponent(id)}/est`),
  publishProjectHub: (body) => request('POST', '/project-hub/publish', body || {}),

  // Cloud SaaS — tenant auth + Cloud Studio (cloudStudioUi.js)
  authMe: () => request('GET', '/auth/me'),
  logout: () => request('POST', '/auth/logout', {}),
  listSites: () => request('GET', '/sites'),
  createSite: (body) => request('POST', '/sites', body),
  updateSite: (siteId, body) => request('PATCH', `/sites/${encodeURIComponent(siteId)}`, body),
  deleteSite: (siteId) => request('DELETE', `/sites/${encodeURIComponent(siteId)}`),
  siteCameras: (siteId) => request('GET', `/sites/${encodeURIComponent(siteId)}/cameras`),
  listSiteDevices: () => request('GET', '/sites/devices'),
  listCheckedInDevices: () => request('GET', '/sites/devices/checked-in'),
  claimSiteDevice: (body) => request('POST', '/sites/devices/claim', body),
  tenantCommissionKey: () => request('GET', '/tenant/commission-key'),
  mqttConsole: () => request('GET', '/mqtt-console'),
  mqttConsoleTraffic: (qs) => request('GET', `/mqtt-console/traffic${qs ? `?${qs}` : ''}`),
  mqttConsoleFenceDevice: (deviceId, body) => request('POST', `/mqtt-console/devices/${encodeURIComponent(deviceId)}/fence`, body),
  mqttConsoleSetSiteKey: (tenantId, body) => request('PATCH', `/mqtt-console/tenants/${encodeURIComponent(tenantId)}/site-key`, body),
  createSiteDevice: (body) => request('POST', '/sites/devices', body),
  unassignSiteDevice: (deviceId) => request('DELETE', `/sites/devices/${encodeURIComponent(deviceId)}`),
  listFleetAssets: () => request('GET', '/fleet'),
  createFleetAsset: (body) => request('POST', '/fleet', body),
  deleteFleetAsset: (assetId) => request('DELETE', `/fleet/${encodeURIComponent(assetId)}`),
  cloudAccessCatalog: () => request('GET', '/tenant/access-catalog'),
  notificationScopeCatalog: (tenantId) => request(
    'GET',
    tenantId
      ? `/tenant/notification-scope-catalog?tenantId=${encodeURIComponent(tenantId)}`
      : '/users/notification-scope-catalog',
  ),
  listTenantUsers: () => request('GET', '/tenant/users'),
  createTenantUser: (body) => request('POST', '/tenant/users', body),
  updateTenantUser: (userId, body) => request('PUT', `/tenant/users/${encodeURIComponent(userId)}`, body),
  resendTenantInvite: (userId) => request('POST', `/tenant/users/${encodeURIComponent(userId)}/resend-invite`),
  deleteTenantUser: (userId) => request('DELETE', `/tenant/users/${encodeURIComponent(userId)}`),
  listAdminTenants: () => request('GET', '/admin/tenants'),
  listAdminPartners: () => request('GET', '/admin/partners'),
  listAdminCustomers: () => request('GET', '/admin/customers'),
  createAdminTenant: (body) => request('POST', '/admin/tenants', body),
  updateAdminTenant: (tenantId, body) => request('PATCH', `/admin/tenants/${encodeURIComponent(tenantId)}`, body),
  deleteAdminTenant: (tenantId) => request('DELETE', `/admin/tenants/${encodeURIComponent(tenantId)}`),
  listAdminUsers: (tenantId) => request(
    'GET',
    tenantId ? `/admin/users?tenantId=${encodeURIComponent(tenantId)}` : '/admin/users',
  ),
  createAdminUser: (body) => request('POST', '/admin/users', body),
  updateAdminUser: (userId, body) => request('PUT', `/admin/users/${encodeURIComponent(userId)}`, body),
  resendAdminInvite: (userId) => request('POST', `/admin/users/${encodeURIComponent(userId)}/resend-invite`),
  deleteAdminUser: (userId) => request('DELETE', `/admin/users/${encodeURIComponent(userId)}`),
  patchTenantCmms: (tenantId, body) => request('PATCH', `/admin/tenants/${encodeURIComponent(tenantId)}/cmms`, body),
  patchTenantPartner: (tenantId, body) => request('PATCH', `/admin/tenants/${encodeURIComponent(tenantId)}/partner`, body),
  patchTenantType: (tenantId, body) => request('PATCH', `/admin/tenants/${encodeURIComponent(tenantId)}/type`, body),
  tenantCmms: () => request('GET', '/tenant/cmms'),
  listPartnerCustomers: () => request('GET', '/partner/customers'),
  partnerBilling: () => request('GET', '/partner/billing'),
  listAccessibleTenants: () => request('GET', '/partner/accessible-tenants'),
  switchPartnerTenant: (body) => request('POST', '/partner/switch-tenant', body),
};
