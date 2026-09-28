#include "mv_pseudo_ai.h"
#include "mv_io.h"
#include "mv_config.h"
#include <string.h>

#ifndef MV_CT_IDLE_AMPS
#define MV_CT_IDLE_AMPS 2.0f
#endif
#ifndef MV_CT_START_DETECT_AMPS
#define MV_CT_START_DETECT_AMPS 3.0f
#endif

static float s_mA[4];
static float s_scaled[4];
static float s_chAmpsEma[MV_MCSA_LITE_CHANNELS];

struct MvPumpLite {
  float healthScore;
  float runAmpsEma;
  float baselineAmps;
  float peakAmps;
  uint32_t tStartMs;
  uint32_t stableMs;
  uint8_t phase;
  bool wasRunning;
};

static MvPumpLite s_pump[2];
static const uint8_t kPumpCtStart[] = { 0, 3 };

static float ctPhaseAmps(uint8_t ch) {
  if (ch >= MV_MCSA_LITE_CHANNELS) return 0.0f;
  return mvReadAnalogRaw(ch) * MV_CT_RAW_TO_AMPS;
}

static float ctMaxAmps(uint8_t ctStart) {
  float maxA = 0.0f;
  for (uint8_t p = 0; p < 3; p++) {
    const float amps = ctPhaseAmps((uint8_t)(ctStart + p));
    if (amps > maxA) maxA = amps;
  }
  return maxA;
}

/** Base Opta 0–10 V AI → approximate 4–20 mA when wired through 250 Ω shunt. */
static float rawToMilliAmpsFrom10V(int raw) {
  const float v = raw * (10.0f / 1023.0f);
  if (v < 0.5f) return 0.0f;
  if (v > 9.5f) return 20.5f;
  return 4.0f + (v / 10.0f) * 16.0f;
}

static float scaleMilliAmps(float mA, float low = 0.0f, float high = 100.0f) {
  if (mA < 3.8f) return low;
  if (mA > 20.5f) return high;
  return low + (mA - 4.0f) * (high - low) / 16.0f;
}

static void classifyHealth(MvPumpLite* st, uint32_t startMs, float runAmps) {
  const float ampRatio = runAmps / (st->baselineAmps > 1.0f ? st->baselineAmps : 1.0f);
  float score = 0.12f;
  if (startMs >= 5000 || ampRatio > 1.35f) score = 0.88f;
  else if (startMs >= 3800 || ampRatio > 1.2f) score = 0.72f;
  else if (startMs >= 2800 || ampRatio > 1.1f) score = 0.55f;
  else {
    score = 0.12f + ((float)startMs - 1500.0f) / 20000.0f;
    if (score < 0.08f) score = 0.08f;
    if (score > 0.35f) score = 0.35f;
  }
  st->healthScore = score * 100.0f;
}

static void tickPump(uint8_t pumpIdx, uint32_t dtMs) {
  MvPumpLite* st = &s_pump[pumpIdx];
  const float amps = ctMaxAmps(kPumpCtStart[pumpIdx]);
  const uint32_t nowMs = millis();

  if (amps > st->peakAmps) st->peakAmps = amps;

  switch (st->phase) {
    case 0: // idle
      if (amps >= MV_CT_START_DETECT_AMPS) {
        st->phase = 1;
        st->tStartMs = nowMs;
        st->stableMs = 0;
        st->peakAmps = amps;
        st->runAmpsEma = 0.0f;
      } else if (st->wasRunning && amps < MV_CT_IDLE_AMPS * 0.5f) {
        st->wasRunning = false;
      }
      break;
    case 1: // capturing start
      if (amps >= MV_CT_IDLE_AMPS) {
        st->stableMs += dtMs;
        st->runAmpsEma = st->runAmpsEma * 0.85f + amps * 0.15f;
      } else {
        st->stableMs = 0;
      }
      if ((st->stableMs >= 400 && (nowMs - st->tStartMs) >= 200)
          || (nowMs - st->tStartMs) > 8000) {
        const uint32_t startMs = nowMs - st->tStartMs;
        const float runAmps = st->runAmpsEma > 0.1f ? st->runAmpsEma : st->peakAmps * 0.6f;
        if (startMs >= 150 && startMs <= 8000) classifyHealth(st, startMs, runAmps);
        st->phase = 2;
        st->wasRunning = true;
        if (st->baselineAmps < 1.0f) st->baselineAmps = runAmps;
        else st->baselineAmps = st->baselineAmps * 0.9f + runAmps * 0.1f;
      } else if (amps < MV_CT_IDLE_AMPS * 0.5f && (nowMs - st->tStartMs) > 500) {
        st->phase = 0;
        st->peakAmps = 0.0f;
      }
      break;
    default: // running
      if (amps >= MV_CT_IDLE_AMPS) {
        st->runAmpsEma = st->runAmpsEma * 0.98f + amps * 0.02f;
        st->baselineAmps = st->baselineAmps * 0.999f + amps * 0.001f;
        st->healthScore = st->healthScore * 0.9995f;
      }
      if (amps < MV_CT_IDLE_AMPS * 0.5f) {
        st->phase = 0;
        st->peakAmps = 0.0f;
        st->stableMs = 0;
      }
      break;
  }
}

void mvPseudoAiBegin() {
  memset(s_mA, 0, sizeof(s_mA));
  memset(s_scaled, 0, sizeof(s_scaled));
  memset(s_chAmpsEma, 0, sizeof(s_chAmpsEma));
  for (uint8_t i = 0; i < 2; i++) {
    s_pump[i].healthScore = 12.0f;
    s_pump[i].baselineAmps = 5.0f;
    s_pump[i].phase = 0;
    s_pump[i].wasRunning = false;
  }
}

void mvPseudoAiTick(uint32_t dtMs) {
  if (dtMs == 0) dtMs = 1;

  for (uint8_t i = 0; i < 4; i++) {
    const uint8_t ai = (uint8_t)(i + 2);
    s_mA[i] = rawToMilliAmpsFrom10V(mvReadAnalogRaw(ai));
    s_scaled[i] = scaleMilliAmps(s_mA[i]);
  }

  for (uint8_t ch = 0; ch < MV_MCSA_LITE_CHANNELS; ch++) {
    const float amps = ctPhaseAmps(ch);
    s_chAmpsEma[ch] = s_chAmpsEma[ch] * 0.95f + amps * 0.05f;
  }

  tickPump(0, dtMs);
  tickPump(1, dtMs);
}

float mvPseudoAiMilliAmps(uint8_t aiIndex) {
  if (aiIndex < 2 || aiIndex > 5) return 0.0f;
  return s_mA[aiIndex - 2];
}

float mvPseudoAiScaled(uint8_t aiIndex) {
  if (aiIndex < 2 || aiIndex > 5) return 0.0f;
  return s_scaled[aiIndex - 2];
}

float mvPseudoAiMcsaAmps(uint8_t ch) {
  if (ch >= MV_MCSA_LITE_CHANNELS) return 0.0f;
  return s_chAmpsEma[ch];
}

float mvPseudoAiPumpHealth(uint8_t pumpIdx) {
  if (pumpIdx > 1) return 0.0f;
  return s_pump[pumpIdx].healthScore;
}
