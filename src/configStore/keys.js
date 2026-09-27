'use strict';

/** JSON files under data/ that hold setup/configuration (not runtime historian samples). */
const CONFIG_JSON_FILES = new Set([
  'settings.json',
  'tags.json',
  'drivers.json',
  'parc.json',
  'workspace.est.json',
  'project.est.json',
  'users.json',
]);

const ALARM_QUEUE_FILE = 'alarm_notify_queue.json';

function isConfigJsonFile(name) {
  return CONFIG_JSON_FILES.has(name) || name === ALARM_QUEUE_FILE;
}

module.exports = {
  CONFIG_JSON_FILES,
  ALARM_QUEUE_FILE,
  isConfigJsonFile,
};
