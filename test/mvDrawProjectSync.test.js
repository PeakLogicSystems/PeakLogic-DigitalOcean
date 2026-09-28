'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPeaklogicProjectContext,
  alignMvDrawForPeaklogicProject,
  shouldAutoLoadFromProject,
  DEFAULT_FACILITY_PLAN_URL,
} = require('../mv-draw/src/projectSync');
const { blankMvDrawDoc } = require('../mv-draw/src/mvDrawFormat');
const { normalizeComposerMode } = require('../src/hmi/hmiConfig');

describe('mvDraw project sync', () => {
  it('buildPeaklogicProjectContext reports PeakLogic project path', () => {
    const ctx = buildPeaklogicProjectContext(
      { project: { name: 'atu-cloud-dwts', lastOpenedId: 'abc' } },
      { savedAt: '2026-01-01T00:00:00.000Z', mvDraw: { nodes: [{ id: 'n1' }] } },
      blankMvDrawDoc(),
    );
    assert.equal(ctx.projectName, 'atu-cloud-dwts');
    assert.equal(ctx.estPath, 'data/projects/atu-cloud-dwts.est.json');
    assert.equal(ctx.hasProjectMvDraw, true);
    assert.equal(ctx.synced, false);
  });

  it('alignMvDrawForPeaklogicProject sets name and peaklogicProject meta on integration', () => {
    const ctx = { projectName: 'dwts-magnolia' };
    const aligned = alignMvDrawForPeaklogicProject(blankMvDrawDoc({ name: 'other' }), ctx, {
      project: { site: 'Magnolia Estates' },
    });
    assert.equal(aligned.name, 'dwts-magnolia');
    assert.equal(aligned.meta.peaklogicProject, 'dwts-magnolia');
    assert.equal(aligned.meta.site, 'Magnolia Estates');
  });

  it('shouldAutoLoadFromProject only for blank untitled unsynced layouts', () => {
    const ctx = { hasProjectMvDraw: true, synced: false };
    assert.equal(shouldAutoLoadFromProject(ctx, blankMvDrawDoc()), true);
    assert.equal(shouldAutoLoadFromProject(ctx, { ...blankMvDrawDoc(), nodes: [{ id: 'a' }] }), false);
    assert.equal(shouldAutoLoadFromProject({ ...ctx, synced: true }, blankMvDrawDoc()), false);
  });

  it('DEFAULT_FACILITY_PLAN_URL points at embedded MV Draw', () => {
    assert.match(DEFAULT_FACILITY_PLAN_URL, /^\/mv-draw\?embedded=1$/);
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
