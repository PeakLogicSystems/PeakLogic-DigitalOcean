'use strict';

function formatTealPeriod(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error('invalid billing period date'), { status: 400 });
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function defaultBillingPeriod(now = new Date()) {
  const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
  return {
    periodStart,
    periodEnd: formatTealPeriod(now),
  };
}

function normalizeBillingPeriod(periodStart, periodEnd) {
  const defaults = defaultBillingPeriod();
  return {
    periodStart: String(periodStart || defaults.periodStart).trim(),
    periodEnd: String(periodEnd || defaults.periodEnd).trim(),
  };
}

function billingPeriodKey(period) {
  return `${period.periodStart}|${period.periodEnd}`;
}

function simHasBillingForPeriod(sim, period) {
  const b = sim?.metadata?.billing;
  if (!b) return false;
  return b.periodStart === period.periodStart && b.periodEnd === period.periodEnd;
}

function billingLineFromSim(sim) {
  const b = sim?.metadata?.billing || {};
  return {
    simId: sim.id,
    iccid: sim.iccid,
    eid: sim.eid || sim.vendorSimId || null,
    tenantId: sim.tenantId || null,
    deviceId: sim.deviceId || null,
    gatewayId: sim.gatewayId || null,
    status: sim.status,
    plan: b.planName || sim.plan || null,
    usageMb: b.usageMb ?? sim.dataUsageMb ?? null,
    serviceFee: b.serviceFee ?? null,
    amount: b.amount ?? null,
    currency: b.currency || 'USD',
    periodStart: b.periodStart || null,
    periodEnd: b.periodEnd || null,
    syncedAt: b.syncedAt || null,
    planLines: Array.isArray(b.planLines) ? b.planLines : [],
  };
}

function buildBillingReport(sims, period, invoicePreview = null) {
  const lines = (sims || []).map(billingLineFromSim);
  const totalAmount = lines.reduce((sum, line) => {
    const amount = Number(line.amount);
    const fee = Number(line.serviceFee);
    return sum + (Number.isFinite(amount) ? amount : 0) + (Number.isFinite(fee) ? fee : 0);
  }, 0);
  const totalUsageMb = lines.reduce((sum, line) => {
    const usage = Number(line.usageMb);
    return sum + (Number.isFinite(usage) ? usage : 0);
  }, 0);

  const invoice = invoicePreview && typeof invoicePreview === 'object'
    ? {
      totalPrice: invoicePreview.totalPrice ?? null,
      costCenterName: invoicePreview.costCenterName || null,
      entries: Array.isArray(invoicePreview.entries) ? invoicePreview.entries : [],
    }
    : null;

  return {
    period,
    lines,
    invoice,
    summary: {
      count: lines.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalUsageMb: Math.round(totalUsageMb * 100) / 100,
      currency: 'USD',
      invoiceTotal: invoice?.totalPrice ?? null,
    },
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function billingReportToCsv(report) {
  const header = [
    'iccid',
    'eid',
    'tenantId',
    'deviceId',
    'gatewayId',
    'status',
    'plan',
    'usageMb',
    'serviceFee',
    'amount',
    'currency',
    'periodStart',
    'periodEnd',
    'syncedAt',
  ];
  const rows = (report?.lines || []).map((line) => [
    line.iccid,
    line.eid || '',
    line.tenantId || '',
    line.deviceId || '',
    line.gatewayId || '',
    line.status,
    line.plan || '',
    line.usageMb ?? '',
    line.serviceFee ?? '',
    line.amount ?? '',
    line.currency || 'USD',
    line.periodStart || report?.period?.periodStart || '',
    line.periodEnd || report?.period?.periodEnd || '',
    line.syncedAt || '',
  ].map(csvEscape).join(','));
  return [header.join(','), ...rows].join('\n');
}

module.exports = {
  formatTealPeriod,
  defaultBillingPeriod,
  normalizeBillingPeriod,
  billingPeriodKey,
  simHasBillingForPeriod,
  billingLineFromSim,
  buildBillingReport,
  billingReportToCsv,
};
