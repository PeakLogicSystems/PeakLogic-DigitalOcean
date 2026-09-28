'use strict';

const { DEPLOYMENT_MODE } = require('../../config');
const {
  getMessagingSetupStatus,
  getMessagingFormConfig,
} = require('../../messaging/setupStatus');

function loadMailer() {
  try {
    return require('../../mail/mailer');
  } catch {
    return null;
  }
}

function loadTwilioSms() {
  try {
    return require('../../sms/twilioSms');
  } catch {
    return null;
  }
}

function loadPlatformStore() {
  try {
    return require('../../messaging/platformMessagingStore');
  } catch {
    return null;
  }
}

function requireMessagingSaveAuth(req, res, next) {
  if (DEPLOYMENT_MODE === 'cloud' && req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Tenant admin role required to save messaging credentials' });
  }
  return next();
}

function createMessagingRoutes() {
  const router = require('express').Router();

  router.get('/messaging/status', (req, res) => {
    const status = getMessagingSetupStatus();
    const form = getMessagingFormConfig();
    const mailer = loadMailer();
    const sms = loadTwilioSms();
    const store = loadPlatformStore();
    const canSave = DEPLOYMENT_MODE !== 'cloud' || req.auth?.role === 'admin';
    res.json({
      ok: true,
      ...status,
      form: form.mail && form.sms ? { mail: form.mail, sms: form.sms } : undefined,
      canSave,
      capabilities: {
        mailTest: Boolean(mailer?.sendMail),
        smsTest: Boolean(sms?.sendSms),
        saveConfig: Boolean(store?.writePlatformMessaging),
      },
    });
  });

  router.put('/messaging/config', requireMessagingSaveAuth, (req, res) => {
    const store = loadPlatformStore();
    if (!store?.writePlatformMessaging) {
      return res.status(503).json({ error: 'Platform messaging store is not available on this server' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      const saved = store.writePlatformMessaging(body);
      const mailer = loadMailer();
      mailer?.resetTransporter?.();
      res.json({
        ok: true,
        message: 'Messaging credentials saved',
        updatedAt: saved.updatedAt,
        ...getMessagingSetupStatus(),
      });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  router.post('/messaging/test/mail', async (req, res) => {
    const to = String(req.body?.to || '').trim().toLowerCase();
    if (!to || !to.includes('@')) {
      return res.status(400).json({ error: 'Valid test email address is required' });
    }

    const mailer = loadMailer();
    if (!mailer?.sendMail) {
      return res.status(503).json({
        error: 'Mail delivery module is not installed on this server',
      });
    }
    if (!mailer.isMailConfigured()) {
      return res.status(503).json({
        error: 'SMTP is not configured — enter credentials below or set SMTP_* in saas.env',
      });
    }

    try {
      const info = await mailer.sendMail({
        to,
        subject: 'PeakLogic test email',
        text: 'This is a test message from PeakLogic alarm / account email delivery.',
      });
      res.json({
        ok: true,
        message: `Test email sent to ${to}`,
        messageId: info.messageId || info.response || null,
      });
    } catch (e) {
      res.status(502).json({ error: e.message || String(e) });
    }
  });

  router.post('/messaging/test/sms', async (req, res) => {
    const to = String(req.body?.to || '').trim();
    if (!to) {
      return res.status(400).json({ error: 'Test phone number is required' });
    }

    const sms = loadTwilioSms();
    if (!sms?.sendSms) {
      return res.status(503).json({
        error: 'Twilio SMS module is not installed on this server',
      });
    }
    if (!sms.isSmsConfigured()) {
      return res.status(503).json({
        error: 'Twilio SMS is not configured — enter credentials below or set TWILIO_* in saas.env',
      });
    }

    try {
      const data = await sms.sendSms({
        to,
        body: 'PeakLogic test SMS — alarm notification delivery is working.',
      });
      res.json({
        ok: true,
        message: `Test SMS sent to ${to}`,
        sid: data.sid || null,
      });
    } catch (e) {
      res.status(502).json({ error: e.message || String(e) });
    }
  });

  return router;
}

module.exports = { createMessagingRoutes };
