#include "mv_http.h"
#include "mv_config.h"
#include "mv_eth.h"
#include "mv_ota.h"
#include "mv_debug.h"
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

#define MV_HTTP_MAX_ROUTES 40
#define MV_HTTP_PATH_MAX 64
#define MV_HTTP_METHOD_MAX 8

struct MvHttpRoute {
  char method[MV_HTTP_METHOD_MAX];
  char path[MV_HTTP_PATH_MAX];
  MvHttpHandler handler;
};

static EthernetServer g_httpServer(MV_HTTP_PORT);
static MvHttpRoute g_routes[MV_HTTP_MAX_ROUTES];
static uint8_t g_routeCount = 0;
/** Mbed Opta: EthernetClient must outlive loop() — local scope closes the TCP socket. */
static EthernetClient g_httpClient;
static bool g_httpClientActive = false;
static unsigned long g_httpAcceptMs = 0;

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
  mvHttpSendResponse(client, code, contentType, String(body ? body : ""));
}

bool mvHttpAddRoute(const char* method, const char* path, MvHttpHandler handler) {
  if (!method || !path || !handler || g_routeCount >= MV_HTTP_MAX_ROUTES) return false;
  MvHttpRoute* r = &g_routes[g_routeCount++];
  strncpy(r->method, method, sizeof(r->method) - 1);
  strncpy(r->path, path, sizeof(r->path) - 1);
  r->handler = handler;
  MV_LOG2("route ", path);
  return true;
}

void mvHttpBegin(uint16_t port) {
  (void)port;
  g_httpServer.begin();
}

static bool readExact(Stream& client, uint8_t* buf, size_t len) {
  size_t got = 0;
  unsigned long deadline = millis() + 60000;
  while (got < len) {
    if (client.available()) {
      int b = client.read();
      if (b < 0) return false;
      buf[got++] = (uint8_t)b;
    } else if (millis() > deadline) {
      return false;
    } else {
      delay(1);
    }
  }
  return true;
}

bool mvHttpReadBytes(Stream& client, uint8_t* buf, size_t len) {
  return readExact(client, buf, len);
}

static MvHttpHandler findRoute(const String& method, const String& path) {
  for (uint8_t i = 0; i < g_routeCount; i++) {
    if (method.equalsIgnoreCase(g_routes[i].method) && path == g_routes[i].path) {
      return g_routes[i].handler;
    }
  }
  return nullptr;
}

/** Read HTTP headers using Opta mbed pattern (available + connected loop). */
static bool mvHttpReadHeaders(EthernetClient& client, String& reqLine, String& headerBlock) {
  String currentLine;
  bool currentLineIsBlank = true;
  bool gotReqLine = false;
  const unsigned long deadline = millis() + 12000;

  /* Do not use client.connected() on Opta mbed — it can be false while data is in flight. */
  while (millis() < deadline) {
    if (!client.available()) {
      delay(1);
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

static void mvHttpServeClient(EthernetClient& client) {
  if (!client) return;

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

  const size_t contentLength = (size_t)mvHttpHeader(headerBlock, "Content-Length").toInt();
  MV_LOG2(method, path);
  if (contentLength > 0) MV_LOG2("  body bytes=", (int)contentLength);

  if (method == "POST" && path == "/api/firmware" && contentLength > 0) {
    mvOtaHandleHttpFirmwarePost(client, headerBlock, contentLength);
    delay(1);
    client.stop();
    return;
  }

  if (contentLength > (size_t)MV_PROGRAM_JSON_MAX + 1024) {
    mvHttpSendResponseCStr(client, 413, "application/json", "{\"error\":\"body too large\"}");
    delay(1);
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
        delay(1);
        client.stop();
        return;
      }
      body.concat(reinterpret_cast<const char*>(buf), chunk);
      remaining -= chunk;
    }
  }

  MvHttpHandler handler = findRoute(method, path);
  if (handler) {
    handler(client, method, path, body, headerBlock);
  } else {
    mvHttpSendResponseCStr(client, 404, "application/json", "{\"error\":\"not found\"}");
  }

  delay(1);
  client.stop();
}

void mvHttpHandleClients() {
  if (!g_httpClientActive) {
    /* Assign directly — a local EthernetClient temp closes the socket on Opta mbed. */
    g_httpClient = g_httpServer.available();
    if (!g_httpClient) return;
    g_httpClientActive = true;
    g_httpAcceptMs = millis();
    MV_LOG("HTTP client accepted");
    return;
  }

  if (!g_httpClient.available()) {
    if (millis() - g_httpAcceptMs > 15000) {
      MV_LOG("HTTP accept wait timeout");
      g_httpClient.stop();
      g_httpClientActive = false;
    }
    return;
  }

  mvHttpServeClient(g_httpClient);
  g_httpClient.stop();
  g_httpClientActive = false;
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

void mvHttpBegin(uint16_t) {}

bool mvHttpReadBytes(Stream&, uint8_t*, size_t) { return false; }

#endif
