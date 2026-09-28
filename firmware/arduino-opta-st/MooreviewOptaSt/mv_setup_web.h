#pragma once
#include <Arduino.h>

struct MvDeviceConfig;

bool mvEthBegin(const MvDeviceConfig* cfg, byte* mac);
/** Serial debug: Ethernet DHCP or static address from config / lease. */
void mvEthLogStatus(const MvDeviceConfig* cfg);
void mvSetupRegisterRoutes();
void mvSetupHandleClient(Stream& client);

#ifdef MV_HAS_WIFI
#include <WiFi.h>
void mvSetupHandleClient(WiFiClient& client);
#endif
