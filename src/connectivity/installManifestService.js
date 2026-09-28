'use strict';

/**
 * QR install stickers — register devices at manufacture/configure, claim at site install.
 */

const { randomBytes } = require('crypto');
const { getDb } = require('../db/mongo');
const { getStationType, isValidStationType } = require('../fleet/stationTypes');

const COL = 'install_manifests';

function str(v) {
  return String(v == null ? '' : v).trim();
}

function newToken() {
  return `inst_${randomBytes(12).toString('base64url')}`;
}

function formatManifest(doc) {
  if (!doc) return null;
  return {
    token: doc._id,
    deviceId: doc.deviceId,
    stationType: doc.stationType,
    templateId: doc.templateId,
    program: doc.program,
    serialNumber: doc.serialNumber,
    iccid: doc.iccid,
    notes: doc.notes,
    status: doc.status,
    manufacturedAt: doc.manufacturedAt,
    claimedAt: doc.claimedAt,
    claimedTenantId: doc.claimedTenantId,
    claimedSystemId: doc.claimedSystemId,
    claimedLocationId: doc.claimedLocationId,
  };
}

function buildInstallPath(token) {
  return `/install/${encodeURIComponent(str(token))}`;
}

function buildInstallUrl(req, token) {
  const proto = str(req.get('x-forwarded-proto')) || req.protocol || 'http';
  const host = str(req.get('x-forwarded-host')) || str(req.get('host'));
  return `${proto}://${host}${buildInstallPath(token)}`;
}

async function registerManifest(input = {}) {
  const deviceId = str(input.deviceId);
  if (!deviceId) return { ok: false, error: 'deviceId required' };

  const stationType = str(input.stationType) || 'triplex';
  if (!isValidStationType(stationType)) {
    return { ok: false, error: `Invalid station type: ${stationType}` };
  }

  const profile = getStationType(stationType);
  const db = getDb();
  const open = await db.collection(COL).findOne({ deviceId, status: 'registered' });
  if (open) {
    return { ok: true, manifest: formatManifest(open), existing: true };
  }

  const token = newToken();
  const now = new Date();
  const doc = {
    _id: token,
    deviceId,
    stationType,
    templateId: profile.templateId,
    program: profile.program,
    serialNumber: str(input.serialNumber) || null,
    iccid: str(input.iccid) || null,
    notes: str(input.notes) || null,
    status: 'registered',
    manufacturedAt: now,
    createdAt: now,
    updatedAt: now,
    claimedAt: null,
    claimedTenantId: null,
    claimedSystemId: null,
    claimedLocationId: null,
    registeredBy: input.registeredBy || null,
  };
  await db.collection(COL).insertOne(doc);
  return { ok: true, manifest: formatManifest(doc), existing: false };
}

async function getManifest(token) {
  const db = getDb();
  const doc = await db.collection(COL).findOne({ _id: str(token) });
  return doc ? formatManifest(doc) : null;
}

async function getManifestForInstall(token, tenantId) {
  const db = getDb();
  const doc = await db.collection(COL).findOne({ _id: str(token) });
  if (!doc) return { ok: false, status: 404, error: 'Install sticker not found' };
  if (doc.status === 'claimed' && doc.claimedTenantId !== tenantId) {
    return { ok: false, status: 403, error: 'This install sticker was already claimed by another organization' };
  }
  const profile = getStationType(doc.stationType);
  return {
    ok: true,
    manifest: formatManifest(doc),
    profile,
    claimed: doc.status === 'claimed',
    siteUrl: doc.claimedSystemId && doc.claimedLocationId
      ? `/sites/${doc.claimedLocationId}/systems/${doc.claimedSystemId}?install=${doc._id}`
      : null,
  };
}

async function claimManifest(token, tenantId, args = {}) {
  const { systemId, locationId, userId } = args;
  const db = getDb();
  const id = str(token);
  const doc = await db.collection(COL).findOne({ _id: id });
  if (!doc) return { ok: false, error: 'Install sticker not found' };
  if (doc.status === 'claimed') {
    if (doc.claimedTenantId === tenantId && doc.claimedSystemId === systemId) {
      return { ok: true, manifest: formatManifest(doc), alreadyClaimed: true };
    }
    return { ok: false, error: 'Install sticker already claimed' };
  }

  const now = new Date();
  const updated = await db.collection(COL).findOneAndUpdate(
    { _id: id, status: 'registered' },
    {
      $set: {
        status: 'claimed',
        claimedAt: now,
        claimedTenantId: tenantId,
        claimedSystemId: systemId || null,
        claimedLocationId: locationId || null,
        claimedByUserId: userId || null,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) return { ok: false, error: 'Install sticker already claimed' };

  if (systemId) {
    const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
    if (system) {
      const metadata = {
        ...(system.metadata || {}),
        installToken: id,
      };
      if (doc.stationType && !metadata.stationType) metadata.stationType = doc.stationType;
      if (doc.templateId && !metadata.templateId) metadata.templateId = doc.templateId;
      if (doc.program && !metadata.program) metadata.program = doc.program;
      await db.collection('systems').updateOne(
        { _id: systemId, tenantId },
        { $set: { metadata, updatedAt: now } },
      );
    }
  }

  return { ok: true, manifest: formatManifest(updated) };
}

async function listManifests(filter = {}) {
  const db = getDb();
  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.tenantId) query.claimedTenantId = filter.tenantId;
  const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), 200);
  const rows = await db.collection(COL)
    .find(query)
    .sort({ manufacturedAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(formatManifest);
}

async function verifyDeviceForClaim(token, deviceId) {
  const manifest = await getManifest(token);
  if (!manifest) return { ok: false, error: 'Install sticker not found' };
  if (manifest.deviceId !== str(deviceId)) {
    return { ok: false, error: 'Device ID does not match install sticker' };
  }
  return { ok: true, manifest };
}

module.exports = {
  registerManifest,
  getManifest,
  getManifestForInstall,
  claimManifest,
  listManifests,
  verifyDeviceForClaim,
  buildInstallPath,
  buildInstallUrl,
};
