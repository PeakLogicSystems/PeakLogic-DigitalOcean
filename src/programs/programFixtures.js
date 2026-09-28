'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR } = require('../config');
const { parseProgram, collectProgramTagRefs } = require('../engine/parser');
const { defaultMetaForId } = require('../parc/mqttOptaProgram');
const { applyDefaultLabel } = require('../tags/tagLabels');

const FIXTURE_DIR = path.join(ST_DIR, 'fixtures');

/** Per-program tag/driver bundle overrides (path under st/). */
const PROGRAM_FIXTURE_OVERRIDES = {
  'logic/21_all_st_features_memory.st': {
    tagsFile: 'tags.all_st_features.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/22_motor_hoa.st': {
    tagsFile: 'tags.motor_hoa.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/23_tpo_irrigation.st': {
    tagsFile: 'tags.tpo_irrigation.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/24_motor_tpo_combined.st': {
    tagsFile: 'tags.motor_tpo_combined.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/26_alternator_pumps.st': {
    tagsFile: 'tags.alternator_pumps.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/27_alternator_2pump.st': {
    tagsFile: 'tags.alternator_2pump.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/28_alternator_triplex.st': {
    tagsFile: 'tags.alternator_triplex.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/29_reversing_motor.st': {
    tagsFile: 'tags.reversing_motor.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/30_pool_controller.st': {
    tagsFile: 'tags.pool_controller.json',
    driversFile: 'drivers.pool_controller.json',
  },
  'logic/31_pool_lighting.st': {
    tagsFile: 'tags.pool_lighting.json',
    driversFile: 'drivers.pool_controller.json',
  },
  'logic/32_single_atu.st': {
    tagsFile: 'tags.single_atu.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/33_dual_atu.st': {
    tagsFile: 'tags.dual_atu.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/34_quad_atu.st': {
    tagsFile: 'tags.quad_atu.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/35_lift_simplex.st': {
    tagsFile: 'tags.lift_simplex.json',
    driversFile: 'drivers.logic.json',
  },
  'logic/36_duplex_lift_station.st': {
    tagsFile: 'tags.duplex_lift_station.json',
    driversFile: 'drivers.logic.json',
  },
  'opta/08_triplex_floats.st': {
    tagsFile: 'tags.opta_triplex.json',
    driversFile: 'drivers.opta.json',
  },
};

function readProgramSource(rel) {
  const fp = path.join(ST_DIR, rel);
  if (!fs.existsSync(fp)) return '';
  return fs.readFileSync(fp, 'utf8');
}

function driverIdForFixtures(drivers) {
  const list = Array.isArray(drivers) ? drivers : [];
  if (list.some((d) => d.type === 'mqtt_parc' && d.enabled !== false)) return 'opta_mqtt_st';
  if (list.some((d) => d.id === 'opta_eth' || d.type === 'opta_remote')) return 'opta_eth';
  if (list.some((d) => d.id === 'opta_rtu')) return 'opta_rtu';
  return null;
}

/** Keep only tags referenced by the program; add inferred meta for any missing ref. */
function resolveProgramTags(rel, baseTags, drivers = []) {
  const norm = String(rel || '').replace(/\\/g, '/');
  const source = readProgramSource(norm);
  if (!source) return baseTags;

  const { ast, errors } = parseProgram(source);
  if (!ast || errors.length) return baseTags;

  const refs = collectProgramTagRefs(ast);
  if (!refs.length) return baseTags;

  const driverId = driverIdForFixtures(drivers);
  const byId = new Map(baseTags.map((t) => [t.id, t]));
  const out = [];

  for (const id of refs) {
    const existing = byId.get(id);
    if (existing) {
      const row = applyDefaultLabel({ ...existing });
      if (driverId && norm.startsWith('opta/')) row.driverId = driverId;
      out.push(row);
    } else {
      out.push(defaultMetaForId(id, norm.startsWith('opta/') ? driverId : null));
    }
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** @returns {{ tagsFile: string, driversFile: string } | null} */
function fixtureFilesForProgram(rel, drivers = []) {
  const norm = String(rel || '').replace(/\\/g, '/');
  if (PROGRAM_FIXTURE_OVERRIDES[norm]) return PROGRAM_FIXTURE_OVERRIDES[norm];

  if (/waveshare/i.test(norm)) {
    return {
      tagsFile: 'tags.waveshare_rtu_8ch.json',
      driversFile: 'drivers.waveshare_rtu_8ch.json',
    };
  }
  if (norm.startsWith('opta/') || norm.startsWith('opta-mqtt/')) {
    const list = Array.isArray(drivers) ? drivers : [];
    const mqtt = list.some((d) => d.type === 'mqtt_parc' && d.enabled !== false);
    const eth = list.some((d) => d.id === 'opta_eth' || d.type === 'opta_remote');
    if (mqtt) {
      return { tagsFile: 'tags.opta_mqtt_st.json', driversFile: 'drivers.opta_mqtt_st.json' };
    }
    if (eth) {
      return { tagsFile: 'tags.opta_eth.json', driversFile: 'drivers.opta_eth.json' };
    }
    return { tagsFile: 'tags.opta.json', driversFile: 'drivers.opta.json' };
  }
  if (norm.startsWith('mqtt/')) {
    return { tagsFile: 'tags.mqtt.json', driversFile: 'drivers.mqtt.json' };
  }
  if (norm.startsWith('modbus/')) {
    return { tagsFile: 'tags.modbus.json', driversFile: 'drivers.modbus.json' };
  }
  if (norm.startsWith('logic/')) {
    return { tagsFile: 'tags.logic.json', driversFile: 'drivers.logic.json' };
  }
  return null;
}

function readFixtureJson(name) {
  const fp = path.join(FIXTURE_DIR, name);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

/** Load tags + drivers JSON for a program under st/ (test suites). */
function loadFixtureBundle(rel, drivers = []) {
  const spec = fixtureFilesForProgram(rel, drivers);
  if (!spec) return null;
  const baseTags = readFixtureJson(spec.tagsFile);
  if (!Array.isArray(baseTags)) return null;
  const tags = resolveProgramTags(rel, baseTags, drivers);
  const driversJson = readFixtureJson(spec.driversFile);
  return {
    tags,
    drivers: Array.isArray(driversJson) ? driversJson : [],
    tagsFile: spec.tagsFile,
    driversFile: spec.driversFile,
  };
}

module.exports = {
  fixtureFilesForProgram,
  loadFixtureBundle,
  resolveProgramTags,
  PROGRAM_FIXTURE_OVERRIDES,
};
