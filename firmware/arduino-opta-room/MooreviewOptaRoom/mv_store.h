#pragma once
#include <Arduino.h>

#define MV_STORE_MAGIC 0x4D564F31u
#define MV_STORE_VERSION 5
#define MV_EXP_SLOTS 5

enum MvDeviceMode : uint8_t {
  MV_DEVICE_STANDALONE = 0,
  MV_DEVICE_REMOTE_IO = 1,
};

enum MvExpType : uint8_t {
  MV_EXP_AUTO = 0,
  MV_EXP_NONE = 1,
  MV_EXP_D1608E = 2,  // AFX00005
  MV_EXP_A0602 = 3,   // AFX00007
};

struct MvDeviceConfig {
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

  /** Non-empty when mqttBrokerSet — persisted MQTT Parc broker (not 127.0.0.1). */
  char mqttBrokerHost[32];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  /** MV_DEVICE_STANDALONE or MV_DEVICE_REMOTE_IO */
  uint8_t deviceMode;
  /** Admin-assigned global site key for P2P globals (1–65535, default 1). */
  uint16_t globalSiteKey;
};

void mvStoreDefaults(MvDeviceConfig* cfg);
bool mvStoreLoad(MvDeviceConfig* cfg);
bool mvStoreSave(const MvDeviceConfig* cfg);
const MvDeviceConfig* mvStoreActive();
typedef void (*MvStoreChangedFn)(const MvDeviceConfig* cfg);
void mvStoreSetOnChanged(MvStoreChangedFn fn);

bool mvDeviceModeRemoteIo();
uint8_t mvDeviceModeActive();
const char* mvDeviceModeString(uint8_t mode);
bool mvDeviceModeSet(uint8_t mode);
