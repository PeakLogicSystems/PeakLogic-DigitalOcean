'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { optaStatusToParcReport } = require('../src/parc/optaTelemetryMapper');

describe('optaStatusToParcReport', () => {
  it('maps built-in DI and mA to tags', () => {
    const report = optaStatusToParcReport('opta_full_io_01', {
      di_builtIn: [true, false],
      analog: { mA: [12.5, 4.0], scaled_mA: [50, 0] },
    });
    assert.equal(report.deviceId, 'opta_full_io_01');
    assert.ok(report.tags.find((t) => t.id === 'DI1' && t.value === true));
    assert.ok(report.tags.find((t) => t.id === 'mA_AI3' && t.value === 12.5));
  });
});
