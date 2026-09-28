'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const {
  DEV_CONF,
  findMosquittoExe,
  findMosquittoConf,
  detectLanIp,
} = require('./mqtt-broker-paths');

const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(__dirname, '..', 'data');
const PID_FILE = path.join(DATA_DIR, 'mosquitto-dev.pid');
const MARKER = '# PeakLogic dev — LAN listener';

function isWindows() {
  return process.platform === 'win32';
}

function serviceRunning() {
  if (!isWindows()) return false;
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-Service -Name mosquitto -ErrorAction SilentlyContinue).Status"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out === 'Running';
  } catch {
    return false;
  }
}

function ensureInstallConfPatched(installConf) {
  if (!installConf || !fs.existsSync(installConf)) return false;
  let text = fs.readFileSync(installConf, 'utf8');
  if (text.includes(MARKER)) return true;
  const block = [
    '',
    MARKER,
    'listener 1883 0.0.0.0',
    'allow_anonymous true',
    '',
  ].join('\n');
  fs.writeFileSync(installConf, text.trimEnd() + block, 'utf8');
  console.log(`Patched ${installConf} for LAN access (0.0.0.0:1883, anonymous).`);
  return true;
}

function restartWindowsService() {
  execSync('powershell -NoProfile -Command "Restart-Service -Name mosquitto -Force"', { stdio: 'inherit' });
}

function readPidFile() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function portOpen(host, port, ms = 3000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = net.connect({ host, port, family: 4 }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(ms);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function lanListenerOk(lan) {
  const localOk = await portOpen('127.0.0.1', 1883);
  const lanOk = lan !== '127.0.0.1' ? await portOpen(lan, 1883) : localOk;
  return { localOk, lanOk };
}

function stopWindowsService() {
  execSync('powershell -NoProfile -Command "Stop-Service -Name mosquitto -Force -ErrorAction Stop"', {
    stdio: 'inherit',
  });
}

function startDevBroker(exe) {
  const existing = readPidFile();
  if (existing) {
    console.log(`Mosquitto dev broker may already be running (PID ${existing}).`);
    return existing;
  }
  const child = spawn(exe, ['-c', DEV_CONF, '-v'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log(`Started mosquitto -c ${DEV_CONF} (PID ${child.pid})`);
  return child.pid;
}

async function main() {
  if (!fs.existsSync(DEV_CONF)) {
    console.error('Missing config/mosquitto-dev.conf');
    process.exit(1);
  }

  const exe = findMosquittoExe();
  const installConf = findMosquittoConf();
  const lan = detectLanIp();

  if (isWindows() && serviceRunning()) {
    console.log('Mosquitto Windows service is running.');
    let patched = false;
    if (installConf) {
      try {
        ensureInstallConfPatched(installConf);
        restartWindowsService();
        patched = true;
      } catch (e) {
        console.warn('Could not patch/restart Mosquitto service (run terminal as Administrator):', e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
    let { localOk, lanOk } = await lanListenerOk(lan);
    if (!lanOk && exe) {
      console.log('LAN port 1883 not open — switching to dev broker (config/mosquitto-dev.conf).');
      try {
        stopWindowsService();
        startDevBroker(exe);
        await new Promise((r) => setTimeout(r, 1500));
        ({ localOk, lanOk } = await lanListenerOk(lan));
      } catch (e) {
        console.warn('Could not stop service / start dev broker:', e.message);
        if (!patched) {
          console.warn('Run PowerShell as Administrator, then: npm run mqtt:start');
        }
      }
    }
  } else if (exe) {
    startDevBroker(exe);
  } else {
    console.error('mosquitto.exe not found. Install Mosquitto and ensure the service is running.');
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 500));
  const { localOk, lanOk } = await lanListenerOk(lan);
  console.log(`Verify localhost:1883 → ${localOk ? 'OK' : 'FAIL'}`);
  if (lan !== '127.0.0.1') console.log(`Verify ${lan}:1883 → ${lanOk ? 'OK' : 'FAIL (check firewall or run as Admin to patch service conf)'}`);
  console.log(`PeakLogic mqttParc.brokerUrl → mqtt://${lan}:1883`);
  if (!localOk && !lanOk) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
