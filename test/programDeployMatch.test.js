'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateProgramDeploy,
  deviceProgramStateFromRegistry,
  mergeDeviceProgramState,
  normalizeCrc,
} = require('../src/parc/programDeployMatch');

describe('programDeployMatch', () => {
  it('normalizeCrc masks to uint16 and rejects zero', () => {
    assert.equal(normalizeCrc(0x1a2b3c4d), 0x3c4d);
    assert.equal(normalizeCrc(0), 0);
    assert.equal(normalizeCrc(null), 0);
  });

  it('evaluateProgramDeploy skips when CRC matches and ST is running', () => {
    const verdict = evaluateProgramDeploy({
      pc: { crc: 0xabcd, programName: 'st/logic/36_duplex_lift_station.st' },
      device: {
        programNvCrc: 0xabcd,
        programName: '36_duplex_lift_station.st',
        programLoaded: true,
        runtimeRunning: true,
      },
    });
    assert.equal(verdict.action, 'skip');
    assert.equal(verdict.needsRuntimeStart, false);
  });

  it('evaluateProgramDeploy skips download but needs runtime_start when CRC matches and idle', () => {
    const verdict = evaluateProgramDeploy({
      pc: { crc: 0xabcd, programName: 'st/logic/foo.st' },
      device: {
        programNvCrc: 0xabcd,
        programLoaded: true,
        runtimeRunning: false,
      },
    });
    assert.equal(verdict.action, 'skip_deploy');
    assert.equal(verdict.needsRuntimeStart, true);
  });

  it('evaluateProgramDeploy deploys on CRC mismatch', () => {
    const verdict = evaluateProgramDeploy({
      pc: { crc: 0x1111, programName: 'st/logic/foo.st' },
      device: { programNvCrc: 0x2222, programLoaded: true, runtimeRunning: true },
    });
    assert.equal(verdict.action, 'deploy');
    assert.match(verdict.reason, /mismatch/i);
  });

  it('evaluateProgramDeploy deploys when device has no NV CRC', () => {
    const verdict = evaluateProgramDeploy({
      pc: { crc: 0x1111 },
      device: { programNvCrc: 0, programLoaded: false },
    });
    assert.equal(verdict.action, 'deploy');
  });

  it('deviceProgramStateFromRegistry reads runtime telemetry fields', () => {
    const state = deviceProgramStateFromRegistry({
      runtime: {
        programNvCrc: 43981,
        programName: '36_duplex_lift_station.st',
        programOk: true,
        programFromNv: true,
        autoRunOnBoot: true,
        running: true,
      },
    });
    assert.equal(state.programNvCrc, 0xabcd);
    assert.equal(state.runtimeRunning, true);
    assert.equal(state.autoRunOnBoot, true);
  });

  it('mergeDeviceProgramState prefers get_program CRC over stale telemetry', () => {
    const merged = mergeDeviceProgramState(
      { runtime: { programNvCrc: 1, running: true, programOk: true } },
      { programNvCrc: 0xabcd, programLoaded: true, programFromNv: true },
    );
    assert.equal(merged.programNvCrc, 0xabcd);
    assert.equal(merged.runtimeRunning, true);
    assert.equal(merged.source, 'get_program+telemetry');
  });
});
