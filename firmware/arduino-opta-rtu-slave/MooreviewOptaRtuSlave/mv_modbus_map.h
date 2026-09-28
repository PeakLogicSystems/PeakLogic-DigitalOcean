#pragma once

#include <Arduino.h>

/** Register layout — keep in sync with src/devices/tagBuilders.js optaParcModbusDraginoTags(). */
enum MvMbRegion : uint16_t {
  MV_MB_DI_COUNT = 8,
  MV_MB_COIL_COUNT = 4,
  MV_MB_IR_COUNT = 24,
  MV_MB_HR_COUNT = 8,

  MV_MB_IR_RAW0 = 0,          // I1_RAW..I8_RAW
  MV_MB_IR_MA_AI3 = 8,        // mA_AI3..mA_AI6 (centi-mA)
  MV_MB_IR_SCALED_AI3 = 12,   // scaled_AI3..scaled_AI6 (deci-units)
  MV_MB_IR_MCSA_CH1 = 16,     // MCSA_CH1_AMPS..CH6 (centi-A)
  MV_MB_IR_PDM_P1_HEALTH = 22,
  MV_MB_IR_PDM_P2_HEALTH = 23,
};

static inline uint16_t mvMbCenti(float v) {
  if (v < 0.0f) v = 0.0f;
  if (v > 655.35f) v = 655.35f;
  return (uint16_t)(v * 100.0f + 0.5f);
}

static inline uint16_t mvMbDeci(float v) {
  if (v < -3276.8f) v = -3276.8f;
  if (v > 3276.7f) v = 3276.7f;
  return (uint16_t)(int16_t)(v * 10.0f + (v >= 0 ? 0.5f : -0.5f));
}

static inline uint16_t mvMbClampU16(int v) {
  if (v < 0) return 0;
  if (v > 65535) return 65535;
  return (uint16_t)v;
}
