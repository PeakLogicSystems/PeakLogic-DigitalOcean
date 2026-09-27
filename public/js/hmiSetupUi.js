'use strict';

/** HMI live view + setup composer */
window.PeakLogicHmi = (function () {
  const { esc } = window.PeakLogicCore;
  const domGet = window.PeakLogicCore.$;
  const HmiView = window.HmiView;

  const HMI_BINDING_PROPS = ['visibility', 'flashState', 'fill', 'fill5', 'fill8', 'state3', 'backgroundFill', 'stroke', 'text', 'rotation', 'trend', 'opacity', 'class'];
  const HMI_BINDING_PROP_LABELS = {
    flashState: 'flash overlay (hidden/red/amber)',
    fill5: 'pilot state (5)',
    fill8: 'fill color (8)',
    state3: 'HOA position (3)',
    backgroundFill: 'background fill',
    rotation: 'rotation (needle °)',
    trend: 'trend (strip chart)',
  };
  const HMI_FLASH_STATE_MODES = ['hidden', 'red', 'amber'];
  const HMI_STATE3_LABELS = ['Auto', 'Off', 'Hand'];
  const HMI_SCREEN_BG_ELEMENT_ID = '@screen';
  const HMI_GRID_CONTAINER_ID = 'hmi-tile-grid';
  const HMI_MAX_LAYERS = 5;
  const HMI_OBJ_KINDS = ['staticImage', 'staticText', 'dynamicText', 'dynamicImage', 'navButton', 'pageHotspot', 'roomHotspot', 'flashOverlay', 'alarmList'];
  const MAX_HMI_SCREENS = 500;
  const HMI_ROOMS_PER_FLOOR = 25;
  const ROOM_POPUP_SCREEN_ID = '@room_popup';
  const HMI_FILL5_DEFAULT_COLORS = [
    '#22c55e', '#ef4444', '#fbed20', '#f97316', '#64748b',
  ];
  const HMI_FILL5_STATE_LABELS = ['Off', 'On', 'Warn', 'Fault', 'Offline'];
  const HMI_FILL8_DEFAULT_COLORS = [
    '#94a3b8', '#22c55e', '#eab308', '#ef4444', '#2563eb', '#f97316', '#9333ea', '#0891b2',
  ];
  const HMI_MOTOR_TEXT_COLORS = ['#334155', '#334155', '#ef4444', '#ca8a04', '#94a3b8'];
  const HMI_TPO_TEXT_COLORS = ['#64748b', '#64748b', '#16a34a', '#f59e0b', '#94a3b8'];
  const HMI_POOL_BW_TEXT_COLORS = ['#64748b', '#2563eb', '#06b6d4', '#f59e0b', '#22c55e'];
  const HMI_TREND_DEFAULT_COLOR = '#2563eb';
  const HMI_STRIP_CHART = '/hmi/svg/library/charts-trends/strip-charts/peaklogic/chart-strip/strip_chart.svg';
  const HMI_GAUGE_COLUMN = '/hmi/svg/library/gauges-meters/column/peaklogic/gauge-column/gauge_column.svg';
  const HMI_PUSH_BUTTON_CANONICAL = '/hmi/svg/library/controls/push-buttons/peaklogic/pb-canonical/push_button_square.svg';
  const PUSH_BUTTON_SHAPES = ['square', 'rectangle', 'oblong', 'round'];
  const PUSH_BUTTON_DEFAULT_COLORS = { background: '#22c55e', text: '#0f172a', bezel: '#64748b' };
  let hmiStripChartUnifiedFilter = false;
  let hmiGaugeColumnUnifiedFilter = false;
  let hmiPushButtonModeFilter = null;
  let hmiPushButtonUnifiedFilter = false;
  let hmiPilotLightKindFilter = null;
  let hmiPilotLightUnifiedFilter = false;
  const PILOT_LIGHT_SHAPES = ['round', 'square', 'octagonal'];
  const PILOT_LIGHT_DEFAULT_SIMPLE = { off: '#22c55e', on: '#ef4444' };
  const PILOT_LIGHT_DEFAULT_COMPLEX = [...HMI_FILL5_DEFAULT_COLORS];
  const HMI_BINDING_PALETTE_PRESETS = [
    { id: 'pilot5', label: 'Pilot lights (5)', modes: ['fill5'], colors: () => [...HMI_FILL5_DEFAULT_COLORS] },
    { id: 'process8', label: 'Process values (8)', modes: ['fill8'], colors: () => [...HMI_FILL8_DEFAULT_COLORS] },
    { id: 'strip8', label: 'Strip chart pens (8)', modes: ['strip8'], colors: () => [...HMI_FILL8_DEFAULT_COLORS] },
    { id: 'motorText', label: 'Motor status text (5)', modes: ['text5'], colors: () => [...HMI_MOTOR_TEXT_COLORS] },
    { id: 'tpoText', label: 'TPO status text (5)', modes: ['text5'], colors: () => [...HMI_TPO_TEXT_COLORS] },
    { id: 'poolBwText', label: 'Pool backwash text (5)', modes: ['text5'], colors: () => [...HMI_POOL_BW_TEXT_COLORS] },
    { id: 'boolPair', label: 'BOOL gray / green', modes: ['dual'], colors: () => ['#64748b', '#22c55e'] },
    { id: 'analogPair', label: 'Analog gray / green', modes: ['dual'], colors: () => ['#94a3b8', '#22c55e'] },
    { id: 'trendBlue', label: 'Trend line blue', modes: ['single'], colors: () => [HMI_TREND_DEFAULT_COLOR] },
    { id: 'trendGreen', label: 'Trend line green', modes: ['single'], colors: () => ['#16a34a'] },
  ];
  const HMI_FILL8_PALETTE = [
    { label: 'Gray', hex: '#94a3b8' },
    { label: 'Dark gray', hex: '#64748b' },
    { label: 'Slate', hex: '#475569' },
    { label: 'Black', hex: '#1e293b' },
    { label: 'White', hex: '#f8fafc' },
    { label: 'Green', hex: '#22c55e' },
    { label: 'Lime', hex: '#84cc16' },
    { label: 'Alarm yellow', hex: '#fbed20' },
    { label: 'Amber', hex: '#f59e0b' },
    { label: 'Orange', hex: '#f97316' },
    { label: 'Red', hex: '#ef4444' },
    { label: 'Rose', hex: '#f43f5e' },
    { label: 'Pink', hex: '#ec4899' },
    { label: 'Purple', hex: '#9333ea' },
    { label: 'Blue', hex: '#2563eb' },
    { label: 'Sky', hex: '#0ea5e9' },
    { label: 'Cyan', hex: '#0891b2' },
    { label: 'Teal', hex: '#14b8a6' },
  ];
  const HOME_SCREEN_ID = 'screen_1';
  const HMI_ASSET_PAGE_SIZE = 100;
  const HMI_RECENT_ASSETS_KEY = 'peaklogic-hmi-recent-assets';
  const HMI_COMPOSER_SECTION_KEY = 'peaklogic-hmi-composer-section';
  const HMI_RECENT_ASSETS_MAX = 48;
  const HMI_DEFAULT_WIDTH = 1024;
  const HMI_DEFAULT_HEIGHT = 800;
  const HMI_GRID_SIZE = 8;
  const HMI_MAX_GRID_COLS = 24;
  const HMI_MAX_GRID_ROWS = 24;

  const HMI_COMPOSER_VERSION = '1.2';
  const HMI_CELL_SIZE_PRESETS = [64, 80, 96, 100, 128, 160, 192, 256];
  const HMI_RESOLUTION_PRESETS = [
    ['800x600', 800, 600],
    ['1024x800', 1024, 800],
    ['1280x720', 1280, 720],
    ['1366x768', 1366, 768],
    ['1920x1080', 1920, 1080],
    ['1920x1200', 1920, 1200],
  ];
  const HMI_LAYOUT_PRESETS = [
    {
      id: 'default',
      label: 'Default 8×8 · 1024×800',
      gridCols: 8,
      gridRows: 8,
      cellWidth: 128,
      cellHeight: 100,
      displayMaxWidth: 1024,
      displayMaxHeight: 800,
    },
    {
      id: 'wide',
      label: 'Wide 12×8 · 1536×800',
      gridCols: 12,
      gridRows: 8,
      cellWidth: 128,
      cellHeight: 100,
      displayMaxWidth: 1536,
      displayMaxHeight: 800,
    },
    {
      id: 'fhd',
      label: 'Full HD 1920×1080',
      gridCols: 12,
      gridRows: 9,
      cellWidth: 160,
      cellHeight: 120,
      displayMaxWidth: 1920,
      displayMaxHeight: 1080,
    },
  ];

  function fillNumericSelect(id, min, max, labelsFn) {
    const el = domGet(id);
    if (!el || el.tagName !== 'SELECT') return;
    const cur = el.value;
    const opts = [];
    for (let i = min; i <= max; i++) {
      const label = labelsFn ? labelsFn(i) : String(i);
      opts.push(`<option value="${i}">${esc(label)}</option>`);
    }
    el.innerHTML = opts.join('');
    if (cur !== '' && +cur >= min && +cur <= max) el.value = cur;
  }

  function fillCellSizeSelect(selectId, customInputId, customWrapId, value) {
    const sel = domGet(selectId);
    if (!sel || sel.tagName !== 'SELECT') return;
    const cur = sel.value;
    const presets = HMI_CELL_SIZE_PRESETS;
    sel.innerHTML = presets.map((v) => `<option value="${v}">${v} px</option>`).join('')
      + '<option value="custom">Custom…</option>';
    const v = Math.max(8, Math.min(512, Number(value) || presets[4]));
    const wrap = domGet(customWrapId);
    const customIn = domGet(customInputId);
    if (presets.includes(v)) {
      sel.value = String(v);
      wrap?.classList.add('view-hidden');
    } else {
      sel.value = 'custom';
      wrap?.classList.remove('view-hidden');
      if (customIn) customIn.value = String(v);
    }
    if (cur && cur !== sel.value && presets.includes(+cur)) sel.value = cur;
  }

  function readCellSizeSelect(selectId, customInputId, fallback) {
    const sel = domGet(selectId);
    if (!sel) return fallback;
    if (sel.tagName === 'SELECT' && sel.value === 'custom') {
      return Math.max(8, Math.min(512, +(domGet(customInputId)?.value) || fallback));
    }
    return Math.max(8, Math.min(512, +(sel.value) || fallback));
  }

  function onCellSizeSelectChange(selectId, customInputId, customWrapId) {
    const sel = domGet(selectId);
    const wrap = domGet(customWrapId);
    if (!sel) return;
    if (sel.value === 'custom') {
      wrap?.classList.remove('view-hidden');
      domGet(customInputId)?.focus();
    } else {
      wrap?.classList.add('view-hidden');
    }
  }

  function readShowGridFromField() {
    const el = domGet('hmi-show-grid');
    if (!el) return true;
    if (el.type === 'checkbox') return el.checked;
    return el.value === 'show';
  }

  const HmiViewMode = () => window.PeakLogicHmiViewMode || {};

  function hmiPollMsForSettings(settings) {
    return HmiViewMode().hmiPollMsFromSettings?.(settings) ?? 60_000;
  }

  function canShowHmiTestModeToggle(settings) {
    return HmiViewMode().canEnableHmiTestMode?.(settings ?? lastSettings?.()) === true;
  }

  function isHmiTestModeOn(settings) {
    return HmiViewMode().isHmiTestMode?.(settings ?? lastSettings?.()) === true;
  }

  const HMI_LIVE_STATUS_HIDDEN_KEY = 'peaklogic-hmi-hide-live-status';

  function readShowLiveStatusFromField() {
    const el = domGet('hmi-show-live-status');
    if (!el) return true;
    if (el.type === 'checkbox') return el.checked;
    return el.value === 'show';
  }

  function isLiveStatusBarVisible() {
    if (hmiConfig.layout?.showLiveStatus === false) return false;
    try {
      if (localStorage.getItem(HMI_LIVE_STATUS_HIDDEN_KEY) === '1') return false;
    } catch { /* ignore */ }
    return true;
  }

  function syncLiveStatusBarVisibility() {
    const bar = domGet('hmi-live-status');
    const showBtn = domGet('btn-hmi-show-status');
    const visible = isLiveStatusBarVisible();
    bar?.classList.toggle('view-hidden', !visible);
    showBtn?.classList.toggle('view-hidden', visible);
  }

  function hideLiveStatusBar() {
    try { localStorage.setItem(HMI_LIVE_STATUS_HIDDEN_KEY, '1'); } catch { /* ignore */ }
    syncLiveStatusBarVisibility();
  }

  function showLiveStatusBar() {
    try { localStorage.removeItem(HMI_LIVE_STATUS_HIDDEN_KEY); } catch { /* ignore */ }
    if (hmiConfig.layout) hmiConfig.layout.showLiveStatus = true;
    const sel = domGet('hmi-show-live-status');
    if (sel && sel.tagName === 'SELECT') sel.value = 'show';
    syncLiveStatusBarVisibility();
  }

  function layoutFieldsMatchPreset(preset) {
    const cols = +(domGet('hmi-grid-cols')?.value) || 0;
    const rows = +(domGet('hmi-grid-rows')?.value) || 0;
    const cellW = readCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 0);
    const cellH = readCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 0);
    const maxW = +(domGet('hmi-display-max-width')?.value) || 0;
    const maxH = +(domGet('hmi-display-max-height')?.value) || 0;
    return cols === preset.gridCols
      && rows === preset.gridRows
      && cellW === preset.cellWidth
      && cellH === preset.cellHeight
      && maxW === preset.displayMaxWidth
      && maxH === preset.displayMaxHeight;
  }

  function syncLayoutPresetFromFields() {
    const sel = domGet('hmi-layout-preset');
    if (!sel) return;
    const match = HMI_LAYOUT_PRESETS.find((p) => layoutFieldsMatchPreset(p));
    sel.value = match ? match.id : 'custom';
  }

  function applyLayoutPreset(presetId) {
    const preset = HMI_LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (domGet('hmi-grid-cols')) domGet('hmi-grid-cols').value = String(preset.gridCols);
    if (domGet('hmi-grid-rows')) domGet('hmi-grid-rows').value = String(preset.gridRows);
    fillCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 'hmi-cell-width-custom-wrap', preset.cellWidth);
    fillCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 'hmi-cell-height-custom-wrap', preset.cellHeight);
    if (domGet('hmi-logical-preset')) domGet('hmi-logical-preset').value = 'match-grid';
    domGet('hmi-logical-custom-wrap')?.classList.add('view-hidden');
    domGet('hmi-logical-custom-wrap-y')?.classList.add('view-hidden');
    if (domGet('hmi-display-preset')) {
      domGet('hmi-display-preset').value = 'match-logical';
      domGet('hmi-display-custom-wrap')?.classList.add('view-hidden');
      domGet('hmi-display-custom-wrap-y')?.classList.add('view-hidden');
    }
    if (domGet('hmi-display-max-width')) domGet('hmi-display-max-width').value = preset.displayMaxWidth;
    if (domGet('hmi-display-max-height')) domGet('hmi-display-max-height').value = preset.displayMaxHeight;
    applyGridSizeFromCellFields();
    syncLayoutPresetFromFields();
    syncLogicalPresetFromFields();
    syncDisplayPresetFromFields();
  }

  function syncLogicalPresetFromFields() {
    const sel = domGet('hmi-logical-preset');
    if (!sel) return;
    const cols = +(domGet('hmi-grid-cols')?.value) || HMI_GRID_SIZE;
    const rows = +(domGet('hmi-grid-rows')?.value) || HMI_GRID_SIZE;
    const cellW = readCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 128);
    const cellH = readCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 100);
    const gridW = cols * cellW;
    const gridH = rows * cellH;
    const w = +(domGet('hmi-screen-width')?.value) || gridW;
    const h = +(domGet('hmi-screen-height')?.value) || gridH;
    if (w === gridW && h === gridH) {
      sel.value = 'match-grid';
      domGet('hmi-logical-custom-wrap')?.classList.add('view-hidden');
      domGet('hmi-logical-custom-wrap-y')?.classList.add('view-hidden');
      return;
    }
    const key = `${w}x${h}`;
    const match = HMI_RESOLUTION_PRESETS.find(([k]) => k === key);
    if (match) {
      sel.value = key;
      domGet('hmi-logical-custom-wrap')?.classList.add('view-hidden');
      domGet('hmi-logical-custom-wrap-y')?.classList.add('view-hidden');
    } else {
      sel.value = 'custom';
      domGet('hmi-logical-custom-wrap')?.classList.remove('view-hidden');
      domGet('hmi-logical-custom-wrap-y')?.classList.remove('view-hidden');
    }
  }

  function syncDisplayPresetFromFields() {
    const sel = domGet('hmi-display-preset');
    if (!sel) return;
    const logicalW = +(domGet('hmi-screen-width')?.value) || HMI_DEFAULT_WIDTH;
    const logicalH = +(domGet('hmi-screen-height')?.value) || HMI_DEFAULT_HEIGHT;
    const w = +(domGet('hmi-display-max-width')?.value) || logicalW;
    const h = +(domGet('hmi-display-max-height')?.value) || logicalH;
    if (w === logicalW && h === logicalH) {
      sel.value = 'match-logical';
      domGet('hmi-display-custom-wrap')?.classList.add('view-hidden');
      domGet('hmi-display-custom-wrap-y')?.classList.add('view-hidden');
      return;
    }
    const key = `${w}x${h}`;
    const match = HMI_RESOLUTION_PRESETS.find(([k]) => k === key);
    if (match) {
      sel.value = key;
      domGet('hmi-display-custom-wrap')?.classList.add('view-hidden');
      domGet('hmi-display-custom-wrap-y')?.classList.add('view-hidden');
    } else {
      sel.value = 'custom';
      domGet('hmi-display-custom-wrap')?.classList.remove('view-hidden');
      domGet('hmi-display-custom-wrap-y')?.classList.remove('view-hidden');
    }
  }

  function onLogicalPresetChange() {
    const preset = domGet('hmi-logical-preset')?.value || 'match-grid';
    if (preset === 'custom') {
      domGet('hmi-logical-custom-wrap')?.classList.remove('view-hidden');
      domGet('hmi-logical-custom-wrap-y')?.classList.remove('view-hidden');
      return;
    }
    domGet('hmi-logical-custom-wrap')?.classList.add('view-hidden');
    domGet('hmi-logical-custom-wrap-y')?.classList.add('view-hidden');
    if (preset === 'match-grid') {
      applyGridSizeFromCellFields();
      syncLayoutPresetFromFields();
      syncDisplayPresetFromFields();
      return;
    }
    const row = HMI_RESOLUTION_PRESETS.find(([k]) => k === preset);
    if (!row) return;
    const [, w, h] = row;
    if (domGet('hmi-screen-width')) domGet('hmi-screen-width').value = w;
    if (domGet('hmi-screen-height')) domGet('hmi-screen-height').value = h;
    markHmiDirty();
    syncHmiScreenMetaFromFields();
    syncLayoutPresetFromFields();
    syncDisplayPresetFromFields();
    scheduleHmiPreview();
  }

  function onDisplayPresetChange() {
    const preset = domGet('hmi-display-preset')?.value || 'match-logical';
    if (preset === 'custom') {
      domGet('hmi-display-custom-wrap')?.classList.remove('view-hidden');
      domGet('hmi-display-custom-wrap-y')?.classList.remove('view-hidden');
      return;
    }
    domGet('hmi-display-custom-wrap')?.classList.add('view-hidden');
    domGet('hmi-display-custom-wrap-y')?.classList.add('view-hidden');
    if (preset === 'match-logical') {
      const g = screenGridSpec(activeHmiScreen());
      if (domGet('hmi-display-max-width')) domGet('hmi-display-max-width').value = g.width;
      if (domGet('hmi-display-max-height')) domGet('hmi-display-max-height').value = g.height;
    } else {
      const row = HMI_RESOLUTION_PRESETS.find(([k]) => k === preset);
      if (!row) return;
      const [, w, h] = row;
      if (domGet('hmi-display-max-width')) domGet('hmi-display-max-width').value = w;
      if (domGet('hmi-display-max-height')) domGet('hmi-display-max-height').value = h;
    }
    markHmiDirty();
    syncHmiScreenMetaFromFields();
    syncLayoutPresetFromFields();
    scheduleHmiPreview();
  }

  function onHmiAssetQuickFilterChange() {
    const mode = domGet('hmi-asset-quick-filter')?.value || 'all';
    if (mode === 'recent') {
      showHmiComposerSection('recent');
      return;
    }
    if (mode !== 'all') showHmiComposerSection('symbols');
    if (mode === 'dial-backgrounds') {
      applyHmiGaugeAssetFilter();
      return;
    }
    if (mode === 'dial-pointers') {
      applyHmiGaugePointerFilter();
      return;
    }
    if (mode === 'composites') {
      applyHmiCompositeFilter();
      return;
    }
    if (mode === 'strip-charts') {
      applyHmiStripChartFilter();
      return;
    }
    if (mode === 'gauge-columns') {
      applyHmiGaugeColumnFilter();
      return;
    }
    if (mode === 'push-buttons-momentary') {
      applyHmiPushButtonMomentaryFilter();
      return;
    }
    if (mode === 'push-buttons-latched') {
      applyHmiPushButtonLatchedFilter();
      return;
    }
    if (mode === 'pilot-lights-simple') {
      applyHmiPilotLightSimpleFilter();
      return;
    }
    if (mode === 'pilot-lights-complex') {
      applyHmiPilotLightComplexFilter();
      return;
    }
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'all';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'all';
    if (search) search.value = '';
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonModeFilter = null;
    hmiPushButtonUnifiedFilter = false;
    hmiPilotLightKindFilter = null;
    hmiPilotLightUnifiedFilter = false;
    onHmiAssetFilterChange();
  }

  function updateHmiComposerTitle() {
    const title = domGet('popup-hmi-setup-title');
    if (!title) return;
    const ver = title.querySelector('.hmi-composer-version');
    if (ver) ver.textContent = `· Composer v${HMI_COMPOSER_VERSION}`;
  }

  function activeHmiComposerSection() {
    const nav = domGet('hmi-composer-nav');
    const active = nav?.querySelector('.hmi-composer-nav-item.active');
    return active?.dataset?.hmiSection || 'layout';
  }

  function showHmiComposerSection(sectionId) {
    const id = String(sectionId || 'layout').trim() || 'layout';
    const nav = domGet('hmi-composer-nav');
    if (!nav) return;
    nav.querySelectorAll('.hmi-composer-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hmiSection === id);
    });
    document.querySelectorAll('.hmi-composer-section').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.hmiSection === id);
    });
    try {
      sessionStorage.setItem(HMI_COMPOSER_SECTION_KEY, id);
    } catch { /* ignore */ }
    if (id === 'recent') fillHmiRecentAssetGrid();
    if (id === 'symbols') fillHmiAssetGrid();
  }

  function restoreHmiComposerSection() {
    let section = 'layout';
    try {
      section = sessionStorage.getItem(HMI_COMPOSER_SECTION_KEY) || 'layout';
    } catch { /* ignore */ }
    const allowed = new Set(['screen', 'symbols', 'object-type', 'recent', 'layout', 'display', 'bindings']);
    showHmiComposerSection(allowed.has(section) ? section : 'layout');
  }

  function bindHmiComposerNav() {
    const nav = domGet('hmi-composer-nav');
    if (!nav || nav.dataset.bound === '1') return;
    nav.dataset.bound = '1';
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.hmi-composer-nav-item[data-hmi-section]');
      if (!btn) return;
      showHmiComposerSection(btn.dataset.hmiSection);
    });
  }

  function renderHmiAssetTiles(grid, assets, emptyMessage) {
    if (!grid) return;
    grid.innerHTML = assets.map((a) => {
      const selected = a.path === hmiSelectedAssetPath;
      const rawThumb = a.type === 'composite' ? (a.preview || a.composite?.preview || '') : a.path;
      const thumb = resolveHmiAssetUrl(rawThumb);
      const badge = a.type === 'composite' ? '<span class="hmi-asset-badge">composite</span>' : '';
      return `<button type="button" class="hmi-asset-tile${selected ? ' selected' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" draggable="true" data-hmi-asset-path="${esc(a.path)}" title="${esc(a.label || a.name)}">
        <span class="hmi-asset-thumb">${badge}<img src="${esc(thumb)}" alt="" loading="lazy"></span>
        <span class="hmi-asset-label">${esc(a.label || a.name)}</span>
      </button>`;
    }).join('') || `<p class="muted hmi-asset-empty">${emptyMessage}</p>`;
  }

  function bindHmiAssetGridEvents(grid) {
    if (!grid || grid.dataset.bound === '1') return;
    grid.dataset.bound = '1';
    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('[data-hmi-asset-path]');
      if (!tile) return;
      selectHmiAsset(tile.dataset.hmiAssetPath);
    });
    grid.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('[data-hmi-asset-path]');
      if (!tile) return;
      selectHmiAsset(tile.dataset.hmiAssetPath);
      e.dataTransfer.setData('text/hmi-asset-path', tile.dataset.hmiAssetPath);
      e.dataTransfer.setData('text/plain', tile.dataset.hmiAssetPath);
      e.dataTransfer.effectAllowed = 'copy';
    });
  }

  function fillHmiRecentAssetGrid() {
    const grid = domGet('hmi-recent-asset-grid');
    if (!grid) return;
    const list = getHmiRecentAssetList();
    renderHmiAssetTiles(grid, list, 'No recently used symbols — place symbols from the library to build this list.');
    const hint = domGet('hmi-recent-asset-hint');
    if (hint) {
      hint.textContent = list.length
        ? `${list.length} recently used symbol(s) — most recent first`
        : 'No recently used symbols yet';
    }
    bindHmiAssetGridEvents(grid);
  }

  function isScreenNavKind(kind) {
    return kind === 'navButton' || kind === 'pageHotspot';
  }

  function isRoomHotspotKind(kind) {
    return kind === 'roomHotspot';
  }

  function isRegionOverlayKind(kind) {
    return kind === 'pageHotspot' || kind === 'roomHotspot' || kind === 'flashOverlay';
  }

  function isDirectPlaceKind(kind) {
    return kind === 'navButton' || kind === 'pageHotspot' || kind === 'roomHotspot' || kind === 'flashOverlay';
  }

  function canDirectPlaceKind(kind) {
    if (kind === 'flashOverlay') return true;
    if (kind === 'roomHotspot') {
      const n = Math.trunc(Number(domGet('hmi-room-num')?.value));
      return Number.isFinite(n) && n >= 1 && n <= MAX_HMI_SCREENS;
    }
    if (kind === 'navButton' || kind === 'pageHotspot') {
      return !!domGet('hmi-nav-target')?.value?.trim();
    }
    return false;
  }

  function selectedFlashOverlayColor() {
    const v = domGet('hmi-flash-overlay-color')?.value;
    return v === 'amber' ? 'amber' : 'red';
  }

  const HMI_CELL_FRACTIONS = [0.25, 0.5, 0.75];

  function cellFractionFromLayer(layer) {
    const v = Number(layer?.cellFraction);
    return HMI_CELL_FRACTIONS.includes(v) ? v : 1;
  }

  function selectedCellFraction() {
    const v = Number(domGet('hmi-region-cell-fraction')?.value);
    return HMI_CELL_FRACTIONS.includes(v) ? v : 1;
  }

  function applyCellFractionToLayer(layer, fraction) {
    if (!layer) return;
    if (HMI_CELL_FRACTIONS.includes(fraction)) layer.cellFraction = fraction;
    else delete layer.cellFraction;
  }

  function syncCellFractionSelectFromLayer(layer) {
    const el = domGet('hmi-region-cell-fraction');
    if (!el) return;
    el.value = String(cellFractionFromLayer(layer));
  }

  function applySelectedCellFractionFromFields() {
    if (!hmiSelectedTileCell) return false;
    const scr = activeHmiScreen();
    if (!scr) return false;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    if (!tile) return false;
    const z = selectedHmiPlaceZ();
    const layer = pageHotspotLayerFromTile(tile, z) || flashOverlayLayerFromTile(tile, z);
    if (!layer) return false;
    const fraction = selectedCellFraction();
    if (fraction === cellFractionFromLayer(layer)) return false;
    applyCellFractionToLayer(layer, fraction);
    tile.layers = screenTileLayers(tile);
    syncTileLegacyFields(tile);
    markHmiDirty();
    hmiPreviewTilesKey = '';
    scheduleHmiPreview(true);
    refreshMainTileGrid(true);
    if (layer.kind === 'pageHotspot') {
      refreshPageHotspotCellPreview(tile.col, tile.row).catch(console.error);
    } else {
      refreshFlashOverlayCellPreview(tile.col, tile.row).catch(console.error);
    }
    return true;
  }

  function tileHasGraphicBackground(tile) {
    if (!tile) return false;
    return screenTileLayers(tile).some(
      (l) => l.kind !== 'navButton' && l.kind !== 'pageHotspot' && l.kind !== 'roomHotspot' && l.kind !== 'flashOverlay' && l.svg,
    );
  }

  function pageHotspotRegionFromLayer(layer, tile) {
    const tileCol = Number(tile?.col) || 0;
    const tileRow = Number(tile?.row) || 0;
    const tileCs = tile?.colSpan || 1;
    const tileRs = tile?.rowSpan || 1;
    if (HmiView.pageHotspotRegion) {
      return HmiView.pageHotspotRegion(layer, tileCol, tileRow, tileCs, tileRs);
    }
    const hasPos = Number.isFinite(Number(layer?.hotspotCol)) && Number.isFinite(Number(layer?.hotspotRow));
    const hcs = Number(layer?.hotspotColSpan);
    const hrs = Number(layer?.hotspotRowSpan);
    const hasHotspotColSpan = Number.isFinite(hcs) && hcs > 0;
    const hasHotspotRowSpan = Number.isFinite(hrs) && hrs > 0;
    const hasHotspotSpan = hasHotspotColSpan || hasHotspotRowSpan;
    const defaultSpan = hasPos || hasHotspotSpan ? 1 : null;
    return {
      col: hasPos ? Number(layer.hotspotCol) : tileCol,
      row: hasPos ? Number(layer.hotspotRow) : tileRow,
      colSpan: Math.max(1, Math.min(HMI_MAX_GRID_COLS, hasHotspotColSpan ? hcs : (defaultSpan ?? tileCs))),
      rowSpan: Math.max(1, Math.min(HMI_MAX_GRID_ROWS, hasHotspotRowSpan ? hrs : (defaultSpan ?? tileRs))),
    };
  }

  function hotspotRegionFitsTile(hotspotCol, hotspotRow, colSpan, rowSpan, tile) {
    if (!tile) return true;
    const tc = Number(tile.col);
    const tr = Number(tile.row);
    const tcs = tile.colSpan || 1;
    const trs = tile.rowSpan || 1;
    const cs = colSpan || 1;
    const rs = rowSpan || 1;
    return hotspotCol >= tc && hotspotRow >= tr
      && hotspotCol + cs <= tc + tcs
      && hotspotRow + rs <= tr + trs;
  }

  function applyPageHotspotRegionToLayer(layer, hotspotCol, hotspotRow, colSpan, rowSpan) {
    if (!layer) return;
    layer.hotspotCol = hotspotCol;
    layer.hotspotRow = hotspotRow;
    if (colSpan > 1) layer.hotspotColSpan = colSpan;
    else delete layer.hotspotColSpan;
    if (rowSpan > 1) layer.hotspotRowSpan = rowSpan;
    else delete layer.hotspotRowSpan;
  }

  function shouldPreserveHotspotClickCoords(col, row) {
    const kind = domGet('hmi-place-kind')?.value || '';
    if (kind === 'pageHotspot' || kind === 'flashOverlay') return true;
    const scr = activeHmiScreen();
    const probeCol = Number.isFinite(Number(col)) ? Number(col) : hmiSelectedTileCell?.col;
    const probeRow = Number.isFinite(Number(row)) ? Number(row) : hmiSelectedTileCell?.row;
    if (Number.isFinite(probeCol) && Number.isFinite(probeRow)) {
      const tile = getScreenTile(scr, probeCol, probeRow);
      if (tile && pageHotspotLayerFromTile(tile) && tileHasGraphicBackground(tile)) return true;
      if (tile && flashOverlayLayerFromTile(tile) && tileHasGraphicBackground(tile)) return true;
    }
    if (!hmiSelectedTileCell) return false;
    const tile = getScreenTile(scr, hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    if (tile && pageHotspotLayerFromTile(tile) && tileHasGraphicBackground(tile)) return true;
    return !!(tile && flashOverlayLayerFromTile(tile) && tileHasGraphicBackground(tile));
  }

  /** UI / selection coords: overlay region origin on graphic backgrounds, else tile anchor. */
  function resolveHmiSelectedCellCoords(col, row, preserveClick) {
    const scr = activeHmiScreen();
    const tile = getScreenTile(scr, col, row);
    if (!tile) return { col, row };
    const tc = Number(tile.col);
    const tr = Number(tile.row);
    const graphicBg = tileHasGraphicBackground(tile);
    const placeZ = selectedHmiPlaceZ();
    const overlayLayer = pageHotspotLayerFromTile(tile, placeZ) || flashOverlayLayerFromTile(tile, placeZ);
    if (graphicBg && overlayLayer) {
      if (preserveClick && (col !== tc || row !== tr)) return { col, row };
      const region = pageHotspotRegionFromLayer(overlayLayer, tile);
      return { col: region.col, row: region.row };
    }
    if (!preserveClick) {
      const cell = setupGridCell(col, row);
      const anchor = gridAnchorFromCell(col, row, cell);
      return { col: anchor.col, row: anchor.row };
    }
    return { col, row };
  }

  function syncHmiPlaceZSelectForKind() {
    const kind = domGet('hmi-place-kind')?.value || '';
    const zEl = domGet('hmi-place-z');
    if (!zEl) return;
    const cur = +(zEl.value);
    if (kind === 'pageHotspot' || kind === 'flashOverlay') {
      fillNumericSelect('hmi-place-z', 1, HMI_MAX_LAYERS - 1, (z) => `Z${z}`);
      if (!Number.isFinite(cur) || cur < 1 || cur > HMI_MAX_LAYERS - 1) zEl.value = '1';
      else zEl.value = String(cur);
      return;
    }
    fillNumericSelect('hmi-place-z', 0, HMI_MAX_LAYERS - 1, (z) => {
      if (z === 0) return 'Z0 back';
      if (z === HMI_MAX_LAYERS - 1) return `Z${z} front`;
      return `Z${z}`;
    });
    if (Number.isFinite(cur) && cur >= 0 && cur <= HMI_MAX_LAYERS - 1) zEl.value = String(cur);
  }

  function initHmiComposerSelects() {
    syncHmiPlaceZSelectForKind();
    fillNumericSelect('hmi-tile-col-span', 1, HMI_MAX_GRID_COLS);
    fillNumericSelect('hmi-tile-row-span', 1, HMI_MAX_GRID_ROWS);
    fillNumericSelect('hmi-grid-cols', 1, HMI_MAX_GRID_COLS);
    fillNumericSelect('hmi-grid-rows', 1, HMI_MAX_GRID_ROWS);
    fillCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 'hmi-cell-width-custom-wrap', 128);
    fillCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 'hmi-cell-height-custom-wrap', 100);
    const placeZ = domGet('hmi-place-z');
    if (placeZ && !placeZ.value) placeZ.value = '0';
    const colSpan = domGet('hmi-tile-col-span');
    if (colSpan && !colSpan.value) colSpan.value = '1';
    const rowSpan = domGet('hmi-tile-row-span');
    if (rowSpan && !rowSpan.value) rowSpan.value = '1';
    updateHmiComposerTitle();
  }

  const HMI_ASSET_GROUP_PATHS = [
    { match: '/gauges-meters/', group: 'Gauges & meters' },
    { match: '/numeric-displays/', group: 'Numeric displays' },
    { match: '/charts-trends/', group: 'Charts & trends' },
    { match: '/pid-faceplates/', group: 'PID faceplates' },
    { match: '/motor-faceplates/', group: 'Motor control' },
    { match: '/controls/pilot-lights/', group: 'Controls — Pilot lights' },
    { match: '/controls/push-buttons/', group: 'Controls — Push buttons' },
    { match: '/controls/selector-switches/', group: 'Controls — Switches' },
    { match: '/piping/', group: 'Piping' },
    { match: '/pumps/', group: 'Pumps' },
    { match: '/valves/', group: 'Valves' },
    { match: '/tanks-vessels/', group: 'Tanks & vessels' },
    { match: '/animations/', group: 'Animations' },
    { match: '/text-labels/', group: 'Text & labels' },
    { match: '/demos/', group: 'Demos' },
    { match: '/process-equipment/', group: 'Process equipment' },
  ];

  function inferHmiAssetMeta(pathOrName) {
    const s = String(pathOrName || '').toLowerCase().replace(/\\/g, '/');
    if (s.includes('/hmi/user/')) {
      return { group: 'User imports', subgroup: 'overlays' };
    }
    for (const row of HMI_ASSET_GROUP_PATHS) {
      if (s.includes(row.match)) {
        const sub = s.match(/gauges-meters\/([^/]+)/)?.[1]
          || s.match(/library\/[^/]+\/([^/]+)/)?.[1]
          || '';
        return { group: row.group, subgroup: sub };
      }
    }
    if (s.includes('/peaklogic/')) {
      const folder = s.match(/\/peaklogic\/([^/]+)/)?.[1] || '';
      if (/gauge_dialpointer|dial-pointer|dialpointer/i.test(s)) {
        return { group: 'Gauges & meters', subgroup: 'dial-pointers' };
      }
      if (/gauge_dial|dial-background|dial-bg/i.test(s)) {
        return { group: 'Gauges & meters', subgroup: 'dial-backgrounds' };
      }
      if (/gauge_column/i.test(s)) return { group: 'Gauges & meters', subgroup: 'column' };
      return { group: 'Gauges & meters', subgroup: folder || 'mv' };
    }
    return { group: 'Misc', subgroup: '' };
  }

  function enrichHmiAsset(raw) {
    const a = raw && typeof raw === 'object' ? { ...raw } : { path: String(raw || '') };
    if (a.type === 'composite' && a.composite) {
      if (!a.group) a.group = a.composite.group || 'Gauges & meters';
      if (!a.subgroup) a.subgroup = a.composite.subgroup || 'composites';
      if (!a.label) a.label = a.composite.label || a.composite.id;
      if (!a.preview) a.preview = a.composite.preview;
      return a;
    }
    const meta = inferHmiAssetMeta(a.path || a.name);
    if (!a.group) a.group = meta.group;
    if (!a.subgroup) a.subgroup = meta.subgroup;
    if (!a.label) a.label = (a.name || a.path || '').replace(/\.(svg|gif|png|jpe?g|webp)$/i, '').replace(/[_-]+/g, ' ');
    if (!a.type && a.path) {
      const ext = String(a.path).split('.').pop()?.toLowerCase();
      if (ext) a.type = ext;
    }
    return a;
  }

  let deps = null;
  let hmiConfig = { activeScreen: HOME_SCREEN_ID, screens: [], bindings: [] };
  let hmiEditScreenId = '';
  let hmiViewScreenId = '';
  let hmiAssets = [];
  let hmiRecentAssetPaths = [];
  let hmiAssetPagesLoaded = 1;
  let hmiDirty = false;
  let hmiLoadedUrl = '';
  let hmiSvgRoot = null;
  let hmiElementIds = [];
  let hmiPreviewToken = 0;
  let hmiPreviewSvg = '';
  let hmiPreviewTilesKey = '';
  let hmiConfigReady = false;
  let hmiServerSettingsKey = '';
  let hmiLiveLoadToken = 0;
  let hmiSelectedAssetPath = '';
  let hmiSelectedTileCell = null;
  /** @type {Map<string, object>} */
  let hmiCompositeByPath = new Map();

  const HMI_COMPOSITE_PATH_PREFIX = '@composite/';

  function isCompositeAssetPath(path) {
    return String(path || '').startsWith(HMI_COMPOSITE_PATH_PREFIX);
  }

  function hmiAssetByPath(path) {
    return (hmiAssets || []).find((a) => a.path === path) || null;
  }

  function compositeManifestFromAsset(assetOrPath) {
    if (assetOrPath && typeof assetOrPath === 'object' && assetOrPath.composite) {
      return assetOrPath.composite;
    }
    const path = typeof assetOrPath === 'string' ? assetOrPath : assetOrPath?.path;
    if (path && hmiCompositeByPath.has(path)) {
      return hmiCompositeByPath.get(path);
    }
    if (path && isCompositeAssetPath(path)) {
      const fallback = hmiAssetForRecentPath(path);
      if (fallback?.composite) return fallback.composite;
    }
    return null;
  }

  function indexHmiComposites(assets) {
    hmiCompositeByPath = new Map();
    for (const a of assets || []) {
      if (a?.type === 'composite' && a.composite) {
        hmiCompositeByPath.set(a.path, a.composite);
      }
    }
  }

  function isPidFaceplatePath(path) {
    return /pid-faceplates|pid_loop_standard/i.test(String(path || ''));
  }

  function isMotorFaceplatePath(path) {
    return /motor-faceplates|motor_hoa/i.test(String(path || ''));
  }

  function isTpoFaceplatePath(path) {
    return HmiView.isTpoFaceplateAssetPath?.(path)
      || /schedules\/peaklogic\/tpo_daily|tpo_daily/i.test(String(path || ''));
  }

  function isPoolFaceplatePath(path) {
    return HmiView.isPoolFaceplateAssetPath?.(path)
      || /pool-faceplates|pool_(overview|pump|chemistry|backwash|controller|lighting)/i.test(String(path || ''));
  }

  function poolCompositeIdFromPath(path) {
    if (HmiView.poolCompositeIdFromAssetPath) return HmiView.poolCompositeIdFromAssetPath(path);
    const p = String(path || '');
    if (/pool_pump/i.test(p)) return 'pool_pump';
    if (/pool_chemistry/i.test(p)) return 'pool_chemistry';
    if (/pool_backwash/i.test(p)) return 'pool_backwash';
    if (/pool_lighting/i.test(p)) return 'pool_lighting';
    if (/pool_controller/i.test(p)) return 'pool_controller';
    return 'pool_overview';
  }

  function isAlternatorFaceplatePath(path) {
    return HmiView.isAlternatorFaceplateAssetPath?.(path)
      || /alternator-faceplates|\/alternator\.svg|@composite\/alternator/i.test(String(path || ''));
  }

  function isAlarmListPath(path) {
    return HmiView.isAlarmListAssetPath?.(path)
      || /\/composites\/alarm_list(?:\.svg|\.json)?|@composite\/alarm_list/i.test(String(path || ''));
  }

  function isCompositeFaceplatePath(path) {
    return isPidFaceplatePath(path) || isMotorFaceplatePath(path) || isTpoFaceplatePath(path)
      || isPoolFaceplatePath(path)
      || isAlternatorFaceplatePath(path);
  }

  function pickTagForCompositeRole(manifest, role) {
    if (!manifest) return '';
    const spec = manifest.tagRoles?.[role] || manifest.tagRoles?.pv || { pick: 'firstNumeric' };
    const tags = tagList();
    if (spec.pick === 'tagId' && spec.tagId) {
      const hit = tags.find((t) => String(t.id) === spec.tagId);
      return hit?.id || spec.tagId;
    }
    const types = Array.isArray(spec.types) ? spec.types.map((t) => String(t).toUpperCase()) : ['REAL', 'INT'];
    if (spec.pick === 'firstPid') {
      const hit = tags.find((t) => String(t.type || '').toUpperCase() === 'PID');
      return hit?.id || '';
    }
    if (spec.pick === 'firstAlt') {
      const hit = tags.find((t) => String(t.type || '').toUpperCase() === 'ALT');
      return hit?.id || spec.tagId || '';
    }
    if (spec.pick === 'firstNumeric' || !spec.pick) {
      const hit = tags.find((t) => types.includes(String(t.type || '').toUpperCase()));
      return hit?.id || '';
    }
    return tags[0]?.id || '';
  }

  async function ensureDefaultMotorTags() {
    if (typeof d().ensureMotorTags === 'function') {
      return d().ensureMotorTags();
    }
    return '';
  }

  async function ensureDefaultPidTag() {
    const existing = tagList().find((t) => t.type === 'PID');
    if (existing) return existing.id;
    if (typeof d().ensurePidTag === 'function') {
      return d().ensurePidTag();
    }
    return '';
  }

  function isHoaSwitchAssetPath(path) {
    return HmiView.isHoaSwitchAssetPath?.(path) || /switch_hoa_(auto|off|hand)\.svg$/i.test(String(path || ''));
  }

  function compositeBindingElementId(col, row, manifest, bindingDef) {
    const role = String(bindingDef?.elementId || '').trim();
    if (role === 'hoa_switch') return `t${col + 1}_${row + 1}__hoa_switch`;
    const partByRole = manifest.parts.find((p) => p.role === role);
    const part = partByRole || manifest.parts[0];
    const z = part?.z ?? 0;
    const pidFaceplate = isPidFaceplatePath(manifest.preview || manifest.parts?.[0]?.svg || '');
    const motorFaceplate = isMotorFaceplatePath(manifest.preview || manifest.parts?.[0]?.svg || '');
    const tpoFaceplate = HmiView.isTpoFaceplateAssetPath?.(manifest.preview || manifest.parts?.[0]?.svg || '')
      || manifest.id === 'tpo_daily';
    const alternatorFaceplate = isAlternatorFaceplatePath(manifest.preview || manifest.parts?.[0]?.svg || '')
      || manifest.id === 'alternator';
    const faceplateComposite = pidFaceplate || motorFaceplate || tpoFaceplate || alternatorFaceplate;
    if (!partByRole && role && !['dial_face', 'dial_pointer', 'hmi_label'].includes(role)) {
      return layerElementIdFromTile(col, row, z, role);
    }
    if (role === 'dial_face') return firstShapeElementIdForCell(col, row, z);
    if (role === 'dial_pointer') return firstPointerElementIdForCell(col, row, z);
    if (faceplateComposite && role && role !== 'hmi_label') {
      return layerElementIdFromTile(col, row, z, role);
    }
    if (role === 'hmi_label' || (bindingDef?.property === 'text' && !faceplateComposite)) {
      const dialPart = manifest.parts.find((p) => /dialbg|dial-bg|dial_face/i.test(String(p.svg || '')) || p.role === 'dial_face')
        || manifest.parts.find((p) => p.role === 'dial_face');
      const textZ = dialPart?.z ?? 0;
      return elementIdForHmiTextCell(col, row, textZ);
    }
    if (part?.role) return layerElementIdFromTile(col, row, z, part.role);
    return layerElementIdFromTile(col, row, z, role || 'hmi_label');
  }

  function addCompositeDefaultBindings(col, row, manifest) {
    if (!manifest?.defaultBindings?.length) return { added: 0, tagId: '' };
    const screenId = hmiEditScreenId || hmiConfig.activeScreen;
    const other = (hmiConfig.bindings || []).filter((b) => b.screenId !== screenId);
    const rows = (hmiConfig.bindings || []).filter((b) => b.screenId === screenId);
    const tagByRole = new Map();
    let added = 0;
    for (const def of manifest.defaultBindings) {
      const tagRole = def.tagRole || 'pv';
      let tagId = tagByRole.get(tagRole);
      if (!tagId) {
        tagId = pickTagForCompositeRole(manifest, tagRole);
        tagByRole.set(tagRole, tagId);
      }
      const elementId = compositeBindingElementId(col, row, manifest, def);
      const bindingRow = {
        screenId,
        elementId,
        tagId: tagId || '',
        property: def.property,
      };
      if (def.min != null) bindingRow.min = def.min;
      if (def.max != null) bindingRow.max = def.max;
      if (def.format) bindingRow.format = def.format;
      if (def.onValue != null) bindingRow.onValue = def.onValue;
      if (def.offValue != null) bindingRow.offValue = def.offValue;
      if (def.tagField) bindingRow.tagField = def.tagField;
      if (def.samples != null) bindingRow.samples = def.samples;
      if (def.colors) bindingRow.colors = def.colors;
      if (def.flashStates) bindingRow.flashStates = def.flashStates;
      if (def.interaction) bindingRow.interaction = def.interaction;
      const dup = rows.some((b) => b.elementId === bindingRow.elementId
        && b.property === bindingRow.property && b.tagId === bindingRow.tagId);
      if (!dup) {
        rows.push(bindingRow);
        added += 1;
      }
    }
    hmiConfig.bindings = [...other, ...rows];
    return { added, tagId: tagByRole.get('pv') || tagByRole.get('hoa') || tagByRole.get('alt') || '' };
  }

  function d() { return deps; }
  function tagList() { return d().getTags(); }
  function lastLive() { return d().getLastLive(); }
  function lastSettings() { return d().getLastSettings(); }
  function projectName() { return d().getProjectName(); }
  function refreshAll(opts) { return d().refreshAll(opts); }
  function isPopupOpen(name) {
    const el = document.querySelector(`[data-popup="${name}"]`);
    return el && !el.classList.contains('view-hidden');
  }
  function setTabActive(name, on) {
    document.querySelectorAll(`[data-popup-open="${name}"]`).forEach((b) => {
      b.classList.toggle('active', on);
    });
  }

  function isHmiViewActive() {
    return !!document.getElementById('sec-hmi-main');
  }

  function initMainHmi() {
    if (!domGet('hmi-viewport')) return;
    wireHmiRoomPopupOnce();
    syncHmiConfigForSetupOpen();
    const settingsHmi = lastSettings()?.hmi;
    if (settingsHmi?.screens?.length) {
      if (!upgradeHmiFromServerIfRicher(settingsHmi)) {
        applyServerHmiSettingsIfChanged(settingsHmi);
      }
    }
    syncComposerModeFromSettings();
    hmiViewScreenId = startingHmiScreenId();
    renderHmiNavBar();
    syncLiveStatusBarVisibility();
    syncHmiLiveDisplayHint();
    syncHmiTestModeUi();
    loadHmiScreen(true).catch(console.error);
    refreshHmiAlarmSidebar();
  }

  let hmi3dFrameMessagesWired = false;

  function wireHmi3dFrameMessages() {
    if (hmi3dFrameMessagesWired) return;
    hmi3dFrameMessagesWired = true;
    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'peaklogic-hmi-open-area' && data.screenId) {
        const key = `area:${data.screenId}`;
        if (hmiPopupMessageIsDuplicate(key)) return;
        ensureHmiConfigLoaded();
        openHmiAreaPopup(data.screenId, { force: true }).catch(console.error);
      } else if (data.type === 'peaklogic-hmi-open-room' && data.roomNum) {
        const n = Math.trunc(Number(data.roomNum));
        const key = `room:${n}`;
        if (hmiPopupMessageIsDuplicate(key)) return;
        ensureHmiConfigLoaded();
        openHmiRoomPopup(data.roomNum).catch(console.error);
      }
    });
  }

  function wireHmiRoomPopupOnce() {
    wireHmi3dFrameMessages();
    const popup = domGet('hmi-room-popup');
    if (!popup || popup.dataset.hmiRoomWired) return;
    popup.dataset.hmiRoomWired = '1';
    popup.querySelectorAll('[data-hmi-room-close]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        closeHmiRoomPopup();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (hmiRoomPopupNum || hmiAreaPopupScreenId)) closeHmiRoomPopup();
    });
  }

  function syncHmiPollConfigTo3dFrame() {
    const frame = domGet('hmi-live-3d-frame') || document.querySelector('.hmi-live-3d-frame');
    if (!frame?.contentWindow) return;
    const pollMs = hmiPollMsForSettings(lastSettings?.());
    try {
      frame.contentWindow.postMessage({
        type: 'peaklogic-hmi-poll-config',
        pollMs,
        apiBase: window.PEAKLOGIC_API_BASE || '/api',
      }, window.location.origin);
    } catch { /* iframe not ready */ }
    syncHmiScreenCatalogTo3dFrame(frame);
  }

  function syncHmiScreenCatalogTo3dFrame(frameEl) {
    const frame = frameEl || domGet('hmi-live-3d-frame') || document.querySelector('.hmi-live-3d-frame');
    if (!frame?.contentWindow) return;
    ensureHmiConfigLoaded();
    const screens = sortScreensByNumber(hmiConfig.screens || []).map((s) => ({
      id: s.id,
      number: s.number || 0,
      name: String(s.name || '').trim(),
    }));
    try {
      frame.contentWindow.postMessage({ type: 'peaklogic-hmi-screen-catalog', screens }, window.location.origin);
    } catch { /* iframe not ready */ }
  }

  function syncHmiTestModeUi(settings) {
    const st = settings ?? lastSettings?.() ?? {};
    const wrap = domGet('hmi-test-mode-wrap');
    const cb = domGet('hmi-test-mode');
    const hint = domGet('hmi-poll-hint');
    const showToggle = canShowHmiTestModeToggle(st);
    wrap?.classList.toggle('view-hidden', !showToggle);
    if (cb && showToggle && document.activeElement !== cb) {
      cb.checked = isHmiTestModeOn(st);
    }
    if (hint) {
      const sec = Math.round(hmiPollMsForSettings(st) / 1000);
      hint.textContent = isHmiTestModeOn(st) ? `Live refresh ${sec}s (test)` : `Live refresh ${sec}s`;
    }
  }

  async function persistHmiTestMode(nextOn) {
    const st = lastSettings?.() || {};
    if (!canShowHmiTestModeToggle(st)) return;
    const next = {
      ...st,
      hmi: { ...(st.hmi || {}), testMode: nextOn === true },
    };
    try {
      const res = await api.putSettings(next);
      d().patchLastSettings?.(res?.settings || next);
      syncHmiTestModeUi(res?.settings || next);
      d().restartDashboardPoll?.();
      syncHmiPollConfigTo3dFrame();
    } catch (e) {
      console.error(e);
      syncHmiTestModeUi(st);
    }
  }

  function isHmiSetupOpen() {
    const chrome = hmiSetupChrome();
    return !!(chrome && !chrome.classList.contains('view-hidden'));
  }

  const HMI_SETUP_LAYOUT_KEY = 'peaklogic-hmi-setup-layout';
  const HMI_SETUP_POS_KEY = 'peaklogic-hmi-setup-pos';
  const HMI_SETUP_MIN_W = 320;
  const HMI_SETUP_MIN_H = 240;
  const HMI_SETUP_WIDE_W = 640;
  const HMI_SETUP_DEFAULT_W = 920;
  const HMI_COMPOSER_COL_MIN = 260;
  const HMI_COMPOSER_COL_MAX = 720;
  const HMI_COMPOSER_COL_DEFAULT = 384;

  function clampHmiComposerColWidth(px, chrome) {
    const shell = chrome || hmiSetupChrome();
    const previewMin = 280;
    const maxFromWindow = shell
      ? Math.max(HMI_COMPOSER_COL_MIN, shell.offsetWidth - previewMin - 12)
      : HMI_COMPOSER_COL_MAX;
    const max = Math.min(HMI_COMPOSER_COL_MAX, maxFromWindow);
    return Math.round(Math.max(HMI_COMPOSER_COL_MIN, Math.min(max, px)));
  }

  function applyHmiComposerColWidth(px, chrome) {
    const el = chrome || hmiSetupChrome();
    if (!el) return HMI_COMPOSER_COL_DEFAULT;
    const w = clampHmiComposerColWidth(px, el);
    el.style.setProperty('--hmi-composer-col-w', `${w}px`);
    return w;
  }

  function readHmiComposerColWidth(layout) {
    const n = Number(layout?.composerColWidth);
    if (Number.isFinite(n) && n >= HMI_COMPOSER_COL_MIN) return n;
    return HMI_COMPOSER_COL_DEFAULT;
  }

  function currentHmiComposerColWidth(chrome) {
    const el = chrome || hmiSetupChrome();
    if (!el) return HMI_COMPOSER_COL_DEFAULT;
    const raw = el.style.getPropertyValue('--hmi-composer-col-w').trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= HMI_COMPOSER_COL_MIN) return n;
    return HMI_COMPOSER_COL_DEFAULT;
  }

  function hmiSetupChrome() {
    return document.getElementById('hmi-setup-chrome')
      || document.querySelector('[data-popup="hmi-setup"] .popup-chrome');
  }

  function hmiSetupShell() {
    return document.querySelector('[data-popup="hmi-setup"]');
  }

  /** Fullscreen overlay blocked clicks; panel chrome lives on document.body. */
  function mountHmiSetupPanelToBody() {
    const chrome = hmiSetupChrome();
    if (!chrome || chrome.dataset.mvFloater === '1') return;
    document.body.appendChild(chrome);
    chrome.dataset.mvFloater = '1';
    const shell = hmiSetupShell();
    if (shell) {
      shell.classList.add('view-hidden', 'hmi-setup-shell-stub');
    }
  }

  function isPlausibleHmiSetupLayout(layout) {
    if (!layout || typeof layout !== 'object') return false;
    const w = Number(layout.width);
    const h = Number(layout.height);
    const left = Number(layout.left);
    const top = Number(layout.top);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < HMI_SETUP_MIN_W || h < HMI_SETUP_MIN_H) {
      return false;
    }
    if (!Number.isFinite(left) || !Number.isFinite(top)) return false;
    if (left <= 24 && w >= 280) return false;
    if (left + w < 80) return false;
    if (top < 40 || top > window.innerHeight - 80) return false;
    return true;
  }

  function readHmiSetupLayout() {
    try {
      const raw = sessionStorage.getItem(HMI_SETUP_LAYOUT_KEY);
      if (raw) {
        const layout = JSON.parse(raw);
        if (isPlausibleHmiSetupLayout(layout)) return layout;
        sessionStorage.removeItem(HMI_SETUP_LAYOUT_KEY);
      }
    } catch { /* ignore */ }
    try {
      const legacy = sessionStorage.getItem(HMI_SETUP_POS_KEY);
      if (legacy) {
        const pos = JSON.parse(legacy);
        if (isPlausibleHmiSetupLayout(pos)) return pos;
        sessionStorage.removeItem(HMI_SETUP_POS_KEY);
      }
    } catch { /* ignore */ }
    return null;
  }

  function clampHmiSetupSize(width, height) {
    return {
      width: Math.max(HMI_SETUP_MIN_W, Math.min(window.innerWidth - 16, width)),
      height: Math.max(HMI_SETUP_MIN_H, Math.min(window.innerHeight - 48, height)),
    };
  }

  function clampHmiSetupPos(left, top, width, height) {
    const w = width ?? hmiSetupChrome()?.offsetWidth ?? HMI_SETUP_DEFAULT_W;
    const h = height ?? hmiSetupChrome()?.offsetHeight ?? 400;
    return {
      left: Math.max(8, Math.min(window.innerWidth - w - 8, left)),
      top: Math.max(48, Math.min(window.innerHeight - h - 8, top)),
    };
  }

  function applyHmiSetupLayout(layout) {
    const chrome = hmiSetupChrome();
    if (!chrome || !layout) return;
    chrome.style.position = 'fixed';
    chrome.style.display = 'flex';
    chrome.style.flexDirection = 'column';
    chrome.style.margin = '0';
    chrome.style.right = 'auto';
    chrome.style.bottom = 'auto';
    chrome.style.zIndex = '221';
    let width = Number.isFinite(layout.width) ? layout.width : chrome.offsetWidth || HMI_SETUP_DEFAULT_W;
    let height = Number.isFinite(layout.height) ? layout.height : 0;
    const size = clampHmiSetupSize(width, height || Math.min(680, window.innerHeight - 80));
    width = size.width;
    height = size.height;
    chrome.style.width = `${width}px`;
    chrome.style.height = `${height}px`;
    chrome.classList.add('hmi-setup-sized');
    chrome.classList.toggle('hmi-setup-wide', width >= HMI_SETUP_WIDE_W);
    applyHmiComposerColWidth(readHmiComposerColWidth(layout), chrome);
    let left = Number.isFinite(layout.left) ? layout.left : window.innerWidth - width - 12;
    let top = Number.isFinite(layout.top) ? layout.top : 64;
    const pos = clampHmiSetupPos(left, top, width, height);
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
  }

  function currentHmiSetupLayout() {
    const chrome = hmiSetupChrome();
    if (!chrome) return null;
    const rect = chrome.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      composerColWidth: currentHmiComposerColWidth(chrome),
    };
  }

  function saveHmiSetupLayout() {
    const layout = currentHmiSetupLayout();
    if (!layout) return;
    sessionStorage.setItem(HMI_SETUP_LAYOUT_KEY, JSON.stringify(layout));
  }

  function positionHmiSetupPopup(restoreSaved) {
    const chrome = hmiSetupChrome();
    if (!chrome) return;
    if (restoreSaved) {
      const saved = readHmiSetupLayout();
      if (saved) {
        applyHmiSetupLayout(saved);
        return;
      }
    }
    const margin = 12;
    applyHmiSetupLayout({
      left: window.innerWidth - HMI_SETUP_DEFAULT_W - margin,
      top: margin + 52,
      width: Math.min(HMI_SETUP_DEFAULT_W, Math.round(window.innerWidth - 24)),
      height: Math.min(780, window.innerHeight - 64),
    });
  }

  let hmiPanelDrag = null;
  let hmiPanelResize = null;
  let hmiComposerColSplit = null;

  function hmiPointerXY(e) {
    if (e.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function isPrimaryButton(e) {
    if (e.type.startsWith('touch')) return true;
    return e.button === 0;
  }

  function hmiPanelDragMove(e) {
    if (!hmiPanelDrag) return;
    const chrome = hmiSetupChrome();
    if (!chrome) return;
    const { x, y } = hmiPointerXY(e);
    const pos = clampHmiSetupPos(
      hmiPanelDrag.ox + (x - hmiPanelDrag.sx),
      hmiPanelDrag.oy + (y - hmiPanelDrag.sy),
      hmiPanelDrag.width,
      hmiPanelDrag.height
    );
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
    chrome.style.right = 'auto';
    if (e.cancelable) e.preventDefault();
  }

  function hmiPanelDragEnd() {
    if (!hmiPanelDrag) return;
    const chrome = hmiSetupChrome();
    hmiPanelDrag = null;
    chrome?.querySelector('[data-hmi-drag-handle]')?.classList.remove('hmi-dragging');
    chrome?.querySelector('.popup-header')?.classList.remove('popup-dragging');
    document.removeEventListener('mousemove', hmiPanelDragMove, true);
    document.removeEventListener('mouseup', hmiPanelDragEnd, true);
    document.removeEventListener('touchmove', hmiPanelDragMove, { capture: true });
    document.removeEventListener('touchend', hmiPanelDragEnd, true);
    document.removeEventListener('touchcancel', hmiPanelDragEnd, true);
    saveHmiSetupLayout();
  }

  function onPanelDragStart(e) {
    const chrome = hmiSetupChrome();
    if (!chrome || hmiPanelDrag || hmiPanelResize) return false;
    if (!isPrimaryButton(e)) return false;
    window.MvWindowStack?.bringToFront(chrome);
    if (e.target?.closest?.('button, a, input, select, textarea, label')) return false;
    const rect = chrome.getBoundingClientRect();
    applyHmiSetupLayout({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height || Math.min(680, window.innerHeight - 80),
    });
    const { x, y } = hmiPointerXY(e);
    hmiPanelDrag = {
      sx: x,
      sy: y,
      ox: rect.left,
      oy: rect.top,
      width: rect.width,
      height: rect.height,
    };
    chrome.querySelector('[data-hmi-drag-handle]')?.classList.add('hmi-dragging');
    chrome.querySelector('.popup-header')?.classList.add('popup-dragging');
    document.addEventListener('mousemove', hmiPanelDragMove, true);
    document.addEventListener('mouseup', hmiPanelDragEnd, true);
    document.addEventListener('touchmove', hmiPanelDragMove, { capture: true, passive: false });
    document.addEventListener('touchend', hmiPanelDragEnd, true);
    document.addEventListener('touchcancel', hmiPanelDragEnd, true);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function hmiPanelResizeMove(e) {
    if (!hmiPanelResize) return;
    const chrome = hmiSetupChrome();
    if (!chrome) return;
    const { x, y } = hmiPointerXY(e);
    const dx = x - hmiPanelResize.sx;
    const dy = y - hmiPanelResize.sy;
    const dir = hmiPanelResize.dir;
    let width = hmiPanelResize.width;
    let height = hmiPanelResize.height;
    let left = hmiPanelResize.left;
    const top = hmiPanelResize.top;
    if (dir.includes('e')) width = hmiPanelResize.width + dx;
    if (dir.includes('w')) width = hmiPanelResize.width - dx;
    if (dir.includes('s')) height = hmiPanelResize.height + dy;
    const size = clampHmiSetupSize(width, height);
    if (dir.includes('w')) left = hmiPanelResize.left + (hmiPanelResize.width - size.width);
    const pos = clampHmiSetupPos(left, top, size.width, size.height);
    chrome.style.width = `${size.width}px`;
    chrome.style.height = `${size.height}px`;
    chrome.style.left = `${pos.left}px`;
    chrome.style.top = `${pos.top}px`;
    chrome.style.right = 'auto';
    chrome.classList.add('hmi-setup-sized');
    chrome.classList.toggle('hmi-setup-wide', size.width >= HMI_SETUP_WIDE_W);
    applyHmiComposerColWidth(currentHmiComposerColWidth(chrome), chrome);
    if (e.cancelable) e.preventDefault();
  }

  function hmiPanelResizeEnd() {
    if (!hmiPanelResize) return;
    const chrome = hmiSetupChrome();
    hmiPanelResize = null;
    chrome?.classList.remove('popup-resizing');
    document.removeEventListener('mousemove', hmiPanelResizeMove, true);
    document.removeEventListener('mouseup', hmiPanelResizeEnd, true);
    document.removeEventListener('touchmove', hmiPanelResizeMove, { capture: true });
    document.removeEventListener('touchend', hmiPanelResizeEnd, true);
    document.removeEventListener('touchcancel', hmiPanelResizeEnd, true);
    saveHmiSetupLayout();
    scheduleHmiPreview();
  }

  function bindHmiComposerColSplitter() {
    const splitter = document.getElementById('hmi-composer-col-splitter');
    if (!splitter || splitter.dataset.bound === '1') return;
    splitter.dataset.bound = '1';
    splitter.addEventListener('mousedown', onComposerColSplitStart);
    splitter.addEventListener('touchstart', onComposerColSplitStart, { passive: false });
  }

  function composerColSplitMove(e) {
    if (!hmiComposerColSplit) return;
    const { x } = hmiPointerXY(e);
    applyHmiComposerColWidth(hmiComposerColSplit.startW + (x - hmiComposerColSplit.sx));
    if (e.cancelable) e.preventDefault();
  }

  function composerColSplitEnd() {
    if (!hmiComposerColSplit) return;
    hmiComposerColSplit = null;
    document.getElementById('hmi-composer-col-splitter')?.classList.remove('dragging');
    document.body.classList.remove('hmi-composer-col-split-active');
    document.removeEventListener('mousemove', composerColSplitMove, true);
    document.removeEventListener('mouseup', composerColSplitEnd, true);
    document.removeEventListener('touchmove', composerColSplitMove, { capture: true });
    document.removeEventListener('touchend', composerColSplitEnd, true);
    document.removeEventListener('touchcancel', composerColSplitEnd, true);
    saveHmiSetupLayout();
  }

  function onComposerColSplitStart(e) {
    const chrome = hmiSetupChrome();
    if (!chrome?.classList.contains('hmi-setup-wide')) return false;
    if (!isPrimaryButton(e)) return false;
    if (hmiPanelDrag || hmiPanelResize || hmiComposerColSplit) return false;
    const editor = chrome.querySelector('.hmi-setup-editor');
    const startW = editor?.getBoundingClientRect().width || currentHmiComposerColWidth(chrome);
    const { x } = hmiPointerXY(e);
    hmiComposerColSplit = { sx: x, startW };
    document.getElementById('hmi-composer-col-splitter')?.classList.add('dragging');
    document.body.classList.add('hmi-composer-col-split-active');
    document.addEventListener('mousemove', composerColSplitMove, true);
    document.addEventListener('mouseup', composerColSplitEnd, true);
    document.addEventListener('touchmove', composerColSplitMove, { capture: true, passive: false });
    document.addEventListener('touchend', composerColSplitEnd, true);
    document.addEventListener('touchcancel', composerColSplitEnd, true);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function onPanelResizeStart(e, handleEl) {
    const chrome = hmiSetupChrome();
    const handle = handleEl || e.currentTarget;
    if (!chrome || !handle?.dataset?.resize || hmiPanelDrag || hmiPanelResize) return false;
    if (!isPrimaryButton(e)) return false;
    window.MvWindowStack?.bringToFront(chrome);
    const rect = chrome.getBoundingClientRect();
    applyHmiSetupLayout({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height || Math.min(680, window.innerHeight - 80),
    });
    const { x, y } = hmiPointerXY(e);
    hmiPanelResize = {
      dir: handle.dataset.resize || 'se',
      sx: x,
      sy: y,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    chrome.classList.add('popup-resizing');
    document.addEventListener('mousemove', hmiPanelResizeMove, true);
    document.addEventListener('mouseup', hmiPanelResizeEnd, true);
    document.addEventListener('touchmove', hmiPanelResizeMove, { capture: true, passive: false });
    document.addEventListener('touchend', hmiPanelResizeEnd, true);
    document.addEventListener('touchcancel', hmiPanelResizeEnd, true);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    return false;
  }

  async function importHmiGraphicFile(file) {
    if (!file) return;
    const name = String(file.name || '').trim();
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (!['svg', 'png', 'gif', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      alert('Use SVG, PNG, GIF, JPG, or WEBP.');
      return;
    }
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = String(r.result || '');
        const i = dataUrl.indexOf(',');
        resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
      };
      r.onerror = () => reject(r.error || new Error('Read failed'));
      r.readAsDataURL(file);
    });
    const res = await api.importHmiGraphic(name, b64);
    await loadHmiAssets(true);
    fillHmiAssetGroupSelect();
    fillHmiAssetSubgroupSelect();
    const groupSel = domGet('hmi-asset-group');
    if (groupSel) groupSel.value = 'User imports';
    fillHmiAssetSubgroupSelect();
    onHmiAssetFilterChange();
    if (res?.path) selectHmiAsset(res.path);
    showHmiSetupMsg(`Imported ${name} — drag onto grid as Static image (Z0, set span for overlay).`, false);
  }

  function bindHmiImportGraphic() {
    const input = domGet('hmi-import-file');
    const btn = domGet('btn-hmi-import-graphic');
    btn?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      importHmiGraphicFile(file).catch((e) => {
        showHmiSetupMsg(e.message || 'Import failed', true);
        alert(e.message || 'Import failed');
      });
    });
  }

  function bindHmiSetupPanel() {
    mountHmiSetupPanelToBody();
  }

  function clampHmiSetupOnResize() {
    if (!isHmiSetupOpen()) return;
    const layout = currentHmiSetupLayout();
    if (!layout) return;
    applyHmiSetupLayout(layout);
  }

  function screenIdFromNumber(n) {
    return `screen_${Math.max(1, Math.min(MAX_HMI_SCREENS, Number(n) || 1))}`;
  }

  function padRoomNum(n) {
    return String(Math.trunc(Number(n) || 0)).padStart(3, '0');
  }

  function roomTagPrefix(roomNum) {
    return `RM${padRoomNum(roomNum)}`;
  }

  function floorOfRoom(roomNum) {
    const n = Math.trunc(Number(roomNum) || 1);
    if (n >= 100) return Math.floor(n / 100);
    return 1;
  }

  function floorPlanScreenForRoom(roomNum) {
    const fl = floorOfRoom(roomNum);
    if (fl === 1) return 'screen_2';
    if (fl === 2) return 'screen_3';
    if (fl === 3) return 'screen_4';
    return '';
  }

  function hmiRoomPopupDomReady() {
    return !!(domGet('hmi-room-popup') && domGet('hmi-room-popup-main') && domGet('hmi-room-popup-condenser'));
  }

  function showHmiLiveNotice(msg, isWarn = false) {
    const hint = document.querySelector('.hmi-display-hint');
    if (!hint || !msg) return;
    hint.innerHTML = isWarn
      ? `<span class="inline-msg err">${esc(msg)}</span>`
      : esc(msg);
  }

  function roomPopupConfig() {
    const layout = hmiConfig?.layout || lastSettings()?.hmi?.layout || {};
    const src = layout.roomPopup && typeof layout.roomPopup === 'object' ? layout.roomPopup : {};
    return {
      enabled: src.enabled !== false,
      roomSvg: String(src.roomSvg || '/hmi/svg/demos/assisted-living/room_interior.svg').trim(),
      condenserSvg: String(src.condenserSvg || '/hmi/svg/demos/assisted-living/condenser_side.svg').trim(),
    };
  }

  const DEFAULT_AREA_POPUP_SCREENS = ['screen_5', 'screen_6', 'screen_7'];

  function areaPopupScreenIds() {
    const raw = hmiConfig?.layout?.areaPopupScreens ?? lastSettings()?.hmi?.layout?.areaPopupScreens;
    const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_AREA_POPUP_SCREENS;
    return new Set(list.map((id) => String(id || '').trim()).filter(Boolean));
  }

  function shouldOpenAreaPopup(screenId) {
    const sid = String(screenId || '').trim();
    return !!sid && areaPopupScreenIds().has(sid);
  }

  function roomPopupMainBindings(roomNum) {
    const p = roomTagPrefix(roomNum);
    return [
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'val_liv_temp', tagId: `${p}_LIV_TEMP`, property: 'text', format: 'fixed1' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'val_bed_temp', tagId: `${p}_BED_TEMP`, property: 'text', format: 'fixed1' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_bath_mid', tagId: `${p}_BATH_MID_LEAK`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_toilet', tagId: `${p}_TOILET_LEAK`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_stove_on', tagId: `${p}_STOVE_ON`, property: 'fill', onValue: '#f97316', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_stove_excess', tagId: `${p}_STOVE_EXCESS`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_ac_pan', tagId: `${p}_AC_PAN_LEAK`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_ac_blower', tagId: `${p}_AC_BLOWER_FLT`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_room_alm', tagId: `${p}_ALM`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
    ];
  }

  function roomPopupCondenserBindings(roomNum) {
    const fl = floorOfRoom(roomNum);
    return [
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_cond_fan', tagId: `FL${fl}_COND_FAN_FLT`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_cond_comp', tagId: `FL${fl}_COND_COMP_FLT`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'val_cond_hi', tagId: `FL${fl}_COND_HI_TEMP`, property: 'text', format: 'fixed1' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'val_cond_lo', tagId: `FL${fl}_COND_LO_TEMP`, property: 'text', format: 'fixed1' },
      { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'lamp_cond_alm', tagId: `FL${fl}_COND_ALM`, property: 'fill', onValue: '#ef4444', offValue: '#64748b' },
    ];
  }

  function roomPopupFlashBinding(roomNum) {
    const p = roomTagPrefix(roomNum);
    return { screenId: ROOM_POPUP_SCREEN_ID, elementId: 'hmi-room-popup-flash', tagId: `${p}_ALM`, property: 'flashState', onValue: 'red', offValue: 'hidden' };
  }

  let hmiRoomPopupNum = null;
  let hmiAreaPopupScreenId = null;
  let hmiAreaPopupGrid = null;
  let hmiRoomPopupToken = 0;
  let hmiPopupMsgKey = '';
  let hmiPopupMsgAt = 0;

  /** Debounce duplicate postMessage open events (e.g. double-click), not the open call itself. */
  function hmiPopupMessageIsDuplicate(key) {
    const now = Date.now();
    if (key === hmiPopupMsgKey && now - hmiPopupMsgAt < 400) return true;
    hmiPopupMsgKey = key;
    hmiPopupMsgAt = now;
    return false;
  }

  function closeHmiRoomPopup() {
    const popup = domGet('hmi-room-popup');
    const condenser = domGet('hmi-room-popup-condenser');
    if (!popup) return;
    hmiRoomPopupToken += 1;
    hmiRoomPopupNum = null;
    hmiAreaPopupScreenId = null;
    hmiAreaPopupGrid = null;
    hmiPopupMsgKey = '';
    hmiPopupMsgAt = 0;
    popup.classList.add('view-hidden');
    popup.classList.remove('hmi-area-popup-mode');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hmi-room-popup-open');
    condenser?.classList.remove('view-hidden');
    renderHmiNavBar();
  }

  function refreshHmiAreaPopupBindings() {
    if (!hmiAreaPopupScreenId || !hmiAreaPopupGrid) return;
    const sid = hmiAreaPopupScreenId;
    const bindings = (hmiConfig.bindings || []).filter((b) => b.screenId === sid);
    const liveMap = HmiView.liveMapFromList(lastLive());
    HmiView.applyBindings(hmiAreaPopupGrid, bindings, liveMap);
    HmiView.applyAlarmListLayers?.(hmiAreaPopupGrid, lastLive(), tagList(), {
      onAck: (tagId) => {
        api.ackAlarm(tagId)
          .then((res) => {
            applyAckLiveResponse(res);
            return d().refreshAll?.({ force: true });
          })
          .catch((err) => console.error(err));
      },
    });
    const flash = domGet('hmi-room-popup-flash');
    const flashB = bindings.find((b) => b.property === 'flashState');
    if (flash && flashB) {
      HmiView.applyBinding(flash, flashB, liveMap);
    } else if (flash) {
      flash.className = 'hmi-room-popup-flash hmi-flash-overlay hmi-flash-overlay--red view-hidden';
    }
    const screen = hmiConfig.screens?.find((s) => s.id === sid);
    const title = domGet('hmi-room-popup-title');
    if (title && screen) title.textContent = screenLabel(screen);
  }

  async function openHmiAreaPopup(screenId, opts = {}) {
    ensureHmiConfigLoaded();
    const sid = String(screenId || '').trim();
    if (!sid) return;
    const screen = hmiConfig.screens?.find((s) => s.id === sid);
    const popup = domGet('hmi-room-popup');
    const main = domGet('hmi-room-popup-main');
    const condenser = domGet('hmi-room-popup-condenser');
    if (!screen) {
      console.warn('[HMI] Area popup: screen not found:', sid);
      if (!popup || !main || !condenser) {
        showHmiLiveNotice(
          `HMI screen ${sid} is not loaded — use Project → Open → assisted-living, then click the zone again.`,
          true,
        );
        return;
      }
      hmiRoomPopupNum = null;
      hmiAreaPopupScreenId = sid;
      hmiAreaPopupGrid = null;
      popup.classList.remove('view-hidden');
      popup.classList.add('hmi-area-popup-mode');
      popup.setAttribute('aria-hidden', 'false');
      document.body.classList.add('hmi-room-popup-open');
      condenser.classList.add('view-hidden');
      condenser.innerHTML = '';
      const title = domGet('hmi-room-popup-title');
      if (title) title.textContent = `Screen ${sid}`;
      main.innerHTML = `<p class="muted">Screen <strong>${esc(sid)}</strong> is not in this project. Re-open <em>assisted-living</em> from Project setup (Project → Open) after running <code>npm run seed:bundled-projects</code>.</p>`;
      renderHmiNavBar();
      return;
    }
    const forcePopup = opts.force === true || getComposerMode() === '3d';
    if (!shouldOpenAreaPopup(sid) && !forcePopup) {
      navigateHmiView(sid);
      return;
    }
    if (!popup || !main || !condenser) {
      navigateHmiView(sid);
      showHmiLiveNotice(
        `Area popup panel missing — redeploy views/scada-dashboard.ejs, restart peaklogic-saas, hard-refresh.`,
        true,
      );
      return;
    }
    if (hmiAreaPopupScreenId === sid && !popup.classList.contains('view-hidden') && main.querySelector('.hmi-tile-grid')) {
      refreshHmiAreaPopupBindings();
      return;
    }
    const flash = domGet('hmi-room-popup-flash');
    hmiRoomPopupNum = null;
    hmiAreaPopupScreenId = sid;
    hmiAreaPopupGrid = null;
    popup.classList.remove('view-hidden');
    popup.classList.add('hmi-area-popup-mode');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hmi-room-popup-open');
    condenser.classList.add('view-hidden');
    condenser.innerHTML = '';
    if (flash) {
      flash.className = 'hmi-room-popup-flash hmi-flash-overlay hmi-flash-overlay--red view-hidden';
    }
    const title = domGet('hmi-room-popup-title');
    if (title) title.textContent = screenLabel(screen);
    renderHmiNavBar();
    const token = ++hmiRoomPopupToken;
    main.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const { grid } = await HmiView.loadTileGridInto(main, screen, {
        editable: false,
        showGridChrome: false,
        onNavigate: navigateHmiView,
        onPageHotspotNavigate: navigateHmiPageHotspot,
        onOpenRoom: openHmiRoomPopup,
        swap: false,
      });
      if (token !== hmiRoomPopupToken) return;
      hmiAreaPopupGrid = grid;
      refreshHmiAreaPopupBindings();
      renderHmiNavBar();
    } catch (e) {
      if (token !== hmiRoomPopupToken) return;
      main.innerHTML = `<p class="muted">Failed to load: ${esc(e.message)}</p>`;
    }
  }

  function refreshHmiRoomPopupBindings() {
    if (hmiAreaPopupScreenId) {
      refreshHmiAreaPopupBindings();
      return;
    }
    if (!hmiRoomPopupNum) return;
    const main = domGet('hmi-room-popup-main');
    const condenser = domGet('hmi-room-popup-condenser');
    const flash = domGet('hmi-room-popup-flash');
    if (!main || !condenser) return;
    const liveMap = HmiView.liveMapFromList(lastLive());
    const bindings = [
      ...roomPopupMainBindings(hmiRoomPopupNum),
      ...roomPopupCondenserBindings(hmiRoomPopupNum),
    ];
    HmiView.applyBindings(main, bindings, liveMap);
    HmiView.applyBindings(condenser, bindings, liveMap);
    if (flash) {
      HmiView.applyBinding(flash, roomPopupFlashBinding(hmiRoomPopupNum), liveMap);
    }
    const title = domGet('hmi-room-popup-title');
    const floor = floorOfRoom(hmiRoomPopupNum);
    if (title) {
      title.textContent = `Room ${padRoomNum(hmiRoomPopupNum)} · Floor ${floor}`;
    }
    const floorLbl = condenser.querySelector('#lbl_cond_floor');
    if (floorLbl) floorLbl.textContent = `Floor ${floor} shared rooftop unit`;
    const roomTitle = main.querySelector('#lbl_room_title');
    if (roomTitle) roomTitle.textContent = `Room ${padRoomNum(hmiRoomPopupNum)}`;
  }

  async function openHmiRoomPopup(roomNum) {
    ensureHmiConfigLoaded();
    const n = Math.trunc(Number(roomNum));
    if (!Number.isFinite(n) || n < 1) return;
    const cfg = roomPopupConfig();
    if (!cfg.enabled) return;
    const popup = domGet('hmi-room-popup');
    const main = domGet('hmi-room-popup-main');
    if (hmiRoomPopupNum === n && popup && !popup.classList.contains('view-hidden') && main?.querySelector('svg')) {
      refreshHmiRoomPopupBindings();
      return;
    }
    const condenser = domGet('hmi-room-popup-condenser');
    const flash = domGet('hmi-room-popup-flash');
    if (!popup || !main || !condenser) {
      const floorScreen = floorPlanScreenForRoom(n);
      if (floorScreen && hmiConfig.screens?.some((s) => s.id === floorScreen)) {
        navigateHmiView(floorScreen);
      }
      showHmiLiveNotice(
        hmiRoomPopupDomReady()
          ? `Could not open room ${padRoomNum(n)} popup.`
          : `Room popup panel missing on this Studio page — redeploy views/scada-dashboard.ejs (includes #hmi-room-popup), restart peaklogic-saas, hard-refresh.`,
        true,
      );
      return;
    }
    hmiAreaPopupScreenId = null;
    hmiAreaPopupGrid = null;
    popup.classList.remove('hmi-area-popup-mode');
    condenser.classList.remove('view-hidden');
    hmiRoomPopupNum = n;
    popup.classList.remove('view-hidden');
    popup.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hmi-room-popup-open');
    if (flash) {
      flash.className = 'hmi-room-popup-flash hmi-flash-overlay hmi-flash-overlay--red view-hidden';
    }
    const token = ++hmiRoomPopupToken;
    main.innerHTML = '<p class="muted">Loading room…</p>';
    condenser.innerHTML = '<p class="muted">Loading condenser…</p>';
    try {
      await Promise.all([
        HmiView.loadSvgInto(main, cfg.roomSvg, null),
        HmiView.loadSvgInto(condenser, cfg.condenserSvg, null),
      ]);
      if (token !== hmiRoomPopupToken) return;
      refreshHmiRoomPopupBindings();
    } catch (e) {
      if (token !== hmiRoomPopupToken) return;
      main.innerHTML = `<p class="muted">Failed to load room graphic: ${esc(e.message)}</p>`;
      condenser.innerHTML = '';
    }
  }

  function applyAckLiveResponse(res) {
    if (Array.isArray(res?.live)) d().applyLiveFromServer?.(res.live);
  }

  function refreshHmiAlarmSidebar() {
    const sidebar = domGet('hmi-alarm-sidebar');
    if (!sidebar || !isHmiViewActive()) return;
    const rows = HmiView.collectHmiActiveAlarms?.(tagList(), lastLive()) || [];
    const activeCount = rows.filter((r) => !r.acked).length;
    const show = activeCount >= 2;
    sidebar.classList.toggle('view-hidden', !show);
    const body = domGet('hmi-alarm-sidebar-body');
    const countEl = domGet('hmi-alarm-sidebar-count');
    const ackAllBtn = domGet('btn-hmi-alarms-ack-all');
    if (ackAllBtn) ackAllBtn.disabled = activeCount === 0;
    if (!show) {
      if (body) body.innerHTML = '';
      return;
    }
    if (countEl) countEl.textContent = `${activeCount} active`;
    if (!body || !HmiView.renderHmiAlarmListHtml) return;
    body.innerHTML = HmiView.renderHmiAlarmListHtml(rows, { showAcked: false });
    body.querySelectorAll('[data-hmi-alarm-ack]').forEach((btn) => {
      btn.onclick = () => {
        const tagId = btn.dataset.hmiAlarmAck;
        if (!tagId) return;
        api.ackAlarm(tagId)
          .then((res) => {
            applyAckLiveResponse(res);
            return d().refreshAll?.({ force: true });
          })
          .catch((err) => console.error(err));
      };
    });
  }

  function hmiOpenRoomHandlerForRoot(root) {
    if (root?.closest('#hmi-setup-preview') && isHmiSetupOpen()) {
      return (roomNum) => {
        showHmiSetupMsg(`Room ${padRoomNum(roomNum)} hotspot — Alt+click previews nav only; room popup opens on live HMI.`, false);
      };
    }
    return openHmiRoomPopup;
  }

  function remapNavTargetsInScreens(screens, idMap) {
    for (const screen of screens || []) {
      for (const tile of screen.tiles || []) {
        for (const layer of tile.layers || []) {
          if ((layer.kind !== 'navButton' && layer.kind !== 'pageHotspot') || !layer.targetScreenId) continue;
          const mapped = idMap.get(layer.targetScreenId);
          if (mapped) layer.targetScreenId = mapped;
        }
      }
    }
  }

  function copyScreenForReindex(s, number, id) {
    return {
      id,
      number,
      isHome: number === 1,
      name: String(s.name || s.alias || (number === 1 ? 'Home' : `Screen ${number}`)).trim(),
      svg: s.svg,
      tiles: JSON.parse(JSON.stringify(Array.isArray(s.tiles) ? s.tiles : [])),
      gridCols: s.gridCols,
      gridRows: s.gridRows,
      cellWidth: s.cellWidth,
      cellHeight: s.cellHeight,
      gridSize: s.gridSize,
      width: s.width,
      height: s.height,
      displayMaxWidth: s.displayMaxWidth,
      displayMaxHeight: s.displayMaxHeight,
      fit: s.fit,
      scale: s.scale,
      background: s.background,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
      naturalWidth: s.naturalWidth,
      naturalHeight: s.naturalHeight,
    };
  }

  function resolveActiveScreenClient(rawActive, screens, idMap = null) {
    const list = screens || [];
    if (!list.length) return HOME_SCREEN_ID;
    let candidate = String(rawActive || '').trim();
    if (idMap && candidate) {
      candidate = idMap.get(candidate) || candidate;
    }
    if (list.some((s) => s.id === candidate)) return candidate;
    return list[0]?.id || HOME_SCREEN_ID;
  }

  function reindexHmiScreensClient(cfg) {
    const screens = sortScreensByNumber(cfg?.screens || []).filter(Boolean);
    if (!screens.length) return cfg;
    const idMap = new Map();
    const reindexed = screens.map((s, i) => {
      const number = i + 1;
      const id = screenIdFromNumber(number);
      idMap.set(s.id, id);
      return copyScreenForReindex(s, number, id);
    });
    remapNavTargetsInScreens(reindexed, idMap);
    const bindings = (cfg.bindings || []).map((b) => ({
      ...b,
      screenId: idMap.get(b.screenId) || b.screenId,
    }));
    const next = {
      ...cfg,
      screens: reindexed,
      bindings,
      activeScreen: resolveActiveScreenClient(cfg.activeScreen, reindexed, idMap),
    };
    if (next.layout?.areaPopupScreens?.length && idMap.size) {
      next.layout = {
        ...next.layout,
        areaPopupScreens: next.layout.areaPopupScreens
          .map((id) => idMap.get(String(id || '').trim()) || String(id || '').trim())
          .filter(Boolean),
      };
    }
    return next;
  }

  function sortScreensByNumber(screens) {
    return [...(screens || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  }

  function screenLabel(s) {
    if (!s) return '';
    const n = s.number || '';
    const alias = s.name || '';
    if (n === 1) return alias ? `Screen 1 — ${alias}` : 'Screen 1 — Home';
    return alias ? `Screen ${n} — ${alias}` : `Screen ${n}`;
  }

  function homeHmiScreen() {
    return hmiConfig.screens.find((s) => s.id === HOME_SCREEN_ID) || hmiConfig.screens[0] || null;
  }

  function viewedHmiScreen() {
    const id = hmiViewScreenId || HOME_SCREEN_ID;
    return hmiConfig.screens.find((s) => s.id === id) || homeHmiScreen();
  }

  function startingHmiScreenId() {
    const fromSelect = domGet('proj-hmi-home-screen')?.value?.trim();
    const fromCfg = hmiConfig?.activeScreen || lastSettings()?.hmi?.activeScreen;
    const id = fromSelect || fromCfg || HOME_SCREEN_ID;
    const screens = hmiConfig?.screens?.length
      ? hmiConfig.screens
      : (lastSettings()?.hmi?.screens || []);
    return resolveActiveScreenClient(id, screens);
  }

  function startupHmiScreen() {
    const id = startingHmiScreenId();
    return hmiConfig.screens.find((s) => s.id === id) || hmiConfig.screens[0] || homeHmiScreen();
  }

  function currentHmiBindingScreenId() {
    if (isHmiSetupOpen()) return hmiEditScreenId || HOME_SCREEN_ID;
    if (isHmiViewActive()) return hmiViewScreenId || HOME_SCREEN_ID;
    return HOME_SCREEN_ID;
  }

  function updateHomeScreenLabel() {
    const sel = domGet('proj-hmi-home-screen');
    if (!sel) return;
    const screens = sortScreensByNumber(
      hmiConfig.screens?.length
        ? hmiConfig.screens
        : (lastSettings()?.hmi?.screens || [])
    );
    const cur = hmiConfig.activeScreen || lastSettings()?.hmi?.activeScreen || HOME_SCREEN_ID;
    sel.innerHTML = screens.length
      ? screens.map((s) => `<option value="${esc(s.id)}">${esc(screenLabel(s))}</option>`).join('')
      : `<option value="${esc(HOME_SCREEN_ID)}">Screen 1 — Home</option>`;
    sel.value = resolveActiveScreenClient(cur, screens);
  }

  function readStartingScreenFromSetup() {
    const fromSelect = domGet('proj-hmi-home-screen')?.value?.trim();
    if (fromSelect && hmiConfig.screens?.some((s) => s.id === fromSelect)) return fromSelect;
    return resolveActiveScreenClient(hmiConfig.activeScreen, hmiConfig.screens);
  }

  function renderHmiNavBar() {
    const nav = domGet('hmi-nav-bar');
    if (!nav) return;
    const screens = sortScreensByNumber(hmiConfig.screens).filter((s) => !s.navHidden);
    if (screens.length <= 1) {
      if (!nav.classList.contains('view-hidden')) {
        nav.innerHTML = '';
        nav.classList.add('view-hidden');
        delete nav.dataset.hmiNavSig;
      }
      return;
    }
    const cur = hmiAreaPopupScreenId || hmiViewScreenId || HOME_SCREEN_ID;
    const sig = `${cur}|${screens.map((s) => `${s.id}:${s.number}:${s.name || ''}`).join(';')}`;
    if (nav.dataset.hmiNavSig === sig && !nav.classList.contains('view-hidden')) return;
    nav.dataset.hmiNavSig = sig;
    nav.classList.remove('view-hidden');
    nav.innerHTML = screens.map((s) => {
      const active = s.id === cur ? ' active' : '';
      const label = s.number === 1
        ? (s.name ? `1 · ${s.name}` : '1 · Home')
        : `${s.number}${s.name ? ` · ${s.name}` : ''}`;
      return `<button type="button" class="hmi-nav-btn${active}" data-hmi-nav="${esc(s.id)}" title="${esc(screenLabel(s))}">${esc(label)}</button>`;
    }).join('');
  }

  function navigateHmiView(screenId) {
    ensureHmiConfigLoaded();
    const sid = String(screenId || '').trim();
    if (!sid || !hmiConfig.screens.some((s) => s.id === sid)) return;
    if (sid === hmiViewScreenId && !hmiAreaPopupScreenId) {
      const screen = hmiConfig.screens.find((s) => s.id === sid);
      if (composerPreviewUses3d(screen)) {
        const viewport = domGet('hmi-viewport');
        if (viewport?.querySelector('.hmi-live-3d-frame')) return;
      } else if (hmiSvgRoot) return;
    }
    closeHmiRoomPopup();
    hmiViewScreenId = sid;
    hmiLoadedUrl = '';
    renderHmiNavBar();
    loadHmiScreen(true).catch(console.error);
  }

  function navigateHmiPageHotspot(screenId) {
    if (shouldOpenAreaPopup(screenId)) {
      openHmiAreaPopup(screenId).catch(console.error);
      return;
    }
    navigateHmiView(screenId);
  }

  function hmiPageHotspotNavigateHandlerForRoot(root) {
    if (root?.closest('#hmi-setup-preview') && isHmiSetupOpen()) {
      return navigateHmiPreviewEdit;
    }
    return navigateHmiPageHotspot;
  }

  function navButtonLabelForScreen(s) {
    if (!s) return 'Page';
    if (s.number === 1) return String(s.name || 'Home').trim() || 'Home';
    const alias = String(s.name || '').trim();
    return alias ? `${s.number} · ${alias}` : `Screen ${s.number}`;
  }

  function navigateHmiPreviewEdit(screenId) {
    if (!screenId || !hmiConfig.screens.some((s) => s.id === screenId)) return;
    if (screenId === hmiEditScreenId && domGet('hmi-setup-preview')?.querySelector('.hmi-tile-grid')) return;
    hmiEditScreenId = screenId;
    const sel = domGet('hmi-screen-select');
    if (sel) sel.value = screenId;
    syncHmiScreenFieldsFromConfig();
    renderHmiBindingsTable();
    clearHmiTileSelection();
    scheduleHmiPreview(true);
  }

  function syncDisplayLayoutAcrossScreens() {
    if (!hmiConfig?.screens?.length) return;
    readProjectLayoutFromFields();
    applyProjectLayoutToAllScreens(hmiConfig, hmiConfig.layout, { prune: true });
  }

  function removeNavButtonsFromRow(screen, row) {
    if (!screen) return;
    const r = Number(row);
    const tiles = ensureScreenTiles(screen);
    for (let i = tiles.length - 1; i >= 0; i--) {
      const tile = tiles[i];
      if (Number(tile.row) !== r) continue;
      const layers = screenTileLayers(tile);
      const kept = layers.filter((l) => l.kind !== 'navButton');
      if (!kept.length) tiles.splice(i, 1);
      else {
        tile.layers = kept;
        syncTileLegacyFields(tile);
      }
    }
  }

  /** Place one navigation button per screen on the bottom grid row (live HMI + preview). */
  function addPageNavigationButtons(screen) {
    const scr = screen || activeHmiScreen();
    if (!scr) return;
    syncHmiScreenMetaFromFields();
    syncDisplayLayoutAcrossScreens();
    const pages = sortScreensByNumber(hmiConfig.screens);
    if (!pages.length) return;
    let totalPlaced = 0;
    const skipped = [];
    for (const targetScreen of hmiConfig.screens) {
      const g = screenGridSpec(targetScreen);
      if (pages.length > g.cols) {
        alert(`Screen "${targetScreen.name || targetScreen.id}" has ${g.cols} columns but ${pages.length} pages. Add columns in Grid layout or place nav buttons manually.`);
        return;
      }
      const row = Math.max(0, g.rows - 1);
      const navZ = 4;
      removeNavButtonsFromRow(targetScreen, row);
      for (let i = 0; i < pages.length; i++) {
        const s = pages[i];
        const col = i;
        let tile = ensureScreenTiles(targetScreen).find((t) => Number(t.col) === col && Number(t.row) === row);
        if (!tile && !canPlaceTileAt(targetScreen, col, row, 1, 1, null)) {
          skipped.push(`${targetScreen.name || targetScreen.id} col ${col + 1}`);
          continue;
        }
        addScreenTileLayer(targetScreen, col, row, {
          kind: 'navButton',
          z: navZ,
          targetScreenId: s.id,
          label: navButtonLabelForScreen(s),
        });
        tile = ensureScreenTiles(targetScreen).find((t) => Number(t.col) === col && Number(t.row) === row);
        applyTileSpanToConfig(tile, 1, 1);
        totalPlaced += 1;
      }
    }
    if (!totalPlaced) {
      alert('Could not place page buttons on the bottom row — clear those cells or widen the grid.');
      return;
    }
    markHmiDirty();
    hmiPreviewTilesKey = '';
    syncHmiScreenFieldsFromConfig();
    refreshHmiSetupPreview(true).then(() => {
      const row = Math.max(0, (screenGridSpec(scr).rows || 1) - 1);
      let msg = `Page buttons on row ${row + 1} — ${totalPlaced} button(s) across ${hmiConfig.screens.length} screen(s). Display size synced. Apply HMI settings, then test on the live display.`;
      if (skipped.length) msg += ` Skipped occupied cells: ${skipped.join('; ')}.`;
      showHmiSetupMsg(msg, false);
    }).catch(console.error);
    refreshMainTileGrid(true);
  }

  function activeHmiScreen() {
    const id = hmiEditScreenId || hmiConfig.activeScreen;
    return hmiConfig.screens.find((s) => s.id === id) || hmiConfig.screens[0] || null;
  }

  function fillHmiStartupSelect() {
    updateHomeScreenLabel();
  }

  const HMI_DEFAULT_SVG = '/hmi/svg/demos/demo_process.svg';

  function migrateHmiSvgPath(svg) {
    return window.HmiAssetPaths?.migrateHmiSvgPath?.(svg) || String(svg || '').trim();
  }

  function resolveHmiAssetUrl(url) {
    return window.HmiAssetPaths?.resolveHmiAssetUrl?.(url) || migrateHmiSvgPath(url);
  }

  function sanitizeHmiRecentAssets() {
    if (!window.HmiAssetPaths) return;
    loadHmiRecentAssets();
    const kept = [];
    for (const raw of hmiRecentAssetPaths) {
      const resolved = resolveHmiAssetUrl(raw);
      if (resolved.startsWith('@composite/') || window.HmiAssetPaths.isKnownPath(resolved)) {
        if (!kept.includes(resolved)) kept.push(resolved);
      }
    }
    if (kept.length !== hmiRecentAssetPaths.length) {
      hmiRecentAssetPaths = kept;
      saveHmiRecentAssets();
    }
  }

  function ensureScreenTiles(screen) {
    if (!screen) return [];
    if (!Array.isArray(screen.tiles)) screen.tiles = [];
    for (const tile of screen.tiles) syncTileLegacyFields(tile);
    return screen.tiles;
  }

  function textLayerZForTile(tile, hintZ) {
    const hint = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(hintZ) || 0));
    if (!tile) return hint;
    const textLayers = screenTileLayers(tile).filter(
      (l) => l.kind === 'staticText' || l.kind === 'dynamicText'
    );
    if (!textLayers.length) return hint;
    if (textLayers.some((l) => (l.z ?? 0) === hint)) return hint;
    return Math.max(...textLayers.map((l) => l.z ?? 0));
  }

  function elementIdForHmiTextCell(col, row, hintZ) {
    const tile = getScreenTile(activeHmiScreen(), col, row);
    const z = textLayerZForTile(tile, hintZ != null ? hintZ : selectedHmiPlaceZ());
    return elementIdForHmiCell(col, row, z, 'hmi_label');
  }

  function isLabelLikeBindingElement(elementId) {
    if (!elementId) return false;
    if (elementId === 'hmi_label' || /__hmi_label$/i.test(elementId)) return true;
    const suffix = window.HmiView?.parseCellElementId?.(elementId)?.suffix || '';
    return suffix === 'hmi_label' || /label/i.test(suffix);
  }

  function isAnalogPaintBinding(b) {
    const prop = b?.property;
    if (prop !== 'fill' && prop !== 'stroke' && prop !== 'fill5' && prop !== 'fill8') return false;
    const id = String(b?.elementId || '');
    if (!id || id === HMI_GRID_CONTAINER_ID) return true;
    return !isLabelLikeBindingElement(id);
  }

  function layerIdPrefix(col, row, z) {
    const c = Number(col);
    const r = Number(row);
    const layerZ = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    return `t${c + 1}_${r + 1}_z${layerZ}__`;
  }

  function firstShapeElementIdForCell(col, row, z) {
    const pref = layerIdPrefix(col, row, z);
    const root = hmiSetupBindingRoot();
    const cell = setupGridCell(col, row);
    if (cell && HmiView.ensureCellBindingIds) {
      HmiView.ensureCellBindingIds(cell, col, row, z);
      syncHmiElementIdDatalist(hmiSetupBindingRoot()?.closest?.('.hmi-viewport') || domGet('hmi-setup-preview'));
    }
    const prefer = ['button', 'lamp', 'dial_face', 'dial_band', 'dial_outer', '__shape_'];
    if (root) {
      for (const key of prefer) {
        const hit = hmiElementIds.find((id) => id.startsWith(pref) && id.includes(key));
        if (hit && HmiView.findBindingElements(root, hit).length) return hit;
      }
      const hit = hmiElementIds.find((id) => id.startsWith(pref) && /__shape_\d+$/.test(id));
      if (hit && HmiView.findBindingElements(root, hit).length) return hit;
      const imgHit = hmiElementIds.find((id) => id.startsWith(pref) && id.endsWith('__img'));
      if (imgHit && HmiView.findBindingElements(root, imgHit).length) return imgHit;
    }
    for (const suffix of ['lamp', 'dial_face', 'dial_outer', 'img', 'shape_0']) {
      const id = layerElementIdFromTile(col, row, z, suffix);
      if (root && HmiView.findBindingElements(root, id).length) return id;
    }
    return layerElementIdFromTile(col, row, z, 'dial_face');
  }

  function firstPointerElementIdForCell(col, row, z) {
    const pref = layerIdPrefix(col, row, z);
    const root = hmiSetupBindingRoot();
    const cell = setupGridCell(col, row);
    if (cell && HmiView.ensureCellBindingIds) {
      HmiView.ensureCellBindingIds(cell, col, row, z);
      syncHmiElementIdDatalist(hmiSetupBindingRoot()?.closest?.('.hmi-viewport') || domGet('hmi-setup-preview'));
    }
    const prefer = ['dial_pointer'];
    if (root) {
      for (const key of prefer) {
        const hit = hmiElementIds.find((id) => id.startsWith(pref) && id.includes(key));
        if (hit && HmiView.findBindingElements(root, hit).length) return hit;
      }
    }
    const id = layerElementIdFromTile(col, row, z, 'dial_pointer');
    if (root && HmiView.findBindingElements(root, id).length) return id;
    return id;
  }

  function elementIdForHmiCell(col, row, z, suffix = 'hmi_label') {
    const c = Number(col);
    const r = Number(row);
    const layerZ = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const primary = layerElementIdFromTile(c, r, layerZ, suffix);
    const root = hmiSetupBindingRoot();
    if (root && window.HmiView?.bindingElementIdVariants) {
      for (const id of HmiView.bindingElementIdVariants(c, r, layerZ, suffix)) {
        if (HmiView.findBindingElements(root, id).length) return id;
      }
      if (suffix === 'hmi_label' || suffix === 'shape_0') {
        const shapeId = firstShapeElementIdForCell(c, r, layerZ);
        if (HmiView.findBindingElements(root, shapeId).length) return shapeId;
      }
      if (window.HmiView.ensureLayerLabelId) {
        const ensured = HmiView.ensureLayerLabelId(c, r, layerZ);
        if (ensured) return ensured;
      }
    }
    if (hmiElementIds.includes(primary)) return primary;
    return primary;
  }

  function bindingIdSuffix(elementId) {
    const parsed = HmiView.parseCellElementId?.(elementId);
    if (parsed?.suffix) return parsed.suffix;
    const bare = String(elementId || '').trim();
    if (!bare || bare.includes('__')) return 'hmi_label';
    return bare;
  }

  function tryResolveBindingElementId(elementId, property) {
    const root = hmiSetupBindingRoot();
    if (!root || !elementId) return elementId;
    if (HmiView.findBindingElements(root, elementId).length) return elementId;
    const resolved = resolveBindingElementId(elementId);
    if (HmiView.findBindingElements(root, resolved).length) return resolved;
    if (!hmiSelectedTileCell) return elementId;
    if (!shouldRewriteBindingElementForSelectedCell(elementId)) return elementId;
    const { col, row } = hmiSelectedTileCell;
    const z = selectedHmiPlaceZ();
    const flashOverlay = selectedCellFlashOverlayLayer(z);
    const paint = property === 'fill' || property === 'stroke' || property === 'fill5' || property === 'fill8';
    const needle = property === 'rotation';
    const trend = property === 'trend';
    const flashBind = shouldUseFlashOverlayElementId(property, elementId, flashOverlay, { rewriteForSelectedCell: true });
    const candidates = flashBind
      ? [flashOverlayElementIdForCell(col, row, z)]
      : paint
      ? [
        firstShapeElementIdForCell(col, row, z),
        elementIdForHmiCell(col, row, z, bindingIdSuffix(elementId)),
      ]
      : needle
        ? [
          firstPointerElementIdForCell(col, row, z),
          elementIdForHmiCell(col, row, z, 'dial_pointer'),
        ]
        : trend
          ? [
            elementIdForHmiCell(col, row, z, 'trend_pen1'),
            elementIdForHmiCell(col, row, z, bindingIdSuffix(elementId)),
          ]
          : [
            elementIdForHmiTextCell(col, row, z),
            elementIdForHmiCell(col, row, z, bindingIdSuffix(elementId)),
          ];
    for (const id of candidates) {
      if (id && HmiView.findBindingElements(root, id).length) return id;
    }
    return elementId;
  }

  function resolveBindingElementId(elementId) {
    const root = hmiSetupBindingRoot();
    if (!root || !elementId) return elementId;
    if (HmiView.findBindingElements(root, elementId).length) return elementId;
    const suffix = bindingIdSuffix(elementId);
    const labelLike = suffix === 'hmi_label' || /label/i.test(suffix);
    if (hmiSelectedTileCell) {
      const { col, row } = hmiSelectedTileCell;
      const resolved = labelLike
        ? elementIdForHmiTextCell(col, row)
        : elementIdForHmiCell(col, row, selectedHmiPlaceZ(), suffix);
      if (HmiView.findBindingElements(root, resolved).length) return resolved;
    }
    const parsed = HmiView.parseCellElementId?.(elementId);
    if (parsed && parsed.col != null && parsed.row != null) {
      const z = labelLike
        ? textLayerZForTile(getScreenTile(activeHmiScreen(), parsed.col, parsed.row), parsed.z ?? selectedHmiPlaceZ())
        : (parsed.z ?? selectedHmiPlaceZ());
      const resolved = elementIdForHmiCell(parsed.col, parsed.row, z, suffix);
      if (HmiView.findBindingElements(root, resolved).length) return resolved;
    }
    return elementId;
  }

  function formatHmiCellLabel(col, row) {
    return `${Number(col) + 1},${Number(row) + 1}`;
  }

  function bindingIdMatchesSelectedCell(elementId) {
    if (!hmiSelectedTileCell || !elementId) return false;
    const parsed = HmiView.parseCellElementId?.(elementId);
    if (!parsed) return false;
    return parsed.col === hmiSelectedTileCell.col && parsed.row === hmiSelectedTileCell.row;
  }

  /** Bare suffixes (lamp, hmi_label) resolve against the selected cell only. */
  function bindingElementIdIsAmbiguous(elementId) {
    if (!elementId || elementId === HMI_GRID_CONTAINER_ID) return true;
    if (elementId === 'hmi_label') return true;
    const parsed = HmiView.parseCellElementId?.(elementId);
    if (!parsed) return true;
    if (isLabelLikeBindingElement(elementId)) return true;
    return false;
  }

  function shouldRewriteBindingElementForSelectedCell(elementId) {
    if (!hmiSelectedTileCell || !elementId) return false;
    return bindingIdMatchesSelectedCell(elementId) || bindingElementIdIsAmbiguous(elementId);
  }

  function bindingsForCell(col, row, screenId) {
    return bindingsForScreen(screenId)
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => bindingTargetsCell(b, col, row));
  }

  function removeHmiBindingAtScreenIndex(idx) {
    const list = bindingsForScreen();
    const target = list[idx];
    if (!target) return;
    hmiConfig.bindings = hmiConfig.bindings.filter((b) => b !== target);
    markHmiDirty();
    renderHmiBindingsTable();
    renderHmiObjectBindingsPanel();
    scheduleHmiPreview();
  }

  function defaultAnalogTestValueFromRow(tr) {
    const min = Number(tr?.querySelector('[data-hmi-min]')?.value);
    const max = Number(tr?.querySelector('[data-hmi-max]')?.value);
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) ? max : 100;
    return (lo + hi) / 2;
  }

  function bindingTargetsCell(binding, col, row) {
    if (!binding?.elementId) return false;
    if (window.HmiView?.bindingElementTargetsCell) {
      return HmiView.bindingElementTargetsCell(binding.elementId, col, row);
    }
    return false;
  }

  function layerElementIdFromTile(col, row, z, suffix = 'hmi_label') {
    const c = Number(col);
    const r = Number(row);
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    return `t${c + 1}_${r + 1}_z${zN}__${suffix}`;
  }

  function flashOverlayElementIdForCell(col, row, z) {
    const tile = getScreenTile(activeHmiScreen(), col, row);
    const overlay = flashOverlayLayerFromTile(tile, z);
    const layerZ = Math.max(1, Number(overlay?.z ?? z) || 1);
    const tc = tile ? Number(tile.col) : col;
    const tr = tile ? Number(tile.row) : row;
    const id = layerElementIdFromTile(tc, tr, layerZ, 'flash_overlay');
    const root = hmiSetupBindingRoot();
    if (root && HmiView.findBindingElements(root, id).length) return id;
    const pref = layerIdPrefix(tc, tr, layerZ);
    const hit = hmiElementIds.find((eid) => eid.startsWith(pref) && eid.endsWith('__flash_overlay'));
    if (hit && root && HmiView.findBindingElements(root, hit).length) return hit;
    return id;
  }

  function selectedCellFlashOverlayLayer(z) {
    if (!hmiSelectedTileCell) return null;
    const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    return flashOverlayLayerFromTile(tile, z ?? selectedHmiPlaceZ());
  }

  function isFlashOverlayBindingProperty(property) {
    return property === 'visibility' || property === 'flashState';
  }

  function shouldUseFlashOverlayElementId(property, elementId, flashOverlay, opts = {}) {
    if (!flashOverlay) return false;
    if (isFlashOverlayBindingElementId(elementId)) return true;
    if (!isFlashOverlayBindingProperty(property)) {
      return opts.rewriteForSelectedCell && domGet('hmi-place-kind')?.value === 'flashOverlay';
    }
    if (opts.rewriteForSelectedCell) return true;
    if (bindingIdMatchesSelectedCell(elementId)) return true;
    if (bindingElementIdIsAmbiguous(elementId) && domGet('hmi-place-kind')?.value === 'flashOverlay') return true;
    return false;
  }

  function isFlashOverlayBindingElementId(elementId) {
    return /^flash_overlay$/i.test(bindingIdSuffix(elementId));
  }

  function normalizeFlashStateMode(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'amber' || v === 'yellow') return 'amber';
    if (v === 'red') return 'red';
    return 'hidden';
  }

  function hmiFlashStateOptions(sel) {
    const cur = normalizeFlashStateMode(sel);
    const modes = [
      { v: 'hidden', label: 'Not visible' },
      { v: 'red', label: 'Flashing red' },
      { v: 'amber', label: 'Flashing amber' },
    ];
    return modes.map((m) => `<option value="${m.v}" ${m.v === cur ? 'selected' : ''}>${m.label}</option>`).join('');
  }

  function applyFlashOverlayBindingToRow(row) {
    if (!isFlashOverlayBindingElementId(row.elementId)) return;
    if (row.property !== 'flashState' && row.property !== 'visibility') {
      row.property = 'flashState';
    }
    if (row.property === 'flashState') {
      const on = normalizeFlashStateMode(row.onValue);
      row.onValue = on === 'hidden' ? 'red' : on;
      row.offValue = normalizeFlashStateMode(row.offValue || 'hidden');
      row.min = Number.isFinite(Number(row.min)) ? Number(row.min) : 0;
      row.max = Number.isFinite(Number(row.max)) ? Number(row.max) : 2;
      if (row.max - row.min > 2 || row.max > 2) row.max = 2;
    }
  }

  function hmiBindingPropsForElement(elementId) {
    if (isFlashOverlayBindingElementId(elementId)) {
      return ['flashState', 'visibility'];
    }
    return HMI_BINDING_PROPS;
  }

  function migrateZeroBasedBindingElementIds(cfg) {
    if (!cfg?.bindings?.length) return cfg;
    for (const b of cfg.bindings) {
      const id = String(b.elementId || '');
      const m = /^t0_0_z(\d+)__(.+)$/.exec(id);
      if (m) b.elementId = `t1_1_z${m[1]}__${m[2]}`;
    }
    return cfg;
  }

  function migrateBareBindingElementIds(cfg) {
    if (!cfg?.bindings?.length || !cfg?.screens?.length) return cfg;
    for (const b of cfg.bindings) {
      if (b.property !== 'text') continue;
      const sid = b.screenId || HOME_SCREEN_ID;
      const screen = cfg.screens.find((s) => s.id === sid);
      if (!screen) continue;
      const candidates = [];
      for (const tile of screen.tiles || []) {
        for (const layer of screenTileLayers(tile)) {
          if (layer.kind !== 'dynamicText') continue;
          if (layer.tagId && layer.tagId !== b.tagId) continue;
          if (!layer.tagId && candidates.length) continue;
          candidates.push({ col: tile.col, row: tile.row, z: layer.z ?? 0 });
        }
      }
      if (candidates.length === 1) {
        const { col, row, z } = candidates[0];
        b.elementId = layerElementIdFromTile(col, row, z);
        const tile = getScreenTile(screen, col, row);
        const ly = screenTileLayers(tile).find((l) => l.z === z);
        if (ly && !ly.tagId) ly.tagId = b.tagId;
      } else if (b.elementId === 'hmi_label' && candidates.length === 1) {
        const { col, row, z } = candidates[0];
        b.elementId = layerElementIdFromTile(col, row, z);
      }
    }
    return cfg;
  }

  function screenGridSpecFromScreen(screen) {
    if (window.HmiView?.getScreenGrid) return HmiView.getScreenGrid(screen);
    return {
      cols: HMI_GRID_SIZE,
      rows: HMI_GRID_SIZE,
      cellWidth: 128,
      cellHeight: 100,
      width: screen?.width || HMI_DEFAULT_WIDTH,
      height: screen?.height || HMI_DEFAULT_HEIGHT,
    };
  }

  function layoutFromScreen(screen) {
    const g = screenGridSpecFromScreen(screen);
    return {
      gridCols: g.cols,
      gridRows: g.rows,
      cellWidth: g.cellWidth,
      cellHeight: g.cellHeight,
      gridSize: Math.max(g.cols, g.rows),
      width: g.width,
      height: g.height,
      displayMaxWidth: screen?.displayMaxWidth ?? g.width,
      displayMaxHeight: screen?.displayMaxHeight ?? g.height,
      fit: screen?.fit || 'contain',
      showGridChrome: screen?.showGridChrome !== false,
      showLiveStatus: screen?.showLiveStatus !== false,
    };
  }

  function applyProjectLayoutToAllScreens(cfg, layout, opts = {}) {
    if (!layout || !cfg?.screens?.length) return;
    const patch = {
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
      cellWidth: layout.cellWidth,
      cellHeight: layout.cellHeight,
      gridSize: layout.gridSize,
      width: layout.width,
      height: layout.height,
      displayMaxWidth: layout.displayMaxWidth,
      displayMaxHeight: layout.displayMaxHeight,
      fit: layout.fit,
    };
    for (const s of cfg.screens) {
      Object.assign(s, patch);
      if (opts.prune) pruneTilesToGrid(s);
    }
  }

  function mergeRoomPopupLayout(layout) {
    const base = layout && typeof layout === 'object' ? { ...layout } : {};
    const src = base.roomPopup && typeof base.roomPopup === 'object' ? base.roomPopup : {};
    base.roomPopup = {
      enabled: src.enabled !== false,
      roomSvg: String(src.roomSvg || '/hmi/svg/demos/assisted-living/room_interior.svg').trim(),
      condenserSvg: String(src.condenserSvg || '/hmi/svg/demos/assisted-living/condenser_side.svg').trim(),
    };
    return base;
  }

  /** Upgrade legacy per-room pageHotspots (label "Room NNN") to room popup hotspots. */
  function migrateRoomPageHotspotsToPopup(cfg) {
    if (!cfg?.screens?.length) return;
    for (const screen of cfg.screens) {
      for (const tile of screen.tiles || []) {
        for (const layer of tile.layers || []) {
          if (layer.kind !== 'pageHotspot') continue;
          const labelMatch = String(layer.label || '').match(/Room\s+(\d+)/i);
          if (!labelMatch) continue;
          const target = String(layer.targetScreenId || '').trim();
          const targetNum = /^screen_(\d+)$/.exec(target)?.[1];
          if (!targetNum || Number(targetNum) < 7) continue;
          const roomNum = Math.trunc(Number(labelMatch[1]));
          if (!Number.isFinite(roomNum) || roomNum < 1 || roomNum > MAX_HMI_SCREENS) continue;
          layer.kind = 'roomHotspot';
          layer.roomNum = roomNum;
          delete layer.targetScreenId;
        }
      }
    }
  }

  function ensureHmiLayout(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (!Array.isArray(cfg.screens) || !cfg.screens.length) return;
    if (cfg.layout && typeof cfg.layout === 'object') {
      cfg.layout = mergeRoomPopupLayout(cfg.layout);
      applyProjectLayoutToAllScreens(cfg, cfg.layout);
      return;
    }
    const ref = referenceLayoutScreen(cfg.screens) || cfg.screens[0];
    if (!ref) return;
    ensureScreenGridDefaults(ref);
    cfg.layout = layoutFromScreen(ref);
    cfg.layout = mergeRoomPopupLayout(cfg.layout);
    applyProjectLayoutToAllScreens(cfg, cfg.layout);
  }

  const HMI_COMPOSER_MODE_IDS = ['proj-hmi-composer-mode', 'hmi-composer-mode'];
  const HMI_3D_DEFAULT_URL = '/samples/assisted-living-ortho-3d.html';

  function normalizeComposerMode(raw) {
    return String(raw ?? '').trim().toLowerCase() === '3d' ? '3d' : 'grid';
  }

  function hmi3dFrameUrl() {
    const url = String(
      hmiConfig?.layout?.facility3dUrl
      || lastSettings()?.hmi?.layout?.facility3dUrl
      || HMI_3D_DEFAULT_URL,
    ).trim();
    return url || HMI_3D_DEFAULT_URL;
  }

  function hmiLive3dLoadKey() {
    return `3d|${hmi3dFrameUrl()}|display`;
  }

  /** Force iframe load — lazy/hidden iframes stay blank after hard refresh otherwise. */
  function ensureHmi3dFrameLoaded(frameEl) {
    if (!frameEl) return;
    const url = hmi3dFrameUrl();
    const resolved = frameEl.dataset.hmi3dSrc;
    if (resolved !== url || !frameEl.getAttribute('src')) {
      frameEl.dataset.hmi3dSrc = url;
      frameEl.src = url;
    }
  }

  function syncHmiLiveDisplayHint() {
    const hint = document.querySelector('.hmi-display-hint');
    if (!hint) return;
    const screen = viewedHmiScreen();
    if (composerPreviewUses3d(screen)) {
      hint.innerHTML = 'Live 3D facility view — click zones for tag detail. Open <strong>Setup…</strong> for composer settings.';
    } else if (getComposerMode() === '3d' && screen) {
      hint.innerHTML = `Live display — ${esc(screenLabel(screen))}. Area screens use the tile grid; screen 1 shows the 3D overview. Open <strong>Setup…</strong> to edit.`;
    } else {
      hint.innerHTML = 'Live display — composed screen without grid lines. Open <strong>Setup…</strong> to edit on the tile grid.';
    }
  }

  function getComposerMode() {
    return normalizeComposerMode(hmiConfig?.layout?.composerMode);
  }

  function syncComposerModeFields(mode) {
    const m = normalizeComposerMode(mode ?? getComposerMode());
    for (const id of HMI_COMPOSER_MODE_IDS) {
      const el = domGet(id);
      if (el && el.value !== m) el.value = m;
    }
  }

  function composerPreviewUses3d(screen) {
    if (getComposerMode() !== '3d') return false;
    if (!screen) return true;
    return screen.id === 'screen_1' || screen.isHome === true;
  }

  function applyComposerPreviewPanels(screen) {
    const use3d = composerPreviewUses3d(screen);
    const chrome = hmiSetupChrome();
    chrome?.classList.toggle('hmi-preview-showing-3d', use3d);
    const gridPreview = domGet('hmi-setup-preview');
    const preview3d = domGet('hmi-setup-3d-preview');
    const gridWrap = document.querySelector('.hmi-setup-preview-wrap');
    const gridHint = gridWrap?.querySelector(':scope > .panel-hint');
    const headerTitle = gridWrap?.querySelector('.hmi-composer-header .hmi-block-title');
    if (use3d) {
      gridPreview?.classList.add('view-hidden');
      preview3d?.classList.remove('view-hidden');
      ensureHmi3dFrameLoaded(domGet('hmi-setup-3d-frame'));
      if (headerTitle) headerTitle.textContent = '3D facility view';
      if (gridHint) {
        gridHint.textContent = 'Spatial preview with live alarms — click zones for tag detail. Area screens (Pool, Mechanical, …) use the tile grid when selected above.';
      }
    } else {
      gridPreview?.classList.remove('view-hidden');
      preview3d?.classList.add('view-hidden');
      if (headerTitle) headerTitle.textContent = screen ? `${screenLabel(screen)} — screen grid` : 'Screen grid';
      if (gridHint) {
        gridHint.textContent = getComposerMode() === '3d'
          ? 'Tile editor for this screen. Select screen 1 (Facility Overview) for the 3D spatial preview.'
          : 'Grid with row/column labels — for editing only. The live HMI hides grid lines.';
      }
    }
  }

  function applyComposerModeUi(screen) {
    const mode = getComposerMode();
    const chrome = hmiSetupChrome();
    chrome?.classList.toggle('hmi-composer-mode-3d', mode === '3d');
    chrome?.classList.toggle('hmi-composer-mode-grid', mode === 'grid');
    applyComposerPreviewPanels(screen || activeHmiScreen());
    document.querySelectorAll('.hmi-composer-mode-grid-only').forEach((el) => {
      el.classList.toggle('view-hidden', mode === '3d');
    });
  }

  function setComposerMode(mode, opts = {}) {
    ensureHmiConfigLoaded();
    ensureHmiLayout(hmiConfig);
    hmiConfig.layout.composerMode = normalizeComposerMode(mode);
    syncComposerModeFields(hmiConfig.layout.composerMode);
    applyComposerModeUi();
    syncHmiLiveDisplayHint();
    if (!opts.skipDirty) markHmiDirty();
    if (isHmiSetupOpen()) scheduleHmiPreview(true);
  }

  function syncComposerModeFromSettings() {
    const prev = getComposerMode();
    const fromSettings = lastSettings()?.hmi?.layout?.composerMode;
    if (fromSettings != null && hmiConfig?.layout) {
      hmiConfig.layout.composerMode = normalizeComposerMode(fromSettings);
    }
    syncComposerModeFields(getComposerMode());
    applyComposerModeUi();
    syncHmiLiveDisplayHint();
    if (isHmiViewActive() && prev !== getComposerMode()) {
      hmiLoadedUrl = '';
      loadHmiScreen(true).catch(console.error);
    }
  }

  function screenGridSpec(screen) {
    const layout = hmiConfig?.layout;
    if (layout) {
      return {
        cols: layout.gridCols,
        rows: layout.gridRows,
        cellWidth: layout.cellWidth,
        cellHeight: layout.cellHeight,
        width: layout.width,
        height: layout.height,
      };
    }
    return screenGridSpecFromScreen(screen);
  }

  function ensureScreenGridDefaults(screen) {
    if (!screen) return;
    if (hmiConfig?.layout) {
      applyProjectLayoutToAllScreens(hmiConfig, hmiConfig.layout);
      return;
    }
    const g = screenGridSpecFromScreen(screen);
    screen.gridCols = g.cols;
    screen.gridRows = g.rows;
    screen.cellWidth = g.cellWidth;
    screen.cellHeight = g.cellHeight;
    screen.width = g.width;
    screen.height = g.height;
    screen.gridSize = Math.max(g.cols, g.rows);
    if (!Number.isFinite(Number(screen.displayMaxWidth)) || screen.displayMaxWidth < 100) {
      screen.displayMaxWidth = g.width;
    }
    if (!Number.isFinite(Number(screen.displayMaxHeight)) || screen.displayMaxHeight < 100) {
      screen.displayMaxHeight = g.height;
    }
  }

  function selectedTileSpan() {
    return {
      colSpan: Math.max(1, Math.min(HMI_MAX_GRID_COLS, +(domGet('hmi-tile-col-span')?.value) || 1)),
      rowSpan: Math.max(1, Math.min(HMI_MAX_GRID_ROWS, +(domGet('hmi-tile-row-span')?.value) || 1)),
    };
  }

  function canPlaceTileAt(screen, col, row, colSpan, rowSpan, ignoreTile) {
    const g = screenGridSpec(screen);
    const cs = colSpan || 1;
    const rs = rowSpan || 1;
    if (col < 0 || row < 0 || col + cs > g.cols || row + rs > g.rows) return false;
    const tiles = ensureScreenTiles(screen).filter((t) => {
      if (!ignoreTile) return true;
      if (t === ignoreTile) return false;
      return !(Number(t.col) === Number(ignoreTile.col) && Number(t.row) === Number(ignoreTile.row));
    });
    const occ = HmiView.buildTileOccupancy(tiles, g.cols, g.rows);
    for (let dr = 0; dr < rs; dr++) {
      for (let dc = 0; dc < cs; dc++) {
        const key = `${col + dc},${row + dr}`;
        if (occ.anchorMap.has(key) || occ.covered.has(key)) return false;
      }
    }
    return true;
  }

  function applyTileSpanToConfig(tile, colSpan, rowSpan) {
    if (!tile) return;
    if (colSpan > 1) tile.colSpan = colSpan;
    else delete tile.colSpan;
    if (rowSpan > 1) tile.rowSpan = rowSpan;
    else delete tile.rowSpan;
  }

  function applySelectedTileSpanFromFields() {
    if (!hmiSelectedTileCell) return false;
    const scr = activeHmiScreen();
    if (!scr) return false;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    if (!tile) return false;
    const { colSpan, rowSpan } = selectedTileSpan();
    const prevCs = tile.colSpan || 1;
    const prevRs = tile.rowSpan || 1;
    const placeKind = domGet('hmi-place-kind')?.value || '';
    const hotspot = pageHotspotLayerFromTile(tile, selectedHmiPlaceZ());
    const flashOverlay = flashOverlayLayerFromTile(tile, selectedHmiPlaceZ());
    const regionOverlay = hotspot || flashOverlay;
    const editingOverlay = placeKind === 'pageHotspot' || placeKind === 'flashOverlay' || !!regionOverlay;
    const graphicBg = tileHasGraphicBackground(tile);

    if (editingOverlay && graphicBg) {
      if (!regionOverlay) {
        // Span fields configure the overlay region before placement; do not sync to tile span.
        return false;
      }
      const region = pageHotspotRegionFromLayer(regionOverlay, tile);
      if (colSpan === region.colSpan && rowSpan === region.rowSpan) return false;
      const hCol = region.col;
      const hRow = region.row;
      if (!hotspotRegionFitsTile(hCol, hRow, colSpan, rowSpan, tile)) {
        alert('Hotspot span must fit within the background graphic cells.');
        const spanCol = domGet('hmi-tile-col-span');
        const spanRow = domGet('hmi-tile-row-span');
        if (spanCol) spanCol.value = String(region.colSpan);
        if (spanRow) spanRow.value = String(region.rowSpan);
        return false;
      }
      applyPageHotspotRegionToLayer(regionOverlay, hCol, hRow, colSpan, rowSpan);
      tile.layers = screenTileLayers(tile);
      syncTileLegacyFields(tile);
      markHmiDirty();
      hmiPreviewTilesKey = '';
      scheduleHmiPreview(true);
      refreshMainTileGrid(true);
      if (hotspot) refreshPageHotspotCellPreview(tile.col, tile.row).catch(console.error);
      else refreshFlashOverlayCellPreview(tile.col, tile.row).catch(console.error);
      return true;
    }

    const anchorCol = Number(tile.col);
    const anchorRow = Number(tile.row);
    if (colSpan === prevCs && rowSpan === prevRs) return false;
    const g = screenGridSpec(scr);
    if (anchorCol < 0 || anchorRow < 0 || anchorCol + colSpan > g.cols || anchorRow + rowSpan > g.rows) {
      alert(`Span ${colSpan}×${rowSpan} does not fit the grid from this cell.`);
      const spanCol = domGet('hmi-tile-col-span');
      const spanRow = domGet('hmi-tile-row-span');
      if (spanCol) spanCol.value = String(prevCs);
      if (spanRow) spanRow.value = String(prevRs);
      return false;
    }
    if (!canPlaceTileAt(scr, anchorCol, anchorRow, colSpan, rowSpan, tile)) {
      alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
      const spanCol = domGet('hmi-tile-col-span');
      const spanRow = domGet('hmi-tile-row-span');
      if (spanCol) spanCol.value = String(prevCs);
      if (spanRow) spanRow.value = String(prevRs);
      return false;
    }
    applyTileSpanToConfig(tile, colSpan, rowSpan);
    if (editingOverlay && regionOverlay && !graphicBg) {
      applyPageHotspotRegionToLayer(regionOverlay, anchorCol, anchorRow, colSpan, rowSpan);
      tile.layers = screenTileLayers(tile);
      syncTileLegacyFields(tile);
    }
    markHmiDirty();
    hmiPreviewTilesKey = '';
    scheduleHmiPreview(true);
    refreshMainTileGrid(true);
    return true;
  }

  function gridAnchorFromCell(col, row, cell) {
    if (cell?.dataset?.anchorCol != null && cell?.dataset?.anchorRow != null) {
      return { col: +cell.dataset.anchorCol, row: +cell.dataset.anchorRow };
    }
    return { col: Number(col), row: Number(row) };
  }

  function getScreenTile(screen, col, row) {
    const c = Number(col);
    const r = Number(row);
    const direct = ensureScreenTiles(screen).find((t) => Number(t.col) === c && Number(t.row) === r);
    if (direct) return direct;
    const g = screenGridSpec(screen);
    const occ = HmiView.buildTileOccupancy(ensureScreenTiles(screen), g.cols, g.rows);
    const cov = occ.covered.get(`${c},${r}`);
    if (cov) return occ.anchorMap.get(`${cov.col},${cov.row}`) || null;
    return null;
  }

  function screenTileLayers(tile) {
    if (window.HmiView?.tileLayers) return HmiView.tileLayers(tile);
    if (!tile) return [];
    if (Array.isArray(tile.layers) && tile.layers.length) return tile.layers.slice();
    if (tile.svg) {
      const faceplate = isCompositeFaceplatePath(tile.svg);
      return [{
        kind: faceplate ? 'staticImage' : (tile.label ? 'staticText' : 'staticImage'),
        z: 0,
        svg: tile.svg,
        label: faceplate ? '' : (tile.label || ''),
      }];
    }
    return [];
  }

  function syncTileLegacyFields(tile) {
    if (!tile) return;
    let layers = screenTileLayers(tile);
    if (tile.label && !layers.some((l) => l.label)) {
      const target = layers.find((l) => l.kind === 'staticText' || l.kind === 'dynamicText')
        || layers.find((l) => l.z === 0)
        || layers[0];
      if (target && !isCompositeFaceplatePath(target.svg)) {
        target.label = tile.label;
        if (target.kind === 'staticImage') target.kind = 'staticText';
      }
    }
    for (const layer of layers) {
      if (layer.kind === 'navButton' || layer.kind === 'pageHotspot' || layer.kind === 'flashOverlay') continue;
      if (/\/charts-trends\/strip-charts\//i.test(String(layer.svg || ''))
        && !/\/peaklogic\/strip_chart_3pen/i.test(String(layer.svg || ''))
        && /strip_chart/i.test(String(layer.svg || ''))) {
        if (!/\/chart-strip\/strip_chart\.svg$/i.test(String(layer.svg || ''))) {
          layer.svg = HMI_STRIP_CHART;
        }
        if (!layer.stripChart) layer.stripChart = { penCount: 1, chartScale: normalizeChartScaleConfig() };
        else if (!layer.stripChart.chartScale) layer.stripChart.chartScale = normalizeChartScaleConfig();
      }
      if (/\/gauges-meters\/column\//i.test(String(layer.svg || '')) && /gauge_column/i.test(String(layer.svg || ''))) {
        if (!/\/gauge-column\/gauge_column\.svg$/i.test(String(layer.svg || ''))) {
          layer.svg = HMI_GAUGE_COLUMN;
        }
        if (!layer.gaugeColumn) layer.gaugeColumn = { columnCount: 1, chartScale: normalizeChartScaleConfig() };
        else if (!layer.gaugeColumn.chartScale) layer.gaugeColumn.chartScale = normalizeChartScaleConfig();
      }
      if (isPushButtonAssetPath(layer.svg)) {
        if (isLegacyColoredPushButtonAsset(layer.svg)) {
          if (!layer.pushButton) layer.pushButton = normalizePushButtonConfig({}, layer.svg);
          layer.svg = canonicalPushButtonPath(layer.pushButton.shape);
        }
        if (!layer.pushButton) layer.pushButton = normalizePushButtonConfig({}, layer.svg);
        else layer.pushButton = normalizePushButtonConfig(layer.pushButton, layer.svg);
      }
      if (isPilotLightAssetPath(layer.svg)) {
        if (isLegacyPilotLightAsset(layer.svg)) {
          if (!layer.pilotLight) layer.pilotLight = normalizePilotLightConfig({}, layer.svg);
          layer.svg = canonicalPilotLightPath(layer.pilotLight.shape);
        }
        if (!layer.pilotLight) layer.pilotLight = normalizePilotLightConfig({}, layer.svg);
        else layer.pilotLight = normalizePilotLightConfig(layer.pilotLight, layer.svg);
      }
      if (isCompositeFaceplatePath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
        continue;
      }
      if (layer.kind === 'alarmList' || isAlarmListPath(layer.svg)) {
        layer.kind = 'alarmList';
        if (!layer.alarmList) layer.alarmList = { showAcked: true };
        delete layer.label;
        continue;
      }
      if (layer.label && layer.kind === 'staticImage') {
        layer.kind = 'staticText';
      }
    }
    if (layers.some((l) => isPidFaceplatePath(l.svg))) {
      tile.compositeId = tile.compositeId || 'pid_loop_standard';
    } else if (layers.some((l) => isMotorFaceplatePath(l.svg))) {
      tile.compositeId = tile.compositeId || 'motor_hoa';
    } else if (layers.some((l) => isTpoFaceplatePath(l.svg))) {
      tile.compositeId = tile.compositeId || 'tpo_daily';
    } else if (layers.some((l) => isPoolFaceplatePath(l.svg))) {
      const poolLayer = layers.find((l) => isPoolFaceplatePath(l.svg));
      tile.compositeId = tile.compositeId || poolCompositeIdFromPath(poolLayer?.svg);
    } else if (layers.some((l) => isAlternatorFaceplatePath(l.svg))) {
      tile.compositeId = tile.compositeId || 'alternator';
    } else if (layers.some((l) => l.kind === 'alarmList' || isAlarmListPath(l.svg))) {
      tile.compositeId = tile.compositeId || 'alarm_list';
    }
    tile.layers = layers;
    if (layers.length) {
      const firstNonNav = layers.find((l) => l.kind !== 'navButton' && l.kind !== 'pageHotspot' && l.kind !== 'flashOverlay');
      if (firstNonNav?.svg) tile.svg = firstNonNav.svg;
      const textLayer = layers.find((l) => l.kind === 'staticText' || l.kind === 'dynamicText');
      if (textLayer?.label) tile.label = textLayer.label;
      else if (!textLayer?.label && tile.label) { /* keep tile.label */ }
    }
  }

  function flashOverlayLayerFromTile(tile, z) {
    if (!tile) return null;
    const layers = screenTileLayers(tile);
    if (z != null) {
      return layers.find((l) => l.kind === 'flashOverlay' && l.z === z)
        || layers.find((l) => l.kind === 'flashOverlay')
        || null;
    }
    return layers.find((l) => l.kind === 'flashOverlay') || null;
  }

  function upsertFlashOverlayLayer(screen, col, row, color, z, region = {}) {
    const layerZ = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 1));
    const hCol = Number.isFinite(Number(region.hotspotCol)) ? Number(region.hotspotCol) : col;
    const hRow = Number.isFinite(Number(region.hotspotRow)) ? Number(region.hotspotRow) : row;
    const layer = {
      kind: 'flashOverlay',
      z: layerZ,
      color: color === 'amber' ? 'amber' : 'red',
      hotspotCol: hCol,
      hotspotRow: hRow,
    };
    const cs = Math.max(1, Number(region.colSpan) || 1);
    const rs = Math.max(1, Number(region.rowSpan) || 1);
    if (cs > 1) layer.hotspotColSpan = cs;
    if (rs > 1) layer.hotspotRowSpan = rs;
    const cf = cellFractionFromLayer({ cellFraction: region.cellFraction ?? selectedCellFraction() });
    if (cf < 1) layer.cellFraction = cf;
    addScreenTileLayer(screen, col, row, layer);
  }

  function applyFlashOverlayColorToConfig(tile, color, z) {
    if (!tile) return;
    const overlay = flashOverlayLayerFromTile(tile, z);
    if (!overlay) return;
    overlay.color = color === 'amber' ? 'amber' : 'red';
    syncTileLegacyFields(tile);
  }

  function refreshFlashOverlayCellPreview(col, row) {
    const scr = activeHmiScreen();
    const tile = getScreenTile(scr, col, row);
    const overlay = flashOverlayLayerFromTile(tile);
    if (!overlay) return Promise.resolve(false);
    const anchorCol = Number(tile.col);
    const anchorRow = Number(tile.row);
    const tileCs = tile.colSpan || 1;
    const tileRs = tile.rowSpan || 1;
    const cell = setupGridCell(anchorCol, anchorRow);
    const z = Math.max(1, Number(overlay.z) || 1);
    const layerEl = cell?.querySelector(`.hmi-tile-layer[data-kind="flashOverlay"][data-z="${z}"]`)
      || cell?.querySelector('.hmi-tile-layer[data-kind="flashOverlay"]');
    if (layerEl && HmiView.applyPageHotspotLayerBounds) {
      HmiView.applyPageHotspotLayerBounds(layerEl, overlay, anchorCol, anchorRow, tileCs, tileRs);
    }
    const flashEl = cell?.querySelector('.hmi-flash-overlay');
    if (flashEl) {
      flashEl.classList.remove('hmi-flash-overlay--red', 'hmi-flash-overlay--amber');
      flashEl.classList.add(overlay.color === 'amber' ? 'hmi-flash-overlay--amber' : 'hmi-flash-overlay--red');
      return Promise.resolve(true);
    }
    return refreshSetupTileCell(anchorCol, anchorRow, scr);
  }

  function pageHotspotLayerFromTile(tile, z) {
    if (!tile) return null;
    const layers = screenTileLayers(tile);
    if (z != null) {
      return layers.find((l) => l.kind === 'pageHotspot' && l.z === z)
        || layers.find((l) => l.kind === 'pageHotspot')
        || null;
    }
    return layers.find((l) => l.kind === 'pageHotspot') || null;
  }

  function roomHotspotLayerFromTile(tile, z) {
    if (!tile) return null;
    const layers = screenTileLayers(tile);
    if (z != null) {
      return layers.find((l) => l.kind === 'roomHotspot' && l.z === z)
        || layers.find((l) => l.kind === 'roomHotspot')
        || null;
    }
    return layers.find((l) => l.kind === 'roomHotspot') || null;
  }

  function regionOverlayLayerFromTile(tile, z) {
    return pageHotspotLayerFromTile(tile, z)
      || roomHotspotLayerFromTile(tile, z)
      || flashOverlayLayerFromTile(tile, z);
  }

  function applyPageHotspotLabelToConfig(tile, label) {
    if (!tile) return;
    const hotspot = pageHotspotLayerFromTile(tile, selectedHmiPlaceZ());
    if (!hotspot) return;
    const trimmed = String(label ?? '').trim();
    if (trimmed) hotspot.label = trimmed;
    else delete hotspot.label;
    syncTileLegacyFields(tile);
  }

  function pageHotspotPreviewText(tile) {
    const hotspot = pageHotspotLayerFromTile(tile);
    if (!hotspot) return '';
    return String(hotspot.label || '').trim();
  }

  function refreshPageHotspotCellPreview(col, row) {
    const scr = activeHmiScreen();
    const tile = getScreenTile(scr, col, row);
    const hotspot = pageHotspotLayerFromTile(tile);
    if (!hotspot) return Promise.resolve(false);
    const anchorCol = Number(tile.col);
    const anchorRow = Number(tile.row);
    const tileCs = tile.colSpan || 1;
    const tileRs = tile.rowSpan || 1;
    const text = pageHotspotPreviewText(tile);
    const cell = setupGridCell(anchorCol, anchorRow);
    const z = Math.max(1, Number(hotspot.z) || 1);
    const layerEl = cell?.querySelector(`.hmi-tile-layer[data-kind="pageHotspot"][data-z="${z}"]`)
      || cell?.querySelector('.hmi-tile-layer[data-kind="pageHotspot"]');
    if (layerEl && HmiView.applyPageHotspotLayerBounds) {
      HmiView.applyPageHotspotLayerBounds(layerEl, hotspot, anchorCol, anchorRow, tileCs, tileRs);
    }
    const btn = cell?.querySelector('.hmi-page-hotspot-btn');
    if (btn) {
      btn.textContent = text;
      const target = hotspot.targetScreenId;
      btn.title = text ? `${text} → ${target}` : `Page hotspot → ${target}`;
      btn.setAttribute('aria-label', text ? `Navigate to ${text}` : `Navigate to ${target}`);
      return Promise.resolve(true);
    }
    return refreshSetupTileCell(anchorCol, anchorRow, scr);
  }

  function navLayerFromTile(tile) {
    if (!tile) return null;
    return screenTileLayers(tile).find((l) => l.kind === 'navButton') || null;
  }

  function applyNavButtonLabelToConfig(tile, label) {
    if (!tile) return;
    const nav = navLayerFromTile(tile);
    if (!nav) return;
    const trimmed = String(label ?? '').trim();
    if (trimmed) nav.label = trimmed;
    else delete nav.label;
    syncTileLegacyFields(tile);
  }

  function navButtonPreviewText(tile) {
    const nav = navLayerFromTile(tile);
    if (!nav) return 'Page';
    return String(nav.label || 'Page').trim() || 'Page';
  }

  function refreshNavButtonCellPreview(col, row) {
    const scr = activeHmiScreen();
    const tile = getScreenTile(scr, col, row);
    if (!navLayerFromTile(tile)) return Promise.resolve(false);
    const text = navButtonPreviewText(tile);
    const cell = setupGridCell(col, row);
    const btn = cell?.querySelector('.hmi-nav-cell-btn');
    if (btn) {
      btn.textContent = text;
      btn.title = `Go to screen: ${navLayerFromTile(tile).targetScreenId}`;
      btn.setAttribute('aria-label', `Navigate to ${text}`);
      return Promise.resolve(true);
    }
    return refreshSetupTileCell(col, row, scr);
  }

  function applyTileLabelToConfig(tile, label, z) {
    if (!tile) return;
    const nav = navLayerFromTile(tile);
    if (nav) {
      applyNavButtonLabelToConfig(tile, label);
      return;
    }
    const trimmed = String(label ?? '');
    let layers = Array.isArray(tile.layers) && tile.layers.length
      ? tile.layers.slice()
      : screenTileLayers(tile);
    let layer = layers.find((l) => l.z === z && (l.kind === 'staticText' || l.kind === 'dynamicText'));
    if (!layer) layer = layers.find((l) => l.kind === 'staticText' || l.kind === 'dynamicText');
    if (!layer) layer = layers.find((l) => l.z === z) || layers[0];
    if (layer) {
      if (isCompositeFaceplatePath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
        tile.label = trimmed;
        tile.layers = layers;
        if (trimmed) {
          tile.compositeId = tile.compositeId
            || (isMotorFaceplatePath(layer.svg) ? 'motor_hoa'
              : isTpoFaceplatePath(layer.svg) ? 'tpo_daily'
                : isPoolFaceplatePath(layer.svg) ? poolCompositeIdFromPath(layer.svg)
                  : isAlternatorFaceplatePath(layer.svg) ? 'alternator'
                    : 'pid_loop_standard');
        }
        return;
      }
      if (trimmed) {
        layer.label = trimmed;
        if (layer.kind !== 'dynamicText') layer.kind = 'staticText';
      } else {
        delete layer.label;
      }
    }
    tile.label = trimmed;
    tile.layers = layers;
    syncTileLegacyFields(tile);
  }

  function flushHmiTileLabelFromFields() {
    if (!isHmiSetupOpen()) return;
    const wrap = domGet('hmi-tile-label-wrap');
    const input = domGet('hmi-tile-label-input');
    if (!wrap || wrap.classList.contains('view-hidden') || !input) return;
    const kind = domGet('hmi-place-kind')?.value || '';
    if (kind === 'navButton' && !hmiSelectedTileCell) return;
    if ((kind === 'pageHotspot' || kind === 'roomHotspot') && !hmiSelectedTileCell) return;
    if (!hmiSelectedTileCell) return;
    const scr = activeHmiScreen();
    const tile = getScreenTile(scr, hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    if (!tile) return;
    if (pageHotspotLayerFromTile(tile) || kind === 'pageHotspot') {
      applyPageHotspotLabelToConfig(tile, input.value);
      return;
    }
    if (roomHotspotLayerFromTile(tile) || kind === 'roomHotspot') {
      applyRoomHotspotLabelToConfig(tile, input.value);
      return;
    }
    if (navLayerFromTile(tile) || kind === 'navButton') {
      applyNavButtonLabelToConfig(tile, input.value);
      return;
    }
    applyTileLabelToConfig(tile, input.value, selectedHmiPlaceZ());
  }

  function navButtonLabelFromFields(targetScreenId) {
    const custom = domGet('hmi-tile-label-input')?.value?.trim();
    if (custom) return custom;
    const target = hmiConfig.screens.find((s) => s.id === targetScreenId);
    return navButtonLabelForScreen(target);
  }

  function upsertPageHotspotLayer(screen, col, row, targetScreenId, label, z, region = {}) {
    const layerZ = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 1));
    const hCol = Number.isFinite(Number(region.hotspotCol)) ? Number(region.hotspotCol) : col;
    const hRow = Number.isFinite(Number(region.hotspotRow)) ? Number(region.hotspotRow) : row;
    const layer = {
      kind: 'pageHotspot',
      z: layerZ,
      targetScreenId,
      label: label || undefined,
      hotspotCol: hCol,
      hotspotRow: hRow,
    };
    const cs = Math.max(1, Number(region.colSpan) || 1);
    const rs = Math.max(1, Number(region.rowSpan) || 1);
    if (cs > 1) layer.hotspotColSpan = cs;
    if (rs > 1) layer.hotspotRowSpan = rs;
    const cf = cellFractionFromLayer({ cellFraction: region.cellFraction ?? selectedCellFraction() });
    if (cf < 1) layer.cellFraction = cf;
    addScreenTileLayer(screen, col, row, layer);
  }

  function upsertRoomHotspotLayer(screen, col, row, roomNum, label, z, region = {}) {
    const layerZ = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 1));
    const hCol = Number.isFinite(Number(region.hotspotCol)) ? Number(region.hotspotCol) : col;
    const hRow = Number.isFinite(Number(region.hotspotRow)) ? Number(region.hotspotRow) : row;
    const layer = {
      kind: 'roomHotspot',
      z: layerZ,
      roomNum: Math.trunc(Number(roomNum)),
      label: label || undefined,
      hotspotCol: hCol,
      hotspotRow: hRow,
    };
    const cs = Math.max(1, Number(region.colSpan) || 1);
    const rs = Math.max(1, Number(region.rowSpan) || 1);
    if (cs > 1) layer.hotspotColSpan = cs;
    if (rs > 1) layer.hotspotRowSpan = rs;
    const cf = cellFractionFromLayer({ cellFraction: region.cellFraction ?? selectedCellFraction() });
    if (cf < 1) layer.cellFraction = cf;
    addScreenTileLayer(screen, col, row, layer);
  }

  function applyRoomHotspotLabelToConfig(tile, label) {
    if (!tile) return;
    const hotspot = roomHotspotLayerFromTile(tile, selectedHmiPlaceZ());
    if (!hotspot) return;
    const trimmed = String(label ?? '').trim();
    if (trimmed) hotspot.label = trimmed;
    else delete hotspot.label;
    syncTileLegacyFields(tile);
  }

  function upsertNavButtonLayer(screen, col, row, targetScreenId, label, z) {
    const layerZ = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 4));
    addScreenTileLayer(screen, col, row, {
      kind: 'navButton',
      z: layerZ,
      targetScreenId,
      label: label || navButtonLabelForScreen(hmiConfig.screens.find((s) => s.id === targetScreenId)),
    });
  }

  function addScreenTileLayer(screen, col, row, layer) {
    if (!screen || !layer) return;
    const c = Number(col);
    const r = Number(row);
    const z = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(layer.z) || 0));
    const kind = HMI_OBJ_KINDS.includes(layer.kind) ? layer.kind : 'staticImage';
    if (kind !== 'navButton' && kind !== 'pageHotspot' && kind !== 'roomHotspot' && kind !== 'flashOverlay' && !layer.svg) return;
    let tile = ensureScreenTiles(screen).find((t) => Number(t.col) === c && Number(t.row) === r);
    if (!tile) {
      tile = { col: c, row: r, layers: [] };
      ensureScreenTiles(screen).push(tile);
    }
    if (!Array.isArray(tile.layers)) tile.layers = screenTileLayers(tile);
    const next = { kind, z };
    if (kind === 'navButton') {
      next.targetScreenId = String(layer.targetScreenId || '').trim();
      if (!next.targetScreenId) return;
      if (layer.label != null && layer.label !== '') next.label = String(layer.label);
    } else if (kind === 'pageHotspot') {
      next.z = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, z));
      next.targetScreenId = String(layer.targetScreenId || '').trim();
      if (!next.targetScreenId) return;
      if (layer.label != null && layer.label !== '') next.label = String(layer.label);
      if (Number.isFinite(Number(layer.hotspotCol))) next.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) next.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) next.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) next.hotspotRowSpan = Number(layer.hotspotRowSpan);
      const cf = cellFractionFromLayer(layer);
      if (cf < 1) next.cellFraction = cf;
    } else if (kind === 'roomHotspot') {
      next.z = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, z));
      const roomNum = Math.trunc(Number(layer.roomNum));
      if (!Number.isFinite(roomNum) || roomNum < 1) return;
      next.roomNum = Math.min(MAX_HMI_SCREENS, roomNum);
      if (layer.label != null && layer.label !== '') next.label = String(layer.label);
      if (Number.isFinite(Number(layer.hotspotCol))) next.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) next.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) next.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) next.hotspotRowSpan = Number(layer.hotspotRowSpan);
      const cf = cellFractionFromLayer(layer);
      if (cf < 1) next.cellFraction = cf;
    } else if (kind === 'flashOverlay') {
      next.z = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, z));
      next.color = layer.color === 'amber' ? 'amber' : 'red';
      if (layer.tagId) next.tagId = String(layer.tagId).trim();
      if (Number.isFinite(Number(layer.hotspotCol))) next.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) next.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) next.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) next.hotspotRowSpan = Number(layer.hotspotRowSpan);
      const cf = cellFractionFromLayer(layer);
      if (cf < 1) next.cellFraction = cf;
    } else if (kind === 'alarmList') {
      if (layer.svg) next.svg = String(layer.svg).trim();
      next.alarmList = {
        showAcked: layer.alarmList?.showAcked !== false,
      };
    } else {
      next.svg = String(layer.svg).trim();
      if (layer.label != null && layer.label !== '') next.label = String(layer.label);
      if (layer.tagId) next.tagId = String(layer.tagId).trim();
      if (layer.stripChart && typeof layer.stripChart === 'object') {
        next.stripChart = {
          penCount: Math.max(1, Math.min(8, Number(layer.stripChart.penCount) || 1)),
          chartScale: normalizeChartScaleConfig(layer.stripChart.chartScale),
        };
      }
      if (layer.gaugeColumn && typeof layer.gaugeColumn === 'object') {
        next.gaugeColumn = {
          columnCount: Math.max(1, Math.min(8, Number(layer.gaugeColumn.columnCount) || 1)),
          chartScale: normalizeChartScaleConfig(layer.gaugeColumn.chartScale),
        };
      }
      if (layer.pushButton && typeof layer.pushButton === 'object') {
        next.pushButton = normalizePushButtonConfig(layer.pushButton, next.svg);
      }
      if (layer.pilotLight && typeof layer.pilotLight === 'object') {
        next.pilotLight = normalizePilotLightConfig(layer.pilotLight, next.svg);
      }
    }
    const idx = tile.layers.findIndex((l) => l.z === z);
    if (idx >= 0) tile.layers[idx] = next;
    else tile.layers.push(next);
    tile.layers.sort((a, b) => (a.z || 0) - (b.z || 0));
    syncTileLegacyFields(tile);
  }

  function setScreenTile(screen, col, row, svg, label) {
    if (!screen || !svg) return;
    const faceplate = isCompositeFaceplatePath(svg);
    addScreenTileLayer(screen, col, row, {
      kind: faceplate ? 'staticImage' : (label ? 'staticText' : 'staticImage'),
      z: 0,
      svg,
      label: faceplate ? undefined : label,
    });
  }

  function inferObjKindFromAsset(path) {
    const p = String(path || '').toLowerCase();
    if (isCompositeFaceplatePath(p)) return 'staticImage';
    if (isAlarmListPath(p)) return 'alarmList';
    if (isStripChartAssetPath(p)) return 'staticImage';
    if (isGaugeColumnAssetPath(p)) return 'dynamicImage';
    if (/text-labels|\/text\/|text_label_|text_digits_|text_msgid|text_serverid|text_list_|digits_|label/.test(p)) return 'staticText';
    if (/dialpointer|dial-pointer/.test(p)) return 'dynamicImage';
    if (/numeric-display|numeric_display|numeric_bezel|bezel_digit|bezel_inc|bezel_simple/i.test(p)) return 'dynamicText';
    if (/pilot|lamp|motor|valve|pump|button|switch|animated/.test(p)) return 'dynamicImage';
    return 'staticImage';
  }

  function selectedHmiPlaceKind(path) {
    const sel = domGet('hmi-place-kind')?.value;
    if (sel && HMI_OBJ_KINDS.includes(sel)) return sel;
    return inferObjKindFromAsset(path);
  }

  function selectedHmiPlaceZ() {
    return Math.max(0, Math.min(HMI_MAX_LAYERS - 1, +(domGet('hmi-place-z')?.value) || 0));
  }

  function clearScreenTile(screen, col, row) {
    if (!screen) return;
    const c = Number(col);
    const r = Number(row);
    screen.tiles = ensureScreenTiles(screen).filter((t) => !(Number(t.col) === c && Number(t.row) === r));
  }

  function layerLayoutSnapshot(layer) {
    if (!layer || typeof layer !== 'object') return null;
    const kind = layer.kind || 'staticImage';
    const snap = { kind, z: Number(layer.z) || 0 };
    if (kind === 'navButton') {
      snap.targetScreenId = String(layer.targetScreenId || '');
      if (layer.label != null) snap.label = String(layer.label);
      return snap;
    }
    if (kind === 'pageHotspot') {
      snap.targetScreenId = String(layer.targetScreenId || '');
      if (layer.label != null) snap.label = String(layer.label);
      if (Number.isFinite(Number(layer.hotspotCol))) snap.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) snap.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) snap.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) snap.hotspotRowSpan = Number(layer.hotspotRowSpan);
      return snap;
    }
    if (kind === 'roomHotspot') {
      snap.roomNum = Math.trunc(Number(layer.roomNum) || 0);
      if (layer.label != null) snap.label = String(layer.label);
      if (Number.isFinite(Number(layer.hotspotCol))) snap.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) snap.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) snap.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) snap.hotspotRowSpan = Number(layer.hotspotRowSpan);
      if (layer.cellFraction != null) snap.cellFraction = layer.cellFraction;
      return snap;
    }
    if (kind === 'flashOverlay') {
      snap.color = layer.color === 'amber' ? 'amber' : 'red';
      if (layer.tagId) snap.tagId = String(layer.tagId);
      if (Number.isFinite(Number(layer.hotspotCol))) snap.hotspotCol = Number(layer.hotspotCol);
      if (Number.isFinite(Number(layer.hotspotRow))) snap.hotspotRow = Number(layer.hotspotRow);
      if (Number(layer.hotspotColSpan) > 1) snap.hotspotColSpan = Number(layer.hotspotColSpan);
      if (Number(layer.hotspotRowSpan) > 1) snap.hotspotRowSpan = Number(layer.hotspotRowSpan);
      return snap;
    }
    if (kind === 'alarmList') {
      if (layer.svg) snap.svg = String(layer.svg || '');
      snap.alarmList = { showAcked: layer.alarmList?.showAcked !== false };
      return snap;
    }
    snap.svg = String(layer.svg || '');
    if (layer.label != null) snap.label = String(layer.label);
    if (layer.tagId) snap.tagId = String(layer.tagId);
    if (layer.stripChart && typeof layer.stripChart === 'object') {
      snap.stripChart = {
        penCount: Math.max(1, Math.min(8, Number(layer.stripChart.penCount) || 1)),
        chartScale: normalizeChartScaleConfig(layer.stripChart.chartScale),
      };
    }
    if (layer.gaugeColumn && typeof layer.gaugeColumn === 'object') {
      snap.gaugeColumn = {
        columnCount: Math.max(1, Math.min(8, Number(layer.gaugeColumn.columnCount) || 1)),
        chartScale: normalizeChartScaleConfig(layer.gaugeColumn.chartScale),
      };
    }
    if (layer.pushButton && typeof layer.pushButton === 'object') {
      snap.pushButton = normalizePushButtonConfig(layer.pushButton, snap.svg);
    }
    if (layer.pilotLight && typeof layer.pilotLight === 'object') {
      snap.pilotLight = normalizePilotLightConfig(layer.pilotLight, snap.svg);
    }
    return snap;
  }

  function tilesLayoutKey(screen) {
    const g = screenGridSpec(screen);
    const tiles = (screen?.tiles || []).slice().sort((a, b) => a.row - b.row || a.col - b.col);
    try {
      return JSON.stringify({
        cols: g.cols,
        rows: g.rows,
        cellWidth: g.cellWidth,
        cellHeight: g.cellHeight,
        tiles: tiles.map((t) => [
          t.col,
          t.row,
          t.colSpan || 1,
          t.rowSpan || 1,
          screenTileLayers(t).map(layerLayoutSnapshot).filter(Boolean),
        ]),
      });
    } catch {
      return `${g.cols}x${g.rows}|${tiles.length}|${screen?.id || ''}`;
    }
  }

  function setupPreviewEl() {
    return domGet('hmi-setup-preview');
  }

  function tileGridRoot(viewport) {
    return viewport?.querySelector('.hmi-tile-grid') || null;
  }

  function setupGridCell(col, row) {
    const preview = setupPreviewEl();
    if (!preview) return null;
    const direct = preview.querySelector(`.hmi-tile-cell[data-col="${col}"][data-row="${row}"]`);
    if (direct) return direct;
    const tile = getScreenTile(activeHmiScreen(), col, row);
    if (!tile) return null;
    return preview.querySelector(`.hmi-tile-cell[data-col="${Number(tile.col)}"][data-row="${Number(tile.row)}"]`) || null;
  }

  /** Map pointer position within a spanned tile cell to logical grid col/row. */
  function gridCellFromPointer(cell, clientX, clientY) {
    if (!cell) return { col: NaN, row: NaN };
    const anchorCol = Number(cell.dataset.col);
    const anchorRow = Number(cell.dataset.row);
    const colSpan = Math.max(1, Number(cell.dataset.colSpan) || 1);
    const rowSpan = Math.max(1, Number(cell.dataset.rowSpan) || 1);
    if (!Number.isFinite(anchorCol) || !Number.isFinite(anchorRow)) {
      return { col: anchorCol, row: anchorRow };
    }
    if (colSpan === 1 && rowSpan === 1) {
      return { col: anchorCol, row: anchorRow };
    }
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { col: anchorCol, row: anchorRow };
    }
    const relX = Math.max(0, Math.min(rect.width - 0.001, clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height - 0.001, clientY - rect.top));
    const dc = Math.min(colSpan - 1, Math.floor((relX / rect.width) * colSpan));
    const dr = Math.min(rowSpan - 1, Math.floor((relY / rect.height) * rowSpan));
    return { col: anchorCol + dc, row: anchorRow + dr };
  }

  function resolveHotspotClickCell(anchorCol, anchorRow, e) {
    const cell = setupGridCell(anchorCol, anchorRow);
    if (cell && e?.clientX != null && e?.clientY != null) {
      return gridCellFromPointer(cell, e.clientX, e.clientY);
    }
    return { col: anchorCol, row: anchorRow };
  }

  function updateHmiPlacementMode() {
    setupPreviewEl()?.classList.toggle('hmi-placement-mode', !!hmiSelectedAssetPath);
  }

  function updateHmiSelectionLabels(hoverCell) {
    const assetLabel = domGet('hmi-selected-asset-label');
    if (assetLabel) {
      const name = hmiSelectedAssetPath
        ? (hmiAssets.find((a) => a.path === hmiSelectedAssetPath)?.label || hmiSelectedAssetPath.split('/').pop())
        : '';
      assetLabel.textContent = hmiSelectedAssetPath
        ? `Symbol: ${name} — click a grid cell to place`
        : 'Symbol: — (click a symbol below)';
    }
    const tileLabel = domGet('hmi-selected-tile-label');
    if (tileLabel) {
      const display = hoverCell || hmiSelectedTileCell;
      if (!display) {
        tileLabel.textContent = 'Cell: — (click a placed symbol to move or delete)';
      } else {
        const { col, row } = display;
        const tile = getScreenTile(activeHmiScreen(), col, row);
        const n = tile ? screenTileLayers(tile).length : 0;
        const placeKind = domGet('hmi-place-kind')?.value || '';
        const overlayHint = hoverCell && isRegionOverlayKind(placeKind) ? ' · placing' : '';
        tileLabel.textContent = `Cell: row ${row + 1}, col ${col + 1} · ${n} layer(s)${overlayHint}`;
      }
    }
  }

  function updateSpanCellCoordMarker(cell, col, row) {
    const coord = cell?.querySelector('.hmi-tile-coord');
    if (coord) coord.textContent = formatHmiCellLabel(col, row);
  }

  function resetSpanCellCoordMarkers(grid) {
    grid?.querySelectorAll('.hmi-tile-cell-editable.hmi-tile-span').forEach((cell) => {
      updateSpanCellCoordMarker(cell, Number(cell.dataset.col), Number(cell.dataset.row));
      cell.querySelector('.hmi-tile-coord')?.classList.remove('hmi-tile-coord-hover');
    });
  }

  let hmiPlacementCoordCell = null;

  function clearHmiPlacementCursor(grid) {
    const g = grid || setupPreviewEl()?.querySelector('.hmi-tile-grid');
    if (hmiPlacementCoordCell) {
      updateSpanCellCoordMarker(
        hmiPlacementCoordCell,
        Number(hmiPlacementCoordCell.dataset.col),
        Number(hmiPlacementCoordCell.dataset.row),
      );
      hmiPlacementCoordCell.querySelector('.hmi-tile-coord')?.classList.remove('hmi-tile-coord-hover');
      hmiPlacementCoordCell = null;
    } else if (g) {
      resetSpanCellCoordMarkers(g);
    }
    updateHmiSelectionLabels();
  }

  function updateHmiPlacementCursor(grid, cell, clientX, clientY) {
    const placeKind = domGet('hmi-place-kind')?.value || '';
    if (!isRegionOverlayKind(placeKind) || !grid || !cell || !grid.contains(cell)) {
      clearHmiPlacementCursor(grid);
      return;
    }
    let col = Number(cell.dataset.col);
    let row = Number(cell.dataset.row);
    const colSpan = Math.max(1, Number(cell.dataset.colSpan) || 1);
    const rowSpan = Math.max(1, Number(cell.dataset.rowSpan) || 1);
    if ((colSpan > 1 || rowSpan > 1) && clientX != null && clientY != null) {
      const hit = gridCellFromPointer(cell, clientX, clientY);
      col = hit.col;
      row = hit.row;
    }
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    updateHmiSelectionLabels({ col, row });
    if (colSpan > 1 || rowSpan > 1) {
      if (hmiPlacementCoordCell && hmiPlacementCoordCell !== cell) {
        updateSpanCellCoordMarker(
          hmiPlacementCoordCell,
          Number(hmiPlacementCoordCell.dataset.col),
          Number(hmiPlacementCoordCell.dataset.row),
        );
        hmiPlacementCoordCell.querySelector('.hmi-tile-coord')?.classList.remove('hmi-tile-coord-hover');
      }
      hmiPlacementCoordCell = cell;
      updateSpanCellCoordMarker(cell, col, row);
      cell.querySelector('.hmi-tile-coord')?.classList.add('hmi-tile-coord-hover');
    }
  }

  function syncSelectedOverlayCoordMarker() {
    const grid = setupPreviewEl()?.querySelector('.hmi-tile-grid');
    if (!grid || !hmiSelectedTileCell) return;
    resetSpanCellCoordMarkers(grid);
    const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    if (!tile || !tileHasGraphicBackground(tile)) return;
    const layer = regionOverlayLayerFromTile(tile, selectedHmiPlaceZ());
    if (!layer) return;
    const region = pageHotspotRegionFromLayer(layer, tile);
    const { col, row } = hmiSelectedTileCell;
    if (col !== region.col || row !== region.row) return;
    const cell = setupGridCell(Number(tile.col), Number(tile.row));
    if (!cell) return;
    const cs = Math.max(1, Number(cell.dataset.colSpan) || 1);
    const rs = Math.max(1, Number(cell.dataset.rowSpan) || 1);
    if (cs > 1 || rs > 1) updateSpanCellCoordMarker(cell, col, row);
  }

  function highlightSelectedTileCell() {
    const preview = setupPreviewEl();
    preview?.querySelectorAll('.hmi-tile-cell.hmi-tile-selected').forEach((el) => {
      el.classList.remove('hmi-tile-selected');
    });
    preview?.querySelectorAll('.hmi-tile-layer.hmi-hotspot-selected, .hmi-tile-layer.hmi-flash-selected').forEach((el) => {
      el.classList.remove('hmi-hotspot-selected', 'hmi-flash-selected');
    });
    if (!hmiSelectedTileCell) return;
    const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    const hotspot = pageHotspotLayerFromTile(tile) || roomHotspotLayerFromTile(tile);
    if (hotspot && tileHasGraphicBackground(tile)) {
      const cell = setupGridCell(Number(tile.col), Number(tile.row));
      const z = Math.max(1, Number(hotspot.z) || 1);
      const kind = hotspot.kind === 'roomHotspot' ? 'roomHotspot' : 'pageHotspot';
      const layerEl = cell?.querySelector(`.hmi-tile-layer[data-kind="${kind}"][data-z="${z}"]`)
        || cell?.querySelector(`.hmi-tile-layer[data-kind="${kind}"]`);
      layerEl?.classList.add('hmi-hotspot-selected');
      return;
    }
    const flashOverlay = flashOverlayLayerFromTile(tile);
    if (flashOverlay && tileHasGraphicBackground(tile)) {
      const cell = setupGridCell(Number(tile.col), Number(tile.row));
      const z = Math.max(1, Number(flashOverlay.z) || 1);
      const layerEl = cell?.querySelector(`.hmi-tile-layer[data-kind="flashOverlay"][data-z="${z}"]`)
        || cell?.querySelector('.hmi-tile-layer[data-kind="flashOverlay"]');
      layerEl?.classList.add('hmi-flash-selected');
      return;
    }
    const cell = setupGridCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    cell?.classList.add('hmi-tile-selected');
  }

  function selectHmiTileCell(col, row) {
    clearHmiPlacementCursor();
    const preserveClick = shouldPreserveHotspotClickCoords(col, row);
    ({ col, row } = resolveHmiSelectedCellCoords(col, row, preserveClick));
    hmiSelectedTileCell = { col, row };
    const tile = getScreenTile(activeHmiScreen(), col, row);
    const spanCol = domGet('hmi-tile-col-span');
    const spanRow = domGet('hmi-tile-row-span');
    const layers = tile ? screenTileLayers(tile) : [];
    const placeZ = selectedHmiPlaceZ();
    const pageHotspotLayer = layers.find((l) => l.kind === 'pageHotspot' && l.z === placeZ)
      || layers.find((l) => l.kind === 'pageHotspot');
    const roomHotspotLayer = layers.find((l) => l.kind === 'roomHotspot' && l.z === placeZ)
      || layers.find((l) => l.kind === 'roomHotspot');
    const flashOverlayLayer = layers.find((l) => l.kind === 'flashOverlay' && l.z === placeZ)
      || layers.find((l) => l.kind === 'flashOverlay');
    const placeOverlayOnGraphic = isRegionOverlayKind(domGet('hmi-place-kind')?.value)
      && tileHasGraphicBackground(tile);
    if ((pageHotspotLayer || roomHotspotLayer || flashOverlayLayer) && tileHasGraphicBackground(tile)) {
      const regionLayer = pageHotspotLayer || roomHotspotLayer || flashOverlayLayer;
      const region = pageHotspotRegionFromLayer(regionLayer, tile);
      if (spanCol) spanCol.value = String(region.colSpan);
      if (spanRow) spanRow.value = String(region.rowSpan);
      syncCellFractionSelectFromLayer(regionLayer);
    } else if (!placeOverlayOnGraphic) {
      if (spanCol) spanCol.value = String(tile?.colSpan || 1);
      if (spanRow) spanRow.value = String(tile?.rowSpan || 1);
    }
    const navLayer = layers.find((l) => l.kind === 'navButton' && l.z === placeZ)
      || layers.find((l) => l.kind === 'navButton');
    const zEl = domGet('hmi-place-z');
    if (pageHotspotLayer && domGet('hmi-nav-target')) {
      domGet('hmi-place-kind').value = 'pageHotspot';
      syncHmiPlaceZSelectForKind();
      domGet('hmi-nav-target').value = pageHotspotLayer.targetScreenId || '';
      if (zEl) zEl.value = String(pageHotspotLayer.z ?? 1);
      syncCellFractionSelectFromLayer(pageHotspotLayer);
      updateHmiPlaceOptionsUi();
    } else if (roomHotspotLayer) {
      domGet('hmi-place-kind').value = 'roomHotspot';
      syncHmiPlaceZSelectForKind();
      const roomEl = domGet('hmi-room-num');
      if (roomEl) roomEl.value = String(roomHotspotLayer.roomNum || '');
      if (zEl) zEl.value = String(roomHotspotLayer.z ?? 1);
      syncCellFractionSelectFromLayer(roomHotspotLayer);
      updateHmiPlaceOptionsUi();
    } else if (flashOverlayLayer) {
      domGet('hmi-place-kind').value = 'flashOverlay';
      syncHmiPlaceZSelectForKind();
      const colorEl = domGet('hmi-flash-overlay-color');
      if (colorEl) colorEl.value = flashOverlayLayer.color === 'amber' ? 'amber' : 'red';
      if (zEl) zEl.value = String(flashOverlayLayer.z ?? 1);
      syncCellFractionSelectFromLayer(flashOverlayLayer);
      updateHmiPlaceOptionsUi();
    } else if (navLayer && domGet('hmi-nav-target')) {
      domGet('hmi-place-kind').value = 'navButton';
      domGet('hmi-nav-target').value = navLayer.targetScreenId || '';
      if (zEl) zEl.value = String(navLayer.z ?? 4);
      updateHmiPlaceOptionsUi();
    } else if (tile && zEl) {
      const textZ = textLayerZForTile(tile, selectedHmiPlaceZ());
      const hasText = screenTileLayers(tile).some(
        (l) => l.kind === 'staticText' || l.kind === 'dynamicText'
      );
      if (hasText) zEl.value = String(textZ);
    }
    highlightSelectedTileCell();
    syncSelectedOverlayCoordMarker();
    updateHmiSelectionLabels();
    updateHmiTileLabelEditor();
    updateHmiStripChartPanel();
    updateHmiGaugeColumnPanel();
    updateHmiPushButtonPanel();
    updateHmiPilotLightPanel();
    renderHmiObjectBindingsPanel();
    if (activeHmiComposerSection() !== 'object-type') showHmiComposerSection('object-type');
  }

  function clearHmiTileSelection() {
    hmiSelectedTileCell = null;
    clearHmiPlacementCursor();
    highlightSelectedTileCell();
    updateHmiSelectionLabels();
    updateHmiTileLabelEditor();
    updateHmiStripChartPanel();
    updateHmiGaugeColumnPanel();
    updateHmiPushButtonPanel();
    updateHmiPilotLightPanel();
    renderHmiObjectBindingsPanel();
  }

  function hmiCellHasEditableLabel(cell) {
    if (!cell) return false;
    return !!(cell.querySelector('[id$="__hmi_label"], text'));
  }

  function readHmiCellLabelText(cell) {
    if (!cell || !window.HmiView?.labelTextElement) return '';
    for (const svg of cell.querySelectorAll('svg.hmi-tile-asset, svg')) {
      const textEl = HmiView.labelTextElement(svg);
      if (textEl) return textEl.textContent?.trim() || '';
    }
    return '';
  }

  function updateHmiTileLabelEditor() {
    const wrap = domGet('hmi-tile-label-wrap');
    const input = domGet('hmi-tile-label-input');
    if (!wrap || !input) return;
    const placeNav = domGet('hmi-place-kind')?.value === 'navButton';
    const placeHotspot = domGet('hmi-place-kind')?.value === 'pageHotspot';
    const placeScreenNav = placeNav || placeHotspot;
    if (!hmiSelectedTileCell) {
      if (placeScreenNav) {
        wrap.classList.remove('view-hidden');
      } else {
        wrap.classList.add('view-hidden');
        input.value = '';
      }
      return;
    }
    const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    const pageHotspotLayer = tile ? pageHotspotLayerFromTile(tile, selectedHmiPlaceZ()) : null;
    if (pageHotspotLayer || placeHotspot) {
      wrap.classList.remove('view-hidden');
      input.value = pageHotspotLayer?.label != null ? String(pageHotspotLayer.label) : input.value;
      return;
    }
    const navLayer = tile ? screenTileLayers(tile).find((l) => l.kind === 'navButton') : null;
    if (navLayer || placeNav) {
      wrap.classList.remove('view-hidden');
      input.value = navLayer?.label != null ? String(navLayer.label) : input.value;
      return;
    }
    const cell = setupGridCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    if (!hmiCellHasEditableLabel(cell)) {
      wrap.classList.add('view-hidden');
      input.value = '';
      return;
    }
    wrap.classList.remove('view-hidden');
    const z = selectedHmiPlaceZ();
    const layers = tile ? screenTileLayers(tile) : [];
    const layer = layers.find((l) => l.z === z && (l.kind === 'staticText' || l.kind === 'dynamicText'))
      || layers.find((l) => l.kind === 'staticText' || l.kind === 'dynamicText');
    input.value = layer?.label ?? tile?.label ?? readHmiCellLabelText(cell);
  }

  function syncHmiElementIdDatalist(viewport) {
    const dl = domGet('hmi-element-ids');
    if (!dl || !window.HmiView?.listBindingElementIds) return;
    hmiElementIds = HmiView.listBindingElementIds(viewport || setupPreviewEl());
    const ids = [HMI_SCREEN_BG_ELEMENT_ID, ...hmiElementIds.filter((id) => id !== HMI_SCREEN_BG_ELEMENT_ID)];
    dl.innerHTML = ids.map((id) => `<option value="${esc(id)}"></option>`).join('');
  }

  async function refreshSetupElementIds() {
    const viewport = setupPreviewEl();
    if (!viewport || !window.HmiView?.listBindingElementIds) return;
    syncHmiElementIdDatalist(viewport);
    const bc = domGet('hmi-binding-count');
    if (bc) bc.textContent = `(${bindingsForScreen().length})`;
  }

  async function refreshSetupTileCell(col, row, screen) {
    const scr = screen || activeHmiScreen();
    const tile = getScreenTile(scr, col, row);
    const anchorCol = tile ? Number(tile.col) : Number(col);
    const anchorRow = tile ? Number(tile.row) : Number(row);
    if (tile && (tile.colSpan > 1 || tile.rowSpan > 1)) {
      hmiPreviewTilesKey = '';
      await scheduleHmiPreview(true);
      return true;
    }
    const cell = setupGridCell(anchorCol, anchorRow);
    if (!cell || !window.HmiView?.updateTileCell) {
      hmiPreviewTilesKey = '';
      scheduleHmiPreview(true);
      return false;
    }
    try {
      await HmiView.updateTileCell(cell, tile || null, anchorCol, anchorRow, { label: tile?.label });
      if (cell && tile && HmiView.applyTileSpanToCell) {
        HmiView.applyTileSpanToCell(cell, anchorCol, anchorRow, tile);
      }
      const grid = cell.closest('.hmi-tile-grid');
      if (grid) HmiView.wireNavButtons?.(grid, navigateHmiPreviewEdit);
      return true;
    } catch (e) {
      console.error(e);
      hmiPreviewTilesKey = '';
      scheduleHmiPreview(true);
      return false;
    }
  }

  async function refreshMainTileGrid(force) {
    if (!isHmiViewActive()) return;
    hmiLoadedUrl = '';
    await loadHmiScreen(!!force);
  }

  function assignHmiTileComposite(col, row, assetOrPath, screen, options = {}) {
    const scr = screen || activeHmiScreen();
    const asset = typeof assetOrPath === 'object' ? assetOrPath : hmiAssetByPath(assetOrPath);
    const path = asset?.path || String(assetOrPath || '');
    const manifest = compositeManifestFromAsset(asset || path);
    if (!scr || !manifest) {
      if (isCompositeAssetPath(path)) {
        showHmiSetupMsg('Composite manifest not loaded — click Refresh assets, then try again.', true);
        return;
      }
      assignHmiTileAsset(col, row, path, scr, options);
      return;
    }
    const g = screenGridSpec(scr);
    const { colSpan, rowSpan } = options.colSpan != null
      ? { colSpan: options.colSpan, rowSpan: options.rowSpan || 1 }
      : selectedTileSpan();
    let tile = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
    if (!canPlaceTileAt(scr, col, row, colSpan, rowSpan, tile || null)) {
      alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
      return;
    }
    const maxCells = g.cols * g.rows;
    if (!tile && (scr.tiles || []).length >= maxCells) {
      alert(`All ${maxCells} grid anchor cells are in use. Remove or move a symbol first.`);
      return;
    }
    if (!tile) {
      tile = { col, row, layers: [], compositeId: manifest.id };
      ensureScreenTiles(scr).push(tile);
    } else {
      tile.compositeId = manifest.id;
      tile.layers = [];
    }
    applyTileSpanToConfig(tile, colSpan, rowSpan);
    for (const part of manifest.parts) {
      if (!part?.svg) continue;
      const kind = HMI_OBJ_KINDS.includes(part.kind) ? part.kind : inferObjKindFromAsset(part.svg);
      addScreenTileLayer(scr, col, row, {
        kind,
        z: part.z ?? 0,
        svg: part.svg,
        tagId: options.tagId,
      });
    }
    syncTileLegacyFields(tile);
    recordHmiRecentAsset(asset?.path || path);
    markHmiDirty();
    clearHmiTileSelection();
    const finishComposite = async () => {
      for (const part of manifest.parts) {
        if (part?.svg && HmiView.ensureCellBindingIds) {
          HmiView.ensureCellBindingIds(setupGridCell(col, row), col, row, part.z ?? 0);
        }
      }
      if (manifest.id === 'pid_loop_standard') await ensureDefaultPidTag();
      if (manifest.id === 'motor_hoa') await ensureDefaultMotorTags();
      const { added, tagId } = addCompositeDefaultBindings(col, row, manifest);
      updateHmiPreviewMeta(scr);
      refreshSetupElementIds();
      refreshHmiBindings(hmiSetupBindingRoot());
      renderHmiBindingsTable();
      scheduleHmiPreview();
      requestAnimationFrame(() => {
        refreshHmiBindings(hmiSetupBindingRoot());
        scheduleHmiPreview();
      });
      selectHmiTileCell(col, row);
      const tagHint = tagId ? ` Tag: ${tagId}.` : (manifest.id === 'pid_loop_standard'
        ? ' Add PID on Tags (or re-place faceplate to auto-create PID1).'
        : manifest.id === 'motor_hoa'
          ? ' Add MOTOR1_* tags on Tags (or re-place faceplate to auto-create them).'
          : manifest.id === 'alternator'
            ? ' Add ALT1 on Tags (load alternator fixtures) or pick ALT tag on bindings.'
            : manifest.id === 'alarm_list'
              ? ' Span 2×3+ cells recommended. List refreshes from live tag alarms when runtime is running.'
              : ' Pick a tag on each binding row.');
      showHmiSetupMsg(
        `Composite “${manifest.label}” at ${formatHmiCellLabel(col, row)} — ${manifest.parts.length} layer(s), ${added} binding(s).${tagHint} Enter Test value, click Test.`,
        !tagId
      );
    };
    if (colSpan > 1 || rowSpan > 1) {
      hmiPreviewTilesKey = '';
      refreshHmiSetupPreview(true).then(finishComposite).catch(console.error);
    } else {
      refreshSetupTileCell(col, row, scr).then(finishComposite).catch(console.error);
    }
    refreshMainTileGrid(true);
  }

  function assignHmiTileAsset(col, row, path, screen, options = {}) {
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    const scr = screen || activeHmiScreen();
    if (!scr) return;
    const g = screenGridSpec(scr);
    const { colSpan, rowSpan } = options.colSpan != null
      ? { colSpan: options.colSpan, rowSpan: options.rowSpan || 1 }
      : selectedTileSpan();
    if (col < 0 || row < 0 || col + colSpan > g.cols || row + rowSpan > g.rows) {
      alert(`Placement must fit inside ${g.cols}×${g.rows} grid.`);
      return;
    }
    const kind = options.kind || selectedHmiPlaceKind(path);
    if (kind === 'navButton') {
      const targetScreenId = domGet('hmi-nav-target')?.value?.trim();
      if (!targetScreenId) {
        alert('Choose a target screen for the navigation button.');
        return;
      }
      const existNav = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
      if (!canPlaceTileAt(scr, col, row, colSpan, rowSpan, existNav || null)) {
        alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
        return;
      }
      const z = options.z != null ? options.z : selectedHmiPlaceZ();
      const labelInput = navButtonLabelFromFields(targetScreenId);
      upsertNavButtonLayer(scr, col, row, targetScreenId, labelInput, z);
      const tile = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
      applyTileSpanToConfig(tile, colSpan, rowSpan);
      markHmiDirty();
      clearHmiTileSelection();
      refreshSetupTileCell(col, row, scr).then(() => {
        selectHmiTileCell(col, row);
        refreshNavButtonCellPreview(col, row).catch(console.error);
        showHmiSetupMsg(`Navigation button → ${targetScreenId} at ${formatHmiCellLabel(col, row)}.`, false);
      }).catch(console.error);
      refreshMainTileGrid(true);
      return;
    }
    if (kind === 'pageHotspot') {
      const targetScreenId = domGet('hmi-nav-target')?.value?.trim();
      if (!targetScreenId) {
        alert('Choose a target screen for the page hotspot.');
        return;
      }
      const clickCol = Number.isFinite(Number(options.clickCol)) ? Number(options.clickCol) : col;
      const clickRow = Number.isFinite(Number(options.clickRow)) ? Number(options.clickRow) : row;
      const existTile = getScreenTile(scr, clickCol, clickRow);
      const anchorCol = existTile ? Number(existTile.col) : clickCol;
      const anchorRow = existTile ? Number(existTile.row) : clickRow;
      const graphicBg = existTile && tileHasGraphicBackground(existTile);
      if (graphicBg) {
        if (!hotspotRegionFitsTile(clickCol, clickRow, colSpan, rowSpan, existTile)) {
          alert('Hotspot must fit within the background graphic cells.');
          return;
        }
      } else if (!canPlaceTileAt(scr, clickCol, clickRow, colSpan, rowSpan, existTile || null)) {
        alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
        return;
      }
      const z = options.z != null ? options.z : selectedHmiPlaceZ();
      const labelInput = domGet('hmi-tile-label-input')?.value?.trim() || '';
      upsertPageHotspotLayer(scr, anchorCol, anchorRow, targetScreenId, labelInput, z, {
        hotspotCol: clickCol,
        hotspotRow: clickRow,
        colSpan,
        rowSpan,
      });
      const tile = getScreenTile(scr, clickCol, clickRow);
      if (!graphicBg) applyTileSpanToConfig(tile, colSpan, rowSpan);
      markHmiDirty();
      clearHmiTileSelection();
      const previewCol = graphicBg ? anchorCol : clickCol;
      const previewRow = graphicBg ? anchorRow : clickRow;
      refreshSetupTileCell(previewCol, previewRow, scr).then(() => {
        selectHmiTileCell(clickCol, clickRow);
        refreshPageHotspotCellPreview(previewCol, previewRow).catch(console.error);
        showHmiSetupMsg(`Page hotspot → ${targetScreenId} at ${formatHmiCellLabel(clickCol, clickRow)} Z${Math.max(1, z)}.`, false);
      }).catch(console.error);
      refreshMainTileGrid(true);
      return;
    }
    if (kind === 'roomHotspot') {
      const roomNum = Math.trunc(Number(domGet('hmi-room-num')?.value));
      if (!Number.isFinite(roomNum) || roomNum < 1) {
        alert('Enter a room number (1–500) for the room hotspot.');
        return;
      }
      const clickCol = Number.isFinite(Number(options.clickCol)) ? Number(options.clickCol) : col;
      const clickRow = Number.isFinite(Number(options.clickRow)) ? Number(options.clickRow) : row;
      const existTile = getScreenTile(scr, clickCol, clickRow);
      const anchorCol = existTile ? Number(existTile.col) : clickCol;
      const anchorRow = existTile ? Number(existTile.row) : clickRow;
      const graphicBg = existTile && tileHasGraphicBackground(existTile);
      if (graphicBg) {
        if (!hotspotRegionFitsTile(clickCol, clickRow, colSpan, rowSpan, existTile)) {
          alert('Room hotspot must fit within the background graphic cells.');
          return;
        }
      } else if (!canPlaceTileAt(scr, clickCol, clickRow, colSpan, rowSpan, existTile || null)) {
        alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
        return;
      }
      const z = options.z != null ? options.z : selectedHmiPlaceZ();
      const labelInput = domGet('hmi-tile-label-input')?.value?.trim()
        || `Room ${padRoomNum(roomNum)}`;
      upsertRoomHotspotLayer(scr, anchorCol, anchorRow, roomNum, labelInput, z, {
        hotspotCol: clickCol,
        hotspotRow: clickRow,
        colSpan,
        rowSpan,
      });
      const tile = getScreenTile(scr, clickCol, clickRow);
      if (!graphicBg) applyTileSpanToConfig(tile, colSpan, rowSpan);
      markHmiDirty();
      clearHmiTileSelection();
      const previewCol = graphicBg ? anchorCol : clickCol;
      const previewRow = graphicBg ? anchorRow : clickRow;
      refreshSetupTileCell(previewCol, previewRow, scr).then(() => {
        selectHmiTileCell(clickCol, clickRow);
        showHmiSetupMsg(`Room hotspot → Room ${padRoomNum(roomNum)} at ${formatHmiCellLabel(clickCol, clickRow)} Z${Math.max(1, z)}.`, false);
      }).catch(console.error);
      refreshMainTileGrid(true);
      return;
    }
    if (kind === 'flashOverlay') {
      const clickCol = Number.isFinite(Number(options.clickCol)) ? Number(options.clickCol) : col;
      const clickRow = Number.isFinite(Number(options.clickRow)) ? Number(options.clickRow) : row;
      const existTile = getScreenTile(scr, clickCol, clickRow);
      const anchorCol = existTile ? Number(existTile.col) : clickCol;
      const anchorRow = existTile ? Number(existTile.row) : clickRow;
      const graphicBg = existTile && tileHasGraphicBackground(existTile);
      if (graphicBg) {
        if (!hotspotRegionFitsTile(clickCol, clickRow, colSpan, rowSpan, existTile)) {
          alert('Flash overlay must fit within the background graphic cells.');
          return;
        }
      } else if (!canPlaceTileAt(scr, clickCol, clickRow, colSpan, rowSpan, existTile || null)) {
        alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
        return;
      }
      const z = options.z != null ? options.z : selectedHmiPlaceZ();
      const color = options.color || selectedFlashOverlayColor();
      upsertFlashOverlayLayer(scr, anchorCol, anchorRow, color, z, {
        hotspotCol: clickCol,
        hotspotRow: clickRow,
        colSpan,
        rowSpan,
      });
      const tile = getScreenTile(scr, clickCol, clickRow);
      if (!graphicBg) applyTileSpanToConfig(tile, colSpan, rowSpan);
      markHmiDirty();
      clearHmiTileSelection();
      const previewCol = graphicBg ? anchorCol : clickCol;
      const previewRow = graphicBg ? anchorRow : clickRow;
      refreshSetupTileCell(previewCol, previewRow, scr).then(() => {
        selectHmiTileCell(clickCol, clickRow);
        refreshFlashOverlayCellPreview(previewCol, previewRow).catch(console.error);
        const colorLabel = color === 'amber' ? 'amber' : 'red';
        showHmiSetupMsg(`Flash overlay (${colorLabel}) at ${formatHmiCellLabel(clickCol, clickRow)} Z${Math.max(1, z)}.`, false);
      }).catch(console.error);
      refreshMainTileGrid(true);
      return;
    }
    if (!path) return;
    if (col < 0 || col >= g.cols || row < 0 || row >= g.rows) return;
    if (isHoaSwitchAssetPath(path)) {
      assignHmiTileComposite(col, row, '@composite/switch_hoa', scr, { ...options, colSpan, rowSpan });
      return;
    }
    if (isPidFaceplatePath(path)) {
      assignHmiTileComposite(col, row, '@composite/pid_loop_standard', scr, { ...options, colSpan, rowSpan });
      return;
    }
    if (isMotorFaceplatePath(path)) {
      assignHmiTileComposite(col, row, '@composite/motor_hoa', scr, { ...options, colSpan, rowSpan });
      return;
    }
    if (isAlternatorFaceplatePath(path)) {
      assignHmiTileComposite(col, row, '@composite/alternator', scr, { ...options, colSpan, rowSpan });
      return;
    }
    const asset = hmiAssetByPath(path);
    if (asset?.type === 'composite' || isCompositeAssetPath(path)) {
      assignHmiTileComposite(col, row, asset || path, scr, { ...options, colSpan, rowSpan });
      return;
    }
    let anchorTile = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
    const maxCells = g.cols * g.rows;
    if (!anchorTile && (scr.tiles || []).length >= maxCells) {
      alert(`All ${maxCells} grid anchor cells are in use. Remove or move a symbol first.`);
      return;
    }
    if (!canPlaceTileAt(scr, col, row, colSpan, rowSpan, anchorTile || null)) {
      alert('That span overlaps another symbol. Clear the area or reduce colspan/rowspan.');
      return;
    }
    let z = options.z != null ? options.z : selectedHmiPlaceZ();
    if ((colSpan > 1 || rowSpan > 1) && options.z == null) z = 0;
    if (options.z == null && kind === 'dynamicText' && /numeric-display|numeric_display|numeric_bezel|bezel_digit|bezel_inc|bezel_simple/i.test(path)) {
      const existing = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
      const layers = existing ? screenTileLayers(existing) : [];
      const hasHoa = existing?.compositeId === 'switch_hoa'
        || layers.some((l) => isHoaSwitchAssetPath(l.svg));
      if (hasHoa) {
        const used = new Set(layers.map((l) => l.z));
        z = [3, 4, 2, 1, 0].find((n) => !used.has(n)) ?? 3;
      }
    }
    const labelInput = domGet('hmi-tile-label-input')?.value?.trim();
    const layer = {
      kind,
      z,
      svg: isStripChartAssetPath(path) ? normalizeStripChartPlacementPath(path)
        : (isGaugeColumnAssetPath(path) ? normalizeGaugeColumnPlacementPath(path)
          : (isPushButtonAssetPath(path) ? normalizePushButtonPlacementPath(path)
            : (isPilotLightAssetPath(path) ? normalizePilotLightPlacementPath(path) : path.trim()))),
      label: (kind === 'staticText' || kind === 'dynamicText') && labelInput ? labelInput : undefined,
    };
    if (isStripChartAssetPath(path)) layer.stripChart = { penCount: 1, chartScale: normalizeChartScaleConfig() };
    if (isGaugeColumnAssetPath(path)) layer.gaugeColumn = { columnCount: 1, chartScale: normalizeChartScaleConfig() };
    if (isPushButtonAssetPath(path)) {
      layer.pushButton = normalizePushButtonConfig({}, path);
      if (hmiPushButtonModeFilter) layer.pushButton.mode = hmiPushButtonModeFilter;
    }
    if (isPilotLightAssetPath(path)) {
      layer.pilotLight = normalizePilotLightConfig({}, path);
      if (hmiPilotLightKindFilter) layer.pilotLight.kind = hmiPilotLightKindFilter;
    }
    addScreenTileLayer(scr, col, row, layer);
    recordHmiRecentAsset(path.trim());
    anchorTile = ensureScreenTiles(scr).find((t) => Number(t.col) === col && Number(t.row) === row);
    applyTileSpanToConfig(anchorTile, colSpan, rowSpan);
    markHmiDirty();
    clearHmiTileSelection();
    const needsFullGrid = colSpan > 1 || rowSpan > 1;
    const afterPlace = () => {
      const cell = setupGridCell(col, row);
      if (cell && HmiView.ensureCellBindingIds) {
        HmiView.ensureCellBindingIds(cell, col, row, z);
      }
      const tile = getScreenTile(scr, col, row);
      const textLayer = screenTileLayers(tile).find((l) => l.kind === 'staticText' || l.kind === 'dynamicText');
      const faceplateLayer = screenTileLayers(tile).find((l) => isCompositeFaceplatePath(l.svg));
      if (textLayer && !textLayer.label && !faceplateLayer) {
        const text = readHmiCellLabelText(cell);
        if (text) {
          textLayer.label = text;
          syncTileLegacyFields(tile);
          markHmiDirty();
        }
      }
      updateHmiPreviewMeta(scr);
      if (kind === 'dynamicText' || kind === 'staticText') {
        HmiView.ensureLayerLabelId?.(col, row, z);
      }
      refreshSetupElementIds();
      refreshHmiBindings(hmiSetupBindingRoot());
      updateHmiTileLabelEditor();
      selectHmiTileCell(col, row);
      if (/dialbg|dial-bg|gauge_dialbg/i.test(path)) {
        const shapeId = firstShapeElementIdForCell(col, row, z);
        showHmiSetupMsg(
          `Dial at ${formatHmiCellLabel(col, row)} Z${z}. Binding: property fill, element ${shapeId}, REAL/INT tag, min/max, Test.`,
          false
        );
      } else if (/dialpointer|dial-pointer|gauge_dialpointer/i.test(path)) {
        const ptrId = firstPointerElementIdForCell(col, row, z);
        showHmiSetupMsg(
          `Needle at ${formatHmiCellLabel(col, row)} Z${z}. Binding: property rotation, element ${ptrId}, REAL/INT tag, min/max, angle at max/min (default 330°/30°), Test.`,
          false
        );
      } else if (isPilotLightAssetPath(path)) {
        const lampId = pilotLightElementIdForCell(col, row, z);
        const kind = pilotLightKindForLayer(findPilotLightLayer(tile, z));
        updateHmiPilotLightPanel();
        showHmiSetupMsg(
          kind === 'complex'
            ? `Pilot light at ${formatHmiCellLabel(col, row)} Z${z} — Complex (5-state). Set shape and colors in the Pilot light panel. Bind INT fill5 to ${lampId} (0–4).`
            : `Pilot light at ${formatHmiCellLabel(col, row)} Z${z} — Simple (BOOL). Set shape and colors in the Pilot light panel. Bind BOOL fill to ${lampId}.`,
          false
        );
      } else if (isHoaSwitchAssetPath(path)) {
        showHmiSetupMsg(
          `HOA switch at ${formatHmiCellLabel(col, row)} — 3 layers (Auto/Off/Hand). Binding: HOA position (3), t${col + 1}_${row + 1}__hoa_switch, INT 0=Auto 1=Off 2=Hand. Click to cycle.`,
          false
        );
      } else if (/numeric-display|numeric_display|numeric_bezel|bezel_digit|bezel_inc|bezel_simple/i.test(path)) {
        const labelId = elementIdForHmiTextCell(col, row, z);
        showHmiSetupMsg(
          `Numeric display at ${formatHmiCellLabel(col, row)} Z${z}. Use its own cell (or Z3+ if stacked with HOA). Binding: text, ${labelId}, same INT tag as HOA, format state3 (or int for 0/1/2), Test.`,
          false
        );
      } else if (isPidFaceplatePath(path)) {
        showHmiSetupMsg(
          `PID faceplate at ${formatHmiCellLabel(col, row)} Z${z}. Add a PID tag on Tags, then bind PV/SP/OUT (element ids pv_value, sp_value, out_value) or place via Composites for auto-bindings. Test with a numeric value.`,
          true
        );
      } else if (isMotorFaceplatePath(path)) {
        showHmiSetupMsg(
          `Motor faceplate at ${formatHmiCellLabel(col, row)} Z${z}. Place via Composites → motor_hoa for auto-bindings (MOTOR1_HOA, MOTOR1_STA, START/STOP/RESET/RUN). Pair with st/logic/22_motor_hoa.st. START/STOP/RESET and HOA readout are clickable on the live HMI when the program is running.`,
          true
        );
      } else if (isAlternatorFaceplatePath(path)) {
        showHmiSetupMsg(
          `Alternator faceplate at ${formatHmiCellLabel(col, row)} Z${z}. Place via Composites → alternator for auto-bindings to ALT1 (activeUnit, pumpStage, offActive, highActive, lowActive, low2Active, fault). Pair with st/logic/27_alternator_2pump.st or 28_alternator_triplex.st.`,
          true
        );
      } else if (isStripChartAssetPath(path)) {
        const penZ = z;
        ensureStripChartTrendBindings(scr, col, row, penZ, 1);
        renderHmiBindingsTable();
        updateHmiStripChartPanel();
        showHmiSetupMsg(
          `Strip chart at ${formatHmiCellLabel(col, row)} Z${penZ}. Set <strong>Pens</strong> (1–8), pick a tag per pen, colors, and <strong>Y-axis scale</strong> in the <strong>Strip chart</strong> panel. Use <strong>Assign VPR1–N</strong> for VPR tags. Start runtime for live traces.`,
          false
        );
      } else if (isGaugeColumnAssetPath(path)) {
        const colZ = z;
        ensureGaugeColumnFillBindings(scr, col, row, colZ, 1);
        renderHmiBindingsTable();
        updateHmiGaugeColumnPanel();
        showHmiSetupMsg(
          `Gauge column at ${formatHmiCellLabel(col, row)} Z${colZ}. Set <strong>Columns</strong> (1–8), pick a tag per column, colors, and <strong>Y-axis scale</strong> in the <strong>Gauge column</strong> panel. Use <strong>Assign VPR1–N</strong> for VPR tags. Start runtime for live values.`,
          false
        );
      } else if (isPushButtonAssetPath(path)) {
        const btnId = pushButtonElementIdForCell(col, row, z);
        const mode = inferPushButtonMode(path);
        const modeLabel = mode === 'latched' ? 'Latched (click toggles BOOL)' : 'Momentary (hold while pressed)';
        updateHmiPushButtonPanel();
        showHmiSetupMsg(
          `Push button at ${formatHmiCellLabel(col, row)} Z${z} — <strong>${modeLabel}</strong>. Set shape and colors in the <strong>Push button</strong> panel. Bind BOOL <strong>fill</strong> to <code>${btnId}</code>.`,
          false
        );
      } else if (colSpan > 1 || rowSpan > 1) {
        showHmiSetupMsg(
          `Oversized graphic at ${formatHmiCellLabel(col, row)} Z${z} — spans ${colSpan}×${rowSpan} cells. Use Z0 for backgrounds; stack gauges/controls at Z1+.`,
          false
        );
      }
    };
    if (needsFullGrid) {
      hmiPreviewTilesKey = '';
      refreshHmiSetupPreview(true).then(afterPlace).catch(console.error);
    } else {
      refreshSetupTileCell(col, row, scr).then(afterPlace).catch(console.error);
    }
    refreshMainTileGrid(true);
  }

  function remapBindingsForCell(screenId, fromCol, fromRow, toCol, toRow) {
    const sid = screenId || hmiEditScreenId || hmiConfig.activeScreen;
    const fromPrefix = `t${fromCol + 1}_${fromRow + 1}_`;
    const toPrefix = `t${toCol + 1}_${toRow + 1}_`;
    for (const b of hmiConfig.bindings || []) {
      if (b.screenId !== sid) continue;
      const eid = String(b.elementId || '');
      if (eid.startsWith(fromPrefix)) {
        b.elementId = `${toPrefix}${eid.slice(fromPrefix.length)}`;
      }
    }
  }

  function moveHmiTile(fromCol, fromRow, toCol, toRow, screen) {
    const scr = screen || activeHmiScreen();
    if (!scr) return;
    const tile = ensureScreenTiles(scr).find((t) => Number(t.col) === fromCol && Number(t.row) === fromRow);
    if (!tile) return;
    const cs = tile.colSpan || 1;
    const rs = tile.rowSpan || 1;
    if (!canPlaceTileAt(scr, toCol, toRow, cs, rs, tile)) {
      alert('That area is occupied or the span does not fit. Choose empty cells or reduce span.');
      return;
    }
    clearScreenTile(scr, fromCol, fromRow);
    remapBindingsForCell(scr.id, fromCol, fromRow, toCol, toRow);
    const copy = JSON.parse(JSON.stringify(tile));
    copy.col = toCol;
    copy.row = toRow;
    ensureScreenTiles(scr).push(copy);
    syncTileLegacyFields(copy);
    markHmiDirty();
    clearHmiTileSelection();
    const afterMove = () => {
      updateHmiPreviewMeta(scr);
      refreshSetupElementIds();
      refreshHmiBindings(hmiSetupBindingRoot());
    };
    if (cs > 1 || rs > 1) {
      hmiPreviewTilesKey = '';
      refreshHmiSetupPreview(true).then(afterMove).catch(console.error);
    } else {
      Promise.all([
        refreshSetupTileCell(fromCol, fromRow, scr),
        refreshSetupTileCell(toCol, toRow, scr),
      ]).then(afterMove).catch(console.error);
    }
    refreshMainTileGrid(true);
  }

  function deleteHmiTile(col, row, screen) {
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    const scr = screen || activeHmiScreen();
    if (!scr || !getScreenTile(scr, col, row)) return;
    clearScreenTile(scr, col, row);
    markHmiDirty();
    hmiPreviewTilesKey = '';
    selectHmiAsset('');
    clearHmiTileSelection();
    clearHmiTileCellDom(col, row);
    refreshSetupTileCell(col, row, scr).then(() => {
      updateHmiPreviewMeta(scr);
      refreshSetupElementIds();
      refreshHmiBindings(hmiSetupBindingRoot());
    }).catch(console.error);
    refreshMainTileGrid(true);
  }

  function clearHmiTileCellDom(col, row) {
    const cell = setupGridCell(col, row);
    if (!cell) return;
    if (window.HmiView?.clearTileCellContent) HmiView.clearTileCellContent(cell);
    else cell.querySelectorAll('svg, img.hmi-raster, img.hmi-tile-asset, .hmi-tile-asset-wrap, .hmi-tile-stack').forEach((el) => el.remove());
    cell.classList.remove('has-tile', 'hmi-tile-selected', 'hmi-tile-drop-target');
  }

  function clearHmiTileGrid(screen) {
    const scr = screen || activeHmiScreen();
    if (!scr) return;
    scr.tiles = [];
    markHmiDirty();
    clearHmiTileSelection();
    hmiPreviewTilesKey = '';
    scheduleHmiPreview(true);
    refreshMainTileGrid(true);
  }
  function selectHmiAsset(path) {
    hmiSelectedAssetPath = path || '';
    document.querySelectorAll('.hmi-asset-tile[data-hmi-asset-path]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.hmiAssetPath === path);
    });
    if (path) {
      clearHmiTileSelection();
      if (activeHmiComposerSection() !== 'object-type') showHmiComposerSection('object-type');
    }
    updateHmiPlacementMode();
    updateHmiSelectionLabels();
  }

  function updateMainHmiTitle(screen) {
    const titleEl = domGet('hmi-screen-title');
    if (!titleEl) return;
    if (!screen) {
      titleEl.textContent = 'No screen configured — open Setup…';
      return;
    }
    if (composerPreviewUses3d(screen)) {
      titleEl.textContent = `${screenLabel(screen)} · 3D facility view`;
      return;
    }
    const n = (screen.tiles || []).length;
    const emptyHint = n === 0 ? ' · empty — open Setup to add symbols' : '';
    titleEl.textContent = `${screenLabel(screen)} · ${n} object(s)${emptyHint}`;
  }

  function hmiScreenLoadKey(screen) {
    const g = screenGridSpec(screen);
    const showGrid = hmiConfig.layout?.showGridChrome !== false;
    return `${screen.id}|${screen.svg || ''}|${tilesLayoutKey(screen)}|${g.width}|${g.height}|${g.cols}|${g.rows}|${g.cellWidth}|${g.cellHeight}|${screen.fit}|${screen.displayMaxWidth}|${screen.displayMaxHeight}|${screen.scale}|${screen.background}|${screen.offsetX}|${screen.offsetY}|grid:${showGrid}`;
  }

  /** REAL/INT: text on hmi_label; analog fill/stroke on dial/shape ids (not the grid container). */
  function coerceHmiBindingForNumericTag(b) {
    if (!b?.tagId) return b;
    const tagType = hmiBindingTagType(b.tagId);
    if (!isNumericHmiTagType(tagType)) return b;
    const out = { ...b };
    const paintProp = out.property === 'fill' || out.property === 'stroke' || out.property === 'fill5' || out.property === 'fill8';
    const needleProp = out.property === 'rotation';
    const analogPaint = isAnalogPaintBinding(out);
    const fill5Paint = out.property === 'fill5';
    const fill8Paint = out.property === 'fill8';
    const state3Paint = out.property === 'state3';

    if (!out.elementId || out.elementId === HMI_GRID_CONTAINER_ID) {
      if (hmiSelectedTileCell) {
        out.elementId = analogPaint
          ? firstShapeElementIdForCell(
            hmiSelectedTileCell.col,
            hmiSelectedTileCell.row,
            selectedHmiPlaceZ()
          )
          : needleProp
            ? firstPointerElementIdForCell(
              hmiSelectedTileCell.col,
              hmiSelectedTileCell.row,
              selectedHmiPlaceZ()
            )
            : elementIdForHmiTextCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      } else {
        const pick = preferredHmiBindingElementId();
        if (pick) out.elementId = pick;
      }
    } else if (needleProp && hmiSelectedTileCell) {
      out.elementId = firstPointerElementIdForCell(
        hmiSelectedTileCell.col,
        hmiSelectedTileCell.row,
        selectedHmiPlaceZ()
      );
      if (!Number.isFinite(Number(out.onValue))) out.onValue = 330;
      if (!Number.isFinite(Number(out.offValue))) out.offValue = 30;
    } else if (isLabelLikeBindingElement(out.elementId) && hmiSelectedTileCell && !needleProp) {
      out.elementId = elementIdForHmiTextCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
    } else if (out.property === 'text' && hmiSelectedTileCell) {
      const parsed = HmiView.parseCellElementId?.(out.elementId);
      if (!parsed || parsed.z == null) {
        out.elementId = elementIdForHmiTextCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      } else if (bindingIdMatchesSelectedCell(out.elementId)) {
        const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
        const z = textLayerZForTile(tile, parsed.z);
        if (z !== parsed.z) {
          out.elementId = elementIdForHmiTextCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, z);
        }
      }
    }

    if (paintProp && isLabelLikeBindingElement(out.elementId)) {
      out.property = 'text';
      if (!out.format) out.format = String(tagType).toUpperCase() === 'INT' ? 'int' : 'fixed2';
      delete out.onValue;
      delete out.offValue;
    } else if (fill5Paint) {
      if (!Number.isFinite(Number(out.min))) out.min = 0;
      if (!Number.isFinite(Number(out.max))) out.max = 4;
      if (!Array.isArray(out.colors) || !out.colors.length) out.colors = [...HMI_FILL5_DEFAULT_COLORS];
      if (!Array.isArray(out.flashStates) || !out.flashStates.length) out.flashStates = [2, 3];
    } else if (fill8Paint) {
      if (!Number.isFinite(Number(out.min))) out.min = 0;
      if (!Number.isFinite(Number(out.max))) out.max = 7;
      if (!Array.isArray(out.colors) || !out.colors.length) out.colors = [...HMI_FILL8_DEFAULT_COLORS];
    } else if (state3Paint) {
      if (!Number.isFinite(Number(out.min))) out.min = 0;
      if (!Number.isFinite(Number(out.max))) out.max = 2;
    } else if (analogPaint) {
      if (!Number.isFinite(Number(out.min))) out.min = 0;
      if (!Number.isFinite(Number(out.max))) out.max = 100;
      if (!out.onValue) out.onValue = '#22c55e';
      if (!out.offValue) out.offValue = '#94a3b8';
    }
    if (!out.tagField && HmiView.inferPidTagField) {
      const field = HmiView.inferPidTagField(out.elementId);
      if (field) out.tagField = field;
    }
    return out;
  }

  function repairPilotLightBindingElementId(b) {
    if (!b?.elementId) return b;
    const prop = b.property;
    if (prop !== 'fill' && prop !== 'fill5' && prop !== 'stroke') return b;
    const parsed = HmiView.parseCellElementId?.(b.elementId);
    if (!parsed || !/^shape_/i.test(String(parsed.suffix || ''))) return b;
    const z = parsed.z != null ? parsed.z : 0;
    return {
      ...b,
      elementId: HmiView.layerElementId(parsed.col, parsed.row, z, 'lamp'),
    };
  }

  function tileLayerSvgPath(tile, z) {
    if (!tile) return '';
    const layers = screenTileLayers(tile);
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const layer = layers.find((l) => Number(l.z) === zN) || layers[0];
    return layer?.svg || tile.svg || '';
  }

  function isMultiPilotTile(screen, col, row, z) {
    const tile = getScreenTile(screen, col, row);
    const layer = findPilotLightLayer(tile, z);
    if (layer?.pilotLight?.kind === 'complex') return true;
    if (layer?.pilotLight?.kind === 'simple') return false;
    const path = tileLayerSvgPath(tile, z);
    return HmiView.isMultiPilotLightAssetPath?.(path)
      || /pl_multi_(round|square|octagonal)/i.test(path);
  }

  function coerceMultiPilotFill5(b, screen) {
    if (!b?.elementId || !screen) return b;
    const parsed = HmiView.parseCellElementId?.(b.elementId);
    if (!parsed) return b;
    const z = parsed.z != null ? parsed.z : 0;
    if (!isMultiPilotTile(screen, parsed.col, parsed.row, z)) return b;
    const tagType = hmiBindingTagType(b.tagId);
    if (!isNumericHmiTagType(tagType)) return b;
    if (b.property !== 'fill' && b.property !== 'stroke') return b;
    return coerceHmiBindingForNumericTag({
      ...b,
      property: 'fill5',
      min: 0,
      max: 4,
      colors: normalizeFill5Colors(b.colors),
      flashStates: Array.isArray(b.flashStates) && b.flashStates.length ? b.flashStates : [2],
    });
  }

  function repairInvalidHmiBinding(b, tagType) {
    if (!b) return b;
    b = repairPilotLightBindingElementId(b);
    b = coerceMultiPilotFill5(b, activeHmiScreen());
    const numericHint = isNumericHmiTagType(tagType) || !!String(b.format || '').trim();
    if (b.elementId === HMI_GRID_CONTAINER_ID) {
      if (numericHint) return coerceHmiBindingForNumericTag({ ...b, tagId: b.tagId });
      return {
        ...b,
        elementId: 'lamp',
        property: b.property === 'text' ? 'fill' : (b.property || 'fill'),
      };
    }
    if (numericHint && (b.property === 'fill' || b.property === 'stroke' || b.property === 'fill5' || b.property === 'fill8')
      && isLabelLikeBindingElement(b.elementId)) {
      return coerceHmiBindingForNumericTag({ ...b, tagId: b.tagId });
    }
    if (numericHint && isAnalogPaintBinding(b)) {
      return coerceHmiBindingForNumericTag({ ...b, tagId: b.tagId });
    }
    return b;
  }

  function hmiTextBindingTargetsTileLabel(binding, col, row) {
    if (!binding || binding.property !== 'text') return false;
    return bindingTargetsCell(binding, col, row);
  }

  /** Restore staticText captions after bindings (tag-driven text uses dynamicText layers). */
  function reapplyTileCaptionLabels(root, screen, opts = {}) {
    if (!root || !screen?.tiles?.length || !window.HmiView?.applyLabelToCell) return;
    const bindings = bindingsForScreen(screen.id);
    const honorTest = !!opts.honorTestOverrides;
    const testValues = opts.testValues || {};
    for (const tile of screen.tiles) {
      const layers = screenTileLayers(tile);
      const cell = root.querySelector(
        `.hmi-tile-cell[data-col="${tile.col}"][data-row="${tile.row}"]`
      );
      if (!cell) continue;
      for (const layer of layers) {
        if (layer.kind !== 'staticText' || layer.label == null || layer.label === '') continue;
        const binding = bindings.find((b) => hmiTextBindingTargetsTileLabel(b, tile.col, tile.row));
        if (binding && honorTest) {
          const testVal = testValues[binding.tagId];
          if (testVal !== undefined && testVal !== null && testVal !== '') continue;
        }
        HmiView.applyLabelToCell(cell, layer.label, { z: layer.z, kind: 'staticText' });
      }
    }
  }

  function reapplySetupTileCaptionLabels() {
    reapplyTileCaptionLabels(hmiSetupBindingRoot(), activeHmiScreen(), {
      honorTestOverrides: true,
      testValues: hmiBindingTestValues,
    });
  }

  function repairPidFaceplateElementIds(cfg) {
    if (!cfg?.bindings?.length) return cfg;
    for (const b of cfg.bindings) {
      if (b.tagField === 'label' && /__hmi_label$/i.test(String(b.elementId || ''))) {
        b.elementId = String(b.elementId).replace(/__hmi_label$/i, '__loop_label');
      }
    }
    return cfg;
  }

  function repairPidFaceplateTagIds(cfg) {
    if (!cfg?.bindings?.length) return cfg;
    const tags = tagList();
    const pidTags = tags.filter((t) => t.type === 'PID');
    if (!pidTags.length) return cfg;
    const pidFields = new Set(['pv', 'sp', 'out', 'auto', 'manual', 'alarmHi', 'alarmLo', 'label', 'err']);
    const pidElement = /(?:loop_label|pv_value|sp_value|out_value|pv_needle|out_bar_fill|mode_auto|mode_manual|alarm_hi|alarm_lo)$/i;
    for (const b of cfg.bindings) {
      if (!b.tagField || !pidFields.has(b.tagField)) continue;
      if (!pidElement.test(String(b.elementId || ''))) continue;
      const cur = tags.find((t) => t.id === b.tagId);
      if (cur?.type === 'PID') continue;
      const owner = pidTags.find((p) => {
        const fb = p.fb || {};
        return fb.pvId === b.tagId || fb.spId === b.tagId || fb.outId === b.tagId;
      }) || pidTags[0];
      if (owner) b.tagId = owner.id;
    }
    return cfg;
  }

  function repairInvalidHmiBindings(cfg) {
    if (!cfg?.bindings?.length) return cfg;
    repairPidFaceplateElementIds(cfg);
    repairPidFaceplateTagIds(cfg);
    for (let i = 0; i < cfg.bindings.length; i++) {
      const b = cfg.bindings[i];
      const tagType = tagList().find((t) => t.id === b.tagId)?.type || '';
      if (b.elementId === HMI_GRID_CONTAINER_ID || /^t\d+_\d+_z\d+__shape_/i.test(b.elementId || '')) {
        cfg.bindings[i] = repairInvalidHmiBinding(b, tagType);
      }
    }
    return cfg;
  }

  function referenceLayoutScreen(screens) {
    const home = screens.find((s) => s.isHome || s.number === 1) || screens[0];
    if (!home) return null;
    ensureScreenGridDefaults(home);
    const stdArea = HMI_DEFAULT_WIDTH * HMI_DEFAULT_HEIGHT;
    const homeArea = (home.width || 0) * (home.height || 0);
    if (homeArea <= stdArea * 1.5) return home;
    const alt = screens.find((s) => {
      if (s.id === home.id) return false;
      const a = (s.width || 0) * (s.height || 0);
      return a > 0 && a <= stdArea * 1.5;
    });
    return alt || home;
  }

  function syncMultiPageDisplayLayout(cfg) {
    ensureHmiLayout(cfg);
  }

  function backfillBindingPaint(binding, def) {
    if (def.onValue != null && (binding.onValue == null || binding.onValue === '')) {
      binding.onValue = def.onValue;
    }
    if (def.offValue != null && (binding.offValue == null || binding.offValue === '')) {
      binding.offValue = def.offValue;
    }
    if (Array.isArray(def.colors) && def.colors.length
      && (!Array.isArray(binding.colors) || !binding.colors.length)) {
      binding.colors = [...def.colors];
    }
    if (Array.isArray(def.flashStates) && def.flashStates.length
      && (!Array.isArray(binding.flashStates) || !binding.flashStates.length)) {
      binding.flashStates = [...def.flashStates];
    }
  }

  function repairCompositeBindings(cfg) {
    if (!cfg?.screens?.length || !Array.isArray(cfg.bindings)) return cfg;
    for (const screen of cfg.screens) {
      for (const tile of screen.tiles || []) {
        const compositeId = String(tile.compositeId || '').trim();
        if (!compositeId) continue;
        const manifest = compositeManifestFromAsset(`@composite/${compositeId}`);
        if (!manifest?.defaultBindings?.length) continue;
        const col = Number(tile.col);
        const row = Number(tile.row);
        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
        const screenId = screen.id;
        const validKeys = new Set();
        const tagByRole = new Map();

        for (const def of manifest.defaultBindings) {
          const elementId = compositeBindingElementId(col, row, manifest, def);
          const tagRole = def.tagRole || 'pv';
          let tagId = tagByRole.get(tagRole);
          if (!tagId) {
            tagId = pickTagForCompositeRole(manifest, tagRole);
            tagByRole.set(tagRole, tagId);
          }
          validKeys.add(`${elementId}|${def.property}`);

          let binding = cfg.bindings.find((b) => (
            b.screenId === screenId && b.elementId === elementId && b.property === def.property
          ));
          if (!binding) {
            binding = {
              screenId,
              elementId,
              tagId: tagId || '',
              property: def.property,
              onValue: def.onValue ?? '#22c55e',
              offValue: def.offValue ?? '#94a3b8',
              format: def.format || '',
              min: def.min != null ? def.min : 0,
              max: def.max != null ? def.max : 100,
              classOn: 'hmi-on',
              classOff: 'hmi-off',
            };
            if (def.interaction) binding.interaction = def.interaction;
            if (def.colors) binding.colors = [...def.colors];
            if (def.flashStates) binding.flashStates = [...def.flashStates];
            cfg.bindings.push(binding);
            continue;
          }
          if (tagId) binding.tagId = tagId;
          if (def.format) binding.format = def.format;
          if (def.interaction) binding.interaction = def.interaction;
          if (def.min != null) binding.min = def.min;
          if (def.max != null) binding.max = def.max;
          backfillBindingPaint(binding, def);
        }

        const suffixes = new Set(manifest.defaultBindings.map((d) => d.elementId));
        cfg.bindings = cfg.bindings.filter((b) => {
          if (b.screenId !== screenId) return true;
          const suf = bindingElementSuffix(b.elementId);
          if (!suffixes.has(suf)) return true;
          const parsed = HmiView.parseCellElementId?.(b.elementId);
          if (!parsed || parsed.col !== col || parsed.row !== row) return true;
          return validKeys.has(`${b.elementId}|${b.property}`);
        });
      }
    }
    return cfg;
  }

  function bindingElementSuffix(elementId) {
    const id = String(elementId || '');
    const i = id.lastIndexOf('__');
    return i >= 0 ? id.slice(i + 2) : id;
  }

  function migrateHmiConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    for (const s of cfg.screens || []) {
      if (s?.svg) s.svg = resolveHmiAssetUrl(s.svg);
      ensureScreenTiles(s);
      ensureScreenGridDefaults(s);
      for (const tile of s.tiles || []) syncTileLegacyFields(tile);
    }
    if (window.HmiAssetPaths) window.HmiAssetPaths.migrateHmiConfigPaths(cfg);
    migrateRoomPageHotspotsToPopup(cfg);
    repairCompositeBindings(cfg);
    repairInvalidHmiBindings(cfg);
    migrateZeroBasedBindingElementIds(cfg);
    migrateBareBindingElementIds(cfg);
    ensureHmiLayout(cfg);
    return reindexHmiScreensClient(cfg);
  }

  function hmiSettingsFingerprint(hmi) {
    try {
      return JSON.stringify({
        activeScreen: hmi?.activeScreen || HOME_SCREEN_ID,
        layout: hmi.layout ? {
          c: hmi.layout.gridCols,
          r: hmi.layout.gridRows,
          w: hmi.layout.width,
          h: hmi.layout.height,
          dw: hmi.layout.displayMaxWidth,
          dh: hmi.layout.displayMaxHeight,
          fit: hmi.layout.fit,
          showGrid: hmi.layout.showGridChrome,
          showLiveStatus: hmi.layout.showLiveStatus,
          composerMode: hmi.layout.composerMode,
          roomPopup: hmi.layout.roomPopup,
          areaPopupScreens: hmi.layout.areaPopupScreens,
        } : null,
        screenCount: (hmi?.screens || []).length,
        screens: (hmi?.screens || []).map((s) => ({
          id: s.id,
          n: s.number,
          w: s.width,
          h: s.height,
          dw: s.displayMaxWidth,
          dh: s.displayMaxHeight,
          fit: s.fit,
          layout: tilesLayoutKey(s),
        })),
        bindings: (hmi?.bindings || []).length,
      });
    } catch {
      return String((hmi?.screens || []).length);
    }
  }

  function demoHmiConfig() {
    const cfg = migrateHmiConfig({
      screens: [
        {
          name: 'Home — Control graphics',
          svg: '/hmi/svg/demos/demo_controls.svg',
          tiles: [],
          width: HMI_DEFAULT_WIDTH,
          height: HMI_DEFAULT_HEIGHT,
          fit: 'contain',
          scale: 100,
          background: '#f1f5f9',
        },
        {
          name: 'Demo process',
          svg: '/hmi/svg/demos/demo_process.svg',
          tiles: [],
          width: HMI_DEFAULT_WIDTH,
          height: HMI_DEFAULT_HEIGHT,
          fit: 'contain',
          scale: 100,
          background: '#f1f5f9',
        },
      ],
      bindings: [],
    });
    cfg.bindings = [
      { screenId: 'screen_1', elementId: 'pilot_di1', tagId: 'DI1', property: 'fill', onValue: '#22c55e', offValue: '#64748b' },
      { screenId: 'screen_1', elementId: 'btn_start', tagId: 'Q1', property: 'fill', onValue: '#22c55e', offValue: '#64748b' },
      { screenId: 'screen_1', elementId: 'mb_pilot_q1', tagId: 'Q1', property: 'fill', onValue: '#22c55e', offValue: '#64748b' },
      { screenId: 'screen_1', elementId: 'label_di1', tagId: 'DI1', property: 'text', onValue: 'DI1 ON', offValue: 'DI1 OFF' },
      { screenId: 'screen_1', elementId: 'label_q1', tagId: 'Q1', property: 'text', onValue: 'Pump RUN', offValue: 'Pump STOP' },
      { screenId: 'screen_2', elementId: 'pump1', tagId: 'Q1', property: 'fill', onValue: '#22c55e', offValue: '#64748b' },
      { screenId: 'screen_2', elementId: 'pump1', tagId: 'Q1', property: 'class', classOn: 'hmi-motor-run', classOff: 'hmi-motor-stop' },
      { screenId: 'screen_2', elementId: 'valve1', tagId: 'DI1', property: 'fill', onValue: '#2563eb', offValue: '#cbd5e1' },
      { screenId: 'screen_2', elementId: 'led_di1', tagId: 'DI1', property: 'visibility' },
      { screenId: 'screen_2', elementId: 'label_di1', tagId: 'DI1', property: 'text', onValue: 'DI1 ON', offValue: 'DI1 OFF' },
      { screenId: 'screen_2', elementId: 'label_q1', tagId: 'Q1', property: 'text', onValue: 'Pump RUN', offValue: 'Pump STOP' },
    ];
    return cfg;
  }

  function defaultNewScreenAsset() {
    const assets = Array.isArray(hmiAssets) ? hmiAssets : [];
    const demoSvg = assets.find((a) => a.type === 'svg' && a.path.includes('/demos/'));
    if (demoSvg) return demoSvg;
    const anySvg = assets.find((a) => a.type === 'svg');
    if (anySvg) return anySvg;
    return { path: HMI_DEFAULT_SVG, name: 'demo_process.svg' };
  }

  function bindingsForScreen(screenId) {
    const id = screenId || currentHmiBindingScreenId();
    return (hmiConfig.bindings || []).filter((b) => (b.screenId || HOME_SCREEN_ID) === id);
  }

  function preferredHmiBindingElementId() {
    if (hmiSelectedTileCell) {
      const z = selectedHmiPlaceZ();
      const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      if (flashOverlayLayerFromTile(tile, z)) {
        return flashOverlayElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, z);
      }
      const shapeId = firstShapeElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, z);
      const root = hmiSetupBindingRoot();
      if (root && HmiView.findBindingElements(root, shapeId).length) return shapeId;
    }
    const flashHit = hmiElementIds.find((id) => id.endsWith('__flash_overlay'));
    if (flashHit) return flashHit;
    const prefer = ['hmi_label', 'lamp', 'button'];
    for (const p of prefer) {
      if (hmiElementIds.includes(p)) return p;
      const full = hmiElementIds.find((id) => id.endsWith(`__${p}`));
      if (full) return full;
    }
    const skip = new Set([HMI_GRID_CONTAINER_ID, HMI_SCREEN_BG_ELEMENT_ID]);
    return hmiElementIds.find((id) => !skip.has(id) && (!window.HmiView?.isBindableElementId || HmiView.isBindableElementId(id))) || '';
  }

  function defaultHmiBinding() {
    const tag = tagList().find((t) => t.type === 'BOOL') || tagList().find((t) => isNumericHmiTagType(t.type)) || tagList()[0];
    const flashLayer = selectedCellFlashOverlayLayer();
    const elementId = preferredHmiBindingElementId();
    const numeric = isNumericHmiTagType(tag?.type);
    const analogShape = numeric && !isLabelLikeBindingElement(elementId);
    const textBinding = numeric && isLabelLikeBindingElement(elementId);
    let property = flashLayer ? 'flashState' : (textBinding ? 'text' : 'fill');
    let fill5Defaults = null;
    if (hmiSelectedTileCell && numeric) {
      const z = selectedHmiPlaceZ();
      const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      const plLayer = findPilotLightLayer(tile, z);
      if (plLayer && pilotLightKindForLayer(plLayer) === 'complex') {
        property = 'fill5';
        fill5Defaults = {
          min: 0,
          max: 4,
          colors: normalizePilotLightComplexColors(plLayer.pilotLight?.colors),
          flashStates: [2, 3],
        };
      } else if (isMultiPilotTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row, z)) {
        property = 'fill5';
        fill5Defaults = {
          min: 0,
          max: 4,
          colors: [...HMI_FILL5_DEFAULT_COLORS],
          flashStates: [2, 3],
        };
      }
    }
    const out = {
      screenId: hmiEditScreenId || HOME_SCREEN_ID,
      elementId,
      tagId: tag?.id || '',
      property,
      onValue: flashLayer ? (flashLayer.color === 'amber' ? 'amber' : 'red') : (textBinding ? undefined : '#22c55e'),
      offValue: flashLayer ? 'hidden' : (textBinding ? undefined : '#94a3b8'),
      format: textBinding ? 'fixed2' : '',
      min: flashLayer && numeric ? 0 : (fill5Defaults?.min ?? 0),
      max: flashLayer && numeric ? 2 : (fill5Defaults?.max ?? 100),
      classOn: 'hmi-on',
      classOff: 'hmi-off',
      colors: fill5Defaults?.colors || [...HMI_FILL8_DEFAULT_COLORS],
      flashStates: fill5Defaults?.flashStates,
    };
    if (out.property !== 'flashState' && hmiSelectedTileCell && tag?.type === 'BOOL' && (out.property === 'fill' || out.property === 'stroke')) {
      const tile = getScreenTile(activeHmiScreen(), hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      const pbLayer = findPushButtonLayer(tile, selectedHmiPlaceZ());
      if (pbLayer) {
        const btnId = pushButtonElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ());
        if (btnId) out.elementId = btnId;
        out.interaction = pushButtonInteractionForMode(pushButtonModeForLayer(pbLayer));
      }
      const plLayer = findPilotLightLayer(tile, selectedHmiPlaceZ());
      if (plLayer && pilotLightKindForLayer(plLayer) === 'simple') {
        const lampId = pilotLightElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ());
        if (lampId) out.elementId = lampId;
        const pl = normalizePilotLightConfig(plLayer.pilotLight, plLayer.svg);
        out.offValue = pl.colors.off;
        out.onValue = pl.colors.on;
      }
    }
    return out;
  }

  async function loadHmiAssets(force) {
    if (!force && Array.isArray(hmiAssets) && hmiAssets.length) return hmiAssets;
    try {
      const list = await api.listHmiAssets();
      hmiAssets = (Array.isArray(list) ? list : []).map(enrichHmiAsset);
      indexHmiComposites(hmiAssets);
      window.HmiAssetPaths?.setAssetIndex?.(hmiAssets);
      sanitizeHmiRecentAssets();
      if (!hmiAssets.length) {
        throw new Error('No HMI symbols returned — use Refresh assets or check /hmi/assets on the server.');
      }
      fillHmiAssetGroupSelect();
      fillHmiAssetSubgroupSelect();
      return hmiAssets;
    } catch (e) {
      hmiAssets = [];
      throw e;
    }
  }

  function markHmiConfigReady() {
    hmiConfigReady = true;
  }

  function invalidateHmiConfigReady() {
    hmiConfigReady = false;
    hmiServerSettingsKey = '';
  }

  function hmiScreenCount(cfg) {
    return Array.isArray(cfg?.screens) ? cfg.screens.length : 0;
  }

  function serverHmiScreenCount(settingsHmi) {
    if (!settingsHmi?.screens?.length) return 0;
    return hmiScreenCount(normalizeServerHmi(settingsHmi));
  }

  /** Upgrade when the server/project snapshot has more screens (Pool, Mechanical, Kitchen, …). */
  function shouldUpgradeHmiFromServer(settingsHmi) {
    if (!settingsHmi?.screens?.length) return false;
    return serverHmiScreenCount(settingsHmi) > hmiScreenCount(hmiConfig);
  }

  function upgradeHmiFromServerIfRicher(settingsHmi) {
    if (!shouldUpgradeHmiFromServer(settingsHmi)) return false;
    const prevCount = hmiScreenCount(hmiConfig);
    const ok = applyServerHmiSettingsForced(settingsHmi);
    if (ok && hmiScreenCount(hmiConfig) > prevCount) hmiDirty = false;
    return ok;
  }

  /** Prefer the HMI snapshot with the most screens (avoid stale settings wiping Pool/Mechanical/etc.). */
  function pickRichestHmiConfig(...sources) {
    let best = null;
    let bestCount = 0;
    for (const src of sources) {
      if (!src?.screens?.length) continue;
      const migrated = migrateHmiConfig(JSON.parse(JSON.stringify(src)));
      repairInvalidHmiBindings(migrated);
      migrateBareBindingElementIds(migrated);
      const n = hmiScreenCount(migrated);
      if (n > bestCount) {
        best = migrated;
        bestCount = n;
      }
    }
    return best;
  }

  function applyPickedHmiConfig(picked) {
    if (!picked?.screens?.length) return false;
    hmiConfig = picked;
    markHmiConfigReady();
    hmiServerSettingsKey = hmiSettingsFingerprint(hmiConfig);
    d().patchLastSettings?.({ hmi: JSON.parse(JSON.stringify(hmiConfig)) });
    return true;
  }

  function hmiSetupScreenCountHint(count) {
    if (count >= 8) {
      return `${count} screen(s) in this project — e.g. Screen 5 Pool, 6 Mechanical, 7 Kitchen.`;
    }
    if (count > 1) {
      return `Only ${count} screen(s) loaded. Use Project → Open → assisted-living to load all area screens, then reopen Setup.`;
    }
    if (count === 1) {
      return 'One screen loaded. Project → Open → assisted-living loads Pool, Mechanical, Kitchen, and floor plans (22 screens).';
    }
    return 'No screens — Project → Open → assisted-living, then reopen Setup.';
  }

  function normalizeServerHmi(settingsHmi) {
    return migrateHmiConfigCopy(settingsHmi) || migrateHmiConfig({ screens: [], bindings: [] });
  }

  function migrateHmiConfigCopy(src) {
    if (!src?.screens?.length) return null;
    const cfg = migrateHmiConfig(JSON.parse(JSON.stringify(src)));
    repairInvalidHmiBindings(cfg);
    migrateBareBindingElementIds(cfg);
    return cfg;
  }

  function applyServerHmiSettingsIfChanged(settingsHmi) {
    if (!settingsHmi?.screens?.length) return false;
    const normalized = normalizeServerHmi(settingsHmi);
    const newCount = hmiScreenCount(normalized);
    const curCount = hmiScreenCount(hmiConfig);
    if (newCount < curCount) return false;
    const key = hmiSettingsFingerprint(normalized);
    if (key && key === hmiServerSettingsKey) return false;
    hmiConfig = normalized;
    hmiServerSettingsKey = key;
    markHmiConfigReady();
    hmiLoadedUrl = '';
    d().patchLastSettings?.({ hmi: JSON.parse(JSON.stringify(hmiConfig)) });
    syncLiveStatusBarVisibility();
    syncComposerModeFields(getComposerMode());
    applyComposerModeUi();
    syncHmiLiveDisplayHint();
    syncHmiScreenCatalogTo3dFrame();
    return true;
  }

  function applyServerHmiSettingsForced(settingsHmi) {
    if (!settingsHmi?.screens?.length) return false;
    const normalized = normalizeServerHmi(settingsHmi);
    const picked = pickRichestHmiConfig(normalized, hmiConfig);
    if (!applyPickedHmiConfig(picked || normalized)) return false;
    hmiLoadedUrl = '';
    syncLiveStatusBarVisibility();
    syncComposerModeFields(getComposerMode());
    applyComposerModeUi();
    syncHmiLiveDisplayHint();
    syncHmiScreenCatalogTo3dFrame();
    return true;
  }

  /** When setup opens, prefer the richest known HMI (avoid stale lastSettings wiping screens). */
  function syncHmiConfigForSetupOpen() {
    const settingsHmi = lastSettings()?.hmi;
    if (upgradeHmiFromServerIfRicher(settingsHmi)) return;
    if (hmiDirty) {
      ensureHmiConfigLoaded();
      return;
    }
    const picked = pickRichestHmiConfig(settingsHmi, hmiConfig);
    if (picked && applyPickedHmiConfig(picked)) return;
    ensureHmiConfigLoaded();
  }

  /** Re-open saved project when runtime HMI is stale (e.g. only screen 1 after reboot). */
  async function ensureFullProjectHmiLoaded() {
    if (hmiScreenCount(hmiConfig) >= 8) return false;
    const projectId = d().getActiveSavedProjectId?.();
    if (!projectId) return false;
    try {
      await api.openProject(projectId);
      const data = await d().refreshAll?.({ force: true });
      if (data?.settings?.hmi?.screens?.length) {
        applyServerHmiSettingsForced(data.settings.hmi);
      }
      return hmiScreenCount(hmiConfig) >= 8;
    } catch (e) {
      console.warn('[HMI setup] reload project screens:', e);
      return false;
    }
  }

  function ensureHmiConfigLoaded() {
    if (hmiConfig.screens?.length) {
      if (!hmiConfigReady) {
        hmiConfig = migrateHmiConfig(hmiConfig);
        repairInvalidHmiBindings(hmiConfig);
        migrateBareBindingElementIds(hmiConfig);
        markHmiConfigReady();
      }
      return;
    }
    if (lastSettings()?.hmi?.screens?.length) {
      const src = lastSettings().hmi;
      hmiConfig = migrateHmiConfig({
        activeScreen: src.activeScreen,
        layout: src.layout ? JSON.parse(JSON.stringify(src.layout)) : undefined,
        screens: [...(src.screens || [])],
        bindings: [...(src.bindings || [])],
      });
      repairInvalidHmiBindings(hmiConfig);
      migrateBareBindingElementIds(hmiConfig);
      markHmiConfigReady();
      return;
    }
    hmiConfig = demoHmiConfig();
    markHmiConfigReady();
  }

  function hoaCycleContext(cell) {
    if (cell?.closest('#hmi-setup-preview')) return 'setup';
    if (cell?.closest('#hmi-viewport')) return 'live';
    return null;
  }

  function hmiInteractionContext(el) {
    return hoaCycleContext(el?.closest?.('.hmi-tile-cell') || el);
  }

  function resolveScreenForHmiRoot(root, screenId) {
    if (root?.closest('#hmi-viewport')) return viewedHmiScreen();
    const sid = screenId || currentHmiBindingScreenId();
    return hmiConfig.screens?.find((s) => s.id === sid) || activeHmiScreen();
  }

  function hmiNavigateHandlerForRoot(root) {
    return (root?.closest('#hmi-setup-preview') && isHmiSetupOpen())
      ? navigateHmiPreviewEdit
      : navigateHmiView;
  }

  function wireHmiInteractiveControls(root, bindings, screenId) {
    const grid = tileGridFromRoot(root);
    if (!grid) return;
    const screen = resolveScreenForHmiRoot(root, screenId);
    const onNavigate = hmiNavigateHandlerForRoot(root);
    const onOpenRoom = hmiOpenRoomHandlerForRoot(root);
    HmiView.wireNavButtons?.(grid, onNavigate, onOpenRoom);
    const tagTypeFor = (tagId) => hmiBindingTagType(tagId);
    HmiView.wireHoaSwitches?.(grid, handleHoaSwitchCycle);
    HmiView.wireBoolCommandButtons?.(grid, bindings, tagTypeFor, handleBoolCommandPulse);
    HmiView.wireBoolToggleButtons?.(grid, bindings, tagTypeFor, handleBoolCommandToggle);
    HmiView.wireState3Readouts?.(grid, bindings, tagTypeFor, handleHoaSwitchCycle);
    HmiView.wireParamEditFields?.(grid, bindings, tagTypeFor, handleParamEdit);
  }

  function patchLiveTagValue(tagId, value, res) {
    const live = lastLive();
    if (!Array.isArray(live)) return;
    const idx = live.findIndex((t) => (t.tagId ?? t.id) === tagId);
    if (idx < 0) return;
    if (res?.tag) live[idx] = { ...live[idx], ...res.tag };
    else {
      live[idx] = {
        ...live[idx],
        value,
        forceOutput: false,
        forceInput: false,
        forceValue: undefined,
      };
    }
  }

  function refreshLiveHmiAfterWrite() {
    if (!isHmiViewActive() || !hmiSvgRoot) return;
    const screen = viewedHmiScreen();
    refreshHmiBindings(hmiSvgRoot, screen?.id);
  }

  function applyHmiTagWrite(tagId, value) {
    const write = () => api.setTagValue({ tagId, value }).then((res) => {
      patchLiveTagValue(tagId, value, res);
      refreshLiveHmiAfterWrite();
      return res;
    });
    if (/^TPO1_(ON_MIN|OFF_MIN|PULSE_REM)$/.test(String(tagId || ''))) {
      return api.ensureTpoTags()
        .catch(() => null)
        .then(() => write());
    }
    return write();
  }

  function tileGridFromRoot(root) {
    if (!root) return null;
    if (root.classList?.contains('hmi-tile-grid')) return root;
    return root.querySelector?.('.hmi-tile-grid') || null;
  }

  function syncHoaSwitchTagIds(root, bindings) {
    if (!root) return;
    const stage = root.closest?.('.hmi-screen-stage') || root;
    const map = new Map();
    for (const b of bindings || []) {
      if (b.property !== 'state3' || !b.tagId) continue;
      const parsed = HmiView.parseCellElementId?.(b.elementId);
      if (!parsed || parsed.col == null || parsed.row == null) continue;
      map.set(`${parsed.col},${parsed.row}`, b.tagId);
      const cell = stage.querySelector(
        `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
      );
      if (cell) cell.dataset.hoaTagId = b.tagId;
    }
    const grid = tileGridFromRoot(root) || tileGridFromRoot(stage);
    if (grid) {
      grid._hmiHoaTagByCell = map;
      HmiView.markHoaSwitchCellsInteractive?.(grid);
    }
  }

  function handleHoaSwitchCycle(tagId, nextValue, cell) {
    if (!tagId) return;
    const idx = Math.max(0, Math.min(2, Math.trunc(Number(nextValue) || 0)));
    const ctx = hoaCycleContext(cell);
    if (ctx === 'setup') {
      hmiBindingTestValues[tagId] = idx;
      if (cell) {
        cell.dataset.hoaState = String(idx);
        if (HmiView.cellHasHoaSwitchLayers?.(cell)) {
          HmiView.applyHoaSwitchState(cell, idx, tagId);
        }
      }
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
      return;
    }
    if (cell) {
      cell.dataset.hoaState = String(idx);
      if (HmiView.cellHasHoaSwitchLayers?.(cell)) {
        HmiView.applyHoaSwitchState(cell, idx, tagId);
      }
    }
    applyHmiTagWrite(tagId, idx)
      .catch((err) => {
        console.error(err);
        if (hmiSvgRoot) refreshHmiBindings(hmiSvgRoot);
      });
  }

  const hmiBoolPulseWriteChains = new Map();

  function queueHmiBoolPulseWrite(tagId, value) {
    const prev = hmiBoolPulseWriteChains.get(tagId) || Promise.resolve();
    const next = prev
      .then(() => applyHmiTagWrite(tagId, value))
      .catch((err) => {
        console.error(err);
        if (hmiSvgRoot) refreshHmiBindings(hmiSvgRoot);
      });
    hmiBoolPulseWriteChains.set(tagId, next);
    next.finally(() => {
      if (hmiBoolPulseWriteChains.get(tagId) === next) hmiBoolPulseWriteChains.delete(tagId);
    });
    return next;
  }

  function handleBoolCommandPulse(tagId, pressed, el) {
    if (!tagId) return;
    const ctx = hmiInteractionContext(el);
    if (ctx === 'setup') {
      if (pressed) hmiBindingTestValues[tagId] = true;
      else delete hmiBindingTestValues[tagId];
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
      return;
    }
    if (ctx !== 'live') return;
    queueHmiBoolPulseWrite(tagId, !!pressed);
  }

  function liveBoolTagValue(tagId) {
    const live = lastLive();
    if (!Array.isArray(live)) return false;
    const row = live.find((t) => (t.tagId ?? t.id) === tagId);
    if (!row) return false;
    const v = row.value;
    return v === true || v === 1 || v === '1';
  }

  function liveNumericTagValue(tagId) {
    const live = lastLive();
    if (!Array.isArray(live)) return 0;
    const row = live.find((t) => (t.tagId ?? t.id) === tagId);
    if (!row) return 0;
    const v = Number(row.value);
    return Number.isFinite(v) ? v : 0;
  }

  function handleParamEdit(tagId, binding, el) {
    if (!tagId || !binding) return;
    const ctx = hmiInteractionContext(el);
    const format = binding.format || 'int';
    const cur = ctx === 'setup'
      ? (hmiBindingTestValues[tagId] ?? 0)
      : liveNumericTagValue(tagId);
    const curStr = format === 'hhmm'
      ? (HmiView.hhmmFromMinutes?.(cur) || '00:00')
      : String(Math.trunc(cur));
    const label = format === 'hhmm' ? 'Time (HH:MM, 00:00–23:59)' : 'Minutes';
    const raw = window.prompt(`${label}:`, curStr);
    if (raw == null) return;
    let next;
    if (format === 'hhmm') {
      next = HmiView.parseHhmmToMinutes?.(raw);
      if (next == null) {
        window.alert('Invalid time. Use HH:MM (00:00–23:59).');
        return;
      }
    } else {
      next = Math.trunc(Number(raw));
      if (!Number.isFinite(next)) {
        window.alert('Enter a whole number of minutes.');
        return;
      }
      if (binding.min != null && Number.isFinite(Number(binding.min))) {
        next = Math.max(Number(binding.min), next);
      }
      if (binding.max != null && Number.isFinite(Number(binding.max))) {
        next = Math.min(Number(binding.max), next);
      }
    }
    if (ctx === 'setup') {
      hmiBindingTestValues[tagId] = next;
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
      return;
    }
    if (ctx !== 'live') return;
    applyHmiTagWrite(tagId, next)
      .catch((err) => {
        console.error(err);
        if (hmiSvgRoot) refreshHmiBindings(hmiSvgRoot);
      });
  }

  function handleBoolCommandToggle(tagId, el) {
    if (!tagId) return;
    const ctx = hmiInteractionContext(el);
    const next = !liveBoolTagValue(tagId);
    if (ctx === 'setup') {
      if (next) {
        hmiBindingTestValues[tagId] = true;
        if (tagId === 'MOTOR1_OFFLINE') hmiBindingTestValues.MOTOR1_STA = 4;
      } else {
        delete hmiBindingTestValues[tagId];
        if (tagId === 'MOTOR1_OFFLINE') delete hmiBindingTestValues.MOTOR1_STA;
      }
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
      return;
    }
    if (ctx !== 'live') return;
    applyHmiTagWrite(tagId, next)
      .catch((err) => {
        console.error(err);
        if (hmiSvgRoot) refreshHmiBindings(hmiSvgRoot);
      });
  }

  function resetFaceplateLayerVisibility(root) {
    const stage = root?.closest?.('.hmi-screen-stage') || root;
    if (!stage?.querySelectorAll) return;
    stage.querySelectorAll('.hmi-tile-cell').forEach((cell) => {
      if (HmiView.cellHasHoaSwitchLayers?.(cell)) return;
      cell.querySelectorAll('.hmi-tile-layer:not([data-kind="pageHotspot"]):not([data-kind="roomHotspot"]):not([data-kind="flashOverlay"])').forEach((layer) => {
        layer.style.display = '';
        layer.style.pointerEvents = '';
        layer.removeAttribute('aria-hidden');
      });
    });
  }

  function refreshHmiBindings(root, screenId) {
    const el = root || hmiSvgRoot;
    if (el) {
      resetFaceplateLayerVisibility(el);
      const sid = screenId || currentHmiBindingScreenId();
      const bindings = bindingsForScreen(sid);
      const liveMap = (el.closest('#hmi-setup-preview') && isHmiSetupOpen())
        ? hmiBindingLiveMap()
        : HmiView.liveMapFromList(lastLive());
      const hist = d().getGraphHistory?.();
      if (hist) HmiView.syncTrendBuffersFromHistory?.(hist, bindings, liveMap);
      const screen = hmiConfig.screens?.find((s) => s.id === sid) || resolveScreenForHmiRoot(el, sid);
      HmiView.applyBindings(el, bindings, liveMap);
      HmiView.applyAlarmListLayers?.(el, lastLive(), tagList(), {
        editable: !!(el.closest('#hmi-setup-preview') && isHmiSetupOpen()),
        onAck: (tagId) => {
          api.ackAlarm(tagId)
            .then((res) => {
              applyAckLiveResponse(res);
              return d().refreshAll?.({ force: true });
            })
            .catch((err) => console.error(err));
        },
      });
      syncHoaSwitchTagIds(el, bindings);
      wireHmiInteractiveControls(el, bindings, sid);
      const grid = tileGridFromRoot(el);
      if (grid && screen) {
        const onNavigate = hmiNavigateHandlerForRoot(el);
        const onPageHotspot = hmiPageHotspotNavigateHandlerForRoot(el);
        const onOpenRoom = hmiOpenRoomHandlerForRoot(el);
        HmiView.wirePageHotspotGridHits?.(grid, screen, onPageHotspot);
        HmiView.wireRoomHotspotGridHits?.(grid, screen, onOpenRoom);
        HmiView.wireNavButtons?.(grid, onNavigate, onOpenRoom);
        HmiView.markPageHotspotBackgroundsPassThrough?.(grid);
      }
      if (screen) {
        reapplyTileCaptionLabels(el, screen, el.closest('#hmi-setup-preview') && isHmiSetupOpen()
          ? { honorTestOverrides: true, testValues: hmiBindingTestValues }
          : {});
      }
    }
    refreshHmiAlarmSidebar();
    if (hmiAreaPopupScreenId) refreshHmiAreaPopupBindings();
    else if (hmiRoomPopupNum) refreshHmiRoomPopupBindings();
  }

  function isHmiEditorFocused() {
    const root = document.querySelector('[data-popup="hmi-setup"]');
    if (!root) return false;
    const ae = document.activeElement;
    return !!(ae && root.contains(ae) && ae.matches('input, select, textarea'));
  }

  function syncHmiFromFields() {
    flushHmiTileLabelFromFields();
    collectHmiBindingsFromTable();
    syncHmiScreenMetaFromFields();
  }

  function screenFromForm() {
    const screen = activeHmiScreen();
    if (!screen) return null;
    syncHmiScreenMetaFromFields();
    const layout = hmiConfig.layout || layoutFromScreen(screen);
    const svg = domGet('hmi-svg-select')?.value?.trim() || screen.svg || '';
    return {
      ...screen,
      ...layout,
      svg,
      fit: layout.fit || domGet('hmi-screen-fit')?.value || screen.fit || 'contain',
      scale: Math.max(10, Math.min(400, +(domGet('hmi-screen-scale')?.value) || screen.scale || 100)),
      background: domGet('hmi-screen-bg')?.value || screen.background || '#f1f5f9',
      offsetX: Math.max(-4096, Math.min(4096, +(domGet('hmi-screen-offset-x')?.value) || screen.offsetX || 0)),
      offsetY: Math.max(-4096, Math.min(4096, +(domGet('hmi-screen-offset-y')?.value) || screen.offsetY || 0)),
    };
  }

  function applyHmiViewerLayout() {
    const viewport = domGet('hmi-viewport');
    if (!viewport || !isHmiViewActive()) return false;
    const screen = viewedHmiScreen();
    if (!screen) return false;
    const root = tileGridRoot(viewport);
    if (!root) return false;
    HmiView.applyScreenLayout(viewport, screen, root);
    HmiView.wireNavButtons?.(root, navigateHmiView, openHmiRoomPopup);
    if (screen) {
      HmiView.wirePageHotspotGridHits?.(root, screen, navigateHmiPageHotspot);
      HmiView.wireRoomHotspotGridHits?.(root, screen, openHmiRoomPopup);
    }
    HmiView.markPageHotspotBackgroundsPassThrough?.(root);
    HmiView.wireHoaSwitches?.(root, handleHoaSwitchCycle);
    refreshHmiBindings(root, screen.id);
    updateMainHmiTitle(screen);
    return true;
  }

  function viewportHasHmiStage() {
    const viewport = domGet('hmi-viewport');
    if (!viewport) return false;
    if (composerPreviewUses3d(viewedHmiScreen())) {
      return !!viewport.querySelector('.hmi-live-3d-frame');
    }
    return !!viewport.querySelector('.hmi-screen-stage');
  }

  async function refreshHmiLive3d(force) {
    const viewport = domGet('hmi-viewport');
    if (!viewport || !isHmiViewActive()) return;
    const screen = viewedHmiScreen();
    if (!screen) {
      viewport.innerHTML = '<p class="muted">No HMI screen — open Setup to add screens.</p>';
      hmiLoadedUrl = '';
      hmiSvgRoot = null;
      updateMainHmiTitle(null);
      return;
    }
    const loadKey = hmiLive3dLoadKey();
    if (!force && hmiLoadedUrl === loadKey && viewport.querySelector('.hmi-live-3d-frame')) {
      return;
    }
    const token = ++hmiLiveLoadToken;
    viewport.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'hmi-live-3d-wrap';
    const iframe = document.createElement('iframe');
    iframe.className = 'hmi-live-3d-frame';
    iframe.title = '3D facility view';
    wrap.appendChild(iframe);
    viewport.appendChild(wrap);
    ensureHmi3dFrameLoaded(iframe);
    iframe.addEventListener('load', () => syncHmiPollConfigTo3dFrame(), { once: false });
    syncHmiPollConfigTo3dFrame();
    if (token !== hmiLiveLoadToken) return;
    hmiLoadedUrl = loadKey;
    hmiSvgRoot = null;
    syncHmiLiveDisplayHint();
    updateMainHmiTitle(screen);
    renderHmiNavBar();
    refreshHmiAlarmSidebar();
  }

  async function refreshHmiWorkspace(force) {
    const viewport = domGet('hmi-viewport');
    if (!viewport || !isHmiViewActive()) return;
    const screen = viewedHmiScreen();
    if (!screen) {
      viewport.innerHTML = '<p class="muted">No HMI screen — open Setup to add screens.</p>';
      hmiLoadedUrl = '';
      hmiSvgRoot = null;
      updateMainHmiTitle(null);
      return;
    }
    if (composerPreviewUses3d(screen)) {
      return refreshHmiLive3d(force);
    }
    ensureScreenTiles(screen);
    ensureScreenGridDefaults(screen);
    const loadKey = `${hmiScreenLoadKey(screen)}|display`;
    if (!force && hmiLoadedUrl === loadKey && tileGridRoot(viewport)) {
      applyHmiViewerLayout();
      return;
    }
    HmiView.clearTrendBuffers?.();
    const token = ++hmiLiveLoadToken;
    try {
      const { grid } = await HmiView.loadTileGridInto(viewport, screen, {
        editable: false,
        showGridChrome: false,
        onNavigate: navigateHmiView,
        onPageHotspotNavigate: navigateHmiPageHotspot,
        onOpenRoom: openHmiRoomPopup,
        onHoaCycle: handleHoaSwitchCycle,
        swap: !!viewport.querySelector('.hmi-screen-stage'),
      });
      if (token !== hmiLiveLoadToken) return;
      hmiSvgRoot = grid;
      hmiLoadedUrl = loadKey;
      refreshHmiBindings(grid, screen.id);
      refreshHmiAlarmSidebar();
      updateMainHmiTitle(screen);
      renderHmiNavBar();
      syncHmiLiveDisplayHint();
    } catch (e) {
      if (token !== hmiLiveLoadToken) return;
      viewport.innerHTML = `<p class="muted">Failed to load screen: ${esc(e.message)}</p>`;
      hmiLoadedUrl = '';
      hmiSvgRoot = null;
    }
  }

  async function loadHmiScreen(force) {
    return refreshHmiWorkspace(force);
  }

  function applyHmiPreviewLayout() {
    const viewport = setupPreviewEl();
    if (!viewport || !isHmiSetupOpen()) return false;
    const screen = screenFromForm() || activeHmiScreen();
    if (!screen) return false;
    if (hmiPreviewSvg !== hmiScreenLoadKey(screen)) return false;
    const root = tileGridRoot(viewport);
    if (!root) return false;
    HmiView.applyScreenLayout(viewport, screen, root);
    HmiView.wireNavButtons?.(root, navigateHmiPreviewEdit, hmiOpenRoomHandlerForRoot(viewport));
    if (screen) {
      HmiView.wirePageHotspotGridHits?.(root, screen, navigateHmiPreviewEdit);
      HmiView.wireRoomHotspotGridHits?.(root, screen, hmiOpenRoomHandlerForRoot(viewport));
    }
    HmiView.wireHoaSwitches?.(root, handleHoaSwitchCycle);
    refreshHmiBindings(root);
    updateHmiPreviewMeta(screen);
    return true;
  }

  function updateHmiPreviewMeta(screen) {
    const meta = domGet('hmi-preview-meta');
    if (!meta || !screen) return;
    const g = screenGridSpec(screen);
    const limX = screen.displayMaxWidth ?? screen.width ?? HMI_DEFAULT_WIDTH;
    const limY = screen.displayMaxHeight ?? screen.height ?? HMI_DEFAULT_HEIGHT;
    const fit = screen.fit || 'contain';
    const nTiles = (screen.tiles || []).length;
    meta.textContent = `${g.cols}×${g.rows} grid · ${g.cellWidth}×${g.cellHeight} px/cell · logical ${g.width}×${g.height} · display limit ${limX}×${limY} · fit ${fit} · ${nTiles} tile(s) · ${hmiElementIds.length} id(s)`;
  }

  async function refreshHmiSetupPreview(force) {
    const viewport = setupPreviewEl();
    if (!viewport) return;
    if (!force && !isHmiSetupOpen()) return;
    syncHmiScreenMetaFromFields();
    const screen = screenFromForm() || activeHmiScreen();
    const meta = domGet('hmi-preview-meta');
    if (!screen) {
      viewport.innerHTML = '<p class="muted">Select a screen to edit.</p>';
      hmiPreviewSvg = '';
      if (meta) meta.textContent = '';
      return;
    }
    ensureScreenTiles(screen);
    ensureScreenGridDefaults(screen);
    if (getComposerMode() === '3d' && composerPreviewUses3d(screen)) {
      applyComposerPreviewPanels(screen);
      if (meta) {
        meta.textContent = `3D composer · ${screenLabel(screen)} · spatial facility preview`;
      }
      return;
    }
    applyComposerPreviewPanels(screen);
    const previewKey = hmiScreenLoadKey(screen);
    if (!force && previewKey === hmiPreviewSvg && applyHmiPreviewLayout()) return;
    const token = ++hmiPreviewToken;
    try {
      const { grid } = await HmiView.loadTileGridInto(viewport, screen, {
        editable: true,
        showGridChrome: hmiConfig.layout?.showGridChrome !== false,
        onNavigate: navigateHmiPreviewEdit,
        onOpenRoom: hmiOpenRoomHandlerForRoot(viewport),
        onHoaCycle: handleHoaSwitchCycle,
        swap: !!viewport.querySelector('.hmi-screen-stage'),
      });
      if (token !== hmiPreviewToken) return;
      hmiPreviewSvg = previewKey;
      wireHmiTileCells(viewport);
      bindHmiTileGridDrop(viewport, () => activeHmiScreen());
      clearHmiPlacementCursor();
      syncHmiElementIdDatalist(viewport);
      refreshHmiBindings(grid);
      updateHmiPreviewMeta(screen);
      updateHmiNaturalSizeLabel(screen);
      highlightSelectedTileCell();
    } catch (e) {
      if (token !== hmiPreviewToken) return;
      hmiPreviewSvg = '';
      viewport.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
      if (meta) meta.textContent = '';
    }
  }

  function updateHmiNaturalSizeLabel(screen) {
    const el = domGet('hmi-natural-size');
    if (!el || !screen) return;
    const nw = screen.naturalWidth;
    const nh = screen.naturalHeight;
    el.textContent = nw && nh ? `${nw} × ${nh} (X × Y)` : '— (use Read size from file)';
  }

  function hmiTagOptions(sel) {
    const list = [...tagList()].sort((a, b) => a.id.localeCompare(b.id));
    const fmt = window.PeakLogicTagDisplay?.formatTag || ((t) => t.id);
    return `<option value="">— tag —</option>${list.map((t) =>
      `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(fmt(t, list))} (${esc(t.type)})</option>`
    ).join('')}`;
  }

  function hmiBindingTagType(tagId) {
    return tagList().find((t) => t.id === tagId)?.type || '';
  }

  function isNumericHmiTagType(type) {
    return ['INT', 'REAL', 'TIMER', 'COUNTER', 'PID', 'AVG'].includes(String(type || '').toUpperCase());
  }

  function hmiPropOptions(sel, elementId) {
    const props = elementId ? hmiBindingPropsForElement(elementId) : HMI_BINDING_PROPS;
    return props.map((p) => {
      const label = HMI_BINDING_PROP_LABELS[p] || p;
      return `<option value="${p}" ${p === sel ? 'selected' : ''}>${label}</option>`;
    }).join('');
  }

  function normalizeFill5Colors(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return HMI_FILL5_DEFAULT_COLORS.map((d, i) => {
      const c = String(src[i] ?? '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : d;
    });
  }

  function normalizeFill8Colors(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return HMI_FILL8_DEFAULT_COLORS.map((d, i) => {
      const c = String(src[i] ?? '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : d;
    });
  }

  function isLightHexColor(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    if (!m) return true;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.58;
  }

  function hmiColorPaletteOptions(selectedHex) {
    const sel = /^#[0-9a-f]{6}$/i.test(String(selectedHex || ''))
      ? selectedHex.toLowerCase()
      : HMI_FILL8_DEFAULT_COLORS[0].toLowerCase();
    const inPalette = HMI_FILL8_PALETTE.some((p) => p.hex.toLowerCase() === sel);
    const opts = HMI_FILL8_PALETTE.map((p) => {
      const on = p.hex.toLowerCase() === sel;
      const fg = isLightHexColor(p.hex) ? '#1e293b' : '#ffffff';
      return `<option value="${p.hex}" ${on ? 'selected' : ''} style="background-color:${p.hex};color:${fg}">${esc(p.label)}</option>`;
    });
    if (!inPalette) {
      const fg = isLightHexColor(sel) ? '#1e293b' : '#ffffff';
      opts.unshift(`<option value="${esc(selectedHex)}" selected style="background-color:${esc(selectedHex)};color:${fg}">${esc(selectedHex)}</option>`);
    }
    return opts.join('');
  }

  function hmiColorSelectHtml(attrName, selectedHex, title) {
    const hex = /^#[0-9a-f]{6}$/i.test(String(selectedHex || '')) ? selectedHex : '#22c55e';
    return `<select ${attrName} class="hmi-color-select" style="--hmi-fill8-swatch:${esc(hex)}" title="${esc(title || '')}">${hmiColorPaletteOptions(hex)}</select>`;
  }

  function readPaletteSlotColors(editor, count, slotAttr) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const el = editor?.querySelector(`[${slotAttr}="${i}"]`);
      out.push(el?.value || '');
    }
    return out;
  }

  function writePaletteSlotColor(editor, idx, hex, slotAttr) {
    const el = editor?.querySelector(`[${slotAttr}="${idx}"]`);
    if (el) el.value = hex;
    const slot = editor?.querySelector(`.hmi-palette-slot[data-slot="${idx}"]`);
    if (slot) slot.style.setProperty('--slot-color', hex);
  }

  function syncPaletteEditorUi(editor) {
    if (!editor) return;
    const active = Number(editor.dataset.activeSlot || 0);
    const picker = editor.querySelector('.hmi-palette-picker');
    const slotAttr = editor.dataset.slotAttr || 'data-hmi-palette-slot';
    const slotEl = editor.querySelector(`[${slotAttr}="${active}"]`);
    if (picker && slotEl) {
      picker.value = slotEl.value || HMI_FILL8_DEFAULT_COLORS[0];
      picker.style.setProperty('--hmi-fill8-swatch', picker.value);
    }
    editor.querySelectorAll('.hmi-palette-slot').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.slot) === active);
    });
  }

  function applyPalettePresetToEditor(editor, presetId) {
    const preset = HMI_BINDING_PALETTE_PRESETS.find((p) => p.id === presetId);
    if (!preset || !editor) return;
    const slotAttr = editor.dataset.slotAttr || 'data-hmi-palette-slot';
    const count = Number(editor.dataset.slotCount) || preset.colors().length;
    const colors = preset.colors().slice(0, count);
    while (colors.length < count) colors.push(HMI_FILL8_DEFAULT_COLORS[colors.length % HMI_FILL8_DEFAULT_COLORS.length]);
    colors.forEach((c, i) => writePaletteSlotColor(editor, i, c, slotAttr));
    syncPaletteEditorUi(editor);
  }

  function hmiColorPaletteEditorHtml(options) {
    const {
      mode,
      colors,
      labels = [],
      slotAttr,
    } = options;
    const count = colors.length;
    const presets = HMI_BINDING_PALETTE_PRESETS.filter((p) => p.modes.includes(mode));
    const presetOpts = `<option value="">— preset —</option>${presets.map((p) =>
      `<option value="${esc(p.id)}">${esc(p.label)}</option>`
    ).join('')}`;
    const slots = colors.map((c, i) => {
      const hex = /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : HMI_FILL8_DEFAULT_COLORS[0];
      const label = labels[i] || String(i);
      return `<button type="button" class="hmi-palette-slot${i === 0 ? ' active' : ''}" data-slot="${i}" style="--slot-color:${esc(hex)}" title="${esc(label)}"><span class="hmi-palette-slot-label">${esc(label)}</span></button>`
        + `<input type="hidden" ${slotAttr}="${i}" value="${esc(hex)}">`;
    }).join('');
    const activeHex = /^#[0-9a-f]{6}$/i.test(String(colors[0] || '')) ? colors[0] : HMI_FILL8_DEFAULT_COLORS[0];
    return `<div class="hmi-palette-editor" data-palette-mode="${esc(mode)}" data-slot-count="${count}" data-slot-attr="${esc(slotAttr)}" data-active-slot="0">
      <select class="hmi-palette-preset input-sm" title="Apply a standard color palette">${presetOpts}</select>
      <div class="hmi-palette-slots" role="group" aria-label="Palette slots">${slots}</div>
      ${hmiColorSelectHtml('class="hmi-palette-picker hmi-color-select"', activeHex, 'Color for selected slot')}
    </div>`;
  }

  function hmiFill5PaletteHtml(colors) {
    const labels = HMI_FILL5_STATE_LABELS.map((l, i) => `${i} ${l}${i === 2 || i === 3 ? ' ⚡' : ''}`);
    return hmiColorPaletteEditorHtml({
      mode: 'fill5',
      colors: normalizeFill5Colors(colors),
      labels,
      slotAttr: 'data-hmi-fill5-color',
    });
  }

  function hmiFill8PaletteHtml(colors) {
    return hmiColorPaletteEditorHtml({
      mode: 'fill8',
      colors: normalizeFill8Colors(colors),
      labels: Array.from({ length: 8 }, (_, i) => String(i)),
      slotAttr: 'data-hmi-fill8-color',
    });
  }

  function hmiText5PaletteHtml(colors, format) {
    const labels = format === 'poolBwSta'
      ? ['Idle', 'Backwash', 'Rinse', 'Return', 'Done']
      : format === 'tpoSta'
        ? ['Idle', 'Offline', 'Apply', 'Wait', 'Outside']
        : ['STOP', 'RUN', 'FAULT', 'WARN', 'OFFLINE'];
    const defaults = format === 'poolBwSta'
      ? HMI_POOL_BW_TEXT_COLORS
      : format === 'tpoSta' ? HMI_TPO_TEXT_COLORS : HMI_MOTOR_TEXT_COLORS;
    const src = Array.isArray(colors) && colors.length ? colors : defaults;
    return hmiColorPaletteEditorHtml({
      mode: 'text5',
      colors: normalizeFill5Colors(src),
      labels,
      slotAttr: 'data-hmi-text5-color',
    });
  }

  function hmiDualColorPaletteHtml(offColor, onColor) {
    return hmiColorPaletteEditorHtml({
      mode: 'dual',
      colors: [offColor, onColor],
      labels: ['OFF', 'ON'],
      slotAttr: 'data-hmi-dual-color',
    });
  }

  function hmiTrendPenColorHtml(color) {
    const hex = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : HMI_TREND_DEFAULT_COLOR;
    return `<div class="hmi-trend-pen-color">
      <span class="hmi-trend-pen-label">Pen color</span>
      ${hmiColorSelectHtml('data-hmi-trend-stroke', hex, 'Single-pen trend line color')}
      <input type="hidden" data-hmi-trend-color="0" value="${esc(hex)}">
    </div>`;
  }

  function bindHmiPaletteEditors(host) {
    if (!host || host.dataset.hmiPaletteBound === '1') return;
    host.dataset.hmiPaletteBound = '1';
    host.addEventListener('click', (e) => {
      const slot = e.target.closest('.hmi-palette-slot');
      if (!slot || !host.contains(slot)) return;
      e.preventDefault();
      const editor = slot.closest('.hmi-palette-editor');
      if (!editor) return;
      editor.dataset.activeSlot = slot.dataset.slot || '0';
      syncPaletteEditorUi(editor);
    });
    host.addEventListener('change', (e) => {
      const editor = e.target.closest('.hmi-palette-editor');
      if (!editor || !host.contains(editor)) return;
      const slotAttr = editor.dataset.slotAttr || 'data-hmi-palette-slot';
      if (e.target.matches('.hmi-palette-preset')) {
        if (e.target.value) applyPalettePresetToEditor(editor, e.target.value);
        e.target.value = '';
        markHmiDirty();
        if (editor.closest('#hmi-strip-pen-palette')) {
          onStripChartPaletteChange();
          return;
        }
        if (editor.closest('#hmi-push-button-palette')) {
          onPushButtonPaletteChange();
          return;
        }
        if (editor.closest('#hmi-pilot-light-palette')) {
          onPilotLightPaletteChange();
          return;
        }
        collectHmiBindingsFromTable();
        scheduleHmiPreview();
        return;
      }
      if (e.target.matches('.hmi-palette-picker')) {
        const idx = Number(editor.dataset.activeSlot || 0);
        const hex = e.target.value;
        writePaletteSlotColor(editor, idx, hex, slotAttr);
        syncHmiColorSelectStyles(editor);
        markHmiDirty();
        if (editor.closest('#hmi-strip-pen-palette')) {
          onStripChartPaletteChange();
          return;
        }
        if (editor.closest('#hmi-push-button-palette')) {
          onPushButtonPaletteChange();
          return;
        }
        if (editor.closest('#hmi-pilot-light-palette')) {
          onPilotLightPaletteChange();
          return;
        }
        collectHmiBindingsFromTable();
        scheduleHmiPreview();
      }
    });
  }

  function readBindingOnOffValues(tr, b) {
    const dualEditor = tr.querySelector('.hmi-palette-editor[data-palette-mode="dual"]');
    if (dualEditor) {
      return {
        offValue: dualEditor.querySelector('[data-hmi-dual-color="0"]')?.value || b.offValue,
        onValue: dualEditor.querySelector('[data-hmi-dual-color="1"]')?.value || b.onValue,
      };
    }
    const trendEditor = tr.querySelector('.hmi-trend-pen-color');
    if (trendEditor) {
      const c = trendEditor.querySelector('[data-hmi-trend-stroke]')?.value
        || trendEditor.querySelector('[data-hmi-trend-color="0"]')?.value
        || HMI_TREND_DEFAULT_COLOR;
      return { onValue: c, offValue: c };
    }
    const trendPalette = tr.querySelector('.hmi-palette-editor[data-palette-mode="single"]');
    if (trendPalette) {
      const c = trendPalette.querySelector('[data-hmi-trend-color="0"]')?.value || HMI_TREND_DEFAULT_COLOR;
      return { onValue: c, offValue: c };
    }
    const onSel = tr.querySelector('select[data-hmi-on]');
    const offSel = tr.querySelector('select[data-hmi-off]');
    const onIn = tr.querySelector('input[data-hmi-on]');
    const offIn = tr.querySelector('input[data-hmi-off]');
    return {
      onValue: onSel?.value?.trim() || onIn?.value?.trim() || b.onValue,
      offValue: offSel?.value?.trim() || offIn?.value?.trim() || b.offValue,
    };
  }

  function syncHmiColorSelectStyles(host) {
    host?.querySelectorAll('select.hmi-color-select').forEach((sel) => {
      const hex = sel.value || HMI_FILL8_DEFAULT_COLORS[0];
      sel.style.setProperty('--hmi-fill8-swatch', hex);
    });
  }

  function hmiFormatOptions(sel) {
    const cur = sel || '';
    return [
      ['', '— auto —'],
      ['int', 'int (0 decimals)'],
      ['state3', 'state3 (Auto / Off / Hand)'],
      ['state5', 'state5 (Motor status text + colors)'],
      ['fixed1', 'fixed1 (1 decimal)'],
      ['fixed2', 'fixed2 (2 decimals)'],
      ['hhmm', 'hhmm (time of day)'],
      ['tpoSta', 'tpoSta (TPO status)'],
      ['poolBwSta', 'poolBwSta (Pool backwash status)'],
    ].map(([v, label]) =>
      `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`
    ).join('');
  }

  function syncProjectLayoutFieldsFromConfig() {
    ensureHmiLayout(hmiConfig);
    const layout = hmiConfig.layout || {};
    const g = screenGridSpec(activeHmiScreen());
    if (domGet('hmi-grid-cols')) domGet('hmi-grid-cols').value = String(layout.gridCols ?? g.cols);
    if (domGet('hmi-grid-rows')) domGet('hmi-grid-rows').value = String(layout.gridRows ?? g.rows);
    fillCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 'hmi-cell-width-custom-wrap', layout.cellWidth ?? g.cellWidth);
    fillCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 'hmi-cell-height-custom-wrap', layout.cellHeight ?? g.cellHeight);
    if (domGet('hmi-screen-width')) domGet('hmi-screen-width').value = layout.width ?? g.width;
    if (domGet('hmi-screen-height')) domGet('hmi-screen-height').value = layout.height ?? g.height;
    if (domGet('hmi-screen-fit')) {
      domGet('hmi-screen-fit').value = layout.fit || 'contain';
    }
    if (domGet('hmi-display-max-width')) {
      domGet('hmi-display-max-width').value = layout.displayMaxWidth ?? layout.width ?? HMI_DEFAULT_WIDTH;
    }
    if (domGet('hmi-display-max-height')) {
      domGet('hmi-display-max-height').value = layout.displayMaxHeight ?? layout.height ?? HMI_DEFAULT_HEIGHT;
    }
    const showGrid = domGet('hmi-show-grid');
    if (showGrid) {
      if (showGrid.type === 'checkbox') {
        showGrid.checked = layout.showGridChrome !== false;
      } else {
        showGrid.value = layout.showGridChrome !== false ? 'show' : 'hide';
      }
    }
    const showLiveStatus = domGet('hmi-show-live-status');
    if (showLiveStatus) {
      if (showLiveStatus.type === 'checkbox') {
        showLiveStatus.checked = layout.showLiveStatus !== false;
      } else {
        showLiveStatus.value = layout.showLiveStatus !== false ? 'show' : 'hide';
      }
    }
    syncComposerModeFields(layout.composerMode);
    syncLiveStatusBarVisibility();
    syncLayoutPresetFromFields();
    syncLogicalPresetFromFields();
    syncDisplayPresetFromFields();
    applyComposerModeUi();
  }

  function syncHmiScreenFieldsFromConfig() {
    const screen = activeHmiScreen();
    const screenSel = domGet('hmi-screen-select');
    const screens = sortScreensByNumber(hmiConfig.screens);
    if (screenSel) {
      screenSel.innerHTML = screens.map((s) =>
        `<option value="${esc(s.id)}" ${s.id === hmiEditScreenId ? 'selected' : ''}>${esc(screenLabel(s))}</option>`
      ).join('') || '<option value="">— no screens —</option>';
    }
    const screenListHint = domGet('hmi-screen-list-hint');
    if (screenListHint) {
      screenListHint.textContent = hmiSetupScreenCountHint(screens.length);
    }
    if (domGet('hmi-screen-number') && screen) domGet('hmi-screen-number').value = String(screen.number || '');
    if (domGet('hmi-screen-name') && screen) domGet('hmi-screen-name').value = screen.name || '';
    syncProjectLayoutFieldsFromConfig();
    if (domGet('hmi-screen-scale') && screen) domGet('hmi-screen-scale').value = screen.scale ?? 100;
    if (domGet('hmi-screen-bg') && screen) {
      const bgEl = domGet('hmi-screen-bg');
      const cur = /^#[0-9a-f]{6}$/i.test(screen.background || '') ? screen.background : '#f1f5f9';
      if (bgEl.tagName === 'SELECT') {
        bgEl.innerHTML = hmiColorPaletteOptions(cur);
        bgEl.value = cur;
        bgEl.style.setProperty('--hmi-fill8-swatch', cur);
      } else {
        bgEl.value = cur;
      }
    }
    if (domGet('hmi-screen-offset-x') && screen) domGet('hmi-screen-offset-x').value = screen.offsetX ?? 0;
    if (domGet('hmi-screen-offset-y') && screen) domGet('hmi-screen-offset-y').value = screen.offsetY ?? 0;
    fillHmiSvgSelect();
    fillHmiNavTargetSelect();
    updateHmiPlaceOptionsUi();
    updateHmiNaturalSizeLabel(screen);
    const bc = domGet('hmi-binding-count');
    if (bc) bc.textContent = `(${bindingsForScreen().length})`;
    clearHmiTileSelection();
    selectHmiAsset('');
  }

  function resetHmiAssetPages() {
    hmiAssetPagesLoaded = 1;
  }

  function loadMoreHmiAssets() {
    const list = filteredHmiAssets();
    const totalPages = Math.max(1, Math.ceil(list.length / HMI_ASSET_PAGE_SIZE));
    if (hmiAssetPagesLoaded >= totalPages) return false;
    hmiAssetPagesLoaded += 1;
    return focusHmiAssetPage();
  }

  function loadPrevHmiAssets() {
    if (hmiAssetPagesLoaded <= 1) return false;
    hmiAssetPagesLoaded -= 1;
    return focusHmiAssetPage();
  }

  function focusHmiAssetPage() {
    fillHmiSvgSelect();
    const grid = domGet('hmi-asset-grid');
    const first = grid?.querySelector('[data-hmi-asset-path]');
    if (grid && first) {
      grid.focus();
      first.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }

  function bindHmiAssetPageKeys(el) {
    el?.addEventListener('keydown', (e) => {
      if (!isHmiSetupOpen()) return;
      if (e.key === 'PageDown') {
        e.preventDefault();
        loadMoreHmiAssets();
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        loadPrevHmiAssets();
      }
    });
  }

  function updateHmiAssetPager(list) {
    const btn = domGet('btn-hmi-load-more-assets');
    const totalPages = Math.max(1, Math.ceil(list.length / HMI_ASSET_PAGE_SIZE));
    if (btn) {
      btn.disabled = hmiAssetPagesLoaded >= totalPages;
      btn.textContent = hmiAssetPagesLoaded < totalPages
        ? `Next page (${hmiAssetPagesLoaded + 1}/${totalPages})`
        : 'Last page';
    }
  }

  function loadHmiRecentAssets() {
    try {
      const raw = localStorage.getItem(HMI_RECENT_ASSETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      hmiRecentAssetPaths = Array.isArray(parsed) ? parsed.map((p) => String(p || '').trim()).filter(Boolean) : [];
    } catch {
      hmiRecentAssetPaths = [];
    }
    return hmiRecentAssetPaths;
  }

  function saveHmiRecentAssets() {
    try {
      localStorage.setItem(HMI_RECENT_ASSETS_KEY, JSON.stringify(hmiRecentAssetPaths));
    } catch { /* quota / private mode */ }
  }

  function hmiAssetForRecentPath(path) {
    const p = String(path || '').trim();
    if (!p) return null;
    const hit = hmiAssetByPath(p);
    if (hit) return enrichHmiAsset(hit);
    if (isCompositeAssetPath(p)) {
      const manifest = compositeManifestFromAsset(p);
      return enrichHmiAsset({
        path: p,
        type: 'composite',
        composite: manifest || undefined,
        label: manifest?.label || p.replace(HMI_COMPOSITE_PATH_PREFIX, ''),
        preview: manifest?.preview,
      });
    }
    const resolved = resolveHmiAssetUrl(p);
    return enrichHmiAsset({
      path: resolved,
      name: resolved.split('/').pop() || resolved,
      type: /\.gif$/i.test(resolved) ? 'gif' : /\.png$/i.test(resolved) ? 'png' : 'svg',
    });
  }

  function getHmiRecentAssetList() {
    loadHmiRecentAssets();
    const seen = new Set();
    const list = [];
    for (const path of hmiRecentAssetPaths) {
      if (seen.has(path)) continue;
      seen.add(path);
      const asset = hmiAssetForRecentPath(path);
      if (asset) list.push(asset);
    }
    return list;
  }

  function collectPathsFromHmiConfig() {
    const paths = [];
    const add = (p) => {
      const s = String(p || '').trim();
      if (s && !paths.includes(s)) paths.push(s);
    };
    for (const screen of hmiConfig.screens || []) {
      for (const tile of screen.tiles || []) {
        if (tile.compositeId) add(`${HMI_COMPOSITE_PATH_PREFIX}${tile.compositeId}`);
        for (const layer of screenTileLayers(tile)) add(layer.svg);
        add(tile.svg);
      }
    }
    return paths;
  }

  function seedHmiRecentFromConfig() {
    loadHmiRecentAssets();
    const fromConfig = collectPathsFromHmiConfig();
    if (!fromConfig.length) return;
    const merged = [...hmiRecentAssetPaths];
    for (const p of fromConfig) {
      if (!merged.includes(p)) merged.push(p);
    }
    hmiRecentAssetPaths = merged.slice(0, HMI_RECENT_ASSETS_MAX);
    saveHmiRecentAssets();
  }

  function recordHmiRecentAsset(path) {
    const p = String(path || '').trim();
    if (!p) return;
    loadHmiRecentAssets();
    hmiRecentAssetPaths = [p, ...hmiRecentAssetPaths.filter((x) => x !== p)].slice(0, HMI_RECENT_ASSETS_MAX);
    saveHmiRecentAssets();
    if (domGet('hmi-asset-type')?.value === 'recent') onHmiAssetFilterChange();
    if (activeHmiComposerSection() === 'recent') fillHmiRecentAssetGrid();
  }

  function filteredHmiAssets() {
    const assets = Array.isArray(hmiAssets) ? hmiAssets : [];
    const type = domGet('hmi-asset-type')?.value || 'all';
    const group = domGet('hmi-asset-group')?.value || 'all';
    const subgroup = domGet('hmi-asset-subgroup')?.value || 'all';
    const q = (domGet('hmi-asset-search')?.value || '').trim().toLowerCase();
    const pool = type === 'recent' ? getHmiRecentAssetList() : assets;
    return pool.filter((a) => {
      if (type === 'composite' && a.type !== 'composite') return false;
      if (type !== 'all' && type !== 'composite' && type !== 'recent' && a.type !== type) return false;
      if (type === 'svg' && a.type === 'composite') return false;
      if (group !== 'all' && (a.group || inferHmiAssetMeta(a.path).group) !== group) return false;
      if (subgroup !== 'all' && (a.subgroup || '') !== subgroup) return false;
      if (hmiStripChartUnifiedFilter && isLegacyStripChartAsset(a.path)) return false;
      if (hmiGaugeColumnUnifiedFilter && isLegacyGaugeColumnAsset(a.path)) return false;
      if (hmiPushButtonUnifiedFilter && isLegacyColoredPushButtonAsset(a.path)) return false;
      if (hmiPushButtonModeFilter) {
        if (!isPushButtonAssetPath(a.path)) return false;
        if (hmiPushButtonUnifiedFilter) {
          return isCanonicalPushButtonAsset(a.path);
        }
        if (inferPushButtonMode(a.path) !== hmiPushButtonModeFilter) return false;
      }
      if (hmiPilotLightKindFilter) {
        if (!isPilotLightAssetPath(a.path)) return false;
        if (hmiPilotLightUnifiedFilter) return isCanonicalPilotLightAsset(a.path);
        if (inferPilotLightKind(a.path) !== hmiPilotLightKindFilter) return false;
      }
      if (q) {
        const hay = `${a.name} ${a.path} ${a.group || ''} ${a.subgroup || ''} ${a.vendor || ''} ${a.label || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function fillHmiAssetGroupSelect() {
    const sel = domGet('hmi-asset-group');
    if (!sel) return;
    const cur = sel.value || 'all';
    const groups = [...new Set((hmiAssets || []).map((a) => a.group || inferHmiAssetMeta(a.path).group).filter(Boolean))].sort();
    sel.innerHTML = `<option value="all">All groups (${(hmiAssets || []).length} symbols)</option>`
      + groups.map((g) => {
        const n = (hmiAssets || []).filter((a) => (a.group || inferHmiAssetMeta(a.path).group) === g).length;
        return `<option value="${esc(g)}">${esc(g)} (${n})</option>`;
      }).join('');
    sel.value = groups.includes(cur) ? cur : 'all';
  }

  function fillHmiAssetSubgroupSelect() {
    const sel = domGet('hmi-asset-subgroup');
    if (!sel) return;
    const cur = sel.value || 'all';
    const group = domGet('hmi-asset-group')?.value || 'all';
    const pool = (hmiAssets || []).filter((a) => group === 'all' || (a.group || inferHmiAssetMeta(a.path).group) === group);
    const subs = [...new Set(pool.map((a) => a.subgroup).filter(Boolean))].sort();
    sel.innerHTML = '<option value="all">All subgroups</option>'
      + subs.map((s) => {
        const n = pool.filter((a) => a.subgroup === s).length;
        return `<option value="${esc(s)}">${esc(s)} (${n})</option>`;
      }).join('');
    sel.value = subs.includes(cur) ? cur : 'all';
  }

  function applyHmiGaugeAssetFilter() {
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Gauges & meters';
    fillHmiAssetSubgroupSelect();
    if (subSel) {
      const dialOpt = [...subSel.options].find((o) => o.value === 'dial-backgrounds');
      subSel.value = dialOpt ? 'dial-backgrounds' : 'all';
    }
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'dialbg';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Filtered to Gauges & meters → dial-backgrounds (SVG). Drag gauge_dialbg_* onto the grid.');
  }

  function applyHmiCompositeFilter() {
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Gauges & meters';
    fillHmiAssetSubgroupSelect();
    if (subSel) {
      const compOpt = [...subSel.options].find((o) => o.value === 'composites');
      subSel.value = compOpt ? 'composites' : 'all';
    }
    if (typeSel) typeSel.value = 'composite';
    if (search) search.value = 'gauge_analog';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Composites: one click places dial + needle + default bindings. Pick a REAL/INT tag, Test, then Test row.');
  }

  function isPeakLogicStripChart3Pen(path) {
    return /\/peaklogic\/strip_chart_3pen/i.test(String(path || ''));
  }

  function isUnifiedStripChartSvg(path) {
    const p = String(path || '');
    if (!/\/charts-trends\/strip-charts\//i.test(p)) return false;
    if (isPeakLogicStripChart3Pen(p)) return false;
    return /strip_chart/i.test(p);
  }

  function normalizeStripChartPlacementPath(path) {
    if (!isUnifiedStripChartSvg(path)) return path;
    if (isPeakLogicStripChart3Pen(path)) return path;
    return HMI_STRIP_CHART;
  }

  function isStripChartAssetPath(path) {
    return isUnifiedStripChartSvg(path);
  }

  const PUSH_BUTTON_LATCHED_SUBGROUPS = new Set(['toggle', 'toggle-alt', 'illuminated-toggle']);
  const PUSH_BUTTON_MOMENTARY_SUBGROUPS = new Set([
    'momentary', 'pulse', 'illuminated-pulse', 'constant-0', 'constant-1',
  ]);

  function isPushButtonAssetPath(path) {
    return /\/controls\/push-buttons\//i.test(String(path || ''));
  }

  function isCanonicalPushButtonAsset(path) {
    return /\/pb-canonical\/push_button_(square|rectangle|oblong|round)\.svg$/i.test(String(path || ''));
  }

  function isLegacyColoredPushButtonAsset(path) {
    if (!isPushButtonAssetPath(path) || isCanonicalPushButtonAsset(path)) return false;
    const p = String(path || '').toLowerCase();
    if (!/\/(momentary|pulse|toggle|toggle-alt|illuminated-toggle|illuminated-pulse)\//.test(p)) return false;
    return /_(square|rectangular|oblong)_[a-z]+\.svg$/i.test(p);
  }

  function canonicalPushButtonPath(shape) {
    const s = PUSH_BUTTON_SHAPES.includes(shape) ? shape : 'square';
    return `/hmi/svg/library/controls/push-buttons/peaklogic/pb-canonical/push_button_${s}.svg`;
  }

  function normalizePushButtonPlacementPath(path) {
    if (!isPushButtonAssetPath(path)) return path;
    if (isLegacyColoredPushButtonAsset(path)) {
      return canonicalPushButtonPath(inferPushButtonShapeFromPath(path));
    }
    if (isCanonicalPushButtonAsset(path)) return path;
    return path;
  }

  const PUSH_BUTTON_COLOR_NAME_MAP = {
    aqua: '#22d3ee', blue: '#2563eb', cyan: '#06b6d4', green: '#22c55e', grey: '#64748b', gray: '#64748b',
    indigo: '#4f46e5', khaki: '#bdb76b', lime: '#84cc16', maroon: '#881337', navy: '#1e3a8a', olive: '#65a30d',
    orange: '#f97316', purple: '#9333ea', red: '#ef4444', silver: '#cbd5e1', tan: '#d2b48c', teal: '#14b8a6',
    violet: '#8b5cf6', white: '#f8fafc', yellow: '#eab308',
  };

  function inferPushButtonShapeFromPath(path) {
    const p = String(path || '').toLowerCase();
    if (isCanonicalPushButtonAsset(path)) {
      const m = p.match(/push_button_(square|rectangle|oblong|round)\.svg/);
      if (m) return m[1];
    }
    if (/_oblong_/.test(p) || /oblong/.test(p)) return 'oblong';
    if (/_rectangular_/.test(p) || /rectangular/.test(p)) return 'rectangle';
    if (/roundsymbol|_round_/.test(p)) return 'round';
    return 'square';
  }

  function inferPushButtonColorNameFromPath(path) {
    const m = String(path || '').toLowerCase().match(/_(aqua|blue|cyan|green|grey|gray|indigo|khaki|lime|maroon|navy|olive|orange|purple|red|silver|tan|teal|violet|white|yellow)\.svg$/);
    return m ? m[1] : 'green';
  }

  function inferPushButtonTextColor(backgroundHex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(backgroundHex || '').trim());
    if (!m) return PUSH_BUTTON_DEFAULT_COLORS.text;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#0f172a' : '#f8fafc';
  }

  function inferPushButtonColorsFromPath(path) {
    const background = PUSH_BUTTON_COLOR_NAME_MAP[inferPushButtonColorNameFromPath(path)]
      || PUSH_BUTTON_DEFAULT_COLORS.background;
    return {
      background,
      text: inferPushButtonTextColor(background),
      bezel: PUSH_BUTTON_DEFAULT_COLORS.bezel,
    };
  }

  function normalizePushButtonColors(raw, path) {
    const inferred = inferPushButtonColorsFromPath(path);
    const src = raw && typeof raw === 'object' ? raw : {};
    const norm = (v, fb) => {
      const c = String(v ?? '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : fb;
    };
    return {
      background: norm(src.background, inferred.background),
      text: norm(src.text, inferred.text),
      bezel: norm(src.bezel, inferred.bezel),
    };
  }

  function normalizePushButtonConfig(raw, path) {
    const shape = PUSH_BUTTON_SHAPES.includes(String(raw?.shape || '').toLowerCase())
      ? String(raw.shape).toLowerCase()
      : inferPushButtonShapeFromPath(path);
    const mode = raw?.mode === 'latched' || raw?.mode === 'momentary'
      ? raw.mode
      : inferPushButtonMode(path);
    return {
      mode,
      shape,
      colors: normalizePushButtonColors(raw?.colors, path),
    };
  }

  function pushButtonSubgroupFromPath(path) {
    const m = String(path || '').match(/\/push-buttons\/([^/]+)\//i);
    return m ? m[1].toLowerCase() : '';
  }

  function inferPushButtonMode(path) {
    const sub = pushButtonSubgroupFromPath(path);
    if (PUSH_BUTTON_LATCHED_SUBGROUPS.has(sub)) return 'latched';
    if (PUSH_BUTTON_MOMENTARY_SUBGROUPS.has(sub)) return 'momentary';
    if (/toggle/i.test(sub)) return 'latched';
    return 'momentary';
  }

  function normalizePushButtonMode(mode, path) {
    return mode === 'latched' || mode === 'momentary' ? mode : inferPushButtonMode(path);
  }

  function pushButtonInteractionForMode(mode) {
    return mode === 'latched' ? 'toggle' : 'pulse';
  }

  function findPushButtonLayer(tile, z) {
    const layers = screenTileLayers(tile);
    if (z != null) {
      const layer = layers.find((l) => l.z === z && isPushButtonAssetPath(l.svg));
      if (layer) return layer;
    }
    return layers.find((l) => isPushButtonAssetPath(l.svg)) || null;
  }

  function pushButtonModeForLayer(layer) {
    return normalizePushButtonMode(layer?.pushButton?.mode, layer?.svg || '');
  }

  function pushButtonElementIdForCell(col, row, z) {
    const pref = layerIdPrefix(col, row, z);
    const root = hmiSetupBindingRoot();
    const cell = setupGridCell(col, row);
    if (cell && HmiView.ensureCellBindingIds) {
      HmiView.ensureCellBindingIds(cell, col, row, z);
    }
    const id = elementIdForHmiCell(col, row, z, 'button');
    if (root && HmiView.findBindingElements(root, id).length) return id;
    const hit = hmiElementIds.find((eid) => eid.startsWith(pref) && eid.endsWith('__button'));
    if (hit && root && HmiView.findBindingElements(root, hit).length) return hit;
    return firstShapeElementIdForCell(col, row, z);
  }

  function isPushButtonBindingElementId(elementId) {
    return /^button$/i.test(bindingIdSuffix(elementId));
  }

  function applyPushButtonInteractionToBindingRow(row, tagType) {
    if (String(tagType || '').toUpperCase() !== 'BOOL') return;
    if (row.property !== 'fill' && row.property !== 'stroke') return;
    if (!isPushButtonBindingElementId(row.elementId)) return;
    const parsed = HmiView.parseCellElementId?.(row.elementId);
    if (!parsed || parsed.col == null || parsed.row == null) return;
    const tile = getScreenTile(activeHmiScreen(), parsed.col, parsed.row);
    const layer = findPushButtonLayer(tile, parsed.z);
    if (!layer) return;
    row.interaction = pushButtonInteractionForMode(pushButtonModeForLayer(layer));
  }

  function applyPilotLightBindingToRow(row) {
    if (!isPilotLightBindingElementId(row.elementId)) return;
    const parsed = HmiView.parseCellElementId?.(row.elementId);
    if (!parsed || parsed.col == null || parsed.row == null) return;
    const tile = getScreenTile(activeHmiScreen(), parsed.col, parsed.row);
    const layer = findPilotLightLayer(tile, parsed.z);
    if (!layer) return;
    const pl = normalizePilotLightConfig(layer.pilotLight, layer.svg);
    const property = pilotLightBindingPropertyForKind(pl.kind);
    row.property = property;
    if (property === 'fill5') {
      row.min = 0;
      row.max = 4;
      row.colors = [...pl.colors];
      row.flashStates = [2, 3];
      delete row.offValue;
      delete row.onValue;
    } else {
      row.offValue = pl.colors.off;
      row.onValue = pl.colors.on;
      delete row.colors;
      delete row.flashStates;
      delete row.min;
      delete row.max;
    }
  }

  function syncPushButtonBindingsForCell(scr, col, row, z, mode) {
    if (!scr) return;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const interaction = pushButtonInteractionForMode(mode);
    const pref = layerIdPrefix(col, row, z);
    for (const b of hmiConfig.bindings || []) {
      if (b.screenId !== sid) continue;
      if (b.property !== 'fill' && b.property !== 'stroke') continue;
      if (!String(b.elementId || '').startsWith(pref)) continue;
      if (!isPushButtonBindingElementId(b.elementId)) continue;
      b.interaction = interaction;
    }
  }

  function isLegacyStripChartAsset(path) {
    const p = String(path || '');
    if (!/\/charts-trends\/strip-charts\//i.test(p)) return false;
    if (/\/chart-strip\/strip_chart\.svg$/i.test(p)) return false;
    return /strip_chart/i.test(p);
  }

  function stripChartPenCount(layer) {
    const n = Number(layer?.stripChart?.penCount);
    return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : 1;
  }

  function findStripChartLayer(tile, z) {
    const layers = screenTileLayers(tile);
    if (z != null) {
      const layer = layers.find((l) => l.z === z && isUnifiedStripChartSvg(l.svg));
      if (layer) return layer;
    }
    return layers.find((l) => isUnifiedStripChartSvg(l.svg)) || null;
  }

  function countStripChartPensFromBindings(sid, col, row, z) {
    let max = 0;
    for (const b of hmiConfig.bindings || []) {
      if (b.screenId !== sid || b.property !== 'trend') continue;
      const eid = String(b.elementId || '');
      if (!eid.includes(`t${col + 1}_${row + 1}_`)) continue;
      const m = eid.match(/__trend_pen(\d+)$/i) || eid.match(/trend_pen(\d+)$/i);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  }

  function inferStripChartPenCount(tile, layer, sid, col, row, z) {
    const fromLayer = stripChartPenCount(layer);
    const fromBindings = countStripChartPensFromBindings(sid, col, row, z);
    return Math.max(1, Math.min(8, Math.max(fromLayer, fromBindings || 1)));
  }

  function applyHmiStripChartFilter() {
    hmiStripChartUnifiedFilter = true;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonModeFilter = null;
    hmiPushButtonUnifiedFilter = false;
    hmiPilotLightKindFilter = null;
    hmiPilotLightUnifiedFilter = false;
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Charts & trends';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'strip_chart.svg';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Strip charts: place strip_chart (1–8 pens — set count, colors, and Y-axis scale after placement). PID faceplate uses strip_chart_3pen.');
  }

  function isUnifiedGaugeColumnSvg(path) {
    const p = String(path || '');
    if (!/\/gauges-meters\/column\//i.test(p)) return false;
    return /gauge_column/i.test(p);
  }

  function normalizeGaugeColumnPlacementPath(path) {
    if (!isUnifiedGaugeColumnSvg(path)) return path;
    return HMI_GAUGE_COLUMN;
  }

  function isGaugeColumnAssetPath(path) {
    return isUnifiedGaugeColumnSvg(path);
  }

  function isLegacyGaugeColumnAsset(path) {
    const p = String(path || '');
    if (!/\/gauges-meters\/column\//i.test(p)) return false;
    if (/\/gauge-column\/gauge_column\.svg$/i.test(p)) return false;
    return /gauge_column/i.test(p);
  }

  function applyHmiGaugeColumnFilter() {
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = true;
    hmiPushButtonModeFilter = null;
    hmiPushButtonUnifiedFilter = false;
    hmiPilotLightKindFilter = null;
    hmiPilotLightUnifiedFilter = false;
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Gauges & meters';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'column';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'gauge_column.svg';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Gauge columns: place gauge_column (1–8 columns — set count, tags, colors, and Y-axis scale after placement).');
  }

  const DEFAULT_CHART_SCALE = {
    show: true,
    min: 0,
    max: 100,
    divisions: 5,
    labelColor: '#64748b',
    tickColor: '#94a3b8',
  };

  function normalizeChartScaleConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const minRaw = src.min;
    const maxRaw = src.max;
    const divisionsRaw = src.divisions;
    const min = minRaw != null && minRaw !== '' ? Number(minRaw) : NaN;
    const max = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : NaN;
    const divisions = divisionsRaw != null && divisionsRaw !== '' ? Number(divisionsRaw) : NaN;
    return {
      show: src.show !== false,
      min: Number.isFinite(min) ? min : DEFAULT_CHART_SCALE.min,
      max: Number.isFinite(max) ? max : DEFAULT_CHART_SCALE.max,
      divisions: Number.isFinite(divisions)
        ? Math.max(2, Math.min(20, Math.floor(divisions)))
        : DEFAULT_CHART_SCALE.divisions,
      labelColor: /^#[0-9a-f]{6}$/i.test(String(src.labelColor || ''))
        ? String(src.labelColor).trim()
        : DEFAULT_CHART_SCALE.labelColor,
      tickColor: /^#[0-9a-f]{6}$/i.test(String(src.tickColor || ''))
        ? String(src.tickColor).trim()
        : DEFAULT_CHART_SCALE.tickColor,
    };
  }

  function readChartScaleFromPanel(prefix) {
    const showEl = domGet(`${prefix}-scale-show`);
    return normalizeChartScaleConfig({
      show: showEl ? showEl.checked : true,
      min: domGet(`${prefix}-scale-min`)?.value,
      max: domGet(`${prefix}-scale-max`)?.value,
      divisions: domGet(`${prefix}-scale-divisions`)?.value,
      labelColor: domGet(`${prefix}-scale-label-color`)?.value,
      tickColor: domGet(`${prefix}-scale-tick-color`)?.value,
    });
  }

  function fillChartScalePanel(prefix, chartScale) {
    const scale = normalizeChartScaleConfig(chartScale);
    const showEl = domGet(`${prefix}-scale-show`);
    if (showEl) showEl.checked = scale.show;
    const minEl = domGet(`${prefix}-scale-min`);
    if (minEl) minEl.value = String(scale.min);
    const maxEl = domGet(`${prefix}-scale-max`);
    if (maxEl) maxEl.value = String(scale.max);
    const divEl = domGet(`${prefix}-scale-divisions`);
    if (divEl) divEl.value = String(scale.divisions);
    const labelColorEl = domGet(`${prefix}-scale-label-color`);
    if (labelColorEl) labelColorEl.value = scale.labelColor;
    const tickColorEl = domGet(`${prefix}-scale-tick-color`);
    if (tickColorEl) tickColorEl.value = scale.tickColor;
  }

  function syncChartScaleOnCell(col, row, chartScale, z, mode) {
    const cell = setupGridCell(col, row);
    if (!cell || !HmiView?.applyChartScale) return;
    const layerZ = z != null ? z : Number(domGet('hmi-place-z')?.value) || 0;
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layerZ}"]`);
    const svg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
    if (!svg) return;
    HmiView.applyChartScale(svg, chartScale);
    if (mode === 'strip' && HmiView.applyStripChartPenVisibility) {
      const penCount = Number(domGet('hmi-strip-pen-count')?.value) || 1;
      HmiView.applyStripChartPenVisibility(svg, penCount);
    }
    if (mode === 'gauge' && HmiView.applyGaugeColumnPenVisibility) {
      const columnCount = Number(domGet('hmi-gauge-col-count')?.value) || 1;
      HmiView.applyGaugeColumnPenVisibility(svg, columnCount);
    }
  }

  function applyHmiPushButtonMomentaryFilter() {
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonUnifiedFilter = true;
    hmiPushButtonModeFilter = 'momentary';
    hmiPilotLightKindFilter = null;
    hmiPilotLightUnifiedFilter = false;
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Controls — Push buttons';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'push_button_';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Momentary push buttons — place a canonical symbol (shape + colors in Push button panel). Bind BOOL fill to button.');
  }

  function applyHmiPushButtonLatchedFilter() {
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonUnifiedFilter = true;
    hmiPushButtonModeFilter = 'latched';
    hmiPilotLightKindFilter = null;
    hmiPilotLightUnifiedFilter = false;
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Controls — Push buttons';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'push_button_';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Latched push buttons — place a canonical symbol (shape + colors in Push button panel). Bind BOOL fill to button.');
  }

  function isPilotLightAssetPath(path) {
    return /\/controls\/pilot-lights\//i.test(String(path || ''));
  }

  function isCanonicalPilotLightAsset(path) {
    return /\/pl-canonical\/pilot_light_(round|square|octagonal)\.svg$/i.test(String(path || ''));
  }

  function isLegacyPilotLightAsset(path) {
    if (!isPilotLightAssetPath(path) || isCanonicalPilotLightAsset(path)) return false;
    const base = String(path || '').split('/').pop()?.toLowerCase() || '';
    return /^pl_(multi_)?(round|square|octagonal)\.svg$/i.test(base);
  }

  function canonicalPilotLightPath(shape) {
    const s = PILOT_LIGHT_SHAPES.includes(shape) ? shape : 'round';
    return `/hmi/svg/library/controls/pilot-lights/peaklogic/pl-canonical/pilot_light_${s}.svg`;
  }

  function inferPilotLightKind(path) {
    const p = String(path || '').toLowerCase();
    if (/pl_multi|multicolor/.test(p)) return 'complex';
    return 'simple';
  }

  function inferPilotLightShapeFromPath(path) {
    const p = String(path || '').toLowerCase();
    if (isCanonicalPilotLightAsset(path)) {
      const m = p.match(/pilot_light_(round|square|octagonal)\.svg/);
      if (m) return m[1];
    }
    if (/octagonal|_oct/.test(p)) return 'octagonal';
    if (/square/.test(p)) return 'square';
    return 'round';
  }

  function normalizePilotLightSimpleColors(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      off: normalizeHexColor(src.off, PILOT_LIGHT_DEFAULT_SIMPLE.off),
      on: normalizeHexColor(src.on, PILOT_LIGHT_DEFAULT_SIMPLE.on),
    };
  }

  function normalizePilotLightComplexColors(raw) {
    const src = Array.isArray(raw) ? raw : (raw?.colors || []);
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      out.push(normalizeHexColor(src[i], PILOT_LIGHT_DEFAULT_COMPLEX[i]));
    }
    return out;
  }

  function normalizeHexColor(raw, fallback) {
    const c = String(raw ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
  }

  function normalizePilotLightConfig(raw, path) {
    const shape = PILOT_LIGHT_SHAPES.includes(String(raw?.shape || '').toLowerCase())
      ? String(raw.shape).toLowerCase()
      : inferPilotLightShapeFromPath(path);
    const kind = raw?.kind === 'complex' || raw?.kind === 'simple'
      ? raw.kind
      : inferPilotLightKind(path);
    if (kind === 'complex') {
      return {
        kind: 'complex',
        shape,
        colors: normalizePilotLightComplexColors(raw?.colors),
      };
    }
    return {
      kind: 'simple',
      shape,
      colors: normalizePilotLightSimpleColors(raw?.colors),
    };
  }

  function normalizePilotLightPlacementPath(path) {
    if (!isPilotLightAssetPath(path)) return path;
    if (isLegacyPilotLightAsset(path)) {
      return canonicalPilotLightPath(inferPilotLightShapeFromPath(path));
    }
    if (isCanonicalPilotLightAsset(path)) return path;
    return path;
  }

  function pilotLightKindForLayer(layer) {
    return normalizePilotLightConfig(layer?.pilotLight, layer?.svg || '').kind;
  }

  function pilotLightBindingPropertyForKind(kind) {
    return kind === 'complex' ? 'fill5' : 'fill';
  }

  function findPilotLightLayer(tile, z) {
    const layers = screenTileLayers(tile);
    if (z != null) {
      const layer = layers.find((l) => l.z === z && isPilotLightAssetPath(l.svg));
      if (layer) return layer;
    }
    return layers.find((l) => isPilotLightAssetPath(l.svg)) || null;
  }

  function isPilotLightBindingElementId(elementId) {
    return /^lamp$/i.test(bindingIdSuffix(elementId));
  }

  function pilotLightElementIdForCell(col, row, z) {
    const pref = layerIdPrefix(col, row, z);
    const root = hmiSetupBindingRoot();
    const cell = setupGridCell(col, row);
    if (cell && HmiView.ensureCellBindingIds) {
      HmiView.ensureCellBindingIds(cell, col, row, z);
    }
    const id = elementIdForHmiCell(col, row, z, 'lamp');
    if (root && HmiView.findBindingElements(root, id).length) return id;
    const hit = hmiElementIds.find((eid) => eid.startsWith(pref) && eid.endsWith('__lamp'));
    if (hit && root && HmiView.findBindingElements(root, hit).length) return hit;
    return firstShapeElementIdForCell(col, row, z);
  }

  function syncPilotLightBindingsForCell(scr, col, row, z, kind) {
    if (!scr) return;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const property = pilotLightBindingPropertyForKind(kind);
    const pref = layerIdPrefix(col, row, z);
    const layer = findPilotLightLayer(getScreenTile(scr, col, row), z);
    const pl = layer ? normalizePilotLightConfig(layer.pilotLight, layer.svg) : null;
    for (const b of hmiConfig.bindings || []) {
      if (b.screenId !== sid) continue;
      if (!String(b.elementId || '').startsWith(pref)) continue;
      if (!isPilotLightBindingElementId(b.elementId)) continue;
      b.property = property;
      if (property === 'fill5' && pl) {
        b.min = 0;
        b.max = 4;
        b.colors = [...pl.colors];
        b.flashStates = [2, 3];
        delete b.offValue;
        delete b.onValue;
      } else if (property === 'fill' && pl) {
        b.offValue = pl.colors.off;
        b.onValue = pl.colors.on;
        delete b.colors;
        delete b.flashStates;
        delete b.min;
        delete b.max;
      }
    }
  }

  function hmiPilotLightPaletteHtml(pilotLight) {
    const pl = normalizePilotLightConfig(pilotLight, '');
    if (pl.kind === 'complex') {
      return hmiFill5PaletteHtml(pl.colors);
    }
    return hmiDualColorPaletteHtml(pl.colors.off, pl.colors.on);
  }

  function readPilotLightPaletteColors(kind) {
    if (kind === 'complex') {
      const editor = domGet('hmi-pilot-light-palette')?.querySelector('.hmi-palette-editor');
      return normalizeFill5Colors(readPaletteSlotColors(editor, 5, 'data-hmi-fill5-color'));
    }
    const editor = domGet('hmi-pilot-light-palette')?.querySelector('.hmi-palette-editor');
    const slots = readPaletteSlotColors(editor, 2, 'data-hmi-dual-color');
    return { off: slots[0], on: slots[1] };
  }

  function syncPilotLightStyleOnCell(col, row, pilotLight, z) {
    const cell = setupGridCell(col, row);
    if (!cell || !HmiView?.applyPilotLightStyle) return;
    const layerZ = z != null ? z : Number(domGet('hmi-place-z')?.value) || 0;
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layerZ}"]`);
    const svg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
    if (svg) HmiView.applyPilotLightStyle(svg, pilotLight);
  }

  function updateHmiPilotLightPanel() {
    const panel = domGet('hmi-pilot-light-panel');
    if (!panel) return;
    const scr = activeHmiScreen();
    if (!hmiSelectedTileCell || !scr) {
      panel.classList.add('view-hidden');
      return;
    }
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPilotLightLayer(tile, z);
    if (!layer) {
      panel.classList.add('view-hidden');
      return;
    }
    panel.classList.remove('view-hidden');
    const pl = normalizePilotLightConfig(layer.pilotLight, layer.svg);
    layer.pilotLight = pl;
    const kindSel = domGet('hmi-pilot-light-kind');
    if (kindSel) kindSel.value = pl.kind;
    const shapeSel = domGet('hmi-pilot-light-shape');
    if (shapeSel) shapeSel.value = pl.shape;
    const host = domGet('hmi-pilot-light-palette');
    if (host) {
      host.innerHTML = hmiPilotLightPaletteHtml(pl);
      bindHmiPaletteEditors(host);
    }
  }

  function onPilotLightKindChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPilotLightLayer(tile, z);
    if (!layer) return;
    const kind = domGet('hmi-pilot-light-kind')?.value === 'complex' ? 'complex' : 'simple';
    layer.pilotLight = normalizePilotLightConfig({ ...layer.pilotLight, kind }, layer.svg);
    syncPilotLightBindingsForCell(scr, col, row, layer.z ?? z, kind);
    markHmiDirty();
    renderHmiBindingsTable();
    updateHmiPilotLightPanel();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onPilotLightShapeChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPilotLightLayer(tile, z);
    if (!layer) return;
    const shape = domGet('hmi-pilot-light-shape')?.value || 'round';
    const nextShape = PILOT_LIGHT_SHAPES.includes(shape) ? shape : 'round';
    layer.pilotLight = normalizePilotLightConfig({ ...layer.pilotLight, shape: nextShape }, layer.svg);
    layer.svg = canonicalPilotLightPath(nextShape);
    syncTileLegacyFields(tile);
    markHmiDirty();
    refreshSetupTileCell(col, row, scr).then(() => {
      syncPilotLightStyleOnCell(col, row, layer.pilotLight, layer.z ?? z);
      refreshHmiBindings(hmiSetupBindingRoot());
      scheduleHmiPreview();
    }).catch(console.error);
  }

  function onPilotLightPaletteChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPilotLightLayer(tile, z);
    if (!layer) return;
    const kind = pilotLightKindForLayer(layer);
    const colors = readPilotLightPaletteColors(kind);
    layer.pilotLight = normalizePilotLightConfig({ ...layer.pilotLight, colors }, layer.svg);
    syncPilotLightBindingsForCell(scr, col, row, layer.z ?? z, kind);
    syncPilotLightStyleOnCell(col, row, layer.pilotLight, layer.z ?? z);
    markHmiDirty();
    renderHmiBindingsTable();
    scheduleHmiPreview();
  }

  function bindHmiPilotLightPanel() {
    const panel = domGet('hmi-pilot-light-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    domGet('hmi-pilot-light-kind')?.addEventListener('change', onPilotLightKindChange);
    domGet('hmi-pilot-light-shape')?.addEventListener('change', onPilotLightShapeChange);
  }

  function applyHmiPilotLightSimpleFilter() {
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonModeFilter = null;
    hmiPushButtonUnifiedFilter = false;
    hmiPilotLightUnifiedFilter = true;
    hmiPilotLightKindFilter = 'simple';
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Controls — Pilot lights';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'pilot_light_';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Simple pilot lights — BOOL off/on. Set shape and OFF/ON colors in the Pilot light panel. Bind BOOL fill to lamp.');
  }

  function applyHmiPilotLightComplexFilter() {
    hmiStripChartUnifiedFilter = false;
    hmiGaugeColumnUnifiedFilter = false;
    hmiPushButtonModeFilter = null;
    hmiPushButtonUnifiedFilter = false;
    hmiPilotLightUnifiedFilter = true;
    hmiPilotLightKindFilter = 'complex';
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Controls — Pilot lights';
    fillHmiAssetSubgroupSelect();
    if (subSel) subSel.value = 'all';
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'pilot_light_';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Complex pilot lights — 5-state INT (Off/On/Warn/Fault/Offline). Set shape and colors in the Pilot light panel. Bind INT fill5 to lamp.');
  }

  function defaultVprTagForPen(penIndex) {
    const id = `VPR${penIndex}`;
    const tag = tagList().find((t) => t.id === id && isNumericHmiTagType(t.type));
    return tag?.id || '';
  }

  function hmiStripChartTagOptions(sel) {
    const list = [...tagList()]
      .filter((t) => isNumericHmiTagType(t.type))
      .sort((a, b) => a.id.localeCompare(b.id));
    const fmt = window.PeakLogicTagDisplay?.formatTag || ((t) => t.id);
    return `<option value="">— tag —</option>${list.map((t) =>
      `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(fmt(t, list))} (${esc(t.type)})</option>`
    ).join('')}`;
  }

  function stripChartTrendBinding(sid, col, row, z, penIndex) {
    const elementId = elementIdForHmiCell(col, row, z, `trend_pen${penIndex}`);
    return (hmiConfig.bindings || []).find((b) =>
      b.screenId === sid && b.elementId === elementId && b.property === 'trend') || null;
  }

  function defaultStripChartTrendBinding(screenId, col, row, z, penIndex, tagId) {
    const elementId = elementIdForHmiCell(col, row, z, `trend_pen${penIndex}`);
    const color = HMI_FILL8_DEFAULT_COLORS[(penIndex - 1) % 8];
    const autoTag = tagId || defaultVprTagForPen(penIndex)
      || tagList().find((t) => isNumericHmiTagType(t.type))?.id || '';
    return {
      screenId,
      elementId,
      tagId: autoTag,
      property: 'trend',
      onValue: color,
      offValue: color,
      min: 0,
      max: 100,
      samples: 64,
    };
  }

  function ensureStripChartTrendBindings(scr, col, row, z, penCount) {
    if (!scr) return;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    for (let i = 1; i <= n; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `trend_pen${i}`);
      const exists = (hmiConfig.bindings || []).some((b) =>
        b.screenId === sid && b.elementId === elementId && b.property === 'trend');
      if (!exists) {
        hmiConfig.bindings.push(defaultStripChartTrendBinding(sid, col, row, z, i));
      }
    }
    for (let i = n + 1; i <= 8; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `trend_pen${i}`);
      hmiConfig.bindings = (hmiConfig.bindings || []).filter((b) =>
        !(b.screenId === sid && b.elementId === elementId && b.property === 'trend'));
    }
  }

  function readStripChartPenColors(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const pen = i + 1;
      const elementId = elementIdForHmiCell(col, row, z, `trend_pen${pen}`);
      const b = (hmiConfig.bindings || []).find((x) =>
        x.screenId === sid && x.elementId === elementId && x.property === 'trend');
      const c = String(b?.onValue || '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : HMI_FILL8_DEFAULT_COLORS[i];
    });
  }

  function tagTrendScaleRange(tagId) {
    const tag = tagList().find((t) => t.id === tagId);
    if (!tag) return null;
    const ol = Number(tag.alarmOuterLow);
    const oh = Number(tag.alarmOuterHigh);
    if (Number.isFinite(ol) && Number.isFinite(oh) && oh !== ol) {
      return { min: ol, max: oh };
    }
    const il = Number(tag.alarmInnerLow);
    const ih = Number(tag.alarmInnerHigh);
    if (Number.isFinite(il) && Number.isFinite(ih) && ih !== il) {
      return { min: il, max: ih };
    }
    return null;
  }

  function stripChartTagScaleHintHtml(tagId, useTagScale) {
    if (!useTagScale) return '';
    const range = tagTrendScaleRange(tagId);
    if (!range) {
      return '<span class="hmi-strip-scale-hint muted">Tag scale on — set alarm OL and OH on the tag</span>';
    }
    return `<span class="hmi-strip-scale-hint muted">Scale ${range.min} – ${range.max} (tag OL/OH)</span>`;
  }

  function readStripChartPenUseTagScale(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const b = stripChartTrendBinding(sid, col, row, z, i + 1);
      return !!b?.useTagScale;
    });
  }

  function applyStripChartPenUseTagScale(sid, col, row, z, flags, penCount) {
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    for (let i = 1; i <= n; i++) {
      const b = stripChartTrendBinding(sid, col, row, z, i);
      if (!b) continue;
      b.useTagScale = !!flags[i - 1];
    }
  }

  function readStripChartPenTags(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const b = stripChartTrendBinding(sid, col, row, z, i + 1);
      return String(b?.tagId || '').trim();
    });
  }

  function applyStripChartPenTags(sid, col, row, z, tagIds, penCount) {
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    for (let i = 1; i <= n; i++) {
      const b = stripChartTrendBinding(sid, col, row, z, i);
      if (!b) continue;
      b.tagId = String(tagIds[i - 1] || '').trim();
    }
  }

  function applyStripChartPenColors(sid, col, row, z, colors, penCount) {
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    for (let i = 1; i <= n; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `trend_pen${i}`);
      const b = (hmiConfig.bindings || []).find((x) =>
        x.screenId === sid && x.elementId === elementId && x.property === 'trend');
      if (!b) continue;
      const hex = colors[i - 1];
      if (/^#[0-9a-f]{6}$/i.test(String(hex || ''))) {
        b.onValue = hex;
        b.offValue = hex;
      }
    }
  }

  function syncStripChartPenVisibilityOnCell(col, row, penCount, z) {
    const cell = setupGridCell(col, row);
    if (!cell || !HmiView?.applyStripChartPenVisibility) return;
    const layerZ = z != null ? z : Number(domGet('hmi-place-z')?.value) || 0;
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layerZ}"]`);
    const svg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
    if (svg) HmiView.applyStripChartPenVisibility(svg, penCount);
  }

  function hmiStripChartPenTagsHtml(sid, col, row, z, penCount) {
    const tags = readStripChartPenTags(sid, col, row, z);
    const useTagScales = readStripChartPenUseTagScale(sid, col, row, z);
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    return Array.from({ length: 8 }, (_, i) => {
      const pen = i + 1;
      const inactive = pen > n;
      const tagId = tags[i];
      const useTagScale = useTagScales[i];
      return `<div class="hmi-strip-pen-tag-row${inactive ? ' hmi-strip-pen-tag-inactive' : ''}" data-pen="${pen}">
        <span class="hmi-strip-pen-tag-label">Pen ${pen}</span>
        <select class="input-sm" data-hmi-strip-pen-tag="${pen}" title="Tag for trend_pen${pen}"${inactive ? ' disabled' : ''}>${hmiStripChartTagOptions(tagId)}</select>
        <label class="hmi-strip-pen-use-tag-scale" title="Use tag alarm outer low / outer high for strip chart scale">
          <input type="checkbox" data-hmi-strip-pen-use-tag-scale="${pen}"${useTagScale ? ' checked' : ''}${inactive ? ' disabled' : ''}>
          <span>Tag scale</span>
        </label>
        ${stripChartTagScaleHintHtml(tagId, useTagScale)}
      </div>`;
    }).join('');
  }

  function syncStripChartPenTagsInactive(host, penCount) {
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    host?.querySelectorAll('.hmi-strip-pen-tag-row').forEach((row) => {
      const pen = Number(row.dataset.pen);
      const inactive = pen > n;
      row.classList.toggle('hmi-strip-pen-tag-inactive', inactive);
      const sel = row.querySelector('select[data-hmi-strip-pen-tag]');
      if (sel) sel.disabled = inactive;
      const scaleCb = row.querySelector('[data-hmi-strip-pen-use-tag-scale]');
      if (scaleCb) scaleCb.disabled = inactive;
    });
  }

  function hmiStripChartPenPaletteHtml(colors) {
    const labels = Array.from({ length: 8 }, (_, i) => `Pen ${i + 1}`);
    return hmiColorPaletteEditorHtml({
      mode: 'strip8',
      colors: normalizeFill8Colors(colors),
      labels,
      slotAttr: 'data-hmi-strip-pen-color',
    });
  }

  function syncStripChartPaletteInactive(host, penCount) {
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    host?.querySelectorAll('.hmi-palette-slot').forEach((btn) => {
      const slot = Number(btn.dataset.slot);
      btn.classList.toggle('hmi-palette-slot-inactive', slot >= n);
      btn.disabled = slot >= n;
    });
  }

  function updateHmiStripChartPanel() {
    const panel = domGet('hmi-strip-chart-panel');
    if (!panel) return;
    const scr = activeHmiScreen();
    if (!hmiSelectedTileCell || !scr) {
      panel.classList.add('view-hidden');
      return;
    }
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) {
      panel.classList.add('view-hidden');
      return;
    }
    panel.classList.remove('view-hidden');
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const penCount = inferStripChartPenCount(tile, layer, sid, col, row, lz);
    if (!layer.stripChart) layer.stripChart = { penCount, chartScale: normalizeChartScaleConfig() };
    else {
      layer.stripChart.penCount = penCount;
      if (!layer.stripChart.chartScale) layer.stripChart.chartScale = normalizeChartScaleConfig();
    }
    const penSel = domGet('hmi-strip-pen-count');
    if (penSel) penSel.value = String(penCount);
    fillChartScalePanel('hmi-strip', layer.stripChart.chartScale);
    const tagHost = domGet('hmi-strip-pen-tags');
    if (tagHost) {
      tagHost.innerHTML = hmiStripChartPenTagsHtml(sid, col, row, lz, penCount);
      tagHost.dataset.penCount = String(penCount);
      syncStripChartPenTagsInactive(tagHost, penCount);
    }
    const colors = readStripChartPenColors(sid, col, row, lz);
    const host = domGet('hmi-strip-pen-palette');
    if (host) {
      host.innerHTML = hmiStripChartPenPaletteHtml(colors);
      host.dataset.penCount = String(penCount);
      syncStripChartPaletteInactive(host, penCount);
      bindHmiPaletteEditors(host);
    }
  }

  function gaugeColumnCount(layer) {
    const n = Number(layer?.gaugeColumn?.columnCount);
    return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : 1;
  }

  function findGaugeColumnLayer(tile, z) {
    const layers = screenTileLayers(tile);
    if (z != null) {
      const layer = layers.find((l) => l.z === z && isUnifiedGaugeColumnSvg(l.svg));
      if (layer) return layer;
    }
    return layers.find((l) => isUnifiedGaugeColumnSvg(l.svg)) || null;
  }

  function countGaugeColumnsFromBindings(sid, col, row, z) {
    let max = 0;
    for (const b of hmiConfig.bindings || []) {
      if (b.screenId !== sid || b.property !== 'fill') continue;
      const parsed = HmiView.parseCellElementId?.(b.elementId);
      if (!parsed || parsed.col !== col || parsed.row !== row || (parsed.z ?? 0) !== (z ?? 0)) continue;
      const m = String(b.elementId || '').match(/gauge_col(\d+)/i);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  }

  function inferGaugeColumnCount(tile, layer, sid, col, row, z) {
    const fromLayer = gaugeColumnCount(layer);
    const fromBindings = countGaugeColumnsFromBindings(sid, col, row, z);
    return Math.max(1, Math.min(8, Math.max(fromLayer, fromBindings || 1)));
  }

  function gaugeColumnFillBinding(sid, col, row, z, colIndex) {
    const elementId = elementIdForHmiCell(col, row, z, `gauge_col${colIndex}`);
    return (hmiConfig.bindings || []).find((b) =>
      b.screenId === sid && b.elementId === elementId && b.property === 'fill') || null;
  }

  function defaultGaugeColumnFillBinding(screenId, col, row, z, colIndex, tagId) {
    const elementId = elementIdForHmiCell(col, row, z, `gauge_col${colIndex}`);
    const color = HMI_FILL8_DEFAULT_COLORS[(colIndex - 1) % 8];
    const empty = '#e2e8f0';
    const autoTag = tagId || defaultVprTagForPen(colIndex)
      || tagList().find((t) => isNumericHmiTagType(t.type))?.id || '';
    return {
      screenId,
      elementId,
      tagId: autoTag,
      property: 'fill',
      onValue: color,
      offValue: empty,
      min: 0,
      max: 100,
    };
  }

  function ensureGaugeColumnFillBindings(scr, col, row, z, columnCount) {
    if (!scr) return;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    for (let i = 1; i <= n; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `gauge_col${i}`);
      const exists = (hmiConfig.bindings || []).some((b) =>
        b.screenId === sid && b.elementId === elementId && b.property === 'fill');
      if (!exists) {
        hmiConfig.bindings.push(defaultGaugeColumnFillBinding(sid, col, row, z, i));
      }
    }
    for (let i = n + 1; i <= 8; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `gauge_col${i}`);
      hmiConfig.bindings = (hmiConfig.bindings || []).filter((b) =>
        !(b.screenId === sid && b.elementId === elementId && b.property === 'fill'));
    }
  }

  function readGaugeColumnColors(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const colIndex = i + 1;
      const elementId = elementIdForHmiCell(col, row, z, `gauge_col${colIndex}`);
      const b = (hmiConfig.bindings || []).find((x) =>
        x.screenId === sid && x.elementId === elementId && x.property === 'fill');
      const c = String(b?.onValue || '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : HMI_FILL8_DEFAULT_COLORS[i];
    });
  }

  function readGaugeColumnUseTagScale(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const b = gaugeColumnFillBinding(sid, col, row, z, i + 1);
      return !!b?.useTagScale;
    });
  }

  function applyGaugeColumnUseTagScale(sid, col, row, z, flags, columnCount) {
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    for (let i = 1; i <= n; i++) {
      const b = gaugeColumnFillBinding(sid, col, row, z, i);
      if (!b) continue;
      b.useTagScale = !!flags[i - 1];
    }
  }

  function readGaugeColumnTags(sid, col, row, z) {
    return Array.from({ length: 8 }, (_, i) => {
      const b = gaugeColumnFillBinding(sid, col, row, z, i + 1);
      return String(b?.tagId || '').trim();
    });
  }

  function applyGaugeColumnTags(sid, col, row, z, tagIds, columnCount) {
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    for (let i = 1; i <= n; i++) {
      const b = gaugeColumnFillBinding(sid, col, row, z, i);
      if (!b) continue;
      b.tagId = String(tagIds[i - 1] || '').trim();
    }
  }

  function applyGaugeColumnColors(sid, col, row, z, colors, columnCount) {
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    for (let i = 1; i <= n; i++) {
      const elementId = elementIdForHmiCell(col, row, z, `gauge_col${i}`);
      const b = (hmiConfig.bindings || []).find((x) =>
        x.screenId === sid && x.elementId === elementId && x.property === 'fill');
      if (!b) continue;
      const hex = colors[i - 1];
      if (/^#[0-9a-f]{6}$/i.test(String(hex || ''))) b.onValue = hex;
      if (!/^#[0-9a-f]{6}$/i.test(String(b.offValue || ''))) b.offValue = '#e2e8f0';
    }
  }

  function syncGaugeColumnVisibilityOnCell(col, row, columnCount, z) {
    const cell = setupGridCell(col, row);
    if (!cell || !HmiView?.applyGaugeColumnPenVisibility) return;
    const layerZ = z != null ? z : Number(domGet('hmi-place-z')?.value) || 0;
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layerZ}"]`);
    const svg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
    if (svg) HmiView.applyGaugeColumnPenVisibility(svg, columnCount);
  }

  function hmiGaugeColumnTagsHtml(sid, col, row, z, columnCount) {
    const tags = readGaugeColumnTags(sid, col, row, z);
    const useTagScales = readGaugeColumnUseTagScale(sid, col, row, z);
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    return Array.from({ length: 8 }, (_, i) => {
      const colNum = i + 1;
      const inactive = colNum > n;
      const tagId = tags[i];
      const useTagScale = useTagScales[i];
      return `<div class="hmi-strip-pen-tag-row${inactive ? ' hmi-strip-pen-tag-inactive' : ''}" data-col="${colNum}">
        <span class="hmi-strip-pen-tag-label">Col ${colNum}</span>
        <select class="input-sm" data-hmi-gauge-col-tag="${colNum}" title="Tag for gauge_col${colNum}"${inactive ? ' disabled' : ''}>${hmiStripChartTagOptions(tagId)}</select>
        <label class="hmi-strip-pen-use-tag-scale" title="Use tag alarm outer low / outer high for column scale">
          <input type="checkbox" data-hmi-gauge-col-use-tag-scale="${colNum}"${useTagScale ? ' checked' : ''}${inactive ? ' disabled' : ''}>
          <span>Tag scale</span>
        </label>
        ${stripChartTagScaleHintHtml(tagId, useTagScale)}
      </div>`;
    }).join('');
  }

  function syncGaugeColumnTagsInactive(host, columnCount) {
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    host?.querySelectorAll('.hmi-strip-pen-tag-row').forEach((row) => {
      const colNum = Number(row.dataset.col);
      const inactive = colNum > n;
      row.classList.toggle('hmi-strip-pen-tag-inactive', inactive);
      const sel = row.querySelector('select[data-hmi-gauge-col-tag]');
      if (sel) sel.disabled = inactive;
      const scaleCb = row.querySelector('[data-hmi-gauge-col-use-tag-scale]');
      if (scaleCb) scaleCb.disabled = inactive;
    });
  }

  function hmiGaugeColumnPaletteHtml(colors) {
    const labels = Array.from({ length: 8 }, (_, i) => `Col ${i + 1}`);
    return hmiColorPaletteEditorHtml({
      mode: 'strip8',
      colors: normalizeFill8Colors(colors),
      labels,
      slotAttr: 'data-hmi-gauge-col-color',
    });
  }

  function syncGaugeColumnPaletteInactive(host, columnCount) {
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    host?.querySelectorAll('.hmi-palette-slot').forEach((btn) => {
      const slot = Number(btn.dataset.slot);
      btn.classList.toggle('hmi-palette-slot-inactive', slot >= n);
      btn.disabled = slot >= n;
    });
  }

  function updateHmiGaugeColumnPanel() {
    const panel = domGet('hmi-gauge-column-panel');
    if (!panel) return;
    const scr = activeHmiScreen();
    if (!hmiSelectedTileCell || !scr) {
      panel.classList.add('view-hidden');
      return;
    }
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) {
      panel.classList.add('view-hidden');
      return;
    }
    panel.classList.remove('view-hidden');
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const columnCount = inferGaugeColumnCount(tile, layer, sid, col, row, lz);
    if (!layer.gaugeColumn) layer.gaugeColumn = { columnCount, chartScale: normalizeChartScaleConfig() };
    else {
      layer.gaugeColumn.columnCount = columnCount;
      if (!layer.gaugeColumn.chartScale) layer.gaugeColumn.chartScale = normalizeChartScaleConfig();
    }
    const colSel = domGet('hmi-gauge-col-count');
    if (colSel) colSel.value = String(columnCount);
    fillChartScalePanel('hmi-gauge', layer.gaugeColumn.chartScale);
    const tagHost = domGet('hmi-gauge-col-tags');
    if (tagHost) {
      tagHost.innerHTML = hmiGaugeColumnTagsHtml(sid, col, row, lz, columnCount);
      tagHost.dataset.columnCount = String(columnCount);
      syncGaugeColumnTagsInactive(tagHost, columnCount);
    }
    const colors = readGaugeColumnColors(sid, col, row, lz);
    const host = domGet('hmi-gauge-col-palette');
    if (host) {
      host.innerHTML = hmiGaugeColumnPaletteHtml(colors);
      host.dataset.columnCount = String(columnCount);
      syncGaugeColumnPaletteInactive(host, columnCount);
      bindHmiPaletteEditors(host);
    }
  }

  function hmiPushButtonPaletteHtml(colors) {
    const c = normalizePushButtonColors(colors, '');
    return hmiColorPaletteEditorHtml({
      mode: 'push3',
      colors: [c.background, c.text, c.bezel],
      labels: ['Background', 'Text', 'Bezel'],
      slotAttr: 'data-hmi-push-color',
    });
  }

  function readPushButtonPaletteColors() {
    const editor = domGet('hmi-push-button-palette')?.querySelector('.hmi-palette-editor');
    const slots = readPaletteSlotColors(editor, 3, 'data-hmi-push-color');
    return {
      background: slots[0],
      text: slots[1],
      bezel: slots[2],
    };
  }

  function syncPushButtonStyleOnCell(col, row, pushButton, z) {
    const cell = setupGridCell(col, row);
    if (!cell || !HmiView?.applyPushButtonStyle) return;
    const layerZ = z != null ? z : Number(domGet('hmi-place-z')?.value) || 0;
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layerZ}"]`);
    const svg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
    if (svg) HmiView.applyPushButtonStyle(svg, pushButton);
  }

  function updateHmiPushButtonPanel() {
    const panel = domGet('hmi-push-button-panel');
    if (!panel) return;
    const scr = activeHmiScreen();
    if (!hmiSelectedTileCell || !scr) {
      panel.classList.add('view-hidden');
      return;
    }
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPushButtonLayer(tile, z);
    if (!layer) {
      panel.classList.add('view-hidden');
      return;
    }
    panel.classList.remove('view-hidden');
    const pb = normalizePushButtonConfig(layer.pushButton, layer.svg);
    layer.pushButton = pb;
    const modeSel = domGet('hmi-push-button-mode');
    if (modeSel) modeSel.value = pb.mode;
    const shapeSel = domGet('hmi-push-button-shape');
    if (shapeSel) shapeSel.value = pb.shape;
    const host = domGet('hmi-push-button-palette');
    if (host) {
      host.innerHTML = hmiPushButtonPaletteHtml(pb.colors);
      bindHmiPaletteEditors(host);
    }
  }

  function onPushButtonModeChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPushButtonLayer(tile, z);
    if (!layer) return;
    const mode = domGet('hmi-push-button-mode')?.value === 'latched' ? 'latched' : 'momentary';
    layer.pushButton = normalizePushButtonConfig({ ...layer.pushButton, mode }, layer.svg);
    syncPushButtonBindingsForCell(scr, col, row, layer.z ?? z, mode);
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onPushButtonShapeChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPushButtonLayer(tile, z);
    if (!layer) return;
    const shape = domGet('hmi-push-button-shape')?.value || 'square';
    const nextShape = PUSH_BUTTON_SHAPES.includes(shape) ? shape : 'square';
    layer.pushButton = normalizePushButtonConfig({ ...layer.pushButton, shape: nextShape }, layer.svg);
    layer.svg = canonicalPushButtonPath(nextShape);
    syncTileLegacyFields(tile);
    markHmiDirty();
    refreshSetupTileCell(col, row, scr).then(() => {
      syncPushButtonStyleOnCell(col, row, layer.pushButton, layer.z ?? z);
      refreshHmiBindings(hmiSetupBindingRoot());
      scheduleHmiPreview();
    }).catch(console.error);
  }

  function onPushButtonPaletteChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findPushButtonLayer(tile, z);
    if (!layer) return;
    const colors = readPushButtonPaletteColors();
    layer.pushButton = normalizePushButtonConfig({ ...layer.pushButton, colors }, layer.svg);
    syncPushButtonStyleOnCell(col, row, layer.pushButton, layer.z ?? z);
    markHmiDirty();
    scheduleHmiPreview();
  }

  function bindHmiPushButtonPanel() {
    const panel = domGet('hmi-push-button-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    domGet('hmi-push-button-mode')?.addEventListener('change', onPushButtonModeChange);
    domGet('hmi-push-button-shape')?.addEventListener('change', onPushButtonShapeChange);
  }

  function onStripChartPenCountChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const penCount = Math.max(1, Math.min(8, Number(domGet('hmi-strip-pen-count')?.value) || 1));
    const chartScale = readChartScaleFromPanel('hmi-strip');
    layer.stripChart = { penCount, chartScale };
    layer.svg = normalizeStripChartPlacementPath(layer.svg);
    ensureStripChartTrendBindings(scr, col, row, lz, penCount);
    const tagHost = domGet('hmi-strip-pen-tags');
    if (tagHost) {
      tagHost.innerHTML = hmiStripChartPenTagsHtml(scr.id || hmiEditScreenId || HOME_SCREEN_ID, col, row, lz, penCount);
      tagHost.dataset.penCount = String(penCount);
      syncStripChartPenTagsInactive(tagHost, penCount);
    }
    const host = domGet('hmi-strip-pen-palette');
    if (host) {
      host.dataset.penCount = String(penCount);
      syncStripChartPaletteInactive(host, penCount);
    }
    markHmiDirty();
    renderHmiBindingsTable();
    syncStripChartPenVisibilityOnCell(col, row, penCount, lz);
    syncChartScaleOnCell(col, row, chartScale, lz, 'strip');
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onStripChartPenTagChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const penCount = Number(domGet('hmi-strip-pen-tags')?.dataset.penCount)
      || stripChartPenCount(layer);
    const tagHost = domGet('hmi-strip-pen-tags');
    const tagIds = Array.from({ length: 8 }, (_, i) => {
      const pen = i + 1;
      return tagHost?.querySelector(`[data-hmi-strip-pen-tag="${pen}"]`)?.value?.trim() || '';
    });
    const useTagScales = Array.from({ length: 8 }, (_, i) => {
      const pen = i + 1;
      return !!tagHost?.querySelector(`[data-hmi-strip-pen-use-tag-scale="${pen}"]`)?.checked;
    });
    ensureStripChartTrendBindings(scr, col, row, lz, penCount);
    applyStripChartPenTags(sid, col, row, lz, tagIds, penCount);
    applyStripChartPenUseTagScale(sid, col, row, lz, useTagScales, penCount);
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
    if (tagHost) {
      tagHost.querySelectorAll('.hmi-strip-pen-tag-row').forEach((row) => {
        const pen = Number(row.dataset.pen);
        if (!pen) return;
        const tagId = tagHost.querySelector(`[data-hmi-strip-pen-tag="${pen}"]`)?.value?.trim() || '';
        const useTagScale = !!tagHost.querySelector(`[data-hmi-strip-pen-use-tag-scale="${pen}"]`)?.checked;
        const hint = row.querySelector('.hmi-strip-scale-hint');
        if (hint) hint.outerHTML = stripChartTagScaleHintHtml(tagId, useTagScale);
      });
    }
  }

  function autoAssignVprTagsToStripChart() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const penCount = Number(domGet('hmi-strip-pen-count')?.value)
      || stripChartPenCount(layer);
    ensureStripChartTrendBindings(scr, col, row, lz, penCount);
    const tagIds = Array.from({ length: 8 }, (_, i) => defaultVprTagForPen(i + 1));
    applyStripChartPenTags(sid, col, row, lz, tagIds, penCount);
    updateHmiStripChartPanel();
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
    showHmiSetupMsg(`Assigned VPR1–VPR${penCount} to strip chart pens.`, false);
  }

  function onStripChartPaletteChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const penCount = Number(domGet('hmi-strip-pen-palette')?.dataset.penCount)
      || stripChartPenCount(layer);
    const editor = domGet('hmi-strip-pen-palette')?.querySelector('.hmi-palette-editor');
    const colors = readPaletteSlotColors(editor, 8, 'data-hmi-strip-pen-color');
    applyStripChartPenColors(sid, col, row, lz, colors, penCount);
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onStripChartScaleChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findStripChartLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const penCount = stripChartPenCount(layer);
    const chartScale = readChartScaleFromPanel('hmi-strip');
    layer.stripChart = { penCount, chartScale };
    markHmiDirty();
    syncChartScaleOnCell(col, row, chartScale, lz, 'strip');
    scheduleHmiPreview();
  }

  function onGaugeColumnCountChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const columnCount = Math.max(1, Math.min(8, Number(domGet('hmi-gauge-col-count')?.value) || 1));
    const chartScale = readChartScaleFromPanel('hmi-gauge');
    layer.gaugeColumn = { columnCount, chartScale };
    layer.svg = normalizeGaugeColumnPlacementPath(layer.svg);
    ensureGaugeColumnFillBindings(scr, col, row, lz, columnCount);
    const tagHost = domGet('hmi-gauge-col-tags');
    if (tagHost) {
      tagHost.innerHTML = hmiGaugeColumnTagsHtml(scr.id || hmiEditScreenId || HOME_SCREEN_ID, col, row, lz, columnCount);
      tagHost.dataset.columnCount = String(columnCount);
      syncGaugeColumnTagsInactive(tagHost, columnCount);
    }
    const host = domGet('hmi-gauge-col-palette');
    if (host) {
      host.dataset.columnCount = String(columnCount);
      syncGaugeColumnPaletteInactive(host, columnCount);
    }
    markHmiDirty();
    renderHmiBindingsTable();
    syncGaugeColumnVisibilityOnCell(col, row, columnCount, lz);
    syncChartScaleOnCell(col, row, chartScale, lz, 'gauge');
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onGaugeColumnTagChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const columnCount = Number(domGet('hmi-gauge-col-tags')?.dataset.columnCount)
      || gaugeColumnCount(layer);
    const tagHost = domGet('hmi-gauge-col-tags');
    const tagIds = Array.from({ length: 8 }, (_, i) => {
      const colNum = i + 1;
      return tagHost?.querySelector(`[data-hmi-gauge-col-tag="${colNum}"]`)?.value?.trim() || '';
    });
    const useTagScales = Array.from({ length: 8 }, (_, i) => {
      const colNum = i + 1;
      return !!tagHost?.querySelector(`[data-hmi-gauge-col-use-tag-scale="${colNum}"]`)?.checked;
    });
    ensureGaugeColumnFillBindings(scr, col, row, lz, columnCount);
    applyGaugeColumnTags(sid, col, row, lz, tagIds, columnCount);
    applyGaugeColumnUseTagScale(sid, col, row, lz, useTagScales, columnCount);
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
    if (tagHost) {
      tagHost.querySelectorAll('.hmi-strip-pen-tag-row').forEach((row) => {
        const colNum = Number(row.dataset.col);
        if (!colNum) return;
        const tagId = tagHost.querySelector(`[data-hmi-gauge-col-tag="${colNum}"]`)?.value?.trim() || '';
        const useTagScale = !!tagHost.querySelector(`[data-hmi-gauge-col-use-tag-scale="${colNum}"]`)?.checked;
        const hint = row.querySelector('.hmi-strip-scale-hint');
        if (hint) hint.outerHTML = stripChartTagScaleHintHtml(tagId, useTagScale);
      });
    }
  }

  function autoAssignVprTagsToGaugeColumn() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const columnCount = Number(domGet('hmi-gauge-col-count')?.value)
      || gaugeColumnCount(layer);
    ensureGaugeColumnFillBindings(scr, col, row, lz, columnCount);
    const tagIds = Array.from({ length: 8 }, (_, i) => defaultVprTagForPen(i + 1));
    applyGaugeColumnTags(sid, col, row, lz, tagIds, columnCount);
    updateHmiGaugeColumnPanel();
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
    showHmiSetupMsg(`Assigned VPR1–VPR${columnCount} to gauge columns.`, false);
  }

  function onGaugeColumnPaletteChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const sid = scr.id || hmiEditScreenId || HOME_SCREEN_ID;
    const columnCount = Number(domGet('hmi-gauge-col-palette')?.dataset.columnCount)
      || gaugeColumnCount(layer);
    const editor = domGet('hmi-gauge-col-palette')?.querySelector('.hmi-palette-editor');
    const colors = readPaletteSlotColors(editor, 8, 'data-hmi-gauge-col-color');
    applyGaugeColumnColors(sid, col, row, lz, colors, columnCount);
    markHmiDirty();
    renderHmiBindingsTable();
    refreshHmiBindings(hmiSetupBindingRoot());
    scheduleHmiPreview();
  }

  function onGaugeColumnScaleChange() {
    const scr = activeHmiScreen();
    if (!scr || !hmiSelectedTileCell) return;
    const { col, row } = hmiSelectedTileCell;
    const tile = getScreenTile(scr, col, row);
    const z = Number(domGet('hmi-place-z')?.value) || 0;
    const layer = findGaugeColumnLayer(tile, z);
    if (!layer) return;
    const lz = layer.z ?? 0;
    const columnCount = gaugeColumnCount(layer);
    const chartScale = readChartScaleFromPanel('hmi-gauge');
    layer.gaugeColumn = { columnCount, chartScale };
    markHmiDirty();
    syncChartScaleOnCell(col, row, chartScale, lz, 'gauge');
    scheduleHmiPreview();
  }

  function bindHmiStripChartPanel() {
    const panel = domGet('hmi-strip-chart-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    domGet('hmi-strip-pen-count')?.addEventListener('change', onStripChartPenCountChange);
    domGet('btn-hmi-strip-auto-vpr')?.addEventListener('click', autoAssignVprTagsToStripChart);
    panel.querySelectorAll('[data-hmi-strip-scale]').forEach((el) => {
      el.addEventListener('change', onStripChartScaleChange);
      el.addEventListener('input', onStripChartScaleChange);
    });
    panel.addEventListener('change', (e) => {
      if (e.target.matches('[data-hmi-strip-pen-tag]') || e.target.matches('[data-hmi-strip-pen-use-tag-scale]')) {
        onStripChartPenTagChange();
        return;
      }
      if (e.target.closest('#hmi-strip-pen-palette')) onStripChartPaletteChange();
    });
    bindHmiPaletteEditors(panel);
  }

  function bindHmiGaugeColumnPanel() {
    const panel = domGet('hmi-gauge-column-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    domGet('hmi-gauge-col-count')?.addEventListener('change', onGaugeColumnCountChange);
    domGet('btn-hmi-gauge-auto-vpr')?.addEventListener('click', autoAssignVprTagsToGaugeColumn);
    panel.querySelectorAll('[data-hmi-gauge-scale]').forEach((el) => {
      el.addEventListener('change', onGaugeColumnScaleChange);
      el.addEventListener('input', onGaugeColumnScaleChange);
    });
    panel.addEventListener('change', (e) => {
      if (e.target.matches('[data-hmi-gauge-col-tag]') || e.target.matches('[data-hmi-gauge-col-use-tag-scale]')) {
        onGaugeColumnTagChange();
        return;
      }
      if (e.target.closest('#hmi-gauge-col-palette')) onGaugeColumnPaletteChange();
    });
    bindHmiPaletteEditors(panel);
  }

  function applyHmiGaugePointerFilter() {
    const groupSel = domGet('hmi-asset-group');
    const subSel = domGet('hmi-asset-subgroup');
    const typeSel = domGet('hmi-asset-type');
    const search = domGet('hmi-asset-search');
    if (groupSel) groupSel.value = 'Gauges & meters';
    fillHmiAssetSubgroupSelect();
    if (subSel) {
      const ptrOpt = [...subSel.options].find((o) => o.value === 'dial-pointers');
      subSel.value = ptrOpt ? 'dial-pointers' : 'all';
    }
    if (typeSel) typeSel.value = 'svg';
    if (search) search.value = 'dialpointer';
    onHmiAssetFilterChange();
    showHmiSetupMsg('Filtered to Gauges & meters → dial-pointers (SVG). Place gauge_dialpointer_* on Z1 over a dial at Z0.');
  }

  function onHmiAssetFilterChange() {
    fillHmiAssetSubgroupSelect();
    resetHmiAssetPages();
    fillHmiSvgSelect();
  }

  function getPagedHmiAssets() {
    const assets = Array.isArray(hmiAssets) ? hmiAssets : [];
    const screen = activeHmiScreen();
    const cur = screen?.svg || domGet('hmi-svg-select')?.value || '';
    const list = filteredHmiAssets();
    const totalPages = Math.max(1, Math.ceil(list.length / HMI_ASSET_PAGE_SIZE));
    if (hmiAssetPagesLoaded > totalPages) hmiAssetPagesLoaded = totalPages;
    const pageStart = (hmiAssetPagesLoaded - 1) * HMI_ASSET_PAGE_SIZE;
    let shown = list.slice(pageStart, pageStart + HMI_ASSET_PAGE_SIZE);
    if (cur && !shown.some((a) => a.path === cur)) {
      const curAsset = assets.find((a) => a.path === cur)
        || { path: cur, name: cur.split('/').pop() || cur, type: 'svg' };
      shown = [curAsset, ...shown.filter((a) => a.path !== cur)];
    }
    return { assets, list, shown, cur, totalPages, pageStart };
  }

  function updateHmiAssetHint(list, totalPages, pageStart, shown, assets) {
    const hint = domGet('hmi-asset-hint');
    if (!hint) return;
    const pageEnd = Math.min(pageStart + shown.length, list.length);
    if (list.length) {
      hint.textContent = `${list.length} match(es) · ${assets.length} total · page ${hmiAssetPagesLoaded}/${totalPages} · items ${pageStart + 1}–${pageEnd} · PgUp/PgDn to change page`;
      return;
    }
    hint.textContent = `${assets.length} total · none match filter`;
  }

  let hmiBindingTestValues = {};

  function hmiSetupBindingRoot() {
    const viewport = setupPreviewEl();
    return tileGridRoot(viewport) || viewport?.querySelector('.hmi-screen-stage') || null;
  }

  function mergeHmiBindingTestEntry(liveMap, tagId, val) {
    const base = liveMap[tagId] || tagList().find((t) => t.id === tagId);
    if (base?.type === 'PID') {
      const n = Number(val);
      const fb = { ...(base.fb || {}) };
      if (Number.isFinite(n)) {
        fb.pv = n;
        fb.sp = n;
        fb.out = n;
      }
      return {
        ...base,
        tagId,
        type: 'PID',
        value: Number.isFinite(n) ? n : val,
        fb,
      };
    }
    return { ...(base || {}), tagId, value: val };
  }

  function hmiBindingLiveMap() {
    const liveMap = HmiView.liveMapFromList(lastLive());
    if (!isHmiSetupOpen()) return liveMap;
    for (const [tagId, val] of Object.entries(hmiBindingTestValues)) {
      if (val === undefined || val === null || val === '') continue;
      liveMap[tagId] = mergeHmiBindingTestEntry(liveMap, tagId, val);
    }
    return liveMap;
  }

  function showHmiSetupMsg(text, isWarn) {
    const el = domGet('hmi-setup-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('warn', !!isWarn);
  }

  function validateHmiBindingTestRow(tr) {
    const elementInput = tr?.querySelector('[data-hmi-element]');
    let elementId = elementInput?.value?.trim();
    const tagId = tr?.querySelector('[data-hmi-tag]')?.value?.trim();
    const property = tr?.querySelector('[data-hmi-prop]')?.value || 'fill';
    if (!elementId) return 'Enter an element id (e.g. hmi_label or lamp).';
    if (!tagId) return 'Select a tag for this binding row.';
    if (elementId === HMI_GRID_CONTAINER_ID) {
      const tagType = hmiBindingTagType(tagId);
      if (isNumericHmiTagType(tagType)) {
        if (property === 'fill' || property === 'stroke') {
          return `Tag ${tagId}: use a dial/shape id (e.g. dial_face), not ${HMI_GRID_CONTAINER_ID}. Set min/max, OFF/ON colors, test value, then Test.`;
        }
        return `Tag ${tagId}: bind hmi_label for numeric text (not ${HMI_GRID_CONTAINER_ID}). Property text, format, test value, then Test.`;
      }
      return `${HMI_GRID_CONTAINER_ID} is the grid container — use hmi_label, lamp, or another symbol id from autocomplete.`;
    }
    const resolvedId = tryResolveBindingElementId(elementId, property);
    if (resolvedId !== elementId && elementInput) {
      elementInput.value = resolvedId;
      elementId = resolvedId;
      collectHmiBindingsFromTable();
    }
    const root = hmiSetupBindingRoot();
    if (root && window.HmiView?.findBindingElements) {
      const els = HmiView.findBindingElements(root, elementId);
      if (!els.length) {
        const parsed = HmiView.parseCellElementId?.(elementId);
        const selHint = hmiSelectedTileCell
          ? `selected cell ${formatHmiCellLabel(hmiSelectedTileCell.col, hmiSelectedTileCell.row)} layer Z${selectedHmiPlaceZ()}`
          : 'the selected cell';
        let extra = '';
        if (parsed && hmiSelectedTileCell
          && (parsed.col !== hmiSelectedTileCell.col || parsed.row !== hmiSelectedTileCell.row)) {
          extra = ` Id "${elementId}" is for cell ${formatHmiCellLabel(parsed.col, parsed.row)}, not ${formatHmiCellLabel(hmiSelectedTileCell.col, hmiSelectedTileCell.row)} — click the pipe cell, then Test (e.g. ${firstShapeElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ())}).`;
        }
        if (property === 'text') {
          return `No text target on ${selHint}. Click the cell and Test again (adds a value overlay), or place a digits SVG on a Dynamic text layer.${extra}`;
        }
        const paint = property === 'fill' || property === 'stroke' || property === 'fill5' || property === 'fill8';
        let hint = '';
        if (paint) {
          hint = ' Place an SVG dial-background (e.g. gauge_dialbg_silver.svg) at Z0, click that cell, then Test.';
          if (hmiSelectedTileCell) {
            hint += ` Try id ${firstShapeElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ())}.`;
          }
        } else if (property === 'rotation') {
          hint = ' Place gauge_dialpointer_*.svg on Z1 (Dial pointers filter), click that cell, then Test.';
          if (hmiSelectedTileCell) {
            hint += ` Try id ${firstPointerElementIdForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ())}.`;
          }
        }
        return `Symbol not found for id "${elementId}". Click the gauge cell, then Test.${hint}${extra}`;
      }
    }
    const tagType = hmiBindingTagType(tagId);
    if (isNumericHmiTagType(tagType) && property !== 'text' && property !== 'opacity' && property !== 'fill5' && property !== 'fill8'
      && property !== 'state3' && property !== 'fill' && property !== 'stroke' && property !== 'rotation' && property !== 'trend' && property !== 'flashState') {
      return `Numeric tag ${tagId}: use text, fill/stroke, pilot state (5), HOA position (3), fill8, rotation (needle), trend (strip chart), flash overlay, or opacity.`;
    }
    if (property === 'trend' && isNumericHmiTagType(tagType)) {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) {
        return 'Enter a test number in the Test column, then click Test (or start runtime for live trace).';
      }
    }
    if (property === 'rotation' && isNumericHmiTagType(tagType)) {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) return 'Enter a test number in the Test column, then click Test.';
    }
    if (property === 'text' && isNumericHmiTagType(tagType)) {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) return 'Enter a test number in the Test column, then click Test.';
    }
    if (property === 'text' && tagType === 'BOOL') {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) return 'Choose OFF or ON in the Test column, then click Test.';
    }
    if (property === 'text' && tagType && !isNumericHmiTagType(tagType) && tagType !== 'BOOL') {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) return 'Enter a test value in the Test column, then click Test.';
    }
    if (tagType === 'BOOL' && property !== 'text') {
      const entry = readHmiBindingTestFromRow(tr);
      if (!entry || entry.clear) return 'Choose OFF or ON in the test dropdown, then click Test.';
    }
    return '';
  }

  function applyHmiBindingsToSetupPreview() {
    collectHmiBindingsFromTable();
    const root = hmiSetupBindingRoot();
    if (!root) {
      showHmiSetupMsg('Grid preview not ready — place a symbol on the grid first.', true);
      return null;
    }
    const bindings = bindingsForScreen();
    if (!bindings.length) {
      showHmiSetupMsg('No bindings — add a row with element id + tag.', true);
      return null;
    }
    const liveMap = hmiBindingLiveMap();
    let matched = 0;
    const missed = [];
    for (const b of bindings) {
      if (b.elementId === '@screen') {
        matched++;
        continue;
      }
      if (b.property === 'state3') {
        const parsed = HmiView.parseCellElementId?.(b.elementId);
        const cell = parsed ? (root.closest?.('.hmi-screen-stage') || root).querySelector(
          `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
        ) : null;
        if (cell?.classList?.contains('hmi-hoa-switch')) matched++;
        else missed.push(b.elementId);
        continue;
      }
      const els = HmiView.findBindingElements(root, b.elementId);
      if (els.length) matched++;
      else missed.push(b.elementId);
    }
    HmiView.applyBindings(root, bindings, liveMap);
    reapplySetupTileCaptionLabels();
    requestAnimationFrame(() => {
      HmiView.applyBindings(root, bindings, liveMap);
      reapplySetupTileCaptionLabels();
    });
    let gaugeLayers = 0;
    const stage = root.closest?.('.hmi-screen-stage') || root;
    for (const b of bindings) {
      if (!b?.elementId || !['fill', 'stroke', 'text'].includes(b.property)) continue;
      const parsed = HmiView.parseCellElementId?.(b.elementId);
      if (!parsed) continue;
      const cell = stage.querySelector(
        `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
      );
      if (cell && HmiView.cellHasDialGauge?.(cell, parsed.z ?? 0)) gaugeLayers += 1;
    }
    return {
      matched,
      missed,
      bindings: bindings.length,
      testTags: Object.keys(hmiBindingTestValues).length,
      gaugeLayers,
    };
  }

  function reportHmiBindingTestResult(r) {
    if (!r) return;
    const gaugeHint = r.gaugeLayers ? ` · ${r.gaugeLayers} gauge layer(s) tinted` : '';
    if (r.missed.length) {
      showHmiSetupMsg(
        `Applied ${r.matched}/${r.bindings} binding(s), ${r.testTags} test tag(s)${gaugeHint}. Not on grid: ${r.missed.join(', ')}`,
        true
      );
      return;
    }
    showHmiSetupMsg(`Applied ${r.matched} binding(s), ${r.testTags} test value(s)${gaugeHint}.`);
  }

  function hmiBindingTextValue(raw) {
    const s = String(raw ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(s) ? '' : s;
  }

  function readHmiBindingTestFromRow(tr) {
    if (!tr) return null;
    const tagId = tr.querySelector('[data-hmi-tag]')?.value?.trim();
    if (!tagId) return null;
    const boolSel = tr.querySelector('[data-hmi-test-bool-val]');
    if (boolSel) {
      if (boolSel.value === '') return { tagId, clear: true };
      return { tagId, value: boolSel.value === '1' };
    }
    const numInput = tr.querySelector('[data-hmi-test-num]');
    if (numInput) {
      if (numInput.value === '') return { tagId, clear: true };
      const n = Number(numInput.value);
      return { tagId, value: Number.isFinite(n) ? n : numInput.value };
    }
    const textInput = tr.querySelector('[data-hmi-test-text]');
    if (textInput) {
      if (textInput.value === '') return { tagId, clear: true };
      return { tagId, value: textInput.value };
    }
    return null;
  }

  function setHmiBindingTestEntry(tagId, entry) {
    if (!tagId) return;
    if (!entry || entry.clear) delete hmiBindingTestValues[tagId];
    else hmiBindingTestValues[tagId] = entry.value;
  }

  function collectAllHmiBindingTestsFromTable() {
    const collectFrom = (host) => {
      if (!host) return;
      host.querySelectorAll(hmiBindingRowSelector()).forEach((tr) => {
        const entry = readHmiBindingTestFromRow(tr);
        if (!entry) return;
        setHmiBindingTestEntry(entry.tagId, entry);
      });
    };
    collectFrom(domGet('hmi-bindings-table'));
    collectFrom(domGet('hmi-object-bindings-list'));
  }

  function flashHmiBindingTestRow(tr) {
    if (!tr) return;
    tr.classList.add('hmi-binding-test-flash');
    setTimeout(() => tr.classList.remove('hmi-binding-test-flash'), 900);
  }

  function applyHmiBindingTestPreview() {
    reportHmiBindingTestResult(applyHmiBindingsToSetupPreview());
  }

  function tryRepairBindingElementOnRow(tr) {
    const input = tr?.querySelector('[data-hmi-element]');
    const elementId = input?.value?.trim();
    if (!input || !elementId || elementId === HMI_GRID_CONTAINER_ID) return false;
    const property = tr?.querySelector('[data-hmi-prop]')?.value || 'fill';
    const root = hmiSetupBindingRoot();
    if (hmiSelectedTileCell && HmiView.ensureCellBindingIds) {
      const cell = setupGridCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row);
      HmiView.ensureCellBindingIds(cell, hmiSelectedTileCell.col, hmiSelectedTileCell.row, selectedHmiPlaceZ());
      syncHmiElementIdDatalist(domGet('hmi-setup-preview'));
    }
    if (!root || HmiView.findBindingElements(root, elementId).length) return false;
    const resolved = tryResolveBindingElementId(elementId, property);
    if (resolved === elementId || !HmiView.findBindingElements(root, resolved).length) return false;
    input.value = resolved;
    const idx = Number(tr?.dataset.hmiRow);
    const b = bindingsForScreen()[idx];
    if (b) b.elementId = resolved;
    markHmiDirty();
    collectHmiBindingsFromTable();
    showHmiSetupMsg(`Resolved element id to ${resolved}.`);
    return true;
  }

  function tryRepairHmiBindingTestRow(tr) {
    const input = tr?.querySelector('[data-hmi-element]');
    if (input?.value?.trim() !== HMI_GRID_CONTAINER_ID) return false;
    const idx = Number(tr?.dataset.hmiRow);
    const list = bindingsForScreen();
    const b = list[idx];
    if (!b) return false;
    const tagId = tr.querySelector('[data-hmi-tag]')?.value?.trim() || b.tagId;
    const pendingTest = readHmiBindingTestFromRow(tr);
    const repaired = repairInvalidHmiBinding({ ...b, tagId }, hmiBindingTagType(tagId));
    Object.assign(b, repaired);
    markHmiDirty();
    renderHmiBindingsTable();
    const newTr = domGet('hmi-bindings-table')?.querySelector(`tbody tr[data-hmi-row="${idx}"]`);
    if (newTr && pendingTest && !pendingTest.clear) {
      const numInput = newTr.querySelector('[data-hmi-test-num]');
      if (numInput) numInput.value = pendingTest.value;
      const textInput = newTr.querySelector('[data-hmi-test-text]');
      if (textInput) textInput.value = pendingTest.value;
      const boolSel = newTr.querySelector('[data-hmi-test-bool-val]');
      if (boolSel) boolSel.value = pendingTest.value ? '1' : '0';
    }
    showHmiSetupMsg(`Replaced ${HMI_GRID_CONTAINER_ID} with ${repaired.elementId} — set property to ${repaired.property} for this binding.`);
    return newTr;
  }

  function applyHmiBindingTestRow(tr) {
    tr = tryRepairHmiBindingTestRow(tr) || tr;
    tryRepairBindingElementOnRow(tr);
    const err = validateHmiBindingTestRow(tr);
    if (err) {
      showHmiSetupMsg(err, true);
      return;
    }
    const property = tr.querySelector('[data-hmi-prop]')?.value || 'fill';
    const tagId = tr.querySelector('[data-hmi-tag]')?.value?.trim();
    const tagType = hmiBindingTagType(tagId);
    let entry = readHmiBindingTestFromRow(tr);
    if ((!entry || entry.clear) && tagId) {
      if (isNumericHmiTagType(tagType) && (property === 'fill' || property === 'stroke' || property === 'text' || property === 'trend')) {
        const v = defaultAnalogTestValueFromRow(tr);
        entry = { tagId, value: v };
        const numInput = tr.querySelector('[data-hmi-test-num]');
        if (numInput) numInput.value = String(v);
      }
    }
    if (!entry) {
      showHmiSetupMsg('Could not read test value from this row.', true);
      return;
    }
    setHmiBindingTestEntry(entry.tagId, entry);
    markHmiDirty();
    reportHmiBindingTestResult(applyHmiBindingsToSetupPreview());
    flashHmiBindingTestRow(tr);
  }

  function applyHmiBindingTestScreen() {
    collectAllHmiBindingTestsFromTable();
    const repairRows = (host) => {
      host?.querySelectorAll(hmiBindingRowSelector())?.forEach((tr) => {
        tryRepairBindingElementOnRow(tr);
        const tagId = tr.querySelector('[data-hmi-tag]')?.value?.trim();
        const property = tr.querySelector('[data-hmi-prop]')?.value || 'fill';
        let entry = readHmiBindingTestFromRow(tr);
        if (tagId && (!entry || entry.clear)) {
          const tagType = hmiBindingTagType(tagId);
          const analog = property === 'fill' || property === 'stroke' || property === 'opacity' || property === 'fill5' || property === 'fill8' || property === 'state3' || property === 'trend';
          if (analog || (property === 'text' && (isNumericHmiTagType(tagType) || !tagType))) {
            entry = { tagId, value: defaultAnalogTestValueFromRow(tr) };
            setHmiBindingTestEntry(tagId, entry);
            const numInput = tr.querySelector('[data-hmi-test-num]');
            if (numInput) numInput.value = String(entry.value);
          }
        }
      });
    };
    repairRows(domGet('hmi-bindings-table'));
    repairRows(domGet('hmi-object-bindings-list'));
    collectHmiBindingsFromTable();
    markHmiDirty();
    reportHmiBindingTestResult(applyHmiBindingsToSetupPreview());
    const flashRows = (host) => {
      host?.querySelectorAll(hmiBindingRowSelector())?.forEach((tr) => flashHmiBindingTestRow(tr));
    };
    flashRows(domGet('hmi-bindings-table'));
    flashRows(domGet('hmi-object-bindings-list'));
  }

  function clearHmiBindingTestValues() {
    hmiBindingTestValues = {};
    applyHmiBindingTestPreview();
    renderHmiBindingsTable();
  }

  function hmiBindingTestCell(b) {
    const tagId = b.tagId;
    const property = b.property || 'fill';
    const tagType = hmiBindingTagType(tagId);
    if (!tagId) {
      return `<td class="hmi-extra-cell hmi-binding-test-col"><span class="muted">—</span></td>`;
    }
    const cur = hmiBindingTestValues[tagId];
    let control = '';
    const boolControl = () => {
      const sel = cur === true ? '1' : (cur === false ? '0' : '');
      return `<select class="input-sm hmi-binding-test-bool-val" data-hmi-test-bool-val="${esc(tagId)}" title="Test value for ${esc(tagId)}">
        <option value=""${sel === '' ? ' selected' : ''}>—</option>
        <option value="0"${sel === '0' ? ' selected' : ''}>OFF</option>
        <option value="1"${sel === '1' ? ' selected' : ''}>ON</option>
      </select>`;
    };
    const numControl = () => {
      const v = cur !== undefined && cur !== null && cur !== '' ? cur : '';
      return `<input type="number" step="any" class="input-sm hmi-binding-test-num" data-hmi-test-num="${esc(tagId)}" value="${esc(v)}" placeholder="e.g. 12.34" title="Test tag value for text display (${esc(tagId)})">`;
    };
    const textControl = () => {
      const v = cur !== undefined && cur !== null ? String(cur) : '';
      return `<input type="text" class="input-sm hmi-binding-test-text" data-hmi-test-text="${esc(tagId)}" value="${esc(v)}" placeholder="test text" title="Test value for ${esc(tagId)}">`;
    };
    if (property === 'text') {
      if (tagType === 'BOOL') control = boolControl();
      else control = numControl();
    } else if (property === 'rotation' || property === 'fill' || property === 'stroke' || property === 'opacity' || property === 'fill5' || property === 'fill8' || property === 'state3' || property === 'trend' || property === 'flashState') {
      if (tagType === 'BOOL') control = boolControl();
      else control = numControl();
    } else if (tagType === 'BOOL') {
      control = boolControl();
    } else if (isNumericHmiTagType(tagType)) {
      control = numControl();
    }
    if (!control) {
      return `<td class="hmi-extra-cell hmi-binding-test-col"><span class="muted" title="Test applies to text, BOOL, or numeric tags">—</span></td>`;
    }
    return `<td class="hmi-extra-cell hmi-binding-test-col"><div class="hmi-binding-test-row">${control}<button type="button" class="btn btn-sm hmi-binding-test-row-btn" data-hmi-test-row title="Apply test value for this row">Test</button></div></td>`;
  }

  function fillHmiAssetGrid() {
    const grid = domGet('hmi-asset-grid');
    if (!grid) return;
    const { assets, list, shown, totalPages, pageStart } = getPagedHmiAssets();
    renderHmiAssetTiles(grid, shown, 'No matching assets');
    updateHmiAssetHint(list, totalPages, pageStart, shown, assets);
    updateHmiAssetPager(list);
    bindHmiAssetGridEvents(grid);
  }

  let hmiGridClickTimer = null;

  function handleHmiGridCellClick(col, row, e) {
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    if (getComposerMode() !== 'grid') {
      showHmiSetupMsg('Tile editing is disabled in 3D composer mode. Switch to Grid in Project ▾ menu.', true);
      return;
    }
    const placeKind = domGet('hmi-place-kind')?.value || '';
    const preserveHotspotClick = isRegionOverlayKind(placeKind);
    let clickCol = col;
    let clickRow = row;
    if (preserveHotspotClick) {
      const hit = resolveHotspotClickCell(col, row, e);
      clickCol = hit.col;
      clickRow = hit.row;
    }
    const cell = setupGridCell(col, row);
    if (!preserveHotspotClick) {
      const anchor = gridAnchorFromCell(col, row, cell);
      col = anchor.col;
      row = anchor.row;
    }
    const scr = activeHmiScreen();
    if (!scr) return;
    const occupied = !!getScreenTile(scr, clickCol, clickRow);

    if (occupied) {
      if (hmiSelectedAssetPath) {
        assignHmiTileAsset(col, row, hmiSelectedAssetPath, scr);
        if (!e?.shiftKey) selectHmiAsset('');
        selectHmiTileCell(col, row);
        return;
      }
      if (isDirectPlaceKind(placeKind)) {
        if (canDirectPlaceKind(placeKind)) {
          assignHmiTileAsset(col, row, '', scr, {
            kind: placeKind,
            clickCol,
            clickRow,
          });
          return;
        }
      }
      selectHmiTileCell(clickCol, clickRow);
      return;
    }

    if (hmiSelectedAssetPath) {
      assignHmiTileAsset(col, row, hmiSelectedAssetPath, scr);
      return;
    }

    if (isDirectPlaceKind(placeKind)) {
      if (canDirectPlaceKind(placeKind)) {
        assignHmiTileAsset(col, row, '', scr, {
          kind: placeKind,
          clickCol,
          clickRow,
        });
      }
      return;
    }

    if (hmiSelectedTileCell) {
      const { col: fromCol, row: fromRow } = hmiSelectedTileCell;
      if (fromCol === col && fromRow === row) return;
      moveHmiTile(fromCol, fromRow, col, row, scr);
      return;
    }

    clearHmiTileSelection();
  }

  function hmiCellFromPoint(x, y, root) {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest?.('.hmi-tile-cell[data-col][data-row]');
    if (cell && root?.contains(cell)) return cell;
    return null;
  }

  function wireHmiTileCells(viewport) {
    const grid = viewport?.querySelector('.hmi-tile-grid');
    if (!grid || grid.dataset.hmiCellClickBound === '1') return;
    grid.dataset.hmiCellClickBound = '1';
    let placementHoverCell = null;

    function pointerCellFromEvent(e) {
      const cell = e.target.closest('.hmi-tile-cell-editable[data-col][data-row]');
      if (!cell || !grid.contains(cell)) return null;
      let col = Number(cell.dataset.col);
      let row = Number(cell.dataset.row);
      const colSpan = Math.max(1, Number(cell.dataset.colSpan) || 1);
      const rowSpan = Math.max(1, Number(cell.dataset.rowSpan) || 1);
      const resolvePointer = isRegionOverlayKind(domGet('hmi-place-kind')?.value)
        || colSpan > 1
        || rowSpan > 1;
      if (resolvePointer) {
        const hit = gridCellFromPointer(cell, e.clientX, e.clientY);
        col = hit.col;
        row = hit.row;
      }
      return { cell, col, row };
    }

    grid.addEventListener('pointermove', (e) => {
      if (!isRegionOverlayKind(domGet('hmi-place-kind')?.value)) {
        if (placementHoverCell) {
          placementHoverCell = null;
          updateHmiSelectionLabels();
          resetSpanCellCoordMarkers(grid);
        }
        return;
      }
      const hit = pointerCellFromEvent(e);
      if (!hit) return;
      placementHoverCell = { col: hit.col, row: hit.row };
      updateSpanCellCoordMarker(hit.cell, hit.col, hit.row);
      updateHmiSelectionLabels(placementHoverCell);
    });

    grid.addEventListener('pointerleave', () => {
      placementHoverCell = null;
      resetSpanCellCoordMarkers(grid);
      updateHmiSelectionLabels();
    });

    grid.addEventListener('click', (e) => {
      const hit = pointerCellFromEvent(e);
      if (!hit) return;
      const { col, row } = hit;
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn')) {
        if (e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(hmiGridClickTimer);
        hmiGridClickTimer = null;
        handleHmiGridCellClick(col, row, e);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const shiftKey = e.shiftKey;
      const clientX = e.clientX;
      const clientY = e.clientY;
      clearTimeout(hmiGridClickTimer);
      hmiGridClickTimer = setTimeout(() => {
        hmiGridClickTimer = null;
        handleHmiGridCellClick(col, row, { shiftKey, clientX, clientY });
      }, 280);
    });
    grid.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.hmi-tile-cell-editable[data-col][data-row]');
      if (!cell || !grid.contains(cell)) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(hmiGridClickTimer);
      hmiGridClickTimer = null;
      deleteHmiTile(Number(cell.dataset.col), Number(cell.dataset.row), activeHmiScreen());
    });
    grid.addEventListener('pointermove', (e) => {
      const cell = e.target.closest?.('.hmi-tile-cell-editable[data-col][data-row]');
      updateHmiPlacementCursor(grid, cell, e.clientX, e.clientY);
    });
    grid.addEventListener('pointerleave', () => {
      clearHmiPlacementCursor(grid);
    });
  }

  function bindHmiTileGridDrop(viewport, getScreen) {
    if (!viewport || viewport.dataset.hmiTileDropBound === '1') return;
    viewport.dataset.hmiTileDropBound = '1';
    let dragOverCell = null;

    function setDragCell(cell) {
      if (dragOverCell === cell) return;
      dragOverCell?.classList.remove('hmi-tile-drop-target');
      dragOverCell = cell || null;
      dragOverCell?.classList.add('hmi-tile-drop-target');
    }

    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const cell = hmiCellFromPoint(e.clientX, e.clientY, viewport) || e.target.closest('.hmi-tile-cell[data-col][data-row]');
      setDragCell(cell);
    });

    viewport.addEventListener('dragleave', (e) => {
      if (!viewport.contains(e.relatedTarget)) setDragCell(null);
    });

    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const cell = hmiCellFromPoint(e.clientX, e.clientY, viewport) || e.target.closest('.hmi-tile-cell[data-col][data-row]');
      setDragCell(null);
      if (!cell) return;
      const path = e.dataTransfer.getData('text/hmi-asset-path') || e.dataTransfer.getData('text/plain');
      if (!path) return;
      selectHmiAsset(path.trim());
      assignHmiTileAsset(+cell.dataset.col, +cell.dataset.row, path.trim(), getScreen());
    });
  }

  function bindHmiSetupTileKeys() {
    if (document.body.dataset.hmiSetupTileKeysBound === '1') return;
    document.body.dataset.hmiSetupTileKeysBound = '1';
    document.addEventListener('keydown', (e) => {
      if (!isHmiSetupOpen() || !hmiSelectedTileCell) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const ae = document.activeElement;
      if (ae && (ae.matches('input, select, textarea') || ae.isContentEditable)) return;
      e.preventDefault();
      deleteHmiTile(hmiSelectedTileCell.col, hmiSelectedTileCell.row, activeHmiScreen());
    });
  }

  function fillHmiSvgSelect() {
    const svgSel = domGet('hmi-svg-select');
    if (!svgSel) return;
    const { assets, list, shown, cur, totalPages, pageStart } = getPagedHmiAssets();
    svgSel.innerHTML = shown.map((a) =>
      `<option value="${esc(a.path)}" ${a.path === cur ? 'selected' : ''}>${esc(a.label || a.name)}${a.group ? ` · ${esc(a.group)}` : ''}${a.type && a.type !== 'svg' ? ` (${a.type})` : ''}</option>`
    ).join('') || '<option value="">— no matching assets —</option>';
    if (cur) svgSel.value = cur;
    else if (shown[0]) svgSel.value = shown[0].path;
    fillHmiAssetGrid();
  }

  function markHmiDirty() {
    hmiDirty = true;
    invalidateHmiConfigReady();
  }

  function readProjectLayoutFromFields(opts = {}) {
    ensureHmiLayout(hmiConfig);
    const cur = hmiConfig.layout || layoutFromScreen(activeHmiScreen());
    const colsIn = Math.max(1, Math.min(HMI_MAX_GRID_COLS, +(domGet('hmi-grid-cols')?.value) || cur.gridCols || HMI_GRID_SIZE));
    const rowsIn = Math.max(1, Math.min(HMI_MAX_GRID_ROWS, +(domGet('hmi-grid-rows')?.value) || cur.gridRows || HMI_GRID_SIZE));
    const cellWIn = readCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', cur.cellWidth || 128);
    const cellHIn = readCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', cur.cellHeight || 100);
    const logicalPreset = domGet('hmi-logical-preset')?.value || 'match-grid';
    const widthIn = Math.max(200, Math.min(4096, +(domGet('hmi-screen-width')?.value) || cur.width || HMI_DEFAULT_WIDTH));
    const heightIn = Math.max(150, Math.min(4096, +(domGet('hmi-screen-height')?.value) || cur.height || HMI_DEFAULT_HEIGHT));

    let gridCols = colsIn;
    let gridRows = rowsIn;
    let cellWidth = cellWIn;
    let cellHeight = cellHIn;
    let width;
    let height;

    if (opts.cellFieldsAuthoritative || logicalPreset === 'match-grid') {
      width = colsIn * cellWIn;
      height = rowsIn * cellHIn;
    } else if (domGet('hmi-screen-width') && domGet('hmi-screen-height')
      && (widthIn !== (cur.width || 0) || heightIn !== (cur.height || 0))) {
      width = widthIn;
      height = heightIn;
      cellWidth = Math.max(8, Math.min(512, Math.round(widthIn / colsIn)));
      cellHeight = Math.max(8, Math.min(512, Math.round(heightIn / rowsIn)));
      width = colsIn * cellWidth;
      height = rowsIn * cellHeight;
    } else {
      width = colsIn * cellWIn;
      height = rowsIn * cellHIn;
    }

    const layout = {
      gridCols,
      gridRows,
      cellWidth,
      cellHeight,
      gridSize: Math.max(gridCols, gridRows),
      width,
      height,
      displayMaxWidth: Math.max(100, Math.min(4096, +(domGet('hmi-display-max-width')?.value)
        || cur.displayMaxWidth || width || HMI_DEFAULT_WIDTH)),
      displayMaxHeight: Math.max(100, Math.min(4096, +(domGet('hmi-display-max-height')?.value)
        || cur.displayMaxHeight || height || HMI_DEFAULT_HEIGHT)),
      fit: domGet('hmi-screen-fit')?.value || cur.fit || 'contain',
      showGridChrome: readShowGridFromField(),
      showLiveStatus: readShowLiveStatusFromField(),
      composerMode: normalizeComposerMode(domGet('hmi-composer-mode')?.value || cur.composerMode),
    };
    hmiConfig.layout = layout;
    applyProjectLayoutToAllScreens(hmiConfig, layout);
    if (layout.showLiveStatus === false) {
      try { localStorage.setItem(HMI_LIVE_STATUS_HIDDEN_KEY, '1'); } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem(HMI_LIVE_STATUS_HIDDEN_KEY); } catch { /* ignore */ }
    }
    syncLiveStatusBarVisibility();
    return layout;
  }

  function syncHmiScreenMetaFromFields(opts = {}) {
    const screen = hmiConfig.screens.find((s) => s.id === (hmiEditScreenId || HOME_SCREEN_ID));
    if (!screen) return;

    const name = domGet('hmi-screen-name')?.value?.trim();
    if (name) screen.name = name;
    const svg = domGet('hmi-svg-select')?.value?.trim();
    if (svg) screen.svg = svg;

    const layout = readProjectLayoutFromFields(opts);
    screen.scale = Math.max(10, Math.min(400, +(domGet('hmi-screen-scale')?.value) || screen.scale || 100));
    screen.background = domGet('hmi-screen-bg')?.value || screen.background || '#f1f5f9';
    screen.offsetX = Math.max(-4096, Math.min(4096, +(domGet('hmi-screen-offset-x')?.value) || screen.offsetX || 0));
    screen.offsetY = Math.max(-4096, Math.min(4096, +(domGet('hmi-screen-offset-y')?.value) || screen.offsetY || 0));
    ensureScreenTiles(screen);

    const g = screenGridSpec(screen);
    if (domGet('hmi-grid-cols')) domGet('hmi-grid-cols').value = String(g.cols);
    if (domGet('hmi-grid-rows')) domGet('hmi-grid-rows').value = String(g.rows);
    fillCellSizeSelect('hmi-cell-width', 'hmi-cell-width-custom', 'hmi-cell-width-custom-wrap', g.cellWidth);
    fillCellSizeSelect('hmi-cell-height', 'hmi-cell-height-custom', 'hmi-cell-height-custom-wrap', g.cellHeight);
    if (domGet('hmi-screen-width')) domGet('hmi-screen-width').value = g.width;
    if (domGet('hmi-screen-height')) domGet('hmi-screen-height').value = g.height;
    if (domGet('hmi-display-max-width')) domGet('hmi-display-max-width').value = layout.displayMaxWidth ?? g.width;
    if (domGet('hmi-display-max-height')) domGet('hmi-display-max-height').value = layout.displayMaxHeight ?? g.height;
    syncLayoutPresetFromFields();
    syncLogicalPresetFromFields();
    syncDisplayPresetFromFields();
  }

  function fillHmiNavTargetSelect() {
    const sel = domGet('hmi-nav-target');
    if (!sel) return;
    const cur = sel.value;
    const screens = sortScreensByNumber(hmiConfig.screens);
    sel.innerHTML = '<option value="">— target screen —</option>'
      + screens.map((s) =>
        `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(screenLabel(s))}</option>`
      ).join('');
  }

  function updateHmiPlaceOptionsUi() {
    const kind = domGet('hmi-place-kind')?.value || '';
    syncHmiPlaceZSelectForKind();
    domGet('hmi-nav-target-wrap')?.classList.toggle('view-hidden', !isScreenNavKind(kind));
    domGet('hmi-room-num-wrap')?.classList.toggle('view-hidden', !isRoomHotspotKind(kind));
    domGet('hmi-flash-overlay-color-wrap')?.classList.toggle('view-hidden', kind !== 'flashOverlay');
    domGet('hmi-region-cell-fraction-wrap')?.classList.toggle('view-hidden', !isRegionOverlayKind(kind));
    const labelWrap = domGet('hmi-tile-label-wrap');
    const labelInput = domGet('hmi-tile-label-input');
    if (labelInput && kind === 'navButton') {
      labelInput.placeholder = 'Button label (e.g. Go to Alarms)';
    } else if (labelInput && kind === 'pageHotspot') {
      labelInput.placeholder = 'Composer label (optional — not shown on live HMI)';
    } else if (labelInput && kind === 'roomHotspot') {
      labelInput.placeholder = 'Composer label (optional — e.g. Room 001)';
    }
    if (labelWrap && (isScreenNavKind(kind) || isRoomHotspotKind(kind))) {
      labelWrap.classList.remove('view-hidden');
    } else if (labelWrap && !hmiSelectedTileCell) {
      labelWrap.classList.add('view-hidden');
    }
  }

  function pruneTilesToGrid(screen) {
    if (!screen) return;
    const g = screenGridSpec(screen);
    screen.tiles = ensureScreenTiles(screen).filter((t) => {
      const cs = t.colSpan || 1;
      const rs = t.rowSpan || 1;
      return t.col >= 0 && t.row >= 0 && t.col + cs <= g.cols && t.row + rs <= g.rows;
    });
  }

  function applyGridSizeFromCellFields() {
    if (!activeHmiScreen()) return;
    syncHmiScreenMetaFromFields({ cellFieldsAuthoritative: true });
    for (const s of hmiConfig.screens || []) pruneTilesToGrid(s);
    syncLayoutPresetFromFields();
    syncLogicalPresetFromFields();
    syncDisplayPresetFromFields();
    markHmiDirty();
    scheduleHmiPreview(true);
  }

  function resolveBindingElementIdForSelectedCell(elementId, property) {
    if (!hmiSelectedTileCell || !shouldRewriteBindingElementForSelectedCell(elementId)) return elementId;
    const { col, row } = hmiSelectedTileCell;
    const z = selectedHmiPlaceZ();
    const parsed = HmiView.parseCellElementId?.(elementId);
    const matches = bindingIdMatchesSelectedCell(elementId);
    const ambiguous = bindingElementIdIsAmbiguous(elementId);
    const textBinding = property === 'text';
    const paintBinding = property === 'fill' || property === 'stroke' || property === 'fill5' || property === 'fill8';
    const flashOverlay = selectedCellFlashOverlayLayer(z);
    if (shouldUseFlashOverlayElementId(property, elementId, flashOverlay, { rewriteForSelectedCell: true })) {
      return flashOverlayElementIdForCell(col, row, flashOverlay.z ?? z);
    }
    if (textBinding && (ambiguous || matches)) {
      if (ambiguous || isLabelLikeBindingElement(elementId)) {
        const tile = getScreenTile(activeHmiScreen(), col, row);
        return elementIdForHmiTextCell(col, row, textLayerZForTile(tile, parsed?.z ?? z));
      }
      if (parsed) {
        const tile = getScreenTile(activeHmiScreen(), col, row);
        const tz = textLayerZForTile(tile, parsed.z ?? z);
        if (parsed.z == null || parsed.z !== tz) {
          return elementIdForHmiTextCell(col, row, tz);
        }
      }
      return elementId;
    }
    if (paintBinding && (ambiguous || !matches || isLabelLikeBindingElement(elementId))) {
      const tile = getScreenTile(activeHmiScreen(), col, row);
      const pbLayer = findPushButtonLayer(tile, z);
      if (pbLayer) return pushButtonElementIdForCell(col, row, z);
      return firstShapeElementIdForCell(col, row, z);
    }
    if (property === 'rotation' && (ambiguous || !matches)) {
      return firstPointerElementIdForCell(col, row, z);
    }
    if (ambiguous || !matches) {
      return elementIdForHmiCell(col, row, z, bindingIdSuffix(elementId));
    }
    return elementId;
  }

  function readHmiBindingRowFromTr(tr, orig, screenId) {
    let elementId = tr.querySelector('[data-hmi-element]')?.value?.trim();
    const tagId = tr.querySelector('[data-hmi-tag]')?.value?.trim();
    if (!elementId || !tagId) return null;
    const property = tr.querySelector('[data-hmi-prop]')?.value || 'fill';
    elementId = resolveBindingElementIdForSelectedCell(elementId, property);
    elementId = tryResolveBindingElementId(elementId, property);
    const elInput = tr.querySelector('[data-hmi-element]');
    if (elInput && elInput.value.trim() !== elementId) elInput.value = elementId;
    const row = { screenId, elementId, tagId, property };
    const tagField = tr.dataset.hmiField || '';
    if (tagField) row.tagField = tagField;
    else if (HmiView.inferPidTagField) {
      const inferred = HmiView.inferPidTagField(elementId);
      if (inferred) row.tagField = inferred;
    }
    const onValue = tr.querySelector('select[data-hmi-on]')?.value?.trim()
      || tr.querySelector('input[data-hmi-on]')?.value?.trim();
    const offValue = tr.querySelector('select[data-hmi-off]')?.value?.trim()
      || tr.querySelector('input[data-hmi-off]')?.value?.trim();
    const paletteOnOff = readBindingOnOffValues(tr, orig || {});
    const minRaw = tr.querySelector('[data-hmi-min]')?.value;
    const maxRaw = tr.querySelector('[data-hmi-max]')?.value;
    row.format = tr.querySelector('[data-hmi-format]')?.value || orig?.format || '';
    if (property === 'text') {
      const ov = hmiBindingTextValue(onValue);
      const fv = hmiBindingTextValue(offValue);
      if (ov) row.onValue = ov;
      if (fv) row.offValue = fv;
      if (row.format === 'state5' || row.format === 'tpoSta' || row.format === 'poolBwSta') {
        row.colors = normalizeFill5Colors(
          Array.from({ length: 5 }, (_, i) => tr.querySelector(`[data-hmi-text5-color="${i}"]`)?.value)
        );
        row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
        row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 4;
        if (row.max - row.min > 4 || row.max > 4) row.max = 4;
      }
    } else if (property === 'rotation') {
      const aMax = Number(onValue);
      const aMin = Number(offValue);
      row.onValue = Number.isFinite(aMax) ? aMax : 330;
      row.offValue = Number.isFinite(aMin) ? aMin : 30;
    } else if (property === 'flashState') {
      row.onValue = normalizeFlashStateMode(onValue || orig?.onValue || 'red');
      if (row.onValue === 'hidden') row.onValue = 'red';
      row.offValue = normalizeFlashStateMode(offValue || orig?.offValue || 'hidden');
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 2;
      if (row.max - row.min > 2 || row.max > 2) row.max = 2;
    } else {
      if (paletteOnOff.onValue) row.onValue = paletteOnOff.onValue;
      else if (onValue) row.onValue = onValue;
      if (paletteOnOff.offValue) row.offValue = paletteOnOff.offValue;
      else if (offValue) row.offValue = offValue;
    }
    if (property === 'fill5') {
      row.colors = normalizeFill5Colors(
        Array.from({ length: 5 }, (_, i) => tr.querySelector(`[data-hmi-fill5-color="${i}"]`)?.value)
      );
      row.flashStates = [2, 3];
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 4;
      if (row.max - row.min > 4 || row.max > 4) row.max = 4;
    } else if (property === 'fill8') {
      row.colors = normalizeFill8Colors(
        Array.from({ length: 8 }, (_, i) => tr.querySelector(`[data-hmi-fill8-color="${i}"]`)?.value)
      );
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 7;
    } else if (property === 'state3') {
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 2;
      if (row.max - row.min > 2 || row.max > 2) row.max = 2;
    } else if (property !== 'flashState' && property !== 'text' && property !== 'rotation') {
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 100;
    }
    if (property === 'class') {
      row.classOn = tr.querySelector('[data-hmi-class-on]')?.value?.trim() || 'hmi-on';
      row.classOff = tr.querySelector('[data-hmi-class-off]')?.value?.trim() || 'hmi-off';
    }
    const tagType = hmiBindingTagType(tagId);
    if (orig?.interaction && !isPushButtonBindingElementId(row.elementId)) row.interaction = orig.interaction;
    applyPushButtonInteractionToBindingRow(row, tagType);
    applyPilotLightBindingToRow(row);
    applyFlashOverlayBindingToRow(row);
    if (property === 'trend') {
      const samplesRaw = tr.querySelector('[data-hmi-samples]')?.value;
      row.samples = Number.isFinite(Number(samplesRaw)) ? Math.min(512, Math.max(8, Number(samplesRaw))) : 64;
      if (paletteOnOff.onValue) row.onValue = paletteOnOff.onValue;
      else if (!/^#[0-9a-f]{6}$/i.test(String(row.onValue || ''))) row.onValue = HMI_TREND_DEFAULT_COLOR;
      if (orig?.useTagScale) row.useTagScale = true;
    }
    if (property === 'text' && row.format === 'state3') {
      row.min = Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
      row.max = Number.isFinite(Number(maxRaw)) ? Number(maxRaw) : 2;
      if (row.max - row.min > 2 || row.max > 2) row.max = 2;
    }
    const needsRepair = row.elementId === HMI_GRID_CONTAINER_ID
      || (isNumericHmiTagType(tagType) && isLabelLikeBindingElement(row.elementId) && row.property === 'text')
      || (isNumericHmiTagType(tagType) && isAnalogPaintBinding(row) && row.property !== 'trend');
    return needsRepair ? coerceHmiBindingForNumericTag(repairInvalidHmiBinding(row, tagType)) : row;
  }

  function hmiBindingRowSelector() {
    return 'tbody tr[data-hmi-row], .hmi-obj-binding-row[data-hmi-row], [data-hmi-binding-row][data-hmi-row]';
  }

  function collectHmiBindingsFromTable() {
    const tableHost = domGet('hmi-bindings-table');
    const objHost = domGet('hmi-object-bindings-list');
    if (!tableHost && !objHost) return;
    const screenId = hmiEditScreenId || hmiConfig.activeScreen;
    const screenBindings = bindingsForScreen();
    const rowOverrides = new Map();
    const objectPanelIndices = new Set();
    if (objHost && hmiSelectedTileCell && !domGet('hmi-object-bindings-panel')?.classList.contains('view-hidden')) {
      for (const { i } of bindingsForCell(hmiSelectedTileCell.col, hmiSelectedTileCell.row)) {
        objectPanelIndices.add(i);
      }
    }
    const readHost = (host, onlyIndices) => {
      if (!host) return;
      host.querySelectorAll(hmiBindingRowSelector()).forEach((tr) => {
        const idx = Number(tr.dataset.hmiRow);
        if (!Number.isFinite(idx)) return;
        if (onlyIndices && !onlyIndices.has(idx)) return;
        if (onlyIndices === false && objectPanelIndices.has(idx)) return;
        const orig = screenBindings[idx];
        const row = readHmiBindingRowFromTr(tr, orig, screenId);
        if (row) rowOverrides.set(idx, row);
      });
    };
    readHost(tableHost, false);
    readHost(objHost, objectPanelIndices.size ? objectPanelIndices : null);
    const rows = screenBindings.map((orig, i) => rowOverrides.get(i) || orig).filter((b) => b?.elementId && b?.tagId);
    const other = (hmiConfig.bindings || []).filter((b) => b.screenId !== screenId);
    hmiConfig.bindings = [...other, ...rows];
  }

  function hmiBindingExistsOnScreen(elementId, property, screenId) {
    const sid = screenId || hmiEditScreenId || hmiConfig.activeScreen || HOME_SCREEN_ID;
    return (hmiConfig.bindings || []).some((b) =>
      (b.screenId || HOME_SCREEN_ID) === sid
      && b.elementId === elementId
      && (b.property || 'fill') === property);
  }

  function pushPotentialHmiBindingSuggestion(suggestions, seen, elementId, property, hint) {
    const eid = String(elementId || '').trim();
    const prop = String(property || '').trim();
    if (!eid || !prop) return;
    const key = `${eid}|${prop}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      elementId: eid,
      property: prop,
      hint: hint || '',
      bound: hmiBindingExistsOnScreen(eid, prop),
    });
  }

  function collectPotentialHmiBindings(col, row, z) {
    const scr = activeHmiScreen();
    if (!scr || col == null || row == null) return [];
    const sid = hmiEditScreenId || scr.id || HOME_SCREEN_ID;
    const tile = getScreenTile(scr, col, row);
    if (!tile) return [];
    const layerZ = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const cell = setupGridCell(col, row);
    if (cell && HmiView.ensureCellBindingIds) {
      HmiView.ensureCellBindingIds(cell, col, row, layerZ);
      syncHmiElementIdDatalist(hmiSetupBindingRoot()?.closest?.('.hmi-viewport') || setupPreviewEl());
    }
    const root = hmiSetupBindingRoot();
    const suggestions = [];
    const seen = new Set();
    const add = (elementId, property, hint) =>
      pushPotentialHmiBindingSuggestion(suggestions, seen, elementId, property, hint);

    const compositeId = String(tile.compositeId || '').trim();
    if (compositeId) {
      const manifest = compositeManifestFromAsset(`@composite/${compositeId}`);
      if (manifest?.defaultBindings?.length) {
        for (const def of manifest.defaultBindings) {
          const elementId = compositeBindingElementId(col, row, manifest, def);
          const hint = def.tagField
            ? `${def.tagField}`
            : (manifest.label || compositeId);
          add(elementId, def.property, hint);
        }
      }
    }

    const flashOverlay = flashOverlayLayerFromTile(tile, layerZ);
    if (flashOverlay) {
      add(
        flashOverlayElementIdForCell(col, row, flashOverlay.z ?? layerZ),
        'flashState',
        'Flash overlay',
      );
    }

    const plLayer = findPilotLightLayer(tile, layerZ);
    if (plLayer) {
      const kind = pilotLightKindForLayer(plLayer);
      add(
        pilotLightElementIdForCell(col, row, layerZ),
        kind === 'complex' ? 'fill5' : 'fill',
        kind === 'complex' ? 'Pilot light (5-state)' : 'Pilot light (BOOL)',
      );
    }

    const pbLayer = findPushButtonLayer(tile, layerZ);
    if (pbLayer) {
      add(pushButtonElementIdForCell(col, row, layerZ), 'fill', 'Push button');
    }

    const scLayer = findStripChartLayer(tile, layerZ);
    if (scLayer) {
      const penCount = inferStripChartPenCount(tile, scLayer, sid, col, row, layerZ);
      for (let i = 1; i <= penCount; i++) {
        add(
          elementIdForHmiCell(col, row, layerZ, `trend_pen${i}`),
          'trend',
          `Strip chart pen ${i}`,
        );
      }
    }

    const gcLayer = findGaugeColumnLayer(tile, layerZ);
    if (gcLayer) {
      const columnCount = inferGaugeColumnCount(tile, gcLayer, sid, col, row, layerZ);
      for (let i = 1; i <= columnCount; i++) {
        add(
          elementIdForHmiCell(col, row, layerZ, `gauge_col${i}`),
          'fill',
          `Gauge column ${i}`,
        );
      }
    }

    for (const layer of screenTileLayers(tile)) {
      const lz = layer.z ?? 0;
      if (lz !== layerZ) continue;
      if (layer.kind === 'dynamicText') {
        add(elementIdForHmiTextCell(col, row, lz), 'text', 'Dynamic text');
      } else if (layer.kind === 'staticText') {
        add(elementIdForHmiTextCell(col, row, lz), 'text', 'Label text');
      }
    }

    const hasHoa = screenTileLayers(tile).some((l) => isHoaSwitchAssetPath(l.svg));
    if (hasHoa) {
      add(layerElementIdFromTile(col, row, layerZ, 'hoa_switch'), 'state3', 'HOA position');
    }

    const ptrId = firstPointerElementIdForCell(col, row, layerZ);
    if (root && HmiView.findBindingElements(root, ptrId).length) {
      add(ptrId, 'rotation', 'Dial needle');
    }

    const shapeId = firstShapeElementIdForCell(col, row, layerZ);
    if (shapeId
      && !isPilotLightBindingElementId(shapeId)
      && !isPushButtonBindingElementId(shapeId)
      && !isFlashOverlayBindingElementId(shapeId)) {
      add(shapeId, 'fill', 'Fill color');
    }

    const pref = layerIdPrefix(col, row, layerZ);
    for (const id of hmiElementIds) {
      if (!id.startsWith(pref)) continue;
      if (root && !HmiView.findBindingElements(root, id).length) continue;
      const props = hmiBindingPropsForElement(id);
      const prop = props.includes('fill') ? 'fill' : props[0];
      if (prop) add(id, prop, bindingIdSuffix(id));
    }

    return suggestions;
  }

  function hmiBindingFromSuggestion(elementId, property) {
    const sid = hmiEditScreenId || hmiConfig.activeScreen || HOME_SCREEN_ID;
    const parsed = HmiView.parseCellElementId?.(elementId);
    const col = parsed?.col ?? hmiSelectedTileCell?.col;
    const row = parsed?.row ?? hmiSelectedTileCell?.row;
    const z = parsed?.z ?? selectedHmiPlaceZ();
    const penMatch = String(elementId || '').match(/trend_pen(\d+)/i);
    if (property === 'trend' && penMatch && col != null && row != null) {
      return defaultStripChartTrendBinding(sid, col, row, z, Number(penMatch[1]));
    }
    const colMatch = String(elementId || '').match(/gauge_col(\d+)/i);
    if (property === 'fill' && colMatch && col != null && row != null) {
      return defaultGaugeColumnFillBinding(sid, col, row, z, Number(colMatch[1]));
    }
    const out = defaultHmiBinding();
    out.screenId = sid;
    out.elementId = elementId;
    out.property = property;
    if (property === 'text') {
      out.format = out.format || 'fixed2';
      out.onValue = undefined;
      out.offValue = undefined;
    } else if (property === 'state3') {
      out.min = 0;
      out.max = 2;
    } else if (property === 'rotation') {
      out.onValue = 330;
      out.offValue = 30;
    } else if ((property === 'fill' || property === 'stroke') && !isFlashOverlayBindingElementId(elementId)) {
      out.onValue = '#22c55e';
      out.offValue = '#94a3b8';
      out.min = 0;
      out.max = 100;
    }
    applyFlashOverlayBindingToRow(out);
    applyPilotLightBindingToRow(out);
    applyPushButtonInteractionToBindingRow(out, hmiBindingTagType(out.tagId));
    return out;
  }

  function addHmiObjectBinding(elementId, property) {
    if (hmiBindingExistsOnScreen(elementId, property)) return;
    markHmiDirty();
    hmiConfig.bindings.push(hmiBindingFromSuggestion(elementId, property));
    renderHmiBindingsTable();
    renderHmiObjectBindingsPanel();
    scheduleHmiPreview();
  }

  function addHmiObjectBindingFromSuggestion(elementId, property) {
    addHmiObjectBinding(elementId, property);
  }

  function hmiObjectBindingOnOffHtml(b) {
    const showFlashState = b.property === 'flashState';
    const showFill5 = b.property === 'fill5';
    const showFill8 = b.property === 'fill8';
    const showState3 = b.property === 'state3';
    const showFormat = b.property === 'text';
    const showText5Palette = showFormat && (b.format === 'state5' || b.format === 'tpoSta' || b.format === 'poolBwSta');
    const showRotation = b.property === 'rotation';
    const showTrend = b.property === 'trend';
    const showColors = b.property === 'fill' || b.property === 'stroke' || b.property === 'backgroundFill';
    const numericTag = isNumericHmiTagType(hmiBindingTagType(b.tagId));
    const onColor = /^#[0-9a-f]{6}$/i.test(String(b.onValue || '')) ? b.onValue : (showTrend ? HMI_TREND_DEFAULT_COLOR : '#22c55e');
    const offColor = /^#[0-9a-f]{6}$/i.test(String(b.offValue || '')) ? b.offValue : '#94a3b8';
    const onText = showFormat ? hmiBindingTextValue(b.onValue) : '';
    const offText = showFormat ? hmiBindingTextValue(b.offValue) : '';
    if (showState3) {
      return '<span class="muted">0 Auto · 1 Off · 2 Hand</span>';
    }
    if (showFlashState) {
      if (numericTag) return '<span class="muted">0 hidden · 1 red · 2 amber</span>';
      return `<label>ON<select data-hmi-on>${hmiFlashStateOptions(b.onValue || 'red')}</select></label>
        <label>OFF<select data-hmi-off>${hmiFlashStateOptions(b.offValue || 'hidden')}</select></label>`;
    }
    if (showFill5) return hmiFill5PaletteHtml(normalizeFill5Colors(b.colors));
    if (showFill8) return hmiFill8PaletteHtml(normalizeFill8Colors(b.colors));
    if (showText5Palette) return hmiText5PaletteHtml(b.colors, b.format);
    if (showTrend) return hmiTrendPenColorHtml(onColor);
    if (showRotation) {
      const angleAtMax = Number.isFinite(Number(b.onValue)) ? Number(b.onValue) : 330;
      const angleAtMin = Number.isFinite(Number(b.offValue)) ? Number(b.offValue) : 30;
      return `<label>max°<input data-hmi-on type="number" step="any" class="input-sm" value="${angleAtMax}"></label>
        <label>min°<input data-hmi-off type="number" step="any" class="input-sm" value="${angleAtMin}"></label>`;
    }
    if (showColors) return hmiDualColorPaletteHtml(offColor, onColor);
    if (showFormat) {
      return `<label>ON<input data-hmi-on value="${esc(onText)}" placeholder="ON text"></label>
        <label>OFF<input data-hmi-off value="${esc(offText)}" placeholder="OFF text"></label>`;
    }
    return '';
  }

  function hmiObjectBindingCardHtml(b, idx) {
    const propLabel = HMI_BINDING_PROP_LABELS[b.property] || b.property;
    const suffix = bindingIdSuffix(b.elementId);
    const idLabel = suffix === b.elementId ? suffix : b.elementId;
    const showFlashState = b.property === 'flashState';
    const showFill5 = b.property === 'fill5';
    const showFill8 = b.property === 'fill8';
    const showState3 = b.property === 'state3';
    const showOpacity = b.property === 'opacity';
    const showFormat = b.property === 'text';
    const showRotation = b.property === 'rotation';
    const showTrend = b.property === 'trend';
    const numericTag = isNumericHmiTagType(hmiBindingTagType(b.tagId));
    const analogFill = numericTag && (b.property === 'fill' || b.property === 'stroke');
    const showMinMax = showOpacity || showFill5 || showFill8 || showState3 || showFormat || analogFill || showRotation || showTrend || (showFlashState && numericTag);
    const minVal = Number.isFinite(Number(b.min)) ? b.min : (showFill5 ? 0 : (showState3 ? 0 : (showFlashState ? 0 : 0)));
    const maxVal = Number.isFinite(Number(b.max)) ? b.max : (showFill5 ? 4 : (showState3 ? 2 : (showFlashState ? 2 : 100)));
    const fieldHint = b.tagField ? ` · ${b.tagField}` : '';
    return `<div class="hmi-object-binding-card hmi-obj-binding-row" data-hmi-binding-row data-hmi-row="${idx}"${b.tagField ? ` data-hmi-field="${esc(b.tagField)}"` : ''}>
      <div class="hmi-object-binding-header">
        <span class="hmi-object-binding-title"><code class="cell-mono">${esc(idLabel)}</code> · ${esc(propLabel)}</span>
        <button type="button" class="btn btn-sm" data-hmi-object-del title="Remove binding">×</button>
      </div>
      <div class="hmi-object-binding-fields form-grid compact">
        <input type="hidden" data-hmi-element value="${esc(b.elementId || '')}">
        <label>Tag<select data-hmi-tag>${hmiTagOptions(b.tagId)}</select></label>
        <label>Property<select data-hmi-prop>${hmiPropOptions(b.property || 'fill', b.elementId)}</select></label>
        <div class="hmi-object-binding-onoff">${hmiObjectBindingOnOffHtml(b)}</div>
        ${showMinMax ? `<label>min<input data-hmi-min type="number" step="any" class="input-sm" value="${minVal}"></label>
          <label>max<input data-hmi-max type="number" step="any" class="input-sm" value="${maxVal}"></label>` : ''}
        ${showFormat && !showTrend ? `<label>format<select data-hmi-format>${hmiFormatOptions(b.format)}</select></label>` : ''}
        ${showTrend ? `<label>samples<input data-hmi-samples type="number" min="8" max="512" class="input-sm" value="${Number.isFinite(Number(b.samples)) ? b.samples : 64}"></label>` : ''}
      </div>
      <div class="hmi-object-binding-test">${hmiBindingTestCell(b).replace(/^<td[^>]*>|<\/td>$/g, '')}</div>
      <p class="hmi-object-binding-id-hint muted" title="${esc((b.elementId || '') + fieldHint)}">${esc(b.elementId || '')}</p>
    </div>`;
  }

  function renderHmiObjectBindingsPanel() {
    const panel = domGet('hmi-object-bindings-panel');
    const list = domGet('hmi-object-bindings-list');
    const hint = domGet('hmi-object-bindings-hint');
    const suggestionsEl = domGet('hmi-object-bindings-suggestions');
    if (!panel || !list) return;
    if (!hmiSelectedTileCell) {
      panel.classList.add('view-hidden');
      list.innerHTML = '';
      if (suggestionsEl) suggestionsEl.innerHTML = '';
      if (hint) {
        hint.textContent = 'Select a placed symbol on the grid to edit bindings for that object here.';
      }
      return;
    }
    const { col, row } = hmiSelectedTileCell;
    const z = selectedHmiPlaceZ();
    const cellBindings = bindingsForCell(col, row);
    const suggestions = collectPotentialHmiBindings(col, row, z);
    panel.classList.remove('view-hidden');
    if (hint) {
      const n = cellBindings.length;
      hint.textContent = n
        ? `Cell ${formatHmiCellLabel(col, row)} · Z${z} — ${n} binding${n === 1 ? '' : 's'} for this object. Edits sync with the Bindings tab.`
        : `Cell ${formatHmiCellLabel(col, row)} · Z${z} — no bindings yet. Add one below or pick a suggestion.`;
    }
    if (!cellBindings.length) {
      list.innerHTML = '<p class="muted hmi-object-binding-empty">No bindings target this cell.</p>';
    } else {
      list.innerHTML = cellBindings.map(({ b, i }) => hmiObjectBindingCardHtml(b, i)).join('');
      bindHmiObjectBindingRowEvents(list);
    }
    if (suggestionsEl) {
      const unbound = suggestions.filter((s) => !s.bound);
      if (!unbound.length) {
        suggestionsEl.innerHTML = '';
      } else {
        suggestionsEl.innerHTML = `<p class="panel-hint hmi-object-suggestions-title">Add binding:</p>
          <ul class="hmi-object-bindings-suggestions">${unbound.map((s) => {
            const propLabel = HMI_BINDING_PROP_LABELS[s.property] || s.property;
            const suffix = bindingIdSuffix(s.elementId);
            const idLabel = suffix === s.elementId ? suffix : s.elementId;
            const hintHtml = s.hint ? ` <span class="muted">(${esc(s.hint)})</span>` : '';
            return `<li><button type="button" class="btn btn-sm" data-hmi-add-object-binding data-element-id="${esc(s.elementId)}" data-property="${esc(s.property)}">${esc(idLabel)} · ${esc(propLabel)}${hintHtml}</button></li>`;
          }).join('')}</ul>`;
      }
    }
  }

  function bindHmiObjectBindingRowEvents(host) {
    if (!host) return;
    const mark = () => {
      markHmiDirty();
      collectHmiBindingsFromTable();
      scheduleHmiPreview();
    };
    const markReRender = () => {
      mark();
      renderHmiObjectBindingsPanel();
    };
    host.querySelectorAll('[data-hmi-min], [data-hmi-max], [data-hmi-samples], input[data-hmi-on], input[data-hmi-off]').forEach((el) => {
      el.addEventListener('input', mark);
      el.addEventListener('change', mark);
    });
    host.querySelectorAll('select[data-hmi-on], select[data-hmi-off]').forEach((el) => {
      el.addEventListener('change', mark);
    });
    host.querySelectorAll('[data-hmi-tag], [data-hmi-prop], [data-hmi-format]').forEach((el) => {
      el.addEventListener('change', markReRender);
    });
    host.querySelectorAll('[data-hmi-test-row]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        applyHmiBindingTestRow(btn.closest('[data-hmi-binding-row]'));
      });
    });
    host.querySelectorAll('[data-hmi-test-bool-val], [data-hmi-test-num]').forEach((el) => {
      el.addEventListener('change', () => {
        const row = el.closest('[data-hmi-binding-row]');
        if (row) applyHmiBindingTestRow(row);
      });
    });
    host.querySelectorAll('[data-hmi-object-del]').forEach((btn) => {
      btn.onclick = () => {
        const card = btn.closest('[data-hmi-binding-row]');
        const idx = Number(card?.dataset.hmiRow);
        if (Number.isFinite(idx)) removeHmiBindingAtScreenIndex(idx);
        renderHmiObjectBindingsPanel();
      };
    });
    bindHmiPaletteEditors(host);
    host.querySelectorAll('.hmi-palette-editor').forEach((ed) => syncPaletteEditorUi(ed));
    syncHmiColorSelectStyles(host);
  }

  function bindHmiObjectBindingsPanel() {
    const panel = domGet('hmi-object-bindings-panel');
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    panel.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-hmi-add-object-binding]');
      if (addBtn) {
        e.preventDefault();
        addHmiObjectBindingFromSuggestion(addBtn.dataset.elementId, addBtn.dataset.property);
        return;
      }
      const applyBtn = e.target.closest('#btn-hmi-object-apply-bindings');
      if (applyBtn) {
        e.preventDefault();
        applyHmiBindingTestPreview();
      }
    });
    domGet('btn-hmi-object-add-binding')?.addEventListener('click', () => {
      if (!hmiSelectedTileCell) return;
      const { col, row } = hmiSelectedTileCell;
      const z = selectedHmiPlaceZ();
      const suggestions = collectPotentialHmiBindings(col, row, z).filter((s) => !s.bound);
      if (suggestions.length) {
        addHmiObjectBinding(suggestions[0].elementId, suggestions[0].property);
      } else {
        markHmiDirty();
        hmiConfig.bindings.push(defaultHmiBinding());
        renderHmiBindingsTable();
        renderHmiObjectBindingsPanel();
        scheduleHmiPreview();
      }
    });
  }

  /** @deprecated use renderHmiObjectBindingsPanel */
  function renderHmiPotentialBindingsPanel() {
    renderHmiObjectBindingsPanel();
  }

  /** @deprecated use bindHmiObjectBindingsPanel */
  function bindHmiPotentialBindingsPanel() {
    bindHmiObjectBindingsPanel();
  }

  function renderHmiBindingsTable() {
    const host = domGet('hmi-bindings-table');
    if (!host) return;
    const bindings = bindingsForScreen();
    const rows = bindings.map((b, i) => {
      const showColors = b.property === 'fill' || b.property === 'stroke' || b.property === 'backgroundFill';
      const showFlashState = b.property === 'flashState';
      const showFill5 = b.property === 'fill5';
      const showFill8 = b.property === 'fill8';
      const showState3 = b.property === 'state3';
      const showClass = b.property === 'class';
      const showOpacity = b.property === 'opacity';
      const showFormat = b.property === 'text';
      const showText5Palette = showFormat && (b.format === 'state5' || b.format === 'tpoSta' || b.format === 'poolBwSta');
      const showRotation = b.property === 'rotation';
      const showTrend = b.property === 'trend';
      const trendTagScale = showTrend && !!b.useTagScale;
      const numericTag = isNumericHmiTagType(hmiBindingTagType(b.tagId));
      const analogFill = numericTag && (b.property === 'fill' || b.property === 'stroke');
      const showMinMax = showOpacity || showFill5 || showFill8 || showState3 || showFormat || analogFill || showRotation || showTrend || (showFlashState && numericTag);
      const showFormatField = showFormat && !showTrend && !showText5Palette;
      const minTitle = showRotation ? 'tag value at min → needle angle (OFF column, °)'
        : (showOpacity ? 'opacity scale minimum' : (showFill5 ? 'INT min → state 0 (Off)' : (showState3 ? 'INT min → Auto (0)' : (showFill8 ? 'analog min → state 0' : (analogFill ? 'analog min → OFF color' : 'INT/REAL scale minimum')))));
      const maxTitle = showRotation ? 'tag value at max → needle angle (ON column, °)'
        : (showOpacity ? 'opacity scale maximum' : (showFill5 ? 'INT max → state 4 (Offline)' : (showState3 ? 'INT max → Hand (2)' : (showFill8 ? 'analog max → state 7' : (analogFill ? 'analog max → ON color' : 'INT/REAL scale maximum')))));
      const onColor = /^#[0-9a-f]{6}$/i.test(String(b.onValue || '')) ? b.onValue : (showTrend ? HMI_TREND_DEFAULT_COLOR : '#22c55e');
      const offColor = /^#[0-9a-f]{6}$/i.test(String(b.offValue || '')) ? b.offValue : '#94a3b8';
      const onText = showFormat ? hmiBindingTextValue(b.onValue) : '';
      const offText = showFormat ? hmiBindingTextValue(b.offValue) : '';
      const fill5Colors = normalizeFill5Colors(b.colors);
      const fill8Colors = normalizeFill8Colors(b.colors);
      const minVal = Number.isFinite(Number(b.min)) ? b.min : (showFill5 ? 0 : (showState3 ? 0 : (showFlashState ? 0 : 0)));
      const maxVal = Number.isFinite(Number(b.max)) ? b.max : (showFill5 ? 4 : (showState3 ? 2 : (showFlashState ? 2 : 100)));
      const trendTagRange = trendTagScale ? tagTrendScaleRange(b.tagId) : null;
      const minTitleTrend = trendTagScale
        ? (trendTagRange ? `From tag OL (${trendTagRange.min})` : 'Tag scale on — set alarm OL on tag')
        : minTitle;
      const maxTitleTrend = trendTagScale
        ? (trendTagRange ? `From tag OH (${trendTagRange.max})` : 'Tag scale on — set alarm OH on tag')
        : maxTitle;
      const minDisabled = !showMinMax || trendTagScale;
      const maxDisabled = !showMinMax || trendTagScale;
      const minDisplay = trendTagRange ? trendTagRange.min : minVal;
      const maxDisplay = trendTagRange ? trendTagRange.max : maxVal;
      const angleAtMax = Number.isFinite(Number(b.onValue)) ? Number(b.onValue) : 330;
      const angleAtMin = Number.isFinite(Number(b.offValue)) ? Number(b.offValue) : 30;
      const onOffCells = showState3
        ? `<td class="hmi-extra-cell hmi-state3-cell" colspan="2"><span class="muted">0 Auto · 1 Off · 2 Hand — click switch to cycle</span></td>`
        : showFlashState
          ? (numericTag
            ? `<td class="hmi-extra-cell hmi-flash-state-cell" colspan="2"><span class="muted">0 hidden · 1 flash red · 2 flash amber</span></td>`
            : `<td class="hmi-extra-cell hmi-flash-state-cell"><select data-hmi-on title="When tag is ON">${hmiFlashStateOptions(b.onValue || 'red')}</select></td>
        <td class="hmi-extra-cell hmi-flash-state-cell"><select data-hmi-off title="When tag is OFF">${hmiFlashStateOptions(b.offValue || 'hidden')}</select></td>`)
        : showFill5
        ? `<td class="hmi-extra-cell hmi-palette-cell" colspan="2">${hmiFill5PaletteHtml(fill5Colors)}</td>`
        : showFill8
          ? `<td class="hmi-extra-cell hmi-palette-cell" colspan="2">${hmiFill8PaletteHtml(fill8Colors)}</td>`
          : showText5Palette
            ? `<td class="hmi-extra-cell hmi-palette-cell" colspan="2">${hmiText5PaletteHtml(b.colors, b.format)}</td>`
          : showTrend
            ? `<td class="hmi-extra-cell hmi-trend-color-cell" colspan="2">${hmiTrendPenColorHtml(onColor)}</td>`
          : showRotation
          ? `<td class="hmi-extra-cell hmi-binding-num-col"><input data-hmi-on type="number" step="any" class="input-sm" value="${angleAtMax}" title="Needle angle at tag max (°)"></td>
        <td class="hmi-extra-cell hmi-binding-num-col"><input data-hmi-off type="number" step="any" class="input-sm" value="${angleAtMin}" title="Needle angle at tag min (°)"></td>`
          : showColors
            ? `<td class="hmi-extra-cell hmi-palette-cell" colspan="2">${hmiDualColorPaletteHtml(offColor, onColor)}</td>`
          : `<td class="hmi-extra-cell hmi-color-cell">${showFormat ? `<input data-hmi-on value="${esc(onText)}" placeholder="ON text">` : ''}</td>
        <td class="hmi-extra-cell hmi-color-cell">${showFormat ? `<input data-hmi-off value="${esc(offText)}" placeholder="OFF text">` : ''}</td>`;
      const fieldHint = b.tagField ? ` · ${b.tagField}` : '';
      return `<tr data-hmi-row="${i}"${b.tagField ? ` data-hmi-field="${esc(b.tagField)}"` : ''}>
        <td class="hmi-binding-element-col"><input data-hmi-element list="hmi-element-ids" value="${esc(b.elementId || '')}" placeholder="element id or @screen" title="${esc((b.elementId || '') + fieldHint)}"></td>
        <td class="hmi-binding-tag-col"><select data-hmi-tag>${hmiTagOptions(b.tagId)}</select></td>
        <td><select data-hmi-prop>${hmiPropOptions(b.property || 'fill', b.elementId)}</select></td>
        ${onOffCells}
        <td class="hmi-extra-cell">${showClass ? `<input data-hmi-class-on value="${esc(b.classOn || 'hmi-on')}" placeholder="classOn">` : ''}</td>
        <td class="hmi-extra-cell">${showClass ? `<input data-hmi-class-off value="${esc(b.classOff || 'hmi-off')}" placeholder="classOff">` : ''}</td>
        <td class="hmi-extra-cell hmi-binding-num-col"><input data-hmi-min type="number" step="any" value="${minDisplay}" class="input-sm" title="${esc(minTitleTrend)}"${minDisabled ? ' disabled' : ''}></td>
        <td class="hmi-extra-cell hmi-binding-num-col"><input data-hmi-max type="number" step="any" value="${maxDisplay}" class="input-sm" title="${esc(maxTitleTrend)}"${maxDisabled ? ' disabled' : ''}></td>
        <td class="hmi-extra-cell hmi-binding-format-col">${showTrend
          ? `<input data-hmi-samples type="number" min="8" max="512" step="1" class="input-sm" value="${Number.isFinite(Number(b.samples)) ? b.samples : 64}" title="Number of trend samples in strip chart">`
          : `<select data-hmi-format title="INT/REAL display format"${showFormatField ? '' : ' disabled'}>${hmiFormatOptions(b.format)}</select>`}</td>
        ${hmiBindingTestCell(b)}
        <td class="hmi-row-actions">
          <button type="button" class="btn btn-sm" data-hmi-dup title="Duplicate">+</button>
          <button type="button" class="btn btn-sm" data-hmi-del title="Remove">×</button>
        </td>
      </tr>`;
    }).join('');
    host.innerHTML = `<table class="data-table hmi-bindings-table">
      <thead><tr>
        <th class="hmi-binding-element-col">Element id</th><th class="hmi-binding-tag-col">Tag</th><th>Property</th>
        <th>Colors / pen</th><th class="view-hidden">—</th><th>classOn</th><th>classOff</th>
        <th class="hmi-binding-num-col">min<span class="th-sub">scale</span></th>
        <th class="hmi-binding-num-col">max<span class="th-sub">scale</span></th>
        <th class="hmi-binding-format-col">format / samples<span class="th-sub">text · trend buffer</span></th>
        <th class="hmi-binding-test-col">Test<span class="th-sub">text: number · BOOL · Test btn</span></th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="12" class="muted">No bindings for this screen</td></tr>'}</tbody>
    </table>`;
    const mark = () => { markHmiDirty(); collectHmiBindingsFromTable(); scheduleHmiPreview(); };
    host.querySelectorAll('[data-hmi-element], [data-hmi-tag], [data-hmi-class-on], [data-hmi-class-off], [data-hmi-min], [data-hmi-max], [data-hmi-format], [data-hmi-samples], input[data-hmi-on], input[data-hmi-off]').forEach((el) => {
      el.addEventListener('input', mark);
    });
    host.querySelectorAll('[data-hmi-tag], [data-hmi-prop]').forEach((el) => {
      el.addEventListener('change', (e) => {
        markHmiDirty();
        collectHmiBindingsFromTable();
        if (e.target.matches('[data-hmi-tag]')) {
          const tr = e.target.closest('tr');
          const idx = Number(tr?.dataset.hmiRow);
          const b = bindingsForScreen()[idx];
          if (b) {
            const tagType = hmiBindingTagType(b.tagId);
            if (isNumericHmiTagType(tagType)) Object.assign(b, coerceHmiBindingForNumericTag(b));
          }
        }
        renderHmiBindingsTable();
        scheduleHmiPreview();
      });
    });
    host.querySelectorAll('[data-hmi-element], [data-hmi-class-on], [data-hmi-class-off], [data-hmi-min], [data-hmi-max], [data-hmi-samples], input[data-hmi-on], input[data-hmi-off]').forEach((el) => {
      el.addEventListener('change', mark);
    });
    host.querySelectorAll('[data-hmi-format]').forEach((el) => {
      el.addEventListener('change', () => {
        markHmiDirty();
        collectHmiBindingsFromTable();
        renderHmiBindingsTable();
        scheduleHmiPreview();
      });
    });
    host.querySelectorAll('select[data-hmi-on], select[data-hmi-off], select[data-hmi-trend-stroke]').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.matches('[data-hmi-trend-stroke]')) {
          const wrap = el.closest('.hmi-trend-pen-color');
          const hidden = wrap?.querySelector('[data-hmi-trend-color="0"]');
          if (hidden) hidden.value = el.value;
        }
        syncHmiColorSelectStyles(host);
        mark();
      });
    });
    bindHmiPaletteEditors(host);
    host.querySelectorAll('.hmi-palette-editor').forEach((ed) => syncPaletteEditorUi(ed));
    host.querySelectorAll('[data-hmi-test-row]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyHmiBindingTestRow(btn.closest('tr'));
      });
    });
    host.querySelectorAll('[data-hmi-test-bool-val], [data-hmi-test-num]').forEach((el) => {
      el.addEventListener('change', () => {
        const tr = el.closest('tr[data-hmi-row]');
        if (tr) applyHmiBindingTestRow(tr);
      });
    });
    host.querySelectorAll('[data-hmi-dup]').forEach((btn) => {
      btn.onclick = () => {
        markHmiDirty();
        const tr = btn.closest('tr');
        const idx = Number(tr?.dataset.hmiRow);
        const src = bindingsForScreen()[idx];
        if (src) hmiConfig.bindings.push({ ...src, screenId: hmiEditScreenId || hmiConfig.activeScreen });
        renderHmiBindingsTable();
        scheduleHmiPreview();
      };
    });
    host.querySelectorAll('[data-hmi-del]').forEach((btn) => {
      btn.onclick = () => {
        const tr = btn.closest('tr');
        const idx = Number(tr?.dataset.hmiRow);
        if (Number.isFinite(idx)) removeHmiBindingAtScreenIndex(idx);
      };
    });
    const bc = domGet('hmi-binding-count');
    if (bc) bc.textContent = `(${bindings.length})`;
    syncHmiColorSelectStyles(host);
    renderHmiObjectBindingsPanel();
  }

  let hmiPreviewTimer = null;
  function scheduleHmiPreview(forceReload) {
    if (!isHmiSetupOpen()) return;
    clearTimeout(hmiPreviewTimer);
    hmiPreviewTimer = setTimeout(() => {
      if (!forceReload) {
        const kind = domGet('hmi-place-kind')?.value || '';
        if (!isScreenNavKind(kind)) syncHmiFromFields();
        else collectHmiBindingsFromTable();
      }
      if (!forceReload && applyHmiPreviewLayout()) return;
      refreshHmiSetupPreview(forceReload).catch(console.error);
    }, forceReload ? 0 : 350);
  }

  async function renderHmiSetup() {
    try {
      await loadHmiAssets(true);
    } catch (e) {
      showHmiSetupMsg(e.message || String(e), true);
      throw e;
    }
    loadHmiRecentAssets();
    seedHmiRecentFromConfig();
    fillHmiAssetGroupSelect();
    fillHmiAssetSubgroupSelect();
    onHmiAssetFilterChange();
    restoreHmiComposerSection();
    bindHmiComposerNav();
    bindHmiComposerColSplitter();
    syncHmiConfigForSetupOpen();
    if (!hmiConfig.screens?.length) hmiConfig = demoHmiConfig();
    if (!hmiEditScreenId || !hmiConfig.screens.some((s) => s.id === hmiEditScreenId)) {
      hmiEditScreenId = HOME_SCREEN_ID;
    }
    updateHomeScreenLabel();
    syncHmiScreenFieldsFromConfig();
    renderHmiBindingsTable();
    bindHmiSetupTileKeys();
    clearHmiTileSelection();
    selectHmiAsset('');
    applyComposerModeUi();
    await refreshHmiSetupPreview(true);
  }

  function prepareHmiConfigForSave() {
    syncHmiFromFields();
    if (!hmiConfig.screens?.length) return false;
    ensureHmiLayout(hmiConfig);
    for (const screen of hmiConfig.screens) {
      ensureScreenTiles(screen);
      ensureScreenGridDefaults(screen);
      pruneTilesToGrid(screen);
    }
    repairCompositeBindings(hmiConfig);
    syncMultiPageDisplayLayout(hmiConfig);
    hmiConfig = reindexHmiScreensClient(hmiConfig);
    ensureHmiLayout(hmiConfig);
    hmiConfig.activeScreen = readStartingScreenFromSetup();
    return true;
  }

  function applyHmiSettings() {
    if (!prepareHmiConfigForSave()) {
      alert('Add at least one screen.');
      return Promise.resolve();
    }
    const msg = domGet('hmi-setup-msg');
    return api.putSettings({ hmi: hmiConfig, projectName: projectName() }).then(async (res) => {
      hmiDirty = false;
      if (res?.hmi) {
        hmiConfig = migrateHmiConfig(JSON.parse(JSON.stringify(res.hmi)));
        markHmiConfigReady();
        hmiServerSettingsKey = hmiSettingsFingerprint(hmiConfig);
      }
      d().patchLastSettings({ hmi: hmiConfig });
      updateHomeScreenLabel();
      try {
        await d().persistCurrentProjectSnapshot?.({ includeSavedProject: true });
      } catch (persistErr) {
        if (msg) msg.textContent = '';
        throw persistErr;
      }
      if (msg) msg.textContent = 'HMI settings saved to current project';
      if (isHmiSetupOpen()) {
        hmiPreviewSvg = '';
        syncHmiScreenFieldsFromConfig();
        scheduleHmiPreview(true);
      }
      if (isHmiViewActive()) {
        hmiViewScreenId = hmiConfig.activeScreen || startingHmiScreenId();
        renderHmiNavBar();
        hmiLoadedUrl = '';
        return loadHmiScreen(true);
      }
      return refreshAll();
    }).catch((e) => {
      if (msg) msg.textContent = '';
      alert(e.message);
      throw e;
    });
  }

  function applyHmiSettingsIfDirty() {
    if (!hmiDirty) return Promise.resolve();
    return applyHmiSettings();
  }

  function bindHmiToolbar() {
    if (document.body.dataset.hmiToolbarBound === '1') return;
    document.body.dataset.hmiToolbarBound = '1';
    if (document.body.dataset.hmiComposerSelectsInit !== '1') {
      document.body.dataset.hmiComposerSelectsInit = '1';
      initHmiComposerSelects();
    }
    domGet('btn-hmi-alarms-ack-all')?.addEventListener('click', () => {
      api.ackAllAlarms()
        .then((res) => {
          applyAckLiveResponse(res);
          return d().refreshAll?.({ force: true });
        })
        .catch((e) => alert(e.message || String(e)));
    });
    domGet('btn-hmi-reload')?.addEventListener('click', async () => {
      hmiLoadedUrl = '';
      ensureHmiConfigLoaded();
      if (!hmiConfig.screens?.length) {
        alert('No HMI screens in memory. Open Setup, apply settings, then try again.');
        return;
      }
      const scr = viewedHmiScreen();
      if (scr) ensureScreenTiles(scr);
      try {
        await loadHmiScreen(true);
      } catch (e) {
        alert(e.message || String(e));
      }
    });
    domGet('hmi-nav-bar')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hmi-nav]');
      if (!btn) return;
      navigateHmiView(btn.getAttribute('data-hmi-nav'));
    });
    domGet('btn-hmi-hide-status')?.addEventListener('click', hideLiveStatusBar);
    domGet('btn-hmi-show-status')?.addEventListener('click', showLiveStatusBar);
    syncLiveStatusBarVisibility();
    domGet('hmi-test-mode')?.addEventListener('change', (e) => {
      persistHmiTestMode(e.target.checked).catch(console.error);
    });
    syncHmiTestModeUi(lastSettings?.());
    domGet('btn-hmi-refresh-assets')?.addEventListener('click', () => {
      loadHmiAssets(true).then(() => {
        fillHmiAssetGroupSelect();
        fillHmiAssetSubgroupSelect();
        onHmiAssetFilterChange();
        fillHmiRecentAssetGrid();
        showHmiSetupMsg(`${hmiAssets.length} symbol(s) loaded · ${[...new Set(hmiAssets.map((a) => a.group))].length} groups`, false);
      }).catch((e) => {
        showHmiSetupMsg(e.message || String(e), true);
        alert(e.message);
      });
    });
    domGet('btn-hmi-load-more-assets')?.addEventListener('click', () => loadMoreHmiAssets());
    bindHmiComposerNav();
    bindHmiComposerColSplitter();
    bindHmiAssetPageKeys(domGet('hmi-asset-grid'));
    bindHmiAssetPageKeys(domGet('hmi-recent-asset-grid'));
    bindHmiAssetPageKeys(domGet('hmi-asset-search'));
    bindHmiAssetPageKeys(domGet('hmi-asset-type'));
    domGet('btn-hmi-load-demo')?.addEventListener('click', () => {
      hmiConfig = demoHmiConfig();
      hmiDirty = true;
      renderHmiSetup().catch(console.error);
    });
    domGet('btn-hmi-add-screen')?.addEventListener('click', async () => {
      if (!hmiAssets.length) await loadHmiAssets(true);
      markHmiDirty();
      syncHmiScreenMetaFromFields();
      const asset = defaultNewScreenAsset();
      const nextNum = hmiConfig.screens.length + 1;
      const base = asset?.name?.replace(/\.(svg|gif|png)$/i, '') || `Screen ${nextNum}`;
      hmiConfig.screens.push({
        name: base,
        svg: asset?.path || HMI_DEFAULT_SVG,
        width: HMI_DEFAULT_WIDTH,
        height: HMI_DEFAULT_HEIGHT,
        displayMaxWidth: HMI_DEFAULT_WIDTH,
        displayMaxHeight: HMI_DEFAULT_HEIGHT,
        fit: 'contain',
        scale: 100,
        background: '#f1f5f9',
        offsetX: 0,
        offsetY: 0,
      });
      hmiConfig = reindexHmiScreensClient(hmiConfig);
      ensureHmiLayout(hmiConfig);
      hmiEditScreenId = hmiConfig.screens[hmiConfig.screens.length - 1]?.id || HOME_SCREEN_ID;
      resetHmiAssetPages();
      syncHmiScreenFieldsFromConfig();
      updateHomeScreenLabel();
      renderHmiBindingsTable();
      scheduleHmiPreview(true);
    });
    domGet('btn-hmi-remove-screen')?.addEventListener('click', () => {
      const id = hmiEditScreenId || HOME_SCREEN_ID;
      if (id === HOME_SCREEN_ID) {
        alert('Screen 1 (home) cannot be removed.');
        return;
      }
      if (hmiConfig.screens.length <= 1) {
        alert('At least one screen is required.');
        return;
      }
      markHmiDirty();
      syncHmiScreenMetaFromFields();
      hmiConfig.screens = hmiConfig.screens.filter((s) => s.id !== id);
      hmiConfig.bindings = hmiConfig.bindings.filter((b) => b.screenId !== id);
      hmiConfig = reindexHmiScreensClient(hmiConfig);
      ensureHmiLayout(hmiConfig);
      hmiEditScreenId = hmiConfig.screens[hmiConfig.screens.length - 1]?.id || HOME_SCREEN_ID;
      syncHmiScreenFieldsFromConfig();
      updateHomeScreenLabel();
      renderHmiBindingsTable();
      scheduleHmiPreview();
    });
    domGet('btn-hmi-duplicate-screen')?.addEventListener('click', () => {
      syncHmiScreenMetaFromFields();
      const src = activeHmiScreen();
      if (!src) return;
      markHmiDirty();
      const srcIdx = hmiConfig.screens.findIndex((s) => s.id === src.id);
      const copy = {
        ...src,
        name: `${src.name || `Screen ${src.number}`} (copy)`,
        tiles: JSON.parse(JSON.stringify(src.tiles || [])),
      };
      delete copy.number;
      delete copy.id;
      delete copy.isHome;
      hmiConfig.screens.splice(srcIdx + 1, 0, copy);
      const copies = bindingsForScreen(src.id).map((b) => ({ ...b, screenId: '' }));
      hmiConfig = reindexHmiScreensClient(hmiConfig);
      ensureHmiLayout(hmiConfig);
      const newScreen = hmiConfig.screens[srcIdx + 1];
      if (newScreen) {
        hmiConfig.bindings.push(...copies.map((b) => ({ ...b, screenId: newScreen.id })));
      }
      hmiEditScreenId = newScreen?.id || HOME_SCREEN_ID;
      syncHmiScreenFieldsFromConfig();
      renderHmiBindingsTable();
      scheduleHmiPreview();
    });
    domGet('btn-hmi-read-size')?.addEventListener('click', async () => {
      syncHmiScreenMetaFromFields();
      const screen = activeHmiScreen();
      if (!screen?.svg) {
        alert('Select a screen file first.');
        return;
      }
      try {
        const size = await HmiView.measureAsset(screen.svg);
        screen.naturalWidth = size.width;
        screen.naturalHeight = size.height;
        screen.width = size.width;
        screen.height = size.height;
        if (domGet('hmi-screen-width')) domGet('hmi-screen-width').value = size.width;
        if (domGet('hmi-screen-height')) domGet('hmi-screen-height').value = size.height;
        if (domGet('hmi-logical-preset')) domGet('hmi-logical-preset').value = 'custom';
        domGet('hmi-logical-custom-wrap')?.classList.remove('view-hidden');
        domGet('hmi-logical-custom-wrap-y')?.classList.remove('view-hidden');
        syncLayoutPresetFromFields();
        syncLogicalPresetFromFields();
        syncDisplayPresetFromFields();
        updateHmiNaturalSizeLabel(screen);
        markHmiDirty();
        scheduleHmiPreview();
        const msg = domGet('hmi-setup-msg');
        if (msg) msg.textContent = `Natural size: ${size.width}×${size.height} (X × Y)`;
      } catch (e) {
        alert(e.message);
      }
    });
    domGet('btn-hmi-reset-position')?.addEventListener('click', () => {
      if (domGet('hmi-screen-offset-x')) domGet('hmi-screen-offset-x').value = 0;
      if (domGet('hmi-screen-offset-y')) domGet('hmi-screen-offset-y').value = 0;
      syncHmiScreenMetaFromFields();
      markHmiDirty();
      scheduleHmiPreview();
    });
    domGet('btn-hmi-apply-size')?.addEventListener('click', () => {
      markHmiDirty();
      scheduleHmiPreview();
      if (isHmiViewActive()) {
        hmiLoadedUrl = '';
        loadHmiScreen(true).catch(console.error);
      }
    });
    domGet('btn-hmi-refresh-preview')?.addEventListener('click', () => {
      refreshHmiSetupPreview().catch((e) => alert(e.message));
    });
    domGet('btn-hmi-add-binding')?.addEventListener('click', () => {
      markHmiDirty();
      hmiConfig.bindings.push(defaultHmiBinding());
      renderHmiBindingsTable();
    });
    domGet('btn-hmi-clear-binding-test')?.addEventListener('click', () => clearHmiBindingTestValues());
    domGet('btn-hmi-test-screen')?.addEventListener('click', () => applyHmiBindingTestScreen());
    domGet('hmi-screen-select')?.addEventListener('change', () => {
      syncHmiFromFields();
      hmiEditScreenId = domGet('hmi-screen-select').value;
      hmiPreviewSvg = '';
      syncHmiScreenFieldsFromConfig();
      renderHmiBindingsTable();
      applyComposerPreviewPanels(activeHmiScreen());
      scheduleHmiPreview(true);
    });
    ['hmi-screen-name', 'hmi-screen-scale', 'hmi-screen-offset-x', 'hmi-screen-offset-y'].forEach((id) => {
      domGet(id)?.addEventListener('input', () => {
        markHmiDirty();
        syncHmiScreenMetaFromFields();
        scheduleHmiPreview();
      });
    });
    ['hmi-screen-width', 'hmi-screen-height', 'hmi-display-max-width', 'hmi-display-max-height',
      'hmi-cell-width-custom', 'hmi-cell-height-custom'].forEach((id) => {
      domGet(id)?.addEventListener('input', () => {
        markHmiDirty();
        syncHmiScreenMetaFromFields();
        syncLayoutPresetFromFields();
        syncLogicalPresetFromFields();
        syncDisplayPresetFromFields();
        scheduleHmiPreview();
      });
    });
    ['hmi-grid-cols', 'hmi-grid-rows', 'hmi-cell-width', 'hmi-cell-height'].forEach((id) => {
      domGet(id)?.addEventListener('change', () => {
        if (id === 'hmi-cell-width') {
          onCellSizeSelectChange('hmi-cell-width', 'hmi-cell-width-custom', 'hmi-cell-width-custom-wrap');
        }
        if (id === 'hmi-cell-height') {
          onCellSizeSelectChange('hmi-cell-height', 'hmi-cell-height-custom', 'hmi-cell-height-custom-wrap');
        }
        applyGridSizeFromCellFields();
      });
    });
    domGet('hmi-layout-preset')?.addEventListener('change', () => {
      const presetId = domGet('hmi-layout-preset')?.value;
      if (presetId && presetId !== 'custom') applyLayoutPreset(presetId);
    });
    domGet('hmi-logical-preset')?.addEventListener('change', onLogicalPresetChange);
    domGet('hmi-display-preset')?.addEventListener('change', onDisplayPresetChange);
    domGet('hmi-show-grid')?.addEventListener('change', () => {
      readProjectLayoutFromFields();
      markHmiDirty();
      scheduleHmiPreview(true);
    });
    domGet('hmi-show-live-status')?.addEventListener('change', () => {
      readProjectLayoutFromFields();
      markHmiDirty();
    });
    domGet('hmi-composer-mode')?.addEventListener('change', (e) => {
      setComposerMode(e.target.value);
    });
    domGet('proj-hmi-composer-mode')?.addEventListener('change', (e) => {
      setComposerMode(e.target.value);
    });
    ['hmi-screen-fit', 'hmi-place-kind'].forEach((id) => {
      domGet(id)?.addEventListener('change', () => {
        if (id === 'hmi-screen-fit') syncHmiScreenMetaFromFields();
        if (id === 'hmi-place-kind') {
          clearHmiPlacementCursor();
          updateHmiPlaceOptionsUi();
          renderHmiObjectBindingsPanel();
          if (domGet('hmi-place-kind')?.value === 'navButton') {
            fillHmiNavTargetSelect();
            const zEl = domGet('hmi-place-z');
            if (zEl && !hmiSelectedTileCell) zEl.value = '4';
          } else if (domGet('hmi-place-kind')?.value === 'pageHotspot') {
            fillHmiNavTargetSelect();
            const zEl = domGet('hmi-place-z');
            if (zEl && !hmiSelectedTileCell) zEl.value = '1';
          } else if (domGet('hmi-place-kind')?.value === 'flashOverlay') {
            const zEl = domGet('hmi-place-z');
            if (zEl && !hmiSelectedTileCell) zEl.value = '1';
          }
        }
        markHmiDirty();
        scheduleHmiPreview(true);
      });
    });
    domGet('hmi-flash-overlay-color')?.addEventListener('change', () => {
      markHmiDirty();
      if (!hmiSelectedTileCell) return;
      const { col, row } = hmiSelectedTileCell;
      const tile = getScreenTile(activeHmiScreen(), col, row);
      if (tile && flashOverlayLayerFromTile(tile)) {
        applyFlashOverlayColorToConfig(tile, selectedFlashOverlayColor(), selectedHmiPlaceZ());
        refreshFlashOverlayCellPreview(col, row).then(() => scheduleHmiPreview(true)).catch(console.error);
      }
    });
    domGet('hmi-nav-target')?.addEventListener('change', () => {
      const targetScreenId = domGet('hmi-nav-target')?.value?.trim();
      if (!targetScreenId) return;
      const kind = domGet('hmi-place-kind')?.value || '';
      markHmiDirty();
      if (!hmiSelectedTileCell) return;
      const { col, row } = hmiSelectedTileCell;
      if (kind === 'pageHotspot') {
        const { col, row } = hmiSelectedTileCell;
        const scr = activeHmiScreen();
        const tile = getScreenTile(scr, col, row);
        const anchorCol = tile ? Number(tile.col) : col;
        const anchorRow = tile ? Number(tile.row) : row;
        const { colSpan, rowSpan } = selectedTileSpan();
        upsertPageHotspotLayer(
          scr,
          anchorCol,
          anchorRow,
          targetScreenId,
          domGet('hmi-tile-label-input')?.value?.trim() || '',
          selectedHmiPlaceZ(),
          { hotspotCol: col, hotspotRow: row, colSpan, rowSpan },
        );
        refreshPageHotspotCellPreview(anchorCol, anchorRow).then(() => scheduleHmiPreview(true)).catch(console.error);
        return;
      }
      upsertNavButtonLayer(
        activeHmiScreen(),
        col,
        row,
        targetScreenId,
        navButtonLabelFromFields(targetScreenId),
        selectedHmiPlaceZ()
      );
      refreshNavButtonCellPreview(col, row).then(() => scheduleHmiPreview(true)).catch(console.error);
    });
    domGet('hmi-tile-label-input')?.addEventListener('input', () => {
      const kind = domGet('hmi-place-kind')?.value || '';
      markHmiDirty();
      if (kind === 'pageHotspot' && hmiSelectedTileCell) {
        const { col, row } = hmiSelectedTileCell;
        const tile = getScreenTile(activeHmiScreen(), col, row);
        if (tile && pageHotspotLayerFromTile(tile)) {
          applyPageHotspotLabelToConfig(tile, domGet('hmi-tile-label-input')?.value || '');
          refreshPageHotspotCellPreview(col, row).catch(console.error);
          return;
        }
      }
      if (kind === 'navButton' && hmiSelectedTileCell) {
        const { col, row } = hmiSelectedTileCell;
        const tile = getScreenTile(activeHmiScreen(), col, row);
        if (tile && navLayerFromTile(tile)) {
          applyNavButtonLabelToConfig(tile, domGet('hmi-tile-label-input')?.value || '');
          refreshNavButtonCellPreview(col, row).catch(console.error);
          return;
        }
      }
      flushHmiTileLabelFromFields();
      scheduleHmiPreview();
    });
    ['hmi-tile-col-span', 'hmi-tile-row-span'].forEach((id) => {
      domGet(id)?.addEventListener('change', () => {
        if (hmiSelectedTileCell && applySelectedTileSpanFromFields()) return;
        markHmiDirty();
      });
    });
    domGet('hmi-region-cell-fraction')?.addEventListener('change', () => {
      if (applySelectedCellFractionFromFields()) return;
      markHmiDirty();
    });
    domGet('hmi-place-z')?.addEventListener('change', () => {
      markHmiDirty();
      updateHmiStripChartPanel();
      updateHmiGaugeColumnPanel();
      updateHmiPushButtonPanel();
      updateHmiPilotLightPanel();
      renderHmiObjectBindingsPanel();
    });
    bindHmiStripChartPanel();
    bindHmiGaugeColumnPanel();
    bindHmiPushButtonPanel();
    bindHmiPilotLightPanel();
    bindHmiObjectBindingsPanel();
    domGet('btn-hmi-delete-tile')?.addEventListener('click', () => {
      if (!hmiSelectedTileCell) {
        alert('Select a grid cell first.');
        return;
      }
      deleteHmiTile(hmiSelectedTileCell.col, hmiSelectedTileCell.row, activeHmiScreen());
    });
    domGet('btn-hmi-clear-grid')?.addEventListener('click', () => {
      if (!window.confirm('Clear all symbols from this screen grid?')) return;
      clearHmiTileGrid(activeHmiScreen());
    });
    bindHmiImportGraphic();
    domGet('btn-hmi-add-page-nav')?.addEventListener('click', () => {
      markHmiDirty();
      addPageNavigationButtons();
      scheduleHmiPreview(true);
      refreshMainTileGrid(true);
    });
    domGet('hmi-screen-bg')?.addEventListener('change', () => {
      syncHmiColorSelectStyles(domGet('hmi-bindings-table'));
      const bgEl = domGet('hmi-screen-bg');
      if (bgEl?.style) bgEl.style.setProperty('--hmi-fill8-swatch', bgEl.value || '#f1f5f9');
      markHmiDirty();
      scheduleHmiPreview();
    });
    domGet('hmi-svg-select')?.addEventListener('change', () => {
      selectHmiAsset(domGet('hmi-svg-select')?.value?.trim() || '');
    });
    domGet('hmi-asset-type')?.addEventListener('change', onHmiAssetFilterChange);
    domGet('hmi-asset-group')?.addEventListener('change', () => {
      fillHmiAssetSubgroupSelect();
      onHmiAssetFilterChange();
    });
    domGet('hmi-asset-subgroup')?.addEventListener('change', onHmiAssetFilterChange);
    domGet('hmi-asset-search')?.addEventListener('input', onHmiAssetFilterChange);
    domGet('hmi-asset-quick-filter')?.addEventListener('change', onHmiAssetQuickFilterChange);
    bindHmiAssetPageKeys(domGet('hmi-asset-quick-filter'));
    bindHmiAssetPageKeys(domGet('hmi-asset-group'));
    bindHmiAssetPageKeys(domGet('hmi-asset-subgroup'));
    domGet('btn-hmi-save-header')?.addEventListener('click', () => {
      applyHmiSettings().catch(() => { /* alert in applyHmiSettings */ });
    });
    window.PeakLogicTagDisplay?.bindAll(document);
    window.addEventListener('peaklogic-tag-display', () => {
      if (domGet('hmi-bindings-table')) renderHmiBindingsTable();
      updateHmiStripChartPanel();
      updateHmiGaugeColumnPanel();
    });
  }

  function wireHmiSetupPanelOnce() {
    mountHmiSetupPanelToBody();
    if (document.body.dataset.hmiComposerSelectsInit === '1') return;
    document.body.dataset.hmiComposerSelectsInit = '1';
    initHmiComposerSelects();
  }

  function openSetupPopup() {
    mountHmiSetupPanelToBody();
    const shell = hmiSetupShell();
    const chrome = hmiSetupChrome();
    if (shell) shell.classList.add('view-hidden');
    if (chrome) {
      chrome.classList.remove('view-hidden');
      window.MvWindowStack?.onOpen(chrome);
    }
    positionHmiSetupPopup(true);
    requestAnimationFrame(() => {
      positionHmiSetupPopup(true);
      clampHmiSetupOnResize();
    });
    void openSetupPopupLoad();
  }

  async function openSetupPopupLoad() {
    syncHmiConfigForSetupOpen();
    try {
      const data = await d().refreshAll({ force: true });
      if (data?.settings?.hmi?.screens?.length) {
        if (!upgradeHmiFromServerIfRicher(data.settings.hmi)) {
          applyServerHmiSettingsIfChanged(data.settings.hmi);
        }
      }
    } catch (e) {
      console.warn('[HMI setup] refresh before open:', e);
    }
    if (hmiScreenCount(hmiConfig) < 8) {
      await ensureFullProjectHmiLoaded();
    }
    syncHmiConfigForSetupOpen();
    if (!isHmiSetupOpen()) return;
    if (!hmiEditScreenId || !hmiConfig.screens.some((s) => s.id === hmiEditScreenId)) {
      hmiEditScreenId = HOME_SCREEN_ID;
    }
    resetHmiAssetPages();
    try {
      await renderHmiSetup();
    } catch (e) {
      console.error(e);
    }
    if (!isHmiSetupOpen()) return;
    const n = hmiScreenCount(hmiConfig);
    if (n < 8) {
      showHmiSetupMsg(hmiSetupScreenCountHint(n), true);
    } else {
      showHmiSetupMsg('');
    }
    showHmiComposerSection('screen');
    clampHmiSetupOnResize();
  }

  function closeSetupPopup() {
    if (hmiDirty) {
      const discard = window.confirm(
        'HMI changes are not saved yet. Close without saving? (Use Apply HMI settings to save.)'
      );
      if (!discard) return;
      hmiDirty = false;
      if (lastSettings()?.hmi) {
        hmiConfig = migrateHmiConfig(JSON.parse(JSON.stringify(lastSettings().hmi)));
        repairInvalidHmiBindings(hmiConfig);
        migrateBareBindingElementIds(hmiConfig);
        markHmiConfigReady();
      }
      hmiEditScreenId = '';
      hmiPreviewSvg = '';
    }
    const chrome = hmiSetupChrome();
    if (chrome) chrome.classList.add('view-hidden');
    const shell = hmiSetupShell();
    if (shell) shell.classList.add('view-hidden');
    showHmiSetupMsg('');
  }

  function forceReloadFromDashboard(data) {
    hmiDirty = false;
    invalidateHmiConfigReady();
    const settingsHmi = data?.settings?.hmi;
    const picked = pickRichestHmiConfig(settingsHmi, hmiConfig);
    if (picked && applyPickedHmiConfig(picked)) {
      /* applied richest snapshot */
    } else if (settingsHmi?.screens?.length) {
      applyServerHmiSettingsForced(settingsHmi);
    } else {
      hmiConfig = demoHmiConfig();
      markHmiConfigReady();
      hmiServerSettingsKey = hmiSettingsFingerprint(hmiConfig);
    }
    hmiLoadedUrl = '';
    hmiPreviewSvg = '';
    hmiBindingTestValues = {};
    hmiEditScreenId = hmiConfig.activeScreen || HOME_SCREEN_ID;
    if (isHmiSetupOpen()) {
      syncHmiScreenFieldsFromConfig();
      renderHmiBindingsTable();
      scheduleHmiPreview(true);
    }
    syncComposerModeFromSettings();
    syncHmiLiveDisplayHint();
    if (isHmiViewActive()) {
      hmiViewScreenId = hmiConfig.activeScreen || startingHmiScreenId();
      renderHmiNavBar();
      syncLiveStatusBarVisibility();
      loadHmiScreen(true).catch(console.error);
    }
    if (isPopupOpen('project')) updateHomeScreenLabel();
    refreshHmiAlarmSidebar();
  }

  function handleDashboardPoll(data) {
    let hmiSettingsChanged = false;
    const settingsHmi = data.settings?.hmi;
    if (settingsHmi?.screens?.length && shouldUpgradeHmiFromServer(settingsHmi)) {
      hmiSettingsChanged = applyServerHmiSettingsForced(settingsHmi);
      if (isHmiSetupOpen()) {
        syncHmiScreenFieldsFromConfig();
        renderHmiBindingsTable();
        scheduleHmiPreview(true);
      }
    } else if (!hmiDirty && settingsHmi?.screens?.length) {
      hmiSettingsChanged = applyServerHmiSettingsIfChanged(settingsHmi);
    }
    if (isHmiViewActive()) {
      if (hmiSettingsChanged) {
        const keepView = hmiViewScreenId
          && hmiConfig.screens.some((s) => s.id === hmiViewScreenId);
        if (!keepView) {
          hmiViewScreenId = hmiConfig.activeScreen || startingHmiScreenId();
        }
        renderHmiNavBar();
        hmiLoadedUrl = '';
        loadHmiScreen(true).catch(console.error);
        return;
      }
      ensureHmiConfigLoaded();
      renderHmiNavBar();
      const screen = viewedHmiScreen();
      let loadKey = '';
      if (screen) {
        try {
          loadKey = composerPreviewUses3d(screen)
            ? hmiLive3dLoadKey()
            : `${hmiScreenLoadKey(screen)}|display`;
        } catch (e) {
          console.error(e);
          loadKey = `${screen.id}|display|fallback`;
        }
      }
      if (!screen || !viewportHasHmiStage()) {
        loadHmiScreen(false).catch(console.error);
      } else if (hmiLoadedUrl !== loadKey) {
        loadHmiScreen(true).catch(console.error);
      } else {
        refreshHmiBindings(hmiSvgRoot, screen.id);
      }
    } else if (isHmiSetupOpen() && !hmiDirty && !isHmiEditorFocused()) {
      syncHmiScreenFieldsFromConfig();
      scheduleHmiPreview();
    }
    if (isPopupOpen('project') && !hmiDirty) updateHomeScreenLabel();
    syncHmiTestModeUi(data.settings);
  }

  function refreshLiveBindings(live) {
    refreshHmiBindings(isHmiViewActive() ? hmiSvgRoot : null);
    refreshHmiAlarmSidebar();
    if (isHmiSetupOpen()) {
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
    }
  }

  function syncFromFieldsIfDirty() {
    if (isHmiSetupOpen() && hmiDirty) syncHmiFromFields();
  }

  function getConfig() { return hmiConfig; }
  function setConfig(cfg) { hmiConfig = cfg; }
  function isDirty() { return hmiDirty; }

  function clearDirty() {
    hmiDirty = false;
  }

  function getConfigForSave() {
    if (!hmiDirty && !isHmiSetupOpen()) return hmiConfig;
    prepareHmiConfigForSave();
    return hmiConfig;
  }

  function init(appDeps) {
    deps = appDeps;
    const wirePanel = () => wireHmiSetupPanelOnce();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wirePanel);
    } else {
      wirePanel();
    }
    loadHmiAssets(true).catch(() => { /* preload; setup shows error on open if needed */ });
  }

  function openFromUrlParam(screenId) {
    const sid = String(screenId || '').trim();
    if (!sid || !hmiConfig.screens.some((s) => s.id === sid)) return;
    navigateHmiView(sid);
  }

  return {
    init,
    initMainHmi,
    openFromUrlParam,
    isHmiViewActive,
    isHmiSetupOpen,
    openSetupPopup,
    closeSetupPopup,
    bindHmiToolbar,
    bindHmiSetupPanel,
    onPanelDragStart,
    onPanelResizeStart,
    clampHmiSetupOnResize,
    handleDashboardPoll,
    forceReloadFromDashboard,
    refreshLiveBindings,
    syncFromFieldsIfDirty,
    getConfig,
    setConfig,
    isDirty,
    clearDirty,
    applyHmiSettings,
    applyHmiSettingsIfDirty,
    getConfigForSave,
    updateHomeScreenLabel,
    readStartingScreenFromSetup,
    migrateHmiConfig,
    reindexHmiScreensClient,
    getComposerMode,
    setComposerMode,
    syncComposerModeFromSettings,
    HOME_SCREEN_ID,
    HMI_COMPOSER_VERSION,
  };
})();
