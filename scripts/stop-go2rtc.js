'use strict';

const path = require('path');
const go2rtc = require('../src/cameras/go2rtcManager');

const DATA_DIR = process.env.PEAKLOGIC_DATA || path.join(__dirname, '..', 'data');

go2rtc.stop(DATA_DIR).then(() => {
  console.log('go2rtc stopped.');
}).catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
