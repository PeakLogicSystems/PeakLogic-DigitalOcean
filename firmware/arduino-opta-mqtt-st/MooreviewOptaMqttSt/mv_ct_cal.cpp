#include "mv_ct_cal.h"
#include "mv_config.h"
#include "mv_io.h"
#include "mv_mqtt.h"
#include "mv_watchdog.h"
#include "mv_mcsa_m7.h"
#include <Arduino.h>
#include <string.h>

#define MV_CT_CAL_MAGIC 0x4D564354u
#define MV_CT_CAL_VERSION 3
#define MV_CT_CAL_VERSION_V2 2

static MvCtCalConfig g_ctCal;
static bool g_ctLoaded = false;

static uint16_t mvCtCalCrc(const MvCtCalConfig* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  const size_t n = sizeof(MvCtCalConfig) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool mvCtCalCrcOk(const MvCtCalConfig* cfg, uint16_t version) {
  if (!cfg || cfg->magic != MV_CT_CAL_MAGIC || cfg->version != version) return false;
  return cfg->crc == mvCtCalCrc(cfg);
}

static bool mvCtCalValid(const MvCtCalConfig* cfg) {
  return mvCtCalCrcOk(cfg, MV_CT_CAL_VERSION);
}

/** v2 stored 12-bit counts; scale into 16-bit native units. */
static void mvCtCalMigrateV2(MvCtCalConfig* cfg) {
  if (!cfg) return;
  const float mul = (float)(1 << MV_CT_ST_SHIFT);
  cfg->adcMaxRaw = MV_CT_ADC_MAX_RAW;
  for (uint8_t i = 0; i < MV_CT_CHANNELS; i++) {
    cfg->offsetRaw[i] *= mul;
    if (cfg->scaleAmpsPerRaw[i] > 1e-12f) cfg->scaleAmpsPerRaw[i] /= mul;
  }
  if (cfg->oversample < MV_CT_DEFAULT_OVERSAMPLE) cfg->oversample = MV_CT_DEFAULT_OVERSAMPLE;
  cfg->version = MV_CT_CAL_VERSION;
  cfg->crc = mvCtCalCrc(cfg);
}

void mvCtCalDefaults(MvCtCalConfig* cfg) {
  memset(cfg, 0, sizeof(MvCtCalConfig));
  cfg->magic = MV_CT_CAL_MAGIC;
  cfg->version = MV_CT_CAL_VERSION;
  cfg->oversample = MV_CT_DEFAULT_OVERSAMPLE;
  cfg->adcMaxRaw = MV_CT_ADC_MAX_RAW;
  cfg->inputRangeVolts = MV_CT_INPUT_RANGE_V;
#if MV_CT_BURDEN_OHM > 0
  {
    float vfs = (MV_CT_MA_FS / 1000.0f) * (float)MV_CT_BURDEN_OHM;
    if (vfs > MV_CT_INPUT_RANGE_V) vfs = MV_CT_INPUT_RANGE_V;
    if (vfs < 0.1f) vfs = 1.0f;
    cfg->ctFullScaleVolts = vfs;
  }
#else
  cfg->ctFullScaleVolts = MV_CT_FULL_SCALE_V;
#endif
  cfg->ctFullScaleAmps = MV_CT_FULL_SCALE_A;
  cfg->idleAmps = 2.0f;
  cfg->startDetectAmps = 3.0f;
  const float defScale = mvCtDefaultScaleAmpsPerRaw(cfg);
  for (uint8_t i = 0; i < MV_CT_CHANNELS; i++) {
    cfg->offsetRaw[i] = 0.0f;
    cfg->scaleAmpsPerRaw[i] = defScale;
    cfg->zeroed[i] = 0;
  }
  cfg->crc = mvCtCalCrc(cfg);
}

float mvCtDefaultScaleAmpsPerRaw(const MvCtCalConfig* cfg) {
  if (!cfg || cfg->adcMaxRaw == 0 || cfg->inputRangeVolts <= 0.0f || cfg->ctFullScaleVolts <= 0.0f) {
    return MV_CT_FULL_SCALE_A / (MV_CT_ADC_MAX_RAW * MV_CT_FULL_SCALE_V / MV_CT_INPUT_RANGE_V);
  }
  const float rawAtFullScale = (float)cfg->adcMaxRaw * cfg->ctFullScaleVolts / cfg->inputRangeVolts;
  if (rawAtFullScale < 1.0f) return MV_CT_FULL_SCALE_A;
  return cfg->ctFullScaleAmps / rawAtFullScale;
}

float mvCtEffectiveScale(uint8_t ch) {
  const MvCtCalConfig* cfg = mvCtCalActive();
  if (ch >= MV_CT_CHANNELS) return mvCtDefaultScaleAmpsPerRaw(cfg);
  const float s = cfg->scaleAmpsPerRaw[ch];
  if (s > 1e-9f) return s;
  return mvCtDefaultScaleAmpsPerRaw(cfg);
}

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_CT_HAS_KV 1
static const char* MV_CT_KV_KEY = "/kv/mv_ct_cal";
#endif

bool mvCtCalLoad(MvCtCalConfig* cfg) {
  mvCtCalDefaults(cfg);
#ifdef MV_CT_HAS_KV
  uint8_t buf[sizeof(MvCtCalConfig)];
  size_t actual = 0;
  if (kv_get(MV_CT_KV_KEY, buf, sizeof(buf), &actual) == 0 && actual == sizeof(MvCtCalConfig)) {
    MvCtCalConfig* tmp = (MvCtCalConfig*)buf;
    if (mvCtCalValid(tmp)) {
      memcpy(cfg, tmp, sizeof(MvCtCalConfig));
      g_ctLoaded = true;
      memcpy(&g_ctCal, cfg, sizeof(g_ctCal));
      return true;
    }
    if (mvCtCalCrcOk(tmp, MV_CT_CAL_VERSION_V2)) {
      mvCtCalMigrateV2(tmp);
      memcpy(cfg, tmp, sizeof(MvCtCalConfig));
      g_ctLoaded = true;
      memcpy(&g_ctCal, cfg, sizeof(g_ctCal));
      mvCtCalSave(cfg);
      return true;
    }
  }
#endif
  g_ctLoaded = true;
  memcpy(&g_ctCal, cfg, sizeof(g_ctCal));
  return true;
}

bool mvCtCalSave(const MvCtCalConfig* cfg) {
  if (!cfg) return false;
  MvCtCalConfig tmp;
  memcpy(&tmp, cfg, sizeof(tmp));
  tmp.magic = MV_CT_CAL_MAGIC;
  tmp.version = MV_CT_CAL_VERSION;
  tmp.crc = mvCtCalCrc(&tmp);
  memcpy(&g_ctCal, &tmp, sizeof(g_ctCal));
  g_ctLoaded = true;
#ifdef MV_CT_HAS_KV
  const bool ok = kv_set(MV_CT_KV_KEY, &tmp, sizeof(tmp), 0) == 0;
#else
  const bool ok = true;
#endif
  if (ok) mvMqttRequestTelemetryFlush();
  return ok;
}

const MvCtCalConfig* mvCtCalActive() {
  if (!g_ctLoaded) mvCtCalLoad(&g_ctCal);
  return &g_ctCal;
}

void mvCtCalBegin() {
  mvCtCalLoad(&g_ctCal);
}

static int mvCtReadRawOnce(uint8_t ch) {
  if (ch >= 8) return 0;
  int held = 0;
  if (mvMcsaM7PeekRaw(ch, &held)) return held;
  return mvReadAnalogRawDirect(ch);
}

int mvCtReadRawFiltered(uint8_t ch) {
  if (ch >= MV_CT_CHANNELS) return mvCtReadRawOnce(ch);
  if (mvMcsaM7Capturing()) return mvCtReadRawOnce(ch);
  const MvCtCalConfig* cfg = mvCtCalActive();
  uint16_t n = cfg->oversample;
  if (n < 1) n = 1;
  if (n > 64) n = 64;

  /* Discard first conversion after mux switch (Opta analog is muxed). */
  (void)mvCtReadRawOnce(ch);

  int samples[64];
  uint16_t count = 0;
  /* Window ≈ one 120 Hz cycle so 0–1 V RMS amps reject rectifier ripple. */
  uint16_t spacingUs = n >= 8 ? (uint16_t)(8333 / n) : 250;
  if (spacingUs < 40) spacingUs = 40;
  if (spacingUs > 1000) spacingUs = 1000;

  for (uint16_t i = 0; i < n; i++) {
    samples[count++] = mvCtReadRawOnce(ch);
    if (n > 1 && i + 1 < n) delayMicroseconds(spacingUs);
  }

  int minV = samples[0];
  int maxV = samples[0];
  long sum = 0;
  for (uint16_t i = 0; i < count; i++) {
    if (samples[i] < minV) minV = samples[i];
    if (samples[i] > maxV) maxV = samples[i];
    sum += samples[i];
  }

  if (count >= 8) {
    sum -= minV;
    sum -= maxV;
    count -= 2;
  }
  if (count == 0) return samples[0];
  return (int)((sum + (long)count / 2) / (long)count);
}

float mvCtReadVolts(uint8_t ch) {
  const MvCtCalConfig* cfg = mvCtCalActive();
  if (cfg->adcMaxRaw == 0) return 0.0f;
  const float raw = (float)mvCtReadRawFiltered(ch);
  return raw * cfg->inputRangeVolts / (float)cfg->adcMaxRaw;
}

float mvCtReadAmps(uint8_t ch) {
  if (ch >= MV_CT_CHANNELS) return 0.0f;
  const MvCtCalConfig* cfg = mvCtCalActive();
  const float raw = (float)mvCtReadRawFiltered(ch);
  const float corrected = raw - cfg->offsetRaw[ch];
  if (corrected <= 0.0f) return 0.0f;
  return corrected * mvCtEffectiveScale(ch);
}

bool mvCtCalZeroChannel(uint8_t ch, char* errOut, size_t errLen) {
  if (ch >= MV_CT_CHANNELS) {
    if (errOut && errLen) snprintf(errOut, errLen, "invalid channel");
    return false;
  }
  MvCtCalConfig cfg;
  memcpy(&cfg, mvCtCalActive(), sizeof(cfg));

  long sum = 0;
  const uint16_t n = 32;
  for (uint16_t i = 0; i < n; i++) {
    sum += mvCtReadRawFiltered(ch);
    mvWatchdogNoteActivity();
    if (i + 1 < n) delay(5);
  }
  cfg.offsetRaw[ch] = (float)sum / (float)n;
  cfg.zeroed[ch] = 1;
  if (!mvCtCalSave(&cfg)) {
    if (errOut && errLen) snprintf(errOut, errLen, "save failed");
    return false;
  }
  return true;
}

bool mvCtCalZeroAll(char* errOut, size_t errLen) {
  for (uint8_t ch = 0; ch < MV_CT_CHANNELS; ch++) {
    char subErr[48];
    if (!mvCtCalZeroChannel(ch, subErr, sizeof(subErr))) {
      if (errOut && errLen) snprintf(errOut, errLen, "I%d: %s", (int)(ch + 1), subErr);
      return false;
    }
  }
  return true;
}

bool mvCtCalSpanChannel(uint8_t ch, float referenceAmps, char* errOut, size_t errLen) {
  if (ch >= MV_CT_CHANNELS) {
    if (errOut && errLen) snprintf(errOut, errLen, "invalid channel");
    return false;
  }
  if (referenceAmps < 0.5f || referenceAmps > 120.0f) {
    if (errOut && errLen) snprintf(errOut, errLen, "reference amps out of range");
    return false;
  }
  MvCtCalConfig cfg;
  memcpy(&cfg, mvCtCalActive(), sizeof(cfg));

  long sum = 0;
  const uint16_t n = 24;
  for (uint16_t i = 0; i < n; i++) {
    sum += mvCtReadRawFiltered(ch);
    mvWatchdogNoteActivity();
    if (i + 1 < n) delay(5);
  }
  const float rawAvg = (float)sum / (float)n;
  const float corrected = rawAvg - cfg.offsetRaw[ch];
  const float minRaw = (0.02f / (cfg.inputRangeVolts > 0.1f ? cfg.inputRangeVolts : 10.0f))
                       * (float)(cfg.adcMaxRaw > 0 ? cfg.adcMaxRaw : MV_CT_ADC_MAX_RAW);
  if (corrected < minRaw) {
    if (errOut && errLen) {
      snprintf(errOut, errLen, "run pump first — corrected raw too low (%.1f)", corrected);
    }
    return false;
  }
  cfg.scaleAmpsPerRaw[ch] = referenceAmps / corrected;
  if (!mvCtCalSave(&cfg)) {
    if (errOut && errLen) snprintf(errOut, errLen, "save failed");
    return false;
  }
  return true;
}

bool mvCtCalResetDefaults() {
  MvCtCalConfig cfg;
  mvCtCalDefaults(&cfg);
  return mvCtCalSave(&cfg);
}

void mvCtCalAppendStatus(JsonObject obj) {
  const MvCtCalConfig* cfg = mvCtCalActive();
  JsonObject ct = obj.createNestedObject("ctCal");
  ct["channels"] = MV_CT_CHANNELS;
  ct["oversample"] = cfg->oversample;
  ct["adcBits"] = MV_CT_ADC_BITS;
  ct["adcMaxRaw"] = cfg->adcMaxRaw;
  ct["inputRangeVolts"] = cfg->inputRangeVolts;
  ct["ctFullScaleVolts"] = cfg->ctFullScaleVolts;
  ct["ctFullScaleAmps"] = cfg->ctFullScaleAmps;
  ct["idleAmps"] = cfg->idleAmps;
  ct["startDetectAmps"] = cfg->startDetectAmps;
  ct["defaultScale"] = mvCtDefaultScaleAmpsPerRaw(cfg);
  uint8_t zeroCount = 0;
  for (uint8_t i = 0; i < MV_CT_CHANNELS; i++) {
    if (cfg->zeroed[i]) zeroCount++;
  }
  ct["zeroedCount"] = zeroCount;
}

void mvCtCalAppendLive(JsonArray channels) {
  const MvCtCalConfig* cfg = mvCtCalActive();
  for (uint8_t ch = 0; ch < MV_CT_CHANNELS; ch++) {
    JsonObject row = channels.createNestedObject();
    row["ch"] = ch + 1;
    row["tag"] = String("I") + String(ch + 1);
    const int raw = mvCtReadRawFiltered(ch);
    row["raw"] = raw;
    row["volts"] = mvCtReadVolts(ch);
    row["amps"] = mvCtReadAmps(ch);
    row["offsetRaw"] = cfg->offsetRaw[ch];
    row["scaleAmpsPerRaw"] = mvCtEffectiveScale(ch);
    row["zeroed"] = cfg->zeroed[ch] ? true : false;
  }
}

void mvCtCalAppendTelemetry(JsonObject obj) {
  if (obj.isNull()) return;
  mvCtCalAppendStatus(obj);
  JsonObject ct = obj["ctCal"];
  if (ct.isNull()) return;
  JsonArray ch = ct.createNestedArray("channels");
  mvCtCalAppendLive(ch);
}
