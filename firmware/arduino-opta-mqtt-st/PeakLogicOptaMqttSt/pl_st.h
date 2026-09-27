#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

bool plProgramLoad(JsonObject root);
bool plProgramValid();
bool plProgramClear();
void plExecuteScan(uint32_t dtMs);
void plOneShotReset();
const char* plLastProgramError();
