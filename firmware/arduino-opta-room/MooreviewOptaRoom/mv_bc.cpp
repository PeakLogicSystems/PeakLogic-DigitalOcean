#include "mv_bc.h"
#include "mv_tags.h"
#include "mv_config.h"
#include <string.h>

enum Op : uint8_t {
  OP_PUSH_F32 = 0x01,
  OP_PUSH_I16 = 0x02,
  OP_PUSH_TAG = 0x03,
  OP_NOT = 0x10,
  OP_NEG = 0x11,
  OP_AND = 0x20,
  OP_OR = 0x21,
  OP_ADD = 0x22,
  OP_SUB = 0x23,
  OP_MUL = 0x24,
  OP_DIV = 0x25,
  OP_MOD = 0x26,
  OP_GT = 0x30,
  OP_LT = 0x31,
  OP_EQ = 0x32,
  OP_GE = 0x33,
  OP_LE = 0x34,
  OP_NE = 0x35,
  OP_CALL = 0x40,
  OP_ACTION = 0x80,
  OP_STORE_TAG = 0x81,
  OP_JMP_IFNOT = 0x90,
  OP_JMP = 0x91,
  OP_TRACE_PEEK = 0xa0,
  OP_END = 0xff,
};

enum MetaFlag : uint8_t {
  META_PRESET = 0x01,
  META_MODE = 0x02,
  META_PID = 0x04,
  META_GLOBAL = 0x08,
};

static const char* MODE_STR[] = { "TON", "TOF", "TP", "CTU", "CTD", "PI", "MOV", "GPM", "ALT2", "ALT4", "ALT3" };

static uint8_t g_bcStore[MV_BC_MAX];
static uint16_t g_bcLen = 0;
static uint16_t g_codeOff = 0;
static uint16_t g_codeLen = 0;
static uint16_t g_tagCount = 0;
static char g_tagNames[MV_MAX_TAGS][16];
static bool g_hasBc = false;

#define MV_MAX_ONESHOT 32
static char g_oneShotIds[MV_MAX_ONESHOT][16];
static bool g_oneShotFired[MV_MAX_ONESHOT];
static uint8_t g_oneShotCount = 0;

static double g_stack[16];
static int g_sp = 0;

#ifndef MV_MAX_TRACE
#define MV_MAX_TRACE 96
#endif
static float g_traceVals[MV_MAX_TRACE];
static bool g_traceHas[MV_MAX_TRACE];
static uint16_t g_tracePointCount = 0;

void mvBcTraceReset() {
  memset(g_traceHas, 0, sizeof(g_traceHas));
}

uint16_t mvBcTracePointCount() { return g_tracePointCount; }

void mvBcSetTracePointCount(uint16_t n) {
  g_tracePointCount = (n > MV_MAX_TRACE) ? MV_MAX_TRACE : n;
}

void mvBcAppendProgramTrace(JsonArray arr) {
  for (uint16_t i = 0; i < g_tracePointCount && i < MV_MAX_TRACE; i++) {
    if (!g_traceHas[i]) continue;
    JsonArray row = arr.createNestedArray();
    row.add(i);
    row.add(g_traceVals[i]);
  }
}

void mvBcOneShotReset() {
  g_oneShotCount = 0;
  memset(g_oneShotIds, 0, sizeof(g_oneShotIds));
  memset(g_oneShotFired, 0, sizeof(g_oneShotFired));
}

void mvBcClear() {
  g_hasBc = false;
  g_bcLen = 0;
  g_codeOff = 0;
  g_codeLen = 0;
  g_tagCount = 0;
  g_tracePointCount = 0;
  mvBcTraceReset();
}

bool mvBcHasProgram() { return g_hasBc; }
size_t mvBcBytes() { return g_bcLen; }
uint16_t mvBcTagCount() { return g_tagCount; }
uint16_t mvBcCodeBytes() { return g_codeLen; }
uint16_t mvBcDataBytes() { return g_codeOff; }
uint16_t mvBcMaxBytes() { return MV_BC_MAX; }

const uint8_t* mvBcRawData() { return g_bcStore; }

static uint16_t rdU16(size_t off) {
  return (uint16_t)g_bcStore[off] | ((uint16_t)g_bcStore[off + 1] << 8);
}

static int16_t rdI16(size_t off) {
  return (int16_t)rdU16(off);
}

static float rdF32(size_t off) {
  float f;
  memcpy(&f, &g_bcStore[off], 4);
  return f;
}

static uint32_t rdU32(size_t off) {
  return (uint32_t)g_bcStore[off]
    | ((uint32_t)g_bcStore[off + 1] << 8)
    | ((uint32_t)g_bcStore[off + 2] << 16)
    | ((uint32_t)g_bcStore[off + 3] << 24);
}

static void bcErr(char* err, size_t errLen, const char* msg) {
  if (err && errLen) {
    strncpy(err, msg, errLen - 1);
    err[errLen - 1] = '\0';
  }
}

static const char* tagName(uint16_t idx) {
  if (idx >= g_tagCount) return "";
  return g_tagNames[idx];
}

static double tagAsNum(const char* name) {
  MvTag* t = mvFindTag(name);
  if (!t) return 0.0;
  if (t->kind == MV_REAL || t->kind == MV_PID || t->kind == MV_AVG) return mvGetReal(name);
  if (t->kind == MV_INT || t->kind == MV_COUNTER) return mvGetInt(name);
  return mvGetBool(name) ? 1.0 : 0.0;
}

static double tagAsNumIdx(uint16_t idx) {
  return tagAsNum(tagName(idx));
}

static void push(double v) {
  if (g_sp < 16) g_stack[g_sp++] = v;
}

static double pop() {
  if (g_sp <= 0) return 0;
  return g_stack[--g_sp];
}

static bool oneShotConsumeIdx(uint16_t idx) {
  const char* id = tagName(idx);
  if (!id[0]) return false;
  int slot = -1;
  for (uint8_t i = 0; i < g_oneShotCount; i++) {
    if (strcmp(g_oneShotIds[i], id) == 0) {
      slot = (int)i;
      break;
    }
  }
  if (slot < 0) {
    if (g_oneShotCount >= MV_MAX_ONESHOT) return false;
    slot = (int)g_oneShotCount++;
    strncpy(g_oneShotIds[slot], id, 15);
    g_oneShotIds[slot][15] = '\0';
  }
  if (g_oneShotFired[slot]) return false;
  g_oneShotFired[slot] = true;
  return true;
}

static double evalBuiltin(uint8_t id) {
  switch (id) {
    case 0: { uint16_t t = (uint16_t)pop(); return mvGetBool(tagName(t)) ? 1.0 : 0.0; }
    case 1: { uint16_t t = (uint16_t)pop(); return mvGetBool(tagName(t)) ? 0.0 : 1.0; }
    case 2: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->tmrDone) ? 1.0 : 0.0; }
    case 3: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->tmrRunning) ? 1.0 : 0.0; }
    case 4: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->ctrDone) ? 1.0 : 0.0; }
    case 5: { uint16_t t = (uint16_t)pop(); return mvGetInt(tagName(t)); }
    case 6: { uint16_t t = (uint16_t)pop(); return mvGetReal(tagName(t)); }
    case 7: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_PID) ? x->err : 0.0; }
    case 8: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_PID && x->pidEnabled) ? 1.0 : 0.0; }
    case 9: { uint16_t t = (uint16_t)pop(); return mvGetReal(tagName(t)); }
    case 10: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_AVG && x->avgReady) ? 1.0 : 0.0; }
    case 11: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_AVG) ? x->avgCount : 0.0; }
    case 12: {
      double hi = pop();
      double lo = pop();
      uint16_t t = (uint16_t)pop();
      double v = tagAsNumIdx(t);
      return (v >= lo && v <= hi) ? 1.0 : 0.0;
    }
    case 13: { uint16_t t = (uint16_t)pop(); return oneShotConsumeIdx(t) ? 1.0 : 0.0; }
    case 14: { uint16_t t = (uint16_t)pop(); return mvGetReal(tagName(t)); }
    case 15: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_FLOW && x->flowReady) ? 1.0 : 0.0; }
    case 16: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT) ? (double)x->altActiveUnit : 0.0; }
    case 17: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altReady) ? 1.0 : 0.0; }
    case 18: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altFault) ? 1.0 : 0.0; }
    case 19: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altLagIndex >= 0) ? (double)(x->altLagIndex + 1) : 0.0; }
    case 20: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altOffActive) ? 1.0 : 0.0; }
    case 21: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altHighActive) ? 1.0 : 0.0; }
    case 22: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altLowActive) ? 1.0 : 0.0; }
    case 23: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && (x->altPumpStage == 1 || x->altPumpStage == 4)) ? 1.0 : 0.0; }
    case 24: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altPumpStage == 2) ? 1.0 : 0.0; }
    case 25: { uint16_t t = (uint16_t)pop(); MvTag* x = mvFindTag(tagName(t)); return (x && x->kind == MV_ALT && x->altLow2Active) ? 1.0 : 0.0; }
    default: return 0.0;
  }
}

static void setAnalogFromExpr(const char* tag, double val) {
  MvTag* t = mvFindTag(tag);
  if (t && (t->kind == MV_INT || t->kind == MV_BOOL)) mvSetInt(tag, (int)val);
  else mvSetReal(tag, (float)val);
}

static void runAction(uint8_t id, uint16_t tagIdx, uint16_t inputIdx, uint8_t unitIdx, const float* bands) {
  const char* tag = tagName(tagIdx);
  const char* inputTag = (inputIdx == 0xffff) ? nullptr : tagName(inputIdx);
  if (!tag[0]) return;
  switch (id) {
    case 0: mvSetBool(tag, true); break;
    case 1: mvSetBool(tag, false); break;
    case 2: { MvTag* t = mvEnsureTag(tag, MV_COUNTER); if (t) t->ctrReset = true; break; }
    case 3: { MvTag* t = mvEnsureTag(tag, MV_COUNTER); if (t) t->cuPulse = inputTag ? mvGetBool(inputTag) : true; break; }
    case 4: { MvTag* t = mvEnsureTag(tag, MV_COUNTER); if (t) t->cdPulse = inputTag ? mvGetBool(inputTag) : true; break; }
    case 5: { MvTag* t = mvEnsureTag(tag, MV_TIMER); if (t) t->tmrInput = inputTag ? mvGetBool(inputTag) : true; break; }
    case 6: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_PID); if (t) t->pv = (float)tagAsNum(inputTag); } break;
    case 7: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_PID); if (t) { t->sp = (float)tagAsNum(inputTag); t->preset = (uint32_t)t->sp; } } break;
    case 8: { MvTag* t = mvFindTag(tag); if (t && t->kind == MV_PID && inputTag) setAnalogFromExpr(inputTag, t->out); break; }
    case 9: { MvTag* t = mvEnsureTag(tag, MV_PID); if (t) t->pidEnabled = true; break; }
    case 10: { MvTag* t = mvEnsureTag(tag, MV_PID); if (t) { t->pidEnabled = false; t->integral = 0; t->prevPv = t->pv; } break; }
    case 11: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_AVG); if (t) t->avgPv = (float)tagAsNum(inputTag); } break;
    case 12: { MvTag* t = mvEnsureTag(tag, MV_AVG); if (t) t->avgReset = true; break; }
    case 13: { MvTag* t = mvFindTag(tag); if (t && t->kind == MV_AVG && inputTag) setAnalogFromExpr(inputTag, t->avgVal); break; }
    case 14: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_FLOW); if (t) { strncpy(t->flowCtrId, inputTag, 15); t->flowCtrId[15] = '\0'; } } break;
    case 15: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_FLOW); if (t) { strncpy(t->flowTmrId, inputTag, 15); t->flowTmrId[15] = '\0'; } } break;
    case 16: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_FLOW); if (t) { strncpy(t->flowKTagId, inputTag, 15); t->flowKTagId[15] = '\0'; } } break;
    case 17: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_FLOW); if (t) { strncpy(t->flowOutId, inputTag, 15); t->flowOutId[15] = '\0'; } } break;
    case 18: {
      MvTag* t = mvEnsureTag(tag, MV_ALT);
      if (!t) break;
      if (inputTag) {
        strncpy(t->altEnableId, inputTag, 15);
        t->altEnableId[15] = '\0';
        t->altEnabled = mvGetBool(inputTag);
      } else {
        t->altEnableId[0] = '\0';
        t->altEnabled = true;
      }
      break;
    }
    case 19:
      if (inputTag) {
        MvTag* t = mvEnsureTag(tag, MV_ALT);
        if (t) { strncpy(t->altAdvanceId, inputTag, 15); t->altAdvanceId[15] = '\0'; }
      } else {
        MvTag* t = mvEnsureTag(tag, MV_ALT);
        if (t) t->altAdvancePulse = true;
      }
      break;
    case 20: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altAutoFaultId, inputTag, 15); t->altAutoFaultId[15] = '\0'; } } break;
    case 21: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLeadOutId, inputTag, 15); t->altLeadOutId[15] = '\0'; } } break;
    case 22: if (inputTag && unitIdx >= 1 && unitIdx <= 4) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altOnlineIds[unitIdx - 1], inputTag, 15); t->altOnlineIds[unitIdx - 1][15] = '\0'; } } break;
    case 23: if (inputTag && unitIdx >= 1 && unitIdx <= 4) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altUnitOutIds[unitIdx - 1], inputTag, 15); t->altUnitOutIds[unitIdx - 1][15] = '\0'; } } break;
    case 24: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altOffId, inputTag, 15); t->altOffId[15] = '\0'; } } break;
    case 25: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altHighId, inputTag, 15); t->altHighId[15] = '\0'; } } break;
    case 26: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLowId, inputTag, 15); t->altLowId[15] = '\0'; } } break;
    case 27: if (inputTag && unitIdx >= 1 && unitIdx <= 4) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLeadSelIds[unitIdx - 1], inputTag, 15); t->altLeadSelIds[unitIdx - 1][15] = '\0'; } } break;
    case 28: if (inputTag && unitIdx >= 1 && unitIdx <= 4) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLagSelIds[unitIdx - 1], inputTag, 15); t->altLagSelIds[unitIdx - 1][15] = '\0'; } } break;
    case 29: if (inputTag && unitIdx >= 1 && unitIdx <= 4) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLag2SelIds[unitIdx - 1], inputTag, 15); t->altLag2SelIds[unitIdx - 1][15] = '\0'; } } break;
    case 30: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLevelId, inputTag, 15); t->altLevelId[15] = '\0'; t->altLevelControlEnabled = true; } } break;
    case 31: {
      MvTag* t = mvEnsureTag(tag, MV_ALT);
      if (t && bands) {
        t->altLevelLowLo = bands[0];
        t->altLevelLowHi = bands[1];
        t->altLevelHighLo = bands[2];
        t->altLevelHighHi = bands[3];
        t->altLevelControlEnabled = true;
      }
      break;
    }
    case 32: if (inputTag) { MvTag* t = mvEnsureTag(tag, MV_ALT); if (t) { strncpy(t->altLow2Id, inputTag, 15); t->altLow2Id[15] = '\0'; } } break;
    default: break;
  }
}

static MvTagKind kindFromByte(uint8_t t) {
  switch (t) {
    case 1: return MV_INT;
    case 2: return MV_REAL;
    case 3: return MV_TIMER;
    case 4: return MV_COUNTER;
    case 5: return MV_PID;
    case 6: return MV_AVG;
    case 7: return MV_FLOW;
    case 8: return MV_ALT;
    default: return MV_BOOL;
  }
}

static bool applyTagMeta(const char* id, uint8_t type, uint8_t flags, size_t& off) {
  MvTagKind kind = kindFromByte(type);
  MvTag* t = mvEnsureTag(id, kind);
  if (!t) return false;
  if (flags & META_PRESET) {
    t->preset = rdU32(off);
    off += 4;
  }
  if (flags & META_MODE) {
    uint8_t mid = g_bcStore[off++];
    if (mid < 11) mvSetTagMode(t, MODE_STR[mid]);
  }
  if (flags & META_PID) {
    t->kp = rdF32(off); off += 4;
    t->ki = rdF32(off); off += 4;
    t->kd = rdF32(off); off += 4;
    t->outMin = rdF32(off); off += 4;
    t->outMax = rdF32(off); off += 4;
  }
  if (flags & META_GLOBAL) {
    t->isGlobal = true;
  }
  if (kind == MV_COUNTER && strcmp(t->mode, "CTD") == 0 && t->count == 0 && t->preset > 0) {
    t->count = (int32_t)t->preset;
  }
  return true;
}

bool mvBcLoadBegin(MvBcLoadCtx* ctx, const uint8_t* data, size_t len, char* err, size_t errLen) {
  if (!ctx) {
    bcErr(err, errLen, "bc load ctx");
    return false;
  }
  mvBcClear();
  if (!data || len < 10) {
    bcErr(err, errLen, "bc too short");
    return false;
  }
  if (data[0] != MV_BC_MAGIC_0 || data[1] != MV_BC_MAGIC_1 || data[2] != MV_BC_MAGIC_2 || data[3] != MV_BC_MAGIC_3) {
    bcErr(err, errLen, "bad bc magic");
    return false;
  }
  if (data[4] != 1) {
    bcErr(err, errLen, "bc version");
    return false;
  }
  if (len > MV_BC_MAX) {
    bcErr(err, errLen, "bc too large");
    return false;
  }
  memcpy(g_bcStore, data, len);
  g_bcLen = (uint16_t)len;

  const uint16_t tagCount = rdU16(6);
  const uint16_t codeLen = rdU16(8);
  if (tagCount > MV_MAX_TAGS) {
    bcErr(err, errLen, "too many tags");
    return false;
  }
  ctx->tagIdx = 0;
  ctx->off = 10;
  ctx->tagCount = tagCount;
  ctx->codeLen = codeLen;
  g_tagCount = tagCount;
  return true;
}

bool mvBcLoadStep(MvBcLoadCtx* ctx, char* err, size_t errLen) {
  if (!ctx) {
    bcErr(err, errLen, "bc load ctx");
    return false;
  }
  const size_t len = g_bcLen;
  if (ctx->tagIdx < ctx->tagCount) {
    size_t off = ctx->off;
    if (off >= len) {
      bcErr(err, errLen, "truncated tags");
      return false;
    }
    const uint8_t nlen = g_bcStore[off++];
    if (nlen == 0 || nlen > 31 || off + nlen + 2 > len) {
      bcErr(err, errLen, "bad tag name");
      return false;
    }
    memcpy(g_tagNames[ctx->tagIdx], &g_bcStore[off], nlen);
    g_tagNames[ctx->tagIdx][nlen] = '\0';
    off += nlen;
    const uint8_t type = g_bcStore[off++];
    const uint8_t flags = g_bcStore[off++];
    if (!applyTagMeta(g_tagNames[ctx->tagIdx], type, flags, off)) {
      bcErr(err, errLen, "tag meta");
      return false;
    }
    ctx->off = off;
    ctx->tagIdx++;
    return false;
  }
  if (ctx->off + ctx->codeLen > len || ctx->codeLen > MV_BC_MAX) {
    bcErr(err, errLen, "bad code len");
    return false;
  }
  g_codeOff = (uint16_t)ctx->off;
  g_codeLen = ctx->codeLen;
  g_hasBc = true;
  return true;
}

bool mvBcLoad(const uint8_t* data, size_t len, char* err, size_t errLen) {
  MvBcLoadCtx ctx;
  if (!mvBcLoadBegin(&ctx, data, len, err, errLen)) return false;
  while (!mvBcLoadStep(&ctx, err, errLen)) { /* sync path */ }
  return true;
}

void mvBcRunProgram() {
  if (!g_hasBc || !g_codeLen) return;
  size_t ip = g_codeOff;
  const size_t end = g_codeOff + g_codeLen;
  g_sp = 0;
  mvBcTraceReset();
  while (ip < end) {
    const uint8_t op = g_bcStore[ip++];
    switch (op) {
      case OP_PUSH_F32:
        push(rdF32(ip));
        ip += 4;
        break;
      case OP_PUSH_I16:
        push(rdI16(ip));
        ip += 2;
        break;
      case OP_PUSH_TAG:
        push(rdU16(ip));
        ip += 2;
        break;
      case OP_NOT:
        push(pop() ? 0.0 : 1.0);
        break;
      case OP_NEG:
        push(-pop());
        break;
      case OP_AND: { double r = pop(); double l = pop(); push((l && r) ? 1.0 : 0.0); break; }
      case OP_OR: { double r = pop(); double l = pop(); push((l || r) ? 1.0 : 0.0); break; }
      case OP_ADD: { double r = pop(); push(pop() + r); break; }
      case OP_SUB: { double r = pop(); push(pop() - r); break; }
      case OP_MUL: { double r = pop(); push(pop() * r); break; }
      case OP_DIV: { double r = pop(); { double l = pop(); push(r == 0 ? 0 : l / r); } break; }
      case OP_MOD: { double r = pop(); { double l = pop(); push(r == 0 ? 0 : (double)((int)l % (int)r)); } break; }
      case OP_GT: { double r = pop(); push(pop() > r ? 1.0 : 0.0); break; }
      case OP_LT: { double r = pop(); push(pop() < r ? 1.0 : 0.0); break; }
      case OP_EQ: { double r = pop(); push(pop() == r ? 1.0 : 0.0); break; }
      case OP_GE: { double r = pop(); push(pop() >= r ? 1.0 : 0.0); break; }
      case OP_LE: { double r = pop(); push(pop() <= r ? 1.0 : 0.0); break; }
      case OP_NE: { double r = pop(); push(pop() != r ? 1.0 : 0.0); break; }
      case OP_CALL: {
        const uint8_t bid = g_bcStore[ip++];
        push(evalBuiltin(bid));
        break;
      }
      case OP_ACTION: {
        const uint8_t aid = g_bcStore[ip++];
        const uint16_t tag = rdU16(ip); ip += 2;
        const uint16_t input = rdU16(ip); ip += 2;
        uint8_t unit = 0;
        if (aid == 22 || aid == 23 || aid == 27 || aid == 28 || aid == 29) {
          unit = g_bcStore[ip++];
        }
        float bands[4] = { 0, 0, 0, 0 };
        const float* bandPtr = nullptr;
        if (aid == 31) {
          for (int b = 0; b < 4; b++) {
            bands[b] = rdF32(ip);
            ip += 4;
          }
          bandPtr = bands;
        }
        runAction(aid, tag, input, unit, bandPtr);
        break;
      }
      case OP_STORE_TAG: {
        const uint16_t tag = rdU16(ip); ip += 2;
        setAnalogFromExpr(tagName(tag), pop());
        break;
      }
      case OP_JMP_IFNOT: {
        const uint16_t rel = rdU16(ip);
        ip += 2;
        if (pop() == 0.0) ip += rel;
        break;
      }
      case OP_JMP: {
        const uint16_t rel = rdU16(ip);
        ip += 2;
        ip += rel;
        break;
      }
      case OP_TRACE_PEEK: {
        const uint16_t idx = rdU16(ip);
        ip += 2;
        if (idx < MV_MAX_TRACE && g_sp > 0) {
          g_traceVals[idx] = (float)g_stack[g_sp - 1];
          g_traceHas[idx] = true;
        }
        break;
      }
      case OP_END:
        return;
      default:
        return;
    }
  }
}
