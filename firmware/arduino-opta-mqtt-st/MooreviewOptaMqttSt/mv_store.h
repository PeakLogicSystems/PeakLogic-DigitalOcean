#pragma once
#include <Arduino.h>

#define MV_STORE_MAGIC 0x4D564F31u
#define MV_STORE_VERSION 1
#define MV_EXP_SLOTS 5

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
};

void mvStoreDefaults(MvDeviceConfig* cfg);
bool mvStoreLoad(MvDeviceConfig* cfg);
bool mvStoreSave(const MvDeviceConfig* cfg);
const MvDeviceConfig* mvStoreActive();
