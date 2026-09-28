#!/usr/bin/env node
'use strict';

const { loadEnv } = require('../src/loadEnv');
loadEnv();

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: node scripts/test-smtp.js you@example.com');
  process.exit(1);
}

const { isMailConfigured, getMailConfig } = require('../src/mail/mailConfig');
const { sendMail } = require('../src/mail/mailer');

async function main() {
  const cfg = getMailConfig();
  console.log('[test-smtp] configured:', isMailConfigured());
  console.log('[test-smtp] host:', cfg.host || '(empty)');
  console.log('[test-smtp] port:', cfg.port);
  console.log('[test-smtp] from:', cfg.from);
  console.log('[test-smtp] user:', cfg.user ? '(set)' : '(empty)');
  console.log('[test-smtp] pass:', cfg.pass ? '(set)' : '(empty)');

  if (!isMailConfigured()) {
    console.error('[test-smtp] FAIL — set SMTP_HOST in /etc/peaklogic/saas.env');
    process.exit(1);
  }
  if (!cfg.pass) {
    console.error('[test-smtp] FAIL — SMTP_PASS is empty');
    process.exit(1);
  }

  const info = await sendMail({
    to,
    subject: 'PeakLogic SMTP test',
    text: 'If you received this message, SMTP is working on your PeakLogic server.',
    html: '<p>If you received this message, <strong>SMTP is working</strong> on your PeakLogic server.</p>',
  });
  console.log('[test-smtp] OK — messageId:', info.messageId || info.response || '(sent)');
}

main().catch((err) => {
  console.error('[test-smtp] FAIL —', err.message);
  process.exit(1);
});
