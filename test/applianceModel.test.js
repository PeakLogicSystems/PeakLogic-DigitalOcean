'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('appliance model', () => {
  it('defines profiles and build script', () => {
    assert.ok(fs.existsSync(path.join(root, 'deploy/appliance/profiles/mvp-suite.json')));
    assert.ok(fs.existsSync(path.join(root, 'deploy/appliance/profiles/iot-link-generic.json')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/build-appliance.ps1')));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts['build:appliance:pc']);
    assert.ok(pkg.scripts['build:appliance:iot-link']);
  });
});
