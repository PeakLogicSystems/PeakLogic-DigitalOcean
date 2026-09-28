/*
 * PeakLogic Opta — ST runtime + MQTT Parc (peaklogic/v1)
 * ST modules shared with arduino-opta-st; programs deployed via MQTT cmd.
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
#include "mv_program_store.h"
#include "mv_rtc.h"
#include "mv_io_map.h"
#include "mv_edge_ai.h"
#include "mv_mcsa_m7.h"
#include "mv_ct_cal.h"
#include "mv_ahu_env_cal.h"
#include "mv_mqtt.h"
#include "mv_watchdog.h"
#include "mv_mcsa_mon.h"
#include "mv_rbe.h"
#if MV_FIELDBUS
#include "mv_fieldbus.h"
#endif

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static MvDeviceConfig g_cfg;
bool g_runtimeRunning = false;
uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
uint32_t g_lastScanMs = 0;
uint32_t g_cycles = 0;
uint32_t g_lastCycleUs = 0;
static bool g_deferAutoRun = false;
static unsigned long g_autoRunAfterMs = 0;

static MvMqttConfig g_mqttCfg = {
  MV_MQTT_SKETCH_BROKER_DEFAULT,
  MV_MQTT_SKETCH_PORT_DEFAULT,
  "opta_st_01",
  "peaklogic/v1",
  180000,
};

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
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<1024> doc;
  mvFillDeviceStatus(doc.to<JsonObject>());
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

static void handleProgramPut(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    sendJsonCStr(client, 400, "{\"error\":\"missing body\"}");
    return;
  }
  DynamicJsonDocument doc(MV_PROGRAM_JSON_MAX);
  if (deserializeJson(doc, body)) {
    sendJsonCStr(client, 400, "{\"error\":\"invalid json\"}");
    return;
  }
  if (!mvProgramLoad(doc.as<JsonObject>())) {
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
  mvExecuteScan(dtMs);
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

static void registerApiRoutes() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpAddRoute("GET", "/api/status", handleStatus);
  mvHttpAddRoute("GET", "/api/tags", handleTags);
  mvHttpAddRoute("PUT", "/api/program", handleProgramPut);
  mvHttpAddRoute("DELETE", "/api/program", handleProgramDelete);
  mvHttpAddRoute("POST", "/api/runtime/start", handleRuntimeStart);
  mvHttpAddRoute("POST", "/api/runtime/stop", handleRuntimeStop);
#endif
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  MV_LOG("PeakLogic Opta ST+MQTT boot (Serial 115200)");
  mvRtcWarnIfUnset();
  MV_LOG_CMD2("firmware ", MV_FIRMWARE_VERSION);

  mvMqttReserveBuffer();

  mvStoreLoad(&g_cfg);
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
  mvWifiProbe();
  if (!mvWifiCapable()) {
    MV_LOG_CMD2("WiFi AP ", mvWifiLastError());
  } else if (g_cfg.wifiApEnable) {
    if (!mvWifiBegin(&g_cfg)) {
      MV_LOG_CMD2("WiFi AP ", mvWifiLastError());
    }
  } else {
    MV_LOG("WiFi AP disabled in NV — enable on /setup");
  }
  mvMqttBegin(&g_mqttCfg, &g_cfg);
  mvOtaSetRuntimeFlag(&g_runtimeRunning);
  mvOtaBegin();

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvSetupRegisterRoutes();
  mvIoMapRegisterRoutes();
  mvCtCalRegisterRoutes();
  mvAhuEnvCalRegisterRoutes();
  mvMcsaMonRegisterRoutes();
  registerApiRoutes();
  mvOtaRegisterHttpRoutes();
  mvHttpBegin(MV_HTTP_PORT);
  MV_LOG2("HTTP routes=", (int)mvHttpRouteCount());
  mvEthLogStatus(&g_cfg);
#else
  MV_LOG("HTTP disabled on this board");
#endif

  mvWatchdogBegin();

  mvCtCalBegin();
  mvAhuEnvCalBegin();
  mvMcsaMonBegin();
  mvMcsaM7Begin();
  mvEdgeAiBegin();
#if MV_FIELDBUS
  mvFieldbusInit(nullptr);
#endif
  mvProgramStoreRequestBootLoad();
  mvExpBegin();
  mvExpApplyConfig(&g_cfg);
  mvExpEnsureTags();
  mvRbeBegin();
  MV_LOG2("expansion modules=", mvExpDetectedCount());

  if (mvWifiApActive()) {
    char url[64];
    snprintf(url, sizeof(url), "http://%s:%u/setup", mvWifiApIp().toString().c_str(), (unsigned)MV_WIFI_HTTP_PORT);
    MV_LOG_CMD2("Setup WiFi AP ", url);
  }
  MV_LOG_CMD("ready — MQTT Parc + local /setup status page");
  if (mvProgramStoreGetAutoRun()) {
    g_deferAutoRun = true;
    MV_LOG("auto-run deferred until MQTT subscribed");
  }
}

void loop() {
  mvWatchdogLoopBegin();
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  Ethernet.maintain();
  mvHttpPumpClients(2);
  mvWifiLoop(&g_cfg);
#endif
  mvMqttTestPoll();
  mvMqttLoop();
  mvProgramStoreLoadTick();
  {
    uint8_t drains = 0;
    while (mvMqttCmdPending() && drains < 48) {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
        mvHttpPumpClients(2);
#endif
      mvMqttDrainPendingCommand();
      mvMqttLoop();
      drains++;
    }
  }
  mvOtaLoop();
  mvProgramStoreSaveTick();
  mvMcsaM7Tick();
  mvRtcDrainPending(mvProgramInstallBusy() || g_runtimeRunning);

  if (g_deferAutoRun && mvMqttConnected() && mvProgramValid()
      && !mvProgramStoreLoadBusy() && !mvProgramInstallBusy()) {
    if (g_autoRunAfterMs == 0) g_autoRunAfterMs = millis() + 500;
    if ((long)(millis() - g_autoRunAfterMs) >= 0) {
      g_deferAutoRun = false;
      mvOneShotReset();
      g_runtimeRunning = true;
      g_lastScanMs = millis();
      MV_LOG("auto-run on boot — ST runtime started (MQTT ready)");
    }
  }

  if (!mvProgramInstallBusy()) {
    const unsigned long nowMs = millis();
    static unsigned long s_lastEdgeMs = 0;
    uint32_t edgeDt = 100;
    if (s_lastEdgeMs != 0) edgeDt = (uint32_t)(nowMs - s_lastEdgeMs);
    s_lastEdgeMs = nowMs;
    mvEdgeAiTick(edgeDt);
    mvMcsaMonTick();
    mvAhuEnvCalTick();

#if MV_FIELDBUS
    mvFieldbusTick(nowMs);
#endif

    if (g_runtimeRunning) {
      unsigned long now = nowMs;
      if (now - g_lastScanMs >= g_scanMs) {
        runOneScan(now - g_lastScanMs);
        g_lastScanMs = now;
      }
    } else {
      static unsigned long s_lastIoPollMs = 0;
      if (nowMs - s_lastIoPollMs >= 100) {
        mvIoPollInputs();
        s_lastIoPollMs = nowMs;
      }
    }
  }

  mvRbeTick();
  mvMqttMaybePublishTelemetry(g_runtimeRunning, g_scanMs, g_cycles, g_lastCycleUs);

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpPumpClients(2);
#endif

  const bool checkLiveness = !mvProgramStoreLoadBusy() && !mvProgramStoreSaveBusy()
    && !mvProgramInstallBusy() && !mvOtaInfo().inProgress
    && !mvMqttCmdPending();
  mvWatchdogLoopEnd(checkLiveness);
}
