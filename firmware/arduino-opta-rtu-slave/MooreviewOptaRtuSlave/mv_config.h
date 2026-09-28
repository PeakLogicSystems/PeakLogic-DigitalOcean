#pragma once

#ifndef MV_DIN_PIN0
#define MV_DIN_PIN0 A0
#endif
#ifndef MV_RELAY_PIN0
#define MV_RELAY_PIN0 D0
#endif

/** Modbus RTU slave — matches opta_parc_modbus_dragino.json / st/opta/README.md */
#ifndef MV_MODBUS_SLAVE_ID
#define MV_MODBUS_SLAVE_ID 2
#endif
#ifndef MV_MODBUS_BAUD
#define MV_MODBUS_BAUD 9600
#endif

#ifndef MV_CT_RAW_TO_AMPS
#define MV_CT_RAW_TO_AMPS 0.48828125f
#endif
#ifndef MV_MCSA_LITE_CHANNELS
#define MV_MCSA_LITE_CHANNELS 6
#endif
