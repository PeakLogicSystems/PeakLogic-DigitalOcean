'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ST_PROGRAM_MAX_LINES_PARC,
  ST_PROGRAM_MAX_LINES_LOCAL,
  countStSourceLines,
  assessStProgramLines,
  stProgramLimitsMeta,
} = require('../src/programs/stProgramLimits');

describe('stProgramLimits', () => {
  it('exports Parc deploy cap only (PC has no line limit)', () => {
    assert.equal(ST_PROGRAM_MAX_LINES_PARC, 500);
    assert.equal(ST_PROGRAM_MAX_LINES_LOCAL, null);
    assert.deepEqual(stProgramLimitsMeta(), {
      parcMaxLines: 500,
      localMaxLines: null,
    });
  });

  it('counts source lines including trailing newline', () => {
    assert.equal(countStSourceLines(''), 0);
    assert.equal(countStSourceLines('A\nB'), 2);
    assert.equal(countStSourceLines('A\r\nB\r\n'), 2);
  });

  it('never rejects programs for PC/local (no line cap)', () => {
    const src = Array.from({ length: 5000 }, (_, i) => `X${i};`).join('\n');
    const r = assessStProgramLines(src, { forParc: false });
    assert.equal(r.overLimit, false);
    assert.equal(r.lines, 5000);
    assert.equal(r.errors.length, 0);
    assert.equal(r.limit, null);
  });

  it('rejects programs over Parc deploy limit', () => {
    const src = Array.from({ length: 501 }, (_, i) => `TurnOFF(T${i});`).join('\n');
    const r = assessStProgramLines(src, { forParc: true });
    assert.equal(r.overLimit, true);
    assert.match(r.errors[0], /501 lines/);
    assert.match(r.errors[0], /500/);
    assert.match(r.errors[0], /Parc/);
  });
});
