'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PeakLogicRoi = api;
})(typeof window !== 'undefined' ? window : globalThis, function roiCalculatorFactory() {
  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function computeLeakDetectionRoi(input = {}) {
    const systemCost = Math.max(0, num(input.systemCost, 0));
    const amortizationYears = Math.max(1, num(input.amortizationYears, 5));
    const repairCostPerEvent = Math.max(0, num(input.repairCostPerEvent, 90));
    const eventsPerYear = Math.max(0, num(input.eventsPerYear, 0));

    const annualGrossSavings = repairCostPerEvent * eventsPerYear;
    const amortizedAnnualCost = systemCost / amortizationYears;
    const netAnnualBenefit = annualGrossSavings - amortizedAnnualCost;
    const paybackMonths = annualGrossSavings > 0 ? (systemCost / annualGrossSavings) * 12 : null;
    const totalSavingsOverLife = annualGrossSavings * amortizationYears;
    const roiPercent = systemCost > 0
      ? round2(((totalSavingsOverLife - systemCost) / systemCost) * 100)
      : (totalSavingsOverLife > 0 ? 100 : 0);

    return {
      systemCost,
      amortizationYears,
      repairCostPerEvent,
      eventsPerYear,
      annualGrossSavings: round2(annualGrossSavings),
      amortizedAnnualCost: round2(amortizedAnnualCost),
      netAnnualBenefit: round2(netAnnualBenefit),
      paybackMonths: paybackMonths != null ? round2(paybackMonths) : null,
      roiPercent,
      totalSavingsOverLife: round2(totalSavingsOverLife),
    };
  }

  function computePoolRoi(input = {}) {
    const pumpUpgradeCost = Math.max(0, num(input.pumpUpgradeCost, 0));
    const chemicalSystemCost = Math.max(0, num(input.chemicalSystemCost, 0));
    const totalUpfrontCost = pumpUpgradeCost + chemicalSystemCost;
    const amortizationYears = Math.max(1, num(input.amortizationYears, 7));
    const monthlyEnergySavings = Math.max(0, num(input.monthlyEnergySavings, 0));
    const monthlyChemicalSavings = Math.max(0, num(input.monthlyChemicalSavings, 0));

    const monthlyTotalSavings = monthlyEnergySavings + monthlyChemicalSavings;
    const annualGrossSavings = monthlyTotalSavings * 12;
    const amortizedAnnualCost = totalUpfrontCost / amortizationYears;
    const netAnnualBenefit = annualGrossSavings - amortizedAnnualCost;
    const paybackMonths = monthlyTotalSavings > 0 ? totalUpfrontCost / monthlyTotalSavings : null;
    const totalSavingsOverLife = annualGrossSavings * amortizationYears;
    const roiPercent = totalUpfrontCost > 0
      ? round2(((totalSavingsOverLife - totalUpfrontCost) / totalUpfrontCost) * 100)
      : (totalSavingsOverLife > 0 ? 100 : 0);

    return {
      pumpUpgradeCost,
      chemicalSystemCost,
      totalUpfrontCost: round2(totalUpfrontCost),
      amortizationYears,
      monthlyEnergySavings: round2(monthlyEnergySavings),
      monthlyChemicalSavings: round2(monthlyChemicalSavings),
      monthlyTotalSavings: round2(monthlyTotalSavings),
      annualGrossSavings: round2(annualGrossSavings),
      amortizedAnnualCost: round2(amortizedAnnualCost),
      netAnnualBenefit: round2(netAnnualBenefit),
      paybackMonths: paybackMonths != null ? round2(paybackMonths) : null,
      roiPercent,
      totalSavingsOverLife: round2(totalSavingsOverLife),
    };
  }

  function formatMoney(amount, currency = 'USD') {
    const n = num(amount, 0);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `$${n.toFixed(0)}`;
    }
  }

  function formatMonths(months) {
    if (months == null || !Number.isFinite(months)) return '—';
    if (months < 1) return '< 1 mo';
    if (months < 24) return `${round2(months)} mo`;
    const yrs = months / 12;
    return `${round2(yrs)} yr (${round2(months)} mo)`;
  }

  return {
    computeLeakDetectionRoi,
    computePoolRoi,
    formatMoney,
    formatMonths,
  };
});
