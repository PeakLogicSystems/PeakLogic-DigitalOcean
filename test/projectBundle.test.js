'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  packFacilityDraw,
  packEst,
  resolveImportPayload,
  isBundle,
  bundleFilename,
} = require('../src/project/projectBundle');
const { FACILITY_DRAW_FORMAT } = require('../facility-draw/src/facilityDrawFormat');
const { EST_FORMAT } = require('../src/project/estFile');

describe('projectBundle', () => {
  it('bundleFilename sanitizes names', () => {
    assert.equal(bundleFilename('DWTS Site'), 'DWTS_Site.mvbundle');
  });

  it('packFacilityDraw embeds background assets', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-bundle-'));
    const uploads = path.join(tmp, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    const png = path.join(uploads, 'plot.png');
    fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const readAsset = (ref) => {
      const base = path.basename(ref);
      const full = path.join(uploads, base);
      return fs.existsSync(full) ? fs.readFileSync(full) : null;
    };
    const writeAsset = (ref, buf) => {
      const base = path.basename(ref);
      fs.writeFileSync(path.join(uploads, base), buf);
      return `uploads/${base}`;
    };

    const doc = {
      format: FACILITY_DRAW_FORMAT,
      version: 1,
      name: 'site',
      units: 'ft',
      background: { type: 'image', path: 'uploads/plot.png', opacity: 0.5 },
      nodes: [],
      edges: [],
    };

    const bundle = packFacilityDraw(doc, {}, { readAsset });
    assert.equal(bundle.format, 'peaklogic-bundle');
    assert.equal(bundle.kind, 'facilitydraw');
    assert.equal(bundle.assets.length, 1);
    assert.equal(bundle.assets[0].ref, 'uploads/plot.png');

    const restored = resolveImportPayload(bundle, { writeAsset });
    assert.equal(restored.type, 'facilitydraw');
    assert.equal(restored.doc.background.path, 'uploads/plot.png');
    assert.ok(fs.existsSync(path.join(uploads, 'plot.png')));
  });

  it('packEst embeds facilityDraw assets from est doc', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-bundle-est-'));
    const uploads = path.join(tmp, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, 'bg.jpg'), Buffer.from('jpeg'));

    const readAsset = (ref) => fs.readFileSync(path.join(uploads, path.basename(ref)));
    const writeAsset = (ref, buf) => {
      fs.writeFileSync(path.join(uploads, path.basename(ref)), buf);
      return `uploads/${path.basename(ref)}`;
    };

    const est = {
      format: EST_FORMAT,
      version: 1,
      project: { name: 'demo' },
      tags: [],
      drivers: [],
      program: '(* *)',
      facilityDraw: {
        format: FACILITY_DRAW_FORMAT,
        version: 1,
        name: 'demo',
        units: 'ft',
        background: { type: 'image', path: 'uploads/bg.jpg' },
        nodes: [],
        edges: [],
      },
    };

    const bundle = packEst(est, { name: 'demo' }, { readAsset });
    assert.ok(isBundle(bundle));
    assert.equal(bundle.kind, 'est');
    assert.equal(bundle.assets.length, 1);

    const restored = resolveImportPayload(bundle, { writeAsset });
    assert.equal(restored.type, 'est');
    assert.equal(restored.doc.project.name, 'demo');
    assert.equal(restored.doc.facilityDraw.background.path, 'uploads/bg.jpg');
  });

  it('resolveImportPayload accepts legacy est and facilitydraw json', () => {
    const est = { format: EST_FORMAT, version: 1, tags: [] };
    const mv = { format: FACILITY_DRAW_FORMAT, version: 1, nodes: [], edges: [] };
    assert.equal(resolveImportPayload(est).type, 'est');
    assert.equal(resolveImportPayload(mv).type, 'facilitydraw');
  });
});
