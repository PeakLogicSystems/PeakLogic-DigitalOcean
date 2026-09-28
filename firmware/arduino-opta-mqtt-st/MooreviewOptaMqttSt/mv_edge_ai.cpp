#include "mv_edge_ai.h"
#include "mv_io.h"
#include "mv_tags.h"
#include "mv_mqtt.h"
#include "mv_ct_cal.h"
#include "mv_mcsa_m7.h"
#include "mv_mcsa_mon.h"
#include <string.h>

#ifndef MV_CT_MODEL_ID
#define MV_CT_MODEL_ID "lift-submersible-v2"
#endif
#ifndef MV_CT_MODEL_ID_1P_CAP
#define MV_CT_MODEL_ID_1P_CAP "single-phase-start-v1"
#endif

#ifndef MV_MCSA_LITE_FUND_HZ
#define MV_MCSA_LITE_FUND_HZ 60.0f
#endif

#ifndef MV_MCSA_LITE_CHANNELS
#define MV_MCSA_LITE_CHANNELS 6
#endif

enum MvStartPhase : uint8_t {
  MV_START_IDLE = 0,
  MV_START_CAPTURING = 1,
  MV_START_RUNNING = 2,
};

struct MvMotorStartState {
  MvStartPhase phase;
  uint32_t tStartMs;
  uint32_t stableMs;
  float peakAmps;
  float peakStartAmps;
  float runAmpsEma;
  float baselineAmps;
  float healthScore;
  bool wasRunning;
  uint8_t wiring;
  uint8_t ctRun;
  uint8_t ctStart;
  uint8_t ctPhaseB;
  uint8_t ctPhaseC;
  char assetId[16];
  char startMsTag[20];
};

struct MvEdgePending {
  char assetId[16];
  char label[20];
  char modelId[24];
  float score;
  float confidence;
  uint32_t startMs;
  float peakAmps;
  float runAmps;
  uint8_t motorIdx;
  uint8_t wiring;
};

static const uint8_t kLegacyPumpCtStart[] = { 0, 3 };
static const char* kLegacyPumpAssetId[] = { "pump-1", "pump-2" };
static const char* kLegacyStartMsTag[] = { "MOTOR1_START_MS", "MOTOR2_START_MS" };

static MvMotorStartState s_motor[MV_MCSA_MAX_MOTORS];
static float s_chAmpsEma[MV_MCSA_LITE_CHANNELS];
static MvEdgePending s_pending[4];
static uint8_t s_pendingCount = 0;
static uint8_t s_motorCount = 2;
static bool s_useMotorCfg = false;

static float ctPhaseAmps(uint8_t ch) {
  if (ch >= MV_MCSA_LITE_CHANNELS) return 0.0f;
  return mvCtReadAmps(ch);
}

static float ctIdleAmps() {
  return mvCtCalActive()->idleAmps;
}

static float ctStartDetectAmps() {
  return mvCtCalActive()->startDetectAmps;
}

static float ctMaxLegacyAmps(uint8_t ctStart) {
  float maxA = 0.0f;
  for (uint8_t p = 0; p < 3; p++) {
    const float amps = ctPhaseAmps((uint8_t)(ctStart + p));
    if (amps > maxA) maxA = amps;
  }
  return maxA;
}

static float motorSenseAmps(const MvMotorStartState* st) {
  if (!st) return 0.0f;
  if (st->wiring == MV_MOTOR_WIRE_1P_CAP) {
    float maxA = st->ctStart <= 5 ? ctPhaseAmps(st->ctStart) : 0.0f;
    const float runA = st->ctRun <= 5 ? ctPhaseAmps(st->ctRun) : 0.0f;
    return runA > maxA ? runA : maxA;
  }
  if (st->wiring == MV_MOTOR_WIRE_3P) {
    float maxA = st->ctRun <= 5 ? ctPhaseAmps(st->ctRun) : 0.0f;
    if (st->ctPhaseB <= 5) {
      const float a = ctPhaseAmps(st->ctPhaseB);
      if (a > maxA) maxA = a;
    }
    if (st->ctPhaseC <= 5) {
      const float a = ctPhaseAmps(st->ctPhaseC);
      if (a > maxA) maxA = a;
    }
    return maxA;
  }
  return st->ctRun <= 5 ? ctPhaseAmps(st->ctRun) : 0.0f;
}

static float motorRunAmps(const MvMotorStartState* st) {
  if (!st) return 0.0f;
  if (st->wiring == MV_MOTOR_WIRE_3P) return motorSenseAmps(st);
  return st->ctRun <= 5 ? ctPhaseAmps(st->ctRun) : 0.0f;
}

static float motorStartCtAmps(const MvMotorStartState* st) {
  if (!st || st->wiring != MV_MOTOR_WIRE_1P_CAP || st->ctStart > 5) return 0.0f;
  return ctPhaseAmps(st->ctStart);
}

static float normalizeFundAmp(float amps) {
  return amps / 50.0f;
}

static void appendFreqPair(JsonArray arr, float hz, float amp) {
  JsonArray pair = arr.createNestedArray();
  pair.add(hz);
  pair.add(amp);
}

static uint8_t motorIndexForChannel(uint8_t ch) {
  if (!s_useMotorCfg) return ch < 3 ? 0 : 1;
  for (uint8_t i = 0; i < s_motorCount; i++) {
    const MvMotorStartState* st = &s_motor[i];
    if (ch == st->ctRun || ch == st->ctStart || ch == st->ctPhaseB || ch == st->ctPhaseC) return i;
  }
  return ch < 3 ? 0 : 1;
}

static void appendMcsaChannel(JsonArray mcsa, uint8_t ch, float amps, float healthScore) {
  JsonObject row = mcsa.createNestedObject();
  row["ch"] = ch;
  const float fundAmp = normalizeFundAmp(amps);
  JsonArray fund = row.createNestedArray("fund");
  fund.add(MV_MCSA_LITE_FUND_HZ);
  fund.add(fundAmp);

  const float side = fundAmp * (0.035f + healthScore * 0.22f);
  JsonArray rotor = row.createNestedArray("rotor");
  appendFreqPair(rotor, MV_MCSA_LITE_FUND_HZ - 3.6f, side * 0.95f);
  appendFreqPair(rotor, MV_MCSA_LITE_FUND_HZ + 3.6f, side * 1.05f);

  JsonArray pump = row.createNestedArray("pump");
  appendFreqPair(pump, 120.0f, fundAmp * (0.045f + healthScore * 0.08f));
  appendFreqPair(pump, 180.0f, fundAmp * (0.028f + healthScore * 0.05f));
}

static void classifyStart(uint8_t wiring, uint32_t startMs, float runAmps, float baselineAmps,
                          char* labelOut, size_t labelLen, float* scoreOut, float* confOut,
                          char* modelOut, size_t modelLen) {
  const float ampRatio = runAmps / (baselineAmps > 1.0f ? baselineAmps : 1.0f);
  if (wiring == MV_MOTOR_WIRE_1P_CAP) {
    strncpy(modelOut, MV_CT_MODEL_ID_1P_CAP, modelLen);
    if (startMs >= 5200) {
      strncpy(labelOut, "capacitor_failed", labelLen);
      *scoreOut = 0.94f;
      *confOut = 0.92f;
    } else if (startMs >= 4000) {
      strncpy(labelOut, "capacitor_weak", labelLen);
      *scoreOut = 0.78f;
      *confOut = 0.86f;
    } else if (startMs >= 3000) {
      strncpy(labelOut, "capacitor_weak", labelLen);
      *scoreOut = 0.58f;
      *confOut = 0.80f;
    } else {
      strncpy(labelOut, "healthy", labelLen);
      *scoreOut = 0.12f + ((float)startMs - 1500.0f) / 20000.0f;
      if (*scoreOut < 0.08f) *scoreOut = 0.08f;
      if (*scoreOut > 0.35f) *scoreOut = 0.35f;
      *confOut = 0.88f;
    }
  } else if (wiring == MV_MOTOR_WIRE_3P) {
    strncpy(modelOut, MV_CT_MODEL_ID, modelLen);
    if (startMs >= 5000 || ampRatio > 1.35f) {
      strncpy(labelOut, "impeller_worn", labelLen);
      *scoreOut = 0.88f;
      *confOut = 0.85f;
    } else if (startMs >= 3800 || ampRatio > 1.2f) {
      strncpy(labelOut, "clog_ragging", labelLen);
      *scoreOut = 0.72f;
      *confOut = 0.80f;
    } else if (startMs >= 2800 || ampRatio > 1.1f) {
      strncpy(labelOut, "seal_leak", labelLen);
      *scoreOut = 0.55f;
      *confOut = 0.75f;
    } else {
      strncpy(labelOut, "healthy", labelLen);
      *scoreOut = 0.12f + ((float)startMs - 1500.0f) / 20000.0f;
      if (*scoreOut < 0.08f) *scoreOut = 0.08f;
      if (*scoreOut > 0.35f) *scoreOut = 0.35f;
      *confOut = 0.88f;
    }
  } else {
    strncpy(modelOut, MV_CT_MODEL_ID_1P_CAP, modelLen);
    if (startMs >= 5000 || ampRatio > 1.35f) {
      strncpy(labelOut, "hard_start", labelLen);
      *scoreOut = 0.82f;
      *confOut = 0.84f;
    } else if (startMs >= 3500 || ampRatio > 1.15f) {
      strncpy(labelOut, "slow_start", labelLen);
      *scoreOut = 0.62f;
      *confOut = 0.78f;
    } else {
      strncpy(labelOut, "healthy", labelLen);
      *scoreOut = 0.12f + ((float)startMs - 1500.0f) / 20000.0f;
      if (*scoreOut < 0.08f) *scoreOut = 0.08f;
      if (*scoreOut > 0.35f) *scoreOut = 0.35f;
      *confOut = 0.88f;
    }
  }
  labelOut[labelLen - 1] = '\0';
  modelOut[modelLen - 1] = '\0';
}

static void queueInference(uint8_t motorIdx, MvMotorStartState* st, uint32_t startMs) {
  if (s_pendingCount >= (sizeof(s_pending) / sizeof(s_pending[0]))) return;

  const float runAmps = st->runAmpsEma > 0.1f ? st->runAmpsEma : st->peakAmps * 0.6f;
  MvEdgePending* p = &s_pending[s_pendingCount++];
  strncpy(p->assetId, st->assetId, sizeof(p->assetId));
  p->assetId[sizeof(p->assetId) - 1] = '\0';
  p->motorIdx = motorIdx;
  p->wiring = st->wiring;
  p->startMs = startMs;
  p->peakAmps = st->peakAmps;
  p->runAmps = runAmps;
  classifyStart(st->wiring, startMs, runAmps, st->baselineAmps, p->label, sizeof(p->label),
                &p->score, &p->confidence, p->modelId, sizeof(p->modelId));
  st->healthScore = p->score;

  if (st->startMsTag[0]) {
    MvTag* t = mvFindTag(st->startMsTag);
    if (t) {
      if (t->kind == MV_REAL) mvSetReal(st->startMsTag, (float)startMs);
      else mvSetInt(st->startMsTag, (int32_t)startMs);
    }
  }
  mvMqttRequestTelemetryFlush();
}

static void finishStart(uint8_t motorIdx, MvMotorStartState* st, uint32_t nowMs) {
  const uint32_t startMs = nowMs - st->tStartMs;
  if (startMs < 150 || startMs > 8000) {
    st->phase = MV_START_RUNNING;
    st->wasRunning = true;
    return;
  }
  queueInference(motorIdx, st, startMs);
  st->phase = MV_START_RUNNING;
  st->wasRunning = true;
  const float runAmps = st->runAmpsEma > 0.1f ? st->runAmpsEma : st->peakAmps * 0.6f;
  if (st->baselineAmps < 1.0f) st->baselineAmps = runAmps;
  else st->baselineAmps = st->baselineAmps * 0.9f + runAmps * 0.1f;
}

static void tickMotor(uint8_t motorIdx, uint32_t dtMs) {
  MvMotorStartState* st = &s_motor[motorIdx];
  const float senseAmps = motorSenseAmps(st);
  const float runAmps = motorRunAmps(st);
  const float startAmps = motorStartCtAmps(st);
  const uint32_t nowMs = millis();
  const float idle = ctIdleAmps();
  const float startDetect = ctStartDetectAmps();

  if (senseAmps > st->peakAmps) st->peakAmps = senseAmps;
  if (startAmps > st->peakStartAmps) st->peakStartAmps = startAmps;

  switch (st->phase) {
    case MV_START_IDLE:
      if (senseAmps >= startDetect) {
        st->phase = MV_START_CAPTURING;
        st->tStartMs = nowMs;
        st->stableMs = 0;
        st->peakAmps = senseAmps;
        st->peakStartAmps = startAmps;
        st->runAmpsEma = 0.0f;
      } else if (st->wasRunning && runAmps < idle * 0.5f) {
        st->wasRunning = false;
      }
      break;

    case MV_START_CAPTURING: {
      bool runStable = false;
      if (st->wiring == MV_MOTOR_WIRE_1P_CAP) {
        if (runAmps >= idle) {
          st->runAmpsEma = st->runAmpsEma * 0.85f + runAmps * 0.15f;
        }
        const bool capDropped = startAmps < idle * 0.35f;
        if (capDropped && runAmps >= idle) st->stableMs += dtMs;
        else st->stableMs = 0;
        runStable = capDropped && st->stableMs >= 400;
      } else {
        if (senseAmps >= idle) {
          st->stableMs += dtMs;
          st->runAmpsEma = st->runAmpsEma * 0.85f + senseAmps * 0.15f;
        } else {
          st->stableMs = 0;
        }
        runStable = st->stableMs >= 400;
      }
      if (runStable && (nowMs - st->tStartMs) >= 200) {
        finishStart(motorIdx, st, nowMs);
      } else if ((nowMs - st->tStartMs) > 8000) {
        finishStart(motorIdx, st, nowMs);
      } else if (senseAmps < idle * 0.5f && (nowMs - st->tStartMs) > 500) {
        st->phase = MV_START_IDLE;
        st->peakAmps = 0.0f;
        st->peakStartAmps = 0.0f;
      }
      break;
    }

    case MV_START_RUNNING:
      if (runAmps >= idle) {
        st->runAmpsEma = st->runAmpsEma * 0.98f + runAmps * 0.02f;
        st->baselineAmps = st->baselineAmps * 0.999f + runAmps * 0.001f;
        st->healthScore = st->healthScore * 0.9995f;
      }
      if (runAmps < idle * 0.5f) {
        st->phase = MV_START_IDLE;
        st->peakAmps = 0.0f;
        st->peakStartAmps = 0.0f;
        st->stableMs = 0;
      }
      break;
  }
}

static void tickLegacyPump(uint8_t pumpIdx, uint32_t dtMs) {
  MvMotorStartState* st = &s_motor[pumpIdx];
  st->wiring = MV_MOTOR_WIRE_3P;
  st->ctRun = kLegacyPumpCtStart[pumpIdx];
  st->ctPhaseB = (uint8_t)(st->ctRun + 1);
  st->ctPhaseC = (uint8_t)(st->ctRun + 2);
  st->ctStart = MV_MOTOR_CT_NONE;
  strncpy(st->assetId, kLegacyPumpAssetId[pumpIdx], sizeof(st->assetId));
  strncpy(st->startMsTag, kLegacyStartMsTag[pumpIdx], sizeof(st->startMsTag));
  st->assetId[sizeof(st->assetId) - 1] = '\0';
  st->startMsTag[sizeof(st->startMsTag) - 1] = '\0';

  const float amps = ctMaxLegacyAmps(kLegacyPumpCtStart[pumpIdx]);
  const uint32_t nowMs = millis();
  if (amps > st->peakAmps) st->peakAmps = amps;

  switch (st->phase) {
    case MV_START_IDLE:
      if (amps >= ctStartDetectAmps()) {
        st->phase = MV_START_CAPTURING;
        st->tStartMs = nowMs;
        st->stableMs = 0;
        st->peakAmps = amps;
        st->runAmpsEma = 0.0f;
      } else if (st->wasRunning && amps < ctIdleAmps() * 0.5f) {
        st->wasRunning = false;
      }
      break;
    case MV_START_CAPTURING:
      if (amps >= ctIdleAmps()) {
        st->stableMs += dtMs;
        st->runAmpsEma = st->runAmpsEma * 0.85f + amps * 0.15f;
      } else {
        st->stableMs = 0;
      }
      if (st->stableMs >= 400 && (nowMs - st->tStartMs) >= 200) {
        finishStart(pumpIdx, st, nowMs);
      } else if ((nowMs - st->tStartMs) > 8000) {
        finishStart(pumpIdx, st, nowMs);
      } else if (amps < ctIdleAmps() * 0.5f && (nowMs - st->tStartMs) > 500) {
        st->phase = MV_START_IDLE;
        st->peakAmps = 0.0f;
      }
      break;
    case MV_START_RUNNING:
      if (amps >= ctIdleAmps()) {
        st->runAmpsEma = st->runAmpsEma * 0.98f + amps * 0.02f;
        st->baselineAmps = st->baselineAmps * 0.999f + amps * 0.001f;
        st->healthScore = st->healthScore * 0.9995f;
      }
      if (amps < ctIdleAmps() * 0.5f) {
        st->phase = MV_START_IDLE;
        st->peakAmps = 0.0f;
        st->stableMs = 0;
      }
      break;
  }
}

static void reloadMotorConfig() {
  s_useMotorCfg = mvMcsaMonEnabled() && mvMcsaMonActive()->ioLayout == MV_MCSA_IO_LIFT6;
  if (s_useMotorCfg) {
    const MvMcsaMonConfig* cfg = mvMcsaMonActive();
    s_motorCount = mvMcsaMonMotorCount();
    for (uint8_t i = 0; i < s_motorCount; i++) {
      const MvMcsaMotorSlot* src = &cfg->motor[i];
      MvMotorStartState* st = &s_motor[i];
      st->wiring = src->wiring;
      st->ctRun = src->ctRun;
      st->ctStart = src->ctStart;
      st->ctPhaseB = src->ctPhaseB;
      st->ctPhaseC = src->ctPhaseC;
      strncpy(st->assetId, src->assetId, sizeof(st->assetId));
      strncpy(st->startMsTag, src->startMsTag, sizeof(st->startMsTag));
      st->assetId[sizeof(st->assetId) - 1] = '\0';
      st->startMsTag[sizeof(st->startMsTag) - 1] = '\0';
    }
  } else {
    s_motorCount = 2;
  }
}

void mvEdgeAiBegin() {
  for (uint8_t i = 0; i < MV_MCSA_MAX_MOTORS; i++) {
    s_motor[i].phase = MV_START_IDLE;
    s_motor[i].baselineAmps = 5.0f;
    s_motor[i].peakAmps = 0.0f;
    s_motor[i].peakStartAmps = 0.0f;
    s_motor[i].healthScore = 0.12f;
    s_motor[i].wasRunning = false;
  }
  memset(s_chAmpsEma, 0, sizeof(s_chAmpsEma));
  s_pendingCount = 0;
  reloadMotorConfig();
}

void mvEdgeAiTick(uint32_t dtMs) {
  if (dtMs == 0) dtMs = 1;
  reloadMotorConfig();
  const bool hvacLayout = mvMcsaMonEnabled() && mvMcsaMonActive()->ioLayout == MV_MCSA_IO_HVAC;
  if (!hvacLayout) {
    if (s_useMotorCfg) {
      for (uint8_t i = 0; i < s_motorCount; i++) {
        if (!mvMcsaMonMotorActive(i)) continue;
        tickMotor(i, dtMs);
      }
    } else {
      tickLegacyPump(0, dtMs);
      tickLegacyPump(1, dtMs);
    }
  }

  const float alpha = dtMs >= 100 ? 0.15f : 0.05f;
  for (uint8_t ch = 0; ch < MV_MCSA_LITE_CHANNELS; ch++) {
    const float amps = ctPhaseAmps(ch);
    s_chAmpsEma[ch] = s_chAmpsEma[ch] * (1.0f - alpha) + amps * alpha;
  }
}

void mvEdgeAiAppendRuntime(JsonObject runtime) {
  const MvCtCalConfig* ct = mvCtCalActive();
  runtime["firmware"] = "mcsa-lite";
  runtime["mcsaLite"] = true;
  runtime["sampleRateHz"] = 10;
  runtime["fftSize"] = 0;
  runtime["mcsaChannels"] = MV_MCSA_LITE_CHANNELS;
  runtime["motorConfig"] = s_useMotorCfg;
  runtime["motorCount"] = s_motorCount;
  runtime["ctOversample"] = ct->oversample;
  runtime["adcBits"] = MV_CT_ADC_BITS;
  runtime["ctCalibrated"] = ct->zeroed[0] || ct->zeroed[1] || ct->zeroed[2]
    || ct->zeroed[3] || ct->zeroed[4] || ct->zeroed[5];
  mvMcsaM7AppendRuntime(runtime);
}

void mvEdgeAiAppendTelemetry(JsonDocument& doc) {
  if (doc.overflowed()) return;

  JsonArray mcsa = doc.createNestedArray("mcsa");
  if (!mvMcsaM7AppendCooked(mcsa)) {
    for (uint8_t ch = 0; ch < MV_MCSA_LITE_CHANNELS; ch++) {
      if (doc.overflowed()) {
        doc.remove("mcsa");
        break;
      }
      if (mvMcsaMonEnabled() && !mvMcsaMonChannelIsCt(ch)) continue;
      appendMcsaChannel(mcsa, ch, s_chAmpsEma[ch], s_motor[motorIndexForChannel(ch)].healthScore);
    }
  }

  if (!s_pendingCount && !mvMcsaM7EdgePending()) return;
  if (doc.overflowed()) return;

  JsonArray edgeAi = doc.createNestedArray("edgeAi");
  mvMcsaM7AppendEdgeAi(edgeAi);
  for (uint8_t i = 0; i < s_pendingCount; i++) {
    const MvEdgePending* p = &s_pending[i];
    if (doc.overflowed()) break;
    JsonObject item = edgeAi.createNestedObject();
    item["modelId"] = p->modelId[0] ? p->modelId : MV_CT_MODEL_ID;
    item["assetId"] = p->assetId;
    if (p->wiring == MV_MOTOR_WIRE_3P) item["pumpIndex"] = p->motorIdx + 1;
    item["type"] = "classification";
    item["label"] = p->label;
    item["score"] = p->score;
    item["confidence"] = p->confidence;
    JsonObject feat = item.createNestedObject("features");
    feat["startMs"] = p->startMs;
    feat["peakA"] = p->peakAmps;
    feat["runA"] = p->runAmps;
    feat["wiring"] = p->wiring;
  }
  s_pendingCount = 0;
}
