'use strict';

/** @deprecated Use storeSlimTelemetry — slim 7-day operational store; full data in datalake. */
const { storeSlimTelemetry } = require('../ingest/storeSlimTelemetry');

async function storeParcTelemetry(msg) {
  return storeSlimTelemetry(msg);
}

module.exports = {
  storeParcTelemetry,
};
