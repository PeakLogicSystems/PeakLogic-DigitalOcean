#include "mv_ahu_env_cal.h"
#include "mv_config.h"
#include "mv_io.h"
#include "mv_mqtt.h"
#include "mv_tags.h"
#include <math.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA))

#define MV_AHU_ENV_MAGIC 0x41485545u /* 'AHUE' */
#define MV_AHU_ENV_VERSION 5
#ifdef ARDUINO_ARCH_MBED
#include <kvstore_global_api.h>
#define MV_AHU_ENV_HAS_KV 1
static const char* MV_AHU_ENV_KV_KEY = "/kv/mv_ahu_env_cal";
#endif

static MvAhuEnvCalConfig g_ahuEnv;
static bool g_ahuLoaded = false;
static float s_ntcF[MV_AHU_NTC_POINTS];
static float s_leakMv[MV_AHU_LEAK_POINTS];
static bool s_leakWet[MV_AHU_LEAK_POINTS];

static uint16_t mvAhuEnvCrc(const MvAhuEnvCalConfig* cfg) {
  MvAhuEnvCalConfig tmp;
  memcpy(&tmp, cfg, sizeof(tmp));
  tmp.crc = 0;
  const uint8_t* p = (const uint8_t*)&tmp;
  uint16_t c = 0xFFFF;
  for (size_t i = 0; i < sizeof(tmp); i++) {
    c ^= (uint16_t)p[i] << 8;
    for (uint8_t b = 0; b < 8; b++) {
      if (c & 0x8000) c = (uint16_t)((c << 1) ^ 0x1021);
      else c <<= 1;
    }
  }
  return c;
}

static bool mvAhuEnvValid(const MvAhuEnvCalConfig* cfg) {
  return cfg && cfg->magic == MV_AHU_ENV_MAGIC && cfg->version == MV_AHU_ENV_VERSION
      && cfg->crc == mvAhuEnvCrc(cfg);
}

static void mvAhuEnvDefaultNtcBase(MvAhuNtcPoint* p, uint8_t baseInput, const char* label) {
  p->enabled = 1;
  p->onExpansion = 0;
  p->expSlot = 0;
  p->expInput = 0;
  p->baseInput = baseInput;
  strncpy(p->label, label, sizeof(p->label) - 1);
  p->label[sizeof(p->label) - 1] = '\0';
  p->vsupply = 24.0f;
  p->rfixed = 10000.0f;
  p->ropt = 5850.0f;
  p->r25 = 10000.0f;
  p->beta = 3950.0f;
  p->offsetF = 0.0f;
}

static void mvAhuEnvDefaultNtcExp(MvAhuNtcPoint* p, uint8_t expInput, const char* label) {
  mvAhuEnvDefaultNtcBase(p, 0, label);
  p->onExpansion = 1;
  p->expSlot = 0;
  p->expInput = expInput;
}

static void mvAhuEnvDefaultLeak(MvAhuLeakPoint* p, uint8_t expInput, const char* label, uint8_t isDigital) {
  p->enabled = 1;
  p->isDigital = isDigital;
  p->onExpansion = 1;
  p->expSlot = 0;
  p->expInput = expInput;
  p->baseInput = 0;
  strncpy(p->label, label, sizeof(p->label) - 1);
  p->label[sizeof(p->label) - 1] = '\0';
  p->thresholdMv = 2500.0f;
  p->detectAbove = 1;
  p->mvPerRaw = 1.0f;
}

static void mvAhuEnvDefaultLeakBase(MvAhuLeakPoint* p, uint8_t baseInput, const char* label) {
  mvAhuEnvDefaultLeak(p, 0, label, 0);
  p->onExpansion = 0;
  p->baseInput = baseInput;
}

void mvAhuEnvCalDefaults(MvAhuEnvCalConfig* cfg) {
  memset(cfg, 0, sizeof(*cfg));
  cfg->magic = MV_AHU_ENV_MAGIC;
  cfg->version = MV_AHU_ENV_VERSION;
  cfg->enabled = 0;
  mvAhuEnvDefaultNtcBase(&cfg->ntc[0], 4, "AHU1 supply");
  mvAhuEnvDefaultNtcBase(&cfg->ntc[1], 5, "AHU1 return");
  mvAhuEnvDefaultNtcBase(&cfg->ntc[2], 6, "AHU2 supply");
  mvAhuEnvDefaultNtcBase(&cfg->ntc[3], 7, "AHU2 return");
  mvAhuEnvDefaultLeak(&cfg->leak[0], 0, "AHU1 pan leak", 0);
  mvAhuEnvDefaultLeak(&cfg->leak[1], 1, "AHU2 pan leak", 0);
  cfg->crc = mvAhuEnvCrc(cfg);
}

bool mvAhuEnvCalLoad(MvAhuEnvCalConfig* cfg) {
  mvAhuEnvCalDefaults(cfg);
#ifdef MV_AHU_ENV_HAS_KV
  uint8_t buf[sizeof(MvAhuEnvCalConfig)];
  size_t actual = 0;
  if (kv_get(MV_AHU_ENV_KV_KEY, buf, sizeof(buf), &actual) == 0 && actual == sizeof(MvAhuEnvCalConfig)) {
    MvAhuEnvCalConfig* tmp = (MvAhuEnvCalConfig*)buf;
    if (mvAhuEnvValid(tmp)) {
      memcpy(cfg, tmp, sizeof(*cfg));
      g_ahuLoaded = true;
      memcpy(&g_ahuEnv, cfg, sizeof(g_ahuEnv));
      return true;
    }
  }
#endif
  g_ahuLoaded = true;
  memcpy(&g_ahuEnv, cfg, sizeof(g_ahuEnv));
  return true;
}

bool mvAhuEnvCalSave(const MvAhuEnvCalConfig* cfg) {
  if (!cfg) return false;
  MvAhuEnvCalConfig tmp;
  memcpy(&tmp, cfg, sizeof(tmp));
  tmp.magic = MV_AHU_ENV_MAGIC;
  tmp.version = MV_AHU_ENV_VERSION;
  tmp.crc = mvAhuEnvCrc(&tmp);
  memcpy(&g_ahuEnv, &tmp, sizeof(g_ahuEnv));
  g_ahuLoaded = true;
#ifdef MV_AHU_ENV_HAS_KV
  const bool ok = kv_set(MV_AHU_ENV_KV_KEY, &tmp, sizeof(tmp), 0) == 0;
#else
  const bool ok = true;
#endif
  if (ok) mvMqttRequestTelemetryFlush();
  return ok;
}

const MvAhuEnvCalConfig* mvAhuEnvCalActive() {
  if (!g_ahuLoaded) mvAhuEnvCalLoad(&g_ahuEnv);
  return &g_ahuEnv;
}

bool mvAhuEnvCalEnabled() {
  return mvAhuEnvCalActive()->enabled != 0;
}

void mvAhuEnvCalBegin() {
  mvAhuEnvCalLoad(&g_ahuEnv);
  g_ahuLoaded = true;
  memset(s_ntcF, 0, sizeof(s_ntcF));
  memset(s_leakMv, 0, sizeof(s_leakMv));
  memset(s_leakWet, 0, sizeof(s_leakWet));
}

static float rawToVolts(int raw16) {
  const float maxR = 65535.0f;
  if (raw16 < 0) raw16 = 0;
  float v = (float)raw16 * 10.0f / maxR;
  if (v < 0.0f) v = 0.0f;
  if (v > 10.0f) v = 10.0f;
  return v;
}

static float ntcFahrenheit(int raw16, const MvAhuNtcPoint* p) {
  const float v = rawToVolts(raw16);
  if (v >= 9.95f || v < 0.05f) return NAN;
  const float vs = p->vsupply > 1.0f ? p->vsupply : 24.0f;
  const float rf = p->rfixed > 1.0f ? p->rfixed : 10000.0f;
  const float ro = p->ropt > 1.0f ? p->ropt : 5850.0f;
  const float r25 = p->r25 > 1.0f ? p->r25 : 10000.0f;
  const float beta = p->beta > 1.0f ? p->beta : 3950.0f;
  if (vs - v < 0.05f) return NAN;
  const float rEq = (v * rf) / (vs - v);
  const float den = (1.0f / rEq) - (1.0f / ro);
  if (den <= 1e-12f) return NAN;
  const float rTh = 1.0f / den;
  if (rTh <= 1.0f) return NAN;
  const float tK = 1.0f / ((1.0f / 298.15f) + (logf(rTh / r25) / beta));
  const float tC = tK - 273.15f;
  return tC * 1.8f + 32.0f + p->offsetF;
}

static bool readExpDigital(uint8_t expSlot, uint8_t expInput) {
  char id[16];
  snprintf(id, sizeof(id), "X%u_I%u", (unsigned)(expSlot + 1), (unsigned)(expInput + 1));
  MvTag* t = mvFindTag(id);
  if (t && t->kind == MV_BOOL) return t->b;
  return false;
}

static int readExpRaw16(uint8_t expSlot, uint8_t expInput) {
  char id[16];
  snprintf(id, sizeof(id), "X%u_IRAW%u", (unsigned)(expSlot + 1), (unsigned)(expInput + 1));
  MvTag* t = mvFindTag(id);
  if (t && t->kind == MV_INT) return t->i;
  return 0;
}

static int readNtcRaw(const MvAhuNtcPoint* p) {
  if (p->onExpansion) return readExpRaw16(p->expSlot, p->expInput);
  if (p->baseInput >= 8) return 0;
  return mvReadAnalogRawDirect(p->baseInput);
}

static int readLeakRaw(const MvAhuLeakPoint* p) {
  if (p->onExpansion) return readExpRaw16(p->expSlot, p->expInput);
  if (p->baseInput >= 8) return 0;
  return mvReadAnalogRawDirect(p->baseInput);
}

float mvAhuEnvNtcFahrenheit(uint8_t idx) {
  if (idx >= MV_AHU_NTC_POINTS) return NAN;
  return s_ntcF[idx];
}

float mvAhuEnvLeakMv(uint8_t idx) {
  if (idx >= MV_AHU_LEAK_POINTS) return 0.0f;
  return s_leakMv[idx];
}

bool mvAhuEnvLeakWet(uint8_t idx) {
  if (idx >= MV_AHU_LEAK_POINTS) return false;
  return s_leakWet[idx];
}

static void publishFacilityTags() {
  mvEnsureTag("AHU1_SUPPLY_TEMP_F", MV_REAL);
  mvEnsureTag("AHU1_RETURN_TEMP_F", MV_REAL);
  mvEnsureTag("AHU2_SUPPLY_TEMP_F", MV_REAL);
  mvEnsureTag("AHU2_RETURN_TEMP_F", MV_REAL);
  mvEnsureTag("AHU1_PAN_LEAK", MV_BOOL);
  mvEnsureTag("AHU2_PAN_LEAK", MV_BOOL);

  mvSetReal("AHU1_SUPPLY_TEMP_F", s_ntcF[0]);
  mvSetReal("AHU1_RETURN_TEMP_F", s_ntcF[1]);
  mvSetReal("AHU2_SUPPLY_TEMP_F", s_ntcF[2]);
  mvSetReal("AHU2_RETURN_TEMP_F", s_ntcF[3]);
  mvSetBool("AHU1_PAN_LEAK", s_leakWet[0]);
  mvSetBool("AHU2_PAN_LEAK", s_leakWet[1]);
}

void mvAhuEnvCalTick() {
  if (!mvAhuEnvCalEnabled()) return;
  const MvAhuEnvCalConfig* cfg = mvAhuEnvCalActive();

  for (uint8_t i = 0; i < MV_AHU_NTC_POINTS; i++) {
    const MvAhuNtcPoint* p = &cfg->ntc[i];
    if (!p->enabled) {
      s_ntcF[i] = 0.0f;
      continue;
    }
    const float t = ntcFahrenheit(readNtcRaw(p), p);
    if (!isnan(t)) {
      if (s_ntcF[i] == 0.0f) s_ntcF[i] = t;
      else s_ntcF[i] = 0.15f * t + 0.85f * s_ntcF[i];
    }
  }

  for (uint8_t i = 0; i < MV_AHU_LEAK_POINTS; i++) {
    const MvAhuLeakPoint* p = &cfg->leak[i];
    if (!p->enabled) {
      s_leakMv[i] = 0.0f;
      s_leakWet[i] = false;
      continue;
    }
    if (p->isDigital) {
      s_leakMv[i] = 0.0f;
      const bool on = readExpDigital(p->expSlot, p->expInput);
      s_leakWet[i] = p->detectAbove ? on : !on;
    } else {
      const float mv = (float)readExpRaw16(p->expSlot, p->expInput) * (p->mvPerRaw > 0.01f ? p->mvPerRaw : 1.0f);
      s_leakMv[i] = mv;
      if (p->detectAbove) s_leakWet[i] = mv >= p->thresholdMv;
      else s_leakWet[i] = mv <= p->thresholdMv;
    }
  }

  publishFacilityTags();
}

void mvAhuEnvCalAppendStatus(JsonObject obj) {
  const MvAhuEnvCalConfig* cfg = mvAhuEnvCalActive();
  obj["ahuEnvEnabled"] = cfg->enabled != 0;
  obj["ahuEnvNtcPoints"] = MV_AHU_NTC_POINTS;
  obj["ahuEnvLeakPoints"] = MV_AHU_LEAK_POINTS;
}

void mvAhuEnvCalAppendLive(JsonObject obj) {
  JsonArray ntc = obj.createNestedArray("ntc");
  const MvAhuEnvCalConfig* cfg = mvAhuEnvCalActive();
  for (uint8_t i = 0; i < MV_AHU_NTC_POINTS; i++) {
    JsonObject row = ntc.createNestedObject();
    row["index"] = i;
    row["enabled"] = cfg->ntc[i].enabled != 0;
    row["onExpansion"] = cfg->ntc[i].onExpansion != 0;
    row["expInput"] = cfg->ntc[i].expInput + 1;
    row["input"] = cfg->ntc[i].onExpansion ? (int)(cfg->ntc[i].expInput + 1) : (int)(cfg->ntc[i].baseInput + 1);
    row["label"] = cfg->ntc[i].label;
    row["tempF"] = s_ntcF[i];
    row["raw"] = readNtcRaw(&cfg->ntc[i]);
  }
  JsonArray leak = obj.createNestedArray("leak");
  for (uint8_t i = 0; i < MV_AHU_LEAK_POINTS; i++) {
    JsonObject row = leak.createNestedObject();
    row["index"] = i;
    row["enabled"] = cfg->leak[i].enabled != 0;
    row["onExpansion"] = cfg->leak[i].onExpansion != 0;
    row["expInput"] = cfg->leak[i].expInput + 1;
    row["baseInput"] = cfg->leak[i].baseInput + 1;
    row["isDigital"] = cfg->leak[i].isDigital != 0;
    row["label"] = cfg->leak[i].label;
    row["mv"] = s_leakMv[i];
    row["wet"] = s_leakWet[i];
    row["thresholdMv"] = cfg->leak[i].thresholdMv;
  }
}

void mvAhuEnvCalAppendTelemetry(JsonObject obj) {
  mvAhuEnvCalAppendStatus(obj);
  JsonObject live = obj.createNestedObject("ahuEnv");
  mvAhuEnvCalAppendLive(live);
}

#else

void mvAhuEnvCalBegin() {}
void mvAhuEnvCalDefaults(MvAhuEnvCalConfig* cfg) { (void)cfg; }
bool mvAhuEnvCalLoad(MvAhuEnvCalConfig* cfg) { (void)cfg; return false; }
bool mvAhuEnvCalSave(const MvAhuEnvCalConfig* cfg) { (void)cfg; return false; }
const MvAhuEnvCalConfig* mvAhuEnvCalActive() { return nullptr; }
bool mvAhuEnvCalEnabled() { return false; }
void mvAhuEnvCalTick() {}
float mvAhuEnvNtcFahrenheit(uint8_t idx) { (void)idx; return 0.0f; }
float mvAhuEnvLeakMv(uint8_t idx) { (void)idx; return 0.0f; }
bool mvAhuEnvLeakWet(uint8_t idx) { (void)idx; return false; }
void mvAhuEnvCalAppendStatus(JsonObject obj) { (void)obj; }
void mvAhuEnvCalAppendLive(JsonObject obj) { (void)obj; }
void mvAhuEnvCalAppendTelemetry(JsonObject obj) { (void)obj; }

#endif
