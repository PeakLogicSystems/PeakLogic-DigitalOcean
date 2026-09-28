# PeakLogic Opta — ST + MQTT Parc

Combines the **ST runtime** from `arduino-opta-st` with **PeakLogic Parc MQTT** (`peaklogic/v1`).

## Flash

1. Open `PeaklogicOptaMqttSt/PeaklogicOptaMqttSt.ino` in Arduino IDE 2.x
2. **Tools → Board → Arduino Mbed OS Opta Boards → Opta** (WiFi / Lite / RS485) — required.
   Do **not** pick **Arduino Zephyr Boards → Arduino Opta** (no `PortentaEthernet.h`).
3. **Tools → Board Manager** → search **Arduino Mbed OS Opta Boards** → install **mbed_opta** (4.x/6.x) if missing
4. Install libraries (**Sketch → Include Library → Manage Libraries**):

| Library | Required |
|---------|----------|
| ArduinoJson 7.x | Yes |
| PubSubClient | Yes (MQTT) |
| Arduino_Opta_Blueprint | Yes (expansions) |

HTTP uses **native `EthernetServer`** (`mv_http.cpp`) — same Opta mbed fix as `arduino-opta-st`. **EthernetWebServer is no longer required.**

**Sketch sources** (all under `PeakLogicOptaMqttSt/`):

| File | Role |
|------|------|
| `PeakLogicOptaMqttSt.ino` | Main loop, HTTP routes, MQTT config |
| `mv_st.cpp`, `mv_bc.cpp`, `mv_base64.cpp` | ST bytecode VM |
| `mv_mqtt.cpp` | Parc MQTT client |
| `mv_tags.cpp`, `mv_io.cpp`, `mv_expansions.cpp` | I/O and tags |
| `mv_store.cpp`, `mv_setup_web.cpp`, `mv_wifi.cpp` | Config / setup GUI + status panel |
| `mv_http.cpp`, `mv_device_status.cpp`, `mv_debug.cpp` | Native HTTP (Opta mbed safe) |
| `mv_ota.cpp`, `mv_version.cpp` | OTA + version |

Optional library: **Arduino_Portenta_OTA** (Board Manager) for HTTP `/api/firmware` OTA uploads.

5. Set broker IP and `deviceId` in `g_mqttCfg` (or configure on `/setup` after flash)
6. Upload **M7** sketch `PeaklogicOptaMqttSt` (Target core → **M7**).

### Dual-core MCSA (M4 FFT) — firmware 2.3.80+ (0–1 V final)

Opta STM32H747 **M7** keeps the ST scan. Every **5 minutes** M7 captures I1–I6 and hands the buffer to **M4** via SRAM4 (`0x38000000`). M4 FFTs and writes cooked `mcsa[]` + labels. Between ingest cycles, MCSA-lite heuristics still run on M7. During capture, ST analog tags use the last held sample (scan is not stalled).

1. **Tools → Flash split → 1.5MB M7 + 0.5MB M4**
2. **Target core → M4** → upload `PeaklogicOptaMcsaM4/PeaklogicOptaMcsaM4.ino`
3. **Target core → M7** → upload `PeaklogicOptaMqttSt` (calls `RPC.begin()` / `bootM4()`)
4. Serial: `MCSA M4 mailbox` then DC ingest ~15 s after boot, then every 5 min

If M4 is not flashed, M7 keeps MCSA-lite only (no high-rate ingest). Disable with `-DMV_MCSA_M4=0`. Interval: `-DMV_MCSA_INGEST_MS=300000`.

**0–1 V DC RMS CTs (default / best signal):**

| Stage | What |
|-------|------|
| ADC | `analogReadResolution(16)` — ~6554 counts at 1 V (was ~410 at 12-bit) |
| Scan amps | 32× oversample, mux settle, ~8.3 ms window (one 120 Hz cycle), trimmed mean |
| M4 ingest | 16× **burst** oversample (does not average out ripple), 512 Hz, **2048** samples (**4 s**), analog held |
| M4 FFT | Mean-remove, Blackman–Harris, residual 1–40 Hz modulation + 100/120 Hz ripple |
| ST tags | `I*_RAW` still 12-bit (16→12 shift) so existing scales keep working |

M4 does **not** look for 60 Hz sidebands on 0–1 V transmitters. `fund` amp is running amps. Re-zero / span on `/ct-cal` after this firmware (v2 cal auto-migrates ×16).

### MCSA monitor web setup — 2.3.81+

Open **`/mcsa`** (also linked from `/setup`; `/hvac` is an alias). This mirrors `C:/Users/Public/data/MCSA` (`deviceType` in `MCSA.C`):

| deviceType | Load groups published in `mcsa[]` |
|------------|-----------------------------------|
| 0 | base only (rotor / bearing / ecc / stator) |
| 1 | + `fan` |
| 2 | + `pump` |
| 3 | + `compressor` |
| 4 | + `turbine` |
| 5 | all load groups |

Also configurable: poles, line Hz, slip, **per-motor CT wiring** on `/mcsa` (1P / 1P+cap / 3P), per-CT fan blades / impeller vanes / compressor lobes / turbine blades.

**I/O layouts**

| Layout | Wiring |
|--------|--------|
| Lift duplex | I1–I6 = 0–1 V CTs (default pump mode) |
| HVAC RTU | I1 compressor CT, I2 fan CT, I3–I6 10k NTC, I7 water-rope mV, I8 WR DI → `env{}` + `COMP_FLT` / `FAN_FLT` |

Presets on the page: **Lift pump** (`deviceType=2`) and **HVAC RTU** (`deviceType=5`).

**50 mA CT secondary:** Opta base analog is **0–10 V high-Z**. Convert current with a **shunt to GND**, not a series resistor.

| Shunt (1 W+) | 50 mA → V | ADC use | Compile |
|--------------|-----------|---------|---------|
| 20 Ω | 1.0 V | 10% (no gain vs 0–1 V TX) | default |
| 100 Ω | 5.0 V | 50% | `-DMV_CT_BURDEN_OHM=100` |
| 180 Ω | 9.0 V | 90% | `-DMV_CT_BURDEN_OHM=180` |

Then set **CT output at FS (V)** on `/ct-cal` to that voltage (or reset defaults after flashing with `MV_CT_BURDEN_OHM`). Primary amps still come from **Full scale CT (A)**.

Do **not** use AFX00007 **current** mode with 50 mA (module max **25 mA**).

**AC line MCSA:** 50 mA AC CT + ~47–68 Ω burden + mid-rail bias so the waveform stays in 0–10 V, and `-DMV_CT_WAVEFORM=1`. Wiring PDF: `docs/projects/OPTA-CT-AC-MCSA-WIRING.pdf` (`npm run build:opta-ct-mcsa-wiring-pdf`).

### If `PortentaEthernet.h: No such file or directory`

- **Tools → Board** must be under **Arduino Mbed OS Opta Boards**, not **Arduino Zephyr Boards**. Both list “Arduino Opta”.
- Install **Arduino Mbed OS Opta Boards** in **Board Manager** (`mbed_opta`). Restart Arduino IDE after install.
- Do **not** install the standalone **Ethernet** library from Library Manager — the Opta core ships `PortentaEthernet.h` + `Ethernet.h`. Remove `Documents/Arduino/libraries/Ethernet` if present (conflicts with the core).
- Confirm the board line shows **Arduino Mbed OS Opta Boards**, then compile again.

## ST environment

- Full on-device ST executor (`mv_st.cpp`) — same AST as PeakLogic PC parser
- Tag model: `I1`–`I8`, `R1`–`R4`, `I1_RAW`–`I8_RAW`, PID/AVG/TIMER/COUNTER
- Expansion modules via setup GUI (AFX00005, AFX00007)
- Programs: `st/opta/*.st` — see `st/opta-mqtt/README.md`

## Cloud MQTT TLS (`mqtt.peaklogic.io:8883`)

Opta setup **TLS → cloud** uses Let's Encrypt Generation Y (YE2 → Root YE → ISRG Root X2). Reflash after this CA bundle. **Test MQTT** runs *after* the HTTP request closes (Opta Ethernet cannot TLS-handshake while the setup page request is open). Wait ~15 s for the result.

| Path | Broker |
|------|--------|
| TLS checked | `mqtt.peaklogic.io:8883` + MOSQUITTO user/pass |
| TLS unchecked | LAN appliance `:1883` |

## MQTT Parc

| Topic | Role |
|-------|------|
| `peaklogic/v1/{id}/telemetry` | Tag snapshot + runtime status |
| `peaklogic/v1/{id}/cmd` | `put_program`, `runtime_start`, `runtime_stop`, … |
| `peaklogic/v1/{id}/config` | Pause telemetry during debug attach |

## Local HTTP

| Path | Purpose |
|------|---------|
| GET `/` or `/setup` | Setup page: Ethernet/WiFi/MQTT, **device to host scan rate**, **RBE I/O**, expansions, ST status |
| GET `/api/status` | JSON health + MQTT link state |
| GET `/api/tags` | Live tags |
| PUT `/api/program` | Deploy AST (local engineering) |
| GET `/api/ota` | Firmware OTA status |
| POST `/api/firmware` | Flash `.bin` (reboots) |
| GET `/setup` | Ethernet/WiFi/expansion config |

**Report by exception:** on `/setup`, select I/O that may publish immediately when they change. Unselected points stay on the programmed host report interval. Digital fires on any edge; analog uses the deadband. A minimum RBE interval (default 100 ms) prevents MQTT floods.

## PeakLogic PC

Driver type **`mqtt_parc`** — use template **Arduino Opta — MQTT Parc ST runtime**. Enable **Remote execution**, **Connect**, **Start** (same as `opta_remote`). See `st/opta-mqtt/README.md`.

## Baseline I/O sketch

Raw OptaBlue mirror firmware (`baselinedigankgexpansionwMQTT`) remains separate under `arduino-opta-mqtt/` for I/O-only MQTT without ST.
