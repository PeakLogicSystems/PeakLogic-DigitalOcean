#include "mv_fieldbus.h"
#include "mv_debug.h"

void mvFieldbusInit(const MvFieldbusConfig* cfg) {
  (void)cfg;
#if MV_FIELDBUS
  MV_LOG("[MVFB] fieldbus enabled — no device profile compiled in");
#endif
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
