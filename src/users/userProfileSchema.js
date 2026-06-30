'use strict';

const ALARM_LEVEL_RANK = {
  none: 0,
  normal: 0,
  innerLow: 1,
  innerHigh: 1,
  outerLow: 2,
  outerHigh: 2,
  alarm: 3,
};

const MIN_LEVEL_RANK = {
  none: 99,
  inner: 1,
  outer: 2,
  alarm: 3,
  all: 0,
};

function defaultAlarmNotifications(email = '') {
  return {
    enabled: true,
    email: true,
    sms: false,
    push: false,
    minLevel: 'inner',
    emailAddress: '',
    phone: '',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'America/New_York',
    },
  };
}

function defaultProfile(email = '') {
  const local = String(email || '').split('@')[0] || '';
  return {
    displayName: local,
    firstName: '',
    lastName: '',
    title: '',
    department: '',
    phone: '',
    mobile: '',
    locale: 'en-US',
    timezone: 'America/New_York',
    alarmNotifications: defaultAlarmNotifications(email),
  };
}

function normalizeQuietHours(qh, fallbackTz) {
  const base = {
    enabled: false,
    start: '22:00',
    end: '07:00',
    timezone: fallbackTz || 'America/New_York',
  };
  if (!qh || typeof qh !== 'object') return base;
  return {
    enabled: qh.enabled === true,
    start: String(qh.start || base.start).slice(0, 5),
    end: String(qh.end || base.end).slice(0, 5),
    timezone: String(qh.timezone || fallbackTz || base.timezone).trim() || base.timezone,
  };
}

function normalizeAlarmNotifications(input, ctx = {}) {
  const email = String(ctx.email || '').trim().toLowerCase();
  const profilePhone = String(ctx.profilePhone || '').trim();
  const defaults = defaultAlarmNotifications(email);
  const src = input && typeof input === 'object' ? input : {};
  const minLevel = ['none', 'inner', 'outer', 'alarm', 'all'].includes(src.minLevel)
    ? src.minLevel
    : defaults.minLevel;
  const tz = String(ctx.timezone || defaults.quietHours.timezone);
  return {
    enabled: src.enabled !== false,
    email: src.email !== false,
    sms: src.sms === true,
    push: src.push === true,
    minLevel,
    emailAddress: String(src.emailAddress || '').trim().toLowerCase(),
    phone: String(src.phone || profilePhone || '').trim(),
    quietHours: normalizeQuietHours(src.quietHours, tz),
  };
}

function normalizeProfile(input, ctx = {}) {
  const email = String(ctx.email || '').trim().toLowerCase();
  const defaults = defaultProfile(email);
  const src = input && typeof input === 'object' ? input : {};
  const timezone = String(src.timezone || defaults.timezone).trim() || defaults.timezone;
  const profile = {
    displayName: String(src.displayName ?? defaults.displayName).trim() || defaults.displayName,
    firstName: String(src.firstName || '').trim(),
    lastName: String(src.lastName || '').trim(),
    title: String(src.title || '').trim(),
    department: String(src.department || '').trim(),
    phone: String(src.phone || '').trim(),
    mobile: String(src.mobile || '').trim(),
    locale: String(src.locale || defaults.locale).trim() || defaults.locale,
    timezone,
  };
  profile.alarmNotifications = normalizeAlarmNotifications(
    src.alarmNotifications,
    { email, profilePhone: profile.mobile || profile.phone, timezone },
  );
  return profile;
}

function effectiveNotificationEmail(user) {
  const profile = user?.profile || {};
  const n = profile.alarmNotifications || {};
  return String(n.emailAddress || user?.email || '').trim().toLowerCase();
}

function effectiveNotificationPhone(user) {
  const n = user?.profile?.alarmNotifications || {};
  return String(n.phone || user?.profile?.mobile || user?.profile?.phone || '').trim();
}

function shouldNotifyForLevel(alarmNotifications, alarmLevel) {
  if (!alarmNotifications || alarmNotifications.enabled === false) return false;
  const min = alarmNotifications.minLevel || 'inner';
  if (min === 'none') return false;
  const need = MIN_LEVEL_RANK[min] ?? 1;
  const got = ALARM_LEVEL_RANK[alarmLevel] ?? 0;
  return got >= need;
}

function isWithinQuietHours(alarmNotifications, now = new Date()) {
  const qh = alarmNotifications?.quietHours;
  if (!qh?.enabled) return false;
  const start = qh.start || '22:00';
  const end = qh.end || '07:00';
  const [sh, sm] = start.split(':').map((n) => parseInt(n, 10) || 0);
  const [eh, em] = end.split(':').map((n) => parseInt(n, 10) || 0);
  const mins = now.getHours() * 60 + now.getMinutes();
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  if (startM === endM) return true;
  if (startM < endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}

module.exports = {
  defaultProfile,
  defaultAlarmNotifications,
  normalizeProfile,
  normalizeAlarmNotifications,
  effectiveNotificationEmail,
  effectiveNotificationPhone,
  shouldNotifyForLevel,
  isWithinQuietHours,
};
