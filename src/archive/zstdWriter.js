'use strict';

const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const zlib = require('zlib');

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hourKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toISOString().slice(0, 13);
}

/**
 * Build hourly-framed zstd JSONL blob + index metadata.
 * Each UTC hour is a separate zstd frame for partial decompress.
 *
 * @param {AsyncIterable<object>|object[]} docs sorted by `at`
 * @param {object} meta { company, siteId, periodStart, periodEnd, blobPath }
 * @returns {Promise<{ blob: Buffer, index: object, recordCount: number }>}
 */
async function buildHourlyZstdBlob(docs, meta) {
  const hourly = new Map();
  let recordCount = 0;
  const tagSet = new Set();
  const exportedIds = [];

  for await (const doc of asyncIterable(docs)) {
    recordCount += 1;
    if (doc._id) exportedIds.push(doc._id);
    const at = doc.at instanceof Date ? doc.at : new Date(doc.at);
    const hk = hourKey(at);
    if (!hourly.has(hk)) hourly.set(hk, []);
    hourly.get(hk).push(JSON.stringify(doc));
    const tagId = doc?.pen?.tagId || doc?.tag?.id;
    if (tagId) tagSet.add(String(tagId));
  }

  const hourKeys = [...hourly.keys()].sort();
  const chunks = [];
  const frameBuffers = [];

  for (let frameIndex = 0; frameIndex < hourKeys.length; frameIndex += 1) {
    const hk = hourKeys[frameIndex];
    const jsonl = `${hourly.get(hk).join('\n')}\n`;
    const frameBuf = await compressFrame(Buffer.from(jsonl, 'utf8'));
    const offset = frameBuffers.reduce((n, b) => n + b.length, 0);
    frameBuffers.push(frameBuf);
    chunks.push({
      hour: `${hk}:00:00.000Z`,
      frameIndex,
      offset,
      length: frameBuf.length,
      records: hourly.get(hk).length,
      tagIds: [...tagSet],
    });
  }

  const blob = Buffer.concat(frameBuffers);
  const index = {
    version: 1,
    company: meta.company,
    siteId: meta.siteId,
    codec: process.env.ARCHIVE_USE_GZIP === '1' ? 'gzip-frames' : 'zstd',
    blobPath: meta.blobPath,
    periodStart: meta.periodStart instanceof Date ? meta.periodStart.toISOString() : meta.periodStart,
    periodEnd: meta.periodEnd instanceof Date ? meta.periodEnd.toISOString() : meta.periodEnd,
    recordCount,
    byteSize: blob.length,
    sha256: sha256Buffer(blob),
    tags: [...tagSet].sort(),
    chunks,
  };

  return { blob, index, recordCount, exportedIds };
}

async function compressFrame(inputBuf) {
  const level = Number(process.env.ARCHIVE_ZSTD_LEVEL) || 3;
  const zstdBin = process.env.ZSTD_BIN || 'zstd';

  if (process.env.ARCHIVE_USE_GZIP === '1') {
    return zlib.gzipSync(inputBuf, { level: 6 });
  }

  try {
    return await runZstdCompress(inputBuf, zstdBin, level);
  } catch (e) {
    if (process.env.ARCHIVE_ZSTD_FALLBACK_GZIP === '0') throw e;
    return zlib.gzipSync(inputBuf, { level: 6 });
  }
}

function runZstdCompress(inputBuf, zstdBin, level) {
  return new Promise((resolve, reject) => {
    const proc = spawn(zstdBin, [`-${level}`, '-c', '-f'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`zstd exit ${code}: ${Buffer.concat(err).toString('utf8')}`));
        return;
      }
      resolve(Buffer.concat(out));
    });
    proc.stdin.end(inputBuf);
  });
}

async function asyncIterable(source) {
  if (source && typeof source[Symbol.asyncIterator] === 'function') {
    for await (const x of source) yield x;
    return;
  }
  for (const x of source || []) yield x;
}

async function writeTempBlob(blob, suffix = '.jsonl.zst') {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mv-archive-'));
  const file = path.join(dir, `blob${suffix}`);
  await fs.promises.writeFile(file, blob);
  return { dir, file };
}

module.exports = {
  buildHourlyZstdBlob,
  compressFrame,
  sha256Buffer,
  hourKey,
  writeTempBlob,
};
