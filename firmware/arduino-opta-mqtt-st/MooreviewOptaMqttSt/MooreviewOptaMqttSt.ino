/*
 * MooreVIEW Opta — ST runtime + MQTT fleet (mooreview/v1)
 * ST modules shared with arduino-opta-st; programs deployed via MQTT cmd.
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
#include "mv_mqtt.h"

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
#include <EthernetWebServer.h>
EthernetWebServer server(MV_HTTP_PORT);
#endif

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static MvDeviceConfig g_cfg;
bool g_runtimeRunning = false;
uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
uint32_t g_lastScanMs = 0;
static uint32_t g_cycles = 0;
static uint32_t g_lastCycleUs = 0;

static MvMqttConfig g_mqttCfg = {
  "192.168.1.100",
  1883,
  "opta_st_01",
  "mooreview/v1",
  180000,
};

static void sendJson(int code, const JsonDocument& doc) {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  String out;
  serializeJson(doc, out);
  server.send(code, "application/json", out);
#else
  (void)code;
  (void)doc;
#endif
}

static void sendJsonCStr(int code, const char* json) {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  server.send(code, "application/json", json);
#else
  (void)code;
  (void)json;
#endif
}

static void handleStatus() {
  StaticJsonDocument<768> doc;
  doc["ok"] = true;
  doc["device"] = "mooreview-opta-mqtt-st";
  doc["running"] = g_runtimeRunning;
  doc["scanMs"] = g_scanMs;
  doc["cycles"] = g_cycles;
  doc["lastCycleUs"] = g_lastCycleUs;
  doc["programLoaded"] = mvProgramValid();
  doc["programError"] = mvLastProgramError();
  doc["ethIp"] = Ethernet.localIP().toString();
  doc["mqttConnected"] = mvMqttConnected();
  doc["wifiAp"] = mvWifiApActive();
  sendJson(200, doc);
}

static void handleTags() {
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  mvTagsToJson(tags);
  doc["ok"] = true;
  sendJson(200, doc);
}

static void handleProgramPut() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  if (!server.hasArg("plain")) {
    sendJsonCStr(400, "{\"error\":\"missing body\"}");
    return;
  }
  DynamicJsonDocument doc(MV_PROGRAM_JSON_MAX);
  if (deserializeJson(doc, server.arg("plain"))) {
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
  sendJsonCStr(501, "{\"error\":\"requires Opta\"}");
#endif
}

static void runOneScan(uint32_t dtMs) {
  unsigned long t0 = micros();
  mvExecuteScan(dtMs);
  g_lastCycleUs = micros() - t0;
  g_cycles++;
}

static void handleRuntimeStart() {
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
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvSetupRegisterRoutes();
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/tags", HTTP_GET, handleTags);
  server.on("/api/program", HTTP_PUT, handleProgramPut);
  server.on("/api/runtime/start", HTTP_POST, handleRuntimeStart);
  server.on("/api/runtime/stop", HTTP_POST, handleRuntimeStop);
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
  mvMqttBegin(&g_mqttCfg);

  routeHttp();
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  server.begin();
  Serial.print("MooreVIEW Opta ST+MQTT http://");
  Serial.println(Ethernet.localIP());
#else
  Serial.println("MooreVIEW Opta ST+MQTT (MQTT only — install EthernetWebServer for local HTTP /setup)");
  Serial.print("Ethernet ");
  Serial.println(Ethernet.localIP());
#endif
}

void loop() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  server.handleClient();
#endif
  mvWifiHandleClients();
  mvMqttLoop();

  if (g_runtimeRunning) {
    unsigned long now = millis();
    if (now - g_lastScanMs >= g_scanMs) {
      runOneScan(now - g_lastScanMs);
      g_lastScanMs = now;
    }
  }

  mvMqttMaybePublishTelemetry(g_runtimeRunning, g_scanMs, g_cycles, g_lastCycleUs);
}
