'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  buildPdmSeedsFromPreset,
  mergePdmSeedsIntoSettings,
  seedPdmFromPreset,
} = require('../src/pdm/pdmAssetSeedFromTemplate');
const { getPreset } = require('../src/devices/devicePresets');

describe('pdmAssetSeedFromTemplate', () => {
  it('seeds duplex lift station pumps with install history', () => {
    const preset = getPreset('lift_station_dual_duplex');
    assert.ok(preset);
    const seeds = buildPdmSeedsFromPreset(preset, {
      deviceId: 'ls01',
      siteName: 'Test Mall LS',
      installDate: '2020-05-01',
    });
    assert.deepEqual(seeds.seeded.sort(), ['pump-1', 'pump-2']);
    assert.equal(seeds.assetContext['pump-2'].pumpRole, 'lag');
    assert.equal(seeds.assetContext['pump-1'].serviceHistory[0].type, 'install');
    assert.equal(seeds.assetContext['pump-1'].installDate, '2020-05-01');
    assert.ok(seeds.assetTags['pump-1'].includes('MOTOR1_HRS'));
    assert.ok(seeds.assetTags['pump-1'].includes('MOTOR1_START_MS'));
    assert.ok(seeds.assetTags['pump-2'].includes('I4_RAW'));
  });

  it('seeds arduino opta parc duplex pumps', () => {
    const preset = getPreset('arduino_opta_parc');
    assert.ok(preset?.pdm?.assets?.length === 2);
    const seeds = buildPdmSeedsFromPreset(preset, { installDate: '2020-05-01' });
    assert.deepEqual(seeds.seeded.sort(), ['pump-1', 'pump-2']);
  });

  it('seeds triplex with three pumps', () => {
    const preset = getPreset('lift_station_triplex');
    const seeds = buildPdmSeedsFromPreset(preset, { installDate: '2019-01-01' });
    assert.equal(seeds.seeded.length, 3);
    assert.equal(seeds.assetContext['pump-3'].pumpRole, 'lag2');
  });

  it('skips existing assets unless overwrite', () => {
    const preset = getPreset('lift_station_dual_duplex');
    const first = buildPdmSeedsFromPreset(preset, { installDate: '2020-01-01' });
    let settings = mergePdmSeedsIntoSettings({}, first);
    const second = buildPdmSeedsFromPreset(preset, {
      installDate: '2024-01-01',
      existingContext: settings.pdm.assetContext,
    });
    assert.equal(second.seeded.length, 0);
    assert.equal(second.skipped.sort().join(','), 'pump-1,pump-2');
    assert.equal(settings.pdm.assetContext['pump-1'].installDate, '2020-01-01');
  });

  it('merges into settings for project save', () => {
    const preset = getPreset('lift_station_simplex');
    const result = seedPdmFromPreset(preset, {}, { installDate: '2021-03-15' });
    assert.equal(result.changed, true);
    assert.ok(result.settings.pdm.assetContext['pump-1']);
    assert.ok(result.settings.pdm.assetTags['pump-1'].length >= 3);
  });
});
