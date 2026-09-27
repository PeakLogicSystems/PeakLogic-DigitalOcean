'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BINDINGS = 128;
const MAX_SCREENS = 16;
const GRID_SIZE = 8;
const MAX_GRID_COLS = 24;
const MAX_GRID_ROWS = 24;
const MAX_TILES = MAX_GRID_COLS * MAX_GRID_ROWS;
const DEFAULT_CELL_WIDTH = 128;
const DEFAULT_CELL_HEIGHT = 100;
/** Per-cell overlay stack (Z 0 = back … 4 = front). */
const HMI_MAX_LAYERS = 5;
const HMI_OBJ_KINDS = ['staticImage', 'staticText', 'dynamicText', 'dynamicImage', 'navButton'];

const BINDING_PROPS = ['visibility', 'fill', 'fill5', 'fill8', 'state3', 'backgroundFill', 'stroke', 'text', 'rotation', 'opacity', 'class'];
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
        if (layer.kind !== 'navButton' || !layer.targetScreenId) continue;
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
  if (property === 'state3') {
    out.min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0;
    out.max = Number.isFinite(Number(raw.max)) ? Number(raw.max) : 2;
    if (out.max - out.min > 2 || out.max > 2) out.max = 2;
  }
  if (property === 'rotation') {
    out.onValue = Number.isFinite(Number(raw.onValue)) ? Number(raw.onValue) : 330;
    out.offValue = Number.isFinite(Number(raw.offValue)) ? Number(raw.offValue) : 30;
  }
  return out;
}

function isPilotLightSvgPath(svgPath) {
  return /pilot-lights\/(standard|multicolor)\//i.test(String(svgPath || ''));
}

function inferLayerKind(raw, hasLabel) {
  if (HMI_OBJ_KINDS.includes(raw?.kind)) return raw.kind;
  const svg = String(raw?.svg || '');
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

function normalizeLayer(raw, publicRoot = null) {
  const z = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 0));
  const kind = HMI_OBJ_KINDS.includes(raw?.kind) ? raw.kind : 'staticImage';
  if (kind === 'navButton') {
    const targetScreenId = String(raw?.targetScreenId || '').trim();
    if (!targetScreenId) return null;
    const out = { kind, z, targetScreenId };
    const label = raw?.label != null ? String(raw.label) : '';
    if (label) out.label = label;
    return out;
  }
  let svg = String(raw?.svg || '').trim();
  if (!svg) return null;
  if (publicRoot) svg = migrateScreenSvg(publicRoot, svg);
  const label = raw?.label != null ? String(raw.label) : '';
  let layerKind = inferLayerKind(raw, !!label);
  if (isPilotLightSvgPath(svg) && layerKind === 'staticImage') layerKind = 'dynamicImage';
  if (label && layerKind === 'staticImage') layerKind = 'staticText';
  const out = { kind: layerKind, z, svg };
  if (label) out.label = label;
  const tagId = String(raw?.tagId || '').trim();
  if (tagId) out.tagId = tagId;
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
  const byZ = new Map();
  for (const layer of layers) byZ.set(layer.z, layer);
  const sorted = [...byZ.values()].sort((a, b) => a.z - b.z);
  const out = { col, row, layers: sorted };
  if (colSpan > 1) out.colSpan = colSpan;
  if (rowSpan > 1) out.rowSpan = rowSpan;
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
  };
}

/** @param {object} hmi @param {Array<{id:string}>} tags @param {string} [publicRoot] */
function normalizeHmi(hmi, tags = [], publicRoot = null) {
  const valid = new Set((tags || []).map((t) => t.id));
  const src = hmi && typeof hmi === 'object' ? hmi : {};
  const rawScreens = [];
  for (const s of src.screens || []) {
    const sc = normalizeScreen(s, publicRoot);
    if (sc) rawScreens.push(sc);
    if (rawScreens.length >= MAX_SCREENS) break;
  }
  const reindexed = reindexHmiScreens(rawScreens, src.bindings || [], src.activeScreen);
  const screens = reindexed.screens.slice(0, MAX_SCREENS);
  const bindings = [];
  const seenBind = new Set();
  const defaultScreenId = HOME_SCREEN_ID;
  for (const b of reindexed.bindings || []) {
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
      {
        number: 3,
        id: 'screen_3',
        name: 'PID faceplate',
        svg: '/hmi/svg/library/pid-faceplates/peaklogic/pid_loop_standard.svg',
        width: 480,
        height: 360,
        fit: 'native',
        scale: 100,
        background: '#e2e8f0',
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
  displayName,
  isAllowedPilotLightAsset,
  pilotLightDisplayLabel,
  pilotLightSubgroup,
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
        if (cls.group === GROUP.PILOT && !isAllowedPilotLightAsset(name)) continue;
        const subgroup = cls.group === GROUP.PILOT ? pilotLightSubgroup(name) : cls.subgroup;
        const label = cls.group === GROUP.PILOT ? pilotLightDisplayLabel(name) : displayName(name, cls);
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

function listHmiAssets(publicRoot) {
  const { listHmiComposites } = require('./hmiComposites');
  const files = listHmiFileAssets(publicRoot);
  const composites = listHmiComposites(publicRoot);
  return [...composites, ...files].sort((a, b) => a.path.localeCompare(b.path));
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
  normalizeHmi,
  defaultBlankHmi,
  defaultDemoHmi,
  listSvgAssets,
  listHmiAssets,
  listHmiFileAssets,
  resolveAssetPath,
  loadPathAliases,
  migrateScreenSvg,
};
