#pragma once

#include <ArduinoJson.h>

#ifndef MV_PROTOCOL_VERSION
#define MV_PROTOCOL_VERSION 2
#endif

#ifndef MV_FIRMWARE_VERSION
/* PeakLogic Opta Room — separate product from arduino-opta-mqtt-st.
   1.0.0: room integration controller — aggregate Shelly Flood Gen4 WiFi peripherals
   (slotted SHELLY<n>_* tags via /api/peripheral/shelly?dev=n), PARC over Ethernet. */
#define MV_FIRMWARE_VERSION "1.0.0"
#endif

void mvVersionAppendStatus(JsonObject obj);
bool mvCheckClientProtocol(int clientProtocol, const char* clientVersion, char* errOut, size_t errLen);
