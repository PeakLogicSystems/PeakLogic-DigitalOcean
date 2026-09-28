#include "mv_identity.h"
#include <stdio.h>
#include <string.h>

#if defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)
#include <ArduinoECCX08.h>
#define MV_HAS_ATECC 1
#else
#define MV_HAS_ATECC 0
#endif

static char g_ateccHex[19];
static char g_deviceId[28];
static bool g_hasAtecc = false;
static const char* g_ateccStatus = "not_attempted";

static void formatSerialHex(const uint8_t* sn, char* out18) {
  for (int i = 0; i < 9; i++) {
    sprintf(out18 + (i * 2), "%02x", sn[i] & 0xff);
  }
  out18[18] = '\0';
}

/** FNV-1a 64-bit over 9-byte ATECC serial (Phase 1 mv_{16hex} device id). */
static uint64_t fnv1a64(const uint8_t* data, size_t len) {
  uint64_t hash = 0xcbf29ce484222325ULL;
  for (size_t i = 0; i < len; i++) {
    hash ^= (uint64_t)(data[i] & 0xff);
    hash *= 0x100000001b3ULL;
  }
  return hash;
}

static void formatMvDeviceId(const uint8_t* sn, char* out, size_t outLen) {
  const uint64_t h = fnv1a64(sn, 9);
  snprintf(out, outLen, "mv_%016llx", (unsigned long long)h);
}

bool mvIdentityBegin() {
  g_ateccHex[0] = '\0';
  strncpy(g_deviceId, "opta_st_01", sizeof(g_deviceId) - 1);
  g_deviceId[sizeof(g_deviceId) - 1] = '\0';
  g_hasAtecc = false;

#if !MV_HAS_ATECC
  g_ateccStatus = "no_library — install ArduinoECCX08 in Library Manager, then recompile and upload";
  return false;
#else
  g_ateccStatus = "read_failed";
  uint8_t sn[9];
  for (int attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) delay(80);
    if (!ECCX08.begin()) continue;
    if (!ECCX08.serialNumber(sn)) {
      g_ateccStatus = "serial_failed — ATECC608 present but serial read failed";
      continue;
    }
    formatSerialHex(sn, g_ateccHex);
    formatMvDeviceId(sn, g_deviceId, sizeof(g_deviceId));
    g_hasAtecc = true;
    g_ateccStatus = "ok";
    return true;
  }
  if (strcmp(g_ateccStatus, "read_failed") == 0) {
    g_ateccStatus = "init_failed — secure element not responding (power-cycle Opta)";
  }
  return false;
#endif
}

const char* mvIdentityDeviceId() {
  return g_deviceId;
}

const char* mvIdentityAteccSerial() {
  return g_ateccHex;
}

bool mvIdentityHasAtecc() {
  return g_hasAtecc;
}

const char* mvIdentityAteccStatus() {
  return g_ateccStatus;
}
