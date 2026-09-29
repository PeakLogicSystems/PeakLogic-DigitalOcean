'use strict';

const path = require('path');
const {
  compositeBindingElementId,
  explodeCompositeToEdit,
  listHmiComposites,
  repairCompositeBindings,
} = require('../../src/hmi/hmiComposites');
const { normalizeHmi } = require('../../src/hmi/hmiConfig');
const { normalizeFacilityDraw } = require('./facilityDrawFormat');
const { getSymbol } = require('./symbolLibrary');

const DEFAULT_SCREEN_ID = 'screen_facilitydraw_mcc';
const PILOT_SVG = '/hmi/svg/library/controls/pilot-lights/mv/pl-canonical/pilot_light_round.svg';

const GRID = { cols: 16, rows: 13, cellWidth: 64, cellHeight: 64 };

/** Facility Builder symbol types that compile to full duplex MCC (alternator + 2× motor_hoa). */
const DUPLEX_MCC_TYPES = new Set([
  'lift_duplex',
  'atu_dual',
  'dosing_tank_1500',
]);

/** Single motor_hoa faceplate. */
const SIMPLEX_MOTOR_TYPES = new Set([
  'lift_simplex',
  'pump_chamber',
  'atu_single',
]);

const LEVEL_PILOT_LABELS = ['OFF', 'LEAD', 'LAG', 'HIGH'];

function manifestById(publicRoot) {
  const map = new Map();
  for (const entry of listHmiComposites(publicRoot)) {
    if (entry.composite?.id) map.set(entry.composite.id, entry.composite);
  }
  return map;
}

function nodeMeta(node) {
  return node?.meta && typeof node.meta === 'object' ? { ...node.meta } : {};
}

function sanitizePrefix(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

/** Derive MOTORn-style prefix from Facility Builder node meta. */
function motorPrefixFromNode(meta, index, fallback) {
  const explicit = sanitizePrefix(meta.tagPrefix || meta.compositeTagPrefix);
  if (explicit) {
    if (index <= 0) return explicit;
    const num = /^MOTOR(\d+)$/i.exec(explicit);
    if (num) return `MOTOR${Number(num[1]) + index}`;
    return `${explicit}_${index + 1}`;
  }
  const fb = sanitizePrefix(fallback) || 'MOTOR1';
  if (index <= 0) {
    const alarm = String(meta.alarmTag || '').trim();
    const motorMatch = /^([A-Z][A-Z0-9]*)_/i.exec(alarm);
    if (motorMatch && /^MOTOR\d+$/i.test(motorMatch[1])) return motorMatch[1].toUpperCase();
    const device = sanitizePrefix(meta.deviceId);
    if (device) return device;
    return fb;
  }
  const base = motorPrefixFromNode(meta, 0, fallback);
  const num = /^MOTOR(\d+)$/i.exec(base);
  if (num) return `MOTOR${Number(num[1]) + index}`;
  return `${base}_${index + 1}`;
}

function alternatorFaultTag(meta) {
  const alarm = String(meta.alarmTag || '').trim();
  if (alarm && /FAULT|ALM/i.test(alarm)) return alarm;
  return 'ALT_FAULT';
}

function levelTagFromMeta(meta, nodeType) {
  const level = String(meta.levelTag || '').trim();
  if (level) return level;
  if (nodeType === 'lift_duplex') return 'TANK_LVL';
  if (nodeType === 'lift_simplex') return 'SPX_LEVEL';
  if (nodeType === 'atu_dual' || nodeType === 'atu_quad_dual_duplex') return 'LVL_HIGH';
  return '';
}

function motorPlateLabel(prefix, nodeLabel) {
  const custom = String(nodeLabel || '').trim();
  if (custom) return custom.slice(0, 40);
  if (/^MOTOR(\d+)$/i.test(prefix)) return `Pump ${prefix.replace(/^MOTOR/i, '')}`;
  return prefix;
}

function lampBinding(screenId, col, row, z, elementId, tagId, onColor = '#22c55e') {
  return {
    screenId,
    elementId: `t${col + 1}_${row + 1}_z${z}__${elementId}`,
    tagId,
    property: 'fill',
    onValue: onColor,
    offValue: '#94a3b8',
    classOn: 'hmi-on',
    classOff: 'hmi-off',
  };
}

function motorHoaBindings(screenId, col, row, prefix, manifest, label) {
  const defs = [
    { elementId: 'motor_label', property: 'text', tagId: 'SYS_RUN', onValue: label, offValue: label },
    { elementId: 'status_lamp', property: 'fill5', tagId: `${prefix}_STA`, min: 0, max: 4,
      colors: ['#64748b', '#22c55e', '#ef4444', '#fbed20', '#94a3b8'], flashStates: [] },
    { elementId: 'hoa_state', property: 'text', tagId: `${prefix}_HOA`, format: 'state3', min: 0, max: 2 },
    { elementId: 'run_state', property: 'text', tagId: `${prefix}_STA`, format: 'state5', min: 0, max: 4 },
    { elementId: 'run_hrs', property: 'text', tagId: `${prefix}_HRS`, format: 'fixed1', min: 0, max: 99999 },
    { elementId: 'starts_count', property: 'text', tagId: `${prefix}_STARTS`, format: 'int', min: 0, max: 999999 },
    { elementId: 'btn_offline', property: 'fill', tagId: `${prefix}_OFFLINE`, interaction: 'toggle',
      onValue: '#64748b', offValue: '#22c55e' },
    { elementId: 'btn_offline_label', property: 'text', tagId: `${prefix}_OFFLINE`,
      onValue: 'OFFLINE', offValue: 'ONLINE' },
    { elementId: 'btn_start', property: 'fill', tagId: `${prefix}_START`, interaction: 'pulse',
      onValue: '#22c55e', offValue: '#94a3b8' },
    { elementId: 'btn_stop', property: 'fill', tagId: `${prefix}_STOP`, interaction: 'pulse',
      onValue: '#ef4444', offValue: '#94a3b8' },
    { elementId: 'btn_reset', property: 'fill', tagId: `${prefix}_RESET`, interaction: 'pulse',
      onValue: '#f59e0b', offValue: '#94a3b8' },
  ];
  return defs.map((d) => {
    const elementId = compositeBindingElementId(col, row, manifest, d);
    const out = {
      screenId,
      elementId,
      tagId: d.tagId,
      property: d.property,
      onValue: d.onValue ?? '#22c55e',
      offValue: d.offValue ?? '#94a3b8',
      classOn: 'hmi-on',
      classOff: 'hmi-off',
    };
    if (d.format) out.format = d.format;
    if (d.min != null) out.min = d.min;
    if (d.max != null) out.max = d.max;
    if (d.interaction) out.interaction = d.interaction;
    if (d.colors) out.colors = d.colors.slice();
    if (d.flashStates) out.flashStates = d.flashStates.slice();
    return out;
  });
}

function alternatorBindings(screenId, col, row, manifest, faultTag, motor1Prefix, motor2Prefix) {
  const defs = [
    { elementId: 'alt_label', property: 'text', tagId: 'ALT1', tagField: 'label' },
    { elementId: 'lead_unit', property: 'text', tagId: 'ALT1', tagField: 'activeUnit', format: 'int', min: 0, max: 4 },
    { elementId: 'stage_text', property: 'text', tagId: 'ALT1', tagField: 'pumpStage', format: 'altStage' },
    { elementId: 'lamp_off', property: 'fill', tagId: 'ALT1', tagField: 'offActive', onValue: '#64748b', offValue: '#94a3b8' },
    { elementId: 'lamp_high', property: 'fill', tagId: 'ALT1', tagField: 'highActive', onValue: '#ef4444', offValue: '#94a3b8' },
    { elementId: 'lamp_lag', property: 'fill', tagId: 'ALT1', tagField: 'lowActive', onValue: '#f59e0b', offValue: '#94a3b8' },
    { elementId: 'lamp_fault', property: 'fill', tagId: faultTag, onValue: '#ef4444', offValue: '#94a3b8' },
    { elementId: 'pump1_run', property: 'fill', tagId: `${motor1Prefix}_RUN`, onValue: '#22c55e', offValue: '#94a3b8' },
    { elementId: 'pump2_run', property: 'fill', tagId: `${motor2Prefix}_RUN`, onValue: '#22c55e', offValue: '#94a3b8' },
    { elementId: 'pump3_run', property: 'visibility', tagId: 'MOTOR3_RUN', onValue: '1', offValue: '0' },
    { elementId: 'pump4_run', property: 'visibility', tagId: 'MOTOR4_RUN', onValue: '1', offValue: '0' },
    { elementId: 'lamp_lag2', property: 'visibility', tagId: 'MOTOR4_RUN', onValue: '1', offValue: '0' },
  ];
  return defs.map((d) => {
    const elementId = compositeBindingElementId(col, row, manifest, d);
    const out = {
      screenId,
      elementId,
      tagId: d.tagId,
      property: d.property,
      onValue: d.onValue ?? '#22c55e',
      offValue: d.offValue ?? '#94a3b8',
      classOn: 'hmi-on',
      classOff: 'hmi-off',
    };
    if (d.format) out.format = d.format;
    if (d.tagField) out.tagField = d.tagField;
    if (d.min != null) out.min = d.min;
    if (d.max != null) out.max = d.max;
    return out;
  });
}

function pilotTile(col, row, label) {
  return {
    col,
    row,
    colSpan: 2,
    rowSpan: 2,
    label,
    layers: [{ kind: 'staticImage', z: 0, svg: PILOT_SVG }],
  };
}

function levelPilotBindings(screenId, levelTag) {
  const tag = String(levelTag || '').trim();
  let tags;
  if (/^TANK/i.test(tag) || tag === 'TANK_LVL') {
    tags = ['LVL_OFF', 'LVL_LEAD', 'LVL_LAG', 'LVL_HIGH'];
  } else {
    const base = tag.replace(/_(OFF|LEAD|LAG|HIGH|LVL|LEVEL)$/i, '') || tag;
    tags = [`${base}_OFF`, `${base}_LEAD`, `${base}_LAG`, tag.endsWith('_HIGH') ? tag : `${base}_HIGH`];
  }
  const cols = [8, 10, 12, 14];
  const colors = ['#64748b', '#22c55e', '#f59e0b', '#ef4444'];
  return cols.map((col, i) => lampBinding(screenId, col, 7, 0, 'lamp', tags[i], colors[i]));
}

function buildScreen(screenId, name, tiles) {
  return {
    id: screenId,
    number: 2,
    isHome: false,
    name,
    svg: null,
    tiles,
    gridCols: GRID.cols,
    gridRows: GRID.rows,
    cellWidth: GRID.cellWidth,
    cellHeight: GRID.cellHeight,
    gridSize: GRID.cols,
    width: GRID.cols * GRID.cellWidth,
    height: GRID.rows * GRID.cellHeight,
    displayMaxWidth: 1024,
    displayMaxHeight: 768,
    fit: 'contain',
    scale: 100,
    background: '#f1f5f9',
    offsetX: 0,
    offsetY: 0,
    naturalWidth: null,
    naturalHeight: null,
  };
}

function compileDuplexMcc(node, screenId, manifests) {
  const meta = nodeMeta(node);
  const motorManifest = manifests.get('motor_hoa');
  const altManifest = manifests.get('alternator');
  if (!motorManifest || !altManifest) {
    return { tiles: [], bindings: [], warnings: ['Missing motor_hoa or alternator composite manifest'] };
  }
  const motor1 = motorPrefixFromNode(meta, 0, 'MOTOR1');
  const motor2 = motorPrefixFromNode(meta, 1, 'MOTOR2');
  const faultTag = alternatorFaultTag(meta);
  const levelTag = levelTagFromMeta(meta, node.type);
  const tiles = [
    explodeCompositeToEdit(altManifest, 0, 0, { colSpan: 8, rowSpan: 6, label: node.label || 'Alternator' }),
    explodeCompositeToEdit(motorManifest, 8, 0, {
      colSpan: 8, rowSpan: 6, tagPrefix: motor1, label: motorPlateLabel(motor1, node.label),
    }),
    explodeCompositeToEdit(motorManifest, 0, 7, {
      colSpan: 8, rowSpan: 6, tagPrefix: motor2, label: motorPlateLabel(motor2, node.label),
    }),
    pilotTile(8, 7, LEVEL_PILOT_LABELS[0]),
    pilotTile(10, 7, LEVEL_PILOT_LABELS[1]),
    pilotTile(12, 7, LEVEL_PILOT_LABELS[2]),
    pilotTile(14, 7, LEVEL_PILOT_LABELS[3]),
  ].filter(Boolean);
  const bindings = [
    ...alternatorBindings(screenId, 0, 0, altManifest, faultTag, motor1, motor2),
    ...motorHoaBindings(screenId, 8, 0, motor1, motorManifest, motorPlateLabel(motor1, node.label)),
    ...motorHoaBindings(screenId, 0, 7, motor2, motorManifest, motorPlateLabel(motor2, node.label)),
  ];
  if (levelTag) bindings.push(...levelPilotBindings(screenId, levelTag));
  return {
    tiles,
    bindings,
    summary: {
      nodeId: node.id,
      nodeType: node.type,
      recipe: 'duplex_mcc',
      motor1,
      motor2,
      faultTag,
      levelTag: levelTag || null,
    },
    warnings: [],
  };
}

function compileSimplexMotor(node, screenId, manifests, col, row) {
  const meta = nodeMeta(node);
  const motorManifest = manifests.get('motor_hoa');
  if (!motorManifest) {
    return { tiles: [], bindings: [], warnings: ['Missing motor_hoa composite manifest'] };
  }
  const prefix = motorPrefixFromNode(meta, 0, 'MOTOR1');
  const tile = explodeCompositeToEdit(motorManifest, col, row, {
    colSpan: 8,
    rowSpan: 6,
    tagPrefix: prefix,
    label: motorPlateLabel(prefix, node.label),
  });
  return {
    tiles: tile ? [tile] : [],
    bindings: motorHoaBindings(
      screenId,
      col,
      row,
      prefix,
      motorManifest,
      motorPlateLabel(prefix, node.label),
    ),
    summary: { nodeId: node.id, nodeType: node.type, recipe: 'simplex_motor', prefix },
    warnings: [],
  };
}

/**
 * Compile Facility Builder nodes with SCADA meta into an HMI screen + bindings.
 * @param {object} doc - peaklogic-facilitydraw document
 * @param {object} [options]
 * @param {string} [options.screenId]
 * @param {string} [options.screenName]
 * @param {string} [options.publicRoot]
 */
function compileFacilityDrawToHmi(doc, options = {}) {
  const normalized = normalizeFacilityDraw(doc);
  const publicRoot = options.publicRoot || path.join(__dirname, '../../public');
  const screenId = String(options.screenId || DEFAULT_SCREEN_ID).trim() || DEFAULT_SCREEN_ID;
  const screenName = String(options.screenName || 'Facility Builder — MCC').trim();
  const manifests = manifestById(publicRoot);

  const compilable = (normalized.nodes || []).filter((node) => {
    const sym = getSymbol(node.type);
    if (!sym) return false;
    return DUPLEX_MCC_TYPES.has(node.type)
      || SIMPLEX_MOTOR_TYPES.has(node.type)
      || nodeMeta(node).deviceId
      || nodeMeta(node).alarmTag
      || nodeMeta(node).levelTag;
  });

  const warnings = [];
  const summaries = [];
  let tiles = [];
  let bindings = [];

  const duplexNodes = compilable.filter((n) => DUPLEX_MCC_TYPES.has(n.type));
  const simplexNodes = compilable.filter((n) => SIMPLEX_MOTOR_TYPES.has(n.type) && !DUPLEX_MCC_TYPES.has(n.type));

  if (duplexNodes.length > 1) {
    warnings.push(`Multiple duplex stations found (${duplexNodes.length}) — only the first was compiled to ${screenId}.`);
  }
  if (duplexNodes.length) {
    const block = compileDuplexMcc(duplexNodes[0], screenId, manifests);
    tiles.push(...block.tiles);
    bindings.push(...block.bindings);
    summaries.push(block.summary);
    warnings.push(...block.warnings);
  } else {
    let col = 0;
    let row = 0;
    for (const node of simplexNodes) {
      if (col + 8 > GRID.cols) {
        col = 0;
        row += 7;
      }
      if (row + 6 > GRID.rows) {
        warnings.push(`Grid full — skipped ${node.type} (${node.id})`);
        continue;
      }
      const block = compileSimplexMotor(node, screenId, manifests, col, row);
      tiles.push(...block.tiles);
      bindings.push(...block.bindings);
      summaries.push(block.summary);
      warnings.push(...block.warnings);
      col += 8;
    }
  }

  // Nodes with only meta tags but no recipe — treat as simplex if grid space remains
  const metaOnly = compilable.filter((n) => !DUPLEX_MCC_TYPES.has(n.type) && !SIMPLEX_MOTOR_TYPES.has(n.type));
  for (const node of metaOnly) {
    if (duplexNodes.length) {
      warnings.push(`Node ${node.id} (${node.type}) has SCADA meta but duplex layout consumed the screen.`);
      continue;
    }
    let col = tiles.length * 8;
    if (col + 8 > GRID.cols) {
      warnings.push(`No room for meta-only node ${node.id}`);
      continue;
    }
    const block = compileSimplexMotor(node, screenId, manifests, col, 0);
    tiles.push(...block.tiles);
    bindings.push(...block.bindings);
    summaries.push(block.summary);
  }

  const screen = buildScreen(screenId, screenName, tiles);
  return {
    screen,
    bindings,
    summaries,
    warnings,
    stats: {
      nodesScanned: normalized.nodes?.length || 0,
      nodesCompiled: summaries.length,
      tileCount: tiles.length,
      bindingCount: bindings.length,
    },
  };
}

function mergeCompiledHmiIntoSettings(settings, compiled, publicRoot, tags = []) {
  const hmi = settings?.hmi && typeof settings.hmi === 'object' ? { ...settings.hmi } : {};
  const prevIds = new Set((hmi.screens || []).map((s) => s.id));
  const screens = [...(hmi.screens || [])];
  const idx = screens.findIndex((s) => s.id === compiled.screen.id);
  if (idx >= 0) screens[idx] = compiled.screen;
  else screens.push(compiled.screen);
  const bindings = [
    ...(hmi.bindings || []).filter((b) => b.screenId !== compiled.screen.id),
    ...compiled.bindings,
  ];
  const layout = hmi.layout && typeof hmi.layout === 'object' ? { ...hmi.layout } : {};
  layout.composerMode = layout.composerMode || 'grid';
  const draft = normalizeHmi({ ...hmi, screens, bindings, layout }, tags, publicRoot);
  const newScreen = (draft.screens || []).find((s) => !prevIds.has(s.id))
    || (draft.screens || []).find((s) => s.name === compiled.screen.name);
  if (newScreen) {
    if (!Array.isArray(draft.layout.areaPopupScreens)) {
      draft.layout = { ...draft.layout, areaPopupScreens: [] };
    }
    const popups = new Set(draft.layout.areaPopupScreens || []);
    popups.delete(compiled.screen.id);
    popups.add(newScreen.id);
    draft.layout.areaPopupScreens = [...popups];
  }
  repairCompositeBindings(draft, publicRoot);
  return { ...settings, hmi: draft };
}

module.exports = {
  DEFAULT_SCREEN_ID,
  compileFacilityDrawToHmi,
  mergeCompiledHmiIntoSettings,
  motorPrefixFromNode,
  DUPLEX_MCC_TYPES,
  SIMPLEX_MOTOR_TYPES,
};
