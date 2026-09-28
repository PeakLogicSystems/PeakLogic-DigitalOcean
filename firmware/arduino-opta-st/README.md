# PeakLogic Opta ST Runtime (Ethernet + WiFi setup)

Runs PeakLogic ST programs on **Arduino Opta** over HTTP. Pair with the **`opta_remote`** driver in `est-pc`.

## Requirements

- Arduino IDE 2.x with **Arduino Opta** board package (6.x)
- Library: **ArduinoJson** 7.x
- **Arduino_Portenta_OTA** (Library Manager) for HTTP firmware OTA — optional until you use OTA
- Native **EthernetServer** via Opta core (`SPI.h`, `PortentaEthernet.h`, `Ethernet.h`) — same as Arduino's Web Server example; **no EthernetWebServer library**
- **Opta WiFi** variant for local setup AP (AFX00002 / Advanced)
- **Arduino_Opta_Blueprint** (Library Manager) for expansion modules AFX00005 and AFX00007
- Expansion modules powered from **12–24 V** on the aux bus (USB alone may not power expansions)

## Flash

1. Open `PeakLogicOptaSt/PeakLogicOptaSt.ino`
2. **Tools → Board → Arduino Opta** (WiFi / Lite / RS485) — required; `Ethernet.h` comes from this core
3. **Tools → Board Manager** → install **Arduino Opta** (mbed_opta) if missing
4. Install libraries: **ArduinoJson**, **Arduino_Opta_Blueprint**, and optionally **Arduino_Portenta_OTA**
5. Upload

## Serial debug (ST start/stop)

Open **Tools → Serial Monitor** at **115200** on the Opta **USB** port (not the Ethernet link).

After boot you should see timestamped lines like `[MV 2026-06-06 14:30:01 logic/21_all.st] PeakLogic Opta ST boot`. The timestamp is **wall clock** from the Opta RTC, synced from your PC on **Connect** and **deploy** (`X-MV-Client-Time` / `clientTimeUnix`). Until sync, logs use uptime (`HH:MM:SS.mmm`) and boot prints an RTC warning.

When a program is deployed, the **basename** of the active `.st` path appears in every debug line; full path is logged on deploy and **ST RUNTIME START**.

`GET /api/status` returns `protocolVersion`, `firmwareVersion`, `programName`, and `rtcTime` when set.

When PeakLogic starts or stops remote ST you should see banner lines:

```
[MV 00:00:15.230] ========================================
[MV 00:00:15.231] ST RUNTIME START
[MV 00:00:15.232] scanMs=100
[MV 00:00:15.233] programLoaded=yes
[MV 00:00:15.234] ========================================
```

**If you never see START/STOP:**

1. **Re-flash** from `est-pc/firmware/arduino-opta-st/PeakLogicOptaSt/` (includes `mv_runtime.cpp` + `mv_debug.h`).
2. In PeakLogic **Program**, enable **Remote** and click **Start** / **Stop** (I/O-only mode does not call `/api/runtime/start` on the Opta).
3. Confirm deploy succeeds first — you should see `[MV] PUT /api/program` and `[MV] program OK` before START.
4. Set `MV_DEBUG_VERBOSE` to `0` in `mv_config.h` to silence scan-cycle logs.

### If `Ethernet.h: No such file or directory`

- Confirm **Board** is **Arduino Opta**, not Uno/Mega/Portenta (unless Portenta H7 M7).
- Install the **Arduino Opta** board package in Board Manager.
- Remove or rename a conflicting generic **Ethernet** library in `Documents/Arduino/libraries/Ethernet` (use the Opta core's Ethernet, not Library Manager "Ethernet" by Arduino).
- Restart Arduino IDE after installing the board package.

## Local setup GUI (WiFi)

On **Opta WiFi**, the firmware starts a setup access point (default):

| Setting | Default |
|---------|---------|
| SSID | `PeakLogic-Opta` |
| Password | `peaklogic` |
| AP IP | `192.168.4.1` |
| Setup HTTP | port **8080** |

1. Connect your phone/PC to the AP
2. Open `http://192.168.4.1:8080/setup`
3. Configure **Ethernet** (DHCP or static IP/gateway/mask/DNS)
4. Configure **expansion slots** (AFX00005 D1608E, AFX00007 A0602)
5. **Save** → **Reboot**

The same setup page is available on Ethernet at `http://<opta-ip>/setup` (or `/`).

The setup page includes an **ST runtime status** panel (program name, running/stopped, program errors, firmware version, RTC time) refreshed every 3 seconds from `/api/status`. Works on Ethernet and on the WiFi AP (port 8080).

Settings are stored in flash (mbed KVStore when available).

## Expansion modules

| SKU | Module | Tag prefix (slot N) | I/O |
|-----|--------|---------------------|-----|
| AFX00005 | D1608E | `X1_` … `X5_` | 16 DI, 8 relays, `Xn_IRAW1`–`16` |
| AFX00007 | A0602 | `X1_` … `X5_` | 8 analog `Xn_AI1`–`8`, 4 PWM `Xn_PWM1`–`4` |

Slot **1** is the module closest to the Opta base. Use **Scan expansions** in the setup GUI to detect installed hardware.

## PeakLogic PC setup

1. **Drivers** → **`opta_remote`**, host = Opta Ethernet IP
2. Apply template **Arduino Opta — Ethernet ST runtime** or **+ expansions**
3. For expansions, load `st/fixtures/tags.opta_eth_exp.json`
4. **Program** → **Remote** (optional) → **Connect** → **Start**

### Connect / Test fails with `ECONNRESET`

PeakLogic talks to **Ethernet port 80** (`http://192.168.1.234/api/status`). The WiFi setup page on **`192.168.4.1:8080` is a different path** — if that works but Test fails, Ethernet HTTP is still broken.

1. On **this PC** (same machine as PeakLogic): open `http://192.168.1.234/api/status` in a browser, or run `npm run opta-test`.
2. Re-flash **`est-pc/firmware/arduino-opta-st/PeakLogicOptaSt`** (not the OneDrive fork). Serial @115200 should log `GET /api/status` when you click **Test**.
3. If curl/Node get **connection reset on send**, update and re-flash — Opta mbed requires keeping `EthernetClient` alive across `loop()` ticks (`mv_http.cpp`).

## HTTP API (runtime)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Health, IPs, `protocolVersion`, `firmwareVersion`, expansion count |
| GET | `/api/tags` | All tag values |
| POST | `/api/tags/outputs` | Write outputs |
| PUT | `/api/program` | Deploy ST AST |
| POST | `/api/scan` | One scan cycle |
| GET | `/api/ota` | OTA capability and progress |
| POST | `/api/firmware` | Flash firmware binary (reboots) |
| GET | `/setup` | Local setup GUI |
| GET/PUT | `/api/setup/config` | Read/write device config |
| POST | `/api/setup/scan` | Rescan expansions |
| POST | `/api/setup/reboot` | Reboot |

## Base I/O map

| Tag | Resource |
|-----|----------|
| I1–I8 | Base digital inputs |
| R1–R4 | Base relays |
| I1_RAW–I8_RAW | Base analog raw (0–1023) |
| H1–H8 | Memory INT |

## ST on device

Full ST subset: logic, timers (TON/TOF/TP), counters (CTU/CTD), PID, AVG, REAL tags. See prior README sections for action/call lists.

PeakLogic PC parses `.st` to JSON AST (`src/engine/astJson.js`); the Opta **interpreter** (`mv_st.cpp`) loads that AST and executes it each scan cycle.

## Over-the-air firmware (OTA)

Opta uses **Arduino_Portenta_OTA** (not ESP `Update.h`). Install the library from Library Manager before building.

**One-time device prep** (if OTA returns QSPI/bootloader errors):

1. Run **QSPI format** example: `STM32H747_System` → `QSPIFormat`
2. Ensure bootloader ≥ v22: `Portenta_System` → `PortentaH7_updateBootloader`

### Build the `.ota` file

After **Sketch → Export compiled Binary**:

```powershell
# Tools from ArduinoIoTCloud extras (or Arduino_Portenta_OTA repo extras/tools)
python lzss.py --encode PeakLogicOptaSt.ino.bin PeakLogicOptaSt.ino.lzss
python bin2ota.py OPTA PeakLogicOptaSt.ino.lzss PeakLogicOptaSt.ino.ota
```

Upload **`PeakLogicOptaSt.ino.ota`** (not raw `.bin`).

### Deploy OTA

1. **HTTP** (Ethernet or setup WiFi AP): `POST /api/firmware` with the `.ota` file body, `Content-Type: application/octet-stream`. Device stops ST runtime, writes to QSPI, decompresses, reboots. Progress: `GET /api/ota` or `GET /api/status` (`ota` object).

2. **WiFi ArduinoOTA** (Opta WiFi, if available): connect to setup AP, use Arduino IDE **Network port** against hostname `peaklogic-opta`.

Optional password: `#define MV_OTA_PASSWORD "secret"` in `mv_config.h`. HTTP clients send header `X-MV-OTA-Password`.

From PeakLogic PC (`opta_remote` driver):

```javascript
const fs = require('fs');
const { OptaRemoteDriver } = require('./src/drivers/optaRemoteDriver');
const d = new OptaRemoteDriver({ host: '192.168.1.50' });
await d.connect({});
await d.uploadFirmware(fs.readFileSync('PeakLogicOptaSt.ino.ota'));
```

## Limits

- **128** tags (`MV_MAX_TAGS`)
- **5** expansion slots
- AVG MOV window ≤ **16** on device
