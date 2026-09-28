'use strict';

const { sendMail, isMailConfigured } = require('./mailer');
const {
  buildPasswordResetEmail,
  buildPasswordChangedEmail,
  buildWelcomeEmail,
  buildInviteEmail,
  buildMfaCodeEmail,
} = require('./templates');

async function sendPasswordResetEmail({ tenant, user, token }) {
  if (!isMailConfigured()) {
    console.log('[mail] password reset skipped — SMTP not configured');
    return { sent: false, reason: 'mail_not_configured' };
  }
  const tpl = buildPasswordResetEmail({ tenant, token });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  console.log(`[mail] password reset → ${user.email}`);
  return { sent: true };
}

async function sendPasswordChangedEmail({ tenant, user }) {
  if (!isMailConfigured()) return { sent: false, reason: 'mail_not_configured' };
  const tpl = buildPasswordChangedEmail({ tenant, user });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  console.log(`[mail] password changed → ${user.email}`);
  return { sent: true };
}

async function sendWelcomeEmail({ tenant, user, temporaryPassword }) {
  if (!isMailConfigured()) return { sent: false, reason: 'mail_not_configured' };
  const tpl = buildWelcomeEmail({ tenant, user, temporaryPassword });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  console.log(`[mail] welcome → ${user.email}`);
  return { sent: true };
}

async function sendInviteEmail({ tenant, user, token }) {
  if (!isMailConfigured()) {
    console.log('[mail] invite skipped — SMTP not configured');
    return { sent: false, reason: 'mail_not_configured' };
  }
  const tpl = buildInviteEmail({ tenant, user, token });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  console.log(`[mail] invite → ${user.email}`);
  return { sent: true };
}

async function sendMfaCodeEmail({ tenant, user, code }) {
  if (!isMailConfigured()) {
    console.log('[mail] MFA code skipped — SMTP not configured');
    return { sent: false, reason: 'mail_not_configured' };
  }
  const tpl = buildMfaCodeEmail({ tenant, user, code });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  console.log(`[mail] MFA code → ${user.email}`);
  return { sent: true };
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
  sendInviteEmail,
  sendMfaCodeEmail,
};
