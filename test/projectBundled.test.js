'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BUNDLED, GENERATORS, SCAN_VARIANTS } = require('../scripts/ensure-bundled-projects');

describe('ensure-bundled-projects', () => {
  it('lists all demo project ids', () => {
    assert.ok(BUNDLED.includes('duplex-lift-station'));
    assert.ok(BUNDLED.includes('assisted-living'));
    assert.ok(BUNDLED.includes('atu-cloud-dwts'));
    assert.ok(BUNDLED.includes('putnam-mle-plant'));
    assert.ok(BUNDLED.includes('mle-poc-50gpd'));
    assert.ok(BUNDLED.includes('opta-split-hvac'));
    assert.ok(BUNDLED.includes('opta-double-split-hvac'));
    assert.equal(BUNDLED.length, 18);
  });

  it('generator projects are subset of bundled list', () => {
    const fromGenerators = GENERATORS.flatMap((g) => g.projects);
    const fromScan = SCAN_VARIANTS.map((v) => v.projectId);
    for (const id of [...fromGenerators, ...fromScan]) {
      assert.ok(BUNDLED.includes(id), `missing bundled id: ${id}`);
    }
  });
});
