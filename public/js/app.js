'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  function peaklogicApiFetch(method, path, query = null) {
    const q = new URLSearchParams();
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([k, v]) => {
        if (v != null && v !== '') q.set(k, String(v));
      });
    }
    const qs = q.toString();
    const url = `/api${path}${qs ? `?${qs}` : ''}`;
    return fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
      return data;
    });
  }

  function patchReportMongoApi() {
    if (typeof api === 'undefined') return;
    api.sysLogStatus = () => peaklogicApiFetch('GET', '/sys-log/status');
    api.sysLogQuery = (params = {}) => peaklogicApiFetch('GET', '/sys-log', params);
    api.mongoLoggerStatus = () => peaklogicApiFetch('GET', '/logger/mongo/status');
    api.hardwareHistoryStatus = () => peaklogicApiFetch('GET', '/hardware-history/status');
    api.hardwareHistory = (params = {}) => {
      const q = {};
      if (params.positionId) q.positionId = params.positionId;
      if (params.serial) q.serial = params.serial;
      if (params.recent) q.recent = '1';
      if (params.limit) q.limit = String(params.limit);
      return peaklogicApiFetch('GET', '/hardware-history', q);
    };
  }
  patchReportMongoApi();

  let tags = [];
  let drivers = [];
  const MAX_GRAPH_PENS = 32;
  const GRAPH_PEN_COLORS = [
    '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626',
    '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#0d9488',
  ];
  let graphPens = [];
  let graphPensDirty = false;
  let lastGraphHistory = {};
  let historianSource = 'live';
  let historianMongoHistory = {};
  let historianMongoMeta = null;
  let historianPdmHistory = {};
  let historianPdmMeta = null;
  let historianPdmForecast = null;
  let historianPdmRul = null;
  let historianPdmAssetContext = null;
  let historianPdmPens = [];
  let pdmAssetId = '';
  let pdmAssetManagerGen = 0;
  let pdmAssetEditOriginalId = '';
  let pdmSetupCatalog = null;
  let historianRangePreset = '24h';
  let historianUseCustom = false;
  let historianHoverState = null;
  let mongoLoggerDirty = false;
  let reportConfig = {};
  let reportConfigDirty = false;
  const DEFAULT_MONGO_LOGGER = {
    uri: 'mongodb://127.0.0.1:27017',
    db: 'peaklogic',
    collection: 'tag_logs',
    edgeCollection: 'edge_inference',
    sampleIntervalMs: 5000,
  };
  const HISTORIAN_RANGE_PRESETS = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  let projectName = 'untitled';
  let activeSavedProjectId = null;
  let editingTags = false;
  let editingDrivers = false;
  let tagEditRow = null;
  let driverEditRow = null;
  let pollTimer = null;
  let fullRefreshTimer = null;
  let liveRefreshInFlight = false;
  let liveWsActive = false;
  const FULL_REFRESH_MS = 300_000;
  let dashboardPollIntervalMs = 2_000;
  let serialPorts = [];
  let driverHealthMap = {};
  let devicePresets = [];
  let wizardTransportGroups = [];
  let lastRuntime = { running: false };
  let lastOptaRuntime = null;
  let lastLive = [];
  let lastSettings = {};
  let tagsDirty = false;
  let driversDirty = false;
  let tagSort = { key: 'id', dir: 'asc' };
  const TAG_VIEW_FILTERS_KEY = 'peaklogic-tags-view-filters';
  const TAG_VIEW_FILTER_IDS = ['io', 'i', 'r', 'b', 'fb'];
  let tagViewFilters = readTagViewFilters();
  let projects = [];
  let projectImportItems = [];
  let projectHubItems = [];
  const projectListSort = {
    picker: { key: 'date', dir: 'desc' },
    import: { key: 'date', dir: 'desc' },
    hub: { key: 'date', dir: 'desc' },
    setup: { key: 'date', dir: 'desc' },
  };
  let setupActiveTab = 'general';
  let setupDirty = false;
  let driversActiveTab = 'list';
  let tagMax = 1024;
  let lastHmiRev = 0;
  let refreshInFlight = false;
  let projectOpenInFlight = false;
  let projectSaveInFlight = false;
  let lastDashboardData = null;
  let lastParcDevices = [];
  let currentAuthUser = null;
  let authFeatureCatalog = [];
  let authUsersForMatrix = [];

  function isApplianceDeployment() {
    return window.PEAKLOGIC_BUILD?.deployment === 'appliance';
  }

  function isCloudDeployment() {
    return window.PEAKLOGIC_BUILD?.deployment === 'cloud';
  }

  function authUserHasFeature(featureKey) {
    if (!currentAuthUser) return !isCloudDeployment() && !isApplianceDeployment();
    if (currentAuthUser.role === 'platform_admin' || currentAuthUser.role === 'tenant_admin' || currentAuthUser.role === 'partner_admin') {
      return true;
    }
    if (isApplianceDeployment()) {
      if (currentAuthUser.role === 'admin') return true;
      return !!currentAuthUser.features?.[featureKey];
    }
    if (isCloudDeployment()) {
      return !!currentAuthUser.features?.[featureKey];
    }
    return true;
  }

  function applyCloudFeatureVisibility() {
    const navFeat = {
      studio: 'hmiView',
      sites: 'sites',
      devices: 'devices',
      fleet: 'fleet',
      people: 'people',
      cmms: 'cmms',
    };
    document.querySelectorAll('.cloud-studio-nav-link[data-cloud-nav]').forEach((a) => {
      if (a.dataset.cloudNav === 'admin') return;
      const key = navFeat[a.dataset.cloudNav] || 'hmiView';
      a.classList.toggle('view-hidden', !authUserHasFeature(key));
    });
    const operatorHmi = isCloudDeployment()
      && currentAuthUser?.role === 'operator'
      && authUserHasFeature('hmiView')
      && !authUserHasFeature('studioEdit');
    document.body.classList.toggle('mv-cloud-operator-hmi', operatorHmi);
    $('hmi-operator-hand-banner')?.classList.toggle('view-hidden', !operatorHmi);
    const cloudMap = [
      { feature: 'studioEdit', sel: '[data-popup-open="program"], [data-popup-open="tags"], [data-popup-open="drivers"], #btn-hmi-setup, #btn-project-setup' },
      { feature: 'runtime', sel: '#btn-runtime-start, #btn-runtime-stop' },
      { feature: 'project', sel: '#btn-open-est, #btn-import-est, #btn-export-est, #btn-save-est, #btn-save-est-as, #btn-deploy-project, #btn-share-project' },
      { feature: 'historian', sel: '#historian-menu-details, [data-popup-open="historian"], [data-historian-logger-open]' },
      { feature: 'reports', sel: '[data-popup-open="report"]' },
      { feature: 'alarms', sel: '#btn-topbar-alarms' },
      { feature: 'cmms', sel: '#btn-topbar-cmms' },
      { feature: 'mvDraw', sel: '#btn-topbar-mv-draw' },
    ];
    cloudMap.forEach(({ feature, sel }) => {
      const allowed = authUserHasFeature(feature);
      document.querySelectorAll(sel).forEach((el) => {
        el.classList.toggle('view-hidden', !allowed);
      });
    });
    window.__mvCloudUser = currentAuthUser;
  }

  function applyAuthChrome() {
    const userMeta = $('topbar-user-meta');
    const logoutBtn = $('btn-topbar-logout');
    const helpSignOut = $('btn-help-sign-out');
    const cloudNavUser = $('cloud-nav-user');
    const cloudNavLogout = $('btn-cloud-nav-logout');
    const cloudNavAdmin = $('cloud-nav-admin');
    if (currentAuthUser) {
      const label = currentAuthUser.name || currentAuthUser.email || 'Signed in';
      if (userMeta) {
        userMeta.textContent = label;
        userMeta.classList.remove('view-hidden');
      }
      if (cloudNavUser) cloudNavUser.textContent = label;
      logoutBtn?.classList.remove('view-hidden');
      helpSignOut?.classList.remove('view-hidden');
    } else {
      logoutBtn?.classList.add('view-hidden');
      helpSignOut?.classList.add('view-hidden');
    }
    if (cloudNavAdmin) {
      cloudNavAdmin.classList.toggle('view-hidden', currentAuthUser?.role !== 'platform_admin');
    }
  }

  async function initStudioOrgSwitcher(me) {
    const wrap = $('studio-org-wrap');
    const sel = $('studio-org-select');
    if (!wrap || !sel || !me) return;
    const user = me.user || {};
    const isPlatformAdmin = user.role === 'platform_admin';
    const isPartner = !!me.isPartner;
    let tenants = me.accessibleTenants || [];
    if ((isPartner || isPlatformAdmin) && tenants.length === 0) {
      try {
        const extra = isPlatformAdmin
          ? (await api.listAdminTenants()).tenants
          : (await api.listAccessibleTenants()).tenants;
        if (Array.isArray(extra) && extra.length) tenants = extra;
      } catch { /* ignore */ }
    }
    const byId = new Map(tenants.map((t) => [t.tenantId, t]));
    tenants = [...byId.values()];
    if (!isPartner && !isPlatformAdmin) {
      wrap.classList.add('view-hidden');
      return;
    }
    if (!tenants.length) {
      wrap.classList.remove('view-hidden');
      sel.innerHTML = '<option value="">(no organizations)</option>';
      return;
    }
    wrap.classList.remove('view-hidden');
    const activeId = me.tenant?.tenantId || user.tenantId || '';
    sel.innerHTML = tenants.map((t) => {
      const home = isPartner && t.tenantId === user.tenantId;
      const suffix = home ? ' (partner)' : '';
      return `<option value="${esc(t.tenantId)}"${t.tenantId === activeId ? ' selected' : ''}>${esc(t.name)} (${esc(t.tenantSlug)})${suffix}</option>`;
    }).join('');
    if (!activeId && isPartner && user.tenantId) {
      try {
        await api.switchPartnerTenant({ tenantId: user.tenantId });
        location.reload();
        return;
      } catch { /* ignore */ }
    }
    if (!activeId && isPlatformAdmin) {
      sel.insertAdjacentHTML('afterbegin', '<option value="" disabled selected>Select organization…</option>');
    }
    if (sel.dataset.bound !== '1') {
      sel.dataset.bound = '1';
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try {
          await api.switchPartnerTenant({ tenantId: sel.value });
          location.reload();
        } catch (e) {
          alert(e.message || 'Could not switch organization');
        }
      });
    }
  }

  function cloudProjectAccessHint(err) {
    const msg = String(err?.message || err || '');
    if (!/select an organization|no tenant context/i.test(msg)) return msg;
    return `${msg}\n\nChoose an organization from the Org dropdown in the top bar (e.g. ACE), then try again.`;
  }

  function applyFeatureVisibility() {
    if (isCloudDeployment()) {
      applyCloudFeatureVisibility();
      applyAuthChrome();
      return;
    }
    if (!isApplianceDeployment()) {
      applyAuthChrome();
      return;
    }
    const map = [
      { feature: 'alarms', sel: '#btn-topbar-alarms' },
      { feature: 'mvDraw', sel: '#btn-topbar-mv-draw' },
      { feature: 'cameras', sel: '#camera-menu-details' },
      { feature: 'historian', sel: '#historian-menu-details, #btn-topbar-pdm, [data-popup-open="historian"], [data-historian-logger-open], [data-popup-open="historian-logger"], #btn-historian-logger' },
      { feature: 'reports', sel: '[data-popup-open="report"]' },
      { feature: 'cmms', sel: '#btn-topbar-cmms, a[href="/cmms"]' },
      { feature: 'program', sel: '[data-popup-open="program"]' },
      { feature: 'tags', sel: '[data-popup-open="tags"]' },
      { feature: 'drivers', sel: '[data-popup-open="drivers"]' },
      { feature: 'connectivity', sel: 'a[href="/cellular/sims"]' },
      { feature: 'setup', sel: '#btn-project-setup' },
      { feature: 'project', sel: '#btn-open-est, #btn-import-est, #btn-export-est, #btn-save-est, #btn-save-est-as, #btn-save-ws, #btn-delete-est, #btn-proj-new-menu, #btn-deploy-project, #btn-share-project' },
      { feature: 'users', sel: '[data-setup-tab-btn="features"]' },
    ];
    map.forEach(({ feature, sel }) => {
      const allowed = authUserHasFeature(feature);
      document.querySelectorAll(sel).forEach((el) => {
        el.classList.toggle('view-hidden', !allowed);
        if (el.tagName === 'A' || el.tagName === 'BUTTON') {
          el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
        }
      });
    });
    applyAuthChrome();
    const canEditUsers = authUserHasFeature('users') || currentAuthUser?.role === 'admin';
    $('setup-features-admin-only')?.classList.toggle('view-hidden', !canEditUsers);
    $('setup-features-viewer-msg')?.classList.toggle('view-hidden', canEditUsers);
  }

  async function loadAuthSession() {
    try {
      const data = await api.authMe();
      currentAuthUser = data.user || null;
      if (isApplianceDeployment()) {
        authFeatureCatalog = data.featureCatalog || [];
      }
      applyFeatureVisibility();
      if (isCloudDeployment()) {
        await initStudioOrgSwitcher(data);
      }
      return currentAuthUser;
    } catch (e) {
      if ((e.message || '').toLowerCase().includes('authentication')) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/login?next=${next}`;
        return null;
      }
      throw e;
    }
  }

  async function refreshAuthUsersMatrix() {
    if (!isApplianceDeployment() || !authUserHasFeature('users')) return;
    const msg = $('setup-features-msg');
    try {
      const data = await api.listAuthUsers();
      authUsersForMatrix = data.users || [];
      authFeatureCatalog = data.features || authFeatureCatalog;
      renderAuthFeaturesMatrix();
      if (msg) msg.textContent = `${authUsersForMatrix.length} account(s)`;
    } catch (e) {
      if (msg) msg.textContent = e.message || String(e);
    }
  }

  function renderAuthFeaturesMatrix() {
    const host = $('setup-features-matrix-host');
    if (!host) return;
    const features = authFeatureCatalog.length
      ? authFeatureCatalog
      : Object.keys(authUsersForMatrix[0]?.features || {}).map((k) => ({ key: k, label: k }));
    if (!authUsersForMatrix.length) {
      host.innerHTML = '<p class="muted">No user accounts.</p>';
      return;
    }
    const head = features.map((f) => `<th title="${esc(f.label)}">${esc(f.label)}</th>`).join('');
    const rows = authUsersForMatrix.map((u) => {
      const isAdmin = u.role === 'admin';
      const cells = features.map((f) => {
        const checked = isAdmin || !!u.features?.[f.key];
        const disabled = isAdmin ? ' disabled' : '';
        return `<td><input type="checkbox" data-feat-user="${esc(u.userId || u.id)}" data-feat-key="${esc(f.key)}"${checked ? ' checked' : ''}${disabled} aria-label="${esc(u.email)} ${esc(f.label)}"></td>`;
      }).join('');
      return `<tr class="${isAdmin ? 'is-admin' : ''}" data-auth-user-row="${esc(u.userId || u.id)}">
        <td class="feature-user-col"><strong>${esc(u.name || u.email)}</strong><br><span class="muted">${esc(u.email)} · ${esc(u.role)}</span></td>
        ${cells}
      </tr>`;
    }).join('');
    host.innerHTML = `<table class="setup-features-matrix"><thead><tr><th class="feature-user-col">User</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function collectAuthFeaturesMatrix() {
    const matrix = {};
    authUsersForMatrix.forEach((u) => {
      if (u.role === 'admin') return;
      const uid = u.userId || u.id;
      matrix[uid] = { ...(u.features || {}) };
    });
    document.querySelectorAll('[data-feat-user][data-feat-key]').forEach((cb) => {
      const uid = cb.dataset.featUser;
      const key = cb.dataset.featKey;
      if (!matrix[uid]) matrix[uid] = {};
      matrix[uid][key] = cb.checked;
    });
    return matrix;
  }

  function resetFeatUserForm() {
    if ($('feat-user-id')) $('feat-user-id').value = '';
    if ($('feat-user-email')) $('feat-user-email').value = '';
    if ($('feat-user-name')) $('feat-user-name').value = '';
    if ($('feat-user-role')) $('feat-user-role').value = 'operator';
    if ($('feat-user-password')) $('feat-user-password').value = '';
    if ($('feat-user-active')) $('feat-user-active').checked = true;
  }

  async function saveAuthFeaturesMatrix() {
    const msg = $('setup-features-msg');
    try {
      const matrix = collectAuthFeaturesMatrix();
      const data = await api.putAuthFeaturesMatrix(matrix);
      authUsersForMatrix = data.users || authUsersForMatrix;
      renderAuthFeaturesMatrix();
      if (msg) msg.textContent = 'Access matrix saved.';
    } catch (e) {
      if (msg) msg.textContent = e.message || String(e);
    }
  }

  async function saveFeatUserForm() {
    const msg = $('setup-features-msg');
    const id = $('feat-user-id')?.value?.trim();
    const body = {
      email: $('feat-user-email')?.value?.trim(),
      name: $('feat-user-name')?.value?.trim(),
      role: $('feat-user-role')?.value || 'operator',
      active: !!$('feat-user-active')?.checked,
    };
    const pass = $('feat-user-password')?.value;
    if (pass) body.password = pass;
    try {
      if (id) await api.updateAuthUser(id, body);
      else {
        if (!pass) throw new Error('Password required for new users');
        await api.createAuthUser(body);
      }
      resetFeatUserForm();
      await refreshAuthUsersMatrix();
      if (msg) msg.textContent = 'User saved.';
    } catch (e) {
      if (msg) msg.textContent = e.message || String(e);
    }
  }

  const MODBUS_TABLES = ['holding', 'input', 'discrete', 'coil'];
  const MEMORY_PREFIX = { BOOL: 'VPB', INT: 'VPI', REAL: 'VPR' };
  const FB_PREFIX = { TIMER: 'TMR', COUNTER: 'CTR', PID: 'PID', AVG: 'AVG', FLOW: 'FLOW', ALT: 'ALT' };
  const FB_TYPES = ['TIMER', 'COUNTER', 'PID', 'AVG', 'FLOW', 'ALT'];

  const TIMER_MODES = [
    { id: 'TON', label: 'TON — on-delay' },
    { id: 'TOF', label: 'TOF — off-delay' },
    { id: 'TP', label: 'TP — pulse' },
  ];
  const COUNTER_MODES = [
    { id: 'CTU', label: 'CTU — count up' },
    { id: 'CTD', label: 'CTD — count down' },
  ];
  const PID_MODES = [
    { id: 'P', label: 'P — proportional only' },
    { id: 'PI', label: 'PI — proportional + integral' },
    { id: 'PID', label: 'PID — full loop' },
  ];
  const AVG_MODES = [
    { id: 'MOV', label: 'MOV — moving average (N samples)' },
    { id: 'EMA', label: 'EMA — exponential average' },
  ];
  const FLOW_MODES = [
    { id: 'GPM', label: 'GPM — gallons per minute from pulse count' },
  ];
  const ALT_MODES = [
    { id: 'ALT2', label: 'ALT2 — 2-pump lead/lag rotation' },
    { id: 'ALT3', label: 'ALT3 — 3-pump triplex lead/lag/lag2' },
    { id: 'ALT4', label: 'ALT4 — 4-pump round-robin rotation' },
  ];

  function memoryPrefixForType(type) {
    return MEMORY_PREFIX[type] || null;
  }

  function fbPrefixForType(type) {
    return FB_PREFIX[type] || null;
  }

  function normalizeWordWidth(type, wordWidth) {
    if (type === 'TIMER' || type === 'COUNTER' || type === 'INT') {
      return Number(wordWidth) >= 32 ? 32 : 16;
    }
    if (type === 'REAL' || type === 'PID' || type === 'AVG' || type === 'FLOW') return 32;
    if (type === 'ALT') return 16;
    return 16;
  }

  function formatBitsLabel(t) {
    if (t.type === 'BOOL') return '1-bit';
    if (t.type === 'REAL') return '32-bit';
    if (t.type === 'PID' || t.type === 'AVG' || t.type === 'FLOW') return '32-bit REAL';
    if (t.type === 'ALT') return '16-bit INT';
    if (t.type === 'INT' || t.type === 'TIMER' || t.type === 'COUNTER') {
      return `${normalizeWordWidth(t.type, t.wordWidth)}-bit`;
    }
    return '—';
  }

  function fbModeList(type) {
    if (type === 'TIMER') return TIMER_MODES;
    if (type === 'PID') return PID_MODES;
    if (type === 'AVG') return AVG_MODES;
    if (type === 'FLOW') return FLOW_MODES;
    if (type === 'ALT') return ALT_MODES;
    return COUNTER_MODES;
  }

  function fbModeMeta(type, modeId) {
    const list = fbModeList(type);
    const id = modeId || (type === 'TIMER' ? 'TON' : type === 'PID' ? 'PID' : type === 'AVG' ? 'MOV' : type === 'FLOW' ? 'GPM' : type === 'ALT' ? 'ALT2' : 'CTU');
    return list.find((m) => m.id === id) || list[0];
  }

  function fbModeOpts(type, selected) {
    const list = fbModeList(type);
    return list.map((m) =>
      `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.label)}</option>`
    ).join('');
  }

  function formatCountSp(t) {
    if (t.type === 'TIMER') return `Timer SP: ${Number(t.preset ?? 1000)} ms`;
    if (t.type === 'COUNTER') return `Count SP: ${Number(t.preset ?? 1)}`;
    if (t.type === 'PID') {
      const spRef = t.fb?.spId ? `SP→${t.fb.spId}` : `SP ${Number(t.preset ?? 0)}`;
      return `${spRef} · Kp ${Number(t.kp ?? 1)} Ki ${Number(t.ki ?? 0)} Kd ${Number(t.kd ?? 0)}`;
    }
    if (t.type === 'AVG') return `Window: ${Number(t.preset ?? 1)} samples`;
    if (t.type === 'FLOW') return `K factor: ${Number(t.preset ?? 100)} counts/gal`;
    if (t.type === 'ALT') {
      const n = t.mode === 'ALT4' ? 4 : t.mode === 'ALT3' ? 3 : 2;
      return `${n}-unit rotation`;
    }
    return '—';
  }

  function formatFbMode(t) {
    if (FB_TYPES.includes(t.type)) {
      const m = fbModeMeta(t.type, t.mode);
      return `<span class="fb-mode-pill" title="${esc(m.label)}">${esc(m.id)}</span>`;
    }
    return '—';
  }

  function fbSpEditHtml(t) {
    if (t.type === 'TIMER') {
      return `<label class="fb-field-lbl">Timer SP <span class="muted">(ms)</span>
        <input data-f="preset" type="number" min="1" step="1" value="${Number(t.preset ?? 1000)}" title="On-delay / pulse duration in milliseconds"></label>`;
    }
    if (t.type === 'COUNTER') {
      return `<label class="fb-field-lbl">Count SP
        <input data-f="preset" type="number" min="1" step="1" value="${Number(t.preset ?? 1)}" title="Target count before CounterDone"></label>`;
    }
    if (t.type === 'AVG') {
      return `<label class="fb-field-lbl">Window <span class="muted">(samples)</span>
        <input data-f="preset" type="number" min="1" max="256" step="1" value="${Number(t.preset ?? 1)}" title="Number of samples (1–256)"></label>`;
    }
    if (t.type === 'FLOW') {
      return `<label class="fb-field-lbl">K factor <span class="muted">(counts/gal)</span>
        <input data-f="preset" type="number" min="0.001" step="any" value="${Number(t.preset ?? 100)}" title="Pulse counts per gallon (or counts per GPM reference)"></label>`;
    }
    if (t.type === 'ALT') {
      const mode = String(t.fb?.levelInputMode || 'both');
      return `<label class="fb-field-lbl">Units <span class="muted">(2 or 4)</span>
        <input data-f="preset" type="number" min="2" max="4" step="1" value="${Number(t.preset ?? 2)}" title="Number of pumps/blowers in rotation"></label>
        <label class="fb-field-lbl">Level input
        <select data-f="levelInputMode" title="Use digital high/low tags, analog level bands, or both">
          <option value="both"${mode === 'both' ? ' selected' : ''}>Digital + analog</option>
          <option value="digital"${mode === 'digital' ? ' selected' : ''}>Digital only</option>
          <option value="analog"${mode === 'analog' ? ' selected' : ''}>Analog only</option>
        </select></label>`;
    }
    if (t.type === 'PID') {
      return `<div class="fb-pid-gains">
        <label class="fb-field-lbl">Kp <input data-f="kp" type="number" step="any" value="${Number(t.kp ?? 1)}"></label>
        <label class="fb-field-lbl">Ki <input data-f="ki" type="number" step="any" value="${Number(t.ki ?? 0)}"></label>
        <label class="fb-field-lbl">Kd <input data-f="kd" type="number" step="any" value="${Number(t.kd ?? 0)}"></label>
        <label class="fb-field-lbl">Out min <input data-f="outMin" type="number" step="any" value="${Number(t.outMin ?? 0)}"></label>
        <label class="fb-field-lbl">Out max <input data-f="outMax" type="number" step="any" value="${Number(t.outMax ?? 100)}"></label>
      </div>`;
    }
    return '<span class="muted">—</span>';
  }

  function fbModeEditHtml(t) {
    if (t.type === 'TIMER') {
      return `<label class="fb-field-lbl">Timer mode
        <select data-f="mode" title="TON=on-delay, TOF=off-delay, TP=pulse">${fbModeOpts('TIMER', t.mode || 'TON')}</select></label>`;
    }
    if (t.type === 'COUNTER') {
      return `<label class="fb-field-lbl">Counter mode
        <select data-f="mode" title="CTU=count up, CTD=count down">${fbModeOpts('COUNTER', t.mode || 'CTU')}</select></label>`;
    }
    if (t.type === 'PID') {
      return `<label class="fb-field-lbl">PID mode
        <select data-f="mode" title="P, PI, or full PID">${fbModeOpts('PID', t.mode || 'PID')}</select></label>`;
    }
    if (t.type === 'AVG') {
      return `<label class="fb-field-lbl">Average mode
        <select data-f="mode" title="MOV=sliding window, EMA=exponential">${fbModeOpts('AVG', t.mode || 'MOV')}</select></label>`;
    }
    if (t.type === 'FLOW') {
      return `<label class="fb-field-lbl">Flow mode
        <select data-f="mode" title="GPM from 1-minute pulse window">${fbModeOpts('FLOW', t.mode || 'GPM')}</select></label>`;
    }
    if (t.type === 'ALT') {
      return `<label class="fb-field-lbl">Alternator mode
        <select data-f="mode" title="2-pump or 4-pump rotation">${fbModeOpts('ALT', t.mode || 'ALT2')}</select></label>`;
    }
    return '<span class="muted">—</span>';
  }

  function nextMemoryTagId(type, skipIndex = null) {
    const prefix = memoryPrefixForType(type);
    if (!prefix) return `TAG_${tags.length}`;
    const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
    let max = 0;
    tags.forEach((t, idx) => {
      if (skipIndex != null && idx === skipIndex) return;
      const m = String(t.id).match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `${prefix}${max + 1}`;
  }

  function nextFbTagId(type, skipIndex = null) {
    const prefix = fbPrefixForType(type);
    if (!prefix) return `TAG_${tags.length}`;
    const re = new RegExp(`^${prefix}(\\d*)$`, 'i');
    let max = 0;
    let hasBare = false;
    tags.forEach((t, idx) => {
      if (skipIndex != null && idx === skipIndex) return;
      const m = String(t.id).match(re);
      if (!m) return;
      if (m[1] === '') {
        hasBare = true;
        return;
      }
      max = Math.max(max, parseInt(m[1], 10));
    });
    if (max === 0 && !hasBare) return prefix;
    return `${prefix}${max + 1}`;
  }

  function applyFbTagId(id, type, skipIndex = null) {
    const prefix = fbPrefixForType(type);
    if (!prefix) return id;
    const m = String(id || '').match(/^(TMR|CTR|PID|AVG|FLOW|ALT)(\d*)$/i);
    if (m) return `${prefix}${m[2] || ''}`;
    const mem = String(id || '').match(/^(VPB|VPI|VPR)(\d+)$/i);
    if (mem) return `${prefix}${mem[2]}`;
    return nextFbTagId(type, skipIndex);
  }

  function applyMemoryTagId(id, type, role, skipIndex = null) {
    if (role !== 'memory') return id;
    if (FB_TYPES.includes(type)) return id;
    const prefix = memoryPrefixForType(type);
    if (!prefix) return id;
    const m = String(id || '').match(/^(VPB|VPI|VPR)(\d+)$/i);
    if (m) return `${prefix}${m[2]}`;
    const fb = String(id || '').match(/^(TMR|CTR|PID)(\d*)$/i);
    if (fb) return `${prefix}${fb[2] || '1'}`;
    return nextMemoryTagId(type, skipIndex);
  }

  function applyTagId(id, type, role, skipIndex = null) {
    if (FB_TYPES.includes(type)) return applyFbTagId(id, type, skipIndex);
    return applyMemoryTagId(id, type, role, skipIndex);
  }

  function wordWidthEditHtml(t) {
    if (t.type === 'INT' || t.type === 'TIMER' || t.type === 'COUNTER') {
      const w = normalizeWordWidth(t.type, t.wordWidth);
      let html = `<select data-f="wordWidth">${opts(['16', '32'], String(w))}</select>`;
      if (t.type === 'INT' && w >= 32) {
        const al = Math.max(1, Math.min(62, +(t.arrayLen || 1)));
        html += ` <label class="tag-array-len" title="32-bit array length (Modbus FC16 block)">×<input type="number" data-f="arrayLen" min="1" max="62" value="${al}" style="width:3em"></label>`;
      }
      return html;
    }
    return '<span class="muted">—</span>';
  }

  const NUMERIC_TAG_TYPES = ['INT', 'REAL'];
  const ALARM_LIMIT_KEYS = {
    alarmOL: 'alarmOuterLow',
    alarmIL: 'alarmInnerLow',
    alarmIH: 'alarmInnerHigh',
    alarmOH: 'alarmOuterHigh',
  };
  const ALARM_LABELS = {
    outerLow: 'Outer low',
    innerLow: 'Inner low',
    normal: 'Normal',
    innerHigh: 'Inner high',
    outerHigh: 'Outer high',
    alarm: 'Alarm',
  };
  const ALARM_PRIORITY = {
    outerLow: 50,
    outerHigh: 50,
    innerLow: 30,
    innerHigh: 30,
    alarm: 40,
  };
  let alarmsShowAcked = false;
  function isNumericTagType(type) {
    return NUMERIC_TAG_TYPES.includes(String(type || '').toUpperCase());
  }

  function isDigitalTagType(type) {
    return String(type || '').toUpperCase() === 'BOOL';
  }

  function isAlarmCapableType(type) {
    return isNumericTagType(type) || isDigitalTagType(type) || String(type || '').toUpperCase() === 'PID';
  }

  function isTagGraphable(t) {
    const type = String(t?.type || '').toUpperCase();
    return type === 'INT' || type === 'REAL' || type === 'BOOL'
      || type === 'PID' || type === 'AVG' || type === 'FLOW' || type === 'ALT';
  }

  function tagHistorianEnabled(t) {
    return isTagGraphable(t) && t.graphEnabled !== false;
  }

  function historianSelectAllState() {
    const graphable = tags.filter(isTagGraphable);
    if (!graphable.length) return { checked: false, indeterminate: false, enabled: 0, total: 0 };
    const on = graphable.filter(tagHistorianEnabled).length;
    return {
      checked: on === graphable.length,
      indeterminate: on > 0 && on < graphable.length,
      enabled: on,
      total: graphable.length,
    };
  }

  function tagHistorianHeaderHtml() {
    const st = historianSelectAllState();
    return `<label class="tag-hist-all" title="Historian &amp; archive — all plottable tags">
      <input type="checkbox" data-tag-hist-all ${st.checked ? 'checked' : ''}>
      Hist<br><span class="th-sub">${st.enabled}/${st.total}</span>
    </label>`;
  }

  function tagHistorianCellHtml(t, i, editing) {
    if (!isTagGraphable(t)) return '<span class="muted">—</span>';
    const checked = tagHistorianEnabled(t);
    if (editing) {
      return `<label class="tag-hist-en"><input data-f="graphEnabled" type="checkbox" ${checked ? 'checked' : ''} title="Record in historian / MongoDB archive"></label>`;
    }
    return `<label class="tag-hist-en"><input type="checkbox" data-tag-hist="${i}" ${checked ? 'checked' : ''} title="Record in historian / MongoDB archive"></label>`;
  }

  async function persistHistorianTags() {
    await api.putTags(normalizeTagsForSave(tags));
    tagsDirty = false;
  }

  function setAllTagsHistorianEnabled(want) {
    let changed = false;
    tags.forEach((t) => {
      if (!isTagGraphable(t)) return;
      const next = !!want;
      if (!!tagHistorianEnabled(t) !== next) {
        t.graphEnabled = next;
        changed = true;
      }
    });
    if (changed) tagsDirty = true;
    return changed;
  }

  function bindTagHistorianCells(host) {
    const allEl = host.querySelector('[data-tag-hist-all]');
    if (allEl) {
      const st = historianSelectAllState();
      allEl.indeterminate = st.indeterminate;
      allEl.onchange = () => {
        setAllTagsHistorianEnabled(allEl.checked);
        renderTags();
        persistHistorianTags().catch((e) => console.warn('historian tag save', e));
      };
    }
    host.querySelectorAll('[data-tag-hist]').forEach((inp) => {
      inp.onchange = () => {
        const idx = +inp.dataset.tagHist;
        const t = tags[idx];
        if (!t || !isTagGraphable(t)) return;
        t.graphEnabled = inp.checked;
        tagsDirty = true;
        if (allEl) {
          const st = historianSelectAllState();
          allEl.checked = st.checked;
          allEl.indeterminate = st.indeterminate;
          const sub = allEl.closest('label')?.querySelector('.th-sub');
          if (sub) sub.textContent = `${st.enabled}/${st.total}`;
        }
        persistHistorianTags().catch((e) => console.warn('historian tag save', e));
      };
    });
  }

  function isAnalogAlarmLimitsType(type) {
    return isNumericTagType(type) || String(type || '').toUpperCase() === 'PID';
  }

  function formatTagScale(t) {
    if (!isNumericTagType(t.type)) return '—';
    const scale = Number(t.scale);
    const offset = Number(t.offset);
    const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
    const o = Number.isFinite(offset) ? offset : 0;
    if (s === 1 && o === 0) return '×1';
    const offStr = o >= 0 ? `+${o}` : String(o);
    return `×${s} ${offStr}`;
  }

  function tagAlarmLevel(t, liveEntry) {
    if (liveEntry?.alarmLevel) return liveEntry.alarmLevel;
    return t.alarmLevel || null;
  }

  function isAlarmActiveLevel(level) {
    return !!level && level !== 'normal';
  }

  function formatAlarmAckUser(user) {
    if (!user || typeof user !== 'object') return null;
    return user.name || user.email || user.id || null;
  }

  function alarmAckCellHtml(acked, ackedBy) {
    if (!acked) {
      return null;
    }
    const who = formatAlarmAckUser(ackedBy);
    return who
      ? `<span class="muted" title="Acknowledged by ${esc(who)}">Acked · ${esc(who)}</span>`
      : '<span class="muted">Acked</span>';
  }

  function collectActiveAlarms(tagList, live) {
    const liveMap = {};
    for (const e of live || []) liveMap[e.tagId] = e;
    const rows = [];
    for (const t of tagList || []) {
      if (!t.alarmsEnabled || !isAlarmCapableType(t.type)) continue;
      const le = liveMap[t.id];
      const level = tagAlarmLevel(t, le);
      if (!isAlarmActiveLevel(level)) continue;
      rows.push({
        tag: t,
        live: le,
        level,
        acked: !!(le?.alarmAcked),
        ackedBy: le?.alarmAckedBy || null,
        since: le?.alarmSince || null,
      });
    }
    rows.sort((a, b) => {
      const pa = ALARM_PRIORITY[a.level] || 0;
      const pb = ALARM_PRIORITY[b.level] || 0;
      if (pa !== pb) return pb - pa;
      if (a.acked !== b.acked) return a.acked ? 1 : -1;
      return String(a.tag.id).localeCompare(String(b.tag.id));
    });
    return rows;
  }

  function updateAlarmsTabBadge(unacked) {
    const badge = $('alarms-tab-badge');
    const summary = $('alarms-summary');
    const n = Number(unacked) || 0;
    if (badge) {
      if (n > 0) {
        badge.textContent = String(n);
        badge.classList.remove('view-hidden');
        badge.setAttribute('aria-hidden', 'false');
      } else {
        badge.textContent = '';
        badge.classList.add('view-hidden');
        badge.setAttribute('aria-hidden', 'true');
      }
    }
    if (summary) summary.textContent = n > 0 ? `(${n} unack)` : '';
  }

  function applyLiveFromServer(live) {
    if (!Array.isArray(live)) return;
    lastLive = live;
    updateAlarmsTabBadge(collectActiveAlarms(tags, lastLive).filter((r) => !r.acked).length);
    if (isPopupOpen('alarms')) renderAlarmsPanel();
    window.PeaklogicHmi?.refreshLiveBindings?.();
  }

  function renderAlarmsPanel() {
    const host = $('alarms-list');
    const meta = $('alarms-meta');
    if (!host) return;
    const allRows = collectActiveAlarms(tags, lastLive);
    const rows = alarmsShowAcked ? allRows : allRows.filter((r) => !r.acked);
    const unacked = allRows.filter((r) => !r.acked).length;
    updateAlarmsTabBadge(unacked);
    if (meta) {
      meta.textContent = allRows.length
        ? `${allRows.length} active · ${unacked} unacknowledged`
        : 'No active alarms';
    }
    const ackAllBtn = $('btn-alarms-ack-all');
    if (ackAllBtn) ackAllBtn.disabled = unacked === 0;
    if (!rows.length) {
      host.innerHTML = alarmsShowAcked || !allRows.length
        ? '<p class="muted alarms-empty">No active alarms. Configure limits and conditions in <strong>Tags</strong> (Alarm columns).</p>'
        : '<p class="muted alarms-empty">No unacknowledged alarms. Enable <strong>Show acknowledged</strong> to review acked items.</p>';
      return;
    }
    const trs = rows.map(({ tag: t, live, level, acked, ackedBy, since }) => {
      const rowCls = acked ? 'alarm-row-acked' : `alarm-row-active alarm-row-${level}`;
      const sinceStr = since
        ? (window.PeaklogicTime?.formatFriendly?.(since) || new Date(since).toLocaleString(undefined, window.PeaklogicTime?.localeOpts?.() || {}))
        : '—';
      const ackHtml = acked
        ? (alarmAckCellHtml(true, ackedBy) || '<span class="muted">Acked</span>')
        : `<button type="button" class="btn btn-sm btn-alarm-ack" data-alarm-ack="${esc(t.id)}">Ack</button>`;
      return `<tr class="${rowCls}">
        <td class="alarm-tag"><strong>${esc(t.id)}</strong> <span class="muted">${esc(t.type)}</span></td>
        <td>${tagAlarmStateHtml(t, live)}</td>
        <td class="cell-mono alarm-val">${esc(formatLive(t, live))}</td>
        <td class="alarm-since muted cell-mono">${esc(sinceStr)}</td>
        <td class="alarm-ack-cell">${ackHtml}</td>
      </tr>`;
    }).join('');
    host.innerHTML = `<table class="data-table alarms-table">
      <thead><tr><th>Tag</th><th>State</th><th>Value</th><th>Since</th><th>Ack</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
    host.querySelectorAll('[data-alarm-ack]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          const res = await api.ackAlarm(btn.dataset.alarmAck);
          applyLiveFromServer(res.live);
          await refreshAll({ force: true });
        } catch (e) {
          alert(e.message);
        }
      };
    });
  }

  function formatAlarmLimitValue(v) {
    if (v == null || v === '') return '—';
    return String(v);
  }

  function tagAlarmStateHtml(t, liveEntry) {
    if (!isAlarmCapableType(t.type)) return '<span class="muted">—</span>';
    if (!t.alarmsEnabled) return '<span class="muted">off</span>';
    const level = tagAlarmLevel(t, liveEntry);
    if (!level) return '<span class="tag-alarm-pill tag-alarm-incomplete" title="Set alarm limits or condition">incomplete</span>';
    const cls = level === 'normal' ? 'tag-alarm-normal'
      : (level === 'innerLow' || level === 'innerHigh') ? 'tag-alarm-inner'
      : level === 'alarm' ? 'tag-alarm-outer'
      : 'tag-alarm-outer';
    const title = isDigitalTagType(t.type)
      ? `${ALARM_LABELS[level] || level} · when ${t.alarmCondition === 'off' ? 'OFF' : 'ON'}`
      : `${ALARM_LABELS[level] || level}`;
    return `<span class="tag-alarm-pill ${cls}" title="${esc(title)}">${esc(ALARM_LABELS[level] || level)}</span>`;
  }

  function formatAlarmConditionLabel(t) {
    if (!isDigitalTagType(t.type)) return '—';
    if (!t.alarmsEnabled || !t.alarmCondition) return '—';
    return t.alarmCondition === 'off' ? 'When OFF' : 'When ON';
  }

  function tagScaleEditHtml(t) {
    if (!isNumericTagType(t.type)) return '<span class="muted">—</span>';
    const scale = Number.isFinite(Number(t.scale)) && Number(t.scale) !== 0 ? Number(t.scale) : 1;
    const offset = Number.isFinite(Number(t.offset)) ? Number(t.offset) : 0;
    return `<div class="tag-scale-edit">
      <label title="Multiply raw register value">× <input data-f="scale" type="number" step="any" value="${scale}"></label>
      <label title="Add after scale">+ <input data-f="offset" type="number" step="any" value="${offset}"></label>
    </div>`;
  }

  function tagAlarmLimitEditHtml(t, field) {
    if (!isAnalogAlarmLimitsType(t.type)) return '<span class="muted">—</span>';
    const lim = (v) => (v == null || v === '' ? '' : String(v));
    return `<input data-f="${field}" type="number" step="any" class="tag-alarm-limit-inp" value="${lim(t[field])}">`;
  }

  function tagAlarmEnEditHtml(t) {
    if (!isAlarmCapableType(t.type)) return '<span class="muted">—</span>';
    return `<label class="tag-alarm-en"><input data-f="alarmsEnabled" type="checkbox" ${t.alarmsEnabled ? 'checked' : ''}> On</label>`;
  }

  function tagAlarmCondEditHtml(t) {
    if (!isDigitalTagType(t.type)) return '<span class="muted">—</span>';
    const cond = t.alarmCondition || 'on';
    return `<select data-f="alarmCondition">
      <option value="on" ${cond === 'on' ? 'selected' : ''}>When ON</option>
      <option value="off" ${cond === 'off' ? 'selected' : ''}>When OFF</option>
    </select>`;
  }

  function tagCellInnerHtml(t, i, colKey, editing, liveEntry, forced) {
    switch (colKey) {
      case 'id':
        if (editing) {
          return `<div class="tag-name-row tag-name-edit">
            <div class="tag-edit-fields">
              <input data-f="id" value="${esc(t.id)}" title="Tag id">
              <input data-f="label" type="text" maxlength="80" value="${esc(t.label || '')}" placeholder="Label (HMI)" title="Display name on HMI faceplates — bind tag field: label">
            </div>
            <div class="tag-edit-actions">
              <button type="button" class="btn btn-sm primary" data-apply="${i}">Apply</button>
              <button type="button" class="btn btn-sm" data-cancel="${i}">Cancel</button>
            </div>
          </div>`;
        }
        return `<div class="tag-name-row">
          <div class="tag-name-block">
            <span class="tag-name"><strong>${esc(t.id)}</strong>${forced ? ' <span class="tag-force-badge" title="Forced">F</span>' : ''}</span>
            ${t.label ? `<span class="tag-label-line muted" title="HMI label">${esc(t.label)}</span>` : ''}
          </div>
          <button type="button" class="btn btn-sm" data-edit="${i}">Edit</button>
        </div>`;
      case 'type':
        if (editing) return `<select data-f="type">${opts(['BOOL','INT','REAL','TIMER','COUNTER','PID','AVG','FLOW','ALT'], t.type)}</select>`;
        return esc(t.type);
      case 'role':
        if (editing) return `<select data-f="role">${opts(['input','output','memory','fb'], t.role)}</select>`;
        return esc(t.role);
      case 'bits':
        if (editing) return wordWidthEditHtml(t);
        return esc(formatBitsLabel(t));
      case 'sp':
        if (editing) return fbSpEditHtml(t);
        return esc(formatCountSp(t));
      case 'mode':
        if (editing) return fbModeEditHtml(t);
        return formatFbMode(t);
      case 'driver':
        if (editing) return tagDriverEditHtml(t);
        return esc(t.driverId || '—');
      case 'driverKind':
        return editing ? `<span class="muted">${esc(tagDriverKindLabel(t))}</span>` : esc(tagDriverKindLabel(t));
      case 'addr':
        if (editing) return tagAddrEditHtml(t);
        return esc(formatAddr(t));
      case 'scale':
        if (editing) return tagScaleEditHtml(t);
        return esc(formatTagScale(t));
      case 'alarmEn':
        if (editing) return tagAlarmEnEditHtml(t);
        return isAlarmCapableType(t.type) ? (t.alarmsEnabled ? 'on' : 'off') : '—';
      case 'alarmOL':
        if (editing) return tagAlarmLimitEditHtml(t, 'alarmOuterLow');
        return isNumericTagType(t.type) ? esc(formatAlarmLimitValue(t.alarmOuterLow)) : '—';
      case 'alarmIL':
        if (editing) return tagAlarmLimitEditHtml(t, 'alarmInnerLow');
        return isNumericTagType(t.type) ? esc(formatAlarmLimitValue(t.alarmInnerLow)) : '—';
      case 'alarmState':
        return editing ? '<span class="muted">—</span>' : tagAlarmStateHtml(t, liveEntry);
      case 'alarmIH':
        if (editing) return tagAlarmLimitEditHtml(t, 'alarmInnerHigh');
        return isNumericTagType(t.type) ? esc(formatAlarmLimitValue(t.alarmInnerHigh)) : '—';
      case 'alarmOH':
        if (editing) return tagAlarmLimitEditHtml(t, 'alarmOuterHigh');
        return isNumericTagType(t.type) ? esc(formatAlarmLimitValue(t.alarmOuterHigh)) : '—';
      case 'alarmCond':
        if (editing) return tagAlarmCondEditHtml(t);
        return esc(formatAlarmConditionLabel(t));
      case 'live':
        return editing ? '<span class="muted">—</span>' : liveValCellHtml(t, liveEntry);
      case 'hist':
        return tagHistorianCellHtml(t, i, editing);
      default:
        return '';
    }
  }

  function tagCellClass(colKey, editing) {
    const classes = [];
    if (colKey === 'id') classes.push('cell-tag', 'cell-tag-frozen');
    if (colKey === 'addr') classes.push(editing ? 'cell-addr-edit' : 'cell-addr', 'cell-mono');
    if (colKey === 'scale') classes.push(editing ? 'cell-scale-edit' : 'cell-scale', 'cell-mono');
    if (colKey === 'sp') classes.push('cell-mono');
    if (colKey === 'live') classes.push('live-val');
    if (colKey === 'driverKind') classes.push('cell-driver-kind');
    if (colKey === 'alarmState') classes.push('cell-alarm-state');
    if (colKey.startsWith('alarm')) classes.push('cell-alarm-col');
    if (colKey === 'driver' && editing) classes.push('cell-driver-edit');
    return classes.join(' ');
  }

  function tagDataColAttr(colKey) {
    if (colKey === 'bits') return ' data-fb-bits';
    if (colKey === 'sp') return ' data-fb-sp';
    if (colKey === 'mode') return ' data-fb-mode';
    if (colKey) return ` data-col="${colKey}"`;
    return '';
  }

  function tagRowHtml(t, i, editing) {
    const fs = tagForceState(t);
    const forced = fs.forceInput || fs.forceOutput;
    const liveEntry = liveEntryFor(t.id, lastLive);
    const rowCls = editing ? 'tag-editing' : (forced ? 'force-on' : '');
    const cells = TAG_TABLE_COLUMNS.filter((c) => c.key != null || c.special).map((col) => {
      if (col.special === 'forceEn') {
        return editing ? '<td class="muted">—</td>' : tagForceEnabledCellHtml(t);
      }
      if (col.special === 'hist') {
        return `<td class="cell-hist">${tagHistorianCellHtml(t, i, editing)}</td>`;
      }
      if (col.special === 'forceVal') {
        return editing ? '<td class="muted">—</td>' : tagForceValueCellHtml(t);
      }
      if (col.special === 'actions') {
        if (editing) return '<td class="row-actions muted">—</td>';
        return `<td class="row-actions">
          <button type="button" class="btn btn-sm" data-del="${i}" title="Remove">×</button>
        </td>`;
      }
      const cls = tagCellClass(col.key, editing);
      const extra = col.key === 'live' && !editing ? ` data-live="${esc(t.id)}"` : '';
      const alarmExtra = col.key === 'alarmState' && !editing ? ` data-alarm-state-live="${esc(t.id)}"` : '';
      const addrTitle = col.key === 'addr' && !editing ? ` title="${esc(formatAddr(t))}"` : '';
      return `<td class="${cls}"${tagDataColAttr(col.key)}${extra}${alarmExtra}${addrTitle}>${tagCellInnerHtml(t, i, col.key, editing, liveEntry, forced)}</td>`;
    });
    const idAttr = editing ? '' : ` data-id="${esc(t.id)}"`;
    return `<tr class="${rowCls}" data-i="${i}"${idAttr}>${cells.join('')}</tr>`;
  }

  function refreshTagEditDerivedCells(tr, rowIndex) {
    const idx = tagRowIndex(tr, rowIndex);
    const prevType = tags[idx]?.type;
    if (tr?.querySelector('[data-f]')) readTagRowInputs(tr, idx);
    const role = tr.querySelector('[data-f=role]')?.value;
    const type = tr.querySelector('[data-f=type]')?.value;
    const idInp = tr.querySelector('[data-f=id]');
    if (idInp) idInp.value = applyTagId(idInp.value, type, role, idx);
    if (FB_TYPES.includes(type)) {
      const roleSel = tr.querySelector('[data-f=role]');
      if (roleSel && roleSel.value === 'memory') roleSel.value = 'fb';
    }
    const row = { ...(tags[idx] || {}) };
    row.type = type;
    row.role = role;
    if (FB_TYPES.includes(type)) {
      row.role = 'fb';
      if (type === 'PID' && prevType !== type) {
        row.preset = 0;
        row.mode = 'PID';
        row.kp = 1;
        row.ki = 0;
        row.kd = 0;
        row.outMin = 0;
        row.outMax = 100;
        row.fb = ensureTagFb(type, row.fb);
      } else if (type === 'AVG' && prevType !== type) {
        row.preset = 1;
        row.mode = 'MOV';
        row.fb = ensureTagFb(type, row.fb);
      } else if (type === 'FLOW' && prevType !== type) {
        row.preset = 100;
        row.mode = 'GPM';
        row.fb = ensureTagFb(type, row.fb);
      } else if (type === 'ALT' && prevType !== type) {
        row.preset = 2;
        row.mode = 'ALT2';
        row.fb = ensureTagFb(type, row.fb);
      } else if (prevType !== type || row.preset == null || row.preset <= 0) {
        row.preset = type === 'TIMER' ? 1000 : 1;
        row.mode = type === 'TIMER' ? 'TON' : 'CTU';
        row.fb = ensureTagFb(type, row.fb);
      }
      tags[idx] = row;
    } else {
      tags[idx] = row;
    }
    tr.querySelectorAll('[data-col]').forEach((td) => {
      const col = td.dataset.col;
      if (!col || col === 'id' || col === 'type' || col === 'role' || col === 'driver' || col === 'addr' || col === 'live') return;
      td.innerHTML = tagCellInnerHtml(row, idx, col, true, null, false);
    });
    const bitsTd = tr.querySelector('[data-fb-bits]');
    if (bitsTd) {
      if (type === 'INT' || FB_TYPES.includes(type)) {
        const wwInp = bitsTd.querySelector('[data-f=wordWidth]');
        const cur = wwInp ? +wwInp.value : (row.wordWidth || 16);
        bitsTd.innerHTML = wordWidthEditHtml({ type, wordWidth: cur });
      } else {
        bitsTd.innerHTML = '<span class="muted">—</span>';
      }
    }
    const spTd = tr.querySelector('[data-fb-sp]');
    const modeTd = tr.querySelector('[data-fb-mode]');
    if (spTd) spTd.innerHTML = fbSpEditHtml(row);
    if (modeTd) modeTd.innerHTML = fbModeEditHtml(row);
    if (type !== prevType) {
      refreshTagAddrEditCell(tr, idx);
    }
  }

  function tagRowIndex(tr, fallback) {
    const fromRow = Number(tr?.dataset?.i);
    return Number.isFinite(fromRow) ? fromRow : fallback;
  }

  function normalizeTagsForSave(list) {
    return (list || []).map((t) => {
      const withLabel = {
        ...t,
        label: t.label != null ? String(t.label).trim().slice(0, 80) : '',
      };
      if (t.type !== 'PID') return withLabel;
      const preset = Number(t.preset);
      const kp = Number(t.kp);
      const ki = Number(t.ki);
      const kd = Number(t.kd);
      const outMin = Number(t.outMin);
      const outMax = Number(t.outMax);
      const fb = ensureTagFb('PID', t.fb || {});
      const sp = Number.isFinite(preset) ? preset : 0;
      if (!fb.spId) fb.sp = sp;
      return {
        ...withLabel,
        role: 'fb',
        preset: sp,
        mode: t.mode || 'PID',
        kp: Number.isFinite(kp) ? kp : 1,
        ki: Number.isFinite(ki) ? ki : 0,
        kd: Number.isFinite(kd) ? kd : 0,
        outMin: Number.isFinite(outMin) ? outMin : 0,
        outMax: Number.isFinite(outMax) ? outMax : 100,
        fb,
      };
    });
  }

  function tagModbusSlaveId(t) {
    const a = t.driverAddress;
    if (a && typeof a === 'object' && a.slaveId != null && Number.isFinite(Number(a.slaveId))) {
      return Number(a.slaveId);
    }
    const drv = drivers.find((d) => d.id === t.driverId);
    if (drv?.slaveId != null) return Number(drv.slaveId);
    return null;
  }

  function slavesForDriver(driverId) {
    const slaves = new Set();
    for (const t of tagsForDriver(driverId)) {
      const s = tagModbusSlaveId(t);
      if (s != null) slaves.add(s);
    }
    const d = drivers.find((x) => x.id === driverId);
    if (d?.slaveId != null) slaves.add(Number(d.slaveId));
    return [...slaves].sort((a, b) => a - b);
  }

  function formatModbusTagAddr(t) {
    const a = t.driverAddress;
    if (a == null || a === '') return '—';
    if (typeof a === 'number') return `HR:${a}`;
    if (typeof a !== 'object') return String(a);
    const map = { holding: 'HR', input: 'IR', discrete: 'DI', coil: 'CO', coils: 'CO' };
    const tbl = map[String(a.table || 'holding').toLowerCase()] || String(a.table).toUpperCase();
    const slave = tagModbusSlaveId(t);
    let s = slave != null ? `slave ${slave} · ${tbl}:${a.address ?? 0}` : `${tbl}:${a.address ?? 0}`;
    const bits = a.wordWidth || t.wordWidth;
    if (bits && bits > 16) s += ` · ${bits}b`;
    return s;
  }

  const MQTT_PAYLOAD_TEMPLATES = ['bool', 'number', 'raw', 'json'];

  function formatMqttTagAddr(t) {
    const a = t.driverAddress;
    if (!a || typeof a !== 'object') return '—';
    const topic = a.topic || '—';
    const tpl = a.payloadTemplate ? ` · ${a.payloadTemplate}` : '';
    return `${topic}${tpl}`;
  }

  function formatNextcenturyTagAddr(t) {
    const a = t.driverAddress;
    if (!a || typeof a !== 'object') return '—';
    const deviceId = a.deviceId || '—';
    const field = a.field || 'totalUsage';
    return `${deviceId} · ${field}`;
  }

  function nextcenturyAddrEditHtml(t) {
    const a = (t.driverAddress && typeof t.driverAddress === 'object') ? t.driverAddress : {};
    const fields = [
      'totalUsage', 'temperature', 'currentReading', 'previousReading', 'leakActive',
      'leakStatus', 'area', 'deviceType', 'description', 'unitNumber', 'propertyId',
      '_deviceCount', '_lastCollectEpoch',
    ];
    const field = a.field || 'totalUsage';
    const opts = fields.map((f) =>
      `<option value="${esc(f)}" ${field === f ? 'selected' : ''}>${esc(f)}</option>`
    ).join('');
    return `<div class="tag-nc-addr" data-addr-mode="nextcentury">
      <label class="tag-mb-lbl">Device <input type="text" data-nc-device class="tag-nc-device" value="${esc(a.deviceId || '')}" placeholder="FA003195"></label>
      <label class="tag-mb-lbl">Field <select data-nc-field class="tag-nc-field">${opts}</select></label>
    </div>`;
  }

  const BACNET_OBJECT_TYPES = [
    'analogInput', 'analogOutput', 'analogValue',
    'binaryInput', 'binaryOutput', 'binaryValue',
    'multiStateInput', 'multiStateOutput', 'multiStateValue',
    'characterstringValue',
  ];

  function formatBacnetTagAddr(t) {
    const a = (t.driverAddress && typeof t.driverAddress === 'object') ? t.driverAddress : {};
    const host = a.host || a.ip || '';
    const ot = a.objectType ?? a.type ?? '?';
    const inst = a.objectInstance ?? a.instance ?? '?';
    const prop = a.property || a.propertyId || 'presentValue';
    const dev = a.deviceInstance ?? a.deviceId;
    const devTxt = dev != null ? ` dev ${dev}` : '';
    return `${host || '—'}${devTxt} · ${ot}:${inst} · ${prop}`;
  }

  function bacnetAddrEditHtml(t) {
    const a = (t.driverAddress && typeof t.driverAddress === 'object') ? t.driverAddress : {};
    const otOpts = BACNET_OBJECT_TYPES.map((f) => {
      const cur = a.objectType ?? a.type ?? 'analogInput';
      const sel = String(cur).toLowerCase() === f.toLowerCase() ? 'selected' : '';
      return `<option value="${esc(f)}" ${sel}>${esc(f)}</option>`;
    }).join('');
    return `<div class="tag-bac-addr" data-addr-mode="bacnet">
      <label class="tag-mb-lbl">Host <input type="text" data-bac-host class="tag-bac-host" value="${esc(a.host || a.ip || '')}" placeholder="192.168.1.10"></label>
      <label class="tag-mb-lbl">Dev inst <input type="number" data-bac-device min="0" class="tag-bac-device" value="${esc(a.deviceInstance ?? a.deviceId ?? '')}" placeholder="1001"></label>
      <label class="tag-mb-lbl">Object <select data-bac-otype class="tag-bac-otype">${otOpts}</select></label>
      <label class="tag-mb-lbl">Inst <input type="number" data-bac-oinst min="0" class="tag-bac-oinst" value="${esc(a.objectInstance ?? a.instance ?? 1)}"></label>
      <label class="tag-mb-lbl">Property <input type="text" data-bac-prop class="tag-bac-prop" value="${esc(a.property || a.propertyId || 'presentValue')}" placeholder="presentValue"></label>
    </div>`;
  }

  function formatHttpsTagAddr(t) {
    const a = t.driverAddress;
    if (!a || typeof a !== 'object') return '—';
    const url = a.url || a.path || a.topic || '—';
    const tpl = a.payloadTemplate ? ` · ${a.payloadTemplate}` : '';
    return `${url}${tpl}`;
  }

  function remotePayloadAddrEditHtml(t, pathKey, placeholder) {
    const a = (t.driverAddress && typeof t.driverAddress === 'object') ? t.driverAddress : {};
    const pathVal = a[pathKey] || a.url || a.path || a.topic || '';
    return `<div class="tag-remote-addr" data-addr-mode="remote" data-remote-key="${esc(pathKey)}">
      <input type="text" data-remote-path class="tag-remote-path" placeholder="${esc(placeholder)}" value="${esc(pathVal)}">
      <label class="tag-remote-lbl">Payload ${mqttPayloadTemplateEditHtml(a.payloadTemplate)}</label>
    </div>`;
  }

  function tagDriverType(t) {
    const drv = drivers.find((d) => d.id === t.driverId);
    return drv?.type || '';
  }

  function tagDriverKindLabel(t) {
    const type = tagDriverType(t);
    if (!t.driverId || !type) return '—';
    switch (type) {
      case 'modbus_rtu':
        return 'Modbus RTU';
      case 'vgreen_epc':
        return 'VGreen EPC (RS-485)';
      case 'pentair_rs485':
        return 'Pentair RS-485';
      case 'modbus_tcp':
        return 'Modbus TCP';
      case 'modbus_bridge':
        return 'Modbus bridge';
      case 'mqtt':
        return 'MQTT';
      case 'https':
        return 'HTTPS';
      case 'nextcentury':
        return 'NextCentury';
      case 'opta_remote':
        return 'Opta remote';
      case 'mqtt_parc':
        return 'MQTT Parc ST';
      case 'mock':
        return 'Simulator';
      case 'serial':
        return 'Serial';
      case 'native_so':
        return 'Native';
      case 'hal':
        return 'HAL I/O';
      case 'bacnet':
        return 'BACnet/IP';
      default:
        return type;
    }
  }

  function driverAddressInputValue(t) {
    const a = t.driverAddress;
    if (a == null || a === '') return '';
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }

  function normalizeModbusAddr(a, t) {
    if (a && typeof a === 'object' && a.table != null) {
      const out = {
        table: String(a.table).toLowerCase(),
        address: Number.isFinite(Number(a.address)) ? Number(a.address) : 0,
      };
      if (a.slaveId != null && Number.isFinite(Number(a.slaveId))) out.slaveId = Number(a.slaveId);
      return out;
    }
    if (typeof a === 'number' && Number.isFinite(a)) {
      return { table: 'holding', address: a };
    }
    const role = t?.role || 'memory';
    const type = t?.type || 'BOOL';
    let table = 'holding';
    if (type === 'BOOL') table = role === 'output' ? 'coil' : 'discrete';
    else if (role === 'input') table = 'input';
    return { table, address: 0 };
  }

  function modbusAddrEditHtml(t) {
    const a = normalizeModbusAddr(t.driverAddress, t);
    const tblOpts = MODBUS_TABLES.map((tb) =>
      `<option value="${tb}" ${a.table === tb ? 'selected' : ''}>${tb}</option>`
    ).join('');
    const slaveVal = a.slaveId != null ? a.slaveId : (tagModbusSlaveId(t) ?? '');
    return `<div class="tag-modbus-addr" data-addr-mode="modbus">
      <select data-mb-table class="tag-mb-table" title="Modbus table">${tblOpts}</select>
      <label class="tag-mb-lbl">Addr <input type="number" data-mb-address class="tag-mb-address" min="0" max="65535" value="${a.address}"></label>
      <label class="tag-mb-lbl">Slave <input type="number" data-mb-slave class="tag-mb-slave" min="1" max="247" value="${slaveVal}" placeholder="1"></label>
    </div>`;
  }

  function formatAddr(t) {
    if (t.type === 'PID' && window.StPidEditor) return window.StPidEditor.formatPidWire(t);
    const drvType = tagDriverType(t);
    if (/^modbus/.test(drvType)) return formatModbusTagAddr(t);
    if (drvType === 'mqtt') return formatMqttTagAddr(t);
    if (drvType === 'https') return formatHttpsTagAddr(t);
    if (drvType === 'nextcentury') return formatNextcenturyTagAddr(t);
    if (drvType === 'bacnet') return formatBacnetTagAddr(t);
    if (drvType === 'hal') {
      const a = t.driverAddress;
      if (a?.pin) return a.field ? `${a.pin}.${a.field}` : String(a.pin);
      if (a?.kind != null) return `${a.kind}[${a.index}]`;
    }
    const a = t.driverAddress;
    if (a == null || a === '') return '—';
    if (typeof a === 'object') {
      if (a.channel != null) return `ch ${a.channel}`;
      if (a.topic != null) return formatMqttTagAddr(t);
      return JSON.stringify(a);
    }
    return String(a);
  }

  function mqttPayloadTemplateEditHtml(value) {
    const v = value || 'bool';
    const known = MQTT_PAYLOAD_TEMPLATES.includes(v);
    const base = MQTT_PAYLOAD_TEMPLATES.map((t) =>
      `<option value="${esc(t)}" ${t === v && known ? 'selected' : ''}>${esc(t)}</option>`
    ).join('');
    const custom = `<option value="__custom__" ${!known && v ? 'selected' : ''}>Custom…</option>`;
    return `<select data-mqtt-template class="tag-mqtt-template">${base}${custom}</select>
      <input type="text" data-mqtt-template-custom class="tag-mqtt-template-custom" placeholder="e.g. json:value" value="${esc(!known ? v : '')}" style="display:${!known && v ? '' : 'none'}">`;
  }

  function tagAddrEditHtml(t) {
    if (t.type === 'PID' && window.StPidEditor) return window.StPidEditor.pidWireEditHtml(t, tags);
    const drvType = tagDriverType(t);
    if (drvType === 'mqtt') return remotePayloadAddrEditHtml(t, 'topic', 'MQTT topic');
    if (drvType === 'https') return remotePayloadAddrEditHtml(t, 'url', 'URL or path (e.g. /api/value)');
    if (drvType === 'nextcentury') return nextcenturyAddrEditHtml(t);
    if (drvType === 'bacnet') return bacnetAddrEditHtml(t);
    if (/^modbus/.test(tagDriverType(t))) return modbusAddrEditHtml(t);
    const val = driverAddressInputValue(t);
    if (val.length > 36 || val.includes('{')) {
      return `<textarea data-f="driverAddress" class="tag-addr-json" rows="2" placeholder="Address or JSON">${esc(val)}</textarea>`;
    }
    return `<input data-f="driverAddress" class="tag-addr-input" placeholder="Address or JSON" value="${esc(val)}">`;
  }

  function syncMqttTemplateCustom(tr) {
    const sel = tr.querySelector('[data-mqtt-template]');
    const custom = tr.querySelector('[data-mqtt-template-custom]');
    if (!sel || !custom) return;
    const show = sel.value === '__custom__';
    custom.style.display = show ? '' : 'none';
    if (!show) custom.value = '';
  }

  function readModbusAddrFromRow(tr, i) {
    const wrap = tr.querySelector('[data-addr-mode="modbus"]');
    if (!wrap) return false;
    const table = wrap.querySelector('[data-mb-table]')?.value || 'holding';
    const address = parseInt(wrap.querySelector('[data-mb-address]')?.value, 10);
    const slaveRaw = wrap.querySelector('[data-mb-slave]')?.value;
    const slaveId = slaveRaw !== '' && slaveRaw != null ? parseInt(slaveRaw, 10) : null;
    tags[i].driverAddress = {
      table,
      address: Number.isFinite(address) ? Math.max(0, address) : 0,
    };
    if (Number.isFinite(slaveId) && slaveId >= 1) tags[i].driverAddress.slaveId = slaveId;
    return true;
  }

  function readNextcenturyAddrFromRow(tr, i) {
    const wrap = tr.querySelector('[data-addr-mode="nextcentury"]');
    if (!wrap) return false;
    const deviceId = wrap.querySelector('[data-nc-device]')?.value?.trim() || '';
    const field = wrap.querySelector('[data-nc-field]')?.value?.trim() || 'totalUsage';
    tags[i].driverAddress = { deviceId, field };
    return true;
  }

  function readBacnetAddrFromRow(tr, i) {
    const wrap = tr.querySelector('[data-addr-mode="bacnet"]');
    if (!wrap) return false;
    const host = wrap.querySelector('[data-bac-host]')?.value?.trim() || '';
    const deviceInstanceRaw = wrap.querySelector('[data-bac-device]')?.value;
    const objectType = wrap.querySelector('[data-bac-otype]')?.value?.trim() || 'analogInput';
    const objectInstance = parseInt(wrap.querySelector('[data-bac-oinst]')?.value, 10);
    const property = wrap.querySelector('[data-bac-prop]')?.value?.trim() || 'presentValue';
    const addr = {
      host,
      objectType,
      objectInstance: Number.isFinite(objectInstance) ? Math.max(0, objectInstance) : 0,
      property,
    };
    const devInst = deviceInstanceRaw !== '' && deviceInstanceRaw != null
      ? parseInt(deviceInstanceRaw, 10)
      : null;
    if (Number.isFinite(devInst)) addr.deviceInstance = devInst;
    tags[i].driverAddress = host || devInst != null ? addr : null;
    return true;
  }

  function readTagAddrFromRow(tr, i) {
    const pvSel = tr.querySelector('select[data-f="pidPvId"]');
    const spSel = tr.querySelector('select[data-f="pidSpId"]');
    const cvSel = tr.querySelector('select[data-f="pidOutId"]');
    if (pvSel || spSel || cvSel) {
      if (window.StPidEditor) window.StPidEditor.readPidWireFromRow(tr, tags[i]);
      else {
        tags[i].fb = {
          ...(tags[i].fb || {}),
          pvId: pvSel?.value?.trim() || '',
          spId: spSel?.value?.trim() || '',
          outId: cvSel?.value?.trim() || '',
        };
      }
      return;
    }
    if (readModbusAddrFromRow(tr, i)) return;
    if (readNextcenturyAddrFromRow(tr, i)) return;
    if (readBacnetAddrFromRow(tr, i)) return;
    const pathInp = tr.querySelector('[data-remote-path]');
    if (pathInp) {
      const path = pathInp.value.trim();
      const pathKey = tr.querySelector('[data-addr-mode="remote"]')?.dataset?.remoteKey || 'topic';
      const sel = tr.querySelector('[data-mqtt-template]');
      const customInp = tr.querySelector('[data-mqtt-template-custom]');
      let payloadTemplate = 'bool';
      if (sel?.value === '__custom__') {
        payloadTemplate = customInp?.value.trim() || 'bool';
      } else {
        payloadTemplate = sel?.value || 'bool';
      }
      tags[i].driverAddress = path ? { [pathKey]: path, payloadTemplate } : null;
      return;
    }
    const inp = tr.querySelector('[data-f="driverAddress"]');
    if (!inp) return;
    const raw = inp.value.trim();
    if (!raw) tags[i].driverAddress = null;
    else {
      try { tags[i].driverAddress = JSON.parse(raw); }
      catch { tags[i].driverAddress = isNaN(+raw) ? raw : +raw; }
    }
  }

  function refreshTagAddrEditCell(tr, rowIndex) {
    const td = tr.querySelector('.cell-addr-edit');
    if (!td) return;
    readTagDriverFromRow(tr, rowIndex);
    readTagAddrFromRow(tr, rowIndex);
    td.innerHTML = tagAddrEditHtml(tags[rowIndex]);
    const tplSel = td.querySelector('[data-mqtt-template]');
    if (tplSel) {
      tplSel.addEventListener('change', () => syncMqttTemplateCustom(tr));
      syncMqttTemplateCustom(tr);
    }
  }

  function driverUsesSerial(type) {
    return type === 'modbus_rtu' || type === 'vgreen_epc' || type === 'pentair_rs485' || type === 'modbus_bridge' || type === 'serial';
  }

  function driverEditApplyHint(type) {
    switch (type) {
      case 'modbus_rtu':
      case 'vgreen_epc':
      case 'pentair_rs485':
        return 'Set <strong>COM port</strong> and device address, then <strong>Apply &amp; save</strong>. Use <strong>Other…</strong> if your port is not listed.';
      case 'modbus_tcp':
        return 'Set <strong>host</strong>, TCP port, and slave ID, then <strong>Apply &amp; save</strong>.';
      case 'modbus_bridge':
        return 'Set RTU <strong>COM port</strong> and listen TCP port, then <strong>Apply &amp; save</strong>.';
      case 'serial':
        return 'Set USB/serial port and baud, then <strong>Apply &amp; save</strong>.';
      case 'nextcentury':
        return 'Use <strong>Drivers → NextCentury API</strong> for credentials, or set email/password here. Tags auto-sync on poll when enabled.';
      case 'mqtt':
        return 'Set broker URL and client ID, then <strong>Apply &amp; save</strong>.';
      case 'mqtt_parc':
        return 'Set <strong>device ID</strong> (must match Opta MQTT id — firmware sets <code>opta_&lt;ATECC608 serial&gt;</code> automatically), then <strong>Apply &amp; save</strong>. Use <strong>Sync tags from device</strong> on the driver card after telemetry arrives.';
      case 'https':
        return 'Set base URL and poll interval, then <strong>Apply &amp; save</strong>.';
      case 'opta_remote':
        return 'Set Opta <strong>host</strong> and port, then <strong>Apply &amp; save</strong>. Link via <strong>Program → Remote</strong>.';
      case 'hal':
        return 'Set plugin path, stack, and I2C bus, then <strong>Apply &amp; save</strong>.';
      case 'bacnet':
        return 'Set bind interface (optional), UDP port, and poll interval. Use <strong>Discover devices</strong> then <strong>Browse objects</strong> to import tags. Enable <strong>Allow writes</strong> only when setpoints should flow to the BMS.';
      default:
        return 'Adjust settings above, then <strong>Apply &amp; save</strong>.';
    }
  }

  function stripDriverFieldsForType(d) {
    const t = d.type || 'mock';
    if (t !== 'modbus_rtu' && t !== 'vgreen_epc' && t !== 'pentair_rs485' && t !== 'modbus_bridge') delete d.serialPort;
    if (t !== 'modbus_rtu' && t !== 'vgreen_epc' && t !== 'pentair_rs485' && t !== 'modbus_tcp' && t !== 'modbus_bridge') {
      delete d.slaveId;
    }
    if (t !== 'pentair_rs485') {
      delete d.deviceAddr;
      delete d.deviceClass;
      delete d.frameDelayMs;
    }
    if (t !== 'modbus_rtu' && t !== 'vgreen_epc' && t !== 'pentair_rs485' && t !== 'modbus_bridge' && t !== 'serial') delete d.baud;
    if (t !== 'modbus_rtu' && t !== 'vgreen_epc' && t !== 'pentair_rs485') {
      delete d.parity;
      delete d.stopBits;
    }
    if (t !== 'modbus_rtu' && t !== 'vgreen_epc' && t !== 'pentair_rs485' && t !== 'modbus_tcp' && t !== 'https' && t !== 'nextcentury' && t !== 'bacnet') {
      delete d.pollIntervalMs;
    }
    if (t !== 'serial') {
      delete d.profile;
    }
    if (t !== 'serial' && t !== 'bacnet' && t !== 'modbus_tcp' && t !== 'opta_remote' && t !== 'modbus_bridge') {
      delete d.port;
    }
    if (t !== 'modbus_tcp' && t !== 'opta_remote' && t !== 'mqtt_parc') delete d.host;
    if (t !== 'modbus_bridge') delete d.listenPort;
    if (t !== 'nextcentury') {
      delete d.email;
      delete d.password;
      delete d.reportId;
      delete d.propertyIds;
      delete d.autoSyncTags;
    }
    if (t !== 'mqtt_parc' && t !== 'opta_remote') {
      delete d.deviceId;
      delete d.scanMs;
      delete d.reportIntervalSec;
    }
    if (t !== 'bacnet') {
      delete d.interface;
      delete d.bindInterface;
      delete d.broadcastAddress;
      delete d.apduTimeout;
      delete d.defaultHost;
      delete d.writeEnabled;
      delete d.writePriority;
      delete d.discoverTimeoutMs;
    }
    return d;
  }

  function driverHealthText(id) {
    const h = driverHealthMap[id];
    const drv = drivers.find((d) => d.id === id);
    if (!h) return '—';
    const dot = h.connected ? 'ok' : 'off';
    let pillLabel = h.connected ? 'OK' : 'Off';
    if (!h.connected && drv?.type === 'mqtt_parc') pillLabel = 'Not linked';
    let detail = (h.message || '').trim();
    if (h.connected) {
      const type = drv?.type || h.type;
      if (type === 'nextcentury') {
        detail = detail && detail !== 'OK' ? detail : 'API';
      } else if (type === 'mqtt' || type === 'mqtt_parc') {
        detail = detail && detail !== 'OK' ? detail : 'MQTT';
      } else if (type === 'bacnet') {
        detail = detail && detail !== 'OK' ? detail : `UDP ${drv?.port || 47808}`;
      } else if (type === 'https') {
        detail = detail && detail !== 'OK' ? detail : 'HTTPS';
      } else if (driverUsesSerial(type) || type === 'modbus_tcp') {
        const active = (h.activePort || h.serialPort || '').trim();
        const configured = (h.configuredPort || drv?.serialPort || drv?.port || '').trim();
        if (h.portFallback && configured && configured.toUpperCase() !== active.toUpperCase()) {
          detail = `on ${active} (saved ${configured})`;
        } else if (type === 'modbus_tcp') {
          detail = `${drv?.host || 'host'}:${drv?.port || 502}`;
        } else {
          detail = active || configured || 'connected';
        }
      } else {
        detail = detail && detail !== 'OK' ? detail : 'connected';
      }
    }
    return `<span class="health-pill ${dot}">${esc(pillLabel)}</span> <span class="muted">${esc(detail)}</span>`;
  }

  function updateOptaDeviceModeHint() {
    const el = $('proj-opta-device-mode');
    if (!el) return;
    const remoteOn = $('proj-remote-execution')?.checked === true;
    const optaDrv = drivers.find((d) => d.type === 'mqtt_parc' && d.enabled !== false);
    if (!optaDrv) {
      el.textContent = '';
      el.className = 'panel-hint cell-mono span-all';
      return;
    }
    const h = driverHealthMap[optaDrv.id];
    const pcLine = remoteOn
      ? 'PC Remote ST ON → Opta should be Standalone (ST on device)'
      : 'PC Remote ST OFF → Opta should be Remote I/O (PC runs ST; Opta I/O only)';
    if (!h?.optaModeLabel) {
      el.textContent = `${optaDrv.deviceId || optaDrv.id}: waiting for Opta telemetry (mode set on Opta /setup → Device mode)`;
      el.className = 'panel-hint cell-mono span-all';
      return;
    }
    if (h.optaModeAligned === false) {
      el.innerHTML = `<strong class="setup-opta-mode-warn">${esc(h.optaModeHint || 'Mode mismatch')}</strong><br>${esc(pcLine)} · Opta reports <strong>${esc(h.optaModeLabel)}</strong>`;
      el.className = 'panel-hint cell-mono span-all';
      return;
    }
    el.textContent = `${pcLine} · Opta: ${h.optaModeLabel} ✓`;
    el.className = 'panel-hint cell-mono span-all';
  }

  function driverConnectionSummary(d) {
    switch (d.type) {
      case 'modbus_rtu':
      case 'vgreen_epc':
      case 'pentair_rs485': {
        const slaves = slavesForDriver(d.id);
        const addr = d.deviceAddr ?? d.slaveId ?? (d.type === 'pentair_rs485' ? 0x70 : (d.type === 'vgreen_epc' ? 21 : 1));
        const slaveTxt = slaves.length
          ? `addrs ${slaves.join(', ')}`
          : `addr ${addr}`;
        const pollTxt = Number(d.pollIntervalMs) > 0 ? ` · poll ${d.pollIntervalMs} ms` : '';
        return `${d.serialPort || '—'} · ${d.baud || (d.type === 'vgreen_epc' ? 19200 : 9600)} baud · ${slaveTxt}${pollTxt}`;
      }
      case 'modbus_tcp': {
        const slaves = slavesForDriver(d.id);
        const slaveTxt = slaves.length
          ? `slaves ${slaves.join(', ')}`
          : `slave ${d.slaveId ?? 1}`;
        return `${d.host || '127.0.0.1'}:${d.port || 502} · ${slaveTxt}`;
      }
      case 'serial':
        return `${d.port || '—'} · ${d.baud || 115200} baud${d.profile ? ` · ${d.profile}` : ''}`;
      case 'modbus_bridge':
        return `RTU ${d.serialPort || '—'} → TCP :${d.listenPort || 5020}`;
      case 'mqtt':
        return d.brokerUrl || d.broker || 'MQTT broker';
      case 'https':
        return d.baseUrl || d.url || 'HTTPS base URL';
      case 'nextcentury': {
        const pollMin = Math.round((Number(d.pollIntervalMs) || 900000) / 60000);
        const acct = d.email ? ` · ${d.email}` : '';
        const props = Array.isArray(d.propertyIds) && d.propertyIds.length
          ? ` · props ${d.propertyIds.join(', ')}`
          : '';
        return `NextCentury API${acct} · report ${d.reportId || 'rt_4510'} · every ${pollMin} min${props}`;
      }
      case 'opta_remote':
        return `${d.host || '192.168.1.234'}:${d.port || 80} · HTTP (link via Program)`;
      case 'mqtt_parc': {
        const posNote = d.id && d.deviceId && d.id !== d.deviceId ? `position ${d.id} · ` : '';
        const nameNote = d.name ? `${d.name} · ` : '';
        const h = driverHealthMap[d.id];
        const modeNote = h?.optaModeLabel ? ` · Opta ${h.optaModeLabel}` : '';
        return `${nameNote}${posNote}device ${d.deviceId || '—'}${d.ateccSerial ? ` · SN ${d.ateccSerial}` : ''}${modeNote} · Parc MQTT`;
      }
      case 'native_so':
        return d.library || 'native .so';
      case 'hal': {
        const hc = d.halConfig || {};
        const stack = hc.stack != null ? hc.stack : null;
        const bus = hc.i2cBus != null ? hc.i2cBus : null;
        const i2cNote = stack != null || bus != null
          ? ` · stack ${stack ?? 0} · i2c-${bus ?? 1}`
          : '';
        return `HAL ${d.backend || 'sim'}${d.pluginPath ? ` · ${d.pluginPath}` : ''}${i2cNote}`;
      }
      case 'bacnet': {
        const pollTxt = Number(d.pollIntervalMs) > 0 ? ` · poll ${d.pollIntervalMs} ms` : '';
        const iface = d.interface || d.bindInterface || 'auto';
        const writeTxt = d.writeEnabled ? ' · writes ON' : '';
        const defHost = d.defaultHost ? ` · default ${d.defaultHost}` : '';
        return `BACnet/IP UDP ${d.port || 47808} · ${iface}${defHost}${pollTxt}${writeTxt}`;
      }
      default:
        return 'mock / simulation';
    }
  }

  function tagsForDriver(driverId) {
    return tags.filter((t) => t.driverId === driverId);
  }

  function defaultSerialPort() {
    const portA = serialPorts.find((p) => p.path === '/dev/ttyLP6');
    if (portA) return portA.path;
    const rs485 = serialPorts.find((p) => /PORT A/i.test(p.label || ''));
    if (rs485) return rs485.path;
    return serialPorts[0]?.path || 'COM3';
  }

  function defaultHwConnection() {
    return {
      serialPort: defaultSerialPort(),
      baud: 9600,
      slaveId: 1,
    };
  }

  function portSelectHtml(value, allowCustom) {
    const v = String(value || '').trim();
    const ports = serialPorts.length ? serialPorts : [{ path: 'COM3', label: 'COM3', usb: false }];
    const known = ports.some((p) => p.path === v);
    const useCustom = allowCustom && v && !known;
    const opts = ports
      .map((p) => `<option value="${esc(p.path)}" ${p.path === v ? 'selected' : ''}>${esc(p.label)}${p.usb ? ' [USB]' : ''}</option>`)
      .join('');
    const customOpt = allowCustom
      ? `<option value="__custom__" ${useCustom ? 'selected' : ''}>Other…</option>`
      : '';
    const customInp = allowCustom
      ? `<input type="text" data-port-custom class="port-custom-input" placeholder="e.g. COM12" value="${esc(useCustom ? v : '')}" style="display:${useCustom ? '' : 'none'}">`
      : '';
    return `<span class="port-select-wrap"><select data-port-select>${opts}${customOpt}</select>${customInp}</span>`;
  }

  function readPortFromRoot(root) {
    const portSel = root?.querySelector?.('[data-port-select]');
    if (!portSel) return '';
    if (portSel.value === '__custom__') {
      return portSel.closest('.port-select-wrap')?.querySelector('[data-port-custom]')?.value.trim() || '';
    }
    return portSel.value;
  }

  function bindPortSelectInRoot(root) {
    const sel = root?.querySelector?.('[data-port-select]');
    if (!sel || sel._portBound) return;
    sel._portBound = true;
    const custom = root.querySelector('[data-port-custom]');
    const sync = () => {
      const show = sel.value === '__custom__';
      if (custom) custom.style.display = show ? '' : 'none';
    };
    sel.addEventListener('change', sync);
    sync();
  }

  function driverSelectHtml(value, allowCustom = true) {
    const v = String(value || '').trim();
    const known = new Set((drivers || []).map((d) => d.id));
    const none = `<option value="" ${!v ? 'selected' : ''}>— none</option>`;
    const opts = (drivers || []).map((d) => {
      const off = d.enabled === false ? ' [off]' : '';
      const label = `${d.id} (${d.type || 'driver'})${off}`;
      return `<option value="${esc(d.id)}" ${d.id === v ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    const custom = allowCustom
      ? `<option value="__custom__" ${v && !known.has(v) ? 'selected' : ''}>Other…</option>`
      : '';
    return `<select data-driver-select class="driver-select">${none}${opts}${custom}</select>`;
  }

  function tagDriverEditHtml(t) {
    const v = String(t.driverId || '').trim();
    const known = new Set((drivers || []).map((d) => d.id));
    const isCustom = v && !known.has(v);
    return `${driverSelectHtml(v, true)}
      <input type="text" data-driver-custom class="driver-id-custom" value="${esc(isCustom ? v : '')}" placeholder="Driver id" style="display:${isCustom ? '' : 'none'}">`;
  }

  function syncTagDriverCustom(tr) {
    const sel = tr.querySelector('[data-driver-select]');
    const custom = tr.querySelector('[data-driver-custom]');
    if (!sel || !custom) return;
    const show = sel.value === '__custom__';
    custom.style.display = show ? '' : 'none';
    if (!show) custom.value = '';
  }

  function readTagDriverFromRow(tr, i) {
    const sel = tr.querySelector('[data-driver-select]');
    if (!sel) return;
    const v = sel.value;
    if (v === '__custom__') {
      const custom = tr.querySelector('[data-driver-custom]');
      const id = custom?.value.trim() || '';
      tags[i].driverId = id || null;
    } else {
      tags[i].driverId = v || null;
    }
  }

  const TAGS_LAYOUT_KEY = 'peaklogic-tags-layout';
  const TAGS_MIN_W = 720;
  const TAGS_MIN_H = 360;
  const TAGS_DEFAULT_W = 1480;
  const TAGS_DEFAULT_H = 720;

  const LIVE_IO_LAYOUT_KEY = 'peaklogic-live-io-layout';
  const LIVE_IO_MIN_W = 280;
  const LIVE_IO_MIN_H = 200;
  const LIVE_IO_DEFAULT_W = 420;
  let liveIoDrag = null;
  let liveIoResize = null;
  let programFloater = null;
  let tagsFloater = null;
  let historianFloater = null;
  let historianConfigFloater = null;
  let historianLoggerFloater = null;
  let alarmsFloater = null;
  let reportFloater = null;
  const ALARMS_LAYOUT_KEY = 'peaklogic-alarms-layout';
  const ALARMS_MIN_W = 480;
  const ALARMS_MIN_H = 280;
  const ALARMS_DEFAULT_W = 720;
  const ALARMS_DEFAULT_H = 420;
  const REPORT_LAYOUT_KEY = 'peaklogic-report-layout';
  const REPORT_MIN_W = 560;
  const REPORT_MIN_H = 360;
  const REPORT_DEFAULT_W = 1150;
  const REPORT_DEFAULT_H = 720;
  const HISTORIAN_LAYOUT_KEY = 'peaklogic-historian-layout';
  const HISTORIAN_CONFIG_LAYOUT_KEY = 'peaklogic-historian-config-layout';
  const HISTORIAN_CONFIG_MIN_W = 640;
  const HISTORIAN_CONFIG_MIN_H = 400;
  const HISTORIAN_CONFIG_DEFAULT_W = 960;
  const HISTORIAN_CONFIG_DEFAULT_H = 560;
  const HISTORIAN_LOGGER_LAYOUT_KEY = 'peaklogic-historian-logger-layout';
  const HISTORIAN_LOGGER_MIN_W = 640;
  const HISTORIAN_LOGGER_MIN_H = 480;
  const HISTORIAN_LOGGER_DEFAULT_W = 920;
  const HISTORIAN_LOGGER_DEFAULT_H = 680;
  const HISTORIAN_MIN_W = 480;
  const HISTORIAN_MIN_H = 360;
  const HISTORIAN_DEFAULT_W = 1160;
  const HISTORIAN_DEFAULT_H = 520;
  let tagsTableTagSig = '';
  let tagsForceEditing = false;

  function initFloaters() {
    if (!window.MvFloater) return;
    if (!programFloater) programFloater = MvFloater.create({
      chromeId: 'program-chrome',
      popupName: 'program',
      layoutKey: 'peaklogic-program-layout',
      minW: 480,
      minH: 320,
      defaultW: 960,
      defaultH: 620,
      defaultLeft: 12,
      defaultTop: 52,
      shellStubClass: 'program-shell-stub',
      sizedClass: 'program-sized',
      onOpen() {
        setTabActive('program', true);
        window.PeaklogicProgram?.updateProgramRemoteUi?.(lastDashboardData);
        setTimeout(() => $('program-src')?.dispatchEvent(new Event('focus')), 0);
      },
      onClose() {
        setTabActive('program', false);
      },
    });
    if (!tagsFloater) tagsFloater = MvFloater.create({
      chromeId: 'tags-chrome',
      popupName: 'tags',
      layoutKey: TAGS_LAYOUT_KEY,
      minW: TAGS_MIN_W,
      minH: TAGS_MIN_H,
      defaultW: TAGS_DEFAULT_W,
      defaultH: TAGS_DEFAULT_H,
      defaultLeft: 24,
      defaultTop: 52,
      shellStubClass: 'tags-shell-stub',
      sizedClass: 'tags-sized',
      migrateLayout(layout) {
        if (!layout || typeof layout !== 'object') return layout;
        if (layout.left == null || layout.top == null) {
          return {
            left: 24,
            top: 52,
            width: Number(layout.width) || TAGS_DEFAULT_W,
            height: Number(layout.height) || TAGS_DEFAULT_H,
          };
        }
        return layout;
      },
      onOpen() {
        setTabActive('tags', true);
        if (!editingTags) renderTags();
      },
      onClose() {
        setTabActive('tags', false);
      },
    });
    if (!historianFloater) historianFloater = MvFloater.create({
      chromeId: 'historian-chrome',
      popupName: 'historian',
      layoutKey: HISTORIAN_LAYOUT_KEY,
      minW: HISTORIAN_MIN_W,
      minH: HISTORIAN_MIN_H,
      defaultW: HISTORIAN_DEFAULT_W,
      defaultH: HISTORIAN_DEFAULT_H,
      defaultLeft: 48,
      defaultTop: 56,
      shellStubClass: 'historian-shell-stub',
      sizedClass: 'historian-sized',
      migrateLayout(layout) {
        if (!layout || typeof layout !== 'object') return layout;
        if (layout.left == null || layout.top == null) {
          return {
            left: 48,
            top: 56,
            width: Number(layout.width) || HISTORIAN_DEFAULT_W,
            height: Number(layout.height) || HISTORIAN_DEFAULT_H,
          };
        }
        return layout;
      },
      onOpen() {
        setTabActive('historian', true);
        if (!historianUseCustom) syncHistorianPresetDates();
        syncHistorianCanvasSize();
        drawHistorianPopups();
        renderHistorianPdmAssetManager();
        refreshAll().catch(console.error);
      },
      onClose() {
        historianHoverState = null;
        setTabActive('historian', false);
      },
    });
    if (!historianConfigFloater) historianConfigFloater = MvFloater.create({
      chromeId: 'historian-config-chrome',
      popupName: 'historian-setup',
      layoutKey: HISTORIAN_CONFIG_LAYOUT_KEY,
      minW: HISTORIAN_CONFIG_MIN_W,
      minH: HISTORIAN_CONFIG_MIN_H,
      defaultW: HISTORIAN_CONFIG_DEFAULT_W,
      defaultH: HISTORIAN_CONFIG_DEFAULT_H,
      defaultLeft: 72,
      defaultTop: 64,
      shellStubClass: 'historian-config-shell-stub',
      sizedClass: 'historian-config-sized',
      onOpen() {
        fillHistorianSetupPopup().catch(console.error);
      },
    });
    if (!historianLoggerFloater) historianLoggerFloater = MvFloater.create({
      chromeId: 'historian-logger-chrome',
      popupName: 'historian-logger',
      layoutKey: HISTORIAN_LOGGER_LAYOUT_KEY,
      minW: HISTORIAN_LOGGER_MIN_W,
      minH: HISTORIAN_LOGGER_MIN_H,
      defaultW: HISTORIAN_LOGGER_DEFAULT_W,
      defaultH: HISTORIAN_LOGGER_DEFAULT_H,
      defaultLeft: 88,
      defaultTop: 72,
      shellStubClass: 'historian-logger-shell-stub',
      sizedClass: 'historian-logger-sized',
      onOpen() {
        fillHistorianLoggerPopup().catch(console.error);
      },
    });
    if (!alarmsFloater) alarmsFloater = MvFloater.create({
      chromeId: 'alarms-chrome',
      popupName: 'alarms',
      layoutKey: ALARMS_LAYOUT_KEY,
      minW: ALARMS_MIN_W,
      minH: ALARMS_MIN_H,
      defaultW: ALARMS_DEFAULT_W,
      defaultH: ALARMS_DEFAULT_H,
      defaultLeft: 96,
      defaultTop: 72,
      shellStubClass: 'alarms-shell-stub',
      sizedClass: 'alarms-sized',
      onOpen() {
        setTabActive('alarms', true);
        renderAlarmsPanel();
        refreshAll().catch(console.error);
      },
      onClose() {
        setTabActive('alarms', false);
      },
    });
    if (!reportFloater) reportFloater = MvFloater.create({
      chromeId: 'report-chrome',
      popupName: 'report',
      layoutKey: REPORT_LAYOUT_KEY,
      minW: REPORT_MIN_W,
      minH: REPORT_MIN_H,
      defaultW: REPORT_DEFAULT_W,
      defaultH: REPORT_DEFAULT_H,
      defaultLeft: 32,
      defaultTop: 56,
      shellStubClass: 'report-shell-stub',
      sizedClass: 'report-sized',
      onOpen() {
        setTabActive('report', true);
        refreshAll()
          .then(() => refreshPdmAssetLists())
          .catch(console.error);
        fillReportConfigForm(reportConfig);
        fillHistorianReportPanel();
        loadMongoReportBuilder().catch(console.error);
        refreshReportMongoLogs().catch(console.error);
        fillRoiSettingsFields(lastSettings?.roi);
        refreshRoiCalculatorDisplay();
        bindRoiCalculatorInputs();
        restartDashboardPoll();
      },
      onClose() {
        setTabActive('report', false);
        restartDashboardPoll();
      },
    });
  }

  function initWindowStack() {
    if (!window.MvWindowStack) return;
    [
      'program-chrome',
      'tags-chrome',
      'historian-chrome',
      'historian-config-chrome',
      'historian-logger-chrome',
      'alarms-chrome',
      'report-chrome',
      'live-io-chrome',
      'hmi-setup-chrome',
    ].forEach((id) => {
      const el = $(id);
      if (el) MvWindowStack.register(el);
    });
    document.querySelectorAll('.app-popup[data-popup]').forEach((pop) => {
      if (pop.classList.contains('program-shell-stub')
        || pop.classList.contains('tags-shell-stub')
        || pop.classList.contains('historian-shell-stub')
        || pop.classList.contains('historian-config-shell-stub')
        || pop.classList.contains('historian-logger-shell-stub')
        || pop.classList.contains('alarms-shell-stub')
        || pop.classList.contains('report-shell-stub')
        || pop.classList.contains('live-io-shell-stub')
        || pop.classList.contains('hmi-setup-shell-stub')) return;
      MvWindowStack.register(pop);
    });
  }

  function syncHistorianCanvasSize() {
    const canvas = $('graph-canvas');
    const host = canvas?.closest('.historian-floater-chart');
    if (!canvas || !host) return;
    const w = Math.max(240, host.clientWidth);
    const h = Math.max(140, host.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function bindHistorianCanvasResize() {
    const chrome = $('historian-chrome');
    const host = chrome?.querySelector('.historian-floater-chart');
    if (!host || host.dataset.resizeObs === '1') return;
    host.dataset.resizeObs = '1';
    const ro = new ResizeObserver(() => {
      if (!historianFloater?.isOpen()) return;
      syncHistorianCanvasSize();
      drawHistorianPopups();
    });
    ro.observe(host);
    bindHistorianChartHover();
  }

  function graphLegendRow(pen, valuesHtml) {
    return `
      <div class="graph-legend-row">
        <span class="graph-legend-swatch" style="background:${esc(pen.color || '#2563eb')}"></span>
        <div class="graph-legend-body">
          <div class="graph-legend-tag">${esc(pen.tagId)}</div>
          <div class="graph-legend-values">${valuesHtml}</div>
        </div>
      </div>`;
  }

  function renderGraphPenLegend(hover = historianHoverState) {
    const el = $('graph-pen-legend');
    if (!el) return;
    const pens = getHistorianDisplayPens().filter((p) => p.tagId);
    if (!pens.length) {
      el.innerHTML = '<p class="graph-legend-hint muted">No pens configured — Historian → Pen config…</p>';
      return;
    }
    const emptyVal = '<span class="graph-legend-val is-empty">—</span>';
    if (!hover?.samples?.length) {
      const rows = pens.map((pen) => graphLegendRow(pen, emptyVal)).join('');
      el.innerHTML = `
        <p class="graph-legend-hint muted">Hover the chart to read pen values at a point in time.</p>
        <div class="graph-legend-grid">${rows}</div>`;
      return;
    }
    const tr = GraphDraw.timeRange(getHistorianDisplayHistory(), pens, historianChartOpts());
    const timeLabel = GraphDraw.formatAxisTime(hover.time, tr?.span);
    const byTag = new Map(hover.samples.map((s) => [s.pen.tagId, s]));
    const rows = pens.map((pen) => {
      const s = byTag.get(pen.tagId);
      if (!s) return graphLegendRow(pen, emptyVal);
      const scaled = Number.isFinite(s.scaled) ? s.scaled.toFixed(3) : '—';
      const raw = Number.isFinite(Number(s.raw)) ? Number(s.raw).toFixed(3) : '—';
      return graphLegendRow(
        pen,
        `<span class="graph-legend-val">${esc(scaled)}</span><span class="graph-legend-raw">raw ${esc(raw)}</span>`,
      );
    }).join('');
    el.innerHTML = `
      <div class="graph-legend-time">${esc(timeLabel)}</div>
      <div class="graph-legend-grid">${rows}</div>`;
  }

  function bindHistorianChartHover() {
    const canvas = $('graph-canvas');
    if (!canvas || canvas.dataset.hoverBound === '1') return;
    canvas.dataset.hoverBound = '1';
    let raf = 0;
    const onMove = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!historianFloater?.isOpen()) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const my = (e.clientY - rect.top) * (canvas.height / rect.height);
        const hist = getHistorianDisplayHistory();
        const pens = getHistorianDisplayPens();
        const opts = historianChartOpts();
        const hover = GraphDraw.getHoverAtCanvasPos(canvas, hist, pens, opts, mx, my);
        const prevT = historianHoverState?.time;
        historianHoverState = hover;
        if ((hover?.time ?? null) !== (prevT ?? null)) {
          renderGraphPenLegend(hover);
          GraphDraw.draw(canvas, hist, pens, { ...opts, hover });
        }
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      historianHoverState = null;
      renderGraphPenLegend(null);
      if (historianFloater?.isOpen()) {
        GraphDraw.draw(canvas, getHistorianDisplayHistory(), getHistorianDisplayPens(), historianChartOpts());
      }
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
  }

  function liveIoChrome() {
    return $('live-io-chrome');
  }

  function liveIoShell() {
    return document.querySelector('[data-popup="live-io"]');
  }

  function mountLiveIoPanelToBody() {
    const chrome = liveIoChrome();
    if (!chrome || chrome.dataset.mvFloater === '1') return;
    document.body.appendChild(chrome);
    chrome.dataset.mvFloater = '1';
    const shell = liveIoShell();
    if (shell) shell.classList.add('view-hidden', 'live-io-shell-stub');
  }

  function isLiveIoOpen() {
    const chrome = liveIoChrome();
    return chrome && !chrome.classList.contains('view-hidden');
  }

  function liveIoPointerXY(e) {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function isLiveIoPrimaryButton(e) {
    return e.button === undefined || e.button === 0;
  }

  function clampLiveIoSize(width, height) {
    return {
      width: Math.max(LIVE_IO_MIN_W, Math.min(window.innerWidth - 16, width)),
      height: Math.max(LIVE_IO_MIN_H, Math.min(window.innerHeight - 48, height)),
    };
  }

  function clampLiveIoPos(left, top, width, height) {
    const pad = 8;
    const maxL = Math.max(pad, window.innerWidth - width - pad);
    const maxT = Math.max(48, window.innerHeight - height - pad);
    return {
      left: Math.min(Math.max(pad, left), maxL),
      top: Math.min(Math.max(48, top), maxT),
    };
  }

  function applyLiveIoLayout(layout) {
    const chrome = liveIoChrome();
    if (!chrome || !layout) return;
    const size = clampLiveIoSize(
      Number(layout.width) || LIVE_IO_DEFAULT_W,
      Number(layout.height) || 360
    );
    const pos = clampLiveIoPos(Number(layout.left) || 12, Number(layout.top) || 64, size.width, size.height);
    chrome.style.width = `${size.width}px`;
    chrome.style.height = `${size.height}px`;
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
    chrome.style.right = 'auto';
    chrome.classList.add('live-io-sized');
  }

  function currentLiveIoLayout() {
    const chrome = liveIoChrome();
    if (!chrome) return null;
    const rect = chrome.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function clampLiveIoOnResize() {
    if (!isLiveIoOpen()) return;
    const layout = currentLiveIoLayout();
    if (layout) applyLiveIoLayout(layout);
  }

  function readLiveIoLayout() {
    try {
      const raw = sessionStorage.getItem(LIVE_IO_LAYOUT_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { left: 12, top: 64, width: LIVE_IO_DEFAULT_W, height: 360 };
  }

  function saveLiveIoLayout() {
    const chrome = liveIoChrome();
    if (!chrome || chrome.classList.contains('view-hidden')) return;
    const rect = chrome.getBoundingClientRect();
    try {
      sessionStorage.setItem(LIVE_IO_LAYOUT_KEY, JSON.stringify({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }));
    } catch { /* ignore */ }
  }

  function liveIoDragMove(e) {
    if (!liveIoDrag) return;
    const chrome = liveIoChrome();
    if (!chrome) return;
    const { x, y } = liveIoPointerXY(e);
    const dx = x - liveIoDrag.sx;
    const dy = y - liveIoDrag.sy;
    const pos = clampLiveIoPos(liveIoDrag.ox + dx, liveIoDrag.oy + dy, liveIoDrag.width, liveIoDrag.height);
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
    chrome.style.right = 'auto';
    if (e.cancelable) e.preventDefault();
  }

  function liveIoDragEnd() {
    if (!liveIoDrag) return;
    const chrome = liveIoChrome();
    liveIoDrag = null;
    chrome?.querySelector('[data-live-io-drag-handle]')?.classList.remove('hmi-dragging');
    chrome?.querySelector('.popup-header')?.classList.remove('popup-dragging');
    document.removeEventListener('mousemove', liveIoDragMove, true);
    document.removeEventListener('mouseup', liveIoDragEnd, true);
    document.removeEventListener('touchmove', liveIoDragMove, { capture: true });
    document.removeEventListener('touchend', liveIoDragEnd, true);
    document.removeEventListener('touchcancel', liveIoDragEnd, true);
    saveLiveIoLayout();
  }

  function liveIoResizeMove(e) {
    if (!liveIoResize) return;
    const chrome = liveIoChrome();
    if (!chrome) return;
    const { x, y } = liveIoPointerXY(e);
    const dx = x - liveIoResize.sx;
    const dy = y - liveIoResize.sy;
    const dir = liveIoResize.dir;
    let width = liveIoResize.width;
    let height = liveIoResize.height;
    let left = liveIoResize.left;
    const top = liveIoResize.top;
    if (dir.includes('e')) width = liveIoResize.width + dx;
    if (dir.includes('w')) width = liveIoResize.width - dx;
    if (dir.includes('s')) height = liveIoResize.height + dy;
    const size = clampLiveIoSize(width, height);
    if (dir.includes('w')) left = liveIoResize.left + (liveIoResize.width - size.width);
    const pos = clampLiveIoPos(left, top, size.width, size.height);
    chrome.style.width = `${size.width}px`;
    chrome.style.height = `${size.height}px`;
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
    chrome.style.right = 'auto';
    chrome.classList.add('live-io-sized');
    if (e.cancelable) e.preventDefault();
  }

  function liveIoResizeEnd() {
    if (!liveIoResize) return;
    const chrome = liveIoChrome();
    liveIoResize = null;
    chrome?.classList.remove('popup-resizing');
    document.removeEventListener('mousemove', liveIoResizeMove, true);
    document.removeEventListener('mouseup', liveIoResizeEnd, true);
    document.removeEventListener('touchmove', liveIoResizeMove, { capture: true });
    document.removeEventListener('touchend', liveIoResizeEnd, true);
    document.removeEventListener('touchcancel', liveIoResizeEnd, true);
    saveLiveIoLayout();
  }

  function onLiveIoResizeStart(e, handleEl) {
    const chrome = liveIoChrome();
    const handle = handleEl || e.currentTarget;
    if (!chrome || !handle?.dataset?.resize || liveIoDrag || liveIoResize || !isLiveIoOpen()) return false;
    if (!isLiveIoPrimaryButton(e)) return false;
    window.MvWindowStack?.bringToFront(chrome);
    const rect = chrome.getBoundingClientRect();
    applyLiveIoLayout({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height || 360,
    });
    const { x, y } = liveIoPointerXY(e);
    liveIoResize = {
      dir: handle.dataset.resize || 'se',
      sx: x,
      sy: y,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    chrome.classList.add('popup-resizing');
    document.addEventListener('mousemove', liveIoResizeMove, true);
    document.addEventListener('mouseup', liveIoResizeEnd, true);
    document.addEventListener('touchmove', liveIoResizeMove, { capture: true, passive: false });
    document.addEventListener('touchend', liveIoResizeEnd, true);
    document.addEventListener('touchcancel', liveIoResizeEnd, true);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function onLiveIoDragStart(e) {
    const chrome = liveIoChrome();
    if (!chrome || liveIoDrag || liveIoResize || !isLiveIoOpen()) return false;
    if (!isLiveIoPrimaryButton(e)) return false;
    window.MvWindowStack?.bringToFront(chrome);
    if (e.target?.closest?.('button, a, input, select, textarea, label')) return false;
    const rect = chrome.getBoundingClientRect();
    applyLiveIoLayout({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height || 360,
    });
    const { x, y } = liveIoPointerXY(e);
    liveIoDrag = {
      sx: x,
      sy: y,
      ox: rect.left,
      oy: rect.top,
      width: rect.width,
      height: rect.height,
    };
    chrome.querySelector('[data-live-io-drag-handle]')?.classList.add('hmi-dragging');
    chrome.querySelector('.popup-header')?.classList.add('popup-dragging');
    document.addEventListener('mousemove', liveIoDragMove, true);
    document.addEventListener('mouseup', liveIoDragEnd, true);
    document.addEventListener('touchmove', liveIoDragMove, { capture: true, passive: false });
    document.addEventListener('touchend', liveIoDragEnd, true);
    document.addEventListener('touchcancel', liveIoDragEnd, true);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function openLiveIoWindow() {
    mountLiveIoPanelToBody();
    const chrome = liveIoChrome();
    if (!chrome) return;
    applyLiveIoLayout(readLiveIoLayout());
    chrome.classList.remove('view-hidden');
    window.MvWindowStack?.onOpen(chrome);
    window.PeaklogicProgram?.renderProgramIoPanel(lastLive, lastRuntime);
  }

  function closeLiveIoWindow() {
    const chrome = liveIoChrome();
    if (!chrome) return;
    saveLiveIoLayout();
    chrome.classList.add('view-hidden');
  }

  function bindLiveIoPanel() {
    mountLiveIoPanelToBody();
    const chrome = liveIoChrome();
    if (!chrome || chrome.dataset.liveIoBound === '1') return;
    chrome.dataset.liveIoBound = '1';
    chrome.querySelector('[data-live-io-drag-handle]')?.addEventListener('mousedown', onLiveIoDragStart);
    chrome.querySelector('[data-live-io-drag-handle]')?.addEventListener('touchstart', onLiveIoDragStart, { passive: false });
    chrome.querySelector('.popup-header')?.addEventListener('mousedown', onLiveIoDragStart);
    chrome.querySelector('.popup-header')?.addEventListener('touchstart', onLiveIoDragStart, { passive: false });
    chrome.querySelectorAll('[data-resize]').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => onLiveIoResizeStart(e, handle));
      handle.addEventListener('touchstart', (e) => onLiveIoResizeStart(e, handle), { passive: false });
    });
    $('btn-tags-live-io')?.addEventListener('click', () => togglePopup('live-io'));
  }

  function isPopupOpen(name) {
    if (name === 'hmi-setup') {
      return !!window.PeaklogicHmi?.isHmiSetupOpen?.();
    }
    if (name === 'live-io') {
      return isLiveIoOpen();
    }
    if (name === 'program') {
      return !!programFloater?.isOpen();
    }
    if (name === 'tags') {
      return !!tagsFloater?.isOpen();
    }
    if (name === 'alarms') {
      return !!alarmsFloater?.isOpen();
    }
    if (name === 'historian') {
      return !!historianFloater?.isOpen();
    }
    if (name === 'historian-setup') {
      return !!historianConfigFloater?.isOpen();
    }
    if (name === 'historian-logger') {
      return !!historianLoggerFloater?.isOpen();
    }
    if (name === 'report') {
      return !!reportFloater?.isOpen();
    }
    const el = document.querySelector(`[data-popup="${name}"]`);
    return el && !el.classList.contains('view-hidden');
  }

  function setTabActive(name, on) {
    document.querySelectorAll(`[data-popup-open="${name}"]`).forEach((b) => {
      b.classList.toggle('active', on);
    });
  }


  function isSetupTab(tab) {
    return isPopupOpen('project') && setupActiveTab === tab;
  }

  const ALF_MAX_POOLS = 4;
  const ALF_MAX_FILTER_PUMPS = 2;
  const ALF_MAX_SITE_PUMPS = 8;
  const ALF_DEFAULT_POOLS = [{
    id: 'therapy',
    tagPrefix: 'POOL',
    name: 'Therapy Pool',
    sanitizer: 'orp',
    waterType: 'fresh',
    filterPumpCount: 1,
    bodyKind: 'pool',
    sharedWaterWith: '',
    circulationHoursPerDay: 7,
  }];
  const ALF_BODY_KIND = { POOL: 'pool', SPA: 'spa', WATER_FEATURE: 'water_feature' };
  const ALF_CIRC_HRS_BY_KIND = { pool: 7, spa: 0.5, water_feature: 1 };

  function normalizeAlfFilterPumpCount(raw, fallback = 1) {
    const n = Number(raw ?? fallback);
    if (!Number.isFinite(n)) return 1;
    return Math.min(ALF_MAX_FILTER_PUMPS, Math.max(1, Math.trunc(n)));
  }

  function normalizeAlfCirculationHours(raw, fallback = 7) {
    const n = Number(raw ?? fallback);
    if (!Number.isFinite(n)) return fallback;
    const clamped = Math.min(24, Math.max(0.25, n));
    return Math.round(clamped * 4) / 4;
  }

  function normalizeAlfBodyKind(raw, sharedWaterWith = '') {
    const kind = String(raw || '').trim().toLowerCase();
    if (kind === ALF_BODY_KIND.SPA || kind === ALF_BODY_KIND.WATER_FEATURE) return kind;
    if (kind === ALF_BODY_KIND.POOL) return ALF_BODY_KIND.POOL;
    if (sharedWaterWith) return ALF_BODY_KIND.SPA;
    return ALF_BODY_KIND.POOL;
  }

  function alfMainPoolPeerIds(pools, excludeIndex) {
    return pools
      .filter((p, i) => i !== excludeIndex && p.bodyKind === ALF_BODY_KIND.POOL)
      .map((p) => p.id);
  }

  function finalizeAlfPoolRelationships(pools) {
    return pools.map((pool, index) => {
      const bodyKind = normalizeAlfBodyKind(pool.bodyKind, pool.sharedWaterWith);
      const circDefault = ALF_CIRC_HRS_BY_KIND[bodyKind] ?? 7;
      if (bodyKind === ALF_BODY_KIND.POOL) {
        return {
          ...pool,
          bodyKind,
          sharedWaterWith: '',
          circulationHoursPerDay: normalizeAlfCirculationHours(pool.circulationHoursPerDay, circDefault),
        };
      }
      const mainIds = alfMainPoolPeerIds(pools, index);
      let sharedWaterWith = normalizeAlfSharedWaterWith(pool.sharedWaterWith, pool.id, mainIds);
      if (!sharedWaterWith && mainIds.length) sharedWaterWith = mainIds[0];
      return {
        ...pool,
        bodyKind,
        sharedWaterWith,
        circulationHoursPerDay: normalizeAlfCirculationHours(pool.circulationHoursPerDay, circDefault),
      };
    });
  }

  function normalizeAlfSharedWaterWith(raw, poolId, peerIds = []) {
    const id = String(raw || '').trim();
    if (!id || id === poolId) return '';
    return peerIds.includes(id) ? id : '';
  }

  function normalizeAlfPoolEntry(raw, index = 0, prevPool, peerIds = []) {
    const fallback = ALF_DEFAULT_POOLS[0];
    const src = raw && typeof raw === 'object' ? raw : {};
    const id = String(src.id || fallback.id || `pool${index + 1}`).trim() || `pool${index + 1}`;
    const name = String(src.name || fallback.name || `Pool ${index + 1}`).trim() || `Pool ${index + 1}`;
    const tagPrefix = String(src.tagPrefix || fallback.tagPrefix || id).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') || 'POOL';
    const sanitizer = String(src.sanitizer || fallback.sanitizer).toLowerCase() === 'cl2' ? 'cl2' : 'orp';
    const waterType = String(src.waterType || fallback.waterType).toLowerCase() === 'salt' ? 'salt' : 'fresh';
    const filterPumpCount = normalizeAlfFilterPumpCount(
      prevPool?.filterPumpCount ?? src.filterPumpCount ?? fallback.filterPumpCount,
      1,
    );
    const bodyKind = normalizeAlfBodyKind(
      prevPool?.bodyKind ?? src.bodyKind,
      prevPool?.sharedWaterWith ?? src.sharedWaterWith ?? fallback.sharedWaterWith,
    );
    const circDefault = ALF_CIRC_HRS_BY_KIND[bodyKind] ?? 7;
    const sharedWaterWith = bodyKind === ALF_BODY_KIND.POOL
      ? ''
      : normalizeAlfSharedWaterWith(
        prevPool?.sharedWaterWith ?? src.sharedWaterWith ?? fallback.sharedWaterWith,
        id,
        peerIds,
      );
    const circulationHoursPerDay = normalizeAlfCirculationHours(
      prevPool?.circulationHoursPerDay ?? src.circulationHoursPerDay ?? fallback.circulationHoursPerDay,
      circDefault,
    );
    return {
      id, tagPrefix, name, sanitizer, waterType, filterPumpCount, bodyKind, sharedWaterWith, circulationHoursPerDay,
    };
  }

  function normalizeAlfPools(raw, prev) {
    const base = Array.isArray(prev) && prev.length ? prev : ALF_DEFAULT_POOLS;
    if (!Array.isArray(raw)) {
      const draft = base.map((p, i) => normalizeAlfPoolEntry(p, i, base[i]));
      const ids = draft.map((p) => p.id);
      const merged = draft.map((p, i) => normalizeAlfPoolEntry(
        {
          ...base[i],
          ...p,
          bodyKind: base[i]?.bodyKind ?? p.bodyKind,
          sharedWaterWith: base[i]?.sharedWaterWith ?? p.sharedWaterWith,
        },
        i,
        base[i],
        ids.filter((pid) => pid !== p.id),
      ));
      return finalizeAlfPoolRelationships(merged);
    }
    const slice = raw.slice(0, ALF_MAX_POOLS);
    const draft = slice.map((p, i) => normalizeAlfPoolEntry(p, i, prev?.[i] ?? base[i]));
    const ids = draft.map((p) => p.id);
    const merged = draft.length
      ? draft.map((p, i) => normalizeAlfPoolEntry(
        {
          ...slice[i],
          ...p,
          bodyKind: slice[i]?.bodyKind ?? p.bodyKind,
          sharedWaterWith: slice[i]?.sharedWaterWith ?? p.sharedWaterWith,
        },
        i,
        prev?.[i] ?? base[i],
        ids.filter((pid) => pid !== p.id),
      ))
      : ALF_DEFAULT_POOLS.map((p, i) => normalizeAlfPoolEntry(p, i, p));
    return finalizeAlfPoolRelationships(merged);
  }

  function alfSiteFilterPumpTotal(pools) {
    return normalizeAlfPools(pools).reduce((sum, p) => sum + p.filterPumpCount, 0);
  }

  function updateAlfSitePumpTotalHint(pools) {
    const el = $('proj-alf-site-pump-total');
    if (!el) return;
    const total = alfSiteFilterPumpTotal(pools);
    el.textContent = `Site filter pumps: ${total} / ${ALF_MAX_SITE_PUMPS}`;
    el.classList.toggle('warn', total > ALF_MAX_SITE_PUMPS);
  }

  function alfPoolsFromForm() {
    const host = $('proj-alf-pools-list');
    if (!host) return null;
    const rows = [...host.querySelectorAll('.proj-alf-pool-row')];
    const draft = rows.map((row, i) => normalizeAlfPoolEntry({
      id: row.querySelector('[data-alf-pool-id]')?.value,
      tagPrefix: row.querySelector('[data-alf-pool-prefix]')?.value,
      name: row.querySelector('[data-alf-pool-name]')?.value,
      sanitizer: row.querySelector('[data-alf-pool-san-cl2]')?.checked ? 'cl2' : 'orp',
      waterType: row.querySelector('[data-alf-pool-water-salt]')?.checked ? 'salt' : 'fresh',
      filterPumpCount: row.querySelector('[data-alf-pool-fp-cnt]')?.value,
      bodyKind: row.querySelector('[data-alf-pool-body-kind]')?.value,
      sharedWaterWith: row.querySelector('[data-alf-pool-shared-water]')?.value,
      circulationHoursPerDay: row.querySelector('[data-alf-pool-circ-hrs]')?.value,
    }, i, (lastSettings?.assistedLiving?.pools || [])[i]));
    const ids = draft.map((p) => p.id);
    return draft.map((p, i) => normalizeAlfPoolEntry(
      p,
      i,
      (lastSettings?.assistedLiving?.pools || [])[i],
      ids.filter((pid) => pid !== p.id),
    ));
  }

  function alfPoolRowHtml(pool, index, allPools) {
    const list = normalizeAlfPools(allPools, allPools);
    const peerIds = list.filter((_, j) => j !== index).map((o) => o.id);
    const p = normalizeAlfPoolEntry(list[index] || pool, index, list[index] || pool, peerIds);
    const finalized = finalizeAlfPoolRelationships(list)[index] || p;
    const screenHint = index === 0 ? 'Screen 5' : `Screen ${23 + index - 1}`;
    const schedHint = `Screen ${50 + index} — weekly schedules`;
    const mainPoolOpts = list
      .filter((o, j) => j !== index && o.bodyKind === ALF_BODY_KIND.POOL)
      .map((o) => `<option value="${esc(o.id)}"${finalized.sharedWaterWith === o.id ? ' selected' : ''}>${esc(o.name)} (${esc(o.id)})</option>`)
      .join('');
    const sharedPlumbing = finalized.bodyKind !== ALF_BODY_KIND.POOL;
    const circLabel = finalized.bodyKind === ALF_BODY_KIND.SPA
      ? 'Daily circulation (hours) — spa flow rate'
      : finalized.bodyKind === ALF_BODY_KIND.WATER_FEATURE
        ? 'Daily circulation (hours) — water feature flow rate'
        : 'Daily circulation (hours) — main pool flow rate';
    return `<div class="proj-alf-pool-row logging-block" data-pool-index="${index}">
      <div class="form-grid compact">
        <label>Name
          <input type="text" data-alf-pool-name value="${esc(finalized.name)}" maxlength="48">
        </label>
        <label>Tag prefix
          <input type="text" data-alf-pool-prefix value="${esc(finalized.tagPrefix)}" maxlength="16" class="cell-mono">
        </label>
        <label>Body id
          <input type="text" data-alf-pool-id value="${esc(finalized.id)}" maxlength="24" class="cell-mono">
        </label>
        <label>Body type
          <select data-alf-pool-body-kind>
            <option value="pool"${finalized.bodyKind === ALF_BODY_KIND.POOL ? ' selected' : ''}>Main pool (independent)</option>
            <option value="spa"${finalized.bodyKind === ALF_BODY_KIND.SPA ? ' selected' : ''}>Spa (shared plumbing, own flow rate)</option>
            <option value="water_feature"${finalized.bodyKind === ALF_BODY_KIND.WATER_FEATURE ? ' selected' : ''}>Water feature (shared plumbing, own flow rate)</option>
          </select>
        </label>
        <label class="${sharedPlumbing ? '' : 'view-hidden'}">Shares plumbing with
          <select data-alf-pool-shared-water${sharedPlumbing ? '' : ' disabled'}>
            ${mainPoolOpts || '<option value="">— add a main pool first —</option>'}
          </select>
        </label>
        <label>Filter pumps
          <select data-alf-pool-fp-cnt>
            <option value="1"${finalized.filterPumpCount === 1 ? ' selected' : ''}>1 pump</option>
            <option value="2"${finalized.filterPumpCount === 2 ? ' selected' : ''}>2 pumps</option>
          </select>
        </label>
        <label>${esc(circLabel)}
          <input type="number" data-alf-pool-circ-hrs min="0.25" max="24" step="0.25" value="${finalized.circulationHoursPerDay}">
        </label>
        <label class="span-all muted">${esc(screenHint)} · ${esc(schedHint)} · pool ~6–8 h/day · spa ~0.5 h/day · water feature set as needed</label>
        <fieldset class="span-all">
          <legend>Sanitizer probe</legend>
          <label class="checkbox-inline"><input type="radio" name="alf-pool-san-${index}" data-alf-pool-san-orp ${finalized.sanitizer !== 'cl2' ? 'checked' : ''}> ORP (mV)</label>
          <label class="checkbox-inline"><input type="radio" name="alf-pool-san-${index}" data-alf-pool-san-cl2 ${finalized.sanitizer === 'cl2' ? 'checked' : ''}> CL2 (ppm)</label>
        </fieldset>
        <fieldset class="span-all">
          <legend>Water type</legend>
          <label class="checkbox-inline"><input type="radio" name="alf-pool-water-${index}" data-alf-pool-water-fresh ${finalized.waterType !== 'salt' ? 'checked' : ''}> Fresh (CL2 + acid pumps)</label>
          <label class="checkbox-inline"><input type="radio" name="alf-pool-water-${index}" data-alf-pool-water-salt ${finalized.waterType === 'salt' ? 'checked' : ''}> Salt (conductivity + electro-chlorinator + acid)</label>
        </fieldset>
      </div>
      <div class="toolbar wrap">
        <button type="button" class="btn btn-sm btn-danger" data-alf-pool-remove ${index === 0 ? 'disabled' : ''}>Remove</button>
      </div>
    </div>`;
  }

  function renderAlfPoolsList(pools) {
    const host = $('proj-alf-pools-list');
    const addBtn = $('btn-proj-alf-pool-add');
    if (!host) return;
    const list = normalizeAlfPools(pools, pools);
    host.innerHTML = list.map((p, i) => alfPoolRowHtml(p, i, list)).join('');
    if (addBtn) addBtn.disabled = list.length >= ALF_MAX_POOLS;
    updateAlfSitePumpTotalHint(list);
    host.querySelectorAll('[data-alf-pool-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = alfPoolsFromForm() || list;
        const idx = Number(btn.closest('.proj-alf-pool-row')?.dataset.poolIndex);
        if (!Number.isFinite(idx) || idx <= 0) return;
        renderAlfPoolsList(cur.filter((_, i) => i !== idx));
        schedulePersistAssistedLiving({ skipWorkspace: true });
      });
    });
    host.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.matches('[data-alf-pool-fp-cnt]')) {
          const cur = alfPoolsFromForm() || list;
          if (alfSiteFilterPumpTotal(cur) > ALF_MAX_SITE_PUMPS) {
            alert(`Site-wide limit is ${ALF_MAX_SITE_PUMPS} filter pumps. Reduce pump count on another body.`);
            renderAlfPoolsList(lastSettings?.assistedLiving?.pools || list);
            return;
          }
        }
        if (el.matches('[data-alf-pool-body-kind], [data-alf-pool-id]')) {
          const cur = alfPoolsFromForm() || list;
          renderAlfPoolsList(cur);
          schedulePersistAssistedLiving({ skipWorkspace: true });
          updateAlfSitePumpTotalHint(alfPoolsFromForm() || list);
          return;
        }
        schedulePersistAssistedLiving({ skipWorkspace: true });
        updateAlfSitePumpTotalHint(alfPoolsFromForm() || list);
      });
    });
  }

  function buildAssistedLivingPayloadFromForm(prev = lastSettings || {}) {
    return {
      ...(prev.assistedLiving || {}),
      mechWhGas: $('proj-alf-mech-wh-gas')?.checked === true,
      pools: normalizeAlfPools(alfPoolsFromForm(), prev.assistedLiving?.pools),
    };
  }

  let alfPersistTimer = null;

  async function persistAssistedLivingFromForm(opts = {}) {
    const prev = lastSettings || {};
    const assistedLiving = buildAssistedLivingPayloadFromForm(prev);
    const res = await api.putSettings({ assistedLiving });
    applySettingsResponse(res);
    if (res?.settings?.assistedLiving) {
      lastSettings = { ...lastSettings, assistedLiving: res.settings.assistedLiving };
    } else {
      lastSettings = { ...lastSettings, assistedLiving };
    }
    if (!opts.skipWorkspace) {
      await persistCurrentProjectSnapshot();
    }
  }

  function schedulePersistAssistedLiving(opts = {}) {
    if (alfPersistTimer) clearTimeout(alfPersistTimer);
    alfPersistTimer = setTimeout(() => {
      alfPersistTimer = null;
      persistAssistedLivingFromForm(opts).catch((e) => alert(e.message));
    }, 250);
  }

  function buildSettingsPayloadFromSetupForm() {
    const prev = lastSettings || {};
    let hmiCfg = null;
    if (window.PeaklogicHmi) {
      const hmiDirty = window.PeaklogicHmi.isDirty?.();
      const hmiOpen = window.PeaklogicHmi.isHmiSetupOpen?.();
      if (hmiDirty || hmiOpen) {
        window.PeaklogicHmi.syncFromFieldsIfDirty();
        hmiCfg = window.PeaklogicHmi.getConfigForSave?.() || window.PeaklogicHmi.getConfig();
      } else {
        hmiCfg = prev.hmi || window.PeaklogicHmi.getConfig?.();
      }
      if (hmiCfg) {
        hmiCfg.activeScreen = window.PeaklogicHmi.readStartingScreenFromSetup?.()
          || hmiCfg.activeScreen
          || window.PeaklogicHmi.HOME_SCREEN_ID;
      }
    }
    const formName = isPopupOpen('project') ? $('proj-name')?.value?.trim() : '';
    const name = formName || projectName || 'untitled';
    const scanMs = +($('proj-scan-ms')?.value) || 100;
    const activeProgram = $('proj-active-program')?.value?.trim() || '';
    const next = {
      project: { ...(prev.project || {}), name },
      scanMs,
      timezone: $('proj-timezone')?.value
        || prev.timezone
        || window.PeaklogicTime?.DEFAULT_TIMEZONE
        || 'America/New_York',
      hmi: hmiCfg?.screens?.length ? hmiCfg : (prev.hmi || {}),
      activeProgram: activeProgram || null,
      startup: readStartupFields(),
      autoStartRuntime: $('proj-auto-start-runtime')?.checked === true,
      mqttParc: readMqttParcFields(),
      remoteExecution: !!$('proj-remote-execution')?.checked,
      optaAutoRunOnBoot: $('proj-opta-autorun')?.checked === true,
      cloudRemote: readCloudRemoteFields(),
      cloudSims: readCloudSimsFields(),
      cellularSims: readCellularSimsFields(),
      roi: readRoiFields(),
    };
    if (prev.graphPens?.length) next.graphPens = prev.graphPens;
    if (prev.reportConfig) next.reportConfig = prev.reportConfig;
    if (prev.pdm) next.pdm = prev.pdm;
    if (prev.cmmsIntegration) next.cmmsIntegration = prev.cmmsIntegration;
    if (prev.graphMaxPoints != null) next.graphMaxPoints = prev.graphMaxPoints;
    const startScreen = $('proj-hmi-home-screen')?.value?.trim();
    if (startScreen && next.hmi?.screens?.length) {
      next.hmi = { ...next.hmi, activeScreen: startScreen };
    }
    next.assistedLiving = buildAssistedLivingPayloadFromForm(prev);
    applyMongoLoggerToSettings(next);
    return next;
  }

  function setupSettingsFingerprint(st = {}) {
    return JSON.stringify({
      project: st.project || {},
      scanMs: st.scanMs ?? 100,
      timezone: st.timezone || window.PeaklogicTime?.DEFAULT_TIMEZONE || 'America/New_York',
      mongoLogger: st.mongoLogger || {},
      startup: st.startup || {},
      autoStartRuntime: st.autoStartRuntime === true,
      mqttParc: st.mqttParc || {},
      cloudRemote: st.cloudRemote || {},
      cloudSims: { enabled: st.cloudSims?.enabled === true },
      cellularSims: { enabled: st.cellularSims?.enabled === true },
      remoteExecution: st.remoteExecution === true,
      optaAutoRunOnBoot: st.optaAutoRunOnBoot === true,
      activeProgram: st.activeProgram || null,
      hmiActiveScreen: st.hmi?.activeScreen || null,
      roi: st.roi || {},
      assistedLiving: {
        mechWhGas: st.assistedLiving?.mechWhGas === true,
        pools: (st.assistedLiving?.pools || []).map((p) => ({
          id: p?.id,
          sanitizer: p?.sanitizer,
          waterType: p?.waterType,
          filterPumpCount: p?.filterPumpCount,
          bodyKind: p?.bodyKind,
          sharedWaterWith: p?.sharedWaterWith,
          circulationHoursPerDay: p?.circulationHoursPerDay,
        })),
      },
    });
  }

  function isSetupFormDirty() {
    if (setupDirty || mongoLoggerDirty) return true;
    if (!isPopupOpen('project')) return false;
    try {
      const next = buildSettingsPayloadFromSetupForm();
      return setupSettingsFingerprint(next) !== setupSettingsFingerprint(lastSettings || {});
    } catch {
      return setupDirty;
    }
  }

  async function persistCurrentProjectSnapshot(opts = {}) {
    const name = projectName || 'untitled';
    await api.saveWorkspace({ name });
    if (opts.includeSavedProject && activeSavedProjectId) {
      const r = await api.saveProject(name);
      activeSavedProjectId = r.id || activeSavedProjectId;
    }
  }

  async function persistSetupChanges(opts = {}) {
    const applyFn = window.applyProjectSettingsFromPopup;
    if (typeof applyFn !== 'function') {
      const next = buildSettingsPayloadFromSetupForm();
      projectName = next.project?.name || projectName || 'untitled';
      await api.putSettings(next);
      await persistCurrentProjectSnapshot();
    } else {
      await applyFn();
      await persistCurrentProjectSnapshot();
    }
    clearSetupDirty();
    window.PeaklogicHmi?.clearDirty?.();
    mongoLoggerDirty = false;
    if (!opts.quiet && $('proj-msg')) {
      $('proj-msg').textContent = 'Settings and workspace saved';
    }
  }

  function isHistorianSetupOpen() {
    return isPopupOpen('historian-setup');
  }

  function markSetupDirty() {
    setupDirty = true;
  }

  function clearSetupDirty() {
    setupDirty = false;
    graphPensDirty = false;
  }

  const SETUP_HELP_SECTIONS = {
    general: 'system-setup',
    features: 'system-setup',
    hardware: 'system-setup',
    logging: 'mongo-logging',
    pdm: 'pdm-predictive',
    roi: 'roi-calculator',
    projects: 'projects',
  };

  const DRIVERS_HELP_SECTIONS = {
    list: 'drivers',
    modbus: 'modbus',
    nextcentury: 'nextcentury',
  };

  function syncContextHelpButton(btn, sectionId) {
    if (!btn) return;
    const id = sectionId || 'start';
    btn.dataset.helpSection = id;
    const title = window.PeaklogicHelp?.sectionTitle?.(id) || 'Help';
    btn.title = `Help: ${title}`;
  }

  function openContextHelp(sectionId) {
    const help = window.PeaklogicHelp;
    const id = help?.SECTION_IDS?.has(sectionId) ? sectionId : 'start';
    openPopup('help');
    requestAnimationFrame(() => help?.scrollToSection?.(id));
  }

  function bindContextHelp() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-help-section]');
      if (!btn || btn.closest('[data-popup="help"]')) return;
      e.preventDefault();
      openContextHelp(btn.dataset.helpSection);
    });
  }

  function showSetupTab(tab) {
    setupActiveTab = tab || 'general';
    document.querySelectorAll('[data-setup-tab]').forEach((el) => {
      el.classList.toggle('view-hidden', el.dataset.setupTab !== setupActiveTab);
    });
    document.querySelectorAll('[data-setup-tab-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.setupTabBtn === setupActiveTab);
    });
    if (setupActiveTab === 'features') {
      refreshAuthUsersMatrix().catch(console.error);
    }
    syncContextHelpButton($('btn-setup-context-help'), SETUP_HELP_SECTIONS[setupActiveTab] || 'system-setup');
  }

  function fillSetupHmiSummary() {
    const cfg = window.PeaklogicHmi?.getConfig?.();
    const screens = cfg?.screens || lastSettings?.hmi?.screens || [];
    const bindings = cfg?.bindings || lastSettings?.hmi?.bindings || [];
    const countEl = $('setup-hmi-screen-count');
    const bindEl = $('setup-hmi-binding-count');
    const homeEl = $('setup-hmi-home-label');
    if (countEl) countEl.textContent = String(screens.length);
    if (bindEl) bindEl.textContent = String(bindings.length);
    window.PeaklogicHmi?.updateHomeScreenLabel?.();
    if (homeEl) {
      const sel = $('proj-hmi-home-screen');
      const opt = sel?.selectedOptions?.[0];
      homeEl.textContent = opt?.textContent || 'Screen 1 — Home';
    }
  }

  let historianLoggerOpenSection = null;
  let historianLoggerActiveTab = 'mongo';

  function showHistorianLoggerTab(tab) {
    const id = tab === 'pdm' ? 'pdm' : 'mongo';
    historianLoggerActiveTab = id;
    document.querySelectorAll('[data-hist-log-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.histLogTab === id);
    });
    document.querySelectorAll('[data-hist-log-panel]').forEach((panel) => {
      panel.classList.toggle('view-hidden', panel.dataset.histLogPanel !== id);
    });
    const titleEl = $('popup-historian-logger-title');
    if (titleEl) {
      titleEl.textContent = id === 'pdm' ? 'PdM setup & simulation' : 'Logger config';
    }
  }

  function openHistorianLogger(section) {
    historianLoggerOpenSection = section || null;
    openPopup('historian-logger');
  }

  function refreshHistorianLoggerPdmSection() {
    fillPdmSettingsFields(lastSettings?.pdm);
    refreshPdmAssetLists().catch(console.error);
    updatePdmBatchStatus().catch(console.error);
    renderHistorianPdmAssetManager();
  }

  function openProjectSetup(tab) {
    if (tab === 'historian') {
      openPopup('historian-setup');
      return;
    }
    if (tab === 'pdm') {
      openHistorianLogger('pdm');
      return;
    }
    if (tab === 'roi') {
      openReportPopup('roi');
      return;
    }
    openPopup('project');
    showSetupTab(tab || 'general');
  }

  let userProfiles = [];
  let selectedUserId = null;
  let userScopeCatalog = { sites: [], devices: [], assets: [] };

  function syncUserScopeModeUi() {
    const allMode = !!$('user-alarm-scope-all')?.checked;
    ['user-alarm-scope-sites', 'user-alarm-scope-devices', 'user-alarm-scope-assets'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = allMode;
    });
    const hint = $('user-alarm-scope-hint');
    if (hint) {
      hint.textContent = allMode
        ? 'Checked = all alarms. Uncheck to pick specific sites, devices, and/or assets below.'
        : 'Pick sites, devices, and/or assets below (Ctrl/Cmd+click). Notify when an alarm matches any selection.';
    }
  }

  function populateUserScopeSelects(catalog) {
    const sitesEl = $('user-alarm-scope-sites');
    const devicesEl = $('user-alarm-scope-devices');
    const assetsEl = $('user-alarm-scope-assets');
    if (!sitesEl || !devicesEl || !assetsEl) return;
    const sites = catalog?.sites || [];
    const devices = catalog?.devices || [];
    const assets = catalog?.assets || [];
    sitesEl.innerHTML = sites.length
      ? sites.map((s) => `<option value="${esc(s.siteId)}">${esc(s.name || s.siteId)}</option>`).join('')
      : '<option disabled>(no sites — set CMMS or Cloud site ID)</option>';
    devicesEl.innerHTML = devices.length
      ? devices.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.name || d.deviceId)}${d.siteId ? ` · ${esc(d.siteId)}` : ''}</option>`).join('')
      : '<option disabled>(no drivers/devices)</option>';
    assetsEl.innerHTML = assets.length
      ? assets.map((a) => `<option value="${esc(a.assetId)}">${esc(a.name || a.assetId)}${a.siteId ? ` · ${esc(a.siteId)}` : ''}</option>`).join('')
      : '<option disabled>(no PdM assets)</option>';
    bindMultiSelectListbox(sitesEl);
    bindMultiSelectListbox(devicesEl);
    bindMultiSelectListbox(assetsEl);
    syncUserScopeModeUi();
  }

  function setUserMultiSelectValues(el, values) {
    if (!el) return;
    const set = new Set((values || []).map(String));
    [...el.options].forEach((opt) => {
      opt.selected = set.has(opt.value);
    });
  }

  function readUserMultiSelectValues(el) {
    if (!el) return [];
    return [...el.selectedOptions].map((o) => o.value).filter(Boolean);
  }

  function fillUserScopeFields(scope) {
    const s = scope || {};
    if ($('user-alarm-scope-all')) $('user-alarm-scope-all').checked = s.mode !== 'scoped';
    setUserMultiSelectValues($('user-alarm-scope-sites'), s.siteIds);
    setUserMultiSelectValues($('user-alarm-scope-devices'), s.deviceIds);
    setUserMultiSelectValues($('user-alarm-scope-assets'), s.assetIds);
    syncUserScopeModeUi();
  }

  function readUserScopeFields() {
    const allMode = !!$('user-alarm-scope-all')?.checked;
    if (allMode) {
      return { mode: 'all', siteIds: [], deviceIds: [], assetIds: [] };
    }
    return {
      mode: 'scoped',
      siteIds: readUserMultiSelectValues($('user-alarm-scope-sites')),
      deviceIds: readUserMultiSelectValues($('user-alarm-scope-devices')),
      assetIds: readUserMultiSelectValues($('user-alarm-scope-assets')),
    };
  }

  async function loadUserScopeCatalog() {
    try {
      const data = await api.notificationScopeCatalog();
      userScopeCatalog = {
        sites: data.sites || [],
        devices: data.devices || [],
        assets: data.assets || [],
      };
    } catch {
      userScopeCatalog = { sites: [], devices: [], assets: [] };
    }
    populateUserScopeSelects(userScopeCatalog);
  }

  function userScopeSummary(n) {
    const scope = n?.notificationScope || {};
    if (scope.mode !== 'scoped') return 'all';
    const parts = [];
    if (scope.siteIds?.length) parts.push(`${scope.siteIds.length} site(s)`);
    if (scope.deviceIds?.length) parts.push(`${scope.deviceIds.length} device(s)`);
    if (scope.assetIds?.length) parts.push(`${scope.assetIds.length} asset(s)`);
    return parts.length ? parts.join(', ') : 'none';
  }

  function readUserEditor() {
    const p = {
      displayName: $('user-display-name')?.value || '',
      firstName: $('user-first-name')?.value || '',
      lastName: $('user-last-name')?.value || '',
      title: $('user-title')?.value || '',
      department: $('user-department')?.value || '',
      phone: $('user-phone')?.value || '',
      mobile: $('user-mobile')?.value || '',
      timezone: $('user-timezone')?.value || 'America/New_York',
      alarmNotifications: {
        enabled: !!$('user-alarm-enabled')?.checked,
        email: !!$('user-alarm-email')?.checked,
        sms: !!$('user-alarm-sms')?.checked,
        push: !!$('user-alarm-push')?.checked,
        minLevel: $('user-alarm-min-level')?.value || 'inner',
        emailAddress: $('user-alarm-email-addr')?.value || '',
        phone: $('user-alarm-phone')?.value || '',
        quietHours: {
          enabled: !!$('user-quiet-enabled')?.checked,
          start: ($('user-quiet-start')?.value || '22:00').slice(0, 5),
          end: ($('user-quiet-end')?.value || '07:00').slice(0, 5),
          timezone: $('user-timezone')?.value || 'America/New_York',
        },
        notificationScope: readUserScopeFields(),
      },
    };
    return {
      email: $('user-email')?.value || '',
      role: $('user-role')?.value || 'operator',
      profile: p,
    };
  }

  function fillUserEditor(user) {
    const p = user?.profile || {};
    const n = p.alarmNotifications || {};
    const q = n.quietHours || {};
    if ($('user-email')) $('user-email').value = user?.email || '';
    if ($('user-role')) $('user-role').value = user?.role || 'operator';
    if ($('user-display-name')) $('user-display-name').value = p.displayName || '';
    if ($('user-first-name')) $('user-first-name').value = p.firstName || '';
    if ($('user-last-name')) $('user-last-name').value = p.lastName || '';
    if ($('user-title')) $('user-title').value = p.title || '';
    if ($('user-department')) $('user-department').value = p.department || '';
    if ($('user-phone')) $('user-phone').value = p.phone || '';
    if ($('user-mobile')) $('user-mobile').value = p.mobile || '';
    if ($('user-timezone')) $('user-timezone').value = p.timezone || 'America/New_York';
    if ($('user-alarm-enabled')) $('user-alarm-enabled').checked = n.enabled !== false;
    if ($('user-alarm-email')) $('user-alarm-email').checked = n.email !== false;
    if ($('user-alarm-sms')) $('user-alarm-sms').checked = !!n.sms;
    if ($('user-alarm-push')) $('user-alarm-push').checked = !!n.push;
    if ($('user-alarm-min-level')) $('user-alarm-min-level').value = n.minLevel || 'inner';
    if ($('user-alarm-email-addr')) $('user-alarm-email-addr').value = n.emailAddress || '';
    if ($('user-alarm-phone')) $('user-alarm-phone').value = n.phone || '';
    if ($('user-quiet-enabled')) $('user-quiet-enabled').checked = !!q.enabled;
    if ($('user-quiet-start')) $('user-quiet-start').value = q.start || '22:00';
    if ($('user-quiet-end')) $('user-quiet-end').value = q.end || '07:00';
    fillUserScopeFields(n.notificationScope);
  }

  function renderUserProfilesTable() {
    const host = $('users-table-host');
    if (!host) return;
    if (!userProfiles.length) {
      host.innerHTML = '<p class="muted">No users yet.</p>';
      return;
    }
    const rows = userProfiles.map((u) => {
      const n = u.profile?.alarmNotifications || {};
      const ch = [n.email && 'email', n.sms && 'sms', n.push && 'push'].filter(Boolean).join(', ') || '—';
      return `<tr data-user-pick="${esc(u.id)}" class="${u.id === selectedUserId ? 'row-selected' : ''}">
        <td><strong>${esc(u.profile?.displayName || u.email)}</strong><br><span class="muted">${esc(u.email)}</span></td>
        <td>${esc(u.role)}</td>
        <td>${esc(n.minLevel || 'inner')}</td>
        <td>${esc(ch)}</td>
        <td>${esc(userScopeSummary(n))}</td>
        <td><button type="button" class="btn btn-sm" data-user-edit="${esc(u.id)}">Edit</button></td>
      </tr>`;
    }).join('');
    host.innerHTML = `<table class="data-table compact"><thead><tr><th>User</th><th>Role</th><th>Min level</th><th>Channels</th><th>Scope</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    host.querySelectorAll('[data-user-edit]').forEach((btn) => {
      btn.onclick = () => {
        selectedUserId = btn.dataset.userEdit;
        fillUserEditor(userProfiles.find((u) => u.id === selectedUserId));
        renderUserProfilesTable();
      };
    });
  }

  async function refreshUserProfiles() {
    await loadUserScopeCatalog();
    const data = await api.listUsers();
    userProfiles = data.users || [];
    if (!selectedUserId && userProfiles.length) selectedUserId = userProfiles[0].id;
    const cur = userProfiles.find((u) => u.id === selectedUserId);
    if (cur) fillUserEditor(cur);
    renderUserProfilesTable();
    fillCmmsIntegrationFields();
  }

  function fillCmmsIntegrationFields(st = lastSettings) {
    const c = st?.cmmsIntegration || {};
    if ($('cmms-enabled')) $('cmms-enabled').checked = !!c.enabled;
    if ($('cmms-broker-url')) $('cmms-broker-url').value = c.brokerUrl || 'mqtt://127.0.0.1:1883';
    if ($('cmms-site-id')) $('cmms-site-id').value = c.siteId || 'local';
    if ($('cmms-tenant-id')) $('cmms-tenant-id').value = c.tenantId || 'local';
    if ($('cmms-topic-prefix')) $('cmms-topic-prefix').value = c.topicPrefix || 'peaklogic/v1';
    if ($('cmms-client-id')) $('cmms-client-id').value = c.clientId || 'peaklogic-cmms';
    if ($('cmms-publish-alarms')) $('cmms-publish-alarms').checked = c.publishAlarmTopic !== false;
    if ($('cmms-publish-notify')) $('cmms-publish-notify').checked = c.publishNotifyTopic !== false;
  }

  function readCmmsIntegrationFields() {
    return {
      enabled: !!$('cmms-enabled')?.checked,
      brokerUrl: $('cmms-broker-url')?.value?.trim() || 'mqtt://127.0.0.1:1883',
      siteId: $('cmms-site-id')?.value?.trim() || 'local',
      tenantId: $('cmms-tenant-id')?.value?.trim() || 'local',
      topicPrefix: $('cmms-topic-prefix')?.value?.trim() || 'peaklogic/v1',
      clientId: $('cmms-client-id')?.value?.trim() || 'peaklogic-cmms',
      publishAlarmTopic: $('cmms-publish-alarms')?.checked !== false,
      publishNotifyTopic: $('cmms-publish-notify')?.checked !== false,
    };
  }

  function fillHistorianSetupPopup() {
    graphPensDirty = false;
    if (lastSettings?.graphPens?.length) graphPens = lastSettings.graphPens;
    const graphPts = lastSettings?.graphMaxPoints ?? 600;
    if ($('set-graph-pts')) $('set-graph-pts').value = graphPts;
    if ($('historian-setup-pen-count')) {
      $('historian-setup-pen-count').textContent = String((lastSettings?.graphPens || graphPens || []).length);
    }
    if ($('historian-setup-msg')) $('historian-setup-msg').textContent = '';
    return ensureTagsForGraph().then(() => renderGraphPensSetup());
  }

  function showDriversTab(tab) {
    driversActiveTab = tab || 'list';
    document.querySelectorAll('[data-drivers-tab]').forEach((el) => {
      el.classList.toggle('view-hidden', el.dataset.driversTab !== driversActiveTab);
    });
    document.querySelectorAll('[data-drivers-tab-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.driversTabBtn === driversActiveTab);
    });
    if (driversActiveTab === 'modbus') fillModbusPortSelect();
    if (driversActiveTab === 'nextcentury') fillNextcenturySetupForm();
    syncContextHelpButton($('btn-drivers-context-help'), DRIVERS_HELP_SECTIONS[driversActiveTab] || 'drivers');
  }

  function openPopup(name) {
    const el = document.querySelector(`[data-popup="${name}"]`);
    if (!el && name !== 'hmi-setup') return;
    if (name === 'help' && window.PeaklogicHelp) PeaklogicHelp.ensureRendered();
    if (name === 'hmi-setup') {
      window.PeaklogicHmi?.openSetupPopup();
      setTabActive(name, true);
      return;
    }
    if (name === 'live-io') {
      openLiveIoWindow();
      return;
    }
    if (name === 'program') {
      initFloaters();
      programFloater.bind();
      programFloater.open();
      return;
    }
    if (name === 'tags') {
      initFloaters();
      tagsFloater.bind();
      tagsFloater.open();
      return;
    }
    if (name === 'alarms') {
      initFloaters();
      alarmsFloater.bind();
      alarmsFloater.open();
      return;
    }
    if (name === 'historian') {
      initFloaters();
      historianFloater.bind();
      bindHistorianCanvasResize();
      historianFloater.open();
      refreshPdmAssetLists().catch(console.error);
      return;
    }
    if (name === 'historian-setup') {
      initFloaters();
      historianConfigFloater.bind();
      historianConfigFloater.open();
      return;
    }
    if (name === 'historian-logger') {
      initFloaters();
      historianLoggerFloater.bind();
      historianLoggerFloater.open();
      fillHistorianLoggerPopup().catch(console.error);
      updateHistorianLoggerMongoStatus().catch(console.error);
      if (historianLoggerOpenSection === 'pdm') {
        refreshHistorianLoggerPdmSection();
        showHistorianLoggerTab('pdm');
      } else {
        showHistorianLoggerTab(historianLoggerActiveTab || 'mongo');
      }
      historianLoggerOpenSection = null;
      return;
    }
    if (name === 'report') {
      initFloaters();
      reportFloater.bind();
      reportFloater.open();
      return;
    }
    el.classList.remove('view-hidden');
    window.MvWindowStack?.onOpen(el);
    setTabActive(name, true);
    if (name === 'alarm-notify') {
      refreshUserProfiles().catch(console.error);
    }
    if (name === 'drivers') {
      showDriversTab(driversActiveTab || 'list');
      if (!editingDrivers) renderDrivers();
      ensureDevicePresets().then(fillDevicePresetUi);
    }
    if (name === 'cameras') {
      window.PeaklogicCameras?.open?.();
    }
    if (name === 'training' && window.PeaklogicTraining) {
      PeaklogicTraining.ensureRendered();
    }
    if (name === 'historian') {
      historianHoverState = null;
      renderGraphPenLegend(null);
      restartDashboardPoll();
    }
    if (name === 'project') {
      window.fillProjectPopup?.();
      refreshProjectLibrary()
        .then(() => window.fillProjectPopup?.())
        .catch(() => window.fillProjectPopup?.());
      showSetupTab(setupActiveTab || 'general');
    }
    if (name === 'about') {
      fillAboutPopup().catch(console.error);
    }
    if (name === 'nextcentury-portal' && !ncPortalSession) {
      setNcPortalStatus('Click a driver’s Open portal or use Drivers → NextCentury API → Open portal.');
    }
  }


  async function closePopup(name) {
    if (name === 'hmi-setup') {
      const closed = window.PeaklogicHmi?.closeSetupPopup?.();
      if (closed !== false) setTabActive(name, false);
      return;
    }
    if (name === 'live-io') {
      closeLiveIoWindow();
      return;
    }
    if (name === 'program') {
      programFloater?.close();
      return;
    }
    if (name === 'tags') {
      tagsFloater?.close();
      return;
    }
    if (name === 'alarms') {
      alarmsFloater?.close();
      return;
    }
    if (name === 'historian') {
      historianFloater?.close();
      restartDashboardPoll();
      return;
    }
    if (name === 'historian-setup') {
      if (graphPensDirty) {
        const discard = window.confirm(
          'Pen config changes are not saved. Close without saving?'
        );
        if (!discard) return;
      }
      graphPensDirty = false;
      if (lastSettings?.graphPens?.length) graphPens = lastSettings.graphPens;
      historianConfigFloater?.close();
      return;
    }
    if (name === 'historian-logger') {
      const autoStartChanged = $('hist-log-auto-start')
        && $('hist-log-auto-start').checked !== autoStartRuntimeFromSettings();
      if (tagsDirty || mongoLoggerDirty || autoStartChanged) {
        const discard = window.confirm(
          'Logger config changes are not saved. Close without saving?'
        );
        if (!discard) return;
        if (tagsDirty) {
          tagsDirty = false;
          refreshAll().catch(console.error);
        }
        mongoLoggerDirty = false;
        fillMongoLoggerFields(lastSettings?.mongoLogger);
        if ($('hist-log-auto-start')) {
          $('hist-log-auto-start').checked = autoStartRuntimeFromSettings();
        }
      }
      historianLoggerFloater?.close();
      return;
    }
    if (name === 'report') {
      reportFloater?.close();
      return;
    }
    if (name === 'nextcentury-portal') {
      resetNcPortalIframe();
      setNcPortalStatus('');
    }
    const el = document.querySelector(`[data-popup="${name}"]`);
    if (!el) return;
    if (name === 'project') {
      if (isSetupFormDirty()) {
        try {
          await persistSetupChanges({ quiet: true });
        } catch (e) {
          alert(e.message || String(e));
          return;
        }
      } else {
        clearSetupDirty();
      }
    }
    el.classList.add('view-hidden');
    setTabActive(name, false);
  }

  function togglePopup(name) {
    if (isPopupOpen(name)) {
      closePopup(name).catch((e) => alert(e.message || String(e)));
    } else openPopup(name);
  }

  function projectMenuDetails() {
    return $('project-menu-details');
  }

  function isProjectMenuOpen() {
    return !!projectMenuDetails()?.open;
  }

  function closeProjectMenu() {
    const details = projectMenuDetails();
    if (details) details.open = false;
  }

  function toolsMenuDetails() {
    return $('tools-menu-details');
  }

  function historianMenuDetails() {
    return $('historian-menu-details');
  }

  function reportingMenuDetails() {
    return $('reporting-menu-details');
  }

  function dataMenuDetails() {
    return historianMenuDetails();
  }

  function helpMenuDetails() {
    return $('help-menu-details');
  }

  function closeToolsMenu() {
    const details = toolsMenuDetails();
    if (details) details.open = false;
  }

  function closeHistorianMenu() {
    const details = historianMenuDetails();
    if (details) details.open = false;
  }

  function closeReportingMenu() {
    const details = reportingMenuDetails();
    if (details) details.open = false;
  }

  function closeDataMenu() {
    closeHistorianMenu();
  }

  function closeHelpMenu() {
    const details = helpMenuDetails();
    if (details) details.open = false;
  }

  function closeCameraMenu() {
    const details = $('camera-menu-details');
    if (details) details.open = false;
  }

  async function printProjectConfigurationDoc() {
    const printMod = window.PeaklogicProjectConfigPrint;
    if (!printMod?.print) {
      alert('Print module not loaded');
      return;
    }
    let health = {};
    try {
      const res = await fetch('/health', { headers: { Accept: 'application/json' } });
      if (res.ok) health = await res.json();
    } catch {
      /* optional runtime line */
    }
    let programList = window.PeaklogicProgram?.getProgramCatalog?.() || [];
    if (!programList.length) {
      try {
        const r = await api.listPrograms();
        programList = r.programs || [];
      } catch {
        /* keep empty */
      }
    }
    const settings = {
      ...(lastSettings || {}),
      ...(isPopupOpen('project') ? buildSettingsPayloadFromSetupForm() : {}),
    };
    const hmi = window.PeaklogicHmi?.getConfig?.() || settings.hmi || {};
    const r = printMod.print({
      projectName: settings.project?.name || projectName || 'untitled',
      appVersion: health.version || '',
      printedAt: new Date().toISOString(),
      runtime: health.runtime || {},
      settings,
      tags,
      drivers,
      graphPens,
      hmi,
      programs: programList,
    });
    if (!r.ok) alert(r.error || 'Print failed');
  }

  function closeTopbarViewMenus() {
    closeToolsMenu();
    closeHistorianMenu();
    closeReportingMenu();
    closeHelpMenu();
    closeCameraMenu();
  }

  function openReportPopup(section) {
    openPopup('report');
    if (section === 'roi') {
      const panel = $('report-roi-panel');
      if (panel) {
        panel.open = true;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    if (section === 'cmms') {
      window.location.href = '/cmms';
      return;
    }
  }

  async function fillAboutPopup() {
    const line = $('about-runtime-line');
    if (!line) return;
    line.hidden = true;
    line.textContent = '';
    try {
      const res = await fetch('/health', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const rt = data.runtime || {};
      const parts = [
        data.version && `server v${data.version}`,
        rt.running != null && (rt.running ? 'runtime running' : 'runtime stopped'),
        rt.scanMs != null && `scan ${rt.scanMs} ms`,
      ].filter(Boolean);
      if (parts.length) {
        line.textContent = parts.join(' · ');
        line.hidden = false;
      }
    } catch {
      /* optional live line */
    }
  }

  function bindProjectMenu() {
    $('btn-project-status')?.addEventListener('click', () => {
      closeProjectMenu();
      openPopup('status');
    });
    $('btn-topbar-about')?.addEventListener('click', () => openPopup('about'));
    $('btn-project-setup')?.addEventListener('click', () => {
      closeProjectMenu();
      openProjectSetup('general');
    });
    document.addEventListener('click', (e) => {
      if (!isProjectMenuOpen()) return;
      const wrap = document.querySelector('.topbar-project-bar');
      if (wrap && !wrap.contains(e.target)) closeProjectMenu();
    });
    document.addEventListener('click', (e) => {
      const tools = toolsMenuDetails();
      if (tools?.open && !tools.contains(e.target)) closeToolsMenu();
      const historian = historianMenuDetails();
      if (historian?.open && !historian.contains(e.target)) closeHistorianMenu();
      const reporting = reportingMenuDetails();
      if (reporting?.open && !reporting.contains(e.target)) closeReportingMenu();
      const help = helpMenuDetails();
      if (help?.open && !help.contains(e.target)) closeHelpMenu();
    });
  }

  function bindDataMenu() {
    document.querySelectorAll('[data-setup-open]').forEach((b) => {
      b.addEventListener('click', () => {
        const tab = b.dataset.setupOpen;
        if (!tab) return;
        closeTopbarViewMenus();
        closeProjectMenu();
        openProjectSetup(tab);
      });
    });
    document.querySelectorAll('[data-historian-logger-open]').forEach((b) => {
      b.addEventListener('click', () => {
        closeTopbarViewMenus();
        closeProjectMenu();
        openHistorianLogger(b.dataset.historianLoggerOpen || 'pdm');
      });
    });
    $('btn-topbar-pdm')?.addEventListener('click', () => {
      closeTopbarViewMenus();
      closeProjectMenu();
      openHistorianLogger('pdm');
    });
    document.querySelectorAll('[data-hist-log-tab]').forEach((b) => {
      b.addEventListener('click', () => showHistorianLoggerTab(b.dataset.histLogTab));
    });
    document.querySelectorAll('[data-report-open]').forEach((b) => {
      b.addEventListener('click', () => {
        const section = b.dataset.reportOpen;
        closeTopbarViewMenus();
        closeProjectMenu();
        openReportPopup(section);
      });
    });
    document.querySelectorAll('#view-nav a.topbar-menu-link[href]').forEach((a) => {
      a.addEventListener('click', () => {
        closeTopbarViewMenus();
        closeProjectMenu();
      });
    });
    document.getElementById('btn-topbar-mv-draw')?.addEventListener('click', () => {
      closeTopbarViewMenus();
      closeProjectMenu();
    });
  }

  function fillModbusPortSelect() {
    const sel = $('mv-rtu-port');
    if (!sel) return;
    const cur = sel.value;
    const ports = serialPorts.length ? serialPorts : [{ path: 'COM3', label: 'COM3' }];
    sel.innerHTML = ports.map((p) =>
      `<option value="${esc(p.path)}">${esc(p.label)}${p.usb ? ' [USB]' : ''}</option>`
    ).join('');
    if (cur) sel.value = cur;
    else if (ports[0]) sel.value = ports[0].path;
  }

  function setNextcenturyStatus(msg, ok) {
    const el = $('nc-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true ? 'muted cell-mono ok-text' : ok === false ? 'muted cell-mono err-text' : 'muted cell-mono';
  }

  function renderNextcenturyDeployEstimate(est) {
    const el = $('nc-deploy-estimate');
    if (!el) return;
    if (!est || est.ok === false) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    if (!est.autoSyncTags) {
      el.textContent = 'Auto-sync off — tag estimate N/A (manual tags only)';
      el.className = 'prog-deploy-estimate muted cell-mono';
      return;
    }
    const siteTxt = est.siteCount === 1 ? '1 site' : `${est.siteCount} sites`;
    const devTxt = est.liveData
      ? `${est.totalDevices} devices (live)`
      : `${est.devicesPerSite}/site × ${siteTxt}`;
    const tagTxt = `${est.totalTags} tags (${est.pct}% of ${est.maxTags})`;
    const pollTxt = `poll ~${est.pollDurationSec}s · blocks ~${est.scansPerPoll} scans`;
    const loadTxt = `${est.scanLoadPct}% scan time / ${est.pollIntervalMin} min`;
    const prefix = est.cloudSizing ? 'Cloud sizing' : 'Deploy estimate';
    let line = `${prefix}: ${devTxt} → ${tagTxt} · ${pollTxt} · ${loadTxt}`;
    if (est.overLimit && est.recommendedMaxTags) {
      line += ` · need PEAKLOGIC_MAX_TAGS≥${est.recommendedMaxTags}`;
    } else if (est.cloudSizing && !est.overLimit) {
      line += ` · within cloud tag cap (${est.maxTags})`;
    }
    el.textContent = line;
    el.className = est.overLimit
      ? 'prog-deploy-estimate err cell-mono'
      : (est.pct >= 80 ? 'prog-deploy-estimate warn cell-mono' : 'prog-deploy-estimate muted cell-mono');
    el.title = est.overLimit
      ? `Over tag limit by ${Math.abs(est.headroom)} — cloud VM: set PEAKLOGIC_MAX_TAGS=${est.recommendedMaxTags} in /etc/peaklogic/env`
      : (est.cloudSizing
        ? 'Cloud hub sizing — 15 sites × 1500 devices, 3 tags/device, 15 min poll'
        : 'Planning estimate (3 tags/device + 2 status tags per driver)');
  }

  function formatNextcenturyDeployEstimateBrief(est) {
    if (!est?.ok || !est.autoSyncTags) return '';
    const tagTxt = `${est.totalTags} tags (${est.pct}%)`;
    const loadTxt = `~${est.scansPerPoll} scans/poll`;
    return `${tagTxt} · ${loadTxt}`;
  }

  let ncDeployEstimateTimer = null;
  async function syncNextcenturyDeployEstimate(opts = {}) {
    const driverId = opts.driverId || $('nc-driver-id')?.value?.trim() || '';
    let driverCfg = null;
    if (opts.target === 'card' && Number.isFinite(opts.cardIndex)) {
      driverCfg = drivers[opts.cardIndex];
    } else if (driverId) {
      driverCfg = drivers.find((d) => d.id === driverId && d.type === 'nextcentury');
    }
    const form = driverCfg || readNextcenturySetupForm();
    const devicesPerSite = Number(opts.devicesPerSite)
      || Number(form.devicesPerSite)
      || parseInt($('nc-devices-per-site')?.value, 10)
      || 1500;
    const propertyIds = Array.isArray(form.propertyIds) ? form.propertyIds : [];
    const siteCount = propertyIds.length
      ? undefined
      : (parseInt($('nc-site-count')?.value, 10) || Number(form.siteCount) || 15);
    try {
      const est = await api.nextcenturyDeployEstimate({
        driverId: driverId || form.id || '',
        driver: form,
        devicesPerSite,
        siteCount,
        useLive: opts.useLive !== false,
      });
      if (opts.target === 'card' && Number.isFinite(opts.cardIndex)) {
        const cardEl = document.querySelector(`[data-nc-deploy-estimate="${opts.cardIndex}"]`);
        if (cardEl) {
          const brief = formatNextcenturyDeployEstimateBrief(est);
          cardEl.textContent = brief;
          cardEl.hidden = !brief;
          cardEl.className = est.overLimit
            ? 'driver-nc-deploy-est prog-deploy-estimate err cell-mono'
            : (est.pct >= 80 ? 'driver-nc-deploy-est prog-deploy-estimate warn cell-mono' : 'driver-nc-deploy-est prog-deploy-estimate muted cell-mono');
        }
        return est;
      }
      renderNextcenturyDeployEstimate(est);
      return est;
    } catch (e) {
      if (opts.target !== 'card') {
        renderNextcenturyDeployEstimate(null);
      }
      return null;
    }
  }

  function scheduleNextcenturyDeployEstimate(opts = {}) {
    clearTimeout(ncDeployEstimateTimer);
    ncDeployEstimateTimer = setTimeout(() => { syncNextcenturyDeployEstimate(opts); }, 350);
  }

  let ncPortalSession = null;

  function setNcPortalStatus(msg, ok) {
    const el = $('nc-portal-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true ? 'panel-hint muted ok-text' : ok === false ? 'panel-hint muted err-text' : 'panel-hint muted';
  }

  function resetNcPortalIframe() {
    const frame = $('nc-portal-iframe');
    if (!frame) return;
    frame.removeAttribute('src');
    frame.classList.add('view-hidden');
    ncPortalSession = null;
  }

  async function openNextcenturyPortal(opts = {}) {
    const driverId = opts.driverId ? String(opts.driverId).trim() : '';
    const body = driverId
      ? { driverId }
      : {
        email: opts.email || $('nc-email')?.value?.trim(),
        password: opts.password ?? $('nc-password')?.value ?? '',
      };
    setNcPortalStatus('Signing in to NextCentury API…');
    openPopup('nextcentury-portal');
    const frame = $('nc-portal-iframe');
    if (frame) {
      frame.classList.add('view-hidden');
      frame.removeAttribute('src');
    }
    try {
      const r = await api.openNextcenturyPortal(body);
      ncPortalSession = r;
      if (frame) {
        frame.src = r.framePath;
        frame.classList.remove('view-hidden');
      }
      const who = r.email ? ` as ${r.email}` : '';
      setNcPortalStatus(
        `Portal loaded${who}. If you see a login screen, use the same NextCentury credentials (API JWT handoff may not be supported by the web app).`,
        true,
      );
    } catch (e) {
      setNcPortalStatus(e.message || 'Portal sign-in failed', false);
    }
  }

  function driverNextcenturyToolbarHtml(i) {
    return `<div class="driver-nc-toolbar toolbar wrap">
      <button type="button" class="btn btn-sm" data-drv-nc-portal="${i}" title="Open app.nextcenturymeters.com with this driver’s API credentials">Open portal</button>
    </div>`;
  }

  function driverBacnetToolbarHtml(i) {
    const d = drivers[i] || {};
    return `<div class="driver-bacnet-toolbar toolbar wrap">
      <button type="button" class="btn btn-sm" data-drv-bac-discover="${i}">Discover devices</button>
      <label class="tag-mb-lbl">Host <input type="text" data-drv-bac-host="${i}" value="${esc(d.defaultHost || '')}" placeholder="192.168.1.10"></label>
      <label class="tag-mb-lbl">Device inst <input type="number" data-drv-bac-dev="${i}" min="0" placeholder="1001"></label>
      <button type="button" class="btn btn-sm primary" data-drv-bac-browse="${i}">Browse &amp; import tags</button>
      <button type="button" class="btn btn-sm" data-drv-bac-example="${i}">Load example tags</button>
    </div>
    <p class="driver-bacnet-status muted cell-mono" data-drv-bac-status="${i}">Who-Is discovery finds BACnet/IP devices on the LAN. Browse reads object-list and imports present-value points.</p>`;
  }

  function setBacnetDriverStatus(index, msg, ok) {
    const el = document.querySelector(`[data-drv-bac-status="${index}"]`);
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true
      ? 'driver-bacnet-status muted cell-mono ok-text'
      : ok === false
        ? 'driver-bacnet-status muted cell-mono err-text'
        : 'driver-bacnet-status muted cell-mono';
  }

  async function runBacnetDiscover(index) {
    const card = document.querySelector(`.driver-card[data-i="${index}"]`);
    if (card?.classList.contains('driver-editing')) readDriverEditForm(card, index);
    const d = drivers[index];
    if (!d || d.type !== 'bacnet') return;
    setBacnetDriverStatus(index, 'Discovering BACnet devices…');
    try {
      const r = await api.bacnetDiscover({ driverId: d.id, ...d });
      const list = r.devices || [];
      if (!list.length) {
        setBacnetDriverStatus(index, 'No BACnet devices responded to Who-Is.', false);
        return;
      }
      const first = list[0];
      const hostInp = document.querySelector(`[data-drv-bac-host="${index}"]`);
      const devInp = document.querySelector(`[data-drv-bac-dev="${index}"]`);
      if (hostInp && !hostInp.value.trim() && first.host) hostInp.value = first.host;
      if (devInp && !devInp.value && first.deviceInstance != null) devInp.value = first.deviceInstance;
      const lines = list.map((x) => `${x.host || '?'} · dev ${x.deviceInstance}${x.objectName ? ` · ${x.objectName}` : ''}`);
      setBacnetDriverStatus(index, `Found ${list.length} device(s): ${lines.join(' | ')}`, true);
    } catch (e) {
      setBacnetDriverStatus(index, e.message || 'Discover failed', false);
    }
  }

  async function runBacnetLoadExample(index) {
    const card = document.querySelector(`.driver-card[data-i="${index}"]`);
    if (card?.classList.contains('driver-editing')) readDriverEditForm(card, index);
    const d = drivers[index];
    if (!d || d.type !== 'bacnet') return;
    if (!window.confirm(`Load example BACnet tags from st/fixtures/tags.bacnet.json for driver "${d.id}"?`)) return;
    setBacnetDriverStatus(index, 'Loading example tags…');
    try {
      const imp = await api.bacnetLoadExampleTags({ driverId: d.id });
      await refreshAll();
      setBacnetDriverStatus(index, `Loaded ${imp.tagsAdded || 0} example tag(s) (${imp.tagCount} total).`, true);
    } catch (e) {
      setBacnetDriverStatus(index, e.message || 'Load example failed', false);
    }
  }

  async function runBacnetBrowseImport(index) {
    const card = document.querySelector(`.driver-card[data-i="${index}"]`);
    if (card?.classList.contains('driver-editing')) readDriverEditForm(card, index);
    const d = drivers[index];
    if (!d || d.type !== 'bacnet') return;
    const host = document.querySelector(`[data-drv-bac-host="${index}"]`)?.value?.trim()
      || d.defaultHost || '';
    const deviceInstance = parseInt(document.querySelector(`[data-drv-bac-dev="${index}"]`)?.value, 10);
    if (!host) {
      alert('Enter target host IP (or set Default host on the driver).');
      return;
    }
    if (!Number.isFinite(deviceInstance)) {
      alert('Enter BACnet device instance (from Discover or BMS docs).');
      return;
    }
    setBacnetDriverStatus(index, `Browsing ${host} device ${deviceInstance}…`);
    try {
      const r = await api.bacnetBrowse({
        driverId: d.id,
        host,
        deviceInstance,
        includePresentValue: true,
        maxObjects: 250,
      });
      const points = (r.points || []).filter((p) => {
        const ot = String(p.objectTypeLabel || '').toLowerCase();
        return ot.includes('analog') || ot.includes('binary') || ot.includes('multistate');
      });
      if (!points.length) {
        setBacnetDriverStatus(index, `No analog/binary/multi-state objects on device ${deviceInstance}.`, false);
        return;
      }
      const msg = `Import ${points.length} BACnet point(s) from ${host} dev ${deviceInstance}?`
        + (r.truncated ? ' (object list truncated)' : '');
      if (!window.confirm(msg)) {
        setBacnetDriverStatus(index, `Browse complete — ${points.length} point(s) available.`, true);
        return;
      }
      const imp = await api.bacnetImportTags({ driverId: d.id, points, reassign: true });
      await refreshAll();
      setBacnetDriverStatus(
        index,
        `Imported ${imp.added || 0} new + ${imp.updated || 0} updated tag(s) (${imp.tagCount} total).`,
        true,
      );
    } catch (e) {
      setBacnetDriverStatus(index, e.message || 'Browse/import failed', false);
    }
  }

  function setDriverTestStatus(msg, ok) {
    const el = $('drivers-test-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true ? 'muted cell-mono ok-text' : ok === false ? 'muted cell-mono err-text' : 'muted cell-mono';
  }

  function setDriverCardTestStatus(index, msg, ok) {
    const el = document.querySelector(`[data-drv-test-status="${index}"]`);
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true
      ? 'driver-test-status muted cell-mono ok-text'
      : ok === false
        ? 'driver-test-status muted cell-mono err-text'
        : 'driver-test-status muted cell-mono';
  }

  function driverTestConnectionHint(d) {
    if (!d) return '';
    if (d.type === 'nextcentury') {
      return '\n\nNextCentury tips:\n• Use Drivers → NextCentury API tab (not Modbus/COM)\n• Set email + password, then Save & connect\n• Or set NEXTCENTURY_EMAIL / NEXTCENTURY_PASSWORD env vars';
    }
    if (d.type === 'opta_remote') {
      return `\n\nOpta tips:\n• Test on this PC: npm run opta-test\n• Browser must use Ethernet http://${d.host || '192.168.1.234'}/api/status (not WiFi AP :8080)\n• Re-flash est-pc/firmware/arduino-opta-st/PeaklogicOptaSt\n• Serial @115200: expect "GET /api/status" when you Test`;
    }
    if (d.type === 'mqtt_parc') {
      return '\n\nMQTT Parc tips:\n• Start Mosquitto (npm run mqtt:start)\n• Check System setup → mqttParc broker URL\n• deviceId must match Opta firmware\n• Wait for telemetry before Sync tags';
    }
    if (d.type === 'modbus_rtu' || d.type === 'vgreen_epc' || d.type === 'pentair_rs485') {
      return '\n\nModbus RTU tips:\n• Stop runtime or pause scanning if COM port is in use\n• Only one enabled driver per COM port\n• Confirm baud, parity, and slave ID match the device';
    }
    if (d.type === 'bacnet') {
      return '\n\nBACnet tips:\n• Run on edge appliance on the BMS VLAN\n• Discover devices before browse/import\n• Keep Allow writes off until setpoint ownership is agreed';
    }
    return '';
  }

  async function runDriverConnectionTest(driverIndex, testBtn) {
    const d = drivers[driverIndex];
    if (!d) {
      setDriverTestStatus('Driver not found', false);
      return;
    }
    const card = testBtn?.closest('.driver-card');
    if (card?.classList.contains('driver-editing')) readDriverEditForm(card, driverIndex);
    const label = d.id || d.type || 'driver';
    setDriverTestStatus(`Testing ${label}…`, null);
    setDriverCardTestStatus(driverIndex, 'Testing connection…', null);
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.setAttribute('aria-busy', 'true');
    }
    try {
      let cfg = stripDriverFieldsForType({ ...drivers[driverIndex] });
      if (cfg.type === 'nextcentury') {
        const card = testBtn?.closest('.driver-card');
        const pwIn = card?.querySelector('[data-df=password]');
        cfg = {
          ...cfg,
          password: resolveNextcenturyPassword(cfg.id, pwIn?.value),
        };
      }
      const r = await api.testDriver(cfg);
      const detail = typeof r.result === 'string'
        ? r.result
        : (r.result?.message || JSON.stringify(r.result));
      const okMsg = `${label}: OK — ${detail}`;
      setDriverTestStatus(okMsg, true);
      setDriverCardTestStatus(driverIndex, okMsg, true);
    } catch (e) {
      const errMsg = `${label}: ${e.message || 'Test failed'}${driverTestConnectionHint(d)}`;
      setDriverTestStatus(errMsg, false);
      setDriverCardTestStatus(driverIndex, `${label}: ${e.message || 'Test failed'}`, false);
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.removeAttribute('aria-busy');
      }
    }
  }

  function savedNextcenturyDriver(driverId) {
    const id = String(driverId || '').trim() || 'nextcentury1';
    return drivers.find((d) => d.id === id && d.type === 'nextcentury')
      || drivers.find((d) => d.type === 'nextcentury');
  }

  function nextcenturyHasPassword(driverId) {
    const d = savedNextcenturyDriver(driverId);
    return Boolean(d?.hasPassword || d?.password);
  }

  function syncNcPasswordField(savedPassword, hasPassword) {
    const el = $('nc-password');
    if (!el) return;
    el.value = '';
    const stored = savedPassword || hasPassword;
    el.placeholder = stored
      ? 'Leave blank to keep saved password'
      : 'Enter password and click Save';
  }

  function updateNcPasswordIndicator(opts = {}) {
    const el = $('nc-password-status');
    if (!el) return;
    const driverId = $('nc-driver-id')?.value.trim() || 'nextcentury1';
    const typed = $('nc-password')?.value?.trim();
    const saved = nextcenturyHasPassword(driverId);
    if (opts.justSaved) {
      const ok = saved || opts.passwordUpdated;
      el.textContent = opts.passwordUpdated
        ? 'Password saved — stored for autostart on boot'
        : (saved ? 'Password on file for autostart on boot' : 'Settings saved (no password stored)');
      el.className = ok ? 'nc-password-status ok-text' : 'nc-password-status err-text';
      return;
    }
    if (saved && !typed) {
      el.textContent = 'Password saved for autostart on boot';
      el.className = 'nc-password-status ok-text';
      return;
    }
    if (typed) {
      el.textContent = saved
        ? 'New password entered — click Save to update stored password'
        : 'New password entered — click Save to store for autostart';
      el.className = 'nc-password-status muted';
      return;
    }
    el.textContent = 'No password stored — enter password and click Save for autostart on boot';
    el.className = 'nc-password-status err-text';
  }

  function finalizeNcPasswordUi(opts = {}) {
    const driverId = $('nc-driver-id')?.value.trim() || 'nextcentury1';
    const saved = opts.hasPassword ?? nextcenturyHasPassword(driverId);
    if (saved) syncNcPasswordField(undefined, true);
    updateNcPasswordIndicator({
      justSaved: opts.justSaved !== false,
      passwordUpdated: !!opts.passwordUpdated,
    });
  }

  function shouldSaveNextcenturyViaSetupTab() {
    const typed = $('nc-password')?.value?.trim();
    return driversActiveTab === 'nextcentury' || !!typed;
  }

  function resolveNextcenturyPassword(driverId, typedPassword) {
    const typed = String(typedPassword ?? '').trim();
    if (typed) return typed;
    return savedNextcenturyDriver(driverId)?.password || '';
  }

  function syncNextcenturyFormToDrivers() {
    if (!$('nc-email') && !$('nc-password')) return;
    const cfg = readNextcenturySetupForm();
    if (!cfg?.id) return;
    const typed = $('nc-password')?.value?.trim();
    upsertNextcenturyDriver({
      ...cfg,
      password: typed || resolveNextcenturyPassword(cfg.id, ''),
    });
  }

  function applyNextcenturyExampleToForm(example) {
    if (!example || typeof example !== 'object') return;
    if ($('nc-driver-id')) $('nc-driver-id').value = example.driverId || example.id || 'nextcentury1';
    if ($('nc-email')) $('nc-email').value = example.email || '';
    if ($('nc-password')) {
      if (example.password) $('nc-password').value = example.password;
      else syncNcPasswordField(undefined, example.hasPassword);
    }
    updateNcPasswordIndicator();
    if ($('nc-report-id')) $('nc-report-id').value = example.reportId || 'rt_4510';
    if ($('nc-poll-ms')) $('nc-poll-ms').value = String(Number(example.pollIntervalMs) || 900000);
    if ($('nc-property-ids')) {
      const ids = Array.isArray(example.propertyIds)
        ? example.propertyIds.join(', ')
        : (example.propertyIds || '');
      $('nc-property-ids').value = ids;
    }
    if ($('nc-auto-sync-tags')) {
      $('nc-auto-sync-tags').checked = example.autoSyncTags !== false;
    }
    if ($('nc-devices-per-site')) {
      $('nc-devices-per-site').value = String(
        Number(example.devicesPerSite) || 1500,
      );
    }
    if ($('nc-site-count')) {
      const ids = Array.isArray(example.propertyIds) ? example.propertyIds : [];
      $('nc-site-count').value = String(
        Number(example.siteCount) || ids.length || 15,
      );
    }
    scheduleNextcenturyDeployEstimate();
  }

  function fillNextcenturySetupForm() {
    const formId = $('nc-driver-id')?.value.trim() || 'nextcentury1';
    let d = drivers.find((x) => x.id === formId && x.type === 'nextcentury');
    if (!d) d = drivers.find((x) => x.type === 'nextcentury');
    if (!d) return;
    applyNextcenturyExampleToForm({
      driverId: d.id,
      email: d.email || '',
      hasPassword: nextcenturyHasPassword(d.id),
      reportId: d.reportId || 'rt_4510',
      pollIntervalMs: d.pollIntervalMs,
      propertyIds: d.propertyIds,
      autoSyncTags: d.autoSyncTags,
      devicesPerSite: d.devicesPerSite,
    });
    scheduleNextcenturyDeployEstimate();
    updateNcPasswordIndicator();
  }

  function readNextcenturySetupForm() {
    const driverId = $('nc-driver-id')?.value.trim() || 'nextcentury1';
    const email = $('nc-email')?.value.trim() || '';
    const password = resolveNextcenturyPassword(driverId, $('nc-password')?.value);
    const reportId = $('nc-report-id')?.value.trim() || 'rt_4510';
    const pollIntervalMs = parseInt($('nc-poll-ms')?.value, 10) || 900000;
    const propertyIdsStr = $('nc-property-ids')?.value.trim() || '';
    const propertyIds = propertyIdsStr
      ? propertyIdsStr.split(/[,\s]+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n))
      : [];
    const devicesPerSite = parseInt($('nc-devices-per-site')?.value, 10) || 1500;
    const siteCountPlan = parseInt($('nc-site-count')?.value, 10) || 15;
    return {
      id: driverId,
      type: 'nextcentury',
      enabled: true,
      email,
      password,
      reportId,
      pollIntervalMs,
      propertyIds,
      devicesPerSite,
      siteCount: propertyIds.length ? undefined : siteCountPlan,
      autoSyncTags: $('nc-auto-sync-tags')?.checked !== false,
      propertyDelayMs: 600,
      timeoutMs: 20000,
    };
  }

  function upsertNextcenturyDriver(cfg) {
    const clean = stripDriverFieldsForType({ ...cfg });
    const idx = drivers.findIndex((d) => d.id === clean.id);
    if (idx >= 0) drivers[idx] = clean;
    else drivers.push(clean);
  }

  async function fillNextcenturyFromExample() {
    setNextcenturyStatus('Loading example…');
    try {
      const example = await api.getNextcenturyExample();
      applyNextcenturyExampleToForm(example);
      setNextcenturyStatus('Example values loaded (placeholder credentials — not for live API).', true);
    } catch (e) {
      setNextcenturyStatus(e.message || 'Failed to load example', false);
    }
  }

  async function testNextcenturySetup() {
    const cfg = stripDriverFieldsForType(readNextcenturySetupForm());
    setNextcenturyStatus('Testing connection…');
    try {
      const r = await api.testDriver(cfg);
      const detail = r.result?.message || JSON.stringify(r.result);
      setNextcenturyStatus(`Connection OK — ${detail}`, true);
    } catch (e) {
      setNextcenturyStatus(`Test failed: ${e.message}`, false);
    }
  }

  async function saveNextcenturySetup(connect) {
    const cfg = readNextcenturySetupForm();
    if (!cfg.id) {
      setNextcenturyStatus('Driver ID is required', false);
      return;
    }
    const typedPassword = $('nc-password')?.value ?? '';
    setNextcenturyStatus('Saving driver…');
    updateNcPasswordIndicator();
    try {
      const r = await api.saveNextcenturySetup({
        ...cfg,
        password: typedPassword,
        connect: !!connect,
      });
      if (Array.isArray(r.drivers)) drivers = r.drivers;
      else upsertNextcenturyDriver({ ...cfg, hasPassword: r.hasPassword });
      driversDirty = false;
      await refreshAll();
      fillNextcenturySetupForm();
      finalizeNcPasswordUi({
        hasPassword: r.hasPassword,
        passwordUpdated: !!r.passwordUpdated || !!typedPassword.trim(),
      });
      const pwdNote = r.hasPassword
        ? (r.passwordUpdated ? 'Password updated and saved' : 'Password on file')
        : 'Warning: no password stored';
      setNextcenturyStatus(
        connect
          ? `Saved and connected "${cfg.id}" — ${pwdNote}`
          : `Saved "${cfg.id}" — ${pwdNote} for autostart`,
        r.hasPassword,
      );
    } catch (e) {
      setNextcenturyStatus(e.message || 'Save failed', false);
      const el = $('nc-password-status');
      if (el) {
        el.textContent = e.message || 'Save failed';
        el.className = 'nc-password-status err-text';
      }
    }
  }

  async function loadNextcenturyExampleTags() {
    const driverId = $('nc-driver-id')?.value.trim() || 'nextcentury1';
    const mapped = tagsForDriver(driverId);
    const msg = mapped.length
      ? `Load example tags for driver "${driverId}"?\n\n${mapped.length} existing tag(s) on this driver will be replaced.`
      : `Load example tags from st/fixtures/tags.nextcentury.json for driver "${driverId}"?`;
    if (!window.confirm(msg)) return;
    setNextcenturyStatus('Loading example tags…');
    try {
      const r = await api.loadNextcenturyExampleTags({ driverId, merge: true });
      await refreshAll();
      setNextcenturyStatus(`Loaded ${r.tagsAdded} tag(s) for "${driverId}" · ${r.tagCount} total`, true);
    } catch (e) {
      setNextcenturyStatus(e.message || 'Load example tags failed', false);
    }
  }

  function bindPopups() {
    initFloaters();
    initWindowStack();
    programFloater?.bind();
    tagsFloater?.bind();
    historianFloater?.bind();
    historianConfigFloater?.bind();
    historianLoggerFloater?.bind();
    alarmsFloater?.bind();
    reportFloater?.bind();
    bindHistorianCanvasResize();
    bindTagsForceDelegation();
    bindLiveIoPanel();
    document.querySelectorAll('[data-popup-open]').forEach((b) => {
      b.onclick = () => {
        const name = b.dataset.popupOpen;
        if (name === 'project') openProjectSetup('general');
        else if (b.classList.contains('view-tab')) {
          closeTopbarViewMenus();
          togglePopup(name);
        }
        else openPopup(name);
      };
    });
    if (!document.body.dataset.popupCloseBound) {
      document.body.dataset.popupCloseBound = '1';
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-popup-close]');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        closePopup(btn.dataset.popupClose).catch((err) => alert(err.message || String(err)));
      });
    }
    const setupRoot = document.querySelector('[data-popup="project"]');
    if (setupRoot && !setupRoot._setupDirtyBound) {
      setupRoot._setupDirtyBound = true;
      setupRoot.addEventListener('input', (e) => {
        if (e.target.matches('input, select, textarea')) markSetupDirty();
      });
      setupRoot.addEventListener('change', (e) => {
        if (e.target.matches('input, select, textarea')) markSetupDirty();
        if (e.target.id === 'proj-remote-execution') updateOptaDeviceModeHint();
      });
    }
    document.querySelectorAll('[data-setup-tab-btn]').forEach((b) => {
      b.onclick = () => showSetupTab(b.dataset.setupTabBtn);
    });
    $('btn-features-matrix-save')?.addEventListener('click', () => saveAuthFeaturesMatrix().catch(console.error));
    $('btn-features-add-user')?.addEventListener('click', () => {
      resetFeatUserForm();
      $('setup-features-user-form-wrap')?.setAttribute('open', '');
    });
    $('btn-features-user-save')?.addEventListener('click', () => saveFeatUserForm().catch(console.error));
    $('btn-features-user-cancel')?.addEventListener('click', () => resetFeatUserForm());
    $('btn-topbar-logout')?.addEventListener('click', () => {
      window.PeaklogicSignOut?.perform?.();
    });
    $('btn-help-sign-out')?.addEventListener('click', () => {
      window.PeaklogicSignOut?.perform?.();
    });
    $('btn-cloud-nav-logout')?.addEventListener('click', () => {
      window.PeaklogicSignOut?.perform?.();
    });
    document.querySelectorAll('[data-drivers-tab-btn]').forEach((b) => {
      b.onclick = () => showDriversTab(b.dataset.driversTabBtn);
    });
    $('btn-alarms-ack-all')?.addEventListener('click', () => {
      api.ackAllAlarms()
        .then((res) => {
          applyLiveFromServer(res.live);
          return refreshAll({ force: true });
        })
        .catch((e) => alert(e.message));
    });
    $('alarms-show-acked')?.addEventListener('change', (e) => {
      alarmsShowAcked = !!e.target.checked;
      renderAlarmsPanel();
    });
    $('btn-historian-logger')?.addEventListener('click', () => openHistorianLogger('mongo'));
    $('btn-historian-maintenance')?.addEventListener('click', () => {
      const panel = $('historian-maintenance-panel');
      if (!panel) return;
      const isHidden = panel.classList.toggle('view-hidden');
      if (!isHidden) {
        initHistorianDateDefaults();
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    $('btn-historian-setup')?.addEventListener('click', () => openPopup('historian-setup'));
    $('btn-historian-report')?.addEventListener('click', () => openPopup('report'));
    $('btn-report-open-setup')?.addEventListener('click', () => openPopup('historian-setup'));
    $('mongo-report-source')?.addEventListener('change', () => syncMongoReportSourceUi());
    $('mongo-report-collection')?.addEventListener('change', async () => {
      const collection = $('mongo-report-collection')?.value;
      if (!collection) return;
      try {
        const disc = await api.discoverMongoReportFields(collection);
        const source = getMongoReportSource();
        if (source && disc.fields) source.fields = disc.fields;
        renderMongoReportColumns(disc.fields?.map((f) => f.id) || []);
      } catch (e) {
        console.error(e);
      }
    });
    $('mongo-report-template')?.addEventListener('change', (e) => {
      const tpl = mongoReportCatalog?.templates?.find((t) => t.id === e.target.value);
      if (tpl) applyMongoReportSpecToForm(tpl);
    });
    $('mongo-report-saved')?.addEventListener('change', (e) => {
      const def = mongoReportDefs.find((d) => d.id === e.target.value);
      if (def) applyMongoReportSpecToForm(def);
    });
    $('btn-mongo-report-new')?.addEventListener('click', () => {
      applyMongoReportSpecToForm({ sourceId: 'sys_log', name: 'New report', columns: [], filter: {} });
      mongoReportPreview = null;
      if ($('mongo-report-preview')) $('mongo-report-preview').innerHTML = '<p class="muted">Click <strong>Run preview</strong> to load data.</p>';
    });
    $('btn-mongo-report-save')?.addEventListener('click', () => saveMongoReportDef().catch((e) => alert(e.message)));
    $('btn-mongo-report-delete')?.addEventListener('click', () => deleteMongoReportDef().catch((e) => alert(e.message)));
    $('btn-mongo-report-run')?.addEventListener('click', () => runMongoReportPreview());
    $('btn-mongo-report-csv')?.addEventListener('click', () => exportMongoReportCsv());
    $('btn-mongo-report-pdf')?.addEventListener('click', () => exportMongoReportPdf());
    document.querySelectorAll('.report-mongo-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        setReportMongoTab(btn.dataset.reportMongoTab || 'syslog');
        refreshReportMongoLogs().catch(console.error);
      });
    });
    $('btn-report-mongo-refresh')?.addEventListener('click', () => refreshReportMongoLogs().catch(console.error));
    $('report-mongo-syslog-level')?.addEventListener('change', () => refreshReportMongoLogs().catch(console.error));
    $('report-mongo-syslog-category')?.addEventListener('change', () => refreshReportMongoLogs().catch(console.error));
    $('report-mongo-mqtt-level')?.addEventListener('change', () => refreshReportMongoLogs().catch(console.error));
    $('report-mongo-mqtt-event')?.addEventListener('change', () => refreshReportMongoLogs().catch(console.error));
    $('btn-report-mongo-open-historian')?.addEventListener('click', () => openPopup('historian'));
    $('historian-source')?.addEventListener('change', (e) => {
      historianSource = e.target.value;
      $('report-source').value = historianSource;
      syncHistorianSourceUi();
      drawHistorianPopups();
    });
    $('report-source')?.addEventListener('change', (e) => {
      historianSource = e.target.value;
      $('historian-source').value = historianSource;
      syncHistorianSourceUi();
      drawHistorianPopups();
    });
    $('historian-range')?.addEventListener('change', (e) => {
      historianRangePreset = e.target.value;
      $('report-range').value = historianRangePreset;
      if (!historianUseCustom) syncHistorianPresetDates();
      drawHistorianPopups();
    });
    $('report-range')?.addEventListener('change', (e) => {
      historianRangePreset = e.target.value;
      $('historian-range').value = historianRangePreset;
      if (!historianUseCustom) syncHistorianPresetDates();
      drawHistorianPopups();
    });
    const onHistorianCustomToggle = (checked) => {
      historianUseCustom = !!checked;
      if (!historianUseCustom) syncHistorianPresetDates();
      syncHistorianDateUi();
      drawHistorianPopups();
    };
    $('historian-use-custom')?.addEventListener('change', (e) => onHistorianCustomToggle(e.target.checked));
    $('report-use-custom')?.addEventListener('change', (e) => onHistorianCustomToggle(e.target.checked));
    const syncDateFromHistorian = () => {
      syncHistorianDateUi();
      if (historianUseCustom) drawHistorianPopups();
    };
    $('historian-from')?.addEventListener('change', syncDateFromHistorian);
    $('historian-to')?.addEventListener('change', syncDateFromHistorian);
    $('btn-historian-load-mongo')?.addEventListener('click', () => loadMongoHistorian('historian-load-msg'));
    $('btn-report-load-mongo')?.addEventListener('click', () => loadMongoHistorian('report-load-msg'));
    $('btn-historian-load-pdm')?.addEventListener('click', () => loadPdmHistorian('historian-load-msg'));
    $('btn-report-load-pdm')?.addEventListener('click', () => loadPdmHistorian('report-load-msg'));
    $('historian-pdm-asset')?.addEventListener('change', (e) => {
      pdmAssetId = e.target.value || '';
      if ($('report-pdm-asset')) $('report-pdm-asset').value = pdmAssetId;
      if (pdmAssetId) {
        editHistorianPdmAsset(pdmAssetId).catch((err) => setHistorianPdmAssetMsg(err.message || String(err), false));
      } else {
        loadHistorianPdmAssetForm('').catch(console.error);
      }
    });
    $('btn-historian-pdm-asset-save')?.addEventListener('click', () => {
      saveHistorianPdmAsset().catch((e) => setHistorianPdmAssetMsg(e.message, false));
    });
    $('btn-historian-pdm-asset-clear-tags')?.addEventListener('click', () => {
      clearHistorianPdmAssetTags().catch((e) => setHistorianPdmAssetMsg(e.message, false));
    });
    $('btn-historian-pdm-asset-new')?.addEventListener('click', () => {
      pdmAssetManagerGen += 1;
      pdmAssetId = '';
      pdmAssetEditOriginalId = '';
      loadHistorianPdmAssetForm('').catch(console.error);
      setHistorianPdmAssetMsg('');
    });
    $('btn-historian-pdm-asset-delete')?.addEventListener('click', () => {
      deleteHistorianPdmAsset().catch((e) => setHistorianPdmAssetMsg(e.message, false));
    });
    $('report-pdm-asset')?.addEventListener('change', (e) => {
      pdmAssetId = e.target.value || '';
      if ($('historian-pdm-asset')) $('historian-pdm-asset').value = pdmAssetId;
    });
    $('btn-hist-log-save')?.addEventListener('click', () => {
      saveHistorianLoggerSettings().catch((e) => {
        const el = $('hist-log-save-msg');
        if (el) {
          el.textContent = e.message || 'Save failed';
          el.className = 'muted cell-mono err-text';
        }
      });
    });
    $('btn-pdm-save')?.addEventListener('click', () => savePdmSettings().catch((e) => alert(e.message)));
    $('btn-pdm-build-now')?.addEventListener('click', () => buildPdmFeaturesNow().catch((e) => alert(e.message)));
    $('btn-pdm-proactive-run')?.addEventListener('click', () => runPdmProactiveCheck().catch((e) => alert(e.message)));
    $('btn-pdm-download-pdf')?.addEventListener('click', () => downloadPdmAssetPdf().catch((e) => alert(e.message)));
    $('btn-pdm-sim-motor')?.addEventListener('click', () => simulateMotorPdm().catch((e) => alert(e.message)));
    $('btn-pdm-sim-asset')?.addEventListener('click', () => simulateMotorAssetPdm().catch((e) => alert(e.message)));
    $('btn-historian-pdm-suggest-tags')?.addEventListener('click', () => suggestHistorianPdmTags());
    $('historian-pdm-motor-type')?.addEventListener('change', () => refreshHistorianPdmApplicationOptions());
    $('historian-pdm-application')?.addEventListener('change', () => refreshHistorianPdmConfigurationOptions());
    $('historian-pdm-configuration')?.addEventListener('change', () => suggestHistorianPdmTags());
    $('historian-pdm-unit-index')?.addEventListener('change', () => suggestHistorianPdmTags());
    $('btn-report-export-pdm-csv')?.addEventListener('click', () => exportPdmCsv());
    $('btn-report-roi-save')?.addEventListener('click', () => saveRoiSettings().catch((e) => alert(e.message)));
    $('btn-mongo-seed')?.addEventListener('click', () => seedMongoDemo());
    $('btn-mongo-purge')?.addEventListener('click', () => purgeMongoArchive(false));
    $('btn-mongo-purge-all')?.addEventListener('click', () => purgeMongoArchive(true));
    initHistorianDateDefaults();
    syncHistorianPresetDates();
    syncHistorianSourceUi();
    $('btn-hmi-setup')?.addEventListener('click', () => openPopup('hmi-setup'));
    bindProjectMenu();
    bindDataMenu();
    window.addEventListener('resize', () => {
      window.PeaklogicHmi?.clampHmiSetupOnResize();
      clampLiveIoOnResize();
      programFloater?.clampOnResize();
      tagsFloater?.clampOnResize();
      historianFloater?.clampOnResize();
      historianConfigFloater?.clampOnResize();
      historianLoggerFloater?.clampOnResize();
      alarmsFloater?.clampOnResize();
      reportFloater?.clampOnResize();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        openPopup('help');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        openPopup('training');
        return;
      }
      if (e.key !== 'Escape') return;
      if (isProjectMenuOpen()) {
        closeProjectMenu();
        return;
      }
      const roomPop = document.getElementById('hmi-room-popup');
      if (roomPop && !roomPop.classList.contains('view-hidden')) return;
      const camPop = document.getElementById('hmi-camera-popup');
      if (camPop && !camPop.classList.contains('view-hidden')) {
        window.HmiView?.closeCameraPopup?.();
        return;
      }
      const order = ['help', 'training', 'cameras', 'hmi-setup', 'project', 'about', 'status', 'alarm-notify', 'hw-wizard', 'nextcentury-portal', 'program', 'report', 'historian-logger', 'historian-setup', 'historian', 'alarms', 'live-io', 'tags', 'drivers'];
      for (const n of order) {
        if (isPopupOpen(n)) {
          closePopup(n).catch(console.error);
          return;
        }
      }
    });
  }
  function liveValCellHtml(tag, liveEntry) {
    const val = esc(formatLive(tag, liveEntry));
    const tsApi = window.PeaklogicIoTimestamp;
    const stopped = !runtimeScanActive(lastRuntime);
    const ts = liveEntry?.updatedAt;
    const tsHtml = tsApi?.ioTsSpan?.(ts, { stopped }) || '';
    return `<span class="live-val-text">${val}</span>${tsHtml}`;
  }

  function formatLive(t, liveEntry) {
    const fb = liveEntry?.fb || t.fb || {};
    if (t.type === 'TIMER') {
      const sp = Number(t.preset ?? liveEntry?.preset ?? 1000);
      const elapsed = Number(fb.elapsed ?? 0);
      const done = !!(fb.done ?? t.value);
      return done ? `DONE ${elapsed}/${sp} ms` : `${elapsed}/${sp} ms`;
    }
    if (t.type === 'COUNTER') {
      const sp = Number(t.preset ?? liveEntry?.preset ?? 1);
      const count = Number(fb.count ?? liveEntry?.value ?? t.value ?? 0);
      const done = !!(fb.done);
      return done ? `${count}/${sp} DONE` : `${count}/${sp}`;
    }
    if (t.type === 'PID') {
      const pv = Number(fb.pv ?? 0);
      const sp = Number(t.preset ?? liveEntry?.preset ?? fb.sp ?? 0);
      const out = Number(fb.out ?? liveEntry?.value ?? t.value ?? 0);
      const err = Number(fb.err ?? sp - pv);
      const auto = fb.enabled !== false;
      return `${auto ? 'AUTO' : 'MAN'} PV ${pv.toFixed(2)} SP ${sp.toFixed(2)} OUT ${out.toFixed(2)} (err ${err.toFixed(2)})`;
    }
    if (t.type === 'AVG') {
      const pv = Number(fb.pv ?? 0);
      const avg = Number(fb.avg ?? liveEntry?.value ?? t.value ?? 0);
      const win = Number(t.preset ?? liveEntry?.preset ?? 1);
      const n = Number(fb.count ?? 0);
      const ready = !!fb.ready;
      return `PV ${pv.toFixed(2)} → AVG ${avg.toFixed(2)} (${n}/${win}${ready ? ' ready' : ''})`;
    }
    if (t.type === 'FLOW') {
      const gpm = Number(fb.gpm ?? liveEntry?.value ?? t.value ?? 0);
      const k = Number(t.preset ?? 100);
      const ready = !!fb.ready;
      return `${gpm.toFixed(3)} GPM (K ${k}${ready ? ' · new sample' : ''})`;
    }
    if (t.type === 'ALT') {
      const lead = Number(fb.activeUnit ?? liveEntry?.value ?? t.value ?? 0);
      const lag = Number.isInteger(fb.lagIndex) ? fb.lagIndex + 1 : 0;
      const ready = !!fb.ready;
      const fault = !!fb.fault;
      const en = fb.enabled !== false;
      const stage = fb.pumpStage || 'normal';
      if (fault) return 'FAULT — no units online';
      if (fb.offActive || stage === 'off') return `OFF · lead ${lead || '—'}`;
      if (!en) return `DISABLED · lead ${lead || '—'}`;
      const stageLabel = (stage === 'lag' || stage === 'up') ? ' · LAG'
        : (stage === 'high' || stage === 'down') ? ' · HIGH'
        : '';
      return `Lead ${lead}${lag > 0 ? ` · lag ${lag}` : ''}${stageLabel}${ready ? '' : ' · waiting'}`;
    }
    const v = liveEntry?.value ?? t.value;
    if (Array.isArray(v)) {
      const preview = v.slice(0, 4).map((x) => (Number.isInteger(x) ? x : Number(x).toFixed(2))).join(', ');
      return `[${preview}${v.length > 4 ? ', …' : ''}] (${v.length})`;
    }
    if (t.type === 'BOOL') return v ? 'ON' : 'OFF';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    return String(v ?? '—');
  }

  function liveEntryFor(id, live) {
    const fromLive = (live || []).find((x) => x.tagId === id);
    const tag = tags.find((x) => x.id === id);
    if (!tag) return null;
    if (fromLive) {
      return {
        tagId: id,
        value: fromLive.value,
        type: tag.type,
        preset: fromLive.preset ?? tag.preset,
        mode: fromLive.mode ?? tag.mode,
        fb: fromLive.fb ?? tag.fb,
        forceInput: fromLive.forceInput ?? tag.forceInput,
        forceOutput: fromLive.forceOutput ?? tag.forceOutput,
        forceValue: fromLive.forceValue,
        logicValue: fromLive.logicValue,
        role: tag.role,
        updatedAt: fromLive.updatedAt ?? null,
      };
    }
    return {
      tagId: id,
      value: tag.value,
      type: tag.type,
      preset: tag.preset,
      mode: tag.mode,
      fb: tag.fb,
      forceInput: tag.forceInput,
      forceOutput: tag.forceOutput,
      forceValue: tag.forceValue,
      role: tag.role,
      updatedAt: null,
    };
  }

  function isDigitalOn(entry) {
    if (!entry) return false;
    return !!entry.value;
  }

  function formatIoValue(entry) {
    if (!entry) return '—';
    if (entry.type === 'TIMER' || entry.type === 'COUNTER' || entry.type === 'PID' || entry.type === 'AVG' || entry.type === 'FLOW' || entry.type === 'ALT') {
      const tag = tags.find((x) => x.id === entry.tagId) || entry;
      return formatLive(tag, entry);
    }
    let text;
    if (entry.type === 'BOOL') text = entry.value ? 'ON' : 'OFF';
    else {
      const v = entry.value;
      text = typeof v === 'number'
        ? (Number.isInteger(v) ? String(v) : v.toFixed(3))
        : String(v ?? '—');
    }
    if ((entry.forceInput || entry.forceOutput) && entry.logicValue !== undefined) {
      const logic = entry.type === 'BOOL'
        ? (entry.logicValue ? 'ON' : 'OFF')
        : String(entry.logicValue);
      return `${text} (logic ${logic})`;
    }
    return text;
  }

  function tableHtml(headers, rows) {
    const ths = headers.map((h) => {
      const s = String(h ?? '');
      return s.trimStart().startsWith('<th') ? s : `<th>${s}</th>`;
    });
    return `<table class="data-table"><thead><tr>${ths.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function tagHeaderCellHtml(col) {
    const cls = col.frozen ? ' class="cell-tag-frozen"' : '';
    if (col.headerSpecial === 'histAll') return `<th class="cell-hist">${tagHistorianHeaderHtml()}</th>`;
    if (col.special === 'forceEn' || col.special === 'forceVal' || col.special === 'actions' || col.special === 'hist' || col.sortable === false) {
      return `<th${cls}>${col.label}</th>`;
    }
    return `<th${cls}>${tagSortHeaderHtml(col)}</th>`;
  }

  const TAG_TABLE_COLUMNS = [
    { key: 'id', label: 'Tag<br><span class="th-sub">id · HMI label</span>', frozen: true },
    { key: 'type', label: 'Type' },
    { key: 'role', label: 'Role' },
    { key: 'bits', label: 'Bits' },
    {
      key: 'sp',
      label: 'Setpoint (SP)<br><span class="th-sub">Timer: ms · Counter: count · PID: gains (SP in Addr) · AVG: window</span>',
    },
    {
      key: 'mode',
      label: 'Mode<br><span class="th-sub">TON/TOF/TP · CTU/CTD · P/PI/PID · MOV/EMA</span>',
    },
    { key: 'driver', label: 'Driver<br><span class="th-sub">Driver id</span>' },
    {
      key: 'driverKind',
      label: 'Link<br><span class="th-sub">Modbus · MQTT · Simulator</span>',
    },
    {
      key: 'addr',
      label: 'Addr<br><span class="th-sub">Modbus reg · MQTT topic · payload</span>',
    },
    {
      key: 'scale',
      label: 'Scale<br><span class="th-sub">× raw + offset (INT/REAL)</span>',
    },
    { key: 'alarmEn', label: 'Alm', sortable: false },
    { key: 'alarmOL', label: 'OL<br><span class="th-sub">Outer low</span>', sortable: false },
    { key: 'alarmIL', label: 'IL<br><span class="th-sub">Inner low</span>', sortable: false },
    { key: 'alarmState', label: 'State', sortable: false },
    { key: 'alarmIH', label: 'IH<br><span class="th-sub">Inner high</span>', sortable: false },
    { key: 'alarmOH', label: 'OH<br><span class="th-sub">Outer high</span>', sortable: false },
    {
      key: 'alarmCond',
      label: 'Condition<br><span class="th-sub">BOOL when ON/OFF</span>',
      sortable: false,
    },
    { key: 'live', label: 'Live' },
    {
      key: 'hist',
      label: 'Hist',
      sortable: false,
      special: 'hist',
      headerSpecial: 'histAll',
    },
    {
      key: 'forceEn',
      label: 'Force<br><span class="th-sub">On</span>',
      sortable: false,
      special: 'forceEn',
    },
    {
      key: 'forceVal',
      label: 'Force val<br><span class="th-sub">value · Apply</span>',
      sortable: false,
      special: 'forceVal',
    },
    { key: null, label: '', sortable: false, special: 'actions' },
  ];

  function tagSortValue(tag, key) {
    switch (key) {
      case 'id': return `${String(tag.id || '').toLowerCase()}\t${String(tag.label || '').toLowerCase()}`;
      case 'type': return tag.type || '';
      case 'role': return tag.role || '';
      case 'bits': return normalizeWordWidth(tag.type, tag.wordWidth);
      case 'sp': return Number(tag.preset) || 0;
      case 'mode': return tag.mode || '';
      case 'driver': return String(tag.driverId || '').toLowerCase();
      case 'driverKind': return tagDriverKindLabel(tag).toLowerCase();
      case 'addr': return formatAddr(tag).toLowerCase();
      case 'scale': return formatTagScale(tag).toLowerCase();
      case 'alarmEn': return tag.alarmsEnabled ? '1' : '0';
      case 'hist': return tagHistorianEnabled(tag) ? '1' : '0';
      case 'alarmOL': return Number(tag.alarmOuterLow);
      case 'alarmIL': return Number(tag.alarmInnerLow);
      case 'alarmIH': return Number(tag.alarmInnerHigh);
      case 'alarmOH': return Number(tag.alarmOuterHigh);
      case 'alarmState': return tagAlarmLevel(tag, liveEntryFor(tag.id, lastLive)) || '';
      case 'alarmCond': return String(tag.alarmCondition || '').toLowerCase();
      case 'live': {
        const entry = liveEntryFor(tag.id, lastLive);
        return formatLive(tag, entry).toLowerCase();
      }
      default: return '';
    }
  }

  function compareTags(a, b) {
    const key = tagSort.key;
    const dir = tagSort.dir === 'desc' ? -1 : 1;
    const va = tagSortValue(tags[a], key);
    const vb = tagSortValue(tags[b], key);
    if (key === 'bits' || key === 'sp' || key.startsWith('alarmO') || key.startsWith('alarmI')) {
      return dir * ((Number(va) || 0) - (Number(vb) || 0));
    }
    return dir * String(va).localeCompare(String(vb), undefined, { numeric: true });
  }

  function readTagViewFilters() {
    try {
      const raw = localStorage.getItem(TAG_VIEW_FILTERS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id) => TAG_VIEW_FILTER_IDS.includes(id)));
    } catch {
      return new Set();
    }
  }

  function persistTagViewFilters() {
    localStorage.setItem(TAG_VIEW_FILTERS_KEY, JSON.stringify([...tagViewFilters]));
  }

  function tagMatchesViewFilter(tag, filterId) {
    if (!tag) return false;
    switch (filterId) {
      case 'io':
        return tag.role === 'input' || tag.role === 'output';
      case 'i':
        return tag.role === 'input';
      case 'r':
        return tag.role === 'output';
      case 'b':
        return tag.type === 'BOOL';
      case 'fb':
        return tag.role === 'fb' || FB_TYPES.includes(tag.type);
      default:
        return false;
    }
  }

  function tagPassesViewFilters(tag) {
    if (!tagViewFilters.size) return true;
    for (const id of tagViewFilters) {
      if (tagMatchesViewFilter(tag, id)) return true;
    }
    return false;
  }

  function filteredTagIndices() {
    return tags.map((_, i) => i).filter((i) => tagPassesViewFilters(tags[i]) || i === tagEditRow);
  }

  function syncTagViewFilterButtons() {
    document.querySelectorAll('[data-tag-view-filter]').forEach((btn) => {
      const id = btn.dataset.tagViewFilter;
      const on = tagViewFilters.has(id);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function toggleTagViewFilter(filterId) {
    if (!TAG_VIEW_FILTER_IDS.includes(filterId)) return;
    if (tagViewFilters.has(filterId)) tagViewFilters.delete(filterId);
    else tagViewFilters.add(filterId);
    persistTagViewFilters();
    syncTagViewFilterButtons();
    renderTags();
  }

  function sortedTagIndices() {
    const indices = filteredTagIndices();
    if (tagEditRow != null) {
      const rest = indices.filter((i) => i !== tagEditRow);
      rest.sort(compareTags);
      return [tagEditRow, ...rest];
    }
    indices.sort(compareTags);
    return indices;
  }

  function tagSortHeaderHtml(col) {
    if (col.sortable === false || !col.key) return col.label;
    const active = tagSort.key === col.key;
    const arrow = active ? (tagSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<button type="button" class="th-sort${active ? ' active' : ''}" data-tag-sort="${esc(col.key)}" title="Sort by ${esc(col.label.replace(/<[^>]+>/g, ''))}">${col.label}${arrow}</button>`;
  }

  function bindTagSortHeaders(host) {
    host.querySelectorAll('[data-tag-sort]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.tagSort;
        if (tagSort.key === key) tagSort.dir = tagSort.dir === 'asc' ? 'desc' : 'asc';
        else {
          tagSort.key = key;
          tagSort.dir = 'asc';
        }
        renderTags();
      };
    });
  }

  function runtimeScanActive(rt) {
    if (rt?.running && !rt?.paused) return true;
    return !!(lastOptaRuntime && lastOptaRuntime.running);
  }

  function runtimeStatusLabel(rt) {
    if (!rt?.running) return 'Stopped';
    if (rt.paused) return 'Paused';
    return 'Running';
  }

  function updateRuntimeButtons(rt) {
    rt = rt || lastRuntime || {};
    const running = !!rt?.running;
    const paused = !!rt?.paused;
    const remoteOn = lastSettings?.remoteExecution === true;
    const startBtn = $('btn-start');
    const pauseBtn = $('btn-pause');
    const stopBtn = $('btn-stop');
    if (startBtn) {
      if (remoteOn) {
        startBtn.disabled = !!paused;
        startBtn.textContent = paused ? 'Resume' : 'Download & Start';
        startBtn.title = 'Compile ST to bytecode, deploy to Opta via MQTT, then start scan on device';
      } else {
        startBtn.disabled = running && !paused;
        startBtn.textContent = paused ? 'Resume' : 'Start';
        startBtn.title = 'Validate and run ST on this PC';
      }
    }
    if (pauseBtn) pauseBtn.disabled = !running || paused;
    if (stopBtn) stopBtn.disabled = !running;
  }

  function formatSerialModbusStatus(h) {
    if (!h) return 'No Modbus RTU driver';
    const drv = drivers.find((d) => d.id === h.id);
    const configured = (h.configuredPort || drv?.serialPort || drv?.rtu?.serialPort || '').trim();
    const active = (h.activePort || h.serialPort || configured || '—').trim();
    const cfgUp = configured.toUpperCase();
    const actUp = active.toUpperCase();
    if (h.connected) {
      if (h.portFallback && configured && cfgUp !== actUp) {
        return `Connected on <strong>${esc(active)}</strong><br><small class="muted">Driver saved as ${esc(configured)} — port not present; auto-switched to ${esc(active)}. Set <strong>Serial port</strong> to ${esc(active)} in Drivers to clear this.</small>`;
      }
      return `Connected on <strong>${esc(active)}</strong>`;
    }
    const err = (h.message || '').trim();
    if (configured && cfgUp !== actUp) {
      return `Not connected · saved ${esc(configured)}, tried ${esc(active)}${err ? `<br><small>${esc(err)}</small>` : ''}`;
    }
    return `Not connected · ${esc(active)}${err ? `<br><small>${esc(err)}</small>` : ''}`;
  }

  function showBootError(msg) {
    const text = esc(String(msg || 'Dashboard load failed'));
    const host = $('status-cards');
    if (host) {
      host.innerHTML = `<div class="card warn"><h3>Error</h3><p>${text}</p></div>`;
    }
    const viewport = document.getElementById('hmi-viewport');
    if (viewport && !viewport.querySelector('.hmi-screen-stage, .hmi-live-3d-frame, .hmi-live-plan-frame, svg')) {
      viewport.innerHTML = `<p class="panel-hint err">Could not load dashboard data: ${text}. Check the server console, then reload (Ctrl+F5).</p>`;
    }
    const hint = document.querySelector('.hmi-display-hint');
    if (hint && !viewport?.querySelector('svg, iframe')) {
      hint.innerHTML = `<span class="err-text">Dashboard load failed — ${text}</span>`;
    }
  }

  function finishDashboardBoot(data) {
    if (data?.activeProgram) PeaklogicProgram?.setProgramActivePath(data.activeProgram);
    PeaklogicProgram?.setStEditorPath(data?.activeProgram);
    refreshProjectLibrary().catch(console.error);
    refreshPdmAssetLists().catch(console.error);
    const urlParams = new URLSearchParams(location.search);
    const hmiParam = urlParams.get('hmi');
    const projectParam = urlParams.get('project');
    const openParam = urlParams.get('open');
    const runHmi = () => {
      if (hmiParam) PeaklogicHmi?.openFromUrlParam?.(hmiParam, { force: true });
    };
    const deepLink = projectParam && openParam === '1'
      ? openProjectById(projectParam, { silent: true }).then(runHmi)
      : (hmiParam ? Promise.resolve().then(runHmi) : Promise.resolve());
    return deepLink.then(() => {
    const composerOpen = urlParams.get('composerOpen');
    if (composerOpen) {
      PeaklogicHmi?.openComposerEditing?.(composerOpen);
      urlParams.delete('composerOpen');
      const qs = urlParams.toString();
      history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
    }
    if (data) maybePromptHwWizard(data);
    const setupTab = new URLSearchParams(location.search).get('openSetup');
    if (setupTab) {
      openPopup('project');
      showSetupTab(setupTab);
    }
    }).catch(console.error);
  }

  function startDashboardRuntime() {
    pollTimer = null;
    startLiveWebSocket();
    restartDashboardPoll();
    restartFullRefreshTimer();
  }

  function updateStatusCards(st, tg, drvHealth) {
    const host = $('status-cards');
    if (!host) return;
    const health = drvHealth || Object.values(driverHealthMap);
    const rtu = health.find((h) => h.type === 'modbus_rtu' || h.type === 'vgreen_epc' || h.type === 'pentair_rs485' || h.type === 'modbus_bridge');
    const drvOk = !rtu || rtu.connected;
    const drvDetail = rtu
      ? formatSerialModbusStatus(rtu)
      : (health.length ? health.map((h) => `${h.id}: ${h.connected ? 'OK' : 'Off'}`).join(', ') : 'no driver');
    const rtClass = st.paused ? 'warn' : (st.running ? 'ok' : '');
    const scanActive = runtimeScanActive(st);
    host.innerHTML = `
      <div class="card ${rtClass}"><h3>Runtime</h3><p>${runtimeStatusLabel(st)}</p><small>${st.lastCycleMs}ms · ${st.stats?.cycles || 0} cycles</small></div>
      <div class="card ${drvOk ? 'ok' : 'warn'}"><h3>Serial / Modbus</h3><p>${drvDetail}</p>${scanActive && !drvOk ? '<small>Running but port not open — no I/O traffic</small>' : ''}</div>
      <div class="card"><h3>Tags</h3><p>${tg.count || tags.length} / ${tagMax}</p></div>
      <div class="card ${st.programOk ? 'ok' : 'warn'}"><h3>Program</h3><p>${st.programOk ? 'Valid' : 'Check'}</p></div>`;
  }

  function updateTagsDirtyHint() {
    const el = $('tags-dirty-hint');
    if (!el) return;
    if (tagsDirty) {
      el.textContent = 'Unsaved tag changes — click Save tags';
      el.className = 'inline-msg warn';
    } else {
      el.textContent = '';
      el.className = 'inline-msg muted';
    }
  }

  function tagForceState(t) {
    const entry = liveEntryFor(t.id, lastLive);
    return {
      forceInput: !!(entry?.forceInput ?? t.forceInput),
      forceOutput: !!(entry?.forceOutput ?? t.forceOutput),
      forceValue: entry?.forceValue ?? t.forceValue ?? t.value,
    };
  }

  /** Input tags: force read; output/memory/fb: force write after logic. */
  function forceDirectionForRole(role) {
    if (role === 'input') return { forceInput: true, forceOutput: false };
    return { forceInput: false, forceOutput: true };
  }

  function tagsTableTagSignature(list) {
    return (list || []).map((t) => {
      let extra = '';
      if (t.type === 'PID') {
        const fb = t.fb || {};
        extra = `\t${fb.pvId || ''}\t${fb.spId || ''}\t${fb.outId || ''}\t${t.preset}\t${t.kp}\t${t.ki}\t${t.kd}\t${t.outMin}\t${t.outMax}\t${t.mode}`;
      } else if (t.driverId || t.driverAddress != null) {
        extra = `\t${t.driverId || ''}\t${JSON.stringify(t.driverAddress)}`;
      }
      return `${t.id}\t${t.label || ''}\t${t.type}\t${t.role}${extra}`;
    }).join('\n');
  }

  function tagForceValueInputHtml(t, fs) {
    const val = fs.forceValue ?? t.value;
    if (t.type === 'BOOL') {
      const on = val === true || val === 1 || val === '1' || val === 'true';
      return `<select data-fv class="tag-force-val"><option value="0"${on ? '' : ' selected'}>OFF</option><option value="1"${on ? ' selected' : ''}>ON</option></select>`;
    }
    return `<input data-fv class="tag-force-val" value="${esc(String(val ?? ''))}">`;
  }

  function tagForceEnabledCellHtml(t) {
    const fs = tagForceState(t);
    const on = fs.forceInput || fs.forceOutput;
    const dirHint = t.role === 'input'
      ? 'title="Skips driver read"'
      : 'title="Overrides logic/output write"';
    return `<td class="tag-force-cell tag-force-en-cell"><input type="checkbox" data-fe ${on ? 'checked' : ''} ${dirHint} aria-label="Force ${esc(t.id)}"></td>`;
  }

  function tagForceValueCellHtml(t) {
    const fs = tagForceState(t);
    return `<td class="tag-force-cell tag-force-val-cell"><div class="tag-force-val-wrap">${tagForceValueInputHtml(t, fs)}<button type="button" class="btn btn-sm" data-force-apply>Apply</button></div></td>`;
  }

  function parseForceValue(type, raw) {
    if (type === 'BOOL') return raw === 'true' || raw === '1' || raw === true;
    return parseFloat(raw);
  }

  function mergeTagForceFromServer(updated) {
    if (!updated?.id) return;
    const idx = tags.findIndex((x) => x.id === updated.id);
    if (idx >= 0) tags[idx] = { ...tags[idx], ...updated };
  }

  function syncTagsForceFromServer(serverTags) {
    if (!Array.isArray(serverTags)) return;
    const byId = new Map(serverTags.map((t) => [t.id, t]));
    tags = tags.map((t) => {
      const fresh = byId.get(t.id);
      if (!fresh) return t;
      return {
        ...t,
        value: fresh.value,
        forceInput: fresh.forceInput,
        forceOutput: fresh.forceOutput,
        forceValue: fresh.forceValue,
        alarmLevel: fresh.alarmLevel ?? t.alarmLevel,
      };
    });
  }

  function updateForceCellsFromLive() {
    document.querySelectorAll('#tags-table tr[data-id]').forEach((tr) => {
      if (tr.classList.contains('tag-editing')) return;
      if (tr.querySelector('[data-fe]:focus,[data-fv]:focus')) return;
      const id = tr.dataset.id;
      const tag = tags.find((x) => x.id === id);
      if (!tag) return;
      const fs = tagForceState(tag);
      const on = fs.forceInput || fs.forceOutput;
      tr.classList.toggle('force-on', on);
      const nameWrap = tr.querySelector('.tag-name') || tr.querySelector('.cell-tag');
      const badge = nameWrap?.querySelector('.tag-force-badge');
      if (nameWrap) {
        const hasBadge = !!badge;
        if (on && !hasBadge) {
          nameWrap.insertAdjacentHTML('beforeend', ' <span class="tag-force-badge" title="Forced">F</span>');
        } else if (!on && badge) {
          badge.remove();
        }
      }
      const en = tr.querySelector('[data-fe]');
      const fv = tr.querySelector('[data-fv]');
      if (en) en.checked = on;
      if (fv?.tagName === 'SELECT') {
        const boolOn = fs.forceValue === true || fs.forceValue === 1 || fs.forceValue === '1';
        fv.value = boolOn ? '1' : '0';
      } else if (fv) {
        fv.value = String(fs.forceValue ?? tag.value ?? '');
      }
    });
  }

  function applyForceFromRow(tr) {
    const id = tr?.dataset?.id;
    if (!id) return Promise.resolve();
    const tag = tags.find((x) => x.id === id);
    const type = tag?.type || 'BOOL';
    const enabledEl = tr.querySelector('[data-fe]');
    if (!enabledEl) return Promise.resolve();
    if (!enabledEl.checked) {
      return api.clearForce(id).then((r) => {
        if (r?.tag) mergeTagForceFromServer(r.tag);
        return refreshAll();
      }).then(() => {
        if (isPopupOpen('tags')) updateForceCellsFromLive();
      });
    }
    const dir = forceDirectionForRole(tag?.role);
    const fv = parseForceValue(type, tr.querySelector('[data-fv]')?.value);
    if (type !== 'BOOL' && !Number.isFinite(fv)) {
      alert('Enter a valid force value.');
      return Promise.resolve();
    }
    return api.setForce({
      tagId: id,
      forceInput: dir.forceInput,
      forceOutput: dir.forceOutput,
      forceValue: fv,
    }).then((r) => {
      mergeTagForceFromServer(r.tag);
      return refreshAll();
    }).then(() => {
      if (isPopupOpen('tags')) updateForceCellsFromLive();
    });
  }

  function renderTags() {
    const host = $('tags-table');
    if (!host) return;
    updateTagsDirtyHint();
    const countEl = $('tag-count');
    if (countEl) {
      const visible = filteredTagIndices().length;
      countEl.textContent = tagViewFilters.size && visible !== tags.length
        ? `(${visible} shown · ${tags.length}/${tagMax})`
        : `(${tags.length}/${tagMax})`;
    }
    syncTagViewFilterButtons();
    const tagHeaders = TAG_TABLE_COLUMNS.map((col) => tagHeaderCellHtml(col));
    const rows = sortedTagIndices().map((i) => tagRowHtml(tags[i], i, tagEditRow === i));
    host.innerHTML = tableHtml(tagHeaders, rows);
    bindTagSortHeaders(host);
    host.querySelectorAll('tr.tag-editing').forEach((tr) => {
      bindTagEditRow(tr, +tr.dataset.i);
    });
    bindTagRowActions(host);
    bindTagForceCells(host);
    bindTagHistorianCells(host);
    tagsTableTagSig = tagsTableTagSignature(tags);
    tagsForceEditing = false;
  }

  function readTagRowInputs(tr, i) {
    const idx = tagRowIndex(tr, i);
    if (!tags[idx]) return;
    tr.querySelectorAll('[data-f]').forEach((inp) => {
      const f = inp.dataset.f;
      if (f === 'driverAddress') {
        /* set via readTagAddrFromRow */
      } else if (f === 'wordWidth') {
        tags[idx].wordWidth = normalizeWordWidth(tags[idx].type, +inp.value);
      } else if (f === 'arrayLen') {
        const n = parseInt(inp.value, 10);
        const len = Number.isFinite(n) ? Math.max(1, Math.min(62, n)) : 1;
        tags[idx].arrayLen = len;
        if (len > 1 && tags[idx].type === 'INT') {
          const cur = Array.isArray(tags[idx].value) ? tags[idx].value : [];
          tags[idx].value = Array.from({ length: len }, (_, j) => cur[j] ?? 0);
        } else if (len <= 1 && Array.isArray(tags[idx].value)) {
          tags[idx].value = tags[idx].value[0] ?? 0;
          delete tags[idx].arrayLen;
        }
      } else if (f === 'preset') {
        if (tags[idx].type === 'PID') {
          const n = parseFloat(inp.value);
          tags[idx].preset = Number.isFinite(n) ? n : 0;
        } else if (tags[idx].type === 'AVG') {
          const n = parseInt(inp.value, 10);
          tags[idx].preset = Number.isFinite(n) ? Math.max(1, Math.min(256, n)) : 1;
        } else if (tags[idx].type === 'FLOW') {
          const n = parseFloat(inp.value);
          tags[idx].preset = Number.isFinite(n) && n > 0 ? n : 100;
        } else {
          const n = parseInt(inp.value, 10);
          tags[idx].preset = Number.isFinite(n) && n > 0
            ? n
            : (tags[idx].type === 'TIMER' ? 1000 : 1);
        }
      } else if (['kp', 'ki', 'kd', 'outMin', 'outMax'].includes(f)) {
        const n = parseFloat(inp.value);
        tags[idx][f] = Number.isFinite(n) ? n : 0;
      } else if (f === 'scale') {
        const n = parseFloat(inp.value);
        tags[idx].scale = Number.isFinite(n) && n !== 0 ? n : 1;
      } else if (f === 'offset') {
        const n = parseFloat(inp.value);
        tags[idx].offset = Number.isFinite(n) ? n : 0;
      } else if (f === 'alarmsEnabled') {
        tags[idx].alarmsEnabled = !!inp.checked;
      } else if (f === 'graphEnabled') {
        tags[idx].graphEnabled = !!inp.checked;
      } else if (['alarmOuterLow', 'alarmInnerLow', 'alarmInnerHigh', 'alarmOuterHigh'].includes(f)) {
        const raw = inp.value.trim();
        if (raw === '') tags[idx][f] = null;
        else {
          const n = parseFloat(raw);
          tags[idx][f] = Number.isFinite(n) ? n : null;
        }
      } else if (f === 'alarmCondition') {
        tags[idx].alarmCondition = inp.value === 'off' ? 'off' : 'on';
      } else if (f === 'mode') {
        tags[idx].mode = inp.value;
      } else if (f === 'pidPvId') {
        tags[idx].fb = { ...(tags[idx].fb || {}), pvId: inp.value.trim() };
      } else if (f === 'pidSpId') {
        tags[idx].fb = { ...(tags[idx].fb || {}), spId: inp.value.trim() };
      } else if (f === 'pidOutId') {
        tags[idx].fb = { ...(tags[idx].fb || {}), outId: inp.value.trim() };
      } else if (f === 'pidAlarmHiId') {
        tags[idx].fb = { ...(tags[idx].fb || {}), alarmHiId: inp.value.trim() };
      } else if (f === 'pidAlarmLoId') {
        tags[idx].fb = { ...(tags[idx].fb || {}), alarmLoId: inp.value.trim() };
      } else if (f === 'levelInputMode') {
        tags[idx].fb = { ...(tags[idx].fb || {}), levelInputMode: inp.value };
      } else if (f === 'id') {
        tags[idx].id = applyTagId(inp.value.trim(), tags[idx].type, tags[idx].role, idx);
      } else if (f === 'label') {
        tags[idx].label = String(inp.value || '').trim().slice(0, 80);
      } else tags[idx][f] = inp.value;
    });
    readTagDriverFromRow(tr, idx);
    readTagAddrFromRow(tr, idx);
    if (FB_TYPES.includes(tags[idx].type)) {
      tags[idx].role = 'fb';
      if (tags[idx].type === 'PID') {
        if (tags[idx].preset == null || !Number.isFinite(Number(tags[idx].preset))) tags[idx].preset = 0;
        if (tags[idx].kp == null || !Number.isFinite(Number(tags[idx].kp))) tags[idx].kp = 1;
        if (tags[idx].ki == null || !Number.isFinite(Number(tags[idx].ki))) tags[idx].ki = 0;
        if (tags[idx].kd == null || !Number.isFinite(Number(tags[idx].kd))) tags[idx].kd = 0;
        if (tags[idx].outMin == null || !Number.isFinite(Number(tags[idx].outMin))) tags[idx].outMin = 0;
        if (tags[idx].outMax == null || !Number.isFinite(Number(tags[idx].outMax))) tags[idx].outMax = 100;
        if (!tags[idx].mode) tags[idx].mode = 'PID';
      } else if (tags[idx].type === 'AVG') {
        if (tags[idx].preset == null || tags[idx].preset <= 0) tags[idx].preset = 1;
        if (!tags[idx].mode) tags[idx].mode = 'MOV';
      } else if (tags[idx].type === 'FLOW') {
        if (tags[idx].preset == null || tags[idx].preset <= 0) tags[idx].preset = 100;
        if (!tags[idx].mode) tags[idx].mode = 'GPM';
      } else if (tags[idx].type === 'ALT') {
        if (!tags[idx].mode) tags[idx].mode = 'ALT2';
        tags[idx].preset = tags[idx].mode === 'ALT4' ? 4 : tags[idx].mode === 'ALT3' ? 3 : 2;
      } else if (tags[idx].preset == null || tags[idx].preset <= 0) {
        tags[idx].preset = tags[idx].type === 'TIMER' ? 1000 : 1;
      }
      if (!tags[idx].mode) {
        tags[idx].mode = tags[idx].type === 'TIMER' ? 'TON'
          : tags[idx].type === 'PID' ? 'PID'
          : tags[idx].type === 'AVG' ? 'MOV'
          : tags[idx].type === 'FLOW' ? 'GPM'
          : 'CTU';
      }
      tags[idx].fb = ensureTagFb(tags[idx].type, tags[idx].fb);
      if (tags[idx].type === 'COUNTER') tags[idx].value = tags[idx].fb.count ?? 0;
      if (tags[idx].type === 'PID') {
        if (!tags[idx].fb.spId) tags[idx].fb.sp = tags[idx].preset;
        tags[idx].value = tags[idx].fb.out ?? 0;
      }
      if (tags[idx].type === 'AVG') tags[idx].value = tags[idx].fb.avg ?? 0;
      if (tags[idx].type === 'FLOW') tags[idx].value = tags[idx].fb.gpm ?? 0;
      if (tags[idx].type === 'ALT') tags[idx].value = tags[idx].fb.activeUnit ?? 0;
    }
    tagsDirty = true;
  }

  function ensureTagFb(type, fb) {
    const f = fb && typeof fb === 'object' ? fb : {};
    if (type === 'COUNTER') {
      return {
        count: Number.isFinite(f.count) ? f.count : 0,
        done: !!f.done,
        cu: !!f.cu,
        cd: !!f.cd,
        reset: !!f.reset,
        prevCu: !!f.prevCu,
        prevCd: !!f.prevCd,
      };
    }
    if (type === 'TIMER') {
      return {
        input: !!f.input,
        elapsed: Number.isFinite(f.elapsed) ? f.elapsed : 0,
        done: !!f.done,
        running: !!f.running,
        prevIn: !!f.prevIn,
        reset: !!f.reset,
      };
    }
    if (type === 'PID') {
      return {
        pv: Number.isFinite(f.pv) ? f.pv : 0,
        sp: Number.isFinite(f.sp) ? f.sp : 0,
        out: Number.isFinite(f.out) ? f.out : 0,
        err: Number.isFinite(f.err) ? f.err : 0,
        integral: Number.isFinite(f.integral) ? f.integral : 0,
        prevPv: Number.isFinite(f.prevPv) ? f.prevPv : null,
        enabled: f.enabled !== false,
        pvId: typeof f.pvId === 'string' ? f.pvId : '',
        spId: typeof f.spId === 'string' ? f.spId : '',
        outId: typeof f.outId === 'string' ? f.outId : '',
        alarmHiId: typeof f.alarmHiId === 'string' ? f.alarmHiId : '',
        alarmLoId: typeof f.alarmLoId === 'string' ? f.alarmLoId : '',
        alarmHi: !!f.alarmHi,
        alarmLo: !!f.alarmLo,
      };
    }
    if (type === 'AVG') {
      return {
        pv: Number.isFinite(f.pv) ? f.pv : 0,
        avg: Number.isFinite(f.avg) ? f.avg : 0,
        sum: Number.isFinite(f.sum) ? f.sum : 0,
        count: Number.isFinite(f.count) ? f.count : 0,
        ready: !!f.ready,
        reset: !!f.reset,
        ema: Number.isFinite(f.ema) ? f.ema : 0,
        samples: Array.isArray(f.samples) ? f.samples.slice() : [],
      };
    }
    if (type === 'FLOW') {
      return {
        ctrId: f.ctrId || '',
        tmrId: f.tmrId || '',
        kTagId: f.kTagId || '',
        outId: f.outId || '',
        k: Number.isFinite(f.k) ? f.k : 0,
        gpm: Number.isFinite(f.gpm) ? f.gpm : 0,
        ready: !!f.ready,
        prevTmrDone: !!f.prevTmrDone,
      };
    }
    if (type === 'ALT') {
      const onlineIds = Array.isArray(f.onlineIds) ? f.onlineIds.slice(0, 4) : [];
      const unitOutIds = Array.isArray(f.unitOutIds) ? f.unitOutIds.slice(0, 4) : [];
      const leadSelIds = Array.isArray(f.leadSelIds) ? f.leadSelIds.slice(0, 4) : [];
      const lagSelIds = Array.isArray(f.lagSelIds) ? f.lagSelIds.slice(0, 4) : [];
      const lag2SelIds = Array.isArray(f.lag2SelIds) ? f.lag2SelIds.slice(0, 4) : [];
      while (onlineIds.length < 4) onlineIds.push('');
      while (unitOutIds.length < 4) unitOutIds.push('');
      while (leadSelIds.length < 4) leadSelIds.push('');
      while (lagSelIds.length < 4) lagSelIds.push('');
      while (lag2SelIds.length < 4) lag2SelIds.push('');
      return {
        enabled: !!f.enabled,
        enableId: f.enableId || '',
        advance: !!f.advance,
        advanceId: f.advanceId || '',
        advancePulse: !!f.advancePulse,
        prevAdvance: !!f.prevAdvance,
        autoFault: !!f.autoFault,
        autoFaultId: f.autoFaultId || '',
        leadOutId: f.leadOutId || '',
        lagOutId: f.lagOutId || '',
        offId: f.offId || '',
        highId: f.highId || '',
        lowId: f.lowId || '',
        low2Id: f.low2Id || '',
        levelId: f.levelId || '',
        levelControlEnabled: !!f.levelControlEnabled,
        levelInputMode: f.levelInputMode || 'both',
        levelLowLo: Number.isFinite(f.levelLowLo) ? f.levelLowLo : 0,
        levelLowHi: Number.isFinite(f.levelLowHi) ? f.levelLowHi : 0,
        levelHighLo: Number.isFinite(f.levelHighLo) ? f.levelHighLo : 0,
        levelHighHi: Number.isFinite(f.levelHighHi) ? f.levelHighHi : 0,
        levelOffLo: Number.isFinite(f.levelOffLo) ? f.levelOffLo : 0,
        levelOffHi: Number.isFinite(f.levelOffHi) ? f.levelOffHi : 0,
        offActive: !!f.offActive,
        highActive: !!f.highActive,
        lowActive: !!f.lowActive,
        low2Active: !!f.low2Active,
        pumpStage: f.pumpStage || 'normal',
        onlineIds,
        unitOutIds,
        leadSelIds,
        lagSelIds,
        lag2SelIds,
        unitOnline: Array.isArray(f.unitOnline) ? f.unitOnline.slice(0, 4) : [false, false, false, false],
        unitCount: Number.isFinite(f.unitCount) ? f.unitCount : 2,
        leadIndex: Number.isInteger(f.leadIndex) ? f.leadIndex : 0,
        lagIndex: Number.isInteger(f.lagIndex) ? f.lagIndex : -1,
        lag2Index: Number.isInteger(f.lag2Index) ? f.lag2Index : -1,
        activeUnit: Number.isFinite(f.activeUnit) ? f.activeUnit : 0,
        ready: !!f.ready,
        fault: !!f.fault,
        prevLeadOnline: !!f.prevLeadOnline,
      };
    }
    return { ...f };
  }

  async function ensurePidTag() {
    const existing = tags.find((t) => t.type === 'PID');
    if (existing) return existing.id;
    if (tags.length >= tagMax) {
      alert(`${tagMax} tag limit`);
      return '';
    }
    flushTagEdit();
    const id = nextFbTagId('PID');
    const tag = {
      id,
      type: 'PID',
      role: 'fb',
      value: 0,
      wordWidth: 32,
      preset: 0,
      mode: 'PID',
      kp: 1,
      ki: 0,
      kd: 0,
      outMin: 0,
      outMax: 100,
      fb: ensureTagFb('PID', {}),
      driverId: null,
      driverAddress: null,
      scale: 1,
      offset: 0,
      alarmsEnabled: false,
      alarmOuterLow: null,
      alarmInnerLow: null,
      alarmInnerHigh: null,
      alarmOuterHigh: null,
      alarmCondition: null,
    };
    tags.push(tag);
    try {
      await api.putTags(normalizeTagsForSave(tags));
      tagsDirty = false;
      await refreshAll();
    } catch (e) {
      tags.pop();
      alert(e.message || 'Failed to create PID tag');
      return '';
    }
    return id;
  }

  async function ensureMotorTags() {
    const defs = [
      { id: 'MOTOR1_HOA', label: 'Motor 1 HOA mode', type: 'INT', value: 0 },
      { id: 'MOTOR1_STA', label: 'Motor 1 status', type: 'INT', value: 0 },
      { id: 'MOTOR1_START', label: 'Motor 1 start', type: 'BOOL', value: false },
      { id: 'MOTOR1_STOP', label: 'Motor 1 stop', type: 'BOOL', value: false },
      { id: 'MOTOR1_RESET', label: 'Motor 1 reset', type: 'BOOL', value: false },
      { id: 'MOTOR1_RUN', label: 'Motor 1 run', type: 'BOOL', value: false },
    ];
    const existing = tags.find((t) => t.id === 'MOTOR1_HOA');
    if (existing) {
      let touched = false;
      for (const def of defs) {
        const row = tags.find((t) => t.id === def.id);
        if (row && !String(row.label || '').trim() && def.label) {
          row.label = def.label;
          touched = true;
        }
      }
      if (touched) {
        try {
          await api.putTags(normalizeTagsForSave(tags));
          tagsDirty = false;
          await refreshAll();
        } catch (e) {
          alert(e.message || 'Failed to update motor tag labels');
        }
      }
      return existing.id;
    }
    flushTagEdit();
    let added = 0;
    for (const def of defs) {
      if (tags.find((t) => t.id === def.id)) continue;
      if (tags.length >= tagMax) break;
      const t = def.type;
      tags.push({
        id: def.id,
        label: def.label || '',
        type: t,
        role: 'memory',
        value: def.value,
        wordWidth: normalizeWordWidth(t, 16),
        preset: 0,
        mode: 'TON',
        fb: ensureTagFb(t, {}),
        driverId: null,
        driverAddress: null,
        scale: 1,
        offset: 0,
        alarmsEnabled: false,
        alarmOuterLow: null,
        alarmInnerLow: null,
        alarmInnerHigh: null,
        alarmOuterHigh: null,
        alarmCondition: null,
      });
      added += 1;
    }
    if (!added) return defs[0].id;
    try {
      await api.putTags(normalizeTagsForSave(tags));
      tagsDirty = false;
      await refreshAll();
    } catch (e) {
      for (let i = 0; i < added; i += 1) tags.pop();
      alert(e.message || 'Failed to create motor tags');
      return '';
    }
    return defs[0].id;
  }

  function addNewTag(type) {
    if (tags.length >= tagMax) {
      alert(`${tagMax} tag limit`);
      return;
    }
    flushTagEdit();
    const t = String(type || 'BOOL').toUpperCase();
    const role = FB_TYPES.includes(t) ? 'fb' : 'memory';
    const id = FB_TYPES.includes(t) ? nextFbTagId(t) : nextMemoryTagId(t === 'INT' ? 'INT' : t === 'REAL' ? 'REAL' : 'BOOL');
    const tag = {
      id,
      type: t,
      role,
      value: t === 'BOOL' ? false : 0,
      wordWidth: normalizeWordWidth(t, 16),
      preset: t === 'TIMER' ? 1000 : t === 'COUNTER' ? 1 : t === 'PID' ? 0 : t === 'AVG' ? 1 : 0,
      mode: t === 'TIMER' ? 'TON' : t === 'COUNTER' ? 'CTU' : t === 'PID' ? 'PID' : t === 'AVG' ? 'MOV' : 'TON',
      kp: t === 'PID' ? 1 : undefined,
      ki: t === 'PID' ? 0 : undefined,
      kd: t === 'PID' ? 0 : undefined,
      outMin: t === 'PID' ? 0 : undefined,
      outMax: t === 'PID' ? 100 : undefined,
      fb: ensureTagFb(t, {}),
      driverId: null,
      driverAddress: null,
      scale: 1,
      offset: 0,
      alarmsEnabled: false,
      alarmOuterLow: null,
      alarmInnerLow: null,
      alarmInnerHigh: null,
      alarmOuterHigh: null,
      alarmCondition: null,
      graphEnabled: isTagGraphable({ type: t }),
    };
    tags.push(tag);
    tagsDirty = true;
    tagEditRow = tags.length - 1;
    editingTags = true;
    renderTags();
  }

  function syncTagIdOnEdit(tr, rowIndex) {
    refreshTagEditDerivedCells(tr, rowIndex);
  }

  function bindTagEditRow(tr, rowIndex) {
    tr.querySelectorAll('[data-f=role],[data-f=type]').forEach((inp) => {
      inp.addEventListener('change', () => syncTagIdOnEdit(tr, rowIndex));
    });
    const drvSel = tr.querySelector('[data-driver-select]');
    if (drvSel) {
      drvSel.addEventListener('change', () => {
        syncTagDriverCustom(tr);
        refreshTagAddrEditCell(tr, rowIndex);
      });
      syncTagDriverCustom(tr);
    }
    const tplSel = tr.querySelector('[data-mqtt-template]');
    if (tplSel) {
      tplSel.addEventListener('change', () => syncMqttTemplateCustom(tr));
      syncMqttTemplateCustom(tr);
    }
  }

  function bindTagRowActions(host) {
    host.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => { tagEditRow = +b.dataset.edit; editingTags = true; renderTags(); };
    });
    host.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        const idx = +b.dataset.del;
        tags.splice(idx, 1);
        tagEditRow = null;
        editingTags = false;
        tagsDirty = true;
        renderTags();
      };
    });
    host.querySelectorAll('[data-cancel]').forEach((b) => {
      b.onclick = () => { tagEditRow = null; editingTags = false; renderTags(); };
    });
    host.querySelectorAll('[data-apply]').forEach((b) => {
      b.onclick = () => {
        const tr = b.closest('tr');
        const idx = +b.dataset.apply;
        readTagRowInputs(tr, idx);
        tagEditRow = null;
        editingTags = false;
        api.putTags(normalizeTagsForSave(tags)).then(() => {
          tagsDirty = false;
          return refreshAll();
        }).then(() => {
          renderTags();
        }).catch((e) => {
          alert(e.message || 'Save tag failed');
          tagEditRow = idx;
          editingTags = true;
          renderTags();
        });
      };
    });
    if (tagEditRow != null) bindTagEditors(host.querySelector('tr.tag-editing'));
  }

  function bindTagForceCells(host) {
    host.querySelectorAll('[data-force-apply]').forEach((b) => {
      b.onclick = () => {
        const tr = b.closest('tr');
        if (tr) applyForceFromRow(tr).catch((e) => alert(e.message || 'Force failed'));
      };
    });
  }

  function bindTagsForceDelegation() {
    const host = $('tags-table');
    if (!host || host.dataset.forceDelegate === '1') return;
    host.dataset.forceDelegate = '1';
    host.addEventListener('focusin', (e) => {
      if (e.target.closest('[data-fe],[data-fv]')) tagsForceEditing = true;
    });
    host.addEventListener('focusout', () => {
      setTimeout(() => {
        const tbl = $('tags-table');
        tagsForceEditing = !!tbl?.querySelector('[data-fe]:focus,[data-fv]:focus');
      }, 100);
    });
    host.addEventListener('change', (e) => {
      const fe = e.target.closest('[data-fe]');
      if (!fe) return;
      const tr = fe.closest('tr');
      if (tr) applyForceFromRow(tr).catch((err) => alert(err.message || 'Force failed'));
    });
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const fv = e.target.closest('[data-fv]');
      if (!fv) return;
      e.preventDefault();
      const tr = fv.closest('tr');
      if (tr) applyForceFromRow(tr).catch((err) => alert(err.message || 'Force failed'));
    });
  }

  function bindTagEditors(host) {
    if (!host) return;
    host.querySelectorAll('input,select').forEach((inp) => {
      inp.onfocus = () => { editingTags = true; };
      inp.onblur = () => { setTimeout(() => { editingTags = !!host.querySelector('input:focus,select:focus'); }, 100); };
    });
  }

  function driverFieldsHtml(d) {
    const t = d.type || 'mock';
    if (t === 'modbus_rtu' || t === 'vgreen_epc' || t === 'pentair_rs485') {
      const defBaud = t === 'vgreen_epc' ? 19200 : 9600;
      const defSlave = t === 'vgreen_epc' ? 21 : (t === 'pentair_rs485' ? 0x70 : 1);
      const pollDefault = t === 'pentair_rs485' ? 300000 : 0;
      const extra = t === 'pentair_rs485'
        ? `<label>Device class <select data-df="deviceClass">${opts(['intelliflo', 'intellichlor', 'ultratemp', 'mastertemp', 'valve', 'intellivalve'], d.deviceClass || 'ultratemp')}</select></label>
           <label>Device addr <input data-df="deviceAddr" type="number" value="${d.deviceAddr ?? d.slaveId ?? defSlave}"></label>
           <label>Bus gap ms <input data-df="busGapMs" type="number" min="50" step="10" value="${Number(d.busGapMs) || 120}" title="Gap between mixed-protocol frames on shared RS-485"></label>`
        : `<label>Slave ID <input data-df="slaveId" type="number" value="${d.slaveId ?? defSlave}"></label>`;
      return `<div class="driver-fields form-grid compact">
        <label>Serial port ${portSelectHtml(d.serialPort, true)}</label>
        <label>Baud <input data-df="baud" type="number" value="${d.baud || defBaud}"></label>
        ${extra}
        <label>Parity <select data-df="parity">${opts(['none','even','odd'], d.parity || 'none')}</select></label>
        <label>Poll ms <input data-df="pollIntervalMs" type="number" min="0" step="1000" value="${Number(d.pollIntervalMs) || pollDefault}" title="0 = every scan; e.g. 120000 pump, 300000 heat pump"></label>
      </div>`;
    }
    if (t === 'modbus_tcp') {
      return `<div class="driver-fields form-grid compact">
        <label>Host <input data-df="host" value="${esc(d.host || '127.0.0.1')}"></label>
        <label>Port <input data-df="port" type="number" value="${d.port || 502}"></label>
        <label>Slave ID <input data-df="slaveId" type="number" value="${d.slaveId ?? 1}"></label>
      </div>`;
    }
    if (t === 'serial') {
      return `<div class="driver-fields form-grid compact">
        <label>USB/Serial port ${portSelectHtml(d.port, true)}</label>
        <label>Baud <input data-df="baud" type="number" value="${d.baud || 115200}"></label>
        <label>Profile <input data-df="profile" value="${esc(d.profile || 'default')}"></label>
      </div>`;
    }
    if (t === 'modbus_bridge') {
      return `<div class="driver-fields form-grid compact">
        <label>RTU port ${portSelectHtml(d.serialPort, true)}</label>
        <label>Baud <input data-df="baud" type="number" value="${d.baud || 9600}"></label>
        <label>Listen TCP port <input data-df="listenPort" type="number" value="${d.listenPort || 5020}"></label>
      </div>`;
    }
    if (t === 'mqtt') {
      return `<div class="driver-fields form-grid compact">
        <label>Broker <input data-df="brokerUrl" value="${esc(d.brokerUrl || d.broker || 'mqtt://127.0.0.1')}"></label>
        <label>Client ID <input data-df="clientId" value="${esc(d.clientId || 'peaklogic')}"></label>
      </div>`;
    }
    if (t === 'https') {
      return `<div class="driver-fields form-grid compact">
        <label>Base URL <input data-df="baseUrl" value="${esc(d.baseUrl || d.url || 'https://127.0.0.1')}"></label>
        <label>Poll ms <input data-df="pollIntervalMs" type="number" min="0" step="100" value="${Number(d.pollIntervalMs) || 0}" title="0 = fetch every scan"></label>
        <label>Bearer token <input data-df="bearerToken" type="password" value="${esc(d.bearerToken || '')}" autocomplete="off"></label>
      </div>`;
    }
    if (t === 'nextcentury') {
      const pollMs = Number(d.pollIntervalMs) || 900000;
      const propertyIds = Array.isArray(d.propertyIds) ? d.propertyIds.join(', ') : (d.propertyIds || '');
      const devicesPerSite = Number(d.devicesPerSite) || 1500;
      const pwPlaceholder = (d.hasPassword || d.password)
        ? 'Leave blank to keep saved password'
        : 'Enter password and Save';
      return `<div class="driver-fields form-grid compact">
        <label>Email <input data-df="email" type="email" value="${esc(d.email || '')}" autocomplete="username"></label>
        <label>Password <input data-df="password" type="password" value="" placeholder="${esc(pwPlaceholder)}" autocomplete="current-password"></label>
        <label>Report ID <input data-df="reportId" value="${esc(d.reportId || 'rt_4510')}"></label>
        <label>Poll ms <input data-df="pollIntervalMs" type="number" min="60000" step="1000" value="${pollMs}" title="Default 900000 = 15 minutes"></label>
        <label>Devices / site <input data-df="devicesPerSite" type="number" min="1" step="1" value="${devicesPerSite}" title="Planning estimate for tag/scan load"></label>
        <label>Property IDs <input data-df="propertyIds" value="${esc(propertyIds)}" placeholder="blank = all properties"></label>
        <label>Auto-sync tags <input type="checkbox" data-df="autoSyncTags" ${d.autoSyncTags !== false ? 'checked' : ''} title="Create/update tags from each API poll"></label>
        <p class="muted panel-hint">Tags are auto-created on each poll when enabled (<code>NC_&lt;deviceId&gt;_USAGE</code>, <code>_TEMP</code>, <code>_LEAK</code>). Or use <strong>Drivers → NextCentury API</strong> tab.</p>
      </div>`;
    }
    if (t === 'opta_remote') {
      return `<div class="driver-fields form-grid compact">
        <label>Host <input data-df="host" value="${esc(d.host || '192.168.1.234')}"></label>
        <label>Port <input data-df="port" type="number" value="${d.port || 80}"></label>
        <label>Scan ms <input data-df="scanMs" type="number" min="50" max="5000" value="${d.scanMs || 100}"></label>
        <label>Bearer token <input data-df="bearerToken" type="password" value="${esc(d.bearerToken || '')}" autocomplete="off"></label>
        <p class="muted panel-hint">Use <strong>Program → Remote</strong> to run ST on the device or on this PC.</p>
      </div>`;
    }
    if (t === 'mqtt_parc') {
      const parcDev = lastParcDevices.find((x) => x.deviceId === (d.deviceId || d.id));
      const ateccSerial = d.ateccSerial || parcDev?.ateccSerial || '';
      const snPosition = /^opta_[0-9a-f]{16,18}$/i.test(String(d.id || ''));
      return `<div class="driver-fields form-grid compact">
        <label>Position ID <input data-df="id" value="${esc(d.id)}" title="Permanent infrastructure name — tags and ST bind here"></label>
        <label>Display name <input data-df="name" value="${esc(d.name || '')}" placeholder="Pump skid A"></label>
        <label>Physical device ID <input data-df="deviceId" value="${esc(d.deviceId || '')}" title="MQTT deviceId from Opta firmware (opta_ + ATECC608 serial)"></label>
        <label>Opta IP <input data-df="host" value="${esc(d.host || '')}" placeholder="192.168.1.234" title="Ethernet IP — used for Sync tags and scan expansions when MQTT cache is empty"></label>
        ${ateccSerial ? `<p class="muted panel-hint">ATECC608 serial: <code class="cell-mono">${esc(ateccSerial)}</code></p>` : '<p class="muted panel-hint">Physical device ID is <code>opta_&lt;ATECC608 serial&gt;</code> from firmware. Position ID stays the same when hardware is replaced.</p>'}
        <label>Scan ms <input data-df="scanMs" type="number" min="50" max="5000" value="${d.scanMs || 100}"></label>
        <label>Report sec <input data-df="reportIntervalSec" type="number" min="30" value="${d.reportIntervalSec || 180}" title="Parc telemetry interval on device"></label>
        ${snPosition ? '<p class="muted panel-hint">This driver uses the serial as position ID. Use <strong>Set position name</strong> to assign a permanent plant name.</p>' : ''}
        <p class="muted panel-hint">Broker URL is in <strong>System setup → General</strong> (<code>mqttParc</code>). Tags bind to <strong>Position ID</strong>, not serial number.</p>
      </div>`;
    }
    if (t === 'hal') {
      const hc = d.halConfig || {};
      const stack = hc.stack != null ? hc.stack : 0;
      const i2cBus = hc.i2cBus != null ? hc.i2cBus : 1;
      return `<div class="driver-fields form-grid compact">
        <label>Backend <select data-df="backend">${opts(['sim', 'native'], d.backend || 'sim')}</select></label>
        <label>Plugin path <input data-df="pluginPath" value="${esc(d.pluginPath || '')}" placeholder="/usr/lib/libpeaklogic_hal_sm_i001.so"></label>
        <label>Stack level <input data-hal-cfg="stack" type="number" min="0" max="7" value="${stack}" title="HAT stack 0–7 (SM-I-001 jumpers)"></label>
        <label>I2C bus <input data-hal-cfg="i2cBus" type="number" min="0" max="10" value="${i2cBus}" title="/dev/i2c-N (usually 1 on Pi 4)"></label>
        <p class="muted panel-hint">Tag pins: <code>DI0</code>, <code>DO0</code>, <code>AI0</code>, <code>AO0</code>, <code>CNT0</code>. Presets: <strong>Built-in HAL (sim)</strong>, <strong>Raspberry Pi 4 + Sequent SM-I-001</strong>. <code>stack</code> / <code>i2cBus</code> passed to the board <code>.so</code> as <code>halConfig</code>.</p>
      </div>`;
    }
    if (t === 'bacnet') {
      return `<div class="driver-fields form-grid compact">
        <label>Bind interface <input data-df="interface" value="${esc(d.interface || d.bindInterface || '')}" placeholder="blank = auto"></label>
        <label>UDP port <input data-df="port" type="number" min="1" max="65535" value="${d.port || 47808}"></label>
        <label>Broadcast <input data-df="broadcastAddress" value="${esc(d.broadcastAddress || '')}" placeholder="255.255.255.255"></label>
        <label>APDU timeout ms <input data-df="apduTimeout" type="number" min="500" step="500" value="${Number(d.apduTimeout || d.timeoutMs) || 6000}"></label>
        <label>Poll ms <input data-df="pollIntervalMs" type="number" min="0" step="250" value="${Number(d.pollIntervalMs) || 1000}" title="0 = every scan"></label>
        <label>Default host <input data-df="defaultHost" value="${esc(d.defaultHost || '')}" placeholder="optional tag fallback IP"></label>
        <label>Discover timeout ms <input data-df="discoverTimeoutMs" type="number" min="1000" step="500" value="${Number(d.discoverTimeoutMs) || 5000}"></label>
        <label>Write priority <input data-df="writePriority" type="number" min="1" max="16" value="${Number(d.writePriority) || 8}"></label>
        <label>Allow writes <input type="checkbox" data-df="writeEnabled" ${d.writeEnabled ? 'checked' : ''} title="Enable BACnet writeProperty for output tags"></label>
        <p class="muted panel-hint">Edge appliance only — BACnet/IP uses UDP broadcast on the site LAN. Coexist with the campus BMS; import read-mostly points first.</p>
      </div>`;
    }
    return `<p class="muted">No extra connection fields for ${esc(t)}.</p>`;
  }

  function parcDeviceForDriver(d) {
    const deviceId = String(d?.deviceId || d?.id || '').trim();
    if (!deviceId && !d?.id) return null;
    const list = lastParcDevices || [];
    if (deviceId) {
      const byId = list.find((x) => x.deviceId === deviceId);
      if (byId) return byId;
    }
    if (d?.id) {
      const byPos = list.find((x) => x.positionId === d.id);
      if (byPos) return byPos;
    }
    return null;
  }

  function optaHttpHostForDriver(d) {
    if (!d) return '';
    const dev = parcDeviceForDriver(d);
    const fromMeta = dev?.ethIp || dev?.meta?.ethIp || dev?.meta?.lastHost || dev?.attachHost;
    if (fromMeta) return String(fromMeta).trim();
    if (d.type === 'opta_remote' && d.host) return String(d.host).trim();
    if (d.host) return String(d.host).trim();
    return '';
  }

  function openOptaIoViewForDriver(d) {
    const host = optaHttpHostForDriver(d);
    if (!host) {
      alert('Opta IP unknown — wait for MQTT telemetry (ethIp) or set host on the driver.');
      return;
    }
    window.open(`http://${host}/io-map`, '_blank', 'noopener,noreferrer');
  }

  function parcStatusText(d) {
    const dev = parcDeviceForDriver(d);
    if (!dev) return 'Waiting for MQTT telemetry from this device…';
    const sn = dev.ateccSerial ? `SN ${dev.ateccSerial}` : '';
    const mods = (dev.expansionModules || []).map((m) => `slot ${(m.slot ?? 0) + 1}: ${m.label || m.type}`).join(' · ');
    const parts = [`${dev.tagCount || 0} tag(s) reported`];
    if (sn) parts.push(sn);
    if (mods) parts.push(mods);
    if (dev.stale) parts.push('STALE');
    return parts.join(' · ');
  }

  function swapTypeLabel(t) {
    const map = {
      commission: 'Commissioned',
      like_for_like: 'Like-for-like',
      upgrade: 'Upgrade',
      cross_vendor: 'Cross-vendor',
      replacement: 'Replacement',
    };
    return map[t] || t || '—';
  }

  function formatTs(value) {
    return window.PeaklogicTime?.formatDateTime?.(value)
      || String(value || '').slice(0, 19).replace('T', ' ');
  }

  function formatHardwareHistoryHtml(rows) {
    if (!rows?.length) return '<p class="muted">No hardware history recorded yet.</p>';
    const body = rows.map((r) => {
      const range = `${esc(formatTs(r.installedAt))}`
        + `${r.removedAt ? ` → ${esc(formatTs(r.removedAt))}` : ' → <em>current</em>'}`;
      const identity = [r.vendor, r.model].filter(Boolean).join(' ') || r.platform || '—';
      return `<tr>
        <td>${esc(swapTypeLabel(r.swapType))}</td>
        <td class="cell-mono">${esc(r.serialNumber || '—')}</td>
        <td>${esc(identity)}</td>
        <td class="cell-mono">${esc(r.deviceId || '—')}</td>
        <td class="cell-mono">${range}</td>
      </tr>`;
    }).join('');
    return `<table class="data-table driver-hw-history"><thead>
      <tr><th>Event</th><th>Serial</th><th>Vendor / model</th><th>Device ID</th><th>Installed</th></tr>
    </thead><tbody>${body}</tbody></table>`;
  }

  function formatReportHardwareHistoryHtml(rows) {
    if (!rows?.length) return '<p class="muted">No hardware change-outs recorded yet.</p>';
    const body = rows.map((r) => {
      const pos = r.positionName ? `${r.positionName} (${r.positionId})` : (r.positionId || '—');
      const range = `${esc(formatTs(r.installedAt))}`
        + `${r.removedAt ? ` → ${esc(formatTs(r.removedAt))}` : ' → <em>current</em>'}`;
      return `<tr>
        <td class="cell-mono">${esc(pos)}</td>
        <td class="cell-mono">${esc(r.serialNumber || '—')}</td>
        <td>${esc(swapTypeLabel(r.swapType))}</td>
        <td class="cell-mono">${range}</td>
        <td>${esc(r.note || '—')}</td>
      </tr>`;
    }).join('');
    return `<table class="data-table"><thead>
      <tr><th>Position</th><th>Serial</th><th>Event</th><th>Timestamps</th><th>Note</th></tr>
    </thead><tbody>${body}</tbody></table>`;
  }

  function formatSysLogUser(user) {
    if (!user || typeof user !== 'object') return '—';
    return user.name || user.email || user.id || '—';
  }

  function sysLogLevelClass(level) {
    const lv = String(level || '').toLowerCase();
    if (lv === 'error') return 'syslog-level-error';
    if (lv === 'warn') return 'syslog-level-warn';
    if (lv === 'maintenance') return 'syslog-level-maintenance';
    return '';
  }

  function isNoisySysLogEntry(entry) {
    const text = `${entry?.message || ''} ${entry?.detail?.message || ''}`;
    return /Cellular SIM management requires|Cloud sim management requires/i.test(text);
  }

  function friendlyReportMongoError(err, context = '') {
    const msg = err?.message || String(err || 'Load failed');
    if (/Cellular SIM management requires|Cloud sim management requires/i.test(msg)) {
      const where = context ? ` (${context})` : '';
      return `Server blocked a non-connectivity API${where}. Restart PeakLogic (npm restart), then reopen Reports.`;
    }
    if (/Authentication required/i.test(msg)) {
      return 'Session expired — sign in again, then reopen Reports.';
    }
    return msg;
  }

  async function reportMongoSysLogQuery(params = {}) {
    return peaklogicApiFetch('GET', '/sys-log', params);
  }

  async function reportMongoMqttBrokerLog(params = {}) {
    return peaklogicApiFetch('GET', '/mqtt-broker-log', params);
  }

  function formatMqttBrokerEventLabel(entry) {
    const ev = entry?.detail?.event || '';
    const map = {
      client_connect: 'Connect',
      client_disconnect: 'Disconnect',
      auth_fail: 'Auth fail',
      connection: 'TCP',
      error: 'Error',
      hub_connect: 'Hub up',
      hub_disconnect: 'Hub down',
      hub_error: 'Hub error',
    };
    return map[ev] || ev || '—';
  }

  function formatReportMqttBrokerLogHtml(entries) {
    const rows = entries || [];
    if (!rows.length) return '<p class="muted">No MQTT broker log entries found.</p>';
    const body = rows.map((e) => {
      const at = esc(formatTs(e.at));
      const lv = esc(e.level || 'info');
      const ev = esc(formatMqttBrokerEventLabel(e));
      const client = esc(e.detail?.clientId || '—');
      const ip = esc(e.detail?.ip || '—');
      return `<tr>
        <td class="cell-mono">${at}</td>
        <td class="${sysLogLevelClass(e.level)}">${lv}</td>
        <td class="cell-mono">${ev}</td>
        <td class="cell-mono">${client}</td>
        <td class="cell-mono">${ip}</td>
        <td>${esc(e.message || '—')}</td>
      </tr>`;
    }).join('');
    return `<table class="data-table"><thead>
      <tr><th>Time</th><th>Level</th><th>Event</th><th>Client</th><th>IP</th><th>Message</th></tr>
    </thead><tbody>${body}</tbody></table>`;
  }

  async function reportMongoHardwareHistory(params = {}) {
    const q = {};
    if (params.recent) q.recent = '1';
    if (params.limit) q.limit = String(params.limit);
    return peaklogicApiFetch('GET', '/hardware-history', q);
  }

  function formatReportSysLogHtml(entries) {
    const rows = (entries || []).filter((e) => !isNoisySysLogEntry(e));
    if (!rows.length) return '<p class="muted">No system log entries found.</p>';
    const body = rows.map((e) => {
      const at = esc(formatTs(e.at));
      const lv = esc(e.level || 'info');
      return `<tr>
        <td class="cell-mono">${at}</td>
        <td class="${sysLogLevelClass(e.level)}">${lv}</td>
        <td class="cell-mono">${esc(e.category || '—')}</td>
        <td>${esc(e.message || '—')}</td>
        <td>${esc(formatSysLogUser(e.user))}</td>
      </tr>`;
    }).join('');
    return `<table class="data-table"><thead>
      <tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th><th>User</th></tr>
    </thead><tbody>${body}</tbody></table>`;
  }

  let mongoReportCatalog = null;
  let mongoReportDefs = [];
  let mongoReportPreview = null;

  function isoFromDatetimeLocal(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function datetimeLocalFromIso(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getMongoReportSource() {
    const id = $('mongo-report-source')?.value || 'sys_log';
    return mongoReportCatalog?.sources?.find((s) => s.id === id) || null;
  }

  function readMongoReportSpecFromForm() {
    const source = getMongoReportSource();
    const filter = {};
    source?.filters?.forEach((f) => {
      const el = document.querySelector(`[data-mongo-filter="${f.id}"]`);
      const val = String(el?.value || '').trim();
      if (val) filter[f.id] = val;
    });
    const columns = [];
    document.querySelectorAll('[data-mongo-col]:checked').forEach((el) => {
      columns.push(el.dataset.mongoCol);
    });
    return {
      name: $('mongo-report-name')?.value?.trim() || 'MongoDB report',
      title: $('mongo-report-name')?.value?.trim() || 'MongoDB report',
      sourceId: $('mongo-report-source')?.value || 'sys_log',
      collection: $('mongo-report-collection')?.value || null,
      columns,
      filter,
      since: isoFromDatetimeLocal($('mongo-report-from')?.value),
      until: isoFromDatetimeLocal($('mongo-report-to')?.value),
      limit: parseInt($('mongo-report-limit')?.value || '500', 10),
      sortField: $('mongo-report-sort-field')?.value?.trim() || source?.dateField || 'at',
      sortDir: parseInt($('mongo-report-sort-dir')?.value || '-1', 10),
    };
  }

  function applyMongoReportSpecToForm(spec) {
    if (!spec) return;
    if ($('mongo-report-name')) $('mongo-report-name').value = spec.name || spec.title || '';
    if ($('mongo-report-source')) $('mongo-report-source').value = spec.sourceId || 'sys_log';
    syncMongoReportSourceUi();
    if ($('mongo-report-collection') && spec.collection) $('mongo-report-collection').value = spec.collection;
    if ($('mongo-report-limit')) $('mongo-report-limit').value = String(spec.limit || 500);
    if ($('mongo-report-from')) $('mongo-report-from').value = datetimeLocalFromIso(spec.since);
    if ($('mongo-report-to')) $('mongo-report-to').value = datetimeLocalFromIso(spec.until);
    const source = getMongoReportSource();
    if ($('mongo-report-sort-field')) {
      $('mongo-report-sort-field').value = spec.sortField || source?.dateField || 'at';
    }
    if ($('mongo-report-sort-dir')) $('mongo-report-sort-dir').value = String(spec.sortDir === 1 ? 1 : -1);
    renderMongoReportFilters();
    renderMongoReportColumns(spec.columns || source?.defaultColumns || []);
    const filter = spec.filter || {};
    Object.entries(filter).forEach(([key, val]) => {
      const el = document.querySelector(`[data-mongo-filter="${key}"]`);
      if (el) el.value = val;
    });
    if (spec.openRoiPanel || spec.sourceId === 'roi_summary') {
      const panel = $('report-roi-panel');
      if (panel) {
        panel.open = true;
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    if (spec.openCmmsPanel || spec.sourceId === 'cmms_work_orders' || spec.sourceId === 'cmms_pm_schedules') {
      window.location.href = '/cmms';
    }
  }

  function syncMongoReportSourceUi() {
    const source = getMongoReportSource();
    const isCollection = source?.id === 'collection';
    const isRoi = source?.id === 'roi_summary';
    $('mongo-report-collection-wrap')?.classList.toggle('view-hidden', !isCollection);
    ['mongo-report-limit', 'mongo-report-from', 'mongo-report-to', 'mongo-report-sort-field', 'mongo-report-sort-dir'].forEach((id) => {
      $(id)?.closest('label')?.classList.toggle('view-hidden', isRoi);
    });
    if (isCollection && $('mongo-report-collection')) {
      const sel = $('mongo-report-collection');
      if (!sel.options.length && source.collections) {
        sel.innerHTML = source.collections.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      }
    }
    if ($('mongo-report-sort-field') && source?.dateField && !$('mongo-report-sort-field').value) {
      $('mongo-report-sort-field').value = source.dateField;
    }
    renderMongoReportFilters();
    renderMongoReportColumns(source?.defaultColumns || []);
  }

  function renderMongoReportFilters() {
    const host = $('mongo-report-filters');
    const source = getMongoReportSource();
    if (!host || !source) return;
    if (!source.filters?.length) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = source.filters.map((f) => {
      if (f.type === 'enum') {
        const opts = ['<option value="">All</option>']
          .concat((f.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`));
        return `<label>${esc(f.label)} <select data-mongo-filter="${esc(f.id)}">${opts.join('')}</select></label>`;
      }
      return `<label>${esc(f.label)} <input type="text" data-mongo-filter="${esc(f.id)}" placeholder="${esc(f.placeholder || '')}" maxlength="120"></label>`;
    }).join('');
  }

  function renderMongoReportColumns(selectedIds = []) {
    const host = $('mongo-report-columns');
    const source = getMongoReportSource();
    if (!host) return;
    const selected = new Set(selectedIds || []);
    const fields = source?.fields || [];
    if (!fields.length) {
      host.innerHTML = '<p class="muted">Select a collection and run preview to discover columns, or choose another data source.</p>';
      return;
    }
    host.innerHTML = fields.map((f) => {
      const checked = selected.size ? selected.has(f.id) : (source.defaultColumns || []).includes(f.id);
      return `<label><input type="checkbox" data-mongo-col="${esc(f.id)}" ${checked ? 'checked' : ''}> ${esc(f.label)}</label>`;
    }).join('');
  }

  function formatMongoReportPreviewHtml(result) {
    if (!result?.rows?.length) return '<p class="muted">No rows returned for this query.</p>';
    const cols = result.columns?.length ? result.columns : Object.keys(result.rows[0]).map((id) => ({ id, label: id }));
    const head = cols.map((c) => `<th>${esc(c.label || c.id)}</th>`).join('');
    const body = result.rows.map((row) => `<tr>${cols.map((c) => `<td>${esc(row[c.id] ?? '')}</td>`).join('')}</tr>`).join('');
    return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function loadMongoReportBuilder() {
    const [catalog, defsRes] = await Promise.all([
      mongoReportCatalog ? Promise.resolve(mongoReportCatalog) : api.mongoReportCatalog(),
      api.mongoReportDefinitions(),
    ]);
    mongoReportCatalog = catalog;
    mongoReportDefs = defsRes.definitions || [];

    const tplSel = $('mongo-report-template');
    if (tplSel) {
      tplSel.innerHTML = ['<option value="">— template —</option>']
        .concat((catalog.templates || []).map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`))
        .join('');
    }
    const srcSel = $('mongo-report-source');
    if (srcSel && !srcSel.options.length) {
      srcSel.innerHTML = (catalog.sources || []).map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
    }
    const savedSel = $('mongo-report-saved');
    if (savedSel) {
      savedSel.innerHTML = ['<option value="">— saved —</option>']
        .concat(mongoReportDefs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`))
        .join('');
    }
    if (!$('mongo-report-name')?.value) {
      applyMongoReportSpecToForm(mongoReportDefs[0] || catalog.templates?.[0] || { sourceId: 'sys_log' });
    }
  }

  async function runMongoReportPreview() {
    const msg = $('mongo-report-msg');
    const host = $('mongo-report-preview');
    if (msg) {
      msg.textContent = 'Loading…';
      msg.className = 'muted';
    }
    try {
      const spec = readMongoReportSpecFromForm();
      if (spec.sourceId === 'collection' && spec.collection) {
        const disc = await api.discoverMongoReportFields(spec.collection);
        if (disc.fields?.length) {
          const source = getMongoReportSource();
          if (source) source.fields = disc.fields;
          if (!spec.columns.length) renderMongoReportColumns(disc.fields.map((f) => f.id));
        }
      }
      const result = await api.queryMongoReport(readMongoReportSpecFromForm());
      mongoReportPreview = result;
      if (host) host.innerHTML = formatMongoReportPreviewHtml(result);
      if (msg) {
        msg.textContent = `${result.meta?.rowCount || 0} row(s)`;
        msg.className = 'muted ok-text';
      }
    } catch (e) {
      mongoReportPreview = null;
      if (host) host.innerHTML = `<p class="muted err-text">${esc(e.message || 'Query failed')}</p>`;
      if (msg) {
        msg.textContent = e.message || 'Query failed';
        msg.className = 'muted err-text';
      }
    }
  }

  function exportMongoReportCsv() {
    const result = mongoReportPreview;
    if (!result?.rows?.length) {
      alert('Run preview first.');
      return;
    }
    const cols = result.columns?.length ? result.columns : Object.keys(result.rows[0]).map((id) => ({ id, label: id }));
    const lines = [cols.map((c) => c.label || c.id).join(',')];
    result.rows.forEach((row) => {
      lines.push(cols.map((c) => {
        const val = String(row[c.id] ?? '').replace(/"/g, '""');
        return `"${val}"`;
      }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(readMongoReportSpecFromForm().name || 'mongo-report').replace(/[^\w.-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportMongoReportPdf() {
    const msg = $('mongo-report-msg');
    try {
      const spec = readMongoReportSpecFromForm();
      const body = mongoReportPreview?.rows?.length
        ? { title: spec.title, columns: mongoReportPreview.columns, rows: mongoReportPreview.rows }
        : { spec };
      const { blob, filename } = await api.downloadMongoReportPdf(body);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      if (msg) {
        msg.textContent = 'PDF downloaded';
        msg.className = 'muted ok-text';
      }
    } catch (e) {
      if (msg) {
        msg.textContent = e.message || 'PDF export failed';
        msg.className = 'muted err-text';
      }
    }
  }

  async function saveMongoReportDef() {
    const spec = readMongoReportSpecFromForm();
    const savedId = $('mongo-report-saved')?.value;
    spec.id = savedId || `def_${Date.now()}`;
    const idx = mongoReportDefs.findIndex((d) => d.id === spec.id);
    if (idx >= 0) mongoReportDefs[idx] = { ...mongoReportDefs[idx], ...spec };
    else mongoReportDefs.push(spec);
    const res = await api.putMongoReportDefinitions(mongoReportDefs);
    mongoReportDefs = res.definitions || mongoReportDefs;
    await loadMongoReportBuilder();
    if ($('mongo-report-saved') && mongoReportDefs.length) {
      $('mongo-report-saved').value = mongoReportDefs[mongoReportDefs.length - 1].id;
    }
  }

  async function deleteMongoReportDef() {
    const id = $('mongo-report-saved')?.value;
    if (!id) return;
    mongoReportDefs = mongoReportDefs.filter((d) => d.id !== id);
    await api.putMongoReportDefinitions(mongoReportDefs);
    await loadMongoReportBuilder();
    applyMongoReportSpecToForm({ sourceId: 'sys_log' });
  }

  function reportMongoLimit() {
    const n = parseInt($('report-mongo-limit')?.value || '100', 10);
    return Math.min(Math.max(Number.isFinite(n) ? n : 100, 10), 500);
  }

  function setReportMongoTab(tab) {
    document.querySelectorAll('.report-mongo-tab').forEach((btn) => {
      const active = btn.dataset.reportMongoTab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.report-mongo-pane').forEach((pane) => {
      pane.classList.toggle('view-hidden', pane.dataset.reportMongoPane !== tab);
    });
    document.querySelectorAll('.report-mongo-syslog-only').forEach((el) => {
      el.classList.toggle('view-hidden', tab !== 'syslog');
    });
    document.querySelectorAll('.report-mongo-mqtt-only').forEach((el) => {
      el.classList.toggle('view-hidden', tab !== 'mqtt');
    });
    document.querySelectorAll('.report-mongo-historian-only').forEach((el) => {
      el.classList.toggle('view-hidden', tab !== 'historian');
    });
  }

  function formatReportMongoStatusLine(parts) {
    return parts.filter(Boolean).join(' · ');
  }

  function mongoStoreStatusLabel(st) {
    if (st.fallback) return 'fallback file';
    if (st.enabled) return 'MongoDB';
    return 'not configured';
  }

  async function refreshReportMongoLogs() {
    const msg = $('report-mongo-msg');
    const statusEl = $('report-mongo-status');
    const tab = document.querySelector('.report-mongo-tab.active')?.dataset.reportMongoTab || 'syslog';
    const limit = reportMongoLimit();
    if (msg) {
      msg.textContent = 'Loading…';
      msg.className = 'muted';
    }
    try {
      const [sysRes, hwRes, tagRes, mqttRes] = await Promise.allSettled([
        peaklogicApiFetch('GET', '/sys-log/status'),
        peaklogicApiFetch('GET', '/hardware-history/status'),
        peaklogicApiFetch('GET', '/logger/mongo/status'),
        peaklogicApiFetch('GET', '/mqtt-broker-log/status'),
      ]);
      const sysSt = sysRes.status === 'fulfilled' ? sysRes.value : { enabled: false, fallback: true };
      const hwSt = hwRes.status === 'fulfilled' ? hwRes.value : { enabled: false, fallback: true };
      const tagSt = tagRes.status === 'fulfilled' ? tagRes.value : { enabled: false, connected: false };
      const mqttSt = mqttRes.status === 'fulfilled' ? mqttRes.value : {};
      const tail = mqttSt?.tailer;
      const statusParts = [
        `Sys log: ${mongoStoreStatusLabel(sysSt)}`,
        `MQTT broker: ${tail?.running ? `tail ${tail.path}` : (mqttSt.ingestTokenConfigured ? 'remote ingest' : 'hub events only')}`,
        `Hardware: ${mongoStoreStatusLabel(hwSt)}`,
        `Tag historian: ${tagSt.enabled ? (tagSt.connected ? 'connected' : 'not connected') : 'not configured'}`,
      ];
      if (statusEl) statusEl.textContent = formatReportMongoStatusLine(statusParts);

      try {
      if (tab === 'syslog') {
        const level = $('report-mongo-syslog-level')?.value?.trim() || '';
        const category = $('report-mongo-syslog-category')?.value?.trim() || '';
        const params = { limit };
        if (level) params.level = level;
        if (category) params.category = category;
        const r = await reportMongoSysLogQuery(params);
        const host = $('report-mongo-syslog');
        if (host) host.innerHTML = formatReportSysLogHtml(r.entries || []);
        if (msg) {
          const shown = (r.entries || []).filter((e) => !isNoisySysLogEntry(e));
          msg.textContent = `${shown.length} entr${shown.length === 1 ? 'y' : 'ies'}`;
          msg.className = 'muted ok-text';
        }
      } else if (tab === 'mqtt') {
        const level = $('report-mongo-mqtt-level')?.value?.trim() || '';
        const event = $('report-mongo-mqtt-event')?.value?.trim() || '';
        const params = { limit };
        if (level) params.level = level;
        if (event) params.event = event;
        const r = await reportMongoMqttBrokerLog(params);
        const host = $('report-mongo-mqtt');
        if (host) host.innerHTML = formatReportMqttBrokerLogHtml(r.entries || []);
        if (msg) {
          const n = (r.entries || []).length;
          msg.textContent = `${n} MQTT broker event${n === 1 ? '' : 's'}`;
          msg.className = 'muted ok-text';
        }
      } else if (tab === 'hardware') {
        const r = await reportMongoHardwareHistory({ recent: true, limit });
        const host = $('report-mongo-hardware');
        if (host) host.innerHTML = formatReportHardwareHistoryHtml(r.assignments || []);
        if (msg) {
          msg.textContent = `${(r.assignments || []).length} assignment(s)`;
          msg.className = 'muted ok-text';
        }
      } else {
        const maint = await reportMongoSysLogQuery({ level: 'maintenance', limit: Math.min(limit, 25) });
        const host = $('report-mongo-historian');
        if (host) {
          const conn = tagSt.enabled && tagSt.connected;
          const interval = tagSt.sampleIntervalMs != null ? `${tagSt.sampleIntervalMs} ms` : '—';
          host.innerHTML = `
            <div class="report-mongo-historian-meta">
              <dl>
                <dt>Status</dt><dd>${conn ? 'Connected to MongoDB' : (tagSt.enabled ? 'Configured but not connected' : 'Not configured')}</dd>
                <dt>Database</dt><dd class="cell-mono">${esc(tagSt.db || '—')}</dd>
                <dt>SCADA collection</dt><dd class="cell-mono">${esc(tagSt.collection || '—')}</dd>
                <dt>Edge collection</dt><dd class="cell-mono">${esc(tagSt.edgeCollection || '—')}</dd>
                <dt>Sample interval</dt><dd>${esc(interval)}</dd>
              </dl>
            </div>
            <p class="panel-hint">Use <strong>Historian</strong> to load tag samples from MongoDB archive. Recent maintenance log entries:</p>
            ${formatReportSysLogHtml(maint.entries || [])}`;
        }
        if (msg) {
          msg.textContent = conn ? 'Historian connected' : (tagSt.enabled ? 'Historian not connected' : 'Historian not configured');
          msg.className = conn ? 'muted ok-text' : 'muted';
        }
      }
      } catch (tabErr) {
        const friendly = friendlyReportMongoError(tabErr, tab);
        const host = document.querySelector(`[data-report-mongo-pane="${tab}"]`);
        if (host && tab === 'syslog') {
          host.innerHTML = `<p class="muted err-text">${esc(friendly)}</p>`;
        } else if (host && tab === 'mqtt') {
          host.innerHTML = `<p class="muted err-text">${esc(friendly)}</p>`;
        } else if (host && tab === 'hardware') {
          host.innerHTML = `<p class="muted err-text">${esc(friendly)}</p>`;
        }
        if (msg) {
          msg.textContent = friendly;
          msg.className = 'muted err-text';
        }
      }
    } catch (e) {
      if (msg) {
        msg.textContent = friendlyReportMongoError(e, 'status');
        msg.className = 'muted err-text';
      }
    }
  }

  async function refreshHardwareHistoryPanel(driverIndex) {
    const d = drivers[driverIndex];
    const host = document.querySelector(`[data-drv-hw-history="${driverIndex}"]`);
    if (!d || d.type !== 'mqtt_parc' || !host) return;
    try {
      const r = await api.hardwareHistory({ positionId: d.id, limit: 12 });
      host.innerHTML = formatHardwareHistoryHtml(r.assignments || []);
    } catch (e) {
      host.innerHTML = `<p class="muted">${esc(e.message || 'History unavailable')}</p>`;
    }
  }

  function driverParcToolbarHtml(i, editing) {
    const d = drivers[i];
    const snPosition = d && /^opta_[0-9a-f]{16,18}$/i.test(String(d.id || ''));
    return `<div class="driver-parc-toolbar toolbar wrap">
      <button type="button" class="btn btn-sm primary" data-drv-parc-sync="${i}">Sync tags from device</button>
      <button type="button" class="btn btn-sm" data-drv-parc-scan="${i}">Scan expansions</button>
      <button type="button" class="btn btn-sm" data-drv-parc-io-view="${i}" title="Open Opta /io-map in browser">Opta I/O view</button>
      <button type="button" class="btn btn-sm" data-drv-parc-replace="${i}">Replace hardware</button>
      ${snPosition ? `<button type="button" class="btn btn-sm" data-drv-parc-rename="${i}">Set position name</button>` : ''}
    </div>
    <p class="driver-parc-status muted cell-mono" data-drv-parc-status="${i}">${esc(parcStatusText(drivers[i]))}</p>
    <details class="driver-hw-history-wrap">
      <summary class="muted">Hardware history (serials &amp; swaps)</summary>
      <div class="driver-hw-history" data-drv-hw-history="${i}"><p class="muted">Loading…</p></div>
    </details>`;
  }

  function driverMappingsTable(driverId) {
    const mapped = tagsForDriver(driverId);
    if (!mapped.length) {
      return '<p class="muted mappings-empty">No tags mapped to this driver.</p>';
    }
    const drv = drivers.find((d) => d.id === driverId);
    const isNc = drv?.type === 'nextcentury';
    const isParc = drv?.type === 'mqtt_parc';
    const rows = mapped.map((t) => {
      const ti = tags.findIndex((x) => x.id === t.id);
      const deviceCol = isNc
        ? esc(formatNextcenturyTagAddr(t))
        : esc(formatAddr(t));
      const slaveCol = (isNc || isParc)
        ? ''
        : `<td class="cell-mono">${(() => { const slave = tagModbusSlaveId(t); return slave != null ? esc(String(slave)) : '—'; })()}</td>`;
      return `<tr>
        <td class="cell-tag">${esc(t.id)}</td>
        <td>${esc(t.role)}</td>
        ${slaveCol}
        <td class="cell-mono">${deviceCol}</td>
        <td class="live-val" data-live="${esc(t.id)}">${liveValCellHtml(t, liveEntryFor(t.id, lastLive))}</td>
        <td>${ti >= 0 ? `<button type="button" class="btn btn-sm" data-tag-addr-edit="${ti}">Edit address</button>` : ''}</td>
      </tr>`;
    });
    const head = isNc
      ? '<tr><th>Tag</th><th>Role</th><th>Device / field</th><th>Live</th><th></th></tr>'
      : isParc
        ? '<tr><th>Tag</th><th>Role</th><th>Channel</th><th>Live</th><th></th></tr>'
        : '<tr><th>Tag</th><th>Role</th><th>Slave</th><th>Modbus / address</th><th>Live</th><th></th></tr>';
    return `<table class="data-table driver-mappings"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function readDriverEditForm(tr, i) {
    const d = { ...drivers[i] };
    const typeEl = tr.querySelector('[data-df=type]');
    if (typeEl) d.type = typeEl.value;
    const en = tr.querySelector('[data-df=enabled]');
    if (en) d.enabled = en.checked;
    const idEl = tr.querySelector('[data-df=id]');
    if (idEl) d.id = idEl.value;
    tr.querySelectorAll('[data-df]').forEach((inp) => {
      const f = inp.dataset.df;
      if (f === 'type' || f === 'enabled' || f === 'id') return;
      if (inp.type === 'checkbox') d[f] = inp.checked;
      else if (inp.type === 'number') d[f] = +inp.value;
      else d[f] = inp.value;
    });
    const port = readPortFromRoot(tr);
    if (port) {
      if (d.type === 'modbus_rtu' || d.type === 'vgreen_epc' || d.type === 'pentair_rs485' || d.type === 'modbus_bridge') d.serialPort = port;
      if (d.type === 'serial') d.port = port;
    }
    if (d.type === 'hal') {
      const stackEl = tr.querySelector('[data-hal-cfg=stack]');
      const busEl = tr.querySelector('[data-hal-cfg=i2cBus]');
      if (stackEl || busEl) {
        d.halConfig = { ...(d.halConfig || {}) };
        if (stackEl) d.halConfig.stack = +stackEl.value;
        if (busEl) d.halConfig.i2cBus = +busEl.value;
      }
    }
    if (d.type === 'nextcentury') {
      if (typeof d.propertyIds === 'string') {
        const s = d.propertyIds.trim();
        d.propertyIds = s
          ? s.split(/[,\s]+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n))
          : [];
      }
      const pwIn = tr.querySelector('[data-df=password]');
      d.password = resolveNextcenturyPassword(d.id, pwIn?.value);
      d.pollIntervalMs = Number(d.pollIntervalMs) || 900000;
      d.devicesPerSite = Number(d.devicesPerSite) || 1500;
    }
    stripDriverFieldsForType(d);
    drivers[i] = d;
  }

  function flushDriverEdit() {
    if (driverEditRow == null) return;
    const card = document.querySelector('.driver-editing');
    if (card) readDriverEditForm(card, driverEditRow);
  }

  function unmapTagsFromDriver(driverId) {
    let n = 0;
    tags.forEach((t) => {
      if (t.driverId === driverId) {
        t.driverId = null;
        t.driverAddress = null;
        n++;
      }
    });
    return n;
  }

  async function deleteDriverAt(index) {
    flushDriverEdit();
    const d = drivers[index];
    if (!d) return;
    const mapped = tagsForDriver(d.id);
    const msg = mapped.length
      ? `Delete driver "${d.id}"? ${mapped.length} tag(s) will be unmapped.`
      : `Delete driver "${d.id}"?`;
    if (!window.confirm(msg)) return;
    unmapTagsFromDriver(d.id);
    drivers.splice(index, 1);
    driverEditRow = null;
    editingDrivers = false;
    try {
      await api.putTags(normalizeTagsForSave(tags));
      await api.putDrivers(drivers);
      await refreshAll();
    } catch (e) {
      alert(e.message);
    }
  }

  function flushTagEdit() {
    if (tagEditRow == null) return;
    const tr = $('tags-table')?.querySelector('tr.tag-editing');
    if (tr) readTagRowInputs(tr, tagRowIndex(tr, tagEditRow));
  }

  function syncDeviceConcubeOptions(preset) {
    const wrap = $('device-concube-groups-wrap');
    const inp = $('device-concube-groups');
    if (!wrap || !inp) return;
    const isConcube = !!preset?.concube;
    wrap.classList.toggle('view-hidden', !isConcube);
    if (isConcube) {
      const opt = preset?.applyOptions?.paramGroups || {};
      inp.min = String(opt.min ?? 1);
      inp.max = String(opt.max ?? 16);
      if (inp.dataset.touched !== '1') inp.value = String(opt.default ?? 1);
    }
  }

  function openHwWizard(options = {}) {
    window.PeaklogicHwWizard?.open({
      transportGroups: wizardTransportGroups,
      presets: devicePresets,
      serialPorts,
      hwDefaults: defaultHwConnection(),
      presetId: options.presetId,
      deps: {
        applyPreset: (body) => api.applyDevicePreset(body),
        openHelp: openContextHelp,
        openHmiSetup: () => openPopup('hmi-setup'),
        refreshAll,
        onClose: (name) => {
          if (name === 'drivers') openPopup('drivers');
        },
      },
    });
  }

  function maybePromptHwWizard(data) {
    try {
      if (sessionStorage.getItem('peaklogic-hw-wizard-dismissed')) return;
      const noDrivers = !(data?.drivers?.length);
      const fewTags = (data?.tagCount ?? 0) < 2;
      if (!noDrivers && !fewTags) return;
      sessionStorage.setItem('peaklogic-hw-wizard-dismissed', '1');
      if (window.confirm(
        'Welcome to PeakLogic.\n\nOpen the Hardware wizard to connect your first device template?'
      )) {
        openHwWizard();
      }
    } catch {
      /* sessionStorage unavailable */
    }
  }

  function concubeParamGroupsForApply(preset) {
    if (!preset?.concube) return undefined;
    const inp = $('device-concube-groups');
    return Math.max(1, Math.min(16, parseInt(inp?.value, 10) || 1));
  }

  async function ensureDevicePresets() {
    if (devicePresets?.length) return devicePresets;
    try {
      const r = await api.listDevicePresets();
      if (r?.presets?.length) devicePresets = r.presets;
    } catch {
      /* dashboard poll will retry */
    }
    return devicePresets;
  }

  function fillDevicePresetUi() {
    const sel = $('device-preset');
    if (!sel) return;
    const cur = sel.value;
    const list = devicePresets || [];
    const opts = list.length
      ? list.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`)
      : ['<option value="">(loading templates…)</option>'];
    sel.innerHTML = opts.join('');
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    else if (list.some((p) => p.id === 'icon_do3500')) {
      sel.value = 'icon_do3500';
    }
    const preset = list.find((p) => p.id === sel.value);
    syncDeviceConcubeOptions(preset);
  }

  function fillParcOptaBar(data) {
    lastParcDevices = data?.parc?.devices || [];
    document.querySelectorAll('[data-drv-parc-status]').forEach((el) => {
      const i = +el.dataset.drvParcStatus;
      const d = drivers[i];
      if (d?.type === 'mqtt_parc') el.textContent = parcStatusText(d);
    });
    renderParcRegistryList();
  }

  function isParcRegistryNoiseId(deviceId) {
    const id = String(deviceId || '').trim();
    if (!id) return true;
    return /^(test|dbg)[-_]/i.test(id)
      || /^opta_(bulk|sync)_/i.test(id)
      || /^opta_st_\d+$/i.test(id);
  }

  function parcRegistryDeviceIds(includeNoise) {
    return (lastParcDevices || [])
      .map((d) => d.deviceId)
      .filter((id) => includeNoise || !isParcRegistryNoiseId(id));
  }

  function renderParcRegistryList() {
    const el = $('parc-registry-device-list');
    if (!el) return;
    const fieldDevs = (lastParcDevices || []).filter((d) => !isParcRegistryNoiseId(d.deviceId));
    if (!fieldDevs.length) {
      el.innerHTML = '<p class="muted">No Parc registry devices yet — enable MQTT hub and wait for Opta telemetry.</p>';
      return;
    }
    el.innerHTML = [
      '<p class="muted">Parc registry (MQTT):</p>',
      '<ul class="parc-registry-rows">',
      ...fieldDevs.map((d) => {
        const badge = d.hasDriver
          ? ''
          : ' <span class="parc-no-driver-badge">No driver</span>';
        const sn = d.ateccSerial ? ` <span class="muted cell-mono">(${esc(d.ateccSerial)})</span>` : '';
        const addBtn = d.hasDriver
          ? ''
          : ` <button type="button" class="btn btn-sm parc-registry-add" data-device-id="${esc(d.deviceId)}">Add driver</button>`;
        return `<li><code class="cell-mono">${esc(d.deviceId)}</code>${sn}${d.positionId ? ` → <strong>${esc(d.positionId)}</strong>` : ''}${badge}${addBtn}</li>`;
      }),
      '</ul>',
    ].join('');
  }

  async function addParcDriverForRegistryDevice(deviceId, opts = {}) {
    const msgEl = $('parc-opta-bulk-msg');
    const positionId = String(opts.positionId || $('parc-opta-position-id')?.value?.trim() || '').trim();
    const syncTags = opts.syncTags !== false;
    const body = { deviceIds: [deviceId], syncTags, usePositionIds: true };
    if (positionId) body.positionId = positionId;
    if (msgEl) msgEl.textContent = 'Adding…';
    try {
      const r = await api.bulkAddParcOpta(body);
      const synced = (r.syncResults || []).filter((s) => s.ok).length;
      const syncNote = syncTags && synced ? ` · synced tags on ${synced}` : '';
      const skipNote = r.skipped?.length ? ` · skipped ${r.skipped.length}` : '';
      if (msgEl) {
        msgEl.textContent = `Added ${r.added?.length || 0} driver(s)${skipNote}${syncNote}`;
      }
      if (!r.added?.length) {
        alert(r.skipped?.length
          ? `Driver not added (already exists?): ${r.skipped.join(', ')}`
          : 'Driver not added — check MQTT hub and Parc registry telemetry.');
      }
      await refreshAll();
    } catch (e) {
      if (msgEl) msgEl.textContent = e.message || 'Add failed';
      alert(e.message || 'Add failed');
    }
  }

  async function runParcScanExpansions(driverIndex) {
    const d = drivers[driverIndex];
    if (!d || d.type !== 'mqtt_parc') return;
    const deviceId = String(d.deviceId || d.id || '').trim();
    if (!deviceId) return alert('Set device ID on the driver first.');
    const statusEl = document.querySelector(`[data-drv-parc-status="${driverIndex}"]`);
    try {
      if (statusEl) statusEl.textContent = 'Scanning expansions on device…';
      const r = await api.parcScanExpansions(deviceId);
      const mods = (r.body?.expansionModules || []).map((m) => `slot ${(m.slot ?? 0) + 1}: ${m.label || m.type}`).join(' · ');
      let msg = mods;
      if (!msg) {
        if (r.body?.expansionBlueprint === false) {
          msg = 'Opta Expansions library missing — install Arduino_Opta_Blueprint and reflash';
        } else if ((r.body?.expansionCount ?? 0) === 0) {
          msg = 'No expansions detected — check 24V power and module in slot 1';
        } else {
          msg = `Scan OK — ${r.body?.tagCount ?? '?'} tags on device`;
        }
      }
      if (statusEl) statusEl.textContent = msg;
      await refreshAll();
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Scan failed';
      alert(e.message || 'Scan failed');
    }
  }

  async function runParcReplaceHardware(driverIndex) {
    const d = drivers[driverIndex];
    if (!d || d.type !== 'mqtt_parc') return;
    const positionId = d.id;
    const currentDeviceId = String(d.deviceId || '').trim();
    const candidates = (lastParcDevices || [])
      .filter((dev) => dev.deviceId && dev.deviceId !== currentDeviceId && !dev.hasDriver)
      .map((dev) => dev.deviceId);
    if (!candidates.length) {
      return alert(
        'No unassigned replacement device in Parc registry.\n\n'
        + 'Power on the replacement Opta, wait for MQTT telemetry, then try again.',
      );
    }
    const list = candidates.map((id, n) => `${n + 1}. ${id}`).join('\n');
    const pick = window.prompt(
      `Replace hardware at position "${positionId}"\n`
      + `Current device: ${currentDeviceId || '—'}\n\n`
      + 'Unassigned devices in registry:\n'
      + `${list}\n\n`
      + 'Enter device ID (opta_… serial) for the replacement Opta:',
    );
    if (!pick) return;
    const newDeviceId = pick.trim();
    if (!candidates.includes(newDeviceId)) {
      return alert('Choose a device ID from the unassigned list above.');
    }
    const swapTypeRaw = window.prompt(
      'Swap type (optional — blank = auto-detect):\n'
      + '1 = like-for-like\n2 = upgrade (same vendor, different model)\n'
      + '3 = cross-vendor / different brand\n4 = generic replacement',
    );
    let swapType = '';
    if (swapTypeRaw === '1') swapType = 'like_for_like';
    else if (swapTypeRaw === '2') swapType = 'upgrade';
    else if (swapTypeRaw === '3') swapType = 'cross_vendor';
    else if (swapTypeRaw === '4') swapType = 'replacement';
    const vendor = window.prompt('Replacement vendor (optional, e.g. Arduino, Wago):')?.trim() || '';
    const model = window.prompt('Replacement model (optional, e.g. Opta, PFC200):')?.trim() || '';
    const note = window.prompt('Note (optional, e.g. RMA, panel upgrade):')?.trim() || '';
    const statusEl = document.querySelector(`[data-drv-parc-status="${driverIndex}"]`);
    try {
      if (statusEl) statusEl.textContent = 'Replacing hardware…';
      const r = await api.replaceParcOptaHardware({
        driverId: positionId,
        newDeviceId,
        syncTags: true,
        swapType: swapType || undefined,
        vendor: vendor || undefined,
        model: model || undefined,
        note: note || undefined,
      });
      const sync = r.syncResult?.ok ? ` · synced ${r.syncResult.tagsReplaced} tag(s)` : '';
      const swap = r.historyRecord?.swapType ? ` · ${swapTypeLabel(r.historyRecord.swapType)}` : '';
      if (statusEl) {
        statusEl.textContent = `Replaced ${r.previousDeviceId} → ${r.newDeviceId}${sync}${swap}`;
      }
      await refreshAll();
      await refreshHardwareHistoryPanel(driverIndex);
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Replace failed';
      alert(e.message || 'Replace failed');
    }
  }

  async function runParcRenamePosition(driverIndex) {
    const d = drivers[driverIndex];
    if (!d || d.type !== 'mqtt_parc') return;
    const newId = window.prompt(
      `Set permanent position name for this I/O unit.\n\n`
      + `Current position: ${d.id}\n`
      + `Physical device: ${d.deviceId || '—'}\n\n`
      + 'New position ID (e.g. motor_skid_main, mcc1_line3):',
      d.name ? String(d.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') : '',
    );
    if (!newId) return;
    const statusEl = document.querySelector(`[data-drv-parc-status="${driverIndex}"]`);
    try {
      if (statusEl) statusEl.textContent = 'Renaming position…';
      await api.renameParcOptaPosition({ driverId: d.id, newPositionId: newId.trim() });
      if (statusEl) statusEl.textContent = `Position renamed to ${newId.trim()}`;
      await refreshAll();
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Rename failed';
      alert(e.message || 'Rename failed');
    }
  }

  async function runParcSyncTags(driverIndex) {
    const d = drivers[driverIndex];
    if (!d || d.type !== 'mqtt_parc') return;
    const driverId = d.id;
    const deviceId = String(d.deviceId || d.id || '').trim();
    if (!deviceId) return alert('Set device ID on the driver first.');
    const statusEl = document.querySelector(`[data-drv-parc-status="${driverIndex}"]`);
    if (!parcDeviceForDriver(d)) {
      try {
        if (statusEl) statusEl.textContent = 'Refreshing Parc registry…';
        await refreshAll();
      } catch { /* server may still sync via HTTP */ }
    }
    const parcDev = parcDeviceForDriver(d);
    const tagHint = parcDev
      ? `${parcDev.tagCount || 0} tag(s) in registry${parcDev.stale ? ' (stale — will try HTTP)' : ''}`
      : 'no local telemetry cache — server will try HTTP if Opta IP is known';
    if (!window.confirm(
      `Replace all tags on driver "${driverId}" with ${deviceId} Parc tag table?\n\n`
      + `${tagHint}\n\n`
      + 'Tags with the same name elsewhere (e.g. PC memory tags from your ST program) will be reassigned to this Opta driver.',
    )) return;
    try {
      if (statusEl) statusEl.textContent = 'Syncing tags…';
      const r = await api.syncParcTags(driverId);
      if (statusEl) {
        const extra = r.reassigned ? ` · ${r.reassigned} reassigned from other drivers/memory` : '';
        statusEl.textContent = `Synced ${r.tagsReplaced} tag(s) from ${r.deviceId} · ${r.tagCount} total${extra}`;
      }
      await refreshAll();
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || 'Sync failed';
      alert(e.message || 'Sync failed');
    }
  }

  /** Target driver id: editing row → dedicated template driver → shared-bus match → default. */
  function templateApplyTargetDriverId(preset) {
    if (driverEditRow != null && drivers[driverEditRow]?.id) {
      return drivers[driverEditRow].id;
    }
    const templateDriverId = preset?.driverId;
    if (preset?.sharedBus === false && templateDriverId) {
      return templateDriverId;
    }
    const transport = preset?.transport;
    if (transport) {
      const match = drivers.find((d) => d.enabled !== false && d.type === transport);
      if (match?.id) return match.id;
    }
    return templateDriverId || null;
  }

  /** Connection params for Apply device template (template defaults → target driver → host default port). */
  function templateApplyConnectionParams(preset) {
    const defs = preset?.defaults || {};
    const targetId = templateApplyTargetDriverId(preset);
    const targetDrv = targetId ? drivers.find((d) => d.id === targetId) : null;
    const hw = defaultHwConnection();

    if (preset?.sharedBus === false) {
      const transport = preset?.transport;
      if (transport === 'nextcentury' || transport === 'mqtt' || transport === 'mqtt_parc' || transport === 'https') {
        return { ...defs };
      }
      return {
        host: defs.host || targetDrv?.host,
        port: defs.port ?? targetDrv?.port ?? 502,
        serialPort: targetDrv?.serialPort || hw.serialPort || defs.serialPort,
        baud: defs.baud ?? 9600,
        slaveId: defs.slaveId ?? 1,
        parity: defs.parity || 'none',
        stopBits: defs.stopBits ?? 1,
      };
    }

    const card = document.querySelector('.driver-editing');
    if (card && driverEditRow != null && drivers[driverEditRow]?.id === targetId) {
      readDriverEditForm(card, driverEditRow);
      const d = drivers[driverEditRow];
      if (d.type === 'modbus_tcp' || preset?.transport === 'modbus_tcp') {
        return { host: d.host, port: d.port, slaveId: d.slaveId };
      }
      return {
        serialPort: d.serialPort,
        baud: d.baud,
        slaveId: d.slaveId,
        parity: d.parity,
        stopBits: d.stopBits,
      };
    }

    if (targetDrv) {
      if (targetDrv.type === 'modbus_tcp' || preset?.transport === 'modbus_tcp') {
        return {
          host: targetDrv.host || defs.host,
          port: targetDrv.port ?? defs.port ?? 502,
          slaveId: targetDrv.slaveId ?? defs.slaveId ?? 1,
        };
      }
      return {
        serialPort: targetDrv.serialPort || defs.serialPort || hw.serialPort,
        baud: targetDrv.baud ?? defs.baud ?? hw.baud ?? 9600,
        slaveId: targetDrv.slaveId ?? defs.slaveId ?? hw.slaveId ?? 1,
        parity: targetDrv.parity || defs.parity,
        stopBits: targetDrv.stopBits ?? defs.stopBits,
      };
    }

    const rtu = drivers.find((x) => x.enabled !== false && (x.type === 'modbus_rtu' || x.type === 'vgreen_epc' || x.type === 'pentair_rs485' || x.type === 'modbus_bridge'));
    if (rtu) {
      return {
        serialPort: rtu.serialPort,
        baud: rtu.baud,
        slaveId: rtu.slaveId,
        parity: rtu.parity,
        stopBits: rtu.stopBits,
      };
    }

    return {
      host: defs.host,
      port: defs.port ?? 502,
      serialPort: hw.serialPort || defs.serialPort,
      baud: defs.baud ?? hw.baud ?? 9600,
      slaveId: defs.slaveId ?? hw.slaveId ?? 1,
      parity: defs.parity,
      stopBits: defs.stopBits,
    };
  }

  function renderDrivers() {
    const host = $('drivers-panel');
    if (!host) return;
    const hasSerialDrivers = drivers.some((d) => driverUsesSerial(d.type));
    const refreshBtn = $('btn-drv-refresh-ports');
    if (refreshBtn) refreshBtn.hidden = !hasSerialDrivers;
    const types = ['mock', 'hal', 'modbus_rtu', 'vgreen_epc', 'pentair_rs485', 'modbus_tcp', 'modbus_bridge', 'bacnet', 'mqtt', 'https', 'nextcentury', 'opta_remote', 'mqtt_parc', 'serial', 'native_so'];
    const blocks = drivers.map((d, i) => {
      if (driverEditRow === i) {
        return `<div class="driver-card driver-editing" data-i="${i}">
          <div class="driver-head"><strong>Edit driver</strong> <span class="driver-type">${esc(d.type)}</span></div>
          <div class="form-grid compact">
            ${d.type !== 'mqtt_parc' ? `<label>ID <input data-df="id" value="${esc(d.id)}"></label>` : ''}
            <label>Type <select data-df="type">${opts(types, d.type)}</select></label>
            <label>Enabled <input type="checkbox" data-df="enabled" ${d.enabled ? 'checked' : ''}></label>
          </div>
          <div class="driver-fields-wrap">${driverFieldsHtml(d)}</div>
          ${d.type === 'mqtt_parc' ? driverParcToolbarHtml(i, true) : ''}
          ${d.type === 'nextcentury' ? driverNextcenturyToolbarHtml(i) : ''}
          ${d.type === 'bacnet' ? driverBacnetToolbarHtml(i) : ''}
          <p class="panel-hint">${driverEditApplyHint(d.type)}</p>
          <div class="toolbar">
            <button type="button" class="btn btn-sm" data-drv-test="${i}">Test</button>
            <button type="button" class="btn btn-sm primary" data-drv-apply="${i}">Apply &amp; save</button>
            <button type="button" class="btn btn-sm" data-drv-cancel="${i}">Cancel</button>
            <button type="button" class="btn btn-sm danger" data-drv-delete="${i}">Delete</button>
          </div>
          <p class="driver-test-status muted cell-mono" data-drv-test-status="${i}" aria-live="polite"></p>
        </div>`;
      }
      const mapped = tagsForDriver(d.id);
      return `<div class="driver-card" data-i="${i}">
        <div class="driver-head">
          <div><strong>${esc(d.id)}</strong> <span class="driver-type">${esc(d.type)}</span>
            ${d.enabled ? '<span class="health-pill ok">enabled</span>' : '<span class="health-pill off">disabled</span>'}
            ${driverHealthText(d.id)}
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-sm" data-drv-edit="${i}">Edit</button>
            <button type="button" class="btn btn-sm" data-drv-test="${i}">Test</button>
            <button type="button" class="btn btn-sm danger" data-drv-delete="${i}">Delete</button>
          </div>
        </div>
        <p class="driver-conn cell-mono">${esc(driverConnectionSummary(d))}</p>
        ${d.type === 'nextcentury'
          ? `<p class="nc-driver-pw-status ${nextcenturyHasPassword(d.id) ? 'ok-text' : 'err-text'}">${nextcenturyHasPassword(d.id) ? 'Password saved for autostart' : 'No password stored — use NextCentury API tab → Save'}</p>`
          : ''}
        ${d.type === 'nextcentury' ? `<p class="driver-nc-deploy-est prog-deploy-estimate muted cell-mono" data-nc-deploy-estimate="${i}" hidden></p>` : ''}
        <p class="driver-test-status muted cell-mono" data-drv-test-status="${i}" aria-live="polite"></p>
        ${d.type === 'mqtt_parc' ? driverParcToolbarHtml(i, false) : ''}
        ${d.type === 'nextcentury' ? driverNextcenturyToolbarHtml(i) : ''}
        ${d.type === 'bacnet' ? driverBacnetToolbarHtml(i) : ''}
        <p class="muted">${mapped.length} tag mapping(s)</p>
        ${driverMappingsTable(d.id)}
      </div>`;
    });
    host.innerHTML = blocks.length
      ? blocks.join('')
      : '<p class="muted">No drivers. Click Add to create a driver, or use the NextCentury API tab for cloud polling.</p>';
    bindDriverCardActions(host);
    drivers.forEach((d, i) => {
      if (d.type === 'mqtt_parc') refreshHardwareHistoryPanel(i);
      if (d.type === 'nextcentury' && driverEditRow !== i) {
        syncNextcenturyDeployEstimate({
          target: 'card',
          cardIndex: i,
          driverId: d.id,
          devicesPerSite: Number(d.devicesPerSite) || 1500,
          useLive: true,
        });
      }
    });
  }

  function bindDriverCardActions(host) {
    host.querySelectorAll('[data-drv-edit]').forEach((b) => {
      b.onclick = () => { driverEditRow = +b.dataset.drvEdit; editingDrivers = true; renderDrivers(); };
    });
    host.querySelectorAll('[data-drv-cancel]').forEach((b) => {
      b.onclick = () => { driverEditRow = null; editingDrivers = false; renderDrivers(); };
    });
    host.querySelectorAll('[data-drv-apply]').forEach((b) => {
      b.onclick = async () => {
        syncNextcenturyFormToDrivers();
        const card = b.closest('.driver-card');
        const i = +b.dataset.drvApply;
        readDriverEditForm(card, i);
        const d = drivers[i];
        if ((d.type === 'modbus_rtu' || d.type === 'vgreen_epc' || d.type === 'pentair_rs485' || d.type === 'modbus_bridge' || d.type === 'serial') && !readPortFromRoot(card)) {
          alert('Select a serial port, or choose Other… and type the COM number (e.g. COM12).');
          return;
        }
        driverEditRow = null;
        editingDrivers = false;
        try {
          if (d.type === 'nextcentury') {
            const pwIn = card.querySelector('[data-df=password]');
            const typed = pwIn?.value?.trim();
            const r = await api.saveNextcenturySetup({
              id: d.id,
              email: d.email || '',
              password: pwIn?.value ?? '',
              reportId: d.reportId || 'rt_4510',
              pollIntervalMs: d.pollIntervalMs,
              propertyIds: d.propertyIds,
              autoSyncTags: d.autoSyncTags,
              devicesPerSite: d.devicesPerSite,
              connect: false,
            });
            if (Array.isArray(r.drivers)) drivers = r.drivers;
            driversDirty = false;
            if (driversActiveTab === 'nextcentury') {
              fillNextcenturySetupForm();
              finalizeNcPasswordUi({
                hasPassword: r.hasPassword,
                passwordUpdated: !!r.passwordUpdated || !!typed,
              });
            }
            await refreshAll();
            setNextcenturyStatus(`Saved "${d.id}" — ${r.hasPassword ? 'password on file' : 'no password stored'}`, r.hasPassword);
            return;
          }
          const r = await api.putDrivers(drivers);
          driversDirty = false;
          if (r.warnings?.length) alert(r.warnings.join('\n'));
          if (Array.isArray(r.drivers)) drivers = r.drivers;
          await refreshAll();
        } catch (e) {
          alert(e.message || 'Save driver failed');
          renderDrivers();
        }
      };
    });
    host.querySelectorAll('[data-drv-test]').forEach((b) => {
      b.onclick = () => {
        runDriverConnectionTest(+b.dataset.drvTest, b).catch((e) => {
          setDriverTestStatus(e.message || 'Test failed', false);
        });
      };
    });
    host.querySelectorAll('[data-tag-addr-edit]').forEach((b) => {
      b.onclick = () => {
        const ti = +b.dataset.tagAddrEdit;
        tagEditRow = ti;
        editingTags = true;
        openPopup('tags');
        renderTags();
      };
    });
    host.querySelectorAll('[data-drv-delete]').forEach((b) => {
      b.onclick = () => deleteDriverAt(+b.dataset.drvDelete);
    });
    host.querySelectorAll('[data-drv-nc-portal]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvNcPortal;
        const card = b.closest('.driver-card');
        if (card?.classList.contains('driver-editing')) readDriverEditForm(card, i);
        const d = drivers[i];
        if (!d || d.type !== 'nextcentury') return;
        openNextcenturyPortal({ driverId: d.id }).catch((e) => {
          setNcPortalStatus(e.message || 'Portal open failed', false);
        });
      };
    });
    host.querySelectorAll('[data-drv-bac-discover]').forEach((b) => {
      b.onclick = () => runBacnetDiscover(+b.dataset.drvBacDiscover).catch((e) => {
        setBacnetDriverStatus(+b.dataset.drvBacDiscover, e.message || 'Discover failed', false);
      });
    });
    host.querySelectorAll('[data-drv-bac-browse]').forEach((b) => {
      b.onclick = () => runBacnetBrowseImport(+b.dataset.drvBacBrowse).catch((e) => {
        setBacnetDriverStatus(+b.dataset.drvBacBrowse, e.message || 'Browse failed', false);
      });
    });
    host.querySelectorAll('[data-drv-bac-example]').forEach((b) => {
      b.onclick = () => runBacnetLoadExample(+b.dataset.drvBacExample).catch((e) => {
        setBacnetDriverStatus(+b.dataset.drvBacExample, e.message || 'Load example failed', false);
      });
    });
    host.querySelectorAll('[data-drv-parc-sync]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvParcSync;
        const card = b.closest('.driver-card');
        if (card?.classList.contains('driver-editing')) readDriverEditForm(card, i);
        runParcSyncTags(i);
      };
    });
    host.querySelectorAll('[data-drv-parc-scan]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvParcScan;
        const card = b.closest('.driver-card');
        if (card?.classList.contains('driver-editing')) readDriverEditForm(card, i);
        runParcScanExpansions(i);
      };
    });
    host.querySelectorAll('[data-drv-parc-io-view]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvParcIoView;
        const d = drivers[i];
        if (d?.type === 'mqtt_parc') openOptaIoViewForDriver(d);
      };
    });
    host.querySelectorAll('[data-drv-parc-replace]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvParcReplace;
        const card = b.closest('.driver-card');
        if (card?.classList.contains('driver-editing')) readDriverEditForm(card, i);
        runParcReplaceHardware(i);
      };
    });
    host.querySelectorAll('[data-drv-parc-rename]').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.drvParcRename;
        runParcRenamePosition(i);
      };
    });
    const editCard = host.querySelector('.driver-editing');
    if (editCard) {
      editCard.querySelectorAll('input,select').forEach((inp) => {
        inp.onfocus = () => { editingDrivers = true; driversDirty = true; };
        inp.oninput = () => { driversDirty = true; };
        inp.onchange = () => { driversDirty = true; };
      });
      bindPortSelectInRoot(editCard);
      const typeSel = editCard.querySelector('[data-df=type]');
      if (typeSel) {
        typeSel.onchange = () => {
          const i = +editCard.dataset.i;
          readDriverEditForm(editCard, i);
          drivers[i].type = typeSel.value;
          stripDriverFieldsForType(drivers[i]);
          editCard.querySelector('.driver-fields-wrap').innerHTML = driverFieldsHtml(drivers[i]);
          const hint = editCard.querySelector('.panel-hint');
          if (hint) hint.innerHTML = driverEditApplyHint(drivers[i].type);
          bindPortSelectInRoot(editCard);
        };
      }
    }
  }

  function updateLiveValues(live, runtime) {
    lastLive = live || [];
    if (runtime) lastRuntime = runtime;
    window.PeaklogicProgram?.updateProgramIoLive(live, runtime || lastRuntime);
    window.PeaklogicProgram?.updateProgramTrace(runtime?.programTrace, runtime || lastRuntime);
    if (editingTags && tagEditRow != null) return;
    const map = new Map((live || []).map((t) => [t.tagId, t]));
    document.querySelectorAll('[data-live]').forEach((cell) => {
      const t = map.get(cell.dataset.live);
      if (!t) return;
      const tag = tags.find((x) => x.id === t.tagId);
      if (!tag) return;
      const entry = liveEntryFor(t.tagId, live);
      const valEl = cell.querySelector('.live-val-text');
      if (valEl) valEl.textContent = formatLive(tag, entry);
      else cell.textContent = formatLive(tag, entry);
      const tsApi = window.PeaklogicIoTimestamp;
      let tsEl = cell.querySelector('.io-ts');
      if (!tsEl && tsApi?.ioTsSpan) {
        tsEl = document.createElement('span');
        cell.appendChild(tsEl);
      }
      tsApi?.updateIoTsEl?.(tsEl, entry?.updatedAt, { stopped: !runtimeScanActive(runtime || lastRuntime) });
    });
    document.querySelectorAll('[data-alarm-state-live]').forEach((cell) => {
      const t = map.get(cell.dataset.alarmStateLive);
      if (!t) return;
      const tag = tags.find((x) => x.id === t.tagId);
      if (!tag) return;
      tag.alarmLevel = t.alarmLevel ?? tag.alarmLevel;
      cell.innerHTML = tagAlarmStateHtml(tag, t);
    });
    window.PeaklogicHmi?.refreshLiveBindings(live);
  }

  function opts(list, sel) {
    return list.map((x) => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('');
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  /** Saved-project timestamp in workspace timezone (Mongo stores UTC ISO). */
  function formatProjectSavedAt(iso) {
    if (!iso) return '';
    if (window.PeaklogicTime?.formatFriendly) return window.PeaklogicTime.formatFriendly(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
    return d.toLocaleString(undefined, {
      timeZone: window.PeaklogicTime?.getTimezone?.() || 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function projectFormatLabel(p) {
    return window.PeaklogicProjectListSort?.typeLabel(p)
      || (() => {
        const f = String(p?.format || '').toLowerCase();
        if (f === 'zip' || f === 'archive') return 'est.zip';
        if (f === 'json') return 'legacy json';
        return f || 'project';
      })();
  }

  function projectSortValue(p, key) {
    if (window.PeaklogicProjectListSort) return window.PeaklogicProjectListSort.sortValue(p, key);
    if (key === 'date') return String(p?.savedAt || p?.updatedAt || '');
    if (key === 'type') return projectFormatLabel(p).toLowerCase() || 'project';
    return String(p?.name || p?.file || p?.id || '').toLowerCase();
  }

  function sortProjectItems(items, scope) {
    const state = projectListSort[scope] || { key: 'date', dir: 'desc' };
    if (window.PeaklogicProjectListSort) {
      return window.PeaklogicProjectListSort.sortItems(items, state);
    }
    const mul = state.dir === 'asc' ? 1 : -1;
    return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
      const va = projectSortValue(a, state.key);
      const vb = projectSortValue(b, state.key);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return 0;
    });
  }

  function syncProjectSortButtons(scope) {
    const state = projectListSort[scope];
    if (!state) return;
    window.PeaklogicProjectListSort?.syncButtons(scope, state);
  }

  function cycleProjectSort(scope, key) {
    const state = projectListSort[scope];
    if (!state || !key) return;
    window.PeaklogicProjectListSort?.cycleSort(state, key);
  }

  function normalizeProjectRecord(p, defaults) {
    if (window.PeaklogicProjectListSort) {
      return window.PeaklogicProjectListSort.normalizeRecord(p, defaults);
    }
    return p;
  }

  function projectOptionLabel(p) {
    if (window.PeaklogicProjectListSort) {
      return window.PeaklogicProjectListSort.optionLabel(p);
    }
    const name = p.name || p.file || p.id || '';
    const type = projectFormatLabel(p);
    const when = p.savedAt || p.updatedAt;
    const datePart = when ? formatProjectSavedAt(when) : '';
    return `${name}${type ? ` · ${type}` : ''}${datePart ? ` · ${datePart}` : ''}`;
  }

  function bindProjectListSortControls() {
    document.querySelectorAll('[data-project-sort-scope]').forEach((bar) => {
      if (bar.dataset.sortBound === '1') return;
      bar.dataset.sortBound = '1';
      bar.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-project-sort]');
        if (!btn || !bar.contains(btn)) return;
        ev.preventDefault();
        const scope = bar.getAttribute('data-project-sort-scope');
        const key = btn.getAttribute('data-project-sort');
        cycleProjectSort(scope, key);
        syncProjectSortButtons(scope);
        if (scope === 'hub' && isCloudDeployment() && window.PeaklogicProjectHubUi?.refreshHubList) {
          window.PeaklogicProjectHubUi.refreshHubList().catch(console.error);
          return;
        }
        if (scope === 'picker') fillProjectPickerList(projects, $('project-picker-list')?.value);
        else if (scope === 'import') fillProjectImportList();
        else if (scope === 'hub') renderProjectHubList();
        else if (scope === 'setup') fillProjectListsInSetup();
      });
    });
    ['picker', 'import', 'hub', 'setup'].forEach(syncProjectSortButtons);
  }

  function graphableTagsList() {
    return tags.filter(isTagGraphable).sort((a, b) => a.id.localeCompare(b.id));
  }

  function findTag(id) {
    return tags.find((t) => t.id === id) || null;
  }

  function formatPenTagLabel(t) {
    if (!t) return '';
    const drv = t.driverId ? ` · ${t.driverId}` : '';
    const addr = formatAddr(t);
    const live = formatLive(t);
    return `${t.id} (${t.type}/${t.role}${drv} · ${addr} · ${live})`;
  }

  function penTagDetailBlock(tag) {
    if (!tag) {
      return '<div class="pen-tag-detail muted">Select a tag from the dropdown to see database fields.</div>';
    }
    return `<div class="pen-tag-detail">
      <strong>${esc(tag.id)}</strong>
      <span class="pen-tag-meta">${esc(tag.type)} · ${esc(tag.role)} · ${tag.wordWidth || 16}b</span>
      <span class="pen-tag-meta">Driver: ${esc(tag.driverId || '—')} (${esc(tagDriverKindLabel(tag))}) · Address: ${esc(formatAddr(tag))}</span>
      <span class="pen-tag-meta">Live: <strong>${esc(formatLive(tag))}</strong> · Default: ${esc(String(tag.default ?? '—'))} · Scale/offset: ${esc(tag.scale ?? 1)}/${esc(tag.offset ?? 0)}</span>
    </div>`;
  }

  function graphPenTagOptions(selectedId, rowIndex) {
    const list = graphableTagsList();
    const used = new Set(
      graphPens.map((p, i) => (i !== rowIndex ? p.tagId : null)).filter(Boolean)
    );
    const opts = ['<option value="">— select tag —</option>'];
    for (const t of list) {
      if (used.has(t.id) && t.id !== selectedId) continue;
      opts.push(
        `<option value="${esc(t.id)}" ${t.id === selectedId ? 'selected' : ''} title="${esc(formatPenTagLabel(t))}">${esc(t.id)}</option>`
      );
    }
    return opts.join('');
  }

  function defaultGraphPen() {
    const list = graphableTagsList();
    const used = new Set(graphPens.map((p) => p.tagId));
    const tag = list.find((t) => !used.has(t.id));
    const i = graphPens.length;
    return {
      tagId: tag?.id || '',
      color: GRAPH_PEN_COLORS[i % GRAPH_PEN_COLORS.length],
      scale: 1,
      offset: 0,
      ymin: 0,
      ymax: 100,
      autoScale: true,
    };
  }

  function collectGraphPensFromTable() {
    const host = $('graph-pens-table');
    if (!host) return graphPens.slice();
    const rows = host.querySelectorAll('tr[data-pen-row]');
    const out = [];
    const seen = new Set();
    rows.forEach((tr) => {
      const tagId = tr.querySelector('[data-pen-tag]')?.value?.trim();
      if (!tagId || seen.has(tagId)) return;
      seen.add(tagId);
      out.push({
        tagId,
        color: tr.querySelector('[data-pen-color]')?.value || GRAPH_PEN_COLORS[out.length % GRAPH_PEN_COLORS.length],
        scale: parseFloat(tr.querySelector('[data-pen-scale]')?.value) || 1,
        offset: parseFloat(tr.querySelector('[data-pen-offset]')?.value) || 0,
        ymin: parseFloat(tr.querySelector('[data-pen-ymin]')?.value) || 0,
        ymax: parseFloat(tr.querySelector('[data-pen-ymax]')?.value) || 100,
        autoScale: tr.querySelector('[data-pen-auto]')?.checked !== false,
      });
    });
    return out.slice(0, MAX_GRAPH_PENS);
  }

  async function ensureTagsForGraph() {
    if (tags.length) return;
    try {
      const data = await api.getTags();
      tags = data.tags || [];
    } catch (e) {
      console.warn('load tags for graph', e);
    }
  }

  function updatePenDetailPanel() {
    const panel = $('graph-pen-detail');
    if (!panel) return;
    graphPens = collectGraphPensFromTable();
    const blocks = graphPens.map((pen, i) => {
      const tag = findTag(pen.tagId);
      return `<div class="pen-detail-row"><span class="muted">Pen ${i + 1}:</span> ${penTagDetailBlock(tag)}</div>`;
    });
    panel.innerHTML = blocks.length
      ? blocks.join('')
      : penTagDetailBlock(null);
  }

  function bindPenRowEvents(host) {
    host.querySelectorAll('[data-pen-remove]').forEach((b) => {
      b.onclick = () => {
        markGraphPensDirty();
        graphPens.splice(+b.dataset.penRemove, 1);
        renderGraphPensSetup();
      };
    });
    host.querySelectorAll('[data-pen-tag]').forEach((sel) => {
      sel.onchange = () => {
        markGraphPensDirty();
        updatePenDetailPanel();
      };
    });
    host.querySelectorAll('input, select').forEach((inp) => {
      const onEdit = () => markGraphPensDirty();
      inp.addEventListener('focus', onEdit);
      inp.addEventListener('input', onEdit);
      inp.addEventListener('change', onEdit);
    });
  }

  function renderGraphPensSetup() {
    const host = $('graph-pens-table');
    const countEl = $('graph-pen-count');
    if (!host) return;
    const list = graphableTagsList();
    if (!graphPens.length && list.length) {
      graphPens = [defaultGraphPen()];
    }
    if (countEl) {
      countEl.textContent = `${graphPens.length} / ${MAX_GRAPH_PENS} pens · ${list.length} plottable tag(s) (${tags.length} total in database)`;
    }
    if ($('historian-setup-pen-count')) {
      $('historian-setup-pen-count').textContent = String(graphPens.length);
    }
    const rows = graphPens.map((pen, i) => `
      <tr data-pen-row="${i}">
        <td class="pen-swatch"><input type="color" data-pen-color value="${esc(pen.color)}" title="Pen color"></td>
        <td class="pen-tag-cell"><select data-pen-tag class="pen-tag-select">${graphPenTagOptions(pen.tagId, i)}</select></td>
        <td class="pen-num"><input type="number" data-pen-scale value="${esc(pen.scale ?? 1)}" step="any" title="Multiply tag value"></td>
        <td class="pen-num"><input type="number" data-pen-offset value="${esc(pen.offset ?? 0)}" step="any" title="Add after scale"></td>
        <td class="pen-num"><input type="number" data-pen-ymin value="${esc(pen.ymin ?? 0)}" step="any"></td>
        <td class="pen-num"><input type="number" data-pen-ymax value="${esc(pen.ymax ?? 100)}" step="any"></td>
        <td class="pen-auto"><label><input type="checkbox" data-pen-auto ${pen.autoScale !== false ? 'checked' : ''}> Auto Y</label></td>
        <td class="pen-remove"><button type="button" class="btn btn-sm" data-pen-remove="${i}">Remove</button></td>
      </tr>`).join('');
    const emptyMsg = !list.length
      ? '<p class="muted">No plottable tags in database. Open <strong>Tags</strong> and add BOOL, INT, or REAL tags first.</p>'
      : '';
    host.innerHTML = `${emptyMsg}
      <table class="data-table graph-pens-table">
        <colgroup>
          <col class="col-pen-color">
          <col class="col-pen-tag">
          <col class="col-pen-num">
          <col class="col-pen-num">
          <col class="col-pen-num">
          <col class="col-pen-num">
          <col class="col-pen-auto">
          <col class="col-pen-remove">
        </colgroup>
        <thead><tr>
          <th>Color</th><th>Tag (database)</th><th>Scale</th><th>Offset</th><th>Y min</th><th>Y max</th><th>Auto Y</th><th>Remove</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="muted">No pens — click Add pen</td></tr>'}</tbody>
      </table>`;
    bindPenRowEvents(host);
    updatePenDetailPanel();
  }

  function effectiveMongoLogger(stored) {
    const ml = stored && typeof stored === 'object' ? stored : {};
    if (ml.uri) {
      return {
        uri: ml.uri,
        db: ml.db || DEFAULT_MONGO_LOGGER.db,
        collection: ml.collection || DEFAULT_MONGO_LOGGER.collection,
        edgeCollection: ml.edgeCollection || DEFAULT_MONGO_LOGGER.edgeCollection,
        sampleIntervalMs: ml.sampleIntervalMs ?? DEFAULT_MONGO_LOGGER.sampleIntervalMs,
      };
    }
    return {
      uri: '',
      db: DEFAULT_MONGO_LOGGER.db,
      collection: DEFAULT_MONGO_LOGGER.collection,
      edgeCollection: DEFAULT_MONGO_LOGGER.edgeCollection,
      sampleIntervalMs: DEFAULT_MONGO_LOGGER.sampleIntervalMs,
    };
  }

  function mongoFormValue(suffix) {
    const el = $(`hist-log-${suffix}`) || $(`proj-mongo-${suffix}`);
    return el?.value;
  }

  function setMongoFormValue(suffix, value) {
    const a = $(`hist-log-${suffix}`);
    const b = $(`proj-mongo-${suffix}`);
    if (a) a.value = value;
    if (b) b.value = value;
  }

  function fillMongoLoggerFields(ml = lastSettings?.mongoLogger) {
    const eff = effectiveMongoLogger(ml);
    setMongoFormValue('uri', eff.uri);
    setMongoFormValue('db', eff.db);
    setMongoFormValue('collection', eff.collection);
    setMongoFormValue('edge-collection', eff.edgeCollection);
    setMongoFormValue('sample-ms', String(eff.sampleIntervalMs));
  }

  function collectMongoLoggerFromForm() {
    const uri = mongoFormValue('uri')?.trim() || '';
    if (!uri) return {};
    return {
      uri,
      db: mongoFormValue('db')?.trim() || DEFAULT_MONGO_LOGGER.db,
      collection: mongoFormValue('collection')?.trim() || DEFAULT_MONGO_LOGGER.collection,
      edgeCollection: mongoFormValue('edge-collection')?.trim() || DEFAULT_MONGO_LOGGER.edgeCollection,
      sampleIntervalMs: +(mongoFormValue('sample-ms')) || DEFAULT_MONGO_LOGGER.sampleIntervalMs,
    };
  }

  function autoStartRuntimeFromSettings(st = lastSettings) {
    return st?.autoStartRuntime === true;
  }

  function formatGlobalSiteKeyHex(v) {
    const n = Number(v);
    const key = Number.isFinite(n) && n >= 1 && n <= 0xffff ? Math.floor(n) : 0x0001;
    return `0x${key.toString(16).padStart(4, '0')}`;
  }

  function fillMqttParcHubStatus() {
    const el = $('proj-mqtt-hub-status');
    if (!el) return;
    const mqtt = lastDashboardData?.parc?.mqtt;
    const cloud = window.PEAKLOGIC_BUILD?.deployment === 'cloud'
      || window.PEAKLOGIC_DEPLOYMENT === 'cloud';
    if (!mqtt) {
      el.textContent = cloud
        ? 'Platform MQTT hub status unknown — refresh after SaaS restart.'
        : '';
      return;
    }
    if (mqtt.connected) {
      el.textContent = `MQTT hub ready at ${mqtt.brokerUrl || 'broker'} — Optas can check in when powered.`;
    } else if (mqtt.enabled) {
      el.textContent = `MQTT hub not connected${mqtt.brokerUrl ? ` (${mqtt.brokerUrl})` : ''}. Restart SaaS or check the broker.`;
    } else {
      el.textContent = cloud
        ? 'Platform MQTT hub is off — check PEAKLOGIC_MQTT_BROKER on the SaaS host.'
        : 'MQTT Parc hub is disabled.';
    }
  }

  function fillMqttParcFields(st = lastSettings) {
    const mp = st?.mqttParc || {};
    fillMqttParcHubStatus();
    if ($('proj-mqtt-parc-enabled')) {
      $('proj-mqtt-parc-enabled').checked = mp.enabled === true;
    }
    if ($('proj-mqtt-parc-broker')) {
      $('proj-mqtt-parc-broker').value = mp.brokerUrl || 'mqtt://127.0.0.1:1883';
    }
    if ($('proj-mqtt-parc-user')) {
      $('proj-mqtt-parc-user').value = mp.username || '';
    }
    if ($('proj-mqtt-parc-pass')) {
      $('proj-mqtt-parc-pass').value = mp.password || '';
    }
    if ($('proj-mqtt-parc-global-site-key')) {
      $('proj-mqtt-parc-global-site-key').value = formatGlobalSiteKeyHex(
        mp.globalSiteKey != null ? mp.globalSiteKey : 0x0001
      );
    }
    if ($('proj-remote-execution')) {
      $('proj-remote-execution').checked = st?.remoteExecution === true;
    }
    if ($('proj-opta-autorun')) {
      $('proj-opta-autorun').checked = st?.optaAutoRunOnBoot === true;
    }
    if ($('proj-mqtt-parc-auto-discover')) {
      $('proj-mqtt-parc-auto-discover').checked = mp.autoDiscoverDrivers === true;
    }
    const cloud = window.PEAKLOGIC_BUILD?.deployment === 'cloud'
      || window.PEAKLOGIC_DEPLOYMENT === 'cloud';
    for (const id of ['proj-mqtt-parc-broker', 'proj-mqtt-parc-user', 'proj-mqtt-parc-pass']) {
      if ($(id)) $(id).readOnly = cloud;
    }
    updateOptaDeviceModeHint();
  }

  function readMqttParcFields() {
    const prev = lastSettings?.mqttParc || {};
    return {
      enabled: !!$('proj-mqtt-parc-enabled')?.checked,
      brokerUrl: $('proj-mqtt-parc-broker')?.value?.trim() || prev.brokerUrl || 'mqtt://127.0.0.1:1883',
      globalSiteKey: $('proj-mqtt-parc-global-site-key')?.value?.trim() || '0x0001',
      topicPrefix: prev.topicPrefix || 'peaklogic/v1',
      clientId: prev.clientId || 'mv-central-hmi',
      username: $('proj-mqtt-parc-user')?.value?.trim() || prev.username || '',
      password: $('proj-mqtt-parc-pass')?.value !== undefined && $('proj-mqtt-parc-pass')?.value !== ''
        ? $('proj-mqtt-parc-pass').value
        : (prev.password || ''),
      autoDiscoverDrivers: !!$('proj-mqtt-parc-auto-discover')?.checked,
    };
  }

  function fillCloudRemoteFields(st = lastSettings) {
    const cr = st?.cloudRemote || {};
    if ($('proj-cloud-remote-enabled')) {
      $('proj-cloud-remote-enabled').checked = cr.enabled === true;
    }
    if ($('proj-cloud-tenant-id')) $('proj-cloud-tenant-id').value = cr.tenantId || '';
    if ($('proj-cloud-gateway-id')) $('proj-cloud-gateway-id').value = cr.gatewayId || cr.applianceId || '';
    if ($('proj-cloud-broker-url')) {
      $('proj-cloud-broker-url').value = cr.brokerUrl || 'mqtt://127.0.0.1:1883';
    }
    if ($('proj-cloud-mqtt-user')) {
      $('proj-cloud-mqtt-user').value = cr.username || '';
    }
    if ($('proj-cloud-mqtt-pass')) {
      $('proj-cloud-mqtt-pass').value = cr.password || '';
    }
  }

  function readCloudRemoteFields() {
    const prev = lastSettings?.cloudRemote || {};
    return {
      enabled: !!$('proj-cloud-remote-enabled')?.checked,
      tenantId: $('proj-cloud-tenant-id')?.value?.trim() || '',
      gatewayId: $('proj-cloud-gateway-id')?.value?.trim() || '',
      brokerUrl: $('proj-cloud-broker-url')?.value?.trim() || prev.brokerUrl || 'mqtt://127.0.0.1:1883',
      topicPrefix: prev.topicPrefix || 'peaklogic/v1',
      clientId: prev.clientId || 'peaklogic-appliance-remote',
      username: $('proj-cloud-mqtt-user')?.value?.trim() || prev.username || '',
      password: $('proj-cloud-mqtt-pass')?.value !== undefined && $('proj-cloud-mqtt-pass')?.value !== ''
        ? $('proj-cloud-mqtt-pass').value
        : (prev.password || ''),
      relayParc: prev.relayParc !== false,
    };
  }

  function fillCellularSimsFields(st = lastSettings) {
    const cs = st?.cellularSims || {};
    if ($('proj-cellular-sims-enabled')) {
      $('proj-cellular-sims-enabled').checked = cs.enabled === true;
    }
  }

  function fillCloudSimsFields(st = lastSettings) {
    const cs = st?.cloudSims || {};
    if ($('proj-cloud-sims-enabled')) {
      $('proj-cloud-sims-enabled').checked = cs.enabled === true;
    }
  }

  function readCloudSimsFields() {
    const el = $('proj-cloud-sims-enabled');
    if (!el) {
      return { enabled: lastSettings?.cloudSims?.enabled === true };
    }
    return {
      enabled: el.checked === true,
    };
  }

  function readCellularSimsFields() {
    const el = $('proj-cellular-sims-enabled');
    if (!el) {
      return { enabled: lastSettings?.cellularSims?.enabled === true };
    }
    return {
      enabled: el.checked === true,
    };
  }

  function syncStartupProjectField() {
    const mode = $('proj-startup-mode')?.value || 'workspace';
    const wrap = $('proj-startup-project-wrap');
    if (wrap) wrap.style.display = mode === 'saved_project' ? '' : 'none';
  }

  function fillProjectListsInSetup() {
    const list = sortProjectItems(
      (Array.isArray(projects) ? projects : []).map((p) => normalizeProjectRecord(p)),
      'setup',
    );
    const lib = $('proj-list');
    syncProjectSortButtons('setup');
    if (lib) {
      const prev = lib.value;
      lib.innerHTML = list.length
        ? list.map((p) =>
          `<option value="${esc(p.id)}">${esc(projectOptionLabel(p))}</option>`
        ).join('')
        : '<option value="">(none)</option>';
      if (prev && list.some((p) => p.id === prev)) lib.value = prev;
    }
    fillStartupFields(lastSettings, { preserveSelection: setupDirty });
  }

  async function refreshProjectLibrary() {
    try {
      const r = await api.listProjects();
      if (Array.isArray(r?.projects)) projects = r.projects;
    } catch (e) {
      console.error('listProjects', e);
      if (isCloudDeployment() && /select an organization|no tenant context/i.test(String(e.message || ''))) {
        projects = [];
      }
    }
    fillProjectListsInSetup();
  }

  function fillStartupFields(st = lastSettings, { preserveSelection } = {}) {
    const preserve = preserveSelection ?? setupDirty;
    const startup = st?.startup || {};
    if ($('proj-startup-mode') && !preserve) {
      $('proj-startup-mode').value = startup.mode || 'workspace';
    }
    const sel = $('proj-startup-project');
    if (sel) {
      const list = Array.isArray(projects) ? projects : [];
      const opts = list.map((p) =>
        `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`,
      );
      let savedId = '';
      if (preserve) {
        const current = sel.value?.trim() || '';
        if (current && list.some((p) => p.id === current)) {
          savedId = current;
        } else if (startup.projectId) {
          savedId = String(startup.projectId).trim();
        }
      } else if (startup.projectId) {
        savedId = String(startup.projectId).trim();
      }
      if (savedId && !list.some((p) => p.id === savedId)) {
        opts.unshift(`<option value="${esc(savedId)}">${esc(savedId)} (saved)</option>`);
      }
      sel.innerHTML = opts.join('') || '<option value="">(no saved projects — use Save project… first)</option>';
      if (savedId) sel.value = savedId;
    }
    if (!preserve) {
      if ($('proj-startup-prompt')) $('proj-startup-prompt').checked = !!startup.promptOnBoot;
      if ($('proj-auto-start-runtime')) {
        $('proj-auto-start-runtime').checked = autoStartRuntimeFromSettings(st);
      }
    }
    syncStartupProjectField();
  }

  function readStartupFields() {
    const mode = $('proj-startup-mode')?.value || 'workspace';
    let projectId = null;
    if (mode === 'saved_project') {
      projectId = $('proj-startup-project')?.value?.trim()
        || lastSettings?.startup?.projectId
        || null;
    }
    return {
      mode,
      projectId,
      promptOnBoot: !!$('proj-startup-prompt')?.checked,
    };
  }

  function renderLoggerHistTags() {
    const wrap = $('hist-log-tags-wrap');
    if (!wrap) return;
    const st = historianSelectAllState();
    const rows = tags.filter(isTagGraphable).map((t) => {
      const i = tags.indexOf(t);
      const checked = tagHistorianEnabled(t);
      return `<tr>
        <td><input type="checkbox" data-hist-log-tag="${i}" ${checked ? 'checked' : ''}></td>
        <td class="cell-mono">${esc(t.id)}</td>
        <td>${esc(t.type)}</td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<table class="data-table compact">
      <thead><tr>
        <th><label class="tag-hist-all"><input type="checkbox" data-hist-log-tag-all ${st.checked ? 'checked' : ''}> Hist</label><br><span class="muted th-sub">${st.enabled}/${st.total}</span></th>
        <th>Tag</th><th>Type</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="muted">No plottable tags</td></tr>'}</tbody>
    </table>`;
    const allEl = wrap.querySelector('[data-hist-log-tag-all]');
    if (allEl) {
      allEl.indeterminate = st.indeterminate;
      allEl.onchange = () => {
        setAllTagsHistorianEnabled(allEl.checked);
        renderLoggerHistTags();
        renderTags();
        tagsDirty = true;
      };
    }
    wrap.querySelectorAll('[data-hist-log-tag]').forEach((inp) => {
      inp.onchange = () => {
        const idx = +inp.dataset.histLogTag;
        const t = tags[idx];
        if (!t || !isTagGraphable(t)) return;
        t.graphEnabled = inp.checked;
        tagsDirty = true;
        renderLoggerHistTags();
        renderTags();
      };
    });
  }

  async function fillHistorianLoggerPopup() {
    fillMongoLoggerFields(lastSettings?.mongoLogger);
    if ($('hist-log-auto-start')) {
      $('hist-log-auto-start').checked = autoStartRuntimeFromSettings();
    }
    renderLoggerHistTags();
    renderHistorianPdmAssetManager();
    await updateHistorianLoggerMongoStatus();
    const msg = $('hist-log-save-msg');
    if (msg) {
      msg.textContent = '';
      msg.className = 'muted cell-mono';
    }
  }

  async function saveHistorianLoggerSettings() {
    const msgEl = $('hist-log-save-msg');
    if (msgEl) {
      msgEl.textContent = 'Saving…';
      msgEl.className = 'muted cell-mono';
    }
    if (tagsDirty) {
      await api.putTags(normalizeTagsForSave(tags));
      tagsDirty = false;
    }
    const mongoLogger = collectMongoLoggerFromForm();
    const autoStartRuntime = $('hist-log-auto-start')?.checked !== false;
    const res = await api.putSettings({
      mongoLogger: mongoLogger.uri ? mongoLogger : {},
      autoStartRuntime,
    });
    applySettingsResponse(res);
    mongoLoggerDirty = false;
    fillMongoLoggerFields(lastSettings?.mongoLogger || {});
    await updateHistorianLoggerMongoStatus();
    if (msgEl) {
      msgEl.textContent = 'Logger settings saved';
      msgEl.className = 'muted cell-mono ok-text';
    }
    return res;
  }

  async function updateHistorianLoggerMongoStatus() {
    const el = $('hist-log-mongo-status');
    if (!el) return;
    try {
      const s = await api.mongoLoggerStatus();
      if (!s.enabled) {
        el.textContent = 'Off — set MongoDB URI below or MONGODB_URI env, then Save logger settings';
        el.className = 'logging-status cell-mono muted';
        return;
      }
      el.textContent = `${s.connected ? 'Connected' : 'Not connected'} · ${s.db}.${s.collection} · sample every ${s.sampleIntervalMs} ms`;
      el.className = 'logging-status cell-mono muted ok-text';
    } catch (e) {
      el.textContent = `MongoDB logger: ${e.message}`;
      el.className = 'logging-status cell-mono muted err-text';
    }
  }

  function pdmAssetTagsMap() {
    const map = lastSettings?.pdm?.assetTags;
    return map && typeof map === 'object' ? { ...map } : {};
  }

  function pdmAssetIdList() {
    const tagMap = pdmAssetTagsMap();
    const ctxMap = pdmAssetContextMap();
    return [...new Set([...Object.keys(tagMap), ...Object.keys(ctxMap)])].sort((a, b) => a.localeCompare(b));
  }

  function pdmHistorianTagIds() {
    return tags
      .filter((t) => isTagGraphable(t))
      .map((t) => t.id)
      .sort((a, b) => a.localeCompare(b));
  }

  /** Ctrl+click toggle and Shift+click / Shift+arrow range select for <select multiple> listboxes. */
  function bindMultiSelectListbox(sel) {
    if (!sel || sel.dataset.multiSelectBound === '1') return;
    sel.dataset.multiSelectBound = '1';
    let anchorIndex = 0;

    function listOptions() {
      return [...sel.options].filter((o) => !o.disabled && o.value);
    }

    function selectRange(from, to) {
      const opts = listOptions();
      if (!opts.length) return;
      const lo = Math.max(0, Math.min(from, to));
      const hi = Math.min(opts.length - 1, Math.max(from, to));
      opts.forEach((o, i) => { o.selected = i >= lo && i <= hi; });
    }

    function focusIndex() {
      const opts = listOptions();
      if (!opts.length) return 0;
      const selected = [...sel.selectedOptions].filter((o) => o.value);
      if (selected.length) {
        const last = selected[selected.length - 1];
        const idx = opts.indexOf(last);
        if (idx >= 0) return idx;
      }
      return Math.min(Math.max(anchorIndex, 0), opts.length - 1);
    }

    sel.addEventListener('mousedown', (e) => {
      const opt = e.target;
      if (opt.tagName !== 'OPTION') return;
      const opts = listOptions();
      const idx = opts.indexOf(opt);
      if (idx < 0) return;
      if (e.shiftKey) {
        e.preventDefault();
        selectRange(anchorIndex, idx);
      } else if (!e.ctrlKey && !e.metaKey) {
        anchorIndex = idx;
      }
    });

    sel.addEventListener('keydown', (e) => {
      const opts = listOptions();
      if (!opts.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (e.shiftKey) {
          e.preventDefault();
          let idx = focusIndex();
          idx = e.key === 'ArrowDown'
            ? Math.min(opts.length - 1, idx + 1)
            : Math.max(0, idx - 1);
          selectRange(anchorIndex, idx);
          opts[idx]?.scrollIntoView({ block: 'nearest' });
          return;
        }
        requestAnimationFrame(() => {
          anchorIndex = focusIndex();
        });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        opts.forEach((o) => { o.selected = true; });
        anchorIndex = 0;
      }
    });

    sel.addEventListener('focus', () => {
      if (!sel.selectedOptions.length && listOptions().length) anchorIndex = 0;
    });
  }

  function fillHistorianPdmAssetTagPick(selectedIds = []) {
    const sel = $('historian-pdm-asset-tag-pick');
    if (!sel) return;
    bindMultiSelectListbox(sel);
    const pick = new Set(selectedIds || []);
    const graphableIds = pdmHistorianTagIds();
    const graphableSet = new Set(graphableIds);
    const extraSaved = [...pick].filter((id) => id && !graphableSet.has(id));
    const ids = [...graphableIds, ...extraSaved].sort((a, b) => a.localeCompare(b));
    sel.innerHTML = ids.length
      ? ids.map((id) => `<option value="${esc(id)}" ${pick.has(id) ? 'selected' : ''}>${esc(id)}</option>`).join('')
      : '<option value="" disabled>(no plottable tags — add tags first)</option>';
  }

  function pdmAssetContextMap() {
    const map = lastSettings?.pdm?.assetContext;
    return map && typeof map === 'object' ? { ...map } : {};
  }

  async function ensurePdmSetupCatalog() {
    if (pdmSetupCatalog) return pdmSetupCatalog;
    try {
      pdmSetupCatalog = await api.pdmSetupCatalog();
    } catch {
      pdmSetupCatalog = {
        motorTypes: ['pump', 'fan', 'compressor'],
        applicationsByMotor: {
          pump: ['lift_station', 'transfer', 'booster', 'sump'],
          fan: ['hvac', 'exhaust', 'cooling_tower', 'makeup_air'],
          compressor: ['refrigeration', 'air_compressor', 'heat_pump'],
        },
        configurationsByMotor: {
          pump: ['simplex', 'duplex', 'triplex'],
          fan: ['single', 'dual', 'vfd'],
          compressor: ['single', 'tandem'],
        },
      };
    }
    return pdmSetupCatalog;
  }

  function refreshHistorianPdmApplicationOptions(selected, configSelected) {
    const motorType = $('historian-pdm-motor-type')?.value || 'pump';
    const apps = pdmSetupCatalog?.applicationsByMotor?.[motorType] || ['lift_station'];
    const sel = $('historian-pdm-application');
    if (!sel) return;
    sel.innerHTML = apps.map((a) => `<option value="${esc(a)}" ${a === selected ? 'selected' : ''}>${esc(a.replace(/_/g, ' '))}</option>`).join('');
    refreshHistorianPdmConfigurationOptions(configSelected);
  }

  function refreshHistorianPdmConfigurationOptions(selected) {
    const motorType = $('historian-pdm-motor-type')?.value || 'pump';
    const configs = pdmSetupCatalog?.configurationsByMotor?.[motorType] || ['simplex'];
    const sel = $('historian-pdm-configuration');
    if (!sel) return;
    const cur = selected || sel.value || configs[0];
    sel.innerHTML = configs.map((c) => `<option value="${esc(c)}" ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }

  function defaultTagsForHistorianPdmForm() {
    const motorType = $('historian-pdm-motor-type')?.value || 'pump';
    const configuration = $('historian-pdm-configuration')?.value || 'simplex';
    const unitIndex = +($('historian-pdm-unit-index')?.value) || 1;
    const pumpRole = $('historian-pdm-pump-role')?.value || (unitIndex === 2 ? 'lag' : 'lead');
    if (motorType === 'pump') {
      const n = unitIndex;
      const ctBase = configuration === 'simplex' ? 1 : (n === 1 ? 1 : 4);
      const tags = [`MOTOR${n}_HRS`, `MOTOR${n}_STARTS`, `MOTOR${n}_START_MS`, `AI${ctBase}`, `AI${ctBase + 1}`, `AI${ctBase + 2}`];
      if (configuration !== 'simplex') tags.push(`P${n}_RUN_FB`, `MOTOR${n}_RUN`);
      if (configuration !== 'simplex' && pumpRole === 'lead') tags.push('LEAD_RUN');
      if (configuration !== 'simplex' && pumpRole === 'lag') tags.push('LAG_RUN');
      return tags;
    }
    if (motorType === 'fan') {
      return [`FAN${unitIndex}_HRS`, `FAN${unitIndex}_STARTS`, `FAN${unitIndex}_AMPS`, `FAN${unitIndex}_RUN_FB`];
    }
    return [`COMP${unitIndex}_HRS`, `COMP${unitIndex}_STARTS`, `COMP${unitIndex}_START_MS`, `COMP${unitIndex}_AMPS`];
  }

  function suggestHistorianPdmTags() {
    const suggested = defaultTagsForHistorianPdmForm();
    fillHistorianPdmAssetTagPick(suggested);
    setHistorianPdmAssetMsg(`Suggested ${suggested.length} tag(s) for ${$('historian-pdm-motor-type')?.value || 'pump'}`, true);
  }

  function readHistorianPdmAssetContextForm(assetId) {
    let serviceHistory = [];
    const rawHist = $('historian-pdm-service-history')?.value?.trim();
    if (rawHist) {
      try {
        const parsed = JSON.parse(rawHist);
        if (Array.isArray(parsed)) serviceHistory = parsed;
      } catch {
        throw new Error('Service history must be valid JSON array');
      }
    }
    return {
      assetId,
      motorType: $('historian-pdm-motor-type')?.value || 'pump',
      application: $('historian-pdm-application')?.value || 'lift_station',
      configuration: $('historian-pdm-configuration')?.value || 'simplex',
      locationClass: $('historian-pdm-location-class')?.value || 'office',
      installDate: $('historian-pdm-install-date')?.value || null,
      siteId: $('historian-pdm-site-id')?.value?.trim() || '',
      siteName: $('historian-pdm-site-name')?.value?.trim() || '',
      pumpIndex: +($('historian-pdm-unit-index')?.value) || 1,
      unitIndex: +($('historian-pdm-unit-index')?.value) || 1,
      pumpRole: $('historian-pdm-pump-role')?.value || 'lead',
      floatLadder: $('historian-pdm-float-ladder')?.value || 'pull_down',
      serviceHistory,
      enabled: true,
    };
  }

  function fillHistorianPdmAssetContextForm(ctx = {}) {
    if ($('historian-pdm-motor-type')) $('historian-pdm-motor-type').value = ctx.motorType || 'pump';
    refreshHistorianPdmApplicationOptions(ctx.application, ctx.configuration);
    if ($('historian-pdm-application') && ctx.application) $('historian-pdm-application').value = ctx.application;
    if ($('historian-pdm-configuration') && ctx.configuration) $('historian-pdm-configuration').value = ctx.configuration;
    if ($('historian-pdm-location-class')) $('historian-pdm-location-class').value = ctx.locationClass || 'office';
    if ($('historian-pdm-install-date')) $('historian-pdm-install-date').value = ctx.installDate || ctx.effectiveInstallDate || '';
    if ($('historian-pdm-site-id')) $('historian-pdm-site-id').value = ctx.siteId || '';
    if ($('historian-pdm-site-name')) $('historian-pdm-site-name').value = ctx.siteName || '';
    if ($('historian-pdm-unit-index')) $('historian-pdm-unit-index').value = ctx.pumpIndex || ctx.unitIndex || 1;
    if ($('historian-pdm-pump-role')) $('historian-pdm-pump-role').value = ctx.pumpRole || 'lead';
    if ($('historian-pdm-float-ladder')) $('historian-pdm-float-ladder').value = ctx.floatLadder || 'pull_down';
    if ($('historian-pdm-service-history')) {
      $('historian-pdm-service-history').value = Array.isArray(ctx.serviceHistory) && ctx.serviceHistory.length
        ? JSON.stringify(ctx.serviceHistory, null, 2)
        : '';
    }
  }

  async function loadHistorianPdmAssetForm(assetId) {
    await ensurePdmSetupCatalog();
    const id = String(assetId || '').trim();
    if ($('historian-pdm-asset-id')) $('historian-pdm-asset-id').value = id;
    const ctx = id ? (pdmAssetContextMap()[id] || {}) : {};
    fillHistorianPdmAssetContextForm(ctx);
    const tagIds = id ? (pdmAssetTagsMap()[id] || []) : [];
    fillHistorianPdmAssetTagPick(tagIds.length ? tagIds : (id ? defaultTagsForHistorianPdmForm() : []));
    highlightHistorianPdmAssetRow(id);
  }

  function highlightHistorianPdmAssetRow(assetId) {
    const tbody = $('historian-pdm-asset-tbody');
    if (!tbody) return;
    const id = String(assetId || '').trim();
    tbody.querySelectorAll('[data-pdm-asset-row]').forEach((tr) => {
      tr.classList.toggle('pdm-asset-row-active', tr.dataset.pdmAssetRow === id);
    });
  }

  async function editHistorianPdmAsset(assetId) {
    const aid = String(assetId || '').trim();
    if (!aid) return;
    pdmAssetManagerGen += 1;
    pdmAssetId = aid;
    pdmAssetEditOriginalId = aid;
    if ($('historian-pdm-asset')) $('historian-pdm-asset').value = aid;
    if ($('report-pdm-asset')) $('report-pdm-asset').value = aid;
    await loadHistorianPdmAssetForm(aid);
    $('historian-pdm-asset-id')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHistorianPdmAssetMsg(`Editing "${aid}" — click Save asset when done (confirm before saving)`, true);
  }

  function confirmHistorianPdmAssetSave({ id, originalId, tagIds, context }) {
    const renameNote = originalId && originalId !== id
      ? `\nRenames asset "${originalId}" → "${id}".`
      : '';
    const tagNote = tagIds.length
      ? `${tagIds.length} SCADA tag(s): ${tagIds.slice(0, 4).join(', ')}${tagIds.length > 4 ? '…' : ''}`
      : 'No SCADA tags selected';
    const typeNote = context?.motorType || 'pump';
    const locNote = (context?.locationClass || '').replace(/_/g, ' ') || '—';
    return window.confirm(
      `Save PdM asset "${id}"?${renameNote}\n\n${tagNote}\n${typeNote} · ${locNote}\n\nThis updates project settings.`,
    );
  }

  async function clearHistorianPdmAssetTags() {
    let form;
    try {
      form = readHistorianPdmAssetForm();
    } catch (e) {
      setHistorianPdmAssetMsg(e.message || 'Invalid form', false);
      return;
    }
    const { id, context } = form;
    if (!id) {
      setHistorianPdmAssetMsg('Enter or select an asset ID first', false);
      return;
    }
    const existing = pdmAssetTagsMap()[id] || [];
    const sel = $('historian-pdm-asset-tag-pick');
    if (!existing.length && sel && !sel.selectedOptions.length) {
      setHistorianPdmAssetMsg(`Asset "${id}" has no SCADA tags mapped`, false);
      return;
    }
    if (!window.confirm(
      `Clear all SCADA tags for asset "${id}"?\n\nThe pump/asset setup is kept. Use Delete asset to remove the asset entirely.`,
    )) return;
    setHistorianPdmAssetMsg('Clearing tags…');
    try {
      const setupRes = await api.putPdmAssetSetup(id, { context, tagIds: [] });
      if (setupRes?.settings) lastSettings = setupRes.settings;
      else if (setupRes?.pdm) lastSettings = { ...lastSettings, pdm: setupRes.pdm };
      pdmAssetId = id;
      pdmAssetEditOriginalId = id;
      pdmAssetManagerGen += 1;
      await refreshPdmAssetLists();
      renderHistorianPdmAssetManager({ loadAssetId: id });
      setHistorianPdmAssetMsg(`Cleared SCADA tags for "${id}" (asset setup kept)`, true);
    } catch (e) {
      setHistorianPdmAssetMsg(e.message || 'Clear tags failed', false);
    }
  }

  function readHistorianPdmAssetForm() {
    const id = $('historian-pdm-asset-id')?.value?.trim() || '';
    const sel = $('historian-pdm-asset-tag-pick');
    const tagIds = sel
      ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean)
      : [];
    const context = id ? readHistorianPdmAssetContextForm(id) : null;
    return { id, tagIds, context };
  }

  function renderHistorianPdmAssetTable() {
    const tbody = $('historian-pdm-asset-tbody');
    if (!tbody) return;
    const map = pdmAssetTagsMap();
    const ctxMap = pdmAssetContextMap();
    const rows = pdmAssetIdList();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No assets — click <strong>New</strong> to add one.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((id) => {
      const tagList = (map[id] || []).join(', ') || '—';
      const ctx = ctxMap[id] || {};
      const typeLabel = ctx.motorType || '—';
      const locLabel = (ctx.locationClass || '—').replace(/_/g, ' ');
      const active = id === pdmAssetId ? ' pdm-asset-row-active' : '';
      return `<tr data-pdm-asset-row="${esc(id)}" class="pdm-asset-row${active}">
        <td class="cell-mono">${esc(id)}</td>
        <td>${esc(typeLabel)}</td>
        <td>${esc(locLabel)}</td>
        <td class="cell-mono">${esc(tagList)}</td>
        <td class="pdm-asset-row-actions"><button type="button" class="btn btn-sm" data-pdm-asset-edit="${esc(id)}">Edit</button></td>
      </tr>`;
    }).join('');
    highlightHistorianPdmAssetRow(pdmAssetId);
  }

  function bindHistorianPdmAssetTableEvents() {
    const tbody = $('historian-pdm-asset-tbody');
    if (!tbody || tbody.dataset.pdmBound === '1') return;
    tbody.dataset.pdmBound = '1';
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pdm-asset-edit]');
      const row = e.target.closest('[data-pdm-asset-row]');
      if (e.target.closest('.pdm-asset-row-actions')) return;
      const aid = btn?.getAttribute('data-pdm-asset-edit')
        || row?.getAttribute('data-pdm-asset-row');
      if (!aid) return;
      editHistorianPdmAsset(aid).catch((err) => setHistorianPdmAssetMsg(err.message || String(err), false));
    });
  }

  function renderHistorianPdmAssetManager(opts = {}) {
    const gen = ++pdmAssetManagerGen;
    const loadId = opts.loadAssetId != null ? opts.loadAssetId : pdmAssetId;
    bindHistorianPdmAssetTableEvents();
    ensurePdmSetupCatalog().then(async () => {
      if (gen !== pdmAssetManagerGen) return;
      renderHistorianPdmAssetTable();
      if (loadId) await loadHistorianPdmAssetForm(loadId);
    });
  }

  function setHistorianPdmAssetMsg(text, ok) {
    const el = $('historian-pdm-asset-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = ok === true ? 'muted cell-mono ok-text' : ok === false ? 'muted cell-mono err-text' : 'muted cell-mono';
  }

  async function persistPdmAssetTags(assetTags, assetContext) {
    const pdm = {
      ...(lastSettings?.pdm || {}),
      assetTags,
      ...(assetContext && typeof assetContext === 'object' ? { assetContext } : {}),
    };
    const res = await api.putPdmSettings({ pdm });
    if (res?.settings) lastSettings = res.settings;
    else lastSettings = { ...lastSettings, pdm: res.pdm || pdm };
    fillPdmSettingsFields(lastSettings.pdm);
    pdmAssetManagerGen += 1;
    await refreshPdmAssetLists();
    renderHistorianPdmAssetManager({ loadAssetId: pdmAssetId });
    return res;
  }

  async function saveHistorianPdmAsset() {
    let form;
    try {
      form = readHistorianPdmAssetForm();
    } catch (e) {
      setHistorianPdmAssetMsg(e.message || 'Invalid form', false);
      return;
    }
    const { id, tagIds, context } = form;
    if (!id) {
      setHistorianPdmAssetMsg('Asset ID is required', false);
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      setHistorianPdmAssetMsg('Asset ID: letters, numbers, dot, dash, underscore only', false);
      return;
    }
    const originalId = String(pdmAssetEditOriginalId || pdmAssetId || id).trim();
    if (!tagIds.length) {
      if (!window.confirm(
        `Save asset "${id}" with no SCADA tags?\n\nPdM will not have historian tags for this asset until you map tags again.`,
      )) return;
    } else if (!confirmHistorianPdmAssetSave({ id, originalId, tagIds, context })) {
      setHistorianPdmAssetMsg('Save cancelled', false);
      return;
    }
    setHistorianPdmAssetMsg('Saving…');
    try {
      if (originalId && originalId !== id
        && (pdmAssetTagsMap()[originalId] || pdmAssetContextMap()[originalId])) {
        await api.deletePdmAssetSetup(originalId);
      }
      const setupRes = await api.putPdmAssetSetup(id, { context, tagIds });
      if (setupRes?.settings) lastSettings = setupRes.settings;
      else if (setupRes?.pdm) {
        lastSettings = { ...lastSettings, pdm: setupRes.pdm };
      }
      pdmAssetId = id;
      pdmAssetEditOriginalId = id;
      if ($('historian-pdm-asset')) $('historian-pdm-asset').value = id;
      if ($('report-pdm-asset')) $('report-pdm-asset').value = id;
      pdmAssetManagerGen += 1;
      await refreshPdmAssetLists();
      renderHistorianPdmAssetManager({ loadAssetId: id });
      setHistorianPdmAssetMsg(`Saved asset "${id}" (${tagIds.length} tag(s), ${context?.motorType || 'pump'})`, true);
    } catch (e) {
      setHistorianPdmAssetMsg(e.message || 'Save failed', false);
    }
  }

  async function deleteHistorianPdmAsset() {
    const { id } = readHistorianPdmAssetForm();
    if (!id) {
      setHistorianPdmAssetMsg('Choose an asset to delete', false);
      return;
    }
    if (!pdmAssetTagsMap()[id] && !pdmAssetContextMap()[id]) {
      setHistorianPdmAssetMsg(`Asset "${id}" not in map`, false);
      return;
    }
    if (!window.confirm(
      `Delete PdM asset "${id}" entirely?\n\nThis removes the asset, setup metadata, and tag mapping. Use Clear tags to remove tags only.`,
    )) return;
    setHistorianPdmAssetMsg('Deleting…');
    try {
      const res = await api.deletePdmAssetSetup(id);
      if (res?.settings) lastSettings = res.settings;
      else if (res?.pdm) lastSettings = { ...lastSettings, pdm: res.pdm };
      pdmAssetId = '';
      pdmAssetEditOriginalId = '';
      await loadHistorianPdmAssetForm('');
      setHistorianPdmAssetMsg(`Deleted asset "${id}"`, true);
      pdmAssetManagerGen += 1;
      await refreshPdmAssetLists();
      renderHistorianPdmAssetManager({ loadAssetId: '' });
    } catch (e) {
      setHistorianPdmAssetMsg(e.message || 'Delete failed', false);
    }
  }

  function fillPdmSettingsFields(pdm = lastSettings?.pdm) {
    const cfg = pdm && typeof pdm === 'object' ? pdm : {};
    const cmms = lastSettings?.cmms && typeof lastSettings.cmms === 'object' ? lastSettings.cmms : {};
    if ($('proj-pdm-window-min')) $('proj-pdm-window-min').value = cfg.windowMin ?? 5;
    if ($('proj-pdm-failure-threshold')) $('proj-pdm-failure-threshold').value = cfg.failureThreshold ?? 0.3;
    if ($('proj-pdm-features-collection')) $('proj-pdm-features-collection').value = cfg.featuresCollection || 'pdm_features';
    if ($('proj-pdm-build-enabled')) $('proj-pdm-build-enabled').checked = !!cfg.buildEnabled;
    if ($('proj-pdm-build-interval')) $('proj-pdm-build-interval').value = cfg.buildIntervalHours ?? 24;
    if ($('proj-pdm-sim-seed-days')) $('proj-pdm-sim-seed-days').value = cfg.simSeedDays ?? 180;
    if ($('proj-pdm-report-enabled')) $('proj-pdm-report-enabled').checked = !!cfg.reportEnabled;
    if ($('proj-pdm-report-interval')) $('proj-pdm-report-interval').value = cfg.reportIntervalHours ?? 168;
    if ($('proj-pdm-report-title')) $('proj-pdm-report-title').value = cfg.reportTitle || 'PdM Report';
    if ($('proj-cmms-auto-pdm-wo')) $('proj-cmms-auto-pdm-wo').checked = cmms.autoWorkOrdersFromPdm !== false;
    if ($('proj-cmms-append-service-history')) $('proj-cmms-append-service-history').checked = cmms.appendServiceHistoryOnWoComplete !== false;
  }

  function collectPdmFromForm() {
    const assetTags = pdmAssetTagsMap();
    const assetContext = pdmAssetContextMap();
    return {
      assetTags,
      assetContext,
      windowMin: +($('proj-pdm-window-min')?.value) || 5,
      failureThreshold: +($('proj-pdm-failure-threshold')?.value) || 0.3,
      featuresCollection: $('proj-pdm-features-collection')?.value?.trim() || 'pdm_features',
      buildEnabled: !!$('proj-pdm-build-enabled')?.checked,
      buildIntervalHours: +($('proj-pdm-build-interval')?.value) || 24,
      simSeedDays: Math.min(360, Math.max(30, +($('proj-pdm-sim-seed-days')?.value) || 180)),
      reportEnabled: !!$('proj-pdm-report-enabled')?.checked,
      reportIntervalHours: Math.min(720, Math.max(1, +($('proj-pdm-report-interval')?.value) || 168)),
      reportTitle: $('proj-pdm-report-title')?.value?.trim() || 'PdM Report',
    };
  }

  function collectCmmsFromPdmForm() {
    return {
      autoWorkOrdersFromPdm: !!$('proj-cmms-auto-pdm-wo')?.checked,
      appendServiceHistoryOnWoComplete: !!$('proj-cmms-append-service-history')?.checked,
      autoWorkOrdersFromAlarms: lastSettings?.cmms?.autoWorkOrdersFromAlarms !== false,
    };
  }

  async function savePdmSettings() {
    const msgEl = $('pdm-save-msg');
    const pdm = collectPdmFromForm();
    const cmms = collectCmmsFromPdmForm();
    if (msgEl) { msgEl.textContent = 'Saving…'; msgEl.className = 'muted'; }
    const res = await api.putPdmSettings({ pdm, cmms });
    if (res?.settings) lastSettings = res.settings;
    else lastSettings = { ...lastSettings, pdm: res.pdm || pdm, cmms: res.cmms || cmms };
    fillPdmSettingsFields(lastSettings.pdm);
    await refreshPdmAssetLists();
    renderHistorianPdmAssetManager({ loadAssetId: pdmAssetId });
    await updatePdmBatchStatus();
    if (msgEl) { msgEl.textContent = 'PdM & proactive CMMS settings saved'; msgEl.className = 'muted ok-text'; }
    return res;
  }

  async function runPdmProactiveCheck() {
    const msgEl = $('pdm-save-msg');
    const assetId = $('historian-pdm-asset-id')?.value?.trim() || pdmAssetId || '';
    if (msgEl) { msgEl.textContent = 'Running proactive CMMS check…'; msgEl.className = 'muted'; }
    const res = await api.runPdmProactive(assetId ? { assetId } : {});
    const created = res.workOrder ? 1 : (res.count ?? 0);
    if (msgEl) {
      msgEl.textContent = created
        ? `Proactive PM: ${created} work order(s) issued or updated`
        : 'Proactive check complete — no pending-failure PM needed';
      msgEl.className = 'muted ok-text';
    }
    return res;
  }

  async function downloadPdmAssetPdf() {
    const msgEl = $('pdm-save-msg');
    const assetId = $('historian-pdm-asset-id')?.value?.trim() || pdmAssetId || '';
    if (!assetId) {
      if (msgEl) { msgEl.textContent = 'Select or enter an asset ID first'; msgEl.className = 'muted err-text'; }
      return;
    }
    if (msgEl) { msgEl.textContent = 'Building PdM PDF…'; msgEl.className = 'muted'; }
    const days = Math.min(360, Math.max(30, +($('proj-pdm-sim-seed-days')?.value) || 180));
    const blob = await api.downloadPdmReportPdf({ assetId, days, storeInMongo: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PeakLogic_PdM_${assetId.replace(/[^\w.-]+/g, '_')}_${stamp}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (msgEl) { msgEl.textContent = `PdM PDF downloaded for ${assetId}`; msgEl.className = 'muted ok-text'; }
  }

  async function buildPdmFeaturesNow() {
    const msgEl = $('pdm-save-msg');
    if (msgEl) { msgEl.textContent = 'Building features…'; msgEl.className = 'muted'; }
    const res = await api.buildPdmFeatures();
    await updatePdmBatchStatus();
    const woCount = res.proactive?.count ?? 0;
    if (msgEl) {
      msgEl.textContent = woCount
        ? `Built features for ${res.count ?? 0} asset(s) · ${woCount} proactive PM WO(s)`
        : `Built features for ${res.count ?? 0} asset(s)`;
      msgEl.className = 'muted ok-text';
    }
    return res;
  }

  async function simulateMotorPdm() {
    const msgEl = $('pdm-save-msg');
    const days = Math.min(360, Math.max(30, +($('proj-pdm-sim-seed-days')?.value) || 90));
    if (msgEl) { msgEl.textContent = 'Simulating motor starts…'; msgEl.className = 'muted'; }
    const res = await api.simulateMotorPdm({ days, startsPerDay: 2 });
    if (res?.assetTags) lastSettings = { ...lastSettings, pdm: { ...(lastSettings.pdm || {}), assetTags: res.assetTags } };
    fillPdmSettingsFields(lastSettings.pdm);
    await refreshPdmAssetLists();
    renderHistorianPdmAssetManager({ loadAssetId: pdmAssetId });
    if (msgEl) {
      msgEl.textContent = `Seeded ${res.startCount ?? 0} motor start events for ${res.assetId} (${days} days)`;
      msgEl.className = 'muted ok-text';
    }
    return res;
  }

  async function simulateMotorAssetPdm() {
    const msgEl = $('pdm-save-msg');
    let form;
    try {
      form = readHistorianPdmAssetForm();
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'muted err-text'; }
      return;
    }
    const { id, tagIds, context } = form;
    if (!id) {
      if (msgEl) { msgEl.textContent = 'Enter or select an asset ID in PdM assets'; msgEl.className = 'muted err-text'; }
      return;
    }
    if (!tagIds.length) {
      if (msgEl) { msgEl.textContent = 'Select SCADA tags before seeding'; msgEl.className = 'muted err-text'; }
      return;
    }
    const days = Math.min(360, Math.max(30, +($('proj-pdm-sim-seed-days')?.value) || 180));
    if (msgEl) { msgEl.textContent = `Seeding ${days}-day demo for ${id}…`; msgEl.className = 'muted'; }
    try {
      await api.putPdmAssetSetup(id, { context, tagIds });
      const map = pdmAssetTagsMap();
      map[id] = tagIds;
      await persistPdmAssetTags(map);
      const res = await api.simulateMotorAssetPdm({ assetId: id, days, context, buildFeatures: true });
      if (res?.settings) lastSettings = res.settings;
      else if (res?.pdm) lastSettings = { ...lastSettings, pdm: res.pdm };
      fillPdmSettingsFields(lastSettings.pdm);
      await refreshPdmAssetLists();
      await loadHistorianPdmAssetForm(id);
      const featCount = res.featuresBuilt?.meta?.windowCount ?? res.featuresBuilt?.features?.length ?? 0;
      const woNote = res.proactive?.workOrder?.number ? ` · proactive PM ${res.proactive.workOrder.number}` : '';
      if (msgEl) {
        msgEl.textContent = `Seeded ${res.edgeInferenceCount ?? res.startCount ?? 0} edge events, ${res.penSampleCount ?? 0} pen samples, ${featCount} feature windows (${days} days)${woNote}`;
        msgEl.className = 'muted ok-text';
      }
      return res;
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message || 'Seed failed'; msgEl.className = 'muted err-text'; }
      throw e;
    }
  }

  function readRoiFields() {
    return {
      leakDetection: {
        systemCost: +($('roi-leak-system-cost')?.value) || 0,
        amortizationYears: +($('roi-leak-amort-years')?.value) || 5,
        repairCostPerEvent: +($('roi-leak-repair-cost')?.value) || 90,
        eventsPerYear: +($('roi-leak-events-year')?.value) || 0,
      },
      pool: {
        pumpUpgradeCost: +($('roi-pool-pump-cost')?.value) || 0,
        chemicalSystemCost: +($('roi-pool-chem-cost')?.value) || 0,
        amortizationYears: +($('roi-pool-amort-years')?.value) || 7,
        monthlyEnergySavings: +($('roi-pool-energy-monthly')?.value) || 0,
        monthlyChemicalSavings: +($('roi-pool-chem-monthly')?.value) || 0,
      },
    };
  }

  function fillRoiSettingsFields(roi = lastSettings?.roi) {
    const cfg = roi && typeof roi === 'object' ? roi : {};
    const leak = cfg.leakDetection || {};
    const pool = cfg.pool || {};
    if ($('roi-leak-system-cost')) $('roi-leak-system-cost').value = leak.systemCost ?? 0;
    if ($('roi-leak-amort-years')) $('roi-leak-amort-years').value = leak.amortizationYears ?? 5;
    if ($('roi-leak-repair-cost')) $('roi-leak-repair-cost').value = leak.repairCostPerEvent ?? 90;
    if ($('roi-leak-events-year')) $('roi-leak-events-year').value = leak.eventsPerYear ?? 4;
    if ($('roi-pool-pump-cost')) $('roi-pool-pump-cost').value = pool.pumpUpgradeCost ?? 0;
    if ($('roi-pool-chem-cost')) $('roi-pool-chem-cost').value = pool.chemicalSystemCost ?? 0;
    if ($('roi-pool-amort-years')) $('roi-pool-amort-years').value = pool.amortizationYears ?? 7;
    if ($('roi-pool-energy-monthly')) $('roi-pool-energy-monthly').value = pool.monthlyEnergySavings ?? 0;
    if ($('roi-pool-chem-monthly')) $('roi-pool-chem-monthly').value = pool.monthlyChemicalSavings ?? 0;
  }

  function refreshRoiCalculatorDisplay() {
    const calc = window.PeaklogicRoi;
    if (!calc) return;
    const roi = readRoiFields();
    const leak = calc.computeLeakDetectionRoi(roi.leakDetection);
    const pool = calc.computePoolRoi(roi.pool);
    const fmt = calc.formatMoney;
    const fmtMo = calc.formatMonths;

    const set = (id, text, positive) => {
      const el = $(id);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('roi-positive', positive === true);
      el.classList.toggle('roi-negative', positive === false);
    };

    set('roi-leak-annual-savings', fmt(leak.annualGrossSavings), leak.annualGrossSavings > 0);
    set('roi-leak-amort-cost', fmt(leak.amortizedAnnualCost), false);
    set('roi-leak-net-annual', fmt(leak.netAnnualBenefit), leak.netAnnualBenefit >= 0);
    set('roi-leak-payback', fmtMo(leak.paybackMonths), null);
    set('roi-leak-roi-pct', `${leak.roiPercent}%`, leak.roiPercent >= 0);

    set('roi-pool-monthly-total', fmt(pool.monthlyTotalSavings), pool.monthlyTotalSavings > 0);
    set('roi-pool-annual-savings', fmt(pool.annualGrossSavings), pool.annualGrossSavings > 0);
    set('roi-pool-net-annual', fmt(pool.netAnnualBenefit), pool.netAnnualBenefit >= 0);
    set('roi-pool-payback', fmtMo(pool.paybackMonths), null);
    set('roi-pool-roi-pct', `${pool.roiPercent}%`, pool.roiPercent >= 0);

    const combinedUpfront = leak.systemCost + pool.totalUpfrontCost;
    const combinedAnnual = leak.annualGrossSavings + pool.annualGrossSavings;
    const combinedNet = leak.netAnnualBenefit + pool.netAnnualBenefit;
    set('roi-combined-upfront', fmt(combinedUpfront), null);
    set('roi-combined-annual', fmt(combinedAnnual), combinedAnnual > 0);
    set('roi-combined-net', fmt(combinedNet), combinedNet >= 0);

    const hint = $('roi-combined-hint');
    if (hint) {
      hint.textContent = combinedUpfront > 0 || combinedAnnual > 0
        ? 'Portfolio totals across leak detection and pool assets (each asset amortizes on its own schedule).'
        : 'Enter costs and savings above to see a portfolio summary.';
    }
  }

  function bindRoiCalculatorInputs() {
    if (window._roiCalcBound) return;
    window._roiCalcBound = true;
    document.addEventListener('input', (e) => {
      if (!e.target.matches('[id^="roi-"]')) return;
      refreshRoiCalculatorDisplay();
    });
  }

  async function saveRoiSettings() {
    const msgEl = $('report-roi-msg');
    if (msgEl) {
      msgEl.textContent = 'Saving…';
      msgEl.className = 'muted';
    }
    try {
      const res = await api.putSettings({ roi: readRoiFields() });
      applySettingsResponse(res);
      fillRoiSettingsFields(lastSettings?.roi);
      refreshRoiCalculatorDisplay();
      if (msgEl) {
        msgEl.textContent = 'ROI saved';
        msgEl.className = 'muted ok-text';
      }
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message || 'Save failed';
        msgEl.className = 'muted err-text';
      }
    }
  }

  async function refreshPdmAssetLists() {
    let assets = pdmAssetIdList();
    try {
      const data = await api.pdmAssets();
      if (Array.isArray(data?.assets) && data.assets.length) assets = data.assets;
      if (data?.pdm) lastSettings = { ...lastSettings, pdm: data.pdm };
      const setup = await api.pdmSetupList();
      if (setup?.pdm) lastSettings = { ...lastSettings, pdm: setup.pdm };
      else if (setup?.assets && typeof setup.assets === 'object') {
        lastSettings = {
          ...lastSettings,
          pdm: { ...(lastSettings.pdm || {}), assetContext: setup.assets },
        };
      }
      if (Array.isArray(setup?.assetIds) && setup.assetIds.length) {
        assets = setup.assetIds;
      }
    } catch { /* keep local */ }
    assets = [...new Set(assets)].sort((a, b) => a.localeCompare(b));
    const opts = assets.map((a) => `<option value="${esc(a)}" ${a === pdmAssetId ? 'selected' : ''}>${esc(a)}</option>`).join('');
    const html = assets.length ? opts : '<option value="">— no assets —</option>';
    for (const id of ['historian-pdm-asset', 'report-pdm-asset']) {
      const sel = $(id);
      if (sel) sel.innerHTML = html;
    }
    if (!pdmAssetId && assets.length) {
      pdmAssetId = assets[0];
      if ($('historian-pdm-asset')) $('historian-pdm-asset').value = pdmAssetId;
      if ($('report-pdm-asset')) $('report-pdm-asset').value = pdmAssetId;
    }
  }

  async function updatePdmBatchStatus() {
    const el = $('pdm-batch-status');
    if (!el) return;
    try {
      const s = await api.pdmStatus();
      const sched = s.scheduler;
      const last = sched?.lastRunAt ? ` last run ${sched.lastRunAt}` : '';
      const err = sched?.lastRunError ? ` · ${sched.lastRunError}` : '';
      el.textContent = `PdM batch: ${s.enabled ? 'enabled' : 'off'} · ${s.assets?.length || 0} asset(s) · proactive CMMS ${s.autoWorkOrdersFromPdm !== false ? 'on' : 'off'} · ${s.featuresCollection || 'pdm_features'}${last}${err}`;
      el.className = 'logging-status cell-mono muted';
    } catch (e) {
      el.textContent = `PdM batch: ${e.message}`;
      el.className = 'logging-status cell-mono muted err-text';
    }
  }

  function pdmPensFromView(view) {
    if (Array.isArray(view?.pens) && view.pens.length) return view.pens;
    const colors = ['#2563eb', '#f59e0b', '#22c55e', '#9333ea', '#dc2626', '#0891b2'];
    const ids = ['HEALTH_IDX', 'EDGE_SCORE', ...(view?.tagIds || [])];
    return ids.map((tagId, i) => ({
      tagId,
      label: tagId,
      color: colors[i % colors.length],
      scale: 1,
      offset: 0,
    }));
  }

  function renderPdmForecastBanner(elId, forecast) {
    const el = $(elId);
    if (!el) return;
    if (!forecast?.ok) {
      el.classList.add('view-hidden');
      el.textContent = '';
      return;
    }
    el.classList.remove('view-hidden');
    el.dataset.severity = forecast.severity || 'ok';
    el.textContent = forecast.headline || '';
    if (forecast.reportLines?.length) {
      el.title = forecast.reportLines.join('\n');
    }
  }

  async function loadPdmHistorian(msgElId = 'historian-load-msg') {
    const asset = pdmAssetId || $('historian-pdm-asset')?.value || $('report-pdm-asset')?.value;
    if (!asset) {
      alert('Configure at least one asset in Historian → PdM…');
      return;
    }
    pdmAssetId = asset;
    const msgEl = $(msgElId);
    if (msgEl) { msgEl.textContent = 'Loading PdM…'; msgEl.className = 'muted'; }
    let from;
    let to;
    try {
      ({ from, to } = historianRangeBounds());
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'muted err-text'; }
      alert(e.message);
      return;
    }
    try {
      const data = await api.getPdmView({
        asset,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      });
      historianSource = 'pdm';
      syncHistorianSourceUi();
      historianPdmHistory = data.history || {};
      historianPdmMeta = data.meta || null;
      historianPdmForecast = data.forecast || null;
      historianPdmRul = data.rul || null;
      historianPdmAssetContext = data.assetContext || null;
      historianPdmPens = pdmPensFromView(data);
      const summary = `${asset} · ${data.meta?.windowCount ?? 0} window(s)`;
      for (const id of ['historian-pdm-summary', 'report-pdm-summary']) {
        const el = $(id);
        if (el) el.textContent = summary;
      }
      renderPdmForecastBanner('historian-pdm-forecast', historianPdmForecast);
      renderPdmForecastBanner('report-pdm-forecast', historianPdmForecast);
      if (msgEl) { msgEl.textContent = 'PdM loaded'; msgEl.className = 'muted ok-text'; }
      drawHistorianPopups();
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'muted err-text'; }
      alert(e.message);
    }
  }

  function exportPdmCsv() {
    const hist = getHistorianDisplayHistory();
    const pens = getHistorianDisplayPens();
    const rows = ['timestamp,' + pens.map((p) => p.tagId).join(',')];
    const tagIds = pens.map((p) => p.tagId);
    const tsSet = new Set();
    for (const id of tagIds) {
      for (const pt of hist[id] || []) tsSet.add(pt.ts);
    }
    const times = [...tsSet].sort((a, b) => a - b);
    for (const ts of times) {
      const cols = tagIds.map((id) => {
        const hit = (hist[id] || []).find((p) => p.ts === ts);
        return hit != null ? hit.value : '';
      });
      rows.push(`${new Date(ts).toISOString()},${cols.join(',')}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PeakLogic_pdm_${pdmAssetId || 'asset'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function getHistorianDisplayPens() {
    if (historianSource === 'pdm' && historianPdmPens.length) return historianPdmPens;
    return graphPens;
  }

  function resolveActiveSavedProjectId(settings = lastSettings) {
    if (activeSavedProjectId) return String(activeSavedProjectId);
    const startup = settings?.startup || {};
    if (startup.mode === 'saved_project' && startup.projectId) {
      return String(startup.projectId);
    }
    if (settings?.project?.lastOpenedId) {
      return String(settings.project.lastOpenedId);
    }
    return null;
  }

  function resolveProjectDisplayName(settings = lastSettings, hintName) {
    const hinted = typeof hintName === 'string' ? hintName.trim() : '';
    if (hinted) return hinted;
    const savedId = resolveActiveSavedProjectId(settings);
    if (savedId && Array.isArray(projects)) {
      const listed = projects.find((p) => String(p.id) === savedId);
      if (listed?.name) return String(listed.name).trim() || savedId;
      return savedId;
    }
    const fromSettings = settings?.project?.name;
    if (fromSettings && typeof fromSettings === 'string') {
      const trimmed = fromSettings.trim();
      if (trimmed) return trimmed;
    }
    return 'untitled';
  }

  function syncProjectNameFromSettings(settings = lastSettings, hintName) {
    const name = resolveProjectDisplayName(settings, hintName);
    projectName = name;
    const topEl = $('project-name');
    if (topEl) topEl.textContent = name;
    if (!setupDirty && $('proj-name')) {
      $('proj-name').value = name;
    }
  }

  function applyDisplayTimezone(settings = lastSettings) {
    const tz = settings?.timezone
      || window.PeaklogicTime?.DEFAULT_TIMEZONE
      || 'America/New_York';
    window.PeaklogicTime?.setTimezone?.(tz);
    return tz;
  }

  function fillTimezoneField(st = lastSettings) {
    const sel = $('proj-timezone');
    if (!sel) return;
    const tz = st?.timezone
      || window.PeaklogicTime?.getTimezone?.()
      || 'America/New_York';
    if (window.PeaklogicTime?.isValidTimeZone?.(tz) && ![...sel.options].some((o) => o.value === tz)) {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz;
      sel.insertBefore(opt, sel.firstChild);
    }
    sel.value = window.PeaklogicTime?.isValidTimeZone?.(tz) ? tz : 'America/New_York';
  }

  function applySettingsResponse(res) {
    if (res?.settings) {
      lastSettings = {
        ...lastSettings,
        ...res.settings,
        mqttParc: {
          ...(lastSettings?.mqttParc || {}),
          ...(res.settings.mqttParc || {}),
        },
        cloudSims: {
          ...(lastSettings?.cloudSims || {}),
          ...(res.settings.cloudSims || {}),
        },
        cellularSims: {
          ...(lastSettings?.cellularSims || {}),
          ...(res.settings.cellularSims || {}),
        },
      };
      applyDisplayTimezone(lastSettings);
      syncProjectNameFromSettings(lastSettings);
    }
    mongoLoggerDirty = false;
  }

  function applyMongoLoggerToSettings(next) {
    const mongoFromForm = collectMongoLoggerFromForm();
    if (mongoFromForm.uri) {
      next.mongoLogger = mongoFromForm;
    } else if (mongoLoggerDirty) {
      next.mongoLogger = {};
    }
    return next;
  }

  async function saveMongoLoggerSettings(opts = {}) {
    const msgEl = opts.msgElId ? $(opts.msgElId) : $('mongo-save-msg');
    const mongoLogger = collectMongoLoggerFromForm();
    if (!mongoLogger.uri && !mongoLoggerDirty && !opts.allowClear) {
      const err = 'Enter a MongoDB URI before saving';
      if (msgEl) {
        msgEl.textContent = err;
        msgEl.className = 'muted err-text';
      }
      if (!opts.quiet) alert(err);
      throw new Error(err);
    }
    if (msgEl && !opts.quiet) {
      msgEl.textContent = 'Saving…';
      msgEl.className = 'muted';
    }
    const res = await api.putSettings({
      mongoLogger: mongoLogger.uri ? mongoLogger : {},
    });
    applySettingsResponse(res);
    mongoLoggerDirty = false;
    fillMongoLoggerFields(lastSettings?.mongoLogger || {});
    if (isPopupOpen('historian-logger')) updateHistorianLoggerMongoStatus();
    if (msgEl && !opts.quiet) {
      msgEl.textContent = mongoLogger.uri ? 'Logging settings saved' : 'Logging cleared';
      msgEl.className = 'muted ok-text';
    }
    return res;
  }

  async function updateMongoLoggerStatus() {
    await updateHistorianLoggerMongoStatus();
  }

  function toDatetimeLocalValue(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function parseDatetimeLocalValue(v) {
    if (!v) return NaN;
    return Date.parse(v);
  }

  function initHistorianDateDefaults() {
    const to = Date.now();
    const from = to - HISTORIAN_RANGE_PRESETS['24h'];
    const pairs = [
      ['historian-from', 'historian-to'],
      ['report-from', 'report-to'],
      ['purge-from', 'purge-to'],
    ];
    for (const [fromId, toId] of pairs) {
      const fromEl = $(fromId);
      const toEl = $(toId);
      if (fromEl && !fromEl.value) fromEl.value = toDatetimeLocalValue(from);
      if (toEl && !toEl.value) toEl.value = toDatetimeLocalValue(to);
    }
  }

  function syncHistorianPresetDates() {
    try {
      const { from, to } = historianRangeBounds();
      if ($('historian-from')) $('historian-from').value = toDatetimeLocalValue(from);
      if ($('historian-to')) $('historian-to').value = toDatetimeLocalValue(to);
      syncHistorianDateUi();
    } catch {
      /* invalid custom range while editing */
    }
  }

  function historianChartTimeRange() {
    if (historianSource === 'mongo' && historianMongoMeta) {
      const from = Date.parse(historianMongoMeta.from);
      const to = Date.parse(historianMongoMeta.to);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        return { from, to };
      }
    }
    if (historianSource === 'pdm' && historianPdmMeta) {
      try {
        return historianRangeBounds();
      } catch { /* fall through */ }
    }
    try {
      return historianRangeBounds();
    } catch {
      return null;
    }
  }

  function historianChartOpts() {
    const tr = historianChartTimeRange();
    return tr ? { timeRange: tr } : {};
  }

  function syncHistorianDateUi() {
    const fromVal = $('historian-from')?.value || '';
    const toVal = $('historian-to')?.value || '';
    for (const id of ['report-from', 'report-to']) {
      const el = $(id);
      if (!el) continue;
      if (id.endsWith('-from')) el.value = fromVal;
      else el.value = toVal;
    }
    for (const id of ['historian-use-custom', 'report-use-custom']) {
      const el = $(id);
      if (el) el.checked = historianUseCustom;
    }
    updateHistorianDateControlsState();
  }

  function updateHistorianDateControlsState() {
    const disabled = !historianUseCustom;
    for (const id of ['historian-from', 'historian-to', 'report-from', 'report-to']) {
      const wrap = $(id)?.closest('.historian-date-ctl');
      if (wrap) wrap.classList.toggle('historian-dates-disabled', disabled);
      const input = $(id);
      if (input) input.disabled = disabled;
    }
    for (const id of ['historian-range', 'report-range']) {
      const el = $(id);
      if (el) el.disabled = historianUseCustom;
    }
  }

  function historianRangeBounds(preset = historianRangePreset) {
    if (historianUseCustom) {
      const from = parseDatetimeLocalValue($('historian-from')?.value);
      const to = parseDatetimeLocalValue($('historian-to')?.value);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        throw new Error('Set valid custom From and To dates');
      }
      return { from, to };
    }
    const span = HISTORIAN_RANGE_PRESETS[preset] || HISTORIAN_RANGE_PRESETS['24h'];
    const to = Date.now();
    return { from: to - span, to };
  }

  function getHistorianDisplayHistory() {
    if (historianSource === 'pdm') return historianPdmHistory;
    if (historianSource === 'mongo') return historianMongoHistory;
    return lastGraphHistory;
  }

  function syncHistorianSourceUi() {
    const pairs = [
      ['historian-source', 'historian-range'],
      ['report-source', 'report-range'],
    ];
    for (const [srcId, rangeId] of pairs) {
      const src = $(srcId);
      const range = $(rangeId);
      if (src) src.value = historianSource;
      if (range) range.value = historianRangePreset;
    }
    syncHistorianDateUi();
    const clearBtn = $('btn-graph-clear');
    if (clearBtn) clearBtn.style.display = historianSource === 'live' ? '' : 'none';
    const isPdm = historianSource === 'pdm';
    document.querySelectorAll('.historian-pdm-only').forEach((el) => {
      el.classList.toggle('view-hidden', !isPdm);
    });
    document.querySelectorAll('.report-pdm-only').forEach((el) => {
      el.classList.toggle('view-hidden', !isPdm);
    });
    const loadMongo = $('btn-historian-load-mongo');
    const loadReportMongo = $('btn-report-load-mongo');
    if (loadMongo) loadMongo.style.display = historianSource === 'mongo' ? '' : 'none';
    if (loadReportMongo) loadReportMongo.style.display = historianSource === 'mongo' ? '' : 'none';
  }

  async function loadMongoHistorian(msgElId = 'historian-load-msg') {
    const tagIds = graphPenTagIds();
    if (!tagIds.length) {
      alert('Configure at least one historian pen first (Historian → Pen config…).');
      return;
    }
    const msgEl = $(msgElId);
    if (msgEl) {
      msgEl.textContent = 'Loading…';
      msgEl.className = 'muted';
    }
    let from;
    let to;
    try {
      ({ from, to } = historianRangeBounds());
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message;
        msgEl.className = 'muted err-text';
      }
      alert(e.message);
      return;
    }
    try {
      const data = await api.getMongoHistory({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        tags: tagIds,
      });
      historianMongoHistory = data.history || {};
      historianMongoMeta = data.meta || null;
      historianSource = 'mongo';
      if (historianMongoMeta) {
        if ($('historian-from')) {
          $('historian-from').value = toDatetimeLocalValue(Date.parse(historianMongoMeta.from));
        }
        if ($('historian-to')) {
          $('historian-to').value = toDatetimeLocalValue(Date.parse(historianMongoMeta.to));
        }
      }
      syncHistorianSourceUi();
      drawHistorianPopups();
      const total = data.meta?.totalDocs ?? 0;
      const ds = data.meta?.downsampled ? ' (downsampled for chart)' : '';
      if (msgEl) msgEl.textContent = `Loaded ${total} sample(s)${ds}`;
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message;
        msgEl.className = 'muted err-text';
      }
      alert(e.message);
    }
  }

  async function purgeMongoArchive(all = false) {
    const msgEl = $('mongo-purge-msg');
    if (all) {
      if (!confirm('Delete ALL pen_sample and pen_selection documents from MongoDB? This cannot be undone.')) {
        return;
      }
    } else {
      const from = parseDatetimeLocalValue($('purge-from')?.value);
      const to = parseDatetimeLocalValue($('purge-to')?.value);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        alert('Set valid purge From and To dates');
        return;
      }
      if (to <= from) {
        alert('Purge end time must be after start time');
        return;
      }
      const a = window.PeaklogicTime?.formatFriendly?.(from) || new Date(from).toLocaleString();
      const b = window.PeaklogicTime?.formatFriendly?.(to) || new Date(to).toLocaleString();
      if (!confirm(`Delete MongoDB historian documents from ${a} to ${b}?`)) return;
      if (msgEl) msgEl.textContent = 'Purging…';
      try {
        const r = await api.purgeMongoHistory({
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        });
        if (msgEl) msgEl.textContent = `Purged ${r.deletedCount ?? 0} document(s)`;
        return;
      } catch (e) {
        if (msgEl) {
          msgEl.textContent = e.message;
          msgEl.className = 'muted err-text';
        }
        alert(e.message);
        return;
      }
    }
    if (msgEl) msgEl.textContent = 'Purging…';
    try {
      const r = await api.purgeMongoHistory({ all: true });
      if (msgEl) msgEl.textContent = `Purged ${r.deletedCount ?? 0} document(s)`;
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message;
        msgEl.className = 'muted err-text';
      }
      alert(e.message);
    }
  }

  async function seedMongoDemo() {
    const msgEl = $('mongo-seed-msg');
    if (!confirm('Seed 90 days of demo historian data (4 digital + 6 analog points)? Requires MongoDB URI.')) {
      return;
    }
    if (msgEl) {
      msgEl.textContent = 'Seeding… (may take a moment)';
      msgEl.className = 'muted';
    }
    try {
      await saveMongoLoggerSettings({ quiet: true });
      const r = await api.seedMongoHistory({ days: 90, installTags: true });
      graphPensDirty = false;
      if (r.graphPens?.length) graphPens = r.graphPens;
      if (msgEl) {
        msgEl.textContent = `Inserted ${r.inserted ?? 0} samples · tags ${(r.tags || []).join(', ')}`;
      }
      await refreshAll();
      if (isHistorianSetupOpen()) renderGraphPensSetup();
    } catch (e) {
      if (msgEl) {
        msgEl.textContent = e.message;
        msgEl.className = 'muted err-text';
      }
      alert(e.message);
    }
  }

  function historianRangeLabel(meta) {
    const tr = historianChartTimeRange();
    const span = tr ? tr.to - tr.from : (meta?.tMax != null && meta?.tMin != null ? meta.tMax - meta.tMin : 0);
    const fmt = (ms) => GraphDraw.formatAxisTime(ms, span);
    if (historianSource === 'mongo' && historianMongoMeta) {
      const ds = historianMongoMeta.downsampled ? ' · downsampled' : '';
      const total = historianMongoMeta.totalDocs ?? 0;
      return `MongoDB · ${total} sample(s) · ${fmt(Date.parse(historianMongoMeta.from))} → ${fmt(Date.parse(historianMongoMeta.to))}${ds}`;
    }
    if (historianSource === 'pdm') {
      const windows = historianPdmMeta?.windowCount ?? 0;
      const fc = historianPdmForecast?.ok ? ` · ${historianPdmForecast.headline}` : '';
      return `PdM · ${windows} window(s)${fc}`;
    }
    if (!meta?.samples) return 'No samples in buffer';
    if (tr) {
      return `Live buffer · ${meta.samples} sample(s) · ${fmt(tr.from)} → ${fmt(tr.to)}`;
    }
    if (meta.tMin != null && meta.tMax != null) {
      return `Live buffer · ${meta.samples} sample(s) · ${fmt(meta.tMin)} → ${fmt(meta.tMax)}`;
    }
    return `Live buffer · ${meta.samples} sample(s)`;
  }

  function updateHistorianMeta() {
    const el = $('historian-meta');
    if (!el) return;
    const hist = getHistorianDisplayHistory();
    const meta = GraphDraw.historyMeta(hist, graphPens);
    el.textContent = historianRangeLabel(meta);
  }

  function drawHistorianPopups() {
    const hist = getHistorianDisplayHistory();
    const pens = getHistorianDisplayPens();
    const opts = historianChartOpts();
    if (isPopupOpen('historian') && $('graph-canvas')) {
      syncHistorianCanvasSize();
      GraphDraw.draw($('graph-canvas'), hist, pens, {
        ...opts,
        hover: historianHoverState,
      });
      renderGraphPenLegend(historianHoverState);
      updateHistorianMeta();
    }
    if (isPopupOpen('report')) fillHistorianReportPanel(hist);
  }

  function defaultReportConfigClient() {
    return {
      title: 'Historian Report',
      subtitle: '',
      company: '',
      footer: 'PeakLogic historian export',
      pageSize: 'A4',
      orientation: 'landscape',
      chartMaxHeight: 220,
      notes: '',
      sections: {
        cover: true,
        chart: true,
        penTable: true,
        statistics: true,
        forecast: true,
        assetSetup: true,
        notes: true,
      },
    };
  }

  function mergeReportConfig(raw) {
    const d = defaultReportConfigClient();
    if (!raw || typeof raw !== 'object') return d;
    return {
      ...d,
      ...raw,
      sections: { ...d.sections, ...(raw.sections || {}) },
    };
  }

  function fillReportConfigForm(cfg = reportConfig) {
    const c = mergeReportConfig(cfg);
    if ($('report-cfg-title')) $('report-cfg-title').value = c.title || '';
    if ($('report-cfg-subtitle')) $('report-cfg-subtitle').value = c.subtitle || '';
    if ($('report-cfg-company')) $('report-cfg-company').value = c.company || '';
    if ($('report-cfg-footer')) $('report-cfg-footer').value = c.footer || '';
    if ($('report-cfg-page-size')) $('report-cfg-page-size').value = c.pageSize || 'A4';
    if ($('report-cfg-orientation')) $('report-cfg-orientation').value = c.orientation || 'landscape';
    if ($('report-cfg-chart-h')) $('report-cfg-chart-h').value = c.chartMaxHeight ?? 220;
    if ($('report-cfg-notes')) $('report-cfg-notes').value = c.notes || '';
    const sec = c.sections || {};
    if ($('report-sec-cover')) $('report-sec-cover').checked = sec.cover !== false;
    if ($('report-sec-chart')) $('report-sec-chart').checked = sec.chart !== false;
    if ($('report-sec-pen-table')) $('report-sec-pen-table').checked = sec.penTable !== false;
    if ($('report-sec-statistics')) $('report-sec-statistics').checked = sec.statistics !== false;
    if ($('report-sec-forecast')) $('report-sec-forecast').checked = sec.forecast !== false;
    if ($('report-sec-asset-setup')) $('report-sec-asset-setup').checked = sec.assetSetup !== false;
    if ($('report-sec-notes')) $('report-sec-notes').checked = sec.notes !== false;
  }

  function readReportConfigFromForm() {
    return {
      title: $('report-cfg-title')?.value?.trim() || 'Historian Report',
      subtitle: $('report-cfg-subtitle')?.value?.trim() || '',
      company: $('report-cfg-company')?.value?.trim() || '',
      footer: $('report-cfg-footer')?.value?.trim() || '',
      pageSize: $('report-cfg-page-size')?.value || 'A4',
      orientation: $('report-cfg-orientation')?.value || 'landscape',
      chartMaxHeight: +($('report-cfg-chart-h')?.value) || 220,
      notes: $('report-cfg-notes')?.value || '',
      sections: {
        cover: $('report-sec-cover')?.checked !== false,
        chart: $('report-sec-chart')?.checked !== false,
        penTable: $('report-sec-pen-table')?.checked !== false,
        statistics: $('report-sec-statistics')?.checked !== false,
        forecast: $('report-sec-forecast')?.checked !== false,
        assetSetup: $('report-sec-asset-setup')?.checked !== false,
        notes: $('report-sec-notes')?.checked !== false,
      },
    };
  }

  function downloadHistorianPdf() {
    const msg = $('report-export-msg');
    const pens = getHistorianDisplayPens();
    const hist = getHistorianDisplayHistory();
    const canvas = $('report-chart-canvas');
    const cfg = readReportConfigFromForm();
    reportConfig = cfg;
    if (canvas && pens.length && cfg.sections?.chart !== false) {
      GraphDraw.draw(canvas, hist, pens, historianChartOpts());
    }
    const meta = GraphDraw.historyMeta(hist, pens);
    if (msg) {
      msg.textContent = 'Building PDF…';
      msg.className = 'muted';
    }
    const sourceLabel = historianSource === 'pdm'
      ? 'PdM (SCADA + Edge)'
      : (historianSource === 'mongo' ? 'MongoDB archive' : 'Live buffer');
    const pdmPayload = historianSource === 'pdm' ? {
      assetId: pdmAssetId,
      assetContext: historianPdmAssetContext || pdmAssetContextMap()[pdmAssetId] || null,
      forecast: historianPdmForecast,
      rul: historianPdmRul,
    } : null;
    return api.downloadReportPdf({
      reportConfig: cfg,
      meta: {
        projectName,
        rangeLabel: historianRangeLabel(meta),
        source: sourceLabel,
        assetId: historianSource === 'pdm' ? pdmAssetId : undefined,
        penCount: meta.penCount,
        sampleCount: meta.samples,
        exportedAt: new Date().toISOString(),
      },
      pens,
      history: hist,
      pdm: pdmPayload,
      chartImage: cfg.sections?.chart !== false && canvas
        ? canvas.toDataURL('image/png')
        : null,
    }).then((blob) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const assetPart = historianSource === 'pdm' && pdmAssetId ? `${pdmAssetId}_` : '';
      const safe = String(projectName || 'report').replace(/[^\w.-]+/g, '_').slice(0, 40);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PeakLogic_${assetPart}${safe}_${stamp}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (msg) {
        msg.textContent = 'PDF downloaded';
        msg.className = 'muted ok-text';
      }
    }).catch((e) => {
      if (msg) {
        msg.textContent = e.message || 'PDF failed';
        msg.className = 'muted err-text';
      }
      alert(e.message || 'PDF export failed');
    });
  }

  function fillHistorianReportPanel(history = getHistorianDisplayHistory()) {
    const metaEl = $('report-meta');
    const tableEl = $('report-pen-table');
    const canvas = $('report-chart-canvas');
    const pens = getHistorianDisplayPens();
    const meta = GraphDraw.historyMeta(history, pens);
    if (metaEl) {
      metaEl.textContent = `Project: ${projectName} · ${meta.penCount} pen(s) · ${historianRangeLabel(meta)}`;
    }
    if (canvas) GraphDraw.draw(canvas, history, pens, historianChartOpts());
    if (tableEl) {
      const rows = meta.pens.map((pen) => {
        const pts = history?.[pen.tagId] || [];
        const last = pts.at(-1);
        const scaled = last != null ? GraphDraw.applyPenValue(last.value, pen) : '—';
        return `<tr>
          <td><span class="report-pen-swatch" style="background:${esc(pen.color || '#2563eb')}"></span></td>
          <td>${esc(pen.tagId)}</td>
          <td>${esc(String(pen.scale ?? 1))}</td>
          <td>${esc(String(pen.offset ?? 0))}</td>
          <td>${pts.length}</td>
          <td>${last != null ? esc(String(last.value)) : '—'}</td>
          <td>${esc(String(scaled))}</td>
        </tr>`;
      }).join('');
      tableEl.innerHTML = `<table class="data-table">
        <thead><tr><th></th><th>Tag</th><th>Scale</th><th>Offset</th><th>Samples</th><th>Last raw</th><th>Last scaled</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No pens configured — Historian → Pen config…</td></tr>'}</tbody>
      </table>`;
    }
  }

  function graphPenTagIds() {
    if (isHistorianSetupOpen() && graphPensDirty) {
      return collectGraphPensFromTable().map((p) => p.tagId).filter(Boolean);
    }
    return graphPens.map((p) => p.tagId).filter(Boolean);
  }

  function flushGraphPensFromTable() {
    if (!isHistorianSetupOpen()) return;
    graphPens = collectGraphPensFromTable();
  }

  function markGraphPensDirty() {
    graphPensDirty = true;
    flushGraphPensFromTable();
  }


  function dashboardPollMsFromSettings(settings) {
    return window.PeaklogicHmiViewMode?.hmiPollMsFromSettings?.(settings ?? lastSettings) ?? 2_000;
  }

  function restartDashboardPoll() {
    const ms = dashboardPollMsFromSettings(lastSettings);
    const needGraphPoll = isPopupOpen('historian') || isPopupOpen('report');
    if (liveWsActive && !needGraphPoll) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      return;
    }
    if (pollTimer && ms === dashboardPollIntervalMs) return;
    dashboardPollIntervalMs = ms;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshLive().catch(console.error), ms);
  }

  function startLiveWebSocket() {
    if (!window.PeaklogicLiveWs) return;
    window.PeaklogicLiveWs.start({
      onMessage: (data) => {
        applyLivePollData(data);
      },
      onStatus: (connected) => {
        liveWsActive = connected;
        restartDashboardPoll();
      },
    });
  }

  function restartFullRefreshTimer() {
    if (fullRefreshTimer) clearInterval(fullRefreshTimer);
    fullRefreshTimer = setInterval(() => {
      refreshAll({ background: true }).catch(console.error);
    }, FULL_REFRESH_MS);
  }

  function syncTagsFromLive(live) {
    if (!Array.isArray(live)) return;
    syncTagsForceFromServer(live.map((r) => ({
      id: r.tagId || r.id,
      value: r.value,
      quality: r.quality,
      forceInput: r.forceInput,
      forceOutput: r.forceOutput,
      forceValue: r.forceValue,
      alarmLevel: r.alarmLevel,
    })));
  }

  function applyLivePollData(data) {
    lastRuntime = data.runtime || lastRuntime;
    if (data.optaRuntime !== undefined) lastOptaRuntime = data.optaRuntime;
    lastLive = data.live || lastLive;
    if (data.driverHealth) {
      driverHealthMap = Object.fromEntries(data.driverHealth.map((h) => [h.id, h]));
    }
    if (Array.isArray(data.live)) syncTagsFromLive(data.live);
    updateStatusCards(data.runtime, { count: data.tagCount ?? tags.length }, data.driverHealth);
    updateRuntimeButtons(data.runtime);
    window.PeaklogicProgram?.updateProgramIoLive(data.live, data.runtime);
    if (data.graph) lastGraphHistory = data.graph;
    if (isPopupOpen('historian') || isPopupOpen('report')) {
      if (historianSource === 'live' && !historianUseCustom) syncHistorianPresetDates();
      drawHistorianPopups();
    }
    if (isPopupOpen('tags')) {
      if (tagsTableTagSignature(tags) !== tagsTableTagSig) {
        renderTags();
      } else {
        updateLiveValues(data.live, data.runtime);
        if (!tagsForceEditing) updateForceCellsFromLive();
      }
    } else {
      updateLiveValues(data.live, data.runtime);
    }
    if (isPopupOpen('alarms')) renderAlarmsPanel();
    else updateAlarmsTabBadge(collectActiveAlarms(tags, data.live).filter((r) => !r.acked).length);
    window.PeaklogicHmi?.refreshLiveBindings?.(data.live);
  }

  async function refreshLive(opts = {}) {
    if (refreshInFlight || liveRefreshInFlight) {
      if (!opts.force) return lastDashboardData;
    }
    liveRefreshInFlight = true;
    try {
      const needGraph = isPopupOpen('historian') || isPopupOpen('report');
      const graphTags = needGraph ? graphPenTagIds() : null;
      const data = typeof api.getLive === 'function'
        ? await api.getLive(graphTags)
        : await api.getDashboard(graphTags);
      applyLivePollData(data);
      return data;
    } finally {
      liveRefreshInFlight = false;
    }
  }

  async function refreshAll(opts = {}) {
    if (refreshInFlight) {
      if (!opts.force && !opts.background) return lastDashboardData;
      if (!opts.background) {
        while (refreshInFlight) {
          await new Promise((r) => setTimeout(r, 25));
        }
      } else if (refreshInFlight) {
        return lastDashboardData;
      }
    }
    refreshInFlight = true;
    let data;
    try {
      const graphTags = graphPenTagIds();
      const canLite = opts.background && Array.isArray(tags) && tags.length > 0;
      if (canLite) {
        const lite = await api.getDashboard(graphTags, { lite: true });
        if (lite.hmiRev != null && lastHmiRev && lite.hmiRev !== lastHmiRev) {
          data = await api.getDashboard(graphTags);
        } else {
          data = {
            ...lite,
            tags,
            live: lastLive,
            projects,
          };
          if (lastSettings?.hmi) {
            data.settings = { ...lite.settings, hmi: lastSettings.hmi };
          }
        }
      } else {
        data = await api.getDashboard(graphTags);
      }
      if (data.hmiRev != null) lastHmiRev = data.hmiRev;
      lastDashboardData = data;
    } finally {
      refreshInFlight = false;
    }
    if (!data) return lastDashboardData;
    try {
    if (data.activeProgram && !PeaklogicProgram?.getProgramActivePath?.()) {
      PeaklogicProgram?.setProgramActivePath(data.activeProgram);
    }
    if (!editingTags && tagEditRow == null && !tagsDirty) {
      tags = data.tags;
    } else if (Array.isArray(data.tags)) {
      syncTagsForceFromServer(data.tags);
    }
    if (!editingDrivers && driverEditRow == null && !driversDirty) drivers = data.drivers;
    if (data.serialPorts?.length) serialPorts = data.serialPorts;
    driverHealthMap = Object.fromEntries((data.driverHealth || []).map((h) => [h.id, h]));
    updateOptaDeviceModeHint();
    lastRuntime = data.runtime || lastRuntime;
    if (data.optaRuntime !== undefined) lastOptaRuntime = data.optaRuntime;
    if (data.maxTags) tagMax = data.maxTags;
    lastLive = data.live || lastLive;
    if (Array.isArray(data.projects)) projects = data.projects;
    if (data.settings && !(isPopupOpen('project') && isSetupFormDirty())) {
      lastSettings = data.settings;
      applyDisplayTimezone(lastSettings);
      restartDashboardPoll();
    } else if (data.settings?.timezone) {
      applyDisplayTimezone(data.settings);
    }
    syncActiveSavedProjectIdFromSettings(lastSettings);
    syncProjectNameFromSettings(lastSettings, data.activeProjectName);
    if (!reportConfigDirty) {
      reportConfig = mergeReportConfig(data.reportConfig || data.settings?.reportConfig);
      if (isPopupOpen('report')) fillReportConfigForm(reportConfig);
    }
    updateStatusCards(data.runtime, { count: data.tagCount }, data.driverHealth);
    updateRuntimeButtons(data.runtime);
    window.PeaklogicProgram?.updateProgramRemoteUi?.(data);
    window.PeaklogicProgram?.updateProgramIoLive(data.live, data.runtime);
    if (isPopupOpen('tags')) {
      if (tagsTableTagSignature(tags) !== tagsTableTagSig) {
        renderTags();
      } else {
        updateLiveValues(data.live, data.runtime);
        if (!tagsForceEditing) updateForceCellsFromLive();
      }
    }
    if (data.devicePresets?.length) devicePresets = data.devicePresets;
    if (data.wizardTransportGroups?.length) wizardTransportGroups = data.wizardTransportGroups;
    if (isPopupOpen('project')) {
      fillProjectListsInSetup();
      if (!isSetupFormDirty()) {
        fillCloudSimsFields();
        fillCellularSimsFields();
      }
    }
    if (isPopupOpen('drivers')) {
      fillDevicePresetUi();
      fillParcOptaBar(data);
      if (!editingDrivers && driverEditRow == null) renderDrivers();
      if (driversActiveTab === 'nextcentury') updateNcPasswordIndicator();
    }
    if (!graphPensDirty) {
      if (data.graphPens?.length) graphPens = data.graphPens;
      else if (data.settings?.graphPens?.length) graphPens = data.settings.graphPens;
    }
    if (data.graph) lastGraphHistory = data.graph;
    if (isPopupOpen('historian') || isPopupOpen('report')) {
      if (historianSource === 'live' && !historianUseCustom) syncHistorianPresetDates();
      drawHistorianPopups();
    }
    if (isPopupOpen('alarms')) renderAlarmsPanel();
    else updateAlarmsTabBadge(collectActiveAlarms(tags, data.live).filter((r) => !r.acked).length);
    window.PeaklogicProgram?.handleDashboardPoll(data);
    const scanEl = $('set-scan');
    const graphPtsEl = $('set-graph-pts');
    if (scanEl) scanEl.value = data.settings?.scanMs || 100;
    if (graphPtsEl && !graphPensDirty) graphPtsEl.value = data.settings?.graphMaxPoints || 600;
    if (isHistorianSetupOpen() && !graphPensDirty) {
      ensureTagsForGraph().then(() => renderGraphPensSetup());
    } else if (isHistorianSetupOpen() && graphPensDirty) {
      const countEl = $('graph-pen-count');
      if (countEl) {
        flushGraphPensFromTable();
        const list = graphableTagsList();
        countEl.textContent = `${graphPens.length} / ${MAX_GRAPH_PENS} pens · ${list.length} plottable tag(s) (${tags.length} total in database)`;
      }
    }
    if (isHistorianSetupOpen() && $('historian-setup-pen-count')) {
      $('historian-setup-pen-count').textContent = String(graphPens.length);
    }
    if (isPopupOpen('historian-logger')) updateMongoLoggerStatus();
    try {
      window.PeaklogicHmi?.handleDashboardPoll(data);
    } catch (e) {
      console.error('[dashboard] HMI poll:', e);
    }
    updateLiveValues(data.live, data.runtime);
    } catch (e) {
      console.error('[dashboard] refresh apply:', e);
    }
    return data;
  }

  function modbusCfg() {
    const portEl = $('mv-rtu-port');
    const port = portEl?.value || 'COM3';
    return {
      rtu: { serialPort: port, baud: +$('mv-rtu-baud').value, slaveId: +$('mv-rtu-slave').value },
      tcp: { host: $('mv-tcp-host').value, port: +$('mv-tcp-port').value, slaveId: +$('mv-rtu-slave').value },
      moveMaps: [{ table: 'holding', rtuAddress: +$('mv-rtu-addr').value, tcpAddress: +$('mv-tcp-addr').value, count: +$('mv-count').value }],
    };
  }

  async function persistStartupProjectSelection(projectId) {
    const id = String(projectId || '').trim();
    if (!id) return;
    const mode = $('proj-startup-mode')?.value || lastSettings?.startup?.mode || 'workspace';
    if (mode !== 'saved_project') return;
    const startup = {
      mode: 'saved_project',
      projectId: id,
      promptOnBoot: !!$('proj-startup-prompt')?.checked,
    };
    if (lastSettings?.startup?.mode === startup.mode
      && lastSettings?.startup?.projectId === startup.projectId
      && lastSettings?.startup?.promptOnBoot === startup.promptOnBoot) {
      return;
    }
    const next = { ...(lastSettings || {}), startup };
    const res = await api.putSettings(next);
    applySettingsResponse(res);
  }

  const PROJECT_SAVE_BUTTON_IDS = [
    'btn-proj-save',
    'btn-proj-save-as',
    'btn-save-est',
    'btn-save-est-as',
  ];

  function setProjectSaveUi(saving, message) {
    for (const id of PROJECT_SAVE_BUTTON_IDS) {
      const el = $(id);
      if (!el) continue;
      el.disabled = !!saving;
      if (saving) el.setAttribute('aria-busy', 'true');
      else el.removeAttribute('aria-busy');
    }
    if (saving) {
      const msg = $('proj-msg');
      if (msg) msg.textContent = message || 'Saving project…';
      const chip = $('project-name');
      if (chip) {
        const base = String(projectName || chip.textContent || 'untitled')
          .replace(/\s*·\s*(saving…|saved)$/i, '').trim();
        chip.textContent = `${base} · saving…`;
        chip.title = message || 'Saving project to library…';
      }
    }
  }

  async function saveEstFile(nameOverride) {
    if (projectSaveInFlight) return;
    projectSaveInFlight = true;
    setProjectSaveUi(true, 'Saving project…');
    try {
      await window.PeaklogicHmi?.flushHmiToSettingsForProjectSave?.().catch((e) => {
        throw new Error(e.message || 'Could not sync HMI settings before save');
      });
      const formName = isPopupOpen('project') ? $('proj-name')?.value?.trim() : '';
      const name = String(
        nameOverride ?? (formName || projectName || 'untitled'),
      ).trim() || 'untitled';
      const r = await api.saveProject(name);
      projects = Array.isArray(r.projects) ? r.projects : projects;
      projectName = r.projectName || name;
      if ($('project-name')) $('project-name').textContent = projectName;
      if ($('proj-name')) $('proj-name').value = projectName;
      activeSavedProjectId = r.id || activeSavedProjectId;
      await refreshAll({ force: true }).catch(console.error);
      await refreshProjectLibrary();
      if ($('proj-startup-mode')?.value === 'saved_project') {
        const selId = $('proj-startup-project')?.value?.trim();
        if (selId) {
          await persistStartupProjectSelection(selId).catch(console.error);
        }
      }
      window.fillProjectPopup?.();
      const storage = r.projects?.length
        ? `${r.projects.length} saved project(s) in data/projects/`
        : 'saved to data/projects/';
      const note = `Saved "${r.id}" — ${storage}`;
      showProjectSaveNotice(note);
      return r;
    } catch (e) {
      const err = e.message || String(e);
      if ($('proj-msg')) $('proj-msg').textContent = `Save failed: ${err}`;
      throw e;
    } finally {
      projectSaveInFlight = false;
      setProjectSaveUi(false);
    }
  }

  function showProjectSaveNotice(note) {
    if ($('proj-msg') && isPopupOpen('project')) {
      $('proj-msg').textContent = note;
      return;
    }
    const chip = $('project-name');
    if (chip) {
      chip.title = note;
      const base = String(projectName || chip.textContent || 'untitled').replace(/\s*·\s*saved$/i, '').trim();
      chip.textContent = `${base} · saved`;
      if (chip._saveNoteTimer) clearTimeout(chip._saveNoteTimer);
      chip._saveNoteTimer = setTimeout(() => {
        chip.textContent = base;
        chip.title = `Current project: ${base}`;
      }, 4000);
    }
  }

  async function saveEstFileAs() {
    const formName = isPopupOpen('project') ? $('proj-name')?.value?.trim() : '';
    const def = (formName || projectName || 'untitled').trim() || 'untitled';
    const name = window.prompt('Save project as (name):', def);
    if (!name?.trim()) return;
    await saveEstFile(name.trim());
  }

  function safeEstFilename(name) {
    const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
    return `${base}.est.zip`;
  }

  function safeBundleFilename(name) {
    return safeEstFilename(name);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatProjectImportMessage(name, tagCount, importWarnings) {
    const lines = [`Loaded project: ${name} (${tagCount} tags)`];
    if (Array.isArray(importWarnings) && importWarnings.length) {
      lines.push('', ...importWarnings);
    }
    return lines.join('\n');
  }

  async function exportCurrentEstFile(nameOverride) {
    await window.PeaklogicHmi?.applyHmiSettingsIfDirty?.();
    const formName = isPopupOpen('project') ? $('proj-name')?.value?.trim() : '';
    const name = String(nameOverride ?? (formName || projectName || 'untitled')).trim() || 'untitled';
    const blob = await api.saveEstBlob(name);
    downloadBlob(blob, safeEstFilename(name));
    const note = `Exported "${safeEstFilename(name)}" — portable project archive (ST, JSON, HMI, MV Draw)`;
    if ($('proj-msg')) $('proj-msg').textContent = note;
    else alert(note);
  }

  async function exportSavedProjectFile(id) {
    const listed = projects.find((p) => p.id === id);
    const label = listed?.name || id;
    const blob = await api.exportSavedProjectBlob(id);
    downloadBlob(blob, safeEstFilename(label));
    alert(`Exported "${safeEstFilename(label)}"`);
  }

  let projectHubMode = 'deploy';
  let projectHubTab = 'local';

  function setProjectHubTab(tab) {
    projectHubTab = tab;
    $('project-hub-tabs')?.querySelectorAll('[data-hub-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hubTab === tab);
    });
    const fileInput = $('project-hub-file');
    const list = $('project-hub-list');
    const sortBar = document.querySelector('[data-project-sort-scope="hub"]');
    const primary = $('project-hub-primary');
    const secondary = $('project-hub-secondary');
    if (tab === 'file') {
      list?.classList.add('view-hidden');
      sortBar?.classList.add('view-hidden');
      fileInput?.classList.remove('view-hidden');
      if (projectHubMode === 'share') {
        primary.textContent = 'Choose file…';
        secondary.hidden = true;
      } else {
        primary.textContent = 'Choose file…';
        secondary.hidden = true;
      }
    } else {
      list?.classList.remove('view-hidden');
      sortBar?.classList.remove('view-hidden');
      fileInput?.classList.add('view-hidden');
      if (projectHubMode === 'share') {
        primary.textContent = 'Export file';
        secondary.hidden = false;
        secondary.textContent = tab === 'cloud' ? 'Publish to cloud' : 'Publish locally';
      } else {
        primary.textContent = 'Deploy';
        secondary.hidden = true;
      }
    }
    loadProjectHubList().catch(console.error);
  }

  function renderProjectHubList() {
    const sel = $('project-hub-list');
    if (!sel || projectHubTab === 'file') return;
    const list = sortProjectItems(projectHubItems, 'hub');
    syncProjectSortButtons('hub');
    const prev = sel.value;
    if (!list.length) {
      sel.innerHTML = '<option value="">(no projects in repository)</option>';
      return;
    }
    sel.innerHTML = list.map((p) =>
      `<option value="${esc(p.id)}">${esc(projectOptionLabel(p))}</option>`,
    ).join('');
    if (prev && list.some((p) => p.id === prev)) sel.value = prev;
  }

  async function loadProjectHubList() {
    const sel = $('project-hub-list');
    const msg = $('project-hub-msg');
    if (!sel || projectHubTab === 'file') return;
    sel.innerHTML = '';
    projectHubItems = [];
    if (msg) msg.textContent = '';
    try {
      const r = projectHubTab === 'cloud'
        ? await api.listProjectHubCloud()
        : await api.listProjectHubLocal();
      projectHubItems = (r.projects || []).map((p) => normalizeProjectRecord({
        ...p,
        source: p.source || projectHubTab,
        format: p.format || (projectHubTab === 'cloud' ? 'cloud' : 'json'),
      }));
      renderProjectHubList();
    } catch (e) {
      if (msg) msg.textContent = e.message;
      sel.innerHTML = '<option value="">(unavailable)</option>';
    }
  }

  function openProjectHubDialog(mode) {
    if (isCloudDeployment() && window.PeaklogicProjectHubUi?.openHubDialog) {
      closeProjectMenu();
      window.PeaklogicProjectHubUi.openHubDialog(mode).catch((e) => alert(e.message));
      return;
    }
    projectHubMode = mode;
    const dlg = $('project-hub-dialog');
    const title = $('project-hub-title');
    const hint = $('project-hub-hint');
    if (mode === 'share') {
      title.textContent = 'Share project';
      hint.textContent = isCloudDeployment()
        ? 'Publish the current project to MV Cloud for the selected site.'
        : 'Publish a complete .est.zip (project + ST + HMI + site plan) to a repository or export a file.';
    } else {
      title.textContent = 'Deploy project';
      hint.textContent = isCloudDeployment()
        ? 'Deploy a saved workspace project, one from MV Cloud, or upload a file.'
        : 'Load a complete .est.zip or legacy .est.json in one step. Serial ports adapt to this host (IOT-LINK PORT A/B, Linux tty, COM ports).';
    }
    setProjectHubTab(isCloudDeployment() ? 'local' : 'local');
    closeProjectMenu();
    dlg?.showModal();
    syncProjectSortButtons('hub');
  }

  async function runProjectHubPublish() {
    await window.PeaklogicHmi?.applyHmiSettingsIfDirty?.();
    const name = String($('proj-name')?.value?.trim() || projectName || 'project').trim() || 'project';
    const description = '';
    if (projectHubTab === 'cloud') {
      if (window.PEAKLOGIC_PLATFORM_API) {
        const blob = await api.saveEstBlob(name);
        const archiveBase64 = await blob.arrayBuffer().then((ab) => {
          const bytes = new Uint8Array(ab);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
          return btoa(binary);
        });
        const r = await api.publishProjectHubPlatform({ name, description, archiveBase64 });
        $('project-hub-msg').textContent = `Published to cloud: ${r.entry?.name || name}`;
        return;
      }
      const r = await api.publishProjectHubCloud({ name, description });
      $('project-hub-msg').textContent = `Published to cloud: ${r.entry?.name || name}`;
      return;
    }
    const r = await api.publishProjectHubLocal({ name, description });
    $('project-hub-msg').textContent = `Published locally: ${r.entry?.name || name}`;
    await loadProjectHubList();
  }

  async function runProjectHubDeployFromDoc(fileOrBlob) {
    const label = String(fileOrBlob?.name || projectName || 'project')
      .replace(/\.(est\.(zip|json)|mvbundle|json)$/i, '')
      .trim() || 'project';
    if (!confirmProjectReplace('Deploy project', label)) return;
    const opened = await api.deployProjectHubFile(fileOrBlob);
    const data = await refreshAll({ force: true });
    window.applyProjectLoadToUi?.(opened.projectName || label, data);
    activeSavedProjectId = opened.savedProjectId || null;
    try {
      await refreshProjectLibrary();
    } catch { /* ignore */ }
    $('project-hub-dialog')?.close();
    alert(formatProjectImportMessage(opened.projectName, opened.tagCount, opened.importWarnings));
  }

  async function runProjectHubPrimaryAction() {
    try {
      if (projectHubMode === 'share') {
        if (projectHubTab === 'file') {
          $('project-hub-file')?.click();
          return;
        }
        const id = $('project-hub-list')?.value;
        if (id) {
          const blob = await api.downloadProjectHubFile(id);
          const listed = projectHubItems.find((p) => p.id === id)?.name
            || ($('project-hub-list').selectedOptions[0]?.textContent || projectName).split(' · ')[0];
          downloadBlob(blob, safeEstFilename(listed.trim()));
          $('project-hub-msg').textContent = `Exported ${safeEstFilename(listed.trim())}`;
          return;
        }
        await exportCurrentEstFile();
        return;
      }
      if (projectHubTab === 'file') {
        $('project-hub-file')?.click();
        return;
      }
      const id = $('project-hub-list')?.value;
      if (!id) {
        alert('Select a project from the repository.');
        return;
      }
      const listedLabel = projectHubItems.find((p) => p.id === id)?.name
        || $('project-hub-list').selectedOptions?.[0]?.textContent?.split(' · ')[0]?.trim()
        || id;
      if (!confirmProjectReplace('Deploy', listedLabel)) return;
      const source = projectHubTab === 'cloud' ? 'cloud' : 'local';
      let opened;
      if (source === 'cloud' && window.PEAKLOGIC_PLATFORM_API) {
        opened = await api.deployProjectHub({ id, source: 'cloud' });
      } else {
        opened = await api.deployProjectHub({ id, source });
      }
      const data = await refreshAll({ force: true });
      window.applyProjectLoadToUi?.(opened.projectName, data);
      $('project-hub-dialog')?.close();
      alert(formatProjectImportMessage(opened.projectName, opened.tagCount, opened.importWarnings));
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function syncActiveSavedProjectIdFromSettings(settings = lastSettings) {
    const startup = settings?.startup || {};
    if (startup.mode === 'saved_project' && startup.projectId) {
      activeSavedProjectId = String(startup.projectId);
    } else if (startup.mode === 'last_project' && settings?.project?.lastOpenedId) {
      activeSavedProjectId = String(settings.project.lastOpenedId);
    } else if (settings?.project?.lastOpenedId) {
      activeSavedProjectId = String(settings.project.lastOpenedId);
    }
  }

  function projectDeleteBlockedReason(id) {
    if (!id) return 'Select a saved project first.';
    const startup = lastSettings?.startup || {};
    if (startup.mode === 'saved_project' && String(startup.projectId) === String(id)) {
      return 'Cannot delete the startup project. Open System setup → General and choose a different startup project first.';
    }
    if (activeSavedProjectId && String(activeSavedProjectId) === String(id)) {
      return 'Cannot delete the currently open project. Open or create another project first.';
    }
    return null;
  }

  async function deleteSavedProject(id) {
    const block = projectDeleteBlockedReason(id);
    if (block) throw new Error(block);
    const listed = projects.find((p) => p.id === id);
    const label = listed?.name || id;
    const r = await api.deleteProject(id);
    projects = r.projects || projects;
    if (activeSavedProjectId && String(activeSavedProjectId) === String(id)) {
      activeSavedProjectId = null;
    }
    fillProjectListsInSetup();
    fillProjectPickerList(projects);
    if ($('proj-msg')) $('proj-msg').textContent = `Deleted "${label}"`;
    return r;
  }

  function confirmProjectReplace(verb, label) {
    const action = String(verb || 'Open project').trim() || 'Open project';
    const name = String(label || 'project').trim() || 'project';
    return window.confirm(
      `${action} "${name}"?\n\nThis replaces tags, drivers, program, and settings.`,
    );
  }

  function fillProjectPickerList(list, selectedId) {
    const sel = $('project-picker-list');
    if (!sel) return;
    const items = sortProjectItems(
      (Array.isArray(list) ? list : []).map((p) => normalizeProjectRecord(p)),
      'picker',
    );
    syncProjectSortButtons('picker');
    sel.innerHTML = items.length
      ? items.map((p) =>
        `<option value="${esc(p.id)}">${esc(projectOptionLabel(p))}</option>`
      ).join('')
      : '<option value="">(no saved projects)</option>';
    const pick = selectedId && items.some((p) => p.id === selectedId)
      ? selectedId
      : ($('proj-list')?.value || items[0]?.id || '');
    if (pick) sel.value = pick;
  }

  function projectLibraryDirHint(r) {
    const resp = r && typeof r === 'object' ? r : {};
    if (resp.projectsBackend === 'disk' && resp.projectsDir) return String(resp.projectsDir);
    if (resp.projectsDir) return String(resp.projectsDir);
    const storage = String(resp.projectsStorage || '').trim();
    if (storage && !/^MongoDB\b/i.test(storage)) return storage;
    if (resp.projectsBackend === 'mongo' || /^MongoDB\b/i.test(storage)) {
      return 'data/projects/ on the server (deploy latest cloud build, then copy .est.zip files via SFTP)';
    }
    return '';
  }

  async function showProjectLibraryFolderHint() {
    try {
      const r = await api.listProjects();
      const dir = projectLibraryDirHint(r);
      if (dir) {
        alert(`Project library folder:\n\n${dir}\n\nCopy .est.zip files here (WinSCP/SFTP).`);
        return;
      }
      alert('Projects live in data/projects/ on the cloud server. Copy .est.zip files via SFTP.');
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function fillProjectImportList(list, projectsDir) {
    const sel = $('project-import-list');
    const dirEl = $('project-import-dir');
    if (dirEl && projectsDir !== undefined) {
      dirEl.textContent = projectsDir
        ? `Projects in: ${projectsDir}`
        : 'Projects stored in data/projects/';
    }
    if (!sel) return;
    if (list !== undefined) {
      projectImportItems = (Array.isArray(list) ? list : []).map((p) => normalizeProjectRecord(p));
    }
    const items = sortProjectItems(projectImportItems, 'import');
    syncProjectSortButtons('import');
    const prev = sel.value;
    sel.innerHTML = items.length
      ? items.map((p) =>
        `<option value="${esc(p.file)}">${esc(projectOptionLabel(p))}</option>`
      ).join('')
      : '<option value="">(no project files in data/projects/)</option>';
    if (prev && items.some((p) => p.file === prev)) sel.value = prev;
  }

  async function applyImportResult(opened, fallbackName) {
    const name = opened.projectName || opened.project?.project?.name || opened.project?.name || fallbackName;
    activeSavedProjectId = opened.savedProjectId || null;
    projectName = name;
    editingTags = false;
    editingDrivers = false;
    tagEditRow = null;
    driverEditRow = null;
    tagsDirty = false;
    $('project-name').textContent = `Loading ${name}…`;
    const data = await refreshAll({ force: true });
    window.applyProjectLoadToUi?.(name, data);
    try {
      await refreshProjectLibrary();
    } catch { /* ignore */ }
    alert(formatProjectImportMessage(name, data?.tagCount ?? tags.length, opened.importWarnings));
  }

  async function openProjectImportPicker() {
    closeProjectMenu();
    const dlg = $('project-import-dialog');
    if (!dlg || typeof api.listImportableProjects !== 'function') {
      $('file-open-est')?.click();
      return;
    }
    try {
      const r = await api.listImportableProjects();
      fillProjectImportList(r.files || [], projectLibraryDirHint(r));
      syncProjectSortButtons('import');
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    } catch (e) {
      alert(cloudProjectAccessHint(e) || 'Could not list projects');
    }
  }

  async function importProjectFromLibrary(filename) {
    if (!filename) {
      alert('Select a project file from data/projects/.');
      return;
    }
    const label = $('project-import-list')?.selectedOptions?.[0]?.textContent?.split(' · ')[0] || filename;
    if (!confirmProjectReplace('Import project', label)) return;
    projectOpenInFlight = true;
    $('project-name').textContent = `Importing ${label}…`;
    try {
      const opened = await api.importProjectFromLibrary(filename);
      await applyImportResult(opened, label);
    } catch (e) {
      alert(e.message || 'Import failed');
      syncProjectNameFromSettings(lastSettings, projectName);
    } finally {
      projectOpenInFlight = false;
    }
  }

  async function importProjectFromNativePick() {
    try {
      const pick = await api.importProjectNativePick();
      if (pick.cancelled || !pick.ok) return;
      const fallback = pick.file || pick.path?.split(/[/\\]/).pop() || 'project';
      if (!confirmProjectReplace('Import project', fallback)) return;
      projectOpenInFlight = true;
      $('project-name').textContent = `Importing ${fallback}…`;
      const opened = await api.importProjectFromPath(pick.path);
      await applyImportResult(opened, fallback.replace(/\.(est\.(zip|json)|mvbundle)$/i, ''));
      $('project-import-dialog')?.close('cancel');
    } catch (e) {
      alert(e.message || 'Import failed');
    } finally {
      projectOpenInFlight = false;
    }
  }

  async function importProjectFromFile(file) {
    if (!file) return;
    const fallbackName = file.name.replace(/\.(est\.(zip|json)|mvbundle|json|est)$/i, '').replace(/[^\w.-]+/g, '_') || 'project';
    if (!confirmProjectReplace('Import project', file.name)) return;
    projectOpenInFlight = true;
    $('project-name').textContent = `Importing ${fallbackName}…`;
    try {
      let opened;
      if (typeof api.importProjectFile === 'function') {
        opened = await api.importProjectFile(file);
      } else if (/\.est\.zip$/i.test(file.name)) {
        throw new Error('This server cannot import .est.zip yet. Deploy the latest PeakLogic build to the server, then try again.');
      } else {
        const doc = JSON.parse(await file.text());
        opened = await api.openEst(doc);
      }
      await applyImportResult(opened, fallbackName);
    } catch (e) {
      alert(e.message || 'Import failed');
      syncProjectNameFromSettings(lastSettings, projectName);
    } finally {
      projectOpenInFlight = false;
    }
  }

  async function openProjectPicker() {
    closeProjectMenu();
    const dlg = $('project-picker-dialog');
    if (!dlg) {
      $('file-open-est')?.click();
      return;
    }
    let projectsDir = '';
    try {
      const r = await api.listProjects();
      projects = r.projects || projects;
      projectsDir = projectLibraryDirHint(r);
    } catch (e) {
      alert(cloudProjectAccessHint(e));
      return;
    }
    const dirEl = $('project-picker-dir');
    if (dirEl) {
      dirEl.textContent = projectsDir
        ? `Projects in: ${projectsDir}`
        : 'Projects stored in data/projects/';
    }
    fillProjectPickerList(projects);
    syncProjectSortButtons('picker');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  async function openProjectById(id, opts = {}) {
    if (!id || projectOpenInFlight) return;
    const listed = projects.find((p) => p.id === id);
    const label = listed?.name || id;
    if (!opts.silent && !confirmProjectReplace('Open project', label)) return;
    projectOpenInFlight = true;
    const nameEl = $('project-name');
    if (nameEl) nameEl.textContent = `Opening ${label}…`;
    let loadedName = label;
    try {
      const opened = await api.openProject(id);
      activeSavedProjectId = id;
      loadedName = opened.projectName || opened.project?.name || listed?.name || id;
      if (nameEl) nameEl.textContent = `Loading ${loadedName}…`;
      const data = await refreshAll({ force: true });
      window.applyProjectLoadToUi?.(loadedName, data);
      if (opened.runtimeAutoStartQueued) {
        if ($('proj-msg')) $('proj-msg').textContent = 'Project opened — starting runtime…';
      }
      if (Array.isArray(opened.importWarnings) && opened.importWarnings.length) {
        alert(formatProjectImportMessage(loadedName, data?.tagCount ?? tags.length, opened.importWarnings));
      }
    } catch (e) {
      alert(e.message);
      syncProjectNameFromSettings(lastSettings, projectName);
    } finally {
      projectOpenInFlight = false;
    }
  }

  function bindToolbar() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    const onChange = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };

    on('btn-open-est', () => {
      openProjectPicker().catch((e) => alert(e.message));
    });
    on('btn-import-est', () => {
      openProjectImportPicker();
    });
    on('btn-delete-est', () => {
      closeProjectMenu();
      openProjectPicker().catch((e) => alert(e.message));
    });
    $('project-picker-dialog')?.addEventListener('close', () => {
      const dlg = $('project-picker-dialog');
      if (dlg?.returnValue === 'open') {
        const id = $('project-picker-list')?.value;
        if (id) openProjectById(id);
      }
    });
    $('project-picker-cancel')?.addEventListener('click', () => {
      $('project-picker-dialog')?.close('cancel');
    });
    $('project-picker-import')?.addEventListener('click', () => {
      $('project-picker-dialog')?.close('cancel');
      openProjectImportPicker().catch((e) => alert(e.message));
    });
    $('project-import-cancel')?.addEventListener('click', () => {
      $('project-import-dialog')?.close('cancel');
    });
    $('project-import-dialog')?.addEventListener('close', () => {
      const dlg = $('project-import-dialog');
      if (dlg?.returnValue === 'import') {
        const file = $('project-import-list')?.value;
        if (file) importProjectFromLibrary(file).catch((e) => alert(e.message));
      }
    });
    $('project-import-browse')?.addEventListener('click', () => {
      if (isApplianceDeployment()) {
        importProjectFromNativePick().catch((e) => alert(e.message));
      } else {
        $('file-open-est')?.click();
      }
    });
    $('project-import-folder')?.addEventListener('click', () => {
      if (isApplianceDeployment()) {
        api.openProjectsFolder().catch((e) => alert(e.message));
      } else if (isCloudDeployment()) {
        showProjectLibraryFolderHint().catch((e) => alert(e.message));
      } else {
        alert('On cloud Studio, upload a .est.zip with Browse other location… or copy files to the server projects folder via SFTP.');
      }
    });
    $('project-picker-export')?.addEventListener('click', async () => {
      const id = $('project-picker-list')?.value;
      if (!id) {
        alert('Select a saved project to export, or use Project → Export project file… for the open project.');
        return;
      }
      try {
        await exportSavedProjectFile(id);
      } catch (e) {
        alert(e.message);
      }
    });
    $('project-picker-folder')?.addEventListener('click', () => {
      if (isCloudDeployment()) {
        showProjectLibraryFolderHint().catch((e) => alert(e.message));
        return;
      }
      api.openProjectsFolder().catch((e) => alert(e.message));
    });
    $('project-picker-delete')?.addEventListener('click', async () => {
      const id = $('project-picker-list')?.value;
      if (!id) {
        alert('Select a saved project to delete.');
        return;
      }
      const listed = projects.find((p) => p.id === id);
      const label = listed?.name || id;
      if (!window.confirm(`Delete saved project "${label}"? This cannot be undone.`)) return;
      try {
        await deleteSavedProject(id);
        $('project-picker-dialog')?.close('cancel');
      } catch (e) {
        alert(e.message);
      }
    });
    onChange('file-open-est', (ev) => {
      const f = ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      importProjectFromFile(f).catch((e) => alert(e.message || 'Import failed'));
    });
    $('btn-save-est').onclick = () => {
      closeProjectMenu();
      saveEstFile().catch((e) => alert(e.message));
    };
    $('btn-export-est')?.addEventListener('click', () => {
      closeProjectMenu();
      exportCurrentEstFile().catch((e) => alert(e.message));
    });
    $('btn-share-project')?.addEventListener('click', () => openProjectHubDialog('share'));
    $('btn-deploy-project')?.addEventListener('click', () => openProjectHubDialog('deploy'));
    bindProjectListSortControls();
    if (!isCloudDeployment()) {
    $('project-hub-tabs')?.querySelectorAll('[data-hub-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setProjectHubTab(btn.dataset.hubTab));
    });
    $('project-hub-primary')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      runProjectHubPrimaryAction().catch((e) => alert(e.message));
    });
    $('project-hub-secondary')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      runProjectHubPublish().catch((e) => alert(e.message));
    });
    $('project-hub-cancel')?.addEventListener('click', () => $('project-hub-dialog')?.close());
    $('project-hub-file')?.addEventListener('change', async (ev) => {
      const f = ev.target.files?.[0];
      ev.target.value = '';
      if (!f) return;
      try {
        if (projectHubMode === 'share') {
          const blob = f.name.toLowerCase().endsWith('.est.zip')
            ? f
            : await api.saveEstBlob(f.name.replace(/\.(est\.(zip|json)|mvbundle|json)$/i, '') || projectName);
          downloadBlob(blob, safeEstFilename(f.name.replace(/\.est\.zip$/i, '') || projectName));
          $('project-hub-msg').textContent = `Exported ${safeEstFilename(f.name.replace(/\.est\.zip$/i, '') || projectName)}`;
          return;
        }
        await runProjectHubDeployFromDoc(f);
      } catch (e) {
        alert(e.message || 'Invalid project file');
      }
    });
    }
    $('btn-save-est-as')?.addEventListener('click', () => {
      closeProjectMenu();
      saveEstFileAs().catch((e) => alert(e.message));
    });
    $('btn-save-ws').onclick = () => {
      closeProjectMenu();
      window.PeaklogicHmi?.applyHmiSettingsIfDirty?.()
        .then(() => api.saveWorkspace({ name: projectName }))
        .then(() => alert('Workspace saved to data/ (HMI included if you edited it).'))
        .catch((e) => alert(e.message));
    };

    async function fillSetupProgramSelect() {
      const progSel = $('proj-active-program');
      if (!progSel) return;
      const s = lastSettings || {};
      let list = window.PeaklogicProgram?.getProgramCatalog?.() || [];
      if (!list.length) {
        try {
          const r = await api.listPrograms();
          list = r.programs || [];
        } catch { /* keep empty */ }
      }
      const active = window.PeaklogicProgram?.getProgramActivePath?.() || s.activeProgram || '';
      const noneOpt = '<option value="">(none)</option>';
      if (list.length) {
        progSel.innerHTML = noneOpt + list.map((p) =>
          `<option value="${esc(p.path)}">${esc(p.category)}/${esc(p.name)}</option>`
        ).join('');
        const pick = (active && list.some((p) => p.path === active))
          ? active
          : (active || list[0]?.path || '');
        progSel.value = pick;
      } else {
        const fallback = active || 'logic/program.st';
        progSel.innerHTML = noneOpt + `<option value="${esc(fallback)}">${esc(fallback)}</option>`;
        progSel.value = active || fallback;
      }
    }

    function fillProjectPopup() {
      if ($('proj-name')) $('proj-name').value = projectName || '';
      const s = lastSettings || {};
      const ml = s.mongoLogger || {};
      const scanMs = s.scanMs ?? 100;
      if ($('proj-scan-ms')) $('proj-scan-ms').value = scanMs;
      if ($('set-scan')) $('set-scan').value = scanMs;
      fillTimezoneField(s);
      fillSetupProgramSelect().catch(console.error);
      fillMongoLoggerFields(ml);
      fillPdmSettingsFields(lastSettings?.pdm);
      fillRoiSettingsFields(lastSettings?.roi);
      refreshRoiCalculatorDisplay();
      refreshPdmAssetLists().catch(console.error);
      window.PeaklogicHmi?.updateHomeScreenLabel();
      fillSetupHmiSummary();
      window.PeaklogicHmi?.syncComposerModeFromSettings?.();
      fillProjectListsInSetup();
      fillMqttParcFields(s);
      fillCloudRemoteFields(s);
      fillCloudSimsFields(s);
      fillCellularSimsFields(s);
      if ($('proj-alf-mech-wh-gas')) {
        $('proj-alf-mech-wh-gas').checked = s.assistedLiving?.mechWhGas === true;
      }
      renderAlfPoolsList(s.assistedLiving?.pools);
      clearSetupDirty();
    }

    // Expose to openPopup()
    window.fillProjectPopup = fillProjectPopup;

    function applyProjectSettingsFromPopup() {
      const next = buildSettingsPayloadFromSetupForm();
      projectName = next.project?.name || projectName || 'untitled';
      if ($('project-name')) $('project-name').textContent = projectName;
      if (next.activeProgram) {
        window.PeaklogicProgram?.setProgramActivePath?.(next.activeProgram);
      } else {
        window.PeaklogicProgram?.setProgramActivePath?.('');
      }
      if ($('set-scan')) $('set-scan').value = next.scanMs ?? 100;
      return api.putSettings(next).then((res) => {
        applySettingsResponse(res);
        window.PeaklogicHmi?.clearDirty?.();
        return refreshAll();
      });
    }

    window.applyProjectSettingsFromPopup = applyProjectSettingsFromPopup;

    on('btn-proj-apply', () => persistSetupChanges().then(() => {
      fillProjectPopup();
    }).catch((e) => alert(e.message)));
    $('proj-alf-mech-wh-gas')?.addEventListener('change', () => {
      schedulePersistAssistedLiving({ skipWorkspace: true });
    });
    $('btn-proj-alf-pool-add')?.addEventListener('click', () => {
      const cur = alfPoolsFromForm() || normalizeAlfPools(lastSettings?.assistedLiving?.pools);
      if (cur.length >= ALF_MAX_POOLS) return;
      const n = cur.length + 1;
      renderAlfPoolsList([
        ...cur,
        {
          id: `pool${n}`,
          tagPrefix: n === 1 ? 'POOL' : `POOL${n}`,
          name: n === 2 ? 'Spa' : `Pool ${n}`,
          sanitizer: 'orp',
          waterType: 'fresh',
          filterPumpCount: 1,
          bodyKind: n === 2 ? ALF_BODY_KIND.SPA : ALF_BODY_KIND.POOL,
          sharedWaterWith: n === 2 ? (cur[0]?.id || 'therapy') : '',
          circulationHoursPerDay: n === 2 ? 0.5 : 7,
        },
      ]);
      schedulePersistAssistedLiving({ skipWorkspace: true });
    });

    on('btn-proj-apply-header', () => $('btn-proj-apply')?.click());

    function suggestNewProjectName() {
      const base = 'untitled';
      if (projectName && projectName !== base && !projectName.startsWith(`${base}_`)) return base;
      let n = 2;
      while (projects.some((p) => (p.name || p.id) === `${base}_${n}`)) n += 1;
      return `${base}_${n}`;
    }

    function resetUiAfterProjectLoad(name) {
      projectName = name || projectName;
      if ($('project-name')) $('project-name').textContent = projectName;
      lastHmiRev = null;
      editingTags = false;
      editingDrivers = false;
      tagEditRow = null;
      driverEditRow = null;
      tagsDirty = false;
      driversDirty = false;
      tagsForceEditing = false;
      reportConfigDirty = false;
      clearSetupDirty();
      graphPens = [];
      lastGraphHistory = null;
      const prog = $('program-src');
      if (prog) prog.dataset.dirty = '';
      window.PeaklogicHmi?.clearDirty?.();
    }

    function applyProjectLoadToUi(name, data) {
      resetUiAfterProjectLoad(name);
      if (data) {
        tags = Array.isArray(data.tags) ? data.tags : [];
        drivers = Array.isArray(data.drivers) ? data.drivers : [];
        lastSettings = data.settings || lastSettings;
        if (name && lastSettings) {
          lastSettings = {
            ...lastSettings,
            project: { ...(lastSettings.project || {}), name },
          };
        }
        applyDisplayTimezone(lastSettings);
        lastLive = Array.isArray(data.live) ? data.live : [];
        graphPens = data.graphPens?.length ? data.graphPens : (data.settings?.graphPens || []);
        reportConfig = mergeReportConfig(data.reportConfig ?? data.settings?.reportConfig);
        lastGraphHistory = data.graph ?? null;
        window.PeaklogicProgram?.forceReloadFromDashboard?.(data);
        window.PeaklogicHmi?.forceReloadFromDashboard?.(data);
      }
      fillProjectPopup();
      if (isPopupOpen('tags')) renderTags();
      if (isPopupOpen('drivers')) renderDrivers();
      if (isPopupOpen('force')) renderForcePanel(tags);
      if (isPopupOpen('historian') || isPopupOpen('report')) drawHistorianPopups();
      if (isHistorianSetupOpen()) renderGraphPensSetup();
      if (isPopupOpen('alarms')) renderAlarmsPanel();
      window.PeaklogicProgram?.renderProgramIoPanel?.(lastLive, lastRuntime);
    }
    window.applyProjectLoadToUi = applyProjectLoadToUi;

    async function runNewProject() {
      const suggested = suggestNewProjectName();
      const name = window.prompt('New project name:', suggested);
      if (name === null) return;
      const trimmed = name.trim() || 'untitled';
      if (!window.confirm(
        `Create new project "${trimmed}"? This clears tags, drivers, program, HMI, and settings, and removes user ST files (samples under st/ are kept).`
      )) return;
      try {
        if (lastRuntime?.running) {
          try { await api.runtimeStop(); } catch { /* ignore */ }
        }
        const opened = await api.newProject(trimmed);
        activeSavedProjectId = null;
        const loadedName = opened?.project?.name || trimmed;
        const data = await refreshAll({ force: true });
        applyProjectLoadToUi(loadedName, data);
        if ($('proj-msg')) $('proj-msg').textContent = `New project: ${projectName}`;
      } catch (e) {
        alert(e.message);
      }
    }

    on('btn-proj-new', () => runNewProject());
    on('btn-proj-new-menu', () => {
      closeProjectMenu();
      runNewProject();
    });

    on('btn-proj-save', async () => {
      try {
        await applyProjectSettingsFromPopup();
        await saveEstFile();
      } catch (e) {
        alert(e.message);
      }
    });

    on('btn-proj-save-as', async () => {
      try {
        await applyProjectSettingsFromPopup();
        await saveEstFileAs();
      } catch (e) {
        alert(e.message);
      }
    });

    on('btn-proj-export', async () => {
      try {
        await applyProjectSettingsFromPopup();
        await exportCurrentEstFile();
      } catch (e) {
        alert(e.message);
      }
    });

    on('btn-proj-import', () => {
      openProjectImportPicker();
    });
    on('btn-proj-open', async () => {
      const id = $('proj-list')?.value;
      await openProjectById(id);
    });

    on('btn-proj-delete', async () => {
      const id = $('proj-list')?.value;
      if (!id) return;
      const listed = projects.find((p) => p.id === id);
      const label = listed?.name || id;
      if (!window.confirm(`Delete saved project "${label}"? This cannot be undone.`)) return;
      try {
        await deleteSavedProject(id);
      } catch (e) {
        alert(e.message);
      }
    });

    on('btn-proj-print-config', () => {
      printProjectConfigurationDoc().catch((e) => alert(e.message || String(e)));
    });

    document.querySelectorAll('[data-tag-view-filter]').forEach((btn) => {
      btn.addEventListener('click', () => toggleTagViewFilter(btn.dataset.tagViewFilter));
    });
    syncTagViewFilterButtons();

    $('btn-tag-add').onclick = () => addNewTag('BOOL');
    $('btn-tag-add-int')?.addEventListener('click', () => addNewTag('INT'));
    $('btn-tag-add-real')?.addEventListener('click', () => addNewTag('REAL'));
    $('btn-tag-add-counter')?.addEventListener('click', () => addNewTag('COUNTER'));
    $('btn-tag-add-timer')?.addEventListener('click', () => addNewTag('TIMER'));
    $('btn-tag-add-pid')?.addEventListener('click', () => addNewTag('PID'));
    $('btn-tag-add-avg')?.addEventListener('click', () => addNewTag('AVG'));
    $('btn-tag-save').onclick = () => {
      flushTagEdit();
      tagEditRow = null;
      editingTags = false;
      return api.putTags(normalizeTagsForSave(tags)).then(() => {
        tagsDirty = false;
        return refreshAll();
      }).then(() => {
        renderTags();
      }).catch((e) => alert(e.message || 'Save tags failed'));
    };

    $('btn-drv-add').onclick = () => {
      const hw = defaultHwConnection();
      drivers.push({
        id: `drv_${drivers.length}`,
        type: 'modbus_rtu',
        enabled: true,
        serialPort: hw.serialPort,
        baud: hw.baud,
        slaveId: hw.slaveId,
      });
      driverEditRow = drivers.length - 1;
      editingDrivers = true;
      renderDrivers();
    };
    $('btn-drv-save').onclick = async () => {
      syncNextcenturyFormToDrivers();
      flushDriverEdit();
      driverEditRow = null;
      editingDrivers = false;
      try {
        if (shouldSaveNextcenturyViaSetupTab()) {
          await saveNextcenturySetup(false);
          return;
        }
        const r = await api.putDrivers(drivers);
        driversDirty = false;
        if (r.warnings?.length) alert(r.warnings.join('\n'));
        if (Array.isArray(r.drivers)) drivers = r.drivers;
        await refreshAll();
        if (driversActiveTab === 'nextcentury') finalizeNcPasswordUi({ passwordUpdated: false });
      } catch (e) {
        alert(e.message || 'Save drivers failed');
      }
    };
    $('btn-hw-wizard')?.addEventListener('click', () => openHwWizard());
    $('btn-drv-refresh-ports').onclick = () => api.getSerialPorts().then((r) => {
      serialPorts = r.ports || [];
      fillModbusPortSelect();
      if (driverEditRow != null) {
        const card = document.querySelector('.driver-editing');
        if (card) {
          const d = drivers[driverEditRow];
          card.querySelector('.driver-fields-wrap').innerHTML = driverFieldsHtml(d);
          bindPortSelectInRoot(card);
        }
      } else {
        renderDrivers();
      }
    });

    $('device-preset')?.addEventListener('change', () => {
      const preset = devicePresets.find((p) => p.id === $('device-preset')?.value);
      syncDeviceConcubeOptions(preset);
      const msg = $('device-apply-msg');
      if (msg && preset) {
        const target = templateApplyTargetDriverId(preset);
        const conn = templateApplyConnectionParams(preset);
        let comm;
        if (preset.transport === 'derived' || preset.tagsOnly) {
          comm = 'derived measurement set (memory + ST)';
        } else if (preset.transport === 'hal') {
          const defs = preset.defaults || {};
          comm = `HAL native, stack ${defs.stack ?? 0}, i2c-${defs.i2cBus ?? 1}`;
        } else if (preset.transport === 'nextcentury') {
          const defs = preset.defaults || {};
          comm = `NextCentury API · report ${defs.reportId || 'rt_4510'} · tags auto-sync on poll`;
        } else if (preset.transport === 'mqtt' || preset.transport === 'mqtt_parc') {
          comm = preset.transport === 'mqtt_parc' ? 'MQTT Parc · device telemetry' : 'MQTT broker';
        } else if (preset.transport === 'modbus_tcp') {
          comm = `${conn.host || 'host'}:${conn.port ?? 502}, slave ${conn.slaveId ?? 1}`;
        } else if (preset.transport === 'https') {
          comm = 'HTTPS polling';
        } else {
          comm = `${conn.serialPort || 'COM?'}, ${conn.baud ?? 9600} baud, slave ${conn.slaveId ?? 1}${conn.parity ? `, ${conn.parity}` : ''}`;
        }
        const editHint = preset.tagsOnly
          ? `Requires ${(preset.requiresTags || []).join(', ') || 'EZ Meter Modbus tags'}. Apply after full EZ Meter map. Sets ${preset.defaultProgram || 'ST program'} active.`
          : preset.transport === 'hal'
          ? 'Edit driver row for plugin path, stack, I2C bus, then Apply.'
          : preset.transport === 'nextcentury'
            ? 'Set credentials on Drivers → NextCentury API tab, then Apply template.'
            : preset.transport === 'modbus_tcp'
              ? 'Edit driver row for host/port/slave, then Apply.'
              : (preset.transport === 'mqtt' || preset.transport === 'mqtt_parc' || preset.transport === 'https')
                ? 'Edit driver row for connection settings, then Apply.'
                : preset.transport === 'derived'
                  ? 'Apply after EZ Meter Modbus template.'
                  : 'Edit driver row to override COM, then Apply.';
        const groups = concubeParamGroupsForApply(preset);
        const cubeHint = preset.concube
          ? ` Adds ${(groups || 1) * 4} parameter(s) in groups of 4; apply again to append the next block.`
          : '';
        msg.textContent = target
          ? `${preset.label} → driver "${target}" (${comm}). ${editHint}${cubeHint}`
          : `${preset.label}: ${comm}. Add or edit a driver below, then Apply template.${cubeHint}`;
      }
    });

    $('device-concube-groups')?.addEventListener('input', () => {
      const inp = $('device-concube-groups');
      if (inp) inp.dataset.touched = '1';
      $('device-preset')?.dispatchEvent(new Event('change'));
    });

    $('btn-device-apply')?.addEventListener('click', () => {
      const presetId = $('device-preset')?.value;
      if (!presetId) return;
      const preset = devicePresets.find((p) => p.id === presetId);
      const targetDriverId = templateApplyTargetDriverId(preset);
      const replaceTags = $('device-template-replace')?.checked === true;
      const driverExists = targetDriverId && drivers.some((d) => d.id === targetDriverId);
      if (driverExists && replaceTags
        && !window.confirm(
          `Apply "${preset?.label || presetId}"?\n\nThis replaces all tags on driver "${targetDriverId}".`
        )) {
        return;
      }
      const conn = templateApplyConnectionParams(preset);
      const body = {
        presetId,
        slaveId: conn.slaveId ?? 1,
        replaceTags,
      };
      const groups = concubeParamGroupsForApply(preset);
      if (groups != null) body.paramGroups = groups;
      if (targetDriverId) body.driverId = targetDriverId;
      if (preset?.transport === 'modbus_tcp') {
        body.host = conn.host;
        body.port = conn.port ?? 502;
      } else if (preset?.transport !== 'nextcentury' && preset?.transport !== 'mqtt' && preset?.transport !== 'mqtt_parc' && preset?.transport !== 'https' && preset?.transport !== 'hal' && preset?.transport !== 'derived' && !preset?.tagsOnly) {
        body.serialPort = conn.serialPort;
        if (conn.baud != null) body.baud = conn.baud;
        if (conn.parity) body.parity = conn.parity;
        if (conn.stopBits != null) body.stopBits = conn.stopBits;
      }
      api.applyDevicePreset(body).then(async (r) => {
        const mode = r.merged ? 'added to' : 'applied on';
        const slaveNote = r.slaveId != null && !replaceTags ? `, slave ${r.slaveId}` : '';
        let pdmNote = '';
        if (r.pdmSeed?.seeded?.length) {
          pdmNote = ` · PdM: ${r.pdmSeed.seeded.join(', ')} (install history)`;
          if (typeof refreshPdmAssetLists === 'function') await refreshPdmAssetLists();
        }
        $('device-apply-msg').textContent =
          `${r.preset.label} ${mode} ${r.driver.id}${slaveNote}: ${r.tagsAdded} tag(s), ${r.tagCount} total${pdmNote}`
          + (r.programLoaded ? ' · ST program loaded' : '')
          + (r.nextStep ? ` — ${r.nextStep}` : '');
        if (preset?.sharedBus === false) {
          driverEditRow = null;
          editingDrivers = false;
        }
        return refreshAll();
      }).catch((e) => {
        $('device-apply-msg').textContent = e.message;
        alert(e.message);
      });
    });

  function syncParcOptaRegistryUi() {
    const fromReg = $('parc-opta-bulk-from-registry')?.checked === true;
    const noiseWrap = $('parc-opta-noise-wrap');
    if (noiseWrap) noiseWrap.classList.toggle('view-hidden', !fromReg);
  }
  syncParcOptaRegistryUi();
  $('parc-opta-bulk-from-registry')?.addEventListener('change', syncParcOptaRegistryUi);
  $('parc-registry-device-list')?.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('.parc-registry-add');
    if (!btn) return;
    const deviceId = btn.getAttribute('data-device-id') || '';
    if (!deviceId) return;
    void addParcDriverForRegistryDevice(deviceId);
  });

  function syncParcOptaRangeFields() {
      const on = $('parc-opta-bulk-use-range')?.checked === true;
      ['parc-opta-range-prefix-wrap', 'parc-opta-range-start-wrap', 'parc-opta-range-count-wrap', 'parc-opta-range-pad-wrap']
        .forEach((id) => {
          const el = $(id);
          if (el) el.style.display = on ? '' : 'none';
        });
    }
    syncParcOptaRangeFields();
    $('parc-opta-bulk-use-range')?.addEventListener('change', syncParcOptaRangeFields);

    $('btn-parc-opta-bulk')?.addEventListener('click', async () => {
      const msgEl = $('parc-opta-bulk-msg');
      const fromRegistry = $('parc-opta-bulk-from-registry')?.checked === true;
      const syncTags = $('parc-opta-bulk-sync')?.checked !== false;
      const includeRegistryNoise = $('parc-opta-bulk-include-noise')?.checked === true;
      const body = { fromRegistry, syncTags, includeRegistryNoise, usePositionIds: true };
      const positionId = $('parc-opta-position-id')?.value?.trim() || '';
      if (positionId) body.positionId = positionId;
      const singleId = $('parc-opta-single-id')?.value?.trim() || '';
      const raw = $('parc-opta-bulk-ids')?.value || '';
      const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const useRange = $('parc-opta-bulk-use-range')?.checked === true;

      if (fromRegistry) {
        let ids = parcRegistryDeviceIds(includeRegistryNoise);
        if (singleId) {
          ids = ids.filter((id) => id === singleId);
          if (!ids.length) {
            alert(`Device ${singleId} is not in the Parc registry (or is filtered as test/debug). Wait for MQTT telemetry, or uncheck "Add from Parc registry" to add by ID anyway.`);
            return;
          }
        }
        if (!ids.length) {
          alert('No Parc devices to add. Registry is empty or only has test/debug IDs — enter a device ID above, or check "Include test/debug IDs".');
          return;
        }
        const skippedNoise = (lastParcDevices || [])
          .map((d) => d.deviceId)
          .filter((id) => !ids.includes(id));
        const skipNote = skippedNoise.length && !includeRegistryNoise
          ? `\n\nSkipping test/debug: ${skippedNoise.join(', ')}`
          : '';
        const posNote = positionId && ids.length === 1 ? `\n\nPosition ID: ${positionId}` : '';
        if (!window.confirm(`Add ${ids.length} driver(s) from Parc registry?\n\n${ids.join('\n')}${posNote}${skipNote}`)) return;
        if (ids.length === 1 && positionId) {
          body.positions = { [ids[0]]: positionId };
        }
      } else if (singleId) {
        body.deviceIds = lines.length ? [singleId, ...lines.filter((id) => id !== singleId)] : [singleId];
      } else if (lines.length) {
        body.deviceIds = lines;
      } else if (useRange) {
        body.useRange = true;
        body.prefix = $('parc-opta-bulk-prefix')?.value || 'opta_st_';
        body.start = +($('parc-opta-bulk-start')?.value ?? 1);
        body.count = +($('parc-opta-bulk-count')?.value ?? 1);
        body.pad = +($('parc-opta-bulk-pad')?.value ?? 2);
        if (body.count > 1 && !window.confirm(
          `Add ${body.count} drivers (${body.prefix}${String(body.start).padStart(body.pad, '0')} …)?`
        )) return;
      } else {
        alert('Enter a device ID, paste IDs, enable numeric range, or use Parc registry.');
        return;
      }

      if (!fromRegistry && body.deviceIds?.length > 1 && !useRange
        && !window.confirm(`Add ${body.deviceIds.length} Parc drivers?`)) {
        return;
      }

      if (msgEl) msgEl.textContent = 'Adding…';
      try {
        const r = await api.bulkAddParcOpta(body);
        const synced = (r.syncResults || []).filter((s) => s.ok).length;
        const syncNote = syncTags && synced
          ? ` · synced tags on ${synced}`
          : '';
        const skipNote = r.skipped?.length ? ` · skipped ${r.skipped.length}` : '';
        const filteredNote = r.registryFiltered?.length
          ? ` · ignored registry: ${r.registryFiltered.join(', ')}`
          : '';
        if (msgEl) {
          msgEl.textContent = `Added ${r.added?.length || 0} driver(s)${skipNote}${syncNote}${filteredNote}`;
        }
        await refreshAll();
      } catch (e) {
        if (msgEl) msgEl.textContent = e.message || 'Bulk add failed';
        alert(e.message || 'Bulk add failed');
      }
    });

    on('btn-clear-tags', async () => {
      if (!window.confirm('Remove all tags? This cannot be undone.')) return;
      try {
        editingTags = false;
        tagEditRow = null;
        await api.putTags([]);
        tags = [];
        tagsDirty = false;
        await refreshAll({ force: true });
        renderTags();
      } catch (e) {
        alert(e.message || 'Clear tags failed');
      }
    });
    on('btn-clear-forces', () => Promise.all(tags.filter((t) => t.forceInput||t.forceOutput).map((t) => api.clearForce(t.id))).then(refreshAll));
    on('btn-graph-clear', () => api.clearGraph().then(() => {
      lastGraphHistory = {};
      if (historianSource === 'live') {
        fillHistorianReportPanel({});
        if (isPopupOpen('historian') && $('graph-canvas')) {
          GraphDraw.draw($('graph-canvas'), {}, graphPens, historianChartOpts());
          updateHistorianMeta();
        }
      }
      return refreshAll();
    }));

    $('btn-report-download-pdf')?.addEventListener('click', () => downloadHistorianPdf());
    $('btn-report-save-config')?.addEventListener('click', () => {
      const cfg = readReportConfigFromForm();
      reportConfig = cfg;
      return api.putReportConfig(cfg).then(() => {
        reportConfigDirty = false;
        reportConfig = mergeReportConfig(cfg);
        const m = $('report-config-msg');
        if (m) {
          m.textContent = 'Layout saved';
          m.className = 'muted ok-text';
        }
      }).catch((e) => {
        const m = $('report-config-msg');
        if (m) {
          m.textContent = e.message || 'Save failed';
          m.className = 'muted err-text';
        }
        alert(e.message || 'Save report layout failed');
      });
    });
    document.querySelectorAll('#report-config-panel input, #report-config-panel select, #report-config-panel textarea')
      .forEach((el) => {
        el.addEventListener('input', () => { reportConfigDirty = true; });
        el.addEventListener('change', () => { reportConfigDirty = true; });
      });
    $('btn-report-export-csv')?.addEventListener('click', () => {
      const msg = $('report-export-msg');
      const r = GraphDraw.exportCsv(getHistorianDisplayHistory(), graphPens, { projectName });
      if (msg) {
        msg.textContent = r.ok ? `Exported ${r.rows} row(s)` : (r.error || 'Export failed');
        msg.className = r.ok ? 'muted ok-text' : 'muted err-text';
      }
      if (!r.ok) alert(r.error || 'Export failed');
    });

    $('btn-report-print-pdf')?.addEventListener('click', () => {
      const hist = getHistorianDisplayHistory();
      const canvas = $('report-chart-canvas');
      if (canvas && graphPens.length) {
        GraphDraw.draw(canvas, hist, graphPens, historianChartOpts());
      }
      const hm = GraphDraw.historyMeta(hist, graphPens);
      const r = GraphDraw.printReport(canvas, hist, graphPens, {
        projectName,
        rangeLabel: historianRangeLabel(hm),
      });
      const msg = $('report-export-msg');
      if (msg) {
        msg.textContent = r.ok ? 'Print dialog opened' : (r.error || 'Print failed');
        msg.className = r.ok ? 'muted ok-text' : 'muted err-text';
      }
      if (!r.ok) alert(r.error || 'Print failed');
    });
    $('mv-rtu-tcp').onclick = () => api.modbusMove(modbusCfg()).then((r) => { $('mv-result').textContent = JSON.stringify(r, null, 2); });
    $('mv-tcp-rtu').onclick = () => api.modbusMove({ ...modbusCfg(), direction: 'tcp_to_rtu' }).then((r) => { $('mv-result').textContent = JSON.stringify(r, null, 2); });

    $('nc-fill-example')?.addEventListener('click', () => { fillNextcenturyFromExample(); });
    $('nc-test')?.addEventListener('click', () => { testNextcenturySetup(); });
    $('nc-save')?.addEventListener('click', () => { saveNextcenturySetup(false); });
    $('nc-save-connect')?.addEventListener('click', () => { saveNextcenturySetup(true); });
    ['nc-driver-id', 'nc-poll-ms', 'nc-property-ids', 'nc-devices-per-site', 'nc-site-count', 'nc-auto-sync-tags'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const evt = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evt, () => { scheduleNextcenturyDeployEstimate(); });
    });
    $('nc-password')?.addEventListener('input', () => { updateNcPasswordIndicator(); });
    $('nc-open-portal')?.addEventListener('click', () => {
      const driverId = $('nc-driver-id')?.value.trim() || '';
      const saved = drivers.find((d) => d.id === driverId && d.type === 'nextcentury');
      const opts = saved
        ? { driverId: saved.id }
        : {
          email: $('nc-email')?.value?.trim(),
          password: resolveNextcenturyPassword(driverId, $('nc-password')?.value),
        };
      openNextcenturyPortal(opts).catch((e) => setNcPortalStatus(e.message || 'Portal open failed', false));
    });
    $('nc-portal-open-tab')?.addEventListener('click', () => {
      if (ncPortalSession?.portalPath) {
        window.open(ncPortalSession.portalPath, '_blank', 'noopener,noreferrer');
      } else {
        setNcPortalStatus('Open a portal session first (Open portal on a NextCentury driver).', false);
      }
    });
    $('nc-load-example-tags')?.addEventListener('click', () => { loadNextcenturyExampleTags(); });

    $('btn-alarms-notify-setup')?.addEventListener('click', () => {
      openPopup('alarm-notify');
    });
    $('user-alarm-scope-all')?.addEventListener('change', syncUserScopeModeUi);
    syncUserScopeModeUi();
    $('proj-timezone')?.addEventListener('change', () => {
      markSetupDirty();
      window.PeaklogicTime?.setTimezone?.($('proj-timezone').value);
    });
    $('proj-startup-mode')?.addEventListener('change', () => {
      markSetupDirty();
      syncStartupProjectField();
      if ($('proj-startup-mode')?.value === 'saved_project') {
        refreshProjectLibrary();
      }
    });
    $('proj-startup-project')?.addEventListener('change', () => {
      markSetupDirty();
      const sel = $('proj-startup-project');
      if (sel?.value) persistStartupProjectSelection(sel.value).catch(console.error);
    });

    $('btn-user-add')?.addEventListener('click', () => {
      selectedUserId = null;
      fillUserEditor({
        email: '',
        role: 'operator',
        profile: {
          displayName: '',
          alarmNotifications: {
            enabled: true,
            email: true,
            minLevel: 'inner',
            notificationScope: { mode: 'all', siteIds: [], deviceIds: [], assetIds: [] },
          },
        },
      });
      if ($('users-msg')) $('users-msg').textContent = 'New user — enter email and save';
    });
    $('btn-user-save')?.addEventListener('click', () => {
      const body = readUserEditor();
      const msg = $('users-msg');
      const p = selectedUserId
        ? api.updateUser(selectedUserId, body)
        : api.createUser(body);
      return p.then((r) => {
        selectedUserId = r.user?.id || selectedUserId;
        if (msg) msg.textContent = 'Saved';
        return refreshUserProfiles();
      }).catch((e) => {
        if (msg) msg.textContent = e.message;
        alert(e.message);
      });
    });
    $('btn-user-delete')?.addEventListener('click', () => {
      if (!selectedUserId) return;
      if (!confirm('Delete this user profile?')) return;
      return api.deleteUser(selectedUserId).then(() => {
        selectedUserId = null;
        return refreshUserProfiles();
      }).catch((e) => alert(e.message));
    });
    $('btn-cmms-save')?.addEventListener('click', () => {
      const msg = $('cmms-msg');
      return api.putSettings({ cmmsIntegration: readCmmsIntegrationFields() })
        .then((res) => {
          if (res?.settings) lastSettings = res.settings;
          if (msg) msg.textContent = 'CMMS settings saved';
        })
        .catch((e) => {
          if (msg) msg.textContent = e.message;
          alert(e.message);
        });
    });

    $('btn-save-settings').onclick = () => {
      const scanMs = +$('set-scan').value;
      if ($('proj-scan-ms')) $('proj-scan-ms').value = scanMs;
      return api.putSettings({
        scanMs,
        graphMaxPoints: +($('set-graph-pts')?.value || 600),
      }).then(refreshAll);
    };

    $('btn-graph-pen-add')?.addEventListener('click', () => {
      markGraphPensDirty();
      if (graphPens.length >= MAX_GRAPH_PENS) {
        alert(`Maximum ${MAX_GRAPH_PENS} pens`);
        return;
      }
      graphPens.push(defaultGraphPen());
      renderGraphPensSetup();
    });

    $('btn-save-graph-settings')?.addEventListener('click', () => {
      flushGraphPensFromTable();
      if (!graphPens.length) {
        alert('Add at least one pen and select a tag.');
        return;
      }
      const graphBody = {
        scanMs: lastSettings?.scanMs ?? +($('set-scan')?.value || 100),
        graphMaxPoints: +($('set-graph-pts')?.value || 600),
        graphPens,
        projectName,
      };
      return api.putSettings(graphBody).then((res) => {
        applySettingsResponse(res);
        graphPensDirty = false;
        if ($('historian-setup-msg')) $('historian-setup-msg').textContent = 'Historian pens saved';
        if ($('historian-setup-pen-count')) {
          $('historian-setup-pen-count').textContent = String(graphPens.length);
        }
        return refreshAll();
      }).catch((e) => alert(e.message));
    });

    $('set-graph-pts')?.addEventListener('input', () => {
      markGraphPensDirty();
    });

    [
      'hist-log-uri', 'hist-log-db', 'hist-log-collection', 'hist-log-edge-collection', 'hist-log-sample-ms',
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => { mongoLoggerDirty = true; });
      el.addEventListener('change', () => { mongoLoggerDirty = true; });
    });
    $('hist-log-auto-start')?.addEventListener('change', () => { mongoLoggerDirty = true; });
    $('proj-scan-ms')?.addEventListener('input', () => {
      const v = +$('proj-scan-ms').value;
      if ($('set-scan') && Number.isFinite(v)) $('set-scan').value = v;
    });
    $('set-scan')?.addEventListener('input', () => {
      const v = +$('set-scan').value;
      if ($('proj-scan-ms') && Number.isFinite(v)) $('proj-scan-ms').value = v;
    });

  }

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    restartDashboardPoll();
    restartFullRefreshTimer();
    if (pollTimer === null) startLiveWebSocket();
    PeaklogicHmi?.refreshAfterPageRestore?.();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const appDeps = {
      getTags: () => tags,
      markTagsDirty: () => { tagsDirty = true; },
      ensurePidTag,
      ensureMotorTags,
      getLastLive: () => lastLive,
      applyLiveFromServer,
      getGraphHistory: () => lastGraphHistory,
      getLastRuntime: () => lastRuntime,
      getLastOptaRuntime: () => lastOptaRuntime,
      getLastSettings: () => lastSettings,
      getDrivers: () => drivers,
      getDriverHealthMap: () => driverHealthMap,
      getLastParcDevices: () => lastParcDevices,
      openOptaIoViewForDriver,
      optaHttpHostForDriver,
      setLastSettings: (s) => { lastSettings = s; },
      patchLastSettings: (patch) => { lastSettings = { ...lastSettings, ...patch }; },
      updateRuntimeButtons,
      getProjectName: () => projectName,
      getActiveSavedProjectId: () => resolveActiveSavedProjectId(lastSettings),
      persistCurrentProjectSnapshot: (opts) => persistCurrentProjectSnapshot(opts),
      refreshAll,
      restartDashboardPoll,
      liveEntryFor,
      formatIoValue,
      isDigitalOn,
      runtimeScanActive,
      openAlarmsPopup: () => openPopup('alarms'),
    };
    if (window.PeaklogicProgram) PeaklogicProgram.init(appDeps);
    if (window.PeaklogicHmi) {
      PeaklogicHmi.init(appDeps);
      PeaklogicHmi.bindHmiToolbar();
    }
    bindPopups();
    bindContextHelp();
    bindRoiCalculatorInputs();
    bindToolbar();
    if (window.PeaklogicProgram) PeaklogicProgram.bindProgramToolbar();
    loadAuthSession()
      .then(() => refreshAll())
      .then((data) => finishDashboardBoot(data))
      .catch((e) => {
        showBootError(e.message || String(e));
      })
      .finally(() => {
        fillModbusPortSelect();
        PeaklogicHmi?.initMainHmi();
        startDashboardRuntime();
      });
  });
})();
