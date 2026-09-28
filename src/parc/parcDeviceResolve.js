'use strict';



const {

  resolveParcDeviceId,

  normalizeAteccSerialHex,

  legacyOptaDeviceIdFromAteccSerial,

} = require('./optaSerial');



function registryTagCount(dev) {

  return Array.isArray(dev?.tags) ? dev.tags.length : 0;

}



/** Collect registry device ids for one mqtt_parc driver (mv_ id, raw id, ATECC siblings). */

function registryCandidateIds(registry, cfg = {}) {

  const resolvedId = resolveParcDeviceId(cfg);

  const rawId = String(cfg.deviceId || cfg.id || '').trim();

  const serial = normalizeAteccSerialHex(cfg.ateccSerial || '');

  const ids = new Set();

  if (resolvedId) ids.add(resolvedId);

  if (rawId) ids.add(rawId);

  if (serial) {

    try {

      ids.add(legacyOptaDeviceIdFromAteccSerial(serial));

    } catch { /* invalid serial */ }

    for (const summary of registry.listDevices()) {

      const dev = registry.getDevice(summary.deviceId);

      const devSerial = normalizeAteccSerialHex(

        dev?.meta?.ateccSerial || dev?.ateccSerial || summary.ateccSerial || '',

      );

      if (devSerial === serial) ids.add(summary.deviceId);

    }

  }

  return { ids, resolvedId, rawId, serial };

}



/**

 * Locate Parc registry device for an mqtt_parc driver config.

 * When mv_* and legacy opta_* both exist, prefers the entry with more tags.

 * @returns {{ device: object|null, deviceId: string, resolvedId: string }}

 */

function findRegistryDeviceForDriver(registry, cfg = {}) {

  const { ids, resolvedId } = registryCandidateIds(registry, cfg);



  let device = null;

  let deviceId = '';

  let bestTags = -1;



  for (const id of ids) {

    const dev = registry.getDevice(id);

    if (!dev) continue;

    const n = registryTagCount(dev);

    const preferResolved = id === resolvedId && n === bestTags;

    if (n > bestTags || preferResolved) {

      device = dev;

      deviceId = id;

      bestTags = n;

    }

  }



  return { device, deviceId, resolvedId };

}



module.exports = {

  findRegistryDeviceForDriver,

  registryCandidateIds,

  registryTagCount,

};

