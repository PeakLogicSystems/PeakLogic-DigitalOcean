'use strict';

const ModbusRTU = require('modbus-serial');

function readWords(client, table, address, count) {
  if (table === 'input') return client.readInputRegisters(address, count);
  if (table === 'discrete') return client.readDiscreteInputs(address, count);
  if (table === 'coil') return client.readCoils(address, count);
  return client.readHoldingRegisters(address, count);
}

function writeWords(client, table, address, data) {
  if (table === 'coil') {
    if (data.length === 1) return client.writeCoil(address, !!data[0]);
    return client.writeCoils(address, data);
  }
  if (data.length === 1) return client.writeRegister(address, data[0]);
  return client.writeRegisters(address, data);
}

async function connectSide(side, type) {
  const client = new ModbusRTU();
  client.setTimeout(side.timeoutMs || 2000);
  if (type === 'tcp') {
    await client.connectTCP(side.host || '127.0.0.1', { port: side.port || 502 });
  } else {
    await client.connectRTUBuffered(side.serialPort || '/dev/ttyUSB0', {
      baudRate: side.baud || 9600,
      parity: side.parity || 'none',
      stopBits: side.stopBits || 1,
    });
  }
  client.setID(side.slaveId || 1);
  return client;
}

async function moveBlock(rtuClient, tcpClient, map) {
  const table = map.table || 'holding';
  const count = map.count || 1;
  const res = await readWords(rtuClient, table, map.rtuAddress || 0, count);
  await writeWords(tcpClient, table, map.tcpAddress || 0, res.data);
  return { read: res.data, count };
}

async function moveOnce(cfg) {
  const rtu = await connectSide(cfg.rtu, 'rtu');
  const tcp = await connectSide(cfg.tcp, 'tcp');
  const results = [];
  try {
    for (const map of cfg.moveMaps || []) {
      results.push(await moveBlock(rtu, tcp, map));
    }
  } finally {
    try { rtu.close(); } catch { /* ignore */ }
    try { tcp.close(); } catch { /* ignore */ }
  }
  return results;
}

async function moveReverse(cfg) {
  const rtu = await connectSide(cfg.rtu, 'rtu');
  const tcp = await connectSide(cfg.tcp, 'tcp');
  const results = [];
  try {
    for (const map of cfg.moveMaps || []) {
      const table = map.table || 'holding';
      const count = map.count || 1;
      const res = await readWords(tcp, table, map.tcpAddress || 0, count);
      await writeWords(rtu, table, map.rtuAddress || 0, res.data);
      results.push({ read: res.data, count });
    }
  } finally {
    try { rtu.close(); } catch { /* ignore */ }
    try { tcp.close(); } catch { /* ignore */ }
  }
  return results;
}

module.exports = { moveOnce, moveReverse, connectSide, readWords, writeWords };
