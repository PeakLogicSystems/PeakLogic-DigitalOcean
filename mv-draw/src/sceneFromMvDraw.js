'use strict';

const { getSymbol } = require('./symbolLibrary');
const { edgePathPoints } = require('./edgePath');
const { normalizeEdgeKind } = require('../../public/js/mvDrawEdgePath');
const { drawingBounds, normalizeExtents } = require('./extents');
const { normalizeMvDraw } = require('./mvDrawFormat');

/** Visual hints for layout 3D (typed models + boxes). */
const SYMBOL_SCENE = {
  lift_simplex: { category: 'lift', heightFt: 3.2, liftKind: 'simplex', model3d: 'lift_simplex' },
  lift_duplex: { category: 'lift', heightFt: 3.6, liftKind: 'duplex', model3d: 'lift_duplex' },
  treatment_tank_1250: { category: 'tank', heightFt: 2.8, model3d: 'tank' },
  trash_tank_1250_2comp: { category: 'tank', heightFt: 3, model3d: 'tank' },
  dosing_tank_1500: { category: 'tank', heightFt: 3.2, model3d: 'tank' },
  integrated_mle_tank_125k: { category: 'tank', heightFt: 25, model3d: 'mle_tank' },
  septic_tank_1000: { category: 'tank', heightFt: 2.5, model3d: 'tank' },
  pump_chamber: { category: 'tank', heightFt: 2.2, model3d: 'tank' },
  atu_single: { category: 'panel', heightFt: 2, model3d: 'box' },
  atu_dual: { category: 'atu', heightFt: 2, model3d: 'dwts_plant' },
  atu_quad_dual_duplex: { category: 'atu', heightFt: 2.2, model3d: 'dwts_plant' },
  power_panel_5: { category: 'panel', heightFt: 2.2, model3d: 'box' },
  power_panel_10: { category: 'panel', heightFt: 2.4, model3d: 'box' },
  power_panel_20: { category: 'panel', heightFt: 2.8, model3d: 'box' },
  power_panel_40: { category: 'panel', heightFt: 3.2, model3d: 'box' },
  d_box: { category: 'distribution', heightFt: 1.2, model3d: 'box' },
  drip_drainfield: { category: 'drip', heightFt: 0.35, model3d: 'drip_field' },
  drip_irrigation_4leg: { category: 'drip', heightFt: 0.5, model3d: 'drip_field' },
  drip_leg: { category: 'drip', heightFt: 0.25, model3d: 'box' },
  leach_trench: { category: 'drip', heightFt: 0.3, model3d: 'drip_field' },
  cleanout: { category: 'site', heightFt: 1, model3d: 'box' },
  building: { category: 'building', heightFt: 8, model3d: 'box' },
};

const DEFAULT_SCENE = { category: 'site', heightFt: 2, model3d: 'box' };

const DEFAULT_ALARM_TAGS = {
  lift_simplex: 'SPX_ALM',
  lift_duplex: 'ALT_FAULT',
  atu_dual: 'ALT_FAULT',
  atu_quad_dual_duplex: 'ALT_FAULT',
  integrated_mle_tank_125k: 'T1_ALM',
};

const DEFAULT_LEVEL_TAGS = {
  lift_simplex: 'SPX_LEVEL',
  lift_duplex: 'TANK_LVL',
  atu_dual: 'LVL_HIGH',
  atu_quad_dual_duplex: 'LVL_HIGH',
  integrated_mle_tank_125k: 'T1_LVL',
};

function nodeScale(node) {
  const sx = Number(node?.scaleX);
  const sy = Number(node?.scaleY);
  return {
    scaleX: Number.isFinite(sx) && sx > 0 ? sx : 1,
    scaleY: Number.isFinite(sy) && sy > 0 ? sy : 1,
  };
}

function contentBounds(doc) {
  let minX = 0;
  let minY = 0;
  let maxX = 100;
  let maxY = 80;
  let any = false;
  for (const node of doc.nodes || []) {
    const sym = getSymbol(node.type);
    const { scaleX, scaleY } = nodeScale(node);
    const w = (sym?.width || 4) * scaleX;
    const h = (sym?.height || 4) * scaleY;
    minX = Math.min(minX, node.x - w / 2);
    minY = Math.min(minY, node.y - h / 2);
    maxX = Math.max(maxX, node.x + w / 2);
    maxY = Math.max(maxY, node.y + h / 2);
    any = true;
  }
  for (const edge of doc.edges || []) {
    for (const [x, y] of edgePathPoints(edge, doc.nodes)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      any = true;
    }
  }
  if (!any) return { minX: -50, minY: -40, maxX: 50, maxY: 40 };
  const pad = 10;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function hexToCss(hex) {
  const h = String(hex || '#64748b').trim();
  return /^#[0-9a-f]{6}$/i.test(h) ? h : '#64748b';
}

function planToScene(x, y, origin, feetPerUnit) {
  const s = Number.isFinite(+feetPerUnit) && +feetPerUnit > 0 ? +feetPerUnit : 1;
  return {
    x: (x - origin.x) * s,
    z: (y - origin.y) * s,
  };
}

function inferRole(type, sceneHints) {
  if (sceneHints.liftKind === 'simplex') return 'collection';
  if (sceneHints.liftKind === 'duplex') return 'booster';
  if (sceneHints.category === 'atu') return 'plant';
  return '';
}

function normalizeDeviceMeta(node, sceneHints) {
  const raw = node.meta && typeof node.meta === 'object' ? { ...node.meta } : {};
  const role = String(raw.role || '').trim() || inferRole(node.type, sceneHints);
  const zoneId = String(raw.zoneId || '').trim() || null;
  const deviceId = String(raw.deviceId || '').trim() || null;
  const alarmTag = String(raw.alarmTag || '').trim()
    || DEFAULT_ALARM_TAGS[node.type]
    || '';
  const levelTag = String(raw.levelTag || '').trim()
    || DEFAULT_LEVEL_TAGS[node.type]
    || '';
  return {
    ...raw,
    role: role || null,
    zoneId,
    deviceId,
    alarmTag: alarmTag || null,
    levelTag: levelTag || null,
  };
}

function aggregateZones(doc, placements) {
  const zones = new Map();

  for (const p of placements) {
    const zid = p.meta?.zoneId;
    if (!zid) continue;
    if (!zones.has(zid)) {
      zones.set(zid, {
        id: zid,
        label: zid,
        placementIds: [],
        source: 'meta',
      });
    }
    zones.get(zid).placementIds.push(p.id);
  }

  for (const g of doc.groups || []) {
    const gid = String(g.id || '').trim();
    if (!gid || zones.has(gid)) continue;
    const memberIds = (g.nodeIds || []).filter((id) => placements.some((p) => p.id === id));
    if (!memberIds.length) continue;
    zones.set(gid, {
      id: gid,
      label: String(g.name || gid).trim() || gid,
      placementIds: memberIds,
      source: 'group',
    });
    for (const pid of memberIds) {
      const p = placements.find((pl) => pl.id === pid);
      if (p && !p.meta.zoneId) {
        p.meta.zoneId = gid;
      }
    }
  }

  return [...zones.values()].map((z) => {
    const members = placements.filter((p) => z.placementIds.includes(p.id));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of members) {
      const hw = p.size.widthFt / 2;
      const hd = p.size.depthFt / 2;
      minX = Math.min(minX, p.scene.x - hw);
      maxX = Math.max(maxX, p.scene.x + hw);
      minZ = Math.min(minZ, p.scene.z - hd);
      maxZ = Math.max(maxZ, p.scene.z + hd);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minZ = 0;
      maxZ = 0;
    }
    const roles = {};
    for (const p of members) {
      const r = p.meta?.role;
      if (r) roles[r] = (roles[r] || 0) + 1;
    }
    return {
      ...z,
      center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
      bounds: { minX, maxX, minZ, maxZ },
      roles,
      deviceIds: members.map((p) => p.meta?.deviceId).filter(Boolean),
    };
  });
}

/**
 * Compile MV Draw document into a neutral site scene for 3D viewers.
 * @param {object} rawProject
 * @param {{ feetPerUnit?: number }} opts
 */
function buildSceneFromMvDraw(rawProject, opts = {}) {
  const doc = normalizeMvDraw(rawProject);
  const feetPerUnit = Number.isFinite(+opts.feetPerUnit) && +opts.feetPerUnit > 0
    ? +opts.feetPerUnit
    : 1;
  const bounds = drawingBounds(doc, contentBounds);
  const origin = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const extents = normalizeExtents(doc.extents);

  const placements = (doc.nodes || []).map((node) => {
    const sym = getSymbol(node.type);
    const sceneHints = SYMBOL_SCENE[node.type] || DEFAULT_SCENE;
    const { scaleX, scaleY } = nodeScale(node);
    const widthFt = (sym?.width || 4) * scaleX;
    const depthFt = (sym?.height || 4) * scaleY;
    const pos = planToScene(node.x, node.y, origin, feetPerUnit);
    const meta = normalizeDeviceMeta(node, sceneHints);
    return {
      id: node.id,
      type: node.type,
      label: String(node.label || sym?.label || node.type).trim(),
      group: sym?.group || 'Site',
      shape: sym?.shape || null,
      category: sceneHints.category,
      liftKind: sceneHints.liftKind || null,
      model3d: sceneHints.model3d || 'box',
      world: {
        x: node.x,
        y: node.y,
        rotation: node.rotation || 0,
      },
      scene: {
        x: pos.x,
        z: pos.z,
        rotation: node.rotation || 0,
      },
      size: {
        widthFt: widthFt * feetPerUnit,
        depthFt: depthFt * feetPerUnit,
        heightFt: sceneHints.heightFt * feetPerUnit,
      },
      color: hexToCss(sym?.fill),
      stroke: hexToCss(sym?.stroke),
      meta,
      deviceId: meta.deviceId,
      zoneId: meta.zoneId,
      role: meta.role,
      alarmTag: meta.alarmTag,
      levelTag: meta.levelTag,
    };
  });

  const zones = aggregateZones(doc, placements);

  const pipes = [];
  for (const edge of doc.edges || []) {
    const pts = edgePathPoints(edge, doc.nodes);
    if (pts.length < 2) continue;
    pipes.push({
      id: edge.id,
      kind: normalizeEdgeKind(edge.kind),
      label: String(edge.label || '').trim(),
      from: edge.from,
      to: edge.to,
      points: pts.map(([x, y]) => planToScene(x, y, origin, feetPerUnit)),
    });
  }

  const plot = extents
    ? {
        minX: (extents.minX - origin.x) * feetPerUnit,
        maxX: (extents.maxX - origin.x) * feetPerUnit,
        minZ: (extents.minY - origin.y) * feetPerUnit,
        maxZ: (extents.maxY - origin.y) * feetPerUnit,
        label: extents.label || 'Drawing extents',
        sheetSize: extents.sheetSize || null,
      }
    : {
        minX: (bounds.minX - origin.x) * feetPerUnit,
        maxX: (bounds.maxX - origin.x) * feetPerUnit,
        minZ: (bounds.minY - origin.y) * feetPerUnit,
        maxZ: (bounds.maxY - origin.y) * feetPerUnit,
        label: 'Content bounds',
        sheetSize: null,
      };

  return {
    source: 'peaklogic-mvdraw',
    name: doc.name || 'untitled',
    units: doc.units || 'ft',
    generatedAt: new Date().toISOString(),
    feetPerUnit,
    origin,
    bounds: {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      fromExtents: !!bounds.fromExtents,
    },
    plot,
    scaleCalibrated: !!(doc.scale?.pixelsPerUnit),
    placements,
    zones,
    pipes,
    meta: {
      client: doc.meta?.client || '',
      site: doc.meta?.site || '',
      notes: doc.meta?.notes || '',
    },
  };
}

module.exports = {
  SYMBOL_SCENE,
  buildSceneFromMvDraw,
  contentBounds,
  planToScene,
  normalizeDeviceMeta,
  aggregateZones,
};
