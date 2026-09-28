'use strict';

const persistence = require('../persistence');
const userStore = require('../users/userStore');
const { resolveAlarmContext } = require('../alarms/alarmContext');
const {
  effectiveNotificationEmail,
  effectiveNotificationPhone,
} = require('../users/userProfileSchema');

const QUEUE_FILE = 'alarm_notify_queue.json';

function appendQueue(entry) {
  let list = persistence.readJson(QUEUE_FILE, []);
  if (!Array.isArray(list)) list = [];
  list.push(entry);
  if (list.length > 500) list = list.slice(-500);
  persistence.writeJson(QUEUE_FILE, list);
}

/**
 * Queue alarm notifications for active user profiles (email/SMS fields stored; delivery TBD).
 * @param {{ tagId: string, level: string, value?: * }} alarm
 */
function notifyAlarm(alarm) {
  const alarmContext = resolveAlarmContext(alarm);
  const recipients = userStore.listNotificationRecipients(alarm.level, alarmContext);
  if (!recipients.length) return { queued: 0 };

  let queued = 0;
  for (const user of recipients) {
    const n = user.profile?.alarmNotifications || {};
    const channels = [];
    if (n.email) {
      const addr = effectiveNotificationEmail(user);
      if (addr) channels.push({ type: 'email', address: addr });
    }
    if (n.sms) {
      const phone = effectiveNotificationPhone(user);
      if (phone) channels.push({ type: 'sms', address: phone });
    }
    if (n.push) channels.push({ type: 'push', address: user.id });
    if (!channels.length) continue;

    appendQueue({
      at: new Date().toISOString(),
      userId: user.id,
      email: user.email,
      tagId: alarm.tagId,
      level: alarm.level,
      value: alarm.value ?? null,
      channels,
    });
    queued += 1;
    console.log(`[alarm-notify] ${alarm.tagId} ${alarm.level} → ${user.email} (${channels.map((c) => c.type).join(',')})`);
  }
  return { queued };
}

module.exports = { notifyAlarm };
