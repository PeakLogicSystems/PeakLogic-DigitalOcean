#pragma once
#include <Arduino.h>
#include "mv_config.h"

struct MvDeviceConfig;

bool mvEthBegin(const MvDeviceConfig* cfg, byte* mac);
/** Serial debug: Ethernet DHCP or static address from config / lease. */
void mvEthLogStatus(const MvDeviceConfig* cfg);
void mvSetupRegisterRoutes();

#ifdef MV_HAS_WIFI
#include <WiFi.h>
void mvSetupHandleClient(WiFiClient& client);
#endif
