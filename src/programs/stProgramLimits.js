'use strict';

/** Parc / Opta edge targets — small RAM, keep ST programs modest. */
const ST_PROGRAM_MAX_LINES_PARC = 500;

/** PC/Linux runtime — no line cap (memory is not a constraint). */
const ST_PROGRAM_MAX_LINES_LOCAL = null;

function countStSourceLines(source) {
  if (source == null || source === '') return 0;
  const lines = String(source).split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.length - 1;
  }
  return lines.length;
}

function stProgramLimitsMeta() {
  return {
    parcMaxLines: ST_PROGRAM_MAX_LINES_PARC,
    localMaxLines: ST_PROGRAM_MAX_LINES_LOCAL,
  };
}

/**
 * @param {string} source
 * @param {{ forParc?: boolean }} [opts]
 */
function assessStProgramLines(source, opts = {}) {
  const forParc = opts.forParc === true;
  const lines = countStSourceLines(source);
  if (!forParc) {
    return {
      lines,
      limit: null,
      target: 'local',
      overLimit: false,
      headroom: null,
      pct: 0,
      errors: [],
    };
  }
  const limit = ST_PROGRAM_MAX_LINES_PARC;
  const overLimit = lines > limit;
  return {
    lines,
    limit,
    target: 'parc',
    overLimit,
    headroom: Math.max(0, limit - lines),
    pct: limit > 0 ? Math.min(100, Math.round((lines / limit) * 100)) : 0,
    errors: overLimit
      ? [`ST program is ${lines} lines (limit ${limit} for Parc/Opta deploy)`]
      : [],
  };
}

module.exports = {
  ST_PROGRAM_MAX_LINES_PARC,
  ST_PROGRAM_MAX_LINES_LOCAL,
  countStSourceLines,
  stProgramLimitsMeta,
  assessStProgramLines,
};
