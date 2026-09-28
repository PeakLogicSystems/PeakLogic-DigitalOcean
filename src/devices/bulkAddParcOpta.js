'use strict';

const { normalizeDeviceId } = require('../parc/deviceRegistry');
const {
  normalizePositionId,
  suggestPositionId,
  nextAutoPositionId,
  isSnBasedPositionId,
} = require('../parc/positionId');

/** Test/sim IDs that land in parc.json from unit tests or debug publishers — not field Optas. */
function isParcRegistryNoiseId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return true;
  return /^(test|dbg|rec|off)[-_]/i.test(id)
    || /^opta_(bulk|sync|wait|remote|force|ut|field)_/i.test(id)
    || /^opta_st_\d+$/i.test(id)
    || /^mv_test_/i.test(id);
}

/** Remove mqtt_parc/opta_remote drivers whose deviceId is registry noise (test/debug/template IDs). */
function stripParcNoiseDrivers(drivers) {
  const list = Array.isArray(drivers) ? drivers : [];
  const removed = [];
  const kept = list.filter((d) => {
    if (d.type !== 'mqtt_parc' && d.type !== 'opta_remote') return true;
    const deviceId = String(d.deviceId || d.id || '').trim();
    if (isParcRegistryNoiseId(deviceId)) {
      removed.push(deviceId);
      return false;
    }
    return true;
  });
  return { drivers: kept, changed: removed.length > 0, removed };
}

/** Drop noise device entries from the Parc registry store (parc.json). */
function pruneParcRegistryNoise(registry) {
  const removed = [];
  for (const dev of registry.listDevices()) {
    const deviceId = dev.deviceId;
    if (!deviceId || !isParcRegistryNoiseId(deviceId)) continue;
    if (typeof registry.removeDevice === 'function' && registry.removeDevice(deviceId)) {
      removed.push(deviceId);
    }
  }
  return { removed };
}

function listRegistryDeviceIds(body, registry) {
  let ids = registry.listDevices().map((d) => d.deviceId);
  if (body?.includeRegistryNoise !== true) {
    ids = ids.filter((id) => !isParcRegistryNoiseId(id));
    if (process.env.PEAKLOGIC_DEPLOYMENT === 'cloud') {
      const { isFieldParcDeviceId } = require('../parc/optaSerial');
      ids = ids.filter((id) => isFieldParcDeviceId(id));
    }
  }
  const prefix = String(body?.registryPrefix || '').trim();
  if (prefix) {
    ids = ids.filter((id) => id.startsWith(prefix));
  }
  return ids;
}

function parseDeviceIds(body, registry) {
  if (body?.fromRegistry) {
    return listRegistryDeviceIds(body, registry);
  }
  if (Array.isArray(body?.deviceIds) && body.deviceIds.length) {
    return body.deviceIds.map((s) => String(s).trim()).filter(Boolean);
  }
  if (body?.useRange !== true) {
    throw Object.assign(
      new Error('Provide deviceIds, set useRange with count, or fromRegistry'),
      { status: 400 },
    );
  }
  const prefix = String(body?.prefix ?? 'opta_st_');
  const start = Number(body?.start ?? 1);
  const count = Number(body?.count ?? 1);
  const pad = Number(body?.pad ?? 2);
  if (!Number.isFinite(start) || !Number.isFinite(count) || count < 1) {
    throw Object.assign(new Error('Invalid start/count for range'), { status: 400 });
  }
  const ids = [];
  for (let i = 0; i < count; i++) {
    const n = start + i;
    const suffix = pad > 0 ? String(n).padStart(pad, '0') : String(n);
    ids.push(`${prefix}${suffix}`);
  }
  return ids;
}

function shouldUsePositionIds(body, deviceId) {
  if (body?.usePositionIds === false) return false;
  if (body?.usePositionIds === true) return true;
  if (body?.useRange === true) return false;
  if (body?.fromRegistry === true) return true;
  const { isAteccDeviceId } = require('../parc/optaSerial');
  return isAteccDeviceId(deviceId);
}

function resolvePositionId(deviceId, body, registryDev, index, existingPositionIds, deviceCount) {
  const positions = body?.positions;
  if (positions && typeof positions === 'object' && positions[deviceId]) {
    return normalizePositionId(positions[deviceId]);
  }
  const count = Number.isFinite(deviceCount) ? deviceCount : (
    Array.isArray(body?.deviceIds) ? body.deviceIds.length : 0
  );
  if (body?.positionId && count === 1) {
    return normalizePositionId(body.positionId);
  }
  if (!shouldUsePositionIds(body, deviceId)) {
    return deviceId;
  }
  const suggested = suggestPositionId(registryDev, deviceId);
  if (suggested && !existingPositionIds.has(suggested)) {
    return normalizePositionId(suggested);
  }
  return nextAutoPositionId(
    body?.positionPrefix || 'io',
    (Number(body?.positionStart) || 1) + index,
    body?.positionPad ?? 0,
    existingPositionIds,
  );
}

function buildParcOptaDriver(deviceId, opts = {}, registryDev = null) {
  const positionId = opts.positionId || opts.driverId || deviceId;
  const drv = {
    id: positionId,
    type: 'mqtt_parc',
    enabled: opts.enabled !== false,
    deviceId,
    scanMs: opts.scanMs ?? 100,
    reportIntervalSec: opts.reportIntervalSec ?? 300,
  };
  const sn = registryDev?.ateccSerial || registryDev?.meta?.ateccSerial;
  if (sn) drv.ateccSerial = sn;
  if (opts.name) {
    drv.name = String(opts.name).trim();
  } else if (registryDev?.name && registryDev.name !== deviceId) {
    drv.name = String(registryDev.name).trim();
  }
  if (Array.isArray(opts.hardwareHistory)) drv.hardwareHistory = opts.hardwareHistory;
  return drv;
}

function registryDevMap(registry) {
  const map = new Map();
  for (const d of registry.listDevices()) {
    map.set(d.deviceId, d);
  }
  return map;
}

function parcDriverByPosition(drivers, positionId) {
  const id = normalizePositionId(positionId);
  return (drivers || []).find((d) => d.type === 'mqtt_parc' && d.id === id) || null;
}

function parcDriverByDeviceId(drivers, deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  return (drivers || []).find(
    (d) => (d.type === 'mqtt_parc' || d.type === 'opta_remote')
      && String(d.deviceId || '').trim() === id,
  ) || null;
}

function bulkAddParcOptaDrivers({ driverList, body, registry }) {
  const skipExisting = body?.skipExisting !== false;
  const rawIds = parseDeviceIds(body || {}, registry);
  const deviceIds = [];
  const errors = [];
  for (const raw of rawIds) {
    try {
      deviceIds.push(normalizeDeviceId(raw));
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }
  if (errors.length) {
    throw Object.assign(new Error(errors.join('; ')), { status: 400 });
  }
  if (!deviceIds.length) {
    const hint = body?.fromRegistry
      ? 'No Parc devices to add (registry empty, filtered test/debug IDs, or prefix mismatch)'
      : 'No device IDs to add';
    throw Object.assign(new Error(hint), { status: 400 });
  }

  let registryFiltered = [];
  if (body?.fromRegistry) {
    const all = registry.listDevices().map((d) => d.deviceId);
    const kept = new Set(deviceIds);
    registryFiltered = all.filter((id) => !kept.has(id));
  }

  const existingPositionIds = new Set((driverList || []).map((d) => d.id));
  const existingDeviceIds = new Set(
    (driverList || [])
      .map((d) => String(d.deviceId || '').trim())
      .filter(Boolean),
  );

  const added = [];
  const addedEntries = [];
  const skipped = [];
  const drivers = [...(driverList || [])];
  const devById = registryDevMap(registry);

  deviceIds.forEach((deviceId, index) => {
    let positionId;
    try {
      positionId = resolvePositionId(
        deviceId,
        body || {},
        devById.get(deviceId),
        index,
        existingPositionIds,
        deviceIds.length,
      );
    } catch (e) {
      errors.push(`${deviceId}: ${e.message || e}`);
      return;
    }
    if (skipExisting && (existingPositionIds.has(positionId) || existingDeviceIds.has(deviceId))) {
      skipped.push(positionId === deviceId ? deviceId : `${positionId} (${deviceId})`);
      return;
    }
    const drv = buildParcOptaDriver(deviceId, {
      ...(body || {}),
      positionId,
    }, devById.get(deviceId));
    drivers.push(drv);
    existingPositionIds.add(positionId);
    existingDeviceIds.add(deviceId);
    added.push(positionId);
    addedEntries.push({ positionId, deviceId });
  });

  if (errors.length) {
    throw Object.assign(new Error(errors.join('; ')), { status: 400 });
  }

  return {
    added,
    addedEntries,
    skipped,
    drivers,
    deviceIds,
    registryFiltered: [],
  };
}

/** Swap physical Opta at a fixed position — driver id and tags unchanged. */
function replaceParcOptaHardware({ driverList, positionId, newDeviceId, registry, note, swapType, vendor, model }) {
  const posId = normalizePositionId(positionId);
  const newDevId = normalizeDeviceId(newDeviceId);
  const list = Array.isArray(driverList) ? driverList : [];
  const idx = list.findIndex((d) => d.type === 'mqtt_parc' && d.id === posId);
  if (idx < 0) {
    throw Object.assign(new Error(`No mqtt_parc driver at position ${posId}`), { status: 404 });
  }

  const newDev = registry?.getDevice?.(newDevId);
  if (!newDev) {
    throw Object.assign(
      new Error(`No Parc report for ${newDevId} — connect replacement Opta to MQTT first`),
      { status: 404 },
    );
  }

  const old = list[idx];
  const prevDeviceId = String(old.deviceId || '').trim();
  if (prevDeviceId === newDevId) {
    throw Object.assign(new Error('Replacement device is already bound to this position'), { status: 400 });
  }
  const conflict = list.find(
    (d, i) => i !== idx && String(d.deviceId || '').trim() === newDevId,
  );
  if (conflict) {
    throw Object.assign(
      new Error(`Device ${newDevId} is already bound to position ${conflict.id}`),
      { status: 409 },
    );
  }

  const history = Array.isArray(old.hardwareHistory) ? [...old.hardwareHistory] : [];
  if (prevDeviceId) {
    history.push({
      deviceId: prevDeviceId,
      ateccSerial: old.ateccSerial || '',
      vendor: old.vendor || '',
      model: old.model || '',
      platform: old.platform || '',
      swapType: swapType || 'replacement',
      replacedAt: new Date().toISOString(),
      note: note ? String(note).trim() : '',
    });
  }

  const sn = newDev.ateccSerial || newDev.meta?.ateccSerial || '';
  const { profileFromRegistryDev } = require('../hardware/deviceProfile');
  const incomingProfile = profileFromRegistryDev(newDev, old, { vendor, model });
  const updated = {
    ...old,
    id: posId,
    deviceId: newDevId,
    hardwareHistory: history,
    vendor: incomingProfile.vendor || old.vendor,
    model: incomingProfile.model || old.model,
    platform: incomingProfile.platform || old.platform,
  };
  if (sn) updated.ateccSerial = sn;
  else delete updated.ateccSerial;

  const drivers = [...list];
  drivers[idx] = updated;
  return {
    drivers,
    positionId: posId,
    previousDeviceId: prevDeviceId,
    newDeviceId: newDevId,
  };
}

/** Rename position id and re-point tags — for migrating SN-based drivers. */
function renameParcOptaPosition({ driverList, tagList, oldPositionId, newPositionId }) {
  const oldId = normalizePositionId(oldPositionId);
  const newId = normalizePositionId(newPositionId);
  if (oldId === newId) {
    throw Object.assign(new Error('New position ID must differ'), { status: 400 });
  }
  const list = Array.isArray(driverList) ? driverList : [];
  const idx = list.findIndex((d) => d.type === 'mqtt_parc' && d.id === oldId);
  if (idx < 0) {
    throw Object.assign(new Error(`No mqtt_parc driver at position ${oldId}`), { status: 404 });
  }
  if (list.some((d) => d.id === newId)) {
    throw Object.assign(new Error(`Position ${newId} already in use`), { status: 409 });
  }

  const drivers = list.map((d, i) => (i === idx ? { ...d, id: newId } : d));
  const tags = (tagList || []).map((t) => (
    t.driverId === oldId ? { ...t, driverId: newId } : t
  ));
  return { drivers, tags, oldPositionId: oldId, newPositionId: newId };
}

/** Re-create mqtt_parc drivers for Parc registry devices missing from drivers.json (e.g. after workspace reload). */
function reconcileMqttParcDriversFromRegistry(drivers, registry) {
  const list = Array.isArray(drivers) ? drivers : [];
  const existingPositionIds = new Set(list.map((d) => d.id));
  const existingDeviceIds = new Set(
    list
      .filter((d) => d.type === 'mqtt_parc' || d.type === 'opta_remote')
      .map((d) => String(d.deviceId || d.id).trim())
      .filter(Boolean),
  );
  const next = [...list];
  const added = [];
  let index = 0;
  for (const dev of registry.listDevices()) {
    const deviceId = dev.deviceId;
    if (!deviceId || isParcRegistryNoiseId(deviceId)) continue;
    if (existingDeviceIds.has(deviceId)) continue;
    const positionId = resolvePositionId(deviceId, { usePositionIds: true }, dev, index, existingPositionIds);
    index += 1;
    if (existingPositionIds.has(positionId)) continue;
    next.push(buildParcOptaDriver(deviceId, { positionId }, dev));
    existingPositionIds.add(positionId);
    existingDeviceIds.add(deviceId);
    added.push(positionId);
  }
  return { drivers: next, changed: added.length > 0, added };
}

module.exports = {
  isParcRegistryNoiseId,
  stripParcNoiseDrivers,
  pruneParcRegistryNoise,
  listRegistryDeviceIds,
  parseDeviceIds,
  buildParcOptaDriver,
  registryDevMap,
  resolvePositionId,
  parcDriverByPosition,
  parcDriverByDeviceId,
  bulkAddParcOptaDrivers,
  replaceParcOptaHardware,
  renameParcOptaPosition,
  reconcileMqttParcDriversFromRegistry,
  isSnBasedPositionId,
};
