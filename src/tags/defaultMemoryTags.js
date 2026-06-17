'use strict';

/** Default internal memory tags for a new tag database. */
const DEFAULT_VPB_COUNT = 20;
const DEFAULT_VPI_COUNT = 1;
const DEFAULT_VPR_COUNT = 1;

function buildDefaultMemoryTags() {
  const tags = [];
  for (let i = 1; i <= DEFAULT_VPB_COUNT; i++) {
    tags.push({
      id: `VPB${i}`,
      type: 'BOOL',
      role: 'memory',
      value: false,
    });
  }
  for (let i = 1; i <= DEFAULT_VPI_COUNT; i++) {
    tags.push({
      id: `VPI${i}`,
      type: 'INT',
      role: 'memory',
      value: 1,
      wordWidth: 16,
    });
  }
  for (let i = 1; i <= DEFAULT_VPR_COUNT; i++) {
    tags.push({
      id: `VPR${i}`,
      type: 'REAL',
      role: 'memory',
      value: 1,
      wordWidth: 32,
    });
  }
  return tags;
}

/**
 * Add default VPB/VPI/VPR tags that are not already present (by id).
 * @param {Array<object>} list
 */
function mergeDefaultMemoryTags(list) {
  const existing = Array.isArray(list) ? list : [];
  const ids = new Set(existing.map((t) => t.id));
  const out = existing.slice();
  for (const t of buildDefaultMemoryTags()) {
    if (!ids.has(t.id)) {
      out.push(t);
      ids.add(t.id);
    }
  }
  return out;
}

function isEmptyTagList(list) {
  return !Array.isArray(list) || list.length === 0;
}

module.exports = {
  DEFAULT_VPB_COUNT,
  DEFAULT_VPI_COUNT,
  DEFAULT_VPR_COUNT,
  buildDefaultMemoryTags,
  mergeDefaultMemoryTags,
  isEmptyTagList,
};
