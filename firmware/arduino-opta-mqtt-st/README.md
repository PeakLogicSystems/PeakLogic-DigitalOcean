# MooreVIEW Opta — ST + MQTT fleet

Combines the **ST runtime** from `arduino-opta-st` with **MooreVIEW fleet MQTT** (`mooreview/v1`).

## Flash

1. Open `MooreviewOptaMqttSt/MooreviewOptaMqttSt.ino`
2. Board: Arduino Opta (WiFi variant for setup AP)
3. Install libraries (**Sketch → Include Library → Manage Libraries**):

| Library | Required |
|---------|----------|
| ArduinoJson 7.x | Yes |
| PubSubClient | Yes (MQTT) |
| Arduino_Opta_Blueprint | Yes (expansions) |
| **EthernetWebServer** (author: Khoi Hoang) | Optional — local HTTP `/setup` on port 80 |

Without **EthernetWebServer**, the sketch still compiles: **ST + MQTT** work; only local HTTP is off.

4. Set broker IP and `deviceId` in `g_mqttCfg`
5. Upload

## ST environment

- Full on-device ST executor (`mv_st.cpp`) — same AST as MooreVIEW PC parser
- Tag model: `I1`–`I8`, `R1`–`R4`, `I1_RAW`–`I8_RAW`, PID/AVG/TIMER/COUNTER
- Expansion modules via setup GUI (AFX00005, AFX00007)
- Programs: `st/opta/*.st` — see `st/opta-mqtt/README.md`

## MQTT fleet

| Topic | Role |
|-------|------|
| `mooreview/v1/{id}/telemetry` | Tag snapshot + runtime status |
| `mooreview/v1/{id}/cmd` | `put_program`, `runtime_start`, `runtime_stop`, … |
| `mooreview/v1/{id}/config` | Pause telemetry during debug attach |

## Local HTTP (unchanged)

| Path | Purpose |
|------|---------|
| GET `/api/status` | Health + MQTT link state |
| GET `/api/tags` | Live tags |
| PUT `/api/program` | Deploy AST (local engineering) |
| GET `/setup` | Ethernet/WiFi/expansion config |

## MooreVIEW PC

Driver type **`mqtt_fleet`** — use template **Arduino Opta — MQTT fleet ST runtime**. Enable **Remote execution**, **Connect**, **Start** (same as `opta_remote`). See `st/opta-mqtt/README.md`.

## Baseline I/O sketch

Raw OptaBlue mirror firmware (`baselinedigankgexpansionwMQTT`) remains separate under `arduino-opta-mqtt/` for I/O-only MQTT without ST.
