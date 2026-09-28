'use strict';

const fs = require('fs');
const path = require('path');
const { parseRt4510Row, fieldValue, leakIsActive } = require('../../src/drivers/nextcenturyDriver');

const SAMPLE_PATH = path.join(__dirname, '../fixtures/nextcenturydata.sample.json');

function loadNextcenturySample(filePath = SAMPLE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function samplePropertyList(sample) {
  return (sample.reports || []).map((r) => ({
    _id: `p_${r.propertyId}`,
    name: r.propertyName,
  }));
}

function sampleReportByPropertyId(sample) {
  const map = new Map();
  for (const r of sample.reports || []) {
    map.set(r.propertyId, r.apiResponse || { rows: [] });
  }
  return map;
}

function createNextcenturyFetchMock(sample) {
  const properties = samplePropertyList(sample);
  const reports = sampleReportByPropertyId(sample);
  return async (url) => {
    const u = String(url);
    if (u.includes('/login')) {
      return { ok: true, json: async () => ({ token: 'mock-jwt-sample' }) };
    }
    if (u.endsWith('/Properties')) {
      return { ok: true, json: async () => properties };
    }
    const m = u.match(/\/Properties\/(\d+)\/RunReport\//);
    if (m) {
      const propertyId = parseInt(m[1], 10);
      return { ok: true, json: async () => reports.get(propertyId) || { rows: [] } };
    }
    throw new Error(`Unexpected fetch URL in sample mock: ${u}`);
  };
}

function buildDeviceCacheFromSample(sample) {
  const cache = new Map();
  for (const report of sample.reports || []) {
    for (const row of report.apiResponse?.rows || []) {
      const doc = parseRt4510Row(row, report.propertyId);
      if (doc.deviceId) cache.set(doc.deviceId, doc);
    }
  }
  return cache;
}

function expectedTagValue(tag, cache) {
  const a = tag.driverAddress || {};
  const deviceId = String(a.deviceId || '').trim();
  const field = String(a.field || 'totalUsage').trim();
  if (field === '_deviceCount') return cache.size;
  if (field === '_lastCollectEpoch') return null;
  const doc = cache.get(deviceId);
  if (!doc) return null;
  if (field === 'leakActive') return leakIsActive(doc.leakStatus);
  return fieldValue(doc, field);
}

module.exports = {
  SAMPLE_PATH,
  loadNextcenturySample,
  createNextcenturyFetchMock,
  buildDeviceCacheFromSample,
  expectedTagValue,
};
