#pragma once

#include <ArduinoJson.h>

/** Bump when HTTP/MQTT deploy API changes incompatibly. Keep in sync with est-pc/src/drivers/optaProtocol.js */
#ifndef MV_PROTOCOL_VERSION
#define MV_PROTOCOL_VERSION 1
#endif

/** Keep in sync with est-pc/package.json version */
#ifndef MV_FIRMWARE_VERSION
#define MV_FIRMWARE_VERSION "2.3.7"
#endif

void mvVersionAppendStatus(JsonObject obj);

/** Returns false and writes errOut when client protocolVersion is present and mismatched. */
bool mvCheckClientProtocol(int clientProtocol, const char* clientVersion, char* errOut, size_t errLen);
