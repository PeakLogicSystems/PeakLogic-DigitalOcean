'use strict';

/** @typedef {'connection'|'client_connect'|'client_disconnect'|'auth_fail'|'error'|'info'} MqttLogEvent */

const STRIP_TS = /^\d+:\s*/;
const STRIP_SYSLOG = /^(?:\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+mosquitto(?:\[\d+\])?:\s*)?/i;

const PATTERNS = [
  {
    event: 'auth_fail',
    level: 'warn',
    re: /^Client (?<clientId><unknown>|[^\s]+) disconnected, not authorised\.?$/i,
    message: (m) => `MQTT auth failed${m.clientId && m.clientId !== '<unknown>' ? ` (${m.clientId})` : ''}`,
  },
  {
    event: 'client_connect',
    level: 'info',
    re: /^New client connected from (?<ip>[\d.a-f:]+):(?<port>\d+) as (?<clientId>[^\s]+)(?:\s+\((?<flags>[^)]+)\))?\.?$/i,
    message: (m) => `Device connected: ${m.clientId}`,
  },
  {
    event: 'connection',
    level: 'info',
    re: /^New connection from (?<ip>[\d.a-f:]+):(?<port>\d+) on port (?<listenerPort>\d+)\.?$/i,
    message: (m) => `New TCP connection from ${m.ip}:${m.port}`,
  },
  {
    event: 'client_disconnect',
    level: 'info',
    re: /^Client (?<clientId>[^\s]+) (?:disconnected|closed its connection)\.?$/i,
    message: (m) => `Device disconnected: ${m.clientId}`,
  },
  {
    event: 'client_disconnect',
    level: 'warn',
    re: /^Client (?<clientId>[^\s]+) already connected, closing old connection\.?$/i,
    message: (m) => `Duplicate client id — closed old session: ${m.clientId}`,
  },
  {
    event: 'error',
    level: 'error',
    re: /^Socket error on client (?<clientId>[^\s]+), disconnecting\.?$/i,
    message: (m) => `Socket error on ${m.clientId}`,
  },
  {
    event: 'error',
    level: 'error',
    re: /^(?<kind>OpenSSL Error(?:\[[^\]]+\])?|Error):(?<detail>.+)$/i,
    message: (m) => String(m.kind || 'Error').replace(/\s+/g, ' ').trim(),
  },
];

function normalizeLine(raw) {
  let line = String(raw || '').trim();
  if (!line) return '';
  line = line.replace(STRIP_SYSLOG, '');
  line = line.replace(STRIP_TS, '');
  return line.trim();
}

function parseUnixTimestamp(raw) {
  const m = String(raw || '').match(/^(\d{9,10}):/);
  if (!m) return null;
  const sec = Number(m[1]);
  if (!Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

/**
 * Parse one Mosquitto log line into a sys_log-shaped entry, or null if not relevant.
 * @param {string} rawLine
 * @param {{ host?: string, tenantId?: string, deployment?: string }} [ctx]
 */
function parseMosquittoLogLine(rawLine, ctx = {}) {
  const raw = String(rawLine || '').trim();
  if (!raw) return null;

  const at = parseUnixTimestamp(raw) || new Date().toISOString();
  const message = normalizeLine(raw);
  if (!message) return null;

  for (const pat of PATTERNS) {
    const match = message.match(pat.re);
    if (!match?.groups) continue;
    const groups = { ...match.groups };
    const clientId = groups.clientId && groups.clientId !== '<unknown>' ? groups.clientId : null;
    const detail = {
      event: pat.event,
      clientId,
      ip: groups.ip || null,
      port: groups.port ? Number(groups.port) : null,
      listenerPort: groups.listenerPort ? Number(groups.listenerPort) : null,
      flags: groups.flags || null,
      raw: message,
    };
    if (groups.detail) detail.errorDetail = String(groups.detail).trim();
    return {
      at,
      level: pat.level,
      category: 'mqtt',
      message: pat.message(groups),
      detail,
      host: ctx.host || '',
      tenantId: ctx.tenantId,
      deployment: ctx.deployment,
    };
  }

  if (/^mosquitto version|^Config loaded|^Opening ipv|^Bridge |^Warning:/i.test(message)) {
    return null;
  }
  if (/^Error|^OpenSSL|^Client .* not authorised|^Denied PUBLISH|^Denied SUBSCRIBE/i.test(message)) {
    return {
      at,
      level: 'error',
      category: 'mqtt',
      message: message.slice(0, 4000),
      detail: { event: 'error', raw: message },
      host: ctx.host || '',
      tenantId: ctx.tenantId,
      deployment: ctx.deployment,
    };
  }
  return null;
}

/**
 * @param {string[]} lines
 * @param {object} [ctx]
 */
function parseMosquittoLogLines(lines, ctx = {}) {
  const out = [];
  for (const line of lines || []) {
    const entry = parseMosquittoLogLine(line, ctx);
    if (entry) out.push(entry);
  }
  return out;
}

module.exports = {
  normalizeLine,
  parseMosquittoLogLine,
  parseMosquittoLogLines,
};
