#pragma once
#include <Arduino.h>
#include "pl_store.h"

bool plWifiBegin(const PlDeviceConfig* cfg);
bool plWifiApActive();
IPAddress plWifiApIp();
void plWifiHandleClients();

#if defined(ARDUINO_OPTA) && __has_include(<WiFi.h>)
#define PL_HAS_WIFI 1
#endif
