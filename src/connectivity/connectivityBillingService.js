'use strict';

/**
 * Tie site commissioning to connectivity billing records and automated renewals.
 *
 * Lifecycle:
 *   1. provisionStation  → pending billing record (site created, not yet live)
 *   2. deploy success    → commissioned + active billing term starts
 *   3. renewal scheduler → auto-extends renewalAt for active records with autoRenew
 */

const { getDb } = require('../db/mongo');
const billingStore = require('./connectivityBillingStore');
const { addMonths } = require('./connectivityBillingSchema');
const { readConnectivityBillingSettings } = require('./connectivityBillingSettings');
const simStore = require('../cellular/simStore');
const simManager = require('../cellular/simManager');
const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');

function settings() {
  return readConnectivityBillingSettings();
}

function isEnabled() {
  return settings().enabled !== false;
}

async function getTenantPlan(tenantId) {
  const tenant = await getDb().collection('tenants').findOne({ _id: tenantId });
  return tenant?.plan || 'standard';
}

async function findLinkedSim(deviceId, tenantId) {
  if (!deviceId) return null;
  const sims = await simStore.list({ deviceId, tenantId });
  if (sims.length) return sims[0];
  const byDevice = await simStore.list({ deviceId });
  return byDevice[0] || null;
}

async function linkSimToBilling(record, sim) {
  if (!record || !sim) return record;
  const patch = {
    simId: sim.id,
    iccid: sim.iccid || null,
    connectivityType: sim.iccid ? (record.deviceId ? 'hybrid' : 'cellular') : record.connectivityType,
  };
  const updated = await billingStore.update(record.id, patch, record);
  if (sim.systemId !== record.systemId || sim.tenantId !== record.tenantId) {
    await simStore.update(sim.id, {
      tenantId: record.tenantId,
      systemId: record.systemId,
      locationId: record.locationId,
      deviceId: record.deviceId || sim.deviceId,
    });
  }
  return updated;
}

async function updateSystemCommissioning(tenantId, systemId, patch) {
  const db = getDb();
  const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return;
  const commissioning = {
    ...(system.metadata?.commissioning || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await db.collection('systems').updateOne(
    { _id: systemId, tenantId },
    { $set: { 'metadata.commissioning': commissioning, updatedAt: new Date() } },
  );
}

/**
 * Create or refresh a pending billing record when a site/station is provisioned.
 */
async function ensurePendingBillingRecord(args) {
  if (!isEnabled()) return { ok: true, skipped: true };
  const {
    tenantId, systemId, locationId, deviceId, plan, termMonths, autoRenew,
  } = args;
  if (!tenantId || !systemId) return { ok: false, error: 'tenantId and systemId required' };

  const existing = await billingStore.getBySystemId(tenantId, systemId);
  const tenantPlan = plan || await getTenantPlan(tenantId);
  const cfg = settings();
  const sim = await findLinkedSim(deviceId, tenantId);

  const record = await billingStore.upsert({
    ...(existing || {}),
    tenantId,
    systemId,
    locationId: locationId || existing?.locationId || null,
    deviceId: deviceId || existing?.deviceId || null,
    simId: sim?.id || existing?.simId || null,
    iccid: sim?.iccid || existing?.iccid || null,
    status: existing?.status === 'active' ? 'active' : 'pending',
    connectivityType: sim?.iccid ? (deviceId ? 'hybrid' : 'cellular') : 'mqtt',
    plan: tenantPlan,
    termMonths: termMonths || existing?.termMonths || cfg.defaultTermMonths,
    autoRenew: autoRenew !== false && cfg.autoRenewEnabled,
    metadata: {
      ...(existing?.metadata || {}),
      provisionedAt: new Date().toISOString(),
    },
  });

  if (sim) await linkSimToBilling(record, sim);

  const synced = await syncInstallMetadataOnRecord(tenantId, systemId, record);

  await updateSystemCommissioning(tenantId, systemId, {
    status: synced.status === 'active' ? 'commissioned' : 'pending',
    billingRecordId: synced.id,
    deviceId: synced.deviceId,
    renewalAt: synced.renewalAt,
  });

  return { ok: true, record: synced };
}

/**
 * Mark a site commissioned after successful program deploy (connectivity goes live).
 */
async function markSiteCommissioned(args) {
  if (!isEnabled()) return { ok: true, skipped: true };
  const { tenantId, systemId, deviceId, programRel } = args;
  if (!tenantId || !systemId) return { ok: false, error: 'tenantId and systemId required' };

  const cfg = settings();
  const now = new Date().toISOString();
  const existing = await billingStore.getBySystemId(tenantId, systemId);
  const tenantPlan = await getTenantPlan(tenantId);
  const sim = await findLinkedSim(deviceId || existing?.deviceId, tenantId);
  const termMonths = existing?.termMonths || cfg.defaultTermMonths;
  const renewalAt = addMonths(now, termMonths);

  const history = [...(existing?.renewalHistory || [])];
  if (!existing?.commissionedAt) {
    history.push({
      at: now,
      type: 'commission',
      termMonths,
      renewalAt,
      programRel: programRel || null,
    });
  }

  const record = await billingStore.upsert({
    ...(existing || {}),
    tenantId,
    systemId,
    locationId: existing?.locationId || args.locationId || null,
    deviceId: deviceId || existing?.deviceId || null,
    simId: sim?.id || existing?.simId || null,
    iccid: sim?.iccid || existing?.iccid || null,
    status: 'active',
    connectivityType: sim?.iccid ? (deviceId ? 'hybrid' : 'cellular') : 'mqtt',
    plan: tenantPlan,
    termMonths,
    autoRenew: existing?.autoRenew !== false && cfg.autoRenewEnabled,
    commissionedAt: existing?.commissionedAt || now,
    renewalAt,
    renewalHistory: history,
    metadata: {
      ...(existing?.metadata || {}),
      commissionedAt: existing?.commissionedAt || now,
      lastDeployProgram: programRel || null,
    },
  });

  if (sim) await linkSimToBilling(record, sim);

  const synced = await syncInstallMetadataOnRecord(tenantId, systemId, record);

  await updateSystemCommissioning(tenantId, systemId, {
    status: 'commissioned',
    billingRecordId: synced.id,
    commissionedAt: synced.commissionedAt,
    deviceId: synced.deviceId,
    renewalAt: synced.renewalAt,
    simId: synced.simId,
    iccid: synced.iccid,
  });

  return { ok: true, record: synced };
}

/**
 * Renew a billing record (manual or automated).
 */
async function renewBillingRecord(id, opts = {}) {
  const record = await billingStore.getById(id);
  if (!record) return { ok: false, status: 404, error: 'Billing record not found' };
  if (record.status === 'cancelled') {
    return { ok: false, status: 400, error: 'Cancelled billing record cannot be renewed' };
  }

  const cfg = settings();
  const now = new Date().toISOString();
  const termMonths = opts.termMonths || record.termMonths || cfg.defaultTermMonths;
  const renewalAt = addMonths(now, termMonths);
  const renewalType = opts.type === 'auto' ? 'auto' : 'manual';
  const history = [
    ...(record.renewalHistory || []),
    { at: now, type: renewalType, termMonths, renewalAt },
  ];

  let simActivation = null;
  if (record.simId && isCellularSimsEnabled() && opts.activateSim !== false) {
    try {
      simActivation = await simManager.activateSim(record.simId);
    } catch (err) {
      simActivation = { ok: false, error: err.message || String(err) };
    }
  }

  const updated = await billingStore.update(record.id, {
    status: 'active',
    termMonths,
    renewalAt,
    lastRenewedAt: now,
    renewalCount: (record.renewalCount || 0) + 1,
    renewalHistory: history,
    metadata: {
      ...(record.metadata || {}),
      lastRenewalType: renewalType,
      lastSimActivation: simActivation,
    },
  });

  await updateSystemCommissioning(record.tenantId, record.systemId, {
    status: 'commissioned',
    billingRecordId: updated.id,
    renewalAt: updated.renewalAt,
    lastRenewedAt: updated.lastRenewedAt,
  });

  return { ok: true, record: updated, simActivation };
}

/**
 * Process all billing records due for renewal (called by scheduler).
 */
async function processDueRenewals(opts = {}) {
  if (!isEnabled()) return { ok: true, skipped: true, renewed: 0 };
  const cfg = settings();
  if (!cfg.autoRenewEnabled && !opts.force) {
    return { ok: true, skipped: true, renewed: 0, reason: 'autoRenew disabled' };
  }

  const now = new Date().toISOString();
  const due = await billingStore.list({ dueBefore: now });
  const results = [];
  let renewed = 0;

  for (const record of due) {
    if (!record.autoRenew && !opts.force) {
      await billingStore.update(record.id, { status: 'expired' }, record);
      await updateSystemCommissioning(record.tenantId, record.systemId, {
        status: 'expired',
        billingRecordId: record.id,
        renewalAt: record.renewalAt,
      });
      results.push({ id: record.id, systemId: record.systemId, ok: false, expired: true });
      continue;
    }
    try {
      const result = await renewBillingRecord(record.id, { type: 'auto', activateSim: true });
      renewed += 1;
      results.push({ id: record.id, systemId: record.systemId, ok: true, renewalAt: result.record?.renewalAt });
    } catch (err) {
      results.push({ id: record.id, systemId: record.systemId, ok: false, error: err.message || String(err) });
    }
  }

  return { ok: true, renewed, checked: due.length, results, ranAt: now };
}

async function listBillingRecords(tenantId, filter = {}) {
  return billingStore.list({ tenantId, ...filter });
}

async function getBillingForSystem(tenantId, systemId) {
  return billingStore.getBySystemId(tenantId, systemId);
}

async function getSystemInstallMetadata(tenantId, systemId) {
  const db = getDb();
  const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return null;
  const meta = system.metadata || {};
  const loc = system.locationId
    ? await db.collection('locations').findOne({ _id: system.locationId, tenantId })
    : null;
  const locMeta = loc?.metadata || {};
  return {
    owner: meta.owner || null,
    contactEmail: meta.contactEmail || meta.ownerEmail || null,
    address: meta.address || locMeta.address || null,
    lat: meta.lat ?? locMeta.lat ?? null,
    lng: meta.lng ?? locMeta.lng ?? null,
    county: meta.county || meta.countyName || locMeta.county || null,
    stationType: meta.stationType || null,
    templateId: meta.templateId || null,
    program: meta.program || null,
    locationName: loc?.name || null,
    locationSlug: loc?.slug || null,
    installToken: meta.installToken || meta.qrToken || null,
  };
}

async function syncInstallMetadataOnRecord(tenantId, systemId, record) {
  const install = await getSystemInstallMetadata(tenantId, systemId);
  if (!install || !record) return record;
  return billingStore.update(record.id, {
    metadata: {
      ...(record.metadata || {}),
      install,
      installSyncedAt: new Date().toISOString(),
    },
  }, record);
}

/**
 * Sites/assets in service — joins systems, locations, billing, devices, and owner contacts.
 */
async function listCommissioningSites(tenantId) {
  const db = getDb();
  const cfg = settings();
  const leadDays = cfg.renewalLeadDays || 7;
  const now = Date.now();

  const [systems, locations, billingRecords, devices, adminUsers] = await Promise.all([
    db.collection('systems').find({ tenantId }).sort({ name: 1 }).toArray(),
    db.collection('locations').find({ tenantId }).toArray(),
    billingStore.list({ tenantId }),
    db.collection('devices').find({ tenantId }).toArray(),
    db.collection('users').find({ tenantId, role: 'admin', active: { $ne: false } }).toArray(),
  ]);

  const locById = new Map(locations.map((l) => [l._id, l]));
  const billingBySystem = new Map(billingRecords.map((r) => [r.systemId, r]));
  const devicesBySystem = new Map();
  for (const dev of devices) {
    if (!devicesBySystem.has(dev.systemId)) devicesBySystem.set(dev.systemId, []);
    devicesBySystem.get(dev.systemId).push(dev);
  }

  const defaultContactEmail = adminUsers[0]?.email || null;
  const teamEmails = adminUsers.map((u) => u.email).filter(Boolean);

  return systems.map((sys) => {
    const meta = sys.metadata || {};
    const loc = locById.get(sys.locationId);
    const bill = billingBySystem.get(sys._id);
    const install = bill?.metadata?.install || {};
    const sysDevices = devicesBySystem.get(sys._id) || [];
    const primaryDevice = sysDevices[0];
    const deviceId = bill?.deviceId
      || primaryDevice?.driverConfig?.deviceId
      || null;
    const contactEmail = install.contactEmail
      || meta.contactEmail
      || meta.ownerEmail
      || bill?.metadata?.contactEmail
      || defaultContactEmail;
    const owner = install.owner || meta.owner || null;
    const address = install.address || meta.address || null;
    const commissioningStatus = meta.commissioning?.status
      || (bill?.status === 'active' ? 'commissioned' : bill?.status)
      || 'unprovisioned';

    let renewalDays = null;
    let renewalUrgent = false;
    if (bill?.renewalAt) {
      renewalDays = Math.ceil((new Date(bill.renewalAt).getTime() - now) / 86400000);
      renewalUrgent = renewalDays <= leadDays;
    }

    return {
      systemId: sys._id,
      systemName: sys.name,
      systemSlug: sys.slug,
      locationId: sys.locationId,
      locationName: install.locationName || loc?.name || '',
      locationSlug: install.locationSlug || loc?.slug || '',
      owner,
      contactEmail,
      teamEmails,
      address,
      deviceId,
      iccid: bill?.iccid || null,
      simId: bill?.simId || null,
      stationType: install.stationType || meta.stationType || null,
      program: install.program || meta.program || null,
      commissioningStatus,
      billing: bill ? {
        id: bill.id,
        status: bill.status,
        connectivityType: bill.connectivityType,
        plan: bill.plan,
        termMonths: bill.termMonths,
        autoRenew: bill.autoRenew,
        commissionedAt: bill.commissionedAt,
        renewalAt: bill.renewalAt,
        lastRenewedAt: bill.lastRenewedAt,
        renewalCount: bill.renewalCount,
      } : null,
      renewalDays,
      renewalUrgent,
      installToken: install.installToken || meta.installToken || deviceId || null,
      siteUrl: `/sites/${sys.locationId}/systems/${sys._id}`,
      teamUrl: '/team/users',
    };
  });
}

async function updateSiteContactEmail(tenantId, systemId, contactEmail) {
  const email = String(contactEmail || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 400, error: 'contactEmail required' };
  }
  const db = getDb();
  const system = await db.collection('systems').findOne({ _id: systemId, tenantId });
  if (!system) return { ok: false, status: 404, error: 'System not found' };

  const metadata = {
    ...(system.metadata || {}),
    contactEmail: email,
  };
  await db.collection('systems').updateOne(
    { _id: systemId, tenantId },
    { $set: { metadata, updatedAt: new Date() } },
  );

  const existing = await billingStore.getBySystemId(tenantId, systemId);
  if (existing) {
    await billingStore.update(existing.id, {
      metadata: {
        ...(existing.metadata || {}),
        contactEmail: email,
        install: {
          ...(existing.metadata?.install || {}),
          contactEmail: email,
        },
      },
    }, existing);
  }

  return { ok: true, contactEmail };
}

module.exports = {
  isEnabled,
  settings,
  ensurePendingBillingRecord,
  markSiteCommissioned,
  renewBillingRecord,
  processDueRenewals,
  listBillingRecords,
  getBillingForSystem,
  listCommissioningSites,
  getSystemInstallMetadata,
  syncInstallMetadataOnRecord,
  updateSiteContactEmail,
  findLinkedSim,
  linkSimToBilling,
};
