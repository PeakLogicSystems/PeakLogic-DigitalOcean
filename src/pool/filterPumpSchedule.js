'use strict';

const FILTER_SLOTS_PER_DAY = 6;
const FILTER_SCHEDULE_DAYS = 7;
const MAX_FILTER_PUMPS = 2;
const FILTER_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULT_SLOT_TIMES = [360, 600, 840, 1020, 0, 0];
const DEFAULT_SLOT_PCTS = [80, 65, 70, 50, 0, 0];

/** Default turnover targets (minutes). Pool day 6h, night 10h, spa 30min. */
const DEFAULT_TURNOVER = {
  poolVolGal: 15000,
  spaVolGal: 500,
  pump1FlowGpm: 80,
  pump2FlowGpm: 40,
  poolTurnoverDayMin: 360,
  poolTurnoverNightMin: 600,
  spaTurnoverMin: 30,
  poolDayStart: 480,
  poolDayEnd: 1200,
};

function defaultSlotTime(slot) {
  return DEFAULT_SLOT_TIMES[slot - 1] ?? 0;
}

function defaultSlotPct(slot) {
  return DEFAULT_SLOT_PCTS[slot - 1] ?? 0;
}

function defaultSlotEnabled(slot, pump = 1) {
  if (pump === 2) return slot === 1;
  return slot <= 4 && defaultSlotTime(slot) > 0;
}

function slotTagId(pump, day, slot, kind) {
  if (kind === 'en') return `FP${pump}_D${day}_S${slot}_EN`;
  const k = kind === 't' ? 'T' : 'P';
  return `FP${pump}_D${day}_S${slot}_${k}`;
}

function schPctTag(pump) {
  return pump === 1 ? 'FILTER_SCH_PCT' : 'FILTER_SCH2_PCT';
}

function activePctTag(pump) {
  return pump === 1 ? 'FP1_ACTIVE_PCT' : 'FP2_ACTIVE_PCT';
}

function turnoverMinTag(pump) {
  return pump === 1 ? 'FP1_TURNOVER_MIN' : 'FP2_TURNOVER_MIN';
}

function buildTurnoverTags() {
  const t = DEFAULT_TURNOVER;
  return [
    { id: 'CFG_FP_CNT', label: 'Filter pump count', type: 'INT', role: 'memory', value: 1, wordWidth: 16 },
    { id: 'CFG_FP2', label: 'Spa filter pump enabled', type: 'BOOL', role: 'memory', value: false },
    { id: 'SCH_AUTO_TURNOVER', label: 'Auto speed from turnover', type: 'BOOL', role: 'memory', value: true },
    { id: 'POOL_VOL_GAL', label: 'Pool volume (gal)', type: 'INT', role: 'memory', value: t.poolVolGal, wordWidth: 16 },
    { id: 'SPA_VOL_GAL', label: 'Spa volume (gal)', type: 'INT', role: 'memory', value: t.spaVolGal, wordWidth: 16 },
    { id: 'PUMP1_FLOW_GPM', label: 'Pool pump flow at 100% (GPM)', type: 'INT', role: 'memory', value: t.pump1FlowGpm, wordWidth: 16 },
    { id: 'PUMP2_FLOW_GPM', label: 'Spa pump flow at 100% (GPM)', type: 'INT', role: 'memory', value: t.pump2FlowGpm, wordWidth: 16 },
    { id: 'POOL_TURNOVER_DAY_MIN', label: 'Pool turnover day (min)', type: 'INT', role: 'memory', value: t.poolTurnoverDayMin, wordWidth: 16 },
    { id: 'POOL_TURNOVER_NIGHT_MIN', label: 'Pool turnover night (min)', type: 'INT', role: 'memory', value: t.poolTurnoverNightMin, wordWidth: 16 },
    { id: 'SPA_TURNOVER_MIN', label: 'Spa turnover (min)', type: 'INT', role: 'memory', value: t.spaTurnoverMin, wordWidth: 16 },
    { id: 'POOL_DAY_START', label: 'Pool day period start', type: 'INT', role: 'memory', value: t.poolDayStart, wordWidth: 16 },
    { id: 'POOL_DAY_END', label: 'Pool day period end', type: 'INT', role: 'memory', value: t.poolDayEnd, wordWidth: 16 },
    { id: 'FP1_PCT_DAY', label: 'Pool pump day speed %', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'FP1_PCT_NIGHT', label: 'Pool pump night speed %', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'FP1_ACTIVE_PCT', label: 'Pool pump active speed %', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'FP2_ACTIVE_PCT', label: 'Spa pump active speed %', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'FILTER_SCH2_PCT', label: 'Spa schedule active speed %', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'VPB2', label: 'Spa filter window permissive', type: 'BOOL', role: 'memory', value: false },
  ];
}

function buildSpaPumpTags() {
  return [
    { id: 'MOTOR2_HOA', label: 'Spa pump HOA', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'MOTOR2_STA', label: 'Spa pump status', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'MOTOR2_START', label: 'Spa pump start', type: 'BOOL', role: 'memory', value: false },
    { id: 'MOTOR2_STOP', label: 'Spa pump stop', type: 'BOOL', role: 'memory', value: false },
    { id: 'MOTOR2_RESET', label: 'Spa pump reset', type: 'BOOL', role: 'memory', value: false },
    { id: 'MOTOR2_OFFLINE', label: 'Spa pump offline', type: 'BOOL', role: 'memory', value: false },
    { id: 'MOTOR2_RUN', label: 'Spa pump run cmd', type: 'BOOL', role: 'memory', value: false },
    { id: 'MOTOR2_HRS', label: 'Spa pump run hours', type: 'REAL', role: 'memory', value: 0 },
    { id: 'MOTOR2_STARTS', label: 'Spa pump starts', type: 'INT', role: 'memory', value: 0, wordWidth: 16 },
    { id: 'MOTOR2_CNTR', label: 'Spa pump start counter', type: 'COUNTER', role: 'memory', value: 0, preset: 999999, mode: 'CTU' },
    { id: 'PUMP2_SPEED', label: 'Spa pump RPM setpoint', type: 'INT', role: 'memory', value: 1800, wordWidth: 16 },
    { id: 'PUMP2_RUN_CMD', label: 'Spa pump run cmd', type: 'BOOL', role: 'output', value: false },
    { id: 'PUMP2_RPM_CMD', label: 'Spa pump RPM cmd', type: 'INT', role: 'output', value: 1800, wordWidth: 16 },
    { id: 'PUMP2_STA_RAW', label: 'Spa pump status raw', type: 'INT', role: 'input', value: 0, wordWidth: 16 },
    { id: 'PUMP2_RPM', label: 'Spa pump RPM', type: 'INT', role: 'input', value: 0, wordWidth: 16 },
  ];
}

function buildPumpScheduleTags(pump) {
  const tags = [];
  for (let d = 0; d < FILTER_SCHEDULE_DAYS; d++) {
    for (let s = 1; s <= FILTER_SLOTS_PER_DAY; s++) {
      tags.push({
        id: slotTagId(pump, d, s, 't'),
        label: `Pump ${pump} ${FILTER_DAY_LABELS[d]} slot ${s} start`,
        type: 'INT',
        role: 'memory',
        value: defaultSlotTime(s),
        wordWidth: 16,
      });
      tags.push({
        id: slotTagId(pump, d, s, 'p'),
        label: `Pump ${pump} ${FILTER_DAY_LABELS[d]} slot ${s} %`,
        type: 'INT',
        role: 'memory',
        value: pump === 1 ? defaultSlotPct(s) : (s === 1 ? 50 : 0),
        wordWidth: 16,
      });
      tags.push({
        id: slotTagId(pump, d, s, 'en'),
        label: `Pump ${pump} ${FILTER_DAY_LABELS[d]} slot ${s} enable`,
        type: 'BOOL',
        role: 'memory',
        value: defaultSlotEnabled(s, pump),
      });
    }
  }
  return tags;
}

function buildScheduleTags(maxPumps = MAX_FILTER_PUMPS) {
  const tags = [
    {
      id: 'FILTER_DOW',
      label: 'Filter schedule day (0=Sun)',
      type: 'INT',
      role: 'memory',
      value: 1,
      wordWidth: 16,
    },
    {
      id: 'FILTER_SCH_PCT',
      label: 'Pool schedule active speed %',
      type: 'INT',
      role: 'memory',
      value: 0,
      wordWidth: 16,
    },
    ...buildTurnoverTags(),
    ...buildSpaPumpTags(),
  ];
  for (let p = 1; p <= maxPumps; p++) {
    tags.push(...buildPumpScheduleTags(p));
  }
  return tags;
}

function buildSlotChain(pump, dayIndex, slots, depth, outTag) {
  if (!slots.length) {
    return [`${'  '.repeat(depth)}SetInt(${outTag}, 0);`];
  }
  const [s, ...rest] = slots;
  const pad = '  '.repeat(depth);
  const tTag = slotTagId(pump, dayIndex, s, 't');
  const pTag = slotTagId(pump, dayIndex, s, 'p');
  const eTag = slotTagId(pump, dayIndex, s, 'en');
  const actTag = activePctTag(pump);
  const setPct = [
    `${pad}  IF IsON(SCH_AUTO_TURNOVER) THEN`,
    `${pad}    SetInt(${outTag}, ${actTag});`,
    `${pad}  ELSE`,
    `${pad}    SetInt(${outTag}, ${pTag});`,
    `${pad}  END_IF;`,
  ];
  const inner = rest.length
    ? buildSlotChain(pump, dayIndex, rest, depth + 1, outTag)
    : [`${'  '.repeat(depth + 1)}SetInt(${outTag}, 0);`];
  return [
    `${pad}IF IsON(${eTag}) AND FILTER_TOD >= ${tTag} THEN`,
    ...setPct,
    `${pad}ELSE`,
    ...inner,
    `${pad}END_IF;`,
  ];
}

function buildDaySlotEvalSt(pump, dayIndex, outTag) {
  const slots = [];
  for (let s = FILTER_SLOTS_PER_DAY; s >= 1; s--) slots.push(s);
  return buildSlotChain(pump, dayIndex, slots, 2, outTag).join('\n');
}

function buildDayChain(pump, dayList, depth, outTag) {
  if (!dayList.length) {
    return [`${'  '.repeat(depth)}SetInt(${outTag}, 0);`];
  }
  const [d, ...rest] = dayList;
  const pad = '  '.repeat(depth);
  const inner = rest.length
    ? buildDayChain(pump, rest, depth + 1, outTag)
    : [`${'  '.repeat(depth + 1)}SetInt(${outTag}, 0);`];
  return [
    `${pad}IF FILTER_DOW = ${d} THEN`,
    buildDaySlotEvalSt(pump, d, outTag),
    `${pad}ELSE`,
    ...inner,
    `${pad}END_IF;`,
  ];
}

function buildPumpScheduleEvalSt(pump) {
  const outTag = schPctTag(pump);
  const days = [];
  for (let d = 0; d < FILTER_SCHEDULE_DAYS; d++) days.push(d);
  const label = pump === 1 ? 'Pool pump 1' : 'Spa pump 2';
  return [
    `(* ${label} weekly schedule *)`,
    `IF IsON(FILTER_24HR) THEN`,
    `  SetInt(${outTag}, 100);`,
    `ELSE`,
    ...buildDayChain(pump, days, 1, outTag),
    `END_IF;`,
  ].join('\n');
}

function buildTurnoverCalcSt() {
  return [
    '(* Turnover-based speed: pct = 100 * volume / (turnover_min * flow_gpm) *)',
    'IF PUMP1_FLOW_GPM > 0 AND POOL_VOL_GAL > 0 AND POOL_TURNOVER_DAY_MIN > 0 THEN',
    '  SetInt(FP1_PCT_DAY, POOL_VOL_GAL * 100 / (POOL_TURNOVER_DAY_MIN * PUMP1_FLOW_GPM));',
    '  IF FP1_PCT_DAY > 100 THEN SetInt(FP1_PCT_DAY, 100); END_IF;',
    'ELSE',
    '  SetInt(FP1_PCT_DAY, 0);',
    'END_IF;',
    'IF PUMP1_FLOW_GPM > 0 AND POOL_VOL_GAL > 0 AND POOL_TURNOVER_NIGHT_MIN > 0 THEN',
    '  SetInt(FP1_PCT_NIGHT, POOL_VOL_GAL * 100 / (POOL_TURNOVER_NIGHT_MIN * PUMP1_FLOW_GPM));',
    '  IF FP1_PCT_NIGHT > 100 THEN SetInt(FP1_PCT_NIGHT, 100); END_IF;',
    'ELSE',
    '  SetInt(FP1_PCT_NIGHT, 0);',
    'END_IF;',
    'IF FILTER_TOD >= POOL_DAY_START AND FILTER_TOD < POOL_DAY_END THEN',
    '  SetInt(FP1_ACTIVE_PCT, FP1_PCT_DAY);',
    'ELSE',
    '  SetInt(FP1_ACTIVE_PCT, FP1_PCT_NIGHT);',
    'END_IF;',
    'IF PUMP2_FLOW_GPM > 0 AND SPA_VOL_GAL > 0 AND SPA_TURNOVER_MIN > 0 THEN',
    '  SetInt(FP2_ACTIVE_PCT, SPA_VOL_GAL * 100 / (SPA_TURNOVER_MIN * PUMP2_FLOW_GPM));',
    '  IF FP2_ACTIVE_PCT > 100 THEN SetInt(FP2_ACTIVE_PCT, 100); END_IF;',
    'ELSE',
    '  SetInt(FP2_ACTIVE_PCT, 0);',
    'END_IF;',
  ].join('\n');
}

function buildScheduleEvalSt() {
  return [
    buildTurnoverCalcSt(),
    '',
    buildPumpScheduleEvalSt(1),
    '',
    'IF IsON(CFG_FP2) THEN',
    buildPumpScheduleEvalSt(2).split('\n').map((l) => (l ? `  ${l}` : l)).join('\n'),
    'ELSE',
    '  SetInt(FILTER_SCH2_PCT, 0);',
    'END_IF;',
  ].join('\n');
}

function hmiElementId(pump, day, slot, kind) {
  if (kind === 'en') return `chk_fp${pump}_d${day}_s${slot}_en`;
  return `sch_fp${pump}_d${day}_s${slot}_${kind}`;
}

function buildScheduleCompositeBindings() {
  const bindings = [
    { elementId: 'filter_tod', property: 'text', tagId: 'FILTER_TOD', format: 'hhmm' },
    { elementId: 'filter_dow', property: 'text', tagId: 'FILTER_DOW', format: 'dow', min: 0, max: 6 },
    { elementId: 'filter_sch_pct', property: 'text', tagId: 'FILTER_SCH_PCT', format: 'int', min: 0, max: 100 },
    { elementId: 'filter_sch2_pct', property: 'text', tagId: 'FILTER_SCH2_PCT', format: 'int', min: 0, max: 100 },
    { elementId: 'fp1_active_pct', property: 'text', tagId: 'FP1_ACTIVE_PCT', format: 'int', min: 0, max: 100 },
    { elementId: 'fp2_active_pct', property: 'text', tagId: 'FP2_ACTIVE_PCT', format: 'int', min: 0, max: 100 },
    { elementId: 'pool_vol_gal', property: 'text', tagId: 'POOL_VOL_GAL', format: 'int', interaction: 'edit', min: 100, max: 999999 },
    { elementId: 'spa_vol_gal', property: 'text', tagId: 'SPA_VOL_GAL', format: 'int', interaction: 'edit', min: 50, max: 5000 },
    { elementId: 'pump1_flow_gpm', property: 'text', tagId: 'PUMP1_FLOW_GPM', format: 'int', interaction: 'edit', min: 10, max: 500 },
    { elementId: 'pump2_flow_gpm', property: 'text', tagId: 'PUMP2_FLOW_GPM', format: 'int', interaction: 'edit', min: 10, max: 500 },
    { elementId: 'pool_turnover_day_h', property: 'text', tagId: 'POOL_TURNOVER_DAY_MIN', format: 'hoursFromMin', interaction: 'edit', min: 240, max: 480 },
    { elementId: 'pool_turnover_night_h', property: 'text', tagId: 'POOL_TURNOVER_NIGHT_MIN', format: 'hoursFromMin', interaction: 'edit', min: 480, max: 720 },
    { elementId: 'spa_turnover_min', property: 'text', tagId: 'SPA_TURNOVER_MIN', format: 'int', interaction: 'edit', min: 15, max: 120 },
    { elementId: 'pool_day_start', property: 'text', tagId: 'POOL_DAY_START', format: 'hhmm', interaction: 'edit', min: 0, max: 1439 },
    { elementId: 'pool_day_end', property: 'text', tagId: 'POOL_DAY_END', format: 'hhmm', interaction: 'edit', min: 0, max: 1439 },
    { elementId: 'chk_24hr', property: 'fill', tagId: 'FILTER_24HR', interaction: 'toggle', onValue: '#22c55e', offValue: '#ffffff' },
    { elementId: 'btn_filter_enable', property: 'fill', tagId: 'FILTER_EN', interaction: 'toggle', onValue: '#22c55e', offValue: '#94a3b8' },
    { elementId: 'chk_auto_turnover', property: 'fill', tagId: 'SCH_AUTO_TURNOVER', interaction: 'toggle', onValue: '#22c55e', offValue: '#ffffff' },
    { elementId: 'chk_cfg_fp2', property: 'fill', tagId: 'CFG_FP2', interaction: 'toggle', onValue: '#22c55e', offValue: '#94a3b8' },
    { elementId: 'grp_spa_pump', property: 'visibility', tagId: 'CFG_FP2', onValue: true, offValue: false },
  ];
  for (let p = 1; p <= MAX_FILTER_PUMPS; p++) {
    for (let d = 0; d < FILTER_SCHEDULE_DAYS; d++) {
      for (let s = 1; s <= FILTER_SLOTS_PER_DAY; s++) {
        bindings.push({
          elementId: hmiElementId(p, d, s, 't'),
          property: 'text',
          tagId: slotTagId(p, d, s, 't'),
          format: 'hhmm',
          interaction: 'edit',
          min: 0,
          max: 1439,
        });
        bindings.push({
          elementId: hmiElementId(p, d, s, 'p'),
          property: 'text',
          tagId: slotTagId(p, d, s, 'p'),
          format: 'int',
          interaction: 'edit',
          min: 0,
          max: 100,
        });
        bindings.push({
          elementId: hmiElementId(p, d, s, 'en'),
          property: 'fill',
          tagId: slotTagId(p, d, s, 'en'),
          interaction: 'toggle',
          onValue: '#22c55e',
          offValue: '#ffffff',
        });
      }
    }
  }
  return bindings;
}

/** pct = 100 * volume / (turnoverMin * flowGpm), clamped 0–100 */
function turnoverSpeedPct(volumeGal, turnoverMin, flowGpm) {
  if (!volumeGal || !turnoverMin || !flowGpm) return 0;
  return Math.min(100, Math.round((volumeGal * 100) / (turnoverMin * flowGpm)));
}

module.exports = {
  FILTER_SLOTS_PER_DAY,
  FILTER_SCHEDULE_DAYS,
  MAX_FILTER_PUMPS,
  FILTER_DAY_LABELS,
  DEFAULT_TURNOVER,
  defaultSlotTime,
  defaultSlotPct,
  defaultSlotEnabled,
  slotTagId,
  buildScheduleTags,
  buildTurnoverCalcSt,
  buildScheduleEvalSt,
  buildScheduleCompositeBindings,
  turnoverSpeedPct,
  hmiElementId,
};
