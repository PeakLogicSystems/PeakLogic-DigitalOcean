'use strict';

const nodemailer = require('nodemailer');
const { getMailConfig, isMailConfigured, useSendGridApi } = require('./mailConfig');

/** @type {import('nodemailer').Transporter|null} */
let transporter = null;

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const cfg = getMailConfig();
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendMail(opts) {
  if (!isMailConfigured()) {
    throw new Error('SMTP is not configured');
  }
  if (useSendGridApi()) {
    const { sendViaSendGridApi } = require('./sendGridApi');
    return sendViaSendGridApi(opts);
  }

  const cfg = getMailConfig();
  const transport = getTransporter();
  const from = cfg.fromName ? `"${cfg.fromName}" <${cfg.from}>` : cfg.from;
  const info = await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || undefined,
  });
  return info;
}

function resetTransporter() {
  transporter = null;
}

module.exports = { sendMail, getTransporter, resetTransporter, isMailConfigured };
