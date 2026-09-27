'use strict';

const path = require('path');
const { detectLanIp } = require(path.join(__dirname, '../../scripts/mqtt-broker-paths'));

function optaBrokerHint() {
  const lanIp = detectLanIp();
  const pcBrokerUrl = lanIp === '127.0.0.1'
    ? 'mqtt://127.0.0.1:1883'
    : `mqtt://${lanIp}:1883`;
  const optaBrokerIp = lanIp === '127.0.0.1' ? 'your PC LAN IP' : lanIp;
  const applianceNote = lanIp === '127.0.0.1'
    ? ' (on IOT-LINK use the gateway LAN IP, e.g. 192.168.1.176 — not 127.0.0.1 on the Opta)'
    : '';
  return {
    lanIp,
    pcBrokerUrl,
    optaBrokerIp,
    optaSetupHint:
      `Set Opta MQTT broker to ${optaBrokerIp}:1883 on http://<opta-ip>/setup (MQTT Parc broker) — not 127.0.0.1 on the device${applianceNote}`,
  };
}

function appendOptaBrokerHint(message) {
  const text = String(message || '');
  if (/g_mqttCfg|LAN IP|broker to|\/setup/i.test(text)) return text;
  return `${text} — ${optaBrokerHint().optaSetupHint}`;
}

module.exports = {
  optaBrokerHint,
  appendOptaBrokerHint,
};
