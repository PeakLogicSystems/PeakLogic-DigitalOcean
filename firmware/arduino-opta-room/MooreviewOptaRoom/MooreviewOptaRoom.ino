/*
 * PeakLogic Opta Room — room integration controller + ST + MQTT Parc (peaklogic/v1)
 * Aggregates Shelly Flood Gen4 WiFi peripherals; relays tags over PARC (Ethernet).
 * Base runtime shared with arduino-opta-mqtt-st; room-specific: mv_peripheral.
 */
#include <Arduino.h>
#include "mv_config.h"
#include "mv_eth.h"
#include <ArduinoJson.h>
#include "mv_store.h"
#include "mv_setup_web.h"
#include "mv_http.h"
#include "mv_wifi.h"
#include "mv_expansions.h"
#include "mv_io.h"
#include "mv_tags.h"
#include "mv_st.h"
#include "mv_mqtt.h"
#include "mv_ota.h"
#include "mv_debug.h"
#include "mv_version.h"
#include "mv_device_status.h"
#include "mv_identity.h"
#include "mv_rtc.h"
#include "mv_io_map.h"
#include "mv_program_store.h"
#include "mv_peripheral.h"
#include "mv_store.h"

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static MvDeviceConfig g_cfg;

static void onDeviceConfigSaved(const MvDeviceConfig* cfg) {
  if (!cfg) return;
  memcpy(&g_cfg, cfg, sizeof(g_cfg));
  mvEthApply(&g_cfg, mac);
  mvMqttApplyDeviceConfig(&g_cfg);
  if (cfg->wifiApEnable) {
    mvWifiApplyConfig(&g_cfg);
  } else {
    mvWifiStop();
  }
}
bool g_runtimeRunning = false;
uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
uint32_t g_lastScanMs = 0;
uint32_t g_cycles = 0;
uint32_t g_lastCycleUs = 0;

static MvMqttConfig g_mqttCfg = {
  MV_MQTT_SKETCH_BROKER_DEFAULT,
  1883,
  "opta_st_01",
  "peaklogic/v1",
  2000,
};

static bool g_deferAutoRun = false;
static unsigned long g_autoRunAfterMs = 0;

static void sendJson(Stream& client, int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, code, "application/json", out);
}

static void sendJsonCStr(Stream& client, int code, const char* json) {
  mvHttpSendResponseCStr(client, code, "application/json", json);
}

static void handleStatus(Stream& client, const String& method, const String& path,
                         const String& body, const String& headerBlock) {
  (void)method;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<2048> doc;
  mvFillDeviceStatus(doc.to<JsonObject>());
  sendJson(client, 200, doc);
}

static void handleStatusLite(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<1024> doc;
  mvFillDeviceStatusLite(doc.to<JsonObject>());
  sendJson(client, 200, doc);
}

static void handleTags(Stream& client, const String& method, const String& path,
                       const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  mvTagsToJson(tags);
  doc["ok"] = true;
  sendJson(client, 200, doc);
}

static void handleProgramPut(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    sendJsonCStr(client, 400, "{\"error\":\"missing body\"}");
    return;
  }
  MV_LOG2("HTTP PUT /api/program bytes=", (int)body.length());
  mvProgramInstallSetBusy(true);
  const bool ok = mvProgramLoadFromWireJson(body.c_str(), body.length());
  mvProgramInstallSetBusy(false);
  if (!ok) {
    StaticJsonDocument<256> err;
    err["ok"] = false;
    err["error"] = mvLastProgramError();
    sendJson(client, 400, err);
    return;
  }
  sendJsonCStr(client, 200, "{\"ok\":true}");
}

static void runOneScan(uint32_t dtMs) {
  unsigned long t0 = micros();
  if (mvDeviceModeRemoteIo()) mvExecuteIoScan(dtMs);
  else mvExecuteScan(dtMs);
  g_lastCycleUs = micros() - t0;
  g_cycles++;
}

static void handleRuntimeStart(Stream& client, const String& method, const String& path,
                               const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvOneShotReset();
  g_runtimeRunning = true;
  g_lastScanMs = millis();
  MV_LOG("HTTP POST /api/runtime/start");
  sendJsonCStr(client, 200, "{\"ok\":true,\"running\":true}");
}

static void handleRuntimeStop(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  g_runtimeRunning = false;
  MV_LOG("HTTP POST /api/runtime/stop");
  sendJsonCStr(client, 200, "{\"ok\":true,\"running\":false}");
}

static void handleProgramDelete(Stream& client, const String& method, const String& path,
                                const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  g_runtimeRunning = false;
  mvProgramClear();
  MV_LOG("HTTP DELETE /api/program");
  sendJsonCStr(client, 200, "{\"ok\":true,\"cleared\":true}");
}

static void handleAutoRunGet(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<256> doc;
  doc["ok"] = true;
  doc["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
  doc["programLoaded"] = mvProgramValid();
  doc["programFromNv"] = mvProgramStoreProgramFromNv();
  sendJson(client, 200, doc);
}

static void handleAutoRunPut(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, body)) {
    sendJsonCStr(client, 400, "{\"error\":\"invalid json\"}");
    return;
  }
  if (!doc.containsKey("enabled") && !doc.containsKey("autoRunOnBoot")) {
    sendJsonCStr(client, 400, "{\"error\":\"missing enabled\"}");
    return;
  }
  const bool enabled = doc.containsKey("enabled")
    ? doc["enabled"].as<bool>()
    : doc["autoRunOnBoot"].as<bool>();
  mvProgramStoreSetAutoRun(enabled);
  StaticJsonDocument<128> out;
  out["ok"] = true;
  out["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
  sendJson(client, 200, out);
}

static void registerApiRoutes() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpAddRoute("GET", "/api/status", handleStatus);
  mvHttpAddRoute("GET", "/api/status/lite", handleStatusLite);
  mvHttpAddRoute("GET", "/api/tags", handleTags);
  mvHttpAddRoute("PUT", "/api/program", handleProgramPut);
  mvHttpAddRoute("DELETE", "/api/program", handleProgramDelete);
  mvHttpAddRoute("GET", "/api/program/autorun", handleAutoRunGet);
  mvHttpAddRoute("PUT", "/api/program/autorun", handleAutoRunPut);
  mvHttpAddRoute("POST", "/api/runtime/start", handleRuntimeStart);
  mvHttpAddRoute("POST", "/api/runtime/stop", handleRuntimeStop);
#endif
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  MV_LOG("PeakLogic Opta Room boot (Serial 115200)");
  mvRtcWarnIfUnset();
  MV_LOG_CMD2("firmware ", MV_FIRMWARE_VERSION);

  mvMqttReserveBuffer();

  mvStoreLoad(&g_cfg);
  mvStoreSetOnChanged(onDeviceConfigSaved);
  mvIoBegin();
  mvTagsBegin();
  MV_LOG2("tags at boot=", mvTagCount());
  mvProgramStoreBegin();

  delay(100);
  if (mvIdentityBegin()) {
    g_mqttCfg.deviceId = mvIdentityDeviceId();
    MV_LOG_CMD2("ATECC608 deviceId=", g_mqttCfg.deviceId);
    MV_LOG2("ATECC608 serial=", mvIdentityAteccSerial());
  } else {
    MV_LOG2("ATECC608 status=", mvIdentityAteccStatus());
    MV_LOG("ATECC608 serial unavailable — using default deviceId (install ArduinoECCX08 and reflash)");
  }

  mvEthBegin(&g_cfg, mac);
  delay(300);
  mvEthLogStatus(&g_cfg);
  if (g_cfg.wifiApEnable) {
    if (!mvWifiBegin(&g_cfg)) {
      MV_LOG2("WiFi AP boot failed: ", mvWifiLastError());
    }
  } else if (!mvWifiCapable()) {
    MV_LOG("WiFi AP unavailable — flash with Tools -> Board -> Arduino Opta WiFi");
  }
  mvMqttBegin(&g_mqttCfg, &g_cfg);

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  MV_LOG("HTTP registering routes…");
  mvSetupRegisterRoutes();
  mvIoMapRegisterRoutes();
  registerApiRoutes();
  mvOtaRegisterHttpRoutes();
  MV_LOG("HTTP starting server…");
  mvHttpBegin(MV_HTTP_PORT);
  {
    IPAddress ip = Ethernet.localIP();
    char ipbuf[24];
    snprintf(ipbuf, sizeof(ipbuf), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
    MV_LOG_CMD2("Open setup http://", ipbuf);
  }
#else
  MV_LOG("HTTP disabled on this board");
#endif

  mvProgramStoreRequestBootLoad();
  mvExpBegin();
  mvExpApplyConfig(&g_cfg);
  mvExpEnsureTags();
  MV_LOG2("expansion modules=", mvExpDetectedCount());

  mvPeripheralBegin();

  mvOtaSetRuntimeFlag(&g_runtimeRunning);
  mvOtaBegin();

  if (mvWifiApActive()) {
    MV_LOG2("Room WiFi AP http://", mvWifiApIp().toString() + ":" + String(MV_WIFI_HTTP_PORT));
  }
  MV_LOG_CMD("ready — Opta Room + MQTT Parc");
  if (mvDeviceModeRemoteIo()) {
    g_runtimeRunning = true;
    g_lastScanMs = millis();
    g_scanMs = MV_SCAN_MS_DEFAULT;
    MV_LOG("device mode remote I/O — I/O scan active, ST disabled");
  } else if (mvProgramStoreGetAutoRun()) {
    g_deferAutoRun = true;
    MV_LOG("auto-run deferred until MQTT subscribed");
  }
}

void loop() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvEthMaintainTick(&g_cfg, mac);
  mvHttpEnsureListening();
  for (int i = 0; i < 4; i++) mvHttpHandleClients();
#endif
  mvWifiHandleClients();
  mvPeripheralTick();
  mvMqttLoop();
  mvProgramStoreLoadTick();
  {
    uint8_t drains = 0;
    while (mvMqttCmdPending() && drains < 48) {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
      for (int i = 0; i < 4; i++) mvHttpHandleClients();
#endif
      mvMqttDrainPendingCommand();
      mvMqttLoop();
      drains++;
    }
  }
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  if (mvMqttCmdPending() || mvProgramInstallBusy() || mvProgramStoreSaveBusy() || mvProgramStoreLoadBusy()) {
    for (int i = 0; i < 4; i++) mvHttpHandleClients();
  }
#endif
  mvOtaLoop();
  mvProgramStoreSaveTick();
  mvRtcDrainPending(mvProgramInstallBusy() || g_runtimeRunning);

  if (g_deferAutoRun && mvMqttConnected() && mvProgramValid()
      && !mvProgramStoreLoadBusy() && !mvProgramInstallBusy()
      && !mvDeviceModeRemoteIo()) {
    if (g_autoRunAfterMs == 0) g_autoRunAfterMs = millis() + 500;
    if ((long)(millis() - g_autoRunAfterMs) >= 0) {
      g_deferAutoRun = false;
      mvOneShotReset();
      g_runtimeRunning = true;
      g_lastScanMs = millis();
      MV_LOG("auto-run on boot — ST runtime started (MQTT ready)");
    }
  }

  if (g_runtimeRunning && !mvProgramInstallBusy()) {
    unsigned long now = millis();
    if (now - g_lastScanMs >= g_scanMs) {
      runOneScan(now - g_lastScanMs);
      g_lastScanMs = now;
    }
  }

  mvMqttMaybePublishTelemetry(g_runtimeRunning, g_scanMs, g_cycles, g_lastCycleUs);
}
