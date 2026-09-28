'use strict';

const { computeLeakDetectionRoi, computePoolRoi } = require('./roiCalculator');

const DEFAULT_LEAK = {
  systemCost: 0,
  amortizationYears: 5,
  repairCostPerEvent: 90,
  eventsPerYear: 4,
};

const DEFAULT_POOL = {
  pumpUpgradeCost: 0,
  chemicalSystemCost: 0,
  amortizationYears: 7,
  monthlyEnergySavings: 0,
  monthlyChemicalSavings: 0,
};

function clampMoney(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function clampYears(v, fallback, max = 30) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

function normalizeLeakDetection(incoming, prev = {}) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    systemCost: clampMoney(src.systemCost ?? p.systemCost, DEFAULT_LEAK.systemCost),
    amortizationYears: clampYears(src.amortizationYears ?? p.amortizationYears, DEFAULT_LEAK.amortizationYears),
    repairCostPerEvent: clampMoney(src.repairCostPerEvent ?? p.repairCostPerEvent, DEFAULT_LEAK.repairCostPerEvent),
    eventsPerYear: clampMoney(src.eventsPerYear ?? p.eventsPerYear, DEFAULT_LEAK.eventsPerYear),
  };
}

function normalizePool(incoming, prev = {}) {
  const p = prev && typeof prev === 'object' ? prev : {};
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  return {
    pumpUpgradeCost: clampMoney(src.pumpUpgradeCost ?? p.pumpUpgradeCost, DEFAULT_POOL.pumpUpgradeCost),
    chemicalSystemCost: clampMoney(src.chemicalSystemCost ?? p.chemicalSystemCost, DEFAULT_POOL.chemicalSystemCost),
    amortizationYears: clampYears(src.amortizationYears ?? p.amortizationYears, DEFAULT_POOL.amortizationYears),
    monthlyEnergySavings: clampMoney(src.monthlyEnergySavings ?? p.monthlyEnergySavings, DEFAULT_POOL.monthlyEnergySavings),
    monthlyChemicalSavings: clampMoney(src.monthlyChemicalSavings ?? p.monthlyChemicalSavings, DEFAULT_POOL.monthlyChemicalSavings),
  };
}

function normalizeRoiSettings(incoming, prev = {}) {
  const prevRoi = prev?.roi && typeof prev.roi === 'object' ? prev.roi : {};
  if (incoming === null) return {};
  if (incoming === undefined) return { ...prevRoi };
  if (typeof incoming !== 'object') return { ...prevRoi };

  return {
    leakDetection: normalizeLeakDetection(incoming.leakDetection, prevRoi.leakDetection),
    pool: normalizePool(incoming.pool, prevRoi.pool),
  };
}

function computeRoiSummary(roi = {}) {
  const leakDetection = computeLeakDetectionRoi(roi.leakDetection || {});
  const pool = computePoolRoi(roi.pool || {});
  const combinedAnnualGross = leakDetection.annualGrossSavings + pool.annualGrossSavings;
  const combinedUpfront = leakDetection.systemCost + pool.totalUpfrontCost;
  const combinedAmortizedAnnual = leakDetection.amortizedAnnualCost + pool.amortizedAnnualCost;
  return {
    leakDetection,
    pool,
    combined: {
      annualGrossSavings: Math.round((combinedAnnualGross) * 100) / 100,
      upfrontCost: Math.round(combinedUpfront * 100) / 100,
      netAnnualBenefit: Math.round((combinedAnnualGross - combinedAmortizedAnnual) * 100) / 100,
    },
  };
}

module.exports = {
  DEFAULT_LEAK,
  DEFAULT_POOL,
  normalizeRoiSettings,
  computeRoiSummary,
};
