'use strict';

function readPlatformSms() {
  try {
    const { readPlatformMessagingRaw } = require('../messaging/platformMessagingStore');
    return readPlatformMessagingRaw().sms || {};
  } catch {
    return {};
  }
}

function getSmsConfig() {
  const platform = readPlatformSms();
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || platform.accountSid || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || platform.authToken || '').trim();
  const from = String(
    process.env.TWILIO_SMS_FROM || process.env.TWILIO_FROM || platform.from || '',
  ).trim();
  const defaultCountry = String(
    process.env.TWILIO_DEFAULT_COUNTRY || platform.defaultCountry || '1',
  ).replace(/\D/g, '') || '1';
  return { accountSid, authToken, from, defaultCountry };
}

function isSmsConfigured() {
  const cfg = getSmsConfig();
  return Boolean(cfg.accountSid && cfg.authToken && cfg.from);
}

/**
 * Normalize phone to E.164 for Twilio (+15551234567).
 * @param {string} phone
 * @param {string} [defaultCountry]
 */
function normalizeE164(phone, defaultCountry = '1') {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  const cc = String(defaultCountry || '1').replace(/\D/g, '') || '1';
  if (digits.length === 10 && cc === '1') return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return '';
}

module.exports = { getSmsConfig, isSmsConfigured, normalizeE164 };
