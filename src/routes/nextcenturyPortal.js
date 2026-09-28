'use strict';

const express = require('express');
const { buildPortalUrl, buildPortalLoginUrl } = require('../drivers/nextcenturyAuth');
const { getPortalSession } = require('../drivers/nextcenturyPortalSession');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Third-party portal only — omit allow-same-origin so scripts cannot unsandbox the frame. */
const NC_THIRD_PARTY_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';

function renderPortalFrameHtml(session) {
  const portalUrl = buildPortalUrl(session.token);
  const loginUrl = buildPortalLoginUrl();
  const email = escapeHtml(session.email);
  const portalUrlAttr = escapeHtml(portalUrl);
  const loginUrlAttr = escapeHtml(loginUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NextCentury portal</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0f1419; color: #c8d0da; font-family: system-ui, sans-serif; }
    .nc-portal-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 0.75rem;
      padding: 0.35rem 0.75rem; font-size: 0.82rem; border-bottom: 1px solid #2a3340; background: #151b24;
    }
    .nc-portal-bar a { color: #7eb8ff; }
    .nc-portal-bar .nc-portal-close {
      margin-left: auto; padding: 0.2rem 0.65rem; border: 1px solid #3d4d62; border-radius: 4px;
      background: #1e293b; color: #e2e8f0; text-decoration: none; font-size: 0.8rem;
    }
    .nc-portal-bar .nc-portal-close:hover { background: #334155; }
    iframe { display: block; width: 100%; height: calc(100% - 2rem); border: 0; background: #fff; }
  </style>
</head>
<body>
  <p class="nc-portal-bar">Signed in as <strong>${email}</strong> via PeakLogic API.
    <a href="${portalUrlAttr}" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    · <a href="${loginUrlAttr}" target="_blank" rel="noopener noreferrer">Portal login</a>
    <a href="/" class="nc-portal-close" title="Return to dashboard">Close</a>
  </p>
  <iframe
    id="nc-portal-frame"
    title="NextCentury portal"
    sandbox="${NC_THIRD_PARTY_SANDBOX}"
    referrerpolicy="no-referrer"
    src="${portalUrlAttr}"></iframe>
  <script>
    (function () {
      var frame = document.getElementById('nc-portal-frame');
      var loginUrl = ${JSON.stringify(loginUrl)};
      window.setTimeout(function () {
        try {
          if (!frame || !frame.contentWindow) return;
        } catch (e) { /* cross-origin */ }
      }, 12000);
      frame.addEventListener('error', function () {
        frame.src = loginUrl;
      });
    }());
  </script>
</body>
</html>`;
}

function createNextcenturyPortalRoutes() {
  const router = express.Router();

  router.get('/nextcentury-portal/frame/:sessionId', (req, res) => {
    const session = getPortalSession(req.params.sessionId);
    if (!session) {
      res.status(404).type('html').send(
        '<!DOCTYPE html><html><body><p>Portal session expired or invalid. Return to PeakLogic Drivers and open the portal again.</p></body></html>',
      );
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.type('html').send(renderPortalFrameHtml(session));
  });

  router.get('/nextcentury-portal/:sessionId', (req, res) => {
    const session = getPortalSession(req.params.sessionId);
    if (!session) {
      res.status(404).type('html').send(
        '<!DOCTYPE html><html><body><p>Portal session expired or invalid.</p></body></html>',
      );
      return;
    }
    const framePath = `/nextcentury-portal/frame/${encodeURIComponent(req.params.sessionId)}`;
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NextCentury portal — PeakLogic</title>
  <style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
  <iframe title="NextCentury portal" src="${escapeHtml(framePath)}"></iframe>
</body>
</html>`);
  });

  return router;
}

module.exports = { createNextcenturyPortalRoutes, renderPortalFrameHtml, escapeHtml, NC_THIRD_PARTY_SANDBOX };
