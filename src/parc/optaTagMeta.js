'use strict';

const { applyDefaultLabel } = require('../tags/tagLabels');
const { isGlobalTagMeta, globalBaseType, tagMetaWithGlobal } = require('./globalTagMeta');

function inferTagType(id) {
  if (/^X\d+_IRAW\d+$/i.test(id)) return 'INT';
  if (/^X\d+_I\d+$/i.test(id)) return 'BOOL';
  if (/^X\d+_R\d+$/i.test(id)) return 'BOOL';
  if (/^X\d+_AI\d+$/i.test(id)) return 'REAL';
  if (/^X\d+_PWM\d+$/i.test(id)) return 'INT';
  if (/^H\d+$/i.test(id)) return 'INT';
  if (/^I\d+_RAW$/i.test(id)) return 'INT';
  if (/^I\d+$/i.test(id)) return 'BOOL';
  if (/^R\d+$/i.test(id) || /^Q\d+$/i.test(id)) return 'BOOL';
  if (/^PID/i.test(id)) return 'PID';
  if (/^AVG/i.test(id)) return 'AVG';
  if (/^FLOW/i.test(id)) return 'FLOW';
  if (/^ALT/i.test(id)) return 'ALT';
  if (/^TMR/i.test(id)) return 'TIMER';
  if (/^CTR/i.test(id)) return 'COUNTER';
  if (/^VPR/i.test(id)) return 'REAL';
  if (/^VPI/i.test(id)) return 'INT';
  if (/^MOTOR\d+_(HOA|STA)$/i.test(id)) return 'INT';
  if (/^MOTOR\d+_HRS$/i.test(id)) return 'REAL';
  if (/^MOTOR\d+_STARTS$/i.test(id)) return 'INT';
  if (/^MOTOR\d+_CNTR$/i.test(id)) return 'COUNTER';
  if (/^MOTOR\d+_CTR$/i.test(id)) return 'COUNTER';
  if (/^TPO\d+_TMR_/i.test(id)) return 'TIMER';
  if (/^TPO\d+_(STA|TOD|TOD_STEP|START|END)$/i.test(id)) return 'INT';
  if (/^TPO/i.test(id)) return 'BOOL';
  if (/^MOTOR/i.test(id)) return 'BOOL';
  if (/^VPB/i.test(id)) return 'BOOL';
  if (/^OS\d+$/i.test(id)) return 'BOOL';
  return 'BOOL';
}

function inferTagRole(id, type) {
  if (/^X\d+_I\d+$/i.test(id) || /^X\d+_IRAW\d+$/i.test(id) || /^X\d+_AI\d+$/i.test(id)) return 'input';
  if (/^X\d+_R\d+$/i.test(id) || /^X\d+_PWM\d+$/i.test(id)) return 'output';
  if (/^I\d+$/i.test(id) || /^I\d+_RAW$/i.test(id)) return 'input';
  if (/^R\d+$/i.test(id) || /^Q\d+$/i.test(id)) return 'output';
  if (type === 'TIMER' || type === 'COUNTER' || type === 'PID' || type === 'AVG' || type === 'FLOW' || type === 'ALT') return 'memory';
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
  if (type === 'ALT') {
    meta.preset = 2;
    meta.mode = 'ALT2';
  }
  if (id === 'TMR1') {
    meta.preset = 60000;
    meta.mode = 'TON';
  }
  return applyDefaultLabel(meta);
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

/** Minimal tag row for remote deploy — keeps tuning fields only. */
function slimTagMetaForDeploy(tag, id, driverId) {
  const src = tag || defaultMetaForId(id, driverId);
  const normalized = tagMetaWithGlobal(src);
  const type = normalized?.type || inferTagType(id);
  const meta = { id, type };
  if (isGlobalTagMeta(src)) meta.global = true;
  if (['PID', 'AVG', 'TIMER', 'COUNTER', 'FLOW', 'ALT'].includes(type)) {
    if (src.preset != null) meta.preset = src.preset;
    if (src.mode) meta.mode = src.mode;
  }
  if (type === 'PID') {
    for (const k of ['kp', 'ki', 'kd', 'outMin', 'outMax']) {
      if (src[k] != null) meta[k] = src[k];
    }
  }
  return meta;
}

module.exports = {
  inferTagType,
  inferTagRole,
  defaultMetaForId,
  tagMetaForDevice,
  slimTagMetaForDeploy,
  isGlobalTagMeta,
  globalBaseType,
  tagMetaWithGlobal,
};
