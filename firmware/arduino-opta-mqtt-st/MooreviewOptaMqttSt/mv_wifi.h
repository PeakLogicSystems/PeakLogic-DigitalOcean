#pragma once
#include <Arduino.h>
#include "mv_store.h"

bool mvWifiBegin(const MvDeviceConfig* cfg);
bool mvWifiApActive();
IPAddress mvWifiApIp();
void mvWifiHandleClients();

#if defined(ARDUINO_OPTA) && __has_include(<WiFi.h>)
#define MV_HAS_WIFI 1
#endif
