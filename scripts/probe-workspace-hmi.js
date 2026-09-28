#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { unpackArchive } = require('../src/project/projectArchive');

const DATA = process.env.PEAKLOGIC_DATA || '/home/peaklogic/data';
const zipPath = path.join(DATA, 'workspace.est.zip');

function screensFromSettings(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const hmi = s.hmi || s.settings?.hmi;
    return (hmi?.screens || []).map((x) => ({ id: x.id, name: x.name, number: x.number }));
  } catch (e) {
    return { error: e.message };
  }
}

const out = { zipPath, zipExists: fs.existsSync(zipPath) };
if (out.zipExists) {
  const u = unpackArchive(fs.readFileSync(zipPath));
  const hmi = u.project?.settings?.hmi;
  out.zipProject = u.project?.project?.name;
  out.zipScreens = (hmi?.screens || []).map((x) => ({ id: x.id, name: x.name, number: x.number }));
  out.zipBindings = (hmi?.bindings || []).length;
}
out.settingsJson = screensFromSettings(path.join(DATA, 'settings.json'));
out.workspaceJson = screensFromSettings(path.join(DATA, 'workspace.est.json'));
out.projectJson = screensFromSettings(path.join(DATA, 'project.est.json'));
console.log(JSON.stringify(out, null, 2));
