#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "mv_store.h"

#ifndef MV_RBE_MIN_MS_DEFAULT
#define MV_RBE_MIN_MS_DEFAULT 100
#endif
#ifndef MV_RBE_DEADBAND_DEFAULT
#define MV_RBE_DEADBAND_DEFAULT 50
#endif

void mvRbeBegin();
void mvRbeApplyConfig();
void mvRbeTick();

uint8_t mvRbeEnabledCount();
const char* mvRbeLastTag();
uint32_t mvRbeMinMs();
uint16_t mvRbeAnalogDeadband();

void mvRbeFillStatus(JsonObject root);
void mvRbeFillConfig(JsonObject root);
bool mvRbeApplyJson(JsonObjectConst root, char* err, size_t errLen);
