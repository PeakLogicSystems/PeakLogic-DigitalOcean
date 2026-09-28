'use strict';

const { isExpansionIoTag } = require('./api/routes/ioMap');

const PROGRAM_IO_TYPES = new Set(['BOOL', 'INT', 'REAL', 'PID', 'AVG']);

function isProgramIoType(tag) {
  return tag && PROGRAM_IO_TYPES.has(tag.type);
}

/** Tag eligible for Live I/O when no ST program refs exist (includes memory BOOL/INT/REAL). */
function isProgramIoTag(tag) {
  if (!isProgramIoType(tag)) return false;
  if (isExpansionIoTag(tag)) {
    return tag.role === 'input' || tag.role === 'output';
  }
  return true;
}

/** Physical I/O (input/output) shown in Live I/O alongside program refs — matches io-map scope. */
function isHardwareIoTag(tag) {
  if (!isProgramIoType(tag)) return false;
  return tag.role === 'input' || tag.role === 'output';
}

function programIoTagList(tags, programTagRefs) {
  const refSet = new Set(programTagRefs || []);
  const list = refSet.size
    ? (tags || []).filter((t) => refSet.has(t.id) || isHardwareIoTag(t))
    : (tags || []).filter((t) => isProgramIoTag(t));
  const seen = new Set();
  const unique = [];
  for (const t of list) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    unique.push(t);
  }
  return unique;
}

module.exports = {
  isProgramIoType,
  isProgramIoTag,
  isHardwareIoTag,
  programIoTagList,
};
