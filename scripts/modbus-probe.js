#!/usr/bin/env node
'use strict';

/**
 * Raw Modbus probe — TCP (via bridge) or local RTU serial.
 * Usage:
 *   node scripts/modbus-probe.js --tcp 192.168.1.176:1502 --slave 1
 *   node scripts/modbus-probe.js --serial /dev/ttyLP6 --baud 9600 --slave 1
 */

const ModbusRTU = require('modbus-serial');

function parseArgs(argv) {
  const opts = { slave: 1, baud: 9600, parity: 'none', timeoutMs: 3000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tcp' && argv[i + 1]) {
      const [host, port] = argv[++i].split(':');
      opts.host = host;
      opts.port = Number(port) || 502;
      opts.mode = 'tcp';
    } else if (a === '--serial' && argv[i + 1]) {
      opts.serialPort = argv[++i];
      opts.mode = 'rtu';
    } else if (a === '--slave' && argv[i + 1]) opts.slave = Number(argv[++i]);
    else if (a === '--baud' && argv[i + 1]) opts.baud = Number(argv[++i]);
    else if (a === '--timeout' && argv[i + 1]) opts.timeoutMs = Number(argv[++i]);
  }
  return opts;
}

async function tryRead(label, fn) {
  const t0 = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - t0;
    const data = res?.data ?? res;
    console.log(`OK  ${label} (${ms}ms): ${JSON.stringify(data)}`);
    return { ok: true, data, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`ERR ${label} (${ms}ms): ${e.message || e}`);
    return { ok: false, error: e.message || String(e), ms };
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.mode) {
    console.error('Specify --tcp host:port or --serial /dev/ttyX');
    process.exit(2);
  }

  const client = new ModbusRTU();
  client.setTimeout(opts.timeoutMs);

  console.log('Modbus probe');
  console.log(`  mode=${opts.mode} slave=${opts.slave} timeout=${opts.timeoutMs}ms`);
  if (opts.mode === 'tcp') console.log(`  tcp=${opts.host}:${opts.port}`);
  else console.log(`  serial=${opts.serialPort} baud=${opts.baud} parity=${opts.parity}`);

  try {
    if (opts.mode === 'tcp') {
      await client.connectTCP(opts.host, { port: opts.port });
    } else {
      await client.connectRTUBuffered(opts.serialPort, {
        baudRate: opts.baud,
        parity: opts.parity,
        stopBits: 1,
      });
    }
    client.setID(opts.slave);
    console.log('  connected\n');

    const results = {};
    results.coils_0_8 = await tryRead('FC01 readCoils @0 x8', () => client.readCoils(0, 8));
    await sleep(80);
    results.discrete_0_8 = await tryRead('FC02 readDiscreteInputs @0 x8', () => client.readDiscreteInputs(0, 8));
    await sleep(80);
    results.hold_4000 = await tryRead('FC03 readHoldingRegisters @0x4000 x1 (device addr)', () => client.readHoldingRegisters(0x4000, 1));
    await sleep(80);
    results.hold_8000 = await tryRead('FC03 readHoldingRegisters @0x8000 x1 (fw version)', () => client.readHoldingRegisters(0x8000, 1));

    const ok = Object.values(results).filter((r) => r.ok).length;
    const total = Object.keys(results).length;
    console.log(`\nSummary: ${ok}/${total} reads succeeded`);
    process.exitCode = ok === total ? 0 : 1;
  } catch (e) {
    console.error(`Connect failed: ${e.message || e}`);
    process.exitCode = 2;
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main();
