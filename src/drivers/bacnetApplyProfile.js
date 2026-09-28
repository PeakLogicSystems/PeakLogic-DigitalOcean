'use strict';

const { discoverDevices, browseDeviceObjects } = require('./bacnetDiscovery');
const { getProfile } = require('./bacnetProfileStore');
const {
  buildTagsForFleet,
  previewProfileOnDevices,
  deviceMatchesProfile,
} = require('./bacnetDeviceBuilder');
const { mergeBacnetTagsIntoStore } = require('./bacnetTagSync');

async function browseDevicesForFleet(cfg, devices, maxObjects) {
  const browseByKey = new Map();
  const errors = [];
  for (const dev of devices) {
    const key = `${dev.host}|${dev.deviceInstance}`;
    try {
      const r = await browseDeviceObjects({
        ...cfg,
        host: dev.host,
        deviceInstance: dev.deviceInstance,
        maxObjects,
        includePresentValue: false,
      });
      browseByKey.set(key, r.points || []);
    } catch (e) {
      errors.push({
        host: dev.host,
        deviceInstance: dev.deviceInstance,
        error: e.message || String(e),
      });
      browseByKey.set(key, []);
    }
  }
  return { browseByKey, errors };
}

async function resolveTargetDevices(cfg, opts = {}) {
  let devices = Array.isArray(opts.devices) ? opts.devices.map((d) => ({
    host: String(d.host || '').trim(),
    deviceInstance: Number(d.deviceInstance),
    objectName: d.objectName || '',
    vendorId: d.vendorId,
    vendorName: d.vendorName || '',
  })).filter((d) => d.host && Number.isFinite(d.deviceInstance)) : [];

  if (opts.discover !== false && (opts.mode === 'discover' || !devices.length)) {
    const disc = await discoverDevices(cfg);
    devices = (disc.devices || []).map((d) => ({
      host: d.host,
      deviceInstance: d.deviceInstance,
      objectName: d.objectName || '',
      vendorId: d.vendorId,
      vendorName: d.vendorName || '',
    }));
  }

  if (opts.profileId) {
    const profile = getProfile(opts.profileId);
    if (profile) {
      devices = devices.filter((d) => deviceMatchesProfile(d, profile));
    }
  }

  return devices;
}

async function previewProfileApply(cfg, opts = {}) {
  const profile = getProfile(opts.profileId);
  if (!profile) throw new Error(`Profile not found: ${opts.profileId}`);
  const driverId = String(opts.driverId || '').trim();
  if (!driverId) throw new Error('driverId required');

  const devices = await resolveTargetDevices(cfg, opts);
  const { browseByKey, errors } = await browseDevicesForFleet(
    cfg,
    devices,
    opts.maxObjects,
  );
  const preview = previewProfileOnDevices(profile, devices, browseByKey, driverId);
  return {
    ok: true,
    profile,
    discoverCount: devices.length,
    browseErrors: errors,
    ...preview,
  };
}

async function applyProfileToFleet(cfg, opts = {}) {
  const profile = getProfile(opts.profileId);
  if (!profile) throw new Error(`Profile not found: ${opts.profileId}`);
  const driverId = String(opts.driverId || '').trim();
  if (!driverId) throw new Error('driverId required');

  const devices = await resolveTargetDevices(cfg, opts);
  if (!devices.length) {
    return { ok: true, added: 0, updated: 0, tagCount: 0, devices: [], message: 'No matching devices' };
  }

  const { browseByKey, errors } = await browseDevicesForFleet(
    cfg,
    devices,
    opts.maxObjects,
  );
  const built = buildTagsForFleet(profile, devices, browseByKey, driverId, {
    allowPartial: opts.allowPartial !== false,
    reassign: opts.reassign === true,
  });
  if (!built.ok) return built;

  return {
    ok: true,
    profileId: profile.id,
    driverId,
    added: built.tagCount,
    tagCount: built.tagCount,
    matchedDevices: built.matchedDevices,
    devices: built.devices,
    browseErrors: errors,
    points: built.tags,
    tags: built.tags,
  };
}

function mergeApplyIntoStore(tagStore, built, opts = {}) {
  const points = built.tags || built.points || [];
  const merged = mergeBacnetTagsIntoStore(tagStore.list(), points, built.driverId, {
    reassign: opts.reassign !== false,
    role: opts.role || 'input',
  });
  return merged;
}

module.exports = {
  browseDevicesForFleet,
  resolveTargetDevices,
  previewProfileApply,
  applyProfileToFleet,
  mergeApplyIntoStore,
};
