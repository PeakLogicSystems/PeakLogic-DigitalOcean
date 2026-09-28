'use strict';

const crypto = require('crypto');
const mqtt = require('mqtt');
const { topics, deviceIdFromTopic, telemetryTopicInfo, onlineTopicInfo, parseGlobalTopic, globalTopics, topicPrefix } = require('./mqttProtocol');
const { DEFAULT_GLOBAL_SITE_KEY, siteKeyToAddrKey, normalizeSiteKey } = require('./globalAddressKey');
const { decodeGlobalMqttPayload } = require('./globalMqttPayload');
const { publishGlobalTag: publishGlobalTagPayload } = require('./globalMqttPublish');
const { globalBaseType } = require('./globalTagMeta');
const { optaStatusToParcReport } = require('./optaTelemetryMapper');
const { parseMqttJson } = require('./parseMqttJson');
const { cmdTimeoutMessage } = require('./cmdFailureHint');
const mongoSysLog = require('../logger/mongoSysLog');

function defaultCentralSettings() {
  return {
    enabled: false,
    brokerUrl: 'mqtt://127.0.0.1:1883',
    topicPrefix: 'peaklogic/v1',
    clientId: 'mv-central-hmi',
    username: '',
    password: '',
    commandTimeoutMs: 15000,
    putProgramTimeoutMs: 120000,
    globalSiteKey: DEFAULT_GLOBAL_SITE_KEY,
    cloudTenantIngest: false,
  };
}

class MqttCentralHub {
  constructor({ registry }) {
    this.registry = registry;
    this.cfg = defaultCentralSettings();
    this.client = null;
    this.connected = false;
    this._subsReady = false;
    this._subsReadyPromise = null;
    this._pending = new Map();
    /** @type {Map<string, Promise<void>>} */
    this._deviceCmdTail = new Map();
    this._autoDiscoveryDeps = null;
    this._globalMirrorDeps = null;
    this._telemetryParseWarnAt = new Map();
    this._cmdDiagAt = new Map();
    this._deviceMqttLogAt = new Map();
  }

  _logDeviceMqttEvent(deviceId, event, message, extra = {}) {
    const id = String(deviceId || '').trim();
    if (!id) return;
    const key = `${id}:${event}`;
    const now = Date.now();
    const last = this._deviceMqttLogAt.get(key) || 0;
    const minGap = event === 'client_connect' || event === 'client_disconnect' ? 2000 : 60000;
    if (now - last < minGap) return;
    this._deviceMqttLogAt.set(key, now);
    mongoSysLog.info('mqtt', message, {
      event,
      clientId: id,
      ...extra,
    });
  }

  _logTelemetryParseError(deviceId, err, text) {
    const key = deviceId || '(unknown)';
    const now = Date.now();
    const last = this._telemetryParseWarnAt.get(key) || 0;
    if (now - last < 60000) return;
    this._telemetryParseWarnAt.set(key, now);
    const len = text?.length ?? 0;
    console.error(`[mqtt-parc-hub] telemetry from ${key} (${len} bytes): ${err.message}`);
  }

  _logCmdDiag(key, message) {
    const now = Date.now();
    const last = this._cmdDiagAt.get(key) || 0;
    if (now - last < 15000) return;
    this._cmdDiagAt.set(key, now);
    console.warn(`[mqtt-parc-hub] ${message}`);
  }

  _logCmdParseError(topic, err, text) {
    this._logCmdDiag(topic, `cmd/response parse error on ${topic}: ${err.message}`);
  }

  _logCmdOrphan(topic, msg, why) {
    const id = msg?.id != null ? String(msg.id).slice(0, 8) : '?';
    this._logCmdDiag(`${topic}:${why}`, `cmd/response ${why} (id=${id}…)`);
  }

  setAutoDiscoveryDeps(deps) {
    this._autoDiscoveryDeps = deps || null;
  }

  setGlobalMirrorDeps(deps) {
    this._globalMirrorDeps = deps || null;
  }

  resolveGlobalSiteKey() {
    try {
      return normalizeSiteKey(this.cfg.globalSiteKey);
    } catch {
      return DEFAULT_GLOBAL_SITE_KEY;
    }
  }

  globalWildcardTopic() {
    const key = this.resolveGlobalSiteKey();
    return globalTopics(this.cfg, key, '_').wildcardSiteTags;
  }

  isLive() {
    return !!(this.client && this.client.connected && this._subsReady);
  }

  _markSubsNotReady() {
    this._subsReady = false;
    this._subsReadyPromise = null;
  }

  async _ensureSubsReady() {
    if (!this.client?.connected) {
      throw new Error('MQTT client not connected');
    }
    if (this._subsReady) return;
    if (!this._subsReadyPromise) {
      this._subsReadyPromise = this._subscribeAll()
        .then(() => {
          this._subsReady = true;
        })
        .finally(() => {
          this._subsReadyPromise = null;
        });
    }
    await this._subsReadyPromise;
  }

  status() {
    return {
      enabled: !!this.cfg.enabled,
      connected: this.isLive(),
      brokerUrl: this.cfg.brokerUrl,
      pendingCommands: this._pending.size,
    };
  }

  _subscribeAll() {
    if (!this.client) return Promise.resolve();
    const subs = [
      topics(this.cfg, '_').wildcardTelemetry,
      topics(this.cfg, '_').wildcardCmdResponse,
      topics(this.cfg, '_').wildcardOnline,
      this.globalWildcardTopic(),
    ];
    if (this.cfg.cloudTenantIngest) {
      subs.push(`${topicPrefix(this.cfg)}/+/+/telemetry`);
      subs.push(`${topicPrefix(this.cfg)}/+/+/online`);
    }
    subs.push(`${topicPrefix(this.cfg)}/gateway/+/cellular`);
    if (this.cfg.legacyOpta !== false) {
      subs.push(this.cfg.legacyOptaTopic || 'opta/status');
      subs.push('opta/set/relay/#');
    }
    return new Promise((resolve, reject) => {
      this.client.subscribe(subs, { qos: 1 }, (err) => {
        if (err) {
          console.error('[mqtt-parc-hub] subscribe:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  _cfgMatches(nextCfg) {
    const a = this.cfg || {};
    const b = { ...defaultCentralSettings(), ...(nextCfg || {}) };
    return a.enabled === b.enabled
      && String(a.brokerUrl || '') === String(b.brokerUrl || '')
      && String(a.topicPrefix || '') === String(b.topicPrefix || '')
      && String(a.clientId || '') === String(b.clientId || '')
      && String(a.username || '') === String(b.username || '')
      && String(a.password || '') === String(b.password || '')
      && Number(a.globalSiteKey ?? DEFAULT_GLOBAL_SITE_KEY) === Number(b.globalSiteKey ?? DEFAULT_GLOBAL_SITE_KEY)
      && !!a.cloudTenantIngest === !!b.cloudTenantIngest;
  }

  async start(rawCfg) {
    const nextCfg = { ...defaultCentralSettings(), ...(rawCfg || {}) };
    if (!nextCfg.enabled) {
      await this.stop({ rejectPending: true, reason: 'MQTT Parc hub disabled' });
      this.cfg = nextCfg;
      return;
    }
    if (this.isLive() && this._cfgMatches(nextCfg)) {
      this.cfg = nextCfg;
      return;
    }
    await this.stop({ rejectPending: false });
    this.cfg = nextCfg;

    const baseClientId = this.cfg.clientId || 'mv-central-hmi';
    const clientId = baseClientId === 'mv-central-hmi'
      ? `mv-central-hmi-${process.pid}`
      : baseClientId;

    this.client = mqtt.connect(this.cfg.brokerUrl, {
      clientId,
      username: this.cfg.username || undefined,
      password: this.cfg.password || undefined,
      keepalive: 60,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this._markSubsNotReady();
      mongoSysLog.info('mqtt', 'Central hub connected to broker', {
        event: 'hub_connect',
        brokerUrl: this.cfg.brokerUrl,
        clientId,
      });
      this._ensureSubsReady().catch((e) => {
        console.error('[mqtt-parc-hub] subscribe:', e.message);
        mongoSysLog.error('mqtt', 'Hub subscribe failed', {
          event: 'hub_error',
          brokerUrl: this.cfg.brokerUrl,
          message: e.message,
        });
      });
    });
    this.client.on('message', (topic, buf) => this._onMessage(topic, buf));
    this.client.on('close', () => {
      this.connected = false;
      this._markSubsNotReady();
      mongoSysLog.warn('mqtt', 'Central hub disconnected from broker', {
        event: 'hub_disconnect',
        brokerUrl: this.cfg.brokerUrl,
        clientId,
      });
    });
    this.client.on('error', (e) => {
      console.error('[mqtt-parc-hub]', e.message);
      mongoSysLog.error('mqtt', `Hub broker error: ${e.message}`, {
        event: 'hub_error',
        brokerUrl: this.cfg.brokerUrl,
        message: e.message,
        clientId,
      });
    });

    await new Promise((resolve, reject) => {
      const timeoutMs = Math.max(3000, Number(this.cfg.connectTimeoutMs) || 15000);
      const timer = setTimeout(() => {
        reject(new Error(
          `MQTT hub connect timeout at ${this.cfg.brokerUrl} — start Mosquitto (npm run mqtt:start) or fix broker URL in System setup`,
        ));
      }, timeoutMs);
      const done = (fn) => (arg) => {
        clearTimeout(timer);
        fn(arg);
      };
      this.client.once('connect', () => {
        this._ensureSubsReady().then(() => done(resolve)()).catch(done(reject));
      });
      this.client.once('error', done(reject));
    });
  }

  async stop(opts = {}) {
    const rejectPending = opts.rejectPending !== false;
    const reason = opts.reason || 'MQTT hub stopped';
    if (rejectPending) {
      for (const [, p] of this._pending) {
        clearTimeout(p.timer);
        p.reject(new Error(reason));
      }
      this._pending.clear();
    }
    this._deviceCmdTail.clear();
    if (this.client) {
      try { this.client.end(true); } catch { /* ignore */ }
    }
    this.client = null;
    this.connected = false;
    this._markSubsNotReady();
  }

  async reload(rawCfg) {
    await this.start(rawCfg);
  }

  _handleLegacyOpta(topic, text) {
    if (topic === (this.cfg.legacyOptaTopic || 'opta/status')) {
      try {
        const raw = parseMqttJson(text);
        const deviceId = this.cfg.legacyOptaDeviceId || 'opta_full_io_01';
        const report = optaStatusToParcReport(deviceId, raw, {
          name: 'Arduino Opta',
          platform: 'arduino-opta',
        });
        this.registry.ingestReport(report);
      } catch (e) {
        console.error('[mqtt-parc-hub] opta status:', e.message);
      }
      return true;
    }
    return false;
  }

  publishLegacyOptaRelay(relay, state) {
    if (!this.isLive()) return false;
    const topic = 'opta/set/relay/1';
    this.client.publish(topic, JSON.stringify({ relay, state: !!state }), { qos: 1 });
    return true;
  }

  publishGlobalTag(tagName, tag, siteKey) {
    if (!this.isLive()) return false;
    if (!this.resolveGlobalSiteKey()) return false;
    return publishGlobalTagPayload(
      this.client,
      this.cfg,
      siteKey ?? this.resolveGlobalSiteKey(),
      tagName,
      tag,
    );
  }

  publishDirtyGlobalTags(tagStore) {
    const { publishDirtyGlobalTags } = require('./globalMqttPublish');
    return publishDirtyGlobalTags(this, tagStore);
  }

  _mirrorGlobalTag(topic, text) {
    const parsed = parseGlobalTopic(topic, this.cfg);
    if (!parsed) return false;
    const expected = siteKeyToAddrKey(this.resolveGlobalSiteKey());
    if (parsed.addrKey !== expected) return true;
    const payload = decodeGlobalMqttPayload(text);
    if (!payload) return true;
    const deps = this._globalMirrorDeps;
    if (!deps?.tagStore) return true;
    const type = globalBaseType({ type: payload.type, global: true }) || payload.type || 'BOOL';
    const existing = deps.tagStore.get(parsed.tagName);
    deps.tagStore.upsert({
      ...(existing || {}),
      id: parsed.tagName,
      type,
      role: existing?.role || 'memory',
      global: true,
    });
    deps.tagStore.setValue(parsed.tagName, payload.value);
    if (typeof deps.onGlobalMirror === 'function') {
      deps.onGlobalMirror({
        tagId: parsed.tagName,
        topic,
        payload: deps.tagStore.get(parsed.tagName),
      });
    }
    return true;
  }

  _handleGatewayCellular(topic, text) {
    try {
      const { parseGatewayCellularTopic, ingestGatewayCellularMessage } = require('../cellular/gatewayCellularIngest');
      if (!parseGatewayCellularTopic(topic, this.cfg)) return false;
      ingestGatewayCellularMessage(topic, text, this.cfg).then((result) => {
        if (result?.autoLink?.linked) {
          console.info(`[mqtt-parc-hub] auto-linked SIM ${result.autoLink.iccid} to gateway ${result.autoLink.gatewayId}`);
        } else if (result?.autoLink?.suggestSync) {
          console.info(`[mqtt-parc-hub] gateway ${result.report?.gatewayId} ICCID ${result.report?.iccid} not in inventory — sync Simetry`);
        }
      }).catch((err) => {
        console.warn('[mqtt-parc-hub] gateway cellular ingest:', err.message || err);
      });
      return true;
    } catch {
      return false;
    }
  }

  _onMessage(topic, buf) {
    const text = buf.toString();
    if (this._handleGatewayCellular(topic, text)) return;
    if (this._handleLegacyOpta(topic, text)) return;
    if (this._mirrorGlobalTag(topic, text)) {
      if (parseGlobalTopic(topic, this.cfg)) return;
    }

    const telem = telemetryTopicInfo(topic, this.cfg);
    const deviceId = telem?.deviceId || deviceIdFromTopic(topic, this.cfg);
    if (!deviceId) return;

    if (topic.endsWith('/telemetry')) {
      try {
        const body = parseMqttJson(text);
        if (!body || typeof body !== 'object') return;
        const report = { ...body, deviceId: body.deviceId || deviceId };
        if (telem?.tenantId) {
          report.meta = { ...(report.meta || {}), tenantId: telem.tenantId };
        }
        try {
          const { extractGlobalSiteKeyFromReport } = require('./commissionFence');
          const siteKey = extractGlobalSiteKeyFromReport(report);
          if (siteKey != null) {
            report.meta = { ...(report.meta || {}), globalSiteKey: siteKey };
          }
        } catch { /* optional */ }
        const mongoTagLogger = require('../logger/mongoTagLogger');
        mongoTagLogger.logEdgeFromReport(report).catch(() => {});
        const ingest = this.registry.ingestReport(report);
        if (report.runtime && report.runtime.running !== true) {
          setImmediate(() => {
            try {
              const { maybeRecoverParcDevice } = require('./parcDeviceRecovery');
              maybeRecoverParcDevice(deviceId, {
                reason: 'telemetry-st-stopped',
                registry: this.registry,
                hub: this,
              }).catch((e) => {
                console.warn(`[parc-recovery] ${deviceId}:`, e.message || e);
              });
            } catch { /* optional */ }
          });
        }
        if (ingest.ok) {
          this._logDeviceMqttEvent(deviceId, 'client_connect', `Device connected: ${deviceId}`, {
            ip: report.ethIp || report.meta?.ethIp || null,
          });
          try {
            const { isCellularSimsEnabled } = require('../cellular/cellularSimsEnabled');
            if (isCellularSimsEnabled()) {
              const {
                syncDeviceCellularRegistration,
              } = require('../cellular/deviceCellularSync');
              syncDeviceCellularRegistration({
                deviceId,
                tenantId: telem?.tenantId || report.meta?.tenantId,
                report,
              }).then((sync) => {
                if (sync?.ok && sync.registration && this.isLive()) {
                  const topic = `${topicPrefix(this.cfg)}/${deviceId}/registration`;
                  this.client.publish(topic, JSON.stringify(sync.registration), { qos: 1, retain: true });
                }
              }).catch((err) => {
                console.warn('[mqtt-parc-hub] device cellular sync:', err.message || err);
              });
            }
          } catch { /* optional */ }
        }
        if (ingest.ok && this._autoDiscoveryDeps?.driverManager) {
          const settings = typeof this._autoDiscoveryDeps.getSettings === 'function'
            ? this._autoDiscoveryDeps.getSettings()
            : {};
          if (settings?.mqttParc?.enabled !== false) {
            const { ensureParcDriverForDevice } = require('./parcDriverSync');
            ensureParcDriverForDevice(deviceId, {
              driverManager: this._autoDiscoveryDeps.driverManager,
              registry: this.registry,
              tagStore: this._autoDiscoveryDeps.tagStore,
            }).catch((e) => {
              console.warn('[mqtt-parc] registry driver sync:', e.message || e);
            });
          }
        }
        try {
          const { DEPLOYMENT_MODE } = require('../config');
          if (DEPLOYMENT_MODE === 'appliance') {
            const { relayParcReportIfEnabled } = require('../integrations/applianceCloudRelay');
            relayParcReportIfEnabled(report).catch(() => {});
          }
        } catch { /* cloud-remote optional */ }
      } catch (e) {
        this._logTelemetryParseError(deviceId, e, text);
      }
      return;
    }

    if (topic.endsWith('/cmd/response')) {
      let msg;
      try { msg = parseMqttJson(text); } catch (e) {
        this._logCmdParseError(topic, e, text);
        return;
      }
      if (!msg || msg.id == null || msg.id === '') {
        this._logCmdOrphan(topic, msg, 'missing id');
        return;
      }
      const p = this._pending.get(msg.id);
      if (!p) {
        return;
      }
      clearTimeout(p.timer);
      this._pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.body);
      else p.reject(Object.assign(new Error(msg.error || 'command failed'), { status: msg.status || 500 }));
      return;
    }

    if (topic.endsWith('/online')) {
      try {
        const onlineInfo = onlineTopicInfo(topic, this.cfg);
        const onlineDeviceId = onlineInfo?.deviceId || deviceId;
        if (!onlineDeviceId) return;
        const msg = parseMqttJson(text);
        const existing = this.registry.getDevice(onlineDeviceId);
        if (msg?.online === true) {
          this._logDeviceMqttEvent(onlineDeviceId, 'client_connect', `Device connected: ${onlineDeviceId}`);
          this.registry.ingestReport({
            deviceId: onlineDeviceId,
            name: existing?.name || onlineDeviceId,
            platform: existing?.platform || 'arduino-opta-mqtt-st',
            tags: existing?.tags || [],
            meta: {
              ...(existing?.meta || {}),
              online: true,
              pendingTelemetry: !(existing?.tags?.length),
              ...(onlineInfo?.tenantId ? { tenantId: onlineInfo.tenantId } : {}),
            },
          });
        } else if (msg?.online === false && existing) {
          this._logDeviceMqttEvent(onlineDeviceId, 'client_disconnect', `Device disconnected: ${onlineDeviceId}`);
          this.registry.ingestReport({
            deviceId: onlineDeviceId,
            tags: existing.tags || [],
            runtime: { ...(existing.runtime || {}), running: false },
            meta: { ...(existing.meta || {}), online: false },
          });
        }
      } catch { /* ignore */ }
    }
  }

  publishDeviceConfig(deviceId, patch) {
    if (!this.isLive()) return false;
    const t = topics(this.cfg, deviceId);
    this.client.publish(t.config, JSON.stringify(patch), { qos: 1 });
    return true;
  }

  async sendCommand(deviceId, op, body, opts = {}) {
    const broker = this.cfg.brokerUrl || 'mqtt broker';
    if (!this.client?.connected) {
      return Promise.reject(new Error(
        `MQTT hub not connected to ${broker} — System setup → Enable MQTT Parc hub, then run npm run mqtt:start or fix broker URL`,
      ));
    }
    const prevDone = this._deviceCmdTail.get(deviceId) || Promise.resolve();
    let release;
    const done = new Promise((resolve) => { release = resolve; });
    const tail = prevDone.then(() => done);
    this._deviceCmdTail.set(deviceId, tail);
    try {
      await prevDone;
      if (!this.client?.connected) {
        throw new Error(
          `MQTT hub not connected to ${broker} — System setup → Enable MQTT Parc hub, then run npm run mqtt:start or fix broker URL`,
        );
      }
      try {
        await this._ensureSubsReady();
      } catch (e) {
        throw new Error(
          `MQTT hub not ready (${e.message || e}) — retry in a few seconds`,
        );
      }
      return await this._sendCommandOnce(deviceId, op, body, opts);
    } finally {
      release();
      if (this._deviceCmdTail.get(deviceId) === tail) {
        this._deviceCmdTail.delete(deviceId);
      }
    }
  }

  async _sendCommandOnce(deviceId, op, body, opts = {}) {
    const id = crypto.randomUUID();
    const t = topics(this.cfg, deviceId);
    await new Promise((resolve, reject) => {
      this.client.subscribe(t.cmdResponse, { qos: 1 }, (err) => {
        if (err) reject(new Error(`MQTT subscribe ${t.cmdResponse}: ${err.message}`));
        else resolve();
      });
    });
    const baseTimeout = Math.max(3000, Number(this.cfg.commandTimeoutMs) || 15000);
    const putTimeout = Math.max(baseTimeout, Number(this.cfg.putProgramTimeoutMs) || 120000);
    const timeoutMs = opts.timeoutMs
      ?? (op === 'put_program' ? putTimeout : baseTimeout);
    const cmdTopic = t.cmd;
    if (op === 'put_program' || op === 'get_program') {
      for (const [pendingId, p] of this._pending) {
        if (p.deviceId === deviceId) {
          clearTimeout(p.timer);
          this._pending.delete(pendingId);
          p.reject(new Error(`Superseded by ${op} on ${deviceId}`));
        }
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        const dev = this.registry.getDevice(deviceId);
        this._logCmdDiag(
          `${deviceId}:${op}:timeout`,
          `command timeout (${op}) → ${cmdTopic} (pending=${this._pending.size})`,
        );
        reject(new Error(cmdTimeoutMessage({
          deviceId,
          op,
          dev,
          hubBrokerUrl: this.cfg.brokerUrl,
          mqttHubUsername: this.cfg.username || '',
          registry: this.registry,
        })));
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, timer, op, deviceId });
      const payload = JSON.stringify({ id, op, body: body || {} });
      if (op === 'put_program') {
        console.log(`[mqtt-parc-hub] put_program publish ${payload.length} bytes → ${cmdTopic}`);
      }
      this.client.publish(cmdTopic, payload, { qos: 1 }, (pubErr) => {
        if (pubErr) {
          clearTimeout(timer);
          this._pending.delete(id);
          reject(new Error(`MQTT publish failed (${op}): ${pubErr.message}`));
        }
      });
    });
  }
}

let hubSingleton = null;

function getMqttCentralHub(registry) {
  if (!hubSingleton) hubSingleton = new MqttCentralHub({ registry });
  return hubSingleton;
}

module.exports = {
  MqttCentralHub,
  getMqttCentralHub,
  defaultCentralSettings,
};
