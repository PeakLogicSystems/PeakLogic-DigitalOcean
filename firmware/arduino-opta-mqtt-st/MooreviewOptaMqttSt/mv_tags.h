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
  MV_ALT = 8,
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

  char altEnableId[16];
  char altAdvanceId[16];
  char altAutoFaultId[16];
  char altLeadOutId[16];
  char altLagOutId[16];
  char altOffId[16];
  char altHighId[16];
  char altLowId[16];
  char altLow2Id[16];
  char altLevelId[16];
  char altOnlineIds[4][16];
  char altUnitOutIds[4][16];
  char altLeadSelIds[4][16];
  char altLagSelIds[4][16];
  char altLag2SelIds[4][16];
  float altLevelLowLo;
  float altLevelLowHi;
  float altLevelHighLo;
  float altLevelHighHi;
  float altLevelOffLo;
  float altLevelOffHi;
  uint8_t altLevelInputMode;
  bool altLevelControlEnabled;
  bool altEnabled;
  bool altAdvance;
  bool altAutoFault;
  bool altPrevAdvance;
  bool altAdvancePulse;
  bool altPrevLeadOnline;
  bool altOffActive;
  bool altHighActive;
  bool altLowActive;
  bool altLow2Active;
  uint8_t altPumpStage;
  int8_t altLeadIndex;
  int8_t altLagIndex;
  int8_t altLag2Index;
  uint8_t altActiveUnit;
  bool altReady;
  bool altFault;
  bool altUnitOnline[4];

  bool forceInput;
  bool forceOutput;
  bool forceB;
  int32_t forceI;
  float forceR;

  /** P2P global tag — pub/sub on peaklogic/v1/g/{siteKey}/{id}. */
  bool isGlobal;
};

bool mvTagEffectiveBool(MvTag* t);
int mvTagEffectiveInt(MvTag* t);
float mvTagEffectiveReal(MvTag* t);

void mvTagInitDefaults(MvTag* t, MvTagKind kind);

void mvTagsBegin();
uint8_t mvTagCount();
MvTag* mvTagAt(uint8_t index);
MvTag* mvFindTag(const char* id);
MvTag* mvEnsureTag(const char* id, MvTagKind kind);
bool mvGetBool(const char* id);
int mvGetInt(const char* id);
float mvGetReal(const char* id);
void mvSetBool(const char* id, bool v);
void mvSetInt(const char* id, int v);
void mvSetReal(const char* id, float v);
/** Apply one HMI/MQTT memory write; coerces JSON numbers to tag kind. */
bool mvWriteMemoryValue(const char* id, JsonVariantConst v);
void mvReadPhysicalInputs();
void mvWritePhysicalOutputs();
void mvWriteForcedPhysicalOutputs();
bool mvTagSetForce(const char* id, bool forceInput, bool forceOutput, bool hasValue, bool boolVal, int32_t intVal, float realVal);
bool mvTagClearForce(const char* id);
void mvUpdateTimers(uint32_t dtMs);
void mvUpdateCounters();
void mvUpdatePids(uint32_t dtMs);
void mvUpdateAverages();
void mvUpdateFlowMeters();
void mvUpdateAlternators();
void mvTagsToJson(JsonObject out);
void mvTagsToParcJson(JsonArray out);
bool mvRegisterTagIds(JsonArray ids);
bool mvApplyTagMeta(JsonArray tags);
uint8_t mvGlobalTagCount();
void mvForEachGlobalTag(void (*fn)(MvTag* t, void* ctx), void* ctx);
void mvSetTagMode(MvTag* t, const char* mode);
