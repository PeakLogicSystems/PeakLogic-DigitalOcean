'use strict';

let scheduler = null;

function setBatchScheduler(s) {
  scheduler = s;
}

function getBatchScheduler() {
  return scheduler;
}

module.exports = { setBatchScheduler, getBatchScheduler };
