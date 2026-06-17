'use strict';

const fs = require('fs');
const path = require('path');
const { buildPresetFromJson } = require('./buildPresetFromJson');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

let jsonCache = null;
let jsonCacheKey = '';

function templatesCacheKey() {
  if (!fs.existsSync(TEMPLATES_DIR)) return '';
  return fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const st = fs.statSync(path.join(TEMPLATES_DIR, f));
      return `${f}:${st.mtimeMs}:${st.size}`;
    })
    .sort()
    .join('|');
}

function loadJsonTemplates() {
  const key = templatesCacheKey();
  if (jsonCache && key === jsonCacheKey) return jsonCache;
  jsonCacheKey = key;
  if (!fs.existsSync(TEMPLATES_DIR)) {
    jsonCache = [];
    return jsonCache;
  }
  jsonCache = fs.readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8'));
      return buildPresetFromJson(raw);
    });
  return jsonCache;
}

module.exports = { loadJsonTemplates, TEMPLATES_DIR };
