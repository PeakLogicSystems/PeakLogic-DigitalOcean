#pragma once

#include <ArduinoJson.h>

#ifndef MV_PROTOCOL_VERSION
#define MV_PROTOCOL_VERSION 2
#endif

#ifndef MV_FIRMWARE_VERSION
#define MV_FIRMWARE_VERSION "2.3.86"
#endif

void mvVersionAppendStatus(JsonObject obj);
bool mvCheckClientProtocol(int clientProtocol, const char* clientVersion, char* errOut, size_t errLen);
