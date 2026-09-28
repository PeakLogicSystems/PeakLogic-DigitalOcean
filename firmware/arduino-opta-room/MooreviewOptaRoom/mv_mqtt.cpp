#include "mv_mqtt.h"
#include "mv_version.h"
#include "mv_config.h"
#include "mv_store.h"
#include "mv_st.h"
#include "mv_bc.h"
#include "mv_bc.h"
#include "mv_tags.h"
#include "mv_io_map.h"
#include "mv_expansions.h"
#include "mv_debug.h"
#include "mv_identity.h"
#include "mv_rtc.h"
#include "mv_program_store.h"
#include "mv_store.h"
#include "mv_global_mqtt.h"
#include <Ethernet.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
#include "mv_http.h"
#endif
/**
 * PubSubClient's packet buffer defaults to 256 B — far too small for put_program
 * (compiled bytecode base64 is always > 256 B), so a deploy is silently dropped on
 * receive. MQTT_MAX_PACKET_SIZE is defined in mv_config.h (included above, before any
 * <PubSubClient.h>) so the constructor allocates the large buffer at global init.
 * mvMqttEnsureBuffer() is a runtime safety net that also raises the buffer and reports
 * the achieved size in runtime_status/telemetry for remote verification after a flash.
 */
/**
 * Floor for the buffer ladder — must comfortably exceed a real put_program payload
 * (triplex is ~700 B; large programs a few KB). Kept modest so we still succeed even
 * when the heap is fragmented and cannot hand out 8 KB contiguous.
 */
#ifndef MV_MQTT_MIN_PACKET_SIZE
#define MV_MQTT_MIN_PACKET_SIZE 2048
#endif
#include <PubSubClient.h>
#include <string.h>

extern bool g_runtimeRunning;
extern uint32_t g_scanMs;
extern uint32_t g_lastScanMs;

static EthernetClient s_eth;
static PubSubClient s_mqtt(s_eth);
static MvMqttConfig s_cfg;
static char s_brokerHost[32];
static bool s_pauseTelemetry = false;
static unsigned long s_lastReport = 0;
static bool s_forceTelemetry = false;
/** Actual PubSubClient buffer size achieved (256 = alloc failed / default). */
static uint16_t s_mqttBufferBytes = 0;

/**
 * Grow the PubSubClient packet buffer to the largest size the heap will allow,
 * from MQTT_MAX_PACKET_SIZE down to MV_MQTT_MIN_PACKET_SIZE. Guarantees we never
 * silently keep the 256 B default (which drops every put_program). Returns the
 * achieved size in bytes.
 *
 * setBufferSize() reallocs from the heap, so the earliest call wins: run this
 * BEFORE the Ethernet/WiFi/HTTP stack fragments the heap (mvMqttReserveBuffer()
 * in setup()). Idempotent — once we hold a large buffer we never shrink it.
 */
static uint16_t mvMqttEnsureBuffer() {
  if (s_mqttBufferBytes >= MV_MQTT_MIN_PACKET_SIZE) return s_mqttBufferBytes;
  for (uint32_t want = MQTT_MAX_PACKET_SIZE; want >= MV_MQTT_MIN_PACKET_SIZE; want /= 2) {
    if (s_mqtt.setBufferSize((uint16_t)want)) {
      MV_LOG_CMD2("MQTT packet buffer bytes=", (int)want);
      s_mqttBufferBytes = (uint16_t)want;
      return s_mqttBufferBytes;
    }
    MV_LOG_CMD2("MQTT buffer alloc failed, retry smaller from bytes=", (int)want);
  }
  MV_LOG_CMD("MQTT buffer stuck at 256 B default — put_program deploys will fail");
  s_mqttBufferBytes = 256;
  return 256;
}

/** Reserve the MQTT packet buffer early (before network init) for best alloc odds. */
void mvMqttReserveBuffer() { mvMqttEnsureBuffer(); }

uint16_t mvMqttBufferBytes() { return s_mqttBufferBytes; }

static void appendExpansionModules(JsonObject doc) {
  doc["expansionBlueprint"] = mvExpBlueprintEnabled();
  doc["expansionCount"] = mvExpDetectedCount();
  JsonArray det = doc.createNestedArray("expansionModules");
  for (uint8_t i = 0; i < mvExpDetectedCount(); i++) {
    MvExpDetected d;
    if (!mvExpGetDetected(i, &d)) continue;
    JsonObject o = det.createNestedObject();
    o["slot"] = d.slot;
    o["type"] = d.type;
    o["label"] = d.label;
    o["present"] = d.present;
  }
}

static char s_topicCmd[96];
static char s_topicConfig[96];
static char s_topicCmdRes[104];
static char s_topicTelemetry[96];
static char s_topicOnline[96];
static char s_mqttClientId[72];
/** Reused telemetry JSON buffer — avoids String heap churn every report interval. */
static char s_telemetryJson[16384];

static void mvMqttRefreshTopics() {
  snprintf(s_topicCmd, sizeof(s_topicCmd), "%s/%s/cmd", s_cfg.topicPrefix, s_cfg.deviceId);
  snprintf(s_topicConfig, sizeof(s_topicConfig), "%s/%s/config", s_cfg.topicPrefix, s_cfg.deviceId);
  snprintf(s_topicCmdRes, sizeof(s_topicCmdRes), "%s/%s/cmd/response", s_cfg.topicPrefix, s_cfg.deviceId);
  snprintf(s_topicTelemetry, sizeof(s_topicTelemetry), "%s/%s/telemetry", s_cfg.topicPrefix, s_cfg.deviceId);
  snprintf(s_topicOnline, sizeof(s_topicOnline), "%s/%s/online", s_cfg.topicPrefix, s_cfg.deviceId);
  snprintf(s_mqttClientId, sizeof(s_mqttClientId), "mv-opta-st-%s", s_cfg.deviceId);
}

/** Config messages use a small buffer so cmd pending payload cannot be clobbered. */
static char s_configBuf[512];
/** Deferred cmd payload (all ops — never handle heavy work inside mqttCallback). */
static char s_pendingCmdBuf[MV_MQTT_CMD_BUF];
static char s_pendingCmdId[48];
static char s_pendingCmdOp[32];
static volatile bool s_cmdPending = false;
static char s_cmdResponseQueue[768];
static bool s_cmdResponseQueued = false;

enum PutPhase : uint8_t {
  PUT_IDLE = 0,
  PUT_PARSE,
  PUT_DECODE,
  PUT_LOAD,
  PUT_DONE,
};

static PutPhase s_putPhase = PUT_IDLE;
static char s_putCmdId[48];
static size_t s_putDecodeLen = 0;
static const char* s_putBcIn = nullptr;
static size_t s_putBcInPos = 0;
static size_t s_putDecodeOut = 0;
static uint32_t s_putB64Acc = 0;
static int s_putB64Bits = 0;
static bool s_putOk = false;
static char s_putErr[128];
/** Parsed put_program cmd JSON — static BSS (DynamicJsonDocument heap fails during deploy). */
static StaticJsonDocument<MV_PROGRAM_JSON_MAX> s_putReqDoc;
/* 16 KB to fit a full triplex + expansion I/O map; must stay <= MQTT_MAX_PACKET_SIZE. */
static StaticJsonDocument<16384> s_telemetryDoc;
static MvBcLoadCtx s_putBcCtx;
static bool s_putBcLoadStarted = false;

static void mqttPumpOutbox(uint8_t rounds) {
  if (!s_mqtt.connected()) return;
  for (uint8_t i = 0; i < rounds; i++) s_mqtt.loop();
}

static bool publishCmdResponseNow(const char* json) {
  if (!json || !json[0] || !s_mqtt.connected()) return false;
  const size_t n = strlen(json);
  if (n == 0 || n >= sizeof(s_cmdResponseQueue)) return false;
  return s_mqtt.publish(s_topicCmdRes, (const uint8_t*)json, n, false);
}

static void mqttFlushQueuedResponse() {
  if (!s_cmdResponseQueued || !s_cmdResponseQueue[0]) return;
  if (publishCmdResponseNow(s_cmdResponseQueue)) {
    s_cmdResponseQueued = false;
    s_cmdResponseQueue[0] = '\0';
    mqttPumpOutbox(4);
  }
}

static void publishCmdResponse(const char* json) {
  if (!json || !json[0]) return;
  if (publishCmdResponseNow(json)) {
    MV_LOG_CMD("MQTT cmd response sent");
    mqttPumpOutbox(4);
    return;
  }
  const size_t n = strlen(json);
  if (n >= sizeof(s_cmdResponseQueue)) {
    MV_LOG_CMD("MQTT cmd response too large to queue");
    return;
  }
  memcpy(s_cmdResponseQueue, json, n + 1);
  s_cmdResponseQueued = true;
  MV_LOG_CMD("MQTT cmd response queued");
}

static void mqttYield() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpHandleClients();
  mvHttpHandleClients();
#endif
  if (s_mqtt.connected()) {
    for (uint8_t i = 0; i < 6; i++) s_mqtt.loop();
  }
}

static int putB64Val(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

/** Decode up to maxChars input; returns true while more input remains. */
static bool putDecodeChunk(size_t maxChars) {
  uint8_t* const decodeBuf = mvProgramScratchBuf();
  const size_t decodeCap = mvProgramScratchCap();
  if (!s_putBcIn || !decodeBuf || !decodeCap) {
    strncpy(s_putErr, "bc decode failed", sizeof(s_putErr) - 1);
    return false;
  }
  size_t n = 0;
  while (s_putBcIn[s_putBcInPos] && n < maxChars) {
    const char c = s_putBcIn[s_putBcInPos++];
    if (c == '=' || c == '\n' || c == '\r' || c == ' ') continue;
    const int v = putB64Val(c);
    if (v < 0) {
      strncpy(s_putErr, "bc decode failed", sizeof(s_putErr) - 1);
      return false;
    }
    s_putB64Acc = (s_putB64Acc << 6) | (uint32_t)v;
    s_putB64Bits += 6;
    if (s_putB64Bits >= 8) {
      s_putB64Bits -= 8;
      if (s_putDecodeOut >= decodeCap) {
        strncpy(s_putErr, "bc decode failed", sizeof(s_putErr) - 1);
        return false;
      }
      decodeBuf[s_putDecodeOut++] = (uint8_t)((s_putB64Acc >> s_putB64Bits) & 0xff);
    }
    n++;
  }
  return s_putBcIn[s_putBcInPos] != '\0';
}

static void publishCmdError(const char* cmdId, const char* errText);

static void putProgramFinishResponse() {
  StaticJsonDocument<768> res;
  res["id"] = s_putCmdId;
  res["ok"] = s_putOk;
  if (!s_putOk && s_putErr[0]) {
    res["error"] = s_putErr;
  } else if (s_putOk) {
    JsonObject out = res.createNestedObject("body");
    out["ok"] = true;
    out["programOk"] = true;
    out["tagCount"] = mvTagCount();
  }
  char response[640];
  const size_t n = serializeJson(res, response, sizeof(response));
  if (n == 0 || n >= sizeof(response)) {
    MV_LOG_CMD("put_program response serialize failed");
    publishCmdError(s_putCmdId, "response too large");
  } else {
    publishCmdResponse(response);
  }
  mqttPumpOutbox(6);
  MV_LOG_CMD(s_putOk ? "put_program MQTT done OK" : "put_program MQTT done err");
  if (!s_putOk && s_putErr[0]) {
    MV_LOG_CMD2("put_program err=", s_putErr);
  } else if (s_putOk) {
    JsonObject body = s_putReqDoc["body"].as<JsonObject>();
    if (!body.isNull()) mvProgramQueueRtcFromBody(body);
    MV_LOG_CMD2("put_program tags=", mvTagCount());
  }
  s_putPhase = PUT_IDLE;
  mvProgramInstallSetBusy(false);
  s_putBcIn = nullptr;
  s_putBcLoadStarted = false;
  s_putErr[0] = '\0';
}

static bool mvMqttPutProgramTick() {
  if (s_putPhase == PUT_IDLE) return false;

  const unsigned long sliceStart = millis();
  const unsigned long sliceMs = 12;

  while (millis() - sliceStart < sliceMs) {
    switch (s_putPhase) {
      case PUT_PARSE: {
        if (mvDeviceModeRemoteIo()) {
          strncpy(s_putErr, "put_program rejected — device in remote I/O mode", sizeof(s_putErr) - 1);
          s_putPhase = PUT_DONE;
          break;
        }
        for (uint8_t y = 0; y < 4; y++) mqttYield();
        s_putOk = false;
        s_putErr[0] = '\0';
        s_putReqDoc.clear();
        MV_LOG_CMD("put_program parse…");
        StaticJsonDocument<192> filter;
        filter["body"]["bc"] = true;
        filter["body"]["tagCount"] = true;
        filter["body"]["tracePointCount"] = true;
        filter["body"]["traceMap"] = true;
        filter["body"]["protocolVersion"] = true;
        filter["body"]["clientVersion"] = true;
        filter["body"]["programName"] = true;
        filter["body"]["autoRunOnBoot"] = true;
        filter["body"]["clientTimeUnix"] = true;
        filter["body"]["clientTzOffsetMin"] = true;
        const DeserializationError jerr = deserializeJson(
          s_putReqDoc, s_pendingCmdBuf, DeserializationOption::Filter(filter));
        for (uint8_t y = 0; y < 4; y++) mqttYield();
        if (jerr) {
          MV_LOG_CMD2("put_program parse fail code=", (int)jerr.code());
          strncpy(s_putErr, "put_program json too large", sizeof(s_putErr) - 1);
          s_putPhase = PUT_DONE;
          break;
        }
        JsonObject body = s_putReqDoc["body"].as<JsonObject>();
        if (body.isNull()) {
          strncpy(s_putErr, "missing body", sizeof(s_putErr) - 1);
          s_putPhase = PUT_DONE;
          break;
        }
        {
          char protoErr[96];
          const int clientProto = body["protocolVersion"] | 0;
          const char* clientVer = body["clientVersion"] | "";
          if (!mvCheckClientProtocol(clientProto, clientVer, protoErr, sizeof(protoErr))) {
            strncpy(s_putErr, protoErr, sizeof(s_putErr) - 1);
            s_putPhase = PUT_DONE;
            break;
          }
        }
        const char* bc = body["bc"];
        if (!bc || !bc[0]) {
          strncpy(s_putErr, "missing bc", sizeof(s_putErr) - 1);
          s_putPhase = PUT_DONE;
          break;
        }
        s_putBcIn = bc;
        s_putBcInPos = 0;
        s_putDecodeOut = 0;
        s_putB64Acc = 0;
        s_putB64Bits = 0;
        s_putPhase = PUT_DECODE;
        MV_LOG_CMD("put_program decode…");
        mqttYield();
        return true;
      }
      case PUT_DECODE: {
        const bool more = putDecodeChunk(768);
        if (s_putErr[0]) {
          s_putPhase = PUT_DONE;
          break;
        }
        if (!more) {
          s_putDecodeLen = s_putDecodeOut;
          s_putPhase = PUT_LOAD;
          MV_LOG_CMD2("put_program decoded bytes=", (int)s_putDecodeLen);
          return true;
        }
        break;
      }
      case PUT_LOAD: {
        mqttYield();
        JsonObject body = s_putReqDoc["body"].as<JsonObject>();
        if (!s_putBcLoadStarted) {
          MV_LOG_CMD("put_program load…");
          if (!mvBcLoadBegin(&s_putBcCtx, mvProgramScratchBuf(), s_putDecodeLen, s_putErr, sizeof(s_putErr))) {
            s_putPhase = PUT_DONE;
            break;
          }
          s_putBcLoadStarted = true;
        }
        while (true) {
          const bool done = mvBcLoadStep(&s_putBcCtx, s_putErr, sizeof(s_putErr));
          if (s_putErr[0]) {
            s_putPhase = PUT_DONE;
            break;
          }
          if (done) {
            s_putOk = body.isNull() ? false : mvProgramApplyMeta(body);
            if (!s_putOk && !s_putErr[0]) strncpy(s_putErr, "program meta failed", sizeof(s_putErr) - 1);
            s_putBcLoadStarted = false;
            s_putPhase = PUT_IDLE;
            mvProgramInstallSetBusy(false);
            putProgramFinishResponse();
            return true;
          }
          if (millis() - sliceStart >= sliceMs) return true;
          mqttYield();
        }
        break;
      }
      case PUT_DONE:
        putProgramFinishResponse();
        return true;
      default:
        s_putPhase = PUT_IDLE;
        return false;
    }
    mqttYield();
  }

  return true;
}

static bool putProgramBusy() {
  return s_putPhase != PUT_IDLE;
}

static void publishCmdError(const char* cmdId, const char* errText) {
  StaticJsonDocument<192> err;
  err["id"] = cmdId && cmdId[0] ? cmdId : "";
  err["ok"] = false;
  err["error"] = errText ? errText : "error";
  char response[192];
  serializeJson(err, response, sizeof(response));
  publishCmdResponse(response);
}

static bool isPutProgramOp(const char* op) {
  return op && strcmp(op, "put_program") == 0;
}

static bool isLightweightOp(const char* op) {
  if (!op || !op[0]) return false;
  return strcmp(op, "runtime_status") == 0
    || strcmp(op, "get_program") == 0
    || strcmp(op, "runtime_start") == 0
    || strcmp(op, "runtime_stop") == 0
    || strcmp(op, "set_autorun") == 0
    || strcmp(op, "clear_program") == 0
    || strcmp(op, "sync_time") == 0
    || strcmp(op, "set_force") == 0
    || strcmp(op, "clear_force") == 0
    || strcmp(op, "write_outputs") == 0
    || strcmp(op, "set_device_mode") == 0
    || strcmp(op, "scan_expansions") == 0;
}

/** Scan only the cmd header (before "body") so nested fields cannot spoof id/op. */
static const char* jsonCmdHeaderEnd(const char* json) {
  if (!json) return json;
  const char* body = strstr(json, "\"body\"");
  return body ? body : json + strlen(json);
}

/** Read a JSON string value for "key":"..." without full-document parse (safe on multi-KB put_program). */
static bool extractJsonStringField(const char* json, const char* key, char* out, size_t outLen) {
  if (!json || !key || !out || outLen < 2) return false;
  out[0] = '\0';
  const size_t keyLen = strlen(key);
  const char* const limit = jsonCmdHeaderEnd(json);
  for (const char* p = json; p < limit && *p; p++) {
    if (*p != '"') continue;
    if (strncmp(p + 1, key, keyLen) != 0 || p[1 + keyLen] != '"') continue;
    const char* q = p + 1 + keyLen + 1;
    while (*q == ' ' || *q == '\t') q++;
    if (*q != ':') continue;
    q++;
    while (*q == ' ' || *q == '\t') q++;
    if (*q != '"') continue;
    q++;
    size_t n = 0;
    while (q[n] && q[n] != '"' && n < outLen - 1) {
      out[n] = q[n];
      n++;
    }
    out[n] = '\0';
    return n > 0;
  }
  return false;
}

static bool extractCmdMeta(const char* json, char* idOut, size_t idLen, char* opOut, size_t opLen) {
  if (!json || !idOut || !opOut || idLen < 2 || opLen < 2) return false;
  idOut[0] = '\0';
  opOut[0] = '\0';
  if (!extractJsonStringField(json, "id", idOut, idLen)) return false;
  if (!extractJsonStringField(json, "op", opOut, opLen)) return false;
  return true;
}

static void mqttCallback(char* topic, byte* payload, unsigned int len) {
  if (!topic) return;

  if (mvGlobalMqttHandleMessage(topic, payload, len, s_cfg.topicPrefix)) {
    return;
  }

  if (strcmp(topic, s_topicConfig) == 0) {
    if (len >= sizeof(s_configBuf)) return;
    memcpy(s_configBuf, payload, len);
    s_configBuf[len] = '\0';
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, s_configBuf)) {
      if (doc.containsKey("pauseTelemetry")) s_pauseTelemetry = doc["pauseTelemetry"].as<bool>();
      if (doc.containsKey("reportMs")) {
        uint32_t ms = doc["reportMs"].as<uint32_t>();
        if (ms >= 100 && ms <= 600000) s_cfg.reportMs = ms;
      }
    }
    return;
  }

  if (strcmp(topic, s_topicCmd) != 0) return;

  char cmdId[48];
  char cmdOp[32];

  if (len == 0 || len >= MV_MQTT_CMD_BUF) {
    char peekId[48];
    char peekOp[32];
    peekId[0] = '\0';
    peekOp[0] = '\0';
    if (len > 0) {
      const size_t peekN = (len < sizeof(s_pendingCmdBuf) - 1) ? len : (sizeof(s_pendingCmdBuf) - 1);
      memcpy(s_pendingCmdBuf, payload, peekN);
      s_pendingCmdBuf[peekN] = '\0';
      extractCmdMeta(s_pendingCmdBuf, peekId, sizeof(peekId), peekOp, sizeof(peekOp));
    }
    publishCmdError(peekId, len >= MV_MQTT_CMD_BUF ? "cmd payload too large" : "empty cmd");
    return;
  }

  memcpy(s_pendingCmdBuf, payload, len);
  s_pendingCmdBuf[len] = '\0';
  MV_LOG_CMD2("MQTT cmd rx bytes=", (int)len);

  cmdId[0] = '\0';
  cmdOp[0] = '\0';
  if (!extractCmdMeta(s_pendingCmdBuf, cmdId, sizeof(cmdId), cmdOp, sizeof(cmdOp))) {
    MV_LOG_CMD("MQTT cmd meta parse failed");
    publishCmdError(cmdId, "cmd json invalid");
    return;
  }
  MV_LOG_CMD2("MQTT cmd op=", cmdOp);

  if (putProgramBusy() && isLightweightOp(cmdOp)) {
    String response;
    if (mvMqttHandleCommand(s_pendingCmdBuf, cmdId, cmdOp, response) && response.length()) {
      publishCmdResponse(response.c_str());
      mqttPumpOutbox(4);
    } else {
      publishCmdError(cmdId, "cmd handler failed");
    }
    return;
  }

  if (s_cmdPending || putProgramBusy()) {
    publishCmdError(cmdId, "cmd busy");
    return;
  }

  strncpy(s_pendingCmdId, cmdId, sizeof(s_pendingCmdId) - 1);
  s_pendingCmdId[sizeof(s_pendingCmdId) - 1] = '\0';
  strncpy(s_pendingCmdOp, cmdOp, sizeof(s_pendingCmdOp) - 1);
  s_pendingCmdOp[sizeof(s_pendingCmdOp) - 1] = '\0';
  s_cmdPending = true;
  if (isPutProgramOp(cmdOp)) {
    MV_LOG_CMD2("MQTT put_program queued ", (int)len);
  }
}

bool mvMqttDrainPendingCommand() {
  if (putProgramBusy()) {
    return mvMqttPutProgramTick();
  }
  if (!s_cmdPending) return false;
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpHandleClients();
  mvHttpHandleClients();
#endif
  s_cmdPending = false;

  if (isPutProgramOp(s_pendingCmdOp)) {
    strncpy(s_putCmdId, s_pendingCmdId, sizeof(s_putCmdId) - 1);
    s_putCmdId[sizeof(s_putCmdId) - 1] = '\0';
    s_putPhase = PUT_PARSE;
    mvProgramInstallSetBusy(true);
    MV_LOG_CMD2("MQTT cmd ", s_pendingCmdOp);
    return mvMqttPutProgramTick();
  }

  String response;
  if (mvMqttHandleCommand(s_pendingCmdBuf, s_pendingCmdId, s_pendingCmdOp, response) && response.length()) {
    publishCmdResponse(response.c_str());
    if (isPutProgramOp(s_pendingCmdOp) && mvProgramValid()) {
      JsonObject body = s_putReqDoc["body"].as<JsonObject>();
      if (!body.isNull()) mvProgramQueueRtcFromBody(body);
    }
    mqttPumpOutbox(6);
  } else {
    publishCmdError(s_pendingCmdId, "cmd handler failed");
    mqttPumpOutbox(6);
  }
  return true;
}

bool mvMqttCmdPending() {
  return s_cmdPending || putProgramBusy();
}

static void mvMqttResolveBroker(const MvMqttConfig* cfg, const MvDeviceConfig* devCfg) {
  const char* broker = cfg && cfg->broker ? cfg->broker : MV_MQTT_SKETCH_BROKER_DEFAULT;
  uint16_t port = cfg ? cfg->port : 1883;
  if (devCfg && devCfg->mqttBrokerSet && devCfg->mqttBrokerHost[0]) {
    broker = devCfg->mqttBrokerHost;
    port = devCfg->mqttBrokerPort ? devCfg->mqttBrokerPort : port;
  }
  strncpy(s_brokerHost, broker, sizeof(s_brokerHost) - 1);
  s_brokerHost[sizeof(s_brokerHost) - 1] = '\0';
  s_cfg.broker = s_brokerHost;
  s_cfg.port = port;
}

void mvMqttGetBroker(char* hostOut, size_t hostLen, uint16_t* portOut) {
  if (hostOut && hostLen) {
    strncpy(hostOut, s_brokerHost, hostLen - 1);
    hostOut[hostLen - 1] = '\0';
  }
  if (portOut) *portOut = s_cfg.port;
}

void mvMqttBegin(const MvMqttConfig* cfg, const MvDeviceConfig* devCfg) {
  if (!cfg) return;
  s_cfg = *cfg;
  mvMqttResolveBroker(cfg, devCfg);
  mvMqttRefreshTopics();
  s_mqtt.setServer(s_brokerHost, s_cfg.port);
  s_mqtt.setKeepAlive(30);
  s_mqtt.setCallback(mqttCallback);
  mvGlobalMqttBegin(s_mqtt, s_cfg.topicPrefix);
  s_mqttBufferBytes = mvMqttEnsureBuffer();
}

void mvMqttApplyDeviceConfig(const MvDeviceConfig* devCfg) {
  mvMqttResolveBroker(&s_cfg, devCfg);
  if (s_mqtt.connected()) {
    s_mqtt.disconnect();
  }
  s_mqtt.setServer(s_brokerHost, s_cfg.port);
  mvMqttRefreshTopics();
  MV_LOG_CMD2("MQTT broker updated ", s_brokerHost);
}

void mvMqttLoop() {
  if (!s_mqtt.connected()) {
    if (s_mqtt.connect(s_mqttClientId, s_topicOnline, 1, true, "{\"online\":false}")) {
      const bool subCmd = s_mqtt.subscribe(s_topicCmd, 1);
      const bool subCfg = s_mqtt.subscribe(s_topicConfig, 1);
      s_mqtt.publish(s_topicOnline, "{\"online\":true}", true);
      MV_LOG_CMD2("MQTT connected broker ", s_brokerHost);
      if (!subCmd || !subCfg) {
        MV_LOG_CMD("MQTT subscribe FAILED — commands will timeout");
      } else {
        MV_LOG_CMD("MQTT subscribed cmd+config");
      }
      mvGlobalMqttOnConnect(s_mqtt, s_cfg.topicPrefix);
    } else {
      static unsigned long s_lastConnectFailLogMs = 0;
      const unsigned long now = millis();
      if (now - s_lastConnectFailLogMs >= 30000) {
        s_lastConnectFailLogMs = now;
        MV_LOG_CMD2("MQTT connect failed broker ", s_brokerHost);
      }
    }
  }
  s_mqtt.loop();
  mqttFlushQueuedResponse();
  mqttPumpOutbox(2);
}

bool mvMqttConnected() { return s_mqtt.connected(); }

void mvMqttSetPauseTelemetry(bool pause) { s_pauseTelemetry = pause; }

bool mvMqttHandleCommand(const char* json, const char* id, const char* op, String& responseOut) {
  if (!json || !id || !op || !id[0] || !op[0]) return false;
  MV_LOG2("MQTT cmd ", op);

  StaticJsonDocument<768> res;
  res["id"] = id;
  bool ok = true;
  const char* errMsg = nullptr;

  StaticJsonDocument<512> smallReq;
  JsonDocument* req = nullptr;

  if (strcmp(op, "put_program") == 0) {
    s_putReqDoc.clear();
    if (deserializeJson(s_putReqDoc, json)) {
      ok = false;
      errMsg = "put_program json too large";
    } else {
      req = &s_putReqDoc;
    }
  } else if (deserializeJson(smallReq, json)) {
    ok = false;
    errMsg = "cmd json invalid";
  } else {
    req = &smallReq;
  }

  if (ok && req) {
    if (strcmp(op, "put_program") == 0) {
      if (mvDeviceModeRemoteIo()) {
        ok = false;
        errMsg = "put_program rejected — device in remote I/O mode";
      } else {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        char protoErr[96];
        const int clientProto = body["protocolVersion"] | 0;
        const char* clientVer = body["clientVersion"] | "";
        if (!mvCheckClientProtocol(clientProto, clientVer, protoErr, sizeof(protoErr))) {
          ok = false;
          errMsg = protoErr;
        } else if (!mvProgramLoad(body)) {
          ok = false;
          errMsg = mvLastProgramError();
        } else {
          MV_LOG2("put_program OK tags=", mvTagCount());
          JsonObject out = res.createNestedObject("body");
          out["ok"] = true;
          out["programOk"] = true;
          out["tagCount"] = mvTagCount();
        }
      }
      }
    } else if (strcmp(op, "clear_program") == 0) {
      if (mvDeviceModeRemoteIo()) {
        ok = false;
        errMsg = "clear_program rejected — device in remote I/O mode";
      } else {
      g_runtimeRunning = false;
      mvProgramClear();
      JsonObject out = res.createNestedObject("body");
      out["cleared"] = true;
      MV_LOG_CMD("clear_program OK");
      }
    } else if (strcmp(op, "set_autorun") == 0) {
      if (mvDeviceModeRemoteIo()) {
        ok = false;
        errMsg = "set_autorun rejected — device in remote I/O mode";
      } else {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else if (!body.containsKey("enabled") && !body.containsKey("autoRunOnBoot")) {
        ok = false;
        errMsg = "missing enabled";
      } else {
        const bool enabled = body.containsKey("enabled")
          ? body["enabled"].as<bool>()
          : body["autoRunOnBoot"].as<bool>();
        mvProgramStoreSetAutoRun(enabled);
        JsonObject out = res.createNestedObject("body");
        out["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
        MV_LOG2("set_autorun ", enabled ? "on" : "off");
      }
      }
    } else if (strcmp(op, "get_program") == 0) {
      JsonObject out = res.createNestedObject("body");
      out["programLoaded"] = mvProgramValid();
      out["programFromNv"] = mvProgramStoreProgramFromNv();
      out["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
      out["programNvCrc"] = mvProgramStoreBcCrc();
      out["error"] = mvLastProgramError();
    } else if (strcmp(op, "scan_expansions") == 0) {
      mvExpRescan();
      mvExpEnsureTags();
      s_forceTelemetry = true;
      JsonObject out = res.createNestedObject("body");
      appendExpansionModules(out);
      out["tagCount"] = mvTagCount();
      MV_LOG2("scan_expansions modules=", mvExpDetectedCount());
    } else if (strcmp(op, "runtime_start") == 0) {
      if (mvDeviceModeRemoteIo()) {
        g_scanMs = (*req)["body"]["scanMs"] | MV_SCAN_MS_DEFAULT;
        g_runtimeRunning = true;
        g_lastScanMs = millis();
        JsonObject out = res.createNestedObject("body");
        out["running"] = true;
        out["scanMs"] = g_scanMs;
        out["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
        out["stDisabled"] = true;
        MV_LOG_CMD2("runtime_start remote_io scanMs=", g_scanMs);
      } else {
        g_scanMs = (*req)["body"]["scanMs"] | MV_SCAN_MS_DEFAULT;
        mvOneShotReset();
        g_runtimeRunning = true;
        g_lastScanMs = millis();
        MV_LOG_CMD2("runtime_start scanMs=", g_scanMs);
        JsonObject out = res.createNestedObject("body");
        out["running"] = true;
        out["scanMs"] = g_scanMs;
      }
    } else if (strcmp(op, "runtime_stop") == 0) {
      g_runtimeRunning = false;
      JsonObject out = res.createNestedObject("body");
      out["running"] = false;
    } else if (strcmp(op, "runtime_status") == 0) {
      s_forceTelemetry = true;
      JsonObject out = res.createNestedObject("body");
      out["running"] = g_runtimeRunning;
      out["scanMs"] = g_scanMs;
      out["programOk"] = mvProgramValid();
      out["programError"] = mvLastProgramError();
      out["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
      out["mqttBufferBytes"] = s_mqttBufferBytes;
      out["firmwareVersion"] = MV_FIRMWARE_VERSION;
    } else if (strcmp(op, "write_outputs") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        JsonObject outputs = body["outputs"].as<JsonObject>();
        if (outputs.isNull()) {
          ok = false;
          errMsg = "missing outputs";
        } else {
          uint8_t n = 0;
          for (JsonPair kv : outputs) {
            const char* tagId = kv.key().c_str();
            if (!tagId || !tagId[0]) continue;
            if (kv.value().is<bool>()) mvSetBool(tagId, kv.value().as<bool>());
            else if (kv.value().is<int>()) mvSetInt(tagId, kv.value().as<int>());
            else mvSetReal(tagId, kv.value().as<float>());
            n++;
          }
          mvWritePhysicalOutputs();
          mvExpWriteOutputs();
          s_forceTelemetry = true;
          JsonObject out = res.createNestedObject("body");
          out["written"] = n;
          MV_LOG2("write_outputs tags=", n);
        }
      }
    } else if (strcmp(op, "set_device_mode") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        const char* mode = body["mode"] | body["deviceMode"] | "";
        uint8_t next = MV_DEVICE_STANDALONE;
        if (strcmp(mode, "remote_io") == 0) next = MV_DEVICE_REMOTE_IO;
        else if (strcmp(mode, "standalone") == 0) next = MV_DEVICE_STANDALONE;
        else {
          ok = false;
          errMsg = "mode must be standalone or remote_io";
        }
        if (ok && !mvDeviceModeSet(next)) {
          ok = false;
          errMsg = "set_device_mode save failed";
        } else if (ok) {
          if (next == MV_DEVICE_REMOTE_IO) {
            g_runtimeRunning = true;
            g_lastScanMs = millis();
          }
          JsonObject out = res.createNestedObject("body");
          out["deviceMode"] = mvDeviceModeString(next);
          out["rebootRecommended"] = true;
          MV_LOG2("set_device_mode ", mvDeviceModeString(next));
        }
      }
    } else if (strcmp(op, "set_force") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        const char* tagId = body["tagId"] | body["id"] | "";
        const bool fin = body["forceInput"] | false;
        const bool fout = body["forceOutput"] | false;
        bool hasVal = body.containsKey("forceValue");
        bool bVal = false;
        int32_t iVal = 0;
        float rVal = 0.0f;
        if (hasVal) {
          if (body["forceValue"].is<bool>()) bVal = body["forceValue"].as<bool>();
          else if (body["forceValue"].is<int>()) {
            iVal = body["forceValue"].as<int32_t>();
            bVal = iVal != 0;
          } else {
            rVal = body["forceValue"].as<float>();
            bVal = rVal != 0.0f;
          }
        }
        if (!tagId[0] || !mvTagSetForce(tagId, fin, fout, hasVal, bVal, iVal, rVal)) {
          ok = false;
          errMsg = "set_force failed";
        } else {
          s_forceTelemetry = true;
          MV_LOG2("set_force ", tagId);
        }
      }
    } else if (strcmp(op, "clear_force") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      const char* tagId = body.isNull() ? "" : (body["tagId"] | body["id"] | "");
      if (!tagId[0] || !mvTagClearForce(tagId)) {
        ok = false;
        errMsg = "clear_force failed";
      } else {
        s_forceTelemetry = true;
        MV_LOG2("clear_force ", tagId);
      }
    } else if (strcmp(op, "sync_time") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        const uint32_t unixUtc = body["unixUtc"] | 0u;
        const int tzOffsetMin = body["tzOffsetMin"] | 0;
        if (unixUtc < 1577836800u) {
          ok = false;
          errMsg = "invalid unixUtc";
        } else {
          mvRtcSetSoftwareClock(unixUtc, tzOffsetMin);
          mvRtcQueueUnixTz(unixUtc, tzOffsetMin);
          JsonObject out = res.createNestedObject("body");
          out["unixUtc"] = unixUtc;
          out["tzOffsetMin"] = tzOffsetMin;
          out["wallClockSet"] = mvRtcHasWallClock();
          MV_LOG2("sync_time utc=", (int)unixUtc);
        }
      }
    } else {
      ok = false;
      errMsg = "unknown op";
    }
  }

  res["ok"] = ok;
  if (errMsg) res["error"] = errMsg;
  serializeJson(res, responseOut);
  return true;
}

void mvMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs) {
  if (!s_mqtt.connected() || s_pauseTelemetry) return;
  unsigned long now = millis();
  if (!s_forceTelemetry && now - s_lastReport < s_cfg.reportMs) return;
  s_lastReport = now;
  s_forceTelemetry = false;

  StaticJsonDocument<16384>& doc = s_telemetryDoc;
  doc.clear();
  doc["deviceId"] = s_cfg.deviceId;
  doc["name"] = "Arduino Opta ST";
  doc["platform"] = "arduino-opta-mqtt-st";
  doc["firmwareVersion"] = MV_FIRMWARE_VERSION;
  doc["protocolVersion"] = MV_PROTOCOL_VERSION;
  doc["ethIp"] = Ethernet.localIP().toString();
  doc["mqttBroker"] = s_brokerHost;
  doc["mqttBrokerPort"] = s_cfg.port;
  doc["mqttBufferBytes"] = s_mqttBufferBytes;
  doc["reportIntervalSec"] = (int)(s_cfg.reportMs / 1000);
  doc["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
  // ATECC serial omitted from MQTT telemetry (privacy); available locally on /setup and /api/status.

  JsonObject rt = doc.createNestedObject("runtime");
  rt["running"] = runtimeRunning;
  rt["scanMs"] = scanMs;
  rt["cycles"] = cycles;
  rt["lastCycleUs"] = lastCycleUs;
  rt["programOk"] = mvProgramValid();
  if (mvProgramName()[0]) rt["programName"] = mvProgramName();
  rt["programFromNv"] = mvProgramStoreProgramFromNv();
  rt["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
  rt["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
  if (mvProgramStoreBcCrc()) rt["programNvCrc"] = mvProgramStoreBcCrc();

  appendExpansionModules(doc.as<JsonObject>());

  JsonArray tags = doc.createNestedArray("tags");
  mvTagsToParcIoMapJson(tags);

  if (mvBcTracePointCount() > 0 && !doc.overflowed()) {
    JsonArray pt = doc.createNestedArray("programTrace");
    mvBcAppendProgramTrace(pt);
  }

  if (doc.overflowed()) {
    doc.remove("programTrace");
  }

  size_t written = serializeJson(doc, s_telemetryJson, sizeof(s_telemetryJson));
  if (written == 0 || doc.overflowed()) {
    doc.remove("programTrace");
    written = serializeJson(doc, s_telemetryJson, sizeof(s_telemetryJson));
  }
  if (written == 0 || s_telemetryJson[0] == '\0') return;
  s_mqtt.publish(s_topicTelemetry, s_telemetryJson, false);
  mvGlobalMqttPublishAll(s_mqtt, s_cfg.topicPrefix);
}
