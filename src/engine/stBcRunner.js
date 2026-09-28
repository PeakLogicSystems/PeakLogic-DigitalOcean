'use strict';

const {
  OP,
  NO_TAG,
  META_PRESET,
  META_MODE,
  META_PID,
} = require('./stOpcodes');
const { compileProgramBytecode } = require('./stBytecode');
const { collectProgramTagRefs } = require('./parser');
const { inferTagType } = require('../parc/optaTagMeta');

function asBool(v) {
  return !!v;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse MVBC header — tag table + code slice offsets (matches firmware mv_bc.cpp). */
function parseBcProgram(buf) {
  if (!buf || buf.length < 10) throw new Error('bc too short');
  const tagCount = buf.readUInt16LE(6);
  const codeLen = buf.readUInt16LE(8);
  let off = 10;
  const tagIds = [];
  for (let i = 0; i < tagCount; i++) {
    const nlen = buf.readUInt8(off++);
    tagIds.push(buf.slice(off, off + nlen).toString('utf8'));
    off += nlen;
    const flags = buf.readUInt8(off + 1);
    off += 2;
    if (flags & META_PRESET) off += 4;
    if (flags & META_MODE) off += 1;
    if (flags & META_PID) off += 20;
  }
  return { tagIds, codeOff: off, codeLen };
}

function compileLocalProgram(ast, tagStore) {
  const programRefs = collectProgramTagRefs(ast);
  const tagIds = [...new Set(programRefs)].sort();
  const storeById = new Map(tagStore.list().map((t) => [t.id, t]));
  const tags = tagIds.map((id) => {
    const t = storeById.get(id);
    return t ? { ...t } : { id, type: inferTagType(id) };
  });
  return compileProgramBytecode(ast, tagIds, tags);
}

function traceFromPeeks(traceMap, peekVals) {
  const trace = [];
  for (let i = 0; i < peekVals.length; i++) {
    if (peekVals[i] == null) continue;
    const m = traceMap[i];
    if (!m) continue;
    const isBool = m.k === 'bool' || m.k === 'out';
    trace.push({
      start: m.s,
      end: m.e,
      value: isBool ? asBool(peekVals[i]) : asNum(peekVals[i]),
      kind: m.k,
      ...(m.t ? { tag: m.t } : {}),
    });
  }
  return trace;
}

function evalBuiltin(id, pop, ctx, tagIds) {
  const tagIdx = (v) => tagIds[(v >>> 0) & 0xffff] || '';
  switch (id) {
    case 0: return asBool(ctx.getValue(tagIdx(pop()))) ? 1 : 0;
    case 1: return asBool(ctx.getValue(tagIdx(pop()))) ? 0 : 1;
    case 2: return ctx.getFb(tagIdx(pop()))?.done ? 1 : 0;
    case 3: return ctx.getFb(tagIdx(pop()))?.running ? 1 : 0;
    case 4: return ctx.getFb(tagIdx(pop()))?.done ? 1 : 0;
    case 5: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.count ?? ctx.getValue(name));
    }
    case 6: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.out ?? ctx.getValue(name));
    }
    case 7: return asNum(ctx.getFb(tagIdx(pop()))?.err);
    case 8: return ctx.getFb(tagIdx(pop()))?.enabled ? 1 : 0;
    case 9: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.avg ?? ctx.getValue(name));
    }
    case 10: return ctx.getFb(tagIdx(pop()))?.ready ? 1 : 0;
    case 11: return asNum(ctx.getFb(tagIdx(pop()))?.count);
    case 12: {
      const hi = pop();
      const lo = pop();
      const name = tagIdx(pop());
      const v = asNum(ctx.getValue(name));
      return (v >= lo && v <= hi) ? 1 : 0;
    }
    case 13: {
      const name = tagIdx(pop());
      const fired = ctx.oneShotFired;
      if (!fired || fired.has(name)) return 0;
      fired.add(name);
      return 1;
    }
    case 14: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.gpm ?? ctx.getValue(name));
    }
    case 15: return ctx.getFb(tagIdx(pop()))?.ready ? 1 : 0;
    case 16: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.activeUnit ?? ctx.getValue(name));
    }
    case 17: return ctx.getFb(tagIdx(pop()))?.ready ? 1 : 0;
    case 18: return ctx.getFb(tagIdx(pop()))?.fault ? 1 : 0;
    case 19: {
      const fb = ctx.getFb(tagIdx(pop()));
      return asNum((fb?.lagIndex ?? -1) + 1);
    }
    case 20: return ctx.getFb(tagIdx(pop()))?.offActive ? 1 : 0;
    case 21: return ctx.getFb(tagIdx(pop()))?.highActive ? 1 : 0;
    case 22: return ctx.getFb(tagIdx(pop()))?.lowActive ? 1 : 0;
    case 23: {
      const s = ctx.getFb(tagIdx(pop()))?.pumpStage;
      return (s === 'lag' || s === 'lag2' || s === 'up') ? 1 : 0;
    }
    case 24: {
      const s = ctx.getFb(tagIdx(pop()))?.pumpStage;
      return (s === 'high' || s === 'down') ? 1 : 0;
    }
    case 25: return ctx.getFb(tagIdx(pop()))?.low2Active ? 1 : 0;
    case 26: return ctx.getFb(tagIdx(pop()))?.fwdRun ? 1 : 0;
    case 27: return ctx.getFb(tagIdx(pop()))?.revRun ? 1 : 0;
    case 28: return ctx.getFb(tagIdx(pop()))?.fault ? 1 : 0;
    case 29: return ctx.getFb(tagIdx(pop()))?.reversing ? 1 : 0;
    case 30: {
      const name = tagIdx(pop());
      return asNum(ctx.getFb(name)?.status ?? ctx.getValue(name));
    }
    default: return 0;
  }
}

function runAction(id, tagIdx, inputIdx, unit, bands, ctx, tagIds) {
  const tag = tagIds[tagIdx] || '';
  const inputTag = inputIdx === NO_TAG ? null : (tagIds[inputIdx] || null);
  if (!tag) return;
  switch (id) {
    case 0: ctx.setBool(tag, true); break;
    case 1: ctx.setBool(tag, false); break;
    case 2: ctx.resetCounter(tag); break;
    case 3:
      if (inputTag) ctx.setCounterCu(tag, inputTag);
      else ctx.pulseCounterCu(tag);
      break;
    case 4:
      if (inputTag) ctx.setCounterCd(tag, inputTag);
      else ctx.pulseCounterCd(tag);
      break;
    case 5:
      if (inputTag) ctx.setTimerInput(tag, inputTag);
      else ctx.pulseTimerInput(tag, true);
      break;
    case 6:
      if (inputTag) ctx.setPidPv(tag, inputTag);
      break;
    case 7:
      if (inputTag) ctx.setPidSp(tag, inputTag);
      break;
    case 8:
      if (inputTag) ctx.setPidOut(tag, inputTag);
      break;
    case 9: ctx.setPidEnabled(tag, true); break;
    case 10: ctx.setPidEnabled(tag, false); break;
    case 11:
      if (inputTag) ctx.setAvgIn(tag, inputTag);
      break;
    case 12: ctx.resetAverage(tag); break;
    case 13:
      if (inputTag) ctx.setAvgOut(tag, inputTag);
      break;
    case 14:
      if (inputTag) ctx.setFlowCtr(tag, inputTag);
      break;
    case 15:
      if (inputTag) ctx.setFlowTmr(tag, inputTag);
      break;
    case 16:
      if (inputTag) ctx.setFlowK(tag, inputTag);
      break;
    case 17:
      if (inputTag) ctx.setFlowOut(tag, inputTag);
      break;
    case 18: ctx.setAltEnable(tag, inputTag); break;
    case 19:
      if (inputTag) ctx.setAltAdvance(tag, inputTag);
      else ctx.pulseAltAdvance(tag);
      break;
    case 20:
      if (inputTag) ctx.setAltAutoFault(tag, inputTag);
      break;
    case 21:
      if (inputTag) ctx.setAltLead(tag, inputTag);
      break;
    case 22:
      if (inputTag) ctx.setAltOnline(tag, unit, inputTag);
      break;
    case 23:
      if (inputTag) ctx.setAltUnitOut(tag, unit, inputTag);
      break;
    case 24:
      if (inputTag) ctx.setAltOff(tag, inputTag);
      break;
    case 25:
      if (inputTag) ctx.setAltHigh(tag, inputTag);
      break;
    case 26:
      if (inputTag) ctx.setAltLow(tag, inputTag);
      break;
    case 27:
      if (inputTag) ctx.setAltLeadSel(tag, unit, inputTag);
      break;
    case 28:
      if (inputTag) ctx.setAltLagSel(tag, unit, inputTag);
      break;
    case 29:
      if (inputTag) ctx.setAltLag2Sel(tag, unit, inputTag);
      break;
    case 30:
      if (inputTag) ctx.setAltLevel(tag, inputTag);
      break;
    case 31:
      if (bands) {
        ctx.setAltLevelBands(tag, {
          levelLowLo: { type: 'num', value: bands[0] },
          levelLowHi: { type: 'num', value: bands[1] },
          levelHighLo: { type: 'num', value: bands[2] },
          levelHighHi: { type: 'num', value: bands[3] },
        }, null);
      }
      break;
    case 32:
      if (inputTag) ctx.setAltLag2(tag, inputTag);
      break;
    case 33:
      if (inputTag) ctx.setRmtFwdCmd(tag, inputTag);
      break;
    case 34:
      if (inputTag) ctx.setRmtRevCmd(tag, inputTag);
      break;
    case 35:
      if (inputTag) ctx.setRmtFwdAux(tag, inputTag);
      break;
    case 36:
      if (inputTag) ctx.setRmtRevAux(tag, inputTag);
      break;
    case 37:
      if (inputTag) ctx.setRmtOverload(tag, inputTag);
      break;
    case 38:
      if (inputTag) ctx.setRmtHoa(tag, inputTag);
      break;
    case 39:
      if (inputTag) ctx.setRmtFwdOut(tag, inputTag);
      break;
    case 40:
      if (inputTag) ctx.setRmtRevOut(tag, inputTag);
      break;
    case 41:
      if (inputTag) ctx.setRmtReset(tag, inputTag);
      break;
    case 42:
      if (inputTag) ctx.setRmtOffline(tag, inputTag);
      break;
    case 43:
      if (inputTag) ctx.setRmtHrs(tag, inputTag);
      break;
    case 44:
      if (inputTag) ctx.setRmtStarts(tag, inputTag);
      break;
    case 45:
      if (inputTag) ctx.setRmtSta(tag, inputTag);
      break;
    default: break;
  }
}

/**
 * Execute compiled MVBC program (same opcodes as Opta firmware).
 * @returns {object[]} program trace rows (source spans)
 */
function runBytecode(buf, parsed, ctx, traceMap) {
  const { tagIds, codeOff, codeLen } = parsed || parseBcProgram(buf);
  const stack = new Array(16);
  let sp = 0;
  const pop = () => (sp > 0 ? stack[--sp] : 0);
  const push = (v) => {
    if (sp < 16) stack[sp++] = v;
  };

  const peekCount = Array.isArray(traceMap) ? traceMap.length : 0;
  const peekVals = peekCount ? new Array(peekCount) : null;

  let ip = codeOff;
  const end = codeOff + codeLen;
  while (ip < end) {
    const op = buf[ip++];
    switch (op) {
      case OP.PUSH_F32:
        push(buf.readFloatLE(ip));
        ip += 4;
        break;
      case OP.PUSH_I16:
        push(buf.readInt16LE(ip));
        ip += 2;
        break;
      case OP.PUSH_TAG:
        push(buf.readUInt16LE(ip));
        ip += 2;
        break;
      case OP.NOT:
        push(pop() ? 0 : 1);
        break;
      case OP.NEG:
        push(-pop());
        break;
      case OP.DROP:
        if (sp > 0) sp--;
        break;
      case OP.AND: {
        const r = pop();
        const l = pop();
        push((l && r) ? 1 : 0);
        break;
      }
      case OP.OR: {
        const r = pop();
        const l = pop();
        push((l || r) ? 1 : 0);
        break;
      }
      case OP.ADD: {
        const r = pop();
        push(pop() + r);
        break;
      }
      case OP.SUB: {
        const r = pop();
        push(pop() - r);
        break;
      }
      case OP.MUL: {
        const r = pop();
        push(pop() * r);
        break;
      }
      case OP.DIV: {
        const r = pop();
        const l = pop();
        push(r === 0 ? 0 : l / r);
        break;
      }
      case OP.MOD: {
        const r = pop();
        const l = pop();
        push(r === 0 ? 0 : Math.trunc(l) % Math.trunc(r));
        break;
      }
      case OP.GT: {
        const r = pop();
        push(pop() > r ? 1 : 0);
        break;
      }
      case OP.LT: {
        const r = pop();
        push(pop() < r ? 1 : 0);
        break;
      }
      case OP.EQ: {
        const r = pop();
        push(pop() === r ? 1 : 0);
        break;
      }
      case OP.GE: {
        const r = pop();
        push(pop() >= r ? 1 : 0);
        break;
      }
      case OP.LE: {
        const r = pop();
        push(pop() <= r ? 1 : 0);
        break;
      }
      case OP.NE: {
        const r = pop();
        push(pop() !== r ? 1 : 0);
        break;
      }
      case OP.CALL:
        push(evalBuiltin(buf[ip++], pop, ctx, tagIds));
        break;
      case OP.ACTION: {
        const aid = buf[ip++];
        const tag = buf.readUInt16LE(ip); ip += 2;
        const input = buf.readUInt16LE(ip); ip += 2;
        let unit = 0;
        if (aid === 22 || aid === 23 || aid === 27 || aid === 28 || aid === 29) {
          unit = buf[ip++];
        }
        let bands = null;
        if (aid === 31) {
          bands = [
            buf.readFloatLE(ip), buf.readFloatLE(ip + 4),
            buf.readFloatLE(ip + 8), buf.readFloatLE(ip + 12),
          ];
          ip += 16;
        }
        runAction(aid, tag, input, unit, bands, ctx, tagIds);
        break;
      }
      case OP.STORE_TAG: {
        const tag = buf.readUInt16LE(ip); ip += 2;
        const val = pop();
        const name = tagIds[tag];
        if (name) ctx.setAnalog(name, val);
        break;
      }
      case OP.JMP_IFNOT: {
        const rel = buf.readUInt16LE(ip); ip += 2;
        if (pop() === 0) ip += rel;
        break;
      }
      case OP.JMP: {
        const rel = buf.readUInt16LE(ip); ip += 2;
        ip += rel;
        break;
      }
      case OP.TRACE_PEEK: {
        const idx = buf.readUInt16LE(ip); ip += 2;
        if (sp > 0) {
          if (peekVals && idx < peekCount) peekVals[idx] = stack[sp - 1];
          if (traceMap?.[idx]?.k === 'out') sp--;
        }
        break;
      }
      case OP.END:
        return peekVals ? traceFromPeeks(traceMap, peekVals) : [];
      default:
        return peekVals ? traceFromPeeks(traceMap, peekVals) : [];
    }
  }
  return peekVals ? traceFromPeeks(traceMap, peekVals) : [];
}

module.exports = {
  parseBcProgram,
  compileLocalProgram,
  runBytecode,
  traceFromPeeks,
};
