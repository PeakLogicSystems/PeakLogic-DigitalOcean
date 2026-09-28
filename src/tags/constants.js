'use strict';

module.exports = {
  TAG_TYPES: ['BOOL', 'INT', 'REAL', 'TIMER', 'COUNTER', 'PID', 'AVG', 'FLOW', 'ALT'],
  TAG_ROLES: ['input', 'output', 'memory', 'fb'],
  QUALITY: { GOOD: 'GOOD', BAD: 'BAD', STALE: 'STALE' },
  TIMER_MODES: ['TON', 'TOF', 'TP'],
  COUNTER_MODES: ['CTU', 'CTD'],
  PID_MODES: ['P', 'PI', 'PID'],
  AVG_MODES: ['MOV', 'EMA'],
  FLOW_MODES: ['GPM'],
  ALT_MODES: ['ALT2', 'ALT3', 'ALT4'],
};
