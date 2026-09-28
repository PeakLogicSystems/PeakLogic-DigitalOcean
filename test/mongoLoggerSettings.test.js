'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeMongoLogger,
  defaultMongoLogger,
  effectiveMongoLogger,
  resolveMongoLoggerForDeployment,
  DEFAULT_MONGO_LOGGER,
} = require('../src/settings/mongoLoggerSettings');

describe('normalizeMongoLogger', () => {
  it('saves uri with defaults', () => {
    const ml = normalizeMongoLogger({ uri: 'mongodb://127.0.0.1:27017' }, {});
    assert.equal(ml.uri, 'mongodb://127.0.0.1:27017');
    assert.equal(ml.db, 'peaklogic');
    assert.equal(ml.collection, 'tag_logs');
    assert.equal(ml.edgeCollection, 'edge_inference');
    assert.equal(ml.sampleIntervalMs, 5000);
  });

  it('clears when uri key is empty string', () => {
    const ml = normalizeMongoLogger({ uri: '' }, {
      mongoLogger: { uri: 'mongodb://old' },
    });
    assert.deepEqual(ml, {});
  });

  it('merges db/collection on partial update without uri key', () => {
    const ml = normalizeMongoLogger(
      { db: 'archive', sampleIntervalMs: 10000 },
      { mongoLogger: { uri: 'mongodb://host', db: 'peaklogic', collection: 'tag_logs' } }
    );
    assert.equal(ml.uri, 'mongodb://host');
    assert.equal(ml.db, 'archive');
    assert.equal(ml.sampleIntervalMs, 10000);
  });

  it('preserves previous config when incoming is undefined', () => {
    const prev = { mongoLogger: { uri: 'mongodb://keep', db: 'x' } };
    const ml = normalizeMongoLogger(undefined, prev);
    assert.equal(ml.uri, 'mongodb://keep');
    assert.equal(ml.db, 'x');
  });

  it('defaultMongoLogger matches DEFAULT_MONGO_LOGGER', () => {
    assert.deepEqual(defaultMongoLogger(), DEFAULT_MONGO_LOGGER);
  });

  it('effectiveMongoLogger fills defaults when stored is empty', () => {
    const ml = effectiveMongoLogger({});
    assert.equal(ml.uri, DEFAULT_MONGO_LOGGER.uri);
    assert.equal(ml.db, DEFAULT_MONGO_LOGGER.db);
  });
});

describe('resolveMongoLoggerForDeployment', () => {
  const prevUri = process.env.MONGODB_URI;
  const prevDb = process.env.MONGODB_DB;

  it('cloud replaces localhost tenant URI with platform env', () => {
    process.env.MONGODB_URI = 'mongodb+srv://cloud.example/peaklogic_cloud';
    process.env.MONGODB_DB = 'peaklogic_cloud';
    try {
      const ml = resolveMongoLoggerForDeployment(
        { uri: 'mongodb://127.0.0.1:27017', db: 'peaklogic' },
        'cloud',
      );
      assert.equal(ml.uri, 'mongodb+srv://cloud.example/peaklogic_cloud');
      assert.equal(ml.db, 'peaklogic_cloud');
    } finally {
      if (prevUri == null) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prevUri;
      if (prevDb == null) delete process.env.MONGODB_DB;
      else process.env.MONGODB_DB = prevDb;
    }
  });
});
