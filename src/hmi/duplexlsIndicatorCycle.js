'use strict';

/** STATION_STA lamp/text bindings use min 0 max 3 (4 states). */
const DUPLEXLS_STATION_STATUS_STATES = 4;

/** Six indicator groups × four station states = 24 demo steps. */
const DUPLEXLS_INDICATOR_GROUP_COUNT = 6;

const DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT = DUPLEXLS_STATION_STATUS_STATES
  * DUPLEXLS_INDICATOR_GROUP_COUNT;

const DUPLEXLS_INDICATOR_CYCLE_STEP_MS = 1000;

const DUPLEXLS_INDICATOR_CYCLE_MS = DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT
  * DUPLEXLS_INDICATOR_CYCLE_STEP_MS;

/** Bool lamp / run-feedback tags driven by the faceplate indicator cycle. */
const DUPLEXLS_BOOL_INDICATOR_TAGS = [
  'LVL_OFF',
  'LVL_LEAD',
  'LVL_LAG',
  'LVL_HIGH',
  'PHASE_FAULT',
  'GEN_RUN',
  'GEN_FUEL_FAULT',
  'GEN_FAULT',
  'MOTOR1_RUN',
  'MOTOR2_RUN',
];

const DUPLEXLS_STARTS_TAGS = ['MOTOR1_STARTS', 'MOTOR2_STARTS'];
const DUPLEXLS_ETM_TAGS = ['MOTOR1_HRS', 'MOTOR2_HRS'];

/**
 * One indicator group lit per block of four steps while STATION_STA cycles 0..3.
 * Order matches the faceplate left-to-right / top-to-bottom indicator layout.
 */
const DUPLEXLS_INDICATOR_GROUPS = [
  { id: 'floatOff', tags: ['LVL_OFF'] },
  { id: 'floatLead', tags: ['LVL_LEAD'] },
  { id: 'floatLag', tags: ['LVL_LAG'] },
  { id: 'floatHigh', tags: ['LVL_HIGH'] },
  { id: 'genStatus', tags: ['PHASE_FAULT', 'GEN_RUN', 'GEN_FUEL_FAULT', 'GEN_FAULT'] },
  { id: 'pumpRun', tags: ['MOTOR1_RUN', 'MOTOR2_RUN'] },
];

function normalizeCycleStep(stepIndex) {
  const n = Number(stepIndex);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT - 1, Math.trunc(n)));
}

/**
 * Build tag values for one cycle step.
 * @returns {{ step: number, stationSta: number, groupIndex: number, groupId: string, tagValues: Record<string, boolean|number> }}
 */
function buildDuplexlsIndicatorCycleStep(stepIndex) {
  const step = normalizeCycleStep(stepIndex);
  const stationSta = step % DUPLEXLS_STATION_STATUS_STATES;
  const groupIndex = Math.floor(step / DUPLEXLS_STATION_STATUS_STATES);
  const group = DUPLEXLS_INDICATOR_GROUPS[groupIndex];
  const leadUnit = (step % 2) + 1;
  const tagValues = {
    STATION_STA: stationSta,
    MOTOR1_STARTS: step + 1,
    MOTOR2_STARTS: (step + 1) * 10,
    MOTOR1_HRS: Number(((step + 1) * 10.5).toFixed(1)),
    MOTOR2_HRS: Number(((step + 1) * 7.25).toFixed(1)),
    TANK_LVL: Number(Math.min(100, (step + 1) * 4.2).toFixed(1)),
    ALT1: leadUnit,
    MOTOR1_ONLINE: true,
    MOTOR2_ONLINE: true,
    MOTOR1_OFFLINE: false,
    MOTOR2_OFFLINE: false,
    M1_FAIL: false,
    M2_FAIL: false,
    MOTOR1_HOA: 0,
    MOTOR2_HOA: 0,
  };
  for (const tagId of DUPLEXLS_BOOL_INDICATOR_TAGS) {
    tagValues[tagId] = false;
  }
  for (const tagId of group.tags) {
    tagValues[tagId] = true;
  }
  return {
    step,
    stationSta,
    groupIndex,
    groupId: group.id,
    tagValues,
  };
}

/** Map tagId → { value } for HmiView.applyBindings / live refresh. */
function duplexlsIndicatorCycleLiveMap(stepIndex) {
  const { tagValues } = buildDuplexlsIndicatorCycleStep(stepIndex);
  const live = {};
  for (const [tagId, value] of Object.entries(tagValues)) {
    live[tagId] = { value };
  }
  return live;
}

function listDuplexlsIndicatorCycleSteps() {
  return Array.from(
    { length: DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT },
    (_, step) => buildDuplexlsIndicatorCycleStep(step),
  );
}

/**
 * Run the full indicator demo sequence (1 s per step by default).
 * @param {(step: ReturnType<typeof buildDuplexlsIndicatorCycleStep>) => void|Promise<void>} onStep
 * @param {{ stepMs?: number, signal?: AbortSignal }} [options]
 */
async function runDuplexlsIndicatorCycle(onStep, options = {}) {
  const stepMs = Math.max(1, Number(options.stepMs) || DUPLEXLS_INDICATOR_CYCLE_STEP_MS);
  for (let step = 0; step < DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT; step += 1) {
    if (options.signal?.aborted) break;
    const payload = buildDuplexlsIndicatorCycleStep(step);
    await onStep(payload);
    if (step < DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT - 1) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, stepMs);
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          }, { once: true });
        }
      });
    }
  }
}

module.exports = {
  DUPLEXLS_STATION_STATUS_STATES,
  DUPLEXLS_INDICATOR_GROUP_COUNT,
  DUPLEXLS_INDICATOR_CYCLE_STEP_COUNT,
  DUPLEXLS_INDICATOR_CYCLE_STEP_MS,
  DUPLEXLS_INDICATOR_CYCLE_MS,
  DUPLEXLS_BOOL_INDICATOR_TAGS,
  DUPLEXLS_STARTS_TAGS,
  DUPLEXLS_ETM_TAGS,
  DUPLEXLS_INDICATOR_GROUPS,
  buildDuplexlsIndicatorCycleStep,
  duplexlsIndicatorCycleLiveMap,
  listDuplexlsIndicatorCycleSteps,
  runDuplexlsIndicatorCycle,
};
