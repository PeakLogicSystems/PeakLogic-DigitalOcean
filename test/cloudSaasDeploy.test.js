'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('cloud SaaS deploy assets', () => {
  it('includes start:saas, seed, and DO docs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts['start:saas']);
    assert.ok(pkg.scripts.seed);
    assert.ok(fs.existsSync(path.join(root, 'scripts/start-saas.js')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/seed-saas.js')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/create-saas-bundle.ps1')));
    assert.ok(fs.existsSync(path.join(root, 'docs/CLOUD_DEPLOY_DO.md')));
    assert.ok(fs.existsSync(path.join(root, 'docs/CLOUD_USER_GUIDE.md')));
  });

  it('peaklogic-saas.service uses root server.js', () => {
    const svc = fs.readFileSync(path.join(root, 'deploy/cloud/debian/peaklogic-saas.service'), 'utf8');
    assert.match(svc, /node server\.js/);
    assert.doesNotMatch(svc, /src\/server\.js/);
  });

  it('help.js documents cloud-deploy section', () => {
    const help = fs.readFileSync(path.join(root, 'public/js/help.js'), 'utf8');
    assert.match(help, /id: 'cloud-deploy'/);
    assert.match(help, /CLOUD_DEPLOY_DO/);
  });
});
