'use strict';

const { getArrayElement, setArrayElement: writeArrayElement } = require('../tags/tagArrays');
const { globalBaseType } = require('../parc/globalTagMeta');

function tagBaseType(t) {
  return globalBaseType(t) || t?.type || 'BOOL';
}

function asBool(v) {
  return !!v;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pushTrace(trace, node, value) {
  if (!trace || !node?.span) return;
  const isBool = typeof value === 'boolean';
  trace.push({
    start: node.span.start,
    end: node.span.end,
    value: isBool ? value : asNum(value),
    kind: isBool ? 'bool' : 'num',
  });
}

function pushOutputTrace(trace, span, tagId, ctx) {
  if (!trace || !span) return;
  trace.push({
    start: span.start,
    end: span.end,
    value: asBool(ctx.getValue(tagId)),
    kind: 'out',
    tag: tagId,
  });
}

function appendActionTraces(ast, ctx, trace) {
  function walk(stmts) {
    for (const s of stmts || []) {
      if (s.type === 'if') {
        walk(s.thenBody);
        for (const branch of s.elsif || []) walk(branch.body);
        walk(s.elseBody);
      } else if (s.type === 'action') {
        pushOutputTrace(trace, s.tagSpan, s.tag, ctx);
      }
    }
  }
  if (ast?.type === 'program') walk(ast.body);
}

function evalExpr(node, ctx, trace) {
  if (!node) return 0;
  let value;
  switch (node.type) {
    case 'num': value = node.value; break;
    case 'tag': value = ctx.getValue(node.name); break;
    case 'tagIndex': value = ctx.getArrayValue(node.name, evalExpr(node.index, ctx, trace)); break;
    case 'call': value = evalCall(node, ctx, trace); break;
    case 'un': {
      const v = evalExpr(node.arg, ctx, trace);
      if (node.op === 'NOT') value = !asBool(v);
      else if (node.op === 'NEG') value = -asNum(v);
      else value = 0;
      break;
    }
    case 'bin': {
      const l = evalExpr(node.left, ctx, trace);
      const r = evalExpr(node.right, ctx, trace);
      switch (node.op) {
        case 'AND': value = asBool(l) && asBool(r); break;
        case 'OR': value = asBool(l) || asBool(r); break;
        case '+': value = asNum(l) + asNum(r); break;
        case '-': value = asNum(l) - asNum(r); break;
        case '*': value = asNum(l) * asNum(r); break;
        case '/': value = r === 0 ? 0 : asNum(l) / asNum(r); break;
        case '%': value = r === 0 ? 0 : asNum(l) % asNum(r); break;
        case '>': value = asNum(l) > asNum(r); break;
        case '<': value = asNum(l) < asNum(r); break;
        case '=': value = asNum(l) === asNum(r); break;
        case '>=': value = asNum(l) >= asNum(r); break;
        case '<=': value = asNum(l) <= asNum(r); break;
        case '<>': value = asNum(l) !== asNum(r); break;
        default: value = 0;
      }
      break;
    }
    default: value = 0;
  }
  pushTrace(trace, node, value);
  return value;
}

function evalCall(node, ctx, trace) {
  const [tagName, ...rest] = node.args;
  switch (node.name) {
    case 'IsON': return asBool(ctx.getValue(tagName));
    case 'IsOFF': return !asBool(ctx.getValue(tagName));
    case 'WithInLimits': {
      const v = asNum(ctx.getValue(tagName));
      const lo = typeof rest[0] === 'object' ? evalExpr(rest[0], ctx, trace) : rest[0];
      const hi = typeof rest[1] === 'object' ? evalExpr(rest[1], ctx, trace) : rest[1];
      return v >= asNum(lo) && v <= asNum(hi);
    }
    case 'TimerDone': return !!ctx.getFb(tagName)?.done;
    case 'TimerRun': return !!ctx.getFb(tagName)?.running;
    case 'CounterDone': return !!ctx.getFb(tagName)?.done;
    case 'CounterValue': return asNum(ctx.getFb(tagName)?.count ?? ctx.getValue(tagName));
    case 'PidValue': return asNum(ctx.getFb(tagName)?.out ?? ctx.getValue(tagName));
    case 'PidError': return asNum(ctx.getFb(tagName)?.err);
    case 'PidAutoMode': return !!ctx.getFb(tagName)?.enabled;
    case 'AvgValue': return asNum(ctx.getFb(tagName)?.avg ?? ctx.getValue(tagName));
    case 'AvgReady': return !!ctx.getFb(tagName)?.ready;
    case 'AvgCount': return asNum(ctx.getFb(tagName)?.count);
    case 'OneShot': {
      const fired = ctx.oneShotFired;
      if (!fired || fired.has(tagName)) return false;
      fired.add(tagName);
      return true;
    }
    case 'FlowValue': return asNum(ctx.getFb(tagName)?.gpm ?? ctx.getValue(tagName));
    case 'FlowReady': return !!ctx.getFb(tagName)?.ready;
    case 'AltActiveUnit': return asNum(ctx.getFb(tagName)?.activeUnit ?? ctx.getValue(tagName));
    case 'AltReady': return !!ctx.getFb(tagName)?.ready;
    case 'AltFault': return !!ctx.getFb(tagName)?.fault;
    case 'AltLag': return asNum((ctx.getFb(tagName)?.lagIndex ?? -1) + 1);
    case 'AltOffActive': return !!ctx.getFb(tagName)?.offActive;
    case 'AltHighActive': return !!ctx.getFb(tagName)?.highActive;
    case 'AltLowActive': return !!ctx.getFb(tagName)?.lowActive;
    case 'AltLow2Active': return !!ctx.getFb(tagName)?.low2Active;
    case 'AltPumpUp': {
      const s = ctx.getFb(tagName)?.pumpStage;
      return s === 'lag' || s === 'lag2' || s === 'up';
    }
    case 'AltPumpDown': {
      const s = ctx.getFb(tagName)?.pumpStage;
      return s === 'high' || s === 'down';
    }
    case 'RmtFwdRun': return !!ctx.getFb(tagName)?.fwdRun;
    case 'RmtRevRun': return !!ctx.getFb(tagName)?.revRun;
    case 'RmtFault': return !!ctx.getFb(tagName)?.fault;
    case 'RmtReversing': return !!ctx.getFb(tagName)?.reversing;
    case 'RmtStatus': return asNum(ctx.getFb(tagName)?.status ?? ctx.getValue(tagName));
    case 'ArrayValue': {
      const idx = typeof rest[0] === 'object' ? evalExpr(rest[0], ctx, trace) : rest[0];
      return asNum(ctx.getArrayValue(tagName, idx));
    }
    default: return 0;
  }
}

function runStmt(stmt, ctx, trace) {
  if (stmt.type === 'if') {
    if (asBool(evalExpr(stmt.cond, ctx, trace))) {
      (stmt.thenBody || []).forEach((s) => runStmt(s, ctx, trace));
    } else {
      let matched = false;
      for (const branch of stmt.elsif || []) {
        if (asBool(evalExpr(branch.cond, ctx, trace))) {
          (branch.body || []).forEach((s) => runStmt(s, ctx, trace));
          matched = true;
          break;
        }
      }
      if (!matched) {
        (stmt.elseBody || []).forEach((s) => runStmt(s, ctx, trace));
      }
    }
    return;
  }
  if (stmt.type === 'action') {
    switch (stmt.name) {
      case 'TurnON': ctx.setBool(stmt.tag, true); break;
      case 'TurnOFF': ctx.setBool(stmt.tag, false); break;
      case 'CounterReset': ctx.resetCounter(stmt.tag); break;
      case 'CounterCu':
        if (stmt.inputTag) ctx.setCounterCu(stmt.tag, stmt.inputTag);
        else ctx.pulseCounterCu(stmt.tag);
        break;
      case 'CounterCd':
        if (stmt.inputTag) ctx.setCounterCd(stmt.tag, stmt.inputTag);
        else ctx.pulseCounterCd(stmt.tag);
        break;
      case 'TimerInput':
        if (stmt.inputTag) ctx.setTimerInput(stmt.tag, stmt.inputTag);
        else ctx.pulseTimerInput(stmt.tag, true);
        break;
      case 'PidPv':
        if (stmt.inputTag) ctx.setPidPv(stmt.tag, stmt.inputTag);
        break;
      case 'PidSp':
        if (stmt.inputTag) ctx.setPidSp(stmt.tag, stmt.inputTag);
        break;
      case 'PidOut':
        if (stmt.inputTag) ctx.setPidOut(stmt.tag, stmt.inputTag);
        break;
      case 'PidAuto': ctx.setPidEnabled(stmt.tag, true); break;
      case 'PidManual': ctx.setPidEnabled(stmt.tag, false); break;
      case 'AvgIn':
        if (stmt.inputTag) ctx.setAvgIn(stmt.tag, stmt.inputTag);
        break;
      case 'AvgReset': ctx.resetAverage(stmt.tag); break;
      case 'AvgOut':
        if (stmt.inputTag) ctx.setAvgOut(stmt.tag, stmt.inputTag);
        break;
      case 'FlowCtr':
        if (stmt.inputTag) ctx.setFlowCtr(stmt.tag, stmt.inputTag);
        break;
      case 'FlowTmr':
        if (stmt.inputTag) ctx.setFlowTmr(stmt.tag, stmt.inputTag);
        break;
      case 'FlowK':
        if (stmt.inputTag) ctx.setFlowK(stmt.tag, stmt.inputTag);
        break;
      case 'FlowOut':
        if (stmt.inputTag) ctx.setFlowOut(stmt.tag, stmt.inputTag);
        break;
      case 'AltEnable':
        ctx.setAltEnable(stmt.tag, stmt.inputTag || null);
        break;
      case 'AltAdvance':
        if (stmt.inputTag) ctx.setAltAdvance(stmt.tag, stmt.inputTag);
        else ctx.pulseAltAdvance(stmt.tag);
        break;
      case 'AltAutoFault':
        if (stmt.inputTag) ctx.setAltAutoFault(stmt.tag, stmt.inputTag);
        break;
      case 'AltLead':
        if (stmt.inputTag) ctx.setAltLead(stmt.tag, stmt.inputTag);
        break;
      case 'AltOnline':
        if (stmt.inputTag) ctx.setAltOnline(stmt.tag, stmt.unitIndex, stmt.inputTag);
        break;
      case 'AltUnitOut':
        if (stmt.inputTag) ctx.setAltUnitOut(stmt.tag, stmt.unitIndex, stmt.inputTag);
        break;
      case 'AltOff':
        if (stmt.inputTag) ctx.setAltOff(stmt.tag, stmt.inputTag);
        break;
      case 'AltHigh':
        if (stmt.inputTag) ctx.setAltHigh(stmt.tag, stmt.inputTag);
        break;
      case 'AltLow':
        if (stmt.inputTag) ctx.setAltLow(stmt.tag, stmt.inputTag);
        break;
      case 'AltLag2':
        if (stmt.inputTag) ctx.setAltLag2(stmt.tag, stmt.inputTag);
        break;
      case 'AltLevel':
        if (stmt.inputTag) ctx.setAltLevel(stmt.tag, stmt.inputTag);
        break;
      case 'AltLevelBands':
        ctx.setAltLevelBands(stmt.tag, stmt, trace);
        break;
      case 'AltLeadSel':
        if (stmt.inputTag) ctx.setAltLeadSel(stmt.tag, stmt.unitIndex, stmt.inputTag);
        break;
      case 'AltLagSel':
        if (stmt.inputTag) ctx.setAltLagSel(stmt.tag, stmt.unitIndex, stmt.inputTag);
        break;
      case 'AltLag2Sel':
        if (stmt.inputTag) ctx.setAltLag2Sel(stmt.tag, stmt.unitIndex, stmt.inputTag);
        break;
      case 'RmtFwdCmd':
        if (stmt.inputTag) ctx.setRmtFwdCmd(stmt.tag, stmt.inputTag);
        break;
      case 'RmtRevCmd':
        if (stmt.inputTag) ctx.setRmtRevCmd(stmt.tag, stmt.inputTag);
        break;
      case 'RmtFwdAux':
        if (stmt.inputTag) ctx.setRmtFwdAux(stmt.tag, stmt.inputTag);
        break;
      case 'RmtRevAux':
        if (stmt.inputTag) ctx.setRmtRevAux(stmt.tag, stmt.inputTag);
        break;
      case 'RmtOverload':
        if (stmt.inputTag) ctx.setRmtOverload(stmt.tag, stmt.inputTag);
        break;
      case 'RmtHoa':
        if (stmt.inputTag) ctx.setRmtHoa(stmt.tag, stmt.inputTag);
        break;
      case 'RmtFwdOut':
        if (stmt.inputTag) ctx.setRmtFwdOut(stmt.tag, stmt.inputTag);
        break;
      case 'RmtRevOut':
        if (stmt.inputTag) ctx.setRmtRevOut(stmt.tag, stmt.inputTag);
        break;
      case 'RmtReset':
        if (stmt.inputTag) ctx.setRmtReset(stmt.tag, stmt.inputTag);
        break;
      case 'RmtOffline':
        if (stmt.inputTag) ctx.setRmtOffline(stmt.tag, stmt.inputTag);
        break;
      case 'RmtHrs':
        if (stmt.inputTag) ctx.setRmtHrs(stmt.tag, stmt.inputTag);
        break;
      case 'RmtStarts':
        if (stmt.inputTag) ctx.setRmtStarts(stmt.tag, stmt.inputTag);
        break;
      case 'RmtSta':
        if (stmt.inputTag) ctx.setRmtSta(stmt.tag, stmt.inputTag);
        break;
      case 'SetArray':
        ctx.setArrayElement(
          stmt.tag,
          evalExpr(stmt.index, ctx, trace),
          evalExpr(stmt.valueExpr, ctx, trace),
        );
        break;
      case 'SetInt':
        ctx.setAnalog(stmt.tag, evalExpr(stmt.valueExpr, ctx, trace));
        break;
      default: break;
    }
  }
}

function execute(ast, ctx, trace) {
  if (ast?.type === 'program') {
    for (const s of ast.body || []) runStmt(s, ctx, trace);
    appendActionTraces(ast, ctx, trace);
  }
}

/** Evaluate IF conditions and output tag states (no actions) for live editor overlay when stopped. */
function collectExpressionTrace(ast, ctx) {
  const trace = [];
  function walkStmts(stmts) {
    for (const s of stmts || []) {
      if (s.type === 'if') {
        evalExpr(s.cond, ctx, trace);
        walkStmts(s.thenBody);
        for (const branch of s.elsif || []) {
          evalExpr(branch.cond, ctx, trace);
          walkStmts(branch.body);
        }
        walkStmts(s.elseBody);
      }
    }
  }
  if (ast?.type === 'program') {
    walkStmts(ast.body);
    appendActionTraces(ast, ctx, trace);
  }
  return trace;
}

function createContext(tagStore, oneShotFired) {
  const fired = oneShotFired instanceof Set ? oneShotFired : new Set();
  return {
    oneShotFired: fired,
    getValue(id) {
      const t = tagStore.get(id);
      return t ? t.value : false;
    },
    getArrayValue(id, index) {
      const t = tagStore.get(id);
      if (!t) return 0;
      return getArrayElement(t, index);
    },
    setArrayElement(id, index, val) {
      const t = tagStore.get(id);
      if (!t || t.readonly) return;
      if (t.type !== 'INT' && t.type !== 'REAL') return;
      writeArrayElement(t, index, val);
      tagStore.markDirty(id);
    },
    getFb(id) {
      const t = tagStore.get(id);
      return t?.fb || {};
    },
    setBool(id, val) {
      const t = tagStore.get(id);
      if (!t || t.readonly) return;
      const base = tagBaseType(t);
      if (base === 'BOOL' || t.role === 'output' || t.role === 'memory') {
        tagStore.setValue(id, !!val);
        tagStore.markDirty(id);
      }
    },
    resetCounter(id) {
      const t = tagStore.get(id);
      if (t?.type === 'COUNTER') {
        t.fb = { ...(t.fb || {}), reset: true };
      }
    },
    pulseTimerInput(id, on) {
      const t = tagStore.get(id);
      if (t?.type === 'TIMER') {
        t.fb = { ...(t.fb || {}), input: !!on };
      }
    },
    setTimerInput(timerId, inputId) {
      const t = tagStore.get(timerId);
      const src = tagStore.get(inputId);
      if (t?.type === 'TIMER') {
        t.fb = { ...(t.fb || {}), input: !!src?.value };
      }
    },
    pulseCounterCu(id) {
      const t = tagStore.get(id);
      if (t?.type === 'COUNTER') {
        t.fb = { ...(t.fb || {}), cu: true };
      }
    },
    setCounterCu(counterId, inputId) {
      const t = tagStore.get(counterId);
      const src = tagStore.get(inputId);
      if (t?.type === 'COUNTER') {
        t.fb = { ...(t.fb || {}), cu: !!src?.value };
      }
    },
    pulseCounterCd(id) {
      const t = tagStore.get(id);
      if (t?.type === 'COUNTER') {
        t.fb = { ...(t.fb || {}), cd: true };
      }
    },
    setCounterCd(counterId, inputId) {
      const t = tagStore.get(counterId);
      const src = tagStore.get(inputId);
      if (t?.type === 'COUNTER') {
        t.fb = { ...(t.fb || {}), cd: !!src?.value };
      }
    },
    setAnalog(id, val) {
      const t = tagStore.get(id);
      if (!t || t.readonly) return;
      const base = tagBaseType(t);
      if (base === 'INT' || base === 'REAL' || t.role === 'output' || t.role === 'memory') {
        const v = base === 'INT' ? Math.trunc(asNum(val)) : asNum(val);
        tagStore.setValue(id, v);
        tagStore.markDirty(id);
      }
    },
    setPidPv(pidId, pvTag) {
      const t = tagStore.get(pidId);
      const src = tagStore.get(pvTag);
      if (t?.type === 'PID') {
        t.fb = { ...(t.fb || {}), pv: asNum(src?.value) };
      }
    },
    setPidSp(pidId, spTag) {
      const t = tagStore.get(pidId);
      const src = tagStore.get(spTag);
      if (t?.type === 'PID') {
        const sp = asNum(src?.value);
        t.preset = sp;
        t.fb = { ...(t.fb || {}), sp };
      }
    },
    setPidOut(pidId, outTag) {
      const t = tagStore.get(pidId);
      if (t?.type === 'PID') {
        this.setAnalog(outTag, asNum(t.fb?.out ?? t.value));
      }
    },
    setPidEnabled(pidId, on) {
      const t = tagStore.get(pidId);
      if (t?.type === 'PID') {
        t.fb = { ...(t.fb || {}), enabled: !!on };
        if (!on) {
          t.fb.integral = 0;
          t.fb.prevPv = null;
        }
      }
    },
    setAvgIn(avgId, inputId) {
      const t = tagStore.get(avgId);
      const src = tagStore.get(inputId);
      if (t?.type === 'AVG') {
        t.fb = { ...(t.fb || {}), pv: asNum(src?.value) };
      }
    },
    resetAverage(id) {
      const t = tagStore.get(id);
      if (t?.type === 'AVG') {
        t.fb = { ...(t.fb || {}), reset: true };
      }
    },
    setAvgOut(avgId, outTag) {
      const t = tagStore.get(avgId);
      if (t?.type === 'AVG') {
        this.setAnalog(outTag, asNum(t.fb?.avg ?? t.value));
      }
    },
    _flowFb(flowId) {
      const t = tagStore.get(flowId);
      if (t?.type !== 'FLOW') return null;
      t.fb = { ...(t.fb || {}) };
      return t;
    },
    setFlowCtr(flowId, ctrId) {
      const t = this._flowFb(flowId);
      if (t) t.fb.ctrId = ctrId;
    },
    setFlowTmr(flowId, tmrId) {
      const t = this._flowFb(flowId);
      if (t) t.fb.tmrId = tmrId;
    },
    setFlowK(flowId, kTagId) {
      const t = this._flowFb(flowId);
      if (t) t.fb.kTagId = kTagId;
    },
    setFlowOut(flowId, outTagId) {
      const t = this._flowFb(flowId);
      if (t) t.fb.outId = outTagId;
    },
    _altFb(altId) {
      const t = tagStore.get(altId);
      if (t?.type !== 'ALT') return null;
      t.fb = { ...(t.fb || {}) };
      return t;
    },
    setAltEnable(altId, enableTag) {
      const t = this._altFb(altId);
      if (!t) return;
      if (enableTag) {
        t.fb.enableId = enableTag;
        const src = tagStore.get(enableTag);
        t.fb.enabled = src ? !!src.value : false;
      } else {
        t.fb.enableId = '';
        t.fb.enabled = true;
      }
    },
    setAltAdvance(altId, advanceTag) {
      const t = this._altFb(altId);
      if (t) t.fb.advanceId = advanceTag;
    },
    pulseAltAdvance(altId) {
      const t = this._altFb(altId);
      if (t) t.fb.advancePulse = true;
    },
    setAltAutoFault(altId, tag) {
      const t = this._altFb(altId);
      if (t) t.fb.autoFaultId = tag;
    },
    setAltLead(altId, outTag) {
      const t = this._altFb(altId);
      if (t) t.fb.leadOutId = outTag;
    },
    setAltOnline(altId, unitIndex, onlineTag) {
      const t = this._altFb(altId);
      if (!t) return;
      const idx = Math.max(1, Math.min(4, Math.trunc(asNum(unitIndex)))) - 1;
      const ids = Array.isArray(t.fb.onlineIds) ? t.fb.onlineIds.slice() : ['', '', '', ''];
      while (ids.length < 4) ids.push('');
      ids[idx] = onlineTag;
      t.fb.onlineIds = ids;
    },
    setAltUnitOut(altId, unitIndex, outTag) {
      const t = this._altFb(altId);
      if (!t) return;
      const idx = Math.max(1, Math.min(4, Math.trunc(asNum(unitIndex)))) - 1;
      const ids = Array.isArray(t.fb.unitOutIds) ? t.fb.unitOutIds.slice() : ['', '', '', ''];
      while (ids.length < 4) ids.push('');
      ids[idx] = outTag;
      t.fb.unitOutIds = ids;
    },
    _altSelIds(t, key) {
      const ids = Array.isArray(t.fb[key]) ? t.fb[key].slice() : ['', '', '', ''];
      while (ids.length < 4) ids.push('');
      return ids;
    },
    setAltOff(altId, tag) {
      const t = this._altFb(altId);
      if (t) t.fb.offId = tag;
    },
    setAltHigh(altId, tag) {
      const t = this._altFb(altId);
      if (t) t.fb.highId = tag;
    },
    setAltLow(altId, tag) {
      const t = this._altFb(altId);
      if (t) t.fb.lowId = tag;
    },
    setAltLag2(altId, tag) {
      const t = this._altFb(altId);
      if (t) t.fb.low2Id = tag;
    },
    setAltLevel(altId, tag) {
      const t = this._altFb(altId);
      if (!t) return;
      t.fb.levelId = tag;
      t.fb.levelControlEnabled = true;
    },
    setAltLevelBands(altId, stmt, trace) {
      const t = this._altFb(altId);
      if (!t) return;
      t.fb.levelLowLo = asNum(evalExpr(stmt.levelLowLo, this, trace));
      t.fb.levelLowHi = asNum(evalExpr(stmt.levelLowHi, this, trace));
      t.fb.levelHighLo = asNum(evalExpr(stmt.levelHighLo, this, trace));
      t.fb.levelHighHi = asNum(evalExpr(stmt.levelHighHi, this, trace));
      t.fb.levelControlEnabled = true;
    },
    setAltLeadSel(altId, unitIndex, tag) {
      const t = this._altFb(altId);
      if (!t) return;
      const idx = Math.max(1, Math.min(4, Math.trunc(asNum(unitIndex)))) - 1;
      const ids = this._altSelIds(t, 'leadSelIds');
      ids[idx] = tag;
      t.fb.leadSelIds = ids;
    },
    setAltLagSel(altId, unitIndex, tag) {
      const t = this._altFb(altId);
      if (!t) return;
      const idx = Math.max(1, Math.min(4, Math.trunc(asNum(unitIndex)))) - 1;
      const ids = this._altSelIds(t, 'lagSelIds');
      ids[idx] = tag;
      t.fb.lagSelIds = ids;
    },
    setAltLag2Sel(altId, unitIndex, tag) {
      const t = this._altFb(altId);
      if (!t) return;
      const idx = Math.max(1, Math.min(4, Math.trunc(asNum(unitIndex)))) - 1;
      const ids = this._altSelIds(t, 'lag2SelIds');
      ids[idx] = tag;
      t.fb.lag2SelIds = ids;
    },
    _rmtFb(rmtId) {
      const t = tagStore.get(rmtId);
      if (t?.type !== 'RMOTOR') return null;
      t.fb = { ...(t.fb || {}) };
      return t;
    },
    setRmtFwdCmd(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.fwdCmdId = tag;
    },
    setRmtRevCmd(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.revCmdId = tag;
    },
    setRmtFwdAux(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.fwdAuxId = tag;
    },
    setRmtRevAux(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.revAuxId = tag;
    },
    setRmtOverload(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.overloadId = tag;
    },
    setRmtHoa(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.hoaId = tag;
    },
    setRmtFwdOut(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.fwdOutId = tag;
    },
    setRmtRevOut(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.revOutId = tag;
    },
    setRmtReset(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.resetId = tag;
    },
    setRmtOffline(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.offlineId = tag;
    },
    setRmtHrs(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.hrsOutId = tag;
    },
    setRmtStarts(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.startsOutId = tag;
    },
    setRmtSta(rmtId, tag) {
      const t = this._rmtFb(rmtId);
      if (t) t.fb.staOutId = tag;
    },
  };
}

module.exports = { execute, createContext, evalExpr, collectExpressionTrace };
