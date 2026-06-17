#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "mv_config.h"

enum MvTagKind : uint8_t {
  MV_BOOL = 0,
  MV_INT = 1,
  MV_REAL = 2,
  MV_TIMER = 3,
  MV_COUNTER = 4,
  MV_PID = 5,
  MV_AVG = 6,
  MV_FLOW = 7,
};

struct MvTag {
  char id[16];
  MvTagKind kind;
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
  bool tmrReset;

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
  float avgRing[MV_AVG_RING];

  char flowCtrId[16];
  char flowTmrId[16];
  char flowKTagId[16];
  char flowOutId[16];
  float flowK;
  float flowGpm;
  bool flowReady;
  bool flowPrevTmrDone;
};

void mvTagsBegin();
uint8_t mvTagCount();
MvTag* mvFindTag(const char* id);
MvTag* mvEnsureTag(const char* id, MvTagKind kind);
bool mvGetBool(const char* id);
int mvGetInt(const char* id);
float mvGetReal(const char* id);
void mvSetBool(const char* id, bool v);
void mvSetInt(const char* id, int v);
void mvSetReal(const char* id, float v);
void mvReadPhysicalInputs();
void mvWritePhysicalOutputs();
void mvUpdateTimers(uint32_t dtMs);
void mvUpdateCounters();
void mvUpdatePids(uint32_t dtMs);
void mvUpdateAverages();
void mvUpdateFlowMeters();
void mvTagsToJson(JsonObject out);
void mvTagsToFleetJson(JsonArray out);
bool mvRegisterTagIds(JsonArray ids);
bool mvApplyTagMeta(JsonArray tags);
void mvSetTagMode(MvTag* t, const char* mode);
