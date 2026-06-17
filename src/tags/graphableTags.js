'use strict';

/** Tags that can be plotted (BOOL as 0/1, INT/REAL as numeric). */
function isGraphableTag(tag) {
  if (!tag?.id) return false;
  return tag.type === 'INT' || tag.type === 'REAL' || tag.type === 'BOOL'
    || tag.type === 'PID' || tag.type === 'AVG' || tag.type === 'FLOW';
}

function graphableTags(tags) {
  return (tags || []).filter(isGraphableTag).sort((a, b) => a.id.localeCompare(b.id));
}

function numericTagValue(tag) {
  if (!tag) return 0;
  if (tag.type === 'BOOL') return tag.value ? 1 : 0;
  if (tag.type === 'PID') return Number(tag.fb?.out ?? tag.value);
  if (tag.type === 'AVG') return Number(tag.fb?.avg ?? tag.value);
  if (tag.type === 'FLOW') return Number(tag.fb?.gpm ?? tag.value);
  return Number(tag.value);
}

module.exports = { isGraphableTag, graphableTags, numericTagValue };
