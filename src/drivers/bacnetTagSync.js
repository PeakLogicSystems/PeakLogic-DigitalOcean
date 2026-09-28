'use strict';

const { tagIdForPoint, suggestTagType } = require('./bacnetConstants');

function pointToTag(point, driverId, role = 'input') {
  const deviceInstance = Number(point.deviceInstance);
  const objectType = Number(point.objectType);
  const objectInstance = Number(point.objectInstance);
  const property = Number(point.property ?? 85);
  const host = String(point.host || '').trim();
  const id = point.tagId || tagIdForPoint(deviceInstance, objectType, objectInstance, property);
  const label = point.objectName
    || `${point.objectTypeLabel || 'obj'} ${objectInstance}`;
  return {
    id,
    label,
    type: point.tagType || point.suggestedTagType || suggestTagType(objectType),
    role,
    driverId,
    driverAddress: {
      host,
      deviceInstance,
      objectType: point.objectTypeLabel || objectType,
      objectInstance,
      property: point.propertyLabel || 'presentValue',
    },
  };
}

function mergeBacnetTagsIntoStore(existingTags, points, driverId, opts = {}) {
  if (!driverId) return { ok: false, error: 'driverId required' };
  if (!Array.isArray(points) || !points.length) {
    return { ok: false, error: 'points required' };
  }
  const incoming = points.map((p) => pointToTag(p, driverId, opts.role || 'input'));
  const incomingIds = new Set(incoming.map((t) => t.id));
  const conflicts = (existingTags || []).filter(
    (t) => incomingIds.has(t.id) && t.driverId !== driverId,
  );
  if (conflicts.length && opts.reassign !== true) {
    return {
      ok: false,
      error: `Tag id conflict (not on this driver): ${conflicts.map((t) => t.id).join(', ')}`,
      conflicts,
    };
  }
  const kept = (existingTags || []).filter(
    (t) => !incomingIds.has(t.id) || t.driverId === driverId,
  );
  const byId = new Map(kept.map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;
  for (const t of incoming) {
    const prev = byId.get(t.id);
    if (prev) {
      byId.set(t.id, {
        ...prev,
        label: t.label,
        type: t.type,
        role: t.role,
        driverId,
        driverAddress: t.driverAddress,
      });
      updated += 1;
    } else {
      byId.set(t.id, t);
      added += 1;
    }
  }
  return {
    ok: true,
    tags: [...byId.values()],
    added,
    updated,
    count: incoming.length,
  };
}

module.exports = { pointToTag, mergeBacnetTagsIntoStore };
