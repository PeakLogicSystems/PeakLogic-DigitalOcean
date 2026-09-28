#pragma once

#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

#define MV_PROG_NV_MAGIC 0x4D565053u /* 'MVPS' */
#define MV_PROG_NV_VERSION 1

void mvProgramStoreBegin();
void mvProgramStoreRequestBootLoad();
bool mvProgramStoreLoadBusy();
bool mvProgramStoreLoadTick();
bool mvProgramStoreLoadOnBoot(char* err, size_t errLen);
void mvProgramStoreQueueSave(const char* programName, uint16_t tracePointCount);
bool mvProgramStoreSaveBusy();
bool mvProgramStoreSaveTick();
bool mvProgramStoreClearNv();
bool mvProgramStoreGetAutoRun();
bool mvProgramStoreSetAutoRun(bool enabled);
bool mvProgramStoreProgramFromNv();
uint32_t mvProgramStoreBcCrc();
void mvProgramStoreAppendStatus(JsonObject root);
