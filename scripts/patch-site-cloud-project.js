#!/usr/bin/env node
'use strict';
/** One-off: set cloudProject/hmiScreenId on a site in cloud_sites.json */
const fs = require('fs');
const path = require('path');

const siteId = process.argv[2];
const cloudProject = process.argv[3] || 'duplex-lift-station';
const hmiScreenId = process.argv[4] || 'screen_1';
const file = process.argv[5] || path.join(__dirname, '../data/cloud_sites.json');

if (!siteId) {
  console.error('Usage: node patch-site-cloud-project.js <siteId> [cloudProject] [hmiScreenId] [cloud_sites.json]');
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(file, 'utf8'));
const rec = store.sites?.[siteId];
if (!rec) {
  console.error('Site not found:', siteId);
  process.exit(1);
}
rec.cloudProject = cloudProject;
rec.hmiScreenId = hmiScreenId;
fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
console.log('Updated', siteId, '→', cloudProject, hmiScreenId);
