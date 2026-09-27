'use strict';

const crypto = require('crypto');
const { normalizeTenantId } = require('../parc/cloudMqttTopics');
const { normalizeDeviceId } = require('../parc/mqttProtocol');

const SIM_TYPES = new Set(['opta', 'modbus', 'mixed']);
const SIM_STATUSES = new Set(['stopped', 'starting', 'running', 'error']);

function newSimId() {
  return `sim_${crypto.randomBytes(8).toString('hex')}`;
}

function defaultDeviceId(type = 'opta') {
  const suffix = crypto.randomBytes(4).toString('hex');
  if (type === 'modbus') return `sim_modbus_${suffix}`;
  if (type === 'mixed') return `sim_mixed_${suffix}`;
  return `sim_opta_${suffix}`;
}

function defaultConfig(type = 'opta') {
  const base = {
    intervalMs: 2000,
    topicPrefix: 'peaklogic/v1',
    brokerUrl: '',
  };
  if (type === 'modbus') {
    return { ...base, registers: [{ address: 40001, type: 'holding', value: 0 }] };
  }
  if (type === 'mixed') {
    return {
      ...base,
      optaTags: true,
      modbusRegisters: [{ address: 40001, type: 'holding', value: 0 }],
    };
  }
  return base;
}

function normalizeConfig(input, type = 'opta') {
  const base = defaultConfig(type);
  if (!input || typeof input !== 'object') return base;
  const intervalMs = Number(input.intervalMs ?? base.intervalMs);
  return {
    ...base,
    ...input,
    intervalMs: Number.isFinite(intervalMs) && intervalMs >= 200 ? intervalMs : base.intervalMs,
    topicPrefix: String(input.topicPrefix || base.topicPrefix).trim().replace(/\/+$/, '') || base.topicPrefix,
    brokerUrl: String(input.brokerUrl || '').trim(),
  };
}

function normalizeSimInput(input, prev = null) {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('sim body required'), { status: 400 });
  }
  const type = String(input.type ?? prev?.type ?? 'opta').trim().toLowerCase();
  if (!SIM_TYPES.has(type)) {
    throw Object.assign(new Error('type must be opta, modbus, or mixed'), { status: 400 });
  }
  const name = String(input.name ?? prev?.name ?? '').trim();
  if (!name) {
    throw Object.assign(new Error('name required'), { status: 400 });
  }
  const tenantId = normalizeTenantId(input.tenantId ?? prev?.tenantId ?? 'demo-tenant');
  const mqttDeviceId = normalizeDeviceId(
    input.mqttDeviceId ?? prev?.mqttDeviceId ?? defaultDeviceId(type),
  );
  const status = prev?.status && SIM_STATUSES.has(prev.status) ? prev.status : 'stopped';
  const now = new Date().toISOString();
  return {
    id: prev?.id || newSimId(),
    name: name.slice(0, 128),
    tenantId,
    type,
    status: SIM_STATUSES.has(input.status) ? input.status : status,
    mqttDeviceId,
    config: normalizeConfig(input.config ?? prev?.config, type),
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    lastStartedAt: prev?.lastStartedAt || null,
    lastStoppedAt: prev?.lastStoppedAt || null,
    lastError: input.lastError != null ? String(input.lastError).slice(0, 500) : (prev?.lastError || null),
  };
}

function summarizeSim(sim) {
  if (!sim) return null;
  return {
    id: sim.id,
    name: sim.name,
    tenantId: sim.tenantId,
    type: sim.type,
    status: sim.status,
    mqttDeviceId: sim.mqttDeviceId,
    config: sim.config,
    createdAt: sim.createdAt,
    updatedAt: sim.updatedAt,
    lastStartedAt: sim.lastStartedAt,
    lastStoppedAt: sim.lastStoppedAt,
    lastError: sim.lastError,
  };
}

module.exports = {
  SIM_TYPES,
  SIM_STATUSES,
  newSimId,
  defaultDeviceId,
  defaultConfig,
  normalizeConfig,
  normalizeSimInput,
  summarizeSim,
};
