'use strict';



const persistence = require('../persistence');

const { registry } = require('../parc/deviceRegistry');

const { isParcRegistryNoiseId } = require('../devices/bulkAddParcOpta');



const REMOTE_OPTA_TYPES = new Set(['mqtt_parc', 'opta_remote']);



function listLiveOptaDevices() {

  return registry.listDevices().filter(

    (d) => !d.stale && String(d.platform || '').includes('arduino-opta'),

  );

}



function liveDeviceHint(deviceId) {

  const live = listLiveOptaDevices();

  if (!live.length) {

    return 'No Opta devices reporting on MQTT — enable MQTT Parc hub and check Opta Ethernet';

  }

  const ids = live.map((d) => d.deviceId).join(', ');

  if (live.length === 1 && deviceId !== live[0].deviceId) {

    return `Live Opta is "${live[0].deviceId}" but tag driver targets "${deviceId}" — Drivers → Replace hardware or set tag driverId to ${live[0].deviceId}`;

  }

  return `Reporting Opta device(s): ${ids}`;

}



function listEnabledRemoteOptaConfigs(driverManager) {

  return (driverManager?.configs || []).filter(

    (c) => REMOTE_OPTA_TYPES.has(c.type) && c.enabled !== false,

  );

}



function registryDeviceLive(deviceId) {

  const dev = deviceId ? registry.getDevice(deviceId) : null;

  return dev && !dev.stale ? dev : null;

}



function scoreForceDriver(cfg) {

  let score = 0;

  const deviceId = String(cfg.deviceId || cfg.id || '').trim();

  const dev = registryDeviceLive(deviceId);

  if (dev) score += 20;

  if (cfg.ateccSerial) score += 3;

  if (deviceId === 'opta_st_01' || cfg.id === 'opta_st_01') score -= 3;

  if (isParcRegistryNoiseId(cfg.id) || isParcRegistryNoiseId(deviceId)) score -= 5;

  return score;

}



function rankLiveRemoteOptaConfigs(driverManager) {

  return listEnabledRemoteOptaConfigs(driverManager)

    .filter((c) => registryDeviceLive(String(c.deviceId || c.id || '').trim()))

    .sort((a, b) => scoreForceDriver(b) - scoreForceDriver(a));

}



/**

 * Resolve driver config when tag.driverId is missing, stale template, or offline.

 * @returns {{ cfg: object, driverId: string, redirected: boolean }}

 */

function resolveForceDriverConfig(driverManager, tag) {

  const requestedId = String(tag?.driverId || '').trim();

  if (!requestedId) {

    throw new Error(`Tag ${tag?.id || '?'}: driver id required`);

  }



  const cfg = driverManager.configs?.find((c) => c.id === requestedId);

  const primaryDevId = cfg

    ? String(cfg.deviceId || cfg.id || '').trim()

    : requestedId;

  const cfgUsable = cfg

    && cfg.enabled !== false

    && REMOTE_OPTA_TYPES.has(cfg.type)

    && registryDeviceLive(primaryDevId);



  if (cfgUsable) {

    return { cfg, driverId: cfg.id, redirected: false };

  }



  const candidates = listEnabledRemoteOptaConfigs(driverManager);

  const liveConfigs = rankLiveRemoteOptaConfigs(driverManager);



  const byPosition = candidates.find((c) => c.id === requestedId);

  if (byPosition && registryDeviceLive(String(byPosition.deviceId || byPosition.id || '').trim())) {

    if (cfg?.id !== byPosition.id) {

      console.warn(

        `[force-remote] tag ${tag.id} driver "${requestedId}" offline — using position ${byPosition.id}`,

      );

    }

    return { cfg: byPosition, driverId: byPosition.id, redirected: cfg?.id !== byPosition.id };

  }



  const sn = String(cfg?.ateccSerial || '').trim();

  if (sn) {

    for (const alt of candidates) {

      const altSn = String(alt.ateccSerial || '').trim();

      if (!altSn || altSn !== sn) continue;

      const did = String(alt.deviceId || alt.id || '').trim();

      if (registryDeviceLive(did)) {

        console.warn(

          `[force-remote] tag ${tag.id} driver "${requestedId}" — using ${alt.id} (ATECC ${sn})`,

        );

        return { cfg: alt, driverId: alt.id, redirected: true };

      }

    }

    for (const d of registry.listDevices()) {

      const devSn = String(d.ateccSerial || d.meta?.ateccSerial || '').trim();

      if (!devSn || devSn !== sn || d.stale) continue;

      const match = candidates.find((c) => String(c.deviceId || c.id || '').trim() === d.deviceId);

      if (match) {

        console.warn(

          `[force-remote] tag ${tag.id} driver "${requestedId}" — using ${match.id} (registry ATECC ${sn})`,

        );

        return { cfg: match, driverId: match.id, redirected: true };

      }

    }

  }



  if (liveConfigs.length === 1) {

    const pick = liveConfigs[0];

    console.warn(

      `[force-remote] tag ${tag.id} driver "${requestedId}" missing/stale — using ${pick.id}`,

    );

    return { cfg: pick, driverId: pick.id, redirected: true };

  }



  if (liveConfigs.length > 1 && (isParcRegistryNoiseId(requestedId) || !cfg)) {

    const pick = liveConfigs[0];

    console.warn(

      `[force-remote] tag ${tag.id} template driver "${requestedId}" — using ${pick.id}`,

    );

    return { cfg: pick, driverId: pick.id, redirected: true };

  }



  const live = listLiveOptaDevices();

  if (live.length === 1) {

    const match = candidates.find(

      (c) => String(c.deviceId || c.id || '').trim() === live[0].deviceId,

    );

    if (match) {

      console.warn(

        `[force-remote] tag ${tag.id} driver "${requestedId}" — using sole live Opta via ${match.id}`,

      );

      return { cfg: match, driverId: match.id, redirected: true };

    }

  }



  if (!cfg) {

    throw new Error(`Tag ${tag.id}: driver "${requestedId}" not found — ${liveDeviceHint(requestedId)}`);

  }

  return { cfg, driverId: cfg.id, redirected: false };

}



/**

 * Resolve MQTT deviceId for force commands. Throws when the target cannot be reached.

 * @param {object} cfg driver config

 * @param {object} [driverManager]

 */

function resolveForceDeviceId(cfg, driverManager) {

  const primary = String(cfg.deviceId || cfg.id || '').trim();

  if (!primary) {

    throw new Error(`Driver "${cfg.id}" has no deviceId`);

  }

  const primaryDev = registry.getDevice(primary);

  if (primaryDev && !primaryDev.stale) return primary;



  const sn = String(cfg.ateccSerial || '').trim();

  if (sn) {

    for (const d of registry.listDevices()) {

      const devSn = String(d.ateccSerial || d.meta?.ateccSerial || '').trim();

      if (devSn && devSn === sn && !d.stale) return d.deviceId;

    }

  }



  if (driverManager?.configs) {

    for (const alt of driverManager.configs) {

      if (!REMOTE_OPTA_TYPES.has(alt.type) || alt.enabled === false || alt.id === cfg.id) continue;

      const did = String(alt.deviceId || alt.id || '').trim();

      if (!did || did === primary) continue;

      const altSn = String(alt.ateccSerial || '').trim();

      if (sn && altSn && altSn === sn) {

        const altDev = registry.getDevice(did);

        if (altDev && !altDev.stale) return did;

      }

    }

    for (const alt of driverManager.configs) {

      if (!REMOTE_OPTA_TYPES.has(alt.type) || alt.enabled === false || alt.id === cfg.id) continue;

      const did = String(alt.deviceId || alt.id || '').trim();

      if (!did || did === primary) continue;

      const altDev = registry.getDevice(did);

      if (altDev && !altDev.stale) {

        console.warn(

          `[force-remote] driver ${cfg.id} (${primary}) offline — using ${alt.id} (${did})`,

        );

        return did;

      }

    }

  }



  const live = listLiveOptaDevices();

  if (live.length === 1 && primary !== live[0].deviceId) {

    console.warn(

      `[force-remote] driver ${cfg.id} (${primary}) offline — using sole live Opta ${live[0].deviceId}`,

    );

    return live[0].deviceId;

  }



  throw new Error(`Opta MQTT device "${primary}" not reachable — ${liveDeviceHint(primary)}`);

}



async function ensureOptaDriverInstance(driverManager, driverId) {

  let drv = driverManager.instances.get(driverId);

  if (drv) return drv;

  try {

    await driverManager.connectDriver(driverId);

  } catch {

    /* runtime_status may fail while telemetry is live; instance may still exist */

  }

  drv = driverManager.instances.get(driverId);

  if (drv) return drv;

  await driverManager.rebuild();

  return driverManager.instances.get(driverId);

}



/**

 * Mirror tag force/clear to Opta over MQTT. Works with PC runtime stopped; does not require

 * remote ST execution mode (commissioning forces must reach hardware).

 * @param {object} [tagStore] when provided, stale tag.driverId is rewritten after redirect

 */

async function pushRemoteTagForce(driverManager, scanEngine, tag, tagStore) {

  if (!tag?.driverId) return { skipped: true, reason: 'local tag' };



  const { cfg, driverId, redirected } = resolveForceDriverConfig(driverManager, tag);

  if (!REMOTE_OPTA_TYPES.has(cfg.type)) {

    return { skipped: true, reason: 'non-opta driver' };

  }



  const { ensureMqttHubConnected } = require('../parc/mqttParcBootstrap');

  const hubReady = await ensureMqttHubConnected({ persist: false });

  if (!hubReady.connected) {

    throw new Error(hubReady.error || 'MQTT Parc hub not connected');

  }



  const deviceId = resolveForceDeviceId(cfg, driverManager);



  const drv = await ensureOptaDriverInstance(driverManager, driverId);

  if (!drv?.syncTagForce) {

    throw new Error(`Driver "${driverId}" does not support remote force`);

  }



  const settings = persistence.readJson('settings.json', {});

  if (scanEngine && scanEngine.remoteExecution !== (settings.remoteExecution === true)) {

    scanEngine.loadSettings?.();

  }

  const connectCfg = typeof driverManager._connectCfg === 'function'

    ? driverManager._connectCfg(cfg)

    : cfg;

  drv.cfg = { ...drv.cfg, ...connectCfg };



  await drv.syncTagForce(tag, { deviceId });



  if (redirected && tagStore && driverId !== tag.driverId) {

    tagStore.upsert({ ...tagStore.get(tag.id) || tag, driverId });

  }



  console.log(

    `[force-remote] ${tag.id} → ${deviceId} via ${driverId} (${tag.forceInput || tag.forceOutput ? 'set' : 'clear'})`,

  );

  return { ok: true, deviceId, driverId, redirected };

}



module.exports = {

  pushRemoteTagForce,

  resolveForceDeviceId,

  resolveForceDriverConfig,

  liveDeviceHint,

};


