#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

bool mvProgramLoad(JsonObject root);
bool mvProgramValid();
bool mvProgramClear();
void mvExecuteScan(uint32_t dtMs);
void mvOneShotReset();
const char* mvLastProgramError();
