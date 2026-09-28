'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  SCHEMA,
  topicAlarms,
  topicAlarmNotify,
  buildAlarmPayload,
  buildNotifyPayload,
} = require('../src/integrations/cmmsAlarmPublisher');
const { normalizeCmmsIntegration } = require('../src/settings/cmmsIntegrationSettings');

describe('cmmsAlarmPublisher', () => {
  const cfg = normalizeCmmsIntegration({
    siteId: 'plant-a',
    tenantId: 'acme',
    topicPrefix: 'peaklogic/v1',
  });

  const alarm = {
    tagId: 'AI1',
    level: 'outerHigh',
    previousLevel: 'innerHigh',
    value: 95,
    since: 1718389800123,
  };

  it('builds topic paths', () => {
    assert.equal(topicAlarms(cfg), 'peaklogic/v1/plant-a/alarms');
    assert.equal(topicAlarmNotify(cfg), 'peaklogic/v1/plant-a/alarm-notify');
  });

  it('builds alarm payload with schema v1', () => {
    const p = buildAlarmPayload(alarm, { config: cfg, projectName: 'demo' });
    assert.equal(p.schema, SCHEMA);
    assert.equal(p.siteId, 'plant-a');
    assert.equal(p.tenantId, 'acme');
    assert.equal(p.source, 'peaklogic');
    assert.equal(p.projectName, 'demo');
    assert.equal(p.alarm.tagId, 'AI1');
    assert.equal(p.alarm.level, 'outerHigh');
    assert.equal(p.alarm.previousLevel, 'innerHigh');
    assert.equal(p.alarm.value, 95);
    assert.equal(p.alarm.since, alarm.since);
    assert.ok(p.publishedAt);
  });

  it('builds notify payload with recipients', () => {
    const recipients = [{
      id: 'u1',
      email: 'ops@test.com',
      role: 'operator',
      active: true,
      profile: { displayName: 'Ops', alarmNotifications: { enabled: true, minLevel: 'inner' } },
    }];
    const p = buildNotifyPayload(alarm, recipients, { config: cfg, projectName: 'demo' });
    assert.equal(p.schema, SCHEMA);
    assert.equal(p.recipients.length, 1);
    assert.equal(p.recipients[0].email, 'ops@test.com');
    assert.equal(p.alarm.tagId, 'AI1');
  });

  it('normalizes cmms integration settings', () => {
    const c = normalizeCmmsIntegration({
      enabled: true,
      brokerUrl: 'mqtt://192.168.1.1:1883',
      siteId: 'site1',
      topicPrefix: 'peaklogic/v1/',
    });
    assert.equal(c.enabled, true);
    assert.equal(c.brokerUrl, 'mqtt://192.168.1.1:1883');
    assert.equal(c.topicPrefix, 'peaklogic/v1');
    assert.equal(c.publishAlarmTopic, true);
    assert.equal(c.publishNotifyTopic, true);
  });
});
