'use strict';

const { parseProgram, validateProgram, collectProgramTagRefs } = require('../engine/parser');
const { astToJson } = require('../engine/astJson');

function inferTagType(id) {
  if (/^H\d+$/i.test(id)) return 'INT';
  if (/^I\d+_RAW$/i.test(id)) return 'INT';
  if (/^I\d+$/i.test(id)) return 'BOOL';
  if (/^R\d+$/i.test(id) || /^Q\d+$/i.test(id)) return 'BOOL';
  if (/^PID/i.test(id)) return 'PID';
  if (/^AVG/i.test(id)) return 'AVG';
  if (/^FLOW/i.test(id)) return 'FLOW';
  if (/^TMR/i.test(id)) return 'TIMER';
  if (/^CTR/i.test(id)) return 'COUNTER';
  if (/^VPR/i.test(id)) return 'REAL';
  if (/^VPI/i.test(id)) return 'INT';
  if (/^VPB/i.test(id)) return 'BOOL';
  if (/^OS\d+$/i.test(id)) return 'BOOL';
  return 'BOOL';
}

function inferTagRole(id, type) {
  if (/^I\d+$/i.test(id) || /^I\d+_RAW$/i.test(id)) return 'input';
  if (/^R\d+$/i.test(id) || /^Q\d+$/i.test(id)) return 'output';
  if (type === 'TIMER' || type === 'COUNTER' || type === 'PID' || type === 'AVG' || type === 'FLOW') return 'memory';
  return 'memory';
}

function defaultMetaForId(id, driverId) {
  const type = inferTagType(id);
  const meta = {
    id,
    type,
    role: inferTagRole(id, type),
    value: type === 'BOOL' ? false : 0,
  };
  if (driverId) meta.driverId = driverId;
  if (type === 'INT' && /^H1$/i.test(id)) meta.value = 512;
  if (type === 'PID') {
    meta.preset = 512;
    meta.mode = 'PI';
    meta.kp = 0.5;
    meta.ki = 0.1;
    meta.kd = 0;
    meta.outMin = 0;
    meta.outMax = 1023;
  }
  if (type === 'AVG') {
    meta.preset = 8;
    meta.mode = 'MOV';
  }
  if (type === 'TIMER') {
    meta.preset = 1000;
    meta.mode = 'TON';
  }
  if (type === 'COUNTER') {
    meta.preset = 10;
    meta.mode = 'CTU';
  }
  if (type === 'FLOW') {
    meta.preset = 100;
    meta.mode = 'GPM';
  }
  if (id === 'TMR1') {
    meta.preset = 60000;
    meta.mode = 'TON';
  }
  return meta;
}

function tagMetaForDevice(tag) {
  const out = {
    id: tag.id,
    type: tag.type,
    role: tag.role,
    mode: tag.mode,
    preset: tag.preset,
    kp: tag.kp,
    ki: tag.ki,
    kd: tag.kd,
    outMin: tag.outMin,
    outMax: tag.outMax,
    value: tag.value,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

/** Build put_program body for Opta ST firmware (HTTP or MQTT fleet cmd). */
function buildOptaProgramBody(source, tagStore, driverId) {
  const storeTags = tagStore.list();
  const storeById = new Map(storeTags.map((t) => [t.id, t]));
  const { ast, errors: parseErrs } = parseProgram(source);
  if (parseErrs.length) return { ok: false, errors: parseErrs };

  const programRefs = ast ? collectProgramTagRefs(ast) : [];
  const tagIds = [...new Set([...storeTags.map((t) => t.id), ...programRefs])].sort();

  const valErrs = validateProgram(ast, tagIds);
  if (valErrs.length) return { ok: false, errors: valErrs };

  const tags = tagIds.map((id) => {
    const existing = storeById.get(id);
    if (existing && (!driverId || existing.driverId === driverId || !existing.driverId)) {
      return tagMetaForDevice(existing);
    }
    return defaultMetaForId(id, driverId);
  });

  return {
    ok: true,
    body: {
      source,
      ast: astToJson(ast),
      tagIds,
      tags,
    },
  };
}

module.exports = {
  buildOptaProgramBody,
  tagMetaForDevice,
  inferTagType,
  defaultMetaForId,
};
