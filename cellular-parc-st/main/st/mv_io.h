/*
 * Soft I/O for T-ETH-ELITE Parc ST — memory-mapped until field I/O is wired.
 * Tags I1..I8 / R1..R4 behave like Opta; values stay in RAM (or future Modbus).
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void mvIoBegin(void);
bool mvIoSmI010Present(void);
/** Refresh SM-I-010 opto/relay cache once per scan (no-op if HAT absent). */
void mvIoPollHardware(void);
bool mvReadDigitalIn(uint8_t index);
int mvReadAnalogRaw(uint8_t index);
void mvWriteRelay(uint8_t index, bool on);
/** Push cached R1..R4 to SM-I-010 (one I2C write). */
void mvIoFlushOutputs(void);
/** Drop all relays (MQTT loss / fail-safe). */
void mvIoFailsafeOff(void);
void mvForceDigitalIn(uint8_t index, bool on);
void mvForceAnalogRaw(uint8_t index, int raw);

#ifdef __cplusplus
}
#endif
