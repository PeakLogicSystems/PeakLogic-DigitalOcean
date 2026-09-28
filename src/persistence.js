'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, DEPLOYMENT_MODE } = require('./config');

/** Cloud fleet registry — global across orgs; not per-tenant Mongo workspace. */
const CLOUD_FLEET_JSON_FILES = new Set(['parc.json']);

function isCloudFleetJsonFile(name) {
  return DEPLOYMENT_MODE === 'cloud' && CLOUD_FLEET_JSON_FILES.has(name);
}

let writeSeq = 0;

function getConfigStore() {
  try {
    return require('./configStore');
  } catch {
    return null;
  }
}

function ensureConfigReady() {
  const store = getConfigStore();
  if (store?.initMemorySync) store.initMemorySync();
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  const { resolveTenantRelativePath } = require('./tenants/tenantPaths');
  return resolveTenantRelativePath(name);
}

function readJsonFile(name, fallback) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJson(name, fallback) {
  if (isCloudFleetJsonFile(name)) {
    return readJsonFile(name, fallback);
  }
  const store = getConfigStore();
  if (store?.isConfigJsonFile(name)) {
    ensureConfigReady();
    if (!store.status?.().ready) return fallback;
    return store.readSync(name, fallback);
  }
  return readJsonFile(name, fallback);
}

function sleepSync(ms) {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy-wait for short Windows rename retries */ }
}

function removeFileQuiet(fp) {
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch { /* ignore */ }
}

/** Atomic JSON write — unique temp file + rename retries (Windows sync / multi-process safe). */
function writeJsonFile(name, data) {
  ensureDataDir();
  const fp = filePath(name);
  const payload = JSON.stringify(data, null, 2);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const tmp = `${fp}.${process.pid}.${++writeSeq}.${attempt}.tmp`;
    try {
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, fp);
      return;
    } catch (e) {
      lastErr = e;
      removeFileQuiet(tmp);
      const retryable = e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
      if (retryable && attempt < 4) {
        sleepSync(10 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function writeJson(name, data) {
  if (isCloudFleetJsonFile(name)) {
    writeJsonFile(name, data);
    return;
  }
  const store = getConfigStore();
  if (store?.isConfigJsonFile(name)) {
    ensureConfigReady();
    if (!store.status?.().ready) {
      throw new Error(`configStore not ready — cannot write ${name}`);
    }
    store.writeSync(name, data);
    return;
  }
  writeJsonFile(name, data);
}

async function flushConfig() {
  const store = getConfigStore();
  if (store?.flushPending) await store.flushPending();
}

function readText(name, fallback = '') {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return fallback;
  return fs.readFileSync(fp, 'utf8');
}

function writeText(name, text) {
  ensureDataDir();
  const fp = filePath(name);
  const tmp = `${fp}.${process.pid}.${++writeSeq}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, fp);
}

function writeBinary(name, buffer) {
  ensureDataDir();
  const fp = filePath(name);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const tmp = `${fp}.${process.pid}.${++writeSeq}.${attempt}.tmp`;
    try {
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, fp);
      return;
    } catch (e) {
      lastErr = e;
      removeFileQuiet(tmp);
      const retryable = e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
      if (retryable && attempt < 4) {
        sleepSync(10 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function readBinary(name) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp);
}

module.exports = {
  ensureDataDir,
  readJson,
  writeJson,
  flushConfig,
  readText,
  writeText,
  readBinary,
  writeBinary,
  filePath,
  readJsonFile,
  writeJsonFile,
};
