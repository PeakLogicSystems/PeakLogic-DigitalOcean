#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

bool mvProgramLoadBcB64(const char *bc_b64, const char *program_name, int protocol_version,
                        char *err, size_t err_len);
/** Load raw MVBC bytes (e.g. from NV). */
bool mvProgramLoadBcRaw(const uint8_t *bc, size_t bc_len, const char *program_name, char *err,
                        size_t err_len);
bool mvProgramValid(void);
bool mvProgramClear(void);
/** Persist current program to SPIFFS NV (Opta QSPI parity). */
bool mvProgramNvSave(bool auto_run_on_boot);
/** Load program from SPIFFS on boot. Returns true if a program was loaded. */
bool mvProgramNvLoad(void);
bool mvProgramNvClear(void);
bool mvProgramFromNv(void);
bool mvAutoRunOnBoot(void);
void mvSetAutoRunOnBoot(bool on);
void mvExecuteScan(uint32_t dt_ms);
/** Remote I/O mode: I/O scan only (no ST bytecode). */
void mvExecuteIoScan(void);
void mvOneShotReset(void);
const char *mvLastProgramError(void);
const char *mvProgramName(void);

bool mvRuntimeIsRunning(void);
void mvRuntimeSetRunning(bool on);
uint32_t mvRuntimeScanMs(void);
void mvRuntimeSetScanMs(uint32_t ms);
uint32_t mvRuntimeCycles(void);
uint32_t mvRuntimeLastCycleUs(void);

#ifdef __cplusplus
}
#endif
