'use strict';

function effectiveValue(t) {
  if (!t) return false;
  if (t.forceInput || t.forceOutput) {
    if (t.forceValue !== undefined) return t.forceValue;
  }
  if (t.logicValue !== undefined) return t.logicValue;
  return t.value;
}

function refreshEffective(t) {
  if (!t) return;
  t.value = effectiveValue(t);
}

module.exports = { effectiveValue, refreshEffective };
