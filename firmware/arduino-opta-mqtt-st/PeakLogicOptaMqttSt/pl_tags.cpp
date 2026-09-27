#include "pl_tags.h"
#include "pl_config.h"
#include "pl_io.h"
#include <string.h>

static PlTag g_tags[PL_MAX_TAGS];
static uint8_t g_tagCount = 0;
static char g_registered[PL_MAX_TAGS][16];
static uint8_t g_registeredCount = 0;

static PlTagKind kindFromType(const char* type) {
  if (!type) return PL_BOOL;
  if (strcmp(type, "INT") == 0) return PL_INT;
  if (strcmp(type, "REAL") == 0) return PL_REAL;
  if (strcmp(type, "TIMER") == 0) return PL_TIMER;
  if (strcmp(type, "COUNTER") == 0) return PL_COUNTER;
  if (strcmp(type, "PID") == 0) return PL_PID;
  if (strcmp(type, "AVG") == 0) return PL_AVG;
  if (strcmp(type, "FLOW") == 0) return PL_FLOW;
  return PL_BOOL;
}

static void initTagDefaults(PlTag* t, PlTagKind kind) {
  memset(t, 0, sizeof(PlTag));
  t->kind = kind;
  t->outMin = 0.0f;
  t->outMax = 100.0f;
  t->kp = 1.0f;
  if (kind == PL_COUNTER) {
    strcpy(t->mode, "CTU");
  } else if (kind == PL_TIMER) {
    strcpy(t->mode, "TON");
    t->preset = 1000;
  } else if (kind == PL_PID) {
    strcpy(t->mode, "PI");
    t->pidEnabled = true;
  } else if (kind == PL_AVG) {
    strcpy(t->mode, "MOV");
  } else if (kind == PL_FLOW) {
    strcpy(t->mode, "GPM");
    t->preset = 100;
  }
}

void plSetTagMode(PlTag* t, const char* mode) {
  if (!t || !mode) return;
  strncpy(t->mode, mode, sizeof(t->mode) - 1);
  t->mode[sizeof(t->mode) - 1] = '\0';
}

uint8_t plTagCount() { return g_tagCount; }

void plTagsBegin() {
  g_tagCount = 0;
  g_registeredCount = 0;
  memset(g_tags, 0, sizeof(g_tags));
  memset(g_registered, 0, sizeof(g_registered));

  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u", i);
    plEnsureTag(id, PL_BOOL);
    snprintf(id, sizeof(id), "I%u_RAW", i);
    PlTag* raw = plEnsureTag(id, PL_INT);
    if (raw) raw->i = 0;
  }
  for (uint8_t i = 1; i <= 4; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i);
    plEnsureTag(id, PL_BOOL);
  }
  for (uint8_t i = 1; i <= 8; i++) {
    char id[4];
    snprintf(id, sizeof(id), "H%u", i);
    PlTag* h = plEnsureTag(id, PL_INT);
    if (h) h->i = (i == 1) ? 512 : 0;
  }
}

PlTag* plFindTag(const char* id) {
  if (!id) return nullptr;
  for (uint8_t i = 0; i < g_tagCount; i++) {
    if (strcmp(g_tags[i].id, id) == 0) return &g_tags[i];
  }
  return nullptr;
}

PlTag* plEnsureTag(const char* id, PlTagKind kind) {
  PlTag* existing = plFindTag(id);
  if (existing) return existing;
  if (g_tagCount >= PL_MAX_TAGS) return nullptr;
  PlTag* t = &g_tags[g_tagCount++];
  initTagDefaults(t, kind);
  strncpy(t->id, id, sizeof(t->id) - 1);
  t->id[sizeof(t->id) - 1] = '\0';
  return t;
}

bool plRegisterTagIds(JsonArray ids) {
  g_registeredCount = 0;
  for (JsonVariant v : ids) {
    if (g_registeredCount >= PL_MAX_TAGS) return false;
    const char* id = v.as<const char*>();
    if (!id) continue;
    strncpy(g_registered[g_registeredCount], id, 15);
    g_registered[g_registeredCount][15] = '\0';
    g_registeredCount++;
    plEnsureTag(id, PL_BOOL);
  }
  return true;
}

bool plApplyTagMeta(JsonArray tags) {
  for (JsonObject obj : tags) {
    const char* id = obj["id"] | nullptr;
    if (!id) continue;
    const char* type = obj["type"] | "BOOL";
    PlTagKind kind = kindFromType(type);
    PlTag* t = plEnsureTag(id, kind);
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
    if (obj.containsKey("mode")) plSetTagMode(t, obj["mode"] | t->mode);
    if (obj.containsKey("kp")) t->kp = obj["kp"].as<float>();
    if (obj.containsKey("ki")) t->ki = obj["ki"].as<float>();
    if (obj.containsKey("kd")) t->kd = obj["kd"].as<float>();
    if (obj.containsKey("outMin")) t->outMin = obj["outMin"].as<float>();
    if (obj.containsKey("outMax")) t->outMax = obj["outMax"].as<float>();

    if (obj.containsKey("value")) {
      if (kind == PL_BOOL) t->b = obj["value"].as<bool>();
      else if (kind == PL_INT) t->i = obj["value"].as<int32_t>();
      else if (kind == PL_REAL) t->r = obj["value"].as<float>();
      else if (kind == PL_PID) {
        t->pv = obj["value"].as<float>();
        t->out = t->pv;
      } else if (kind == PL_AVG) {
        t->avgVal = obj["value"].as<float>();
      } else if (kind == PL_FLOW) {
        t->flowGpm = obj["value"].as<float>();
      }
    }

    if (kind == PL_COUNTER && strcmp(t->mode, "CTD") == 0 && t->count == 0 && t->preset > 0) {
      t->count = (int32_t)t->preset;
    }
  }
  return true;
}

bool plGetBool(const char* id) {
  PlTag* t = plFindTag(id);
  if (!t) return false;
  if (t->kind == PL_BOOL) return t->b;
  if (t->kind == PL_INT) return t->i != 0;
  if (t->kind == PL_TIMER) return t->tmrDone;
  if (t->kind == PL_COUNTER) return t->ctrDone;
  if (t->kind == PL_PID) return t->pidEnabled;
  if (t->kind == PL_AVG) return t->avgReady;
  if (t->kind == PL_FLOW) return t->flowReady;
  return false;
}

int plGetInt(const char* id) {
  PlTag* t = plFindTag(id);
  if (!t) return 0;
  if (t->kind == PL_INT) return t->i;
  if (t->kind == PL_COUNTER) return t->count;
  if (t->kind == PL_TIMER) return (int)t->elapsed;
  return t->b ? 1 : 0;
}

float plGetReal(const char* id) {
  PlTag* t = plFindTag(id);
  if (!t) return 0.0f;
  if (t->kind == PL_REAL) return t->r;
  if (t->kind == PL_PID) return t->out;
  if (t->kind == PL_AVG) return t->avgVal;
  if (t->kind == PL_FLOW) return t->flowGpm;
  if (t->kind == PL_INT) return (float)t->i;
  return t->b ? 1.0f : 0.0f;
}

void plSetBool(const char* id, bool v) {
  PlTag* t = plEnsureTag(id, PL_BOOL);
  if (t) t->b = v;
}

void plSetInt(const char* id, int v) {
  PlTag* t = plEnsureTag(id, PL_INT);
  if (t) t->i = v;
}

void plSetReal(const char* id, float v) {
  PlTag* t = plEnsureTag(id, PL_REAL);
  if (t) t->r = v;
}

void plReadPhysicalInputs() {
  for (uint8_t i = 0; i < 8; i++) {
    char id[8];
    snprintf(id, sizeof(id), "I%u", i + 1);
    PlTag* t = plFindTag(id);
    if (t) t->b = plReadDigitalIn(i);
    snprintf(id, sizeof(id), "I%u_RAW", i + 1);
    PlTag* raw = plFindTag(id);
    if (raw) raw->i = plReadAnalogRaw(i);
  }
}

void plWritePhysicalOutputs() {
  for (uint8_t i = 0; i < 8; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i + 1);
    PlTag* t = plFindTag(id);
    if (t) plWriteRelay(i, t->b);
  }
}

void plUpdateTimers(uint32_t dtMs) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    if (t->kind != PL_TIMER) continue;

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

void plUpdateCounters() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    if (t->kind != PL_COUNTER) continue;

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

void plUpdatePids(uint32_t dtMs) {
  float dt = dtMs / 1000.0f;
  if (dt < 0.001f) dt = 0.001f;

  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    if (t->kind != PL_PID) continue;

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

void plUpdateAverages() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    if (t->kind != PL_AVG) continue;

    if (t->avgReset) {
      t->avgCount = 0;
      t->avgReady = false;
      t->avgVal = 0.0f;
      t->avgEma = 0.0f;
      memset(t->avgRing, 0, sizeof(t->avgRing));
      t->avgReset = false;
    }

    uint8_t window = (uint8_t)(t->preset > 0 && t->preset <= PL_AVG_RING ? t->preset : PL_AVG_RING);
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

void plUpdateFlowMeters() {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* flow = &g_tags[i];
    if (flow->kind != PL_FLOW) continue;
    if (!flow->flowCtrId[0] || !flow->flowTmrId[0]) continue;

    PlTag* ctr = plFindTag(flow->flowCtrId);
    PlTag* tmr = plFindTag(flow->flowTmrId);
    if (!ctr || ctr->kind != PL_COUNTER || !tmr || tmr->kind != PL_TIMER) continue;

    bool done = tmr->tmrDone;
    float k = flow->flowK;
    if (k <= 0.0f) {
      if (flow->flowKTagId[0]) {
        PlTag* kTag = plFindTag(flow->flowKTagId);
        if (kTag) {
          if (kTag->kind == PL_INT) k = (float)kTag->i;
          else if (kTag->kind == PL_REAL || kTag->kind == PL_FLOW) k = kTag->r;
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
        PlTag* out = plFindTag(flow->flowOutId);
        if (out) {
          if (out->kind == PL_INT) out->i = (int32_t)flow->flowGpm;
          else out->r = flow->flowGpm;
        }
      }
    } else if (!done) {
      flow->flowReady = false;
    }
    flow->flowPrevTmrDone = done;
  }
}

void plTagsToJson(JsonObject out) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    switch (t->kind) {
      case PL_BOOL: out[t->id] = t->b; break;
      case PL_INT: out[t->id] = t->i; break;
      case PL_REAL: out[t->id] = t->r; break;
      case PL_TIMER: out[t->id] = t->tmrDone; break;
      case PL_COUNTER: out[t->id] = t->count; break;
      case PL_PID: out[t->id] = t->out; break;
      case PL_AVG: out[t->id] = t->avgVal; break;
      case PL_FLOW: out[t->id] = t->flowGpm; break;
    }
  }
}

static const char* kindTypeName(PlTagKind k) {
  switch (k) {
    case PL_INT: return "INT";
    case PL_REAL: return "REAL";
    case PL_TIMER: return "TIMER";
    case PL_COUNTER: return "COUNTER";
    case PL_PID: return "PID";
    case PL_AVG: return "AVG";
    case PL_FLOW: return "FLOW";
    default: return "BOOL";
  }
}

void plTagsToFleetJson(JsonArray out) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    PlTag* t = &g_tags[i];
    JsonObject row = out.createNestedObject();
    row["id"] = t->id;
    row["type"] = kindTypeName(t->kind);
    if (plIsPhysicalInput(t->id)) row["role"] = "input";
    else if (plIsPhysicalOutput(t->id)) row["role"] = "output";
    else row["role"] = "memory";
    row["quality"] = "GOOD";
    switch (t->kind) {
      case PL_BOOL: row["value"] = t->b; break;
      case PL_INT: row["value"] = t->i; break;
      case PL_REAL: row["value"] = t->r; break;
      case PL_TIMER: row["value"] = t->tmrDone; break;
      case PL_COUNTER: row["value"] = t->count; break;
      case PL_PID: row["value"] = t->out; break;
      case PL_AVG: row["value"] = t->avgVal; break;
      case PL_FLOW: row["value"] = t->flowGpm; break;
    }
  }
}
