'use strict';

/** Default THD alarm threshold (%). RGB meter has no harmonic registers — estimate from PF. */
const DEFAULT_THD_ALARM_PCT = 8;

/**
 * Estimate total harmonic distortion (%) from displacement power factor.
 * THD ≈ sqrt(1/PF² − 1) × 100 when harmonic registers are unavailable.
 * @param {number} pf signed or unsigned power factor (engineering units, e.g. 0.92)
 * @returns {number} THD percent, 0–100
 */
function thdPctFromPf(pf) {
  const p = Math.abs(Number(pf) || 0);
  if (p < 0.05) return 0;
  const inner = 1 / (p * p) - 1;
  if (inner <= 0) return 0;
  return Math.min(100, Math.sqrt(inner) * 100);
}

/** Memory tags filled on Opta fieldbus or by ST from DDS_PF_* when PC polls the meter. */
function buildEzMeterThdTagDefs(thresholds = {}) {
  const thdLimit = Number(thresholds.thdAlarmPct) || DEFAULT_THD_ALARM_PCT;
  return [
    { id: 'MECH_PQ_THD_VA', label: 'Phase A voltage THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_VB', label: 'Phase B voltage THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_VC', label: 'Phase C voltage THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_IA', label: 'Phase A current THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_IB', label: 'Phase B current THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_IC', label: 'Phase C current THD est. %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_THD_ALM', label: 'Site THD alarm (estimated)', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_CFG_THD_PCT', label: 'PQ max THD threshold %', type: 'REAL', role: 'memory', default: thdLimit },
  ];
}

function buildEzMeterThdTags(thresholds) {
  return buildEzMeterThdTagDefs(thresholds).map((d) => ({
    id: d.id,
    label: d.label || d.id,
    type: d.type || 'REAL',
    role: d.role || 'memory',
    value: d.default ?? (d.type === 'BOOL' ? false : 0),
    graphEnabled: d.graphEnabled === true,
    alarmsEnabled: d.alarmsEnabled === true,
    alarmCondition: d.alarmCondition ?? null,
  }));
}

module.exports = {
  DEFAULT_THD_ALARM_PCT,
  thdPctFromPf,
  buildEzMeterThdTagDefs,
  buildEzMeterThdTags,
};
