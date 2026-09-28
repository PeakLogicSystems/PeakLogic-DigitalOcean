'use strict';

const { attachSpan, spanFrom } = require('./sourceSpan');

const { GLOBAL_TYPE_ALIASES } = require('../parc/globalTagMeta');

const GLOBAL_DECL_TYPES = new Set([
  ...Object.keys(GLOBAL_TYPE_ALIASES),
  'BOOL', 'INT', 'REAL',
]);

/** Tag-store type for a global declaration token. */
const GLOBAL_STORE_TYPE = {
  GB: 'GB',
  GI: 'GI',
  GR: 'GR',
  GLOBAL_BOOL: 'GLOBAL_BOOL',
  GLOBAL_INT: 'GLOBAL_INT',
  GLOBAL_REAL: 'GLOBAL_REAL',
  BOOL: 'GLOBAL_BOOL',
  INT: 'GLOBAL_INT',
  REAL: 'GLOBAL_REAL',
};

const KEYWORDS = new Set([
  'GLOBAL', 'VAR_GLOBAL', 'GB', 'GI', 'GR',
  'GLOBAL_BOOL', 'GLOBAL_INT', 'GLOBAL_REAL',
  'BOOL', 'INT', 'REAL',
  'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'AND', 'OR', 'NOT',
  'IsON', 'IsOFF', 'TurnON', 'TurnOFF', 'WithInLimits',
  'TimerDone', 'TimerRun', 'TimerInput',
  'CounterDone', 'CounterValue', 'CounterReset', 'CounterCu', 'CounterCd',
  'PidValue', 'PidError', 'PidAutoMode',
  'PidPv', 'PidSp', 'PidOut', 'PidAuto', 'PidManual',
  'AvgValue', 'AvgReady', 'AvgCount',
  'AvgIn', 'AvgReset', 'AvgOut',
  'OneShot',
  'FlowValue', 'FlowReady',
  'FlowCtr', 'FlowTmr', 'FlowK', 'FlowOut',
  'AltActiveUnit', 'AltReady', 'AltFault', 'AltLag',
  'AltOffActive', 'AltHighActive', 'AltLowActive', 'AltLow2Active', 'AltPumpUp', 'AltPumpDown',
  'AltEnable', 'AltAdvance', 'AltAutoFault', 'AltLead', 'AltOnline', 'AltUnitOut',
  'AltOff', 'AltHigh', 'AltLow', 'AltLag2', 'AltLevel', 'AltLevelBands',
  'AltLeadSel', 'AltLagSel', 'AltLag2Sel',
  'RmtFwdRun', 'RmtRevRun', 'RmtFault', 'RmtReversing', 'RmtStatus',
  'RmtFwdCmd', 'RmtRevCmd', 'RmtFwdAux', 'RmtRevAux', 'RmtOverload', 'RmtHoa',
  'RmtFwdOut', 'RmtRevOut', 'RmtReset', 'RmtOffline', 'RmtHrs', 'RmtStarts', 'RmtSta',
  'SetArray', 'SetInt', 'ArrayValue',
]);

function skipSpaceAndComments(src, i) {
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' && src[i + 1] === '*') {
      const end = src.indexOf('*)', i + 2);
      i = end >= 0 ? end + 2 : src.length;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    break;
  }
  return i;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    i = skipSpaceAndComments(src, i);
    if (i >= src.length) break;
    const start = i;
    const c = src[i];
    if (c === ';') {
      tokens.push({ type: 'semi', start, end: i + 1 });
      i++;
      continue;
    }
    if ('(),'.includes(c)) {
      tokens.push({ type: c, start, end: i + 1 });
      i++;
      continue;
    }
    if (c === '[' || c === ']') {
      tokens.push({ type: c, start, end: i + 1 });
      i++;
      continue;
    }
    if ('+-*/%<>='.includes(c)) {
      let op = c;
      if ((c === '<' || c === '>' || c === '=') && src[i + 1] === '=') {
        op += '=';
        i += 2;
      } else if (c === '<' && src[i + 1] === '>') {
        op = '<>';
        i += 2;
      } else {
        i++;
      }
      tokens.push({ type: 'op', value: op, start, end: i });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let n = '';
      while (i < src.length && /[0-9.eE+-]/.test(src[i])) { n += src[i++]; }
      tokens.push({ type: 'num', value: parseFloat(n), start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let id = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) id += src[i++];
      const upper = id.toUpperCase();
      if (KEYWORDS.has(id) || KEYWORDS.has(upper)) {
        const kw = KEYWORDS.has(id) ? id : [...KEYWORDS].find((k) => k.toUpperCase() === upper) || id;
        tokens.push({ type: 'kw', value: kw, start, end: i });
      } else {
        tokens.push({ type: 'id', value: id, start, end: i });
      }
      continue;
    }
    throw new Error(`Unexpected char '${c}' at ${i}`);
  }
  tokens.push({ type: 'eof', start: src.length, end: src.length });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.i = 0;
    this.diagnostics = [];
  }

  peek() { return this.t[this.i]; }
  eat(type, value) {
    const tok = this.peek();
    if (tok.type !== type || (value != null && tok.value !== value)) {
      throw new Error(`Expected ${type}${value ? ' ' + value : ''}, got ${tok.type}`);
    }
    this.i++;
    return tok;
  }

  parse() {
    const globals = [];
    while (this.isGlobalDeclStart()) {
      globals.push(this.globalDecl());
      if (this.peek().type === 'semi') this.eat('semi');
    }
    const stmts = [];
    while (this.peek().type !== 'eof') {
      stmts.push(this.stmt());
      if (this.peek().type === 'semi') this.eat('semi');
    }
    return { type: 'program', globals, body: stmts };
  }

  isGlobalDeclStart() {
    const tok = this.peek();
    return tok.type === 'kw' && (tok.value === 'GLOBAL' || tok.value === 'VAR_GLOBAL');
  }

  globalDecl() {
    const startTok = this.peek();
    const isVarGlobal = startTok.value === 'VAR_GLOBAL';
    this.eat('kw', startTok.value);
    const typeTok = this.peek();
    let typeName;
    if (typeTok.type === 'kw' && GLOBAL_DECL_TYPES.has(typeTok.value)) {
      typeName = typeTok.value;
      this.i++;
    } else if (typeTok.type === 'id' && GLOBAL_DECL_TYPES.has(typeTok.value.toUpperCase())) {
      typeName = typeTok.value.toUpperCase();
      this.i++;
    } else {
      throw new Error(`Expected global type (GB|GI|GR|BOOL|INT|REAL), got ${typeTok.type}`);
    }
    const nameTok = this.eat('id');
    const storeType = GLOBAL_STORE_TYPE[typeName.toUpperCase()] || 'GLOBAL_BOOL';
    return attachSpan({
      type: 'globalDecl',
      name: nameTok.value,
      globalType: storeType,
      syntax: isVarGlobal ? 'VAR_GLOBAL' : 'GLOBAL',
      tagSpan: spanFrom(nameTok),
    }, startTok, typeTok, nameTok);
  }

  stmt() {
    const tok = this.peek();
    if (tok.type === 'kw' && tok.value === 'IF') return this.ifStmt();
    if (tok.type === 'kw' && tok.value === 'SetArray') {
      return this.setArrayStmt();
    }
    if (tok.type === 'kw' && tok.value === 'SetInt') {
      return this.setIntStmt();
    }
    if (tok.type === 'kw' && tok.value === 'AltLevelBands') {
      return this.altLevelBandsStmt();
    }
    if (tok.type === 'kw' && ['AltOnline', 'AltUnitOut', 'AltLeadSel', 'AltLagSel', 'AltLag2Sel'].includes(tok.value)) {
      return this.altActionStmt(tok.value);
    }
    if (tok.type === 'kw' && [
      'TurnON', 'TurnOFF', 'CounterReset', 'CounterCu', 'CounterCd', 'TimerInput',
      'PidPv', 'PidSp', 'PidOut', 'PidAuto', 'PidManual',
      'AvgIn', 'AvgReset', 'AvgOut',
      'FlowCtr', 'FlowTmr', 'FlowK', 'FlowOut',
      'AltEnable', 'AltAdvance', 'AltAutoFault', 'AltLead',
      'AltOff', 'AltHigh', 'AltLow', 'AltLag2', 'AltLevel',
      'RmtFwdCmd', 'RmtRevCmd', 'RmtFwdAux', 'RmtRevAux', 'RmtOverload', 'RmtHoa',
      'RmtFwdOut', 'RmtRevOut', 'RmtReset', 'RmtOffline', 'RmtHrs', 'RmtStarts', 'RmtSta',
    ].includes(tok.value)) {
      return this.actionStmt(tok.value);
    }
    throw new Error(`Unknown statement at token ${this.i}`);
  }

  ifStmt() {
    this.eat('kw', 'IF');
    const cond = this.expr();
    this.eat('kw', 'THEN');
    const thenBody = this.blockUntil(['ELSIF', 'ELSE', 'END_IF']);
    const elsif = [];
    while (this.peek().type === 'kw' && this.peek().value === 'ELSIF') {
      this.eat('kw', 'ELSIF');
      const econd = this.expr();
      this.eat('kw', 'THEN');
      elsif.push({
        cond: econd,
        body: this.blockUntil(['ELSIF', 'ELSE', 'END_IF']),
      });
    }
    let elseBody = [];
    if (this.peek().type === 'kw' && this.peek().value === 'ELSE') {
      this.eat('kw', 'ELSE');
      elseBody = this.blockUntil(['END_IF']);
    }
    this.eat('kw', 'END_IF');
    return attachSpan({ type: 'if', cond, thenBody, elsif, elseBody }, cond);
  }

  blockUntil(stopKws) {
    const body = [];
    while (this.peek().type !== 'eof') {
      if (this.peek().type === 'kw' && stopKws.includes(this.peek().value)) break;
      body.push(this.stmt());
      if (this.peek().type === 'semi') this.eat('semi');
    }
    return body;
  }

  setArrayStmt() {
    const kw = this.eat('kw', 'SetArray');
    const open = this.eat('(');
    const tagTok = this.eat('id');
    this.eat(',');
    const index = this.addExpr();
    this.eat(',');
    const valueExpr = this.addExpr();
    const close = this.eat(')');
    return attachSpan({
      type: 'action',
      name: 'SetArray',
      tag: tagTok.value,
      index,
      valueExpr,
      tagSpan: spanFrom(tagTok),
    }, kw, open, tagTok, close);
  }

  setIntStmt() {
    const kw = this.eat('kw', 'SetInt');
    const open = this.eat('(');
    const tagTok = this.eat('id');
    this.eat(',');
    const valueExpr = this.addExpr();
    const close = this.eat(')');
    return attachSpan({
      type: 'action',
      name: 'SetInt',
      tag: tagTok.value,
      valueExpr,
      tagSpan: spanFrom(tagTok),
    }, kw, open, tagTok, close);
  }

  actionStmt(name) {
    const kw = this.eat('kw', name);
    const open = this.eat('(');
    const tagTok = this.eat('id');
    const tag = tagTok.value;
    let inputTag = null;
    let inputSpan = null;
    if (this.peek().type === ',') {
      this.eat(',');
      const inTok = this.eat('id');
      inputTag = inTok.value;
      inputSpan = spanFrom(inTok);
    }
    const close = this.eat(')');
    return attachSpan({
      type: 'action',
      name,
      tag,
      inputTag,
      tagSpan: spanFrom(tagTok),
      inputSpan,
    }, kw, open, tagTok, close);
  }

  altActionStmt(name) {
    const kw = this.eat('kw', name);
    const open = this.eat('(');
    const tagTok = this.eat('id');
    this.eat(',');
    const unitTok = this.eat('num');
    this.eat(',');
    const inTok = this.eat('id');
    const close = this.eat(')');
    return attachSpan({
      type: 'action',
      name,
      tag: tagTok.value,
      unitIndex: Math.trunc(unitTok.value),
      inputTag: inTok.value,
      tagSpan: spanFrom(tagTok),
      inputSpan: spanFrom(inTok),
    }, kw, open, tagTok, close);
  }

  altLevelBandsStmt() {
    const kw = this.eat('kw', 'AltLevelBands');
    const open = this.eat('(');
    const tagTok = this.eat('id');
    this.eat(',');
    const levelLowLo = this.addExpr();
    this.eat(',');
    const levelLowHi = this.addExpr();
    this.eat(',');
    const levelHighLo = this.addExpr();
    this.eat(',');
    const levelHighHi = this.addExpr();
    const close = this.eat(')');
    return attachSpan({
      type: 'action',
      name: 'AltLevelBands',
      tag: tagTok.value,
      levelLowLo,
      levelLowHi,
      levelHighLo,
      levelHighHi,
      tagSpan: spanFrom(tagTok),
    }, kw, open, tagTok, close);
  }

  expr() { return this.orExpr(); }

  orExpr() {
    let node = this.andExpr();
    while (this.peek().type === 'kw' && this.peek().value === 'OR') {
      this.eat('kw', 'OR');
      const right = this.andExpr();
      node = attachSpan({ type: 'bin', op: 'OR', left: node, right }, node, right);
    }
    return node;
  }

  andExpr() {
    let node = this.unaryExpr();
    while (this.peek().type === 'kw' && this.peek().value === 'AND') {
      this.eat('kw', 'AND');
      const right = this.unaryExpr();
      node = attachSpan({ type: 'bin', op: 'AND', left: node, right }, node, right);
    }
    return node;
  }

  unaryExpr() {
    if (this.peek().type === 'kw' && this.peek().value === 'NOT') {
      const opTok = this.eat('kw', 'NOT');
      const arg = this.unaryExpr();
      return attachSpan({ type: 'un', op: 'NOT', arg }, opTok, arg);
    }
    return this.compareExpr();
  }

  compareExpr() {
    let node = this.addExpr();
    if (this.peek().type === 'op' && ['>', '<', '=', '>=', '<=', '<>'].includes(this.peek().value)) {
      const op = this.eat('op').value;
      const right = this.addExpr();
      node = attachSpan({ type: 'bin', op, left: node, right }, node, right);
    }
    return node;
  }

  addExpr() {
    let node = this.mulExpr();
    while (this.peek().type === 'op' && ['+', '-'].includes(this.peek().value)) {
      const op = this.eat('op').value;
      const right = this.mulExpr();
      node = attachSpan({ type: 'bin', op, left: node, right }, node, right);
    }
    return node;
  }

  mulExpr() {
    let node = this.primary();
    while (this.peek().type === 'op' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.eat('op').value;
      const right = this.primary();
      node = attachSpan({ type: 'bin', op, left: node, right }, node, right);
    }
    return node;
  }

  primary() {
    const tok = this.peek();
    if (tok.type === 'num') {
      this.i++;
      return attachSpan({ type: 'num', value: tok.value }, tok);
    }
    if (tok.type === 'op' && tok.value === '-') {
      const opTok = this.eat('op', '-');
      const arg = this.primary();
      return attachSpan({ type: 'un', op: 'NEG', arg }, opTok, arg);
    }
    if (tok.type === 'kw' && [
      'IsON', 'IsOFF', 'WithInLimits', 'TimerDone', 'TimerRun',
      'CounterDone', 'CounterValue',
      'PidValue', 'PidError', 'PidAutoMode',
      'AvgValue', 'AvgReady', 'AvgCount',
      'OneShot',
      'FlowValue', 'FlowReady',
      'AltActiveUnit', 'AltReady', 'AltFault', 'AltLag',
      'AltOffActive', 'AltHighActive', 'AltLowActive', 'AltLow2Active', 'AltPumpUp', 'AltPumpDown',
      'RmtFwdRun', 'RmtRevRun', 'RmtFault', 'RmtReversing', 'RmtStatus',
      'ArrayValue',
    ].includes(tok.value)) {
      return this.call(tok.value);
    }
    if (tok.type === 'id') {
      const idTok = tok;
      this.i++;
      if (this.peek().type === '[') {
        this.eat('[');
        const index = this.addExpr();
        this.eat(']');
        return attachSpan({ type: 'tagIndex', name: idTok.value, index }, idTok, index);
      }
      return attachSpan({ type: 'tag', name: idTok.value }, idTok);
    }
    if (tok.type === '(') {
      const open = this.eat('(');
      const e = this.expr();
      const close = this.eat(')');
      return attachSpan(e, open, e, close);
    }
    throw new Error(`Bad primary token ${tok.type}`);
  }

  call(name) {
    const kw = this.eat('kw', name);
    const open = this.eat('(');
    const args = [];
    const first = this.eat('id');
    args.push(first.value);
    let last = first;
    if (name === 'WithInLimits') {
      this.eat(',');
      const lo = this.addExpr();
      args.push(lo);
      last = lo;
      this.eat(',');
      const hi = this.addExpr();
      args.push(hi);
      last = hi;
    } else if (name === 'ArrayValue') {
      this.eat(',');
      const idx = this.addExpr();
      args.push(idx);
      last = idx;
    }
    const close = this.eat(')');
    return attachSpan({ type: 'call', name, args }, kw, open, last, close);
  }
}

function parseProgram(source) {
  try {
    const tokens = tokenize(String(source));
    const p = new Parser(tokens);
    const ast = p.parse();
    return { ast, errors: [] };
  } catch (e) {
    return { ast: null, errors: [e.message] };
  }
}

function collectProgramGlobalDecls(ast) {
  if (!ast || ast.type !== 'program') return [];
  return (ast.globals || []).map((g) => ({
    id: g.name,
    type: g.globalType,
    role: 'memory',
    global: true,
  }));
}

function collectProgramTagRefs(ast) {
  const refs = new Set();
  for (const g of ast?.globals || []) refs.add(g.name);
  function walk(node) {
    if (!node) return;
    if (node.type === 'tag' || node.type === 'tagIndex') refs.add(node.name);
    if (node.type === 'call') {
      for (const a of node.args || []) {
        if (typeof a === 'string') refs.add(a);
      }
    }
    if (node.type === 'action') {
      refs.add(node.tag);
      if (node.inputTag) refs.add(node.inputTag);
    }
    if (node.type === 'tagIndex') walk(node.index);
    if (node.type === 'action' && node.name === 'AltLevelBands') {
      walk(node.levelLowLo);
      walk(node.levelLowHi);
      walk(node.levelHighLo);
      walk(node.levelHighHi);
    }
    if (node.type === 'action' && (node.name === 'SetArray' || node.name === 'SetInt')) {
      walk(node.index);
      walk(node.valueExpr);
    }
    if (node.type === 'if') {
      walk(node.cond);
      (node.thenBody || []).forEach((s) => walk(s));
      for (const branch of node.elsif || []) {
        walk(branch.cond);
        (branch.body || []).forEach((s) => walk(s));
      }
      (node.elseBody || []).forEach((s) => walk(s));
    }
    if (node.type === 'bin' || node.type === 'un') {
      if (node.left) walk(node.left);
      if (node.right) walk(node.right);
      if (node.arg) walk(node.arg);
    }
    if (node.type === 'program') (node.body || []).forEach((s) => walk(s));
  }
  walk(ast);
  return [...refs].sort();
}

function validateProgram(ast, tagIds, tagMetaById) {
  const errors = [];
  const ids = new Set(tagIds);
  const meta = tagMetaById instanceof Map ? tagMetaById : new Map();
  for (const g of ast?.globals || []) {
    ids.add(g.name);
    meta.set(g.name, { id: g.name, type: g.globalType, global: true });
  }
  function walk(node, inAction) {
    if (!node) return;
    if ((node.type === 'tag' || node.type === 'tagIndex') && !ids.has(node.name)) {
      errors.push(`Unknown tag: ${node.name}`);
    }
    if (node.type === 'tagIndex') walk(node.index);
    if (node.type === 'action' && node.name === 'AltLevelBands') {
      if (!ids.has(node.tag)) errors.push(`Unknown tag: ${node.tag}`);
      walk(node.levelLowLo);
      walk(node.levelLowHi);
      walk(node.levelHighLo);
      walk(node.levelHighHi);
    }
    if (node.type === 'action' && (node.name === 'SetArray' || node.name === 'SetInt')) {
      if (!ids.has(node.tag)) errors.push(`Unknown tag: ${node.tag}`);
      if (node.index) walk(node.index);
      walk(node.valueExpr);
    }
    if (node.type === 'call') {
      for (const a of node.args || []) {
        if (typeof a === 'string' && !ids.has(a)) errors.push(`Unknown tag: ${a}`);
      }
    }
    if (node.type === 'action') {
      if (!ids.has(node.tag)) errors.push(`Unknown tag: ${node.tag}`);
      if (node.inputTag && !ids.has(node.inputTag)) errors.push(`Unknown tag: ${node.inputTag}`);
    }
    if (node.type === 'if') {
      walk(node.cond);
      (node.thenBody || []).forEach((s) => walk(s));
      for (const branch of node.elsif || []) {
        walk(branch.cond);
        (branch.body || []).forEach((s) => walk(s));
      }
      (node.elseBody || []).forEach((s) => walk(s));
    }
    if (node.type === 'bin' || node.type === 'un') {
      if (node.left) walk(node.left);
      if (node.right) walk(node.right);
      if (node.arg) walk(node.arg);
    }
    if (node.type === 'program') (node.body || []).forEach((s) => walk(s));
  }
  walk(ast);
  return errors;
}

module.exports = {
  tokenize,
  parseProgram,
  validateProgram,
  collectProgramTagRefs,
  collectProgramGlobalDecls,
};
