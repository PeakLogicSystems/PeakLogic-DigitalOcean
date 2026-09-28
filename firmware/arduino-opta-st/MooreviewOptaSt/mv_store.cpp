#include "mv_store.h"
#include "mv_config.h"
#include <string.h>

static MvDeviceConfig g_active;
static bool g_loaded = false;

static uint16_t mvStoreCrc(const MvDeviceConfig* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  size_t n = sizeof(MvDeviceConfig) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

void mvStoreDefaults(MvDeviceConfig* cfg) {
  memset(cfg, 0, sizeof(MvDeviceConfig));
  cfg->magic = MV_STORE_MAGIC;
  cfg->version = MV_STORE_VERSION;
  cfg->ethUseDhcp = 1;
  cfg->wifiApEnable = 1;
  strncpy(cfg->wifiApSsid, MV_WIFI_AP_SSID, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, MV_WIFI_AP_PASS, sizeof(cfg->wifiApPass) - 1);
  cfg->ethIp[0] = 192; cfg->ethIp[1] = 168; cfg->ethIp[2] = 1; cfg->ethIp[3] = 50;
  cfg->ethGw[0] = 192; cfg->ethGw[1] = 168; cfg->ethGw[2] = 1; cfg->ethGw[3] = 1;
  cfg->ethMask[0] = 255; cfg->ethMask[1] = 255; cfg->ethMask[2] = 255; cfg->ethMask[3] = 0;
  cfg->ethDns[0] = 8; cfg->ethDns[1] = 8; cfg->ethDns[2] = 8; cfg->ethDns[3] = 8;
  for (uint8_t i = 0; i < MV_EXP_SLOTS; i++) cfg->expSlotType[i] = MV_EXP_AUTO;
  cfg->crc = mvStoreCrc(cfg);
}

static bool mvStoreValid(const MvDeviceConfig* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != MV_STORE_VERSION) return false;
  return cfg->crc == mvStoreCrc(cfg);
}

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_HAS_KV 1
static const char* MV_KV_KEY = "/kv/mv_setup";
#endif

bool mvStoreLoad(MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
#ifdef MV_HAS_KV
  MvDeviceConfig tmp;
  size_t actual = 0;
  if (kv_get(MV_KV_KEY, &tmp, sizeof(tmp), &actual) == 0 && actual == sizeof(tmp) && mvStoreValid(&tmp)) {
    memcpy(cfg, &tmp, sizeof(tmp));
    g_loaded = true;
    memcpy(&g_active, cfg, sizeof(g_active));
    return true;
  }
#endif
  g_loaded = true;
  memcpy(&g_active, cfg, sizeof(g_active));
  return true;
}

bool mvStoreSave(const MvDeviceConfig* cfg) {
  if (!cfg) return false;
  MvDeviceConfig tmp;
  memcpy(&tmp, cfg, sizeof(tmp));
  tmp.magic = MV_STORE_MAGIC;
  tmp.version = MV_STORE_VERSION;
  tmp.crc = mvStoreCrc(&tmp);
  memcpy(&g_active, &tmp, sizeof(g_active));
  g_loaded = true;
#ifdef MV_HAS_KV
  return kv_set(MV_KV_KEY, &tmp, sizeof(tmp), 0) == 0;
#else
  return true;
#endif
}

const MvDeviceConfig* mvStoreActive() {
  if (!g_loaded) mvStoreLoad(&g_active);
  return &g_active;
}
