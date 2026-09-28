'use strict';

const { getStationType, isValidStationType } = require('../fleet/stationTypes');
const { normalizeSlug, isValidSlug } = require('../util/slug');
const locationService = require('./locationService');
const systemService = require('./systemService');
const deviceService = require('./deviceService');
const { DEFAULT_CLOUD_IOT_DRIVER } = require('../cloud/iotDriverPolicy');

function parseCsvLine(line) {
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
  return { headers, rows };
}

function rowField(row, ...keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
}

async function ensureCountyLocation(tenantId, countyName, countySlug) {
  const slug = normalizeSlug(countySlug || countyName);
  const { getDb } = require('../db/mongo');
  const existing = await getDb().collection('locations').findOne({ tenantId, slug });
  if (existing) return locationService.publicLocation(existing);
  const created = await locationService.createLocation(tenantId, {
    name: String(countyName || slug).trim(),
    slug,
    description: 'County region',
    metadata: { regionType: 'county' },
  });
  if (!created.ok) throw new Error(created.error || 'Could not create county location');
  return created.location;
}

/**
 * Import lift stations from CSV.
 * Columns: county, station_name, station_slug, station_type, lat, lng, device_id, device_slug, address, owner
 * @param {string} tenantId
 * @param {string} csvText
 */
async function importStationsCsv(tenantId, csvText) {
  const { rows } = parseCsv(csvText);
  const results = { created: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const county = rowField(row, 'county', 'county_name');
    const stationName = rowField(row, 'station_name', 'name', 'station');
    const stationSlug = rowField(row, 'station_slug', 'slug');
    const stationType = rowField(row, 'station_type', 'type');
    const lat = Number(rowField(row, 'lat', 'latitude'));
    const lng = Number(rowField(row, 'lng', 'longitude', 'lon'));
    const deviceId = rowField(row, 'device_id', 'mqtt_device_id');
    const deviceSlug = rowField(row, 'device_slug', 'device');
    const address = rowField(row, 'address', 'street_address', 'street');
    const owner = rowField(row, 'owner', 'owner_name', 'utility');

    if (!county || !stationName) {
      results.errors.push({ line: i + 2, error: 'county and station_name required' });
      continue;
    }
    if (!isValidStationType(stationType)) {
      results.errors.push({ line: i + 2, error: `invalid station_type: ${stationType}` });
      continue;
    }

    const slug = normalizeSlug(stationSlug || stationName);
    if (!isValidSlug(slug)) {
      results.errors.push({ line: i + 2, error: 'invalid station slug' });
      continue;
    }

    try {
      const profile = getStationType(stationType);
      const countyLoc = await ensureCountyLocation(tenantId, county, county);

      const { getDb } = require('../db/mongo');
      const dup = await getDb().collection('systems').findOne({
        tenantId,
        locationId: countyLoc.id,
        slug,
      });
      if (dup) {
        results.skipped += 1;
        continue;
      }

      const sys = await systemService.createSystem(tenantId, countyLoc.id, {
        name: stationName,
        slug,
        description: profile.label,
        metadata: {
          stationType,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          county: normalizeSlug(county),
          countyName: county,
          templateId: profile.templateId,
          program: profile.program,
          ...(address ? { address } : {}),
          ...(owner ? { owner } : {}),
        },
      });
      if (!sys.ok) {
        results.errors.push({ line: i + 2, error: sys.error });
        continue;
      }

      if (deviceId || deviceSlug) {
        const devSlug = normalizeSlug(deviceSlug || deviceId || slug);
        const dev = await deviceService.createDevice(tenantId, sys.system.id, {
          name: `${stationName} controller`,
          slug: devSlug,
          driverType: DEFAULT_CLOUD_IOT_DRIVER,
          templateId: profile.templateId,
          driverConfig: { deviceId: deviceId || devSlug },
        });
        if (!dev.ok) {
          results.errors.push({ line: i + 2, error: dev.error });
          continue;
        }
      }

      results.created += 1;
    } catch (err) {
      results.errors.push({ line: i + 2, error: err.message });
    }
  }

  return { ok: true, ...results, total: rows.length };
}

module.exports = {
  parseCsv,
  importStationsCsv,
  ensureCountyLocation,
};
