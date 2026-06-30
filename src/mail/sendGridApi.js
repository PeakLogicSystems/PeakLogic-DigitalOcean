'use strict';

const { getMailConfig } = require('./mailConfig');

/**
 * Send via SendGrid Web API (HTTPS :443) — works when cloud hosts block SMTP ports.
 * Uses SMTP_PASS as the SendGrid API key (same as SMTP auth).
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendViaSendGridApi(opts) {
  const cfg = getMailConfig();
  const apiKey = cfg.pass;
  if (!apiKey) throw new Error('SMTP_PASS (SendGrid API key) is required');

  const body = {
    personalizations: [{ to: [{ email: opts.to }] }],
    from: { email: cfg.from, ...(cfg.fromName ? { name: cfg.fromName } : {}) },
    subject: opts.subject,
    content: [{ type: 'text/plain', value: opts.text }],
  };
  if (opts.html) body.content.push({ type: 'text/html', value: opts.html });

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SendGrid API ${res.status}${errText ? `: ${errText.slice(0, 240)}` : ''}`);
  }

  return {
    messageId: res.headers.get('x-message-id') || undefined,
    response: String(res.status),
  };
}

module.exports = { sendViaSendGridApi };
