'use strict';

const {
  resolveObjectType,
  resolvePropertyId,
  objectTypeLabel,
  suggestTagType,
} = require('./bacnetConstants');
const { pointToTag } = require('./bacnetTagSync');

function slugId(input) {
  return String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'profile';
}

function interpolate(pattern, ctx) {
  return String(pattern || '').replace(/\{(\w+)\}/g, (_, key) => {
    const v = ctx[key];
    return v == null ? '' : String(v);
  });
}

function normalizeSlot(raw, index = 0) {
  const slot = raw && typeof raw === 'object' ? { ...raw } : {};
  const objectType = resolveObjectType(slot.objectType ?? slot.type);
  const match = slot.match && typeof slot.match === 'object' ? { ...slot.match } : {};
  if (!match.type) {
    if (match.pattern || slot.namePattern) {
      match.type = 'name';
      match.pattern = match.pattern || slot.namePattern;
    } else if (slot.objectInstance != null || match.objectInstance != null) {
      match.type = 'fixed';
      match.objectInstance = Number(match.objectInstance ?? slot.objectInstance);
    } else {
      match.type = 'fixed';
    }
  }
  return {
    slotId: String(slot.slotId || slot.id || `slot_${index + 1}`).trim(),
    label: String(slot.label || slot.slotId || `Point ${index + 1}`).trim(),
    tagId: String(slot.tagId || slot.slotId || `P${index + 1}`).trim(),
    objectType,
    objectTypeLabel: slot.objectTypeLabel || (objectType != null ? objectTypeLabel(objectType) : ''),
    role: slot.role === 'output' ? 'output' : 'input',
    tagType: slot.tagType || null,
    property: resolvePropertyId(slot.property ?? slot.propertyId ?? 'presentValue'),
    propertyLabel: slot.propertyLabel || 'presentValue',
    match,
    optional: slot.optional === true,
  };
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('profile object required');
  const id = slugId(raw.id || raw.label);
  const slots = (raw.slots || []).map((s, i) => normalizeSlot(s, i));
  if (!slots.length) throw new Error('profile requires at least one point slot');
  return {
    id,
    label: String(raw.label || id).trim(),
    description: String(raw.description || '').trim(),
    tagPrefixPattern: String(raw.tagPrefixPattern || '{profileId}_{deviceInstance}').trim(),
    deviceNamePattern: String(raw.deviceNamePattern || '').trim(),
    vendorId: raw.vendorId != null && Number.isFinite(Number(raw.vendorId)) ? Number(raw.vendorId) : null,
    slots,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function profileFromBrowsePoints(opts = {}) {
  const {
    id,
    label,
    description,
    tagPrefixPattern,
    deviceNamePattern,
    points,
    selectedSlotIds,
  } = opts;
  if (!Array.isArray(points) || !points.length) {
    throw new Error('points required to build profile from browse');
  }
  const selected = selectedSlotIds?.length
    ? new Set(selectedSlotIds.map(String))
    : null;
  const slots = [];
  points.forEach((p, i) => {
    const slotId = slugId(p.objectName || `${p.objectTypeLabel}_${p.objectInstance}`);
    if (selected && !selected.has(slotId) && !selected.has(String(i))) return;
    const otLabel = p.objectTypeLabel || objectTypeLabel(p.objectType);
    const useName = String(p.objectName || '').trim();
    slots.push(normalizeSlot({
      slotId,
      label: p.objectName || `${otLabel} ${p.objectInstance}`,
      tagId: slugId(p.tagId || p.objectName || `${otLabel}_${p.objectInstance}`).toUpperCase(),
      objectType: p.objectType ?? otLabel,
      objectTypeLabel: otLabel,
      role: 'input',
      tagType: p.tagType || p.suggestedTagType || suggestTagType(p.objectType),
      property: p.property ?? 85,
      match: useName
        ? { type: 'name', pattern: useName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
        : { type: 'fixed', objectInstance: Number(p.objectInstance) },
    }, i));
  });
  if (!slots.length) throw new Error('no points selected for profile');
  return normalizeProfile({
    id: id || slugId(label || `from_dev_${points[0]?.deviceInstance || 'sample'}`),
    label: label || `Device profile (dev ${points[0]?.deviceInstance ?? '?'})`,
    description: description || 'Captured from BACnet browse',
    tagPrefixPattern: tagPrefixPattern || '{profileId}_{deviceInstance}',
    deviceNamePattern,
    slots,
  });
}

function deviceMatchesProfile(device, profile) {
  if (profile.vendorId != null && Number(device.vendorId) !== profile.vendorId) return false;
  if (profile.deviceNamePattern) {
    try {
      const re = new RegExp(profile.deviceNamePattern, 'i');
      if (!re.test(String(device.objectName || ''))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function resolveSlotToPoint(slot, points) {
  const objectType = slot.objectType ?? resolveObjectType(slot.objectTypeLabel);
  const candidates = points.filter((p) => {
    const pType = p.objectType ?? resolveObjectType(p.objectTypeLabel);
    return objectType == null || pType === objectType;
  });
  if (!candidates.length) return null;

  const match = slot.match || {};
  if (match.type === 'fixed') {
    const inst = Number(match.objectInstance);
    if (Number.isFinite(inst)) {
      return candidates.find((p) => Number(p.objectInstance) === inst) || null;
    }
  }
  if (match.type === 'name' && match.pattern) {
    try {
      const re = new RegExp(match.pattern, 'i');
      const hit = candidates.find((p) => re.test(String(p.objectName || '')));
      if (hit) return hit;
    } catch {
      return null;
    }
  }
  if (match.type === 'first') {
    return candidates.sort((a, b) => Number(a.objectInstance) - Number(b.objectInstance))[0] || null;
  }
  return null;
}

function buildDeviceContext(profile, device) {
  const deviceInstance = Number(device.deviceInstance);
  const deviceLabel = slugId(device.objectName || `dev${deviceInstance}`).toUpperCase();
  return {
    profileId: profile.id,
    deviceInstance,
    deviceLabel,
    host: String(device.host || '').trim(),
    objectName: String(device.objectName || '').trim(),
    vendorName: String(device.vendorName || '').trim(),
  };
}

function buildTagsForDevice(profile, device, browsePoints, driverId, opts = {}) {
  const ctx = buildDeviceContext(profile, device);
  const prefix = interpolate(profile.tagPrefixPattern, ctx);
  const tags = [];
  const unresolved = [];

  for (const slot of profile.slots) {
    const point = resolveSlotToPoint(slot, browsePoints);
    if (!point) {
      if (!slot.optional) {
        unresolved.push({ slotId: slot.slotId, reason: 'no matching object on device' });
      }
      continue;
    }
    const tagCtx = {
      ...ctx,
      objectName: point.objectName || '',
      objectTypeLabel: point.objectTypeLabel || objectTypeLabel(point.objectType),
      objectInstance: point.objectInstance,
    };
    const tagId = `${prefix}_${interpolate(slot.tagId, tagCtx)}`.replace(/__+/g, '_');
    const label = interpolate(slot.label, tagCtx);
    const tag = pointToTag({
      ...point,
      host: device.host,
      deviceInstance: device.deviceInstance,
      tagId,
      objectName: label,
      tagType: slot.tagType || point.suggestedTagType,
      property: slot.property,
      propertyLabel: slot.propertyLabel,
    }, driverId, slot.role);
    tags.push(tag);
  }

  return {
    deviceInstance: ctx.deviceInstance,
    host: ctx.host,
    tagCount: tags.length,
    tags,
    unresolved,
    ok: unresolved.length === 0 || opts.allowPartial === true,
  };
}

function buildTagsForFleet(profile, devices, browseByKey, driverId, opts = {}) {
  const results = [];
  const allTags = [];
  const tagIds = new Set();

  for (const device of devices) {
    if (!deviceMatchesProfile(device, profile)) {
      results.push({
        deviceInstance: device.deviceInstance,
        host: device.host,
        skipped: true,
        reason: 'device filter',
        tagCount: 0,
        tags: [],
      });
      continue;
    }
    const key = `${device.host}|${device.deviceInstance}`;
    const browsePoints = browseByKey.get(key) || [];
    const built = buildTagsForDevice(profile, device, browsePoints, driverId, opts);
    const conflicts = built.tags.filter((t) => tagIds.has(t.id));
    if (conflicts.length && opts.reassign !== true) {
      return {
        ok: false,
        error: `Tag id conflict: ${conflicts.map((t) => t.id).join(', ')}`,
        conflicts,
        partial: results,
      };
    }
    for (const t of built.tags) tagIds.add(t.id);
    allTags.push(...built.tags);
    results.push({ ...built, skipped: false });
  }

  return {
    ok: true,
    profileId: profile.id,
    deviceCount: devices.length,
    matchedDevices: results.filter((r) => !r.skipped).length,
    tagCount: allTags.length,
    tags: allTags,
    devices: results,
  };
}

function previewProfileOnDevices(profile, devices, browseByKey, driverId) {
  return buildTagsForFleet(profile, devices, browseByKey, driverId, { allowPartial: true });
}

module.exports = {
  slugId,
  interpolate,
  normalizeSlot,
  normalizeProfile,
  profileFromBrowsePoints,
  deviceMatchesProfile,
  resolveSlotToPoint,
  buildTagsForDevice,
  buildTagsForFleet,
  previewProfileOnDevices,
};
