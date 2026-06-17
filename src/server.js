'use strict';

const { createCloudApp } = require('./api/cloudApp');
const { connectMongo, closeMongo } = require('./db/mongo');
const { ensureIndexes } = require('./db/indexes');
const { PORT } = require('./config');

async function main() {
  await connectMongo();
  await ensureIndexes();

  const app = createCloudApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`MooreVIEW Cloud API listening on :${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`[cloud] ${signal} — shutting down`);
    server.close();
    await closeMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[cloud] boot failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
