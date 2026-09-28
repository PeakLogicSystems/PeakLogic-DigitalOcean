# Opta — APG True Echo sample

Standalone Arduino Opta sketch that polls an [APG True Echo](https://apgsensors.com/) radar level transmitter over **RS-485 Modbus RTU** and prints readings on **Serial (115200)**.

Use this to bring up wiring and Modbus before the PC template `apg_true_echo_rtu`. Review PDF: `docs/devices/PeakLogic-APG-True-Echo-Device-Review.pdf`.

## Flash

1. Open `OptaTrueEchoSample/OptaTrueEchoSample.ino` in Arduino IDE 2.x  
2. Board: **Arduino Opta** (or Opta WiFi)  
3. Install library: **ArduinoRS485**  
4. Upload → open Serial Monitor at **115200**

### Optional compile defines

| Define | Default | Meaning |
|--------|---------|---------|
| `TE_SLAVE_ID` | `1` | Modbus address |
| `TE_BAUD` | `9600` | RS-485 baud |
| `TE_POLL_MS` | `500` | Poll period |
| `TE_FRAME_DELAY_MS` | `100` | Min gap between Modbus transactions (vendor requirement) |

Example: *File → Preferences → Additional boards…* is not used for flags; prefer editing the `#define` block at the top of the `.ino`, or add `-DTE_SLAVE_ID=2` in a `build_opt` / platform flags file.

## Wiring

| Opta | True Echo |
|------|-----------|
| RS-485 **A** | A (or Data+) |
| RS-485 **B** | B (or Data−) |
| GND | GND |

Sensor factory defaults: **9600 8N1**, Modbus ID **1**. Power the sensor per its manual (often 12–24 VDC — not from Opta logic rail).

## Register map (FC04 input registers)

| Address | Type | Tag / field |
|---------|------|-------------|
| 0 | uint16 | Distance cm |
| 1 | uint16 | Distance mm |
| 2 | uint16 | Level cm |
| 3 | uint16 | Level mm |
| 36–37 | float32 **CDAB** | Space (selected units) |
| 38–39 | float32 **CDAB** | Level (selected units) |
| 40–41 | float32 **CDAB** | Distance (selected units) |

## Expected Serial output

```
OptaTrueEchoSample — APG True Echo Modbus RTU
  slave=1 baud=9600 pollMs=500 frameDelayMs=100
RS-485 ready — polling FC04 IR 0–3 and 36–41
[TE] dist_cm=120 dist_mm=1200 lvl_cm=80 lvl_mm=800 | space=1.200 level=0.800 dist=1.200 | ok=1 fail=0
```

Failures print `[TE] FAIL timeout` / `bad-crc` / `ex-N` (Modbus exception).

## Next steps (production)

| Path | Role |
|------|------|
| PC USB–RS485 | Hardware Wizard → **APG True Echo** (`apg_true_echo_rtu`) |
| Opta mqtt-st fieldbus | EZ Meter profile (`-DMV_FIELDBUS=1 -DMV_EZMETER=1`) — not True Echo; use this sample or PC master for radar |

Bind `TE_LEVEL` (or sample `level`) to wet-well `TANK_LVL` / ALT analog in ST as needed.
