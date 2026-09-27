'use strict';

/**
 * Sanitize MQTT JSON text before parse.
 * Firmware or truncated payloads may contain raw control chars inside strings.
 */
function sanitizeMqttJsonText(text) {
  let s = String(text ?? '').trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/[\u0000-\u001F]/g, (ch) => {
    if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
    return '';
  });
}

/**
 * @param {string} text raw MQTT payload
 * @returns {object|null} parsed object or null when empty
 */
function parseMqttJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    const sanitized = sanitizeMqttJsonText(raw);
    if (sanitized === raw) throw firstErr;
    try {
      return JSON.parse(sanitized);
    } catch {
      throw firstErr;
    }
  }
}

module.exports = { parseMqttJson, sanitizeMqttJsonText };
