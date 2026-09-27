'use strict';

const { encodeGlobalMqttPayload } = require('./globalMqttPayload');
const { globalTopic } = require('./globalAddressKey');
const { globalBaseType } = require('./globalTagMeta');

/**
 * Publish dirty global tags to peaklogic/v1/g/{siteKey4}/{tag} (retained QoS1).
 * @returns {number} count published
 */
function publishDirtyGlobalTags(hub, tagStore) {
  if (!hub?.isLive?.()) return 0;
  let siteKey;
  try {
    siteKey = hub.resolveGlobalSiteKey();
  } catch {
    return 0;
  }
  if (!siteKey) return 0;
  let n = 0;
  for (const tag of tagStore.list()) {
    if (!tag.global || !tag.dirty) continue;
    if (hub.publishGlobalTag(tag.id, tag, siteKey)) n += 1;
  }
  return n;
}

function publishGlobalTag(client, cfg, siteKey, tagName, tag) {
  if (!client?.connected) return false;
  const type = globalBaseType(tag) || tag.type || 'BOOL';
  const topic = globalTopic(cfg, siteKey, tagName);
  const payload = encodeGlobalMqttPayload(type, tag.value ?? tag.logicValue);
  client.publish(topic, payload, { qos: 1, retain: true });
  return true;
}

module.exports = {
  publishDirtyGlobalTags,
  publishGlobalTag,
};
