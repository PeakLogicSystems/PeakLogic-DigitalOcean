'use strict';

const dotenv = require('dotenv');

let loaded = false;

/** Load `.env` once per process. Safe to call from multiple modules. */
function loadEnv() {
  if (loaded) return;
  loaded = true;
  dotenv.config();
}

module.exports = { loadEnv };
