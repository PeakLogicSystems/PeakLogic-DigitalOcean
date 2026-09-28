#!/usr/bin/env node

'use strict';



/**

 * One-time migration: import JSON config from data/ into MongoDB.

 * Usage:

 *   PEAKLOGIC_CONFIG_URI=mongodb://127.0.0.1:27017 node scripts/migrate-config-to-mongo.js

 */



const path = require('path');



async function main() {

  if (!process.env.PEAKLOGIC_CONFIG_URI && !process.env.MONGODB_URI) {

    console.error('Set PEAKLOGIC_CONFIG_URI or MONGODB_URI');

    process.exit(1);

  }



  const configStore = require(path.join(__dirname, '../src/configStore'));

  const mongoBackend = require(path.join(__dirname, '../src/configStore/mongoBackend'));

  const { migrateConfigFilesToMongo } = require(path.join(__dirname, '../src/configStore/migrateFromFiles'));

  const { safeId } = require(path.join(__dirname, '../src/project/projectIds'));



  const imported = await migrateConfigFilesToMongo({

    writeDocument: mongoBackend.writeDocument,

    writeProjectSnapshot: mongoBackend.writeProjectSnapshot,

    safeId,

  });



  await configStore.init();

  const status = configStore.status();

  console.log('Migration complete.');

  console.log('Imported:', imported.length ? imported.join(', ') : '(nothing new on disk)');

  console.log('Mongo:', status.mongo);

  await configStore.shutdown();

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


