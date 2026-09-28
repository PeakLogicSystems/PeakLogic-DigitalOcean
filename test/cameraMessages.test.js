'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CAMERA_SYSTEM_DISABLED_MSG,
  isCameraSystemDisabledMessage,
} = require('../src/cameras/cameraMessages');

describe('cameraMessages', () => {
  it('uses the Cameras admin path, not Tools', () => {
    assert.match(CAMERA_SYSTEM_DISABLED_MSG, /Cameras → Administration/);
    assert.doesNotMatch(CAMERA_SYSTEM_DISABLED_MSG, /Tools → Cameras/);
  });

  it('detects disabled-message variants', () => {
    assert.equal(isCameraSystemDisabledMessage(CAMERA_SYSTEM_DISABLED_MSG), true);
    assert.equal(isCameraSystemDisabledMessage('Camera system is disabled (Tools → Cameras → Settings).'), true);
    assert.equal(isCameraSystemDisabledMessage('Network timeout'), false);
  });

  it('api route returns the shared disabled message', () => {
    const routeJs = fs.readFileSync(
      path.join(__dirname, '../src/api/routes/cameras.js'),
      'utf8',
    );
    assert.match(routeJs, /CAMERA_SYSTEM_DISABLED_MSG/);
    assert.doesNotMatch(routeJs, /Tools → Cameras/);
  });

  it('camera disabled guard applies only to camera API paths', () => {
    const routeJs = fs.readFileSync(
      path.join(__dirname, '../src/api/routes/cameras.js'),
      'utf8',
    );
    assert.match(routeJs, /function isCameraApiPath/);
    assert.match(routeJs, /if \(!isCameraApiPath\(req\.path\)\) return next\(\)/);
  });
});
