'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardEjs = fs.readFileSync(
  path.join(__dirname, '../views/dashboard.ejs'),
  'utf8',
);

describe('dashboard System setup Features tab', () => {
  it('renders feature toggles in an always-visible Features panel', () => {
    assert.match(dashboardEjs, /data-setup-tab-btn="features"/);
    const featuresPanel = dashboardEjs.match(
      /<section class="setup-panel[^"]*" data-setup-tab="features">([\s\S]*?)<\/section>/,
    );
    assert.ok(featuresPanel, 'Features setup panel missing');
    const panelHtml = featuresPanel[1];
    assert.match(panelHtml, /id="proj-cloud-sims-enabled"/);
    assert.match(panelHtml, /id="proj-cellular-sims-enabled"/);
    assert.match(panelHtml, /data-cloud-sims-open/);
    assert.match(panelHtml, /data-cellular-sims-open/);
    const toolsMenu = dashboardEjs.match(
      /<nav class="topbar-tools-dropdown[^"]*"[\s\S]*?<\/nav>/,
    );
    assert.ok(toolsMenu, 'Tools dropdown missing');
    assert.match(toolsMenu[0], /href="\/cellular\/sims"/);
    assert.match(toolsMenu[0], /Connectivity/);
    assert.doesNotMatch(toolsMenu[0], /\/cloud\/sims/);
    assert.doesNotMatch(dashboardEjs, /id="btn-project-features"/);
    assert.doesNotMatch(dashboardEjs, /id="btn-tools-features"/);
    assert.match(featuresPanel[1], /Open Connectivity/);
  });
});
