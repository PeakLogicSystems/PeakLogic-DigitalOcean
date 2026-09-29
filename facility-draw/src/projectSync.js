'use strict';

const persistence = require('../../src/persistence');
const { exportFilename, EST_FORMAT } = require('../../src/project/estFile');
const { normalizeHmi } = require('../../src/hmi/hmiConfig');
const { normalizeFacilityDraw } = require('./facilityDrawFormat');
const {
  compileFacilityDrawToHmi,
  mergeCompiledHmiIntoSettings,
} = require('./facilityDrawToHmi');
const {
  readActiveProject,
  writeActiveProject,
  saveNamedProject,
} = require('./facilityDrawStore');

const DEFAULT_FACILITY_PLAN_URL = '/facility-draw?embedded=1';
const PUBLIC_ROOT = require('path').join(__dirname, '../../public');

function readEstSnapshot() {
  const projectEst = persistence.readJson('project.est.json', null);
  if (projectEst?.format === EST_FORMAT) return projectEst;
  const workspaceEst = persistence.readJson('workspace.est.json', null);
  if (workspaceEst?.format === EST_FORMAT) return workspaceEst;
  return projectEst || workspaceEst || null;
}

function buildPeaklogicProjectContext(settings, estSnapshot, activeFacilityDraw) {
  const projectName = String(settings?.project?.name || 'untitled').trim() || 'untitled';
  const estPath = `data/projects/${exportFilename(projectName)}`;
  const facilityDraw = estSnapshot?.facilityDraw || null;
  const synced = String(activeFacilityDraw?.meta?.peaklogicProject || '').trim() === projectName;
  return {
    projectName,
    lastOpenedId: settings?.project?.lastOpenedId || null,
    estPath,
    projectSavedAt: estSnapshot?.savedAt || null,
    hasProjectFacilityDraw: !!(facilityDraw && (facilityDraw.nodes?.length || facilityDraw.background || facilityDraw.scale)),
    facilityDrawSavedAt: facilityDraw?.savedAt || null,
    synced,
    composer: {
      composerMode: settings?.hmi?.layout?.composerMode || 'grid',
      facilityPlanUrl: settings?.hmi?.layout?.facilityPlanUrl || null,
      facility3dUrl: settings?.hmi?.layout?.facility3dUrl || null,
    },
  };
}

function readPeaklogicProjectContext() {
  const settings = persistence.readJson('settings.json', {});
  const est = readEstSnapshot();
  return buildPeaklogicProjectContext(settings, est, readActiveProject());
}

function integrationLibraryFileBase(context, doc) {
  const existing = String(doc?.libraryFile || '').replace(/\.facilitydraw\.json$/i, '').trim();
  if (existing) return existing;
  return String(context?.projectName || 'untitled').trim().replace(/[^\w.-]+/g, '_').slice(0, 80) || 'untitled';
}

function alignFacilityDrawForPeaklogicProject(doc, context, settings = {}) {
  const projectName = String(context?.projectName || 'untitled').trim() || 'untitled';
  const site = String(settings?.project?.site || doc?.meta?.site || '').trim();
  const client = String(settings?.project?.client || doc?.meta?.client || '').trim();
  return normalizeFacilityDraw({ ...doc, name: projectName }, {
    name: projectName,
    site,
    client,
    peaklogicProject: projectName,
  });
}

function patchEstSnapshotsWithFacilityDraw(facilityDrawDoc) {
  const facilityDraw = normalizeFacilityDraw(facilityDrawDoc);
  const stamp = new Date().toISOString();
  const touched = [];
  for (const file of ['project.est.json', 'workspace.est.json']) {
    const est = persistence.readJson(file, null);
    if (!est || est.format !== EST_FORMAT) continue;
    est.facilityDraw = facilityDraw;
    est.savedAt = stamp;
    persistence.writeJson(file, est);
    touched.push(file);
  }
  return touched;
}

function linkComposerToPlan(settings, options = {}) {
  const linkComposer = options.linkComposer !== false;
  if (!linkComposer) return settings;
  const prev = settings && typeof settings === 'object' ? settings : {};
  const hmi = prev.hmi && typeof prev.hmi === 'object' ? { ...prev.hmi } : {};
  const layout = hmi.layout && typeof hmi.layout === 'object' ? { ...hmi.layout } : {};
  const planUrl = String(options.facilityPlanUrl || DEFAULT_FACILITY_PLAN_URL).trim()
    || DEFAULT_FACILITY_PLAN_URL;
  layout.facilityPlanUrl = planUrl;
  if (options.setComposerMode !== false && String(layout.composerMode || 'grid').toLowerCase() === 'grid') {
    layout.composerMode = 'plan';
  }
  hmi.layout = layout;
  const tagList = [];
  const next = { ...prev, hmi: normalizeHmi(hmi, tagList, PUBLIC_ROOT) };
  persistence.writeJson('settings.json', next);
  return next;
}

function linkComposerTo3d(settings, facility3dUrl, options = {}) {
  const prev = settings && typeof settings === 'object' ? settings : {};
  const hmi = prev.hmi && typeof prev.hmi === 'object' ? { ...prev.hmi } : {};
  const layout = hmi.layout && typeof hmi.layout === 'object' ? { ...hmi.layout } : {};
  const url = String(facility3dUrl || '').trim();
  if (url) layout.facility3dUrl = url;
  if (options.setComposerMode !== false) layout.composerMode = '3d';
  hmi.layout = layout;
  const tagList = [];
  const next = { ...prev, hmi: normalizeHmi(hmi, tagList, PUBLIC_ROOT) };
  persistence.writeJson('settings.json', next);
  return next;
}

function saveFacilityDrawToPeaklogicProject(doc, options = {}) {
  const context = readPeaklogicProjectContext();
  const settings = persistence.readJson('settings.json', {});
  const aligned = alignFacilityDrawForPeaklogicProject(doc || readActiveProject(), context, settings);
  const fileBase = integrationLibraryFileBase(context, aligned);
  const { project, file } = saveNamedProject(fileBase, aligned, { alignProjectName: true });
  writeActiveProject(project);
  const estTouched = patchEstSnapshotsWithFacilityDraw(project);
  const nextSettings = linkComposerToPlan(settings, options);
  return {
    project,
    file,
    context: buildPeaklogicProjectContext(nextSettings, readEstSnapshot(), project),
    estPath: context.estPath,
    estTouched,
    facilityPlanUrl: nextSettings.hmi?.layout?.facilityPlanUrl || null,
    composerMode: nextSettings.hmi?.layout?.composerMode || 'grid',
  };
}

function loadFacilityDrawFromPeaklogicProject() {
  const est = readEstSnapshot();
  if (!est?.facilityDraw) {
    throw Object.assign(new Error('No site plan in the open PeakLogic project'), { status: 404 });
  }
  const context = readPeaklogicProjectContext();
  const settings = persistence.readJson('settings.json', {});
  const aligned = alignFacilityDrawForPeaklogicProject(est.facilityDraw, context, settings);
  const fileBase = integrationLibraryFileBase(context, aligned);
  const { project, file } = saveNamedProject(fileBase, aligned, { alignProjectName: true });
  const saved = writeActiveProject(project);
  return {
    project: saved,
    file,
    context: buildPeaklogicProjectContext(settings, est, saved),
    estPath: context.estPath,
  };
}

function shouldAutoLoadFromProject(context, activeProject) {
  if (!context?.hasProjectFacilityDraw) return false;
  const nodes = activeProject?.nodes || [];
  const name = String(activeProject?.name || '').trim().toLowerCase();
  const isBlank = nodes.length === 0 && !activeProject?.background && !activeProject?.scale;
  const isUntitled = !name || name === 'untitled';
  const alreadySynced = context.synced;
  return isBlank && isUntitled && !alreadySynced;
}

async function saveFacilityDrawToProjectLibrary() {
  const settings = persistence.readJson('settings.json', {});
  const id = settings.project?.lastOpenedId;
  if (!id) return null;
  const est = persistence.readJson('project.est.json', null);
  if (!est || est.format !== EST_FORMAT) return null;
  const projectStore = require('../../src/project/projectStore');
  const saved = await projectStore.saveProjectDoc(id, est);
  return saved?.id || id;
}

function applyFacilityDrawHmiCompile(doc, compiled, options = {}) {
  const publicRoot = options.publicRoot || PUBLIC_ROOT;
  const settings = persistence.readJson('settings.json', {});
  const est = readEstSnapshot();
  const tags = est?.tags || settings.tags || [];
  const nextSettings = mergeCompiledHmiIntoSettings(settings, compiled, publicRoot, tags);
  persistence.writeJson('settings.json', nextSettings);
  const normalizedScreenId = nextSettings.hmi?.layout?.areaPopupScreens?.slice(-1)[0]
    || nextSettings.hmi?.screens?.slice(-1)[0]?.id
    || compiled.screen.id;
  if (est?.format === EST_FORMAT) {
    est.settings = est.settings || {};
    est.settings.hmi = nextSettings.hmi;
    if (doc) est.facilityDraw = normalizeFacilityDraw(doc);
    est.savedAt = new Date().toISOString();
    persistence.writeJson('project.est.json', est);
    const workspace = persistence.readJson('workspace.est.json', null);
    if (workspace?.format === EST_FORMAT) {
      workspace.settings = workspace.settings || {};
      workspace.settings.hmi = nextSettings.hmi;
      if (doc) workspace.facilityDraw = normalizeFacilityDraw(doc);
      workspace.savedAt = est.savedAt;
      persistence.writeJson('workspace.est.json', workspace);
    }
  }
  return {
    settings: nextSettings,
    screenId: normalizedScreenId,
    stats: compiled.stats,
    warnings: compiled.warnings,
  };
}

function compileAndApplyFacilityDrawHmi(doc, options = {}) {
  const publicRoot = options.publicRoot || PUBLIC_ROOT;
  const compiled = compileFacilityDrawToHmi(doc || readActiveProject(), {
    ...options,
    publicRoot,
  });
  if (!compiled.stats.nodesCompiled) {
    throw Object.assign(new Error('No compilable Facility Builder symbols with SCADA meta found'), { status: 400 });
  }
  return {
    compiled,
    applied: applyFacilityDrawHmiCompile(doc, compiled, { publicRoot }),
  };
}

module.exports = {
  DEFAULT_FACILITY_PLAN_URL,
  buildPeaklogicProjectContext,
  readPeaklogicProjectContext,
  alignFacilityDrawForPeaklogicProject,
  patchEstSnapshotsWithFacilityDraw,
  linkComposerToPlan,
  linkComposerTo3d,
  saveFacilityDrawToPeaklogicProject,
  loadFacilityDrawFromPeaklogicProject,
  shouldAutoLoadFromProject,
  saveFacilityDrawToProjectLibrary,
  applyFacilityDrawHmiCompile,
  compileAndApplyFacilityDrawHmi,
};
