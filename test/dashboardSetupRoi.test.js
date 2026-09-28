'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardEjs = fs.readFileSync(
  path.join(__dirname, '../views/dashboard.ejs'),
  'utf8',
);

describe('dashboard System setup ROI tab', () => {
  it('renders ROI calculator panel and script', () => {
    assert.match(dashboardEjs, /data-setup-tab-btn="roi"/);
    assert.match(dashboardEjs, /\/js\/roiCalculator\.js/);
    const roiPanel = dashboardEjs.match(
      /<section class="setup-panel[^"]*" data-setup-tab="roi">([\s\S]*?)<\/section>/,
    );
    assert.ok(roiPanel, 'ROI setup panel missing');
    const panelHtml = roiPanel[1];
    assert.match(panelHtml, /id="roi-leak-repair-cost"/);
    assert.match(panelHtml, /value="90"/);
    assert.match(panelHtml, /id="roi-pool-energy-monthly"/);
    assert.match(panelHtml, /id="roi-pool-chem-monthly"/);
    assert.match(panelHtml, /id="roi-combined-summary"/);
  });
});
