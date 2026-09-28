'use strict';

const cmmsStore = require('../../cmms/cmmsStore');
const mongoSysLog = require('../../logger/mongoSysLog');
const { listAssignees } = require('../../cmms/cmmsUsers');

function createCmmsRoutes() {
  const router = require('express').Router();

  router.get('/cmms/status', (req, res) => {
    res.json({ ...cmmsStore.status(), integrated: true });
  });

  router.get('/cmms/dashboard', (req, res) => {
    const st = cmmsStore.status();
    const alarmWo = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'alarm' } })
      .filter((w) => ['open', 'in_progress'].includes(w.status)).length;
    const pmWo = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'pm' } })
      .filter((w) => ['open', 'in_progress'].includes(w.status)).length;
    const pdmWo = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'pdm' } })
      .filter((w) => ['open', 'in_progress'].includes(w.status)).length;
    res.json({
      ...st,
      integrated: true,
      alarmWorkOrders: alarmWo,
      pmWorkOrders: pmWo,
      pdmWorkOrders: pdmWo,
      assigneeCount: listAssignees().length,
    });
  });

  router.get('/cmms/assignees', (req, res) => {
    res.json({ assignees: listAssignees() });
  });

  router.get('/cmms/work-orders', (req, res) => {
    const rows = cmmsStore.listWorkOrders({
      status: req.query.status,
      limit: req.query.limit,
      since: req.query.since,
      until: req.query.until,
      sortField: req.query.sortField,
      sortDir: req.query.sortDir,
      filter: {
        status: req.query.status,
        priority: req.query.priority,
        source: req.query.source,
        assetId: req.query.assetId,
        overdue: req.query.overdue,
      },
    });
    res.json({ workOrders: rows, count: rows.length });
  });

  router.post('/cmms/work-orders', (req, res) => {
    const wo = cmmsStore.createWorkOrder(req.body || {});
    mongoSysLog.maintenance('cmms', `Created work order ${wo.number}`, {
      workOrderId: wo.id,
      title: wo.title,
    }, { user: req.user || null }).catch(() => {});
    res.status(201).json({ ok: true, workOrder: wo });
  });

  router.put('/cmms/work-orders/:id', (req, res) => {
    const wo = cmmsStore.updateWorkOrder(String(req.params.id), req.body || {});
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    res.json({ ok: true, workOrder: wo });
  });

  router.delete('/cmms/work-orders/:id', (req, res) => {
    const ok = cmmsStore.deleteWorkOrder(String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Work order not found' });
    res.json({ ok: true });
  });

  router.post('/cmms/work-orders/:id/complete', (req, res) => {
    const wo = cmmsStore.completeWorkOrder(String(req.params.id));
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    mongoSysLog.maintenance('cmms', `Completed work order ${wo.number}`, {
      workOrderId: wo.id,
    }, { user: req.user || null }).catch(() => {});
    res.json({ ok: true, workOrder: wo });
  });

  router.get('/cmms/pm-schedules', (req, res) => {
    const rows = cmmsStore.listPmSchedules({
      limit: req.query.limit,
      sortField: req.query.sortField,
      sortDir: req.query.sortDir,
      filter: {
        enabled: req.query.enabled,
        overdue: req.query.overdue,
        assetId: req.query.assetId,
      },
    });
    res.json({ pmSchedules: rows, count: rows.length });
  });

  router.post('/cmms/pm-schedules', (req, res) => {
    const pm = cmmsStore.createPmSchedule(req.body || {});
    mongoSysLog.maintenance('cmms', `Created PM schedule ${pm.title}`, {
      pmId: pm.id,
    }, { user: req.user || null }).catch(() => {});
    res.status(201).json({ ok: true, pmSchedule: pm });
  });

  router.put('/cmms/pm-schedules/:id', (req, res) => {
    const pm = cmmsStore.updatePmSchedule(String(req.params.id), req.body || {});
    if (!pm) return res.status(404).json({ error: 'PM schedule not found' });
    res.json({ ok: true, pmSchedule: pm });
  });

  router.delete('/cmms/pm-schedules/:id', (req, res) => {
    const ok = cmmsStore.deletePmSchedule(String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'PM schedule not found' });
    res.json({ ok: true });
  });

  router.post('/cmms/pm-schedules/:id/complete', (req, res) => {
    const pm = cmmsStore.completePmSchedule(String(req.params.id));
    if (!pm) return res.status(404).json({ error: 'PM schedule not found' });
    mongoSysLog.maintenance('cmms', `PM completed: ${pm.title}`, {
      pmId: pm.id,
      nextDueAt: pm.nextDueAt,
    }, { user: req.user || null }).catch(() => {});
    res.json({ ok: true, pmSchedule: pm });
  });

  router.post('/cmms/pm/generate-due', (req, res) => {
    const result = cmmsStore.generateDuePmWorkOrders();
    if (result.count) {
      mongoSysLog.maintenance('cmms', `Generated ${result.count} PM work order(s)`, {
        count: result.count,
      }, { user: req.user || null }).catch(() => {});
    }
    res.json({ ok: true, ...result });
  });

  return router;
}

module.exports = { createCmmsRoutes };
