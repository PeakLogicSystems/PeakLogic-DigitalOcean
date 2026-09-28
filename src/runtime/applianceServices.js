'use strict';

const { DEPLOYMENT_MODE } = require('../config');

/**
 * Wire in-process handlers for appliance (monolith) deployment.
 * Cloud services will subscribe to the same events on a message bus.
 */
function registerApplianceServices() {
  if (DEPLOYMENT_MODE !== 'appliance') return;

  const { on } = require('./eventBus');
  const { notifyAlarm } = require('../users/alarmNotifier');
  const { publishAlarmTransition } = require('../integrations/cmmsAlarmPublisher');

  on('alarm:transition', (evt) => {
    try {
      notifyAlarm(evt);
    } catch (err) {
      console.warn('[alarm-notify]', err?.message || err);
    }
    publishAlarmTransition(evt).catch((err) => {
      console.warn('[cmms-mqtt]', err?.message || err);
    });
  });
}

module.exports = { registerApplianceServices };
