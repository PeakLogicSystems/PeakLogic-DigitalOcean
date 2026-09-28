# PeakLogic UNO Q — edge motor fault detection

Arduino **UNO Q** dual-brain app: the STM32U585 samples motor current; the Qualcomm Dragonwing QRB2210 runs **true FFT MCSA** and classifies faults on-device, then uplinks PeakLogic Parc MQTT (`mcsa[]` + `edgeAi[]`). Optional **Wi-Fi MQTT push to Opta** global tags.

This is **not** Opta MCSA-lite (synthesized spectra). Windows are real ADC captures (2048 Hz / 2048-pt FFT with six CTs).

```text
CTs (AC, mid-rail bias) → A0–A5  (6 native ADC — no mux)
        │
 STM32U585 MCU  sample + start detect + Bridge RPC
        │  get_window / get_start_event / get_rms
 QRB2210 Linux  numpy FFT cook → classify → Wi-Fi MQTT
        ├─ peaklogic/v1/{deviceId}/telemetry     → PeakLogic
        └─ peaklogic/v1/g/{siteKey}/UQ_*         → Opta (optional)
```

## Analog inputs — 6 CTs, no mux

UNO Q has **six 14-bit ADC pins** on the Uno analog header: **A0–A5** (STM32U585, 0–3.3 V, **not 5 V tolerant**). That is enough for a duplex lift (3 CTs × 2 pumps) without a multiplexer.

| Pin | Opta-style map | Notes |
|-----|----------------|--------|
| **A0** | Pump 1 L1 | AC, mid-rail ~1.65 V |
| **A1** | Pump 1 L2 | |
| **A2** | Pump 1 L3 | |
| **A3** | Pump 2 L1 | |
| **A4** | Pump 2 L2 | Also I2C3 SDA if unused as ADC — Qwiic is a **separate** header |
| **A5** | Pump 2 L3 | Also I2C3 SCL |
| **GND / 3.3 V** | Burden + bias | Do not apply 5 V to A0–A5 |

Resolution is configurable 8/10/12/14-bit (`analogReadResolution`); firmware uses 12-bit. Default scale `ctVoltsPerAmp = 0.033` (≈ 50 A peak).

**Do not mux for true MCSA** if you only need six channels — a CD4051 round-robin cannot give simultaneous 2 kHz windows on all CTs. If you ever need **more than six**, options are:

| Approach | Use when | MCSA quality |
|----------|----------|--------------|
| Native A0–A5 | Duplex 6 CT (this app) | Best — all channels every window |
| Sequential mux (74HC4051) | >6, RMS / one-motor-at-a-time | Poor for simultaneous spectra |
| External ADC (ADS131M08 / ADS8688 SPI) | Isolated / >6 simultaneous | Good — extra board |

## Wi-Fi → Opta

Yes. UNO Q has dual-band **Wi-Fi 5**. It does **not** stream raw ADC over the air. It publishes **cooked** RMS, start times, and fault bits.

Both boards are MQTT **clients** on the same broker (Opta Ethernet or Wi-Fi, UNO Q Wi-Fi):

1. Set `broker` in `python/config.json` to the same Mosquitto Opta uses.
2. Set `optaSiteKey` to the Opta global-tag key (setup GUI, default `0001`).
3. Opta ST / tag table: mark memory tags **`UQ_AI1`…`UQ_AI6`**, **`UQ_MOTOR1_FAULT`**, **`UQ_MOTOR2_FAULT`**, **`UQ_P1_RUN_FB`** as **global**.
4. Opta firmware already subscribes to `peaklogic/v1/g/{key}/+` and writes `{"v":…}` into those tags.
5. OR the tags into `R4` / station alarm — do **not** overwrite physical `MOTOR1_FAULT` DIs (`X1_I11`…).

Raw 2 kHz samples stay on the UNO Q. PeakLogic still gets the full `telemetry` topic.

Disable Opta push with `"optaPush": false` or `MV_OPTA_PUSH=0`.

## Deploy (App Lab)

1. Install [Arduino App Lab](https://docs.arduino.cc/software/app-lab/) and connect the UNO Q (USB-C).
2. Copy this folder to `/home/arduino/ArduinoApps/peaklogic-uno-q-mcsa` (or **Open** in App Lab).
3. Copy `python/config.example.json` → `python/config.json` — set `broker`, `deviceId`, `optaSiteKey`.
4. **Start** the app.
5. PeakLogic: template **Arduino UNO Q — edge motor fault (true FFT MCSA)**.

Local JSON: `http://<uno-q-ip>:8088/`

## PC sim

```bash
pip install -r requirements.txt
set MV_SIM=1
set MV_BROKER=mqtt://127.0.0.1:1883
set MV_OPTA_SITE_KEY=0001
python main.py
```

## Telemetry

Topic: `peaklogic/v1/{deviceId}/telemetry`

| Field | Meaning |
|-------|---------|
| `platform` | `arduino-uno-q-mcsa` |
| `runtime.trueFft` | `true` (vs Opta `mcsaLite`) |
| `mcsa[]` | 6 cooked channels, fund / rotor / bearing / ecc / pump |
| `edgeAi[]` | Per-pump label |
| `tags` | `AI1`–`AI6`, `P*_RUN_FB`, `MOTOR*_FAULT`, `MOTOR*_START_MS` |

Host `host-supplement` skips when `edgeAi` is present.

## Bridge RPCs (MCU → Linux)

| Method | Returns |
|--------|---------|
| `window_ready` | bool |
| `get_window(ch)` | base64 int16 AC samples (2048), `ch` 0–5 |
| `ack_window` | bool |
| `get_rms(ch)` | float amps |
| `get_n_ch` | 6 |
| `get_start_event` | JSON `{pump,startMs,peakA,runA}` (`pump` 0 or 1) |
| `set_fault_led(on)` | bool |
