#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { unpackArchive } = require('../src/project/projectArchive');
const zipPath = process.argv[2] || '/home/peaklogic/data/workspace.est.zip';
const u = unpackArchive(fs.readFileSync(zipPath));
const doc = u.project;
const hmi = doc.settings?.hmi || {};
for (const s of hmi.screens || []) {
  const tiles = s.tiles || [];
  console.log('SCREEN', s.id, s.name);
  console.log('  svgLen', (s.svg || '').length);
  console.log('  tiles', tiles.length, tiles.slice(0, 3).map((t) => t.type || t.kind || t.id));
  console.log('  width/height', s.width, s.height);
}
console.log('TAGS', (doc.tags || []).map((t) => t.id));
console.log('BINDINGS sample', (hmi.bindings || []).slice(0, 5));
