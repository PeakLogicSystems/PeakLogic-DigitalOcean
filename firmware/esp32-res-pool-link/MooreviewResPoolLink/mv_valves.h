#pragma once

/*
 * Backwash valve map (4 configured; 3 is enough for most sand filters).
 *
 *   R1  FILT_INLET   filter inlet
 *   R2  FILT_OUTLET  filter outlet
 *   R3  BW_WASTE     backwash waste
 *   R4  BW_SPARE     spare (unwired OK)
 *
 * Local sequencer (no IOT-LINK / ST required):
 *
 *   FILTER    inlet ON,  outlet ON,  waste OFF
 *   BACKWASH  inlet ON,  outlet OFF, waste ON     default 180 s
 *   RINSE     inlet ON,  outlet ON,  waste ON     default 60 s
 *
 * Stop or power-up → FILTER (waste closed). Do not fail-safe all-OFF.
 */

enum MvValveCh : uint8_t {
  VALVE_INLET = 0,
  VALVE_OUTLET = 1,
  VALVE_WASTE = 2,
  VALVE_SPARE = 3,
};

enum MvBwMode : uint8_t {
  BW_MODE_FILTER = 0,
  BW_MODE_BACKWASH = 1,
  BW_MODE_RINSE = 2,
  BW_MODE_MANUAL = 3,
};

enum MvBwSeq : uint8_t {
  BW_SEQ_IDLE = 0,
  BW_SEQ_BACKWASH = 1,
  BW_SEQ_RINSE = 2,
};

static const char *const VALVE_CH_ID[VALVE_COUNT] = { "R1", "R2", "R3", "R4" };
static const char *const VALVE_TAG_ID[VALVE_COUNT] = {
  "FILT_INLET", "FILT_OUTLET", "BW_WASTE", "BW_SPARE",
};
static const char *const VALVE_LABEL[VALVE_COUNT] = {
  "Filter inlet", "Filter outlet", "Backwash waste", "Spare",
};

static const char *bwModeName(uint8_t mode)
{
  switch (mode) {
    case BW_MODE_BACKWASH: return "backwash";
    case BW_MODE_RINSE: return "rinse";
    case BW_MODE_MANUAL: return "manual";
    default: return "filter";
  }
}
