/*
 * Sequent Microsystems SM-I-010 — Four Relays + Four HV Opto Inputs (4relind).
 * I2C protocol from SequentMicrosystems/4relind-rpi (MIT).
 *
 * Supports:
 *   - IO-expander cards @ 0x38..0x3F / 0x20..0x27
 *   - CPU cards (v4+) @ 0x0e..0x15
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    SM_I010_KIND_NONE = 0,
    SM_I010_KIND_IOEXP = 1,
    SM_I010_KIND_CPU = 2,
} sm_i010_kind_t;

/** Init I2C and probe stack level. Returns true if card found. */
bool sm_i010_init(int i2c_port, int sda_gpio, int scl_gpio, int stack_level);

bool sm_i010_present(void);
sm_i010_kind_t sm_i010_kind(void);
uint8_t sm_i010_addr(void);

/** Refresh cached opto + relay state from the card. */
bool sm_i010_poll(void);

/** Opto input channel 0..3 (maps to I1..I4). Active = voltage present. */
bool sm_i010_read_opto(uint8_t channel);

/** Relay channel 0..3 (maps to R1..R4). */
bool sm_i010_read_relay(uint8_t channel);
bool sm_i010_write_relay(uint8_t channel, bool on);
bool sm_i010_write_relays_all(uint8_t mask);

#ifdef __cplusplus
}
#endif
