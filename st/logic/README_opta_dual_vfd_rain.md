# Opta + dual ACS550 + rain tip-bucket

One **USB-RS485** master on the PeakLogic PC polls three Modbus RTU slaves on a shared bus. Structured Text runs on the PC.

```
  Tip bucket ──► Opta I1 (slave 2)
  ACS550 #1 ────┤
                ├── RS-485 ── USB adapter ── PeakLogic PC
  ACS550 #2 ────┘   9600 8N1
```

| Slave | Device | Role |
|------:|--------|------|
| **1** | ABB ACS550 VFD1 | Speed / run via `ACS1_*` |
| **2** | Arduino Opta (Modbus RTU slave sketch) | Tip pulse on **I1** |
| **3** | ABB ACS550 VFD2 | Speed / run via `ACS2_*` |

## Commissioning

### Serial (all devices must match)

- Baud **9600**, **8N1** (no parity, 1 stop bit)
- ACS550: **5303** = 9.6, **5304** = **0** (8N1), **5302** = station id, cycle power
- Opta: flash Modbus RTU **slave** sketch, slave id **2**, 9600 8N1

### ACS550 fieldbus

1. **9802** = 1 (STD MODBUS)
2. **5305** = 0 or 2 (ABB Drives profile)
3. **1001** = 10 (COMM), **1103** = 8 (COMM)
4. Keypad **REM**
5. Station ids: VFD1 **5302=1**, VFD2 **5302=3**

### Tip bucket (pulse + K factor)

Wire the reed/dry contact across Opta **I1** (and common).

| Tag | Role |
|-----|------|
| `RAIN_K` | **K factor** — tips per inch (calibrate). Default **100** ⇒ 0.01″/tip |
| `RAIN_HR_IN` | Inches in the last **1-hour** window (`tips / K`) |
| `RAIN_RATE` | Live intensity **in/hr** (1-min sample × 60) |
| `RAIN_TOTAL_IN` | Lifetime inches (`lifetime tips / K`) |
| `RAIN_TIPS` | Lifetime tip count |
| `RAIN_HR_NEW` / `RAIN_RATE_NEW` | Pulse when a new sample is published |
| `RAIN_RESET` | Clears totals and window counters |

**Calibration:** pour a known depth (or use manufacturer tip volume).  
`RAIN_K = tips_observed / inches_known`  
Example: 50 tips for 0.50″ → `RAIN_K = 100`.

**Formulas** (same FLOW engine as GPM meters):

- Hourly: `RAIN_HR_IN = tips_in_hour / RAIN_K`
- Rate: `RAIN_RATE = (tips_in_minute / RAIN_K) × 60`

Timers: `RAIN_HR_TMR` preset **3600000** ms, `RAIN_RATE_TMR` preset **60000** ms.

## PeakLogic setup

1. **Drivers → Device template → Opta + ACS550×2 + rain tip — Modbus RTU bus** → set COM port → Apply  
   (or load fixtures below)
2. Load program `st/logic/27_opta_dual_vfd_rain.st` with **Load matching fixtures**
3. Enable driver `rs485_bus`, **Save**, **Start**

### Templates

| Template id | Use |
|-------------|-----|
| `opta_dual_acs550_rain` | Full bus (Opta I1 + both VFDs) |
| `abb_acs550_dual_rtu` | Both VFDs only (slaves 1 & 3) |
| `abb_acs550_rtu` | Single VFD |

### Fixtures

- `st/fixtures/drivers.opta_dual_vfd_rain.json`
- `st/fixtures/tags.opta_dual_vfd_rain.json`

## Tags (summary)

| Tag | Meaning |
|-----|---------|
| `I1` | Tip pulse from Opta |
| `RAIN_K` | K factor (tips per inch) |
| `RAIN_HR_IN` | Hourly rainfall (inches / last hour) |
| `RAIN_RATE` | Rain intensity (inches / hour) |
| `RAIN_TOTAL_IN` / `RAIN_TIPS` | Lifetime inches / tip count |
| `MOTOR1_*` / `MOTOR2_*` | HOA faceplate per VFD |
| `ACS1_CW` / `ACS2_CW` | Control word (1151 run / 1150 stop) |
| `ACS1_REF1` / `ACS2_REF1` | Speed ref 0…20000 |
| `ACS*_FREQ_HZ` / `ACS*_CURR_A` / `ACS*_FAULT` | Feedback |

## Note on Opta MQTT Parc

This project uses the Opta as a **Modbus RTU slave** so one RS-485 bus serves tips + VFDs. MQTT Parc ST is a better tip-counter if the Opta is Ethernet-only and VFDs hang on a separate USB-RS485 — then run VFD logic on the PC and tip logic on the Opta (two programs).
