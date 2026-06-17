'use strict';

const { getArrayElement, setArrayElement: writeArrayElement } = require('../tags/tagArrays');

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
    for (const s of stmts) {
      if (s.type === 'if') {
        walk(s.thenBody);
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
      stmt.thenBody.forEach((s) => runStmt(s, ctx, trace));
    } else {
      stmt.elseBody.forEach((s) => runStmt(s, ctx, trace));
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
      case 'SetArray':
        ctx.setArrayElement(
          stmt.tag,
          evalExpr(stmt.index, ctx, trace),
          evalExpr(stmt.valueExpr, ctx, trace),
        );
        break;
      default: break;
    }
  }
}

function execute(ast, ctx, trace) {
  if (ast?.type === 'program') {
    for (const s of ast.body) runStmt(s, ctx, trace);
    appendActionTraces(ast, ctx, trace);
  }
}

/** Evaluate IF conditions and output tag states (no actions) for live editor overlay when stopped. */
function collectExpressionTrace(ast, ctx) {
  const trace = [];
  function walkStmts(stmts) {
    for (const s of stmts) {
      if (s.type === 'if') {
        evalExpr(s.cond, ctx, trace);
        walkStmts(s.thenBody);
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
      if (!t || t.readonly || t.forceOutput) return;
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
      if (!t || t.readonly || t.forceOutput) return;
      if (t.type === 'BOOL' || t.role === 'output' || t.role === 'memory') {
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
      if (!t || t.readonly || t.forceOutput) return;
      if (t.type === 'INT' || t.type === 'REAL' || t.role === 'output' || t.role === 'memory') {
        const v = t.type === 'INT' ? Math.trunc(asNum(val)) : asNum(val);
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
  };
}

module.exports = { execute, createContext, evalExpr, collectExpressionTrace };
