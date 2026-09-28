'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'go2rtc');
const DEFAULT_PORT = 1984;

function go2rtcExeName() {
  return process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
}

function findGo2rtcExe() {
  const env = process.env.GO2RTC_BIN || process.env.GO2RTC_EXE;
  if (env && fs.existsSync(env)) return path.resolve(env);

  const local = path.join(VENDOR_DIR, go2rtcExeName());
  if (fs.existsSync(local)) return local;

  const pathDirs = String(process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, go2rtcExeName());
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function defaultConfigPath(dataDir) {
  return path.join(dataDir || path.join(ROOT, 'data'), 'go2rtc.yaml');
}

function defaultPidPath(dataDir) {
  return path.join(dataDir || path.join(ROOT, 'data'), 'go2rtc.pid');
}

module.exports = {
  ROOT,
  VENDOR_DIR,
  DEFAULT_PORT,
  go2rtcExeName,
  findGo2rtcExe,
  defaultConfigPath,
  defaultPidPath,
};
