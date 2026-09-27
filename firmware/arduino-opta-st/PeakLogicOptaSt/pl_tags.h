#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "pl_config.h"

enum PlTagKind : uint8_t {
  PL_BOOL = 0,
  PL_INT = 1,
  PL_REAL = 2,
  PL_TIMER = 3,
  PL_COUNTER = 4,
  PL_PID = 5,
  PL_AVG = 6,
};

struct PlTag {
  char id[16];
  PlTagKind kind;
  char mode[8];

  bool b;
  int32_t i;
  float r;
  uint32_t preset;

  uint32_t elapsed;
  bool tmrInput;
  bool tmrDone;
  bool tmrRunning;
  bool tmrPrevIn;

  int32_t count;
  bool ctrDone;
  bool cuPulse;
  bool cdPulse;
  bool prevCu;
  bool prevCd;
  bool ctrReset;

  float pv;
  float sp;
  float out;
  float err;
  float integral;
  float prevPv;
  float kp;
  float ki;
  float kd;
  float outMin;
  float outMax;
  bool pidEnabled;

  float avgPv;
  float avgVal;
  float avgEma;
  uint8_t avgCount;
  bool avgReady;
  bool avgReset;
  float avgRing[PL_AVG_RING];
};

void plTagsBegin();
uint8_t plTagCount();
PlTag* plFindTag(const char* id);
PlTag* plEnsureTag(const char* id, PlTagKind kind);
bool plGetBool(const char* id);
int plGetInt(const char* id);
float plGetReal(const char* id);
void plSetBool(const char* id, bool v);
void plSetInt(const char* id, int v);
void plSetReal(const char* id, float v);
void plReadPhysicalInputs();
void plWritePhysicalOutputs();
void plUpdateTimers(uint32_t dtMs);
void plUpdateCounters();
void plUpdatePids(uint32_t dtMs);
void plUpdateAverages();
void plTagsToJson(JsonObject out);
bool plRegisterTagIds(JsonArray ids);
bool plApplyTagMeta(JsonArray tags);
void plSetTagMode(PlTag* t, const char* mode);
