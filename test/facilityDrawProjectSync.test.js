'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPeaklogicProjectContext,
  alignFacilityDrawForPeaklogicProject,
  shouldAutoLoadFromProject,
  DEFAULT_FACILITY_PLAN_URL,
} = require('../facility-draw/src/projectSync');
const { blankFacilityDrawDoc } = require('../facility-draw/src/facilityDrawFormat');
const { normalizeComposerMode } = require('../src/hmi/hmiConfig');

describe('facilityDraw project sync', () => {
  it('buildPeaklogicProjectContext reports PeakLogic project path', () => {
    const ctx = buildPeaklogicProjectContext(
      { project: { name: 'atu-cloud-dwts', lastOpenedId: 'abc' } },
      { savedAt: '2026-01-01T00:00:00.000Z', facilityDraw: { nodes: [{ id: 'n1' }] } },
      blankFacilityDrawDoc(),
    );
    assert.equal(ctx.projectName, 'atu-cloud-dwts');
    assert.equal(ctx.estPath, 'data/projects/atu-cloud-dwts.est.json');
    assert.equal(ctx.hasProjectFacilityDraw, true);
    assert.equal(ctx.synced, false);
  });

  it('alignFacilityDrawForPeaklogicProject sets name and peaklogicProject meta on integration', () => {
    const ctx = { projectName: 'dwts-magnolia' };
    const aligned = alignFacilityDrawForPeaklogicProject(blankFacilityDrawDoc({ name: 'other' }), ctx, {
      project: { site: 'Magnolia Estates' },
    });
    assert.equal(aligned.name, 'dwts-magnolia');
    assert.equal(aligned.meta.peaklogicProject, 'dwts-magnolia');
    assert.equal(aligned.meta.site, 'Magnolia Estates');
  });

  it('shouldAutoLoadFromProject only for blank untitled unsynced layouts', () => {
    const ctx = { hasProjectFacilityDraw: true, synced: false };
    assert.equal(shouldAutoLoadFromProject(ctx, blankFacilityDrawDoc()), true);
    assert.equal(shouldAutoLoadFromProject(ctx, { ...blankFacilityDrawDoc(), nodes: [{ id: 'a' }] }), false);
    assert.equal(shouldAutoLoadFromProject({ ...ctx, synced: true }, blankFacilityDrawDoc()), false);
  });

  it('DEFAULT_FACILITY_PLAN_URL points at embedded Facility Draw', () => {
    assert.match(DEFAULT_FACILITY_PLAN_URL, /^\/facility-draw\?embedded=1$/);
  });
});

describe('hmi composer plan mode', () => {
  it('normalizeComposerMode accepts plan', () => {
    assert.equal(normalizeComposerMode('plan'), 'plan');
    assert.equal(normalizeComposerMode('PLAN'), 'plan');
    assert.equal(normalizeComposerMode('grid'), 'grid');
    assert.equal(normalizeComposerMode('bogus'), 'grid');
  });
});
