# PeakLogic Opta Room — room integration controller

**Separate product** from `arduino-opta-mqtt-st`. Same ST + MQTT Parc runtime base; adds WiFi peripheral ingest for Shelly Flood Gen4 leak sensors in a room/zone.

**Current firmware:** `1.0.0` (independent version line from mqtt-st `2.3.x`).

## Role

```
Shelly Flood (x N) --WiFi--> Opta AP (192.168.4.1) --PARC/MQTT (Ethernet)--> PeakLogic
```

The Opta aggregates up to `MV_SHELLY_MAX` (default 8) battery Shelly Flood Gen4 sensors. Each pushes state via HTTP webhook to the Opta WiFi AP. Tags flow to central over PARC like any other Opta tag and are usable in on-device ST.

| Tag (slot n) | Type | Meaning |
|--------------|------|---------|
| `SHELLY<n>_FLOOD` | BOOL | Flood / rain alarm |
| `SHELLY<n>_TEMP_C` | REAL | Temperature (C) |
| `SHELLY<n>_BATT` | INT | Battery (%) |
| `SHELLY<n>_ONLINE` | BOOL | Webhook seen within `MV_SHELLY_STALE_MS` (default 2 h) |

## Build the sketch (first time)

The sketch is generated from `arduino-opta-mqtt-st` plus room overlays:

```powershell
cd firmware\arduino-opta-room\scripts
.\bootstrap.ps1
```

This creates `firmware/arduino-opta-room/PeakLogicOptaRoom/` (gitignored generated tree). Open `PeakLogicOptaRoom.ino` in Arduino IDE.

Re-run bootstrap after updating either the mqtt-st base or room overlays.

## Flash

1. Board: **Arduino Opta WiFi**
2. Libraries: same as `arduino-opta-mqtt-st` (ArduinoJson 7.x, PubSubClient, Arduino_Opta_Blueprint, ArduinoECCX08)
3. Set MQTT broker in `g_mqttCfg` or `/setup`
4. **Enable WiFi AP** in `/setup` (required for Shelly peripherals)

## Shelly pairing

1. Enable WiFi AP on Opta (`PeakLogic-Opta`, min 8-char password), Save/Reboot.
2. Join each Shelly Flood to that AP.
3. On each Shelly, add **Actions** (GET URL webhook) for flood on/off with a unique `dev` slot:

```
http://192.168.4.1:8080/api/peripheral/shelly?dev=1&flood=${flood:0.alarm}&tC=${temperature:0.tC}&batt=${devicepower:0.battery.percent}
http://192.168.4.1:8080/api/peripheral/shelly?dev=2&flood=${flood:0.alarm}&tC=${temperature:0.tC}&batt=${devicepower:0.battery.percent}
```

The `/setup` **Room integration** card shows per-slot status.

## PeakLogic PC

Use the existing **Arduino Opta — MQTT Parc ST runtime** template (`mqtt_parc`, `tagsFromDevice`). No separate PC template — slotted `SHELLY<n>_*` tags appear automatically from device telemetry.

Example ST: `st/opta-room/09_shelly_flood.st`

## Room-specific sources (overlays)

| File | Role |
|------|------|
| `PeakLogicOptaRoom.ino` | Boot log, peripheral begin/tick |
| `mv_peripheral.h` / `mv_peripheral.cpp` | Shelly webhook ingest, slotted tags |
| `mv_setup_web.cpp` | Room setup UI + `/api/peripheral/shelly` |
| `mv_version.h` | Product version `1.0.0` |

All other `.cpp`/`.h` files come from `arduino-opta-mqtt-st` at bootstrap time. When fixing shared runtime bugs, patch mqtt-st and re-bootstrap room.
