/*
 * PeakLogic Opta — M4 coprocessor for true-FFT MCSA.
 *
 * Flash with Tools → Flash split → 1.5MB M7 + 0.5MB M4, Target core → M4.
 * M7 sketch (PeaklogicOptaMqttSt) boots this core via RPC.begin() / bootM4().
 * A/D ingest stays on M7 (scan-safe); this core only FFTs SRAM4 windows.
 */
#include <Arduino.h>
#if __has_include(<RPC.h>)
#include <RPC.h>
#endif
#include "mv_mcsa_shared.h"
#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static float s_re[MV_MCSA_N];
static float s_im[MV_MCSA_N];
static uint32_t s_seenM7 = 0;

static void fftRadix2(float* re, float* im, int n) {
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      float tr = re[i]; re[i] = re[j]; re[j] = tr;
      float ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (int len = 2; len <= n; len <<= 1) {
    const float ang = -2.0f * (float)M_PI / (float)len;
    const float wlenRe = cosf(ang);
    const float wlenIm = sinf(ang);
    for (int i = 0; i < n; i += len) {
      float wRe = 1.0f;
      float wIm = 0.0f;
      const int half = len >> 1;
      for (int j = 0; j < half; j++) {
        const float ur = re[i + j];
        const float ui = im[i + j];
        const float vr = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const float vi = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + half] = ur - vr;
        im[i + j + half] = ui - vi;
        const float nWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nWRe;
      }
    }
  }
}

static int nearestBin(float hz, int n, float fs) {
  int k = (int)lroundf(hz * (float)n / fs);
  if (k < 0) k = 0;
  if (k > (n >> 1)) k = n >> 1;
  return k;
}

static void peakNear(const float* mag, int n, float fs, float hz, int radius, int excludeK,
                     float* outHz, float* outAmp) {
  const int nfreq = (n >> 1) + 1;
  int center = nearestBin(hz, n, fs);
  int lo = center - radius;
  int hi = center + radius;
  if (lo < 1) lo = 1;
  if (hi > nfreq - 1) hi = nfreq - 1;
  int bestK = -1;
  float best = -1.0f;
  for (int k = lo; k <= hi; k++) {
    if (excludeK >= 0 && abs(k - excludeK) <= 1) continue;
    if (mag[k] > best) {
      best = mag[k];
      bestK = k;
    }
  }
  if (bestK < 0) {
    bestK = center;
    if (excludeK >= 0 && abs(bestK - excludeK) <= 1) {
      bestK = bestK <= excludeK ? excludeK - 2 : excludeK + 2;
    }
    if (bestK < 1) bestK = 1;
    if (bestK > nfreq - 1) bestK = nfreq - 1;
    best = mag[bestK];
  }
  float kInterp = (float)bestK;
  float amp = best;
  if (bestK > 0 && bestK < nfreq - 1) {
    const float alpha = mag[bestK - 1];
    const float beta = mag[bestK];
    const float gamma = mag[bestK + 1];
    const float den = alpha - 2.0f * beta + gamma;
    if (fabsf(den) > 1e-12f) {
      const float p = 0.5f * (alpha - gamma) / den;
      kInterp = (float)bestK + p;
      amp = beta - 0.25f * (alpha - gamma) * p;
      if (amp < 0.0f) amp = best;
    }
  }
  *outHz = kInterp * fs / (float)n;
  *outAmp = amp;
}

static float windowAt(int i, int n, bool blackmanHarris) {
  const float x = 2.0f * (float)M_PI * (float)i / (float)(n - 1);
  if (blackmanHarris) {
    return 0.35875f - 0.48829f * cosf(x) + 0.14128f * cosf(2.0f * x) - 0.01168f * cosf(3.0f * x);
  }
  return 0.5f * (1.0f - cosf(x));
}

static void cookChannel(MvMcsaMailbox* m, uint8_t ch) {
  const int n = m->n > 0 && m->n <= MV_MCSA_N ? m->n : MV_MCSA_N;
  const float fs = m->fsHz > 0 ? (float)m->fsHz : (float)MV_MCSA_FS_HZ;
  const float fundTarget = m->fundHz > 1.0f ? m->fundHz : MV_MCSA_FUND_HZ;
  const bool dc = m->waveform != MV_MCSA_WAVE_AC;
  float mean = 0.0f;
  for (int i = 0; i < n; i++) {
    /* Do not clip at 0 — rectifier clip fabricates harmonics in the residual. */
    const float amps = ((float)m->samples[ch][i] - m->offsetRaw[ch]) * m->ampsPerRaw[ch];
    mean += amps;
    s_re[i] = amps;
  }
  mean /= (float)n;
  for (int i = 0; i < n; i++) {
    s_re[i] = (s_re[i] - mean) * windowAt(i, n, dc);
    s_im[i] = 0.0f;
  }
  fftRadix2(s_re, s_im, n);
  const int nfreq = (n >> 1) + 1;
  for (int k = 0; k < nfreq; k++) {
    float mag = hypotf(s_re[k], s_im[k]) * (2.0f / (float)n);
    if (k == 0) mag *= 0.5f;
    s_re[k] = mag;
  }
  MvMcsaCookedCh* c = &m->cooked[ch];
  memset(c, 0, sizeof(*c));
  c->ch = ch;
  const uint8_t dtype = m->deviceType;
  const uint8_t poles = m->numPoles >= 2 ? m->numPoles : 4;
  const float slip = m->slip > 0.0f ? m->slip : 0.03f;
  if (dc) {
    /* 0–1 V RMS TX: DC is running amps; residual FFT is ripple + load modulation. */
    c->fundHz = 0.0f;
    c->fundAmp = mean > 0.0f ? mean : 0.0f;
    peakNear(s_re, n, fs, 2.0f, 4, -1, &c->rotorHz[0], &c->rotorAmp[0]);
    peakNear(s_re, n, fs, 5.0f, 4, -1, &c->rotorHz[1], &c->rotorAmp[1]);
    peakNear(s_re, n, fs, 15.0f, 6, -1, &c->bearingHz[0], &c->bearingAmp[0]);
    peakNear(s_re, n, fs, 30.0f, 8, -1, &c->bearingHz[1], &c->bearingAmp[1]);
    peakNear(s_re, n, fs, 40.0f, 8, -1, &c->bearingHz[2], &c->bearingAmp[2]);
    peakNear(s_re, n, fs, 1.0f, 3, -1, &c->eccHz[0], &c->eccAmp[0]);
    peakNear(s_re, n, fs, 1.5f, 3, -1, &c->eccHz[1], &c->eccAmp[1]);
    peakNear(s_re, n, fs, 120.0f, 6, -1, &c->statorHz, &c->statorAmp);
    if (dtype == MV_MCSA_DEV_PUMP || dtype == MV_MCSA_DEV_ALL || dtype == MV_MCSA_DEV_BASE) {
      peakNear(s_re, n, fs, 120.0f, 6, -1, &c->pumpHz[0], &c->pumpAmp[0]);
      peakNear(s_re, n, fs, 100.0f, 6, -1, &c->pumpHz[1], &c->pumpAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_FAN || dtype == MV_MCSA_DEV_ALL) {
      peakNear(s_re, n, fs, 8.0f, 4, -1, &c->fanHz[0], &c->fanAmp[0]);
      peakNear(s_re, n, fs, 12.0f, 4, -1, &c->fanHz[1], &c->fanAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_COMPRESSOR || dtype == MV_MCSA_DEV_ALL) {
      peakNear(s_re, n, fs, 120.0f, 6, -1, &c->compressorHz[0], &c->compressorAmp[0]);
      peakNear(s_re, n, fs, 180.0f, 6, -1, &c->compressorHz[1], &c->compressorAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_TURBINE || dtype == MV_MCSA_DEV_ALL) {
      peakNear(s_re, n, fs, 24.0f, 6, -1, &c->turbineHz[0], &c->turbineAmp[0]);
      peakNear(s_re, n, fs, 48.0f, 6, -1, &c->turbineHz[1], &c->turbineAmp[1]);
    }
    return;
  }
  peakNear(s_re, n, fs, fundTarget, 3, -1, &c->fundHz, &c->fundAmp);
  const int fundK = nearestBin(c->fundHz, n, fs);
  const float f_r = slip * c->fundHz / ((float)poles / 2.0f);
  peakNear(s_re, n, fs, c->fundHz - 2.0f * slip * c->fundHz, 1, fundK, &c->rotorHz[0], &c->rotorAmp[0]);
  peakNear(s_re, n, fs, c->fundHz + 2.0f * slip * c->fundHz, 1, fundK, &c->rotorHz[1], &c->rotorAmp[1]);
  peakNear(s_re, n, fs, c->fundHz + 3.6f * f_r, 2, fundK, &c->bearingHz[0], &c->bearingAmp[0]);
  peakNear(s_re, n, fs, c->fundHz + 5.4f * f_r, 2, fundK, &c->bearingHz[1], &c->bearingAmp[1]);
  peakNear(s_re, n, fs, c->fundHz * 4.7f, 2, fundK, &c->bearingHz[2], &c->bearingAmp[2]);
  peakNear(s_re, n, fs, c->fundHz - f_r, 1, fundK, &c->eccHz[0], &c->eccAmp[0]);
  peakNear(s_re, n, fs, c->fundHz + f_r, 1, fundK, &c->eccHz[1], &c->eccAmp[1]);
  peakNear(s_re, n, fs, c->fundHz * 2.0f, 2, fundK, &c->statorHz, &c->statorAmp);
  if (dtype == MV_MCSA_DEV_PUMP || dtype == MV_MCSA_DEV_ALL || dtype == MV_MCSA_DEV_BASE) {
    const float vpf = (float)(m->impellerVanes[ch] ? m->impellerVanes[ch] : 5) * f_r;
    peakNear(s_re, n, fs, c->fundHz + vpf, 2, fundK, &c->pumpHz[0], &c->pumpAmp[0]);
    peakNear(s_re, n, fs, c->fundHz - vpf, 2, fundK, &c->pumpHz[1], &c->pumpAmp[1]);
  }
  if (dtype == MV_MCSA_DEV_FAN || dtype == MV_MCSA_DEV_ALL) {
    peakNear(s_re, n, fs, c->fundHz + f_r, 2, fundK, &c->fanHz[0], &c->fanAmp[0]);
    peakNear(s_re, n, fs, c->fundHz - f_r, 2, fundK, &c->fanHz[1], &c->fanAmp[1]);
  }
  if (dtype == MV_MCSA_DEV_COMPRESSOR || dtype == MV_MCSA_DEV_ALL) {
    const float lobe = (float)(m->compressorLobes[ch] ? m->compressorLobes[ch] : 4) * f_r;
    peakNear(s_re, n, fs, c->fundHz + lobe, 2, fundK, &c->compressorHz[0], &c->compressorAmp[0]);
    peakNear(s_re, n, fs, c->fundHz - lobe, 2, fundK, &c->compressorHz[1], &c->compressorAmp[1]);
  }
  if (dtype == MV_MCSA_DEV_TURBINE || dtype == MV_MCSA_DEV_ALL) {
    const float bpf = (float)(m->turbineBlades[ch] ? m->turbineBlades[ch] : 24) * f_r;
    peakNear(s_re, n, fs, c->fundHz + bpf, 2, fundK, &c->turbineHz[0], &c->turbineAmp[0]);
    peakNear(s_re, n, fs, c->fundHz - bpf, 2, fundK, &c->turbineHz[1], &c->turbineAmp[1]);
  }
}

static void classifyAsset(MvMcsaMailbox* m, uint8_t lo, uint8_t hi, bool hvacLoad,
                          char* label, float* score, float* conf) {
  float fund = 0.0f, side = 0.0f, harm = 0.0f, bearing = 0.0f, ecc = 0.0f;
  uint8_t n = 0;
  for (uint8_t ch = lo; ch < hi && ch < MV_MCSA_CH; ch++) {
    const MvMcsaCookedCh* c = &m->cooked[ch];
    if (c->fundAmp < 0.02f) continue;
    n++;
    fund += c->fundAmp;
    side += c->rotorAmp[0] + c->rotorAmp[1];
    bearing += c->bearingAmp[0] + c->bearingAmp[1] + c->bearingAmp[2];
    ecc += c->eccAmp[0] + c->eccAmp[1];
    harm += c->pumpAmp[0] + c->pumpAmp[1] + c->fanAmp[0] + c->fanAmp[1]
      + c->compressorAmp[0] + c->compressorAmp[1] + c->turbineAmp[0] + c->turbineAmp[1]
      + c->statorAmp;
  }
  if (!n) {
    strncpy(label, "healthy", 19);
    *score = 0.08f;
    *conf = 0.4f;
    return;
  }
  fund /= (float)n;
  const float ratioSide = fund > 1e-6f ? (side + bearing + ecc) / fund : 0.0f;
  const float ratioBear = fund > 1e-6f ? bearing / fund : 0.0f;
  const float ratioEcc = fund > 1e-6f ? ecc / fund : 0.0f;
  const float ratioHarm = fund > 1e-6f ? harm / fund : 0.0f;
  if (m->waveform != MV_MCSA_WAVE_AC) {
    if (hvacLoad) {
      if (ratioBear > 0.025f) {
        strncpy(label, "bearing_wear", 19);
        *score = 0.75f;
        *conf = 0.82f;
      } else if (ratioHarm > 0.04f) {
        strncpy(label, "compressor_stress", 19);
        *score = 0.68f;
        *conf = 0.78f;
      } else if (ratioSide > 0.03f) {
        strncpy(label, "imbalance", 19);
        *score = 0.62f;
        *conf = 0.76f;
      } else {
        strncpy(label, "healthy", 19);
        *score = min(0.35f, max(0.06f, ratioHarm * 4.0f + ratioSide * 3.0f));
        *conf = 0.84f;
      }
    } else if (ratioHarm > 0.04f) {
      strncpy(label, "impeller_worn", 19);
      *score = 0.72f;
      *conf = 0.78f;
    } else if (ratioSide > 0.03f || ratioEcc > 0.02f) {
      strncpy(label, "clog_ragging", 19);
      *score = 0.65f;
      *conf = 0.76f;
    } else if (ratioBear > 0.025f) {
      strncpy(label, "bearing_wear", 19);
      *score = 0.60f;
      *conf = 0.72f;
    } else {
      strncpy(label, "healthy", 19);
      *score = min(0.35f, max(0.06f, ratioHarm * 4.0f + ratioSide * 3.0f));
      *conf = 0.84f;
    }
    label[19] = '\0';
    return;
  }
  if (ratioBear > 0.22f) {
    strncpy(label, "bearing_wear", 19);
    *score = 0.80f;
    *conf = 0.84f;
  } else if (ratioEcc > 0.18f || ratioSide > 0.32f) {
    strncpy(label, hvacLoad ? "imbalance" : "eccentricity", 19);
    *score = 0.70f;
    *conf = 0.80f;
  } else if (ratioHarm > 0.45f) {
    strncpy(label, hvacLoad ? "compressor_stress" : "impeller_worn", 19);
    *score = 0.74f;
    *conf = 0.78f;
  } else {
    strncpy(label, "healthy", 19);
    *score = min(0.35f, max(0.06f, ratioSide * 0.4f + ratioHarm * 0.25f));
    *conf = 0.86f;
  }
  label[19] = '\0';
}

static void motorCtRange(const MvMcsaMotorMailbox* slot, uint8_t* lo, uint8_t* hi) {
  uint8_t minCh = 255;
  uint8_t maxCh = 0;
  const uint8_t list[] = { slot->ctRun, slot->ctStart, slot->ctPhaseB, slot->ctPhaseC };
  for (uint8_t i = 0; i < 4; i++) {
    const uint8_t ch = list[i];
    if (ch > 5) continue;
    if (ch < minCh) minCh = ch;
    if (ch > maxCh) maxCh = ch;
  }
  *lo = minCh <= 5 ? minCh : 0;
  *hi = maxCh;
}

static void processWindow(MvMcsaMailbox* m) {
  m->status = MV_MCSA_ST_M4_RUN;
  const uint32_t t0 = micros();
  const uint8_t nch = m->nch > 0 && m->nch <= MV_MCSA_CH ? m->nch : MV_MCSA_CH;
  for (uint8_t ch = 0; ch < nch; ch++) cookChannel(m, ch);

  const uint8_t nm = m->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : m->motorCount;
  if (nm > 0) {
    uint8_t outIdx = 0;
    for (uint8_t mi = 0; mi < nm && outIdx < 2; mi++) {
      const MvMcsaMotorMailbox* slot = &m->motor[mi];
      if (!slot->enabled) continue;
      uint8_t lo = 0;
      uint8_t hi = 0;
      motorCtRange(slot, &lo, &hi);
      if (hi < lo || lo > 5) continue;
      const bool hvacLoad = (nch <= 2);
      char* lab = outIdx == 0 ? m->label0 : m->label1;
      float* sc = outIdx == 0 ? &m->score0 : &m->score1;
      float* cf = outIdx == 0 ? &m->conf0 : &m->conf1;
      classifyAsset(m, lo, (uint8_t)(hi + 1), hvacLoad, lab, sc, cf);
      outIdx++;
    }
  } else if (nch <= 2) {
    classifyAsset(m, 0, 1, true, m->label0, &m->score0, &m->conf0);
    classifyAsset(m, 1, 2, true, m->label1, &m->score1, &m->conf1);
  } else {
    classifyAsset(m, 0, 3, false, m->label0, &m->score0, &m->conf0);
    classifyAsset(m, 3, 6, false, m->label1, &m->score1, &m->conf1);
  }

  m->fftUs = micros() - t0;
  m->m4Seq = m->m4Seq + 1;
  m->status = MV_MCSA_ST_DONE;
}

void setup() {
#if __has_include(<RPC.h>)
  RPC.begin();
#endif
}

void loop() {
  MvMcsaMailbox* m = mvMcsaShm();
  if (m && m->magic == MV_MCSA_MAGIC) {
    m->m4Heartbeat = millis();
    if (m->status == MV_MCSA_ST_TO_M4 && m->m7Seq != s_seenM7) {
      s_seenM7 = m->m7Seq;
      processWindow(m);
    }
  }
  delay(5);
}
