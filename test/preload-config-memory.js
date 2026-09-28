'use strict';

/** Default in-memory config backend for unit tests when no Mongo URI is set. */
if (!process.env.PEAKLOGIC_CONFIG_URI && !process.env.MONGODB_URI && !process.env.MONGO_URL) {
  process.env.PEAKLOGIC_CONFIG_URI = 'memory';
}
