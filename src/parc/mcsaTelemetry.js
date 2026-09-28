'use strict';

/** Expand MCSA HVAC telemetry env{} into Parc tags[] when firmware omits tags. */
function expandMcsaEnvTags(body) {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body.tags) && body.tags.length) return body;
  const env = body.env;
  if (!env || typeof env !== 'object') return body;

  const tags = [];
  for (const key of ['T1_C', 'T2_C', 'T3_C', 'T4_C']) {
    if (env[key] == null) continue;
    tags.push({
      id: key,
      type: 'REAL',
      role: 'input',
      value: Number(env[key]) || 0,
      quality: 'GOOD',
    });
  }
  if (env.WATER_ROPE_MV != null) {
    tags.push({
      id: 'WATER_ROPE_MV',
      type: 'INT',
      role: 'input',
      value: Math.trunc(Number(env.WATER_ROPE_MV) || 0),
      quality: 'GOOD',
    });
  }
  for (const key of ['WR_DETECT', 'WR_INPUT_ON', 'COMP_FLT', 'FAN_FLT']) {
    if (env[key] == null) continue;
    tags.push({
      id: key,
      type: 'BOOL',
      role: 'input',
      value: env[key] === true || env[key] === 'true',
      quality: 'GOOD',
    });
  }
  if (!tags.length) return body;
  return { ...body, tags };
}

module.exports = {
  expandMcsaEnvTags,
};
