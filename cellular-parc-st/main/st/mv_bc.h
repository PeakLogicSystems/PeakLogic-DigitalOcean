#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifndef MV_BC_MAX
#define MV_BC_MAX 16384
#endif

#define MV_BC_MAGIC_0 'M'
#define MV_BC_MAGIC_1 'V'
#define MV_BC_MAGIC_2 'B'
#define MV_BC_MAGIC_3 'C'

#ifdef __cplusplus
extern "C" {
#endif

/** Phased bc load — one tag per step (Opta-compatible). */
typedef struct {
  uint16_t tagIdx;
  size_t off;
  uint16_t tagCount;
  uint16_t codeLen;
} MvBcLoadCtx;

bool mvBcLoad(const uint8_t *data, size_t len, char *err, size_t errLen);
bool mvBcLoadBegin(MvBcLoadCtx *ctx, const uint8_t *data, size_t len, char *err, size_t errLen);
/** Returns true when all tags + code offsets are applied. */
bool mvBcLoadStep(MvBcLoadCtx *ctx, char *err, size_t errLen);
void mvBcRunProgram(void);
void mvBcClear(void);
bool mvBcHasProgram(void);
size_t mvBcBytes(void);
uint16_t mvBcTagCount(void);
uint16_t mvBcCodeBytes(void);
uint16_t mvBcDataBytes(void);
uint16_t mvBcMaxBytes(void);
const uint8_t *mvBcRawData(void);
/** Modbus CRC16 of loaded BC — matches est-pc bcDeployCrc.js. */
uint16_t mvBcDeployCrc(void);
void mvBcOneShotReset(void);

#ifdef __cplusplus
}
#endif
