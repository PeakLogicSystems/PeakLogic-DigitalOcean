'use strict';

const FUND_HZ = 60;

function normalizeFundAmp(amps) {
  return amps / 50;
}

function mcsaChannel(ch, amps, healthScore = 0.15, opts = {}) {
  const fundAmp = normalizeFundAmp(amps);
  const side = fundAmp * (0.035 + healthScore * 0.22);
  const row = {
    ch,
    fund: [FUND_HZ, fundAmp],
    rotor: [[FUND_HZ - 3.6, side * 0.95], [FUND_HZ + 3.6, side * 1.05]],
    pump: [[120, fundAmp * (0.045 + healthScore * 0.08)], [180, fundAmp * (0.028 + healthScore * 0.05)]],
  };
  if (opts.trueFft) {
    const wear = opts.wear ?? healthScore;
    const bearing = fundAmp * (0.008 + wear * 0.12);
    const ecc = fundAmp * (0.005 + healthScore * 0.08);
    row.bearing = [
      [FUND_HZ * 2 - 1.2, bearing * 0.9],
      [FUND_HZ * 2 + 1.2, bearing],
      [FUND_HZ * 3 - 2.0, bearing * 0.55],
    ];
    row.ecc = [[FUND_HZ * 0.5, ecc], [FUND_HZ * 1.5, ecc * 0.7]];
    row.rotor = [
      [FUND_HZ - 3.6, side * 0.92],
      [FUND_HZ + 3.6, side * 1.08],
      [FUND_HZ - 7.2, side * 0.45],
      [FUND_HZ + 7.2, side * 0.48],
    ];
    row.pump = [
      [120, fundAmp * (0.05 + healthScore * 0.09)],
      [180, fundAmp * (0.032 + healthScore * 0.06)],
      [240, fundAmp * (0.018 + wear * 0.04)],
    ];
  }
  return row;
}

/** Opta MCSA-lite: 6 CT channels, synthetic spectra (fftSize 0). */
function duplexMcsaLiteFromStart({ pumpIndex, runAmps, healthScore = 0.15 }) {
  const channels = [];
  for (let ch = 0; ch < 6; ch++) {
    const pi = ch < 3 ? 1 : 2;
    if (pi !== pumpIndex) {
      channels.push(mcsaChannel(ch, 0, 0));
    } else {
      const phaseScale = 0.95 + (ch % 3) * 0.02;
      channels.push(mcsaChannel(ch, runAmps * phaseScale, healthScore));
    }
  }
  return channels;
}

/** MCXN947-class true MCSA: richer FFT diagnostic bins (4096 @ 8 kHz metadata). */
function duplexTrueMcsaFromStart({ pumpIndex, runAmps, healthScore = 0.15, wear = 0 }) {
  const channels = [];
  for (let ch = 0; ch < 6; ch++) {
    const pi = ch < 3 ? 1 : 2;
    if (pi !== pumpIndex) {
      channels.push(mcsaChannel(ch, 0, 0, { trueFft: true }));
    } else {
      const phaseScale = 0.95 + (ch % 3) * 0.02;
      channels.push(mcsaChannel(ch, runAmps * phaseScale, healthScore, { trueFft: true, wear }));
    }
  }
  return channels;
}

function parcReportFromStart({
  at,
  pumpIndex,
  assetId,
  startMs,
  runAmps,
  peakAmps,
  healthScore,
  wear = 0,
  deviceId = 'duplexls_study',
  mcsaMode = 'lite',
}) {
  const tags = [
    { id: `AI${pumpIndex}`, type: 'REAL', role: 'input', value: runAmps, quality: 'GOOD' },
    { id: `MOTOR${pumpIndex}_START_MS`, type: 'REAL', role: 'memory', value: startMs, quality: 'GOOD' },
  ];
  const trueFft = mcsaMode === 'fft';
  const mcsa = trueFft
    ? duplexTrueMcsaFromStart({ pumpIndex, runAmps, peakAmps, healthScore, wear })
    : duplexMcsaLiteFromStart({ pumpIndex, runAmps, peakAmps, healthScore });
  return {
    at,
    deviceId,
    platform: trueFft ? 'mcxn947-lift-mcsa' : 'arduino-opta-mqtt-st',
    runtime: trueFft
      ? { firmware: 'mcsa-lift-fft', sampleRateHz: 8000, fftSize: 4096, mcsaChannels: 6 }
      : { firmware: 'mcsa-lite', mcsaLite: true, sampleRateHz: 10, fftSize: 0, mcsaChannels: 6 },
    mcsa,
    tags,
    assetId,
  };
}

module.exports = {
  FUND_HZ,
  duplexMcsaLiteFromStart,
  duplexTrueMcsaFromStart,
  duplexMcsaFromStart: duplexMcsaLiteFromStart,
  parcReportFromStart,
  mcsaChannel,
};
