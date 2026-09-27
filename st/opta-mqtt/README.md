# Arduino Opta — ST over MQTT Parc (bytecode IR)

Structured Text runs **on the Opta**; PeakLogic **est-pc** deploys **bytecode** (`MVBC`) and controls runtime over **MQTT** (`mqtt_parc` driver). Alpha — JSON AST (protocol v1) is removed.

## 1. Flash firmware

`firmware/arduino-opta-mqtt-st/PeakLogicOptaMqttSt/`

Add **`mv_bc.cpp`**, **`mv_base64.cpp`** to the sketch (same folder as `mv_st.cpp`).

In `PeakLogicOptaMqttSt.ino`, set MQTT broker + device id:

```cpp
static PlMqttConfig g_mqttCfg = {
  "192.168.1.233",  // MQTT broker IP (PeakLogic PC LAN)
  1883,
  "opta_st_01",     // must match driver deviceId
  "peaklogic/v1",
  180000,
};
```

## 2. Local MQTT broker (Windows)

PeakLogic PC runs the **Parc hub**; Opta connects to the same broker on the LAN.

| Item | Value |
|------|-------|
| Executable | `C:\Program Files\mosquitto\mosquitto.exe` |
| Service config | `C:\Program Files\mosquitto\mosquitto.conf` |
| Dev config (repo) | `config/mosquitto-dev.conf` — `listener 1883 0.0.0.0`, `allow_anonymous true` |

**One-time (Administrator):** patch the Windows service to listen on all interfaces:

```powershell
cd C:\Users\public\data\est-pc
.\scripts\setup-mqtt-broker-admin.ps1
```

**Start / verify (normal shell):**

```bash
npm run mqtt:start   # patch service if Admin, else dev broker on 0.0.0.0:1883
npm run mqtt:stop    # stop dev broker PID; service stop needs Admin
```

Set `mqttParc.brokerUrl` to your PC LAN IP (e.g. `mqtt://192.168.1.233:1883`). Flash firmware with the same broker IP in `g_mqttCfg`.

## 3. est-pc MQTT hub

`data/settings.json`:

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.233:1883",
  "topicPrefix": "peaklogic/v1"
}
```

Restart est-pc after enabling.

## 4. PeakLogic project

1. **Drivers → Apply template → Arduino Opta — MQTT Parc ST runtime**
2. **deviceId** = `opta_st_01` (same as firmware)
3. **Save drivers**
4. **Program → Remote** → **Connect** → **Start**

Deploy payload is `{ protocolVersion: 2, bc: "<base64 MVBC>", programName }` — typically **5–20× smaller** than JSON AST.

While attached, PeakLogic sets Parc `reportMs` ≈ `2× scanMs` for HMI tag refresh (default firmware telemetry is 180 s when idle).

## Wire format

| Field | Description |
|-------|-------------|
| Magic | `MVBC` |
| Tags | Name + compact meta (type, preset, PID tuning) |
| Code | Stack IR opcodes (`PUSH_*`, `CALL`, `ACTION`, `JMP_IFNOT`, …) |

PC compiler: `src/engine/stBytecode.js` · Firmware VM: `mv_bc.cpp`

## Compare (legacy removed)

| | Old HTTP `opta_remote` | **MQTT Parc bytecode** |
|--|------------------------|-------------------------|
| Firmware | `arduino-opta-st` | `arduino-opta-mqtt-st` |
| Program | JSON AST | **MVBC bytecode** |
| Runtime comms | HTTP `/api/scan` each tick | Device scan + MQTT telemetry |
| Protocol | v1 | **v2** |