#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { unpackArchive } = require('../src/project/projectArchive');
const zipPath = process.argv[2] || '/home/peaklogic/data/workspace.est.zip';
const u = unpackArchive(fs.readFileSync(zipPath));
const hmi = u.project?.settings?.hmi || {};
const screens = (hmi.screens || []).map((s) => ({
  id: s.id,
  name: s.name,
  mode: s.mode || s.type,
  layerCount: (s.layers || s.elements || s.widgets || []).length,
  keys: Object.keys(s),
}));
const bindingsByScreen = {};
for (const b of hmi.bindings || []) {
  bindingsByScreen[b.screenId] = (bindingsByScreen[b.screenId] || 0) + 1;
}
console.log(JSON.stringify({ screens, bindingsByScreen, tagCount: (u.project.tags || []).length }, null, 2));
