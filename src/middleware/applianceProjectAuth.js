'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../db/mongo');

/** Resolve tenant for project-hub: logged-in user or paired appliance headers. */
async function resolveTenantId(req) {
  if (req.auth?.tenantId) return String(req.auth.tenantId);
  const tenantId = String(req.headers['x-peaklogic-tenant-id'] || '').trim();
  const applianceId = String(req.headers['x-peaklogic-appliance-id'] || '').trim();
  if (!tenantId || !applianceId) return null;
  if (!ObjectId.isValid(tenantId)) return null;
  const db = getDb();
  const device = await db.collection('devices').findOne({
    tenantId: new ObjectId(tenantId),
    'driverConfig.applianceId': applianceId,
  });
  if (!device) return null;
  return tenantId;
}

module.exports = { resolveTenantId };
