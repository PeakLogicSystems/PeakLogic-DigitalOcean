#!/usr/bin/env node
'use strict';

/**
 * Daily cron entrypoint: compact Mongo pen_sample day (today−7 UTC) → zstd on archive server.
 *
 *   node scripts/run-archive-compact.js
 *   ARCHIVE_COMPACT_DRY_RUN=1 node scripts/run-archive-compact.js
 *   ARCHIVE_COMPACT_DAY=2026-06-24 node scripts/run-archive-compact.js
 */

const { runCompactJob } = require('../src/archive/compactJob');

async function main() {
  const dayKey = process.env.ARCHIVE_COMPACT_DAY || undefined;
  const report = await runCompactJob({ dayKey });

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[archive-compact]', e.message || e);
  process.exitCode = 1;
});
