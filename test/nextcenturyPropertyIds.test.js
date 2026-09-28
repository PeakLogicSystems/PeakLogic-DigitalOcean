'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMISSIONING_PROPERTY_IDS,
  isPlaceholderNcPropertyIds,
  resolveNextcenturyPropertyIds,
} = require('../src/settings/nextcenturyPropertyIds');
const {
  normalizeAssistedLiving,
  patchNextcenturyDriverPropertyIds,
} = require('../src/settings/assistedLivingSettings');

describe('nextcenturyPropertyIds', () => {
  it('detects synthetic ALF placeholder property IDs', () => {
    assert.equal(isPlaceholderNcPropertyIds([40100, 40101, 40102, 40103]), true);
    assert.equal(isPlaceholderNcPropertyIds(COMMISSIONING_PROPERTY_IDS), false);
    assert.equal(isPlaceholderNcPropertyIds([39990, 40074]), false);
  });

  it('maps placeholders to commissioning IDs', () => {
    assert.deepEqual(
      resolveNextcenturyPropertyIds([40100, 40101, 40102, 40103]),
      COMMISSIONING_PROPERTY_IDS,
    );
    assert.deepEqual(resolveNextcenturyPropertyIds([40074]), [40074]);
  });
});

describe('assistedLivingSettings nextCentury propertyIds', () => {
  it('normalizeAssistedLiving upgrades placeholder propertyIds', () => {
    const next = normalizeAssistedLiving({
      nextCentury: { propertyIds: [40100, 40101, 40102, 40103] },
    });
    assert.deepEqual(next.nextCentury.propertyIds, COMMISSIONING_PROPERTY_IDS);
  });

  it('patchNextcenturyDriverPropertyIds fixes nextcentury driver snapshot', () => {
    const drivers = [{
      id: 'nextcentury1',
      type: 'nextcentury',
      propertyIds: [40100, 40101, 40102, 40103],
    }];
    const patched = patchNextcenturyDriverPropertyIds(drivers, null);
    assert.deepEqual(patched[0].propertyIds, COMMISSIONING_PROPERTY_IDS);
  });
});
