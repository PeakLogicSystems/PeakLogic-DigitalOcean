#pragma once

#include <ArduinoJson.h>
#include <stdint.h>

/** CT inputs I1–I6 (indices 0–5): 0–1 V transmitters on Opta 0–10 V analog inputs. */
#define MV_CT_CHANNELS 6

/**
 * STM32H747 ADC is 16-bit. analogReadResolution(16) so 0–1 V uses ~6554 counts
 * of 0–65535 (was ~410 of 4095). ST I*_RAW tags stay 12-bit via mvCtRawToSt12().
 */
#ifndef MV_CT_ADC_BITS
#define MV_CT_ADC_BITS 16
#endif
#ifndef MV_CT_ADC_MAX_RAW
#define MV_CT_ADC_MAX_RAW ((1 << MV_CT_ADC_BITS) - 1)
#endif
#define MV_CT_ST_SHIFT (MV_CT_ADC_BITS - 12)

#ifndef MV_CT_INPUT_RANGE_V
#define MV_CT_INPUT_RANGE_V 10.0f
#endif

#ifndef MV_CT_FULL_SCALE_V
#define MV_CT_FULL_SCALE_V 1.0f
#endif

#ifndef MV_CT_FULL_SCALE_A
#define MV_CT_FULL_SCALE_A 50.0f
#endif

/** Scan-path oversample: ~one 120 Hz cycle window (best 0–1 V RMS amps). */
#ifndef MV_CT_DEFAULT_OVERSAMPLE
#define MV_CT_DEFAULT_OVERSAMPLE 32
#endif

/** Map 16-bit ADC counts to ST-compatible 12-bit I*_RAW (0–4095). */
static inline int mvCtRawToSt12(int raw16) {
  if (raw16 < 0) raw16 = 0;
  return (raw16 + (1 << (MV_CT_ST_SHIFT - 1))) >> MV_CT_ST_SHIFT;
}

struct MvCtCalConfig {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint16_t oversample;
  uint16_t adcMaxRaw;
  float inputRangeVolts;
  float ctFullScaleVolts;
  float ctFullScaleAmps;
  float idleAmps;
  float startDetectAmps;
  float offsetRaw[MV_CT_CHANNELS];
  float scaleAmpsPerRaw[MV_CT_CHANNELS];
  uint8_t zeroed[MV_CT_CHANNELS];
};

void mvCtCalBegin();
void mvCtCalDefaults(MvCtCalConfig* cfg);
bool mvCtCalLoad(MvCtCalConfig* cfg);
bool mvCtCalSave(const MvCtCalConfig* cfg);
const MvCtCalConfig* mvCtCalActive();

float mvCtDefaultScaleAmpsPerRaw(const MvCtCalConfig* cfg);
float mvCtEffectiveScale(uint8_t ch);

/** Oversampled 16-bit raw ADC (mux settle + trimmed mean). */
int mvCtReadRawFiltered(uint8_t ch);
float mvCtReadVolts(uint8_t ch);
float mvCtReadAmps(uint8_t ch);

bool mvCtCalZeroChannel(uint8_t ch, char* errOut, size_t errLen);
bool mvCtCalZeroAll(char* errOut, size_t errLen);
bool mvCtCalSpanChannel(uint8_t ch, float referenceAmps, char* errOut, size_t errLen);
bool mvCtCalResetDefaults();

void mvCtCalAppendStatus(JsonObject obj);
void mvCtCalAppendLive(JsonArray channels);
/** Config + live I1–I6 readings for MQTT telemetry. */
void mvCtCalAppendTelemetry(JsonObject obj);

void mvCtCalRegisterRoutes();
