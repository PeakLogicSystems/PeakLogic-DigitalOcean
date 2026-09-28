#pragma once

#include <Arduino.h>

#include <ArduinoJson.h>



bool mvProgramLoad(JsonObject root);
bool mvProgramLoadFromDecoded(JsonObject root, const uint8_t* decoded, size_t decodedLen);
/** Apply program metadata after phased mvBcLoadStep completes (trace map, program name). */
bool mvProgramApplyMeta(JsonObject root);
bool mvProgramLoadFromWireJson(const char* json, size_t len);

bool mvProgramValid();

bool mvProgramClear();
/** Load bytecode from NV storage (already decoded). */
bool mvProgramLoadFromNv(const char* programName, uint16_t traceCount, const uint8_t* bc, size_t bcLen);
/** Mark program valid after phased mvBcLoadStep (bc already in store). */
bool mvProgramCommitNvLoad(const char* programName, uint16_t traceCount);
void mvProgramOnLoaded(JsonObject root);

void mvExecuteScan(uint32_t dtMs);
/** Remote I/O mode: read inputs, apply output tag values, write physical outputs (no ST). */
void mvExecuteIoScan(uint32_t dtMs);

void mvOneShotReset();

const char* mvLastProgramError();

const char* mvProgramName();

const char* mvProgramShortName();

bool mvProgramInstallBusy();
void mvProgramInstallSetBusy(bool busy);
void mvProgramSyncRtcFromBody(JsonObject root);
/** Queue RTC sync for next loop tick (HAL_RTC_SetTime must not block MQTT cmd drain). */
void mvProgramQueueRtcFromBody(JsonObject root);
void mvProgramQueueRtcFromWire();
void mvProgramDrainPendingRtc();
uint8_t* mvProgramScratchBuf();
size_t mvProgramScratchCap();

