'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { estimateOptaDeploy } = require('../src/parc/mqttOptaProgram');

describe('motor_tpo_combined deploy estimate', () => {
  it('compiles and estimates under limit', () => {
    const fixtureTags = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../st/fixtures/tags.motor_tpo_combined.json'),
      'utf8',
    ));
    const tagStore = { list: () => fixtureTags };
    const src = fs.readFileSync(
      path.join(__dirname, '../st/logic/24_motor_tpo_combined.st'),
      'utf8',
    );
    const est = estimateOptaDeploy(src, tagStore, 'opta_st_01', {
      programName: 'logic/24_motor_tpo_combined.st',
    });
    if (!est.ok) {
      assert.fail(`deploy estimate failed: ${(est.errors || []).join('; ')}`);
    }
    assert.ok(est.bytes > 0);
    assert.ok(est.tagCount > 0);
  });
});
