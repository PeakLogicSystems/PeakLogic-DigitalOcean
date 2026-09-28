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

/** Sunday=0 … Saturday=6 */
const ALL_NOTIFY_DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

function defaultNotificationScope() {
  return {
    mode: 'all',
    siteIds: [],
    deviceIds: [],
    assetIds: [],
  };
}

function normalizeIdList(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((v) => String(v).trim()).filter(Boolean))];
}

function normalizeNotificationScope(input) {
  const base = defaultNotificationScope();
  if (!input || typeof input !== 'object') return base;
  return {
    mode: input.mode === 'scoped' ? 'scoped' : 'all',
    siteIds: normalizeIdList(input.siteIds),
    deviceIds: normalizeIdList(input.deviceIds),
    assetIds: normalizeIdList(input.assetIds),
  };
}

function defaultAlarmNotifications(email = '') {
  return {
    enabled: true,
    email: true,
    sms: false,
    push: false,
    minLevel: 'inner',
    emailAddress: '',
    phone: '',
    /** Days contact may receive alarms (0=Sun … 6=Sat). Empty/missing = all days. */
    notifyDays: [...ALL_NOTIFY_DAYS],
    /** When enabled, only notify between start–end (local / profile timezone). */
    notifyHours: {
      enabled: false,
      start: '08:00',
      end: '17:00',
    },
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'America/New_York',
    },
    notificationScope: defaultNotificationScope(),
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

function normalizeNotifyDays(input) {
  if (input == null) return [...ALL_NOTIFY_DAYS];
  if (!Array.isArray(input)) return [...ALL_NOTIFY_DAYS];
  const days = [...new Set(
    input.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  )].sort((a, b) => a - b);
  return days.length ? days : [...ALL_NOTIFY_DAYS];
}

function normalizeNotifyHours(nh) {
  const base = { enabled: false, start: '08:00', end: '17:00' };
  if (!nh || typeof nh !== 'object') return base;
  return {
    enabled: nh.enabled === true,
    start: String(nh.start || base.start).slice(0, 5),
    end: String(nh.end || base.end).slice(0, 5),
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
    notifyDays: normalizeNotifyDays(src.notifyDays),
    notifyHours: normalizeNotifyHours(src.notifyHours),
    quietHours: normalizeQuietHours(src.quietHours, tz),
    notificationScope: normalizeNotificationScope(src.notificationScope),
  };
}

/**
 * True when alarm context matches the user's notification scope.
 * Scoped users must match at least one selected site, device, or asset.
 */
function matchesNotificationScope(alarmNotifications, alarmContext = {}) {
  const scope = normalizeNotificationScope(alarmNotifications?.notificationScope);
  if (scope.mode !== 'scoped') return true;
  const { siteIds, deviceIds, assetIds } = scope;
  if (!siteIds.length && !deviceIds.length && !assetIds.length) return false;

  const ctxSite = String(alarmContext.siteId || '').trim();
  const ctxDevice = String(alarmContext.deviceId || '').trim();
  const ctxAssets = Array.isArray(alarmContext.assetIds)
    ? alarmContext.assetIds.map((a) => String(a).trim()).filter(Boolean)
    : [];

  if (siteIds.length && ctxSite && siteIds.includes(ctxSite)) return true;
  if (deviceIds.length && ctxDevice && deviceIds.includes(ctxDevice)) return true;
  if (assetIds.length && ctxAssets.some((a) => assetIds.includes(a))) return true;
  return false;
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

function minutesOfDay(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function clockMinutesInZone(now, timeZone) {
  if (timeZone) {
    try {
      const { zonedParts } = require('../settings/timezoneSettings');
      const p = zonedParts(timeZone, now);
      return p.hour * 60 + p.minute;
    } catch {
      /* fall through */
    }
  }
  return now.getHours() * 60 + now.getMinutes();
}

function weekdayInZone(now, timeZone) {
  if (timeZone) {
    try {
      const { zonedParts } = require('../settings/timezoneSettings');
      return zonedParts(timeZone, now).weekday;
    } catch {
      /* fall through */
    }
  }
  return now.getDay();
}

function resolveNotifyTimezone(alarmNotifications) {
  const qhTz = alarmNotifications?.quietHours?.timezone;
  const nhTz = alarmNotifications?.notifyHours?.timezone;
  return String(qhTz || nhTz || 'America/New_York').trim() || 'America/New_York';
}

function isWithinClockWindow(start, end, now = new Date(), timeZone) {
  const mins = clockMinutesInZone(now, timeZone);
  const startM = minutesOfDay(start);
  const endM = minutesOfDay(end);
  if (startM === endM) return true;
  if (startM < endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}

function isWithinQuietHours(alarmNotifications, now = new Date()) {
  const qh = alarmNotifications?.quietHours;
  if (!qh?.enabled) return false;
  const tz = resolveNotifyTimezone(alarmNotifications);
  return isWithinClockWindow(qh.start || '22:00', qh.end || '07:00', now, tz);
}

/** True when today is an allowed contact day (default: all days). */
function isNotifyDayActive(alarmNotifications, now = new Date()) {
  const days = normalizeNotifyDays(alarmNotifications?.notifyDays);
  const tz = resolveNotifyTimezone(alarmNotifications);
  return days.includes(weekdayInZone(now, tz));
}

/** True when current time is inside notifyHours (or notifyHours disabled = always). */
function isWithinNotifyHours(alarmNotifications, now = new Date()) {
  const nh = alarmNotifications?.notifyHours;
  if (!nh?.enabled) return true;
  const tz = resolveNotifyTimezone(alarmNotifications);
  return isWithinClockWindow(nh.start || '08:00', nh.end || '17:00', now, tz);
}

/** Combined schedule gate: contact day + notify hours + not quiet hours. */
function isContactScheduleActive(alarmNotifications, now = new Date()) {
  if (!isNotifyDayActive(alarmNotifications, now)) return false;
  if (!isWithinNotifyHours(alarmNotifications, now)) return false;
  if (isWithinQuietHours(alarmNotifications, now)) return false;
  return true;
}

module.exports = {
  ALL_NOTIFY_DAYS,
  defaultProfile,
  defaultAlarmNotifications,
  defaultNotificationScope,
  normalizeProfile,
  normalizeAlarmNotifications,
  normalizeNotificationScope,
  normalizeNotifyDays,
  normalizeNotifyHours,
  effectiveNotificationEmail,
  effectiveNotificationPhone,
  shouldNotifyForLevel,
  matchesNotificationScope,
  isWithinQuietHours,
  isNotifyDayActive,
  isWithinNotifyHours,
  isContactScheduleActive,
};
