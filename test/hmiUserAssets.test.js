'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  sanitizeImportFilename,
  saveUserHmiAsset,
  listUserHmiAssets,
} = require('../src/hmi/hmiUserAssets');

describe('hmiUserAssets', () => {
  it('sanitizes import filenames', () => {
    assert.equal(sanitizeImportFilename('My Building.svg'), 'My_Building.svg');
    assert.equal(sanitizeImportFilename('../evil.png'), 'evil.png');
    assert.equal(sanitizeImportFilename('bad.exe'), null);
  });

  it('saves and lists user graphics', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-hmi-'));
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      const saved = saveUserHmiAsset(dir, 'bldg.svg', Buffer.from(svg));
      assert.equal(saved.ok, true);
      assert.match(saved.path, /^\/hmi\/user\//);
      const list = listUserHmiAssets(dir);
      assert.equal(list.length, 1);
      assert.equal(list[0].group, 'User imports');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
