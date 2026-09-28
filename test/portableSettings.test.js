'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  stripLegacyProjectHwDefaults,
  sanitizePortableSettingsFile,
} = require('../src/settings/portableSettings');
const { mergePortableSettings } = require('../src/project/estFile');

describe('portableSettings', () => {
  it('stripLegacyProjectHwDefaults removes settings.defaults', () => {
    const out = stripLegacyProjectHwDefaults({
      scanMs: 100,
      defaults: { serialPort: 'COM3', baud: 9600, slaveId: 1 },
      project: { name: 'demo' },
    });
    assert.equal(out.defaults, undefined);
    assert.equal(out.scanMs, 100);
    assert.equal(out.project.name, 'demo');
  });

  it('stripLegacyProjectHwDefaults is a no-op when defaults absent', () => {
    const input = { scanMs: 50 };
    assert.equal(stripLegacyProjectHwDefaults(input), input);
  });

  it('mergePortableSettings strips imported defaults', () => {
    const out = mergePortableSettings({
      defaults: { serialPort: 'COM9' },
      scanMs: 75,
    });
    assert.equal(out.defaults, undefined);
    assert.equal(out.scanMs, 75);
  });

  it('sanitizePortableSettingsFile rewrites settings.json when defaults present', () => {
    const persistence = {
      _json: {
        'settings.json': {
          scanMs: 100,
          defaults: { serialPort: 'COM3' },
        },
      },
      readJson(file, d) {
        return this._json[file] ?? d;
      },
      writeJson(file, v) {
        this._json[file] = v;
      },
    };
    assert.equal(sanitizePortableSettingsFile(persistence), true);
    assert.equal(persistence._json['settings.json'].defaults, undefined);
    assert.equal(sanitizePortableSettingsFile(persistence), false);
  });
});
