'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandRemoteProgramTrace } = require('../src/parc/remoteProgramTrace');

describe('remoteProgramTrace', () => {
  const traceMap = [
    { k: 'bool', s: 3, e: 10 },
    { k: 'out', s: 30, e: 32, t: 'R1' },
    { k: 'num', s: 50, e: 55 },
  ];

  it('returns empty when map or compact missing', () => {
    assert.deepEqual(expandRemoteProgramTrace([], [[0, 1]]), []);
    assert.deepEqual(expandRemoteProgramTrace(traceMap, []), []);
    assert.deepEqual(expandRemoteProgramTrace(null, null), []);
  });

  it('expands compact telemetry into overlay rows', () => {
    const rows = expandRemoteProgramTrace(traceMap, [[0, 1], [1, 0], [2, 42.5]]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { start: 3, end: 10, kind: 'bool', value: true });
    assert.deepEqual(rows[1], { start: 30, end: 32, kind: 'out', value: false, tag: 'R1' });
    assert.deepEqual(rows[2], { start: 50, end: 55, kind: 'num', value: 42.5 });
  });

  it('skips unknown indices and invalid compact rows', () => {
    const rows = expandRemoteProgramTrace(traceMap, [[0, 1], ['x', 2], [99, 5]]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'bool');
  });

  it('accepts legacy kind/start/end field names', () => {
    const legacyMap = [{ kind: 'bool', start: 1, end: 4 }];
    const rows = expandRemoteProgramTrace(legacyMap, [[0, 0]]);
    assert.deepEqual(rows[0], { start: 1, end: 4, kind: 'bool', value: false });
  });
});
