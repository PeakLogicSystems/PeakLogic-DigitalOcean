/*
 * MooreVIEW ST runtime for Arduino Opta (Ethernet HTTP API + WiFi setup GUI).
 */
#include <Arduino.h>
#include <Ethernet.h>
#include <ArduinoJson.h>
#include "mv_config.h"
#include "mv_store.h"
#include "mv_setup_web.h"
#include "mv_wifi.h"
#include "mv_expansions.h"
#include "mv_io.h"
#include "mv_tags.h"
#include "mv_st.h"

#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
#include <EthernetWebServer.h>
EthernetWebServer server(MV_HTTP_PORT);
#else
#include <EthernetServer.h>
EthernetServer server(MV_HTTP_PORT);
#endif

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static MvDeviceConfig g_cfg;
static bool g_runtimeRunning = false;
static uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
static uint32_t g_lastScanMs = 0;
static uint32_t g_cycles = 0;
static uint32_t g_lastCycleUs = 0;

static void sendJson(int code, const JsonDocument& doc) {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
#else
  (void)code;
  (void)doc;
#endif
}

static void sendJsonCStr(int code, const char* json) {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  server.send(code, "application/json", json);
#else
  (void)code;
  (void)json;
#endif
}

static void handleStatus() {
  StaticJsonDocument<768> doc;
  doc["ok"] = true;
  doc["device"] = "mooreview-opta-st";
  doc["running"] = g_runtimeRunning;
  doc["scanMs"] = g_scanMs;
  doc["cycles"] = g_cycles;
  doc["lastCycleUs"] = g_lastCycleUs;
  doc["programLoaded"] = mvProgramValid();
  doc["programError"] = mvLastProgramError();
  doc["ethIp"] = Ethernet.localIP().toString();
  doc["wifiAp"] = mvWifiApActive();
  doc["wifiApIp"] = mvWifiApIp().toString();
  doc["expansions"] = mvExpDetectedCount();
  sendJson(200, doc);
}

static void handleTags() {
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  mvTagsToJson(tags);
  doc["ok"] = true;
  sendJson(200, doc);
}

static void handleOutputs() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  if (!server.hasArg("plain")) {
    sendJsonCStr(400, "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    sendJsonCStr(400, "{\"error\":\"invalid json\"}");
    return;
  }
  JsonObject outputs = doc["outputs"].as<JsonObject>();
  for (JsonPair kv : outputs) {
    if (kv.value().is<bool>()) mvSetBool(kv.key().c_str(), kv.value().as<bool>());
    else if (kv.value().is<int>()) mvSetInt(kv.key().c_str(), kv.value().as<int>());
    else mvSetReal(kv.key().c_str(), kv.value().as<float>());
  }
  mvWritePhysicalOutputs();
  mvExpWriteOutputs();
  sendJsonCStr(200, "{\"ok\":true}");
#else
  sendJsonCStr(501, "{\"error\":\"web server requires Opta board package\"}");
#endif
}

static void handleProgramPut() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  if (!server.hasArg("plain")) {
    sendJsonCStr(400, "{\"error\":\"missing body\"}");
    return;
  }
  String body = server.arg("plain");
  if ((size_t)body.length() >= MV_PROGRAM_JSON_MAX) {
    sendJsonCStr(413, "{\"error\":\"program too large\"}");
    return;
  }
  DynamicJsonDocument doc(MV_PROGRAM_JSON_MAX);
  if (deserializeJson(doc, body)) {
    sendJsonCStr(400, "{\"error\":\"invalid json\"}");
    return;
  }
  if (!mvProgramLoad(doc.as<JsonObject>())) {
    StaticJsonDocument<256> err;
    err["ok"] = false;
    err["error"] = mvLastProgramError();
    sendJson(400, err);
    return;
  }
  sendJsonCStr(200, "{\"ok\":true}");
#else
  sendJsonCStr(501, "{\"error\":\"web server requires Opta board package\"}");
#endif
}

static void runOneScan(uint32_t dtMs) {
  unsigned long t0 = micros();
  mvExecuteScan(dtMs);
  g_lastCycleUs = micros() - t0;
  g_cycles++;
}

static void handleScan() {
  uint32_t dt = g_scanMs;
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  if (server.hasArg("plain")) {
    StaticJsonDocument<128> req;
    if (!deserializeJson(req, server.arg("plain"))) {
      dt = req["scanMs"] | g_scanMs;
    }
  }
#endif
  runOneScan(dt);
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  mvTagsToJson(tags);
  doc["ok"] = true;
  doc["errors"] = JsonArray();
  sendJson(200, doc);
}

static void handleRuntimeStart() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  if (server.hasArg("plain")) {
    StaticJsonDocument<128> req;
    if (!deserializeJson(req, server.arg("plain"))) {
      g_scanMs = req["scanMs"] | MV_SCAN_MS_DEFAULT;
    }
  }
#endif
  mvOneShotReset();
  g_runtimeRunning = true;
  g_lastScanMs = millis();
  sendJsonCStr(200, "{\"ok\":true,\"running\":true}");
}

static void handleRuntimeStop() {
  g_runtimeRunning = false;
  sendJsonCStr(200, "{\"ok\":true,\"running\":false}");
}

static void routeHttp() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  mvSetupRegisterRoutes();
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/tags", HTTP_GET, handleTags);
  server.on("/api/tags/outputs", HTTP_POST, handleOutputs);
  server.on("/api/program", HTTP_PUT, handleProgramPut);
  server.on("/api/scan", HTTP_POST, handleScan);
  server.on("/api/runtime/start", HTTP_POST, handleRuntimeStart);
  server.on("/api/runtime/stop", HTTP_POST, handleRuntimeStop);
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"error\":\"not found\"}");
  });
#endif
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  mvStoreLoad(&g_cfg);
  mvIoBegin();
  mvTagsBegin();
  mvExpBegin();
  mvExpApplyConfig(&g_cfg);
  mvExpEnsureTags();

  mvEthBegin(&g_cfg, mac);
  mvWifiBegin(&g_cfg);

  routeHttp();
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  server.begin();
#endif

  Serial.print("MooreVIEW Opta Ethernet http://");
  Serial.println(Ethernet.localIP());
  if (mvWifiApActive()) {
    Serial.print("Setup WiFi AP http://");
    Serial.print(mvWifiApIp());
    Serial.print(":");
    Serial.println(MV_WIFI_HTTP_PORT);
  }
}

void loop() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  server.handleClient();
#endif
  mvWifiHandleClients();

  if (g_runtimeRunning) {
    unsigned long now = millis();
    if (now - g_lastScanMs >= g_scanMs) {
      runOneScan(now - g_lastScanMs);
      g_lastScanMs = now;
    }
  }
}
