# Arduino Opta — ST over MQTT fleet

Structured Text runs **on the Opta**; PeakLogic **est-pc** deploys and starts programs over **MQTT** (same workflow as Ethernet `opta_remote`, different transport).

## 1. Flash firmware

`firmware/arduino-opta-mqtt-st/PeakLogicOptaMqttSt/`

Libraries: **ArduinoJson** 7, **PubSubClient**, **Arduino_Opta_Blueprint**, and optionally **EthernetWebServer** (Khoi Hoang) for local `/setup` HTTP. Without EthernetWebServer the sketch still builds — ST + MQTT only.

In `PeakLogicOptaMqttSt.ino`, set:

```cpp
static PlMqttConfig g_mqttCfg = {
  "192.168.1.100",  // MQTT broker IP
  1883,
  "opta_st_01",     // fleet device id — must match driver below
  "peaklogic/v1",
  180000,
};
```

Commission Ethernet via `/setup` (WiFi AP `PeakLogic-Opta` on WiFi models).

## 2. est-pc MQTT hub

`data/settings.json`:

```json
"mqttFleet": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.100:1883",
  "topicPrefix": "peaklogic/v1"
}
```

Restart est-pc after enabling.

## 3. PeakLogic project

1. **Drivers → Apply template → Arduino Opta — MQTT fleet ST runtime**
2. Confirm **device id** = `opta_st_01` (same as firmware)
3. **Save drivers**
4. **Program → Remote execution** ✓ (auto-enabled by template)
5. Load `st/opta/01_i1_to_r1.st` with **Load matching fixtures** → `tags.opta_mqtt_st.json` + `drivers.opta_mqtt_st.json`
6. **Connect** (Program panel) — links via MQTT
7. **Validate** → **Start** — deploys AST + starts scan on device

## ST programs

Use programs under `st/opta/` (each header lists **required tags**). **Load matching fixtures** loads only those tags.

| File | Description | Required tags |
|------|-------------|---------------|
| `opta/01_i1_to_r1.st` | `I1` → `R1` | `I1`, `R1` |
| `opta/02_analog_alarm_to_r2.st` | Analog alarm → `R2` | `I1_RAW`, `R2` |
| `opta/03_pid_avg.st` | PID + moving average | `I1`, `R1`, `R2`, `I1_RAW`, `H1`–`H3`, `PID1`, `AVG1` |
| `opta/04_timer_counter.st` | Timer + counter on `I1` | `I1`, `R1`, `R2`, `TMR1`, `CTR1` |

## Fleet HMI (other devices keep reporting)

While programming this Opta, telemetry still flows unless paused by attach. Overview bindings:

```
fleet.opta_st_01.I1
fleet.opta_st_01.R1
```

## API (alternative to UI)

```http
POST /api/fleet/devices/opta_st_01/program
{ "start": true, "scanMs": 100 }
```

## Compare

| | Ethernet ST | **MQTT ST** |
|--|-------------|-------------|
| Firmware | `arduino-opta-st` | `arduino-opta-mqtt-st` |
| Driver type | `opta_remote` | `mqtt_fleet` |
| Deploy | HTTP | MQTT `put_program` |
| Fleet overview | — | `peaklogic/v1/.../telemetry` |
