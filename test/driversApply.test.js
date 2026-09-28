'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.PEAKLOGIC_CONFIG_URI = 'memory';
process.env.PEAKLOGIC_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-apply-'));
const configStore = require('../src/configStore');
configStore.initMemorySync();

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createDriverRoutes } = require('../src/api/routes/drivers');

function mockDeps() {
  const drivers = [];
  const tags = [];
  return {
    driverManager: {
      list: () => drivers.slice(),
      save: (list) => {
        drivers.length = 0;
        drivers.push(...list);
      },
      rebuild: async () => {},
      linkMqttParcDriversIfHubLive: async () => [],
    },
    tagStore: {
      list: () => tags.slice(),
      replaceAll: (list) => {
        tags.length = 0;
        tags.push(...list);
      },
      count: () => tags.length,
    },
    _drivers: drivers,
    _tags: tags,
  };
}

async function postApply(deps, body) {
  const app = express();
  app.use(express.json());
  app.use('/api', createDriverRoutes(deps));
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/devices/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

describe('POST /devices/apply', () => {
  after(async () => {
    const { getMqttCentralHub } = require('../src/parc/mqttCentralHub');
    const { registry } = require('../src/parc/deviceRegistry');
    await getMqttCentralHub(registry).stop().catch(() => {});
  });

  it('first module uses DI1–DI16 on slave 1', async () => {
    const deps = mockDeps();
    const r = await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'modbus_rtu',
      serialPort: 'COM3',
      replaceTags: false,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.slaveId, 1);
    assert.equal(deps._tags.length, 16);
    assert.equal(deps._tags[0].id, 'DI1');
    assert.equal(deps._tags[15].id, 'DI16');
    assert.ok(deps._tags.every((t) => t.driverAddress.slaveId === 1));
  });

  it('two 16-point input modules create DI1–DI32', async () => {
    const deps = mockDeps();
    await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'modbus_rtu',
      serialPort: 'COM3',
      replaceTags: false,
    });
    const second = await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'modbus_rtu',
      serialPort: 'COM3',
      replaceTags: false,
    });
    assert.equal(second.status, 200);
    assert.equal(second.data.slaveId, 2);
    assert.equal(deps._tags.length, 32);
    const di = deps._tags.filter((t) => /^DI\d+$/.test(t.id)).map((t) => t.id);
    assert.deepEqual(di, Array.from({ length: 32 }, (_, i) => `DI${i + 1}`));
    assert.equal(deps._tags.find((t) => t.id === 'DI17')?.driverAddress.slaveId, 2);
    assert.equal(deps._tags.find((t) => t.id === 'DI1')?.driverAddress.slaveId, 1);
  });

  it('waveshare then datexel continues DI after eight inputs', async () => {
    const deps = mockDeps();
    await postApply(deps, {
      presetId: 'waveshare_rtu_io_8ch',
      driverId: 'mbus1',
      replaceTags: false,
    });
    const second = await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'mbus1',
      replaceTags: false,
    });
    assert.equal(second.status, 200);
    assert.equal(deps._tags.find((t) => t.id === 'DI8')?.driverAddress.slaveId, 1);
    assert.equal(deps._tags.find((t) => t.id === 'DI9')?.driverAddress.slaveId, 2);
    assert.equal(deps._tags.find((t) => t.id === 'DI24')?.driverAddress.slaveId, 2);
  });

  it('dedicated S::CAN template ignores wrong baud from client', async () => {
    const deps = mockDeps();
    const r = await postApply(deps, {
      presetId: 'scan_spectrolyser',
      serialPort: 'COM3',
      baud: 9600,
      slaveId: 1,
      parity: 'none',
      replaceTags: false,
    });
    assert.equal(r.status, 200);
    const scanDrv = deps._drivers.find((d) => d.id === 'scan_spec');
    assert.equal(scanDrv.baud, 38400);
    assert.equal(scanDrv.parity, 'odd');
    assert.equal(scanDrv.slaveId, 4);
  });

  it('dedicated S::CAN template creates scan_spec driver and explicit tags', async () => {
    const deps = mockDeps();
    deps.driverManager.save([{
      id: 'mbus1',
      type: 'modbus_rtu',
      enabled: true,
      serialPort: 'COM3',
      baud: 9600,
      slaveId: 1,
    }]);
    const r = await postApply(deps, {
      presetId: 'scan_spectrolyser',
      serialPort: 'COM3',
      replaceTags: false,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.driver.id, 'scan_spec');
    const scanDrv = deps._drivers.find((d) => d.id === 'scan_spec');
    assert.equal(scanDrv.baud, 38400);
    assert.equal(scanDrv.parity, 'odd');
    assert.equal(scanDrv.slaveId, 4);
    assert.equal(r.data.tagsAdded, 27);
    assert.ok(deps._tags.some((t) => t.id === 'PARM1_VAL' && t.driverId === 'scan_spec'));
    assert.equal(deps._tags.find((t) => t.id === 'PARM1_VAL')?.driverAddress.slaveId, 4);
    assert.equal(deps._drivers.length, 2);
    assert.ok(deps._drivers.some((d) => d.id === 'scan_spec'));
  });

  it('con::cube template adds parameter groups of 4 and appends next block', async () => {
    const deps = mockDeps();
    const first = await postApply(deps, {
      presetId: 'scan_concube_tcp',
      host: '192.168.1.10',
      paramGroups: 1,
      replaceTags: false,
    });
    assert.equal(first.status, 200);
    assert.equal(first.data.tagsAdded, 10);
    assert.ok(deps._tags.some((t) => t.id === 'CUBE_DEV_STATUS' && t.driverId === 'scan_cube_tcp'));
    assert.ok(deps._tags.some((t) => t.id === 'PARM4_VAL'));
    assert.ok(!deps._tags.some((t) => t.id === 'PARM5_VAL'));

    const second = await postApply(deps, {
      presetId: 'scan_concube_tcp',
      paramGroups: 1,
      replaceTags: false,
    });
    assert.equal(second.status, 200);
    assert.equal(second.data.tagsAdded, 8);
    assert.ok(deps._tags.some((t) => t.id === 'PARM5_VAL'));
    assert.ok(deps._tags.some((t) => t.id === 'PARM8_VAL'));
    assert.equal(deps._tags.filter((t) => t.driverId === 'scan_cube_tcp').length, 18);
  });

  it('replaceTags clears prior tags on the driver', async () => {
    const deps = mockDeps();
    await postApply(deps, {
      presetId: 'waveshare_rtu_io_8ch',
      driverId: 'mbus1',
      replaceTags: false,
    });
    const replaced = await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'mbus1',
      replaceTags: true,
    });
    assert.equal(replaced.status, 200);
    assert.equal(deps._tags.length, 16);
    assert.ok(deps._tags.some((t) => t.id === 'DI1'));
    assert.equal(deps._tags.find((t) => t.id === 'DI17'), undefined);
  });

  it('returns 409 when merged tags conflict with existing ids', async () => {
    const deps = mockDeps();
    deps._tags.push({ id: 'DI1', driverId: 'other', type: 'BOOL', role: 'input' });
    deps._drivers.push({
      id: 'mbus1',
      type: 'modbus_rtu',
      enabled: true,
      serialPort: 'COM3',
      baud: 9600,
      slaveId: 1,
    });
    const r = await postApply(deps, {
      presetId: 'datexel_dat10148',
      driverId: 'mbus1',
      serialPort: 'COM3',
      replaceTags: false,
    });
    assert.equal(r.status, 409);
    assert.match(r.data.error, /Tag id already in use: DI1/);
  });

  it('apply mqtt_parc preset adds driver (tags sync separately)', async () => {
    const deps = mockDeps();
    const r = await postApply(deps, {
      presetId: 'arduino_opta_parc',
      deviceId: 'opta_0123abcdef',
      driverId: 'motor_skid',
      replaceTags: false,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.driver.type, 'mqtt_parc');
    assert.equal(r.data.driver.id, 'motor_skid');
    assert.equal(r.data.tagsAdded, 0);
    assert.ok(r.data.tagsFromDevice);
    assert.ok(deps._drivers.some((d) => d.id === 'motor_skid' && d.type === 'mqtt_parc'));
  });

  it('returns before slow driver rebuild completes', async () => {
    const deps = mockDeps();
    let rebuildDone;
    deps.driverManager.rebuild = () => new Promise((resolve) => {
      rebuildDone = resolve;
    });
    const started = Date.now();
    const r = await Promise.race([
      postApply(deps, {
        presetId: 'datexel_dat10148',
        driverId: 'modbus_rtu',
        serialPort: 'COM3',
        replaceTags: false,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('apply hung')), 500)),
    ]);
    assert.equal(r.status, 200);
    assert.ok(Date.now() - started < 500, 'apply should not wait for rebuild');
    rebuildDone?.();
  });
});
