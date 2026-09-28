'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncBundledProjectsFromDisk } = require('../src/configStore/migrateFromFiles');

describe('migrateFromFiles bundled sync', () => {
  it('syncBundledProjectsFromDisk skips force-refresh id when Mongo is newer than disk', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-migrate-'));
    const projectsDir = path.join(dir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    const diskDoc = {
      format: 'peaklogic-est',
      version: 1,
      savedAt: '2020-01-01T00:00:00.000Z',
      project: { name: 'Assisted Living' },
      tags: [],
      drivers: [{ id: 'nextcentury1', type: 'nextcentury', email: 'disk@x.com', password: '' }],
      program: '',
      settings: {},
    };
    const diskPath = path.join(projectsDir, 'assisted-living.est.json');
    fs.writeFileSync(diskPath, JSON.stringify(diskDoc), 'utf8');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(diskPath, past, past);

    const mongoDoc = {
      ...diskDoc,
      savedAt: new Date().toISOString(),
      drivers: [{ id: 'nextcentury1', type: 'nextcentury', email: 'saved@x.com', password: 'secret' }],
    };
    const writes = [];

    const imported = await syncBundledProjectsFromDisk({
      safeId: (id) => id,
      readProjectSnapshot: async () => ({
        savedAt: mongoDoc.savedAt,
        data: mongoDoc,
      }),
      writeProjectSnapshot: async (id, doc) => {
        writes.push({ id, doc });
      },
    }, {
      dataDir: dir,
      existingIds: new Set(['assisted-living']),
    });

    assert.deepEqual(imported, []);
    assert.equal(writes.length, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('syncBundledProjectsFromDisk imports force-refresh id when disk file is newer than Mongo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-migrate-'));
    const projectsDir = path.join(dir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    const diskDoc = {
      format: 'peaklogic-est',
      version: 1,
      savedAt: new Date().toISOString(),
      project: { name: 'Assisted Living' },
      tags: [],
      drivers: [{ id: 'nextcentury1', type: 'nextcentury', email: 'disk@x.com', password: '' }],
      program: '',
      settings: {},
    };
    const diskPath = path.join(projectsDir, 'assisted-living.est.json');
    fs.writeFileSync(diskPath, JSON.stringify(diskDoc), 'utf8');

    const writes = [];

    const imported = await syncBundledProjectsFromDisk({
      safeId: (id) => id,
      readProjectSnapshot: async () => ({
        savedAt: '2020-01-01T00:00:00.000Z',
        data: { ...diskDoc, drivers: [{ id: 'nextcentury1', type: 'nextcentury', password: 'old' }] },
      }),
      writeProjectSnapshot: async (id, doc) => {
        writes.push({ id, doc });
      },
    }, {
      dataDir: dir,
      existingIds: new Set(['assisted-living']),
    });

    assert.deepEqual(imported, ['assisted-living']);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].doc.drivers[0].email, 'disk@x.com');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
