# Building PeakLogic T-HaLow firmware

ESP-IDF project for the **LilyGO T-HaLow** (ESP32-S3 + TX-AH HaLow module). Target path: `halow-xiao-sta/`.

## Toolchain

| Tool | Requirement |
|------|-------------|
| **Espressif ESP-IDF** | **5.1 or newer** (`main/idf_component.yml`) |
| **Target** | `esp32s3` |
| **CMake** | 3.16+ (bundled with ESP-IDF) |
| **Python** | 3.8+ (bundled with ESP-IDF installer) |
| **Git** | Clone ESP-IDF and this repo |

**Not required:** Morse Micro SDK, `MMIOT_ROOT`, Arduino, or LilyGO mmipal. Uses stock ESP-IDF only (`mqtt`, `json`, `esp_http_server`, etc.).

### Board assumptions (`sdkconfig.defaults`)

- ESP32-S3, 16 MB flash, 8 MB OPI PSRAM  
- USB Serial/JTAG console (Type-C — no external UART adapter for flash/monitor)

---

## Windows (recommended)

1. Install the [ESP-IDF Windows Installer](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/windows-setup.html) (ESP-IDF **5.1.x** or **5.2.x**).
2. Open **ESP-IDF PowerShell** or **ESP-IDF CMD** (puts `idf.py` and the toolchain on `PATH`).
3. Connect the T-HaLow via **USB Type-C**.
4. Find the COM port in Device Manager (e.g. `COM7`).

```powershell
cd halow-xiao-sta
idf.py set-target esp32s3
idf.py build
idf.py -p COM7 flash monitor
```

First-time optional configuration:

```powershell
idf.py menuconfig
```

Useful menus: **Device config**, **TX-AH**, **PeakLogic Parc**, **Sensors**.

---

## Linux / macOS

```bash
# One-time: clone ESP-IDF, run install.sh, then each session:
. $HOME/esp/esp-idf/export.sh

cd halow-xiao-sta
idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyACM0 flash monitor   # Linux; macOS often /dev/cu.usbmodem*
```

---

## Verify toolchain

```bash
idf.py --version
xtensa-esp32s3-elf-gcc --version
```

If `idf.py` is not found, run the ESP-IDF export script (`export.ps1` / `export.bat` / `export.sh`) or use the ESP-IDF terminal shortcut.

---

## After flash

1. Put the HaLow AP in **pairing mode** (default `AT+PAIR` workflow).
2. Connect to Wi-Fi AP **`PeakLogic-T-HaLow`** / password **`peaklogic`**.
3. Open **`http://192.168.4.1:8080/setup`** — broker, HaLow IP, device ID, ALF sensor template.
4. **Save & reboot**. MQTT runs over HaLow when the link is up.

See [README.md](README.md) for architecture, templates, and telemetry tags.
