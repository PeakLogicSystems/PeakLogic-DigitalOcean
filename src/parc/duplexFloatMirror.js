'use strict';

/**
 * Duplex lift station float ladder — matches 36_duplex_lift_station.st IsON(X1_I*) mapping.
 * +24 V active-high DIs: input ON (true) when wet/at float; LVL_* follows directly.
 */
const DUPLEX_FLOAT_IO_TO_LVL = [
  ['X1_I1', 'LVL_HIGH'],
  ['X1_I2', 'LVL_LEAD'],
  ['X1_I3', 'LVL_LAG'],
  ['X1_I4', 'LVL_OFF'],
];

const DUPLEX_FLOAT_LVL = new Set(DUPLEX_FLOAT_IO_TO_LVL.map(([, lvlId]) => lvlId));

/** Demand latches derived from LVL_* — matches 36_duplex_lift_station.st latch rules. */
const DUPLEX_DEMAND_LATCH = new Set(['LEAD_CALL', 'LAG_CALL']);

function boolTag(store, id) {
  const row = store.get(id);
  if (!row || row.type !== 'BOOL') return null;
  const raw = row.logicValue !== undefined ? row.logicValue : row.value;
  return !!raw;
}

function diWet(store, ioId) {
  const row = store.get(ioId);
  if (!row || row.type !== 'BOOL') return null;
  const raw = row.logicValue !== undefined ? row.logicValue : row.value;
  return !!raw;
}

/** Refresh LVL_* memory tags from expansion DI telemetry (remote ST float pilots). */
function mirrorDuplexFloatLevels(store) {
  if (!store?.get) return 0;
  let n = 0;
  for (const [ioId, lvlId] of DUPLEX_FLOAT_IO_TO_LVL) {
    if (!store.get(lvlId)) continue;
    const wet = diWet(store, ioId);
    if (wet === null) continue;
    const q = store.get(ioId)?.quality;
    if (typeof store.setValue === 'function') {
      store.setValue(lvlId, wet, q);
    }
    n += 1;
  }
  mirrorDuplexDemandLatches(store);
  return n;
}

/** LEAD_CALL / LAG_CALL from float ladder (remote ST: PC does not execute .st locally). */
function mirrorDuplexDemandLatches(store) {
  if (!store?.get) return 0;
  const lvlLead = boolTag(store, 'LVL_LEAD');
  const lvlLag = boolTag(store, 'LVL_LAG');
  const lvlHigh = boolTag(store, 'LVL_HIGH');
  const lvlOff = boolTag(store, 'LVL_OFF');
  if (lvlLead === null || lvlOff === null) return 0;

  let n = 0;
  if (store.get('LEAD_CALL')) {
    let leadCall = boolTag(store, 'LEAD_CALL') ?? false;
    if (lvlLead || lvlLag || lvlHigh) leadCall = true;
    if (!lvlOff) leadCall = false;
    if (diWet(store, 'X1_I7') === true) leadCall = false;
    store.setValue('LEAD_CALL', leadCall);
    n += 1;
  }
  if (store.get('LAG_CALL')) {
    let lagCall = boolTag(store, 'LAG_CALL') ?? false;
    if (lvlLag || lvlHigh) lagCall = true;
    if (!lvlOff) lagCall = false;
    if (diWet(store, 'X1_I7') === true) lagCall = false;
    store.setValue('LAG_CALL', lagCall);
    n += 1;
  }
  return n;
}

module.exports = {
  DUPLEX_FLOAT_IO_TO_LVL,
  DUPLEX_FLOAT_LVL,
  DUPLEX_DEMAND_LATCH,
  mirrorDuplexFloatLevels,
  mirrorDuplexDemandLatches,
};
