#include "mv_global_key.h"
#include "mv_store.h"
#include <stdio.h>

#ifndef MV_MQTT_TOPIC_PREFIX
#define MV_MQTT_TOPIC_PREFIX "peaklogic/v1"
#endif

uint16_t mvGlobalSiteKey() {
  const MvDeviceConfig* cfg = mvStoreActive();
  uint16_t k = cfg ? cfg->globalSiteKey : 0;
  if (k < 1) k = 1;
  return k;
}

bool mvGlobalAddrKey(char out[5]) {
  if (!out) return false;
  snprintf(out, 5, "%04x", (unsigned)mvGlobalSiteKey());
  return true;
}

bool mvGlobalTopic(const char* tag, char* out, size_t outLen) {
  if (!tag || !out || outLen < 8) return false;
  char addr[5];
  mvGlobalAddrKey(addr);
  int n = snprintf(out, outLen, MV_MQTT_TOPIC_PREFIX "/g/%s/%s", addr, tag);
  return n > 0 && (size_t)n < outLen;
}
