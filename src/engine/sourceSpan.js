'use strict';

function spanFrom(nodeOrTok) {
  if (!nodeOrTok) return null;
  if (nodeOrTok.span) return nodeOrTok.span;
  if (nodeOrTok.start != null && nodeOrTok.end != null) {
    return { start: nodeOrTok.start, end: nodeOrTok.end };
  }
  return null;
}

function mergeSpan(a, b) {
  const sa = spanFrom(a);
  const sb = spanFrom(b);
  if (!sa) return sb;
  if (!sb) return sa;
  return { start: Math.min(sa.start, sb.start), end: Math.max(sa.end, sb.end) };
}

function attachSpan(node, ...parts) {
  let span = null;
  for (const p of parts) span = mergeSpan(span, p);
  if (span) node.span = span;
  return node;
}

module.exports = { spanFrom, mergeSpan, attachSpan };
