'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(__dirname, '..', 'data');
const PID_FILE = path.join(DATA_DIR, 'mosquitto-dev.pid');

function isWindows() {
  return process.platform === 'win32';
}

function readPidFile() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

function main() {
  const pid = readPidFile();
  if (pid) {
    try {
      if (isWindows()) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
      console.log(`Stopped dev mosquitto (PID ${pid})`);
    } catch {
      console.log(`Dev mosquitto PID ${pid} not running`);
    }
    removePidFile();
    return;
  }

  if (isWindows()) {
    try {
      const status = execSync(
        'powershell -NoProfile -Command "(Get-Service -Name mosquitto -ErrorAction SilentlyContinue).Status"',
        { encoding: 'utf8' },
      ).trim();
      if (status === 'Running') {
        console.log('Mosquitto Windows service is running. Stop with:');
        console.log('  Stop-Service mosquitto   (PowerShell as Administrator)');
        console.log('Or leave it running for PeakLogic / Opta.');
        return;
      }
    } catch { /* ignore */ }
  }
  console.log('No dev mosquitto PID file; nothing to stop.');
}

main();
