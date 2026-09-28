#include "mv_st.h"
#include "mv_tags.h"
#include "mv_expansions.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_rtc.h"
#include "mv_version.h"
#include <string.h>

static DynamicJsonDocument g_program(MV_PROGRAM_JSON_POOL);
static char g_progErr[128];
static char g_programName[64];
static bool g_hasProgram = false;

#define MV_MAX_ONESHOT 32
static char g_oneShotIds[MV_MAX_ONESHOT][16];
static bool g_oneShotFired[MV_MAX_ONESHOT];
static uint8_t g_oneShotCount = 0;

void mvOneShotReset() {
  g_oneShotCount = 0;
  memset(g_oneShotIds, 0, sizeof(g_oneShotIds));
  memset(g_oneShotFired, 0, sizeof(g_oneShotFired));
}

static bool oneShotConsume(const char* id) {
  if (!id || !id[0]) return false;
  int idx = -1;
  for (uint8_t i = 0; i < g_oneShotCount; i++) {
    if (strcmp(g_oneShotIds[i], id) == 0) {
      idx = (int)i;
      break;
    }
  }
  if (idx < 0) {
    if (g_oneShotCount >= MV_MAX_ONESHOT) return false;
    idx = (int)g_oneShotCount++;
    strncpy(g_oneShotIds[idx], id, 15);
    g_oneShotIds[idx][15] = '\0';
  }
  if (g_oneShotFired[idx]) return false;
  g_oneShotFired[idx] = true;
  return true;
}

static double evalExpr(JsonVariant node);
static void runStmt(JsonObject stmt);
static bool mvProgramApplyStored();

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
  g_program.clear();
  return true;
}

static bool mvProgramApplyStored() {
  JsonObject root = g_program.as<JsonObject>();
  if (!root["ast"].is<JsonObject>()) {
    strncpy(g_progErr, "missing ast", sizeof(g_progErr) - 1);
    MV_LOG("program load failed: missing ast");
    return false;
  }
  g_programName[0] = '\0';
  if (root["programName"].is<const char*>()) {
    strncpy(g_programName, root["programName"].as<const char*>(), sizeof(g_programName) - 1);
    g_programName[sizeof(g_programName) - 1] = '\0';
  }
  g_program.remove("clientVersion");
  g_program.remove("clientTimeUnix");
  g_program.remove("protocolVersion");
  uint16_t tagIdCount = 0;
  if (root["tagIds"].is<JsonArray>()) {
    tagIdCount = root["tagIds"].size();
    mvRegisterTagIds(root["tagIds"].as<JsonArray>());
  }
  uint16_t metaCount = 0;
  if (root["tags"].is<JsonArray>()) {
    metaCount = root["tags"].size();
    mvApplyTagMeta(root["tags"].as<JsonArray>());
  }
  g_hasProgram = true;
  if (g_programName[0]) MV_LOG2("program name ", g_programName);
  MV_LOG2("program loaded tagIds=", tagIdCount);
  MV_LOG2("program meta tags=", metaCount);
  return true;
}

bool mvProgramLoadFromBody(const char* json, size_t len) {
  g_progErr[0] = 0;
  if (!json || len == 0) {
    strncpy(g_progErr, "empty body", sizeof(g_progErr) - 1);
    return false;
  }
  g_program.clear();
  DeserializationError err = deserializeJson(g_program, json, len);
  if (err) {
    snprintf(g_progErr, sizeof(g_progErr), "json %s (%u bytes)", err.c_str(), (unsigned)len);
    MV_LOG2("program json error: ", g_progErr);
    return false;
  }
  JsonObject root = g_program.as<JsonObject>();
  char protoErr[96];
  const int clientProto = root["protocolVersion"] | 0;
  const char* clientVer = root["clientVersion"] | "";
  if (!mvCheckClientProtocol(clientProto, clientVer, protoErr, sizeof(protoErr))) {
    strncpy(g_progErr, protoErr, sizeof(g_progErr) - 1);
    g_program.clear();
    return false;
  }
  const uint32_t clientTime = root["clientTimeUnix"] | 0u;
  if (clientTime > 1577836800u) mvRtcSetUnix(clientTime);
  return mvProgramApplyStored();
}

bool mvProgramLoad(JsonObject root) {
  g_progErr[0] = 0;
  g_program.clear();
  g_program["ast"] = root["ast"];
  if (root["source"].is<const char*>()) g_program["source"] = root["source"];
  if (root["programName"].is<const char*>()) g_program["programName"] = root["programName"];
  if (root["tagIds"].is<JsonArray>()) g_program["tagIds"] = root["tagIds"];
  if (root["tags"].is<JsonArray>()) g_program["tags"] = root["tags"];
  return mvProgramApplyStored();
}

bool mvProgramValid() { return g_hasProgram; }

static double tagAsNum(const char* name) {
  MvTag* t = mvFindTag(name);
  if (!t) return 0.0;
  if (t->kind == MV_REAL || t->kind == MV_PID || t->kind == MV_AVG) return mvGetReal(name);
  if (t->kind == MV_INT || t->kind == MV_COUNTER) return mvGetInt(name);
  return mvGetBool(name) ? 1.0 : 0.0;
}

static double evalCall(JsonObject call) {
  const char* name = call["name"];
  JsonArray args = call["args"].as<JsonArray>();
  if (!name) return 0;
  const char* tagName = args.size() > 0 ? args[0].as<const char*>() : "";
  if (strcmp(name, "IsON") == 0) return mvGetBool(tagName) ? 1.0 : 0.0;
  if (strcmp(name, "IsOFF") == 0) return mvGetBool(tagName) ? 0.0 : 1.0;
  if (strcmp(name, "TimerDone") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->tmrDone) ? 1.0 : 0.0;
  }
  if (strcmp(name, "TimerRun") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->tmrRunning) ? 1.0 : 0.0;
  }
  if (strcmp(name, "CounterDone") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->ctrDone) ? 1.0 : 0.0;
  }
  if (strcmp(name, "CounterValue") == 0) return mvGetInt(tagName);
  if (strcmp(name, "PidValue") == 0) return mvGetReal(tagName);
  if (strcmp(name, "PidError") == 0) {
    MvTag* t = mvFindTag(tagName);
    return t && t->kind == MV_PID ? t->err : 0.0;
  }
  if (strcmp(name, "PidAutoMode") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->kind == MV_PID && t->pidEnabled) ? 1.0 : 0.0;
  }
  if (strcmp(name, "AvgValue") == 0) return mvGetReal(tagName);
  if (strcmp(name, "AvgReady") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->kind == MV_AVG && t->avgReady) ? 1.0 : 0.0;
  }
  if (strcmp(name, "AvgCount") == 0) {
    MvTag* t = mvFindTag(tagName);
    return t && t->kind == MV_AVG ? t->avgCount : 0.0;
  }
  if (strcmp(name, "WithInLimits") == 0 && args.size() >= 3) {
    double v = tagAsNum(tagName);
    double lo = evalExpr(args[1]);
    double hi = evalExpr(args[2]);
    return (v >= lo && v <= hi) ? 1.0 : 0.0;
  }
  if (strcmp(name, "OneShot") == 0) return oneShotConsume(tagName) ? 1.0 : 0.0;
  if (strcmp(name, "FlowValue") == 0) return mvGetReal(tagName);
  if (strcmp(name, "FlowReady") == 0) {
    MvTag* t = mvFindTag(tagName);
    return (t && t->kind == MV_FLOW && t->flowReady) ? 1.0 : 0.0;
  }
  return 0;
}

static double evalExpr(JsonVariant node) {
  if (!node) return 0;
  if (node.is<double>() || node.is<float>() || node.is<int>() || node.is<bool>()) return node.as<double>();
  if (!node.is<JsonObject>()) return 0;
  JsonObject o = node.as<JsonObject>();
  const char* type = o["type"];
  if (!type) return 0;
  if (strcmp(type, "num") == 0) return o["value"] | 0.0;
  if (strcmp(type, "tag") == 0) return tagAsNum(o["name"]);
  if (strcmp(type, "call") == 0) return evalCall(o);
  if (strcmp(type, "un") == 0) {
    double v = evalExpr(o["arg"]);
    if (strcmp(o["op"], "NOT") == 0) return v ? 0.0 : 1.0;
    if (strcmp(o["op"], "NEG") == 0) return -v;
  }
  if (strcmp(type, "bin") == 0) {
    double l = evalExpr(o["left"]);
    double r = evalExpr(o["right"]);
    const char* op = o["op"];
    if (strcmp(op, "AND") == 0) return (l && r) ? 1.0 : 0.0;
    if (strcmp(op, "OR") == 0) return (l || r) ? 1.0 : 0.0;
    if (strcmp(op, "+") == 0) return l + r;
    if (strcmp(op, "-") == 0) return l - r;
    if (strcmp(op, "*") == 0) return l * r;
    if (strcmp(op, "/") == 0) return r == 0 ? 0 : l / r;
    if (strcmp(op, "%") == 0) return r == 0 ? 0 : (int)l % (int)r;
    if (strcmp(op, ">") == 0) return l > r ? 1.0 : 0.0;
    if (strcmp(op, "<") == 0) return l < r ? 1.0 : 0.0;
    if (strcmp(op, "=") == 0) return l == r ? 1.0 : 0.0;
    if (strcmp(op, ">=") == 0) return l >= r ? 1.0 : 0.0;
    if (strcmp(op, "<=") == 0) return l <= r ? 1.0 : 0.0;
    if (strcmp(op, "<>") == 0) return l != r ? 1.0 : 0.0;
  }
  return 0;
}

static void setAnalogFromExpr(const char* tag, double val) {
  MvTag* t = mvFindTag(tag);
  if (t && (t->kind == MV_INT || t->kind == MV_BOOL)) {
    mvSetInt(tag, (int)val);
  } else {
    mvSetReal(tag, (float)val);
  }
}

static void runAction(JsonObject act) {
  const char* name = act["name"];
  const char* tag = act["tag"];
  const char* inputTag = act["inputTag"];
  if (!name || !tag) return;

  if (strcmp(name, "TurnON") == 0) mvSetBool(tag, true);
  else if (strcmp(name, "TurnOFF") == 0) mvSetBool(tag, false);
  else if (strcmp(name, "CounterReset") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_COUNTER);
    if (t) t->ctrReset = true;
  }
  else if (strcmp(name, "CounterCu") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_COUNTER);
    if (t) t->cuPulse = inputTag ? mvGetBool(inputTag) : true;
  }
  else if (strcmp(name, "CounterCd") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_COUNTER);
    if (t) t->cdPulse = inputTag ? mvGetBool(inputTag) : true;
  }
  else if (strcmp(name, "TimerInput") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_TIMER);
    if (t) t->tmrInput = inputTag ? mvGetBool(inputTag) : true;
  }
  else if (strcmp(name, "PidPv") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_PID);
    if (t) t->pv = (float)tagAsNum(inputTag);
  }
  else if (strcmp(name, "PidSp") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_PID);
    if (t) {
      t->sp = (float)tagAsNum(inputTag);
      t->preset = (uint32_t)t->sp;
    }
  }
  else if (strcmp(name, "PidOut") == 0 && inputTag) {
    MvTag* t = mvFindTag(tag);
    if (t && t->kind == MV_PID) setAnalogFromExpr(inputTag, t->out);
  }
  else if (strcmp(name, "PidAuto") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_PID);
    if (t) t->pidEnabled = true;
  }
  else if (strcmp(name, "PidManual") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_PID);
    if (t) {
      t->pidEnabled = false;
      t->integral = 0.0f;
      t->prevPv = t->pv;
    }
  }
  else if (strcmp(name, "AvgIn") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_AVG);
    if (t) t->avgPv = (float)tagAsNum(inputTag);
  }
  else if (strcmp(name, "AvgReset") == 0) {
    MvTag* t = mvEnsureTag(tag, MV_AVG);
    if (t) t->avgReset = true;
  }
  else if (strcmp(name, "AvgOut") == 0 && inputTag) {
    MvTag* t = mvFindTag(tag);
    if (t && t->kind == MV_AVG) setAnalogFromExpr(inputTag, t->avgVal);
  }
  else if (strcmp(name, "FlowCtr") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_FLOW);
    if (t) {
      strncpy(t->flowCtrId, inputTag, sizeof(t->flowCtrId) - 1);
      t->flowCtrId[sizeof(t->flowCtrId) - 1] = '\0';
    }
  }
  else if (strcmp(name, "FlowTmr") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_FLOW);
    if (t) {
      strncpy(t->flowTmrId, inputTag, sizeof(t->flowTmrId) - 1);
      t->flowTmrId[sizeof(t->flowTmrId) - 1] = '\0';
    }
  }
  else if (strcmp(name, "FlowK") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_FLOW);
    if (t) {
      strncpy(t->flowKTagId, inputTag, sizeof(t->flowKTagId) - 1);
      t->flowKTagId[sizeof(t->flowKTagId) - 1] = '\0';
    }
  }
  else if (strcmp(name, "FlowOut") == 0 && inputTag) {
    MvTag* t = mvEnsureTag(tag, MV_FLOW);
    if (t) {
      strncpy(t->flowOutId, inputTag, sizeof(t->flowOutId) - 1);
      t->flowOutId[sizeof(t->flowOutId) - 1] = '\0';
    }
  }
}

static void runBlock(JsonArray block) {
  if (block.isNull()) return;
  for (JsonObject stmt : block) runStmt(stmt);
}

static void runStmt(JsonObject stmt) {
  const char* type = stmt["type"];
  if (!type) return;
  if (strcmp(type, "action") == 0) {
    runAction(stmt);
    return;
  }
  if (strcmp(type, "if") == 0) {
    bool ok = evalExpr(stmt["cond"]) != 0;
    if (ok) runBlock(stmt["thenBody"].as<JsonArray>());
    else runBlock(stmt["elseBody"].as<JsonArray>());
  }
}

void mvExecuteScan(uint32_t dtMs) {
  mvExpUpdate();
  mvReadPhysicalInputs();
  mvExpReadInputs();
  if (g_hasProgram && g_program["ast"].is<JsonObject>()) {
    JsonObject ast = g_program["ast"].as<JsonObject>();
    if (strcmp(ast["type"] | "program", "program") == 0) {
      runBlock(ast["body"].as<JsonArray>());
    }
  }
  mvUpdateTimers(dtMs);
  mvUpdateCounters();
  mvUpdateFlowMeters();
  mvUpdatePids(dtMs);
  mvUpdateAverages();
  mvWritePhysicalOutputs();
  mvExpWriteOutputs();
}
