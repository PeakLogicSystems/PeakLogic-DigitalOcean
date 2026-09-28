'use strict';

process.env.ARCHIVE_USE_GZIP = '1';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  archiveRelativePath,
  dayBoundsUtc,
  defaultCompactDayKey,
  partitionKey,
  resolveCompany,
  resolveSiteId,
} = require('../src/archive/archivePaths');
const { buildHourlyZstdBlob } = require('../src/archive/zstdWriter');

test('archiveRelativePath builds company/site/day paths', () => {
  const blob = archiveRelativePath({
    company: 'ace',
    siteId: 'lift_042',
    dayKey: '2026-06-24',
    ext: 'blob',
  });
  assert.equal(blob, 'company=ace/site=lift_042/year=2026/day=2026-06-24.jsonl.zst');
  const idx = archiveRelativePath({
    company: 'ace',
    siteId: 'lift_042',
    dayKey: '2026-06-24',
    ext: 'index',
  });
  assert.equal(idx, 'company=ace/site=lift_042/year=2026/day=2026-06-24.index.json');
});

test('resolveCompany and resolveSiteId fallbacks', () => {
  const doc = { tag: { driverId: 'gw_01' }, projectName: 'demo' };
  assert.equal(resolveCompany(doc), 'local');
  assert.equal(resolveSiteId(doc), 'gw_01');
});

test('partitionKey joins company and siteId', () => {
  assert.equal(partitionKey({ company: 'bresa', siteId: 'site_1' }), 'bresa\0site_1');
});

test('defaultCompactDayKey is seven UTC days before today', () => {
  const now = new Date('2026-07-01T15:00:00.000Z');
  assert.equal(defaultCompactDayKey(now), '2026-06-24');
  const { periodStart, periodEnd } = dayBoundsUtc('2026-06-24');
  assert.equal(periodStart.toISOString(), '2026-06-24T00:00:00.000Z');
  assert.equal(periodEnd.toISOString(), '2026-06-25T00:00:00.000Z');
});

test('buildHourlyZstdBlob produces index chunks and round-trip ids', async () => {
  const docs = [
    {
      _id: 'a1',
      event: 'pen_sample',
      at: new Date('2026-06-24T14:05:00.000Z'),
      company: 'ace',
      siteId: 'lift_1',
      pen: { tagId: 'LEVEL' },
      tag: { id: 'LEVEL', value: 1 },
      sampleValue: 1,
    },
    {
      _id: 'a2',
      event: 'pen_sample',
      at: new Date('2026-06-24T14:10:00.000Z'),
      company: 'ace',
      siteId: 'lift_1',
      pen: { tagId: 'LEVEL' },
      tag: { id: 'LEVEL', value: 2 },
      sampleValue: 2,
    },
    {
      _id: 'a3',
      event: 'pen_sample',
      at: new Date('2026-06-24T15:00:00.000Z'),
      company: 'ace',
      siteId: 'lift_1',
      pen: { tagId: 'PUMP_RUN' },
      tag: { id: 'PUMP_RUN', value: true },
      sampleValue: 1,
    },
  ];

  const { blob, index, recordCount, exportedIds } = await buildHourlyZstdBlob(docs, {
    company: 'ace',
    siteId: 'lift_1',
    periodStart: '2026-06-24T00:00:00.000Z',
    periodEnd: '2026-06-25T00:00:00.000Z',
    blobPath: 'company=ace/site=lift_1/year=2026/day=2026-06-24.jsonl.zst',
  });

  assert.equal(recordCount, 3);
  assert.equal(exportedIds.length, 3);
  assert.ok(blob.length > 0);
  assert.equal(index.chunks.length, 2);
  assert.equal(index.chunks[0].records, 2);
  assert.equal(index.chunks[1].records, 1);
  assert.ok(index.sha256);
});
