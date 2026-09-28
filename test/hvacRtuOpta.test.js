'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseProgram, validateProgram } = require('../src/engine/parser');
const { ST_DIR } = require('../src/config');
const { PROJECT, RTU_IO, DEFAULT_RTU_MCSA } = require('../scripts/hvac-rtu-opta/project-data');

const ROOT = path.join(__dirname, '..');
const EST = path.join(ROOT, 'data', 'projects', 'hvac-rtu-opta.est.json');
const ST = path.join(ST_DIR, 'logic', 'hvac_rtu_opta.st');

describe('hvac-rtu-opta', () => {
  it('generate-est.js writes RTU project', () => {
    execFileSync(process.execPath, ['scripts/hvac-rtu-opta/generate-est.js'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    assert.ok(fs.existsSync(EST));
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    assert.equal(est.project.name, PROJECT.name);
    assert.equal(est.drivers.length, 1);
    assert.equal(est.drivers[0].id, 'opta_rtu');
    assert.equal(est.drivers[0].deviceId, 'hvac_rtu_01');
  });

  it('tags include blower/fan/comp CT, NTC, and leak', () => {
    const tags = JSON.parse(
      fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.hvac_rtu_opta.json'), 'utf8'),
    );
    const ids = new Set(tags.map((t) => t.id));
    for (const row of RTU_IO.ct) assert.ok(ids.has(row.channel), row.channel);
    for (const row of RTU_IO.ntc) assert.ok(ids.has(row.tag), row.tag);
    assert.ok(ids.has('RTU_PAN_LEAK'));
    assert.ok(ids.has('RTU_FAIL_ALM'));
    const rtuTags = tags.filter((t) => t.driverId === 'opta_rtu');
    assert.ok(rtuTags.length >= 10);
  });

  it('settings document RTU leak analog cal on X1_IRAW5', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const leak = est.settings.facilityHvac.rtuEnvCal.leakPoints;
    assert.equal(leak.length, 1);
    assert.equal(leak[0].input, 'X1_IRAW5');
    assert.equal(leak[0].thresholdMv, 2500);
  });

  it('settings document RTU MCSA 3 motors on I1–I6', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const mcsa = est.settings.facilityHvac.rtuMcsa;
    assert.equal(mcsa.motorCount, 3);
    assert.equal(mcsa.motors.length, 3);
    assert.equal(mcsa.motors[0].assetId, 'blower');
    assert.equal(mcsa.motors[0].ctRun, 'I2');
    assert.equal(mcsa.motors[2].ctRun, 'I6');
    assert.equal(mcsa.ntc.length, 4);
    assert.deepEqual(
      DEFAULT_RTU_MCSA.motors.map((m) => m.assetId),
      ['blower', 'fan', 'comp'],
    );
  });

  it('hvac_rtu_opta.st validates against fixture tags', () => {
    const tags = JSON.parse(
      fs.readFileSync(path.join(ST_DIR, 'fixtures', 'tags.hvac_rtu_opta.json'), 'utf8'),
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
