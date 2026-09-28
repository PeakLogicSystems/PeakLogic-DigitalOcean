#pragma once
#include <Arduino.h>
#include "mv_store.h"

bool mvWifiCapable();
bool mvWifiBegin(const MvDeviceConfig* cfg);
bool mvWifiApplyConfig(const MvDeviceConfig* cfg);
void mvWifiStop();
bool mvWifiApActive();
IPAddress mvWifiApIp();
const char* mvWifiLastError();
void mvWifiHandleClients();

#if defined(ARDUINO_OPTA) && __has_include(<WiFi.h>)
#define MV_HAS_WIFI 1
#endif
