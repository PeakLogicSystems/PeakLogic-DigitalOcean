#include "mv_mqtt.h"
#include "mv_ct_cal.h"
#include "mv_ahu_env_cal.h"
#include "mv_version.h"
#include "mv_config.h"
#include "mv_store.h"
#include "mv_st.h"
#include "mv_bc.h"
#include "mv_tags.h"
#include "mv_io_map.h"
#include "mv_expansions.h"
#include "mv_debug.h"
#include "mv_rtc.h"
#include "mv_program_store.h"
#include "mv_store.h"
#include "mv_global_mqtt.h"
#include "mv_global_key.h"
#include "mv_watchdog.h"
#include "mv_edge_ai.h"
#include "mv_identity.h"
#include "mv_mcsa_mon.h"
#include "mv_http.h"
#include <Ethernet.h>
#if __has_include(<EthernetSSLClient.h>)
#include <EthernetSSLClient.h>
#define MV_MQTT_HAS_TLS 1
#endif
#ifndef MV_MQTT_HAS_TLS
#define MV_MQTT_HAS_TLS 0
#endif
#if __has_include("mv_mqtt_ca.h")
#include "mv_mqtt_ca.h"
#endif

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

static EthernetClient s_ethPlain;
#if MV_MQTT_HAS_TLS
static arduino::EthernetSSLClient s_ethTls;
#endif
static PubSubClient s_mqttPlain(s_ethPlain);
#if MV_MQTT_HAS_TLS
static PubSubClient s_mqttTls(s_ethTls);
#endif
static PubSubClient* s_mqtt = &s_mqttPlain;
static bool s_useTls = false;
static unsigned long s_mqttNextConnectMs = 0;
static MvMqttConfig s_cfg;
static char s_brokerHost[64];
static char s_mqttUser[32];
static char s_mqttPass[MV_MQTT_PASSWORD_SIZE];
static bool s_mqttAuthSet = false;
static bool s_mqttAuthFailed = false;
static bool s_mqttEverConnected = false;
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
static uint16_t mvMqttEnsureBufferOn(PubSubClient& client) {
  for (uint32_t want = MQTT_MAX_PACKET_SIZE; want >= MV_MQTT_MIN_PACKET_SIZE; want /= 2) {
    if (client.setBufferSize((uint16_t)want)) return (uint16_t)want;
  }
  return 256;
}

static uint16_t mvMqttEnsureBuffer() {
  if (s_mqttBufferBytes >= MV_MQTT_MIN_PACKET_SIZE) return s_mqttBufferBytes;
  const uint16_t plain = mvMqttEnsureBufferOn(s_mqttPlain);
#if MV_MQTT_HAS_TLS
  mvMqttEnsureBufferOn(s_mqttTls);
#endif
  s_mqttBufferBytes = plain;
  if (s_mqttBufferBytes >= MV_MQTT_MIN_PACKET_SIZE) {
    MV_LOG_CMD2("MQTT packet buffer bytes=", (int)s_mqttBufferBytes);
    return s_mqttBufferBytes;
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
  if (!s_mqtt->connected()) return;
  for (uint8_t i = 0; i < rounds; i++) s_mqtt->loop();
}

static bool publishCmdResponseNow(const char* json) {
  if (!json || !json[0] || !s_mqtt->connected()) return false;
  const size_t n = strlen(json);
  if (n == 0 || n >= sizeof(s_cmdResponseQueue)) return false;
  return s_mqtt->publish(s_topicCmdRes, (const uint8_t*)json, n, false);
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
  mvHttpPumpClients(2);
#endif
  if (s_mqtt->connected()) {
    for (uint8_t i = 0; i < 6; i++) s_mqtt->loop();
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

  mvWatchdogNoteActivity();

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
          mvTagsBegin();
          mvExpEnsureTags();
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
    || strcmp(op, "write_memory") == 0
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
  mvWatchdogNoteActivity();

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
        mvMqttSetReportMs(doc["reportMs"].as<uint32_t>());
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
  mvHttpPumpClients(2);
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

static bool mvMqttHostIsIp(const char* host) {
  if (!host || !host[0]) return false;
  for (const char* p = host; *p; p++) {
    if ((*p < '0' || *p > '9') && *p != '.') return false;
  }
  return true;
}

static void mvMqttStopTransports() {
  s_mqttPlain.disconnect();
#if MV_MQTT_HAS_TLS
  s_mqttTls.disconnect();
#endif
}

static void mvMqttSelectTransport(bool useTls) {
  s_useTls = useTls && MV_MQTT_HAS_TLS;
#if MV_MQTT_HAS_TLS
  if (s_useTls) {
    s_mqtt = &s_mqttTls;
    return;
  }
#endif
  (void)useTls;
  s_mqtt = &s_mqttPlain;
}

#if MV_MQTT_HAS_TLS
static void mvMqttLoadCa(arduino::EthernetSSLClient& tls) {
#if __has_include("mv_mqtt_ca.h")
  /* setCACert replaces the store and skips Opta's broken QSPI /wlan CA mount. */
  tls.setCACert(mv_mqtt_ca_pem);
#endif
}
#endif

static void mvMqttApplyTlsCert() {
#if MV_MQTT_HAS_TLS
  if (!s_useTls) return;
  mvMqttLoadCa(s_ethTls);
  if (mvMqttHostIsIp(s_brokerHost)) s_ethTls.disableSNI(true);
  else s_ethTls.disableSNI(false);
#endif
}

static void mvMqttConfigureClient(const MvDeviceConfig* devCfg) {
  bool wantTls = false;
  if (devCfg && devCfg->mqttUseTls) wantTls = true;
  else if (s_cfg.port == 8883) wantTls = true;
  else if (MV_MQTT_SKETCH_TLS_DEFAULT && !devCfg) wantTls = true;
  if (wantTls && s_cfg.port == 1883) s_cfg.port = 8883;
  mvMqttStopTransports();
  mvMqttSelectTransport(wantTls);
  mvMqttApplyTlsCert();
  s_mqtt->setServer(s_brokerHost, s_cfg.port);
  s_mqtt->setKeepAlive(30);
#if defined(PUBSUBCLIENT_VERSION)
  s_mqtt->setSocketTimeout(s_useTls ? 5 : 3);
#endif
  s_mqtt->setCallback(mqttCallback);
  mvMqttEnsureBufferOn(*s_mqtt);
}

uint32_t mvMqttReportMs() {
  return s_cfg.reportMs ? s_cfg.reportMs : MV_REPORT_MS_DEFAULT;
}

bool mvMqttSetReportMs(uint32_t ms) {
  if (ms < MV_REPORT_MS_MIN || ms > MV_REPORT_MS_MAX) return false;
  s_cfg.reportMs = ms;
  s_forceTelemetry = true;
  return true;
}

static void mvMqttApplyReportMs(const MvDeviceConfig* devCfg) {
  uint32_t ms = (devCfg && devCfg->reportMs) ? devCfg->reportMs : MV_REPORT_MS_DEFAULT;
  if (ms < MV_REPORT_MS_MIN || ms > MV_REPORT_MS_MAX) ms = MV_REPORT_MS_DEFAULT;
  s_cfg.reportMs = ms;
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
  s_mqttAuthSet = false;
  s_mqttUser[0] = '\0';
  s_mqttPass[0] = '\0';
  const bool cloudTls = (devCfg && devCfg->mqttUseTls) || s_cfg.port == 8883;
  if (devCfg && devCfg->mqttAuthSet && devCfg->mqttUsername[0]) {
    strncpy(s_mqttUser, devCfg->mqttUsername, sizeof(s_mqttUser) - 1);
    s_mqttUser[sizeof(s_mqttUser) - 1] = '\0';
    strncpy(s_mqttPass, devCfg->mqttPassword, sizeof(s_mqttPass) - 1);
    s_mqttPass[sizeof(s_mqttPass) - 1] = '\0';
    s_mqttAuthSet = true;
  } else if (cloudTls && MV_MQTT_SKETCH_USER_DEFAULT[0]) {
    strncpy(s_mqttUser, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(s_mqttUser) - 1);
    s_mqttUser[sizeof(s_mqttUser) - 1] = '\0';
    strncpy(s_mqttPass, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(s_mqttPass) - 1);
    s_mqttPass[sizeof(s_mqttPass) - 1] = '\0';
    s_mqttAuthSet = true;
  }
}

void mvMqttGetBroker(char* hostOut, size_t hostLen, uint16_t* portOut) {
  if (hostOut && hostLen) {
    strncpy(hostOut, s_brokerHost, hostLen - 1);
    hostOut[hostLen - 1] = '\0';
  }
  if (portOut) *portOut = s_cfg.port;
}

bool mvMqttAuthConfigured() {
  return s_mqttAuthSet;
}

bool mvMqttAuthFailed() {
  return s_mqttAuthFailed;
}

void mvMqttBegin(const MvMqttConfig* cfg, const MvDeviceConfig* devCfg) {
  if (!cfg) return;
  s_cfg = *cfg;
  mvMqttResolveBroker(cfg, devCfg);
  mvMqttApplyReportMs(devCfg);
  mvMqttRefreshTopics();
  mvMqttConfigureClient(devCfg);
  mvGlobalMqttBegin(*s_mqtt, s_cfg.topicPrefix);
  s_mqttBufferBytes = mvMqttEnsureBuffer();
}

void mvMqttApplyDeviceConfig(const MvDeviceConfig* devCfg) {
  mvMqttResolveBroker(&s_cfg, devCfg);
  mvMqttApplyReportMs(devCfg);
  mvMqttConfigureClient(devCfg);
  mvMqttRefreshTopics();
  s_mqttNextConnectMs = 0;
  s_forceTelemetry = true;
  MV_LOG_CMD2("MQTT broker updated ", s_brokerHost);
}

void mvMqttLoop() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpPumpClients(2);
#endif
  if (!s_mqtt->connected()) {
    const unsigned long now = millis();
    if (s_mqttNextConnectMs && (long)(now - s_mqttNextConnectMs) < 0) {
      return;
    }
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
    if (mvHttpHasPendingClients() || mvHttpRecentActivity()) {
      s_mqttNextConnectMs = now + 1000;
      return;
    }
    mvHttpPumpClients(2);
#endif
    if (s_cfg.port == 8883 && !MV_MQTT_HAS_TLS) {
      MV_LOG_CMD("MQTT TLS required for port 8883 — EthernetSSLClient missing from Opta core");
      s_mqttNextConnectMs = now + 15000;
      return;
    }
    bool ok = false;
    /* Connect without LWT — same as setup-test. Mosquitto "not authorized" can fire on CONNECT
     * when a will topic is set and ACLs disagree; publish retained online after connect instead. */
    if (s_mqttAuthSet) {
      ok = s_mqtt->connect(s_mqttClientId, s_mqttUser, s_mqttPass);
    } else {
      ok = s_mqtt->connect(s_mqttClientId);
    }
    if (ok) {
      s_mqttAuthFailed = false;
      s_mqttEverConnected = true;
      s_mqttNextConnectMs = 0;
      mvWatchdogNoteActivity();
      const bool subCmd = s_mqtt->subscribe(s_topicCmd, 1);
      const bool subCfg = s_mqtt->subscribe(s_topicConfig, 1);
      s_mqtt->publish(s_topicOnline, "{\"online\":true}", true);
      MV_LOG_CMD2("MQTT connected broker ", s_brokerHost);
      if (!subCmd || !subCfg) {
        MV_LOG_CMD("MQTT subscribe FAILED — commands will timeout");
      } else {
        MV_LOG_CMD("MQTT subscribed cmd+config");
      }
      mvGlobalMqttOnConnect(*s_mqtt, s_cfg.topicPrefix);
      s_forceTelemetry = true;
      s_lastReport = 0;
    } else {
      s_mqttAuthFailed = s_mqttAuthSet;
      uint32_t waitMs = (s_cfg.port == 8883 || s_useTls) ? (s_mqttAuthSet ? 30000u : 10000u) : 3000u;
      s_mqttNextConnectMs = now + waitMs;
      static unsigned long s_lastConnectFailLogMs = 0;
      if (now - s_lastConnectFailLogMs >= 30000) {
        s_lastConnectFailLogMs = now;
        if (s_mqttAuthSet) {
          MV_LOG_CMD2("MQTT connect refused (auth) broker ", s_brokerHost);
        } else {
          MV_LOG_CMD2("MQTT connect failed broker ", s_brokerHost);
        }
      }
    }
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
    mvHttpPumpClients(2);
#endif
  }
  if (s_mqtt->connected()) mvWatchdogNoteActivity();
  s_mqtt->loop();
  mqttFlushQueuedResponse();
  mqttPumpOutbox(2);
}

bool mvMqttConnected() { return s_mqtt->connected(); }

bool mvMqttEverConnected() { return s_mqttEverConnected; }

void mvMqttSetPauseTelemetry(bool pause) { s_pauseTelemetry = pause; }

bool mvMqttTelemetryPaused() { return s_pauseTelemetry; }

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
    } else if (strcmp(op, "write_memory") == 0) {
      JsonObject body = (*req)["body"].as<JsonObject>();
      if (body.isNull()) {
        ok = false;
        errMsg = "missing body";
      } else {
        JsonArray tags = body["tags"].as<JsonArray>();
        if (tags.isNull()) {
          ok = false;
          errMsg = "missing tags";
        } else {
          uint8_t n = 0;
          for (JsonObject row : tags) {
            const char* tagId = row["id"] | "";
            if (!tagId[0]) continue;
            if (mvWriteMemoryValue(tagId, row["value"])) n++;
          }
          s_forceTelemetry = true;
          JsonObject out = res.createNestedObject("body");
          out["written"] = n;
          MV_LOG2("write_memory tags=", n);
        }
      }
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
            iVal = (int32_t)rVal;
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
  if (!s_mqtt->connected() || s_pauseTelemetry) return;
  unsigned long now = millis();
  if (!s_forceTelemetry && now - s_lastReport < s_cfg.reportMs) return;
  s_lastReport = now;
  s_forceTelemetry = false;
  mvWatchdogNoteActivity();

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
  doc["mqttTls"] = s_useTls;
  doc["mqttAuth"] = s_mqttAuthSet;
  if (s_mqttAuthFailed) doc["mqttAuthFailed"] = true;
  doc["mqttBufferBytes"] = s_mqttBufferBytes;
  doc["reportIntervalSec"] = (int)(s_cfg.reportMs / 1000);
  doc["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
  doc["globalSiteKey"] = mvGlobalSiteKey();
  {
    char addrKey[5];
    if (mvGlobalAddrKey(addrKey)) doc["globalAddrKey"] = addrKey;
  }
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
  mvEdgeAiAppendRuntime(rt);

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

  mvEdgeAiAppendTelemetry(doc);

  if (!doc.overflowed()) {
    mvMcsaMonAppendTelemetry(doc);
  }

  if (!doc.overflowed()) {
    mvCtCalAppendTelemetry(doc.as<JsonObject>());
  }

  if (!doc.overflowed()) {
    mvAhuEnvCalAppendTelemetry(doc.as<JsonObject>());
  }

  size_t written = serializeJson(doc, s_telemetryJson, sizeof(s_telemetryJson));
  if (written == 0 || doc.overflowed()) {
    doc.remove("programTrace");
    if (doc.overflowed()) {
      JsonObject ct = doc["ctCal"];
      if (!ct.isNull()) ct.remove("channels");
    }
    written = serializeJson(doc, s_telemetryJson, sizeof(s_telemetryJson));
  }
  if (written == 0 || s_telemetryJson[0] == '\0') return;
  s_mqtt->publish(s_topicTelemetry, s_telemetryJson, false);
  mvGlobalMqttPublishAll(*s_mqtt, s_cfg.topicPrefix);
}

void mvMqttRequestTelemetryFlush() {
  s_forceTelemetry = true;
}

static const char* mvMqttStateMessage(int state) {
  switch (state) {
    case -4: return "Connection timeout — check broker host, port, and firewall";
    case -3: return "Connection lost";
    case -2: return "Connect failed — broker unreachable or wrong host/port";
    case -1: return "Not connected";
    case 1: return "Unacceptable protocol version";
    case 2: return "Identifier rejected";
    case 3: return "Server unavailable";
    case 4: return "Bad username or password";
    case 5: return "Not authorized";
    default: return "MQTT connect failed";
  }
}

bool mvMqttTestConnection(const char* host, uint16_t port, const char* user, const char* pass,
                          char* errOut, size_t errLen, int* stateOut, bool useTls) {
  auto setErr = [&](const char* msg) {
    if (errOut && errLen) {
      strncpy(errOut, msg ? msg : "MQTT test failed", errLen - 1);
      errOut[errLen - 1] = '\0';
    }
  };
  if (!host || !host[0]) {
    setErr("Broker host required");
    if (stateOut) *stateOut = -1;
    return false;
  }
  if (!strcmp(host, "127.0.0.1") || !strcmp(host, "localhost")) {
    setErr("Broker cannot be 127.0.0.1 on device — use PeakLogic / cloud LAN IP");
    if (stateOut) *stateOut = -1;
    return false;
  }
  if (Ethernet.localIP() == IPAddress(0, 0, 0, 0)) {
    setErr("Ethernet not connected — check cable and IP settings (reboot after static IP save)");
    if (stateOut) *stateOut = -1;
    return false;
  }
  if (port < 1 || port > 65535) port = 1883;
  if (port == 8883) useTls = true;
  if (useTls && port == 1883) port = 8883;
  if (useTls && !MV_MQTT_HAS_TLS) {
    setErr("TLS required for port 8883 — EthernetSSLClient missing from Opta core");
    if (stateOut) *stateOut = -2;
    return false;
  }

  if (!mvMqttHostIsIp(host)) {
    NetworkInterface* nif = Ethernet.getNetwork();
    SocketAddress sa;
    const nsapi_error_t dnsErr = nif ? nif->gethostbyname(host, &sa) : NSAPI_ERROR_NO_CONNECTION;
    if (dnsErr != NSAPI_ERROR_OK) {
      char buf[128];
      snprintf(buf, sizeof(buf), "DNS failed for %s (err %d) — check DNS/gateway", host, (int)dnsErr);
      setErr(buf);
      if (stateOut) *stateOut = -2;
      return false;
    }
  }

  const bool useAuth = user && user[0];
  if (useAuth && (!pass || !pass[0])) {
    setErr("MQTT password required when username is set");
    if (stateOut) *stateOut = 4;
    return false;
  }

  /* Free the live MQTT socket — Opta Ethernet cannot TLS-handshake while HTTP/MQTT hold it. */
  s_mqtt->disconnect();
  Ethernet.maintain();

  static EthernetClient s_testEthPlain;
#if MV_MQTT_HAS_TLS
  static arduino::EthernetSSLClient s_testEthTls;
#endif
  static PubSubClient s_testMqttPlain(s_testEthPlain);
#if MV_MQTT_HAS_TLS
  static PubSubClient s_testMqttTls(s_testEthTls);
#endif
  PubSubClient* testMqtt = &s_testMqttPlain;
#if MV_MQTT_HAS_TLS
  if (useTls) {
    testMqtt = &s_testMqttTls;
    mvMqttLoadCa(s_testEthTls);
    if (mvMqttHostIsIp(host)) s_testEthTls.disableSNI(true);
    else s_testEthTls.disableSNI(false);
  }
#endif
  testMqtt->setBufferSize(256);
  testMqtt->setServer(host, port);
  testMqtt->setKeepAlive(15);
#if defined(PUBSUBCLIENT_VERSION)
  testMqtt->setSocketTimeout(useTls ? 20 : 8);
#endif

  const char* devId = mvIdentityDeviceId();
  char testClientId[48];
  snprintf(testClientId, sizeof(testClientId), "mv-opta-test-%s", devId ? devId : "setup");

  bool ok = false;
  if (useAuth) {
    ok = testMqtt->connect(testClientId, user, pass);
  } else {
    ok = testMqtt->connect(testClientId);
  }

  if (!ok) {
    const int st = testMqtt->state();
    if (stateOut) *stateOut = st;
    char buf[160];
    if (st == 4 || st == 5) {
      snprintf(buf, sizeof(buf),
               "%s (state %d) — user '%s' rejected. Type droplet MOSQUITTO_PASS, or leave blank for firmware default",
               mvMqttStateMessage(st), st, useAuth ? user : "(none)");
    } else if (useTls) {
      snprintf(buf, sizeof(buf),
               "TLS failed %s:%u (state %d) — %s",
               host, (unsigned)port, st, mvMqttStateMessage(st));
    } else {
      snprintf(buf, sizeof(buf), "%s (state %d)", mvMqttStateMessage(st), st);
    }
    setErr(buf);
    testMqtt->disconnect();
    Ethernet.maintain();
    return false;
  }

  char testTopic[96];
  snprintf(testTopic, sizeof(testTopic), "peaklogic/v1/%s/setup-test", devId ? devId : "opta");
  const bool pubOk = testMqtt->publish(testTopic, "{\"source\":\"opta-setup\",\"ok\":true}");
  testMqtt->disconnect();
  Ethernet.maintain();

  if (stateOut) *stateOut = 0;
  if (!pubOk) {
    setErr("Connected but test publish failed");
    return false;
  }
  if (errOut && errLen) errOut[0] = '\0';
  return true;
}

static bool s_mqttTestPending = false;
static bool s_mqttTestRunning = false;
static bool s_mqttTestDone = false;
static bool s_mqttTestOk = false;
static int s_mqttTestState = -2;
static bool s_mqttTestTls = false;
static uint16_t s_mqttTestPort = 1883;
static char s_mqttTestHost[64];
static char s_mqttTestUser[32];
static char s_mqttTestPass[MV_MQTT_PASSWORD_SIZE];
static char s_mqttTestErr[160];
static unsigned long s_mqttTestReadyMs = 0;

bool mvMqttTestBusy() {
  if (s_mqttTestRunning) return true;
  /* Cap the HTTP-block window so a stuck TLS test cannot blank Chrome forever. */
  if (s_mqttTestPending && (long)(millis() - s_mqttTestReadyMs) >= 0) {
    if ((long)(millis() - s_mqttTestReadyMs) > 45000L) {
      s_mqttTestPending = false;
      s_mqttTestRunning = false;
      s_mqttTestDone = true;
      s_mqttTestOk = false;
      s_mqttTestState = -4;
      strncpy(s_mqttTestErr, "MQTT test timed out", sizeof(s_mqttTestErr) - 1);
      return false;
    }
    return true;
  }
  return false;
}

bool mvMqttTestQueue(const char* host, uint16_t port, const char* user, const char* pass, bool useTls) {
  if (!host || !host[0]) return false;
  if (s_mqttTestPending) return false;
  strncpy(s_mqttTestHost, host, sizeof(s_mqttTestHost) - 1);
  s_mqttTestHost[sizeof(s_mqttTestHost) - 1] = '\0';
  s_mqttTestPort = port;
  s_mqttTestTls = useTls;
  s_mqttTestUser[0] = '\0';
  s_mqttTestPass[0] = '\0';
  if (user && user[0]) {
    strncpy(s_mqttTestUser, user, sizeof(s_mqttTestUser) - 1);
    s_mqttTestUser[sizeof(s_mqttTestUser) - 1] = '\0';
  }
  if (pass && pass[0]) {
    strncpy(s_mqttTestPass, pass, sizeof(s_mqttTestPass) - 1);
    s_mqttTestPass[sizeof(s_mqttTestPass) - 1] = '\0';
  }
  s_mqttTestPending = true;
  s_mqttTestDone = false;
  s_mqttTestOk = false;
  s_mqttTestState = -2;
  s_mqttTestErr[0] = '\0';
  s_mqttTestReadyMs = millis() + 400;
  MV_LOG_CMD("MQTT test queued (runs after HTTP idle)");
  return true;
}

void mvMqttTestPoll() {
  if (!s_mqttTestPending) return;
  if ((long)(millis() - s_mqttTestReadyMs) < 0) return;
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  if (mvHttpHasPendingClients()) return;
#endif
  s_mqttTestPending = false;
  s_mqttTestRunning = true;
  MV_LOG_CMD("MQTT test start (HTTP idle)");
  s_mqttTestOk = mvMqttTestConnection(s_mqttTestHost, s_mqttTestPort,
                                      s_mqttTestUser[0] ? s_mqttTestUser : nullptr,
                                      s_mqttTestPass[0] ? s_mqttTestPass : nullptr,
                                      s_mqttTestErr, sizeof(s_mqttTestErr),
                                      &s_mqttTestState, s_mqttTestTls);
  s_mqttTestRunning = false;
  s_mqttTestDone = true;
  MV_LOG_CMD2("MQTT test done ok=", s_mqttTestOk ? 1 : 0);

  /* Setup-test can use a typed password while live MQTT still has a stale NV secret.
   * On success, write the working credentials to NV and reconfigure the live client. */
  if (s_mqttTestOk && s_mqttTestHost[0]) {
    MvDeviceConfig cfg;
    const MvDeviceConfig* cur = mvStoreActive();
    if (cur) cfg = *cur;
    else mvStoreDefaults(&cfg);
    strncpy(cfg.mqttBrokerHost, s_mqttTestHost, sizeof(cfg.mqttBrokerHost) - 1);
    cfg.mqttBrokerHost[sizeof(cfg.mqttBrokerHost) - 1] = '\0';
    cfg.mqttBrokerPort = s_mqttTestPort ? s_mqttTestPort : (s_mqttTestTls ? 8883 : 1883);
    cfg.mqttBrokerSet = 1;
    cfg.mqttUseTls = s_mqttTestTls ? 1 : 0;
    if (s_mqttTestUser[0]) {
      strncpy(cfg.mqttUsername, s_mqttTestUser, sizeof(cfg.mqttUsername) - 1);
      cfg.mqttUsername[sizeof(cfg.mqttUsername) - 1] = '\0';
    } else if (s_mqttTestTls && !cfg.mqttUsername[0]) {
      strncpy(cfg.mqttUsername, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(cfg.mqttUsername) - 1);
      cfg.mqttUsername[sizeof(cfg.mqttUsername) - 1] = '\0';
    }
    if (s_mqttTestPass[0]) {
      strncpy(cfg.mqttPassword, s_mqttTestPass, sizeof(cfg.mqttPassword) - 1);
      cfg.mqttPassword[sizeof(cfg.mqttPassword) - 1] = '\0';
    } else if (s_mqttTestTls) {
      strncpy(cfg.mqttPassword, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(cfg.mqttPassword) - 1);
      cfg.mqttPassword[sizeof(cfg.mqttPassword) - 1] = '\0';
    }
    if (cfg.mqttUseTls) cfg.mqttAuthSet = (cfg.mqttUsername[0] && cfg.mqttPassword[0]) ? 1 : 0;
    if (mvStoreSave(&cfg)) {
      mvMqttApplyDeviceConfig(&cfg);
      s_mqttNextConnectMs = 0;
      MV_LOG_CMD("MQTT test OK — credentials saved to NV for live session");
    }
  }
}

void mvMqttTestStatus(bool* pending, bool* done, bool* ok, int* state, char* errOut, size_t errLen,
                      char* brokerOut, size_t brokerLen, uint16_t* portOut, bool* tlsOut) {
  if (pending) *pending = s_mqttTestPending;
  if (done) *done = s_mqttTestDone;
  if (ok) *ok = s_mqttTestOk;
  if (state) *state = s_mqttTestState;
  if (errOut && errLen) {
    strncpy(errOut, s_mqttTestErr, errLen - 1);
    errOut[errLen - 1] = '\0';
  }
  if (brokerOut && brokerLen) {
    strncpy(brokerOut, s_mqttTestHost, brokerLen - 1);
    brokerOut[brokerLen - 1] = '\0';
  }
  if (portOut) *portOut = s_mqttTestPort;
  if (tlsOut) *tlsOut = s_mqttTestTls;
}
