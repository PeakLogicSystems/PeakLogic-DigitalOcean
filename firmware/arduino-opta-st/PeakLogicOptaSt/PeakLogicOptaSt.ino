/*
 * PeakLogic ST runtime for Arduino Opta (Ethernet HTTP API + WiFi setup GUI).
 */
#include <Arduino.h>
#include <Ethernet.h>
#include <ArduinoJson.h>
#include "pl_config.h"
#include "pl_store.h"
#include "pl_setup_web.h"
#include "pl_wifi.h"
#include "pl_expansions.h"
#include "pl_io.h"
#include "pl_tags.h"
#include "pl_st.h"

#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
#include <EthernetWebServer.h>
EthernetWebServer server(PL_HTTP_PORT);
#else
#include <EthernetServer.h>
EthernetServer server(PL_HTTP_PORT);
#endif

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static PlDeviceConfig g_cfg;
static bool g_runtimeRunning = false;
static uint32_t g_scanMs = PL_SCAN_MS_DEFAULT;
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
  doc["device"] = "peaklogic-opta-st";
  doc["running"] = g_runtimeRunning;
  doc["scanMs"] = g_scanMs;
  doc["cycles"] = g_cycles;
  doc["lastCycleUs"] = g_lastCycleUs;
  doc["programLoaded"] = plProgramValid();
  doc["programError"] = plLastProgramError();
  doc["ethIp"] = Ethernet.localIP().toString();
  doc["wifiAp"] = plWifiApActive();
  doc["wifiApIp"] = plWifiApIp().toString();
  doc["expansions"] = plExpDetectedCount();
  sendJson(200, doc);
}

static void handleTags() {
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  plTagsToJson(tags);
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
    if (kv.value().is<bool>()) plSetBool(kv.key().c_str(), kv.value().as<bool>());
    else if (kv.value().is<int>()) plSetInt(kv.key().c_str(), kv.value().as<int>());
    else plSetReal(kv.key().c_str(), kv.value().as<float>());
  }
  plWritePhysicalOutputs();
  plExpWriteOutputs();
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
  if ((size_t)body.length() >= PL_PROGRAM_JSON_MAX) {
    sendJsonCStr(413, "{\"error\":\"program too large\"}");
    return;
  }
  DynamicJsonDocument doc(PL_PROGRAM_JSON_MAX);
  if (deserializeJson(doc, body)) {
    sendJsonCStr(400, "{\"error\":\"invalid json\"}");
    return;
  }
  if (!plProgramLoad(doc.as<JsonObject>())) {
    StaticJsonDocument<256> err;
    err["ok"] = false;
    err["error"] = plLastProgramError();
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
  plExecuteScan(dtMs);
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
  plTagsToJson(tags);
  doc["ok"] = true;
  doc["errors"] = JsonArray();
  sendJson(200, doc);
}

static void handleRuntimeStart() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  if (server.hasArg("plain")) {
    StaticJsonDocument<128> req;
    if (!deserializeJson(req, server.arg("plain"))) {
      g_scanMs = req["scanMs"] | PL_SCAN_MS_DEFAULT;
    }
  }
#endif
  plOneShotReset();
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
  plSetupRegisterRoutes();
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

  plStoreLoad(&g_cfg);
  plIoBegin();
  plTagsBegin();
  plExpBegin();
  plExpApplyConfig(&g_cfg);
  plExpEnsureTags();

  plEthBegin(&g_cfg, mac);
  plWifiBegin(&g_cfg);

  routeHttp();
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  server.begin();
#endif

  Serial.print("PeakLogic Opta Ethernet http://");
  Serial.println(Ethernet.localIP());
  if (plWifiApActive()) {
    Serial.print("Setup WiFi AP http://");
    Serial.print(plWifiApIp());
    Serial.print(":");
    Serial.println(PL_WIFI_HTTP_PORT);
  }
}

void loop() {
#if defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)
  server.handleClient();
#endif
  plWifiHandleClients();

  if (g_runtimeRunning) {
    unsigned long now = millis();
    if (now - g_lastScanMs >= g_scanMs) {
      runOneScan(now - g_lastScanMs);
      g_lastScanMs = now;
    }
  }
}
