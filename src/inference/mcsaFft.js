'use strict';

/** Host-side true-FFT MCSA cook (parity with firmware/arduino-uno-q-mcsa/python/mcsa_edge.py). */

const SLIP_HZ = 3.6;

function hann(n) {
  const w = new Float64Array(n);
  if (n <= 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vi = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + half] = ur - vr;
        im[i + j + half] = ui - vi;
        const nWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nWRe;
      }
    }
  }
}

function rfftMag(samples) {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i];
  fftRadix2(re, im);
  const nfreq = (n >> 1) + 1;
  const mag = new Float64Array(nfreq);
  for (let k = 0; k < nfreq; k++) {
    mag[k] = Math.hypot(re[k], im[k]) * (2 / n);
  }
  mag[0] *= 0.5;
  return mag;
}

function binHz(k, n, fs) {
  return (k * fs) / n;
}

function nearestBin(hz, n, fs) {
  const k = Math.round((hz * n) / fs);
  return Math.max(0, Math.min(n >> 1, k));
}

function peakNear(mag, n, fs, hz, radius = 2, excludeK = null) {
  const center = nearestBin(hz, n, fs);
  const lo = Math.max(1, center - radius);
  const hi = Math.min(mag.length - 1, center + radius);
  let bestK = -1;
  let best = -1;
  for (let k = lo; k <= hi; k++) {
    if (excludeK != null && Math.abs(k - excludeK) <= 1) continue;
    if (mag[k] > best) {
      best = mag[k];
      bestK = k;
    }
  }
  if (bestK < 0) {
    let k = center;
    if (excludeK != null && Math.abs(k - excludeK) <= 1) {
      k = k <= excludeK ? Math.max(1, excludeK - 2) : Math.min(mag.length - 1, excludeK + 2);
    }
    return [binHz(k, n, fs), mag[k] || 0];
  }
  return [binHz(bestK, n, fs), best];
}

function cookChannel(amps, { ch = 0, sampleRate = 4096, fundHz = 60 } = {}) {
  const n = amps.length;
  if (n < 8) {
    return { ch, fund: [fundHz, 0], rotor: [], bearing: [], ecc: [], pump: [] };
  }
  const w = hann(n);
  const windowed = new Array(n);
  for (let i = 0; i < n; i++) windowed[i] = amps[i] * w[i];
  const mag = rfftMag(windowed);
  const fund = peakNear(mag, n, sampleRate, fundHz, 3);
  const fundK = nearestBin(fund[0], n, sampleRate);
  const rotor = [
    peakNear(mag, n, sampleRate, fund[0] - SLIP_HZ, 1, fundK),
    peakNear(mag, n, sampleRate, fund[0] + SLIP_HZ, 1, fundK),
  ];
  const bearing = [
    peakNear(mag, n, sampleRate, fund[0] * 1.8, 2, fundK),
    peakNear(mag, n, sampleRate, fund[0] * 3.1, 2, fundK),
    peakNear(mag, n, sampleRate, fund[0] * 4.7, 2, fundK),
  ];
  const ecc = [
    peakNear(mag, n, sampleRate, fund[0] - 1, 1, fundK),
    peakNear(mag, n, sampleRate, fund[0] + 1, 1, fundK),
  ];
  const pump = [
    peakNear(mag, n, sampleRate, fund[0] * 2, 2, fundK),
    peakNear(mag, n, sampleRate, fund[0] * 3, 2, fundK),
  ];
  const rnd = (pair) => [Math.round(pair[0] * 1000) / 1000, Math.round(pair[1] * 1e6) / 1e6];
  return {
    ch,
    fund: rnd(fund),
    rotor: rotor.map(rnd),
    bearing: bearing.map(rnd),
    ecc: ecc.map(rnd),
    pump: pump.map(rnd),
  };
}

function synthesizeCurrent(n, fs, { fundHz = 60, runAmps = 8, mode = 'healthy' } = {}) {
  let side = 0.03;
  let bearing = 0.01;
  let ecc = 0.01;
  let harm2 = 0.04;
  if (mode === 'bearing_wear') {
    bearing = 0.28;
    side = 0.08;
  } else if (mode === 'eccentricity') {
    ecc = 0.22;
    side = 0.1;
  } else if (mode === 'impeller_worn') {
    harm2 = 0.22;
    side = 0.06;
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let x = runAmps * Math.sin(2 * Math.PI * fundHz * t);
    x += runAmps * side * Math.sin(2 * Math.PI * (fundHz - SLIP_HZ) * t);
    x += runAmps * side * Math.sin(2 * Math.PI * (fundHz + SLIP_HZ) * t);
    x += runAmps * ecc * Math.sin(2 * Math.PI * (fundHz + 1) * t);
    x += runAmps * bearing * Math.sin(2 * Math.PI * fundHz * 3.1 * t);
    x += runAmps * harm2 * Math.sin(2 * Math.PI * fundHz * 2 * t);
    out[i] = x;
  }
  return out;
}

module.exports = {
  SLIP_HZ,
  cookChannel,
  synthesizeCurrent,
  rfftMag,
};
