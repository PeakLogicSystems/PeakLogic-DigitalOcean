'use strict';

const { PUBLIC_APP_URL } = require('../config');

function appBaseUrl() {
  const base = String(PUBLIC_APP_URL || '').trim();
  return base.replace(/\/$/, '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAlarmLevel(level) {
  const map = {
    innerLow: 'Inner low',
    innerHigh: 'Inner high',
    outerLow: 'Outer low',
    outerHigh: 'Outer high',
    alarm: 'Alarm',
  };
  return map[level] || String(level || 'Alarm');
}

function buildAlarmEmail({ tenantName, alarm, user }) {
  const level = formatAlarmLevel(alarm.level);
  const tagId = alarm.tagId || 'unknown';
  const value = alarm.value != null ? String(alarm.value) : '—';
  const org = tenantName || 'MooreVIEW';
  const subject = `[${org}] ${level}: ${tagId}`;
  const studioUrl = appBaseUrl() ? `${appBaseUrl()}/studio` : '/studio';
  const text = [
    `${level} on tag ${tagId}`,
    `Value: ${value}`,
    `Organization: ${org}`,
    '',
    `Open Studio: ${studioUrl}`,
  ].join('\n');
  const html = `
    <p><strong>${escapeHtml(level)}</strong> on tag <code>${escapeHtml(tagId)}</code></p>
    <p>Value: <strong>${escapeHtml(value)}</strong></p>
    <p>Organization: ${escapeHtml(org)}</p>
    <p><a href="${escapeHtml(studioUrl)}">Open MooreVIEW Studio</a></p>
  `.trim();
  return { subject, text, html, toName: user?.profile?.displayName || user?.email };
}

function buildPasswordResetEmail({ tenant, token }) {
  const org = tenant?.name || tenant?.slug || 'your organization';
  const base = appBaseUrl();
  const resetUrl = base
    ? `${base}/reset-password?token=${encodeURIComponent(token)}`
    : `/reset-password?token=${encodeURIComponent(token)}`;
  const subject = `Reset your MooreVIEW password`;
  const text = [
    `You requested a password reset for ${org}.`,
    '',
    `Reset your password (link expires in 1 hour):`,
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = `
    <p>You requested a password reset for <strong>${escapeHtml(org)}</strong>.</p>
    <p><a href="${escapeHtml(resetUrl)}">Reset your password</a> (link expires in 1 hour).</p>
    <p>If you did not request this, you can ignore this email.</p>
  `.trim();
  return { subject, text, html, resetUrl };
}

function buildPasswordChangedEmail({ tenant, user }) {
  const org = tenant?.name || tenant?.slug || 'your organization';
  const subject = `Your MooreVIEW password was changed`;
  const text = [
    `The password for ${user?.email || 'your account'} at ${org} was changed.`,
    '',
    'If you did not make this change, contact your administrator immediately.',
  ].join('\n');
  const html = `
    <p>The password for <strong>${escapeHtml(user?.email || 'your account')}</strong> at ${escapeHtml(org)} was changed.</p>
    <p>If you did not make this change, contact your administrator immediately.</p>
  `.trim();
  return { subject, text, html };
}

function buildWelcomeEmail({ tenant, user, temporaryPassword }) {
  const org = tenant?.name || tenant?.slug || 'your organization';
  const loginUrl = appBaseUrl() ? `${appBaseUrl()}/login` : '/login';
  const subject = `Welcome to MooreVIEW — ${org}`;
  const lines = [
    `An account was created for you at ${org}.`,
    `Email: ${user?.email || ''}`,
    `Organization slug: ${tenant?.slug || ''}`,
  ];
  if (temporaryPassword) {
    lines.push('', `Temporary password: ${temporaryPassword}`, 'Please sign in and change your password.');
  }
  lines.push('', `Sign in: ${loginUrl}`);
  const text = lines.join('\n');
  const html = `
    <p>An account was created for you at <strong>${escapeHtml(org)}</strong>.</p>
    <ul>
      <li>Email: ${escapeHtml(user?.email || '')}</li>
      <li>Organization slug: <code>${escapeHtml(tenant?.slug || '')}</code></li>
      ${temporaryPassword ? `<li>Temporary password: <code>${escapeHtml(temporaryPassword)}</code></li>` : ''}
    </ul>
    <p><a href="${escapeHtml(loginUrl)}">Sign in to MooreVIEW</a></p>
  `.trim();
  return { subject, text, html };
}

function buildInviteEmail({ tenant, user, token }) {
  const org = tenant?.name || tenant?.slug || 'your organization';
  const base = appBaseUrl();
  const inviteUrl = base
    ? `${base}/accept-invite?token=${encodeURIComponent(token)}`
    : `/accept-invite?token=${encodeURIComponent(token)}`;
  const subject = `You're invited to MooreVIEW — ${org}`;
  const text = [
    `You've been invited to join ${org} on MooreVIEW.`,
    `Email: ${user?.email || ''}`,
    `Organization slug: ${tenant?.slug || ''}`,
    '',
    `Accept your invite and set your password (link expires in 7 days):`,
    inviteUrl,
  ].join('\n');
  const html = `
    <p>You've been invited to join <strong>${escapeHtml(org)}</strong> on MooreVIEW.</p>
    <ul>
      <li>Email: ${escapeHtml(user?.email || '')}</li>
      <li>Organization slug: <code>${escapeHtml(tenant?.slug || '')}</code></li>
    </ul>
    <p><a href="${escapeHtml(inviteUrl)}">Accept invite and set your password</a> (link expires in 7 days).</p>
  `.trim();
  return { subject, text, html, inviteUrl };
}

module.exports = {
  buildAlarmEmail,
  buildPasswordResetEmail,
  buildPasswordChangedEmail,
  buildWelcomeEmail,
  buildInviteEmail,
};
