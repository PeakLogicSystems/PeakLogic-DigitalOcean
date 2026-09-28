'use strict';

require('./preload-config-memory');

const path = require('path');
const os = require('os');
const fs = require('fs');

const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-prog-load-'));
process.env.PEAKLOGIC_DATA = tmpData;

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    json(payload) {
      this.body = payload;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

function routeHandler(router, method, routePath) {
  const layer = router.stack.find((s) => s.route?.path === routePath && s.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${routePath} route exists`);
  return layer.route.stack[0].handle;
}

function makeDeps() {
  const tags = [];
  return {
    tagStore: {
      list: () => tags,
      replaceAll(next) {
        tags.length = 0;
        tags.push(...next);
      },
    },
    driverManager: {
      list: () => [],
      save: () => {},
      rebuild: async () => {},
      instances: new Map(),
    },
    scanEngine: {
      loadProgram() {
        return { ok: true, errors: [] };
      },
    },
  };
}

describe('programs load routes', () => {
  let createProgramRoutes;
  let programStore;
  let persistence;

  before(async () => {
    const configStore = require('../src/configStore');
    await configStore.init();
    createProgramRoutes = require('../src/api/routes/programs').createProgramRoutes;
    programStore = require('../src/programs/programStore');
    persistence = require('../src/persistence');
  });

  beforeEach(() => {
    persistence.writeJson('settings.json', { activeProgram: null });
    programStore.clearActive();
  });

  it('POST /programs/load returns source and sets active program', async () => {
    const rel = 'logic/27_alternator_2pump.st';
    assert.ok(programStore.programExists(rel), `${rel} must exist under st/`);

    const router = createProgramRoutes(makeDeps());
    const handler = routeHandler(router, 'post', '/programs/load');
    const req = { body: { path: rel, loadFixtures: false } };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.active, rel);
    assert.ok(res.body.source.includes('AltEnable(ALT1'), 'source should contain program text');
    assert.equal(programStore.activeRel(), rel);
  });

  it('POST /programs/load-fixtures sets active program and returns source', async () => {
    const rel = 'opta/01_i1_to_r1.st';
    assert.ok(programStore.programExists(rel), `${rel} must exist under st/`);

    const router = createProgramRoutes(makeDeps());
    const handler = routeHandler(router, 'post', '/programs/load-fixtures');
    const req = { body: { path: rel } };
    const res = mockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.active, rel);
    assert.equal(programStore.activeRel(), rel);
    assert.ok(res.body.source.includes('IsON(I1)'), 'source should contain program text');
    assert.ok(res.body.fixturesLoaded?.tagCount > 0);
  });
});
