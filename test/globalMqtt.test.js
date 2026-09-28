'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseProgram } = require('../src/engine/parser');
const { compileProgramBytecode } = require('../src/engine/stBytecode');
const { META_GLOBAL } = require('../src/engine/stOpcodes');
const { isGlobalTagMeta, globalBaseType } = require('../src/parc/globalTagMeta');
const { encodeGlobalMqttPayload, decodeGlobalMqttPayload } = require('../src/parc/globalMqttPayload');
const { parseGlobalTopic, telemetryTopicInfo } = require('../src/parc/mqttProtocol');
const { MqttCentralHub, defaultCentralSettings } = require('../src/parc/mqttCentralHub');
const { TagStore } = require('../src/tags/tagStore');
const { publishDirtyGlobalTags } = require('../src/parc/globalMqttPublish');

describe('globalTagMeta + bytecode', () => {
  it('recognizes GLOBAL_* and GB/GI/GR aliases', () => {
    assert.equal(isGlobalTagMeta({ type: 'GLOBAL_BOOL' }), true);
    assert.equal(isGlobalTagMeta({ type: 'GB' }), true);
    assert.equal(globalBaseType({ type: 'GI' }), 'INT');
    assert.equal(isGlobalTagMeta({ type: 'BOOL', global: true }), true);
  });

  it('emits META_GLOBAL in bytecode header flags', () => {
    const { ast } = parseProgram('IF IsON(PumpRun) THEN TurnON(PumpRun); END_IF;');
    const tags = [{ id: 'PumpRun', type: 'GLOBAL_BOOL' }];
    const { bytecode: buf } = compileProgramBytecode(ast, ['PumpRun'], tags);
    let off = 10;
    const nlen = buf.readUInt8(off++);
    off += nlen;
    const flags = buf.readUInt8(off + 1);
    assert.equal(flags & META_GLOBAL, META_GLOBAL);
  });
});

describe('globalMqttPayload', () => {
  it('round-trips bool/int/real payloads', () => {
    assert.deepEqual(decodeGlobalMqttPayload(encodeGlobalMqttPayload('BOOL', true)), {
      type: 'BOOL',
      value: true,
    });
    assert.deepEqual(decodeGlobalMqttPayload(encodeGlobalMqttPayload('INT', 42)), {
      type: 'INT',
      value: 42,
    });
    assert.deepEqual(decodeGlobalMqttPayload(encodeGlobalMqttPayload('REAL', 3.5)), {
      type: 'REAL',
      value: 3.5,
    });
  });
});

describe('mqttProtocol global + tenant telemetry', () => {
  const cfg = { topicPrefix: 'peaklogic/v1' };

  it('parses global tag topics', () => {
    assert.deepEqual(parseGlobalTopic('peaklogic/v1/g/0001/PumpRun', cfg), {
      addrKey: '0001',
      tagName: 'PumpRun',
      siteKey: 1,
    });
    assert.equal(parseGlobalTopic('peaklogic/v1/site-01/telemetry', cfg), null);
  });

  it('parses tenant-scoped telemetry topics', () => {
    assert.deepEqual(
      telemetryTopicInfo('peaklogic/v1/acme-corp/opta_st_01/telemetry', cfg),
      { tenantId: 'acme-corp', deviceId: 'opta_st_01' },
    );
    assert.deepEqual(
      telemetryTopicInfo('peaklogic/v1/opta_st_01/telemetry', cfg),
      { tenantId: null, deviceId: 'opta_st_01' },
    );
  });
});

describe('mqttCentralHub global mirror', () => {
  it('mirrors inbound global MQTT into tag store', () => {
    const tagStore = new TagStore();
    const hub = new MqttCentralHub({ registry: { ingestReport() { return { ok: true }; } } });
    hub.cfg = {
      ...defaultCentralSettings(),
      enabled: true,
      globalSiteKey: 0x0001,
      topicPrefix: 'peaklogic/v1',
    };
    hub.setGlobalMirrorDeps({ tagStore });
    const topic = 'peaklogic/v1/g/0001/SharedRun';
    hub._mirrorGlobalTag(topic, encodeGlobalMqttPayload('BOOL', true));
    const tag = tagStore.get('SharedRun');
    assert.ok(tag);
    assert.equal(tag.global, true);
    assert.equal(tag.type, 'BOOL');
    assert.equal(tag.logicValue, true);
  });
});

describe('mqttCentralHub global outbound publish', () => {
  it('publishes dirty global tags when hub is live', () => {
    const published = [];
    const hub = new MqttCentralHub({ registry: { ingestReport() { return { ok: true }; } } });
    hub.cfg = {
      ...defaultCentralSettings(),
      enabled: true,
      globalSiteKey: 0x0001,
      topicPrefix: 'peaklogic/v1',
    };
    hub.client = {
      connected: true,
      publish(topic, payload, opts) {
        published.push({ topic, payload, opts });
      },
    };
    hub.connected = true;
    hub._subsReady = true;

    const tagStore = new TagStore();
    tagStore.upsert({
      id: 'PumpRun',
      type: 'GLOBAL_BOOL',
      role: 'memory',
      global: true,
      value: true,
      logicValue: true,
    });
    tagStore.markDirty('PumpRun');

    const n = publishDirtyGlobalTags(hub, tagStore);
    assert.equal(n, 1);
    assert.equal(published.length, 1);
    assert.equal(published[0].topic, 'peaklogic/v1/g/0001/PumpRun');
    assert.equal(published[0].opts.qos, 1);
    assert.equal(published[0].opts.retain, true);
    assert.deepEqual(JSON.parse(published[0].payload), { v: true, t: 'BOOL' });
  });

  it('skips publish when hub not live', () => {
    const tagStore = new TagStore();
    tagStore.upsert({ id: 'X', type: 'GB', global: true, role: 'memory', dirty: true, value: 0 });
    const hub = new MqttCentralHub({ registry: { ingestReport() { return { ok: true }; } } });
    assert.equal(publishDirtyGlobalTags(hub, tagStore), 0);
  });
});
