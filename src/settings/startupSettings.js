'use strict';

const VALID_MODES = ['workspace', 'last_project', 'saved_project', 'blank'];

function normalizeStartup(input, prev = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const mode = VALID_MODES.includes(src.mode) ? src.mode : (prev.mode || 'workspace');
  let projectId = null;
  if (mode === 'saved_project') {
    const raw = src.projectId !== undefined && src.projectId !== null && String(src.projectId).trim()
      ? src.projectId
      : prev.projectId;
    projectId = String(raw ?? '').trim() || null;
  }
  return {
    mode,
    projectId,
    promptOnBoot: src.promptOnBoot === true,
  };
}

module.exports = { normalizeStartup, VALID_MODES };
