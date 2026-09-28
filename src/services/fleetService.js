'use strict';

const { getDb } = require('../db/mongo');
const { getStationType, listStationTypes } = require('../fleet/stationTypes');
const { listFloridaCounties } = require('../fleet/floridaCounties');
const locationService = require('./locationService');
const systemService = require('./systemService');
const deviceService = require('./deviceService');
const { firmwareStatus, OPTA_RECOMMENDED_FIRMWARE } = require('../drivers/optaProtocol');

const ALARM_TAGS = ['ALT_FAULT', 'ALT_FAULT2', 'ALT_FAULT3', 'ALT_FAULT4', 'LVL_HIGH', 'LVL_HIGH2', 'LVL_HIGH3', 'LVL_HIGH4'];

function tagValue(tags, id) {
  if (!Array.isArray(tags)) return null;
  const row = tags.find((t) => t.id === id);
  return row ? row.value : null;
}

function isTruthy(v) {
  return v === true || v === 1 || v === '1';
}

function deriveAlarmState({ online, tags, metadata }) {
  if (online === false) return 'offline';
  for (const id of ALARM_TAGS) {
    if (isTruthy(tagValue(tags, id))) return 'alarm';
  }
  if (metadata?.alarmAcknowledged) return 'ack';
  if (isTruthy(tagValue(tags, 'LVL_LAG')) || isTruthy(tagValue(tags, 'LVL_LAG2'))) return 'warning';
  return 'normal';
}

/**
 * Coarse station operating mode used by the Sites page and status badges.
 * One of: 'offline', 'online-running', 'online-warning', 'online-faulted'.
 */
function deriveStationMode({ online, tags, metadata }) {
  if (online !== true) return 'offline';
  const state = deriveAlarmState({ online, tags, metadata });
  if (state === 'alarm' || state === 'ack') return 'online-faulted';
  if (state === 'warning') return 'online-warning';
  return 'online-running';
}

function userCountyScopes(user) {
  const scopes = user?.profile?.fleetScopes?.counties;
  if (!Array.isArray(scopes)) return null;
  return scopes.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
}

function canAccessCounty(user, role, countySlug) {
  if (role === 'admin') return true;
  const scopes = userCountyScopes(user);
  if (scopes === null) return true;
  if (!scopes.length) return false;
  return scopes.includes(String(countySlug || '').toLowerCase());
}

function listAccessibleCounties(user, role) {
  const all = listFloridaCounties();
  if (role === 'admin') return all;
  const scopes = userCountyScopes(user);
  if (scopes === null) return all;
  if (!scopes.length) return [];
  const set = new Set(scopes);
  return all.filter((c) => set.has(c.slug));
}

async function loadCountyMap(tenantId) {
  const locations = await locationService.listLocations(tenantId);
  return Object.fromEntries(locations.map((l) => [l.id, l]));
}

async function listStations(tenantId, filters = {}, user = null, role = 'admin') {
  const db = getDb();
  const countyMap = await loadCountyMap(tenantId);
  const systems = await db.collection('systems').find({ tenantId }).sort({ name: 1 }).toArray();

  const devices = await db.collection('devices').find({ tenantId }).toArray();
  const devicesBySystem = {};
  for (const d of devices) {
    if (!devicesBySystem[d.systemId]) devicesBySystem[d.systemId] = [];
    devicesBySystem[d.systemId].push(d);
  }

  const parcRows = await db.collection('parc_devices').find({ tenantId }).toArray();
  const parcByDeviceId = Object.fromEntries(parcRows.map((p) => [p.deviceId, p]));

  const latestRows = await db.collection('device_telemetry_latest').find({ tenantId }).toArray();
  const latestByDeviceId = Object.fromEntries(latestRows.map((r) => [r.deviceId, r]));

  const stations = [];
  for (const doc of systems) {
    const meta = doc.metadata || {};
    if (!meta.stationType && !meta.lat) continue;

    const county = countyMap[doc.locationId];
    const countySlug = meta.county || county?.slug || '';
    if (filters.county && countySlug !== normalizeFilter(filters.county)) continue;
    if (filters.stationType && meta.stationType !== filters.stationType) continue;
    if (user && !canAccessCounty(user, role, countySlug)) continue;

    const sysDevices = devicesBySystem[doc._id] || [];
    const primary = sysDevices[0];
    const mqttId = primary?.driverConfig?.deviceId || primary?.slug;
    const parc = mqttId ? parcByDeviceId[mqttId] : null;
    const latest = mqttId ? latestByDeviceId[mqttId] : null;
    const tags = latest?.tags || parc?.lastReport?.tags || [];
    const online = parc ? parc.online !== false : null;
    const alarmState = deriveAlarmState({ online, tags, metadata: meta });
    if (filters.alarmOnly && alarmState === 'normal') continue;

    const profile = getStationType(meta.stationType) || {};
    stations.push({
      id: doc._id,
      systemId: doc._id,
      locationId: doc.locationId,
      name: doc.name,
      slug: doc.slug,
      stationType: meta.stationType,
      stationTypeLabel: profile.label || meta.stationType,
      mapColor: profile.mapColor || '#607d8b',
      shortLabel: profile.shortLabel || '',
      lat: meta.lat,
      lng: meta.lng,
      county: countySlug,
      countyName: meta.countyName || county?.name || countySlug,
      deviceId: mqttId || null,
      deviceSlug: primary?.slug || null,
      online,
      alarmState,
      lastSeenAt: parc?.lastSeenAt || latest?.receivedAt || null,
      program: meta.program || profile.program || null,
      templateId: meta.templateId || profile.templateId || null,
      pumpCount: profile.pumpCount || null,
      tpoCount: profile.tpoCount || null,
    });
  }

  return stations;
}

function normalizeFilter(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function getStationDetail(tenantId, systemId) {
  const system = await systemService.getSystem(tenantId, systemId);
  if (!system) return { ok: false, status: 404, error: 'Station not found' };
  const meta = (await getDb().collection('systems').findOne({ _id: systemId, tenantId }))?.metadata || {};
  const county = await locationService.getLocation(tenantId, system.locationId);
  const devRes = await deviceService.listDevices(tenantId, systemId);
  const devices = devRes.ok ? devRes.devices : [];
  const mqttId = devices[0]?.driverConfig?.deviceId;
  const parc = mqttId
    ? await getDb().collection('parc_devices').findOne({ tenantId, deviceId: mqttId })
    : null;
  const latest = mqttId
    ? await getDb().collection('device_telemetry_latest').findOne({ tenantId, deviceId: mqttId })
    : null;
  const tags = latest?.tags || parc?.lastReport?.tags || [];
  const profile = getStationType(meta.stationType) || {};

  return {
    ok: true,
    station: {
      ...system,
      metadata: meta,
      county,
      devices,
      profile,
      tags,
      online: parc ? parc.online !== false : null,
      alarmState: deriveAlarmState({ online: parc?.online !== false, tags, metadata: meta }),
      lastSeenAt: parc?.lastSeenAt || latest?.receivedAt || null,
      firmwareVersion: latest?.firmwareVersion || parc?.firmwareVersion || null,
      firmwareStatus: firmwareStatus(latest?.firmwareVersion || parc?.firmwareVersion),
      recommendedFirmware: OPTA_RECOMMENDED_FIRMWARE,
    },
  };
}

async function listAlarms(tenantId, filters = {}, user = null, role = 'admin') {
  const stations = await listStations(tenantId, { ...filters, alarmOnly: false }, user, role);
  return stations
    .filter((s) => s.alarmState !== 'normal')
    .sort((a, b) => {
      const rank = { alarm: 0, offline: 1, warning: 2, ack: 3 };
      return (rank[a.alarmState] ?? 9) - (rank[b.alarmState] ?? 9);
    });
}

async function buildDailyReport(tenantId, filters = {}, user = null, role = 'admin') {
  const stations = await listStations(tenantId, filters, user, role);
  const byCounty = {};
  const byType = {};
  let online = 0;
  let offline = 0;
  let inAlarm = 0;

  for (const s of stations) {
    byCounty[s.county] = byCounty[s.county] || { total: 0, alarm: 0, offline: 0 };
    byCounty[s.county].total += 1;
    if (s.alarmState === 'alarm') { byCounty[s.county].alarm += 1; inAlarm += 1; }
    if (s.alarmState === 'offline') { byCounty[s.county].offline += 1; offline += 1; }
    if (s.online === true) online += 1;
    if (s.online === false) offline += 1;
    byType[s.stationType] = (byType[s.stationType] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalStations: stations.length,
    online,
    offline,
    inAlarm,
    byCounty,
    byType,
    stationTypes: listStationTypes(),
  };
}

/**
 * Live status per system for the tenant, keyed by systemId. Used by the Sites page.
 * A system with no telemetry / no parc row is reported 'offline' (e.g. not yet
 * configured at the edge). Systems with no device are 'no-device'.
 * @returns {Promise<Object<string,{status:string,online:boolean|null,deviceId:string|null,lastSeenAt:*}>>}
 */
async function getSystemStatuses(tenantId) {
  const db = getDb();
  const devices = await db.collection('devices').find({ tenantId }).toArray();
  const devicesBySystem = {};
  for (const d of devices) {
    if (!devicesBySystem[d.systemId]) devicesBySystem[d.systemId] = [];
    devicesBySystem[d.systemId].push(d);
  }
  const parcRows = await db.collection('parc_devices').find({ tenantId }).toArray();
  const parcByDeviceId = Object.fromEntries(parcRows.map((p) => [p.deviceId, p]));
  const latestRows = await db.collection('device_telemetry_latest').find({ tenantId }).toArray();
  const latestByDeviceId = Object.fromEntries(latestRows.map((r) => [r.deviceId, r]));

  const out = {};
  const systems = await db.collection('systems').find({ tenantId }).toArray();
  for (const sys of systems) {
    const sysDevices = devicesBySystem[sys._id] || [];
    const primary = sysDevices[0];
    if (!primary) {
      out[sys._id] = { status: 'offline', online: false, deviceId: null, deviceCount: 0, lastSeenAt: null };
      continue;
    }
    const mqttId = primary.driverConfig?.deviceId || primary.slug;
    const parc = mqttId ? parcByDeviceId[mqttId] : null;
    const latest = mqttId ? latestByDeviceId[mqttId] : null;
    const tags = latest?.tags || parc?.lastReport?.tags || [];
    // Never seen on MQTT -> offline (not configured yet).
    const online = parc ? parc.online === true : false;
    const mode = deriveStationMode({ online, tags, metadata: sys.metadata || {} });
    out[sys._id] = {
      status: mode,
      online,
      deviceId: mqttId || null,
      deviceCount: sysDevices.length,
      lastSeenAt: parc?.lastSeenAt || latest?.receivedAt || null,
      firmwareVersion: latest?.firmwareVersion || parc?.firmwareVersion || null,
      firmwareStatus: firmwareStatus(latest?.firmwareVersion || parc?.firmwareVersion),
    };
  }
  return out;
}

async function ackStationAlarm(tenantId, systemId) {
  const result = await getDb().collection('systems').findOneAndUpdate(
    { _id: systemId, tenantId },
    { $set: { 'metadata.alarmAcknowledged': true, 'metadata.alarmAckAt': new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!result) return { ok: false, status: 404, error: 'Station not found' };
  return { ok: true };
}

module.exports = {
  listStations,
  getStationDetail,
  listAlarms,
  buildDailyReport,
  getSystemStatuses,
  ackStationAlarm,
  userCountyScopes,
  canAccessCounty,
  listAccessibleCounties,
  deriveAlarmState,
  deriveStationMode,
};
