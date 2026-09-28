'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR, DEFAULT_MQTT_PARC_BROKER } = require('../config');
const { defaultBlankHmi } = require('../hmi/hmiConfig');
const { EST_FORMAT } = require('../project/estFile');
const { IOT_LINK_DEFAULT_PORTS, resolveSerialPorts } = require('./iotLinkPoolSeed');

const FIXTURE_DIR = path.join(ST_DIR, 'fixtures');
const PROJECT_ID = 'iot-link';

function readFixtureJson(name) {
  const fp = path.join(FIXTURE_DIR, name);
  if (!fs.existsSync(fp)) {
    throw new Error(`Missing fixture: ${name}`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function truthyEnv(env, key, fallback) {
  const v = env[key];
  if (v == null || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(v));
}

/**
 * Load generic IOT-LINK driver placeholders with Linux serial ports (all disabled by default).
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function loadIotLinkGenericDrivers(opts = {}) {
  const env = opts.env || process.env;
  const ports = resolveSerialPorts(env);
  const drivers = readFixtureJson('drivers.iot_link.json').map((d) => ({ ...d }));

  for (const d of drivers) {
    if (d.id === 'rs485_a') d.serialPort = ports.portA;
    if (d.id === 'rs485_b') d.serialPort = ports.portB;
    if (truthyEnv(env, 'PEAKLOGIC_RS485_ENABLE', true) && (d.id === 'rs485_a' || d.id === 'rs485_b')) {
      d.enabled = true;
    }
  }

  return drivers;
}

/** Generic appliance ships with no tags — integrator adds via Studio. */
function loadIotLinkGenericTags() {
  return [];
}

function loadIotLinkGenericSettings(opts = {}) {
  const env = opts.env || process.env;
  const ports = resolveSerialPorts(env);
  const base = readFixtureJson('settings.iot_link.json');
  const mqttEnabled = truthyEnv(env, 'PEAKLOGIC_MQTT_ENABLED', false);
  const rs485Enabled = truthyEnv(env, 'PEAKLOGIC_RS485_ENABLE', true);

  return {
    ...base,
    mqttParc: {
      ...(base.mqttParc || {}),
      enabled: mqttEnabled,
      brokerUrl: env.PEAKLOGIC_MQTT_BROKER || base.mqttParc?.brokerUrl || DEFAULT_MQTT_PARC_BROKER,
      username: env.MOSQUITTO_USER || base.mqttParc?.username || '',
      password: env.MOSQUITTO_PASS || base.mqttParc?.password || '',
    },
    hmi: defaultBlankHmi(),
    rs485: {
      portA: ports.portA,
      portB: ports.portB,
    },
    features: {
      poolController: false,
      pentairHeatPump: false,
      optaIo: false,
      modbusChemistryBus: false,
    },
  };
}

function buildWorkspaceEst(tags, drivers, settings) {
  return {
    format: EST_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    project: { name: PROJECT_ID },
    tags,
    drivers,
    program: '',
    activeProgram: '',
    settings,
  };
}

/**
 * Write generic IOT-LINK appliance config into PEAKLOGIC_DATA.
 * @param {{ writeJson: Function, flushConfig?: Function, readJson?: Function }} persistence
 * @param {{ force?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
async function seedIotLinkGenericConfig(persistence, opts = {}) {
  const env = opts.env || process.env;
  const existing = persistence.readJson('settings.json', {});
  const configured = existing.activeProgram || existing.project?.name === PROJECT_ID;
  if (!opts.force && configured) {
    return { seeded: false, reason: 'settings.json already configured' };
  }

  const tags = loadIotLinkGenericTags();
  const drivers = loadIotLinkGenericDrivers({ env });
  const settings = loadIotLinkGenericSettings({ env });

  persistence.writeJson('tags.json', tags);
  persistence.writeJson('drivers.json', drivers);
  persistence.writeJson('settings.json', settings);
  persistence.writeJson('workspace.est.json', buildWorkspaceEst(tags, drivers, settings));

  if (typeof persistence.flushConfig === 'function') {
    await persistence.flushConfig();
  }

  return {
    seeded: true,
    activeProgram: '',
    drivers: drivers.map((d) => ({ id: d.id, type: d.type, enabled: d.enabled, serialPort: d.serialPort })),
    tagCount: tags.length,
    rs485Ports: resolveSerialPorts(env),
  };
}

module.exports = {
  PROJECT_ID,
  IOT_LINK_DEFAULT_PORTS,
  loadIotLinkGenericDrivers,
  loadIotLinkGenericTags,
  loadIotLinkGenericSettings,
  seedIotLinkGenericConfig,
};
