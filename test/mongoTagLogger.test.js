'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  validateTimeRange,
  docsToHistory,
  generateSeedSampleDocs,
  buildSeedTagDefinitions,
  HISTORIAN_MIN_CHUNK_MS,
  HISTORIAN_MAX_CHUNK_MS,
  SEED_DIGITAL_IDS,
  SEED_ANALOG_IDS,
} = require('../src/logger/mongoTagLogger');

describe('mongoTagLogger historian query', () => {
  it('requires at least 1 hour span', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    const to = from + HISTORIAN_MIN_CHUNK_MS - 1;
    const r = validateTimeRange(from, to);
    assert.equal(r.ok, false);
    assert.match(r.error, /1 hour/);
  });

  it('rejects spans over 30 days', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    const to = from + HISTORIAN_MAX_CHUNK_MS + 1;
    const r = validateTimeRange(from, to);
    assert.equal(r.ok, false);
    assert.match(r.error, /30 days/);
  });

  it('accepts 24 hour span', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    const to = from + 24 * 60 * 60 * 1000;
    const r = validateTimeRange(from, to);
    assert.equal(r.ok, true);
    assert.equal(r.spanMs, 24 * 60 * 60 * 1000);
  });

  it('docsToHistory groups and sorts pen_sample docs', () => {
    const docs = [
      {
        event: 'pen_sample',
        at: new Date('2026-01-01T01:00:00Z'),
        pen: { tagId: 'AI1' },
        tag: { id: 'AI1', value: 2, wordWidth: 16 },
        sampleValue: 2,
      },
      {
        event: 'pen_sample',
        at: new Date('2026-01-01T00:00:00Z'),
        pen: { tagId: 'AI1' },
        tag: { id: 'AI1', value: 1, wordWidth: 16 },
        sampleValue: 1,
      },
      {
        event: 'pen_sample',
        at: new Date('2026-01-01T00:30:00Z'),
        pen: { tagId: 'AI2' },
        tag: { id: 'AI2', value: true, wordWidth: 16 },
      },
    ];
    const { history, counts } = docsToHistory(docs, ['AI1', 'AI2'], 5000);
    assert.equal(history.AI1.length, 2);
    assert.equal(history.AI1[0].value, 1);
    assert.equal(history.AI1[1].value, 2);
    assert.equal(history.AI2[0].value, 1);
    assert.equal(counts.AI1, 2);
    assert.equal(counts.AI2, 1);
  });

  it('docsToHistory downsamples when over limit', () => {
    const docs = [];
    const base = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < 20; i++) {
      docs.push({
        event: 'pen_sample',
        at: new Date(base + i * 60000),
        pen: { tagId: 'T' },
        tag: { id: 'T', value: i },
        sampleValue: i,
      });
    }
    const { history, downsampled } = docsToHistory(docs, ['T'], 5);
    assert.equal(downsampled, true);
    assert.ok(history.T.length <= 6);
    assert.equal(history.T[history.T.length - 1].value, 19);
  });

  it('generateSeedSampleDocs creates 4 digital and 6 analog series', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const { docs, tags } = generateSeedSampleDocs({
      days: 1,
      intervalMs: 60 * 60 * 1000,
      now,
    });
    assert.equal(SEED_DIGITAL_IDS.length, 4);
    assert.equal(SEED_ANALOG_IDS.length, 6);
    assert.equal(tags.length, 10);
    assert.ok(docs.length >= 10 * 24);
    const digital = docs.filter((d) => d.pen.tagId === 'SEED_DI1');
    assert.ok(digital.every((d) => d.sampleValue === 0 || d.sampleValue === 1));
    const analog = docs.filter((d) => d.pen.tagId === 'SEED_AI1');
    assert.ok(analog.every((d) => d.sampleValue >= 0 && d.sampleValue <= 100));
  });

  it('buildSeedTagDefinitions has BOOL and REAL tags', () => {
    const defs = buildSeedTagDefinitions();
    assert.equal(defs.filter((t) => t.type === 'BOOL').length, 4);
    assert.equal(defs.filter((t) => t.type === 'REAL').length, 6);
  });
});
