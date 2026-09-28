#include "mv_tags.h"
#include "mv_config.h"
#include "mv_io.h"
#include "mv_expansions.h"
#include <string.h>
#include <math.h>

static MvTag g_tags[MV_MAX_TAGS];
static uint8_t g_tagCount = 0;
static char g_registered[MV_MAX_TAGS][16];
static uint8_t g_registeredCount = 0;

static bool isGlobalTypeStr(const char* type) {
  if (!type) return false;
  return strcmp(type, "GLOBAL_BOOL") == 0 || strcmp(type, "GLOBAL_INT") == 0 || strcmp(type, "GLOBAL_REAL") == 0
    || strcmp(type, "GB") == 0 || strcmp(type, "GI") == 0 || strcmp(type, "GR") == 0;
}

static MvTagKind kindFromType(const char* type) {
  if (!type) return MV_BOOL;
  if (strcmp(type, "GLOBAL_INT") == 0 || strcmp(type, "GI") == 0) return MV_INT;
  if (strcmp(type, "GLOBAL_REAL") == 0 || strcmp(type, "GR") == 0) return MV_REAL;
  if (strcmp(type, "GLOBAL_BOOL") == 0 || strcmp(type, "GB") == 0) return MV_BOOL;
  if (strcmp(type, "INT") == 0) return MV_INT;
  if (strcmp(type, "REAL") == 0) return MV_REAL;
  if (strcmp(type, "TIMER") == 0) return MV_TIMER;
  if (strcmp(type, "COUNTER") == 0) return MV_COUNTER;
  if (strcmp(type, "PID") == 0) return MV_PID;
  if (strcmp(type, "AVG") == 0) return MV_AVG;
  if (strcmp(type, "FLOW") == 0) return MV_FLOW;
  if (strcmp(type, "ALT") == 0) return MV_ALT;
  return MV_BOOL;
}

static void initTagDefaults(MvTag* t, MvTagKind kind) {
  memset(t, 0, sizeof(MvTag));
  t->kind = kind;
  t->outMin = 0.0f;
  t->outMax = 100.0f;
  t->kp = 1.0f;
  if (kind == MV_COUNTER) {
    strcpy(t->mode, "CTU");
  } else if (kind == MV_TIMER) {
    strcpy(t->mode, "TON");
    t->preset = 1000;
  } else if (kind == MV_PID) {
    strcpy(t->mode, "PI");
    t->pidEnabled = true;
  } else if (kind == MV_AVG) {
    strcpy(t->mode, "MOV");
  } else if (kind == MV_FLOW) {
    strcpy(t->mode, "GPM");
    t->preset = 100;
  } else if (kind == MV_ALT) {
    strcpy(t->mode, "ALT2");
    t->preset = 2;
    t->altEnabled = true;
    t->altLevelInputMode = 0;
  }
}

static bool tagLogicBool(MvTag* t) {
  if (!t) return false;
  switch (t->kind) {
    case MV_BOOL: return t->b;
    case MV_INT: return t->i != 0;
    case MV_TIMER: return t->tmrDone;
    case MV_COUNTER: return t->ctrDone;
    case MV_PID: return t->pidEnabled;
    case MV_AVG: return t->avgReady;
    case MV_FLOW: return t->flowReady;
    case MV_ALT: return t->altReady;
    default: return t->b;
  }
}

static int tagLogicInt(MvTag* t) {
  if (!t) return 0;
  if (t->kind == MV_INT) return t->i;
  if (t->kind == MV_COUNTER) return t->count;
  if (t->kind == MV_TIMER) return (int)t->elapsed;
  if (t->kind == MV_ALT) return (int)t->altActiveUnit;
  return tagLogicBool(t) ? 1 : 0;
}

static float tagLogicReal(MvTag* t) {
  if (!t) return 0.0f;
  if (t->kind == MV_REAL) return t->r;
  if (t->kind == MV_PID) return t->out;
  if (t->kind == MV_AVG) return t->avgVal;
  if (t->kind == MV_FLOW) return t->flowGpm;
  if (t->kind == MV_ALT) return (float)t->altActiveUnit;
  if (t->kind == MV_INT) return (float)t->i;
  return tagLogicBool(t) ? 1.0f : 0.0f;
}

bool mvTagEffectiveBool(MvTag* t) {
  if (!t) return false;
  if (t->forceInput || t->forceOutput) return t->forceB;
  return tagLogicBool(t);
}

int mvTagEffectiveInt(MvTag* t) {
  if (!t) return 0;
  if (t->forceInput || t->forceOutput) return t->forceI;
  return tagLogicInt(t);
}

float mvTagEffectiveReal(MvTag* t) {
  if (!t) return 0.0f;
  if (t->forceInput || t->forceOutput) return t->forceR;
  return tagLogicReal(t);
}

static void tagSetForceValue(MvTag* t, bool boolVal, int32_t intVal, float realVal) {
  if (!t) return;
  switch (t->kind) {
    case MV_BOOL:
      t->forceB = boolVal;
      t->forceI = boolVal ? 1 : 0;
      t->forceR = boolVal ? 1.0f : 0.0f;
      break;
    case MV_INT:
      t->forceI = intVal;
      t->forceB = intVal != 0;
      t->forceR = (float)intVal;
      break;
    case MV_REAL:
    case MV_PID:
    case MV_AVG:
    case MV_FLOW:
    case MV_ALT:
      t->forceR = realVal;
      t->forceI = (int32_t)realVal;
      t->forceB = realVal != 0.0f;
      break;
    default:
      t->forceB = boolVal;
      t->forceI = boolVal ? 1 : 0;
      t->forceR = boolVal ? 1.0f : 0.0f;
      break;
  }
}

void mvSetTagMode(MvTag* t, const char* mode) {
  if (!t || !mode) return;
  strncpy(t->mode, mode, sizeof(t->mode) - 1);
  t->mode[sizeof(t->mode) - 1] = '\0';
}

uint8_t mvTagCount() { return g_tagCount; }

MvTag* mvTagAt(uint8_t index) {
  if (index >= g_tagCount) return nullptr;
  return &g_tags[index];
}

void mvTagsBegin() {
  g_tagCount = 0;
  g_registeredCount = 0;
  memset(g_tags, 0, sizeof(g_tags));
  memset(g_registered, 0, sizeof(g_registered));

  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u", i);
    mvEnsureTag(id, MV_BOOL);
    snprintf(id, sizeof(id), "I%u_RAW", i);
    MvTag* raw = mvEnsureTag(id, MV_INT);
    if (raw) raw->i = 0;
  }
  for (uint8_t i = 1; i <= 4; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i);
    mvEnsureTag(id, MV_BOOL);
  }
  for (uint8_t i = 1; i <= 8; i++) {
    char id[4];
    snprintf(id, sizeof(id), "H%u", i);
    MvTag* h = mvEnsureTag(id, MV_INT);
    if (h) h->i = (i == 1) ? 512 : 0;
  }
}

MvTag* mvFindTag(const char* id) {
  if (!id) return nullptr;
  for (uint8_t i = 0; i < g_tagCount; i++) {
    if (strcmp(g_tags[i].id, id) == 0) return &g_tags[i];
  }
  return nullptr;
}

MvTag* mvEnsureTag(const char* id, MvTagKind kind) {
  MvTag* existing = mvFindTag(id);
  if (existing) return existing;
  if (g_tagCount >= MV_MAX_TAGS) return nullptr;
  MvTag* t = &g_tags[g_tagCount++];
  initTagDefaults(t, kind);
  strncpy(t->id, id, sizeof(t->id) - 1);
  t->id[sizeof(t->id) - 1] = '\0';
  return t;
}

bool mvRegisterTagIds(JsonArray ids) {
  g_registeredCount = 0;
  for (JsonVariant v : ids) {
    if (g_registeredCount >= MV_MAX_TAGS) return false;
    const char* id = v.as<const char*>();
    if (!id) continue;
    strncpy(g_registered[g_registeredCount], id, 15);
    g_registered[g_registeredCount][15] = '\0';
    g_registeredCount++;
    mvEnsureTag(id, MV_BOOL);
  }
  return true;
}

bool mvApplyTagMeta(JsonArray tags) {
  for (JsonObject obj : tags) {
    const char* id = obj["id"] | nullptr;
    if (!id) continue;
    const char* type = obj["type"] | "BOOL";
    MvTagKind kind = kindFromType(type);
    MvTag* t = mvEnsureTag(id, kind);
    if (!t) continue;
    if (t->kind != kind) {
      char savedId[16];
      strncpy(savedId, t->id, sizeof(savedId) - 1);
      savedId[sizeof(savedId) - 1] = '\0';
      initTagDefaults(t, kind);
      strncpy(t->id, savedId, sizeof(t->id) - 1);
      t->id[sizeof(t->id) - 1] = '\0';
    }

    if (obj.containsKey("preset")) t->preset = obj["preset"].as<uint32_t>();
    if (obj.containsKey("mode")) mvSetTagMode(t, obj["mode"] | t->mode);
    if (obj.containsKey("kp")) t->kp = obj["kp"].as<float>();
    if (obj.containsKey("ki")) t->ki = obj["ki"].as<float>();
    if (obj.containsKey("kd")) t->kd = obj["kd"].as<float>();
    if (obj.containsKey("outMin")) t->outMin = obj["outMin"].as<float>();
    if (obj.containsKey("outMax")) t->outMax = obj["outMax"].as<float>();

    if (obj.containsKey("global")) t->isGlobal = obj["global"].as<bool>();
    if (isGlobalTypeStr(type)) t->isGlobal = true;

    if (obj.containsKey("value")) {
      if (kind == MV_BOOL) t->b = obj["value"].as<bool>();
      else if (kind == MV_INT) t->i = obj["value"].as<int32_t>();
      else if (kind == MV_REAL) t->r = obj["value"].as<float>();
      else if (kind == MV_PID) {
        t->pv = obj["value"].as<float>();
        t->out = t->pv;
      } else if (kind == MV_AVG) {
        t->avgVal = obj["value"].as<float>();
      } else if (kind == MV_FLOW) {
        t->flowGpm = obj["value"].as<float>();
      } else if (kind == MV_ALT) {
        t->altActiveUnit = (uint8_t)obj["value"].as<int>();
      }
    }

    if (kind == MV_COUNTER && strcmp(t->mode, "CTD") == 0 && t->count == 0 && t->preset > 0) {
      t->count = (int32_t)t->preset;
    }
  }
  return true;
}

bool mvGetBool(const char* id) {
  MvTag* t = mvFindTag(id);
  return mvTagEffectiveBool(t);
}

int mvGetInt(const char* id) {
  MvTag* t = mvFindTag(id);
  return mvTagEffectiveInt(t);
}

float mvGetReal(const char* id) {
  MvTag* t = mvFindTag(id);
  return mvTagEffectiveReal(t);
}

void mvSetBool(const char* id, bool v) {
  MvTag* t = mvFindTag(id);
  if (!t) t = mvEnsureTag(id, MV_BOOL);
  if (!t) return;
  t->b = v;
}

void mvSetInt(const char* id, int v) {
  MvTag* t = mvFindTag(id);
  if (!t) t = mvEnsureTag(id, MV_INT);
  if (!t) return;
  t->i = v;
}

void mvSetReal(const char* id, float v) {
  MvTag* t = mvFindTag(id);
  if (!t) t = mvEnsureTag(id, MV_REAL);
  if (!t) return;
  t->r = v;
}

void mvApplyForcesAfterRead() {
  /* I/O mux: mvGet* returns forced values; logic fields hold hardware reads */
}

void mvApplyForcesAfterLogic() {
  /* I/O mux: mvWritePhysicalOutputs uses effective values at output boundary */
}

bool mvTagSetForce(const char* id, bool forceInput, bool forceOutput, bool hasValue, bool boolVal, int32_t intVal, float realVal) {
  if (!id || !id[0]) return false;
  MvTag* t = mvFindTag(id);
  if (!t) {
    if (mvIsPhysicalOutput(id) || mvIsPhysicalInput(id)) t = mvEnsureTag(id, MV_BOOL);
    else return false;
  }
  t->forceInput = forceInput;
  t->forceOutput = forceOutput;
  if (hasValue) tagSetForceValue(t, boolVal, intVal, realVal);
  if (forceOutput) mvWriteForcedPhysicalOutputs();
  return true;
}

bool mvTagClearForce(const char* id) {
  MvTag* t = mvFindTag(id);
  if (!t) return false;
  const bool wasOutput = t->forceOutput;
  t->forceInput = false;
  t->forceOutput = false;
  if (wasOutput) mvWriteForcedPhysicalOutputs();
  return true;
}

void mvWriteForcedPhysicalOutputs() {
  mvWritePhysicalOutputs();
  mvExpUpdate();
  mvExpReadInputs();
  mvExpWriteOutputs();
}

void mvReadPhysicalInputs() {
  for (uint8_t i = 0; i < 8; i++) {
    char id[8];
    snprintf(id, sizeof(id), "I%u", i + 1);
    MvTag* t = mvFindTag(id);
    if (t) t->b = mvReadDigitalIn(i);
    snprintf(id, sizeof(id), "I%u_RAW", i + 1);
    MvTag* raw = mvFindTag(id);
    if (raw) raw->i = mvReadAnalogRaw(i);
  }
}

void mvWritePhysicalOutputs() {
  for (uint8_t i = 0; i < 4; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i + 1);
    MvTag* t = mvFindTag(id);
    if (t) mvWriteRelay(i, mvTagEffectiveBool(t));
  }
}

void mvUpdateTimers(uint32_t dtMs) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    if (t->kind != MV_TIMER) continue;

    if (t->tmrReset) {
      t->elapsed = 0;
      t->tmrDone = false;
      t->tmrRunning = false;
      t->tmrPrevIn = false;
      t->tmrReset = false;
    }

    bool in = t->tmrInput;
    bool prev = t->tmrPrevIn;
    t->tmrPrevIn = in;

    if (strcmp(t->mode, "TON") == 0) {
      if (in) {
        if (t->elapsed + dtMs >= t->preset) t->elapsed = t->preset;
        else t->elapsed += dtMs;
        t->tmrRunning = t->elapsed < t->preset;
        t->tmrDone = t->elapsed >= t->preset;
      } else {
        t->elapsed = 0;
        t->tmrRunning = false;
        t->tmrDone = false;
      }
    } else if (strcmp(t->mode, "TOF") == 0) {
      if (in) {
        t->elapsed = 0;
        t->tmrRunning = false;
        t->tmrDone = true;
      } else {
        if (t->elapsed + dtMs >= t->preset) t->elapsed = t->preset;
        else t->elapsed += dtMs;
        t->tmrRunning = t->elapsed < t->preset;
        t->tmrDone = t->elapsed < t->preset;
      }
    } else if (strcmp(t->mode, "TP") == 0) {
      if (in && !prev) {
        t->elapsed = 0;
        t->tmrDone = false;
        t->tmrRunning = true;
      }
      if (t->tmrRunning) {
        t->elapsed += dtMs;
        if (t->elapsed >= t->preset) {
          t->tmrRunning = false;
          t->tmrDone = true;
        }
      }
    }
  }
}

void mvUpdateCounters() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    if (t->kind != MV_COUNTER) continue;

    if (t->ctrReset) {
      t->count = 0;
      t->ctrDone = false;
      t->ctrReset = false;
    }

    if (strcmp(t->mode, "CTU") == 0) {
      if (t->cuPulse && !t->prevCu) {
        t->count++;
        if ((uint32_t)t->count >= t->preset) t->ctrDone = true;
      }
    } else if (strcmp(t->mode, "CTD") == 0) {
      if (t->cdPulse && !t->prevCd) {
        if (t->count > 0) t->count--;
        if (t->count <= 0) t->ctrDone = true;
      }
    }

    t->prevCu = t->cuPulse;
    t->prevCd = t->cdPulse;
    t->cuPulse = false;
    t->cdPulse = false;
  }
}

void mvUpdatePids(uint32_t dtMs) {
  float dt = dtMs / 1000.0f;
  if (dt < 0.001f) dt = 0.001f;

  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    if (t->kind != MV_PID) continue;

    if (t->sp == 0.0f && t->preset > 0) t->sp = (float)t->preset;
    t->err = t->sp - t->pv;
    if (!t->pidEnabled) continue;

    float integral = t->integral + t->err * dt;
    float dPv = (t->pv - t->prevPv) / dt;
    float pTerm = t->kp * t->err;
    float iTerm = t->ki * integral;
    float dTerm = (strcmp(t->mode, "PID") == 0) ? (-t->kd * dPv) : 0.0f;
    float out = pTerm + iTerm + dTerm;

    if (out > t->outMax) {
      out = t->outMax;
      if (t->err > 0.0f) integral = t->integral;
    } else if (out < t->outMin) {
      out = t->outMin;
      if (t->err < 0.0f) integral = t->integral;
    }
    if (out < t->outMin) out = t->outMin;
    if (out > t->outMax) out = t->outMax;

    t->integral = integral;
    t->prevPv = t->pv;
    t->out = out;
  }
}

void mvUpdateAverages() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    if (t->kind != MV_AVG) continue;

    if (t->avgReset) {
      t->avgCount = 0;
      t->avgReady = false;
      t->avgVal = 0.0f;
      t->avgEma = 0.0f;
      memset(t->avgRing, 0, sizeof(t->avgRing));
      t->avgReset = false;
    }

    uint8_t window = (uint8_t)(t->preset > 0 && t->preset <= MV_AVG_RING ? t->preset : MV_AVG_RING);
    if (window == 0) window = 1;

    if (strcmp(t->mode, "EMA") == 0) {
      float alpha = 2.0f / (window + 1.0f);
      float prev = (t->avgCount > 0) ? t->avgEma : t->avgPv;
      t->avgEma = alpha * t->avgPv + (1.0f - alpha) * prev;
      t->avgVal = t->avgEma;
      if (t->avgCount < window) t->avgCount++;
      t->avgReady = t->avgCount >= window;
      continue;
    }

    if (t->avgCount < window) {
      t->avgRing[t->avgCount] = t->avgPv;
      t->avgCount++;
    } else {
      for (uint8_t j = 0; j < window - 1; j++) t->avgRing[j] = t->avgRing[j + 1];
      t->avgRing[window - 1] = t->avgPv;
    }

    float sum = 0.0f;
    uint8_t n = t->avgCount;
    for (uint8_t j = 0; j < n; j++) sum += t->avgRing[j];
    t->avgVal = n > 0 ? sum / n : t->avgPv;
    t->avgReady = n >= window;
  }
}

void mvUpdateFlowMeters() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* flow = &g_tags[i];
    if (flow->kind != MV_FLOW) continue;
    if (!flow->flowCtrId[0] || !flow->flowTmrId[0]) continue;

    MvTag* ctr = mvFindTag(flow->flowCtrId);
    MvTag* tmr = mvFindTag(flow->flowTmrId);
    if (!ctr || ctr->kind != MV_COUNTER || !tmr || tmr->kind != MV_TIMER) continue;

    bool done = tmr->tmrDone;
    float k = flow->flowK;
    if (k <= 0.0f) {
      if (flow->flowKTagId[0]) {
        MvTag* kTag = mvFindTag(flow->flowKTagId);
        if (kTag) {
          if (kTag->kind == MV_INT) k = (float)kTag->i;
          else if (kTag->kind == MV_REAL || kTag->kind == MV_FLOW) k = kTag->r;
          else k = (float)kTag->i;
        }
      }
      if (k <= 0.0f) k = (float)flow->preset;
      if (k <= 0.0f) k = 1.0f;
    }

    if (done && !flow->flowPrevTmrDone) {
      float count = (float)ctr->count;
      flow->flowGpm = k > 0.0f ? count / k : 0.0f;
      flow->flowReady = true;
      ctr->ctrReset = true;
      tmr->tmrReset = true;
      if (flow->flowOutId[0]) {
        MvTag* out = mvFindTag(flow->flowOutId);
        if (out) {
          if (out->kind == MV_INT) out->i = (int32_t)flow->flowGpm;
          else out->r = flow->flowGpm;
        }
      }
    } else if (!done) {
      flow->flowReady = false;
    }
    flow->flowPrevTmrDone = done;
  }
}

static uint8_t altUnitCount(MvTag* t) {
  if (!t) return 2;
  if (strcmp(t->mode, "ALT4") == 0 || t->preset == 4) return 4;
  if (strcmp(t->mode, "ALT3") == 0 || t->preset == 3) return 3;
  return 2;
}

static int8_t altFirstOnline(bool* online, uint8_t unitCount, int8_t start) {
  for (uint8_t n = 0; n < unitCount; n++) {
    int8_t idx = (int8_t)((start + n) % unitCount);
    if (online[idx]) return idx;
  }
  return -1;
}

static int8_t altNextOnline(int8_t from, bool* online, uint8_t unitCount) {
  return altFirstOnline(online, unitCount, from + 1);
}

static bool altReadBoolId(const char* id) {
  return id && id[0] && mvGetBool(id);
}

static float altReadLevelId(const char* id) {
  if (!id || !id[0]) return NAN;
  return mvGetReal(id);
}

static bool altWithin(float v, float lo, float hi) {
  if (isnan(v) || isnan(lo) || isnan(hi) || lo > hi) return false;
  return v >= lo && v <= hi;
}

static int8_t altManualUnit(char ids[4][16], bool* online, uint8_t unitCount, int8_t skipIndex) {
  for (uint8_t i = 0; i < unitCount; i++) {
    if ((int8_t)i == skipIndex) continue;
    if (ids[i][0] && online[i] && altReadBoolId(ids[i])) return (int8_t)i;
  }
  return -1;
}

static void altResolveLevelState(MvTag* alt, bool* offActive, bool* highActive, bool* lowActive, bool* low2Active, uint8_t* stage) {
  const bool useDigital = alt->altLevelInputMode == 0 || alt->altLevelInputMode == 1;
  const bool useAnalog = (alt->altLevelInputMode == 0 || alt->altLevelInputMode == 2)
    && alt->altLevelControlEnabled && alt->altLevelId[0];
  bool off = useDigital && altReadBoolId(alt->altOffId);
  bool high = useDigital && altReadBoolId(alt->altHighId);
  bool low = useDigital && altReadBoolId(alt->altLowId);
  bool low2 = useDigital && altReadBoolId(alt->altLow2Id);
  if (useAnalog) {
    const float level = altReadLevelId(alt->altLevelId);
    if (!isnan(level)) {
      if (altWithin(level, alt->altLevelOffLo, alt->altLevelOffHi)) off = true;
      if (altWithin(level, alt->altLevelHighLo, alt->altLevelHighHi)) high = true;
      if (altWithin(level, alt->altLevelLowLo, alt->altLevelLowHi)) low = true;
    }
  }
  alt->altOffActive = off;
  alt->altHighActive = high;
  alt->altLowActive = low;
  alt->altLow2Active = low2;
  if (offActive) *offActive = off;
  if (highActive) *highActive = high;
  if (lowActive) *lowActive = low;
  if (low2Active) *low2Active = low2;
  if (off) *stage = 3;
  else if (high) *stage = 2;
  else if (low2) *stage = 4;
  else if (low) *stage = 1;
  else *stage = 0;
  alt->altPumpStage = *stage;
}

static void altWriteBoolOut(const char* id, bool val) {
  if (!id || !id[0]) return;
  MvTag* out = mvFindTag(id);
  if (!out || out->kind != MV_BOOL) return;
  mvSetBool(id, val);
}

void mvUpdateAlternators() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* alt = &g_tags[i];
    if (alt->kind != MV_ALT) continue;
    const uint8_t unitCount = altUnitCount(alt);

    if (alt->altEnableId[0]) alt->altEnabled = mvGetBool(alt->altEnableId);
    if (alt->altAdvanceId[0]) alt->altAdvance = mvGetBool(alt->altAdvanceId);
    if (alt->altAutoFaultId[0]) alt->altAutoFault = mvGetBool(alt->altAutoFaultId);

    bool online[4] = { false, false, false, false };
    bool anyOnlineLinked = false;
    for (uint8_t u = 0; u < unitCount; u++) {
      if (alt->altOnlineIds[u][0]) anyOnlineLinked = true;
    }
    for (uint8_t u = 0; u < unitCount; u++) {
      if (!anyOnlineLinked) online[u] = true;
      else if (alt->altOnlineIds[u][0]) online[u] = mvGetBool(alt->altOnlineIds[u]);
      alt->altUnitOnline[u] = online[u];
    }

    bool offActive = false;
    bool highActive = false;
    bool lowActive = false;
    bool low2Active = false;
    uint8_t pumpStage = 0;
    altResolveLevelState(alt, &offActive, &highActive, &lowActive, &low2Active, &pumpStage);
    if (unitCount < 3 && low2Active) {
      low2Active = false;
      alt->altLow2Active = false;
      if (!offActive && !highActive && !lowActive) pumpStage = 0;
      else if (lowActive) pumpStage = 1;
      alt->altPumpStage = pumpStage;
    }

    int8_t leadIndex = alt->altLeadIndex;
    if (leadIndex < 0 || leadIndex >= (int8_t)unitCount) leadIndex = 0;

    bool advancePulse = alt->altAdvancePulse;
    alt->altAdvancePulse = false;
    if (alt->altAdvanceId[0]) {
      if (alt->altAdvance && !alt->altPrevAdvance) advancePulse = true;
      alt->altPrevAdvance = alt->altAdvance;
    } else {
      alt->altPrevAdvance = false;
    }

    uint8_t onlineCount = 0;
    for (uint8_t u = 0; u < unitCount; u++) if (online[u]) onlineCount++;
    alt->altReady = onlineCount > 0;
    alt->altFault = onlineCount == 0;
    bool prevLeadOnline = alt->altPrevLeadOnline;
    const bool paused = offActive || highActive || lowActive || low2Active;

    if (!alt->altEnabled || alt->altFault) {
      leadIndex = alt->altFault ? -1 : altFirstOnline(online, unitCount, 0);
    } else if (!paused) {
      if (!online[leadIndex]) {
        int8_t first = altFirstOnline(online, unitCount, 0);
        leadIndex = first >= 0 ? first : 0;
      }
      if (advancePulse) {
        int8_t next = altNextOnline(leadIndex, online, unitCount);
        if (next >= 0) leadIndex = next;
      } else if (alt->altAutoFault && prevLeadOnline && !online[leadIndex]) {
        int8_t next = altNextOnline(leadIndex, online, unitCount);
        if (next >= 0) leadIndex = next;
      }
    } else if (!online[leadIndex]) {
      int8_t first = altFirstOnline(online, unitCount, 0);
      leadIndex = first >= 0 ? first : -1;
    }

    int8_t manualLead = altManualUnit(alt->altLeadSelIds, online, unitCount, -1);
    if (manualLead >= 0) leadIndex = manualLead;

    int8_t lagIndex = (leadIndex >= 0) ? altNextOnline(leadIndex, online, unitCount) : -1;
    int8_t lag2Index = (lagIndex >= 0) ? altNextOnline(lagIndex, online, unitCount) : -1;
    int8_t manualLag = altManualUnit(alt->altLagSelIds, online, unitCount, leadIndex);
    if (manualLag >= 0) lagIndex = manualLag;
    int8_t manualLag2 = altManualUnit(alt->altLag2SelIds, online, unitCount, leadIndex);
    if (manualLag2 >= 0) lag2Index = manualLag2;

    alt->altPrevLeadOnline = (leadIndex >= 0) ? online[leadIndex] : false;
    alt->altLeadIndex = leadIndex;
    alt->altLagIndex = lagIndex;
    alt->altLag2Index = lag2Index;
    alt->altActiveUnit = (leadIndex >= 0) ? (uint8_t)(leadIndex + 1) : 0;

    const bool runAllowed = alt->altEnabled && !alt->altFault && !offActive && leadIndex >= 0;
    bool runMask[4] = { false, false, false, false };
    if (runAllowed) {
      if (highActive) {
        for (uint8_t u = 0; u < unitCount; u++) {
          if (online[u]) runMask[u] = true;
        }
      } else {
        runMask[leadIndex] = true;
        const bool needLag = lowActive || low2Active;
        if (needLag && lagIndex >= 0 && online[lagIndex]) runMask[lagIndex] = true;
        if (low2Active && lag2Index >= 0 && online[lag2Index]) runMask[lag2Index] = true;
      }
    }

    for (uint8_t u = 0; u < unitCount; u++) {
      altWriteBoolOut(alt->altUnitOutIds[u], runMask[u]);
    }
    altWriteBoolOut(alt->altLeadOutId, runAllowed && runMask[leadIndex]);
    altWriteBoolOut(alt->altLagOutId, runAllowed && lagIndex >= 0 && runMask[lagIndex]);
  }
}

void mvTagsToJson(JsonObject out) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    switch (t->kind) {
      case MV_BOOL: out[t->id] = mvTagEffectiveBool(t); break;
      case MV_INT: out[t->id] = mvTagEffectiveInt(t); break;
      case MV_REAL: out[t->id] = mvTagEffectiveReal(t); break;
      case MV_TIMER: out[t->id] = t->tmrDone; break;
      case MV_COUNTER: out[t->id] = t->count; break;
      case MV_PID: out[t->id] = t->out; break;
      case MV_AVG: out[t->id] = t->avgVal; break;
      case MV_FLOW: out[t->id] = t->flowGpm; break;
      case MV_ALT: out[t->id] = t->altActiveUnit; break;
    }
  }
}

static const char* kindTypeName(MvTagKind k) {
  switch (k) {
    case MV_INT: return "INT";
    case MV_REAL: return "REAL";
    case MV_TIMER: return "TIMER";
    case MV_COUNTER: return "COUNTER";
    case MV_PID: return "PID";
    case MV_AVG: return "AVG";
    case MV_FLOW: return "FLOW";
    case MV_ALT: return "ALT";
    default: return "BOOL";
  }
}

static void tagParcLogicValue(MvTag* t, JsonObject row) {
  switch (t->kind) {
    case MV_BOOL: row["logicValue"] = t->b; break;
    case MV_INT: row["logicValue"] = t->i; break;
    case MV_REAL: row["logicValue"] = t->r; break;
    case MV_TIMER: row["logicValue"] = t->tmrDone; break;
    case MV_COUNTER: row["logicValue"] = t->count; break;
    case MV_PID: row["logicValue"] = t->out; break;
    case MV_AVG: row["logicValue"] = t->avgVal; break;
    case MV_FLOW: row["logicValue"] = t->flowGpm; break;
    case MV_ALT: row["logicValue"] = t->altActiveUnit; break;
    default: row["logicValue"] = t->b; break;
  }
}

void mvTagsToParcJson(JsonArray out) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    JsonObject row = out.createNestedObject();
    row["id"] = t->id;
    row["type"] = kindTypeName(t->kind);
    if (mvIsPhysicalInput(t->id)) row["role"] = "input";
    else if (mvIsPhysicalOutput(t->id)) row["role"] = "output";
    else if (strncmp(t->id, "X", 1) == 0 && t->id[1] >= '1' && t->id[1] <= '5' && t->id[2] == '_') {
      const char* rest = t->id + 3;
      if (strncmp(rest, "I", 1) == 0 || strncmp(rest, "AI", 2) == 0 || strncmp(rest, "IRAW", 4) == 0)
        row["role"] = "input";
      else if (strncmp(rest, "R", 1) == 0 || strncmp(rest, "PWM", 3) == 0)
        row["role"] = "output";
      else row["role"] = "memory";
    }
    else row["role"] = "memory";
    row["quality"] = "GOOD";
    row["forceInput"] = t->forceInput;
    row["forceOutput"] = t->forceOutput;
    if (t->forceInput || t->forceOutput) {
      switch (t->kind) {
        case MV_BOOL: row["forceValue"] = t->forceB; break;
        case MV_INT: row["forceValue"] = t->forceI; break;
        case MV_REAL: row["forceValue"] = t->forceR; break;
        case MV_PID: row["forceValue"] = t->forceR; break;
        case MV_AVG: row["forceValue"] = t->forceR; break;
        case MV_FLOW: row["forceValue"] = t->forceR; break;
        case MV_ALT: row["forceValue"] = t->forceI; break;
        default: row["forceValue"] = t->forceB; break;
      }
      tagParcLogicValue(t, row);
    }
    switch (t->kind) {
      case MV_BOOL: row["value"] = mvTagEffectiveBool(t); break;
      case MV_INT: row["value"] = mvTagEffectiveInt(t); break;
      case MV_REAL: row["value"] = mvTagEffectiveReal(t); break;
      case MV_TIMER: row["value"] = t->tmrDone; break;
      case MV_COUNTER: row["value"] = t->count; break;
      case MV_PID: row["value"] = t->out; break;
      case MV_AVG: row["value"] = t->avgVal; break;
      case MV_FLOW: row["value"] = t->flowGpm; break;
      case MV_ALT: row["value"] = t->altActiveUnit; break;
    }
  }
}

uint8_t mvGlobalTagCount() {
  uint8_t n = 0;
  for (uint8_t i = 0; i < g_tagCount; i++) {
    if (g_tags[i].isGlobal) n++;
  }
  return n;
}

void mvForEachGlobalTag(void (*fn)(MvTag* t, void* ctx), void* ctx) {
  if (!fn) return;
  for (uint8_t i = 0; i < g_tagCount; i++) {
    if (g_tags[i].isGlobal) fn(&g_tags[i], ctx);
  }
}
