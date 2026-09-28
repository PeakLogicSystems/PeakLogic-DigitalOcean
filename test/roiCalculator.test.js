'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeLeakDetectionRoi,
  computePoolRoi,
} = require('../src/settings/roiCalculator');
const { normalizeRoiSettings } = require('../src/settings/roiSettings');

describe('roiCalculator', () => {
  it('computes leak detection ROI with $90 repair cost example', () => {
    const r = computeLeakDetectionRoi({
      systemCost: 5000,
      amortizationYears: 5,
      repairCostPerEvent: 90,
      eventsPerYear: 4,
    });
    assert.equal(r.annualGrossSavings, 360);
    assert.equal(r.amortizedAnnualCost, 1000);
    assert.equal(r.netAnnualBenefit, -640);
    assert.equal(r.paybackMonths, 166.67);
    assert.equal(r.roiPercent, -64);
  });

  it('computes pool pump and chemical monthly savings', () => {
    const r = computePoolRoi({
      pumpUpgradeCost: 2400,
      chemicalSystemCost: 1600,
      amortizationYears: 8,
      monthlyEnergySavings: 85,
      monthlyChemicalSavings: 120,
    });
    assert.equal(r.totalUpfrontCost, 4000);
    assert.equal(r.monthlyTotalSavings, 205);
    assert.equal(r.annualGrossSavings, 2460);
    assert.equal(r.amortizedAnnualCost, 500);
    assert.equal(r.netAnnualBenefit, 1960);
    assert.equal(r.paybackMonths, 19.51);
    assert.ok(r.roiPercent > 390);
  });

  it('normalizes roi settings with defaults', () => {
    const roi = normalizeRoiSettings({}, {});
    assert.equal(roi.leakDetection.repairCostPerEvent, 90);
    assert.equal(roi.leakDetection.amortizationYears, 5);
    assert.equal(roi.pool.amortizationYears, 7);
  });
});
