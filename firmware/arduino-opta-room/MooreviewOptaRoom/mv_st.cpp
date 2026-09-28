#include "mv_st.h"
#include "mv_bc.h"
#include "mv_base64.h"
#include "mv_tags.h"
#include "mv_expansions.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_rtc.h"
#include "mv_version.h"
#include "mv_program_store.h"
#include <string.h>

static char g_progErr[128];
static char g_programName[64];
static bool g_hasProgram = false;
static uint8_t g_bcDecode[MV_BC_MAX];
static volatile bool g_programInstallBusy = false;

bool mvProgramInstallBusy() { return g_programInstallBusy; }

void mvProgramInstallSetBusy(bool busy) { g_programInstallBusy = busy; }

uint8_t* mvProgramScratchBuf() { return g_bcDecode; }

size_t mvProgramScratchCap() { return sizeof(g_bcDecode); }

void mvOneShotReset() { mvBcOneShotReset(); }

const char* mvLastProgramError() { return g_progErr; }

const char* mvProgramName() { return g_programName; }

const char* mvProgramShortName() {
  if (!g_programName[0]) return "";
  const char* slash = strrchr(g_programName, '/');
  const char* bslash = strrchr(g_programName, '\\');
  const char* base = g_programName;
  if (slash && slash + 1 > base) base = slash + 1;
  if (bslash && bslash + 1 > base) base = bslash + 1;
  return base;
}

bool mvProgramClear() {
  g_hasProgram = false;
  g_progErr[0] = 0;
  g_programName[0] = 0;
  mvBcClear();
  mvProgramStoreClearNv();
  return true;
}

bool mvProgramCommitNvLoad(const char* programName, uint16_t traceCount) {
  g_progErr[0] = 0;
  g_programName[0] = '\0';
  if (programName && programName[0]) {
    strncpy(g_programName, programName, sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  if (!mvBcHasProgram()) {
    strncpy(g_progErr, "NV bc missing", sizeof(g_progErr) - 1);
    return false;
  }
  mvBcSetTracePointCount(traceCount);
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  return true;
}

bool mvProgramLoadFromNv(const char* programName, uint16_t traceCount, const uint8_t* bc, size_t bcLen) {
  g_progErr[0] = 0;
  g_programName[0] = '\0';
  if (programName && programName[0]) {
    strncpy(g_programName, programName, sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  if (!bc || !bcLen) {
    strncpy(g_progErr, "NV bc missing", sizeof(g_progErr) - 1);
    return false;
  }
  if (!mvBcLoad(bc, bcLen, g_progErr, sizeof(g_progErr))) {
    return false;
  }
  mvBcSetTracePointCount(traceCount);
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  return true;
}

void mvProgramOnLoaded(JsonObject root) {
  if (!root.isNull() && root["autoRunOnBoot"].is<bool>()) {
    mvProgramStoreSetAutoRun(root["autoRunOnBoot"].as<bool>());
  }
  mvProgramStoreQueueSave(g_programName, mvBcTracePointCount());
}

static bool mvProgramApplyDecoded(JsonObject root, const uint8_t* decoded, size_t decodedLen) {
  g_progErr[0] = 0;
  g_programName[0] = '\0';
  if (root["programName"].is<const char*>()) {
    strncpy(g_programName, root["programName"].as<const char*>(), sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }

  const uint32_t clientTime = root["clientTimeUnix"] | 0u;
  const int tzOff = root["clientTzOffsetMin"] | 0;
  /** put_program does not sync RTC — use MQTT sync_time from PC (connect + daily). */
  (void)clientTime;
  (void)tzOff;

  if (!decoded || !decodedLen) {
    strncpy(g_progErr, "bc decode failed", sizeof(g_progErr) - 1);
    return false;
  }
  if (!mvBcLoad(decoded, decodedLen, g_progErr, sizeof(g_progErr))) {
    return false;
  }
  uint16_t traceCount = 0;
  if (root["tracePointCount"].is<int>() || root["tracePointCount"].is<uint16_t>()) {
    const int n = root["tracePointCount"] | 0;
    traceCount = (n > 96) ? 96 : (n < 0 ? 0 : (uint16_t)n);
  } else if (root["traceMap"].is<JsonArray>()) {
    const size_t n = root["traceMap"].size();
    traceCount = (n > 96) ? 96 : (uint16_t)n;
  }
  mvBcSetTracePointCount(traceCount);
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  mvProgramOnLoaded(root);
  return true;
}

bool mvProgramApplyMeta(JsonObject root) {
  g_progErr[0] = 0;
  g_programName[0] = '\0';
  if (root["programName"].is<const char*>()) {
    strncpy(g_programName, root["programName"].as<const char*>(), sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  uint16_t traceCount = 0;
  if (root["tracePointCount"].is<int>() || root["tracePointCount"].is<uint16_t>()) {
    const int n = root["tracePointCount"] | 0;
    traceCount = (n > 96) ? 96 : (n < 0 ? 0 : (uint16_t)n);
  } else if (root["traceMap"].is<JsonArray>()) {
    const size_t n = root["traceMap"].size();
    traceCount = (n > 96) ? 96 : (uint16_t)n;
  }
  mvBcSetTracePointCount(traceCount);
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  mvProgramOnLoaded(root);
  return true;
}

bool mvProgramLoadFromDecoded(JsonObject root, const uint8_t* decoded, size_t decodedLen) {
  return mvProgramApplyDecoded(root, decoded, decodedLen);
}

void mvProgramSyncRtcFromBody(JsonObject root) {
  (void)root;
}

void mvProgramQueueRtcFromBody(JsonObject root) {
  (void)root;
  /** Disabled — HAL_RTC_SetTime blocks ~15s and breaks runtime_start after MQTT deploy. */
}

/** BSS JSON doc — HTTP PUT /api/program must not use stack DynamicJsonDocument (~8 KB). */
static StaticJsonDocument<MV_PROGRAM_JSON_MAX> s_wireProgramDoc;

void mvProgramQueueRtcFromWire() {
}

void mvProgramDrainPendingRtc() {
}

bool mvProgramLoadFromWireJson(const char* json, size_t len) {
  g_progErr[0] = 0;
  if (!json || !len) {
    strncpy(g_progErr, "missing body", sizeof(g_progErr) - 1);
    return false;
  }
  s_wireProgramDoc.clear();
  const DeserializationError err = deserializeJson(s_wireProgramDoc, json, len);
  if (err) {
    strncpy(g_progErr, "invalid json", sizeof(g_progErr) - 1);
    return false;
  }
  return mvProgramLoad(s_wireProgramDoc.as<JsonObject>());
}

bool mvProgramLoad(JsonObject root) {
  char protoErr[96];
  const int clientProto = root["protocolVersion"] | 0;
  const char* clientVer = root["clientVersion"] | "";
  if (!mvCheckClientProtocol(clientProto, clientVer, protoErr, sizeof(protoErr))) {
    g_progErr[0] = 0;
    strncpy(g_progErr, protoErr, sizeof(g_progErr) - 1);
    return false;
  }

  const char* bc = root["bc"];
  if (!bc || !bc[0]) {
    g_progErr[0] = 0;
    strncpy(g_progErr, "missing bc", sizeof(g_progErr) - 1);
    return false;
  }
  const size_t decoded = mvBase64Decode(bc, g_bcDecode, sizeof(g_bcDecode));
  if (!decoded) {
    g_progErr[0] = 0;
    strncpy(g_progErr, "bc decode failed", sizeof(g_progErr) - 1);
    return false;
  }
  return mvProgramApplyDecoded(root, g_bcDecode, decoded);
}

bool mvProgramValid() { return g_hasProgram && mvBcHasProgram(); }

void mvExecuteScan(uint32_t dtMs) {
  mvExpUpdate();
  mvReadPhysicalInputs();
  mvApplyForcesAfterRead();
  mvExpReadInputs();
  if (g_hasProgram) mvBcRunProgram();
  mvUpdateTimers(dtMs);
  mvUpdateCounters();
  mvUpdateFlowMeters();
  mvUpdateAlternators();
  mvUpdatePids(dtMs);
  mvUpdateAverages();
  mvApplyForcesAfterLogic();
  mvWritePhysicalOutputs();
  mvExpWriteOutputs();
}

void mvExecuteIoScan(uint32_t dtMs) {
  (void)dtMs;
  mvExpUpdate();
  mvReadPhysicalInputs();
  mvApplyForcesAfterRead();
  mvExpReadInputs();
  mvApplyForcesAfterLogic();
  mvWritePhysicalOutputs();
  mvExpWriteOutputs();
}
