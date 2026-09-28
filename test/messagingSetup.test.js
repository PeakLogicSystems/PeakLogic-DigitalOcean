'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  getMailSetupStatus,
  getSmsSetupStatus,
  maskSecret,
} = require('../src/messaging/setupStatus');

describe('messaging setupStatus', () => {
  const prev = {};

  function saveEnv(keys) {
    keys.forEach((k) => { prev[k] = process.env[k]; });
  }

  function restoreEnv(keys) {
    keys.forEach((k) => {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    });
  }

  it('maskSecret hides middle of values', () => {
    assert.equal(maskSecret('AC1234567890abcdef', { showStart: 2, showEnd: 4 }), 'AC••••cdef');
  });

  it('reports mail configured when SMTP_HOST is set', () => {
    const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'SMTP_USE_API'];
    saveEnv(keys);
    process.env.SMTP_HOST = 'smtp.sendgrid.net';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'apikey';
    process.env.SMTP_PASS = 'secret';
    process.env.MAIL_FROM = 'noreply@test.io';
    process.env.SMTP_USE_API = 'true';

    const mail = getMailSetupStatus();
    assert.equal(mail.configured, true);
    assert.equal(mail.host, 'smtp.sendgrid.net');
    assert.equal(mail.hasPassword, true);
    assert.equal(mail.useSendGridApi, true);

    restoreEnv(keys);
  });

  it('reports SMS configured when Twilio vars are set', () => {
    const keys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM'];
    saveEnv(keys);
    process.env.TWILIO_ACCOUNT_SID = 'AC1234567890abcdef';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    process.env.TWILIO_SMS_FROM = '+15551234567';

    const sms = getSmsSetupStatus();
    assert.equal(sms.configured, true);
    assert.equal(sms.from, '+15551234567');
    assert.equal(sms.hasAuthToken, true);
    assert.equal(sms.sharesTwilioSuperSimCredentials, true);

    restoreEnv(keys);
  });
});
