'use strict';

/** Memory tag ID prefixes by data type (PLC-style internal variables). */
const MEMORY_PREFIX = {
  BOOL: 'VPB',
  INT: 'VPI',
  REAL: 'VPR',
};

/** Timer/counter tag ID prefixes (not VPB/VPI/VPR). */
const FB_PREFIX = {
  TIMER: 'TMR',
  COUNTER: 'CTR',
  PID: 'PID',
  AVG: 'AVG',
  FLOW: 'FLOW',
  ALT: 'ALT',
  RMOTOR: 'RMOTOR',
};

const FB_TYPES = ['TIMER', 'COUNTER', 'PID', 'AVG', 'FLOW', 'ALT', 'RMOTOR'];

function memoryPrefixForType(type) {
  return MEMORY_PREFIX[type] || null;
}

function fbPrefixForType(type) {
  return FB_PREFIX[type] || null;
}

function parseMemoryId(id) {
  const m = String(id || '').match(/^(VPB|VPI|VPR)(\d+)$/i);
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), num: m[2] };
}

function parseFbId(id) {
  const m = String(id || '').match(/^(TMR|CTR|PID|AVG|FLOW|ALT|RMOTOR)(\d*)$/i);
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), num: m[2] || '' };
}

/**
 * Next free memory tag id for type (VPB1, VPI2, …).
 * @param {Array<{id:string}>} tags
 * @param {string} type BOOL|INT|REAL
 * @param {number|null} skipIndex omit this index from collision check (in-place edit)
 */
function nextMemoryTagId(tags, type, skipIndex = null) {
  const prefix = memoryPrefixForType(type);
  if (!prefix) return `TAG_${tags.length}`;
  const re = new RegExp(`^${prefix}(\\d+)$`, 'i');
  let max = 0;
  tags.forEach((t, idx) => {
    if (skipIndex != null && idx === skipIndex) return;
    const m = String(t.id).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${max + 1}`;
}

/**
 * Next timer/counter id (TMR, CTR, or TMR1, CTR2 when numbered tags exist).
 */
function nextFbTagId(tags, type, skipIndex = null) {
  const prefix = fbPrefixForType(type);
  if (!prefix) return `TAG_${tags.length}`;
  const re = new RegExp(`^${prefix}(\\d*)$`, 'i');
  let max = 0;
  let hasBare = false;
  tags.forEach((t, idx) => {
    if (skipIndex != null && idx === skipIndex) return;
    const m = String(t.id).match(re);
    if (!m) return;
    if (m[1] === '') {
      hasBare = true;
      return;
    }
    max = Math.max(max, parseInt(m[1], 10));
  });
  if (max === 0 && !hasBare) return prefix;
  return `${prefix}${max + 1}`;
}

/**
 * Apply VPB/VPI/VPR naming for role=memory BOOL/INT/REAL only.
 */
function applyMemoryTagNaming(id, type, role, tags, skipIndex = null) {
  if (role !== 'memory') return id;
  if (FB_TYPES.includes(type)) return id;
  const prefix = memoryPrefixForType(type);
  if (!prefix) return id;
  const s = String(id || '').trim();
  if (!s) return nextMemoryTagId(tags, type, skipIndex);
  const parsed = parseMemoryId(s);
  if (parsed) return `${prefix}${parsed.num}`;
  // Keep explicit symbolic ids (MOTOR1_HOA, DI1, …) — only auto-name blank/TAG_* ids.
  if (/^[A-Z][A-Z0-9_]*$/i.test(s) && !/^TAG_/i.test(s)) return s;
  const fromFb = parseFbId(s);
  if (fromFb) return `${prefix}${fromFb.num || '1'}`;
  return nextMemoryTagId(tags, type, skipIndex);
}

/**
 * Apply TMR/CTR naming for TIMER/COUNTER (any role).
 */
function applyFbTagNaming(id, type, tags, skipIndex = null) {
  const prefix = fbPrefixForType(type);
  if (!prefix) return id;
  const s = String(id || '').trim();
  if (!s) return nextFbTagId(tags, type, skipIndex);
  const parsed = parseFbId(s);
  if (parsed) return `${prefix}${parsed.num}`;
  const fromMem = parseMemoryId(s);
  if (fromMem) return `${prefix}${fromMem.num}`;
  // Keep explicit symbolic ids (MOTOR1_CNTR, …) — only auto-name blank/TAG_* ids.
  if (/^[A-Z][A-Z0-9_]*$/i.test(s) && !/^TAG_/i.test(s)) return s;
  return nextFbTagId(tags, type, skipIndex);
}

/**
 * Route naming: TIMER/COUNTER → TMR/CTR; memory BOOL/INT/REAL → VPB/VPI/VPR.
 */
function applyTagNaming(id, type, role, tags, skipIndex = null) {
  if (FB_TYPES.includes(type)) {
    return applyFbTagNaming(id, type, tags, skipIndex);
  }
  return applyMemoryTagNaming(id, type, role, tags, skipIndex);
}

function isValidMemoryTagId(id, type) {
  const prefix = memoryPrefixForType(type);
  if (!prefix) return true;
  return new RegExp(`^${prefix}\\d+$`, 'i').test(String(id || ''));
}

function isValidFbTagId(id, type) {
  const prefix = fbPrefixForType(type);
  if (!prefix) return true;
  return new RegExp(`^${prefix}\\d*$`, 'i').test(String(id || ''));
}

/** INT/TIMER/COUNTER: 16 or 32 only; default 16. */
function normalizeWordWidth(type, wordWidth) {
  if (type === 'TIMER' || type === 'COUNTER' || type === 'INT') {
    const n = Number(wordWidth);
    return n >= 32 ? 32 : 16;
  }
  if (type === 'REAL' || type === 'PID' || type === 'AVG' || type === 'FLOW') return 32;
  if (type === 'ALT') return 16;
  if (type === 'RMOTOR') return 16;
  return 16;
}

function formatWordWidthLabel(type, wordWidth) {
  if (type === 'BOOL') return '1-bit';
  if (type === 'REAL') return '32-bit';
  if (type === 'INT' || type === 'TIMER' || type === 'COUNTER') {
    const w = normalizeWordWidth(type, wordWidth);
    return `${w}-bit`;
  }
  if (type === 'PID' || type === 'AVG' || type === 'FLOW') return '32-bit REAL';
  if (type === 'ALT') return '16-bit INT';
  if (type === 'RMOTOR') return '16-bit INT';
  return '—';
}

module.exports = {
  MEMORY_PREFIX,
  FB_PREFIX,
  FB_TYPES,
  memoryPrefixForType,
  fbPrefixForType,
  nextMemoryTagId,
  nextFbTagId,
  applyMemoryTagNaming,
  applyFbTagNaming,
  applyTagNaming,
  isValidMemoryTagId,
  isValidFbTagId,
  parseMemoryId,
  parseFbId,
  normalizeWordWidth,
  formatWordWidthLabel,
};
