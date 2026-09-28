'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

/** Mirrors firmware extractCmdMeta in mv_mqtt.cpp (v2.3.21+). */
function extractCmdMeta(json) {
  function headerEnd(text) {
    const i = text.indexOf('"body"');
    return i >= 0 ? i : text.length;
  }
  function field(text, key) {
    const keyLen = key.length;
    const limit = headerEnd(text);
    for (let i = 0; i < limit; i += 1) {
      if (text[i] !== '"') continue;
      if (text.slice(i + 1, i + 1 + keyLen) !== key || text[i + 1 + keyLen] !== '"') continue;
      let q = i + 1 + keyLen + 1;
      while (q < text.length && (text[q] === ' ' || text[q] === '\t')) q += 1;
      if (text[q] !== ':') continue;
      q += 1;
      while (q < text.length && (text[q] === ' ' || text[q] === '\t')) q += 1;
      if (text[q] !== '"') continue;
      q += 1;
      let end = q;
      while (end < text.length && text[end] !== '"') end += 1;
      const val = text.slice(q, end);
      return val || null;
    }
    return null;
  }
  const text = String(json ?? '');
  const id = field(text, 'id');
  const op = field(text, 'op');
  if (!id || !op) return null;
  return { id, op };
}

describe('extractCmdMeta (mirrors Opta firmware v2.3.21+)', () => {
  it('extracts id/op from runtime_status command', () => {
    const id = crypto.randomUUID();
    const json = JSON.stringify({ id, op: 'runtime_status', body: {} });
    const meta = extractCmdMeta(json);
    assert.equal(meta.id, id);
    assert.equal(meta.op, 'runtime_status');
  });

  it('extracts id/op from large put_program without parsing full JSON', () => {
    const id = crypto.randomUUID();
    const bc = 'A'.repeat(5000);
    const json = JSON.stringify({
      id,
      op: 'put_program',
      body: { bc, tagCount: 1, protocolVersion: 2, clientVersion: '1.0.0' },
    });
    assert.throws(() => JSON.parse(json.slice(0, 320)));
    const meta = extractCmdMeta(json);
    assert.equal(meta.id, id);
    assert.equal(meta.op, 'put_program');
  });

  it('returns null when id or op missing', () => {
    assert.equal(extractCmdMeta('{"op":"runtime_status","body":{}}'), null);
    assert.equal(extractCmdMeta('{"id":"x","body":{}}'), null);
  });
});
