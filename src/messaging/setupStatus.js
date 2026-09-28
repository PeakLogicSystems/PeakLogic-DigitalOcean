'use strict';

const { getMailConfig, isMailConfigured, useSendGridApi } = require('../mail/mailConfig');
const { getSmsConfig, isSmsConfigured } = require('../sms/smsConfig');

function maskSecret(value, { showStart = 0, showEnd = 4 } = {}) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.length <= showStart + showEnd) return '••••';
  return `${s.slice(0, showStart)}••••${s.slice(-showEnd)}`;
}

function envSet(key) {
  return Boolean(String(process.env[key] || '').trim());
}

function getMailSetupStatus() {
  const cfg = getMailConfig();
  const configured = isMailConfigured();
  const fromEnv = {
    host: envSet('SMTP_HOST'),
    port: envSet('SMTP_PORT'),
    user: envSet('SMTP_USER'),
    pass: envSet('SMTP_PASS') || envSet('SMTP_PASSWORD'),
    from: envSet('MAIL_FROM') || envSet('SMTP_FROM'),
    fromName: envSet('MAIL_FROM_NAME'),
    useSendGridApi: envSet('SMTP_USE_API')
      || ['sendgrid-api', 'sendgrid'].includes(String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase()),
  };

  let storedConfigured = false;
  try {
    const { readPlatformMessagingRaw } = require('./platformMessagingStore');
    const mail = readPlatformMessagingRaw().mail || {};
    storedConfigured = Boolean(mail.host);
  } catch {
    /* appliance or store unavailable */
  }

  return {
    configured,
    host: cfg.host || null,
    port: cfg.port,
    secure: cfg.secure,
    from: cfg.from || null,
    fromName: cfg.fromName,
    user: cfg.user || null,
    hasPassword: Boolean(cfg.pass),
    useSendGridApi: useSendGridApi(),
    envFileHint: process.env.PEAKLOGIC_DEPLOYMENT === 'cloud'
      ? '/etc/peaklogic/saas.env'
      : '.env',
    source: envSet('SMTP_HOST') ? 'env' : (storedConfigured ? 'saved' : 'none'),
    envOverrides: envSet('SMTP_HOST') ? fromEnv : null,
  };
}

function getSmsSetupStatus() {
  const cfg = getSmsConfig();
  const configured = isSmsConfigured();

  let storedConfigured = false;
  try {
    const { readPlatformMessagingRaw } = require('./platformMessagingStore');
    const sms = readPlatformMessagingRaw().sms || {};
    storedConfigured = Boolean(sms.accountSid && sms.authToken && sms.from);
  } catch {
    /* appliance */
  }

  return {
    configured,
    accountSid: cfg.accountSid ? maskSecret(cfg.accountSid, { showStart: 2, showEnd: 4 }) : null,
    from: cfg.from || null,
    hasAuthToken: Boolean(cfg.authToken),
    defaultCountry: cfg.defaultCountry,
    sharesTwilioSuperSimCredentials: Boolean(cfg.accountSid && cfg.authToken),
    envFileHint: process.env.PEAKLOGIC_DEPLOYMENT === 'cloud'
      ? '/etc/peaklogic/saas.env'
      : '.env',
    source: envSet('TWILIO_ACCOUNT_SID') ? 'env' : (storedConfigured ? 'saved' : 'none'),
  };
}

function getMessagingSetupStatus() {
  return {
    mail: getMailSetupStatus(),
    sms: getSmsSetupStatus(),
  };
}

function getMessagingFormConfig() {
  const cfgMail = getMailConfig();
  const cfgSms = getSmsConfig();
  let saved = { mail: {}, sms: {} };
  try {
    const { readPlatformMessagingMasked } = require('./platformMessagingStore');
    saved = readPlatformMessagingMasked();
  } catch {
    /* appliance */
  }
  return {
    mail: {
      host: saved.mail.host || cfgMail.host || '',
      port: saved.mail.port || cfgMail.port || 587,
      secure: saved.mail.secure ?? cfgMail.secure ?? false,
      user: saved.mail.user || cfgMail.user || '',
      pass: saved.mail.pass || (cfgMail.pass ? '********' : ''),
      from: saved.mail.from || cfgMail.from || '',
      fromName: saved.mail.fromName || cfgMail.fromName || 'PeakLogic',
      useSendGridApi: saved.mail.useSendGridApi ?? useSendGridApi() ?? false,
      hasPassword: Boolean(cfgMail.pass),
    },
    sms: {
      accountSid: saved.sms.accountSid || cfgSms.accountSid || '',
      authToken: saved.sms.authToken || (cfgSms.authToken ? '********' : ''),
      from: saved.sms.from || cfgSms.from || '',
      defaultCountry: saved.sms.defaultCountry || cfgSms.defaultCountry || '1',
      hasAuthToken: Boolean(cfgSms.authToken),
    },
    saved,
  };
}

module.exports = {
  getMailSetupStatus,
  getSmsSetupStatus,
  getMessagingSetupStatus,
  getMessagingFormConfig,
  maskSecret,
};
