'use strict';

/**
 * One-shot: merge default VPB/VPI/VPR into fixture tag JSON and rewrite .st programs.
 * Run: node scripts/migrate-st-default-tags.js
 */

const fs = require('fs');
const path = require('path');
const { ST_DIR } = require('../src/config');
const { buildDefaultMemoryTags } = require('../src/tags/defaultMemoryTags');

const FIXTURES = path.join(ST_DIR, 'fixtures');

/** Legacy generic tag id → default memory tag (logic/modbus/mqtt samples). */
const GENERIC_MAP = {
  DI: 'VPB1',
  DI2: 'VPB2',
  Q: 'VPB3',
  Q2: 'VPB4',
  ALM: 'VPB5',
  AI: 'VPI1',
  MQTT_DI: 'VPB1',
  MQTT_AI: 'VPI1',
  MQTT_DO: 'VPB6',
  AI1: 'VPI1',
  AO1: 'VPR1',
};

/** Waveshare channel n: DIn → VPBn, Qn → VPB(10+n) internal latch before coil */
function waveshareMirrorBlock(n) {
  const di = `DI${n}`;
  const q = `Q${n}`;
  const vpbIn = `VPB${n}`;
  const vpbOut = `VPB${10 + n}`;
  return `IF IsON(${di}) THEN TurnON(${vpbIn}); ELSE TurnOFF(${vpbIn}); END_IF;
IF IsON(${vpbIn}) THEN TurnON(${q}); ELSE TurnOFF(${q}); END_IF;
IF IsON(${vpbIn}) THEN TurnON(${vpbOut}); ELSE TurnOFF(${vpbOut}); END_IF;`;
}

function listStFiles(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...listStFiles(full, rel));
    else if (name.endsWith('.st')) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function tagById(tags, id) {
  return tags.find((t) => t.id === id);
}

function setTag(tags, id, patch) {
  const t = tagById(tags, id);
  if (t) Object.assign(t, patch);
}

function mergeDefaults(extraTags = []) {
  const defaults = buildDefaultMemoryTags();
  const byId = new Map(defaults.map((t) => [t.id, { ...t }]));
  for (const t of extraTags) byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildLogicFixture() {
  return mergeDefaults([
    { id: 'VPB1', type: 'BOOL', role: 'input', value: false, driverId: 'mock1', driverAddress: { channel: 'DI' } },
    { id: 'VPB2', type: 'BOOL', role: 'input', value: false, driverId: 'mock1', driverAddress: { channel: 'DI2' } },
    { id: 'VPI1', type: 'INT', role: 'input', value: 50, wordWidth: 16, driverId: 'mock1', driverAddress: { channel: 'AI' } },
    { id: 'VPB3', type: 'BOOL', role: 'output', value: false },
    { id: 'VPB4', type: 'BOOL', role: 'output', value: false },
    { id: 'VPB5', type: 'BOOL', role: 'output', value: false },
    { id: 'TMR', type: 'TIMER', role: 'fb', wordWidth: 16, preset: 1000, mode: 'TON', value: false, fb: { input: false, elapsed: 0, done: false } },
    { id: 'CTR', type: 'COUNTER', role: 'fb', wordWidth: 16, preset: 5, mode: 'CTU', value: 0, fb: { count: 0, done: false } },
    { id: 'PID1', type: 'PID', role: 'fb', preset: 50, mode: 'PI', kp: 1, ki: 0.5, kd: 0, outMin: 0, outMax: 100, value: 0, fb: { pv: 0, sp: 50, out: 0, enabled: true } },
    { id: 'AVG1', type: 'AVG', role: 'fb', preset: 10, mode: 'MOV', value: 0, fb: { pv: 0, avg: 0, samples: [] } },
  ]);
}

function buildModbusFixture() {
  return mergeDefaults([
    { id: 'VPB1', type: 'BOOL', role: 'input', value: false, driverId: 'mb1', driverAddress: { table: 'discrete', address: 0 } },
    { id: 'VPB2', type: 'BOOL', role: 'input', value: false, driverId: 'mb1', driverAddress: { table: 'discrete', address: 1 } },
    { id: 'VPI1', type: 'INT', role: 'input', value: 0, wordWidth: 16, signed: true, driverId: 'mb1', driverAddress: { table: 'input', address: 0 } },
    { id: 'VPB3', type: 'BOOL', role: 'output', value: false, driverId: 'mb1', driverAddress: { table: 'coil', address: 0 } },
    { id: 'VPB4', type: 'BOOL', role: 'output', value: false, driverId: 'mb1', driverAddress: { table: 'coil', address: 1 } },
    { id: 'VPB5', type: 'BOOL', role: 'output', value: false, driverId: 'mb1', driverAddress: { table: 'coil', address: 2 } },
  ]);
}

function buildMqttFixture() {
  return mergeDefaults([
    { id: 'VPB1', type: 'BOOL', role: 'input', value: false, driverId: 'mqtt1', driverAddress: { topic: 'peaklogic/in/bool', payloadTemplate: 'bool' } },
    { id: 'VPI1', type: 'INT', role: 'input', value: 0, driverId: 'mqtt1', driverAddress: { topic: 'peaklogic/in/ai', payloadTemplate: 'number' } },
    { id: 'VPB3', type: 'BOOL', role: 'output', value: false },
    { id: 'VPB6', type: 'BOOL', role: 'output', value: false, driverId: 'mqtt1', driverAddress: { topic: 'peaklogic/out/do', payloadTemplate: 'bool' } },
  ]);
}

function buildWaveshareFixture() {
  const io = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'tags.waveshare_rtu_8ch.json'), 'utf8'));
  const extra = [
    ...io,
    { id: 'CTR', type: 'COUNTER', role: 'fb', preset: 10, mode: 'CTU', value: 0, fb: { count: 0 } },
    { id: 'PID1', type: 'PID', role: 'fb', preset: 50, mode: 'P', kp: 2, ki: 0, kd: 0, outMin: 0, outMax: 100, value: 0, fb: {} },
    { id: 'AVG1', type: 'AVG', role: 'fb', preset: 10, mode: 'MOV', value: 0, fb: {} },
  ];
  return mergeDefaults(extra);
}

function replaceGenericTags(src) {
  let out = src;
  const order = ['DI2', 'Q2', 'MQTT_DI', 'MQTT_AI', 'MQTT_DO', 'AI1', 'AO1', 'DI', 'ALM', 'AI', 'Q'];
  for (const old of order) {
    const neu = GENERIC_MAP[old];
    if (!neu) continue;
    const re = new RegExp(`\\b${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    out = out.replace(re, neu);
  }
  return out;
}

function migrateWaveshareSt(src, rel) {
  if (!/waveshare/i.test(rel)) return replaceGenericTags(src);
  if (/^\s*TurnON\(Q\)\s*;?\s*$/m.test(src.trim()) && !/\bDI1\b/.test(src)) {
    return `(* Mirror DI1 -> VPB1 / VPB11, drive Q1 *)
${waveshareMirrorBlock(1)}`;
  }
  if (/\bDI[1-8]\b/.test(src)) {
    let out = '(* Default VPB memory mirrors Waveshare DI1–DI8 and Q1–Q8 *)\n';
    for (let n = 1; n <= 8; n++) {
      if (new RegExp(`\\bDI${n}\\b`).test(src)) out += `${waveshareMirrorBlock(n)}\n`;
    }
    out += replaceGenericTags(src.replace(/CounterCu\(CTR,\s*DI1\)/g, 'CounterCu(CTR, VPB1)'));
    if (out.includes('CounterCu(CTR, DI)')) {
      out = out.replace(/CounterCu\(CTR,\s*DI\)/g, 'CounterCu(CTR, VPB1)');
    }
    return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  return replaceGenericTags(src);
}

function migrateStContent(src, rel) {
  if (/\bVPB1\b/.test(src) && /\bDI1\b/.test(src)) return src;
  const category = rel.includes('/') ? rel.split('/')[0] : 'root';
  if (/waveshare/i.test(rel)) return migrateWaveshareSt(src, rel);
  if (category === 'logic' || category === 'modbus' || category === 'mqtt' || rel === 'program.st') {
    return replaceGenericTags(src);
  }
  return replaceGenericTags(src);
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(FIXTURES, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  writeJson('tags.logic.json', buildLogicFixture());
  writeJson('tags.modbus.json', buildModbusFixture());
  writeJson('tags.mqtt.json', buildMqttFixture());
  writeJson('tags.waveshare_rtu_8ch.json', buildWaveshareFixture());

  const files = listStFiles(ST_DIR);
  for (const rel of files) {
    const fp = path.join(ST_DIR, rel);
    const src = fs.readFileSync(fp, 'utf8');
    const next = migrateStContent(src, rel);
    if (next !== src) fs.writeFileSync(fp, `${next.replace(/\r\n/g, '\n')}`, 'utf8');
  }
  console.log(`Updated fixtures and ${files.length} .st files under ${ST_DIR}`);
}

main();
