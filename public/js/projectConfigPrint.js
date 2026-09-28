'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PeaklogicProjectConfigPrint = api;
})(typeof window !== 'undefined' ? window : globalThis, function projectConfigPrintFactory() {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function yesNo(v) {
    return v ? 'Yes' : 'No';
  }

  function maskMongoUri(uri) {
    const s = String(uri || '').trim();
    if (!s) return '—';
    return s.replace(/\/\/([^:@/]+):([^@/]+)@/i, '//$1:***@');
  }

  function startupModeLabel(mode) {
    const map = {
      workspace: 'Last workspace (workspace.est.json)',
      last_project: 'Last opened saved project',
      saved_project: 'Specific saved project',
      blank: 'Current data folder only',
    };
    return map[mode] || mode || '—';
  }

  function section(title, bodyHtml) {
    return `<section class="cfg-section">
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    </section>`;
  }

  function kvTable(rows) {
    const body = rows.map(([k, v]) =>
      `<tr><th>${esc(k)}</th><td>${v}</td></tr>`,
    ).join('');
    return `<table class="cfg-kv"><tbody>${body}</tbody></table>`;
  }

  function dataTable(headers, rows) {
    const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
    const body = rows.length
      ? rows.map((cells) =>
        `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`,
      ).join('')
      : `<tr><td colspan="${headers.length}" class="muted">None</td></tr>`;
    return `<table class="cfg-data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function buildHtml(snapshot) {
    const st = snapshot.settings || {};
    const mqtt = st.mqttParc || {};
    const cloud = st.cloudRemote || {};
    const startup = st.startup || {};
    const hmi = snapshot.hmi || st.hmi || {};
    const screens = Array.isArray(hmi.screens) ? hmi.screens : [];
    const bindings = Array.isArray(hmi.bindings) ? hmi.bindings : [];
    const tags = Array.isArray(snapshot.tags) ? snapshot.tags : [];
    const drivers = Array.isArray(snapshot.drivers) ? snapshot.drivers : [];
    const pens = Array.isArray(snapshot.graphPens) ? snapshot.graphPens : (st.graphPens || []);
    const pdmAssets = st.pdm?.assetTags && typeof st.pdm.assetTags === 'object'
      ? Object.keys(st.pdm.assetTags)
      : [];
    const pools = st.assistedLiving?.pools || [];
    const runtime = snapshot.runtime || {};
    const printed = snapshot.printedAt
      ? new Date(snapshot.printedAt).toLocaleString()
      : new Date().toLocaleString();

    const tagRows = tags.map((t) => [
      `<code>${esc(t.id)}</code>`,
      esc(t.type || ''),
      esc(t.label || ''),
      esc(t.addr || t.address || ''),
      esc(t.unit || ''),
      yesNo(t.alarmEnabled || t.alarmHigh != null || t.alarmLow != null),
    ]);

    const driverRows = drivers.map((d) => [
      `<code>${esc(d.id)}</code>`,
      esc(d.type || ''),
      d.enabled === false ? 'Disabled' : 'Enabled',
      esc(d.templateId || d.template || ''),
    ]);

    const screenRows = screens.map((s, i) => {
      const bindCount = bindings.filter((b) => b.screenId === s.id).length;
      const label = s.name || s.title || s.id || `Screen ${i + 1}`;
      return [
        esc(String(s.number ?? i + 1)),
        `<code>${esc(s.id)}</code>`,
        esc(label),
        String(bindCount),
      ];
    });

    const penRows = pens.filter((p) => p?.tagId).map((p) => [
      `<code>${esc(p.tagId)}</code>`,
      esc(p.label || ''),
      esc(String(p.color || '')),
      esc(String(p.scale ?? 1)),
      esc(String(p.offset ?? 0)),
    ]);

    const programRows = (snapshot.programs || []).map((p) => [
      esc(p.category || ''),
      esc(p.name || p.path || ''),
      `<code>${esc(p.path || '')}</code>`,
    ]);

    const poolRows = pools.map((p, i) => [
      String(i + 1),
      esc(p.name || p.id || ''),
      esc(p.bodyType || ''),
      String(p.filterPumpCount ?? ''),
      esc(p.sharedWithMainPoolId || ''),
    ]);

    const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>PeakLogic Project Configuration — ${esc(snapshot.projectName || 'untitled')}</title>
<style>
  body { font-family: Segoe UI, system-ui, sans-serif; margin: 24px; color: #0f172a; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 1.45rem; margin: 0 0 0.35rem; }
  .meta { color: #64748b; font-size: 0.92rem; margin-bottom: 1.25rem; }
  h2 { font-size: 1.05rem; margin: 0 0 0.5rem; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; }
  .cfg-section { margin-bottom: 1.25rem; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 0.86rem; margin-top: 0.35rem; }
  th, td { border: 1px solid #e2e8f0; padding: 0.3rem 0.45rem; text-align: left; vertical-align: top; }
  .cfg-kv th { width: 11rem; background: #f8fafc; font-weight: 600; }
  .cfg-data th { background: #f1f5f9; }
  code { font-family: Consolas, monospace; font-size: 0.92em; }
  .muted { color: #64748b; }
  @media print {
    body { margin: 12mm; }
    .cfg-section { break-inside: avoid-page; }
  }
</style>
</head><body>
<h1>PeakLogic — Project Configuration</h1>
<p class="meta">Project: <strong>${esc(snapshot.projectName || 'untitled')}</strong>
 · PeakLogic ${esc(snapshot.appVersion || '—')}
 · Printed ${esc(printed)}</p>

${section('Project identity', kvTable([
      ['Project name', esc(st.project?.name || snapshot.projectName || 'untitled')],
      ['Scan interval', esc(`${st.scanMs ?? 100} ms`)],
      ['Active ST program', `<code>${esc(st.activeProgram || '(none)')}</code>`],
      ['Runtime', esc(runtime.running ? `Running (scan ${runtime.scanMs ?? '—'} ms)` : 'Stopped')],
      ['Auto-start runtime on boot', yesNo(st.autoStartRuntime)],
      ['Remote ST execution (Opta)', yesNo(st.remoteExecution)],
      ['Opta auto-run on power-up', yesNo(st.optaAutoRunOnBoot)],
    ]))}

${section('Startup', kvTable([
      ['Load on boot', esc(startupModeLabel(startup.mode))],
      ['Startup project id', esc(startup.projectId || '—')],
      ['Prompt if startup load fails', yesNo(startup.promptOnBoot)],
      ['Starting HMI screen', `<code>${esc(hmi.activeScreen || st.hmi?.activeScreen || '—')}</code>`],
    ]))}

${section('MQTT Parc & cloud uplink', kvTable([
      ['MQTT Parc hub', yesNo(mqtt.enabled)],
      ['Broker URL', esc(mqtt.brokerUrl || '—')],
      ['MQTT user', esc(mqtt.username || '—')],
      ['Global site key', esc(mqtt.globalSiteKey || '—')],
      ['Auto-discover Opta drivers', yesNo(mqtt.autoDiscoverDrivers)],
      ['Cloud remote uplink', yesNo(cloud.enabled)],
      ['Cloud tenant ID', esc(cloud.tenantId || '—')],
      ['Gateway ID', esc(cloud.gatewayId || '—')],
      ['Cloud broker URL', esc(cloud.brokerUrl || '—')],
    ]))}

${section('Platform features', kvTable([
      ['Cloud Sim management', yesNo(st.cloudSims?.enabled)],
      ['Cellular SIM management', yesNo(st.cellularSims?.enabled)],
      ['MongoDB logger URI', esc(maskMongoUri(st.mongoLogger?.uri))],
      ['MongoDB database', esc(st.mongoLogger?.db || '—')],
    ]))}

${section('ST programs (catalog)', dataTable(['Category', 'Name', 'Path'], programRows))}

${section(`Tags (${tags.length})`, dataTable(['Tag id', 'Type', 'Label', 'Address', 'Unit', 'Alarms'], tagRows))}

${section(`Drivers (${drivers.length})`, dataTable(['Id', 'Type', 'Status', 'Template'], driverRows))}

${section('HMI', kvTable([
      ['Screens', String(screens.length)],
      ['Total bindings', String(bindings.length)],
      ['Composer mode', esc(hmi.composerMode || '—')],
    ]) + dataTable(['#', 'Screen id', 'Name', 'Bindings'], screenRows))}

${section(`Historian pens (${penRows.length})`, dataTable(['Tag', 'Label', 'Color', 'Scale', 'Offset'], penRows))}

${section('PdM', kvTable([
      ['Assets mapped', esc(pdmAssets.length ? pdmAssets.join(', ') : '—')],
      ['Feature window (min)', esc(String(st.pdm?.windowMin ?? '—'))],
      ['Failure threshold', esc(String(st.pdm?.failureThreshold ?? '—'))],
      ['Nightly batch', yesNo(st.pdm?.buildEnabled)],
    ]))}

${pools.length ? section(`Area configuration — bodies of water (${pools.length})`, dataTable(['#', 'Name', 'Type', 'Filter pumps', 'Shared main pool'], poolRows)) : ''}

${st.assistedLiving ? section('Area configuration — mechanical room', kvTable([
      ['Gas-fired water heaters', yesNo(st.assistedLiving.mechWhGas)],
    ])) : ''}

<p class="muted">Generated by PeakLogic for project documentation. Sensitive credentials (MQTT passwords, API keys) are omitted.</p>
</body></html>`;

    return html;
  }

  function printViaIframe(html) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'PeakLogic project configuration print');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win?.document) {
      iframe.remove();
      return { ok: false, error: 'Print preview unavailable in this browser' };
    }
    const cleanup = () => {
      try { iframe.remove(); } catch { /* ignore */ }
    };
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 120000);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    try {
      win.print();
    } catch (e) {
      cleanup();
      return { ok: false, error: e.message || 'Print failed' };
    }
    return { ok: true };
  }

  function print(snapshot) {
    if (typeof document === 'undefined') {
      return { ok: false, error: 'Print is only available in the browser' };
    }
    const html = buildHtml(snapshot || {});
    return printViaIframe(html);
  }

  return {
    buildHtml,
    print,
  };
});
