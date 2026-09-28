#include "mv_st.h"
#include "mv_bc.h"
#include "mv_base64.h"
#include "mv_tags.h"
#include "mv_expansions.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_version.h"
#include "mv_program_store.h"
#include <string.h>

static char g_progErr[128];
static char g_programName[64];
static bool g_hasProgram = false;
static volatile bool g_programInstallBusy = false;
static uint8_t g_bcDecode[MV_BC_MAX];

void mvProgramInstallSetBusy(bool busy) { g_programInstallBusy = busy; }

bool mvProgramInstallBusy() { return g_programInstallBusy; }

void mvOneShotReset() { mvBcOneShotReset(); }

uint8_t* mvProgramScratchBuf() { return g_bcDecode; }

size_t mvProgramScratchCap() { return sizeof(g_bcDecode); }

const char* mvLastProgramError() { return g_progErr; }

void mvSetProgramError(const char* msg) {
  g_hasProgram = false;
  mvBcClear();
  if (msg && msg[0]) {
    strncpy(g_progErr, msg, sizeof(g_progErr) - 1);
    g_progErr[sizeof(g_progErr) - 1] = '\0';
  } else {
    g_progErr[0] = '\0';
  }
}

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
  g_programName[0] = 0;
  mvSetProgramError(nullptr);
  mvProgramStoreClearNv();
  return true;
}

void mvProgramOnLoaded(JsonObject root) {
  if (!root.isNull() && root["autoRunOnBoot"].is<bool>()) {
    mvProgramStoreSetAutoRun(root["autoRunOnBoot"].as<bool>());
  }
  mvProgramStoreQueueSave(g_programName, mvBcTracePointCount());
}

void mvProgramQueueRtcFromBody(JsonObject root) {
  (void)root;
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

bool mvProgramCommitNvLoad(const char* programName, uint16_t traceCount) {
  g_progErr[0] = 0;
  g_programName[0] = '\0';
  if (programName && programName[0]) {
    strncpy(g_programName, programName, sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  if (!mvBcHasProgram()) {
    strncpy(g_progErr, "NV bc missing", sizeof(g_progErr) - 1);
    g_progErr[sizeof(g_progErr) - 1] = '\0';
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
  g_hasProgram = false;
  if (programName && programName[0]) {
    strncpy(g_programName, programName, sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  if (!bc || !bcLen) {
    mvSetProgramError("NV bc missing");
    return false;
  }
  mvTagsBegin();
  mvExpEnsureTags();
  if (!mvBcLoad(bc, bcLen, g_progErr, sizeof(g_progErr))) {
    mvSetProgramError(g_progErr);
    return false;
  }
  mvBcSetTracePointCount(traceCount);
  g_progErr[0] = '\0';
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  return true;
}

bool mvProgramLoad(JsonObject root) {
  g_progErr[0] = 0;
  g_hasProgram = false;
  g_programName[0] = '\0';
  if (root["programName"].is<const char*>()) {
    strncpy(g_programName, root["programName"].as<const char*>(), sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }

  char protoErr[96];
  const int clientProto = root["protocolVersion"] | 0;
  const char* clientVer = root["clientVersion"] | "";
  if (!mvCheckClientProtocol(clientProto, clientVer, protoErr, sizeof(protoErr))) {
    mvSetProgramError(protoErr);
    return false;
  }

  /* Reset runtime tag table before loading bc header — avoids tag table overflow on redeploy. */
  mvTagsBegin();
  mvExpEnsureTags();

  const char* bc = root["bc"];
  if (!bc || !bc[0]) {
    mvSetProgramError("missing bc");
    return false;
  }
  const size_t decoded = mvBase64Decode(bc, g_bcDecode, sizeof(g_bcDecode));
  if (!decoded) {
    mvSetProgramError("bc decode failed");
    return false;
  }
  if (!mvBcLoad(g_bcDecode, decoded, g_progErr, sizeof(g_progErr))) {
    mvSetProgramError(g_progErr);
    return false;
  }
  g_progErr[0] = '\0';
  g_hasProgram = true;
  MV_LOG2("program loaded code=", (int)mvBcCodeBytes());
  MV_LOG2("program data=", (int)mvBcDataBytes());
  MV_LOG2("program tags=", (int)mvBcTagCount());
  mvProgramOnLoaded(root);
  return true;
}

bool mvProgramValid() { return g_hasProgram && mvBcHasProgram(); }

void mvIoPollInputs() {
  if (mvProgramInstallBusy()) return;
  mvExpUpdate();
  mvReadPhysicalInputs();
  mvExpReadInputs();
}

void mvExecuteScan(uint32_t dtMs) {
  mvExpUpdate();
  mvReadPhysicalInputs();
  mvExpReadInputs();
  if (g_hasProgram) mvBcRunProgram();
  mvUpdateTimers(dtMs);
  mvUpdateCounters();
  mvUpdateFlowMeters();
  mvUpdatePids(dtMs);
  mvUpdateAverages();
  mvUpdateAlternators();
  mvWritePhysicalOutputs();
  mvExpWriteOutputs();
}
