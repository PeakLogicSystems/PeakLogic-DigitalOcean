'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('persistence writeJson', () => {
  it('writes and reads JSON with unique temp files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-persist-'));
    process.env.PEAKLOGIC_DATA = dir;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/persistence')];
    const persistence = require('../src/persistence');

    persistence.writeJson('_atomic-test.json', { devices: { a: { deviceId: 'a' } } });
    persistence.writeJson('_atomic-test.json', { devices: { b: { deviceId: 'b' } } });
    const out = persistence.readJson('_atomic-test.json', null);
    assert.equal(out.devices.b.deviceId, 'b');
    assert.ok(!fs.existsSync(path.join(dir, '_atomic-test.json.tmp')));

    delete process.env.PEAKLOGIC_DATA;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/persistence')];
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
