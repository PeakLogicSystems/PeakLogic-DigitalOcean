# PeakLogic Opta — Modbus RTU slave (RS485)

Firmware for **Arduino Opta RS485** that exposes PeakLogic Parc-equivalent I/O as a **Modbus RTU slave** on the onboard RS485 port. Pair with a **Dragino RS485-NB** cellular gateway using PC template `opta_parc_modbus_dragino`.

This sketch is **RS485 slave only** — no MQTT, no Ethernet ST. It cannot run at the same time as `mv_fieldbus` Modbus master on the same UART.

## Requirements

- **Board:** Arduino Opta **RS485** (or WiFi/Lite with RS485 transceiver)
- **Arduino IDE 2.x** + **Arduino Opta** board package (mbed_opta 4.x+)
- **Libraries** (Library Manager):
  - `ArduinoRS485`
  - `ArduinoModbus`

## Flash

1. Open `PeaklogicOptaRtuSlave/PeaklogicOptaRtuSlave.ino`
2. **Tools → Board → Arduino Opta (RS485)** (or your Opta variant)
3. Upload via USB
4. Serial Monitor **115200** — expect `Opta Modbus RTU slave ready id=2 baud=9600`

## Modbus map

Default **9600 8N1**, slave ID **2** (override in `mv_config.h`).

| FC | Address | Tags |
|----|---------|------|
| FC02 discrete | 0–7 | `I1`–`I8` |
| FC01 coils | 0–3 | `R1`–`R4` (master may write) |
| FC04 input | 0–7 | `I1_RAW`–`I8_RAW` (UINT16 ADC 0–1023) |
| FC04 input | 8–11 | `mA_AI3`–`mA_AI6` (centi-mA, ×0.01) |
| FC04 input | 12–15 | `scaled_AI3`–`scaled_AI6` (deci-units, ×0.1) |
| FC04 input | 16–21 | `MCSA_CH1_AMPS`–`CH6` (centi-A, ×0.01) |
| FC04 input | 22–23 | `PDM_P1_HEALTH`, `PDM_P2_HEALTH` (×0.01) |
| FC03 holding | 0–7 | `H1`–`H8` (read/write) |

PC-side mirror: `src/devices/templates/opta_parc_modbus_dragino.json`, `src/devices/tagBuilders.js` (`optaParcModbusDraginoTags`).

## Wiring

```text
Opta RS485 A/B ──> Dragino RS485 A/B
Common GND recommended
120 Ω termination at bus ends if cable > 10 m
```

- **Dragino** is Modbus **master** (polls with `AT+COMMAND*`)
- **Opta** is Modbus **slave** (this sketch)

## Pseudo AI

Without an analog expansion, `mA_AI3`–`6` are estimated from **0–10 V** inputs on I3–I6 (4–20 mA through 250 Ω shunt). MCSA-lite CT amps and pump health scores run on I1–I6 raw ADC (same math as `mv_edge_ai.cpp` in mqtt-st firmware).

## Cloud path (Dragino)

1. Flash this sketch on Opta
2. Commission Dragino — see [docs/DRAGINO_PARC_CLOUD.md](../../docs/DRAGINO_PARC_CLOUD.md#opta-parc-io-via-dragino)
3. `POST /api/parc/dragino-gateway/bind-preset` with `presetId: "opta_parc_modbus_dragino"`
4. Apply AT command plan — includes **`AT+TDC=300`** (poll Opta + uplink every **5 minutes**)

## PC Modbus master (local test)

Apply template **Arduino Opta — Modbus RTU Slave** (`opta_rtu_slave.json`) or **Opta Parc Dragino** (`opta_parc_modbus_dragino.json`), set COM/USB-RS485 to the Opta bus (or a second master only for bench test — one master on the wire at a time).

## Related

- Base register doc: [st/opta/README.md](../../st/opta/README.md)
- MQTT Parc firmware (different role): [firmware/arduino-opta-mqtt-st](../arduino-opta-mqtt-st/)
- Dragino cloud ingest: [docs/DRAGINO_PARC_CLOUD.md](../../docs/DRAGINO_PARC_CLOUD.md)
