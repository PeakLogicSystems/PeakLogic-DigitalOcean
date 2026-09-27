'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEV_CONF = path.join(ROOT, 'config', 'mosquitto-dev.conf');

const WINDOWS_CANDIDATES = [
  process.env.MOSQUITTO_DIR,
  'C:\\Program Files\\mosquitto',
  'C:\\Program Files (x86)\\mosquitto',
].filter(Boolean);

function findMosquittoExe() {
  for (const dir of WINDOWS_CANDIDATES) {
    const exe = path.join(dir, 'mosquitto.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

function findMosquittoConf() {
  for (const dir of WINDOWS_CANDIDATES) {
    const conf = path.join(dir, 'conf', 'mosquitto.conf');
    if (fs.existsSync(conf)) return conf;
    const conf2 = path.join(dir, 'mosquitto.conf');
    if (fs.existsSync(conf2)) return conf2;
  }
  return null;
}

function detectLanIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && /^192\.168\./.test(net.address)) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

module.exports = {
  ROOT,
  DEV_CONF,
  findMosquittoExe,
  findMosquittoConf,
  detectLanIp,
};
