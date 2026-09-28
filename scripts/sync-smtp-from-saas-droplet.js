'use strict';

/** Merge SMTP_* / MAIL_* from remote saas.env (stdin) into deploy/cloud/debian/saas.env */
const fs = require('fs');
const path = require('path');

const localPath = path.join(__dirname, '..', 'deploy', 'cloud', 'debian', 'saas.env');
const pick = [
  'PUBLIC_APP_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_FROM_NAME',
  'SMTP_SECURE',
  'SMTP_USE_API',
  'MAIL_TRANSPORT',
];

let remote = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { remote += d; });
process.stdin.on('end', () => {
  let local = fs.readFileSync(localPath, 'utf8');
  const remoteMap = {};
  for (const line of remote.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && pick.includes(m[1])) remoteMap[m[1]] = m[2];
  }
  if (!remoteMap.SMTP_HOST) {
    console.error('[sync-smtp] No SMTP_HOST in remote saas.env');
    process.exit(1);
  }
  if (!remoteMap.SMTP_USE_API) remoteMap.SMTP_USE_API = 'true';
  const block = [
    '',
    '# ---------------------------------------------------------------------------',
    '# Email (synced from mv-saas /etc/peaklogic/saas.env)',
    '# ---------------------------------------------------------------------------',
    ...Object.entries(remoteMap).map(([k, v]) => `${k}=${v}`),
  ].join('\n');

  if (!local.includes('# Email (synced from mv-saas')) {
    local = local.replace(/\nMONGO_URL=/, `${block}\n\nMONGO_URL=`);
  } else {
    local = local.replace(
      /# Email \(synced from mv-saas[\s\S]*?(?=\nMONGO_URL=)/,
      `${block.trim()}\n\n`,
    );
  }
  fs.writeFileSync(localPath, local);
  require('../src/loadEnv');
  const { isMailConfigured } = require('../src/mail/mailConfig');
  console.log('[sync-smtp] Updated', localPath);
  console.log('[sync-smtp] SMTP host:', remoteMap.SMTP_HOST);
  console.log('[sync-smtp] mail configured:', isMailConfigured());
});
