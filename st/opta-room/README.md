# Opta Room — ST programs

Programs for **PeakLogic Opta Room** (`firmware/arduino-opta-room`). Not for generic `arduino-opta-mqtt-st`.

Deploy via MQTT Parc (same as `st/opta-mqtt/README.md`). Tags include slotted `SHELLY<n>_*` from WiFi Shelly Flood peripherals.

| File | Description | Required tags |
|------|-------------|---------------|
| `09_shelly_flood.st` | Two leak sensors -> valve `R1`, alarm `R2` on leak or offline | `SHELLY1_FLOOD`, `SHELLY1_ONLINE`, `SHELLY2_FLOOD`, `SHELLY2_ONLINE`, `R1`, `R2` |

See `firmware/arduino-opta-room/README.md` for Shelly webhook pairing.
