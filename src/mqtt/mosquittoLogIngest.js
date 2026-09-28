'use strict';

const fs = require('fs');
const os = require('os');
const mongoSysLog = require('../logger/mongoSysLog');
const { DEPLOYMENT_MODE, TENANT_ID } = require('../config');
const { parseMosquittoLogLines } = require('./mosquittoLogParser');

const MAX_BATCH = 200;
const DEDUPE_MAX = 5000;
const recentKeys = new Set();
const recentQueue = [];

let tailer = null;
let tailState = {
  running: false,
  path: '',
  host: '',
  lastError: '',
  ingested: 0,
  skipped: 0,
  lastIngestAt: null,
};

function dedupeKey(entry) {
  return `${entry.at}|${entry.level}|${entry.message}|${entry.detail?.raw || ''}`;
}

function rememberKey(key) {
  if (recentKeys.has(key)) return false;
  recentKeys.add(key);
  recentQueue.push(key);
  if (recentQueue.length > DEDUPE_MAX) {
    const old = recentQueue.shift();
    recentKeys.delete(old);
  }
  return true;
}

function ingestContext(overrides = {}) {
  return {
    host: overrides.host || tailState.host || os.hostname(),
    tenantId: overrides.tenantId || TENANT_ID,
    deployment: overrides.deployment || DEPLOYMENT_MODE,
  };
}

/**
 * Parse and append Mosquitto log lines to sys_log (category mqtt).
 * @returns {{ ingested: number, skipped: number, entries: object[] }}
 */
async function ingestLines(lines, ctx = {}) {
  const parsed = parseMosquittoLogLines(lines, ingestContext(ctx));
  const entries = [];
  let skipped = 0;
  for (const row of parsed) {
    const key = dedupeKey(row);
    if (!rememberKey(key)) {
      skipped += 1;
      continue;
    }
    const entry = await mongoSysLog.append({
      at: row.at,
      level: row.level,
      category: 'mqtt',
      message: row.message,
      detail: row.detail,
      host: row.host,
      tenantId: row.tenantId,
      deployment: row.deployment,
    });
    if (entry) entries.push(entry);
  }
  tailState.ingested += entries.length;
  tailState.skipped += skipped;
  if (entries.length) tailState.lastIngestAt = new Date().toISOString();
  return { ingested: entries.length, skipped, entries };
}

function status() {
  return {
    tailer: {
      running: tailState.running,
      path: tailState.path || null,
      host: tailState.host || null,
      lastError: tailState.lastError || null,
      ingested: tailState.ingested,
      skipped: tailState.skipped,
      lastIngestAt: tailState.lastIngestAt,
    },
  };
}

function stopTailer() {
  if (tailer?.watcher) {
    try { tailer.watcher.close(); } catch { /* ignore */ }
  }
  if (tailer?.pollTimer) clearInterval(tailer.pollTimer);
  tailer = null;
  tailState.running = false;
}

function readNewBytes(filePath, offset) {
  const stat = fs.statSync(filePath);
  if (stat.size < offset) return { offset: 0, chunk: '' };
  if (stat.size === offset) return { offset, chunk: '' };
  const len = stat.size - offset;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, offset);
    return { offset: stat.size, chunk: buf.toString('utf8') };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Tail a local Mosquitto log file (appliance / co-located broker).
 * @param {string} filePath
 * @param {{ host?: string, pollMs?: number }} [opts]
 */
function startTailer(filePath, opts = {}) {
  stopTailer();
  const path = String(filePath || '').trim();
  if (!path) return status();
  if (!fs.existsSync(path)) {
    tailState.lastError = `log file not found: ${path}`;
    return status();
  }

  tailState.path = path;
  tailState.host = opts.host || os.hostname();
  tailState.running = true;
  tailState.lastError = '';

  let offset = fs.statSync(path).size;
  let pending = '';

  const flushLines = async (text) => {
    pending += text;
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() || '';
    const lines = parts.filter(Boolean);
    if (!lines.length) return;
    try {
      await ingestLines(lines, { host: tailState.host });
    } catch (e) {
      tailState.lastError = e.message || String(e);
      mongoSysLog.error('mqtt', 'Mosquitto log ingest failed', { message: tailState.lastError, path });
    }
  };

  const pollMs = Math.max(500, Number(opts.pollMs) || 2000);
  const poll = async () => {
    try {
      const { offset: next, chunk } = readNewBytes(path, offset);
      offset = next;
      if (chunk) await flushLines(chunk);
    } catch (e) {
      tailState.lastError = e.message || String(e);
    }
  };

  let watcher = null;
  try {
    watcher = fs.watch(path, { persistent: false }, () => { poll().catch(() => {}); });
  } catch {
    watcher = null;
  }
  const pollTimer = setInterval(() => { poll().catch(() => {}); }, pollMs);
  tailer = { watcher, pollTimer, flushLines };
  poll().catch(() => {});
  return status();
}

function startFromEnv() {
  const path = String(process.env.PEAKLOGIC_MOSQUITTO_LOG_PATH || '').trim();
  if (!path) return null;
  const host = String(process.env.PEAKLOGIC_MOSQUITTO_LOG_HOST || os.hostname()).trim();
  return startTailer(path, { host });
}

module.exports = {
  ingestLines,
  startTailer,
  stopTailer,
  startFromEnv,
  status,
};
