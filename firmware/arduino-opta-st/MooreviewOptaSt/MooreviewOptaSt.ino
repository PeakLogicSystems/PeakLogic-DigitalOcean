/*
 * PeakLogic ST runtime for Arduino Opta (Ethernet HTTP API + WiFi setup GUI).
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
#include "mv_ota.h"
#include "mv_debug.h"
#include "mv_runtime.h"
#include "mv_version.h"
#include "mv_rtc.h"
#include "mv_device_status.h"

static byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
static MvDeviceConfig g_cfg;
static bool g_runtimeRunningFlag = false;

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
  mvRtcSyncFromHeader(mvHttpHeader(headerBlock, "X-MV-Client-Time").c_str());
  StaticJsonDocument<1024> doc;
  mvFillDeviceStatus(doc.to<JsonObject>());
  String clientVer = mvHttpHeader(headerBlock, "X-MV-Client-Version");
  String clientProto = mvHttpHeader(headerBlock, "X-MV-Protocol-Version");
  if (clientVer.length()) MV_LOG2("status client ", clientVer);
  if (clientProto.length()) {
    char err[96];
    if (!mvCheckClientProtocol(clientProto.toInt(), clientVer.c_str(), err, sizeof(err))) {
      doc["clientProtocolOk"] = false;
      doc["clientProtocolError"] = err;
    } else {
      doc["clientProtocolOk"] = true;
    }
  }
  mvOtaAppendStatus(doc.as<JsonObject>());
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

static void handleOutputs(Stream& client, const String& method, const String& path,
                          const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    sendJsonCStr(client, 400, "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, body)) {
    sendJsonCStr(client, 400, "{\"error\":\"invalid json\"}");
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
  sendJsonCStr(client, 200, "{\"ok\":true}");
}

static void handleProgramPut(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  mvRtcSyncFromHeader(mvHttpHeader(headerBlock, "X-MV-Client-Time").c_str());
  MV_LOG2("PUT/POST /api/program bytes=", body.length());
  if (body.length() == 0) {
    sendJsonCStr(client, 400, "{\"error\":\"missing body\"}");
    return;
  }
  if (body.length() >= MV_PROGRAM_JSON_MAX) {
    MV_LOG2("program rejected bytes=", body.length());
    StaticJsonDocument<192> err;
    err["ok"] = false;
    err["error"] = "program too large";
    err["bytes"] = body.length();
    err["limit"] = MV_PROGRAM_JSON_MAX;
    sendJson(client, 413, err);
    return;
  }
  if (!mvProgramLoadFromBody(body.c_str(), body.length())) {
    StaticJsonDocument<256> err;
    err["ok"] = false;
    const char* errMsg = mvLastProgramError();
    err["error"] = errMsg;
    err["bytes"] = body.length();
    MV_LOG2("program load error: ", errMsg);
    int code = 400;
    if (strstr(errMsg, "protocol version mismatch") != nullptr) {
      err["protocolVersion"] = MV_PROTOCOL_VERSION;
      code = 409;
    }
    sendJson(client, code, err);
    return;
  }
  MV_LOG("program OK");
  sendJsonCStr(client, 200, "{\"ok\":true}");
}

static void runOneScan(uint32_t dtMs) {
  mvExecuteScan(dtMs);
}

static void handleScan(Stream& client, const String& method, const String& path,
                       const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  uint32_t dt = mvRuntimeScanMs();
  if (body.length() > 0) {
    StaticJsonDocument<128> req;
    if (!deserializeJson(req, body)) {
      dt = req["scanMs"] | mvRuntimeScanMs();
    }
  }
  runOneScan(dt);
  StaticJsonDocument<8192> doc;
  JsonObject tags = doc.createNestedObject("tags");
  mvTagsToJson(tags);
  doc["ok"] = true;
  doc.createNestedArray("errors");
  sendJson(client, 200, doc);
}

static void handleRuntimeStart(Stream& client, const String& method, const String& path,
                               const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  uint32_t scanMs = mvRuntimeScanMs();
  if (body.length() > 0) {
    StaticJsonDocument<128> req;
    if (!deserializeJson(req, body)) {
      scanMs = req["scanMs"] | MV_SCAN_MS_DEFAULT;
    }
  }
  MV_LOG("HTTP POST /api/runtime/start");
  mvRuntimeStart(scanMs);
  sendJsonCStr(client, 200, "{\"ok\":true,\"running\":true}");
}

static void handleRuntimeStop(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  MV_LOG("HTTP POST /api/runtime/stop");
  mvRuntimeStop();
  sendJsonCStr(client, 200, "{\"ok\":true,\"running\":false}");
}

static void registerApiRoutes() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpAddRoute("GET", "/api/status", handleStatus);
  mvHttpAddRoute("GET", "/api/tags", handleTags);
  mvHttpAddRoute("POST", "/api/tags/outputs", handleOutputs);
  mvHttpAddRoute("PUT", "/api/program", handleProgramPut);
  mvHttpAddRoute("POST", "/api/program", handleProgramPut);
  mvHttpAddRoute("POST", "/api/scan", handleScan);
  mvHttpAddRoute("POST", "/api/runtime/start", handleRuntimeStart);
  mvHttpAddRoute("POST", "/api/runtime/stop", handleRuntimeStop);
#endif
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  MV_LOG("PeakLogic Opta ST boot (Serial 115200)");
  mvRtcWarnIfUnset();

  mvRuntimeBegin(MV_SCAN_MS_DEFAULT);
  mvStoreLoad(&g_cfg);
  mvIoBegin();
  mvTagsBegin();
  MV_LOG2("tags at boot=", mvTagCount());
  mvExpBegin();
  mvExpApplyConfig(&g_cfg);
  mvExpEnsureTags();
  MV_LOG2("expansion modules=", mvExpDetectedCount());

  mvEthBegin(&g_cfg, mac);
  mvWifiBegin(&g_cfg);
  g_runtimeRunningFlag = false;
  mvOtaSetRuntimeFlag(&g_runtimeRunningFlag);
  mvOtaBegin();

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvSetupRegisterRoutes();
  registerApiRoutes();
  mvOtaRegisterHttpRoutes();
  mvHttpBegin(MV_HTTP_PORT);
  mvEthLogStatus(&g_cfg);
#else
  MV_LOG("HTTP disabled on this board");
#endif

  if (mvWifiApActive()) {
    MV_LOG2("Setup WiFi AP http://", mvWifiApIp().toString() + ":" + String(MV_WIFI_HTTP_PORT));
  }
  MV_LOG("ready — Start/Stop ST from PeakLogic (Remote ON)");
}

void loop() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  Ethernet.maintain();
  mvHttpHandleClients();
#endif
  mvWifiHandleClients();
  mvOtaLoop();

  g_runtimeRunningFlag = mvRuntimeRunning();
  mvRuntimeTick(runOneScan);
}
