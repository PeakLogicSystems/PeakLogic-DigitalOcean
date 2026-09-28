'use strict';

const { applyDefaultLabel } = require('../tags/tagLabels');

const TPO_TAG_DEFS = [
  { id: 'TPO1_EN', label: 'TPO-1 enable', type: 'BOOL', role: 'memory', value: false },
  { id: 'TPO1_OFFLINE', label: 'TPO-1 offline latch', type: 'BOOL', role: 'memory', value: false },
  { id: 'TPO1_24HR', label: 'TPO-1 24 hour schedule', type: 'BOOL', role: 'memory', value: true },
  { id: 'TPO1_OUT', label: 'TPO-1 output', type: 'BOOL', role: 'memory', value: false },
  { id: 'TPO1_GAP', label: 'TPO-1 wait between applications', type: 'BOOL', role: 'memory', value: false },
  { id: 'TPO1_STA', label: 'TPO-1 status', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'TPO1_TOD', label: 'TPO-1 time of day (min)', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'TPO1_TOD_STEP', label: 'TPO-1 clock step (min/scan)', type: 'INT', role: 'memory', value: 1, wordWidth: 16 },
  { id: 'TPO1_START', label: 'TPO-1 window start (min)', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
  { id: 'TPO1_END', label: 'TPO-1 window end (min)', type: 'INT', role: 'memory', value: 1440, wordWidth: 16 },
  { id: 'TPO1_ON_MIN', label: 'TPO-1 application time (min)', type: 'INT', role: 'memory', value: 30, wordWidth: 16 },
  { id: 'TPO1_OFF_MIN', label: 'TPO-1 repeat between (min)', type: 'INT', role: 'memory', value: 120, wordWidth: 16 },
  { id: 'TPO1_PULSE_REM', label: 'TPO-1 pulse remaining (min)', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
];

function isTpoProgramPath(rel) {
  return /tpo_irrigation|motor_tpo_combined/i.test(String(rel || ''));
}

function minutesFromLegacyTimerPreset(tag) {
  const ms = Number(tag?.preset);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / 60000));
}

const TPO_INT_MINUTE_IDS = ['TPO1_ON_MIN', 'TPO1_OFF_MIN', 'TPO1_PULSE_REM'];

function tpoDefFor(id) {
  return TPO_TAG_DEFS.find((d) => d.id === id) || null;
}

/** Fix TPO minute tags saved with wrong type (e.g. BOOL) so ST SetInt and HMI edits work. */
function repairTpoIntTags(tagStore) {
  const repaired = [];
  for (const id of TPO_INT_MINUTE_IDS) {
    const existing = tagStore.get(id);
    if (!existing || existing.type === 'INT') continue;
    const def = tpoDefFor(id);
    let value = def?.value ?? 0;
    const n = Number(existing.value);
    if (Number.isFinite(n) && existing.type !== 'BOOL') value = Math.trunc(n);
    tagStore.upsert(applyDefaultLabel({
      ...(def || { id, type: 'INT', role: 'memory', wordWidth: 16 }),
      value,
    }));
    repaired.push(id);
  }
  return repaired;
}

/** Backfill minute params from legacy TIMER presets when upgrading projects. */
function migrateTpoMinuteTags(tagStore) {
  const migrated = [];
  if (!tagStore.get('TPO1_ON_MIN')) {
    const fromMs = minutesFromLegacyTimerPreset(tagStore.get('TPO1_TMR_ON'));
    tagStore.upsert(applyDefaultLabel({
      id: 'TPO1_ON_MIN',
      label: 'TPO-1 ON pulse (min)',
      type: 'INT',
      role: 'memory',
      value: fromMs ?? 2,
      wordWidth: 16,
    }));
    migrated.push('TPO1_ON_MIN');
  }
  if (!tagStore.get('TPO1_OFF_MIN')) {
    const fromMs = minutesFromLegacyTimerPreset(tagStore.get('TPO1_TMR_OFF'));
    tagStore.upsert(applyDefaultLabel({
      id: 'TPO1_OFF_MIN',
      label: 'TPO-1 OFF gap (min)',
      type: 'INT',
      role: 'memory',
      value: fromMs ?? 3,
      wordWidth: 16,
    }));
    migrated.push('TPO1_OFF_MIN');
  }
  if (!tagStore.get('TPO1_PULSE_REM')) {
    tagStore.upsert(applyDefaultLabel({
      id: 'TPO1_PULSE_REM',
      label: 'TPO-1 pulse remaining (min)',
      type: 'INT',
      role: 'memory',
      value: 0,
      wordWidth: 16,
    }));
    migrated.push('TPO1_PULSE_REM');
  }
  return migrated;
}

/** Add TPO1_* tags if missing; backfill labels when empty. */
function ensureTpoTags(tagStore) {
  const added = [];
  const labeled = [];
  for (const def of TPO_TAG_DEFS) {
    const existing = tagStore.get(def.id);
    if (existing) {
      if (!String(existing.label || '').trim() && def.label) {
        tagStore.upsert({ ...existing, label: def.label });
        labeled.push(def.id);
      }
      continue;
    }
    tagStore.upsert(applyDefaultLabel(def));
    added.push(def.id);
  }
  const migrated = migrateTpoMinuteTags(tagStore);
  const repaired = repairTpoIntTags(tagStore);
  if (added.length || labeled.length || migrated.length || repaired.length) {
    tagStore.save();
  }
  return { added, labeled, migrated, repaired, count: tagStore.count() };
}

module.exports = {
  TPO_TAG_DEFS,
  isTpoProgramPath,
  ensureTpoTags,
  migrateTpoMinuteTags,
  repairTpoIntTags,
  minutesFromLegacyTimerPreset,
};
