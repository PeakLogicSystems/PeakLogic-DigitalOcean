#pragma once

#include <ArduinoJson.h>
#include <stdint.h>

/** Dual-AHU facility layout on one Opta + D1608E (facility-hvac-iot-link). */
#define MV_AHU_NTC_POINTS 4
#define MV_AHU_LEAK_POINTS 2

struct MvAhuNtcPoint {
  uint8_t enabled;
  uint8_t onExpansion; /* 1 = D1608E Xn_IRAW */
  uint8_t expSlot; /* 0 → X1 */
  uint8_t expInput; /* 0 → IRAW1 */
  uint8_t baseInput; /* 0=I1 … 7=I8 when onExpansion=0 */
  char label[20];
  float vsupply;
  float rfixed;
  float ropt;
  float r25;
  float beta;
  float offsetF;
};

struct MvAhuLeakPoint {
  uint8_t enabled;
  uint8_t isDigital; /* legacy: 1 = D1608E Xn_In DI; default 0 = Xn_IRAW analog mV */
  uint8_t onExpansion; /* 1 = D1608E Xn_IRAW; 0 = base I1–I8 */
  uint8_t expSlot; /* 0 → X1 */
  uint8_t expInput; /* 0 → IRAW1 / expansion index */
  uint8_t baseInput; /* 0=I1 … 7=I8 when onExpansion=0 */
  char label[20];
  float thresholdMv;
  uint8_t detectAbove; /* digital: 1 = wet when DI ON */
  float mvPerRaw;
};

struct MvAhuEnvCalConfig {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint8_t enabled;
  uint8_t reserved;
  MvAhuNtcPoint ntc[MV_AHU_NTC_POINTS];
  MvAhuLeakPoint leak[MV_AHU_LEAK_POINTS];
};

void mvAhuEnvCalBegin();
void mvAhuEnvCalDefaults(MvAhuEnvCalConfig* cfg);
bool mvAhuEnvCalLoad(MvAhuEnvCalConfig* cfg);
bool mvAhuEnvCalSave(const MvAhuEnvCalConfig* cfg);
const MvAhuEnvCalConfig* mvAhuEnvCalActive();
bool mvAhuEnvCalEnabled();

void mvAhuEnvCalTick();

float mvAhuEnvNtcFahrenheit(uint8_t idx);
float mvAhuEnvLeakMv(uint8_t idx);
bool mvAhuEnvLeakWet(uint8_t idx);

void mvAhuEnvCalAppendStatus(JsonObject obj);
void mvAhuEnvCalAppendLive(JsonObject obj);
void mvAhuEnvCalAppendTelemetry(JsonObject obj);
void mvAhuEnvCalRegisterRoutes();
