# PeakLogic Opta cellular gateway — MQTT bridge (Option B)

ESP-IDF firmware for **LilyGO T-ETH-ELITE-A7670X** (integrated W5500 + A7670 on one board). Provides a **local MQTT broker** for the Arduino Opta and **transparently forwards** all `peaklogic/v1/#` traffic to the PeakLogic cloud droplet over cellular.

Also supports the **stacked** configuration (T-ETH-Elite mainboard + LTE shield + T-PCIE A7670) — same GPIO map, no GPS-mux init.

No separate LTE router — the modem board is the pipe.

## Architecture

```
 [ Arduino Opta ] ---- Ethernet ----> [ T-ETH-Elite LAN 192.168.1.1:1883 ]
                                              |
                                    local MQTT broker (anonymous)
                                              |
                                    mqtt_bridge (this firmware)
                                              |
 [ PeakLogic cloud ] <---- cellular ---- [ A7670 (integrated) ]
        Mosquitto :1883 (+ auth)
```

| Direction | Topics |
|-----------|--------|
| Opta → cloud | `peaklogic/v1/{deviceId}/telemetry`, `online`, `cmd/response`, `g/{key}/{tag}` |
| Cloud → Opta | `peaklogic/v1/{deviceId}/cmd`, `config`, `g/{key}/{tag}` |

Cloud MQTT credentials live **on the gateway** (Opta firmware has no MQTT auth).

## Opta configuration (fixed for every site)

Set once on the bench — same for all lift stations:

| Opta `/setup` field | Value |
|---------------------|-------|
| Ethernet | DHCP (factory default) |
| MQTT broker IP | **`192.168.1.1`** |
| MQTT port | **`1883`** |
| Global site key | Match cloud PeakLogic |

The gateway LAN must be **`192.168.1.1/24`** (factory default in this firmware).

## Gateway configuration

1. Flash this firmware.
2. Connect phone/laptop to Wi-Fi AP **`PeakLogic-Gateway`** / `peaklogic`.
3. Open **`http://192.168.4.1:8080/setup`**.
4. Set **cloud broker** = droplet public IP, port `1883`, username/password from `deploy/cloud/.env`.
5. Set **APN** for your IoT SIM (e.g. `hologram`).
6. Save & reboot.

## Hardware

| Item | Role |
|------|------|
| **T-ETH-ELITE-A7670X** (primary) | ESP32-S3 + W5500 RJ45 + integrated A7670 LTE |
| **T-ETH-Elite + LTE shield** (alt) | Same firmware; select stacked board in menuconfig |
| **Arduino Opta** | Pump control + MQTT Parc client |

Default menuconfig target: **T-ETH-ELITE-A7670X (integrated)**.

### Pin map (LilyGO utilities.h — integrated & stacked)

| Function | GPIO |
|----------|------|
| W5500 MISO | 47 |
| W5500 MOSI | 21 |
| W5500 SCK | 48 |
| W5500 CS | 45 |
| W5500 INT | 14 |
| A7670 TX (ESP→modem) | 6 |
| A7670 RX (ESP←modem) | 4 |
| A7670 PWRKEY | 3 |
| A7670 DTR | 5 |
| Status LED | 38 |
| GPS mux (integrated only) | 4 @ level 0 = GPS; held high for UART/data |

## Build

See **[BUILD.md](BUILD.md)**.

```bash
cd cellular-opta-gateway
idf.py set-target esp32s3
idf.py menuconfig   # board variant, cloud defaults, APN, W5500 pins
idf.py build flash monitor
```

### Bench test without cellular

In menuconfig → **PeakLogic Opta Gateway** → enable **Bench: use Wi-Fi STA as WAN**. Set office Wi-Fi SSID/password. Use this to test the MQTT bridge before the SIM is active.

## Cloud droplet

On the PeakLogic cloud VM (`deploy/cloud`):

- Mosquitto on port **1883**
- Set gateway credentials in `/setup` to match `MOSQUITTO_USER` / `MOSQUITTO_PASS`
- Enable **MQTT Parc hub** in System setup with the same broker URL
- Open firewall **TCP 1883** inbound

Link the field SIM in PeakLogic **Tools → Cellular SIMs** to the gateway `gatewayId`.

## TODO

1. **Retained message cache** — replay `online` and global tags when Opta reconnects.
2. **SIM PIN** — add NVS/menuconfig if your carrier requires a PIN.

## Files

| File | Role |
|------|------|
| `main/mqtt_local.c` | Minimal MQTT broker for Opta on LAN :1883 |
| `main/mqtt_bridge.c` | Cloud client + bidirectional `peaklogic/v1/#` forward |
| `main/eth_lan.c` | LAN netif + DHCP for Opta |
| `main/modem_net.c` | Cellular WAN (A7670) + integrated board init |
| `main/board_pins.h` | Pin map from Kconfig / board variant |
| `main/setup_web.c` | `/setup` provisioning UI |
| `main/device_cfg.c` | NVS config |
