'use strict';

const persistence = require('../persistence');
const cmmsStore = require('./cmmsStore');
const mongoSysLog = require('../logger/mongoSysLog');
const { readCmmsSettings } = require('../settings/cmmsSettings');
const { normalizePdmSettings, getAssetContext } = require('../settings/pdmSettings');
const { appendServiceEvent, normalizeAssetContext } = require('../pdm/motorAssetSetup');

const PENDING_SEVERITIES = new Set(['warning', 'critical', 'failed']);

function pdmSourceRef(assetId) {
  return `pdm:${assetId}`;
}

function priorityForSeverity(severity) {
  if (severity === 'failed') return 'urgent';
  if (severity === 'critical') return 'urgent';
  if (severity === 'warning') return 'high';
  return 'normal';
}

function priorityRank(p) {
  const order = { low: 0, normal: 1, high: 2, urgent: 3 };
  return order[p] ?? 1;
}

function openPdmWorkOrder(assetId) {
  const ref = pdmSourceRef(assetId);
  return cmmsStore.listWorkOrders({ limit: 200, filter: { source: 'pdm' } })
    .find((wo) => wo.sourceRef === ref && ['open', 'in_progress'].includes(wo.status)) || null;
}

function buildWoDescription(forecast, rul) {
  const lines = [
    'Proactive PM — issued from PdM pending-failure forecast (fix before breakdown).',
    forecast?.headline || '',
    ...(forecast?.reportLines || []),
  ];
  if (rul?.ok && rul.currentHealth != null) {
    lines.push(`Health index: ${rul.currentHealth} (${rul.trend || 'stable'})`);
  }
  return lines.filter(Boolean).join('\n');
}

function maybeCreatePdmFailureWorkOrder(assetId, { forecast, rul, assetContext } = {}) {
  if (!assetId || !forecast?.ok) return null;
  const settings = persistence.readJson('settings.json', {});
  const cmms = readCmmsSettings(settings);
  if (!cmms.autoWorkOrdersFromPdm) return null;
  if (!PENDING_SEVERITIES.has(forecast.severity)) return null;

  const ref = pdmSourceRef(assetId);
  const priority = priorityForSeverity(forecast.severity);
  const dueAt = forecast.predictedFailureAt
    || (forecast.rulDaysEstimate != null
      ? new Date(Date.now() + forecast.rulDaysEstimate * 86400000).toISOString()
      : null);
  const ctx = assetContext || getAssetContext(normalizePdmSettings(settings.pdm, settings), assetId);
  const loc = ctx?.locationClass ? ctx.locationClass.replace(/_/g, ' ') : '';
  const title = `Proactive PM: ${assetId}${loc ? ` (${loc})` : ''} — pending failure`;
  const description = buildWoDescription(forecast, rul);

  const existing = openPdmWorkOrder(assetId);
  if (existing) {
    if (priorityRank(priority) > priorityRank(existing.priority)) {
      const updated = cmmsStore.updateWorkOrder(existing.id, {
        priority,
        description,
        dueAt: dueAt || existing.dueAt,
        title,
      });
      console.log(`[pdm→cmms] Escalated ${updated.number} for ${assetId} → ${forecast.severity}`);
      mongoSysLog.maintenance('cmms', `Escalated PdM work order ${updated.number} for ${assetId}`, {
        workOrderId: updated.id,
        assetId,
        severity: forecast.severity,
      }, { user: null });
      return updated;
    }
    return null;
  }

  const wo = cmmsStore.createWorkOrder({
    title,
    description,
    assetId,
    source: 'pdm',
    sourceRef: ref,
    priority,
    dueAt,
    status: 'open',
  });
  console.log(`[pdm→cmms] Proactive PM ${wo.number} for ${assetId} (${forecast.severity}, RUL ${forecast.rulDaysEstimate ?? '?'}d)`);
  mongoSysLog.maintenance('cmms', `PdM proactive PM ${wo.number} for ${assetId} (${forecast.severity})`, {
    workOrderId: wo.id,
    assetId,
    severity: forecast.severity,
    rulDays: forecast.rulDaysEstimate,
    faultType: forecast.faultType,
  }, { user: null });
  return wo;
}

function serviceTypeForWorkOrder(wo) {
  if (wo.source !== 'pdm' && !(wo.source === 'pm' && String(wo.sourceRef || '').startsWith('pdm:'))) {
    return null;
  }
  const title = String(wo.title || '').toLowerCase();
  if (title.includes('seal')) return 'seal_service';
  if (title.includes('impeller') || title.includes('amp')) return 'impeller_service';
  if (title.includes('bearing')) return 'bearing_service';
  if (title.includes('clog') || title.includes('ragging')) return 'clog_clearing';
  return 'pdm_pm';
}

function appendServiceHistoryFromWorkOrder(wo) {
  if (!wo || wo.status !== 'complete') return null;
  const settings = persistence.readJson('settings.json', {});
  const cmms = readCmmsSettings(settings);
  if (!cmms.appendServiceHistoryOnWoComplete) return null;

  const serviceType = serviceTypeForWorkOrder(wo);
  if (!serviceType) return null;

  const assetId = String(wo.assetId || '').trim();
  if (!assetId) return null;

  const pdm = normalizePdmSettings(settings.pdm, settings);
  const prevCtx = getAssetContext(pdm, assetId) || normalizeAssetContext({ motorType: 'pump' }, assetId);
  const completed = wo.completedAt || new Date().toISOString();
  const date = completed.slice(0, 10);
  const nextCtx = appendServiceEvent(prevCtx, {
    date,
    type: serviceType,
    vendor: wo.assignee || '',
    notes: `CMMS ${wo.number}: ${wo.title}${wo.description ? ` — ${String(wo.description).slice(0, 200)}` : ''}`,
  }, assetId);

  const nextContext = { ...(pdm.assetContext || {}), [assetId]: nextCtx };
  const next = {
    ...settings,
    pdm: { ...pdm, assetContext: nextContext },
  };
  persistence.writeJson('settings.json', next);
  mongoSysLog.maintenance('pdm', `Service history updated for ${assetId} from ${wo.number}`, {
    assetId,
    workOrderId: wo.id,
    serviceType,
  }, { user: null });
  return nextCtx;
}

module.exports = {
  maybeCreatePdmFailureWorkOrder,
  appendServiceHistoryFromWorkOrder,
  openPdmWorkOrder,
  pdmSourceRef,
  PENDING_SEVERITIES,
};
