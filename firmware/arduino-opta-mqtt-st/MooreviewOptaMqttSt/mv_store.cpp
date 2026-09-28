#include "mv_store.h"
#include "mv_config.h"
#include <stddef.h>
#include <string.h>

static MvDeviceConfig g_active;
static bool g_loaded = false;

#pragma pack(push, 1)
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
  char mqttBrokerHost[32];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint16_t globalSiteKey;
};
#pragma pack(pop)

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
  char mqttBrokerHost[64];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t mqttAuthSet;
  char mqttUsername[32];
  char mqttPassword[48];
  uint16_t globalSiteKey;
};

/** V4 — pre-reportMs firmware (password[80], no device→host interval). */
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
  char mqttBrokerHost[64];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t mqttAuthSet;
  char mqttUsername[32];
  char mqttPassword[MV_MQTT_PASSWORD_SIZE];
  uint16_t globalSiteKey;
  uint8_t a0602RtdEnable;
  uint8_t mqttUseTls;
  uint8_t reservedPad[2];
};

/** V3 — same layout as pre-80-byte password firmware (mqttPassword[48]). */
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
  char mqttBrokerHost[64];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t mqttAuthSet;
  char mqttUsername[32];
  char mqttPassword[48];
  uint16_t globalSiteKey;
  uint8_t a0602RtdEnable;
  uint8_t mqttUseTls;
  uint8_t reservedPad[2];
};

static uint16_t mvStoreCrcBytes(const uint8_t* p, size_t n, size_t skipOff, size_t skipLen) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    if (i >= skipOff && i < skipOff + skipLen) continue;
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

/** CRC over the whole struct, skipping the crc field (not the last 2 bytes). */
static uint16_t mvStoreCrc(const MvDeviceConfig* cfg) {
  return mvStoreCrcBytes((const uint8_t*)cfg, sizeof(MvDeviceConfig),
                         offsetof(MvDeviceConfig, crc), sizeof(cfg->crc));
}

/** Legacy V5 checksum hashed bytes [0, sizeof-2) and included the crc field — always failed after reboot. */
static uint16_t mvStoreCrcLegacyPrefix(const MvDeviceConfig* cfg) {
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

static uint16_t mvStoreCrcV1(const MvDeviceConfigV1* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  size_t n = sizeof(MvDeviceConfigV1) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool mvStoreValidV1(const MvDeviceConfigV1* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 1) return false;
  return cfg->crc == mvStoreCrcV1(cfg);
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
  strncpy(cfg->mqttBrokerHost, old->mqttBrokerHost, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerPort = old->mqttBrokerPort;
  cfg->mqttBrokerSet = old->mqttBrokerSet;
  cfg->mqttUseTls = (old->mqttBrokerPort == 8883) ? 1 : 0;
  cfg->globalSiteKey = old->globalSiteKey;
  cfg->mqttAuthSet = 0;
  cfg->mqttUsername[0] = '\0';
  cfg->mqttPassword[0] = '\0';
  cfg->crc = mvStoreCrc(cfg);
}

void mvStoreDefaults(MvDeviceConfig* cfg) {
  memset(cfg, 0, sizeof(MvDeviceConfig));
  cfg->magic = MV_STORE_MAGIC;
  cfg->version = MV_STORE_VERSION;
  cfg->ethUseDhcp = 1;
  cfg->wifiApEnable = 0;
  strncpy(cfg->wifiApSsid, MV_WIFI_AP_SSID, sizeof(cfg->wifiApSsid) - 1);
  strncpy(cfg->wifiApPass, MV_WIFI_AP_PASS, sizeof(cfg->wifiApPass) - 1);
  cfg->ethIp[0] = 192; cfg->ethIp[1] = 168; cfg->ethIp[2] = 1; cfg->ethIp[3] = 50;
  cfg->ethGw[0] = 192; cfg->ethGw[1] = 168; cfg->ethGw[2] = 1; cfg->ethGw[3] = 1;
  cfg->ethMask[0] = 255; cfg->ethMask[1] = 255; cfg->ethMask[2] = 255; cfg->ethMask[3] = 0;
  cfg->ethDns[0] = 8; cfg->ethDns[1] = 8; cfg->ethDns[2] = 8; cfg->ethDns[3] = 8;
  for (uint8_t i = 0; i < MV_EXP_SLOTS; i++) cfg->expSlotType[i] = MV_EXP_AUTO;
  strncpy(cfg->mqttBrokerHost, MV_MQTT_SKETCH_BROKER_DEFAULT, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerHost[sizeof(cfg->mqttBrokerHost) - 1] = '\0';
  cfg->mqttBrokerPort = MV_MQTT_SKETCH_PORT_DEFAULT ? MV_MQTT_SKETCH_PORT_DEFAULT : 8883;
  cfg->mqttBrokerSet = cfg->mqttBrokerHost[0] ? 1 : 0;
  cfg->mqttUseTls = MV_MQTT_SKETCH_TLS_DEFAULT ? 1 : 0;
  strncpy(cfg->mqttUsername, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(cfg->mqttUsername) - 1);
  cfg->mqttUsername[sizeof(cfg->mqttUsername) - 1] = '\0';
  strncpy(cfg->mqttPassword, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(cfg->mqttPassword) - 1);
  cfg->mqttPassword[sizeof(cfg->mqttPassword) - 1] = '\0';
  cfg->mqttAuthSet = (cfg->mqttUsername[0] && cfg->mqttPassword[0]) ? 1 : 0;
  cfg->globalSiteKey = 1;
  cfg->a0602RtdEnable = 0;
  cfg->reportMs = MV_REPORT_MS_DEFAULT;
  cfg->crc = mvStoreCrc(cfg);
}

static uint16_t mvStoreCrcV2(const MvDeviceConfigV2* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  size_t n = sizeof(MvDeviceConfigV2) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool mvStoreValidV2(const MvDeviceConfigV2* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 2) return false;
  return cfg->crc == mvStoreCrcV2(cfg);
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
  cfg->mqttUseTls = (old->mqttBrokerPort == 8883) ? 1 : 0;
  cfg->mqttAuthSet = old->mqttAuthSet;
  strncpy(cfg->mqttUsername, old->mqttUsername, sizeof(cfg->mqttUsername) - 1);
  strncpy(cfg->mqttPassword, old->mqttPassword, sizeof(cfg->mqttPassword) - 1);
  cfg->globalSiteKey = old->globalSiteKey;
  cfg->a0602RtdEnable = 0;
  cfg->crc = mvStoreCrc(cfg);
}

static uint16_t mvStoreCrcV3(const MvDeviceConfigV3* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  size_t n = sizeof(MvDeviceConfigV3) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool mvStoreValidV3(const MvDeviceConfigV3* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 3) return false;
  return cfg->crc == mvStoreCrcV3(cfg);
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
  cfg->mqttUseTls = old->mqttUseTls ? 1 : ((old->mqttBrokerPort == 8883) ? 1 : 0);
  cfg->mqttAuthSet = old->mqttAuthSet;
  strncpy(cfg->mqttUsername, old->mqttUsername, sizeof(cfg->mqttUsername) - 1);
  strncpy(cfg->mqttPassword, old->mqttPassword, sizeof(cfg->mqttPassword) - 1);
  cfg->globalSiteKey = old->globalSiteKey;
  cfg->a0602RtdEnable = old->a0602RtdEnable;
  cfg->reportMs = MV_REPORT_MS_DEFAULT;
  cfg->crc = mvStoreCrc(cfg);
}

static uint16_t mvStoreCrcV4(const MvDeviceConfigV4* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  size_t n = sizeof(MvDeviceConfigV4) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool mvStoreValidV4(const MvDeviceConfigV4* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != 4) return false;
  return cfg->crc == mvStoreCrcV4(cfg);
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
  cfg->mqttUseTls = old->mqttUseTls ? 1 : ((old->mqttBrokerPort == 8883) ? 1 : 0);
  cfg->mqttAuthSet = old->mqttAuthSet;
  strncpy(cfg->mqttUsername, old->mqttUsername, sizeof(cfg->mqttUsername) - 1);
  strncpy(cfg->mqttPassword, old->mqttPassword, sizeof(cfg->mqttPassword) - 1);
  cfg->globalSiteKey = old->globalSiteKey;
  cfg->a0602RtdEnable = old->a0602RtdEnable;
  cfg->reportMs = MV_REPORT_MS_DEFAULT;
  cfg->crc = mvStoreCrc(cfg);
}

static bool mvStoreValid(const MvDeviceConfig* cfg) {
  if (!cfg || cfg->magic != MV_STORE_MAGIC || cfg->version != MV_STORE_VERSION) return false;
  return cfg->crc == mvStoreCrc(cfg) || cfg->crc == mvStoreCrcLegacyPrefix(cfg);
}

static bool mvStoreLooksLikeV5(const MvDeviceConfig* cfg) {
  return cfg && cfg->magic == MV_STORE_MAGIC && cfg->version == MV_STORE_VERSION;
}

static void mvStoreApplyCloudMqtt(MvDeviceConfig* cfg) {
  if (!cfg) return;
  strncpy(cfg->mqttBrokerHost, MV_MQTT_SKETCH_BROKER_DEFAULT, sizeof(cfg->mqttBrokerHost) - 1);
  cfg->mqttBrokerHost[sizeof(cfg->mqttBrokerHost) - 1] = '\0';
  cfg->mqttBrokerPort = MV_MQTT_SKETCH_PORT_DEFAULT ? MV_MQTT_SKETCH_PORT_DEFAULT : 8883;
  cfg->mqttBrokerSet = cfg->mqttBrokerHost[0] ? 1 : 0;
  cfg->mqttUseTls = MV_MQTT_SKETCH_TLS_DEFAULT ? 1 : 0;
  strncpy(cfg->mqttUsername, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(cfg->mqttUsername) - 1);
  cfg->mqttUsername[sizeof(cfg->mqttUsername) - 1] = '\0';
  strncpy(cfg->mqttPassword, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(cfg->mqttPassword) - 1);
  cfg->mqttPassword[sizeof(cfg->mqttPassword) - 1] = '\0';
  cfg->mqttAuthSet = (cfg->mqttUsername[0] && cfg->mqttPassword[0]) ? 1 : 0;
}

static bool mvStoreMqttUnconfigured(const MvDeviceConfig* cfg) {
  return !cfg || !cfg->mqttBrokerSet || !cfg->mqttBrokerHost[0];
}

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_HAS_KV 1
static const char* MV_KV_KEY = "/kv/mv_setup";
#endif

bool mvStoreLoad(MvDeviceConfig* cfg) {
  mvStoreDefaults(cfg);
  bool fromNv = false;
  bool rewriteCrc = false;
#ifdef MV_HAS_KV
  {
    uint8_t buf[sizeof(MvDeviceConfig)];
    size_t actual = 0;
    if (kv_get(MV_KV_KEY, buf, sizeof(buf), &actual) == 0 && actual > 0) {
      if (actual == sizeof(MvDeviceConfig)) {
        MvDeviceConfig* tmp = (MvDeviceConfig*)buf;
        /* V5 CRC used to include the crc field, so reboot always dropped NV (site key → 1). */
        if (mvStoreValid(tmp) || mvStoreLooksLikeV5(tmp)) {
          memcpy(cfg, tmp, sizeof(MvDeviceConfig));
          if (cfg->globalSiteKey < 1) cfg->globalSiteKey = 1;
          if (cfg->reportMs < MV_REPORT_MS_MIN || cfg->reportMs > MV_REPORT_MS_MAX) {
            cfg->reportMs = MV_REPORT_MS_DEFAULT;
          }
          fromNv = true;
          rewriteCrc = (tmp->crc != mvStoreCrc(cfg));
        }
      } else if (actual == sizeof(MvDeviceConfigV4)) {
        MvDeviceConfigV4* old = (MvDeviceConfigV4*)buf;
        if (mvStoreValidV4(old)) {
          mvStoreMigrateV4(old, cfg);
          fromNv = true;
        }
      } else if (actual == sizeof(MvDeviceConfigV3)) {
        MvDeviceConfigV3* old = (MvDeviceConfigV3*)buf;
        if (mvStoreValidV3(old)) {
          mvStoreMigrateV3(old, cfg);
          fromNv = true;
        }
      } else if (actual == sizeof(MvDeviceConfigV2)) {
        MvDeviceConfigV2* old = (MvDeviceConfigV2*)buf;
        if (mvStoreValidV2(old)) {
          mvStoreMigrateV2(old, cfg);
          fromNv = true;
        }
      } else if (actual == sizeof(MvDeviceConfigV1)) {
        MvDeviceConfigV1* old = (MvDeviceConfigV1*)buf;
        if (mvStoreValidV1(old)) {
          mvStoreMigrateV1(old, cfg);
          fromNv = true;
        }
      }
    }
  }
#endif
  if (!fromNv || mvStoreMqttUnconfigured(cfg) || rewriteCrc) {
    if (mvStoreMqttUnconfigured(cfg)) mvStoreApplyCloudMqtt(cfg);
    mvStoreSave(cfg);
  }
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
  tmp.crc = 0;
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

const char* mvDeviceModeString(uint8_t mode) {
  (void)mode;
  return "standalone";
}

uint8_t mvDeviceModeActive() {
  return MV_DEVICE_STANDALONE;
}

bool mvDeviceModeRemoteIo() {
  return false;
}

bool mvDeviceModeSet(uint8_t mode) {
  (void)mode;
  return true;
}
