'use strict';

const programStore = require('../programs/programStore');
const mongoTagLogger = require('../logger/mongoTagLogger');
const persistence = require('../persistence');
const { DEFAULT_SCAN_MS, MAX_TAGS, DEFAULT_MQTT_PARC_BROKER } = require('../config');
const { defaultBlankHmi, normalizeHmi } = require('../hmi/hmiConfig');
const { defaultMongoLogger } = require('../settings/mongoLoggerSettings');
const { normalizeStartup } = require('../settings/startupSettings');
const { syncAssistedLivingTags, normalizeAssistedLiving, patchAssistedLivingHmi } = require('../settings/assistedLivingSettings');
const { mergeDriverSecrets } = require('../drivers/driverConfig');
const {
  defaultMqttParcSettings,
  mergeMqttParcSettings,
  ensureMqttParcInSettings,
} = require('../parc/mqttParcBootstrap');
const path = require('path');
const PACKAGE_VERSION = require('../../package.json').version;
const PUBLIC_ROOT = path.join(__dirname, '../../public');
const { readActiveProject, writeActiveProject } = require('../../mv-draw/src/mvDrawStore');
const { normalizeMvDraw } = require('../../mv-draw/src/mvDrawFormat');
const EST_FORMAT = 'peaklogic-est';
const EST_VERSION = 1;
const ARCHIVE_FORMAT = 'peaklogic-est-archive';
const ARCHIVE_VERSION = 1;

const BLANK_PROGRAM = '(* New PeakLogic project — load an ST program or write logic here *)\n';
const BLANK_ACTIVE_PROGRAM = '';
const REMOTE_DRIVER_TYPES = new Set(['mqtt_parc', 'opta_remote']);

/** Keep mqtt_parc/opta_remote drivers when workspace/project snapshot is stale. */
function mergeRemoteDrivers(incoming, current) {
  if (!Array.isArray(incoming)) return incoming;
  const ids = new Set(incoming.map((d) => d.id));
  const extra = (current || []).filter(
    (d) => REMOTE_DRIVER_TYPES.has(d.type) && d.enabled !== false && !ids.has(d.id),
  );
  return extra.length ? [...incoming, ...extra] : incoming;
}

/** Update workspace.est.json drivers when drivers change outside an explicit workspace save. */
function patchWorkspaceDrivers(drivers) {
  const ws = persistence.readJson('workspace.est.json', null);
  if (!ws || ws.format !== EST_FORMAT || !Array.isArray(ws.drivers)) return false;
  ws.drivers = drivers;
  ws.savedAt = new Date().toISOString();
  persistence.writeJson('workspace.est.json', ws);
  return true;
}

/** Keep the open library project (.est.zip) in sync when drivers change (e.g. NextCentury password). */
async function patchActiveProjectDrivers(drivers) {
  const settings = persistence.readJson('settings.json', {});
  const id = settings.project?.lastOpenedId;
  if (!id) return false;
  try {
    const projectStore = require('./projectStore');
    const doc = projectStore.loadProjectDoc(id);
    if (!doc || !Array.isArray(doc.drivers)) return false;
    doc.drivers = drivers;
    doc.savedAt = new Date().toISOString();
    projectStore.saveProjectDoc(id, doc);
    return true;
  } catch (e) {
    console.warn('[project] patch drivers:', e.message || e);
    return false;
  }
}

function pack(deps, meta = {}) {
  const { tagStore, driverManager, persistence } = deps;
  const settings = persistence.readJson('settings.json', {});
  const projectName = String(meta.name || meta.project?.name || settings.project?.name || 'untitled').trim()
    || 'untitled';
  const { startup: _omitStartup, ...settingsForSnapshot } = settings;
  const mvDraw = readActiveProject();
  return {
    format: EST_FORMAT,
    version: EST_VERSION,
    savedAt: new Date().toISOString(),
    exportedBy: PACKAGE_VERSION,
    appVersion: PACKAGE_VERSION,
    project: { ...meta, name: projectName },
    tags: tagStore.list(),
    drivers: driverManager.list(),
    program: programStore.readActive(),
    activeProgram: programStore.activeRel(),
    mvDraw,
    settings: {
      ...settingsForSnapshot,
      project: { ...(settings.project || {}), name: projectName },
    },
  };
}

/** Map legacy est export / fixture fields onto current tag shape. */
function mapLegacyRole(tag) {
  if (tag.role) return tag.role;
  const d = String(tag.direction || '').toLowerCase();
  if (d === 'input' || d === 'in') return 'input';
  if (d === 'output' || d === 'out') return 'output';
  if (d === 'memory' || d === 'mem') return 'memory';
  if (d === 'fb') return 'fb';
  return null;
}

function normalizeTagImport(tag) {
  const role = mapLegacyRole(tag) || 'memory';
  let type = String(tag.type || 'BOOL');
  if (/^bool$/i.test(type)) type = 'BOOL';
  else if (/^int$/i.test(type)) type = 'INT';
  else if (/^real$/i.test(type) || /^float$/i.test(type)) type = 'REAL';
  else type = type.toUpperCase();
  return { ...tag, type, role };
}

/**
 * Accept peaklogic-est, est config bundles ({ tags, drivers, program }), or a bare tags array.
 * @returns {object} normalized import document; null fields mean "do not replace this section"
 */
function coerceImportDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw Object.assign(new Error('Invalid JSON object'), { status: 400 });
  }
  if (Array.isArray(raw)) {
    return {
      format: EST_FORMAT,
      version: EST_VERSION,
      project: { name: 'imported' },
      tags: raw.map(normalizeTagImport),
      drivers: null,
      program: null,
      activeProgram: null,
      settings: null,
    };
  }
  if (raw.format === EST_FORMAT) {
    return {
      ...raw,
      tags: Array.isArray(raw.tags) ? raw.tags.map(normalizeTagImport) : [],
      drivers: Array.isArray(raw.drivers) ? raw.drivers : null,
      program: typeof raw.program === 'string' ? raw.program : null,
    };
  }
  const hasTags = Array.isArray(raw.tags);
  const hasDrivers = Array.isArray(raw.drivers);
  const hasProgram = typeof raw.program === 'string';
  if (hasTags || hasDrivers || hasProgram) {
    return {
      format: EST_FORMAT,
      version: EST_VERSION,
      savedAt: raw.savedAt,
      project: raw.project || { name: raw.name || 'imported' },
      tags: hasTags ? raw.tags.map(normalizeTagImport) : null,
      drivers: hasDrivers ? raw.drivers : null,
      program: hasProgram ? raw.program : null,
      activeProgram: raw.activeProgram,
      settings: raw.settings,
    };
  }
  throw Object.assign(
    new Error(`Expected "${EST_FORMAT}" or JSON with tags, drivers, and/or program`),
    { status: 400 }
  );
}

function exportFilename(name) {
  const base = String(name || 'project').trim().replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'project';
  return `${base}.est.json`;
}

/** Upgrade imported snapshots to the current format version. */
function upgradeEstDocument(doc) {
  const warnings = [];
  const rawVersion = doc.version;
  const hasExplicitVersion = rawVersion !== undefined && rawVersion !== null && rawVersion !== '';
  const sourceVersion = hasExplicitVersion ? Number(rawVersion) : EST_VERSION;
  const version = Number.isFinite(sourceVersion) ? sourceVersion : EST_VERSION;
  if (doc.format === EST_FORMAT && hasExplicitVersion && version !== EST_VERSION) {
    if (version > EST_VERSION) {
      warnings.push(
        `Project format version ${version} is newer than this PeakLogic (format v${EST_VERSION}). Unknown fields may be ignored.`,
      );
    } else {
      warnings.push(`Upgraded project from format version ${version} to ${EST_VERSION}.`);
    }
  }
  const exportedBy = doc.exportedBy || doc.appVersion;
  if (exportedBy && exportedBy !== PACKAGE_VERSION) {
    warnings.push(`Project was exported from PeakLogic ${exportedBy}; this copy is ${PACKAGE_VERSION}.`);
  }

  const out = { ...doc, version: EST_VERSION };
  if (Array.isArray(out.tags)) out.tags = out.tags.map(normalizeTagImport);
  if (out.settings?.assistedLiving) {
    out.settings = {
      ...out.settings,
      assistedLiving: normalizeAssistedLiving(out.settings.assistedLiving),
    };
  }
  return { doc: out, warnings };
}

function migrateImportDoc(raw) {
  return upgradeEstDocument(coerceImportDoc(raw));
}

function validate(doc) {
  if (!doc || typeof doc !== 'object') return 'Invalid JSON object';
  let migrated;
  try {
    migrated = migrateImportDoc(doc).doc;
  } catch (e) {
    return e.message || String(e);
  }
  if (migrated.format !== EST_FORMAT) return `Expected format "${EST_FORMAT}"`;
  if (!Array.isArray(migrated.tags)) return 'Missing tags array';
  if (migrated.tags.length > MAX_TAGS) return `Tag limit ${MAX_TAGS} exceeded`;
  if (isProjectSnapshot(migrated)) {
    if (!Array.isArray(migrated.drivers)) return 'Missing drivers array';
  }
  return null;
}

function blankProjectDoc(name) {
  const projectName = String(name || 'untitled').trim() || 'untitled';
  return {
    format: EST_FORMAT,
    version: EST_VERSION,
    project: { name: projectName },
    tags: [],
    drivers: [],
    program: BLANK_PROGRAM,
    activeProgram: null,
    settings: {
      project: { name: projectName },
      scanMs: DEFAULT_SCAN_MS,
      graphMaxPoints: 600,
      graphPens: [],
      activeProgram: null,
      hmi: defaultBlankHmi(),
      mongoLogger: defaultMongoLogger(),
      remoteExecution: false,
      mqttParc: {
        enabled: true,
        brokerUrl: DEFAULT_MQTT_PARC_BROKER,
        topicPrefix: 'peaklogic/v1',
      },
    },
  };
}

function isProjectSnapshot(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  return d.format === EST_FORMAT
    && Array.isArray(d.tags)
    && Array.isArray(d.drivers)
    && d.settings != null && typeof d.settings === 'object';
}

function validateImport(doc) {
  if (!Array.isArray(doc.tags)) return 'Missing tags array';
  if (doc.tags.length > MAX_TAGS) return `Tag limit ${MAX_TAGS} exceeded`;
  if (doc.drivers != null && !Array.isArray(doc.drivers)) return 'Invalid drivers array';
  if (doc.program != null && typeof doc.program !== 'string') return 'Invalid program';
  return null;
}

async function apply(doc, deps, opts = {}) {
  const { doc: normalized, warnings } = migrateImportDoc(doc);
  const err = validateImport(normalized);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const { tagStore, driverManager, scanEngine, persistence, graphHistory } = deps;
  const snapshot = isProjectSnapshot(normalized);
  const isReset = opts.reset === true;

  if (snapshot && scanEngine.running) await scanEngine.stop();

  if (normalized.tags != null) {
    tagStore.replaceAll(normalized.tags, {
      keepForces: !snapshot,
      clearAlarms: snapshot,
    });
    syncAssistedLivingTags(tagStore, normalized.settings?.assistedLiving);
  }
  if (normalized.drivers != null) {
    const existing = driverManager.list();
    const withSecrets = isReset
      ? normalized.drivers
      : mergeDriverSecrets(normalized.drivers, existing);
    const drivers = (isReset || snapshot)
      ? withSecrets
      : mergeRemoteDrivers(withSecrets, existing);
    driverManager.save(drivers);
    await driverManager.rebuild({ connectDeferred: true });
  }
  const archivePrograms = opts.programs && typeof opts.programs === 'object' ? opts.programs : null;
  const prevSettings = persistence.readJson('settings.json', {});
  const hadExplicitPrevActive = Object.prototype.hasOwnProperty.call(prevSettings, 'activeProgram');
  let activeRel = '';
  if (archivePrograms && Object.keys(archivePrograms).length) {
    const manifestActive = programStore.sanitizeRel(
      opts.programsManifest?.active || normalized.activeProgram || '',
    );
    for (const [relPath, source] of Object.entries(archivePrograms)) {
      programStore.writeProgram(relPath, source);
    }
    if (manifestActive && archivePrograms[manifestActive] != null) {
      activeRel = programStore.setActive(manifestActive);
    } else if (normalized.activeProgram) {
      activeRel = programStore.setActive(normalized.activeProgram);
    } else {
      const first = Object.keys(archivePrograms).sort()[0];
      activeRel = first ? programStore.setActive(first) : programStore.clearActive();
    }
  } else if (isReset) {
    programStore.clearActive();
    activeRel = '';
  } else if (typeof prevSettings.activeProgram === 'string' && prevSettings.activeProgram) {
    activeRel = programStore.sanitizeRel(prevSettings.activeProgram);
  } else if (prevSettings.activeProgram === null || prevSettings.activeProgram === '') {
    activeRel = '';
  } else if (!hadExplicitPrevActive) {
    activeRel = programStore.activeRel();
  }
  if (!isReset && !archivePrograms) {
    const snapActive = (typeof normalized.activeProgram === 'string' && normalized.activeProgram)
      ? normalized.activeProgram
      : ((typeof normalized.settings?.activeProgram === 'string' && normalized.settings.activeProgram)
        ? normalized.settings.activeProgram
        : null);
    const snapClearsActive = normalized.activeProgram === null
      || normalized.activeProgram === ''
      || normalized.settings?.activeProgram === null
      || normalized.settings?.activeProgram === '';
    if (snapActive) {
      activeRel = programStore.setActive(snapActive);
    } else if (snapClearsActive) {
      if (typeof prevSettings.activeProgram === 'string' && prevSettings.activeProgram) {
        activeRel = programStore.setActive(prevSettings.activeProgram);
      } else if (snapshot || !hadExplicitPrevActive || prevSettings.activeProgram == null || prevSettings.activeProgram === '') {
        programStore.clearActive();
        activeRel = '';
      }
    } else if (prevSettings.activeProgram) {
      activeRel = programStore.setActive(prevSettings.activeProgram);
    }
    if (typeof normalized.program === 'string' && activeRel && (!snapClearsActive || snapActive)) {
      programStore.writeProgram(activeRel, normalized.program);
    }
  }
  if (opts.prunePrograms) {
    programStore.pruneProgramsExcept(activeRel);
  }
  if (normalized.settings) {
    const projectName = String(
      normalized.project?.name || normalized.settings?.project?.name || 'untitled',
    ).trim() || 'untitled';
    const prev = persistence.readJson('settings.json', {});
    const { startup: _embeddedStartup, ...restSettings } = normalized.settings;
    if (restSettings.hmi) {
      const { ensureHvacSplitHmi } = require('../hmi/hvacSplitScreen');
      const { ensureDuplexlsScreen2 } = require('../hmi/duplexlsScreen');
      let hmi = patchAssistedLivingHmi(restSettings.hmi);
      hmi = ensureHvacSplitHmi(hmi, projectName);
      hmi = ensureDuplexlsScreen2(hmi, PUBLIC_ROOT, projectName);
      restSettings.hmi = normalizeHmi(hmi, normalized.tags || [], PUBLIC_ROOT);
    }
    const settings = {
      ...restSettings,
      project: isReset
        ? { name: projectName, lastOpenedId: null }
        : {
          ...(normalized.settings.project || {}),
          name: projectName,
        },
      /** Boot/open project preference lives in settings.json — not overwritten by snapshot embed */
      startup: normalizeStartup(prev.startup || _embeddedStartup, prev.startup),
    };
    settings.mqttParc = isReset
      ? defaultMqttParcSettings(normalized.settings.mqttParc || {})
      : mergeMqttParcSettings(settings.mqttParc, prev.mqttParc);
    if (!isReset && settings.remoteExecution !== true && prev.remoteExecution === true) {
      settings.remoteExecution = prev.remoteExecution;
    }
    /** Boot preference — not overwritten by workspace/project snapshot embed */
    if (!isReset) {
      if (prev.autoStartRuntime === true) {
        settings.autoStartRuntime = true;
      } else if (prev.autoStartRuntime === false && settings.autoStartRuntime !== true) {
        settings.autoStartRuntime = false;
      }
    }
    if (isReset) {
      settings.activeProgram = null;
    } else if (!settings.activeProgram && activeRel) {
      settings.activeProgram = activeRel;
    } else if (!settings.activeProgram && prev.activeProgram) {
      settings.activeProgram = prev.activeProgram;
    }
    if (!isReset && opts.lastOpenedProjectId) {
      settings.project.lastOpenedId = opts.lastOpenedProjectId;
    }
    const ensured = ensureMqttParcInSettings(settings, driverManager.list());
    persistence.writeJson('settings.json', ensured.settings);
    syncAssistedLivingTags(tagStore, ensured.settings?.assistedLiving);
    const cfg = normalized.settings?.mongoLogger;
    if (cfg && typeof cfg === 'object' && cfg.uri) await mongoTagLogger.setConfig(cfg);
    else await mongoTagLogger.clearConfig();
  }
  if (normalized.mvDraw) {
    writeActiveProject(normalizeMvDraw(normalized.mvDraw, {
      name: normalized.project?.name || normalized.settings?.project?.name,
    }));
  }
  if (snapshot) {
    if (graphHistory) graphHistory.clear();
    scanEngine._programTrace = [];
    if (scanEngine._oneShotFired) scanEngine._oneShotFired.clear();
    scanEngine.errors = [];
    persistence.writeJson('project.est.json', pack(deps, normalized.project || {}));
  }
  scanEngine.loadSettings();
  scanEngine.loadProgram();
  const packed = pack(deps, normalized.project || {});
  if (warnings.length) packed.importWarnings = warnings;
  return packed;
}

function packProjectDoc(deps, meta = {}) {
  return pack(deps, meta);
}

async function applyProjectDoc(doc, deps, opts = {}) {
  return apply(doc, deps, opts);
}

module.exports = {
  EST_FORMAT,
  EST_VERSION,
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  PACKAGE_VERSION,
  pack,
  packProjectDoc,
  validate,
  validateImport,
  coerceImportDoc,
  migrateImportDoc,
  upgradeEstDocument,
  exportFilename,
  normalizeTagImport,
  blankProjectDoc,
  isProjectSnapshot,
  mergeRemoteDrivers,
  patchWorkspaceDrivers,
  patchActiveProjectDrivers,
  apply,
  applyProjectDoc,
};
