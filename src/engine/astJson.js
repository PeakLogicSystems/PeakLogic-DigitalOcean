'use strict';

/** Serialize parser AST to JSON for PeakLogic Opta remote runtime. */
function astToJson(node) {
  if (!node || typeof node !== 'object') return null;
  switch (node.type) {
    case 'num':
      return { type: 'num', value: node.value };
    case 'tag':
      return { type: 'tag', name: node.name };
    case 'call':
      return {
        type: 'call',
        name: node.name,
        args: (node.args || []).map((a) => (typeof a === 'string' ? a : astToJson(a))),
      };
    case 'un':
      return { type: 'un', op: node.op, arg: astToJson(node.arg) };
    case 'bin':
      return {
        type: 'bin',
        op: node.op,
        left: astToJson(node.left),
        right: astToJson(node.right),
      };
    case 'action':
      return {
        type: 'action',
        name: node.name,
        tag: node.tag,
        inputTag: node.inputTag || null,
      };
    case 'if':
      return {
        type: 'if',
        cond: astToJson(node.cond),
        thenBody: (node.thenBody || []).map(astToJson),
        elseBody: (node.elseBody || []).map(astToJson),
      };
    case 'program':
      return { type: 'program', body: (node.body || []).map(astToJson) };
    default:
      return null;
  }
}

module.exports = { astToJson };
