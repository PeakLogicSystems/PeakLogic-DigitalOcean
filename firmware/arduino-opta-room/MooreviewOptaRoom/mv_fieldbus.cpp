#include "mv_fieldbus.h"
#include "mv_debug.h"

#if MV_FIELDBUS

#include <ArduinoRS485.h>

static MvFieldbusConfig g_fbCfg;
static bool g_fbReady = false;

void mvFieldbusInit(const MvFieldbusConfig* cfg) {
  if (!cfg) return;
  g_fbCfg = *cfg;
  RS485.setPins(RS485_DEFAULT_DE_PIN, RS485_DEFAULT_RE_PIN);
  RS485.begin(g_fbCfg.baud, SERIAL_8N1);
  g_fbReady = true;
  MV_LOG("[MVFB] RS-485 fieldbus init baud=%lu polls=%u", (unsigned long)g_fbCfg.baud, g_fbCfg.pollCount);
}

void mvFieldbusTick(uint32_t nowMs) {
  if (!g_fbReady) return;
  for (uint16_t i = 0; i < g_fbCfg.pollCount && i < 8; i++) {
    MvFieldbusPollEntry* e = &g_fbCfg.polls[i];
    if (e->pollMs == 0) e->pollMs = 300000;
    if (nowMs - e->lastPollMs < e->pollMs) continue;
    e->lastPollMs = nowMs;
    // TODO: Modbus RTU read holding/input OR Pentair status exchange, then mvFieldbusSyncTags().
    MV_LOG("[MVFB] poll addr=0x%02X proto=%u", e->deviceAddr, e->protocol);
  }
}

bool mvFieldbusReady() {
  return g_fbReady;
}

const char* mvFieldbusHealth() {
  return g_fbReady ? "OK" : "disabled";
}

void mvFieldbusSyncTags() {
  // TODO: map poll results → MvTag values for MQTT telemetry.
}

#else

void mvFieldbusInit(const MvFieldbusConfig* cfg) {
  (void)cfg;
}

void mvFieldbusTick(uint32_t nowMs) {
  (void)nowMs;
}

bool mvFieldbusReady() {
  return false;
}

const char* mvFieldbusHealth() {
  return "disabled";
}

void mvFieldbusSyncTags() {}

#endif
