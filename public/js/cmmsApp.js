'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let selectedWoId = null;
  let selectedPmId = null;
  let assignees = [];

  function isoFromDatetimeLocal(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function datetimeLocalFromIso(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    if (window.PeaklogicTime?.formatFriendly) return window.PeaklogicTime.formatFriendly(iso);
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString(undefined, window.PeaklogicTime?.localeOpts?.() || {});
  }

  function markup() {
    return `
<section class="cmms-overview cmms-pane" data-cmms-pane="overview">
  <div class="cmms-stat-grid" id="cmms-stat-grid">
    <div class="cmms-stat"><span class="cmms-stat-val" id="cmms-stat-open-wo">—</span><span class="cmms-stat-label">Open work orders</span></div>
    <div class="cmms-stat"><span class="cmms-stat-val" id="cmms-stat-overdue-pm">—</span><span class="cmms-stat-label">Overdue PM</span></div>
    <div class="cmms-stat"><span class="cmms-stat-val" id="cmms-stat-alarm-wo">—</span><span class="cmms-stat-label">Alarm work orders</span></div>
    <div class="cmms-stat"><span class="cmms-stat-val" id="cmms-stat-pm-wo">—</span><span class="cmms-stat-label">PM work orders</span></div>
  </div>
  <p class="panel-hint">Integrated CMMS for this site — work orders, PM schedules, and alarm-driven WOs. Export tabular reports from <strong>Reports</strong> (CMMS templates). MQTT bridge: <strong>System setup → CMMS / MQTT integration</strong>.</p>
  <div class="toolbar wrap">
    <button type="button" class="btn" id="btn-cmms-goto-wo">Work orders</button>
    <button type="button" class="btn" id="btn-cmms-goto-pm">PM schedules</button>
    <button type="button" class="btn" id="btn-cmms-generate-due">Generate due PM work orders</button>
    <button type="button" class="btn" id="btn-cmms-refresh-all">Refresh</button>
  </div>
  <p id="cmms-overview-msg" class="muted"></p>
</section>
<div class="cmms-tabs toolbar wrap" role="tablist" aria-label="CMMS sections">
  <button type="button" class="btn btn-sm cmms-tab active" data-cmms-tab="overview" role="tab" aria-selected="true">Overview</button>
  <button type="button" class="btn btn-sm cmms-tab" data-cmms-tab="wo" role="tab" aria-selected="false">Work orders</button>
  <button type="button" class="btn btn-sm cmms-tab" data-cmms-tab="pm" role="tab" aria-selected="false">PM schedules</button>
</div>
<p id="cmms-status-line" class="muted cell-mono"></p>
<section class="cmms-pane view-hidden" data-cmms-pane="wo">
  <div class="form-grid compact">
    <label>Title <input type="text" id="cmms-wo-title" maxlength="120" placeholder="Replace seal on pump 101"></label>
    <label>Asset <input type="text" id="cmms-wo-asset" maxlength="64" placeholder="pump-101"></label>
    <label>Assignee
      <select id="cmms-wo-assignee"><option value="">— select —</option></select>
    </label>
    <label>Priority
      <select id="cmms-wo-priority">
        <option value="low">Low</option>
        <option value="normal" selected>Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </label>
    <label>Status
      <select id="cmms-wo-status">
        <option value="open" selected>Open</option>
        <option value="in_progress">In progress</option>
        <option value="complete">Complete</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </label>
    <label>Due <input type="datetime-local" id="cmms-wo-due"></label>
    <label>Source <input type="text" id="cmms-wo-source" readonly class="cell-mono" placeholder="manual"></label>
  </div>
  <label>Description
    <textarea id="cmms-wo-description" rows="2" maxlength="4000" placeholder="Optional details"></textarea>
  </label>
  <div class="toolbar wrap">
    <button type="button" id="btn-cmms-wo-save" class="btn primary">Save work order</button>
    <button type="button" id="btn-cmms-wo-new" class="btn">New</button>
    <button type="button" id="btn-cmms-wo-complete" class="btn">Mark complete</button>
    <button type="button" id="btn-cmms-wo-delete" class="btn">Delete</button>
    <button type="button" id="btn-cmms-wo-refresh" class="btn">Refresh list</button>
    <span id="cmms-wo-msg" class="muted"></span>
  </div>
  <div class="table-wrap">
    <table class="data-table compact" id="cmms-wo-table">
      <thead><tr><th>WO #</th><th>Title</th><th>Status</th><th>Priority</th><th>Source</th><th>Asset</th><th>Assignee</th><th>Due</th><th>Overdue</th></tr></thead>
      <tbody id="cmms-wo-tbody"></tbody>
    </table>
  </div>
</section>
<section class="cmms-pane view-hidden" data-cmms-pane="pm">
  <div class="form-grid compact">
    <label>Title <input type="text" id="cmms-pm-title" maxlength="120" placeholder="Quarterly pump inspection"></label>
    <label>Asset <input type="text" id="cmms-pm-asset" maxlength="64" placeholder="pump-101"></label>
    <label>Assignee
      <select id="cmms-pm-assignee"><option value="">— select —</option></select>
    </label>
    <label>Interval (days) <input type="number" id="cmms-pm-interval" min="1" max="3650" value="90"></label>
    <label>Next due <input type="datetime-local" id="cmms-pm-next-due"></label>
    <label class="historian-ctl"><input type="checkbox" id="cmms-pm-enabled" checked> Enabled</label>
  </div>
  <label>Auto WO title <input type="text" id="cmms-pm-wo-title" maxlength="120" placeholder="Optional title when PM generates a work order"></label>
  <div class="toolbar wrap">
    <button type="button" id="btn-cmms-pm-save" class="btn primary">Save PM schedule</button>
    <button type="button" id="btn-cmms-pm-new" class="btn">New</button>
    <button type="button" id="btn-cmms-pm-complete" class="btn">Mark PM done</button>
    <button type="button" id="btn-cmms-pm-delete" class="btn">Delete</button>
    <button type="button" id="btn-cmms-pm-generate" class="btn">Generate due PM work orders</button>
    <button type="button" id="btn-cmms-pm-refresh" class="btn">Refresh list</button>
    <span id="cmms-pm-msg" class="muted"></span>
  </div>
  <div class="table-wrap">
    <table class="data-table compact" id="cmms-pm-table">
      <thead><tr><th>Title</th><th>Asset</th><th>Interval</th><th>Next due</th><th>Last done</th><th>Overdue</th><th>Assignee</th></tr></thead>
      <tbody id="cmms-pm-tbody"></tbody>
    </table>
  </div>
</section>`;
  }

  function setTab(tab) {
    document.querySelectorAll('.cmms-tab').forEach((btn) => {
      const active = btn.dataset.cmmsTab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.cmms-pane').forEach((pane) => {
      pane.classList.toggle('view-hidden', pane.dataset.cmmsPane !== tab);
    });
  }

  function fillAssigneeSelects() {
    const opts = ['<option value="">— select —</option>']
      .concat(assignees.map((u) => {
        const label = u.name && u.email ? `${u.name} (${u.email})` : (u.name || u.email);
        return `<option value="${esc(u.email || u.name)}">${esc(label)}</option>`;
      }));
    ['cmms-wo-assignee', 'cmms-pm-assignee'].forEach((id) => {
      const el = $(id);
      if (el) {
        const prev = el.value;
        el.innerHTML = opts.join('');
        if (prev) el.value = prev;
      }
    });
  }

  function clearWoForm() {
    selectedWoId = null;
    if ($('cmms-wo-title')) $('cmms-wo-title').value = '';
    if ($('cmms-wo-asset')) $('cmms-wo-asset').value = '';
    if ($('cmms-wo-assignee')) $('cmms-wo-assignee').value = '';
    if ($('cmms-wo-priority')) $('cmms-wo-priority').value = 'normal';
    if ($('cmms-wo-status')) $('cmms-wo-status').value = 'open';
    if ($('cmms-wo-due')) $('cmms-wo-due').value = '';
    if ($('cmms-wo-description')) $('cmms-wo-description').value = '';
    if ($('cmms-wo-source')) $('cmms-wo-source').value = '';
    document.querySelectorAll('#cmms-wo-tbody tr').forEach((tr) => tr.classList.remove('selected'));
  }

  function fillWoForm(wo) {
    if (!wo) return clearWoForm();
    selectedWoId = wo.id;
    if ($('cmms-wo-title')) $('cmms-wo-title').value = wo.title || '';
    if ($('cmms-wo-asset')) $('cmms-wo-asset').value = wo.assetId || '';
    if ($('cmms-wo-assignee')) $('cmms-wo-assignee').value = wo.assignee || '';
    if ($('cmms-wo-priority')) $('cmms-wo-priority').value = wo.priority || 'normal';
    if ($('cmms-wo-status')) $('cmms-wo-status').value = wo.status || 'open';
    if ($('cmms-wo-due')) $('cmms-wo-due').value = datetimeLocalFromIso(wo.dueAt);
    if ($('cmms-wo-description')) $('cmms-wo-description').value = wo.description || '';
    if ($('cmms-wo-source')) $('cmms-wo-source').value = wo.source || 'manual';
  }

  function readWoForm() {
    return {
      title: $('cmms-wo-title')?.value?.trim() || 'Work order',
      assetId: $('cmms-wo-asset')?.value?.trim() || '',
      assignee: $('cmms-wo-assignee')?.value?.trim() || '',
      priority: $('cmms-wo-priority')?.value || 'normal',
      status: $('cmms-wo-status')?.value || 'open',
      dueAt: isoFromDatetimeLocal($('cmms-wo-due')?.value),
      description: $('cmms-wo-description')?.value?.trim() || '',
    };
  }

  function clearPmForm() {
    selectedPmId = null;
    if ($('cmms-pm-title')) $('cmms-pm-title').value = '';
    if ($('cmms-pm-asset')) $('cmms-pm-asset').value = '';
    if ($('cmms-pm-assignee')) $('cmms-pm-assignee').value = '';
    if ($('cmms-pm-interval')) $('cmms-pm-interval').value = '90';
    if ($('cmms-pm-next-due')) $('cmms-pm-next-due').value = '';
    if ($('cmms-pm-enabled')) $('cmms-pm-enabled').checked = true;
    if ($('cmms-pm-wo-title')) $('cmms-pm-wo-title').value = '';
    document.querySelectorAll('#cmms-pm-tbody tr').forEach((tr) => tr.classList.remove('selected'));
  }

  function fillPmForm(pm) {
    if (!pm) return clearPmForm();
    selectedPmId = pm.id;
    if ($('cmms-pm-title')) $('cmms-pm-title').value = pm.title || '';
    if ($('cmms-pm-asset')) $('cmms-pm-asset').value = pm.assetId || '';
    if ($('cmms-pm-assignee')) $('cmms-pm-assignee').value = pm.assignee || '';
    if ($('cmms-pm-interval')) $('cmms-pm-interval').value = String(pm.intervalDays || 90);
    if ($('cmms-pm-next-due')) $('cmms-pm-next-due').value = datetimeLocalFromIso(pm.nextDueAt);
    if ($('cmms-pm-enabled')) $('cmms-pm-enabled').checked = pm.enabled !== false;
    if ($('cmms-pm-wo-title')) $('cmms-pm-wo-title').value = pm.woTitle || '';
  }

  function readPmForm() {
    return {
      title: $('cmms-pm-title')?.value?.trim() || 'Preventive maintenance',
      assetId: $('cmms-pm-asset')?.value?.trim() || '',
      assignee: $('cmms-pm-assignee')?.value?.trim() || '',
      intervalDays: Number($('cmms-pm-interval')?.value) || 90,
      nextDueAt: isoFromDatetimeLocal($('cmms-pm-next-due')?.value),
      enabled: $('cmms-pm-enabled')?.checked !== false,
      woTitle: $('cmms-pm-wo-title')?.value?.trim() || '',
    };
  }

  function renderWorkOrders(rows = []) {
    const body = $('cmms-wo-tbody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="muted">No work orders yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((wo) => `<tr data-cmms-wo-id="${esc(wo.id)}" class="${wo.id === selectedWoId ? 'selected' : ''}">
      <td class="cell-mono">${esc(wo.number || '—')}</td>
      <td>${esc(wo.title || '—')}</td>
      <td>${esc(wo.status || '—')}</td>
      <td>${esc(wo.priority || '—')}</td>
      <td class="cell-mono">${esc(wo.source || '—')}</td>
      <td class="cell-mono">${esc(wo.assetId || '—')}</td>
      <td>${esc(wo.assignee || '—')}</td>
      <td class="cell-mono">${esc(formatDate(wo.dueAt))}</td>
      <td>${wo.overdue === 'yes' ? 'Yes' : '—'}</td>
    </tr>`).join('');
    body.querySelectorAll('tr[data-cmms-wo-id]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const wo = rows.find((r) => r.id === tr.dataset.cmmsWoId);
        fillWoForm(wo);
        body.querySelectorAll('tr').forEach((row) => row.classList.remove('selected'));
        tr.classList.add('selected');
      });
    });
  }

  function renderPmSchedules(rows = []) {
    const body = $('cmms-pm-tbody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No PM schedules yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((pm) => `<tr data-cmms-pm-id="${esc(pm.id)}" class="${pm.id === selectedPmId ? 'selected' : ''}">
      <td>${esc(pm.title || '—')}</td>
      <td class="cell-mono">${esc(pm.assetId || '—')}</td>
      <td class="cell-mono">${esc(pm.intervalDays ?? '—')}</td>
      <td class="cell-mono">${esc(formatDate(pm.nextDueAt))}</td>
      <td class="cell-mono">${esc(formatDate(pm.lastCompletedAt))}</td>
      <td>${pm.overdue === 'yes' ? 'Yes' : '—'}</td>
      <td>${esc(pm.assignee || '—')}</td>
    </tr>`).join('');
    body.querySelectorAll('tr[data-cmms-pm-id]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const pm = rows.find((r) => r.id === tr.dataset.cmmsPmId);
        fillPmForm(pm);
        body.querySelectorAll('tr').forEach((row) => row.classList.remove('selected'));
        tr.classList.add('selected');
      });
    });
  }

  function renderDashboard(dash) {
    if ($('cmms-stat-open-wo')) $('cmms-stat-open-wo').textContent = String(dash.openWorkOrders ?? '—');
    if ($('cmms-stat-overdue-pm')) $('cmms-stat-overdue-pm').textContent = String(dash.overduePm ?? '—');
    if ($('cmms-stat-alarm-wo')) $('cmms-stat-alarm-wo').textContent = String(dash.alarmWorkOrders ?? '—');
    if ($('cmms-stat-pm-wo')) $('cmms-stat-pm-wo').textContent = String(dash.pmWorkOrders ?? '—');
    if ($('cmms-status-line')) {
      $('cmms-status-line').textContent = `${dash.openWorkOrders || 0} open WO · ${dash.overduePm || 0} overdue PM · ${dash.workOrderCount || 0} total WO · ${dash.pmScheduleCount || 0} PM schedules`;
    }
  }

  async function refreshAll() {
    const [dash, woRes, pmRes, assigneeRes] = await Promise.all([
      api.cmmsDashboard(),
      api.listCmmsWorkOrders({ limit: 300 }),
      api.listCmmsPmSchedules({ limit: 300 }),
      api.listCmmsAssignees(),
    ]);
    assignees = assigneeRes.assignees || [];
    fillAssigneeSelects();
    renderDashboard(dash);
    renderWorkOrders(woRes.workOrders || []);
    renderPmSchedules(pmRes.pmSchedules || []);
  }

  async function generateDuePm() {
    const msg = $('cmms-overview-msg') || $('cmms-pm-msg');
    const res = await api.generateCmmsDuePmWorkOrders();
    if (msg) msg.textContent = res.count ? `Created ${res.count} work order(s) from due PM` : 'No due PM work orders to create';
    setTab('wo');
    await refreshAll();
  }

  function bindEvents() {
    document.querySelectorAll('.cmms-tab').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.cmmsTab || 'overview'));
    });
    $('btn-cmms-goto-wo')?.addEventListener('click', () => setTab('wo'));
    $('btn-cmms-goto-pm')?.addEventListener('click', () => setTab('pm'));
    $('btn-cmms-refresh-all')?.addEventListener('click', () => refreshAll().catch((e) => alert(e.message)));
    $('btn-cmms-generate-due')?.addEventListener('click', () => generateDuePm().catch((e) => alert(e.message)));
    $('btn-cmms-wo-new')?.addEventListener('click', () => clearWoForm());
    $('btn-cmms-wo-refresh')?.addEventListener('click', () => refreshAll().catch((e) => alert(e.message)));
    $('btn-cmms-wo-save')?.addEventListener('click', () => {
      const msg = $('cmms-wo-msg');
      const body = readWoForm();
      const req = selectedWoId
        ? api.updateCmmsWorkOrder(selectedWoId, body)
        : api.createCmmsWorkOrder(body);
      return req.then((res) => {
        fillWoForm(res.workOrder);
        if (msg) msg.textContent = 'Work order saved';
        return refreshAll();
      }).catch((e) => {
        if (msg) msg.textContent = e.message;
        alert(e.message);
      });
    });
    $('btn-cmms-wo-complete')?.addEventListener('click', () => {
      if (!selectedWoId) return alert('Select a work order first');
      return api.completeCmmsWorkOrder(selectedWoId).then((res) => {
        fillWoForm(res.workOrder);
        return refreshAll();
      }).catch((e) => alert(e.message));
    });
    $('btn-cmms-wo-delete')?.addEventListener('click', () => {
      if (!selectedWoId) return alert('Select a work order first');
      if (!confirm('Delete this work order?')) return;
      return api.deleteCmmsWorkOrder(selectedWoId).then(() => {
        clearWoForm();
        return refreshAll();
      }).catch((e) => alert(e.message));
    });
    $('btn-cmms-pm-new')?.addEventListener('click', () => clearPmForm());
    $('btn-cmms-pm-refresh')?.addEventListener('click', () => refreshAll().catch((e) => alert(e.message)));
    $('btn-cmms-pm-save')?.addEventListener('click', () => {
      const msg = $('cmms-pm-msg');
      const body = readPmForm();
      const req = selectedPmId
        ? api.updateCmmsPmSchedule(selectedPmId, body)
        : api.createCmmsPmSchedule(body);
      return req.then((res) => {
        fillPmForm(res.pmSchedule);
        if (msg) msg.textContent = 'PM schedule saved';
        return refreshAll();
      }).catch((e) => {
        if (msg) msg.textContent = e.message;
        alert(e.message);
      });
    });
    $('btn-cmms-pm-complete')?.addEventListener('click', () => {
      if (!selectedPmId) return alert('Select a PM schedule first');
      return api.completeCmmsPmSchedule(selectedPmId).then((res) => {
        fillPmForm(res.pmSchedule);
        return refreshAll();
      }).catch((e) => alert(e.message));
    });
    $('btn-cmms-pm-delete')?.addEventListener('click', () => {
      if (!selectedPmId) return alert('Select a PM schedule first');
      if (!confirm('Delete this PM schedule?')) return;
      return api.deleteCmmsPmSchedule(selectedPmId).then(() => {
        clearPmForm();
        return refreshAll();
      }).catch((e) => alert(e.message));
    });
    $('btn-cmms-pm-generate')?.addEventListener('click', () => generateDuePm().catch((e) => alert(e.message)));
  }

  function mount(root, opts = {}) {
    if (!root) return;
    root.innerHTML = markup();
    bindEvents();
    if (opts.initialTab) setTab(opts.initialTab);
    return refreshAll().catch((e) => {
      const line = $('cmms-status-line');
      if (line) line.textContent = e.message || 'CMMS unavailable';
    });
  }

  window.PeaklogicCmms = {
    markup,
    mount,
    refreshAll,
    setTab,
  };
})();
