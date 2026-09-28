'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { ST_DIR } = require('../src/config');
const {
  PROJECT,
  AHU_IO,
  COND_IO,
  DEFAULT_AHU_NTC_CAL,
  DEFAULT_AHU_LEAK_CAL,
  DEFAULT_COND_MCSA,
} = require('../scripts/facility-hvac-iot-link/project-data');

const ROOT = path.join(__dirname, '..');
const EST = path.join(ROOT, 'data', 'projects', 'facility-hvac-iot-link.est.json');
const ST = path.join(ST_DIR, 'logic', 'facility_hvac_iot_link.st');

describe('facility-hvac-iot-link', () => {
  it('generate-est.js writes project with AHU env cal settings', () => {
    execFileSync(process.execPath, ['scripts/facility-hvac-iot-link/generate-est.js'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    assert.ok(fs.existsSync(EST));
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    assert.equal(est.project.name, PROJECT.name);
    assert.equal(est.program, PROJECT.programFile);
    assert.equal(est.drivers.length, 3);
    const cal = est.settings.facilityHvac.ahuEnvCal;
    assert.equal(cal.optaPage, '/ahu-env');
    assert.equal(cal.ntcPoints.length, 4);
    assert.equal(cal.leakPoints.length, 2);
    assert.deepEqual(
      cal.ntcPoints.map((p) => p.input),
      DEFAULT_AHU_NTC_CAL.map((p) => p.input),
    );
    assert.deepEqual(
      cal.leakPoints.map((p) => p.input),
      DEFAULT_AHU_LEAK_CAL.map((p) => p.input),
    );
  });

  it('tags include dual AHU CT, NTC, leak, and condenser drivers', () => {
    const tags = JSON.parse(
      fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.facility_hvac_iot_link.json'), 'utf8'),
    );
    const ids = new Set(tags.map((t) => t.id));
    for (const row of AHU_IO.ct) assert.ok(ids.has(row.tag), row.tag);
    for (const row of AHU_IO.ntc) assert.ok(ids.has(row.tag), row.tag);
    for (const row of AHU_IO.leak) {
      assert.ok(ids.has(row.tag), row.tag);
    }
    assert.ok(ids.has('COND1_COMP_START_AMPS'));
    assert.ok(ids.has('COND2_FAN_START_AMPS'));
    assert.ok(!ids.has('COND2_LOCKOUT'));
    assert.ok(!ids.has('X1_I1'));
    assert.ok(ids.has('FACILITY_ALM'));
    assert.ok(ids.has('MECH_PQ_ALM'));
  });

  it('settings document dual condenser MCSA on one Opta', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const mcsa = est.settings.facilityHvac.condMcsa;
    assert.equal(mcsa.motorCount, 4);
    assert.equal(mcsa.motors.length, 4);
    assert.equal(mcsa.motors[0].wiring, '1P+cap');
    assert.equal(mcsa.motors[0].ctRun, 'I2');
    assert.equal(mcsa.motors[0].ctStart, 'I1');
    assert.equal(mcsa.motors[2].ctRun, 'I6');
    assert.equal(mcsa.motors[2].ctStart, 'I5');
    assert.equal(mcsa.ntc[0].input, 'X1_IRAW1');
    assert.equal(est.settings.facilityHvac.condIoMap.ct.length, 8);
    const condDrivers = est.drivers.filter((d) => d.id === 'opta_cond');
    assert.equal(condDrivers.length, 1);
    assert.equal(condDrivers[0].deviceId, 'hvac_cond_01');
  });

  it('facility_hvac_iot_link.st validates against fixture tags', () => {
    const tags = JSON.parse(
      fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.facility_hvac_iot_link.json'), 'utf8'),
    );
    const src = fs.readFileSync(ST, 'utf8');
    const ast = parseProgram(src);
    const errors = validateProgram(
      ast,
      tags.map((t) => t.id),
    );
    assert.deepEqual(errors, [], errors.join('; '));
  });
});
