'use strict';

const { optaHttpRequest } = require('../drivers/optaHttpClient');
const { clientHeaders } = require('../drivers/optaProtocol');

function optaBaseUrl(host, port = 80) {
  const h = String(host || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .trim();
  if (!h) return null;
  const p = Number(port) || 80;
  return p === 80 ? `http://${h}` : `http://${h}:${p}`;
}

/** Deploy ST program to Opta over HTTP (bypasses PubSubClient large-MQTT limits). */
async function deployOptaProgramHttp(host, body, opts = {}) {
  const base = optaBaseUrl(host, opts.port);
  if (!base) throw new Error('Opta host IP required for HTTP deploy');
  const payload = JSON.stringify(body);
  await optaHttpRequest(`${base}/api/program`, {
    methods: ['PUT', 'POST'],
    headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    body: payload,
    timeoutMs: opts.timeoutMs || 60000,
  });
  return { ok: true };
}

module.exports = { deployOptaProgramHttp, optaBaseUrl };
