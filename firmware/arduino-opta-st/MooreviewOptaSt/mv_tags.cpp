#include "mv_tags.h"
#include "mv_config.h"
#include "mv_io.h"
#include <string.h>

static MvTag g_tags[MV_MAX_TAGS];
static uint8_t g_tagCount = 0;
static char g_registered[MV_MAX_TAGS][16];
static uint8_t g_registeredCount = 0;

static MvTagKind kindFromType(const char* type) {
  if (!type) return MV_BOOL;
  if (strcmp(type, "INT") == 0) return MV_INT;
  if (strcmp(type, "REAL") == 0) return MV_REAL;
  if (strcmp(type, "TIMER") == 0) return MV_TIMER;
  if (strcmp(type, "COUNTER") == 0) return MV_COUNTER;
  if (strcmp(type, "PID") == 0) return MV_PID;
  if (strcmp(type, "AVG") == 0) return MV_AVG;
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
  }
}

void mvSetTagMode(MvTag* t, const char* mode) {
  if (!t || !mode) return;
  strncpy(t->mode, mode, sizeof(t->mode) - 1);
  t->mode[sizeof(t->mode) - 1] = '\0';
}

uint8_t mvTagCount() { return g_tagCount; }

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

    if (obj.containsKey("value")) {
      if (kind == MV_BOOL) t->b = obj["value"].as<bool>();
      else if (kind == MV_INT) t->i = obj["value"].as<int32_t>();
      else if (kind == MV_REAL) t->r = obj["value"].as<float>();
      else if (kind == MV_PID) {
        t->pv = obj["value"].as<float>();
        t->out = t->pv;
      } else if (kind == MV_AVG) {
        t->avgVal = obj["value"].as<float>();
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
  if (!t) return false;
  if (t->kind == MV_BOOL) return t->b;
  if (t->kind == MV_INT) return t->i != 0;
  if (t->kind == MV_TIMER) return t->tmrDone;
  if (t->kind == MV_COUNTER) return t->ctrDone;
  if (t->kind == MV_PID) return t->pidEnabled;
  if (t->kind == MV_AVG) return t->avgReady;
  return false;
}

int mvGetInt(const char* id) {
  MvTag* t = mvFindTag(id);
  if (!t) return 0;
  if (t->kind == MV_INT) return t->i;
  if (t->kind == MV_COUNTER) return t->count;
  if (t->kind == MV_TIMER) return (int)t->elapsed;
  return t->b ? 1 : 0;
}

float mvGetReal(const char* id) {
  MvTag* t = mvFindTag(id);
  if (!t) return 0.0f;
  if (t->kind == MV_REAL) return t->r;
  if (t->kind == MV_PID) return t->out;
  if (t->kind == MV_AVG) return t->avgVal;
  if (t->kind == MV_INT) return (float)t->i;
  return t->b ? 1.0f : 0.0f;
}

void mvSetBool(const char* id, bool v) {
  MvTag* t = mvEnsureTag(id, MV_BOOL);
  if (t) t->b = v;
}

void mvSetInt(const char* id, int v) {
  MvTag* t = mvEnsureTag(id, MV_INT);
  if (t) t->i = v;
}

void mvSetReal(const char* id, float v) {
  MvTag* t = mvEnsureTag(id, MV_REAL);
  if (t) t->r = v;
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
  for (uint8_t i = 0; i < 8; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i + 1);
    MvTag* t = mvFindTag(id);
    if (t) mvWriteRelay(i, t->b);
  }
}

void mvUpdateTimers(uint32_t dtMs) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    if (t->kind != MV_TIMER) continue;

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

void mvTagsToJson(JsonObject out) {
  for (uint8_t i = 0; i < g_tagCount; i++) {
    MvTag* t = &g_tags[i];
    switch (t->kind) {
      case MV_BOOL: out[t->id] = t->b; break;
      case MV_INT: out[t->id] = t->i; break;
      case MV_REAL: out[t->id] = t->r; break;
      case MV_TIMER: out[t->id] = t->tmrDone; break;
      case MV_COUNTER: out[t->id] = t->count; break;
      case MV_PID: out[t->id] = t->out; break;
      case MV_AVG: out[t->id] = t->avgVal; break;
    }
  }
}
