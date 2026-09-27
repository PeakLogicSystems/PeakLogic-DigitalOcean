#pragma once
#include <Arduino.h>

struct PlDeviceConfig;

bool plEthBegin(const PlDeviceConfig* cfg, byte* mac);
void plSetupRegisterRoutes();
void plSetupHandleClient(Stream& client);

#ifdef PL_HAS_WIFI
#include <WiFi.h>
void plSetupHandleClient(WiFiClient& client);
#endif
