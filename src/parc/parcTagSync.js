'use strict';

const { applyDefaultLabel } = require('../tags/tagLabels');
const { inferTagType, inferTagRole } = require('./optaTagMeta');

/** Resolve tag role — hardware I/O ids win over incorrect telemetry "memory" on expansion tags. */
function resolveParcTagRole(row, type, id) {
  const inferred = inferTagRole(id, type);
  let role = row?.role || inferred;
  if (inferred === 'input' || inferred === 'output') role = inferred;
  if (role === 'in') role = 'input';
  if (role === 'out') role = 'output';
  if (role === 'mem') role = 'memory';
  return role;
}

/** Map Parc telemetry tag row → PeakLogic tag store row. */
function parcRowToStoreTag(row, driverId) {
  const id = String(row?.id || '').trim();
  if (!id) return null;
  const type = String(row.type || inferTagType(id)).toUpperCase();
  const role = resolveParcTagRole(row, type, id);
  let value = row.value;
  if (value === undefined || value === null) {
    value = type === 'BOOL' ? false : 0;
  } else if (type === 'BOOL') {
    value = !!value;
  } else if (type === 'INT') {
    value = Math.trunc(Number(value) || 0);
  } else if (type === 'REAL' || type === 'PID' || type === 'AVG') {
    value = Number(value) || 0;
  }
  const tag = applyDefaultLabel({
    id,
    type,
    role,
    value,
    driverId,
    driverAddress: { channel: id },
    quality: row.quality || 'GOOD',
    alarmsEnabled: false,
    readonly: role === 'input',
    graphEnabled: type === 'INT' || type === 'REAL',
  });
  if (type === 'PID' && tag.preset == null) {
    tag.preset = 512;
    tag.mode = 'PI';
    tag.kp = 0.5;
    tag.ki = 0.1;
    tag.kd = 0;
    tag.outMin = 0;
    tag.outMax = 1023;
  }
  if (type === 'AVG' && tag.preset == null) {
    tag.preset = 8;
    tag.mode = 'MOV';
  }
  if (type === 'TIMER' && tag.preset == null) {
    tag.preset = 1000;
    tag.mode = 'TON';
  }
  if (type === 'COUNTER' && tag.preset == null) {
    tag.preset = 10;
    tag.mode = 'CTU';
  }
  return tag;
}

/**
 * Replace all tags on driverId with rows from Parc device telemetry.
 * @param {object[]} existingTags full tag store list
 * @param {object[]} parcTags tags[] from registry device report
 * @param {string} driverId
 * @param {{ reassign?: boolean }} [opts] when true, drop same-id tags on other drivers (incl. memory)
 */
function mergeParcTagsIntoStore(existingTags, parcTags, driverId, opts = {}) {
  const reassign = opts.reassign !== false;
  const incoming = (parcTags || [])
    .map((row) => parcRowToStoreTag(row, driverId))
    .filter(Boolean);
  if (!incoming.length) {
    return { ok: false, error: 'Device has no tags in last Parc report — scan expansions on Opta /setup first' };
  }
  let stripped = (existingTags || []).filter((t) => t.driverId !== driverId);
  const ids = new Set(stripped.map((t) => t.id));
  const conflicts = incoming.filter((t) => ids.has(t.id));
  if (conflicts.length && !reassign) {
    return {
      ok: false,
      error: `Tag id conflict (not on this driver): ${conflicts.map((t) => t.id).join(', ')}`,
      conflicts: conflicts.map((t) => t.id),
    };
  }
  if (reassign && conflicts.length) {
    const conflictIds = new Set(conflicts.map((t) => t.id));
    stripped = stripped.filter((t) => !conflictIds.has(t.id));
  }
  return {
    ok: true,
    tags: [...stripped, ...incoming],
    count: incoming.length,
    reassigned: reassign ? conflicts.length : 0,
  };
}

function roleRank(role) {
  if (role === 'input' || role === 'output') return 2;
  return 1;
}

function isDeclaredHardwareRole(row) {
  const role = String(row?.role || '').toLowerCase();
  return role === 'input' || role === 'output' || role === 'in' || role === 'out';
}

/** Collapse duplicate telemetry rows; declared hardware I/O wins over memory. */
function dedupeParcTags(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, row);
      continue;
    }
    const prevHard = isDeclaredHardwareRole(prev);
    const nextHard = isDeclaredHardwareRole(row);
    if (nextHard && !prevHard) {
      byId.set(id, row);
      continue;
    }
    if (nextHard === prevHard) {
      const prevRole = resolveParcTagRole(prev, prev.type, id);
      const nextRole = resolveParcTagRole(row, row.type, id);
      if (roleRank(nextRole) > roleRank(prevRole)) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

function buildParcTagSnap(rows) {
  return new Map(dedupeParcTags(rows).map((row) => [String(row.id), row]));
}

function isHardwareParcRow(row) {
  const id = String(row?.id || '').trim();
  if (!id) return false;
  const type = String(row.type || inferTagType(id)).toUpperCase();
  const role = resolveParcTagRole(row, type, id);
  return role === 'input' || role === 'output';
}

/** Add missing Opta hardware I/O tags so Tags / Live I/O can show device states. */
function ensureParcHardwareTags(store, rows, driverId) {
  if (!store?.upsert && !store?.replaceAll) return 0;
  const incoming = dedupeParcTags(rows).filter(isHardwareParcRow);
  const toAdd = [];
  for (const row of incoming) {
    const id = String(row.id || '').trim();
    if (!id || store.get?.(id)) continue;
    const tag = parcRowToStoreTag(row, driverId);
    if (tag) toAdd.push(tag);
  }
  if (!toAdd.length) return 0;
  if (typeof store.replaceAll === 'function') {
    store.replaceAll([...(store.list?.() || []), ...toAdd]);
  } else {
    for (const tag of toAdd) store.upsert(tag);
  }
  return toAdd.length;
}

function applyParcHardwareTelemetry(store, rows, quality) {
  if (!store) return 0;
  let n = 0;
  for (const row of dedupeParcTags(rows)) {
    const id = String(row?.id || '').trim();
    if (!id || !store.get?.(id)) continue;
    if (typeof store.applyDeviceTelemetry === 'function') {
      store.applyDeviceTelemetry(id, row, quality);
    } else if (typeof store.setValue === 'function') {
      store.setValue(id, row.value, quality);
    }
    n += 1;
  }
  return n;
}

module.exports = {
  parcRowToStoreTag,
  mergeParcTagsIntoStore,
  resolveParcTagRole,
  dedupeParcTags,
  buildParcTagSnap,
  isHardwareParcRow,
  ensureParcHardwareTags,
  applyParcHardwareTelemetry,
};
