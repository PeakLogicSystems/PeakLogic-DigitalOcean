#pragma once
#include <stdint.h>
#include <stddef.h>
#include <ArduinoJson.h>

#ifndef MV_BC_MAX
#define MV_BC_MAX 16384
#endif

/** Magic 'MVBC' — keep in sync with est-pc/src/engine/stOpcodes.js */
#define MV_BC_MAGIC_0 'M'
#define MV_BC_MAGIC_1 'V'
#define MV_BC_MAGIC_2 'B'
#define MV_BC_MAGIC_3 'C'

bool mvBcLoad(const uint8_t* data, size_t len, char* err, size_t errLen);

/** Phased bc load — one tag per step so loop() can poll HTTP/MQTT between tags. */
typedef struct {
  uint16_t tagIdx;
  size_t off;
  uint16_t tagCount;
  uint16_t codeLen;
} MvBcLoadCtx;

bool mvBcLoadBegin(MvBcLoadCtx* ctx, const uint8_t* data, size_t len, char* err, size_t errLen);
/** Returns true when all tags + code offsets are applied. */
bool mvBcLoadStep(MvBcLoadCtx* ctx, char* err, size_t errLen);
void mvBcRunProgram();
void mvBcClear();
bool mvBcHasProgram();
size_t mvBcBytes();
uint16_t mvBcTagCount();
uint16_t mvBcCodeBytes();
uint16_t mvBcDataBytes();
uint16_t mvBcMaxBytes();
const uint8_t* mvBcRawData();
void mvBcOneShotReset();
void mvBcSetTracePointCount(uint16_t n);
uint16_t mvBcTracePointCount();
void mvBcAppendProgramTrace(JsonArray arr);
