'use strict';

const { applyDefaultLabel } = require('../tags/tagLabels');

function sanitizeDeviceId(deviceId) {
  // Trim + collapse separator runs + strip edge separators so inconsistent
  // portal formatting (" FA003190", "fa003190", "FA-003190") maps to one
  // canonical tag id and never produces a second duplicate tag group.
  return String(deviceId || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/**
 * Canonical grouping key. Auto NC_ tags collapse separator runs and uppercase so
 * portal formatting variants of one device ("NC__FA003190_LEAK", "NC_FA_003190_LEAK",
 * "NC_FA003190_LEAK") all map to a single group; every other tag keys on its exact id.
 */
function ncGroupKey(id) {
  const s = String(id || '');
  return /^NC_/i.test(s) ? s.replace(/_+/g, '_').toUpperCase() : s;
}

/** Keep the first tag for each id — duplicates (e.g. re-imported groups) are dropped. */
function dedupeById(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    if (!t || !t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Keep the first tag per canonical group. Unlike dedupeById this also collapses
 * formatting variants of the same NC device serial, so a stale "NC__FA_USAGE" can
 * never coexist with the freshly-built "NC_FA_USAGE" and double up the tag list.
 */
function dedupeByGroup(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    if (!t || !t.id) continue;
    const key = ncGroupKey(t.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function tagIdFor(deviceId, suffix) {
  return `NC_${sanitizeDeviceId(deviceId)}_${suffix}`;
}

function isAutoNextcenturyTag(tag) {
  if (!tag) return false;
  if (tag.ncAuto === true) return true;
  // Any NC_-prefixed tag on a NextCentury driver is auto-managed, regardless of
  // how the serial was formatted by the portal (NC_FA003190_LEAK, the malformed
  // NC__FA003190_LEAK, NC_FA_003190_LEAK, INTERVAL suffix, etc.). Recognizing
  // every variant guarantees stale/duplicate groups are stripped and rebuilt
  // canonically on each poll instead of lingering as a second group forever.
  const id = String(tag.id || '').toUpperCase();
  return /^NC_/.test(id);
}

function isLeakStyleDevice(doc) {
  const dt = String(doc.deviceType || '').toLowerCase();
  if (dt.includes('leak') || dt.includes('light')) return true;
  const ls = String(doc.leakStatus || '').trim().toLowerCase();
  return ls && !ls.includes('no leak') && ls !== 'dry' && ls !== 'ok';
}

function isElectricMeter(doc) {
  const dt = String(doc.deviceType || '').toLowerCase();
  const model = String(doc.meterModel || '').toLowerCase();
  const desc = String(doc.description || '').toLowerCase();
  return dt.includes('electric') || model.includes('meter') || desc.includes('power meter');
}

function fieldsForDevice(doc) {
  const fields = [{ field: 'totalUsage', suffix: 'USAGE', type: 'REAL' }];
  if (isElectricMeter(doc)) {
    fields.push({ field: 'currentReading', suffix: 'INTERVAL', type: 'REAL' });
  }
  const leakStyle = isLeakStyleDevice(doc);
  if (!leakStyle || doc.temperature != null) {
    fields.push({ field: 'temperature', suffix: 'TEMP', type: 'REAL' });
  }
  if (leakStyle) {
    fields.push({ field: 'leakActive', suffix: 'LEAK', type: 'BOOL' });
  }
  return fields;
}

function defaultLabel(doc, suffix) {
  const loc = String(doc.description || doc.area || doc.unitNumber || doc.deviceId || '').trim();
  const names = { USAGE: 'usage', INTERVAL: 'interval kWh', TEMP: 'temp', LEAK: 'leak' };
  const tail = names[suffix] || suffix.toLowerCase();
  return loc ? `${loc} ${tail}` : `${doc.deviceId} ${tail}`;
}

/** Normalize NC portal description to a PeakLogic tag id (e.g. "RM101_Toilet_Leak" → RM101_TOILET_LEAK). */
function normalizeDescriptionTagId(description) {
  const raw = String(description || '').replace(/^\s+|\s+$/g, '').replace(/^\t+/, '').trim();
  if (!raw || /\s/.test(raw)) return '';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) return '';
  return raw.toUpperCase();
}

/** Pick driver field for a semantic tag id from device row + NC field list. */
function inferFieldForSemanticTag(tagId, doc) {
  const id = String(tagId || '').toUpperCase();
  if (id.endsWith('_LEAK')) return 'leakActive';
  if (id.endsWith('_TEMP')) return 'temperature';
  if (id.includes('INTERVAL') && id.endsWith('_KWH')) return 'currentReading';
  if (id.endsWith('_KWH') || id.endsWith('_USAGE') || id.endsWith('_GPM')) return 'totalUsage';
  const fields = fieldsForDevice(doc);
  if (fields.length === 1) return fields[0].field;
  if (id.endsWith('_LEAK') || isLeakStyleDevice(doc)) {
    const leak = fields.find((f) => f.field === 'leakActive');
    if (leak) return leak.field;
  }
  return null;
}

/**
 * Wire existing semantic tags (non-NC_*) to NC devices when the portal description
 * matches the tag id — e.g. property 40074 unit 3 rows labeled RM101_AC_PAN_LEAK.
 */
function wireSemanticTagsFromDescriptions(tags, deviceCache, driverId) {
  if (!driverId || !tags?.length) return { tags, wired: [] };
  const wired = [];
  const out = tags.map((t) => ({ ...t }));
  const byId = new Map(out.map((t) => [t.id, t]));
  for (const doc of deviceCache.values()) {
    const tagId = normalizeDescriptionTagId(doc.description);
    if (!tagId) continue;
    const existing = byId.get(tagId);
    if (!existing || isAutoNextcenturyTag(existing)) continue;
    const field = inferFieldForSemanticTag(tagId, doc);
    if (!field || !doc.deviceId) continue;
    const next = {
      ...existing,
      driverId,
      driverAddress: { deviceId: doc.deviceId, field },
    };
    byId.set(tagId, next);
    const idx = out.findIndex((t) => t.id === tagId);
    if (idx >= 0) out[idx] = next;
    wired.push({ tagId, deviceId: doc.deviceId, field });
  }
  return { tags: out, wired };
}

function makeStatusTags(driverId, meta) {
  const rows = [
    {
      id: 'NC_STATUS_DEVICES',
      label: 'NC device count',
      type: 'INT',
      field: '_deviceCount',
    },
    {
      id: 'NC_STATUS_LAST_COLLECT',
      label: 'NC last collect epoch',
      type: 'INT',
      field: '_lastCollectEpoch',
    },
  ];
  return rows.map((row) => applyDefaultLabel({
    id: row.id,
    label: row.label,
    type: row.type,
    role: 'input',
    value: meta[row.field] ?? (row.type === 'BOOL' ? false : 0),
    driverId,
    driverAddress: { deviceId: '_meta', field: row.field },
    ncAuto: true,
    readonly: true,
    graphEnabled: false,
    alarmsEnabled: false,
  }));
}

function deviceDocToTags(doc, driverId) {
  if (!doc?.deviceId) return [];
  return fieldsForDevice(doc).map((def) => applyDefaultLabel({
    id: tagIdFor(doc.deviceId, def.suffix),
    label: defaultLabel(doc, def.suffix),
    type: def.type,
    role: 'input',
    value: def.type === 'BOOL' ? false : 0,
    driverId,
    driverAddress: { deviceId: doc.deviceId, field: def.field },
    ncAuto: true,
    readonly: true,
    graphEnabled: def.type === 'REAL',
    alarmsEnabled: def.field === 'leakActive',
  }));
}

/**
 * Build PeakLogic tag rows from a NextCentury device cache (Map or iterable entries).
 */
function buildNextcenturyTags(deviceCache, driverId, meta = {}) {
  const incoming = [...makeStatusTags(driverId, meta)];
  for (const doc of deviceCache.values()) {
    incoming.push(...deviceDocToTags(doc, driverId));
  }
  // Two portal rows for one physical device (e.g. reported under multiple
  // properties) must not create two identical tag groups.
  return dedupeById(incoming);
}

/**
 * Merge auto-generated NC tags into the full tag store list.
 * Preserves labels/graph settings on matching ids; keeps manual tags on the same driver.
 */
function mergeNextcenturyTagsIntoStore(existingTags, deviceCache, driverId, meta = {}) {
  if (!driverId) return { ok: false, error: 'driverId required' };
  const incoming = buildNextcenturyTags(deviceCache, driverId, meta);
  if (!incoming.length) {
    return { ok: false, error: 'No devices in NextCentury report — check property IDs and credentials' };
  }
  // Preserve user edits (label / graph / alarm) across a sync. Match by exact id
  // first, then fall back to the canonical group so a custom label survives even
  // when the stored tag used an older formatting variant of the same serial.
  const byId = new Map((existingTags || []).map((t) => [t.id, t]));
  const byGroup = new Map();
  for (const t of existingTags || []) {
    const key = ncGroupKey(t.id);
    if (!byGroup.has(key)) byGroup.set(key, t);
  }
  for (const tag of incoming) {
    const prev = byId.get(tag.id) || byGroup.get(ncGroupKey(tag.id));
    if (!prev) continue;
    if (prev.label) tag.label = prev.label;
    if (prev.graphEnabled != null) tag.graphEnabled = prev.graphEnabled;
    if (prev.alarmsEnabled != null) tag.alarmsEnabled = prev.alarmsEnabled;
  }
  // The sync is authoritative for NC device tags. Strip:
  //  - every auto NC_ tag on THIS driver (rebuilt canonically below), and
  //  - stale/variant auto NC_ tags on ANY other driver whose canonical group
  //    matches a device we're about to (re)create — otherwise a leftover
  //    "NC__FA_USAGE" (old formatting, or a deleted driver id) lingers next to
  //    the fresh "NC_FA_USAGE" and doubles the tag list.
  const incomingKeys = new Set(incoming.map((t) => ncGroupKey(t.id)));
  const stripped = (existingTags || []).filter((t) => {
    if (!isAutoNextcenturyTag(t)) return true;
    if (t.driverId === driverId) return false;
    return !incomingKeys.has(ncGroupKey(t.id));
  });
  // A single conflicting id (a manual tag, or a non-NC tag on another driver that
  // happens to reuse an incoming id) must NOT block every device from syncing.
  // Skip only the colliding ids and sync the rest so a correctly-reported device
  // set never silently vanishes because of one stray tag.
  const strippedKeys = new Set(stripped.map((t) => ncGroupKey(t.id)));
  const conflictIds = incoming.filter((t) => strippedKeys.has(ncGroupKey(t.id))).map((t) => t.id);
  const syncable = incoming.filter((t) => !strippedKeys.has(ncGroupKey(t.id)));
  if (!syncable.length) {
    return {
      ok: false,
      error: `All NextCentury tag ids conflict with tags on other drivers: ${conflictIds.join(', ')}`,
    };
  }
  const merged = dedupeByGroup([...stripped, ...syncable]);
  const { tags: wiredTags, wired: descriptionWired } = wireSemanticTagsFromDescriptions(
    merged,
    deviceCache,
    driverId,
  );
  return {
    ok: true,
    tags: wiredTags,
    count: syncable.length,
    deviceCount: deviceCache.size,
    descriptionWired,
    skippedConflicts: conflictIds,
    warning: conflictIds.length
      ? `Skipped ${conflictIds.length} conflicting tag id(s) (in use on another driver): ${conflictIds.join(', ')}`
      : undefined,
  };
}

module.exports = {
  buildNextcenturyTags,
  mergeNextcenturyTagsIntoStore,
  wireSemanticTagsFromDescriptions,
  normalizeDescriptionTagId,
  inferFieldForSemanticTag,
  isAutoNextcenturyTag,
  isElectricMeter,
  tagIdFor,
  fieldsForDevice,
  sanitizeDeviceId,
  dedupeById,
  dedupeByGroup,
  ncGroupKey,
};
