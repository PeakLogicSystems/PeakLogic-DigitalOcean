#pragma once
#include <Arduino.h>

#define MV_STORE_MAGIC 0x4D564F31u
#define MV_STORE_VERSION 5
#define MV_EXP_SLOTS 5
/** Includes NUL. openssl rand -hex 32 is 64 chars; keep headroom under MQTT CONNECT limits. */
#define MV_MQTT_PASSWORD_SIZE 80

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
  char mqttBrokerHost[64];
  uint16_t mqttBrokerPort;
  uint8_t mqttBrokerSet;
  uint8_t mqttAuthSet;
  char mqttUsername[32];
  char mqttPassword[MV_MQTT_PASSWORD_SIZE];
  uint16_t globalSiteKey;
  /** A0602 slot: 1 = configure all 8 channels as 2-wire PT100 RTD (beginChannelAsRtd). */
  uint8_t a0602RtdEnable;
  /** 1 = MQTT over TLS (port 8883). Occupies former reservedPad[0] — V3 CRC unchanged when 0. */
  uint8_t mqttUseTls;
  uint8_t reservedPad[2];
  /** Device→host MQTT Parc telemetry interval (ms). 0 = use firmware default. */
  uint32_t reportMs;
};

#define MV_DEVICE_STANDALONE 0
#define MV_DEVICE_REMOTE_IO 1

const char* mvDeviceModeString(uint8_t mode);
uint8_t mvDeviceModeActive();
bool mvDeviceModeRemoteIo();
bool mvDeviceModeSet(uint8_t mode);

void mvStoreDefaults(MvDeviceConfig* cfg);
bool mvStoreLoad(MvDeviceConfig* cfg);
bool mvStoreSave(const MvDeviceConfig* cfg);
const MvDeviceConfig* mvStoreActive();
