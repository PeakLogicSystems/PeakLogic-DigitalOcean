'use strict';

/**
 * Generate public/mv.ico (multi-size) and public/branding/mv-icon-256.png
 * from PeakLogic Purple Standard colors. No npm dependencies.
 *
 * Usage: node scripts/generate-mv-icon.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT_ICO = path.join(ROOT, 'public', 'mv.ico');
const OUT_PNG = path.join(ROOT, 'public', 'branding', 'mv-icon-256.png');

const PURPLE = { r: 111, g: 66, b: 193 };
const PURPLE_DARK = { r: 78, g: 42, b: 132 };
const WHITE = { r: 255, g: 255, b: 255 };
const HIGHLIGHT = { r: 233, g: 213, b: 255 };

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgba, width, height) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function setPx(rgba, w, x, y, c, a = 255) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  const alpha = a / 255;
  rgba[i] = Math.round(c.r * alpha + rgba[i] * (1 - alpha));
  rgba[i + 1] = Math.round(c.g * alpha + rgba[i + 1] * (1 - alpha));
  rgba[i + 2] = Math.round(c.b * alpha + rgba[i + 2] * (1 - alpha));
  rgba[i + 3] = Math.min(255, Math.round(a + rgba[i + 3] * (1 - alpha)));
}

function fillRoundRect(rgba, w, h, pad, radius, cTop, cBottom) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.max(pad - x, 0, x - (w - 1 - pad));
      const dy = Math.max(pad - y, 0, y - (h - 1 - pad));
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const t = h > 1 ? y / (h - 1) : 0;
      setPx(rgba, w, x, y, lerp(cTop, cBottom, t), 255);
    }
  }
}

function fillEllipse(rgba, w, cx, cy, rx, ry, c, a = 255) {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(rgba.length / (w * 4) - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) setPx(rgba, w, x, y, c, a);
      else if (d <= 1.08) setPx(rgba, w, x, y, c, Math.round(a * (1.08 - d) / 0.08));
    }
  }
}

function strokeEllipse(rgba, w, cx, cy, rx, ry, stroke, c) {
  for (let y = 0; y < rgba.length / (w * 4); y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
      if (d <= stroke) setPx(rgba, w, x, y, c, 255);
    }
  }
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const pad = Math.max(1, Math.round(size * 0.08));
  const radius = Math.round(size * 0.22);
  fillRoundRect(rgba, size, size, pad, radius, PURPLE, PURPLE_DARK);

  const cx = size / 2;
  const cy = size * 0.48;
  const rx = size * 0.30;
  const ry = size * 0.20;
  const stroke = Math.max(1, Math.round(size * 0.055));
  strokeEllipse(rgba, size, cx, cy, rx, ry, stroke, WHITE);
  fillEllipse(rgba, size, cx, cy, size * 0.11, size * 0.11, WHITE);
  fillEllipse(
    rgba,
    size,
    cx + size * 0.04,
    cy - size * 0.04,
    size * 0.035,
    size * 0.035,
    HIGHLIGHT,
  );

  return rgba;
}

function packIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entrySize = 16;
  const dataOffset = 6 + entrySize * count;
  let offset = dataOffset;
  const entries = [];
  const bodies = [];

  for (const png of pngBuffers) {
    const size = png.width;
    const entry = Buffer.alloc(entrySize);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(png.buf);
    offset += png.buf.length;
  }

  return Buffer.concat([header, ...entries, ...bodies]);
}

function main() {
  const sizes = [16, 32, 48, 256];
  const pngBuffers = sizes.map((size) => {
    const rgba = renderIcon(size);
    const buf = encodePng(rgba, size, size);
    return { width: size, buf };
  });

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_ICO, packIco(pngBuffers));
  fs.writeFileSync(OUT_PNG, pngBuffers[pngBuffers.length - 1].buf);
  console.log(`Wrote ${OUT_ICO}`);
  console.log(`Wrote ${OUT_PNG}`);
}

main();
