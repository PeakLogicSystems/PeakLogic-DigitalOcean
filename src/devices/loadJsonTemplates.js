'use strict';

const fs = require('fs');
const path = require('path');
const { buildPresetFromJson } = require('./buildPresetFromJson');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

let jsonCache = null;
let jsonCacheKey = '';

function isTemplateJson(name) {
  return name.endsWith('.json') && !name.startsWith('_test_');
}

function templatesCacheKey() {
  if (!fs.existsSync(TEMPLATES_DIR)) return '';
  return fs.readdirSync(TEMPLATES_DIR)
    .filter(isTemplateJson)
    .map((f) => {
      const fp = path.join(TEMPLATES_DIR, f);
      try {
        const st = fs.statSync(fp);
        return `${f}:${st.mtimeMs}:${st.size}`;
      } catch (e) {
        if (e.code === 'ENOENT') return `${f}:missing`;
        throw e;
      }
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
    .filter(isTemplateJson)
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8'));
      return buildPresetFromJson(raw);
    });
  return jsonCache;
}

module.exports = { loadJsonTemplates, TEMPLATES_DIR };
