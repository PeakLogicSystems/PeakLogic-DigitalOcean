'use strict';

const net = require('node:net');
const { optaHttpRequest } = require('../src/drivers/optaHttpClient');
const { checkOptaDeviceStatus } = require('../src/drivers/optaProtocol');

const host = process.argv[2] || '192.168.1.234';
const port = Number(process.argv[3]) || 80;
const url = `http://${host}:${port}/api/status`;

function rawHttp10(path) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, family: 4 });
    let raw = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, 10000);
    socket.on('connect', () => {
      socket.write(`GET ${path} HTTP/1.0\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => { raw += chunk.toString('utf8'); });
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      const split = raw.indexOf('\r\n\r\n');
      const head = split >= 0 ? raw.slice(0, split) : raw;
      const body = split >= 0 ? raw.slice(split + 4) : '';
      const status = Number(head.match(/^HTTP\/\d\.\d (\d+)/m)?.[1] || 0);
      resolve({ status, body, raw: head });
    });
  });
}

(async () => {
  console.log(`Opta connect test → ${url}`);
  try {
    const raw = await rawHttp10('/api/status');
    console.log('raw HTTP/1.0:', raw.status, raw.body.slice(0, 200));
  } catch (e) {
    console.error('raw HTTP/1.0 FAIL:', e.message);
  }
  try {
    const st = await optaHttpRequest(url, { method: 'GET', timeoutMs: 10000 });
    const check = checkOptaDeviceStatus(st);
    console.log('driver HTTP OK:', JSON.stringify(st, null, 2));
    console.log('protocol check:', check);
    process.exit(check.ok ? 0 : 1);
  } catch (e) {
    console.error('driver HTTP FAIL:', e.message);
    console.error('');
    console.error('If browser works on WiFi AP (192.168.4.1:8080) but this fails on', host + ':', port);
    console.error('  → re-flash est-pc/firmware/arduino-opta-st/PeaklogicOptaSt (mv_http.cpp fix)');
    console.error('  → Serial @115200: click Connect in PeakLogic; expect "GET /api/status"');
    process.exit(1);
  }
})();
