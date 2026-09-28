#!/usr/bin/env node
'use strict';

/**
 * Import any data/projects/*.est.json files missing from the Mongo project library.
 *
 * Usage:
 *   npm run seed:bundled-projects
 *   PEAKLOGIC_CONFIG_URI=mongodb://127.0.0.1:27017 npm run seed:bundled-projects
 */

const path = require('path');
const { CONFIG_URI } = require(path.join(__dirname, '../src/config'));

async function main() {
  if (CONFIG_URI === 'memory') {
    console.error('Bundled project seed requires MongoDB (PEAKLOGIC_CONFIG_URI), not memory mode.');
    process.exit(1);
  }

  const configStore = require(path.join(__dirname, '../src/configStore'));
  const mongoBackend = require(path.join(__dirname, '../src/configStore/mongoBackend'));
  const { syncBundledProjectsFromDisk } = require(path.join(__dirname, '../src/configStore/migrateFromFiles'));
  const { safeId } = require(path.join(__dirname, '../src/project/projectIds'));

  await configStore.init();
  const existing = new Set((await configStore.refreshProjectIndex()).map((p) => p.id));
  const synced = await syncBundledProjectsFromDisk({
    writeProjectSnapshot: mongoBackend.writeProjectSnapshot,
    safeId,
    existingIds: existing,
  });
  const projects = await configStore.refreshProjectIndex();

  if (synced.length) {
    console.log(`Synced: ${synced.join(', ')}`);
  } else {
    console.log('All bundled projects already in library.');
  }
  console.log(`Library (${projects.length}): ${projects.map((p) => p.id).join(', ')}`);
  await configStore.shutdown();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
