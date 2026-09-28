#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

bool mvProgramLoad(JsonObject root);
/** Parse deploy JSON body in-place (single buffer — avoids double pool use). */
bool mvProgramLoadFromBody(const char* json, size_t len);
bool mvProgramValid();
bool mvProgramClear();
void mvExecuteScan(uint32_t dtMs);
void mvOneShotReset();
const char* mvLastProgramError();
const char* mvProgramName();
const char* mvProgramShortName();
