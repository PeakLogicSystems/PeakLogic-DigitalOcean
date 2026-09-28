'use strict';

/**
 * Single onboarding flow for a new fleet customer.
 *
 *   a. WHO   — create the customer (tenant + admin user)
 *   b. WHAT  — pick a device/station type (triplex pump station, ...)
 *   c. WHERE — address + county (map pin)
 *   d. ADMIN — MQTT device id, ST program (auto), scan rate, template (auto)
 *
 * Composes the existing platform-admin tenant creation with the same
 * location -> system -> device hierarchy that fleet CSV import produces,
 * so the new station shows up on the Fleet map immediately.
 */

const tenantService = require('./tenantService');
const systemService = require('./systemService');
const deviceService = require('./deviceService');
const { ensureCountyLocation } = require('./fleetImportService');
const { getStationType, isValidStationType } = require('../fleet/stationTypes');
const { getFloridaCounty } = require('../fleet/floridaCounties');
const { normalizeSlug, isValidSlug } = require('../util/slug');
const { DEFAULT_CLOUD_IOT_DRIVER } = require('../cloud/iotDriverPolicy');

function str(v) {
  return String(v == null ? '' : v).trim();
}

function num(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Provision a lift station (location -> system -> device) under an existing tenant.
 * Shared by the new-customer wizard (WHO already created) and the tenant-scoped
 * "Add location" wizard on the Sites page (owner = the current tenant).
 *
 * @param {string} tenantId
 * @param {string} ownerName   Customer/organization name, stored as station owner.
 * @param {object} station
 * @param {string} station.stationType   e.g. 'triplex' (WHAT)
 * @param {string} [station.stationName]
 * @param {string} [station.stationSlug]
 * @param {string} station.county         county slug (WHERE)
 * @param {string} [station.address]
 * @param {number} [station.lat]
 * @param {number} [station.lng]
 * @param {string} [station.deviceId]     MQTT device id (ADMIN)
 * @param {string} [station.deviceSlug]
 * @param {number} [station.scanMs]
 * @returns {Promise<{ok:boolean, error?:string, location?:object, station?:object, device?:object, profile?:object}>}
 */
async function provisionStation(tenantId, ownerName, station = {}) {
  const stationType = str(station.stationType);
  if (!isValidStationType(stationType)) {
    return { ok: false, error: `Invalid station type: ${stationType || '(none)'}` };
  }

  const profile = getStationType(stationType);
  const countySlug = normalizeSlug(str(station.county));
  const county = getFloridaCounty(countySlug);
  if (!county) {
    return { ok: false, error: `Unknown Florida county: ${station.county || '(none)'}` };
  }

  const stationName = str(station.stationName) || `${county.name} ${profile.shortLabel}`;
  const slug = normalizeSlug(str(station.stationSlug) || stationName);
  if (!isValidSlug(slug)) {
    return { ok: false, error: 'Invalid station slug' };
  }

  const lat = num(station.lat);
  const lng = num(station.lng);

  try {
    // WHERE — county location (auto-created, shared by all stations in the county).
    const countyLoc = await ensureCountyLocation(tenantId, county.name, county.slug);

    // WHAT — the station system, tagged with fleet metadata for the map.
    const sysResult = await systemService.createSystem(tenantId, countyLoc.id, {
      name: stationName,
      slug,
      description: profile.label,
      scanMs: num(station.scanMs) || 100,
      metadata: {
        stationType,
        lat: lat != null ? lat : county.lat,
        lng: lng != null ? lng : county.lng,
        county: county.slug,
        countyName: county.name,
        templateId: profile.templateId,
        program: profile.program,
        ...(str(station.address) ? { address: str(station.address) } : {}),
        owner: str(ownerName),
      },
    });
    if (!sysResult.ok) return { ok: false, error: sysResult.error, location: countyLoc };

    // ADMIN — the edge device (Opta Parc) with template + MQTT id.
    const deviceId = str(station.deviceId);
    const deviceSlug = normalizeSlug(str(station.deviceSlug) || deviceId || slug);
    const devResult = await deviceService.createDevice(tenantId, sysResult.system.id, {
      name: `${stationName} controller`,
      slug: deviceSlug,
      driverType: DEFAULT_CLOUD_IOT_DRIVER,
      templateId: profile.templateId,
      driverConfig: { deviceId: deviceId || deviceSlug },
    });
    if (!devResult.ok) {
      return { ok: false, error: `Station created, device failed: ${devResult.error}`, location: countyLoc, station: sysResult.system };
    }

    // Pending connectivity billing record — activated when the site is commissioned (deploy).
    try {
      const billing = require('../connectivity/connectivityBillingService');
      await billing.ensurePendingBillingRecord({
        tenantId,
        systemId: sysResult.system.id,
        locationId: countyLoc.id,
        deviceId: deviceId || deviceSlug,
      });
    } catch (err) {
      console.warn('[fleet-onboarding] connectivity billing:', err.message || err);
    }

    return { ok: true, location: countyLoc, station: sysResult.system, device: devResult.device, profile };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Full new-customer onboarding: create the tenant (WHO), then optionally the
 * first lift station (WHAT/WHERE/ADMIN) via {@link provisionStation}.
 *
 * @param {object} input  tenantName, tenantSlug, email, password, [cmms], [station]
 */
async function onboardCustomer(input = {}) {
  const tenantName = str(input.tenantName);

  // a. WHO — create the customer tenant + admin user.
  const tenantResult = await tenantService.createTenantAsPlatform({
    tenantName,
    tenantSlug: input.tenantSlug,
    email: input.email,
    password: input.password,
    cmms: input.cmms,
  });
  if (!tenantResult.ok) return tenantResult;

  const tenant = tenantResult.tenant;
  const station = input.station;

  // No station requested — customer created, done.
  if (!station || !str(station.stationType)) {
    return { ok: true, tenant, user: tenantResult.user, station: null };
  }

  const prov = await provisionStation(tenant.id, tenantName, station);
  if (!prov.ok) {
    return { ok: true, tenant, user: tenantResult.user, station: prov.station || null, location: prov.location, stationError: prov.error };
  }
  return {
    ok: true,
    tenant,
    user: tenantResult.user,
    location: prov.location,
    station: prov.station,
    device: prov.device,
    profile: prov.profile,
  };
}

module.exports = { onboardCustomer, provisionStation };
