'use strict';

const { sendMail, isMailConfigured } = require('./mailer');
const { buildAlarmEmail } = require('./templates');
const { effectiveNotificationEmail } = require('../users/userProfileSchema');

/**
 * Send alarm notification emails to configured recipients.
 * @param {{ tenantName?: string, tenantId?: string, alarm: object, recipients: object[] }} opts
 */
async function deliverAlarmNotifications(opts) {
  const { tenantName, tenantId, alarm, recipients } = opts;
  if (!isMailConfigured() || !recipients?.length) {
    return { sent: 0, failed: 0, skipped: !isMailConfigured() ? 'mail_not_configured' : 'no_recipients' };
  }

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    const n = user.profile?.alarmNotifications || {};
    if (!n.email) continue;
    const addr = effectiveNotificationEmail(user);
    if (!addr) continue;

    const tpl = buildAlarmEmail({ tenantName, alarm, user });
    try {
      await sendMail({ to: addr, subject: tpl.subject, text: tpl.text, html: tpl.html });
      sent += 1;
      console.log(`[mail] alarm ${alarm.tagId} ${alarm.level} → ${addr}`);
    } catch (err) {
      failed += 1;
      console.warn(`[mail] alarm to ${addr}:`, err?.message || err);
    }
  }

  if (tenantId && (sent || failed)) {
    try {
      const { getDb } = require('../db/mongo');
      const at = new Date().toISOString();
      await getDb().collection('alarm_notify_queue').insertOne({
        at,
        tenantId,
        tagId: alarm.tagId,
        level: alarm.level,
        value: alarm.value ?? null,
        channel: 'email',
        sent,
        failed,
        status: failed && !sent ? 'failed' : 'sent',
      });
    } catch {
      /* optional audit log */
    }
  }

  return { sent, failed };
}

module.exports = { deliverAlarmNotifications };
