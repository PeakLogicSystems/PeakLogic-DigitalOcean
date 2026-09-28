'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dashboardEjs = fs.readFileSync(path.join(root, 'views/dashboard.ejs'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const hmiSetupUiJs = fs.readFileSync(path.join(root, 'public/js/hmiSetupUi.js'), 'utf8');
const hmiJs = fs.readFileSync(path.join(root, 'public/js/hmi.js'), 'utf8');
const programUiJs = fs.readFileSync(path.join(root, 'public/js/programUi.js'), 'utf8');
const stPidEditorJs = fs.readFileSync(path.join(root, 'public/js/stPidEditor.js'), 'utf8');
const cameraAdminUiJs = fs.readFileSync(path.join(root, 'public/js/cameraAdminUi.js'), 'utf8');
const projectHubUiJs = fs.readFileSync(path.join(root, 'public/js/projectHubUi.js'), 'utf8');

function matchesAll(text, re) {
  return [...text.matchAll(re)].map((m) => m[1]);
}

describe('dashboard popup close wiring', () => {
  it('maps every data-popup-close target to a data-popup shell', () => {
    const closeTargets = matchesAll(dashboardEjs, /data-popup-close="([^"]+)"/g);
    const popupNames = new Set(matchesAll(dashboardEjs, /data-popup="([^"]+)"/g));
    const missing = [...new Set(closeTargets)].filter((name) => !popupNames.has(name));
    assert.deepEqual(missing, [], `Missing data-popup shells for: ${missing.join(', ')}`);
  });

  it('binds generic popup close buttons in app.js', () => {
    assert.match(appJs, /dataset\.popupCloseBound/);
    assert.match(appJs, /closest\('\[data-popup-close\]'\)/);
    assert.match(appJs, /closePopup\(btn\.dataset\.popupClose\)/);
  });

  it('handles floater and special popups in closePopup()', () => {
    const special = [
      'hmi-setup',
      'live-io',
      'program',
      'tags',
      'alarms',
      'historian',
      'historian-setup',
      'historian-logger',
      'nextcentury-portal',
    ];
    for (const name of special) {
      assert.match(appJs, new RegExp(`if \\(name === '${name}'\\)`));
    }
  });

  it('wires native dialog cancel/close buttons', () => {
    assert.match(appJs, /project-picker-cancel/);
    assert.match(appJs, /project-picker-dialog.*close\('cancel'\)/);
    assert.match(programUiJs, /program-picker-cancel/);
    assert.match(programUiJs, /program-picker-dialog.*close\('cancel'\)/);
    assert.match(stPidEditorJs, /st-pid-cancel/);
    assert.match(stPidEditorJs, /dlg\.close\('cancel'\)/);
    assert.match(projectHubUiJs, /project-hub-cancel/);
  });

  it('wires HMI overlay close controls', () => {
    assert.match(hmiSetupUiJs, /data-hmi-room-close/);
    assert.match(hmiSetupUiJs, /closeHmiRoomPopup/);
    assert.match(hmiJs, /data-hmi-camera-close/);
    assert.match(hmiJs, /closeCameraPopup/);
    assert.match(dashboardEjs, /id="hmi-room-popup"/);
    assert.match(dashboardEjs, /id="hmi-camera-popup"/);
  });

  it('wires cameras panel cancel edit', () => {
    assert.match(cameraAdminUiJs, /btn-camera-cancel-edit.*closeEditForm/);
  });

  it('includes nested popups in Escape close order', () => {
    const escapeBlock = appJs.match(/if \(e\.key !== 'Escape'\) return;[\s\S]*?for \(const n of order\)/);
    assert.ok(escapeBlock, 'Escape handler order list missing');
    for (const name of ['alarm-notify', 'hw-wizard', 'nextcentury-portal']) {
      assert.match(escapeBlock[0], new RegExp(`'${name}'`), `${name} missing from Escape order`);
    }
  });

  it('keeps header close buttons above resize handles', () => {
    const pcCss = fs.readFileSync(path.join(root, 'public/css/pc.css'), 'utf8');
    assert.match(pcCss, /Above \.popup-resize-handle \(z-index 100\)/);
    assert.match(pcCss, /position: relative;\r?\n\s*z-index: 101;/);
  });

  it('does not clear HMI Setup tab when close is cancelled', () => {
    assert.match(hmiSetupUiJs, /if \(!discard\) return false;/);
    assert.match(appJs, /closeSetupPopup/);
    assert.match(appJs, /closed !== false/);
  });
});
