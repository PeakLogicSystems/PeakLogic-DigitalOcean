'use strict';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const cls = {
    active: 'cellular-sim-badge-active',
    inactive: 'cellular-sim-badge-inactive',
    paused: 'cellular-sim-badge-paused',
    suspended: 'cellular-sim-badge-suspended',
    pending: 'cellular-sim-badge-pending',
    deactivated: 'cellular-sim-badge-deactivated',
  }[status] || 'cellular-sim-badge-unknown';
  return `<span class="cellular-sim-badge ${cls}">${esc(status)}</span>`;
}

let vendorCatalog = [];

function renderCredentialFields(vendorId) {
  const wrap = document.getElementById('vendor-credential-fields');
  if (!wrap) return;
  const def = vendorCatalog.find((v) => v.id === vendorId);
  if (!def) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = (def.configSchema || []).map((field) => {
    const type = field.secret ? 'password' : 'text';
    const req = field.required ? ' required' : '';
    const ph = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : '';
    return `<label>${esc(field.label)}
      <input type="${type}" data-cred-key="${esc(field.key)}"${req}${ph} autocomplete="off">
    </label>`;
  }).join('');
}

function setVendorLoadError(message) {
  const msg = document.getElementById('cellular-vendor-msg');
  const sel = document.getElementById('vendor-id');
  const credWrap = document.getElementById('vendor-credential-fields');
  if (msg) {
    msg.textContent = message;
    msg.classList.add('cellular-sims-msg-error');
  }
  if (sel) {
    sel.innerHTML = `<option value="" disabled selected>${esc(message)}</option>`;
  }
  if (credWrap) credWrap.innerHTML = '';
}

function clearVendorLoadError() {
  document.getElementById('cellular-vendor-msg')?.classList.remove('cellular-sims-msg-error');
}

function renderVendorSelect() {
  const sel = document.getElementById('vendor-id');
  if (!sel) return;
  if (!vendorCatalog.length) {
    setVendorLoadError('No vendors in catalog.');
    return;
  }
  clearVendorLoadError();
  sel.innerHTML = vendorCatalog.map((v) => {
    const tag = v.implemented ? '' : ' (stub)';
    return `<option value="${esc(v.id)}">${esc(v.displayName)}${tag}</option>`;
  }).join('');
  renderCredentialFields(sel.value);
}

function renderVendorsTable(vendors) {
  const wrap = document.getElementById('cellular-vendors-table-wrap');
  if (!wrap) return;
  if (!vendors.length) {
    wrap.innerHTML = '<p class="muted">No vendor credentials configured. Add one above.</p>';
    return;
  }
  const rows = vendors.map((v) => `<tr data-vendor-id="${esc(v.id)}">
    <td>${esc(v.label)}</td>
    <td>${esc(v.displayName)}</td>
    <td>${v.implemented ? 'Live' : 'Stub'}</td>
    <td>${v.enabled ? 'Yes' : 'No'}</td>
    <td class="cellular-sims-actions">
      <button type="button" class="btn btn-sm cellular-vendor-test" data-id="${esc(v.id)}">Test</button>
      <button type="button" class="btn btn-sm cellular-vendor-delete" data-id="${esc(v.id)}">Remove</button>
    </td>
  </tr>`).join('');
  wrap.innerHTML = `<table class="cellular-sims-table">
    <thead><tr><th>Label</th><th>Vendor</th><th>Adapter</th><th>Enabled</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  renderBillingVendorSelect(vendors);
}

function defaultBillingPeriodFields() {
  const now = new Date();
  const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
  const periodEnd = now.toISOString().slice(0, 19).replace('T', ' ');
  const startEl = document.getElementById('billing-period-start');
  const endEl = document.getElementById('billing-period-end');
  if (startEl && !startEl.value) startEl.value = periodStart;
  if (endEl && !endEl.value) endEl.value = periodEnd;
}

function billingQueryFromForm() {
  defaultBillingPeriodFields();
  const query = {
    vendor: 'simetry',
    periodStart: document.getElementById('billing-period-start')?.value?.trim(),
    periodEnd: document.getElementById('billing-period-end')?.value?.trim(),
    tenantId: document.getElementById('billing-tenant-id')?.value?.trim(),
  };
  const vendorConfigId = document.getElementById('billing-vendor-config')?.value?.trim();
  if (vendorConfigId) query.vendorConfigId = vendorConfigId;
  return query;
}

function renderBillingVendorSelect(vendors) {
  const sel = document.getElementById('billing-vendor-config');
  if (!sel) return;
  const simetry = (vendors || []).filter((v) => v.vendorId === 'simetry');
  if (!simetry.length) {
    sel.innerHTML = '<option value="">No Simetry vendor configured</option>';
    return;
  }
  sel.innerHTML = [
    '<option value="">All Simetry vendors</option>',
    ...simetry.map((v) => `<option value="${esc(v.id)}">${esc(v.label)}</option>`),
  ].join('');
}

function formatMoney(value, currency = 'USD') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function renderBillingSummary(report) {
  const el = document.getElementById('cellular-billing-summary');
  if (!el || !report) return;
  const s = report.summary || {};
  const invoice = report.invoice?.totalPrice;
  const parts = [
    `${s.count ?? 0} line(s)`,
    `usage ${s.totalUsageMb ?? 0} MB`,
    `total ${formatMoney(s.totalAmount, s.currency || 'USD')}`,
  ];
  if (invoice != null) parts.push(`invoice ${formatMoney(invoice, s.currency || 'USD')}`);
  if (report.period?.periodStart && report.period?.periodEnd) {
    parts.push(`${report.period.periodStart} → ${report.period.periodEnd}`);
  }
  el.textContent = parts.join(' · ');
}

function renderBillingTable(report) {
  const wrap = document.getElementById('cellular-billing-table-wrap');
  if (!wrap) return;
  const lines = report?.lines || [];
  if (!lines.length) {
    wrap.innerHTML = '<p class="muted">No billing lines for this period. Sync billing from Simetry or widen the date range.</p>';
    renderBillingSummary(report);
    return;
  }
  const rows = lines.map((line) => `<tr>
    <td><code>${esc(line.iccid)}</code></td>
    <td>${esc(line.tenantId || '—')}</td>
    <td>${esc(line.plan || '—')}</td>
    <td>${line.usageMb != null ? esc(`${line.usageMb} MB`) : '—'}</td>
    <td>${formatMoney(line.serviceFee, line.currency)}</td>
    <td>${formatMoney(line.amount, line.currency)}</td>
    <td><code>${esc(line.deviceId || line.gatewayId || '—')}</code></td>
  </tr>`).join('');
  wrap.innerHTML = `<table class="cellular-sims-table">
    <thead><tr><th>ICCID</th><th>Tenant</th><th>Plan</th><th>Usage</th><th>Service fee</th><th>Amount</th><th>Linked</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  renderBillingSummary(report);
}

async function refreshBillingReport(live = false) {
  if (typeof window.api?.getCellularBillingReport !== 'function') return;
  const query = billingQueryFromForm();
  if (live) query.live = '1';
  const data = await window.api.getCellularBillingReport(query);
  renderBillingTable(data.report);
  return data.report;
}

async function onSyncBilling() {
  const msg = document.getElementById('cellular-billing-summary');
  if (msg) msg.textContent = 'Syncing Simetry billing…';
  try {
    const body = billingQueryFromForm();
    const result = await window.api.syncCellularBilling(body);
    const summary = (result.results || [])
      .map((r) => `${r.vendorConfigId}: ${r.ok ? `${r.updated}/${r.total} updated` : r.error}`)
      .join('; ');
    if (msg) msg.textContent = summary || 'Billing sync complete.';
    await refreshBillingReport(false);
    await refreshSims();
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || 'Billing sync failed';
      msg.classList.add('cellular-sims-msg-error');
    }
  }
}

async function onExportBilling() {
  try {
    const csv = await window.api.exportCellularBillingCsv(billingQueryFromForm());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simetry-billing-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    window.alert(e.message || 'Export failed');
  }
}

function gatewayLinkLabel(autoLink) {
  if (!autoLink) return '—';
  if (autoLink.linked) return 'Auto-linked';
  if (autoLink.message === 'already linked') return 'Already linked';
  if (autoLink.suggestSync) return 'Sync Simetry first';
  if (autoLink.reason) return autoLink.reason;
  return '—';
}

function renderGatewayReportsTable(reports) {
  const wrap = document.getElementById('cellular-gateway-table-wrap');
  if (!wrap) return;
  if (!reports.length) {
    wrap.innerHTML = '<p class="muted">No gateway cellular reports yet. Run <code>read-cellular</code> and <code>publish-cellular</code> on the NanoPi, or wait for the 15-minute cron.</p>';
    return;
  }
  const rows = reports.map((report) => `<tr>
    <td><code>${esc(report.gatewayId)}</code></td>
    <td><code>${esc(report.iccid || '—')}</code></td>
    <td>${esc(report.platform || '—')}</td>
    <td>${esc(gatewayLinkLabel(report.autoLink))}</td>
    <td class="muted">${esc(report.receivedAt || report.reportedAt || '—')}</td>
  </tr>`).join('');
  wrap.innerHTML = `<table class="cellular-sims-table">
    <thead><tr><th>Gateway</th><th>ICCID</th><th>Platform</th><th>Link status</th><th>Last seen</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function refreshGatewayReports() {
  if (typeof window.api?.getCellularGatewayReports !== 'function') return;
  const data = await window.api.getCellularGatewayReports();
  renderGatewayReportsTable(data.reports || []);
}

function renderSimsTable(sims) {
  const wrap = document.getElementById('cellular-sims-table-wrap');
  if (!wrap) return;
  if (!sims.length) {
    wrap.innerHTML = '<p class="muted">No SIMs synced yet. Configure a vendor and click <strong>Sync all vendors</strong>.</p>';
    return;
  }
  const rows = sims.map((sim) => {
    const linked = sim.deviceId || sim.gatewayId || '—';
    const usage = sim.dataUsageMb != null ? `${sim.dataUsageMb} MB` : '—';
    const canActivate = ['inactive', 'paused', 'suspended', 'unknown'].includes(sim.status);
    const canDeactivate = ['active', 'pending'].includes(sim.status);
    return `<tr data-sim-id="${esc(sim.id)}">
      <td><code>${esc(sim.iccid)}</code></td>
      <td>${esc(sim.vendor)}</td>
      <td>${statusBadge(sim.status)}</td>
      <td>${esc(usage)}</td>
      <td><code>${esc(linked)}</code></td>
      <td class="cellular-sims-actions">
        ${canActivate ? `<button type="button" class="btn btn-sm cellular-sim-activate" data-id="${esc(sim.id)}">Activate</button>` : ''}
        ${canDeactivate ? `<button type="button" class="btn btn-sm cellular-sim-deactivate" data-id="${esc(sim.id)}">Pause</button>` : ''}
        <button type="button" class="btn btn-sm cellular-sim-usage" data-id="${esc(sim.id)}">Usage</button>
      </td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table class="cellular-sims-table">
    <thead><tr><th>ICCID</th><th>Vendor</th><th>Status</th><th>Usage</th><th>Linked device</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function refreshStatus() {
  const statusEl = document.getElementById('cellular-sims-status');
  try {
    const parts = [];
    if (typeof window.api?.getMessagingStatus === 'function') {
      const msg = await window.api.getMessagingStatus();
      if (msg.mail?.configured) parts.push('mail ✓');
      if (msg.sms?.configured) parts.push('SMS ✓');
    }
    const mgr = await window.api.getCellularSimsStatus();
    parts.push(`${mgr.count ?? 0} SIM(s)`);
    parts.push(`${mgr.configuredVendors || 0} vendor(s)`);
    statusEl.textContent = parts.join(' · ');
  } catch (e) {
    statusEl.textContent = e.message || 'Failed to load status';
  }
}

function configBadge(configured) {
  const cls = configured ? 'messaging-config-badge-ok' : 'messaging-config-badge-off';
  const label = configured ? 'Configured' : 'Not configured';
  return `<span class="messaging-config-badge ${cls}">${label}</span>`;
}

function renderMailStatus(mail, capabilities, meta = {}) {
  const wrap = document.getElementById('messaging-mail-status');
  if (!wrap) return;
  if (!mail) {
    wrap.innerHTML = '<p class="muted">Mail status unavailable.</p>';
    return;
  }
  const sourceNote = mail.source === 'env'
    ? '<p class="panel-hint">Active values come from server environment (<code>saas.env</code>). Saved UI values apply when env vars are not set.</p>'
    : (mail.source === 'saved'
      ? '<p class="panel-hint">Using credentials saved from this page.</p>'
      : '<p class="panel-hint">Not configured — enter credentials below.</p>');
  const testNote = capabilities?.mailTest
    ? ''
    : '<p class="panel-hint">Test send requires the cloud mail module (nodemailer) on this server.</p>';
  const saveNote = meta.canSave === false
    ? '<p class="panel-hint">Only tenant admins can save credentials on cloud.</p>'
    : '';
  wrap.innerHTML = `${configBadge(mail.configured)}
    ${sourceNote}
    <dl>
      <dt>SMTP host</dt><dd><code>${esc(mail.host || '—')}</code></dd>
      <dt>Port / TLS</dt><dd>${esc(String(mail.port || '—'))} · ${mail.secure ? 'SSL' : 'STARTTLS'}</dd>
      <dt>From</dt><dd>${esc(mail.fromName || '')} &lt;${esc(mail.from || '—')}&gt;</dd>
      <dt>User / password</dt><dd>${mail.user ? esc(mail.user) : '—'} · ${mail.hasPassword ? 'password set' : 'no password'}</dd>
      <dt>SendGrid API</dt><dd>${mail.useSendGridApi ? 'HTTPS API (port 443)' : 'SMTP transport'}</dd>
    </dl>${testNote}${saveNote}`;
}

function renderSmsStatus(sms, capabilities, meta = {}) {
  const wrap = document.getElementById('messaging-sms-status');
  if (!wrap) return;
  if (!sms) {
    wrap.innerHTML = '<p class="muted">SMS status unavailable.</p>';
    return;
  }
  const sourceNote = sms.source === 'env'
    ? '<p class="panel-hint">Active values come from server environment (<code>saas.env</code>). Saved UI values apply when env vars are not set.</p>'
    : (sms.source === 'saved'
      ? '<p class="panel-hint">Using credentials saved from this page.</p>'
      : '<p class="panel-hint">Not configured — enter Twilio credentials below.</p>');
  const testNote = capabilities?.smsTest
    ? ''
    : '<p class="panel-hint">Test send requires the Twilio SMS module on this server.</p>';
  const shared = sms.sharesTwilioSuperSimCredentials
    ? '<p class="panel-hint">Account SID and auth token are shared with Twilio Super SIM vendor credentials.</p>'
    : '';
  const saveNote = meta.canSave === false
    ? '<p class="panel-hint">Only tenant admins can save credentials on cloud.</p>'
    : '';
  wrap.innerHTML = `${configBadge(sms.configured)}
    ${sourceNote}
    <dl>
      <dt>Account SID</dt><dd><code>${esc(sms.accountSid || '—')}</code></dd>
      <dt>SMS from</dt><dd><code>${esc(sms.from || '—')}</code></dd>
      <dt>Auth token</dt><dd>${sms.hasAuthToken ? 'set' : 'missing'}</dd>
      <dt>Default country</dt><dd>+${esc(sms.defaultCountry || '1')}</dd>
    </dl>${shared}${testNote}${saveNote}`;
}

function populateMailForm(form) {
  if (!form?.mail) return;
  const m = form.mail;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  set('messaging-mail-host', m.host);
  set('messaging-mail-port', m.port);
  set('messaging-mail-user', m.user);
  set('messaging-mail-from', m.from);
  set('messaging-mail-from-name', m.fromName);
  const secure = document.getElementById('messaging-mail-secure');
  if (secure) secure.checked = Boolean(m.secure);
  const sg = document.getElementById('messaging-mail-sendgrid-api');
  if (sg) sg.checked = Boolean(m.useSendGridApi);
  const pass = document.getElementById('messaging-mail-pass');
  if (pass) pass.value = m.pass && m.pass !== '********' ? m.pass : '';
  if (pass && m.hasPassword && !pass.value) pass.placeholder = '******** (unchanged)';
}

function populateSmsForm(form) {
  if (!form?.sms) return;
  const s = form.sms;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  set('messaging-sms-account-sid', s.accountSid);
  set('messaging-sms-from', s.from);
  set('messaging-sms-country', s.defaultCountry);
  const token = document.getElementById('messaging-sms-auth-token');
  if (token) token.value = s.authToken && s.authToken !== '********' ? s.authToken : '';
  if (token && s.hasAuthToken && !token.value) token.placeholder = '******** (unchanged)';
}

function setMessagingSaveEnabled(canSave) {
  ['messaging-mail-save-btn', 'messaging-sms-save-btn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !canSave;
  });
}

async function refreshMessaging() {
  if (typeof window.api?.getMessagingStatus !== 'function') return;
  try {
    const data = await window.api.getMessagingStatus();
    renderMailStatus(data.mail, data.capabilities, { canSave: data.canSave });
    renderSmsStatus(data.sms, data.capabilities, { canSave: data.canSave });
    populateMailForm(data.form);
    populateSmsForm(data.form);
    const canSave = Boolean(data.canSave && data.capabilities?.saveConfig !== false);
    setMessagingSaveEnabled(canSave);
    if (!canSave && data.capabilities?.saveConfig === false) {
      const hint = '<p class="panel-hint cellular-sims-msg-error">Save is unavailable — deploy platform messaging files and restart peaklogic-saas.</p>';
      document.getElementById('messaging-mail-status')?.insertAdjacentHTML('beforeend', hint);
      document.getElementById('messaging-sms-status')?.insertAdjacentHTML('beforeend', hint);
    }
  } catch (e) {
    const err = esc(e.message || 'Failed to load messaging status');
    const mailWrap = document.getElementById('messaging-mail-status');
    const smsWrap = document.getElementById('messaging-sms-status');
    if (mailWrap) mailWrap.innerHTML = `<p class="cellular-sims-msg-error">${err}</p>`;
    if (smsWrap) smsWrap.innerHTML = `<p class="cellular-sims-msg-error">${err}</p>`;
  }
}

async function onSaveMail(ev) {
  ev.preventDefault();
  const msg = document.getElementById('messaging-mail-msg');
  if (msg) {
    msg.textContent = '';
    msg.classList.remove('cellular-sims-msg-error');
  }
  const body = {
    mail: {
      host: document.getElementById('messaging-mail-host')?.value?.trim(),
      port: Number(document.getElementById('messaging-mail-port')?.value) || 587,
      secure: document.getElementById('messaging-mail-secure')?.checked,
      useSendGridApi: document.getElementById('messaging-mail-sendgrid-api')?.checked,
      user: document.getElementById('messaging-mail-user')?.value?.trim(),
      pass: document.getElementById('messaging-mail-pass')?.value,
      from: document.getElementById('messaging-mail-from')?.value?.trim(),
      fromName: document.getElementById('messaging-mail-from-name')?.value?.trim(),
    },
  };
  const btn = document.getElementById('messaging-mail-save-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await window.api.saveMessagingConfig(body);
    if (msg) msg.textContent = result.message || 'Email settings saved.';
    await refreshMessaging();
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || 'Save failed';
      msg.classList.add('cellular-sims-msg-error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onSaveSms(ev) {
  ev.preventDefault();
  const msg = document.getElementById('messaging-sms-msg');
  if (msg) {
    msg.textContent = '';
    msg.classList.remove('cellular-sims-msg-error');
  }
  const body = {
    sms: {
      accountSid: document.getElementById('messaging-sms-account-sid')?.value?.trim(),
      authToken: document.getElementById('messaging-sms-auth-token')?.value,
      from: document.getElementById('messaging-sms-from')?.value?.trim(),
      defaultCountry: document.getElementById('messaging-sms-country')?.value?.trim(),
    },
  };
  const btn = document.getElementById('messaging-sms-save-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await window.api.saveMessagingConfig(body);
    if (msg) msg.textContent = result.message || 'SMS settings saved.';
    await refreshMessaging();
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || 'Save failed';
      msg.classList.add('cellular-sims-msg-error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onTestMail(ev) {
  ev.preventDefault();
  const msg = document.getElementById('messaging-mail-msg');
  const to = document.getElementById('messaging-mail-test-to')?.value?.trim();
  if (msg) msg.textContent = '';
  if (!to) {
    if (msg) msg.textContent = 'Enter a test email address.';
    return;
  }
  const btn = document.getElementById('messaging-mail-test-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await window.api.testMessagingMail({ to });
    if (msg) msg.textContent = result.message || 'Test email sent.';
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || 'Test email failed';
      msg.classList.add('cellular-sims-msg-error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function onTestSms(ev) {
  ev.preventDefault();
  const msg = document.getElementById('messaging-sms-msg');
  const to = document.getElementById('messaging-sms-test-to')?.value?.trim();
  if (msg) msg.textContent = '';
  if (!to) {
    if (msg) msg.textContent = 'Enter a test phone number.';
    return;
  }
  const btn = document.getElementById('messaging-sms-test-btn');
  if (btn) btn.disabled = true;
  try {
    const result = await window.api.testMessagingSms({ to });
    if (msg) msg.textContent = result.message || 'Test SMS sent.';
  } catch (e) {
    if (msg) {
      msg.textContent = e.message || 'Test SMS failed';
      msg.classList.add('cellular-sims-msg-error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function refreshVendors() {
  const tableWrap = document.getElementById('cellular-vendors-table-wrap');
  if (typeof window.api?.getCellularVendorCatalog !== 'function') {
    const err = 'Cellular API client is outdated — restart the server and hard-refresh this page.';
    setVendorLoadError(err);
    if (tableWrap) tableWrap.innerHTML = `<p class="cellular-sims-msg-error">${esc(err)}</p>`;
    return;
  }
  try {
    const catalog = await window.api.getCellularVendorCatalog();
    vendorCatalog = catalog.vendors || [];
    renderVendorSelect();
    const data = await window.api.getCellularVendors();
    renderVendorsTable(data.vendors || []);
  } catch (e) {
    const err = e.message || 'Failed to load vendors';
    setVendorLoadError(err);
    if (tableWrap && !vendorCatalog.length) {
      tableWrap.innerHTML = `<p class="cellular-sims-msg-error">${esc(err)}</p>`;
    }
  }
}

async function refreshSims() {
  const data = await window.api.getCellularSims();
  renderSimsTable(data.sims || []);
  await refreshStatus();
}

async function refreshAll() {
  await refreshMessaging();
  await refreshVendors();
  defaultBillingPeriodFields();
  await refreshBillingReport(false).catch(() => {});
  await refreshGatewayReports().catch(() => {});
  await refreshSims();
}

async function onAddVendor(ev) {
  ev.preventDefault();
  const msg = document.getElementById('cellular-vendor-msg');
  msg.textContent = '';
  const vendorId = document.getElementById('vendor-id').value;
  const label = document.getElementById('vendor-label').value.trim();
  const credentials = {};
  document.querySelectorAll('#vendor-credential-fields [data-cred-key]').forEach((el) => {
    credentials[el.dataset.credKey] = el.value.trim();
  });
  try {
    await window.api.addCellularVendor({ vendorId, label, credentials, enabled: true });
    msg.textContent = 'Vendor added.';
    ev.target.reset();
    renderVendorSelect();
    await refreshVendors();
  } catch (e) {
    msg.textContent = e.message || 'Add vendor failed';
  }
}

async function onVendorTableClick(ev) {
  const btn = ev.target.closest('button[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.classList.contains('cellular-vendor-test')) {
      const result = await window.api.testCellularVendor(id);
      window.alert(result.message || (result.ok ? 'Connection OK' : 'Test failed'));
    }
    if (btn.classList.contains('cellular-vendor-delete')) {
      if (!window.confirm('Remove this vendor configuration?')) return;
      await window.api.deleteCellularVendor(id);
      await refreshVendors();
    }
  } catch (e) {
    window.alert(e.message || 'Action failed');
  }
}

async function onSimTableClick(ev) {
  const btn = ev.target.closest('button[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    if (btn.classList.contains('cellular-sim-activate')) await window.api.activateCellularSim(id);
    if (btn.classList.contains('cellular-sim-deactivate')) await window.api.deactivateCellularSim(id);
    if (btn.classList.contains('cellular-sim-usage')) {
      const data = await window.api.getCellularSimUsage(id);
      window.alert(`Usage: ${data.usage?.dataUsageMb ?? 'unknown'} MB`);
    }
    await refreshSims();
  } catch (e) {
    window.alert(e.message || 'Action failed');
    await refreshSims();
  }
}

async function onSyncAll() {
  try {
    const result = await window.api.syncCellularSims();
    const summary = (result.results || [])
      .map((r) => `${r.vendorId}: ${r.ok ? `${r.synced || 0} synced` : r.error || r.message}`)
      .join('\n');
    window.alert(summary || 'Sync complete');
    await refreshSims();
  } catch (e) {
    window.alert(e.message || 'Sync failed');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cellular-vendor-form')?.addEventListener('submit', onAddVendor);
  document.getElementById('vendor-id')?.addEventListener('change', (e) => renderCredentialFields(e.target.value));
  document.getElementById('cellular-vendors-table-wrap')?.addEventListener('click', onVendorTableClick);
  document.getElementById('cellular-sims-table-wrap')?.addEventListener('click', onSimTableClick);
  document.getElementById('cellular-sync-all')?.addEventListener('click', onSyncAll);
  document.getElementById('cellular-sims-refresh')?.addEventListener('click', refreshSims);
  document.getElementById('cellular-vendors-refresh')?.addEventListener('click', refreshVendors);
  document.getElementById('cellular-billing-sync')?.addEventListener('click', onSyncBilling);
  document.getElementById('cellular-billing-refresh')?.addEventListener('click', () => refreshBillingReport(false));
  document.getElementById('cellular-billing-export')?.addEventListener('click', onExportBilling);
  document.getElementById('cellular-gateway-refresh')?.addEventListener('click', refreshGatewayReports);
  document.getElementById('messaging-mail-refresh')?.addEventListener('click', refreshMessaging);
  document.getElementById('messaging-sms-refresh')?.addEventListener('click', refreshMessaging);
  document.getElementById('messaging-mail-test-form')?.addEventListener('submit', onTestMail);
  document.getElementById('messaging-sms-test-form')?.addEventListener('submit', onTestSms);
  document.getElementById('messaging-mail-config-form')?.addEventListener('submit', onSaveMail);
  document.getElementById('messaging-sms-config-form')?.addEventListener('submit', onSaveSms);
  refreshAll().catch((e) => {
    const statusEl = document.getElementById('cellular-sims-status');
    if (statusEl) statusEl.textContent = e.message || 'Failed to load page';
  });
});
