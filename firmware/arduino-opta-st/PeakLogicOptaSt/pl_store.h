#pragma once
#include <Arduino.h>

#define PL_STORE_MAGIC 0x4D564F31u
#define PL_STORE_VERSION 1
#define PL_EXP_SLOTS 5

enum PlExpType : uint8_t {
  PL_EXP_AUTO = 0,
  PL_EXP_NONE = 1,
  PL_EXP_D1608E = 2,  // AFX00005
  PL_EXP_A0602 = 3,   // AFX00007
};

struct PlDeviceConfig {
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

  uint8_t expSlotType[PL_EXP_SLOTS];
};

void plStoreDefaults(PlDeviceConfig* cfg);
bool plStoreLoad(PlDeviceConfig* cfg);
bool plStoreSave(const PlDeviceConfig* cfg);
const PlDeviceConfig* plStoreActive();
