#pragma once

#include <Arduino.h>

/**
 * Opta onboard RS-485 fieldbus (edge poll → MQTT tags).
 *
 * Architecture (single UART / transceiver):
 *   - Modbus RTU master OR Pentair proprietary stack — one role at a time on the wire.
 *   - Modbus RTU slave (PC polls Opta) cannot run concurrently on the same port as master.
 *   - Preferred: PC USB–RS485 masters field devices; Opta publishes ST + I/O via MQTT Parc.
 *
 * Enable with MV_FIELDBUS=1 in build flags (stub in v2.3.49+).
 */

#ifndef MV_FIELDBUS
#define MV_FIELDBUS 0
#endif

struct MvFieldbusPollEntry {
  uint8_t deviceAddr;
  uint8_t protocol;   // 0=modbus, 1=pentair
  uint32_t pollMs;
  uint32_t lastPollMs;
  char tagPrefix[16];
};

struct MvFieldbusConfig {
  uint32_t baud;
  uint8_t parity;     // 0=none 1=even 2=odd
  uint8_t stopBits;
  uint16_t pollCount;
  MvFieldbusPollEntry polls[8];
};

void mvFieldbusInit(const MvFieldbusConfig* cfg);
void mvFieldbusTick(uint32_t nowMs);
bool mvFieldbusReady();
const char* mvFieldbusHealth();

/** Publish polled values into mv_tags (tag ids like FB_HP_MODE). */
void mvFieldbusSyncTags();
