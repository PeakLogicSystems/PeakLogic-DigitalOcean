'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProfile,
  profileFromBrowsePoints,
  resolveSlotToPoint,
  buildTagsForDevice,
  buildTagsForFleet,
  deviceMatchesProfile,
} = require('../src/drivers/bacnetDeviceBuilder');

describe('bacnetDeviceBuilder', () => {
  const samplePoints = [
    {
      deviceInstance: 1001,
      host: '10.0.0.10',
      objectType: 0,
      objectTypeLabel: 'analogInput',
      objectInstance: 1,
      objectName: 'Space Temp',
      property: 85,
      suggestedTagType: 'REAL',
    },
    {
      deviceInstance: 1001,
      host: '10.0.0.10',
      objectType: 1,
      objectTypeLabel: 'analogOutput',
      objectInstance: 2,
      objectName: 'Damper Cmd',
      property: 85,
      suggestedTagType: 'REAL',
    },
  ];

  it('builds profile from browse points', () => {
    const p = profileFromBrowsePoints({
      id: 'vav_sample',
      label: 'Sample VAV',
      points: samplePoints,
    });
    assert.equal(p.slots.length, 2);
    assert.equal(p.slots[0].match.type, 'name');
  });

  it('resolves fixed and name slots', () => {
    const profile = normalizeProfile({
      id: 'test',
      label: 'Test',
      slots: [
        {
          slotId: 'fixed_ai',
          label: 'AI1',
          tagId: 'AI1',
          objectType: 'analogInput',
          match: { type: 'fixed', objectInstance: 1 },
        },
        {
          slotId: 'named_damper',
          label: 'Damper',
          tagId: 'DMP',
          objectType: 'analogOutput',
          match: { type: 'name', pattern: 'damper' },
        },
      ],
    });
    const fixed = resolveSlotToPoint(profile.slots[0], samplePoints);
    assert.equal(fixed.objectInstance, 1);
    const named = resolveSlotToPoint(profile.slots[1], samplePoints);
    assert.match(named.objectName, /Damper/i);
  });

  it('builds tags for multiple devices from one profile', () => {
    const profile = profileFromBrowsePoints({
      id: 'vav',
      label: 'VAV',
      points: samplePoints,
    });
    const devices = [
      { host: '10.0.0.10', deviceInstance: 1001, objectName: 'VAV-1' },
      { host: '10.0.0.11', deviceInstance: 1002, objectName: 'VAV-2' },
    ];
    const browseByKey = new Map([
      ['10.0.0.10|1001', samplePoints],
      ['10.0.0.11|1002', samplePoints.map((p) => ({ ...p, deviceInstance: 1002, host: '10.0.0.11' }))],
    ]);
    const fleet = buildTagsForFleet(profile, devices, browseByKey, 'bacnet1', { allowPartial: true });
    assert.equal(fleet.ok, true);
    assert.equal(fleet.tagCount, 4);
    assert.ok(fleet.tags.some((t) => t.id.includes('1001')));
    assert.ok(fleet.tags.some((t) => t.id.includes('1002')));
  });

  it('filters devices by name pattern', () => {
    const profile = normalizeProfile({
      id: 'vav_only',
      label: 'VAV only',
      deviceNamePattern: 'VAV',
      slots: [{
        slotId: 'ai1',
        label: 'AI',
        tagId: 'AI1',
        objectType: 'analogInput',
        match: { type: 'fixed', objectInstance: 1 },
      }],
    });
    assert.equal(deviceMatchesProfile({ objectName: 'VAV-01' }, profile), true);
    assert.equal(deviceMatchesProfile({ objectName: 'AHU-01' }, profile), false);
  });

  it('buildTagsForDevice reports unresolved required slots', () => {
    const profile = normalizeProfile({
      id: 'strict',
      label: 'Strict',
      slots: [{
        slotId: 'missing',
        label: 'Missing',
        tagId: 'MISS',
        objectType: 'multiStateValue',
        match: { type: 'fixed', objectInstance: 99 },
      }],
    });
    const r = buildTagsForDevice(
      profile,
      { host: '10.0.0.5', deviceInstance: 50, objectName: 'X' },
      samplePoints,
      'bacnet1',
    );
    assert.equal(r.tags.length, 0);
    assert.equal(r.unresolved.length, 1);
  });
});
