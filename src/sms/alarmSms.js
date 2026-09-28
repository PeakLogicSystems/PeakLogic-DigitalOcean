'use strict';

const { sendSms, isSmsConfigured } = require('./twilioSms');
const { effectiveNotificationPhone } = require('../users/userProfileSchema');
const { getSmsConfig, normalizeE164 } = require('./smsConfig');

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

function buildAlarmSmsBody({ tenantName, alarm }) {
  const level = formatAlarmLevel(alarm.level);
  const tagId = alarm.tagId || 'unknown';
  const value = alarm.value != null ? String(alarm.value) : '—';
  const org = tenantName || 'PeakLogic';
  return `[${org}] ${level}: ${tagId} = ${value}`.slice(0, 320);
}

/**
 * @param {{ tenantName?: string, alarm: object, recipients: object[] }} opts
 */
async function deliverAlarmSmsNotifications(opts) {
  const { tenantName, alarm, recipients } = opts;
  if (!isSmsConfigured() || !recipients?.length) {
    return {
      sent: 0,
      failed: 0,
      skipped: !isSmsConfigured() ? 'sms_not_configured' : 'no_recipients',
    };
  }

  const { defaultCountry } = getSmsConfig();
  const body = buildAlarmSmsBody({ tenantName, alarm });
  let sent = 0;
  let failed = 0;

  for (const user of recipients) {
    const n = user.profile?.alarmNotifications || {};
    if (!n.sms) continue;
    const phone = normalizeE164(effectiveNotificationPhone(user), defaultCountry);
    if (!phone) continue;

    try {
      await sendSms({ to: phone, body });
      sent += 1;
      console.log(`[sms] alarm ${alarm.tagId} ${alarm.level} → ${phone}`);
    } catch (err) {
      failed += 1;
      console.warn(`[sms] alarm to ${phone}:`, err?.message || err);
    }
  }

  return { sent, failed };
}

module.exports = { deliverAlarmSmsNotifications, buildAlarmSmsBody, formatAlarmLevel };
