'use strict';

const { soapRequest, firstTag, tagAttr } = require('./onvifHttp');

const EVENTS_NS = 'http://www.onvif.org/ver10/events/wsdl';
const CREATE_SUB_ACTION = `${EVENTS_NS}/CreatePullPointSubscription`;
const PULL_ACTION = `${EVENTS_NS}/PullMessages`;

function pullPointUrlFromXml(xml) {
  const addr = firstTag(xml, 'Address') || firstTag(xml, 'SubscriptionReference');
  if (addr && /^https?:\/\//i.test(addr)) return addr;
  const match = String(xml || '').match(/<[^>]*Address[^>]*>(https?:\/\/[^<]+)</i);
  return match ? match[1].trim() : '';
}

function notificationsFromPullXml(xml) {
  const text = String(xml || '');
  const out = [];
  const blocks = text.match(/<[^>]*NotificationMessage[\s\S]*?<\/[^>]*NotificationMessage>/gi) || [];
  for (const block of blocks) {
    const topic = firstTag(block, 'Topic') || '';
    const data = block;
    out.push({ topic, raw: data, isMotion: /motion|cellmotion|ruleengine/i.test(topic + data) });
  }
  if (!out.length && /motion|cellmotion/i.test(text)) {
    out.push({ topic: 'motion', raw: text, isMotion: true });
  }
  return out;
}

async function createPullPointSubscription(eventsUrl, creds = {}) {
  const body = `<CreatePullPointSubscription xmlns="${EVENTS_NS}">
  <InitialTerminationTime>PT1H</InitialTerminationTime>
</CreatePullPointSubscription>`;
  const xml = await soapRequest(eventsUrl, body, CREATE_SUB_ACTION, creds);
  const pullUrl = pullPointUrlFromXml(xml);
  if (!pullUrl) {
    throw new Error('ONVIF CreatePullPointSubscription did not return pull point URL');
  }
  return { pullUrl, raw: xml };
}

async function pullMessages(pullUrl, creds = {}, { timeoutSec = 5, limit = 10 } = {}) {
  const body = `<PullMessages xmlns="${EVENTS_NS}">
  <Timeout>PT${Math.max(1, Math.min(timeoutSec, 60))}S</Timeout>
  <MessageLimit>${Math.max(1, Math.min(limit, 100))}</MessageLimit>
</PullMessages>`;
  const xml = await soapRequest(pullUrl, body, PULL_ACTION, creds);
  return notificationsFromPullXml(xml);
}

module.exports = {
  createPullPointSubscription,
  pullMessages,
  notificationsFromPullXml,
  pullPointUrlFromXml,
};
