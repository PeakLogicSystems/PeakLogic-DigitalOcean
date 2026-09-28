'use strict';

const { parseProgram, validateProgram, collectProgramTagRefs } = require('../engine/parser');
const { compileProgramBytecode, bytecodeToBase64, estimateBytecodeBytes } = require('../engine/stBytecode');
const { assessStProgramLines } = require('../programs/stProgramLimits');
const {
  tagMetaForDevice,
  slimTagMetaForDeploy,
  inferTagType,
  defaultMetaForId,
} = require('./optaTagMeta');

/** Build put_program body for Opta ST firmware (HTTP or MQTT Parc cmd). */
function buildOptaProgramBody(source, tagStore, driverId, opts = {}) {
  const lineCheck = assessStProgramLines(source, { forParc: true });
  if (lineCheck.overLimit) {
    return { ok: false, errors: lineCheck.errors, lineCount: lineCheck };
  }
  // Read-only: resolve deploy tag meta from the store or inferred defaults — do not upsert
  // into the PC tag database (large projects can be at MAX_TAGS; scanEngine / tags API
  // ensure missing refs when the user explicitly loads or edits the program).
  const storeTags = tagStore.list();
  const storeById = new Map(storeTags.map((t) => [t.id, t]));
  const { ast, errors: parseErrs } = parseProgram(source);
  if (parseErrs.length) return { ok: false, errors: parseErrs };

  const programRefs = ast ? collectProgramTagRefs(ast) : [];
  // Opta firmware bootstraps on-board I/O and expansion tags — deploy only program refs.
  const tagIds = [...new Set(programRefs)].sort();

  const valErrs = validateProgram(ast, [...new Set([...storeTags.map((t) => t.id), ...programRefs])]);
  if (valErrs.length) return { ok: false, errors: valErrs };

  const tags = tagIds.map((id) => {
    const existing = storeById.get(id);
    if (opts.fullTagMeta && existing) return tagMetaForDevice(existing);
    return slimTagMetaForDeploy(existing, id, driverId);
  });

  let bc;
  let traceMap = [];
  try {
    const compiled = compileProgramBytecode(ast, tagIds, tags);
    bc = bytecodeToBase64(compiled.bytecode);
    traceMap = compiled.traceMap || [];
  } catch (e) {
    return { ok: false, errors: [e.message || String(e)] };
  }

  const body = { bc, tagCount: tagIds.length };
  if (traceMap.length) body.traceMap = traceMap;
  if (opts.includeSource) body.source = source;

  return { ok: true, body, tagIds, tags, traceMap };
}

/**
 * MQTT put_program body: omit traceMap source spans (PC keeps map locally).
 * Firmware only needs trace point count to size TRACE_PEEK telemetry.
 */
function slimPutProgramBodyForMqtt(body, traceMap) {
  const slim = { ...body };
  delete slim.traceMap;
  const n = Array.isArray(traceMap) ? traceMap.length : 0;
  if (n > 0) slim.tracePointCount = n;
  return slim;
}

/** Estimate HTTP/MQTT deploy payload size for Opta remote ST. */
function estimateOptaDeploy(source, tagStore, driverId, opts = {}) {
  const built = buildOptaProgramBody(source, tagStore, driverId, opts);
  if (!built.ok) {
    return { ok: false, errors: built.errors || ['Program invalid'] };
  }
  const { clientDeployMeta, OPTA_PROGRAM_MAX_BYTES } = require('../drivers/optaProtocol');
  const body = {
    ...built.body,
    ...clientDeployMeta(opts.programName ? { programName: opts.programName } : {}),
  };
  const slimBody = slimPutProgramBodyForMqtt(body, built.traceMap);
  const bytes = Buffer.byteLength(JSON.stringify(slimBody));
  const bcBuf = Buffer.from(built.body.bc, 'base64');
  const bcBytes = bcBuf.length;
  const { parseBytecodeStats } = require('../engine/stBytecode');
  const bcStats = parseBytecodeStats(bcBuf) || {
    tagCount: built.tagIds.length,
    codeBytes: 0,
    dataBytes: bcBytes,
    totalBytes: bcBytes,
  };
  const limit = Number(opts.limitBytes) > 0 ? Number(opts.limitBytes) : OPTA_PROGRAM_MAX_BYTES;
  return {
    ok: true,
    bytes,
    bcBytes,
    astBytes: bcBytes,
    codeBytes: bcStats.codeBytes,
    dataBytes: bcStats.dataBytes,
    bcTotalBytes: bcStats.totalBytes,
    tagCount: built.tagIds.length,
    limit,
    overLimit: bytes >= limit,
    headroom: limit - bytes,
    pct: Math.min(100, Math.round((bytes / limit) * 100)),
  };
}

module.exports = {
  buildOptaProgramBody,
  slimPutProgramBodyForMqtt,
  estimateOptaDeploy,
  tagMetaForDevice,
  slimTagMetaForDeploy,
  inferTagType,
  defaultMetaForId,
};
