#include "mv_store.h"
#include "mv_config.h"
#include "mv_debug.h"
#include <string.h>

static MvDeviceConfig g_active;
static bool g_loaded = false;
static MvStoreChangedFn g_onChanged = nullptr;

void mvStoreSetOnChanged(MvStoreChangedFn fn) {
  g_onChanged = fn;
}

struct MvDeviceConfigV1 {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint8_t ethUseDhcp;
  uint8_t wifiApEnable;
  uint8_t reserved[2];
  char wifiApSsid[24];
  char wifiApPass[24];
  uint8_t ethIp[4];
  uint8_t ethGw[4];
  uint8_t ethMask[4];
  uint8_t ethDns[4];
  uint8_t expSlotType[MV_EXP_SLOTS];
};

struct MvDeviceConfigV2 {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint8_t ethUseDhcp;
  uint8_t wifiApEnable;
  uint8_t reserved[2];
  char wifiApSsid[24];
  char wifiApPass[24];
  uint8_t ethIp[4];
  uint8_t ethGw[4];
  uint8_t ethMask[4];
  uint8_t ethDns[4];
  uint8_t expSlotType[MV_EXP_SLOTS];
  char mqttBrokerHost[16];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t mqttReserved;
};

static uint16_t mvStoreCrcBytes(const uint8_t* p, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

/** CRC16 over struct payload, excluding the crc field itself (not tail padding). */
static uint16_t mvStoreCrcStruct(const void* data, size_t totalSize, size_t crcOffset) {
  const uint8_t* p = (const uint8_t*)data;
  if (!p || totalSize < crcOffset + sizeof(uint16_t)) return 0;
  uint16_t crc = mvStoreCrcBytes(p, crcOffset);
  const size_t after = crcOffset + sizeof(uint16_t);
  if (totalSize > after) {
    for (size_t i = after; i < totalSize; i++) {
      crc ^= p[i];
      for (uint8_t b = 0; b < 8; b++) {
        crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
      }
    }
  }
  return crc;
}

static uint16_t mvStoreCrc(const MvDeviceConfig* cfg) {
  return mvStoreCrcStruct(cfg, sizeof(MvDeviceConfig), offsetof(MvDeviceConfig, crc));
}

static void mvStoreFinalize(MvDeviceConfig* cfg) {
  if (!cfg) return;
  cfg->magic = MV_STORE_MAGIC;
  cfg->version = MV_STORE_VERSION;
  memset(cfg->reserved, 0, sizeof(cfg->reserved));
  const size_t tail = offsetof(MvDeviceConfig, globalSiteKey) + sizeof(cfg->globalSiteKey);
  if (sizeof(MvDeviceConfig) > tail) {
    memset(reinterpret_cast<uint8_t*>(cfg) + tail, 0, sizeof(MvDeviceConfig) - tail);
  }
  cfg->crc = mvStoreCrc(cfg);
}

static bool mvStoreValidV1(const MvDeviceConfigV1* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 1) return false;
  return cfg->crc == mvStoreCrcStruct(cfg, sizeof(MvDeviceConfigV1), offsetof(MvDeviceConfigV1, crc));
}

static void mvStoreMigrateV1(const MvDeviceConfigV1* old, MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
  cfg->ethUseDhcp = old->ethUseDhcp;
  cfg->wifiApEnable = old->wifiApEnable;
  strncpy(cfg->wifiApSsid, old->wifiApSsid, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, old->wifiApPass, sizeof(cfg->wifiApPass) - 1);
  memcpy(cfg->ethIp, old->ethIp, sizeof(cfg->ethIp));
  memcpy(cfg->ethGw, old->ethGw, sizeof(cfg->ethGw));
  memcpy(cfg->ethMask, old->ethMask, sizeof(cfg->ethMask));
  memcpy(cfg->ethDns, old->ethDns, sizeof(cfg->ethDns));
  memcpy(cfg->expSlotType, old->expSlotType, sizeof(cfg->expSlotType));
  mvStoreFinalize(cfg);
}

static bool mvStoreValidV2(const MvDeviceConfigV2* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 2) return false;
  return cfg->crc == mvStoreCrcStruct(cfg, sizeof(MvDeviceConfigV2), offsetof(MvDeviceConfigV2, crc));
}

struct MvDeviceConfigV3 {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint8_t ethUseDhcp;
  uint8_t wifiApEnable;
  uint8_t reserved[2];
  char wifiApSsid[24];
  char wifiApPass[24];
  uint8_t ethIp[4];
  uint8_t ethGw[4];
  uint8_t ethMask[4];
  uint8_t ethDns[4];
  uint8_t expSlotType[MV_EXP_SLOTS];
  char mqttBrokerHost[16];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t deviceMode;
};

struct MvDeviceConfigV4 {
  uint32_t magic;
  uint16_t version;
  uint16_t crc;
  uint8_t ethUseDhcp;
  uint8_t wifiApEnable;
  uint8_t reserved[2];
  char wifiApSsid[24];
  char wifiApPass[24];
  uint8_t ethIp[4];
  uint8_t ethGw[4];
  uint8_t ethMask[4];
  uint8_t ethDns[4];
  uint8_t expSlotType[MV_EXP_SLOTS];
  char mqttBrokerHost[16];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t deviceMode;
  uint16_t globalSiteKey;
};

static bool mvStoreValidV4(const MvDeviceConfigV4* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 4) return false;
  return cfg->crc == mvStoreCrcStruct(cfg, sizeof(MvDeviceConfigV4), offsetof(MvDeviceConfigV4, crc));
}

static void mvStoreMigrateV4(const MvDeviceConfigV4* old, MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
  cfg->ethUseDhcp = old->ethUseDhcp;
  cfg->wifiApEnable = old->wifiApEnable;
  strncpy(cfg->wifiApSsid, old->wifiApSsid, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, old->wifiApPass, sizeof(cfg->wifiApPass) - 1);
  memcpy(cfg->ethIp, old->ethIp, sizeof(cfg->ethIp));
  memcpy(cfg->ethGw, old->ethGw, sizeof(cfg->ethGw));
  memcpy(cfg->ethMask, old->ethMask, sizeof(cfg->ethMask));
  memcpy(cfg->ethDns, old->ethDns, sizeof(cfg->ethDns));
  memcpy(cfg->expSlotType, old->expSlotType, sizeof(cfg->expSlotType));
  strncpy(cfg->mqttBrokerHost, old->mqttBrokerHost, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerPort = old->mqttBrokerPort;
  cfg->mqttBrokerSet = old->mqttBrokerSet;
  cfg->deviceMode = old->deviceMode;
  cfg->globalSiteKey = old->globalSiteKey;
  mvStoreFinalize(cfg);
}

static bool mvStoreValidV3(const MvDeviceConfigV3* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 3) return false;
  return cfg->crc == mvStoreCrcStruct(cfg, sizeof(MvDeviceConfigV3), offsetof(MvDeviceConfigV3, crc));
}

static void mvStoreMigrateV3(const MvDeviceConfigV3* old, MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
  cfg->ethUseDhcp = old->ethUseDhcp;
  cfg->wifiApEnable = old->wifiApEnable;
  strncpy(cfg->wifiApSsid, old->wifiApSsid, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, old->wifiApPass, sizeof(cfg->wifiApPass) - 1);
  memcpy(cfg->ethIp, old->ethIp, sizeof(cfg->ethIp));
  memcpy(cfg->ethGw, old->ethGw, sizeof(cfg->ethGw));
  memcpy(cfg->ethMask, old->ethMask, sizeof(cfg->ethMask));
  memcpy(cfg->ethDns, old->ethDns, sizeof(cfg->ethDns));
  memcpy(cfg->expSlotType, old->expSlotType, sizeof(cfg->expSlotType));
  strncpy(cfg->mqttBrokerHost, old->mqttBrokerHost, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerPort = old->mqttBrokerPort;
  cfg->mqttBrokerSet = old->mqttBrokerSet;
  cfg->deviceMode = old->deviceMode;
  cfg->globalSiteKey = 1;
  mvStoreFinalize(cfg);
}

static void mvStoreMigrateV2(const MvDeviceConfigV2* old, MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
  cfg->ethUseDhcp = old->ethUseDhcp;
  cfg->wifiApEnable = old->wifiApEnable;
  strncpy(cfg->wifiApSsid, old->wifiApSsid, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, old->wifiApPass, sizeof(cfg->wifiApPass) - 1);
  memcpy(cfg->ethIp, old->ethIp, sizeof(cfg->ethIp));
  memcpy(cfg->ethGw, old->ethGw, sizeof(cfg->ethGw));
  memcpy(cfg->ethMask, old->ethMask, sizeof(cfg->ethMask));
  memcpy(cfg->ethDns, old->ethDns, sizeof(cfg->ethDns));
  memcpy(cfg->expSlotType, old->expSlotType, sizeof(cfg->expSlotType));
  strncpy(cfg->mqttBrokerHost, old->mqttBrokerHost, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerPort = old->mqttBrokerPort;
  cfg->mqttBrokerSet = old->mqttBrokerSet;
  cfg->deviceMode = MV_DEVICE_STANDALONE;
  cfg->globalSiteKey = 1;
  mvStoreFinalize(cfg);
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
  cfg->mqttBrokerPort = 1883;
  cfg->mqttBrokerSet = 0;
  cfg->deviceMode = MV_DEVICE_STANDALONE;
  cfg->globalSiteKey = 1;
  mvStoreFinalize(cfg);
}

static bool mvStoreValid(const MvDeviceConfig* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != MV_STORE_VERSION) return false;
  return cfg->crc == mvStoreCrcStruct(cfg, sizeof(MvDeviceConfig), offsetof(MvDeviceConfig, crc));
}

static bool mvStoreLoadCurrent(MvDeviceConfig* cfg, MvDeviceConfig* tmp, size_t actual) {
  if (!cfg || !tmp || actual != sizeof(MvDeviceConfig)) return false;
  if (tmp->magic != MV_STORE_MAGIC || tmp->version != MV_STORE_VERSION) return false;
  memcpy(cfg, tmp, sizeof(*cfg));
  const uint16_t storedCrc = cfg->crc;
  mvStoreFinalize(cfg);
  g_loaded = true;
  memcpy(&g_active, cfg, sizeof(g_active));
  if (storedCrc != cfg->crc) {
    MV_LOG_CMD("mv_setup KV repaired (crc)");
    mvStoreSave(cfg);
  }
  return true;
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
  if (kv_get(MV_KV_KEY, &tmp, sizeof(tmp), &actual) == 0 && actual == sizeof(tmp)) {
    if (mvStoreValid(&tmp)) {
      memcpy(cfg, &tmp, sizeof(tmp));
      g_loaded = true;
      memcpy(&g_active, cfg, sizeof(g_active));
      return true;
    }
    if (tmp.magic == MV_STORE_MAGIC && tmp.version == MV_STORE_VERSION) {
      if (mvStoreLoadCurrent(cfg, &tmp, actual)) return true;
    }
  }
  MvDeviceConfigV1 old;
  actual = 0;
  if (kv_get(MV_KV_KEY, &old, sizeof(old), &actual) == 0 && actual == sizeof(old) && mvStoreValidV1(&old)) {
    mvStoreMigrateV1(&old, cfg);
    g_loaded = true;
    memcpy(&g_active, cfg, sizeof(g_active));
    mvStoreSave(cfg);
    return true;
  }
  MvDeviceConfigV2 old2;
  actual = 0;
  if (kv_get(MV_KV_KEY, &old2, sizeof(old2), &actual) == 0 && actual == sizeof(old2) && mvStoreValidV2(&old2)) {
    mvStoreMigrateV2(&old2, cfg);
    g_loaded = true;
    memcpy(&g_active, cfg, sizeof(g_active));
    mvStoreSave(cfg);
    return true;
  }
  MvDeviceConfigV4 old4;
  actual = 0;
  if (kv_get(MV_KV_KEY, &old4, sizeof(old4), &actual) == 0 && actual == sizeof(old4) && mvStoreValidV4(&old4)) {
    mvStoreMigrateV4(&old4, cfg);
    g_loaded = true;
    memcpy(&g_active, cfg, sizeof(g_active));
    mvStoreSave(cfg);
    return true;
  }
  MvDeviceConfigV3 old3;
  actual = 0;
  if (kv_get(MV_KV_KEY, &old3, sizeof(old3), &actual) == 0 && actual == sizeof(old3) && mvStoreValidV3(&old3)) {
    mvStoreMigrateV3(&old3, cfg);
    g_loaded = true;
    memcpy(&g_active, cfg, sizeof(g_active));
    mvStoreSave(cfg);
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
  mvStoreFinalize(&tmp);
  memcpy(&g_active, &tmp, sizeof(g_active));
  g_loaded = true;
#ifdef MV_HAS_KV
  const int rc = kv_set(MV_KV_KEY, &tmp, sizeof(tmp), 0);
  if (rc != 0) {
    MV_LOG_CMD2("kv_set mv_setup failed rc=", rc);
    return false;
  }
#else
  (void)0;
#endif
  if (g_onChanged) g_onChanged(&g_active);
  return true;
}

const MvDeviceConfig* mvStoreActive() {
  if (!g_loaded) mvStoreLoad(&g_active);
  return &g_active;
}

const char* mvDeviceModeString(uint8_t mode) {
  return mode == MV_DEVICE_REMOTE_IO ? "remote_io" : "standalone";
}

uint8_t mvDeviceModeActive() {
  const MvDeviceConfig* cfg = mvStoreActive();
  return cfg ? cfg->deviceMode : MV_DEVICE_STANDALONE;
}

bool mvDeviceModeRemoteIo() {
  return mvDeviceModeActive() == MV_DEVICE_REMOTE_IO;
}

bool mvDeviceModeSet(uint8_t mode) {
  if (mode != MV_DEVICE_STANDALONE && mode != MV_DEVICE_REMOTE_IO) return false;
  MvDeviceConfig cfg;
  mvStoreLoad(&cfg);
  if (cfg.deviceMode == mode) return true;
  cfg.deviceMode = mode;
  return mvStoreSave(&cfg);
}
