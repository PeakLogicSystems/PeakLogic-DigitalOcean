'use strict';

const SECRET_KEYS = new Set(['pass', 'authToken']);

function isMaskedSecret(value) {
  const s = String(value ?? '').trim();
  return !s || /^•+$/.test(s) || s === '********';
}

function normalizeMailInput(input = {}, prev = {}) {
  const useSendGridApi = input.useSendGridApi === true
    || input.useSendGridApi === 'true'
    || prev.useSendGridApi === true;
  const passIn = input.pass ?? input.smtpPass;
  const mail = {
    host: String(input.host ?? prev.host ?? '').trim(),
    port: Number(input.port ?? prev.port) || 587,
    secure: input.secure === true || input.secure === 'true' || prev.secure === true,
    user: String(input.user ?? prev.user ?? '').trim(),
    from: String(input.from ?? prev.from ?? '').trim(),
    fromName: String(input.fromName ?? prev.fromName ?? 'PeakLogic').trim() || 'PeakLogic',
    useSendGridApi,
  };
  if (passIn != null && !isMaskedSecret(passIn)) {
    mail.pass = String(passIn).trim();
  } else if (prev.pass) {
    mail.pass = prev.pass;
  }
  return mail;
}

function normalizeSmsInput(input = {}, prev = {}) {
  const tokenIn = input.authToken;
  const sms = {
    accountSid: String(input.accountSid ?? prev.accountSid ?? '').trim(),
    from: String(input.from ?? prev.from ?? '').trim(),
    defaultCountry: String(input.defaultCountry ?? prev.defaultCountry ?? '1').replace(/\D/g, '') || '1',
  };
  if (tokenIn != null && !isMaskedSecret(tokenIn)) {
    sms.authToken = String(tokenIn).trim();
  } else if (prev.authToken) {
    sms.authToken = prev.authToken;
  }
  return sms;
}

function normalizePlatformMessaging(input = {}, prev = {}) {
  const prevMail = prev.mail && typeof prev.mail === 'object' ? prev.mail : {};
  const prevSms = prev.sms && typeof prev.sms === 'object' ? prev.sms : {};
  const next = {
    mail: normalizeMailInput(input.mail || {}, prevMail),
    sms: normalizeSmsInput(input.sms || {}, prevSms),
    updatedAt: new Date().toISOString(),
  };
  return next;
}

function maskSecrets(section = {}) {
  const out = { ...section };
  for (const key of Object.keys(out)) {
    if (SECRET_KEYS.has(key) && out[key]) {
      out[key] = '********';
      out[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = true;
    }
  }
  return out;
}

function maskPlatformMessaging(doc = {}) {
  return {
    mail: maskSecrets(doc.mail || {}),
    sms: maskSecrets(doc.sms || {}),
    updatedAt: doc.updatedAt || null,
  };
}

module.exports = {
  normalizePlatformMessaging,
  maskPlatformMessaging,
  isMaskedSecret,
};
