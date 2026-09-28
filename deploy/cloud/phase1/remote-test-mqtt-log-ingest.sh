#!/usr/bin/env bash
set -euo pipefail
node <<'NODE'
const fs = require('fs');
const http = require('http');
const env = {};
for (const raw of fs.readFileSync('/etc/peaklogic/saas.env', 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
const token = env.PEAKLOGIC_MQTT_LOG_INGEST_TOKEN || env.PLATFORM_ADMIN_KEY || '';
const body = JSON.stringify({
  host: 'mv-mqtt-test',
  lines: [
    '1700000099: New client connected from 10.0.0.1:12345 as deploy_test (p2, c1, k60).',
    '1700000100: Client <unknown> disconnected, not authorised.',
  ],
});
const req = http.request({
  hostname: '127.0.0.1',
  port: 3100,
  path: '/api/mqtt-broker-log/ingest',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    console.log('ingest:', data);
    http.get('http://127.0.0.1:3100/api/mqtt-broker-log?limit=5', (r2) => {
      let d2 = '';
      r2.on('data', (c) => { d2 += c; });
      r2.on('end', () => console.log('query:', d2));
    });
  });
});
req.on('error', (e) => console.error(e.message));
req.write(body);
req.end();
NODE
