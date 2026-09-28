#include "mv_http.h"
#include "mv_config.h"
#include "mv_eth.h"
#include "mv_ota.h"
#include "mv_watchdog.h"
#include "mv_debug.h"
#include <Client.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

#ifdef MV_HAS_WIFI
#include <WiFi.h>
#include <WiFiServer.h>
#endif

#define MV_HTTP_MAX_ROUTES 64
#define MV_HTTP_PATH_MAX 64
#define MV_HTTP_METHOD_MAX 8
/** Parallel browser tabs open several TCP connections at once. */
#define MV_HTTP_MAX_CLIENTS 6

struct MvHttpRoute {
  char method[MV_HTTP_METHOD_MAX];
  char path[MV_HTTP_PATH_MAX];
  MvHttpHandler handler;
};

struct MvHttpClientSlot {
  EthernetClient client;
  bool active;
  unsigned long acceptMs;
};

static EthernetServer g_httpServer(MV_HTTP_PORT);
static MvHttpRoute g_routes[MV_HTTP_MAX_ROUTES];
static uint8_t g_routeCount = 0;
static MvHttpClientSlot g_httpClients[MV_HTTP_MAX_CLIENTS];
/** True while a request handler runs — blocks MQTT TLS until the HTTP socket is released. */
static bool g_httpServing = false;
static unsigned long g_httpLastActivityMs = 0;
/** Drop accepted clients that never send a request (browser opens many parallel TCP connections). */
static const unsigned long MV_HTTP_ACCEPT_WAIT_MS = 1500;
static const unsigned long MV_HTTP_HEADER_WAIT_MS = 4000;
/** Serve one request per pump so MQTT / ST loop stay responsive. */
static const uint8_t MV_HTTP_SERVE_MAX_PER_PUMP = 1;

#ifdef MV_HAS_WIFI
struct MvHttpWifiClientSlot {
  WiFiClient client;
  bool active;
  unsigned long acceptMs;
};

static WiFiServer* g_wifiHttpServer = nullptr;
static MvHttpWifiClientSlot g_wifiHttpClients[MV_HTTP_MAX_CLIENTS];
#endif

String mvHttpHeader(const String& headerBlock, const char* name) {
  if (!name || !name[0]) return String();
  String needle = String(name) + ":";
  int start = 0;
  while (start < (int)headerBlock.length()) {
    int end = headerBlock.indexOf('\n', start);
    if (end < 0) end = headerBlock.length();
    String line = headerBlock.substring(start, end);
    line.trim();
    if (line.startsWith(needle)) {
      String val = line.substring(needle.length());
      val.trim();
      return val;
    }
    start = end + 1;
  }
  return String();
}

void mvHttpSendResponse(Stream& client, int code, const char* contentType, const String& body) {
  client.print("HTTP/1.1 ");
  client.print(code);
  client.println(code == 200 ? " OK" : " ERROR");
  client.println("Connection: close");
  client.print("Content-Type: ");
  client.println(contentType);
  client.print("Content-Length: ");
  client.println(body.length());
  client.println();
  client.print(body);
}

void mvHttpSendResponseCStr(Stream& client, int code, const char* contentType, const char* body) {
  /* Stream from flash/RO data — do not wrap in Arduino String (large HTML OOMs → blank Chrome page). */
  const char* p = body ? body : "";
  const size_t len = strlen(p);
  client.print("HTTP/1.1 ");
  client.print(code);
  client.println(code == 200 ? " OK" : " ERROR");
  client.println("Connection: close");
  client.print("Content-Type: ");
  client.println(contentType && contentType[0] ? contentType : "text/plain");
  client.print("Content-Length: ");
  client.println((unsigned long)len);
  client.println();
  const size_t chunk = 512;
  for (size_t off = 0; off < len; off += chunk) {
    const size_t n = (len - off) > chunk ? chunk : (len - off);
    client.write(reinterpret_cast<const uint8_t*>(p + off), n);
  }
  client.flush();
}

bool mvHttpAddRoute(const char* method, const char* path, MvHttpHandler handler) {
  if (!method || !path || !handler) return false;
  if (g_routeCount >= MV_HTTP_MAX_ROUTES) {
    MV_LOG2("HTTP route table full, skipped ", path);
    return false;
  }
  MvHttpRoute* r = &g_routes[g_routeCount++];
  strncpy(r->method, method, sizeof(r->method) - 1);
  strncpy(r->path, path, sizeof(r->path) - 1);
  r->handler = handler;
  MV_LOG2("route ", path);
  return true;
}

uint8_t mvHttpRouteCount() { return g_routeCount; }

void mvHttpBegin(uint16_t port) {
  (void)port;
  g_httpServer.begin();
}

static bool readExact(Stream& client, uint8_t* buf, size_t len) {
  size_t got = 0;
  unsigned long deadline = millis() + 8000;
  while (got < len) {
    if (client.available()) {
      int b = client.read();
      if (b < 0) return false;
      buf[got++] = (uint8_t)b;
    } else if (millis() > deadline) {
      return false;
    } else {
      yield();
    }
  }
  return true;
}

bool mvHttpReadBytes(Stream& client, uint8_t* buf, size_t len) {
  return readExact(client, buf, len);
}

static String mvHttpNormalizePath(String path) {
  while (path.length() > 1 && path.endsWith("/")) {
    path.remove(path.length() - 1);
  }
  return path;
}

static MvHttpHandler findRoute(const String& method, const String& path) {
  const String norm = mvHttpNormalizePath(path);
  for (uint8_t i = 0; i < g_routeCount; i++) {
    if (method.equalsIgnoreCase(g_routes[i].method) && norm == g_routes[i].path) {
      return g_routes[i].handler;
    }
  }
  return nullptr;
}

static void mvHttpTouchActivity() { g_httpLastActivityMs = millis(); }

/** Read HTTP headers using Opta mbed pattern (poll available(); never trust connected()). */
static bool mvHttpReadHeaders(Stream& client, String& reqLine, String& headerBlock) {
  String currentLine;
  bool currentLineIsBlank = true;
  bool gotReqLine = false;
  const unsigned long deadline = millis() + MV_HTTP_HEADER_WAIT_MS;

  /* Do not use client.connected() on Opta mbed — it can be false while data is in flight. */
  while (millis() < deadline) {
    if (!client.available()) {
      yield();
      continue;
    }
    const int c = client.read();
    if (c < 0) break;
    if (c == '\r') continue;
    if (c == '\n') {
      if (currentLineIsBlank) {
        return gotReqLine;
      }
      if (!gotReqLine) {
        reqLine = currentLine;
        gotReqLine = true;
      } else {
        headerBlock += currentLine;
        headerBlock += '\n';
      }
      currentLine = "";
      currentLineIsBlank = true;
    } else {
      currentLine += (char)c;
      currentLineIsBlank = false;
    }
  }
  return gotReqLine;
}

static void mvHttpServeClient(arduino::Client& client) {
  if (!client) return;
  mvHttpTouchActivity();

  String reqLine;
  String headerBlock;
  if (!mvHttpReadHeaders(client, reqLine, headerBlock)) {
    MV_LOG("HTTP header read timeout");
    client.stop();
    return;
  }

  int sp1 = reqLine.indexOf(' ');
  int sp2 = reqLine.indexOf(' ', sp1 + 1);
  String method = sp1 > 0 ? reqLine.substring(0, sp1) : "GET";
  String path = sp1 > 0 ? reqLine.substring(sp1 + 1, sp2) : "/";
  const int q = path.indexOf('?');
  if (q >= 0) path = path.substring(0, q);
  path = mvHttpNormalizePath(path);

  const size_t contentLength = (size_t)mvHttpHeader(headerBlock, "Content-Length").toInt();
  MV_LOG2(method, path);
  if (contentLength > 0) MV_LOG2("  body bytes=", (int)contentLength);
  mvWatchdogNoteActivity();

  if (method == "POST" && path == "/api/firmware" && contentLength > 0) {
    mvOtaHandleHttpFirmwarePost(client, headerBlock, contentLength);
    client.stop();
    return;
  }

  if (contentLength > (size_t)MV_PROGRAM_JSON_MAX + 1024) {
    mvHttpSendResponseCStr(client, 413, "application/json", "{\"error\":\"body too large\"}");
    client.stop();
    return;
  }

  String body;
  if (contentLength > 0) {
    body.reserve(contentLength);
    uint8_t buf[512];
    size_t remaining = contentLength;
    while (remaining > 0) {
      const size_t chunk = remaining > sizeof(buf) ? sizeof(buf) : remaining;
      if (!readExact(client, buf, chunk)) {
        MV_LOG2("HTTP body read incomplete got=", (int)body.length());
        StaticJsonDocument<128> err;
        err["error"] = "incomplete body";
        err["expected"] = (uint32_t)contentLength;
        err["got"] = (uint32_t)body.length();
        String out;
        serializeJson(err, out);
        mvHttpSendResponse(client, 400, "application/json", out);
        client.stop();
        return;
      }
      body.concat(reinterpret_cast<const char*>(buf), chunk);
      remaining -= chunk;
    }
  }

  MvHttpHandler handler = findRoute(method, path);
  g_httpServing = true;
  if (handler) {
    handler(client, method, path, body, headerBlock);
  } else {
    mvHttpSendResponseCStr(client, 404, "application/json", "{\"error\":\"not found\"}");
  }
  g_httpServing = false;

  client.flush();
  client.stop();
}

void mvHttpServeConnection(arduino::Client& client) {
  mvHttpServeClient(client);
}

bool mvHttpIsBusy() {
  return g_httpServing;
}

bool mvHttpRecentActivity() {
  return g_httpLastActivityMs != 0
      && (long)(millis() - g_httpLastActivityMs) < 5000;
}

bool mvHttpHasPendingClients() {
  if (g_httpServing) return true;
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    if (g_httpClients[i].active) return true;
  }
#ifdef MV_HAS_WIFI
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    if (g_wifiHttpClients[i].active) return true;
  }
#endif
  return false;
}

#ifdef MV_HAS_WIFI
static int mvHttpWifiFreeSlot() {
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    if (!g_wifiHttpClients[i].active) return (int)i;
  }
  return -1;
}

void mvHttpWifiBegin() {
  if (!g_wifiHttpServer) g_wifiHttpServer = new WiFiServer(MV_WIFI_HTTP_PORT);
  g_wifiHttpServer->begin();
}

void mvHttpWifiEnd() {
  if (g_wifiHttpServer) g_wifiHttpServer->end();
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    if (g_wifiHttpClients[i].active) {
      g_wifiHttpClients[i].client.stop();
      g_wifiHttpClients[i].active = false;
    }
  }
}

void mvHttpHandleWifiClients() {
  if (!g_wifiHttpServer) return;

  const unsigned long now = millis();
  for (;;) {
    const int idx = mvHttpWifiFreeSlot();
    if (idx < 0) break;
    WiFiClient c = g_wifiHttpServer->accept();
    if (!c) break;
    g_wifiHttpClients[idx].client = c;
    g_wifiHttpClients[idx].active = true;
    g_wifiHttpClients[idx].acceptMs = now;
    mvHttpTouchActivity();
    MV_LOG("WiFi HTTP client accepted");
  }

  uint8_t served = 0;
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    MvHttpWifiClientSlot* slot = &g_wifiHttpClients[i];
    if (!slot->active || !slot->client.available()) continue;
    mvHttpServeClient(slot->client);
    slot->active = false;
    if (++served >= MV_HTTP_SERVE_MAX_PER_PUMP) break;
  }

  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    MvHttpWifiClientSlot* slot = &g_wifiHttpClients[i];
    if (!slot->active || slot->client.available()) continue;
    if ((long)(now - slot->acceptMs) > (long)MV_HTTP_ACCEPT_WAIT_MS) {
      MV_LOG("WiFi HTTP accept wait timeout");
      slot->client.stop();
      slot->active = false;
    }
  }
}
#else
void mvHttpWifiBegin() {}
void mvHttpWifiEnd() {}
void mvHttpHandleWifiClients() {}
#endif

static int mvHttpEthFreeSlot() {
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    if (!g_httpClients[i].active) return (int)i;
  }
  return -1;
}

void mvHttpHandleClients() {
  const unsigned long now = millis();
  for (;;) {
    const int idx = mvHttpEthFreeSlot();
    if (idx < 0) break;
    EthernetClient c = g_httpServer.available();
    if (!c) break;
    g_httpClients[idx].client = c;
    g_httpClients[idx].active = true;
    g_httpClients[idx].acceptMs = now;
    mvHttpTouchActivity();
    MV_LOG("HTTP client accepted");
  }

  uint8_t served = 0;
  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    MvHttpClientSlot* slot = &g_httpClients[i];
    if (!slot->active || !slot->client.available()) continue;
    mvHttpServeClient(slot->client);
    slot->active = false;
    if (++served >= MV_HTTP_SERVE_MAX_PER_PUMP) break;
  }

  for (uint8_t i = 0; i < MV_HTTP_MAX_CLIENTS; i++) {
    MvHttpClientSlot* slot = &g_httpClients[i];
    if (!slot->active || slot->client.available()) continue;
    if ((long)(now - slot->acceptMs) > (long)MV_HTTP_ACCEPT_WAIT_MS) {
      MV_LOG("HTTP accept wait timeout");
      slot->client.stop();
      slot->active = false;
    }
  }
}

void mvHttpPumpClients() {
  mvHttpHandleClients();
  mvHttpHandleWifiClients();
}

void mvHttpPumpClients(uint8_t rounds) {
  if (rounds == 0) return;
  do {
    mvHttpPumpClients();
  } while (--rounds);
}

#else

String mvHttpHeader(const String&, const char*) { return String(); }

void mvHttpSendResponse(Stream& client, int code, const char* contentType, const String& body) {
  (void)code;
  (void)contentType;
  (void)body;
  (void)client;
}

void mvHttpSendResponseCStr(Stream& client, int code, const char* contentType, const char* body) {
  (void)client;
  (void)code;
  (void)contentType;
  (void)body;
}

bool mvHttpAddRoute(const char*, const char*, MvHttpHandler) { return false; }

uint8_t mvHttpRouteCount() { return 0; }

void mvHttpServeConnection(arduino::Client&) {}

void mvHttpBegin(uint16_t) {}

bool mvHttpReadBytes(Stream&, uint8_t*, size_t) { return false; }

bool mvHttpIsBusy() { return false; }

bool mvHttpHasPendingClients() { return false; }

bool mvHttpRecentActivity() { return false; }

void mvHttpWifiBegin() {}
void mvHttpWifiEnd() {}
void mvHttpHandleWifiClients() {}

void mvHttpPumpClients() {}

void mvHttpPumpClients(uint8_t) {}

#endif
