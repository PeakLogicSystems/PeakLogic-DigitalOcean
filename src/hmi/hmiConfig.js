'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BINDINGS = 4096;
const MAX_SCREENS = 500;
const MAX_ROOM_NUM = 500;
const GRID_SIZE = 8;
const MAX_GRID_COLS = 24;
const MAX_GRID_ROWS = 24;
const MAX_TILES = MAX_GRID_COLS * MAX_GRID_ROWS;
const DEFAULT_CELL_WIDTH = 128;
const DEFAULT_CELL_HEIGHT = 100;
/** Per-cell overlay stack (Z 0 = back … 4 = front). */
const HMI_MAX_LAYERS = 5;
const HMI_OBJ_KINDS = ['staticImage', 'staticText', 'dynamicText', 'dynamicImage', 'navButton', 'pageHotspot', 'roomHotspot', 'flashOverlay', 'alarmList'];

const BINDING_PROPS = ['visibility', 'flashState', 'fill', 'fill5', 'fill8', 'state3', 'backgroundFill', 'stroke', 'text', 'rotation', 'trend', 'opacity', 'class'];
const FILL5_DEFAULT_COLORS = [
  '#22c55e', '#ef4444', '#fbed20', '#f97316', '#64748b',
];
const FILL5_DEFAULT_FLASH = [2, 3];
const FILL8_DEFAULT_COLORS = [
  '#94a3b8', '#22c55e', '#eab308', '#ef4444', '#2563eb', '#f97316', '#9333ea', '#0891b2',
];

const FILL5_LEGACY_WARN_YELLOWS = new Set(['#eab308', '#facc15']);

function normalizeFill5Colors(raw) {
  const src = Array.isArray(raw) ? raw : [];
  return FILL5_DEFAULT_COLORS.map((d, i) => {
    const c = String(src[i] ?? '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(c)) return d;
    if (i === 2 && FILL5_LEGACY_WARN_YELLOWS.has(c.toLowerCase())) return FILL5_DEFAULT_COLORS[2];
    return c;
  });
}

function normalizeFlashStates(raw) {
  const src = Array.isArray(raw) ? raw : FILL5_DEFAULT_FLASH;
  const out = [...new Set(src.map((n) => Math.trunc(Number(n))).filter((n) => n >= 0 && n <= 4))];
  if (!out.length) return [...FILL5_DEFAULT_FLASH];
  if (out.length === 1 && out[0] === 2) return [2, 3];
  return out;
}

const FLASH_STATE_MODES = ['hidden', 'red', 'amber'];

function normalizeFlashStateMode(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'amber' || v === 'yellow') return 'amber';
  if (v === 'red') return 'red';
  return 'hidden';
}

function normalizeFill8Colors(raw) {
  const src = Array.isArray(raw) ? raw : [];
  return FILL8_DEFAULT_COLORS.map((d, i) => {
    const c = String(src[i] ?? '').trim();
    return /^#[0-9a-f]{6}$/i.test(c) ? c : d;
  });
}
const FIT_MODES = ['native', 'contain', 'cover', 'stretch'];
const DEFAULT_HMI_WIDTH = 1024;
const DEFAULT_HMI_HEIGHT = 800;
const HOME_SCREEN_ID = 'screen_1';

function screenIdFromNumber(n) {
  return `screen_${Math.max(1, Math.min(MAX_SCREENS, Number(n) || 1))}`;
}

function resolveActiveScreen(rawActive, screens, idMap = null) {
  const list = screens || [];
  if (!list.length) return HOME_SCREEN_ID;
  let candidate = String(rawActive || '').trim();
  if (idMap && candidate) {
    candidate = idMap.get(candidate) || candidate;
  }
  if (list.some((s) => s.id === candidate)) return candidate;
  return list[0]?.id || HOME_SCREEN_ID;
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

function reindexHmiScreens(screens, bindings = [], activeScreen = '') {
  const list = (screens || []).filter(Boolean);
  const idMap = new Map();
  const out = list.map((s, i) => {
    const number = i + 1;
    const id = screenIdFromNumber(number);
    idMap.set(s.id, id);
    return {
      id,
      number,
      isHome: number === 1,
      name: String(s.name || s.alias || (number === 1 ? 'Home' : `Screen ${number}`)).trim(),
      svg: s.svg,
      tiles: Array.isArray(s.tiles) ? s.tiles : [],
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
      navHidden: s.navHidden === true,
      inheritProjectLayout: s.inheritProjectLayout === false ? false : true,
      facility3dUrl: normalizeFacility3dUrl(s.facility3dUrl),
      composerMode: s.composerMode ? normalizeComposerMode(s.composerMode) : undefined,
    };
  });
  remapNavTargetsInScreens(out, idMap);
  const outBindings = (bindings || []).map((b) => ({
    ...b,
    screenId: idMap.get(b.screenId) || b.screenId,
  }));
  return {
    screens: out,
    bindings: outBindings,
    activeScreen: resolveActiveScreen(activeScreen, out, idMap),
  };
}

function normalizeBinding(raw, validTagIds, defaultScreenId = '') {
  const tagId = String(raw?.tagId || '').trim();
  let elementId = String(raw?.elementId || raw?.id || '').trim();
  if (!tagId || !elementId) return null;
  if (validTagIds && !validTagIds.has(tagId)) return null;
  let property = BINDING_PROPS.includes(raw?.property) ? raw.property : 'fill';
  const shapePilot = /^t(\d+)_(\d+)_z(\d+)__shape_\d+$/i.exec(elementId);
  if (shapePilot && (property === 'fill' || property === 'fill5' || property === 'stroke')) {
    elementId = `t${shapePilot[1]}_${shapePilot[2]}_z${shapePilot[3]}__lamp`;
  }
  if (elementId === 'hmi-tile-grid') {
    const numericHint = property === 'text' || !!String(raw?.format || '').trim();
    elementId = numericHint ? 'hmi_label' : 'lamp';
    if (numericHint) property = 'text';
  }
  const out = {
    screenId: String(raw?.screenId || defaultScreenId || '').trim(),
    elementId,
    tagId,
    property,
    onValue: raw.onValue ?? raw.trueValue ?? '#22c55e',
    offValue: raw.offValue ?? raw.falseValue ?? '#94a3b8',
    format: raw.format || '',
    min: Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0,
    max: Number.isFinite(Number(raw.max)) ? Number(raw.max) : 100,
    classOn: raw.classOn || 'hmi-on',
    classOff: raw.classOff || 'hmi-off',
  };
  if (property === 'fill5') {
    out.colors = normalizeFill5Colors(raw?.colors);
    out.flashStates = normalizeFlashStates(raw?.flashStates);
    out.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0;
    out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 4;
    if (out.max - out.min > 4 || out.max > 4) out.max = 4;
  }
  if (property === 'fill8') out.colors = normalizeFill8Colors(raw?.colors);
  if (property === 'text' && (out.format === 'state5' || out.format === 'tpoSta' || out.format === 'poolBwSta' || out.format === 'poolLightOp' || out.format === 'stationSta')) {
    out.colors = normalizeFill5Colors(raw?.colors);
    out.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0;
    if (out.format === 'stationSta') {
      out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 3;
      if (out.max - out.min > 3 || out.max > 3) out.max = 3;
    } else {
      out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 4;
      if (out.max - out.min > 4 || out.max > 4) out.max = 4;
    }
  }
  if (property === 'trend') {
    out.samples = Number.isFinite(Number(raw?.samples)) ? Math.min(512, Math.max(8, Number(raw.samples))) : 64;
    const stroke = String(raw?.onValue ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(stroke)) out.onValue = stroke;
    else out.onValue = '#2563eb';
    if (raw.useTagScale === true || raw.useTagScale === 1 || raw.useTagScale === '1') {
      out.useTagScale = true;
    }
  }
  if (property === 'state3') {
    out.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0;
    out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 2;
    if (out.max - out.min > 2 || out.max > 2) out.max = 2;
  }
  if (property === 'rotation') {
    out.onValue = Number.isFinite(Number(raw.onValue)) ? Number(raw.onValue) : 330;
    out.offValue = Number.isFinite(Number(raw.offValue)) ? Number(raw.offValue) : 30;
  }
  if (property === 'flashState') {
    out.onValue = normalizeFlashStateMode(raw.onValue);
    if (out.onValue === 'hidden') out.onValue = 'red';
    out.offValue = normalizeFlashStateMode(raw.offValue);
    out.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0;
    out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 2;
    if (out.max - out.min > 2 || out.max > 2) out.max = 2;
  }
  if (raw.interaction != null && String(raw.interaction).trim()) {
    out.interaction = String(raw.interaction).trim();
  }
  if (raw.hoaValue != null && Number.isFinite(Number(raw.hoaValue))) {
    out.hoaValue = Math.max(0, Math.min(2, Math.trunc(Number(raw.hoaValue))));
  }
  let tagField = String(raw?.tagField || '').trim();
  if (tagField === 'label' && /__hmi_label$/i.test(elementId)) {
    elementId = elementId.replace(/__hmi_label$/i, '__loop_label');
  }
  if (tagField) out.tagField = tagField;
  out.elementId = elementId;
  return out;
}

function isPilotLightSvgPath(svgPath) {
  const p = String(svgPath || '');
  if (isCanonicalPilotLightPath(p)) return true;
  return /pilot-lights\/(standard|multicolor)\//i.test(p);
}

function isCanonicalPilotLightPath(svgPath) {
  return /\/pl-canonical\/pilot_light_(round|square|octagonal)\.svg$/i.test(String(svgPath || ''));
}

function isLegacyPilotLightAsset(svgPath) {
  const p = String(svgPath || '').toLowerCase();
  if (!isPilotLightSvgPath(svgPath) || isCanonicalPilotLightPath(svgPath)) return false;
  return /^pl_(multi_)?(round|square|octagonal)\.svg$/i.test(p.split('/').pop() || '');
}

function canonicalPilotLightPath(shape) {
  const s = PILOT_LIGHT_SHAPES.includes(shape) ? shape : 'round';
  return `/hmi/svg/library/controls/pilot-lights/mv/pl-canonical/pilot_light_${s}.svg`;
}

function inferPilotLightKind(svgPath) {
  const p = String(svgPath || '').toLowerCase();
  if (/pl_multi|multicolor/.test(p)) return 'complex';
  return 'simple';
}

function inferPilotLightShapeFromPath(svgPath) {
  const p = String(svgPath || '').toLowerCase();
  if (isCanonicalPilotLightPath(svgPath)) {
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
    off: normalizePushButtonHex(src.off, PILOT_LIGHT_DEFAULT_SIMPLE.off),
    on: normalizePushButtonHex(src.on, PILOT_LIGHT_DEFAULT_SIMPLE.on),
  };
}

function normalizePilotLightComplexColors(raw) {
  const src = Array.isArray(raw) ? raw : (raw?.colors || []);
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    out.push(normalizePushButtonHex(src[i], PILOT_LIGHT_DEFAULT_COMPLEX[i]));
  }
  return out;
}

function normalizePilotLight(raw, svgPath) {
  const shape = PILOT_LIGHT_SHAPES.includes(String(raw?.shape || '').toLowerCase())
    ? String(raw.shape).toLowerCase()
    : inferPilotLightShapeFromPath(svgPath);
  const kind = raw?.kind === 'complex' || raw?.kind === 'simple'
    ? raw.kind
    : inferPilotLightKind(svgPath);
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

function pilotLightBindingPropertyForKind(kind) {
  return kind === 'complex' ? 'fill5' : 'fill';
}

function isPidFaceplateSvgPath(svgPath) {
  return /pid-faceplates|pid_loop_standard/i.test(String(svgPath || ''));
}

function isMotorFaceplateSvgPath(svgPath) {
  return /motor-faceplates|motor_hoa/i.test(String(svgPath || ''));
}

function isDuplexlsFaceplateSvgPath(svgPath) {
  return /lift-station-faceplates\/peaklogic\/duplexls|\/duplexls\.svg/i.test(String(svgPath || ''));
}

function isTpoFaceplateSvgPath(svgPath) {
  return /schedules\/peaklogic\/tpo_daily|tpo_daily/i.test(String(svgPath || ''));
}

function isPoolFaceplateSvgPath(svgPath) {
  return /pool-faceplates|pool_(overview|pump|chemistry|backwash|controller|lighting)/i.test(String(svgPath || ''));
}

function poolCompositeIdFromSvgPath(svgPath) {
  const p = String(svgPath || '');
  if (/pool_pump/i.test(p)) return 'pool_pump';
  if (/pool_chemistry/i.test(p)) return 'pool_chemistry';
  if (/pool_backwash/i.test(p)) return 'pool_backwash';
  if (/pool_lighting/i.test(p)) return 'pool_lighting';
  if (/pool_overview/i.test(p)) return 'pool_overview';
  if (/pool_controller/i.test(p)) return 'pool_controller';
  return 'pool_controller';
}

function isAlternatorFaceplateSvgPath(svgPath) {
  return /alternator-faceplates|\/alternator\.svg|alternator\.json/i.test(String(svgPath || ''));
}

function isAlarmListSvgPath(svgPath) {
  return /\/composites\/alarm_list(?:\.svg|\.json)?|@composite\/alarm_list/i.test(String(svgPath || ''));
}

function normalizeAlarmList(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    showAcked: src.showAcked !== false,
  };
}

function isPeaklogicStripChart3PenPath(svgPath) {
  return /\/peaklogic\/strip_chart_3pen/i.test(String(svgPath || ''));
}

function isStripChartSvgPath(svgPath) {
  const p = String(svgPath || '');
  if (!/\/charts-trends\/strip-charts\//i.test(p)) return false;
  if (isPeaklogicStripChart3PenPath(p)) return false;
  return /strip_chart/i.test(p);
}

const DEFAULT_CHART_SCALE = {
  show: true,
  min: 0,
  max: 100,
  divisions: 5,
  labelColor: '#64748b',
  tickColor: '#94a3b8',
};

function normalizeChartScale(raw) {
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

function normalizeStripChart(raw) {
  const n = Number(raw?.penCount);
  const penCount = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : 1;
  return { penCount, chartScale: normalizeChartScale(raw?.chartScale) };
}

function isGaugeColumnSvgPath(svgPath) {
  const p = String(svgPath || '');
  if (!/\/gauges-meters\/column\//i.test(p)) return false;
  return /gauge_column/i.test(p);
}

function isCanonicalGaugeColumnPath(svgPath) {
  return /\/gauge-column\/gauge_column\.svg$/i.test(String(svgPath || ''));
}

function normalizeGaugeColumn(raw) {
  const n = Number(raw?.columnCount);
  const columnCount = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : 1;
  return { columnCount, chartScale: normalizeChartScale(raw?.chartScale) };
}

const PUSH_BUTTON_MODES = ['momentary', 'latched'];
const PILOT_LIGHT_KINDS = ['simple', 'complex'];
const PILOT_LIGHT_SHAPES = ['round', 'square', 'octagonal'];
const PILOT_LIGHT_DEFAULT_SIMPLE = { off: '#22c55e', on: '#ef4444' };
const PILOT_LIGHT_DEFAULT_COMPLEX = [
  '#22c55e', '#ef4444', '#fbed20', '#f97316', '#64748b',
];
const PUSH_BUTTON_SHAPES = ['square', 'rectangle', 'oblong', 'round'];
const PUSH_BUTTON_LATCHED_SUBGROUPS = new Set(['toggle', 'toggle-alt', 'illuminated-toggle']);
const PUSH_BUTTON_MOMENTARY_SUBGROUPS = new Set([
  'momentary', 'pulse', 'illuminated-pulse', 'constant-0', 'constant-1',
]);
const PUSH_BUTTON_DEFAULT_COLORS = {
  background: '#22c55e',
  text: '#0f172a',
  bezel: '#64748b',
};
const PUSH_BUTTON_COLOR_NAME_MAP = {
  aqua: '#22d3ee',
  blue: '#2563eb',
  cyan: '#06b6d4',
  green: '#22c55e',
  grey: '#64748b',
  gray: '#64748b',
  indigo: '#4f46e5',
  khaki: '#bdb76b',
  lime: '#84cc16',
  maroon: '#881337',
  navy: '#1e3a8a',
  olive: '#65a30d',
  orange: '#f97316',
  purple: '#9333ea',
  red: '#ef4444',
  silver: '#cbd5e1',
  tan: '#d2b48c',
  teal: '#14b8a6',
  violet: '#8b5cf6',
  white: '#f8fafc',
  yellow: '#eab308',
};

function isPushButtonSvgPath(svgPath) {
  return /\/controls\/push-buttons\//i.test(String(svgPath || ''));
}

function isCanonicalPushButtonPath(svgPath) {
  return /\/pb-canonical\/push_button_(square|rectangle|oblong|round)\.svg$/i.test(String(svgPath || ''));
}

function isLegacyColoredPushButtonAsset(svgPath) {
  if (!isPushButtonSvgPath(svgPath) || isCanonicalPushButtonPath(svgPath)) return false;
  const p = String(svgPath || '').toLowerCase();
  if (!/\/(momentary|pulse|toggle|toggle-alt|illuminated-toggle|illuminated-pulse)\//.test(p)) return false;
  return /_(square|rectangular|oblong)_[a-z]+\.svg$/i.test(p);
}

function canonicalPushButtonPath(shape) {
  const s = PUSH_BUTTON_SHAPES.includes(shape) ? shape : 'square';
  return `/hmi/svg/library/controls/push-buttons/mv/pb-canonical/push_button_${s}.svg`;
}

function pushButtonSubgroupFromPath(svgPath) {
  const m = String(svgPath || '').match(/\/push-buttons\/([^/]+)\//i);
  return m ? m[1].toLowerCase() : '';
}

function inferPushButtonMode(svgPath) {
  const sub = pushButtonSubgroupFromPath(svgPath);
  if (PUSH_BUTTON_LATCHED_SUBGROUPS.has(sub)) return 'latched';
  if (PUSH_BUTTON_MOMENTARY_SUBGROUPS.has(sub)) return 'momentary';
  if (/toggle/i.test(sub)) return 'latched';
  return 'momentary';
}

function inferPushButtonShapeFromPath(svgPath) {
  const p = String(svgPath || '').toLowerCase();
  if (isCanonicalPushButtonPath(svgPath)) {
    const m = p.match(/push_button_(square|rectangle|oblong|round)\.svg/);
    if (m) return m[1];
  }
  if (/_oblong_/.test(p) || /oblong/.test(p)) return 'oblong';
  if (/_rectangular_/.test(p) || /rectangular/.test(p)) return 'rectangle';
  if (/roundsymbol|_round_/.test(p)) return 'round';
  return 'square';
}

function inferPushButtonColorNameFromPath(svgPath) {
  const m = String(svgPath || '').toLowerCase().match(/_(aqua|blue|cyan|green|grey|gray|indigo|khaki|lime|maroon|navy|olive|orange|purple|red|silver|tan|teal|violet|white|yellow)\.svg$/);
  return m ? m[1] : 'green';
}

function pushButtonColorFromName(name) {
  return PUSH_BUTTON_COLOR_NAME_MAP[String(name || '').toLowerCase()]
    || PUSH_BUTTON_DEFAULT_COLORS.background;
}

function inferPushButtonTextColor(backgroundHex) {
  const rgb = parseHexColorParts(backgroundHex);
  if (!rgb) return PUSH_BUTTON_DEFAULT_COLORS.text;
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.62 ? '#0f172a' : '#f8fafc';
}

function parseHexColorParts(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function normalizePushButtonHex(raw, fallback) {
  const c = String(raw ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
}

function inferPushButtonColorsFromPath(svgPath) {
  const background = pushButtonColorFromName(inferPushButtonColorNameFromPath(svgPath));
  return {
    background,
    text: inferPushButtonTextColor(background),
    bezel: PUSH_BUTTON_DEFAULT_COLORS.bezel,
  };
}

function normalizePushButtonColors(raw, svgPath) {
  const inferred = inferPushButtonColorsFromPath(svgPath);
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    background: normalizePushButtonHex(src.background, inferred.background),
    text: normalizePushButtonHex(src.text, inferred.text),
    bezel: normalizePushButtonHex(src.bezel, inferred.bezel),
  };
}

function normalizePushButtonShape(raw, svgPath) {
  const s = String(raw || '').toLowerCase();
  if (PUSH_BUTTON_SHAPES.includes(s)) return s;
  return inferPushButtonShapeFromPath(svgPath);
}

function normalizePushButton(raw, svgPath) {
  const shape = normalizePushButtonShape(raw?.shape, svgPath);
  const mode = raw?.mode === 'latched' || raw?.mode === 'momentary'
    ? raw.mode
    : inferPushButtonMode(svgPath);
  return {
    mode,
    shape,
    colors: normalizePushButtonColors(raw?.colors, svgPath),
  };
}

function pushButtonInteractionForMode(mode) {
  return mode === 'latched' ? 'toggle' : 'pulse';
}

function isCompositeFaceplateSvgPath(svgPath) {
  return isPidFaceplateSvgPath(svgPath)
    || isMotorFaceplateSvgPath(svgPath)
    || isTpoFaceplateSvgPath(svgPath)
    || isPoolFaceplateSvgPath(svgPath)
    || isAlternatorFaceplateSvgPath(svgPath);
}

function inferLayerKind(raw, hasLabel) {
  if (HMI_OBJ_KINDS.includes(raw?.kind)) return raw.kind;
  const svg = String(raw?.svg || '');
  if (isCompositeFaceplateSvgPath(svg)) return 'staticImage';
  if (isPilotLightSvgPath(svg)) return 'dynamicImage';
  if (hasLabel) return 'staticText';
  return 'staticImage';
}

function screenGridDims(raw) {
  const legacy = Number(raw?.gridSize);
  let cols = Number(raw?.gridCols);
  let rows = Number(raw?.gridRows);
  if (!Number.isFinite(cols) || cols < 1) cols = Number.isFinite(legacy) && legacy > 0 ? legacy : GRID_SIZE;
  if (!Number.isFinite(rows) || rows < 1) rows = Number.isFinite(legacy) && legacy > 0 ? legacy : GRID_SIZE;
  return {
    cols: Math.max(1, Math.min(MAX_GRID_COLS, Math.round(cols))),
    rows: Math.max(1, Math.min(MAX_GRID_ROWS, Math.round(rows))),
  };
}

function pickLayoutReferenceScreen(screens) {
  const list = screens || [];
  if (!list.length) return null;
  const home = list.find((s) => s.isHome || s.number === 1) || list[0];
  const stdArea = DEFAULT_HMI_WIDTH * DEFAULT_HMI_HEIGHT;
  const homeArea = (home.width || 0) * (home.height || 0);
  if (homeArea <= stdArea * 1.5) return home;
  const alt = list.find((s) => {
    if (s.id === home.id) return false;
    const a = (s.width || 0) * (s.height || 0);
    return a > 0 && a <= stdArea * 1.5;
  });
  return alt || home;
}

function normalizeFacility3dUrl(raw) {
  const u = String(raw ?? '').trim();
  if (!u) return undefined;
  if (u.startsWith('/') || /^https?:\/\//i.test(u)) return u;
  return undefined;
}

function normalizeHmiLayout(rawLayout, referenceScreen) {
  const ref = referenceScreen && typeof referenceScreen === 'object' ? referenceScreen : {};
  const merged = rawLayout && typeof rawLayout === 'object' ? { ...ref, ...rawLayout } : { ...ref };
  const fit = FIT_MODES.includes(merged?.fit) ? merged.fit : 'contain';
  const gridDims = screenGridDims(merged);
  let cellWidth = Number(merged?.cellWidth);
  let cellHeight = Number(merged?.cellHeight);
  const width = Math.max(200, Math.min(4096, Number(merged?.width) || gridDims.cols * DEFAULT_CELL_WIDTH));
  const height = Math.max(150, Math.min(4096, Number(merged?.height) || gridDims.rows * DEFAULT_CELL_HEIGHT));
  if (!Number.isFinite(cellWidth) || cellWidth < 8) cellWidth = Math.round(width / gridDims.cols);
  if (!Number.isFinite(cellHeight) || cellHeight < 8) cellHeight = Math.round(height / gridDims.rows);
  cellWidth = Math.max(8, Math.min(512, Math.round(cellWidth)));
  cellHeight = Math.max(8, Math.min(512, Math.round(cellHeight)));
  const logicalWidth = gridDims.cols * cellWidth;
  const logicalHeight = gridDims.rows * cellHeight;
  return {
    gridCols: gridDims.cols,
    gridRows: gridDims.rows,
    cellWidth,
    cellHeight,
    gridSize: Math.max(gridDims.cols, gridDims.rows),
    width: logicalWidth,
    height: logicalHeight,
    displayMaxWidth: Math.max(100, Math.min(4096, Math.round(
      Number(merged?.displayMaxWidth) || Number(merged?.displayLimitX) || logicalWidth
    ))),
    displayMaxHeight: Math.max(100, Math.min(4096, Math.round(
      Number(merged?.displayMaxHeight) || Number(merged?.displayLimitY) || logicalHeight
    ))),
    fit,
    showGridChrome: merged?.showGridChrome !== false,
    showLiveStatus: merged?.showLiveStatus !== false,
    composerMode: normalizeComposerMode(merged?.composerMode),
    facility3dUrl: normalizeFacility3dUrl(merged?.facility3dUrl),
    roomPopup: normalizeRoomPopup(merged?.roomPopup),
    areaPopupScreens: normalizeAreaPopupScreens(merged?.areaPopupScreens),
  };
}

function normalizeAreaPopupScreens(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.map((id) => String(id || '').trim()).filter(Boolean);
  return out.length ? out : undefined;
}

function normalizeRoomNum(raw) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_ROOM_NUM, n);
}

function normalizeRoomPopup(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: src.enabled !== false,
    roomSvg: String(src.roomSvg || '/hmi/svg/demos/assisted-living/room_detail.svg').trim(),
    condenserSvg: String(src.condenserSvg || '/hmi/svg/demos/assisted-living/condenser_side.svg').trim(),
  };
}

function applyLayoutToScreen(screen, layout) {
  if (!screen || !layout) return screen;
  screen.gridCols = layout.gridCols;
  screen.gridRows = layout.gridRows;
  screen.cellWidth = layout.cellWidth;
  screen.cellHeight = layout.cellHeight;
  screen.gridSize = layout.gridSize;
  screen.width = layout.width;
  screen.height = layout.height;
  screen.displayMaxWidth = layout.displayMaxWidth;
  screen.displayMaxHeight = layout.displayMaxHeight;
  screen.fit = layout.fit;
  return screen;
}

function pruneScreenTilesToLayout(screen, layout) {
  if (!screen || !layout) return;
  const cols = layout.gridCols;
  const rows = layout.gridRows;
  screen.tiles = (screen.tiles || []).filter((t) => {
    const cs = t.colSpan || 1;
    const rs = t.rowSpan || 1;
    return t.col >= 0 && t.row >= 0 && t.col + cs <= cols && t.row + rs <= rows;
  });
}

const HMI_COMPOSER_MODES = ['grid', '3d'];

function normalizeComposerMode(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '3d' ? '3d' : 'grid';
}

const HMI_CELL_FRACTIONS = [0.25, 0.5, 0.75];

function normalizeCellFraction(raw) {
  const v = Number(raw);
  return HMI_CELL_FRACTIONS.includes(v) ? v : null;
}

function normalizeLayer(raw, publicRoot = null) {
  const z = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 0));
  const kind = HMI_OBJ_KINDS.includes(raw?.kind) ? raw.kind : 'staticImage';
  if (kind === 'navButton') {
    const targetScreenId = String(raw?.targetScreenId || '').trim();
    if (!targetScreenId) return null;
    const out = { kind, z, targetScreenId };
    const label = raw?.label != null ? String(raw.label) : '';
    if (label) out.label = label;
    if (Number.isFinite(Number(raw?.hotspotCol))) out.hotspotCol = Number(raw.hotspotCol);
    if (Number.isFinite(Number(raw?.hotspotRow))) out.hotspotRow = Number(raw.hotspotRow);
    const hcs = Number(raw?.hotspotColSpan);
    const hrs = Number(raw?.hotspotRowSpan);
    if (Number.isFinite(hcs) && hcs > 0) out.hotspotColSpan = Math.max(1, Math.min(MAX_GRID_COLS, hcs));
    if (Number.isFinite(hrs) && hrs > 0) out.hotspotRowSpan = Math.max(1, Math.min(MAX_GRID_ROWS, hrs));
    const cellFraction = normalizeCellFraction(raw?.cellFraction);
    if (cellFraction != null) out.cellFraction = cellFraction;
    return out;
  }
  if (kind === 'pageHotspot' || kind === 'roomHotspot') {
    const hotspotZ = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 1));
    const out = { kind, z: hotspotZ };
    const label = raw?.label != null ? String(raw.label) : '';
    if (label) out.label = label;
    if (Number.isFinite(Number(raw?.hotspotCol))) out.hotspotCol = Number(raw.hotspotCol);
    if (Number.isFinite(Number(raw?.hotspotRow))) out.hotspotRow = Number(raw.hotspotRow);
    const hcs = Number(raw?.hotspotColSpan);
    const hrs = Number(raw?.hotspotRowSpan);
    if (Number.isFinite(hcs) && hcs > 0) out.hotspotColSpan = Math.max(1, Math.min(MAX_GRID_COLS, hcs));
    if (Number.isFinite(hrs) && hrs > 0) out.hotspotRowSpan = Math.max(1, Math.min(MAX_GRID_ROWS, hrs));
    const cellFraction = normalizeCellFraction(raw?.cellFraction);
    if (cellFraction != null) out.cellFraction = cellFraction;
    if (kind === 'roomHotspot') {
      const roomNum = normalizeRoomNum(raw?.roomNum);
      if (!roomNum) return null;
      out.roomNum = roomNum;
      return out;
    }
    const targetScreenId = String(raw?.targetScreenId || '').trim();
    if (!targetScreenId) return null;
    out.targetScreenId = targetScreenId;
    return out;
  }
  if (kind === 'alarmList') {
    const out = { kind, z, alarmList: normalizeAlarmList(raw?.alarmList) };
    let alarmSvg = String(raw?.svg || '').trim();
    if (alarmSvg) {
      if (publicRoot) alarmSvg = migrateScreenSvg(publicRoot, alarmSvg);
      out.svg = alarmSvg;
    }
    return out;
  }
  if (kind === 'flashOverlay') {
    const overlayZ = Math.max(1, Math.min(HMI_MAX_LAYERS - 1, Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 1));
    const color = String(raw?.color || '').trim().toLowerCase() === 'amber' ? 'amber' : 'red';
    const out = { kind, z: overlayZ, color };
    const tagId = String(raw?.tagId || '').trim();
    if (tagId) out.tagId = tagId;
    const overlaySuffix = String(raw?.overlaySuffix || raw?.overlayId || '').trim();
    if (overlaySuffix) out.overlaySuffix = overlaySuffix;
    if (Number.isFinite(Number(raw?.hotspotCol))) out.hotspotCol = Number(raw.hotspotCol);
    if (Number.isFinite(Number(raw?.hotspotRow))) out.hotspotRow = Number(raw.hotspotRow);
    const hcs = Number(raw?.hotspotColSpan);
    const hrs = Number(raw?.hotspotRowSpan);
    if (Number.isFinite(hcs) && hcs > 0) out.hotspotColSpan = Math.max(1, Math.min(MAX_GRID_COLS, hcs));
    if (Number.isFinite(hrs) && hrs > 0) out.hotspotRowSpan = Math.max(1, Math.min(MAX_GRID_ROWS, hrs));
    const cellFraction = normalizeCellFraction(raw?.cellFraction);
    if (cellFraction != null) out.cellFraction = cellFraction;
    return out;
  }
  let svg = String(raw?.svg || '').trim();
  if (!svg) return null;
  if (publicRoot) svg = migrateScreenSvg(publicRoot, svg);
  const label = raw?.label != null ? String(raw.label) : '';
  let layerKind = inferLayerKind(raw, !!label);
  if (isPidFaceplateSvgPath(svg)) layerKind = 'staticImage';
  if (isMotorFaceplateSvgPath(svg)) layerKind = 'staticImage';
  if (isTpoFaceplateSvgPath(svg)) layerKind = 'staticImage';
  if (isPoolFaceplateSvgPath(svg)) layerKind = 'staticImage';
  if (isAlternatorFaceplateSvgPath(svg)) layerKind = 'staticImage';
  if (isAlarmListSvgPath(svg)) layerKind = 'alarmList';
  if (isPilotLightSvgPath(svg) && layerKind === 'staticImage') layerKind = 'dynamicImage';
  if (isGaugeColumnSvgPath(svg) && layerKind === 'staticImage') layerKind = 'dynamicImage';
  if (label && layerKind === 'staticImage' && !isCompositeFaceplateSvgPath(svg)) layerKind = 'staticText';
  if (isStripChartSvgPath(svg) && !isPeaklogicStripChart3PenPath(svg)) {
    if (!/\/chart-strip\/strip_chart\.svg$/i.test(svg)) {
      svg = '/hmi/svg/library/charts-trends/strip-charts/mv/chart-strip/strip_chart.svg';
    }
  }
  if (isGaugeColumnSvgPath(svg) && !isCanonicalGaugeColumnPath(svg)) {
    svg = '/hmi/svg/library/gauges-meters/column/mv/gauge-column/gauge_column.svg';
  }
  if (isLegacyColoredPushButtonAsset(svg)) {
    const pbDraft = normalizePushButton(raw?.pushButton, svg);
    svg = canonicalPushButtonPath(pbDraft.shape);
    raw = { ...raw, pushButton: pbDraft };
  }
  if (isLegacyPilotLightAsset(svg)) {
    const plDraft = normalizePilotLight(raw?.pilotLight, svg);
    svg = canonicalPilotLightPath(plDraft.shape);
    raw = { ...raw, pilotLight: plDraft };
  }
  const out = { kind: layerKind, z, svg };
  if (label) out.label = label;
  const tagId = String(raw?.tagId || '').trim();
  if (tagId) out.tagId = tagId;
  if (isStripChartSvgPath(svg)) out.stripChart = normalizeStripChart(raw?.stripChart);
  if (isGaugeColumnSvgPath(svg)) out.gaugeColumn = normalizeGaugeColumn(raw?.gaugeColumn);
  if (layerKind === 'alarmList' || isAlarmListSvgPath(svg)) {
    out.kind = 'alarmList';
    out.alarmList = normalizeAlarmList(raw?.alarmList);
  }
  if (isPushButtonSvgPath(svg)) {
    out.pushButton = normalizePushButton(raw?.pushButton, svg);
    if (isCanonicalPushButtonPath(svg)) {
      svg = canonicalPushButtonPath(out.pushButton.shape);
      out.svg = svg;
    }
  }
  if (isPilotLightSvgPath(svg)) {
    out.pilotLight = normalizePilotLight(raw?.pilotLight, svg);
    if (isCanonicalPilotLightPath(svg)) {
      svg = canonicalPilotLightPath(out.pilotLight.shape);
      out.svg = svg;
    }
  }
  return out;
}

function normalizeTile(raw, publicRoot = null, gridDims = null) {
  const col = Number(raw?.col);
  const row = Number(raw?.row);
  const cols = gridDims?.cols || GRID_SIZE;
  const rows = gridDims?.rows || GRID_SIZE;
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const colSpan = Math.max(1, Math.min(MAX_GRID_COLS, Number(raw?.colSpan) || 1));
  const rowSpan = Math.max(1, Math.min(MAX_GRID_ROWS, Number(raw?.rowSpan) || 1));
  if (col + colSpan > cols || row + rowSpan > rows) return null;
  const layers = [];
  if (Array.isArray(raw?.layers)) {
    for (const layer of raw.layers) {
      const nl = normalizeLayer(layer, publicRoot);
      if (nl) layers.push(nl);
    }
  }
  if (!layers.length) {
    const legacy = normalizeLayer({
      kind: raw?.kind,
      z: 0,
      svg: raw?.svg,
      label: raw?.label,
      tagId: raw?.tagId,
    }, publicRoot);
    if (!legacy) return null;
    layers.push(legacy);
  }
  const sorted = layers.slice().sort((a, b) => a.z - b.z);
  const out = { col, row, layers: sorted };
  if (colSpan > 1) out.colSpan = colSpan;
  if (rowSpan > 1) out.rowSpan = rowSpan;
  if (sorted.some((l) => isPidFaceplateSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'pid_loop_standard';
    for (const layer of sorted) {
      if (isPidFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => isMotorFaceplateSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'motor_hoa';
    for (const layer of sorted) {
      if (isMotorFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => isDuplexlsFaceplateSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'duplexls';
    for (const layer of sorted) {
      if (isDuplexlsFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => isTpoFaceplateSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'tpo_daily';
    for (const layer of sorted) {
      if (isTpoFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => isPoolFaceplateSvgPath(l.svg))) {
    const poolLayer = sorted.find((l) => isPoolFaceplateSvgPath(l.svg));
    out.compositeId = String(raw?.compositeId || '').trim() || poolCompositeIdFromSvgPath(poolLayer?.svg);
    for (const layer of sorted) {
      if (isPoolFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => isAlternatorFaceplateSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'alternator';
    for (const layer of sorted) {
      if (isAlternatorFaceplateSvgPath(layer.svg)) {
        layer.kind = 'staticImage';
        delete layer.label;
      }
    }
  } else if (sorted.some((l) => l.kind === 'alarmList' || isAlarmListSvgPath(l.svg))) {
    out.compositeId = String(raw?.compositeId || '').trim() || 'alarm_list';
    for (const layer of sorted) {
      if (layer.kind === 'alarmList' || isAlarmListSvgPath(layer.svg)) {
        layer.kind = 'alarmList';
        layer.alarmList = normalizeAlarmList(layer.alarmList);
        delete layer.label;
      }
    }
  } else if (String(raw?.compositeId || '').trim()) {
    out.compositeId = String(raw.compositeId).trim();
  }
  if (sorted[0]?.svg) out.svg = sorted[0].svg;
  const textLayer = sorted.find((l) => l.kind === 'staticText' || l.kind === 'dynamicText');
  if (textLayer?.label) out.label = textLayer.label;
  return out;
}

function normalizeTiles(rawTiles, publicRoot = null, gridDims = null) {
  const out = [];
  const seen = new Set();
  for (const t of rawTiles || []) {
    const nt = normalizeTile(t, publicRoot, gridDims);
    if (!nt) continue;
    const key = `${nt.col},${nt.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nt);
    if (out.length >= MAX_TILES) break;
  }
  return out;
}

function normalizeScreen(raw, publicRoot = null) {
  const fit = FIT_MODES.includes(raw?.fit) ? raw.fit : 'contain';
  const scale = Math.max(10, Math.min(400, Number(raw?.scale) || 100));
  let svg = String(raw?.svg || '').trim();
  if (svg && publicRoot) svg = migrateScreenSvg(publicRoot, svg);
  const number = Number.isFinite(Number(raw?.number)) ? Number(raw.number) : null;
  const id = String(raw?.id || '').trim() || (number ? screenIdFromNumber(number) : '');
  const gridDims = screenGridDims(raw);
  const tiles = normalizeTiles(raw?.tiles, publicRoot, gridDims);
  if (isPidFaceplateSvgPath(svg) && !tiles.length) {
    svg = publicRoot
      ? migrateScreenSvg(publicRoot, '/hmi/svg/demos/demo_process.svg')
      : '/hmi/svg/demos/demo_process.svg';
  }
  if (!id && !svg && !tiles.length) return null;
  let cellWidth = Number(raw?.cellWidth);
  let cellHeight = Number(raw?.cellHeight);
  const width = Math.max(200, Math.min(4096, Number(raw?.width) || gridDims.cols * DEFAULT_CELL_WIDTH));
  const height = Math.max(150, Math.min(4096, Number(raw?.height) || gridDims.rows * DEFAULT_CELL_HEIGHT));
  if (!Number.isFinite(cellWidth) || cellWidth < 8) cellWidth = Math.round(width / gridDims.cols);
  if (!Number.isFinite(cellHeight) || cellHeight < 8) cellHeight = Math.round(height / gridDims.rows);
  cellWidth = Math.max(8, Math.min(512, Math.round(cellWidth)));
  cellHeight = Math.max(8, Math.min(512, Math.round(cellHeight)));
  return {
    id: id || screenIdFromNumber(1),
    number: number || null,
    name: String(raw?.name || raw?.alias || '').trim(),
    svg,
    tiles,
    gridCols: gridDims.cols,
    gridRows: gridDims.rows,
    cellWidth,
    cellHeight,
    gridSize: Math.max(gridDims.cols, gridDims.rows),
    width: gridDims.cols * cellWidth,
    height: gridDims.rows * cellHeight,
    displayMaxWidth: Math.max(100, Math.min(4096, Math.round(
      Number(raw?.displayMaxWidth) || Number(raw?.displayLimitX) || width
    ))),
    displayMaxHeight: Math.max(100, Math.min(4096, Math.round(
      Number(raw?.displayMaxHeight) || Number(raw?.displayLimitY) || height
    ))),
    fit,
    scale,
    background: String(raw?.background || raw?.backgroundColor || '#f1f5f9').trim() || '#f1f5f9',
    offsetX: Math.max(-4096, Math.min(4096, Number(raw?.offsetX) || 0)),
    offsetY: Math.max(-4096, Math.min(4096, Number(raw?.offsetY) || 0)),
    naturalWidth: Number.isFinite(Number(raw?.naturalWidth)) ? Number(raw.naturalWidth) : null,
    naturalHeight: Number.isFinite(Number(raw?.naturalHeight)) ? Number(raw.naturalHeight) : null,
    isHome: raw?.isHome === true || number === 1,
    navHidden: raw?.navHidden === true,
    inheritProjectLayout: raw?.inheritProjectLayout === false ? false : true,
    facility3dUrl: normalizeFacility3dUrl(raw?.facility3dUrl),
    composerMode: raw?.composerMode ? normalizeComposerMode(raw.composerMode) : undefined,
  };
}

/** @param {object} hmi @param {Array<{id:string}>} tags @param {string} [publicRoot] */
function sortScreensByNumber(screens) {
  return [...(screens || [])].sort((a, b) => (Number(a?.number) || 0) - (Number(b?.number) || 0));
}

function normalizeHmi(hmi, tags = [], publicRoot = null) {
  const valid = new Set((tags || []).map((t) => t.id));
  const src = hmi && typeof hmi === 'object' ? hmi : {};
  const rawScreens = [];
  for (const s of sortScreensByNumber(src.screens || [])) {
    const sc = normalizeScreen(s, publicRoot);
    if (sc) rawScreens.push(sc);
    if (rawScreens.length >= MAX_SCREENS) break;
  }
  const reindexed = reindexHmiScreens(rawScreens, src.bindings || [], src.activeScreen);
  const screens = reindexed.screens.slice(0, MAX_SCREENS);
  const idMap = new Map();
  rawScreens.forEach((s, i) => {
    if (s?.id) idMap.set(s.id, screenIdFromNumber(i + 1));
  });
  const layoutRef = pickLayoutReferenceScreen(screens);
  const layout = normalizeHmiLayout(src.layout, layoutRef);
  if (layout.areaPopupScreens?.length && idMap.size) {
    layout.areaPopupScreens = layout.areaPopupScreens
      .map((id) => idMap.get(String(id || '').trim()) || String(id || '').trim())
      .filter(Boolean);
  }
  for (const sc of screens) {
    const screenLayout = sc.inheritProjectLayout === false
      ? normalizeHmiLayout(sc, sc)
      : layout;
    applyLayoutToScreen(sc, screenLayout);
    pruneScreenTilesToLayout(sc, screenLayout);
  }
  let bindingSrc = { ...reindexed, screens, bindings: reindexed.bindings || [] };
  if (publicRoot) {
    const { repairCompositeBindings } = require('./hmiComposites');
    bindingSrc = repairCompositeBindings(bindingSrc, publicRoot);
  }
  const bindings = [];
  const seenBind = new Set();
  const defaultScreenId = HOME_SCREEN_ID;
  for (const b of bindingSrc.bindings || []) {
    const nb = normalizeBinding(b, valid.size ? valid : null, defaultScreenId);
    if (!nb) continue;
    const sid = nb.screenId || defaultScreenId || screens[0]?.id || '';
    nb.screenId = sid;
    const key = `${sid}:${nb.elementId}:${nb.property}:${nb.tagId}`;
    if (seenBind.has(key)) continue;
    seenBind.add(key);
    bindings.push(nb);
    if (bindings.length >= MAX_BINDINGS) break;
  }
  return {
    activeScreen: resolveActiveScreen(reindexed.activeScreen, screens),
    layout,
    screens,
    bindings,
  };
}

function defaultBlankHmi() {
  return normalizeHmi({
    activeScreen: HOME_SCREEN_ID,
    screens: [
      {
        number: 1,
        id: HOME_SCREEN_ID,
        name: 'Home',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [],
        width: DEFAULT_HMI_WIDTH,
        height: DEFAULT_HMI_HEIGHT,
        gridCols: GRID_SIZE,
        gridRows: GRID_SIZE,
        cellWidth: DEFAULT_CELL_WIDTH,
        cellHeight: DEFAULT_CELL_HEIGHT,
        fit: 'contain',
        scale: 100,
        background: '#f1f5f9',
        isHome: true,
      },
    ],
    bindings: [],
  }, []);
}

function defaultDemoHmi() {
  return normalizeHmi({
    screens: [
      {
        number: 1,
        id: 'screen_1',
        name: 'Home — Control graphics',
        svg: '/hmi/svg/demos/demo_controls.svg',
        width: DEFAULT_HMI_WIDTH,
        height: DEFAULT_HMI_HEIGHT,
        fit: 'contain',
        scale: 100,
        background: '#f1f5f9',
        isHome: true,
      },
      {
        number: 2,
        id: 'screen_2',
        name: 'Demo process',
        svg: '/hmi/svg/demos/demo_process.svg',
        width: DEFAULT_HMI_WIDTH,
        height: DEFAULT_HMI_HEIGHT,
        fit: 'contain',
        scale: 100,
        background: '#f1f5f9',
      },
    ],
    bindings: [
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
    ],
  }, [{ id: 'DI1' }, { id: 'Q1' }]);
}

function listSvgAssets(publicRoot) {
  return listHmiAssets(publicRoot);
}

const HMI_ASSET_EXT = /\.(svg|gif|png)$/i;

const {
  GROUP,
  classifyAsset,
  shouldSkipHmiCatalogAsset,
  hmiCatalogPresentation,
} = require('./hmiAssetCatalog');

let pathAliases = null;
function loadPathAliases(publicRoot) {
  if (pathAliases) return pathAliases;
  pathAliases = {};
  try {
    const fp = path.join(publicRoot, 'hmi', 'svg', 'path-aliases.json');
    if (fs.existsSync(fp)) {
      pathAliases = JSON.parse(fs.readFileSync(fp, 'utf8'));
    }
  } catch { pathAliases = {}; }
  return pathAliases;
}

const LEGACY_DEMO_PATHS = {
  '/hmi/svg/demo_controls.svg': '/hmi/svg/demos/demo_controls.svg',
  '/hmi/svg/demo_process.svg': '/hmi/svg/demos/demo_process.svg',
};

function findAssetByBasename(publicRoot, basename) {
  if (!basename) return null;
  const svgDir = path.join(publicRoot, 'hmi', 'svg');
  if (!fs.existsSync(svgDir)) return null;
  let found = null;
  function walk(dir) {
    if (found) return;
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (name.toLowerCase() === basename.toLowerCase()) {
        found = fp;
        return;
      }
    }
  }
  walk(svgDir);
  if (!found) return null;
  const rel = path.relative(svgDir, found).replace(/\\/g, '/');
  return `/hmi/svg/${rel}`;
}

function resolveAssetPath(publicRoot, urlPath) {
  const p = String(urlPath || '').trim();
  if (!p) return p;
  const abs = path.join(publicRoot, p.replace(/^\//, ''));
  if (fs.existsSync(abs)) return p;
  const mvPath = p.replace(/\/(opto22|mblogic)\//g, '/mv/');
  if (mvPath !== p) {
    const mvAbs = path.join(publicRoot, mvPath.replace(/^\//, ''));
    if (fs.existsSync(mvAbs)) return mvPath;
  }
  if (LEGACY_DEMO_PATHS[p]) {
    const demo = LEGACY_DEMO_PATHS[p];
    if (fs.existsSync(path.join(publicRoot, demo.replace(/^\//, '')))) return demo;
  }
  const aliases = loadPathAliases(publicRoot);
  if (aliases[p]) {
    const mapped = aliases[p];
    if (fs.existsSync(path.join(publicRoot, mapped.replace(/^\//, '')))) return mapped;
  }
  const base = path.basename(p);
  const byName = findAssetByBasename(publicRoot, base);
  return byName || p;
}

function migrateScreenSvg(publicRoot, svg) {
  return resolveAssetPath(publicRoot, svg);
}

function listHmiFileAssets(publicRoot) {
  const svgDir = path.join(publicRoot, 'hmi', 'svg');
  const out = [];
  function walk(rel) {
    const abs = path.join(svgDir, rel);
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs)) {
      const relPath = rel ? path.join(rel, name) : name;
      const fp = path.join(abs, name);
      if (fs.statSync(fp).isDirectory()) walk(relPath);
      else if (HMI_ASSET_EXT.test(name)) {
        const ext = path.extname(name).slice(1).toLowerCase();
        const webRel = relPath.replace(/\\/g, '/');
        const cls = classifyAsset(webRel);
        if (shouldSkipHmiCatalogAsset(cls, name, webRel)) continue;
        const { subgroup, label } = hmiCatalogPresentation(cls, name);
        out.push({
          path: `/hmi/svg/${webRel}`,
          name,
          type: ext,
          group: cls.group,
          subgroup,
          vendor: cls.vendor,
          label,
        });
      }
    }
  }
  try { walk(''); } catch { /* ignore */ }
  return out;
}

function listHmiAssets(publicRoot, dataDir = null) {
  const { listHmiComposites } = require('./hmiComposites');
  const files = listHmiFileAssets(publicRoot);
  const composites = listHmiComposites(publicRoot);
  const user = dataDir ? require('./hmiUserAssets').listUserHmiAssets(dataDir) : [];
  return [...composites, ...user, ...files].sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = {
  MAX_BINDINGS,
  GRID_SIZE,
  MAX_TILES,
  HMI_MAX_LAYERS,
  HMI_OBJ_KINDS,
  FIT_MODES,
  DEFAULT_HMI_WIDTH,
  DEFAULT_HMI_HEIGHT,
  HOME_SCREEN_ID,
  screenIdFromNumber,
  reindexHmiScreens,
  normalizeHmiLayout,
  normalizeComposerMode,
  normalizeRoomPopup,
  normalizeRoomNum,
  HMI_COMPOSER_MODES,
  MAX_SCREENS,
  MAX_ROOM_NUM,
  applyLayoutToScreen,
  normalizeHmi,
  defaultBlankHmi,
  defaultDemoHmi,
  listSvgAssets,
  listHmiAssets,
  listHmiFileAssets,
  resolveAssetPath,
  loadPathAliases,
  migrateScreenSvg,
  isPushButtonSvgPath,
  isCanonicalPushButtonPath,
  isLegacyColoredPushButtonAsset,
  canonicalPushButtonPath,
  inferPushButtonMode,
  inferPushButtonShapeFromPath,
  inferPushButtonColorsFromPath,
  normalizePushButton,
  normalizePushButtonColors,
  pushButtonInteractionForMode,
  isPilotLightSvgPath,
  isCanonicalPilotLightPath,
  isLegacyPilotLightAsset,
  canonicalPilotLightPath,
  inferPilotLightKind,
  inferPilotLightShapeFromPath,
  normalizePilotLight,
  pilotLightBindingPropertyForKind,
  PILOT_LIGHT_KINDS,
  PILOT_LIGHT_SHAPES,
  PILOT_LIGHT_DEFAULT_SIMPLE,
  PILOT_LIGHT_DEFAULT_COMPLEX,
  PUSH_BUTTON_MODES,
  PUSH_BUTTON_SHAPES,
  PUSH_BUTTON_DEFAULT_COLORS,
  DEFAULT_CHART_SCALE,
  normalizeChartScale,
  normalizeStripChart,
  isStripChartSvgPath,
  isGaugeColumnSvgPath,
  isCanonicalGaugeColumnPath,
  normalizeGaugeColumn,
  isAlarmListSvgPath,
  normalizeAlarmList,
  normalizeFlashStateMode,
  FLASH_STATE_MODES,
};
