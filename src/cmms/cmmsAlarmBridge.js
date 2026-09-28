'use strict';

const persistence = require('../persistence');
const cmmsStore = require('./cmmsStore');
const mongoSysLog = require('../logger/mongoSysLog');

const ALARM_LEVELS = new Set(['innerHigh', 'outerHigh', 'innerLow', 'outerLow']);

function cmmsSettings() {
  const settings = persistence.readJson('settings.json', {});
  const cmms = settings.cmms && typeof settings.cmms === 'object' ? settings.cmms : {};
  return {
    autoWorkOrdersFromAlarms: cmms.autoWorkOrdersFromAlarms !== false,
  };
}

function openAlarmWorkOrder(tagId, level) {
  const rows = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'alarm' } });
  return rows.find(
    (wo) => wo.sourceRef === `${tagId}:${level}`
      && ['open', 'in_progress'].includes(wo.status),
  ) || null;
}

function maybeCreateAlarmWorkOrder(evt) {
  if (!evt || !evt.tagId) return null;
  if (!cmmsSettings().autoWorkOrdersFromAlarms) return null;
  const level = String(evt.level || '').trim();
  if (!ALARM_LEVELS.has(level)) return null;
  const sourceRef = `${evt.tagId}:${level}`;
  if (openAlarmWorkOrder(evt.tagId, level)) return null;
  const wo = cmmsStore.createWorkOrder({
    title: `Alarm: ${evt.tagId} (${level})`,
    description: `Auto-created from alarm transition (${level}). Value: ${evt.value ?? '—'}`,
    assetId: evt.tagId,
    source: 'alarm',
    sourceRef,
    priority: level.includes('High') ? 'high' : 'normal',
    status: 'open',
  });
  mongoSysLog.maintenance('cmms', `Alarm work order ${wo.number} for ${evt.tagId}`, {
    workOrderId: wo.id,
    tagId: evt.tagId,
    level,
  }, { user: null });
  return wo;
}

module.exports = {
  maybeCreateAlarmWorkOrder,
  cmmsSettings,
};
