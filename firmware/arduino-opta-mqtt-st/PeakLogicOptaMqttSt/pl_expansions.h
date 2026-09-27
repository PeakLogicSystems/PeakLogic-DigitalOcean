#pragma once
#include <Arduino.h>
#include "pl_store.h"

#define PL_EXP_D1608E_DI 16
#define PL_EXP_D1608E_DO 8
#define PL_EXP_A0602_CH 8
#define PL_EXP_A0602_PWM 4

struct PlExpDetected {
  uint8_t slot;
  uint8_t type;       // PlExpType
  uint8_t hwType;     // detected hardware type code
  bool present;
  char label[16];
};

void plExpBegin();
void plExpUpdate();
void plExpApplyConfig(const PlDeviceConfig* cfg);
uint8_t plExpDetectedCount();
bool plExpGetDetected(uint8_t idx, PlExpDetected* out);
void plExpReadInputs();
void plExpWriteOutputs();
void plExpEnsureTags();
