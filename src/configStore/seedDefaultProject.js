'use strict';

const persistence = require('../persistence');
const { pack, EST_FORMAT } = require('../project/estFile');
const { DEFAULT_MQTT_PARC_BROKER } = require('../config');

const DEFAULT_ID = 'default';

function defaultEnabledSettings(prev = {}) {
  return {
    ...prev,
    autoStartRuntime: true,
    remoteExecution: true,
    startup: {
      mode: 'saved_project',
      projectId: DEFAULT_ID,
      promptOnBoot: true,
    },
    mqttParc: {
      ...(prev.mqttParc || {}),
      enabled: true,
      autoDiscoverDrivers: true,
      brokerUrl: prev.mqttParc?.brokerUrl || DEFAULT_MQTT_PARC_BROKER,
      topicPrefix: prev.mqttParc?.topicPrefix || 'peaklogic/v1',
      clientId: prev.mqttParc?.clientId || 'peaklogic-central-hmi',
    },
  };
}

/**
 * Seed a "default" saved project when the library is empty.
 * Enables startup → saved project, auto-start runtime, MQTT Parc, remote execution, auto-discover.
 * @param {{ tagStore, driverManager }} deps
 */
async function seedDefaultProjectIfEmpty(deps) {
  const configStore = require('./index');
  await configStore.refreshProjectIndex();
  if (configStore.listProjectsSync().length > 0) return null;

  const { tagStore, driverManager } = deps;
  const prevSettings = persistence.readJson('settings.json', {});
  const ws = persistence.readJson('workspace.est.json', null);

  let doc;
  if (ws?.format === EST_FORMAT && Array.isArray(ws.tags) && Array.isArray(ws.drivers)) {
    doc = {
      ...ws,
      project: { ...(ws.project || {}), name: ws.project?.name || DEFAULT_ID },
    };
  } else {
    doc = pack({ tagStore, driverManager, persistence }, { name: DEFAULT_ID });
  }

  const settings = defaultEnabledSettings({
    ...prevSettings,
    ...(doc.settings || {}),
    project: { ...(prevSettings.project || {}), name: doc.project?.name || DEFAULT_ID },
  });
  doc = { ...doc, settings, project: { ...doc.project, name: doc.project?.name || DEFAULT_ID } };

  await configStore.saveProjectDoc(DEFAULT_ID, doc);
  persistence.writeJson('settings.json', settings);
  await persistence.flushConfig();

  console.log(`[configStore] seeded saved project "${DEFAULT_ID}" (startup + runtime + MQTT Parc enabled)`);
  return { id: DEFAULT_ID, name: doc.project.name };
}

module.exports = { seedDefaultProjectIfEmpty, defaultEnabledSettings, DEFAULT_ID };
