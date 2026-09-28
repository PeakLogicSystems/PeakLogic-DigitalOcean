'use strict';

const { MOTOR_TAG_LABELS } = require('../tags/tagLabels');

const MOTOR_TAG_DEFS = [
  { id: 'MOTOR1_HOA', label: MOTOR_TAG_LABELS.MOTOR1_HOA, type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'MOTOR1_STA', label: MOTOR_TAG_LABELS.MOTOR1_STA, type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'MOTOR1_START', label: MOTOR_TAG_LABELS.MOTOR1_START, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_STOP', label: MOTOR_TAG_LABELS.MOTOR1_STOP, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_RESET', label: MOTOR_TAG_LABELS.MOTOR1_RESET, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_OFFLINE', label: MOTOR_TAG_LABELS.MOTOR1_OFFLINE, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_RUN', label: MOTOR_TAG_LABELS.MOTOR1_RUN, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_HAND', label: MOTOR_TAG_LABELS.MOTOR1_HAND, type: 'BOOL', role: 'memory', value: false },
  { id: 'MOTOR1_HRS', label: MOTOR_TAG_LABELS.MOTOR1_HRS, type: 'REAL', role: 'memory', value: 0 },
  { id: 'MOTOR1_STARTS', label: MOTOR_TAG_LABELS.MOTOR1_STARTS, type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'MOTOR1_CNTR', label: MOTOR_TAG_LABELS.MOTOR1_CNTR, type: 'COUNTER', role: 'memory', value: 0, preset: 999999, mode: 'CTU' },
  { id: 'VPB1', label: MOTOR_TAG_LABELS.VPB1, type: 'BOOL', role: 'memory', value: false },
];

function isMotorProgramPath(rel) {
  return /motor_hoa|motor_tpo_combined/i.test(String(rel || ''));
}

/** If a legacy CTR counter was created instead of MOTOR1_CNTR, migrate it. */
function migrateMotorCounterAlias(tagStore) {
  if (tagStore.get('MOTOR1_CNTR')) return null;
  const ctr = tagStore.get('CTR');
  if (!ctr || ctr.type !== 'COUNTER') return null;
  const { id, ...rest } = ctr;
  tagStore.remove('CTR');
  tagStore.upsert({
    ...rest,
    id: 'MOTOR1_CNTR',
    label: rest.label || MOTOR_TAG_LABELS.MOTOR1_CNTR,
  });
  return 'MOTOR1_CNTR';
}

/** Add MOTOR1_* memory tags if missing; backfill labels when empty. */
function ensureMotorTags(tagStore) {
  migrateMotorCounterAlias(tagStore);
  const added = [];
  const labeled = [];
  for (const def of MOTOR_TAG_DEFS) {
    const existing = tagStore.get(def.id);
    if (existing) {
      if (!String(existing.label || '').trim() && def.label) {
        tagStore.upsert({ ...existing, label: def.label });
        labeled.push(def.id);
      }
      continue;
    }
    tagStore.upsert(def);
    added.push(def.id);
  }
  return { added, labeled, count: tagStore.count() };
}

module.exports = {
  MOTOR_TAG_DEFS,
  isMotorProgramPath,
  ensureMotorTags,
};
