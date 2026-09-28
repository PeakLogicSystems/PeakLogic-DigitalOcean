'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DUPLEX_LS_FLOAT_MAP,
  DUPLEX_LS_MCSA_CHANNELS,
  DUPLEX_LS_EXPANSIONS,
  duplexLsHardwareTags,
  applyDuplexLsIoLabels,
  mergeDuplexLsHardwareTags,
  duplexLsPdmAssetTags,
  duplexLsMcsaFeed,
} = require('../src/parc/duplexLsIoMap');

describe('duplexLsIoMap', () => {
  it('maps D1608E floats HIGH/LEAD/LAG/OFF', () => {
    assert.deepEqual(DUPLEX_LS_FLOAT_MAP.map((r) => [r.io, r.lvl]), [
      ['X1_I1', 'LVL_HIGH'],
      ['X1_I2', 'LVL_LEAD'],
      ['X1_I3', 'LVL_LAG'],
      ['X1_I4', 'LVL_OFF'],
    ]);
  });

  it('feeds I1–I6 as LIFT6 MCSA channels into motor PDM', () => {
    const feed = duplexLsMcsaFeed();
    assert.equal(feed.length, 6);
    assert.deepEqual(feed.map((r) => r.terminal), ['I1', 'I2', 'I3', 'I4', 'I5', 'I6']);
    assert.deepEqual(feed.filter((r) => r.assetId === 'pump-1').map((r) => r.ch), [0, 1, 2]);
    assert.deepEqual(feed.filter((r) => r.assetId === 'pump-2').map((r) => r.ch), [3, 4, 5]);
    assert.ok(feed.every((r) => r.ioLayout === 'LIFT6'));
  });

  it('builds hardware tags with MCSA raw + engineering amps', () => {
    const tags = duplexLsHardwareTags();
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.X1_I1.label, 'High level float');
    assert.equal(byId.X1_I4.label, 'Off float');
    assert.equal(byId.I1_RAW.type, 'INT');
    assert.equal(byId.I1_RAW.role, 'input');
    assert.match(byId.I1_RAW.label, /MCSA ch0/);
    assert.equal(byId.AI1.driverAddress.channel, 'I1_RAW');
    assert.equal(byId.AI4.type, 'REAL');
    assert.match(byId.AI4.label, /PDM pump-2/);
    assert.equal(byId.R1.role, 'output');
    assert.equal(DUPLEX_LS_EXPANSIONS[0].kind, 'D1608E');
  });

  it('relabels swapped HIGH/OFF float tags without dropping HOA memory', () => {
    const { tags, added, relabeled } = mergeDuplexLsHardwareTags([
      { id: 'X1_I1', label: 'OFF float', type: 'BOOL', role: 'input' },
      { id: 'X1_I4', label: 'High level float', type: 'BOOL', role: 'input' },
      { id: 'MOTOR1_HOA', label: 'Pump 1 HOA mode', type: 'INT', role: 'memory', value: 0 },
    ]);
    const byId = Object.fromEntries(tags.map((t) => [t.id, t]));
    assert.equal(byId.X1_I1.label, 'High level float');
    assert.equal(byId.X1_I4.label, 'Off float');
    assert.equal(byId.MOTOR1_HOA.role, 'memory');
    assert.ok(byId.I3_RAW);
    assert.ok(added >= 1);
    assert.ok(relabeled >= 1);
  });

  it('PDM asset tags include I1–I6 raw MCSA channels', () => {
    const pdm = duplexLsPdmAssetTags();
    assert.ok(pdm['pump-1'].includes('I1_RAW'));
    assert.ok(pdm['pump-1'].includes('AI1'));
    assert.ok(pdm['pump-2'].includes('I6_RAW'));
    assert.ok(!pdm['pump-1'].includes('I4_RAW'));
    assert.equal(DUPLEX_LS_MCSA_CHANNELS.length, 6);
  });

  it('applyDuplexLsIoLabels is a no-op when labels already match', () => {
    const tags = duplexLsHardwareTags().slice(0, 4);
    const once = applyDuplexLsIoLabels(tags);
    const twice = applyDuplexLsIoLabels(once.tags);
    assert.equal(twice.changed, 0);
  });
});
