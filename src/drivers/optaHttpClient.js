'use strict';

const http = require('node:http');
const https = require('node:https');

const RETRYABLE_HTTP = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|socket hang up|aborted/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Low-level HTTP for Opta deploy — Node fetch often fails on PUT to mbed EthernetServer. */
function nodeHttpRequest(url, options = {}) {
  const u = new URL(url);
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? https : http;
  const timeoutMs = options.timeoutMs || 30000;
  const body = options.body != null ? String(options.body) : null;
  const headers = { Connection: 'close', ...(options.headers || {}) };
  if (body != null) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: options.method || 'GET',
        headers,
        timeout: timeoutMs,
        family: 4,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode || 0, text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (body != null) req.write(body);
    req.end();
  });
}

async function nodeHttpRequestRetry(url, options = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await nodeHttpRequest(url, options);
    } catch (e) {
      lastErr = e;
      const msg = e.message || String(e);
      if (i >= retries - 1 || !RETRYABLE_HTTP.test(msg)) throw e;
      await sleep(120 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchRequest(url, options = {}) {
  const { timeoutMs, ...fetchOpts } = options;
  const res = await fetch(url, {
    ...fetchOpts,
    signal: AbortSignal.timeout(timeoutMs || 30000),
  });
  const text = await res.text();
  return { status: res.status, text, ok: res.ok };
}

function parseJsonResponse(status, text) {
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  const ok = status >= 200 && status < 300;
  if (!ok) {
    const msg = body?.error || body?.message || text || `HTTP ${status}`;
    let detail = msg;
    if (body?.bytes != null && body?.limit != null) {
      detail = `${msg} (${body.bytes} bytes, limit ${body.limit})`;
    } else if (body?.bytes != null) {
      detail = `${msg} (${body.bytes} bytes)`;
    }
    const err = new Error(detail);
    err.status = status;
    throw err;
  }
  return body;
}

/**
 * All Opta traffic via node:http first (mbed EthernetServer is unreliable with fetch).
 */
async function optaHttpRequest(url, options = {}) {
  const methods = options.methods || [options.method || 'GET'];
  const errors = [];

  for (const method of methods) {
    const reqOpts = { ...options, method, timeoutMs: options.timeoutMs || 30000 };
    const attempts = [
      () => nodeHttpRequestRetry(url, reqOpts),
      () => fetchRequest(url, reqOpts),
    ];

    const attemptErrors = [];
    for (const attempt of attempts) {
      try {
        const { status, text } = await attempt();
        return parseJsonResponse(status, text);
      } catch (e) {
        if (e.status != null) {
          throw e;
        }
        attemptErrors.push(e.message || String(e));
      }
    }
    errors.push(`${method}: ${attemptErrors.join(' → ')}`);
  }

  const detail = errors.length ? errors.join('; ') : 'unknown error';
  throw new Error(
    `Cannot reach Opta at ${url} (${detail}). `
    + 'On this PC run: npm run opta-test — then re-flash est-pc/firmware/arduino-opta-st/PeaklogicOptaSt '
    + '(mv_http.cpp Opta fix; not the OneDrive fork).',
  );
}

module.exports = { optaHttpRequest, nodeHttpRequest };
