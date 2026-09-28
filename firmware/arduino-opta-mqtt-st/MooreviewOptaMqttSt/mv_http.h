#pragma once

#include <Arduino.h>
#include <Client.h>

/** Native Opta EthernetServer HTTP router (no third-party EthernetWebServer). */

typedef void (*MvHttpHandler)(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock);

void mvHttpBegin(uint16_t port);
void mvHttpHandleClients();
/** Drain Ethernet + WiFi HTTP clients (call from loop and blocking paths). */
void mvHttpPumpClients();
void mvHttpPumpClients(uint8_t rounds);
/** WiFi AP setup HTTP on port 8080 when MV_HAS_WIFI. */
void mvHttpWifiBegin();
void mvHttpWifiEnd();
void mvHttpHandleWifiClients();
/** True while an HTTP handler is running (large page send). */
bool mvHttpIsBusy();
/** True while any HTTP socket is open (accepted or serving). */
bool mvHttpHasPendingClients();
/** True for a few seconds after the last HTTP accept/serve (defer MQTT TLS). */
bool mvHttpRecentActivity();
bool mvHttpAddRoute(const char* method, const char* path, MvHttpHandler handler);
uint8_t mvHttpRouteCount();
/** Serve one HTTP request on an already-connected client (Ethernet or WiFi). */
void mvHttpServeConnection(arduino::Client& client);
void mvHttpSendResponse(Stream& client, int code, const char* contentType, const String& body);
void mvHttpSendResponseCStr(Stream& client, int code, const char* contentType, const char* body);
String mvHttpHeader(const String& headerBlock, const char* name);
bool mvHttpReadBytes(Stream& client, uint8_t* buf, size_t len);
