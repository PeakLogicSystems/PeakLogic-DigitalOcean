'use strict';

const {
  BC_MAGIC,
  BC_VERSION,
  OP,
  BUILTIN,
  BUILTIN_ARGC,
  ACTION,
  TAG_TYPE,
  MODE_ID,
  META_PRESET,
  META_MODE,
  META_PID,
  META_GLOBAL,
  NO_TAG,
} = require('./stOpcodes');
const { inferTagType } = require('../parc/optaTagMeta');
const { isGlobalTagMeta, globalBaseType } = require('../parc/globalTagMeta');

class BytecodeWriter {
  constructor() {
    this.parts = [];
    this.length = 0;
  }

  u8(v) {
    const b = Buffer.alloc(1);
    b.writeUInt8(v & 0xff, 0);
    this.parts.push(b);
    this.length += 1;
  }

  u16(v) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v & 0xffff, 0);
    this.parts.push(b);
    this.length += 2;
  }

  f32(v) {
    const b = Buffer.alloc(4);
    b.writeFloatLE(Number(v) || 0, 0);
    this.parts.push(b);
    this.length += 4;
  }

  u32(v) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.parts.push(b);
    this.length += 4;
  }

  bytes(buf) {
    this.parts.push(buf);
    this.length += buf.length;
  }

  patchU16(at, v) {
    let off = 0;
    for (const p of this.parts) {
      if (at >= off && at + 2 <= off + p.length) {
        p.writeUInt16LE(v & 0xffff, at - off);
        return;
      }
      off += p.length;
    }
    throw new Error(`patchU16 out of range ${at}`);
  }

  build() {
    return Buffer.concat(this.parts, this.length);
  }
}

function tagTypeCode(type) {
  const t = String(type || 'BOOL').toUpperCase();
  const globalBase = globalBaseType({ type: t });
  if (globalBase) return tagTypeCode(globalBase);
  if (t === 'INT') return TAG_TYPE.INT;
  if (t === 'REAL') return TAG_TYPE.REAL;
  if (t === 'TIMER') return TAG_TYPE.TIMER;
  if (t === 'COUNTER') return TAG_TYPE.COUNTER;
  if (t === 'PID') return TAG_TYPE.PID;
  if (t === 'AVG') return TAG_TYPE.AVG;
  if (t === 'FLOW') return TAG_TYPE.FLOW;
  if (t === 'ALT') return TAG_TYPE.ALT;
  if (t === 'RMOTOR') return TAG_TYPE.RMOTOR;
  return TAG_TYPE.BOOL;
}

function modeId(mode) {
  if (!mode) return null;
  const m = String(mode).toUpperCase();
  return Object.prototype.hasOwnProperty.call(MODE_ID, m) ? MODE_ID[m] : null;
}

function writeTagMeta(w, tag) {
  const type = tagTypeCode(tag.type || inferTagType(tag.id));
  w.u8(type);
  let flags = 0;
  if (tag.preset != null) flags |= META_PRESET;
  if (tag.mode && modeId(tag.mode) != null) flags |= META_MODE;
  if (type === TAG_TYPE.PID && (tag.kp != null || tag.ki != null || tag.kd != null)) flags |= META_PID;
  if (isGlobalTagMeta(tag)) flags |= META_GLOBAL;
  w.u8(flags);
  if (flags & META_PRESET) w.u32(Math.trunc(Number(tag.preset) || 0));
  if (flags & META_MODE) w.u8(modeId(tag.mode));
  if (flags & META_PID) {
    w.f32(tag.kp ?? 0.5);
    w.f32(tag.ki ?? 0.1);
    w.f32(tag.kd ?? 0);
    w.f32(tag.outMin ?? 0);
    w.f32(tag.outMax ?? 1023);
  }
}

const MAX_TRACE_POINTS = 96;

function exprTraceKind(node) {
  if (!node) return 'num';
  if (node.type === 'un' && node.op === 'NOT') return 'bool';
  if (node.type === 'bin') {
    if (node.op === 'AND' || node.op === 'OR') return 'bool';
    if (['>', '<', '=', '>=', '<=', '<>'].includes(node.op)) return 'bool';
  }
  if (node.type === 'call') {
    const n = String(node.name || '');
    if (['IsON', 'IsOFF', 'TimerDone', 'TimerRun', 'CounterDone', 'PidAutoMode', 'AvgReady', 'FlowReady', 'AltReady', 'AltFault', 'OneShot', 'AltOffActive', 'AltHighActive', 'AltLowActive', 'AltLow2Active', 'AltPumpUp', 'AltPumpDown'].includes(n)) {
      return 'bool';
    }
    if (n === 'WithInLimits') return 'bool';
  }
  return 'num';
}

function addTracePoint(traceMap, span, kind, tag) {
  if (!span || span.start == null || span.end == null) return null;
  if (!traceMap._dedupe) traceMap._dedupe = new Map();
  const key = `${span.start}:${span.end}:${kind}:${tag || ''}`;
  const existing = traceMap._dedupe.get(key);
  if (existing != null) return existing;
  if (traceMap.length >= MAX_TRACE_POINTS) return null;
  const idx = traceMap.length;
  const row = { k: kind, s: span.start, e: span.end };
  if (kind === 'out' && tag) row.t = tag;
  traceMap.push(row);
  traceMap._dedupe.set(key, idx);
  return idx;
}

function emitTracePeek(w, traceMap, span, kind, tag) {
  const idx = addTracePoint(traceMap, span, kind, tag);
  if (idx == null) return;
  w.u8(OP.TRACE_PEEK);
  w.u16(idx);
}

function compileExpr(node, w, tagIndex, traceMap) {
  if (!node) {
    w.u8(OP.PUSH_I16);
    w.u16(0);
    return;
  }
  switch (node.type) {
    case 'num':
      if (Number.isInteger(node.value)) {
        w.u8(OP.PUSH_I16);
        w.u16(node.value & 0xffff);
      } else {
        w.u8(OP.PUSH_F32);
        w.f32(node.value);
      }
      break;
    case 'tag': {
      const idx = tagIndex.get(node.name);
      if (idx == null) throw new Error(`Unknown tag ${node.name}`);
      w.u8(OP.PUSH_TAG);
      w.u16(idx);
      break;
    }
    case 'call': {
      const id = BUILTIN[node.name];
      if (id == null) throw new Error(`Unknown builtin ${node.name}`);
      const argc = BUILTIN_ARGC[node.name] || 0;
      const args = node.args || [];
      if (args.length !== argc) {
        throw new Error(`${node.name} expects ${argc} args, got ${args.length}`);
      }
      for (const a of args) {
        if (typeof a === 'string') {
          const idx = tagIndex.get(a);
          if (idx == null) throw new Error(`Unknown tag ${a}`);
          w.u8(OP.PUSH_TAG);
          w.u16(idx);
        } else {
          compileExpr(a, w, tagIndex, traceMap);
        }
      }
      w.u8(OP.CALL);
      w.u8(id);
      break;
    }
    case 'un':
      compileExpr(node.arg, w, tagIndex, traceMap);
      if (node.op === 'NOT') w.u8(OP.NOT);
      else if (node.op === 'NEG') w.u8(OP.NEG);
      else throw new Error(`Unknown unary ${node.op}`);
      break;
    case 'bin':
      compileExpr(node.left, w, tagIndex, traceMap);
      compileExpr(node.right, w, tagIndex, traceMap);
      switch (node.op) {
        case 'AND': w.u8(OP.AND); break;
        case 'OR': w.u8(OP.OR); break;
        case '+': w.u8(OP.ADD); break;
        case '-': w.u8(OP.SUB); break;
        case '*': w.u8(OP.MUL); break;
        case '/': w.u8(OP.DIV); break;
        case '%': w.u8(OP.MOD); break;
        case '>': w.u8(OP.GT); break;
        case '<': w.u8(OP.LT); break;
        case '=': w.u8(OP.EQ); break;
        case '>=': w.u8(OP.GE); break;
        case '<=': w.u8(OP.LE); break;
        case '<>': w.u8(OP.NE); break;
        default: throw new Error(`Unknown binary ${node.op}`);
      }
      break;
    default:
      throw new Error(`Cannot compile expr type ${node.type}`);
  }
  emitTracePeek(w, traceMap, node.span, exprTraceKind(node));
}

function tagIdx(tagIndex, name) {
  const idx = tagIndex.get(name);
  if (idx == null) throw new Error(`Unknown tag ${name}`);
  return idx;
}

function compileSetInt(stmt, w, tagIndex, traceMap) {
  compileExpr(stmt.valueExpr, w, tagIndex, traceMap);
  w.u8(OP.STORE_TAG);
  w.u16(tagIdx(tagIndex, stmt.tag));
}

function compileAction(stmt, w, tagIndex, traceMap) {
  const id = ACTION[stmt.name];
  if (id == null) throw new Error(`Unknown action ${stmt.name}`);
  w.u8(OP.ACTION);
  w.u8(id);
  w.u16(tagIdx(tagIndex, stmt.tag));
  w.u16(stmt.inputTag ? tagIdx(tagIndex, stmt.inputTag) : NO_TAG);
  if (['AltOnline', 'AltUnitOut', 'AltLeadSel', 'AltLagSel', 'AltLag2Sel'].includes(stmt.name)) {
    w.u8(Math.max(1, Math.min(4, Math.trunc(stmt.unitIndex ?? 1))));
  }
  if (stmt.name === 'AltLevelBands') {
    const band = (node) => {
      if (node?.type !== 'num') throw new Error('AltLevelBands requires numeric literal bounds');
      w.f32(node.value);
    };
    band(stmt.levelLowLo);
    band(stmt.levelLowHi);
    band(stmt.levelHighLo);
    band(stmt.levelHighHi);
  }
  if (stmt.tagSpan && (stmt.name === 'TurnON' || stmt.name === 'TurnOFF')) {
    w.u8(OP.PUSH_TAG);
    w.u16(tagIdx(tagIndex, stmt.tag));
    w.u8(OP.CALL);
    w.u8(BUILTIN.IsON);
    emitTracePeek(w, traceMap, stmt.tagSpan, 'out', stmt.tag);
  }
}

function compileBlock(stmts, w, tagIndex, traceMap) {
  for (const s of stmts || []) compileStmt(s, w, tagIndex, traceMap);
}

function compileIf(stmt, w, tagIndex, traceMap) {
  const branches = [{ cond: stmt.cond, body: stmt.thenBody }];
  for (const e of stmt.elsif || []) branches.push({ cond: e.cond, body: e.body });

  const branchStarts = [];
  const falseJumps = [];
  const endJumps = [];

  for (const branch of branches) {
    branchStarts.push(w.length);
    compileExpr(branch.cond, w, tagIndex, traceMap);
    const jmpFalseAt = w.length;
    w.u8(OP.JMP_IFNOT);
    w.u16(0);
    falseJumps.push(jmpFalseAt);
    compileBlock(branch.body, w, tagIndex, traceMap);
    const jmpEndAt = w.length;
    w.u8(OP.JMP);
    w.u16(0);
    endJumps.push(jmpEndAt);
  }

  const elseStart = w.length;
  compileBlock(stmt.elseBody, w, tagIndex, traceMap);
  const end = w.length;

  for (let i = 0; i < falseJumps.length; i++) {
    const target = i + 1 < branches.length ? branchStarts[i + 1] : elseStart;
    w.patchU16(falseJumps[i] + 1, target - (falseJumps[i] + 3));
  }
  for (const jmpEndAt of endJumps) {
    w.patchU16(jmpEndAt + 1, end - (jmpEndAt + 3));
  }
}

function compileStmt(stmt, w, tagIndex, traceMap) {
  if (stmt.type === 'action') {
    if (stmt.name === 'SetInt') {
      compileSetInt(stmt, w, tagIndex, traceMap);
      return;
    }
    compileAction(stmt, w, tagIndex, traceMap);
    return;
  }
  if (stmt.type === 'if') {
    compileIf(stmt, w, tagIndex, traceMap);
    return;
  }
  throw new Error(`Cannot compile stmt type ${stmt.type}`);
}

/**
 * Compile ST AST + tag table to MVBC binary.
 * @param {object} ast program AST
 * @param {string[]} tagIds ordered tag ids
 * @param {object[]} tags tag meta rows (parallel to tagIds)
 */
function compileProgramBytecode(ast, tagIds, tags) {
  if (!ast || ast.type !== 'program') throw new Error('Expected program AST');
  const tagIndex = new Map(tagIds.map((id, i) => [id, i]));
  const metaById = new Map((tags || []).map((t) => [t.id, t]));
  const traceMap = [];

  const code = new BytecodeWriter();
  compileBlock(ast.body, code, tagIndex, traceMap);
  code.u8(OP.END);
  const codeBuf = code.build();

  const header = new BytecodeWriter();
  header.bytes(BC_MAGIC);
  header.u8(BC_VERSION);
  header.u8(0);
  header.u16(tagIds.length);
  header.u16(codeBuf.length);

  for (const id of tagIds) {
    const name = Buffer.from(String(id), 'utf8');
    if (name.length === 0 || name.length > 31) throw new Error(`Invalid tag name ${id}`);
    header.u8(name.length);
    header.bytes(name);
    const meta = metaById.get(id) || { id, type: inferTagType(id) };
    writeTagMeta(header, meta);
  }
  header.bytes(codeBuf);
  const cleanTraceMap = traceMap.map((row) => {
    const out = { k: row.k, s: row.s, e: row.e };
    if (row.t) out.t = row.t;
    return out;
  });
  return { bytecode: header.build(), traceMap: cleanTraceMap };
}

function bytecodeToBase64(buf) {
  return Buffer.from(buf).toString('base64');
}

function estimateBytecodeBytes(ast, tagIds, tags) {
  return compileProgramBytecode(ast, tagIds, tags).bytecode.length;
}

/** Parse MVBC binary header for code/data breakdown (matches firmware programStats). */
function parseBytecodeStats(buf) {
  if (!buf || buf.length < 10) return null;
  if (buf.toString('ascii', 0, 4) !== BC_MAGIC.toString()) return null;
  const tagCount = buf.readUInt16LE(6);
  const codeBytes = buf.readUInt16LE(8);
  const totalBytes = buf.length;
  const dataBytes = totalBytes - codeBytes;
  const maxBytes = 16384;
  return {
    tagCount,
    codeBytes,
    dataBytes,
    totalBytes,
    maxBytes,
    headroom: Math.max(0, maxBytes - totalBytes),
    pct: Math.min(100, Math.round((totalBytes * 100) / maxBytes)),
  };
}

function parseBytecodeStatsBase64(bc64) {
  if (!bc64) return null;
  try {
    return parseBytecodeStats(Buffer.from(bc64, 'base64'));
  } catch {
    return null;
  }
}

module.exports = {
  compileProgramBytecode,
  bytecodeToBase64,
  estimateBytecodeBytes,
  parseBytecodeStats,
  parseBytecodeStatsBase64,
  BytecodeWriter,
  MAX_TRACE_POINTS,
};
