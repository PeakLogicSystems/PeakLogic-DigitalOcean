'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function parseDigestChallenge(header) {
  const raw = String(header || '').replace(/^Digest\s+/i, '');
  const params = {};
  const re = /(\w+)=("([^"]*)"|([^,]+))/g;
  let m;
  while ((m = re.exec(raw))) {
    params[m[1]] = (m[3] || m[2] || '').trim();
  }
  return params;
}

function buildDigestAuth({ username, password, method, uri, challenge, nc = '00000001', cnonce }) {
  const qop = challenge.qop ? 'auth' : undefined;
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  let response;
  if (qop) {
    response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (qop) {
    parts.push('qop=auth', `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  return `Digest ${parts.join(', ')}`;
}

function requestRaw(url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000, auth = null, nc = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const path = `${u.pathname}${u.search}`;
    const reqHeaders = { ...headers };
    if (auth?.type === 'digest' && auth.challenge) {
      const cnonce = crypto.randomBytes(8).toString('hex');
      reqHeaders.Authorization = buildDigestAuth({
        username: auth.username,
        password: auth.password,
        method,
        uri: path,
        challenge: auth.challenge,
        nc: String(nc).padStart(8, '0'),
        cnonce,
      });
    }
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path,
      method,
      headers: reqHeaders,
      rejectUnauthorized: false,
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: text,
          bodyBuffer: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('ONVIF request timeout'), { code: 'ETIMEDOUT' })));
    if (body) req.write(body);
    req.end();
  });
}

async function requestWithDigest(url, options = {}) {
  const first = await requestRaw(url, options);
  if (first.status !== 401 || !first.headers['www-authenticate']) return first;
  const challenge = parseDigestChallenge(first.headers['www-authenticate']);
  if (!challenge.realm || !challenge.nonce) return first;
  return requestRaw(url, {
    ...options,
    auth: {
      type: 'digest',
      username: options.username || '',
      password: options.password || '',
      challenge,
    },
    nc: 2,
  });
}

function soapEnvelope(bodyInner, action) {
  const actionAttr = action
    ? ` xmlns:a="http://www.w3.org/2005/08/addressing"`
    : '';
  const header = action
    ? `<s:Header><a:Action s:mustUnderstand="1">${action}</a:Action></s:Header>`
    : '<s:Header/>';
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"${actionAttr}>
  ${header}
  <s:Body>${bodyInner}</s:Body>
</s:Envelope>`;
}

async function soapRequest(endpoint, bodyInner, action, { username = '', password = '', timeoutMs = 10000 } = {}) {
  const body = soapEnvelope(bodyInner, action);
  const res = await requestWithDigest(endpoint, {
    method: 'POST',
    username,
    password,
    timeoutMs,
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      SOAPAction: action || '',
    },
    body,
  });
  if (res.status >= 400) {
    const err = new Error(`ONVIF HTTP ${res.status} from ${endpoint}`);
    err.status = res.status;
    err.body = res.body;
    throw err;
  }
  return res.body;
}

function firstTag(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1].trim() : '';
}

function allTags(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(String(xml || '')))) out.push(m[1].trim());
  return out;
}

function tagAttr(xml, tag, attr) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i');
  const m = String(xml || '').match(re);
  return m ? m[1] : '';
}

function xaddr(xml, service) {
  const block = String(xml || '').match(new RegExp(`<(?:[\\w-]+:)?${service}[^>]*>[\\s\\S]*?<\\/(?:[\\w-]+:)?${service}>`, 'i'));
  if (!block) return '';
  return firstTag(block[0], 'XAddr');
}

module.exports = {
  requestRaw,
  requestWithDigest,
  soapRequest,
  soapEnvelope,
  firstTag,
  allTags,
  tagAttr,
  xaddr,
  parseDigestChallenge,
  buildDigestAuth,
};
