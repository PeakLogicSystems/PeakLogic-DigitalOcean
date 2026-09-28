#pragma once

#include <Arduino.h>

/** Native Opta EthernetServer HTTP router (no third-party EthernetWebServer). */

typedef void (*MvHttpHandler)(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock);

void mvHttpBegin(uint16_t port);
void mvHttpHandleClients();
bool mvHttpAddRoute(const char* method, const char* path, MvHttpHandler handler);
void mvHttpSendResponse(Stream& client, int code, const char* contentType, const String& body);
void mvHttpSendResponseCStr(Stream& client, int code, const char* contentType, const char* body);
String mvHttpHeader(const String& headerBlock, const char* name);
bool mvHttpReadBytes(Stream& client, uint8_t* buf, size_t len);
