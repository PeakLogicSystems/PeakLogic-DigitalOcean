#include "pl_mqtt.h"
#include "pl_config.h"
#include "pl_st.h"
#include "pl_tags.h"
#include <Ethernet.h>
#include <PubSubClient.h>
#include <string.h>

extern bool g_runtimeRunning;
extern uint32_t g_scanMs;
extern uint32_t g_lastScanMs;

static EthernetClient s_eth;
static PubSubClient s_mqtt(s_eth);
static PlMqttConfig s_cfg;
static bool s_pauseTelemetry = false;
static unsigned long s_lastReport = 0;

static String tTelemetry() { return String(s_cfg.topicPrefix) + "/" + s_cfg.deviceId + "/telemetry"; }
static String tOnline() { return String(s_cfg.topicPrefix) + "/" + s_cfg.deviceId + "/online"; }
static String tCmd() { return String(s_cfg.topicPrefix) + "/" + s_cfg.deviceId + "/cmd"; }
static String tCmdRes() { return String(s_cfg.topicPrefix) + "/" + s_cfg.deviceId + "/cmd/response"; }
static String tConfig() { return String(s_cfg.topicPrefix) + "/" + s_cfg.deviceId + "/config"; }

static void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  String t(topic);

  if (t == tConfig()) {
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, msg)) {
      if (doc.containsKey("pauseTelemetry")) s_pauseTelemetry = doc["pauseTelemetry"].as<bool>();
    }
    return;
  }

  if (t != tCmd()) return;
  String response;
  if (plMqttHandleCommand(msg.c_str(), response) && response.length()) {
    s_mqtt.publish(tCmdRes().c_str(), response.c_str(), false);
  }
}


void plMqttBegin(const PlMqttConfig* cfg) {
  if (!cfg) return;
  s_cfg = *cfg;
  s_mqtt.setServer(s_cfg.broker, s_cfg.port);
  s_mqtt.setCallback(mqttCallback);
  s_mqtt.setBufferSize(PL_PROGRAM_JSON_MAX + 1024);
}

void plMqttLoop() {
  if (!s_mqtt.connected()) {
    String cid = String("mv-opta-st-") + s_cfg.deviceId;
    if (s_mqtt.connect(cid.c_str(), tOnline().c_str(), 1, true, "{\"online\":false}")) {
      s_mqtt.subscribe(tCmd().c_str(), 1);
      s_mqtt.subscribe(tConfig().c_str(), 1);
      s_mqtt.publish(tOnline().c_str(), "{\"online\":true}", true);
    }
  }
  s_mqtt.loop();
}

bool plMqttConnected() { return s_mqtt.connected(); }

void plMqttSetPauseTelemetry(bool pause) { s_pauseTelemetry = pause; }

bool plMqttHandleCommand(const char* json, String& responseOut) {
  StaticJsonDocument<384> peek;
  if (deserializeJson(peek, json)) return false;
  const char* id = peek["id"] | "";
  const char* op = peek["op"] | "";
  if (!id[0] || !op[0]) return false;

  StaticJsonDocument<768> res;
  res["id"] = id;
  bool ok = true;
  const char* errMsg = nullptr;

  DynamicJsonDocument reqDoc(PL_PROGRAM_JSON_MAX + 768);
  JsonDocument* req = &peek;
  if (strcmp(op, "put_program") == 0) {
    if (deserializeJson(reqDoc, json)) {
      ok = false;
      errMsg = "put_program json too large";
      res["ok"] = ok;
      res["error"] = errMsg;
      serializeJson(res, responseOut);
      return true;
    }
    req = &reqDoc;
  }

  if (strcmp(op, "put_program") == 0) {
    JsonObject body = (*req)["body"].as<JsonObject>();
    if (body.isNull()) {
      ok = false;
      errMsg = "missing body";
    } else if (!plProgramLoad(body)) {
      ok = false;
      errMsg = plLastProgramError();
    } else {
      JsonObject out = res.createNestedObject("body");
      out["ok"] = true;
      out["programOk"] = true;
      out["tagCount"] = plTagCount();
    }
  } else if (strcmp(op, "get_program") == 0) {
    JsonObject out = res.createNestedObject("body");
    out["programLoaded"] = plProgramValid();
    out["error"] = plLastProgramError();
  } else if (strcmp(op, "runtime_start") == 0) {
    g_scanMs = (*req)["body"]["scanMs"] | PL_SCAN_MS_DEFAULT;
    plOneShotReset();
    g_runtimeRunning = true;
    g_lastScanMs = millis();
    JsonObject out = res.createNestedObject("body");
    out["running"] = true;
    out["scanMs"] = g_scanMs;
  } else if (strcmp(op, "runtime_stop") == 0) {
    g_runtimeRunning = false;
    JsonObject out = res.createNestedObject("body");
    out["running"] = false;
  } else if (strcmp(op, "runtime_status") == 0) {
    JsonObject out = res.createNestedObject("body");
    out["running"] = g_runtimeRunning;
    out["scanMs"] = g_scanMs;
    out["programOk"] = plProgramValid();
    out["programError"] = plLastProgramError();
  } else {
    ok = false;
    errMsg = "unknown op";
  }

  res["ok"] = ok;
  if (errMsg) res["error"] = errMsg;
  serializeJson(res, responseOut);
  return true;
}

void plMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs) {
  if (!s_mqtt.connected() || s_pauseTelemetry) return;
  unsigned long now = millis();
  if (now - s_lastReport < s_cfg.reportMs) return;
  s_lastReport = now;

  StaticJsonDocument<8192> doc;
  doc["deviceId"] = s_cfg.deviceId;
  doc["name"] = "Arduino Opta ST";
  doc["platform"] = "arduino-opta-mqtt-st";
  doc["reportIntervalSec"] = (int)(s_cfg.reportMs / 1000);

  JsonObject rt = doc.createNestedObject("runtime");
  rt["running"] = runtimeRunning;
  rt["scanMs"] = scanMs;
  rt["cycles"] = cycles;
  rt["lastCycleUs"] = lastCycleUs;
  rt["programOk"] = plProgramValid();

  JsonArray tags = doc.createNestedArray("tags");
  plTagsToFleetJson(tags);

  String out;
  serializeJson(doc, out);
  s_mqtt.publish(tTelemetry().c_str(), out.c_str(), false);
}
