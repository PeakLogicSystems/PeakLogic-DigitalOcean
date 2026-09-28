'use strict';

/** Drop legacy project-level RTU defaults (serialPort/baud/slaveId) — connection belongs on drivers. */
function stripLegacyProjectHwDefaults(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  if (!Object.prototype.hasOwnProperty.call(settings, 'defaults')) return settings;
  const next = { ...settings };
  delete next.defaults;
  return next;
}

/** Strip legacy settings.defaults from an EST snapshot JSON file. */
function sanitizeEstSnapshotFile(persistence, file) {
  const prev = persistence.readJson(file, null);
  if (!prev?.settings || typeof prev.settings !== 'object') return false;
  const settings = stripLegacyProjectHwDefaults(prev.settings);
  if (settings === prev.settings) return false;
  persistence.writeJson(file, { ...prev, settings });
  return true;
}

/** Remove legacy defaults from settings.json on disk when present. */
function sanitizePortableSettingsFile(persistence, file = 'settings.json') {
  const prev = persistence.readJson(file, null);
  if (!prev || typeof prev !== 'object') return false;
  const next = stripLegacyProjectHwDefaults(prev);
  if (next === prev) return false;
  persistence.writeJson(file, next);
  return true;
}

/** @deprecated use sanitizeEstSnapshotFile */
function sanitizeWorkspaceEstFile(persistence, file = 'workspace.est.json') {
  return sanitizeEstSnapshotFile(persistence, file);
}

/** Sanitize live data files that may still carry legacy project RTU defaults. */
async function sanitizeLegacyProjectHwDefaultsOnDisk(persistence) {
  let changed = sanitizePortableSettingsFile(persistence);
  for (const file of ['workspace.est.json', 'project.est.json']) {
    if (sanitizeEstSnapshotFile(persistence, file)) changed = true;
  }
  if (changed) await persistence.flushConfig();
  return changed;
}

module.exports = {
  stripLegacyProjectHwDefaults,
  sanitizePortableSettingsFile,
  sanitizeEstSnapshotFile,
  sanitizeWorkspaceEstFile,
  sanitizeLegacyProjectHwDefaultsOnDisk,
};
