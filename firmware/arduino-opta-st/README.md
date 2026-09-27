# PeakLogic Opta ST Runtime (Ethernet + WiFi setup)

Runs PeakLogic ST programs on **Arduino Opta** over HTTP. Pair with the **`opta_remote`** driver in `est-pc`.

## Requirements

- Arduino IDE 2.x with **Arduino Opta** board package (6.x)
- Library: **ArduinoJson** 7.x
- **Opta WiFi** variant for local setup AP (AFX00002 / Advanced)
- **Arduino_Opta_Blueprint** (Library Manager) for expansion modules AFX00005 and AFX00007
- Expansion modules powered from **12–24 V** on the aux bus (USB alone may not power expansions)

## Flash

1. Open `PeakLogicOptaSt/PeakLogicOptaSt.ino`
2. Board: Opta Lite / RS485 / **WiFi**
3. Install **ArduinoJson** and **Arduino_Opta_Blueprint**
4. Upload

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

The same setup page is available on Ethernet at `http://<opta-ip>/setup`.

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

## HTTP API (runtime)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Health, IPs, expansion count |
| GET | `/api/tags` | All tag values |
| POST | `/api/tags/outputs` | Write outputs |
| PUT | `/api/program` | Deploy ST AST |
| POST | `/api/scan` | One scan cycle |
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

## Limits

- **128** tags (`PL_MAX_TAGS`)
- **5** expansion slots
- AVG MOV window ≤ **16** on device
