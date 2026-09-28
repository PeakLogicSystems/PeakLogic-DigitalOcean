'use strict';

const { listSymbols, getSymbol } = require('./symbolLibrary');

const MV_DRAW_ASSET_PREFIX = '@mvdraw/';
const HMI_SYMBOL_PREFIX = '@hmi/';

/** HMI catalog groups exposed in the MV Draw symbol library. */
const HMI_GROUPS_IN_MV_DRAW = new Set([
  'Tanks & vessels',
  'Pumps',
  'Piping',
  'Valves',
  'Process equipment',
]);

const HMI_GROUP_LABEL_PREFIX = 'HMI — ';

/** Default footprint (ft) for bridged HMI symbols on the site-plan canvas. */
const HMI_DEFAULT_SIZE = {
  'Tanks & vessels': { width: 8, height: 6 },
  Pumps: { width: 4, height: 4 },
  Piping: { width: 6, height: 2 },
  Valves: { width: 3, height: 3 },
  'Process equipment': { width: 8, height: 6 },
};

function mvDrawAssetPath(type) {
  return `${MV_DRAW_ASSET_PREFIX}${String(type || '').trim()}`;
}

function isMvDrawAssetPath(path) {
  return String(path || '').startsWith(MV_DRAW_ASSET_PREFIX);
}

function mvDrawTypeFromAssetPath(path) {
  if (!isMvDrawAssetPath(path)) return null;
  return String(path).slice(MV_DRAW_ASSET_PREFIX.length).trim() || null;
}

function isHmiBridgedSymbolType(type) {
  return String(type || '').startsWith(HMI_SYMBOL_PREFIX);
}

function hmiSvgFromSymbolType(type) {
  if (!isHmiBridgedSymbolType(type)) return null;
  const raw = String(type).slice(HMI_SYMBOL_PREFIX.length).trim();
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function hmiSymbolTypeFromPath(hmiPath) {
  const p = String(hmiPath || '').trim();
  if (!p) return null;
  const web = p.startsWith('/') ? p.slice(1) : p;
  return `${HMI_SYMBOL_PREFIX}${web}`;
}

function defaultHmiFootprint(group) {
  return HMI_DEFAULT_SIZE[group] || { width: 6, height: 6 };
}

function defaultHmiPorts(width, height) {
  const hw = width / 2;
  const hh = height / 2;
  return [
    { id: 'w', x: 0, y: hh, dir: 'w' },
    { id: 'e', x: width, y: hh, dir: 'e' },
    { id: 'n', x: hw, y: height, dir: 'n' },
    { id: 's', x: hw, y: 0, dir: 's' },
  ];
}

function buildMvDrawPreviewSvg(symbol) {
  const s = symbol || {};
  const w = Math.max(40, Math.min(120, (+s.width || 6) * 8));
  const h = Math.max(30, Math.min(90, (+s.height || 4) * 8));
  const fill = s.fill || '#64748b';
  const stroke = s.stroke || '#334155';
  const label = String(s.label || s.type || 'Symbol')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 48);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="10" fill="#0f172a">${label}</text>
</svg>`;
}

function listMvDrawHmiAssets() {
  return listSymbols().map((s) => ({
    path: mvDrawAssetPath(s.type),
    name: `${s.type}.mvdraw`,
    type: 'mvdraw',
    group: 'Site plan (MV Draw)',
    subgroup: s.group,
    vendor: 'peaklogic',
    label: s.label,
    preview: `/api/mv-draw/symbols/${encodeURIComponent(s.type)}/preview.svg`,
    mvDrawType: s.type,
  }));
}

function bridgeHmiAssetForMvDraw(asset) {
  if (!asset || typeof asset !== 'object') return null;
  if (asset.type === 'composite' || asset.type === 'mvdraw') return null;
  if (!HMI_GROUPS_IN_MV_DRAW.has(asset.group)) return null;
  const hmiSvg = String(asset.path || '').trim();
  if (!hmiSvg) return null;
  const { width, height } = defaultHmiFootprint(asset.group);
  const type = hmiSymbolTypeFromPath(hmiSvg);
  return {
    type,
    label: asset.label || asset.name || hmiSvg.split('/').pop(),
    group: `${HMI_GROUP_LABEL_PREFIX}${asset.group}`,
    width,
    height,
    ports: defaultHmiPorts(width, height),
    fill: '#cbd5e1',
    stroke: '#475569',
    shape: 'hmi_image',
    hmiSvg,
    hmiGroup: asset.group,
    hmiSubgroup: asset.subgroup || '',
  };
}

function listBridgedHmiSymbols(hmiAssets) {
  const out = [];
  const seen = new Set();
  for (const asset of hmiAssets || []) {
    const sym = bridgeHmiAssetForMvDraw(asset);
    if (!sym || seen.has(sym.type)) continue;
    seen.add(sym.type);
    out.push(sym);
  }
  return out.sort((a, b) => {
    const ga = String(a.group).localeCompare(String(b.group));
    if (ga) return ga;
    return String(a.label).localeCompare(String(b.label));
  });
}

function resolveMvDrawSymbol(type, bridgedByType = null) {
  const native = getSymbol(type);
  if (native) return native;
  if (bridgedByType && bridgedByType.has(type)) return bridgedByType.get(type);
  if (isHmiBridgedSymbolType(type)) {
    const hmiSvg = hmiSvgFromSymbolType(type);
    const { width, height } = defaultHmiFootprint('Process equipment');
    return {
      type,
      label: hmiSvg.split('/').pop().replace(/\.(svg|gif|png)$/i, '').replace(/[_-]+/g, ' '),
      group: `${HMI_GROUP_LABEL_PREFIX}Misc`,
      width,
      height,
      ports: defaultHmiPorts(width, height),
      fill: '#cbd5e1',
      stroke: '#475569',
      shape: 'hmi_image',
      hmiSvg,
    };
  }
  return null;
}

module.exports = {
  MV_DRAW_ASSET_PREFIX,
  HMI_SYMBOL_PREFIX,
  HMI_GROUPS_IN_MV_DRAW,
  mvDrawAssetPath,
  isMvDrawAssetPath,
  mvDrawTypeFromAssetPath,
  isHmiBridgedSymbolType,
  hmiSvgFromSymbolType,
  hmiSymbolTypeFromPath,
  buildMvDrawPreviewSvg,
  listMvDrawHmiAssets,
  bridgeHmiAssetForMvDraw,
  listBridgedHmiSymbols,
  resolveMvDrawSymbol,
};
