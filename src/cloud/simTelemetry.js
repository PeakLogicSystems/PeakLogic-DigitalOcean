'use strict';

/** Build tenant-scoped Parc telemetry payloads for cloud sim runners. */

function buildOptaTags(tick) {
  const phase = tick / 10;
  const sine = Math.sin(phase);
  return [
    { id: 'I1', type: 'BOOL', role: 'input', value: tick % 2 === 0, quality: 'GOOD' },
    { id: 'I2', type: 'BOOL', role: 'input', value: tick % 4 < 2, quality: 'GOOD' },
    { id: 'DI1', type: 'BOOL', role: 'input', value: true, quality: 'GOOD' },
    { id: 'DI2', type: 'BOOL', role: 'input', value: tick % 6 >= 3, quality: 'GOOD' },
    { id: 'R1', type: 'BOOL', role: 'output', value: tick % 3 === 0, quality: 'GOOD' },
    { id: 'mA_AI3', type: 'REAL', role: 'input', value: 4 + (sine + 1) * 8, quality: 'GOOD' },
    { id: 'mA_AI4', type: 'REAL', role: 'input', value: 4 + (Math.cos(phase) + 1) * 8, quality: 'GOOD' },
    { id: 'scaled_AI3', type: 'REAL', role: 'input', value: Math.round((sine + 1) * 50), quality: 'GOOD' },
  ];
}

function buildModbusTags(tick, config = {}) {
  const registers = Array.isArray(config.registers) ? config.registers : [{ address: 40001, value: 0 }];
  return registers.map((reg, i) => ({
    id: `HR${reg.address ?? (40001 + i)}`,
    type: 'INT',
    role: 'input',
    value: Math.round(Number(reg.value ?? 0) + tick + i * 3),
    quality: 'GOOD',
  }));
}

function buildSimTelemetry(sim, tick = 0) {
  const deviceId = sim.mqttDeviceId;
  const base = {
    deviceId,
    name: sim.name,
    platform: sim.type === 'modbus' ? 'modbus-slave-sim' : 'arduino-opta',
    reportIntervalSec: Math.max(1, Math.round((sim.config?.intervalMs || 2000) / 1000)),
    runtime: { running: true, firmware: 'cloud-sim', deviceMode: 'simulated' },
    driverHealth: [{ id: 'mqtt', type: 'mqtt', connected: true, message: 'OK' }],
    meta: {
      source: 'peaklogic-cloud-sim',
      simId: sim.id,
      tenantId: sim.tenantId,
      simType: sim.type,
    },
  };

  if (sim.type === 'modbus') {
    return { ...base, tags: buildModbusTags(tick, sim.config) };
  }
  if (sim.type === 'mixed') {
    return {
      ...base,
      platform: 'mixed-sim',
      tags: [...buildOptaTags(tick), ...buildModbusTags(tick, sim.config)],
    };
  }
  return { ...base, tags: buildOptaTags(tick) };
}

module.exports = {
  buildOptaTags,
  buildModbusTags,
  buildSimTelemetry,
};
