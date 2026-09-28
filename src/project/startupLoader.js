'use strict';

const persistence = require('../persistence');
const projectStore = require('../project/projectStore');
const { apply } = require('../project/estFile');
const { normalizeStartup } = require('../settings/startupSettings');

/**
 * Load project/workspace per settings.startup before drivers connect.
 * @param {{ tagStore, driverManager, scanEngine, graphHistory }} deps
 */
async function applyStartupOnBoot(deps) {
  const settings = persistence.readJson('settings.json', {});
  const startup = normalizeStartup(settings.startup);
  const bootStartup = startup;
  const { tagStore, driverManager, scanEngine, graphHistory } = deps;

  async function restoreBootStartup() {
    const after = persistence.readJson('settings.json', {});
    after.startup = bootStartup;
    persistence.writeJson('settings.json', after);
    await persistence.flushConfig();
  }

  try {
    if (startup.mode === 'blank') {
      return { loaded: false, mode: 'blank' };
    }
    if (startup.mode === 'workspace') {
      const doc = persistence.readJson('workspace.est.json', null);
      if (!doc?.project) return { loaded: false, mode: 'workspace', reason: 'no workspace file' };
      await apply(doc, { tagStore, driverManager, scanEngine, persistence, graphHistory });
      await restoreBootStartup();
      return { loaded: true, mode: 'workspace', name: doc.project?.name };
    }
    if (startup.mode === 'saved_project') {
      const id = startup.projectId;
      if (!id) return { loaded: false, mode: 'saved_project', reason: 'no startup project selected — open System setup → General, choose Specific saved project, Apply' };
      const doc = await projectStore.loadProjectDoc(id);
      await apply(doc, { tagStore, driverManager, scanEngine, persistence, graphHistory }, { lastOpenedProjectId: id });
      const name = String(doc.project?.name || id).trim() || id;
      await rememberLastOpenedProject(id, name);
      await restoreBootStartup();
      return { loaded: true, mode: 'saved_project', id, name };
    }
    if (startup.mode === 'last_project') {
      const id = settings.project?.lastOpenedId;
      if (!id) return { loaded: false, mode: 'last_project', reason: 'no last project' };
      const doc = await projectStore.loadProjectDoc(id);
      await apply(doc, { tagStore, driverManager, scanEngine, persistence, graphHistory }, { lastOpenedProjectId: id });
      const name = String(doc.project?.name || id).trim() || id;
      await rememberLastOpenedProject(id, name);
      await restoreBootStartup();
      return { loaded: true, mode: 'last_project', id, name };
    }
  } catch (err) {
    console.warn('[startup]', err.message || err);
    return { loaded: false, mode: startup.mode, error: err.message || String(err) };
  }
  return { loaded: false, mode: startup.mode };
}

async function rememberLastOpenedProject(id, name) {
  if (!id) return;
  const settings = persistence.readJson('settings.json', {});
  const resolvedName = String(name || settings.project?.name || id).trim() || id;
  settings.project = {
    ...(settings.project || {}),
    lastOpenedId: id,
    name: resolvedName,
  };
  persistence.writeJson('settings.json', settings);
  await persistence.flushConfig();
}

module.exports = { applyStartupOnBoot, rememberLastOpenedProject };
