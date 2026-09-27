'use strict';

const programStore = require('../programs/programStore');
const mongoTagLogger = require('../logger/mongoTagLogger');
const { DEFAULT_SCAN_MS, MAX_TAGS } = require('../config');
const { defaultBlankHmi } = require('../hmi/hmiConfig');
const { defaultMongoLogger } = require('../settings/mongoLoggerSettings');
const { buildDefaultMemoryTags } = require('../tags/defaultMemoryTags');
const EST_FORMAT = 'peaklogic-est';
const EST_VERSION = 1;

const BLANK_PROGRAM = '(* New PeakLogic project *)\n';
const BLANK_ACTIVE_PROGRAM = 'logic/program.st';

function pack(deps, meta = {}) {
  const { tagStore, driverManager, persistence } = deps;
  return {
    format: EST_FORMAT,
    version: EST_VERSION,
    savedAt: new Date().toISOString(),
    project: { name: meta.name || 'untitled', ...meta },
    tags: tagStore.list(),
    drivers: driverManager.list(),
    program: programStore.readActive(),
    activeProgram: programStore.activeRel(),
    settings: persistence.readJson('settings.json', {}),
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
    if (raw.version !== EST_VERSION) {
      throw Object.assign(new Error(`Unsupported version ${raw.version}`), { status: 400 });
    }
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

function validate(doc) {
  if (!doc || typeof doc !== 'object') return 'Invalid JSON object';
  if (doc.format !== EST_FORMAT) return `Expected format "${EST_FORMAT}"`;
  if (doc.version !== EST_VERSION) return `Unsupported version ${doc.version}`;
  if (!Array.isArray(doc.tags)) return 'Missing tags array';
  if (doc.tags.length > MAX_TAGS) return `Tag limit ${MAX_TAGS} exceeded`;
  if (!Array.isArray(doc.drivers)) return 'Missing drivers array';
  if (typeof doc.program !== 'string') return 'Missing program string';
  return null;
}

function blankProjectDoc(name) {
  const projectName = String(name || 'untitled').trim() || 'untitled';
  return {
    format: EST_FORMAT,
    version: EST_VERSION,
    project: { name: projectName },
    tags: buildDefaultMemoryTags(),
    drivers: [],
    program: BLANK_PROGRAM,
    activeProgram: BLANK_ACTIVE_PROGRAM,
    settings: {
      scanMs: DEFAULT_SCAN_MS,
      graphMaxPoints: 600,
      graphPens: [],
      activeProgram: BLANK_ACTIVE_PROGRAM,
      hmi: defaultBlankHmi(),
      mongoLogger: defaultMongoLogger(),
    },
  };
}

function validateImport(doc) {
  if (!Array.isArray(doc.tags)) return 'Missing tags array';
  if (doc.tags.length > MAX_TAGS) return `Tag limit ${MAX_TAGS} exceeded`;
  if (doc.drivers != null && !Array.isArray(doc.drivers)) return 'Invalid drivers array';
  if (doc.program != null && typeof doc.program !== 'string') return 'Invalid program';
  return null;
}

async function apply(doc, deps) {
  const normalized = coerceImportDoc(doc);
  const err = validateImport(normalized);
  if (err) throw Object.assign(new Error(err), { status: 400 });
  const { tagStore, driverManager, scanEngine, persistence } = deps;

  if (normalized.tags != null) tagStore.replaceAll(normalized.tags);
  if (normalized.drivers != null) {
    driverManager.save(normalized.drivers);
    await driverManager.rebuild();
  }
  if (normalized.activeProgram) programStore.setActive(normalized.activeProgram);
  if (typeof normalized.program === 'string') {
    programStore.writeActive(normalized.program);
  }
  if (normalized.settings) {
    persistence.writeJson('settings.json', normalized.settings);
    const cfg = normalized.settings?.mongoLogger;
    if (cfg && typeof cfg === 'object' && cfg.uri) await mongoTagLogger.setConfig(cfg);
    else await mongoTagLogger.clearConfig();
  }
  scanEngine.loadSettings();
  if (scanEngine.running) scanEngine.loadProgram();
  return pack(deps, normalized.project || {});
}

module.exports = {
  EST_FORMAT,
  EST_VERSION,
  pack,
  validate,
  validateImport,
  coerceImportDoc,
  normalizeTagImport,
  blankProjectDoc,
  apply,
};
