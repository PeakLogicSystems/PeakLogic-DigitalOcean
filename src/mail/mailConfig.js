'use strict';

function readPlatformMail() {
  try {
    const { readPlatformMessagingRaw } = require('../messaging/platformMessagingStore');
    return readPlatformMessagingRaw().mail || {};
  } catch {
    return {};
  }
}

function getMailConfig() {
  const platform = readPlatformMail();
  const host = String(process.env.SMTP_HOST || platform.host || '').trim();
  const port = Number(process.env.SMTP_PORT || platform.port) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || platform.secure === true || port === 465;
  const user = String(process.env.SMTP_USER || platform.user || '').trim();
  const pass = String(
    process.env.SMTP_PASS || process.env.SMTP_PASSWORD || platform.pass || '',
  ).trim();
  const from = String(
    process.env.MAIL_FROM || process.env.SMTP_FROM || platform.from || user || 'noreply@peaklogic.local',
  ).trim();
  const fromName = String(process.env.MAIL_FROM_NAME || platform.fromName || 'PeakLogic').trim() || 'PeakLogic';
  return { host, port, secure, user, pass, from, fromName };
}

function isMailConfigured() {
  return Boolean(getMailConfig().host);
}

/** HTTPS SendGrid API — use on DO/VPS where outbound SMTP (587/465) is blocked. */
function useSendGridApi() {
  const transport = String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
  if (transport === 'sendgrid-api' || transport === 'sendgrid') return true;
  if (process.env.SMTP_USE_API === 'true') return true;
  try {
    const platform = readPlatformMail();
    return platform.useSendGridApi === true;
  } catch {
    return false;
  }
}

module.exports = { getMailConfig, isMailConfigured, useSendGridApi };
