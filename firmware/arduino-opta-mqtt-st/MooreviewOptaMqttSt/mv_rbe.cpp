#include "mv_rbe.h"
#include "mv_config.h"
#include "mv_tags.h"
#include "mv_io.h"
#include "mv_expansions.h"
#include "mv_mqtt.h"
#include "mv_debug.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_RBE_HAS_KV 1
static const char* MV_RBE_KV_KEY = "/kv/mv_rbe";
#endif

#define MV_RBE_MAGIC 0x52424531u

struct MvRbeNv {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint16_t baseDigital;
  uint8_t baseAnalog;
  uint16_t expDi[MV_EXP_SLOTS];
  uint8_t expDo[MV_EXP_SLOTS];
  uint8_t expAi[MV_EXP_SLOTS];
  uint16_t analogDeadband;
  uint16_t minMs;
};

static MvRbeNv g_nv;
static bool g_haveLast = false;
static bool g_pending = false;
static unsigned long g_lastFlushMs = 0;
static char g_lastTag[16] = "";
static bool g_lastI[8];
static bool g_lastR[4];
static int32_t g_lastRaw[8];
static bool g_lastExpI[MV_EXP_SLOTS][MV_EXP_D1608E_DI];
static bool g_lastExpR[MV_EXP_SLOTS][MV_EXP_D1608E_DO];
static float g_lastExpAi[MV_EXP_SLOTS][MV_EXP_A0602_CH];

static uint16_t rbeCrc(const MvRbeNv* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  const size_t n = sizeof(MvRbeNv) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static void rbeDefaults(MvRbeNv* cfg) {
  memset(cfg, 0, sizeof(MvRbeNv));
  cfg->magic = MV_RBE_MAGIC;
  cfg->version = 1;
  cfg->analogDeadband = MV_RBE_DEADBAND_DEFAULT;
  cfg->minMs = MV_RBE_MIN_MS_DEFAULT;
  cfg->crc = rbeCrc(cfg);
}

static bool rbeValid(const MvRbeNv* cfg) {
  return cfg && cfg->magic == MV_RBE_MAGIC && cfg->version == 1 && cfg->crc == rbeCrc(cfg);
}

static void rbeClamp(MvRbeNv* cfg) {
  if (!cfg) return;
  if (cfg->analogDeadband < 1) cfg->analogDeadband = 1;
  if (cfg->analogDeadband > 4000) cfg->analogDeadband = 4000;
  if (cfg->minMs < 20) cfg->minMs = 20;
  if (cfg->minMs > 60000) cfg->minMs = 60000;
}

static bool rbeSave(const MvRbeNv* cfg) {
  if (!cfg) return false;
  MvRbeNv tmp = *cfg;
  tmp.magic = MV_RBE_MAGIC;
  tmp.version = 1;
  rbeClamp(&tmp);
  tmp.crc = rbeCrc(&tmp);
  g_nv = tmp;
#ifdef MV_RBE_HAS_KV
  return kv_set(MV_RBE_KV_KEY, &tmp, sizeof(tmp), 0) == 0;
#else
  return true;
#endif
}

static void rbeLoad() {
  rbeDefaults(&g_nv);
#ifdef MV_RBE_HAS_KV
  uint8_t buf[sizeof(MvRbeNv)];
  size_t actual = 0;
  if (kv_get(MV_RBE_KV_KEY, buf, sizeof(buf), &actual) == 0 && actual == sizeof(MvRbeNv)) {
    const MvRbeNv* tmp = (const MvRbeNv*)buf;
    if (rbeValid(tmp)) {
      g_nv = *tmp;
      rbeClamp(&g_nv);
      return;
    }
  }
  rbeSave(&g_nv);
#endif
}

static bool parseBaseI(const char* id, uint8_t* idx) {
  if (!id || id[0] != 'I' || id[1] < '1' || id[1] > '8' || id[2] != 0) return false;
  *idx = (uint8_t)(id[1] - '1');
  return true;
}

static bool parseBaseR(const char* id, uint8_t* idx) {
  if (!id || id[0] != 'R' || id[1] < '1' || id[1] > '4' || id[2] != 0) return false;
  *idx = (uint8_t)(id[1] - '1');
  return true;
}

static bool parseBaseRaw(const char* id, uint8_t* idx) {
  if (!id || id[0] != 'I' || id[1] < '1' || id[1] > '8') return false;
  if (strcmp(id + 2, "_RAW") != 0) return false;
  *idx = (uint8_t)(id[1] - '1');
  return true;
}

static bool parseExp(const char* id, uint8_t* slot, const char* prefix, uint8_t* ch, uint8_t maxCh) {
  if (!id || id[0] != 'X' || id[1] < '1' || id[1] > '5' || id[2] != '_') return false;
  *slot = (uint8_t)(id[1] - '1');
  const size_t n = strlen(prefix);
  if (strncmp(id + 3, prefix, n) != 0) return false;
  if (id[3 + n] < '1' || id[3 + n] > '9') return false;
  const int v = atoi(id + 3 + n);
  if (v < 1 || v > (int)maxCh) return false;
  *ch = (uint8_t)(v - 1);
  return true;
}

static bool idEnabled(const char* id) {
  uint8_t idx = 0, slot = 0, ch = 0;
  if (parseBaseI(id, &idx)) return (g_nv.baseDigital & (uint16_t)(1u << idx)) != 0;
  if (parseBaseR(id, &idx)) return (g_nv.baseDigital & (uint16_t)(1u << (8 + idx))) != 0;
  if (parseBaseRaw(id, &idx)) return (g_nv.baseAnalog & (uint8_t)(1u << idx)) != 0;
  if (parseExp(id, &slot, "I", &ch, MV_EXP_D1608E_DI)) {
    return (g_nv.expDi[slot] & (uint16_t)(1u << ch)) != 0;
  }
  if (parseExp(id, &slot, "R", &ch, MV_EXP_D1608E_DO)) {
    return (g_nv.expDo[slot] & (uint8_t)(1u << ch)) != 0;
  }
  if (parseExp(id, &slot, "AI", &ch, MV_EXP_A0602_CH)) {
    return (g_nv.expAi[slot] & (uint8_t)(1u << ch)) != 0;
  }
  return false;
}

static bool enableId(const char* id, bool on) {
  uint8_t idx = 0, slot = 0, ch = 0;
  if (parseBaseI(id, &idx)) {
    if (on) g_nv.baseDigital |= (uint16_t)(1u << idx);
    else g_nv.baseDigital &= (uint16_t)~(1u << idx);
    return true;
  }
  if (parseBaseR(id, &idx)) {
    if (on) g_nv.baseDigital |= (uint16_t)(1u << (8 + idx));
    else g_nv.baseDigital &= (uint16_t)~(1u << (8 + idx));
    return true;
  }
  if (parseBaseRaw(id, &idx)) {
    if (on) g_nv.baseAnalog |= (uint8_t)(1u << idx);
    else g_nv.baseAnalog &= (uint8_t)~(1u << idx);
    return true;
  }
  if (parseExp(id, &slot, "I", &ch, MV_EXP_D1608E_DI)) {
    if (on) g_nv.expDi[slot] |= (uint16_t)(1u << ch);
    else g_nv.expDi[slot] &= (uint16_t)~(1u << ch);
    return true;
  }
  if (parseExp(id, &slot, "R", &ch, MV_EXP_D1608E_DO)) {
    if (on) g_nv.expDo[slot] |= (uint8_t)(1u << ch);
    else g_nv.expDo[slot] &= (uint8_t)~(1u << ch);
    return true;
  }
  if (parseExp(id, &slot, "AI", &ch, MV_EXP_A0602_CH)) {
    if (on) g_nv.expAi[slot] |= (uint8_t)(1u << ch);
    else g_nv.expAi[slot] &= (uint8_t)~(1u << ch);
    return true;
  }
  return false;
}

static uint8_t slotType(uint8_t slot) {
  const MvDeviceConfig* cfg = mvStoreActive();
  uint8_t want = (cfg && slot < MV_EXP_SLOTS) ? cfg->expSlotType[slot] : MV_EXP_AUTO;
  uint8_t det = MV_EXP_NONE;
  MvExpDetected d;
  for (uint8_t i = 0; i < mvExpDetectedCount(); i++) {
    if (!mvExpGetDetected(i, &d)) continue;
    if (d.slot == slot) { det = d.type; break; }
  }
  if (want == MV_EXP_AUTO) return det;
  return want;
}

static void addPoint(JsonArray arr, const char* id, const char* type, const char* role) {
  JsonObject row = arr.createNestedObject();
  row["id"] = id;
  row["type"] = type;
  row["role"] = role;
  row["enabled"] = idEnabled(id);
}

static bool readBool(const char* id, bool* out) {
  MvTag* t = mvFindTag(id);
  if (t && t->kind == MV_BOOL) {
    *out = mvTagEffectiveBool(t);
    return true;
  }
  if (mvIsPhysicalInput(id) || mvIsPhysicalOutput(id)) {
    *out = mvGetBool(id);
    return true;
  }
  return false;
}

static bool readInt(const char* id, int32_t* out) {
  MvTag* t = mvFindTag(id);
  if (t) {
    *out = mvTagEffectiveInt(t);
    return true;
  }
  if (mvIsPhysicalInput(id)) {
    *out = mvGetInt(id);
    return true;
  }
  return false;
}

static bool readReal(const char* id, float* out) {
  MvTag* t = mvFindTag(id);
  if (t) {
    *out = mvTagEffectiveReal(t);
    return true;
  }
  return false;
}

static void noteChange(const char* id) {
  strncpy(g_lastTag, id, sizeof(g_lastTag) - 1);
  g_lastTag[sizeof(g_lastTag) - 1] = '\0';
  g_pending = true;
}

static bool checkBool(const char* id, bool* last) {
  if (!idEnabled(id)) return false;
  bool now = false;
  if (!readBool(id, &now)) return false;
  if (!g_haveLast) {
    *last = now;
    return false;
  }
  if (now != *last) {
    *last = now;
    noteChange(id);
    return true;
  }
  return false;
}

static bool checkInt(const char* id, int32_t* last) {
  if (!idEnabled(id)) return false;
  int32_t now = 0;
  if (!readInt(id, &now)) return false;
  if (!g_haveLast) {
    *last = now;
    return false;
  }
  int32_t d = now - *last;
  if (d < 0) d = -d;
  if (d >= (int32_t)g_nv.analogDeadband) {
    *last = now;
    noteChange(id);
    return true;
  }
  return false;
}

static bool checkReal(const char* id, float* last) {
  if (!idEnabled(id)) return false;
  float now = 0.0f;
  if (!readReal(id, &now)) return false;
  if (!g_haveLast) {
    *last = now;
    return false;
  }
  const float band = (float)g_nv.analogDeadband / 1000.0f;
  if (fabsf(now - *last) >= band) {
    *last = now;
    noteChange(id);
    return true;
  }
  return false;
}

void mvRbeBegin() {
  rbeLoad();
  g_haveLast = false;
  g_pending = false;
  g_lastTag[0] = '\0';
}

void mvRbeApplyConfig() {
  g_haveLast = false;
}

void mvRbeTick() {
  if (mvRbeEnabledCount() == 0) {
    g_haveLast = false;
    g_pending = false;
    return;
  }

  char id[16];
  for (uint8_t i = 0; i < 8; i++) {
    snprintf(id, sizeof(id), "I%u", (unsigned)(i + 1));
    checkBool(id, &g_lastI[i]);
    snprintf(id, sizeof(id), "I%u_RAW", (unsigned)(i + 1));
    checkInt(id, &g_lastRaw[i]);
  }
  for (uint8_t i = 0; i < 4; i++) {
    snprintf(id, sizeof(id), "R%u", (unsigned)(i + 1));
    checkBool(id, &g_lastR[i]);
  }
  for (uint8_t s = 0; s < MV_EXP_SLOTS; s++) {
    const uint8_t type = slotType(s);
    if (type == MV_EXP_D1608E) {
      for (uint8_t n = 0; n < MV_EXP_D1608E_DI; n++) {
        snprintf(id, sizeof(id), "X%u_I%u", (unsigned)(s + 1), (unsigned)(n + 1));
        checkBool(id, &g_lastExpI[s][n]);
      }
      for (uint8_t n = 0; n < MV_EXP_D1608E_DO; n++) {
        snprintf(id, sizeof(id), "X%u_R%u", (unsigned)(s + 1), (unsigned)(n + 1));
        checkBool(id, &g_lastExpR[s][n]);
      }
    } else if (type == MV_EXP_A0602) {
      for (uint8_t n = 0; n < MV_EXP_A0602_CH; n++) {
        snprintf(id, sizeof(id), "X%u_AI%u", (unsigned)(s + 1), (unsigned)(n + 1));
        checkReal(id, &g_lastExpAi[s][n]);
      }
    }
  }
  g_haveLast = true;

  if (!g_pending) return;
  const unsigned long now = millis();
  if (g_lastFlushMs != 0 && (now - g_lastFlushMs) < g_nv.minMs) return;
  g_pending = false;
  g_lastFlushMs = now;
  mvMqttRequestTelemetryFlush();
}

uint8_t mvRbeEnabledCount() {
  uint8_t n = 0;
  for (uint8_t i = 0; i < 12; i++) {
    if (g_nv.baseDigital & (uint16_t)(1u << i)) n++;
  }
  for (uint8_t i = 0; i < 8; i++) {
    if (g_nv.baseAnalog & (uint8_t)(1u << i)) n++;
  }
  for (uint8_t s = 0; s < MV_EXP_SLOTS; s++) {
    for (uint8_t i = 0; i < MV_EXP_D1608E_DI; i++) {
      if (g_nv.expDi[s] & (uint16_t)(1u << i)) n++;
    }
    for (uint8_t i = 0; i < MV_EXP_D1608E_DO; i++) {
      if (g_nv.expDo[s] & (uint8_t)(1u << i)) n++;
    }
    for (uint8_t i = 0; i < MV_EXP_A0602_CH; i++) {
      if (g_nv.expAi[s] & (uint8_t)(1u << i)) n++;
    }
  }
  return n;
}

const char* mvRbeLastTag() { return g_lastTag; }
uint32_t mvRbeMinMs() { return g_nv.minMs; }
uint16_t mvRbeAnalogDeadband() { return g_nv.analogDeadband; }

void mvRbeFillStatus(JsonObject root) {
  root["rbeEnabled"] = mvRbeEnabledCount();
  root["rbeMinMs"] = g_nv.minMs;
  if (g_lastTag[0]) root["rbeLastTag"] = g_lastTag;
}

void mvRbeFillConfig(JsonObject root) {
  JsonObject rbe = root.createNestedObject("rbe");
  rbe["analogDeadband"] = g_nv.analogDeadband;
  rbe["minMs"] = g_nv.minMs;
  rbe["enabledCount"] = mvRbeEnabledCount();
  JsonArray points = rbe.createNestedArray("points");
  char id[16];
  for (uint8_t i = 1; i <= 8; i++) {
    snprintf(id, sizeof(id), "I%u", i);
    addPoint(points, id, "BOOL", "input");
  }
  for (uint8_t i = 1; i <= 4; i++) {
    snprintf(id, sizeof(id), "R%u", i);
    addPoint(points, id, "BOOL", "output");
  }
  for (uint8_t i = 1; i <= 8; i++) {
    snprintf(id, sizeof(id), "I%u_RAW", i);
    addPoint(points, id, "INT", "input");
  }
  for (uint8_t s = 0; s < MV_EXP_SLOTS; s++) {
    const uint8_t type = slotType(s);
    if (type == MV_EXP_D1608E) {
      for (uint8_t n = 1; n <= MV_EXP_D1608E_DI; n++) {
        snprintf(id, sizeof(id), "X%u_I%u", (unsigned)(s + 1), n);
        addPoint(points, id, "BOOL", "input");
      }
      for (uint8_t n = 1; n <= MV_EXP_D1608E_DO; n++) {
        snprintf(id, sizeof(id), "X%u_R%u", (unsigned)(s + 1), n);
        addPoint(points, id, "BOOL", "output");
      }
    } else if (type == MV_EXP_A0602) {
      for (uint8_t n = 1; n <= MV_EXP_A0602_CH; n++) {
        snprintf(id, sizeof(id), "X%u_AI%u", (unsigned)(s + 1), n);
        addPoint(points, id, "REAL", "input");
      }
    }
  }
}

bool mvRbeApplyJson(JsonObjectConst root, char* err, size_t errLen) {
  if (!root.containsKey("rbeEnabled") && !root.containsKey("rbe") &&
      !root.containsKey("rbeAnalogDeadband") && !root.containsKey("rbeMinMs")) {
    return true;
  }

  if (root.containsKey("rbeAnalogDeadband")) {
    const uint32_t v = root["rbeAnalogDeadband"].as<uint32_t>();
    if (v < 1 || v > 4000) {
      if (err && errLen) strncpy(err, "RBE analog deadband must be 1–4000", errLen - 1);
      return false;
    }
    g_nv.analogDeadband = (uint16_t)v;
  }
  if (root.containsKey("rbeMinMs")) {
    const uint32_t v = root["rbeMinMs"].as<uint32_t>();
    if (v < 20 || v > 60000) {
      if (err && errLen) strncpy(err, "RBE minimum interval must be 20–60000 ms", errLen - 1);
      return false;
    }
    g_nv.minMs = (uint16_t)v;
  }

  JsonArrayConst ids = root["rbeEnabled"].as<JsonArrayConst>();
  if (ids.isNull() && root["rbe"].is<JsonObjectConst>()) {
    ids = root["rbe"]["enabled"].as<JsonArrayConst>();
  }
  if (!ids.isNull()) {
    g_nv.baseDigital = 0;
    g_nv.baseAnalog = 0;
    memset(g_nv.expDi, 0, sizeof(g_nv.expDi));
    memset(g_nv.expDo, 0, sizeof(g_nv.expDo));
    memset(g_nv.expAi, 0, sizeof(g_nv.expAi));
    for (JsonVariantConst v : ids) {
      const char* id = v.as<const char*>();
      if (!id || !id[0]) continue;
      if (!enableId(id, true)) {
        if (err && errLen) {
          snprintf(err, errLen, "Unknown RBE I/O %s", id);
        }
        return false;
      }
    }
  }

  if (!rbeSave(&g_nv)) {
    if (err && errLen) strncpy(err, "RBE save failed", errLen - 1);
    return false;
  }
  g_haveLast = false;
  return true;
}
