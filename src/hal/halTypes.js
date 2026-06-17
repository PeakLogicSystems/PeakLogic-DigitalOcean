'use strict';

/** Built-in I/O channel kinds for the HAL driver. */
const HAL_KINDS = Object.freeze({
  DI: 'di',
  DO: 'do',
  AI: 'ai',
  AO: 'ao',
  CNT: 'cnt',
});

const HAL_PIN_PREFIX = Object.freeze({
  di: 'DI',
  do: 'DO',
  ai: 'AI',
  ao: 'AO',
  cnt: 'CNT',
});

const DEFAULT_LIMITS = Object.freeze({
  di: 32,
  do: 32,
  ai: 16,
  ao: 8,
  cnt: 8,
});

module.exports = { HAL_KINDS, HAL_PIN_PREFIX, DEFAULT_LIMITS };
