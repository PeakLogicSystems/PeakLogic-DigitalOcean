#pragma once
#include <Arduino.h>
#include "mv_store.h"

#define MV_EXP_D1608E_DI 16
#define MV_EXP_D1608E_DO 8
#define MV_EXP_A0602_CH 8
#define MV_EXP_A0602_PWM 4

struct MvExpDetected {
  uint8_t slot;
  uint8_t type;       // MvExpType
  uint8_t hwType;     // detected hardware type code
  bool present;
  char label[16];
};

void mvExpBegin();
void mvExpUpdate();
void mvExpApplyConfig(const MvDeviceConfig* cfg);
uint8_t mvExpDetectedCount();
bool mvExpGetDetected(uint8_t idx, MvExpDetected* out);
void mvExpReadInputs();
void mvExpWriteOutputs();
void mvExpEnsureTags();
