#pragma once

#include <Arduino.h>

#include <ArduinoJson.h>



bool mvProgramLoad(JsonObject root);

bool mvProgramApplyMeta(JsonObject root);

void mvProgramOnLoaded(JsonObject root);

void mvProgramQueueRtcFromBody(JsonObject root);

void mvProgramInstallSetBusy(bool busy);

bool mvProgramInstallBusy();

bool mvProgramValid();

bool mvProgramClear();

void mvExecuteScan(uint32_t dtMs);

void mvOneShotReset();

const char* mvLastProgramError();

/** Record deploy/load failure for /api/status, setup UI, and MQTT telemetry. */
void mvSetProgramError(const char* msg);

const char* mvProgramName();

const char* mvProgramShortName();

uint8_t* mvProgramScratchBuf();
size_t mvProgramScratchCap();
bool mvProgramLoadFromNv(const char* programName, uint16_t traceCount, const uint8_t* bc, size_t bcLen);
bool mvProgramCommitNvLoad(const char* programName, uint16_t traceCount);

/** Read physical + expansion inputs without running ST (when runtime stopped). */
void mvIoPollInputs();

