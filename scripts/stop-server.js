'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(ROOT, 'data');
const PID_FILE = path.join(DATA_DIR, 'peaklogic.pid');
const PORT = Number(process.env.PORT) || 3090;

function readPidFile() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removePidFile() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch { /* ignore */ }
}

function isWindows() {
  return process.platform === 'win32';
}

function killPid(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    if (isWindows()) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    console.log(`Stopped PeakLogic (PID ${pid})`);
    return true;
  } catch (e) {
    const msg = e.stderr?.toString?.() || e.message || String(e);
    if (/not found|no such process|could not be terminated/i.test(msg)) {
      return false;
    }
    console.warn(`Could not stop PID ${pid}: ${msg.trim()}`);
    return false;
  }
}

function pidsOnPort(port) {
  const pids = new Set();
  if (isWindows()) {
    try {
      const out = execSync('netstat -ano -p TCP', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
      const needle = `:${port}`;
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(needle) || !/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    } catch (e) {
      if (e.status !== 1) throw e;
    }
    return [...pids];
  }
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  } catch (e) {
    if (e.status !== 1) throw e;
  }
  return [...pids];
}

function main() {
  let stopped = false;

  const filePid = readPidFile();
  if (filePid) {
    stopped = killPid(filePid) || stopped;
    removePidFile();
  }

  for (const pid of pidsOnPort(PORT)) {
    if (pid === process.pid) continue;
    stopped = killPid(pid) || stopped;
  }

  if (!stopped) {
    console.log(`No PeakLogic server on port ${PORT}`);
    process.exit(0);
  }

  removePidFile();
  process.exit(0);
}

main();
