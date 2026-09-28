'use strict';

/**
 * Build a standalone Facility Draw 3D viewer HTML page from a scene config.
 * @param {object} site — buildSceneFromFacilityDraw() output
 * @param {{ title?: string, subtitle?: string, configFile?: string }} opts
 */
function buildFacilityDraw3dHtml(site, opts = {}) {
  const title = String(opts.title || site?.name || 'Facility Draw 3D').replace(/</g, '&lt;');
  const subtitle = String(opts.subtitle || '').replace(/</g, '&lt;');
  const configFile = String(opts.configFile || './site-config.js').replace(/"/g, '&quot;');
  const generated = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    #canvas-wrap { position: absolute; inset: 0; }
    canvas { display: block; width: 100%; height: 100%; }
    .panel { position: absolute; z-index: 10; background: rgba(15, 23, 42, 0.94); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 10px; backdrop-filter: blur(8px); padding: 14px 16px; font-size: 13px; line-height: 1.45; }
    #title-panel { top: 14px; left: 14px; max-width: 420px; }
    #title-panel h1 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    #title-panel p { color: #94a3b8; font-size: 12px; }
    #detail-panel { top: 14px; right: 14px; width: 320px; display: none; }
    #detail-panel.open { display: block; }
    #detail-panel h2 { font-size: 14px; margin-bottom: 6px; }
    #detail-panel dl { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: 12px; }
    #detail-panel dt { color: #94a3b8; }
    #detail-panel dd { text-align: right; font-family: Consolas, monospace; }
    .hint { margin-top: 8px; font-size: 11px; color: #64748b; }
    #legend { bottom: 14px; left: 14px; max-width: 300px; }
    #legend h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; margin-bottom: 6px; }
    .legend-item { font-size: 12px; margin-bottom: 4px; color: #cbd5e1; }
    #live-status { bottom: 14px; right: 14px; font-size: 12px; font-family: Consolas, monospace; }
    #live-status.ok { color: #4ade80; }
    #live-status.err { color: #fbbf24; }
  </style>
</head>
<body>
  <div id="canvas-wrap"></div>
  <div id="title-panel" class="panel">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ''}
    <p class="hint">Typed 3D models from Facility Draw — click a symbol for details. Generated ${generated}</p>
  </div>
  <div id="detail-panel" class="panel">
    <h2 id="detail-title">Symbol</h2>
    <dl id="detail-fields"></dl>
  </div>
  <div id="legend" class="panel">
    <h2>Legend</h2>
    <div class="legend-item">Lift stations, tanks, drip fields use typed 3D models</div>
    <div class="legend-item">Purple pads = zone aggregation (zone ID or group)</div>
    <div class="legend-item">Blue pipes follow connection polylines</div>
    <div class="legend-item">Bind device ID + tags in Facility Draw for live SCADA colors</div>
  </div>
  <div id="live-status" class="panel">Connecting…</div>
  <script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
  <script type="module">
    import { SITE } from '${configFile}';
    import { mountFacilityDrawSiteScene } from './facilitydraw-site-viewer.js';

    const detailPanel = document.getElementById('detail-panel');
    const detailTitle = document.getElementById('detail-title');
    const detailFields = document.getElementById('detail-fields');
    const liveStatus = document.getElementById('live-status');

    function showDetail(p) {
      if (!p) {
        detailPanel.classList.remove('open');
        return;
      }
      detailPanel.classList.add('open');
      detailTitle.textContent = p.label || p.type;
      const rows = [
        ['Type', p.type],
        ['3D model', p.model3d || 'box'],
        ['Group', p.group],
        ['Category', p.category],
        ['Plan X/Y', p.world.x.toFixed(1) + ' / ' + p.world.y.toFixed(1) + ' ' + (SITE.units || 'ft')],
        ['Size', p.size.widthFt.toFixed(1) + ' × ' + p.size.depthFt.toFixed(1) + ' ft'],
      ];
      if (p.role) rows.push(['Role', p.role]);
      if (p.zoneId) rows.push(['Zone', p.zoneId]);
      if (p.deviceId) rows.push(['Device', p.deviceId]);
      if (p.alarmTag) rows.push(['Alarm tag', p.alarmTag]);
      if (p.levelTag) rows.push(['Level tag', p.levelTag]);
      detailFields.innerHTML = '';
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        detailFields.appendChild(dt);
        detailFields.appendChild(dd);
      }
    }

    mountFacilityDrawSiteScene(document.getElementById('canvas-wrap'), SITE, {
      onSelect: showDetail,
      onLiveStatus: (msg, err) => {
        liveStatus.textContent = msg;
        liveStatus.className = 'panel ' + (err ? 'err' : 'ok');
      },
    });
  </script>
</body>
</html>
`;
}

module.exports = { buildFacilityDraw3dHtml };
