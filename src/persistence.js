'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function readJson(name, fallback) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  ensureDataDir();
  const fp = filePath(name);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

function readText(name, fallback = '') {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  return fs.readFileSync(fp, 'utf8');
}

function writeText(name, text) {
  ensureDataDir();
  fs.writeFileSync(filePath(name), text, 'utf8');
}

module.exports = { ensureDataDir, readJson, writeJson, readText, writeText, filePath };
