# PeakLogic cellular Parc ST — ESP32 soft PLC

ESP-IDF firmware for **LilyGO T-ETH-ELITE-A7670X**. The ESP32 runs **ST as MVBC bytecode** (same IR as the PC soft PLC and Arduino Opta) and speaks **MQTT Parc** directly to the PeakLogic cloud broker.

**Default build = no modem** (Wi-Fi STA WAN) for [cloud-arduino testing](../docs/LILYGO_PARC_CLOUD.md) — same Mosquitto path as [Opta Parc cloud](../docs/OPTA_PARC_CLOUD.md). Enable LTE in menuconfig for field images.

Firmware **0.3.0+** matches Opta Parc MQTT ops: forces, device mode, sync_time, global site key, NV program, `/api/status`.

This is **not** an Opta bridge. There is no local MQTT broker and no Opta in the path — the board *is* the PLC.

## Architecture

```
 [ est-pc / cloud Mosquitto ]
              ^
         MQTT Parc (auth)
              |
 [ T-ETH-ELITE-A7670X ]
   - cellular WAN (A7670) or bench Wi-Fi
   - mqtt_parc client  (put_program, runtime_*, telemetry)
   - MVBC VM           (same as Opta mv_bc / PC stBcRunner)
   - tag store + scan loop
   - Sequent SM-I-010   (I1..I4 opto, R1..R4 relays via I2C)
```

| Direction | Topics |
|-----------|--------|
| Device → hub | `peaklogic/v1/{deviceId}/telemetry`, `online`, `cmd/response` |
| Hub → device | `peaklogic/v1/{deviceId}/cmd`, `config` |

`platform`: `lilygo-t-eth-elite-parc-st` · `protocolVersion`: **2**

**Waveshare ESP32-S3-Relay-1CH-U** (pool satellite): prefer the Arduino tree `firmware/waveshare-esp32s3-relay-parc/`. To reuse this IDF image, build with `sdkconfig.defaults.waveshare_relay_1ch` (GPIO1 = R1, GPIO2 = I1, Wi-Fi only). Guide: [docs/WAVESHARE_ESP32S3_RELAY_POOL.md](../docs/WAVESHARE_ESP32S3_RELAY_POOL.md).

## vs cellular-opta-gateway

| | Opta gateway | **This (Parc ST)** |
|--|--------------|---------------------|
| ST runs on | Arduino Opta | **ESP32** |
| MQTT role | Local broker + cloud bridge | Parc **device** client |
| Opta required | Yes | No |

## Setup

1. Flash firmware (`idf.py set-target esp32s3 && idf.py build flash monitor`).
2. Join Wi-Fi AP **`PeakLogic-ParcST`** / `peaklogic`.
3. Open `http://192.168.4.1:8080/setup` — set deviceId, cloud MQTT host/user/pass, APN.
4. In PeakLogic: add device with transport **`mqtt_parc`**, matching `deviceId`.
5. Download & Start ST (e.g. lift simplex) — hub sends `put_program` with base64 MVBC.

### Bench (no SIM)

Join the setup AP and open `http://192.168.4.1:8080/setup` — enter your **router Wi-Fi SSID and password** under **Router Wi-Fi (WAN)**. The device reconnects immediately on Save. (menuconfig defaults are used only when router fields are empty.)

### Field

Disable Wi-Fi WAN fallback; enable LTE; insert SIM; set APN.

## Sequent SM-I-010 I/O

[SM-I-010](https://sequentmicrosystems.com/products/four-relays-four-inputs-for-raspberry-pi) = 4 relays + 4 HV opto inputs (4relind). Enabled by default.

| Parc tag | HAT channel | Duplex role |
|----------|-------------|-------------|
| `I1` | Opto 1 | OFF float |
| `I2` | Opto 2 | Lead float |
| `I3` | Opto 3 | Lag float |
| `I4` | Opto 4 | High level alarm |
| `R1` | Relay 1 | Pump 1 |
| `R2` | Relay 2 | Pump 2 |
| `R3` | Relay 3 | Station alarm |
| `R4` | Relay 4 | Spare |
| `I5`..`I8` | Soft (RAM) | — |

**Wiring (T-ETH-Elite 40-pin, Pi-compatible):**

| Signal | GPIO |
|--------|------|
| SDA | **17** (board default) |
| SCL | **18** (board default) |
| 3V3 / 5V / GND | match HAT power needs |

Stack level jumpers → menuconfig `SM_I010_STACK` (default 0). Driver probes `0x38`/`0x20` (IO-exp) and `0x0e` (CPU v4+).

Boot log: `[io  ] Sequent SM-I-010 online` or soft-I/O fallback if absent.

### CT analogs (0–1 V)

Motor CT transmitters (1.00 V = 50 A) map to `I1_RAW`…`I7_RAW` / hub tags `AI1`…`AI7`:

| Tag | Default GPIO | Use |
|-----|--------------|-----|
| `I1_RAW` | **32** | Motor 1 ØA |
| `I2_RAW` | **33** | Motor 1 ØB |
| `I3_RAW` | **34** | Motor 1 ØC |
| `I4_RAW` | **35** | Motor 2 ØA |
| `I5_RAW` | **36** | Motor 2 ØB |
| `I6_RAW` | **37** | Motor 2 ØC |
| `I7_RAW` | **38** | Spare |

12-bit ADC, atten ~0–1.1 V (`ADC_ATTEN_DB_0`). Hub scale ≈ **0.01343** → 0–50 A. Pins are menuconfig `CT_ADC_GPIO_AI*`. On ESP32-S3, GPIOs 32–38 may not be ADC1-capable — if boot logs soft-fallback warnings, remappoint to free ADC1 pins (GPIO 1–10).

### Duplex ST program

`st/logic/37_duplex_lift_station_parc_st.st` + `st/fixtures/tags.duplex_lift_station_parc_st.json` — ALT2 duplex matched to the I/O above. Download & Start from PeakLogic (or `put_program`). Set `CT_FTR_EN` when CT fail-to-run should use amps instead of command echo.

## Build

```powershell
cd cellular-parc-st
idf.py set-target esp32s3
idf.py menuconfig
idf.py build flash monitor
```

## Files

| Path | Role |
|------|------|
| `main/st/mv_bc.c` | MVBC VM (Opta-compatible, incl. ALT builtins/actions) |
| `main/st/mv_tags.c` | Tag / timer / PID / FLOW / **ALT** FB store |
| `main/st/mv_program.c` | Load base64 BC + scan |
| `main/sm_i010.c` | Sequent SM-I-010 I2C driver |
| `main/mqtt_parc.c` | Parc MQTT client |
| `main/modem_net.c` | Cellular / Wi-Fi WAN |
| `main/setup_web.c` | Provisioning UI |

## ST / ALT support

Firmware tracks Arduino Opta MVBC runtime for soft-PLC programs, including **ALT** (lead/lag alternator) used by duplex lift-station ST. Modes `ALT2` / `ALT3` / `ALT4`, builtins 16–25, and actions 18–32 match Opta. SM-I-010 tags `I1`–`I4` / `R1`–`R4` are unchanged.

## Device template

`src/devices/templates/lilygo_t_eth_parc_st.json` — LilyGO T-ETH + SM-I-010 Parc ST.
