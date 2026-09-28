'use strict';

const { randomUUID } = require('crypto');
const { getDb } = require('../db/mongo');
const { PLATFORM_ADMIN_KEY } = require('../config');
const deviceService = require('./deviceService');
const { normalizeSlug, isValidSlug } = require('../util/slug');

function pairingKeyValid(key) {
  const k = String(key || '').trim();
  if (!k) return false;
  const envKey = process.env.APPLIANCE_PAIRING_KEY || PLATFORM_ADMIN_KEY;
  return envKey && k === envKey;
}

async function findHierarchy(tenantSlug, locationSlug, systemSlug) {
  const db = getDb();
  const tenant = await db.collection('tenants').findOne({ slug: normalizeSlug(tenantSlug) });
  if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

  const location = await db.collection('locations').findOne({
    tenantId: tenant._id,
    slug: normalizeSlug(locationSlug),
  });
  if (!location) return { ok: false, status: 404, error: 'Location not found' };

  const system = await db.collection('systems').findOne({
    tenantId: tenant._id,
    locationId: location._id,
    slug: normalizeSlug(systemSlug),
  });
  if (!system) return { ok: false, status: 404, error: 'System not found' };

  return { ok: true, tenant, location, system };
}

/**
 * Pair an est-pc appliance as a remote gateway for a tenant location/system.
 * Returns cloudRemote settings blob for appliance settings.json.
 */
async function pairAppliance(input) {
  const tenantSlug = String(input.tenantSlug || '').trim();
  const locationSlug = String(input.locationSlug || '').trim();
  const systemSlug = String(input.systemSlug || '').trim();
  const applianceName = String(input.applianceName || 'Edge appliance').trim();
  const pairingKey = String(input.pairingKey || '').trim();

  if (!tenantSlug || !locationSlug || !systemSlug) {
    return { ok: false, status: 400, error: 'tenantSlug, locationSlug, systemSlug required' };
  }
  if (!isValidSlug(normalizeSlug(tenantSlug))) {
    return { ok: false, status: 400, error: 'Invalid tenantSlug' };
  }
  if (!pairingKeyValid(pairingKey)) {
    return { ok: false, status: 403, error: 'Invalid pairing key' };
  }

  const hierarchy = await findHierarchy(tenantSlug, locationSlug, systemSlug);
  if (!hierarchy.ok) return hierarchy;

  const { tenant, location, system } = hierarchy;
  const applianceId = String(input.applianceId || '').trim() || randomUUID();
  const gatewaySlug = normalizeSlug(input.gatewaySlug || `gw-${applianceId.slice(0, 8)}`);

  const existing = await getDb().collection('devices').findOne({
    tenantId: tenant._id,
    systemId: system._id,
    slug: gatewaySlug,
  });

  let gatewayDevice;
  if (existing) {
    gatewayDevice = deviceService.publicDevice(existing);
  } else {
    const created = await deviceService.createDevice(tenant._id, system._id, {
      name: applianceName,
      slug: gatewaySlug,
      driverType: 'mqtt_parc',
      driverConfig: {
        deviceId: applianceId,
        role: 'appliance_gateway',
        applianceId,
      },
      templateId: null,
    });
    if (!created.ok) return created;
    gatewayDevice = created.device;
  }

  const brokerUrl = process.env.PEAKLOGIC_MQTT_BROKER
    || process.env.MQTT_BROKER_URL
    || 'mqtt://127.0.0.1:1883';

  const cloudRemote = {
    enabled: true,
    tenantId: tenant._id,
    tenantSlug: tenant.slug,
    siteId: location.slug,
    locationSlug: location.slug,
    systemSlug: system.slug,
    applianceId,
    gatewayId: applianceId,
    gatewayDeviceId: gatewayDevice.id,
    brokerUrl,
    topicPrefix: 'peaklogic/v1',
    clientId: `mv-appliance-${applianceId.slice(0, 8)}`,
    relayParc: true,
    relayAlarms: true,
    cloudApiUrl: process.env.PUBLIC_API_URL || '',
    serviceBusIngest: {
      enabled: Boolean(process.env.SERVICE_BUS_CONNECTION_STRING),
      queue: process.env.SERVICE_BUS_QUEUE_PARC_INGEST || 'parc-ingest',
      httpEndpoint: process.env.PUBLIC_API_URL
        ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/ingest/parc`
        : '',
      alarmHttpEndpoint: process.env.PUBLIC_API_URL
        ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/ingest/alarm`
        : '',
    },
  };

  return {
    ok: true,
    tenant: { id: tenant._id, slug: tenant.slug, name: tenant.name },
    location: { id: location._id, slug: location.slug, name: location.name },
    system: { id: system._id, slug: system.slug, name: system.name },
    gatewayDevice,
    cloudRemote,
  };
}

module.exports = { pairAppliance, pairingKeyValid };
