'use strict';

const { registry } = require('../parc/deviceRegistry');
const { tenantStore } = require('../tenants/tenantStore');

const FAULT_TAG_IDS = new Set([
  'ALT_FAULT',
  'PHASE_FAULT',
  'GEN_FAULT',
  'GEN_FUEL_FAULT',
  'MOTOR1_FAULT',
  'MOTOR2_FAULT',
]);

function isControllerRow(d) {
  if (!d || !d.deviceId) return false;
  const id = String(d.deviceId);
  if (id.startsWith('site-agent:') || id.startsWith('cam:')) return false;
  return String(d.kind || 'controller').trim() === 'controller';
}

function liveParcStatus(deviceId) {
  const parc = registry.getDevice(deviceId);
  if (!parc || !parc.lastReportAt) return null;
  return { online: !parc.stale, stale: !!parc.stale, lastReportAt: parc.lastReportAt };
}

function controllersForSite(siteId, tenantId) {
  const sid = String(siteId || '').trim();
  return tenantStore.listDevices(tenantId)
    .filter((d) => String(d.siteId || '').trim() === sid && isControllerRow(d));
}

function tagIsActive(tag) {
  if (!tag) return false;
  const v = tag.value ?? tag.default ?? 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '0' && v !== '' && v.toLowerCase() !== 'false';
  return !!v;
}

function tagHasAlarmLevel(tag) {
  if (!tag) return false;
  const level = String(tag.alarmLevel || '').trim().toLowerCase();
  return level === 'alarm' || level === 'inner' || level === 'outer';
}

/** Fleet map status: online | offline | fault | warning */
function siteFleetStatus(siteId, tenantId) {
  const controllers = controllersForSite(siteId, tenantId);
  if (!controllers.length) return 'offline';

  let hasFault = false;
  let hasWarnTag = false;
  let anyOnline = false;

  for (const d of controllers) {
    const live = liveParcStatus(d.deviceId);
    if (live?.online) anyOnline = true;
    const dev = registry.getDevice(d.deviceId);
    for (const tag of dev?.tags || []) {
      const id = String(tag.id || tag.tagId || '').trim();
      if (FAULT_TAG_IDS.has(id) && tagIsActive(tag)) hasFault = true;
      else if (tagHasAlarmLevel(tag) && tagIsActive(tag)) hasWarnTag = true;
    }
  }

  const commissioned = controllers.every((d) => String(d.commissioning || '').trim() === 'commissioned');

  if (hasFault) return 'fault';
  if (hasWarnTag) return 'warning';
  if (commissioned && !anyOnline) return 'warning';
  if (anyOnline) return 'online';
  return 'offline';
}

module.exports = {
  siteFleetStatus,
  FAULT_TAG_IDS,
};
