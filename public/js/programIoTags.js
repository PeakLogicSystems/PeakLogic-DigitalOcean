'use strict';

/** Live I/O tag selection (mirrors src/programIoTags.js). */
window.PeakLogicProgramIoTags = (function () {
  const expIo = () => window.PeakLogicExpansionIo || {};
  const PROGRAM_IO_TYPES = new Set(['BOOL', 'INT', 'REAL', 'PID', 'AVG']);

  function isProgramIoType(tag) {
    return tag && PROGRAM_IO_TYPES.has(tag.type);
  }

  function isProgramIoTag(tag) {
    if (!isProgramIoType(tag)) return false;
    if (expIo().isExpansionIoTag?.(tag)) {
      return tag.role === 'input' || tag.role === 'output';
    }
    return true;
  }

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

  return {
    isProgramIoType,
    isProgramIoTag,
    isHardwareIoTag,
    programIoTagList,
  };
})();
