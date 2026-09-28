# PeakLogic — APG True Echo Radar Device Review

**Vendor:** Automation Products Group (APG) — [apgsensors.com](https://apgsensors.com/)  
**Models:** True Echo CR-L / True Echo Plus (RS-485 Modbus RTU)  
**PeakLogic template:** `apg_true_echo_rtu`  
**Document purpose:** Integrator / engineering review of Modbus map, appliance tags, and Opta bring-up  
**Generated:** _(build date)_

---

## 1. Summary

PeakLogic adds first-class support for APG **True Echo** radar level transmitters as a dedicated Modbus RTU instrument:

| Path | Role |
|------|------|
| **PC appliance** | Hardware Wizard → Modbus RTU → **APG True Echo** (`src/devices/templates/apg_true_echo_rtu.json`) |
| **Opta sample** | Standalone RS-485 poll sketch (`firmware/arduino-opta-true-echo/`) |
| **Probe** | `node scripts/modbus-probe.js --serial COMx --baud 9600 --slave 1` |

Continuous level (`TE_LEVEL`) is intended for wet-well / tank control (bind to `TANK_LVL` / ALT analog). Float ladders remain available as backup.

---

## 2. Communication defaults

| Setting | Factory / PeakLogic default |
|---------|-----------------------------|
| Protocol | Modbus RTU (sensor is **server** only) |
| Interface | RS-485 |
| Baud | **9600** |
| Framing | **8N1** (8 data, no parity, 1 stop) |
| Modbus ID | **1** |
| Min gap between transactions | **100 ms** (`frameDelayMs`) |
| Recommended poll interval | **500 ms** (`pollIntervalMs`) |
| Driver I/O timeout | **2000 ms** |

Vendor manuals: True Echo CR-L user manual (Modbus chapter — FC04 process values, FC03/16 configuration).

---

## 3. Wiring

| PeakLogic host | True Echo |
|----------------|-----------|
| RS-485 **A** (USB adapter or Opta A) | A / Data+ |
| RS-485 **B** | B / Data− |
| GND | GND |

Power the sensor per APG manual (typically **12–24 VDC**). Do not power the sensor from Opta logic rails.

**Single-master rule:** only one Modbus master on the bus (PC *or* Opta). Do not run PC USB–RS485 and Opta RS-485 master on the same A/B pair simultaneously.

---

## 4. Modbus process map (FC04 — Input Registers)

Addresses are **0-based PDU** (same as PeakLogic `driverAddress.address`).

| Address | Type | Engineering meaning | PeakLogic tag |
|---------|------|---------------------|---------------|
| 0 | uint16 | Distance (cm) | `TE_DIST_CM` |
| 1 | uint16 | Distance (mm) | `TE_DIST_MM` |
| 2 | uint16 | Level (cm) | `TE_LVL_CM` |
| 3 | uint16 | Level (mm) | `TE_LVL_MM` |
| 36–37 | float32 **CDAB** | Space (selected units) | `TE_SPACE` |
| 38–39 | float32 **CDAB** | Level (selected units) | `TE_LEVEL` |
| 40–41 | float32 **CDAB** | Distance (selected units) | `TE_DIST` |

### 4.1 Float endianness (CDAB)

APG documents float32 as **CDAB** (word-swapped big-endian):

- Register *N* = bytes **C D**, register *N+1* = bytes **A B**
- IEEE bit pattern **ABCD** = `(reg[N+1] << 16) | reg[N]`

PeakLogic `ModbusDriver` accepts `byteOrder: "CDAB"` on float32 tags. Selected units (mm / cm / m / in / ft) are configured in the APG sensor app; floats follow that unit setting.

### 4.2 Configuration registers (holding — reference)

Holding registers (FC03 read / FC16 write) include application type, unit setting, damping, blind zone, range, high/low level, distance offset, bus address, baud, etc. **Not mapped in v1 template** (process values only). Use the APG app or custom holding tags if site commissioning requires writes from PeakLogic.

---

## 5. Appliance integration

### 5.1 Template

| Field | Value |
|-------|-------|
| Preset id | `apg_true_echo_rtu` |
| Label | APG True Echo — RS485 radar level (CR-L / Plus) |
| Transport | `modbus_rtu` |
| `sharedBus` | `false` (dedicated driver id `apg_true_echo`) |
| Wizard group | Modbus RTU (RS-485 / USB serial) |

### 5.2 Apply steps

1. Connect USB–RS485 to the sensor; note COM port.
2. **Drivers → Hardware wizard → Modbus RTU → APG True Echo**.
3. Set **serial port**, confirm baud **9600**, slave **1** (or site address).
4. **Apply** → enable driver.
5. Confirm tags update (good quality) on Tags / Trends.

### 5.3 Lift-station / ALT use

| Recommendation | Detail |
|----------------|--------|
| Primary analog | Bind `TE_LEVEL` → `TANK_LVL` or ALT `altLevelId` |
| Units | Align APG unit setting with ST thresholds (meters preferred for ALT bands) |
| Backup | Keep float DI ladder (`LVL_*` / `I1`–`I4`) with `levelInputMode` digital or both |
| Failsafe | On Modbus BAD quality, ST should not chase stale level — use floats / hold last good per site SOP |

---

## 6. Opta sample (bring-up)

**Path:** `firmware/arduino-opta-true-echo/OptaTrueEchoSample/`

Standalone sketch (no MQTT/ST). Polls the same FC04 map and prints to **Serial 115200**.

| Define | Default | Meaning |
|--------|---------|---------|
| `TE_SLAVE_ID` | 1 | Modbus address |
| `TE_BAUD` | 9600 | Baud |
| `TE_POLL_MS` | 500 | Poll period |
| `TE_FRAME_DELAY_MS` | 100 | Inter-frame gap |

**Libraries:** ArduinoRS485 only.

Example Serial line:

```text
[TE] dist_cm=120 dist_mm=1200 lvl_cm=80 lvl_mm=800 | space=1.200 level=0.800 dist=1.200 | ok=1 fail=0
```

Use this sketch to validate wiring and register decode before PC wizard apply.

---

## 7. Related Opta firmware (mqtt-st 2.3.81)

Production sketch `PeaklogicOptaMqttSt` (synced from `C:\data\PeaklogicOptaMqttSt`) includes RS-485 **fieldbus** for **EZ Meter** (`-DMV_FIELDBUS=1 -DMV_EZMETER=1`), not True Echo process tags. True Echo on Opta for review/bring-up remains the **standalone sample** above; appliance PC master is the supported production path for radar level today.

| Flag | Device |
|------|--------|
| `-DMV_FIELDBUS=1 -DMV_EZMETER=1` | EZ Meter DDS-RGB → `DDS_*` / PQ tags |
| True Echo sample sketch | APG radar Serial bring-up |

---

## 8. Verification checklist

- [ ] Sensor powered; A/B/GND correct; no double master on bus  
- [ ] `modbus-probe.js` FC04 @0×4 and @36×6 succeed; CDAB decode looks sane  
- [ ] Wizard apply creates tags `TE_*` on driver `apg_true_echo`  
- [ ] `TE_LEVEL` tracks known tank change (or bench target)  
- [ ] Opta sample (optional) matches PC readings within expected noise  
- [ ] ALT / `TANK_LVL` binding documented for the project  
- [ ] Float backup verified if used  

---

## 9. Code / doc references

| Item | Location |
|------|----------|
| Device template | `src/devices/templates/apg_true_echo_rtu.json` |
| Template authoring notes | `src/devices/templates/README.md` (APG section) |
| Float CDAB decode | `src/drivers/modbusDriver.js` (`_decodeFloat32`) |
| Unit tests | `test/apgTrueEchoTemplate.test.js` |
| Opta sample | `firmware/arduino-opta-true-echo/` |
| Opta mqtt-st sync | `scripts/sync-opta-firmware-from-data.ps1` |
| Vendor | https://apgsensors.com/ |

---

## 10. Review sign-off

| Role | Name | Date | OK |
|------|------|------|----|
| Controls / OT | | | ☐ |
| Firmware | | | ☐ |
| Project eng. | | | ☐ |

**Notes / open items:**

_______________________________________________________________________________

_______________________________________________________________________________
