# Dragino RS485-NB — cellular gateway to PeakLogic Cloud

Commission **Dragino RS485-NB** as a **cellular RS485/Modbus gateway** that uplinks sensor data directly to PeakLogic Cloud over NB-IoT — the same MQTT Parc path as an **Opta direct-to-cloud** connection, but for remote Modbus instruments instead of Opta I/O.

For **Arduino Opta + local Ethernet**, use the **LilyGO T-ETH cellular gateway** ([cellular-opta-gateway/README.md](../cellular-opta-gateway/README.md)). Dragino does **not** bridge an Opta on LAN by default; it reads RS485 Modbus devices and publishes over cellular.

**Opta over RS485:** When the Opta runs an **extended Modbus RTU slave** sketch (slave ID **2**), a Dragino on the same RS485 bus can poll Opta Parc-equivalent I/O (`I1`–`I8`, `R1`–`R4`, `I1_RAW`–`I8_RAW`, `mA_AI3`–`6`, MCSA pseudo-AI) using template **`opta_parc_modbus_dragino`**. See [§ Opta Parc I/O via Dragino](#opta-parc-io-via-dragino) below.

Related: [OPTA_PARC_CLOUD.md](./OPTA_PARC_CLOUD.md), [deploy/cloud/MQTT.md](../deploy/cloud/MQTT.md), [MQTT_PARC.md](./MQTT_PARC.md).

---

## Architecture

```text
RS485 sensor(s) ──A/B──> Dragino RS485-NB
                              │ NB-IoT
                              │ MQTT :1883 (JSON AT+PRO=3,5)
                              ▼
                    peaklogic.io Mosquitto
                              ▼
              PeakLogic Cloud Parc hub (auto-converts Dragino JSON → tags[])
                              ▼
                    mqtt_parc driver → HMI · historian · PdM
```

| Role | Device |
|------|--------|
| Pump control + ST on-site | **Arduino Opta** + T-ETH gateway → cloud |
| Remote tank level / water quality / Modbus probe | **Dragino RS485-NB** → cloud |
| Opta I/O at site without Opta cellular | **Opta Modbus slave** + **Dragino RS485-NB** → cloud |

---

## Opta Parc I/O via Dragino

Use when an **Arduino Opta** is on RS485 as a **Modbus RTU slave** and a **Dragino RS485-NB** uplinks over NB-IoT (no LilyGO T-ETH, no Opta MQTT to cloud).

```text
Opta (Modbus slave ID 2) ──A/B──> Dragino RS485-NB
                                        │ NB-IoT MQTT
                                        ▼
                              peaklogic/v1/{tenant}/{device}/telemetry
                                        ▼
                              Parc hub decodes → I1, R1, I1_RAW, mA_AI3, …
```

### Register map (Opta slave sketch)

Matches MQTT Parc tag names from `arduino_opta_parc` plus pseudo-AI scalars:

| Modbus | Address | Tags |
|--------|---------|------|
| FC02 discrete | 0–7 | `I1`–`I8` |
| FC01 coils | 0–3 | `R1`–`R4` |
| FC04 input | 0–7 | `I1_RAW`–`I8_RAW` |
| FC04 input | 8–11 | `mA_AI3`–`mA_AI6` (centi-mA, ×0.01) |
| FC04 input | 12–15 | `scaled_AI3`–`scaled_AI6` (×0.1) |
| FC04 input | 16–21 | `MCSA_CH1_AMPS`–`CH6` (MCSA-lite, ×0.01) |
| FC04 input | 22–23 | `PDM_P1_HEALTH`, `PDM_P2_HEALTH` (×0.01) |
| FC03 holding | 0–7 | `H1`–`H8` |

Default: **9600 8N1**, slave ID **2** (same as `opta_rtu_slave` base map; IR 8–23 are extensions for Dragino).

**Opta firmware:** flash `firmware/arduino-opta-rtu-slave/PeaklogicOptaRtuSlave` on the Opta RS485 port before commissioning Dragino.

### Cloud bind + commission

1. Add Dragino gateway driver (`dragino_rs485_nb` template) with `deviceId` e.g. `dragino_opta_01`.
2. Bind Modbus map:

```http
POST /api/parc/dragino-gateway/bind-preset
{ "deviceId": "dragino_opta_01", "presetId": "opta_parc_modbus_dragino", "slaveId": 2 }
```

3. Generate AT command plan:

```http
POST /api/parc/dragino-gateway/plan
{ "deviceId": "dragino_opta_01", "presetId": "opta_parc_modbus_dragino", "tenantId": "your-tenant" }
```

Plan includes `AT+TDC=300` — Dragino polls Opta every **5 minutes** and uplinks to PeakLogic.

Apply `AT+COMMAND1`…`3` from the plan (FC02 ×8 DI, FC01 ×4 coils, FC04 ×24 IR). Set **`AT+TDC=300`** (5-minute poll + uplink). Tags use **Parc names** (`I1`, not `MB_REG_1`).

Device template: `src/devices/templates/opta_parc_modbus_dragino.json`

---

## JXCT soil 7-in-1 via Dragino

Use when a **JXCT JXBS-3001-NPK-RS** seven-in-one soil probe (pH, moisture, temperature, EC, N/P/K) is on RS485 and uplinks through **Dragino RS485-NB**.

```text
JXCT probe (Modbus slave 1) ──A/B──> Dragino RS485-NB
                                          │ NB-IoT MQTT
                                          ▼
                                peaklogic/v1/{tenant}/{device}/telemetry
                                          ▼
                                SOIL_PH, SOIL_MOIST_PCT, SOIL_TEMP_C, …
```

### Cloud bind + commission

1. Add Dragino gateway driver (`dragino_rs485_nb` template) with `deviceId` e.g. `dragino_jxct_01`.
2. Bind Modbus map:

```http
POST /api/parc/dragino-gateway/bind-preset
{ "deviceId": "dragino_jxct_01", "presetId": "jxct_npk_jxbs3001_dragino", "slaveId": 1 }
```

3. Generate AT command plan:

```http
POST /api/parc/dragino-gateway/plan
{ "deviceId": "dragino_jxct_01", "presetId": "jxct_npk_jxbs3001_dragino", "tenantId": "your-tenant" }
```

Plan includes one FC03 read block (`AT+COMMAND1=01 03 00 06 00 1B,1` — 27 holding regs from 0x0006) and `AT+TDC=300` (5-minute poll/uplink). Optional `AT+5VT=5000` powers the probe before each sample.

Default comm: **9600 8N1**, slave **1**. Tags: `SOIL_PH`, `SOIL_MOIST_PCT`, `SOIL_TEMP_C`, `SOIL_EC_US_CM`, `N_MG_KG`, `P_MG_KG`, `K_MG_KG`.

Device template: `src/devices/templates/jxct_npk_jxbs3001_dragino.json` (local RS485: `jxct_npk_jxbs3001.json`). Sample Parc report: `st/fixtures/jxct-7in1-dragino-telemetry-sample.json`.

### Four probes on one Dragino

Wire up to **four** JXBS-3001-NPK-RS probes on the same RS485 A/B bus. Set each probe to a **unique Modbus address** (holding register **0x0100**): **1, 2, 3, 4** (factory default is 1 — change three probes before powering all on).

```http
POST /api/parc/dragino-gateway/bind-preset
{ "deviceId": "dragino_jxct_x4", "presetId": "jxct_npk_jxbs3001_dragino_x4" }

POST /api/parc/dragino-gateway/plan
{ "deviceId": "dragino_jxct_x4", "presetId": "jxct_npk_jxbs3001_dragino_x4", "tenantId": "your-tenant" }
```

Plan emits **four** `AT+COMMAND*` lines (FC03, start **0x0006**, qty **27**, slaves **1–4**). Tags: `S1_SOIL_PH` … `S4_K_MG_KG` (28 points). Dragino supports up to **15** Modbus commands per uplink cycle.

Device template: `src/devices/templates/jxct_npk_jxbs3001_dragino_x4.json`.

---

## DFRobot pool chemistry via Dragino

Standard **chemistry-only pool monitor**: **SEN0711** (pH + water temp) + **SEN0712** (free chlorine) on one RS485 bus → Dragino RS485-NB.

```text
SEN0711 (slave 1) ──┐
SEN0712 (slave 2) ──┴── A/B ──> Dragino ── NB-IoT ──> PH_PV, CL_PV, WATER_TEMP_C
```

| Probe | Modbus | Tags |
|-------|--------|------|
| SEN0711 ammonia/pH | Slave **1**, FC04 IR 0–2, **4800 8N1** | `PH_PV`, `WATER_TEMP_C`, `NH3_MG_L` |
| SEN0712 chlorine | Slave **2**, FC04 IR 0, **4800 8N1** | `CL_PV` |

Configure unique slave IDs at holding reg **0x07D0** before wiring both probes.

```http
POST /api/parc/dragino-gateway/bind-preset
{ "deviceId": "dragino_pool_chem", "presetId": "dfrobot_pool_chemistry_dragino" }

POST /api/parc/dragino-gateway/plan
{ "deviceId": "dragino_pool_chem", "presetId": "dfrobot_pool_chemistry_dragino", "tenantId": "your-tenant" }
```

Plan: `AT+BAUDR=4800`, `AT+COMMAND1=01 04 0000 0003,1`, `AT+COMMAND2=02 04 0000 0001,1`, `AT+TDC=300`.

Device template: `src/devices/templates/dfrobot_pool_chemistry_dragino.json`. Sample: `st/fixtures/pool-chemistry-dragino-telemetry-sample.json`.

---

## Prerequisites

| Item | Requirement |
|------|-------------|
| Dragino | RS485-NB (GE version + your NB-IoT SIM) |
| Cloud | Mosquitto **1883** open; `MOSQUITTO_USER` / `MOSQUITTO_PASS` |
| PeakLogic Cloud | `PEAKLOGIC_DEPLOYMENT=cloud`; MQTT Parc hub enabled |
| Sensor | Modbus RTU on RS485 (baud/slave ID documented) |

---

## 1. Cloud broker

Same as Opta direct connect — see [OPTA_PARC_CLOUD.md §1](./OPTA_PARC_CLOUD.md#1-cloud-broker).

```bash
mosquitto_pub -h peaklogic.io -p 1883 -u peaklogic -P "$MOSQUITTO_PASS" -t 'test/ping' -m ok
```

---

## 2. Dragino field config (BLE / AT)

### Network

```text
AT+APN=<carrier_apn>
AT+CFUN=1
```

### Modbus RS485

```text
AT+MOD=1
AT+BAUDR=9600
AT+PARITY=0
AT+MBFUN=1
AT+COMMAND1=01 03 00 00 00 04,1    // example: slave 1, 4 holding regs @ 0
AT+TDC=300                          // uplink every 5 min (default 7200s)
```

Use the Dragino RS485 Configure Tool for complex multi-register maps.

### MQTT → PeakLogic Cloud

**Option A — flat topic (same as Opta direct):**

```text
AT+PRO=3,5
AT+SERVADDR=peaklogic.io,1883
AT+CLIENT=dragino_pump01
AT+UNAME=peaklogic
AT+PWD=<MOSQUITTO_PASS>
AT+PUBTOPIC=peaklogic/v1/dragino_pump01/telemetry
AT+SUBTOPIC=peaklogic/v1/dragino_pump01/downlink
```

**Option B — tenant-scoped topic (multi-tenant cloud):**

```text
AT+PUBTOPIC=peaklogic/v1/putnam-county-utilities/dragino_pump01/telemetry
AT+SUBTOPIC=peaklogic/v1/putnam-county-utilities/dragino_pump01/downlink
```

**Option C — legacy Dragino topic (hub auto-converts):**

```text
AT+PUBTOPIC=dragino/pump01/uplink
```

Maps to Parc deviceId `dragino_pump01`. On cloud, set **System setup → MQTT Parc → Dragino cloud tenant** to stamp tenant metadata.

Press **ACT** >3s to activate and attach NB-IoT.

---

## 3. Cloud Studio

1. Sign in → open tenant project.
2. **System setup → MQTT Parc hub** — enabled, broker `mqtt://127.0.0.1:1883`, same Mosquitto credentials.
3. **Drivers → Device template → Dragino RS485-NB — NB-IoT Modbus gateway**.
4. **Parc device ID** = `dragino_pump01` (must match MQTT topic).
5. After first uplink: **Sync tags from device**.

Tags appear as `CELL_SIGNAL`, `CELL_BATTERY_V`, `MB_REG_1`… from Modbus decode.

---

## 4. Verify

| Check | Pass |
|-------|------|
| Dragino LED / NB attach | Registered on carrier |
| Droplet `mosquitto_sub -t 'peaklogic/v1/+/telemetry' -v` | Dragino JSON arrives |
| Cloud Parc registry | Device online |
| Driver | Linked / OK |
| Tags | `CELL_*` and `MB_REG_*` updating |

Smoke test from droplet (simulates Dragino JSON on Parc topic):

```bash
mosquitto_pub -h 127.0.0.1 -p 1883 -u peaklogic -P "$MOSQUITTO_PASS" \
  -t 'peaklogic/v1/dragino_pump01/telemetry' \
  -m '{"Model":"RS485-NB","IMEI":"863663062798815","Payload":"010304000100020008","battery":3.6,"signal":25}'
```

---

## Dragino vs Opta cellular gateway

| | **Dragino RS485-NB** | **LilyGO T-ETH + Opta** |
|--|----------------------|-------------------------|
| Connects | RS485 Modbus sensors | Arduino Opta (Ethernet) |
| Cellular | NB-IoT built-in | LTE (A7670) |
| Local broker | No | Yes (`192.168.1.1:1883`) |
| Remote ST | No | Yes (Parc cmd channel) |
| Best for | Remote instruments, battery sites | Lift stations, pump control |

---

## Cloud settings (optional)

In tenant `settings.json`:

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://127.0.0.1:1883",
  "cloudTenantIngest": true,
  "dragino": {
    "enabled": true,
    "cloudTenantId": "putnam-county-utilities",
    "topicPrefix": "dragino",
    "deviceIdPrefix": "dragino_"
  }
}
```

`cloudTenantIngest` subscribes to `peaklogic/v1/{tenant}/{device}/telemetry` (auto on cloud deployment).

---

## Related

- Dragino wiki: [RS485-NB](https://wiki.dragino.com/docs/NB-IoT/rs485-sdi-12-sensor-nodes/rs485-nb/)
- Sample Parc report: `st/fixtures/dragino-rs485-nb-telemetry-sample.json`
- Device template: `src/devices/templates/dragino_rs485_nb.json`
