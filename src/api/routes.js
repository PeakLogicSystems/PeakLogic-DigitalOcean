'use strict';

const persistence = require('../persistence');
const { moveOnce, moveReverse } = require('../drivers/modbusMove');

function createApiRoutes(deps) {
  const { tagStore, driverManager, scanEngine, graphHistory, sendJson } = deps;

  return [
    async function tags(req, res, ctx) {
      const { pathname, body } = ctx;
      if (pathname === '/api/tags' && req.method === 'GET') {
        sendJson(res, 200, { tags: tagStore.list(), count: tagStore.count(), max: 512 });
        return true;
      }
      if (pathname === '/api/tags' && req.method === 'PUT') {
        tagStore.replaceAll(body.tags || []);
        sendJson(res, 200, { ok: true, count: tagStore.count() });
        return true;
      }
      if (pathname === '/api/tags' && req.method === 'POST') {
        const t = tagStore.upsert(body);
        sendJson(res, 201, { tag: t });
        return true;
      }
      if (pathname.startsWith('/api/tags/') && req.method === 'DELETE') {
        const id = decodeURIComponent(pathname.slice('/api/tags/'.length));
        tagStore.remove(id);
        sendJson(res, 200, { ok: true });
        return true;
      }
      return false;
    },

    async function drivers(req, res, ctx) {
      const { pathname, body } = ctx;
      if (pathname === '/api/drivers' && req.method === 'GET') {
        sendJson(res, 200, { drivers: driverManager.list(), health: driverManager.health() });
        return true;
      }
      if (pathname === '/api/drivers' && req.method === 'PUT') {
        driverManager.save(body.drivers || []);
        await driverManager.rebuild();
        sendJson(res, 200, { ok: true });
        return true;
      }
      if (pathname === '/api/drivers/test' && req.method === 'POST') {
        const result = await driverManager.testConnection(body);
        sendJson(res, 200, { result });
        return true;
      }
      return false;
    },

    async function program(req, res, ctx) {
      const { pathname, body } = ctx;
      if (pathname === '/api/program' && req.method === 'GET') {
        sendJson(res, 200, { source: persistence.readText('program.st', '') });
        return true;
      }
      if (pathname === '/api/program' && req.method === 'PUT') {
        persistence.writeText('program.st', body.source || '');
        sendJson(res, 200, { ok: true });
        return true;
      }
      if (pathname === '/api/program/validate' && req.method === 'POST') {
        const src = body.source ?? persistence.readText('program.st', '');
        const r = scanEngine.validate(src);
        sendJson(res, 200, r);
        return true;
      }
      return false;
    },

    async function runtime(req, res, ctx) {
      const { pathname, body } = ctx;
      if (pathname === '/api/runtime/status' && req.method === 'GET') {
        sendJson(res, 200, scanEngine.status());
        return true;
      }
      if (pathname === '/api/runtime/start' && req.method === 'POST') {
        await scanEngine.start();
        sendJson(res, 200, scanEngine.status());
        return true;
      }
      if (pathname === '/api/runtime/stop' && req.method === 'POST') {
        scanEngine.stop();
        sendJson(res, 200, scanEngine.status());
        return true;
      }
      if (pathname === '/api/settings' && req.method === 'GET') {
        sendJson(res, 200, persistence.readJson('settings.json', { scanMs: 100, port: 3080 }));
        return true;
      }
      if (pathname === '/api/settings' && req.method === 'PUT') {
        persistence.writeJson('settings.json', body);
        scanEngine.loadSettings();
        sendJson(res, 200, { ok: true });
        return true;
      }
      return false;
    },

    async function exportImport(req, res, ctx) {
      const { pathname } = ctx;
      if (pathname === '/api/config/export' && req.method === 'GET') {
        const bundle = {
          tags: tagStore.list(),
          drivers: driverManager.list(),
          program: persistence.readText('program.st', ''),
          settings: persistence.readJson('settings.json', {}),
        };
        sendJson(res, 200, bundle);
        return true;
      }
      if (pathname === '/api/config/import' && req.method === 'POST') {
        const b = ctx.body;
        if (b.tags) tagStore.replaceAll(b.tags);
        if (b.drivers) {
          driverManager.save(b.drivers);
          await driverManager.rebuild();
        }
        if (b.program != null) persistence.writeText('program.st', b.program);
        if (b.settings) persistence.writeJson('settings.json', b.settings);
        sendJson(res, 200, { ok: true });
        return true;
      }
      return false;
    },

    async function debug(req, res, ctx) {
      const { pathname, body, url } = ctx;
      if (pathname === '/api/debug/force' && req.method === 'POST') {
        const t = tagStore.setForce(body.tagId, {
          forceInput: body.forceInput,
          forceOutput: body.forceOutput,
          forceValue: body.forceValue,
        });
        if (!t) {
          sendJson(res, 404, { error: 'Tag not found' });
          return true;
        }
        sendJson(res, 200, { tag: t });
        return true;
      }
      if (pathname === '/api/debug/force' && req.method === 'DELETE') {
        const tagId = url.searchParams.get('tagId');
        const which = url.searchParams.get('which') || null;
        const t = tagStore.clearForce(tagId, which);
        sendJson(res, 200, { tag: t });
        return true;
      }
      if (pathname === '/api/debug/forces' && req.method === 'GET') {
        const forced = tagStore.list().filter((t) => t.forceInput || t.forceOutput);
        sendJson(res, 200, { forces: forced });
        return true;
      }
      return false;
    },

    async function graph(req, res, ctx) {
      const { pathname, url } = ctx;
      if (pathname === '/api/graph/history' && req.method === 'GET') {
        const ids = (url.searchParams.get('tags') || '').split(',').filter(Boolean);
        const limit = parseInt(url.searchParams.get('limit') || '300', 10);
        sendJson(res, 200, { history: graphHistory.getHistory(ids, limit) });
        return true;
      }
      if (pathname === '/api/graph/clear' && req.method === 'POST') {
        graphHistory.clear(ctx.body?.tagId);
        sendJson(res, 200, { ok: true });
        return true;
      }
      return false;
    },

    async function modbus(req, res, ctx) {
      const { pathname, body } = ctx;
      if (pathname === '/api/modbus/move' && req.method === 'POST') {
        const fn = body.direction === 'tcp_to_rtu' ? moveReverse : moveOnce;
        const results = await fn(body);
        sendJson(res, 200, { ok: true, results });
        return true;
      }
      return false;
    },
  ];
}

module.exports = { createApiRoutes };
