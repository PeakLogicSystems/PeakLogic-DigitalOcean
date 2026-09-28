'use strict';

const { getSmsConfig, isSmsConfigured, normalizeE164 } = require('./smsConfig');

/**
 * @param {{ to: string, body: string }} opts
 */
async function sendSms(opts) {
  if (!isSmsConfigured()) {
    throw new Error('Twilio SMS is not configured');
  }

  const cfg = getSmsConfig();
  const to = normalizeE164(opts.to, cfg.defaultCountry);
  if (!to) throw new Error('Invalid SMS destination phone number');

  const body = String(opts.body || '').trim();
  if (!body) throw new Error('SMS body is required');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const params = new URLSearchParams({
    From: cfg.from,
    To: to,
    Body: body.slice(0, 1600),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error_message || res.statusText || 'Twilio request failed';
    throw new Error(`Twilio ${res.status}: ${msg}`);
  }

  return data;
}

module.exports = { sendSms, isSmsConfigured, normalizeE164 };
