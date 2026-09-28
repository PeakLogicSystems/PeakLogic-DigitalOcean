# PeakLogic Opta — Firmware & Operation Reference

**Sketch:** `PeakLogicOptaMqttSt`  
**Current version:** `2.3.81` (`mv_version.h`)  
**Protocol:** MQTT Parc `peaklogic/v1/{deviceId}/…`; global P2P tags `peaklogic/v1/g/{siteKey4}/{tagName}`

PeakLogic PC integrates via driver type **`mqtt_parc`**. In-app help: **F1 → MQTT Parc hub & Opta**.

---

## Overview

PeakLogicOptaMqttSt combines an on-device **ST bytecode runtime** with **MQTT Parc** telemetry and remote deploy. The PC hub ingests telemetry into `data/parc.json`; PeakLogic deploys programs with `put_program`, runs ST with `runtime_start`, and syncs forces and time over MQTT.

### Device modes (v2.3.46+)

| Mode | Opta | PC |
|------|------|-----|
| **Standalone** (default) | Runs ST bytecode, full scan loop, NV auto-run | Enable **Remote ST execution**; **Download & Start** deploys to Opta |
| **Remote I/O** | I/O scan only — reads inputs, writes outputs from PC via `write_outputs`; rejects `put_program` | **Remote ST execution OFF** — PC scan engine runs ST; driver sends output values over MQTT |

Set mode on **`/setup → Device mode`**, via MQTT `set_device_mode`, or save in NV config. Reboot after change.

**Important:** Parc deploy updates the ST program and NV storage only. It does **not** flash this sketch. After firmware changes in git, re-upload via Arduino IDE.

---

## Hardware

| Component | Details |
|-----------|---------|
| **Base** | Arduino Opta — 8 digital inputs (I1–I8), 4 relays (R1–R4), raw analog I1_RAW–I8_RAW |
| **Relay LEDs** | On-board LEDs D0–D3 mirror relay states R1–R4 |
| **Expansion slot 1** | Closest to base; up to 5 slots configured |
| **AFX00005 (D1608E)** | 16 digital inputs + 8 relay outputs |
| **AFX00007 (A0602)** | 8 analog channels + 4 PWM outputs |
| **Identity** | ATECC608B 9 bytes → FNV-1a 64 → `deviceId` = `mv_` + 16 hex (legacy `opta_{18hex}` still accepted by PC registry) |
| **Global site key** | Admin-assigned `uint16` (default `0x0001`) for P2P globals; addr key = 4 lowercase hex digits |
| **Network** | Ethernet (primary); optional WiFi setup AP |

Requires **24 V** on expansion modules for detection. Install **Arduino_Opta_Blueprint** for expansion scan.

---

## Firmware architecture

| Module | Role |
|--------|------|
| `PeakLogicOptaMqttSt.ino` | Main loop, HTTP routes, deferred NV auto-run |
| `mv_mqtt.cpp` | Parc MQTT client, command dispatch, telemetry |
| `mv_st.cpp`, `mv_bc.cpp` | ST bytecode VM (same AST as PeakLogic PC) |
| `mv_tags.cpp`, `mv_io.cpp`, `mv_expansions.cpp` | Tag model, physical I/O, expansion tags |
| `mv_program_store.cpp` | QSPI NV program file, CRC, auto-run flag |
| `mv_store.cpp`, `mv_setup_web.cpp` | Device config KV (Ethernet, broker, expansions, **global site key**) |
| `mv_global_key.cpp` | Global site key → addr key + topic helper (`peaklogic/v1/g/{key}/{tag}`) |
| `mv_io_map.cpp` | `/io-map` web UI and JSON API |
| `mv_rtc.cpp` | Software wall clock + queued HAL RTC |
| `mv_identity.cpp` | ATECC608 → `mv_{16hex}` deviceId (FNV-1a 64) |
| `mv_http.cpp` | Native Ethernet HTTP server |
| `mv_watchdog.cpp` | Hardware + liveness watchdog (loop stall + idle reset) |
| `mv_ota.cpp`, `mv_version.cpp` | OTA upload, version reporting |
| `mv_mcsa_m7.cpp` + `PeaklogicOptaMcsaM4` | 5 min I1–I6 ingest on M7; true FFT + classify on M4 |
| `mv_mcsa_mon.cpp` + `mv_mcsa_mon_web.cpp` | MCSA monitor config (`/mcsa`): deviceType 0–5, poles/slip, HVAC env |

Serial debug: USB **115200**. Milestone logs use `[MV*]` prefix (always on).

---

## Network

### Ethernet

DHCP or static IP configured on `/setup`. Default static example: `192.168.1.50`.

### MQTT broker

- **Topic prefix:** `peaklogic/v1`
- **Telemetry:** `peaklogic/v1/{deviceId}/telemetry` (no ATECC serial in JSON)
- **Global tags (P2P):** `peaklogic/v1/g/{siteKey4}/{tagName}` — site key from NV config (default `0001`); firmware v2.3.47+ pub/sub at telemetry rate (retained); PC hub mirrors into tag store
- **Commands:** `peaklogic/v1/{deviceId}/cmd`
- **Responses:** `peaklogic/v1/{deviceId}/cmd/response`
- **Config:** `peaklogic/v1/{deviceId}/config` (pause telemetry during debug)

Broker IP/port saved in device NV on `/setup` (example: `192.168.1.233:1883`). Must match PeakLogic **System setup → MQTT broker URL** (PC LAN IP, not `127.0.0.1` from the device). Reboot after broker change.

### PC hub

Enable **MQTT Parc hub** and set broker URL in PeakLogic System setup. Start Mosquitto on the PC LAN interface (`npm run mqtt:start`).

---

## Web pages and APIs on device

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/`, `/setup` | Setup GUI — Ethernet, WiFi AP, MQTT broker, **global site key**, **device mode**, expansions, ST status, **clear program** |
| GET | `/io-map` | Live I/O map (base + expansions); **Enable I/O update** polls API |
| GET | `/api/status` | Full health JSON |
| GET | `/api/status/lite` | Lightweight status (setup panel refresh) |
| GET | `/api/tags` | Tag snapshot |
| GET | `/api/io-map` | I/O map JSON (logic vs effective when forced) |
| GET/PUT | `/api/setup/config` | Read/write persisted device config |
| POST | `/api/setup/scan` | Scan expansion modules |
| POST | `/api/setup/reboot` | Reboot device |
| PUT/DELETE | `/api/program` | Local AST deploy / clear (engineering) |
| GET/PUT | `/api/program/autorun` | NV auto-run flag |
| POST | `/api/runtime/start`, `/api/runtime/stop` | Local runtime control |
| GET | `/api/ota` | OTA status |
| POST | `/api/firmware` | Flash `.bin` (reboots) |

Navigation bar links **Setup** ↔ **I/O Map** on both pages.

---

## MQTT command reference

Publish JSON to `peaklogic/v1/{deviceId}/cmd`:

```json
{ "id": "<uuid>", "op": "<command>", "body": { … } }
```

| Command | Body (key fields) | Effect |
|---------|-------------------|--------|
| `put_program` | `bc`, `tagIds`, `tags`, `protocolVersion`, `clientVersion`, optional `autoRunOnBoot` | Load bytecode, save to QSPI NV, register tags |
| `runtime_start` | `scanMs` (default 100) | Start ST scan loop |
| `runtime_stop` | — | Stop scan loop |
| `runtime_status` | — | Return running state, programOk |
| `set_force` | `tagId`, `forceInput`, `forceOutput`, `forceValue` | Apply PLC-style force |
| `clear_force` | `tagId` | Release force on tag |
| `sync_time` | `unixUtc`, `tzOffsetMin` | Set software wall clock (not during deploy) |
| `set_autorun` | `enabled` or `autoRunOnBoot` | Persist auto-run on power-up (KV) |
| `clear_program` | — | Clear program, stop runtime |
| `get_program` | — | NV status: `programFromNv`, `programNvCrc`, `autoRunOnBoot` |
| `scan_expansions` | — | Rescan modules, refresh expansion tags |
| `write_outputs` | `outputs`: `{ "R1": true, … }` | Set output tag values (Remote I/O mode; PC scan writes) |
| `set_device_mode` | `mode`: `standalone` \| `remote_io` | Persist device mode in NV (reboot recommended) |

`put_program` blocks other commands until complete. In **Remote I/O** mode, `put_program`, `clear_program`, and `set_autorun` are rejected. Minimum firmware for Parc deploy: **v2.3.18+**. Recommended: **v2.3.41+** (reliable MQTT cmd subscribe).

---

## NV storage

| Store | Location | Contents |
|-------|----------|----------|
| Device config KV | `/kv/mv_setup` | Ethernet, WiFi AP, expansion slot types, **MQTT broker IP/port**, **device mode**, **globalSiteKey** |
| Auto-run flag KV | `/kv/mv_autorun` | `autoRunOnBoot` (0/1) |
| Program file | QSPI FAT `/fs/mv_program.bin` | Header (name, CRC, auto-run) + bytecode |

Program NV uses Modbus CRC16 over bytecode (matches PC `bcDeployCrc`). On boot, firmware loads NV program before MQTT; if `autoRunOnBoot` is set, ST starts ~500 ms after MQTT connects.

---

## ST program lifecycle

```
Power-up → load NV program (if present) → Ethernet + MQTT connect
    → [autoRunOnBoot?] defer runtime_start ~500 ms
PC Connect → runtime_status + sync_time
PC Download & Start → put_program (skip if NV CRC matches) → runtime_start
Deploy → save bytecode to QSPI (async write phases)
Stop → runtime_stop (program remains in NV)
clear_program / DELETE /api/program → clear NV program
```

PeakLogic **System setup → Auto-run ST on Opta after power-up** sends `autoRunOnBoot: true` with deploy. PC boot auto-start waits ~8 s before deploy when Remote is on.

---

## Force and I/O

- **Mux model:** `logicValue` = hardware read; effective tag getters return forced value when `forceInput` or `forceOutput` is set.
- **PC Tags → Force** sends `set_force` / `clear_force` over MQTT when Remote execution is on.
- **Relay outputs:** R1–R4 drive relays and mirror to LED_D0–LED_D3.
- **I/O map:** `/io-map` shows forced points highlighted; enable polling with **Enable I/O update**.
- **Expansions:** Tags auto-created after scan (e.g. expansion DI/DO/AI naming from slot index).

---

## Time sync

- PC sends `sync_time` on **Connect** and **daily** for linked Opta drivers.
- Firmware sets an immediate **software wall clock** for timestamps and queues HAL RTC when idle (HAL write can block ~15 s — not done during deploy).
- `put_program` does **not** sync time.
- Before sync, serial logs use uptime; after sync, `YYYY-MM-DD HH:MM:SS`. Setup **Clock** row shows `rtcTime`.

---

## Version history (2.3.30+ highlights)

| Version | Notes |
|---------|-------|
| Version | Highlights |
|---------|------------|
| **2.3.75** | **CT calibration** — `/ct-cal` commissioning UI, NV scale/offset, oversampling on I1–I6; edge AI uses calibrated amps |
| **2.3.69** | **Watchdog wired** — loop begin/end + HTTP/MQTT NoteActivity; `/api/status` → `watchdog`; `/setup` clear-program button; `DELETE /api/program` |
| **2.3.61** | **Bytecode OP_DROP** — fix TurnON/TurnOFF trace stack leak in large ST programs; flash firmware then redeploy ST |
| **2.3.56** | **Hardware + liveness watchdog** — mbed WDT (30s loop stall) + service idle reset (2 min no HTTP/MQTT); `/api/status` → `watchdog` |
| **2.3.48** | **Phase 1 device id** `mv_{16hex}` (FNV-1a 64 of ATECC 9 bytes); PC accepts legacy `opta_*` |
| **2.3.47** | **Global site key** in NV + `/setup`; ATECC serial redacted from MQTT telemetry; `mv_global_key` topic helpers |
| **2.3.46** | **Device mode:** Standalone vs Remote I/O; `write_outputs`, `set_device_mode`; `/setup` mode selector |
| **2.3.45** | Prior release |
| **2.3.41+** | MQTT cmd subscribe reliability; fix telemetry-OK-but-cmd-timeout |
| **2.3.30–2.3.40** | NV program store, skip-deploy CRC, I/O map web UI, expansion telemetry |
| **2.3.24+** | Native HTTP, RTC software clock, broker NV on `/setup` |
| **2.3.18+** | Minimum for MQTT `put_program` deploy from PeakLogic |
| **2.3.11+** | Fix 2.3.8 stack overflow in MQTT cmd handler |
| **2.3.8** | **Do not use** — ~20 KB stack buffer broke all MQTT |

Always verify with GET `/api/status` → `firmwareVersion`.

---

## PC integration checklist

- [ ] Flash **PeakLogicOptaMqttSt v2.3.69+** via Arduino IDE
- [ ] Set MQTT broker on Opta `/setup` (LAN IP, port 1883) → Save → Reboot
- [ ] Set **Global site key** on Opta `/setup` and PeakLogic System setup (`mqttParc.globalSiteKey`, default `1`)
- [ ] Choose **Device mode** on `/setup`: Standalone (ST on Opta) or Remote I/O (PC runs ST)
- [ ] Start Mosquitto on PC LAN (`npm run mqtt:start`)
- [ ] **System setup:** enable MQTT Parc hub, broker URL; **Remote ST execution** ON for Standalone, OFF for Remote I/O
- [ ] Add `mqtt_parc` driver (template or bulk-add from Parc registry); `deviceId` matches firmware
- [ ] **Sync tags from device** on driver card; **Scan expansions** if modules fitted
- [ ] Optional: **Auto-run ST on Opta after power-up** in System setup
- [ ] **Program → Remote** on → **Download & Start**
- [ ] Optional: assign **position ID** for plant location; use **Replace hardware** for change-outs
- [ ] Commissioning: **Tags → Force** (syncs to Opta); **Live I/O → Enable I/O update**
- [ ] Operations: **Report → MongoDB logs** for system log and hardware history

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| No telemetry | Broker/firewall/Mosquitto | Match PC + Opta broker IP; check LAN routing |
| Telemetry OK, cmd timeout | Old firmware or subscribe fail | Reflash **v2.3.41+**; Serial: `MQTT subscribed cmd+config` |
| Board hangs (ping OK, HTTP/MQTT dead) | Wedged stack without loop stall | **v2.3.56+** hardware + liveness watchdog auto-resets; check `/api/status` → `watchdog` |
| Broker mismatch | `127.0.0.1` on device | Set PC LAN IP on `/setup` and System setup |
| Deploy fails / old fw | Firmware &lt; 2.3.18 | Arduino IDE upload PeakLogicOptaMqttSt |
| HTTP dead during deploy | Large put on old fw | Use MQTT deploy; upgrade firmware |
| ST not running after link | Linked ≠ running | **Download & Start**, not Connect alone |
| Wrong deviceId | Manual id typo | Use **Add from Parc registry** or read `/setup` |
| NV program not auto-run | Flag off or no deploy | Deploy once; enable auto-run on PC and/or device |
| Clock shows uptime | No sync yet | Connect driver or wait for daily sync_time |
| Expansions missing | 24 V / library | Seat modules in slot 1; install Opta Blueprint; Scan |

Serial always-on: `[MV*]` boot, subscribe, cmd lines @ **115200**.

---

## RS-485 fieldbus (Modbus master / Pentair)

| Path | Role | Notes |
|------|------|-------|
| **PC `modbus_rtu`** | PC is Modbus **master** | Polls Opta slave sketch (`opta_rtu_slave.json`) or other Modbus devices on USB/COM |
| **PC `pentair_rs485`** | PC Pentair master | UltraTemp/MasterTemp heat pump @ 9600 8N1; use `pollIntervalMs` (e.g. 300000) |
| **PC `vgreen_epc`** | PC Regal GEN3 master | SPECK BADU pump @ 19200; default `pollIntervalMs` 120000 |
| **Opta `mqtt_parc`** | ST + I/O over MQTT | Primary integration — no RS-485 in default firmware |
| **Opta `mv_fieldbus` (stub)** | Edge master → MQTT tags | `mv_fieldbus.cpp` — compile with `-DMV_FIELDBUS=1` for future Pentair/Modbus profiles. EZ Meter is PC Modbus RTU, not Opta Parc. |

**Single transceiver rule:** one RS-485 port cannot be Modbus master and slave at the same time. Split buses (different COM ports / adapters) or use Opta edge polling + MQTT.

**Wiring (recommended hybrid):**

- Opta RS-485 A/B → Pentair heat pump comm terminals (9600 8N1, addr `0x70`).
- PC USB-RS485 → SPECK BADU pump (19200 8N1, slave 21).
- Opta Ethernet → MQTT Parc hub on PC (ST, remote I/O).

**Activation:** Hardware wizard → Modbus RTU group → *Pentair UltraTemp* template; set COM, `deviceAddr` 112 (`0x70`), `pollIntervalMs` 300000. Enable driver; tags `HP_*` update on poll interval while global `scanMs` stays fast.

---

- Flash/build: [README.md](./README.md)
- PC MQTT Parc: `docs/MQTT_PARC.md`, `docs/BASELINE_TEST.md`
- ST programs: `st/opta-mqtt/README.md`
