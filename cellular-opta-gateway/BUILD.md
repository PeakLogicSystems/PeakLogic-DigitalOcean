# Building PeakLogic Opta Gateway firmware

ESP-IDF project for **LilyGO T-ETH-ELITE-A7670X** (integrated). Path: `cellular-opta-gateway/`.

Also builds for **T-ETH-Elite + LTE shield (stacked)** — select board variant in menuconfig.

## Toolchain

| Tool | Requirement |
|------|-------------|
| **Espressif ESP-IDF** | 5.1 or newer |
| **Target** | `esp32s3` |
| **Board (default)** | T-ETH-ELITE-A7670X integrated |

## Windows

```powershell
cd cellular-opta-gateway
idf.py set-target esp32s3
idf.py menuconfig
idf.py build
idf.py -p COM7 flash monitor
```

## menuconfig

| Menu | Setting |
|------|---------|
| **PeakLogic Opta Gateway → LilyGO board** | `T-ETH-ELITE-A7670X (integrated)` (default) or stacked |
| **PeakLogic Opta Gateway** | Cloud broker default IP, local MQTT port 1883, LAN 192.168.1.1 |
| **PeakLogic Opta Gateway** | `GATEWAY_WAN_WIFI_FALLBACK` for bench without cellular |
| **T-ETH-Elite W5500** | Defaults: SPI3, MOSI 21, MISO 47, SCK 48, CS 45, INT 14 |
| **LTE modem** | A7670 UART TX 6, RX 4, PWRKEY 3, APN |
| **Board extras** | Status LED GPIO 38 |

Integrated board: firmware sets GPIO4 GPS mux before UART bring-up (data path).

## Verify bridge on bench

1. Enable **WAN Wi-Fi fallback**; set office Wi-Fi credentials.
2. Flash firmware; open `http://192.168.4.1:8080/setup`.
3. Set cloud broker to your droplet IP + MQTT credentials.
4. Publish to `peaklogic/v1/test_dev/telemetry` on `192.168.1.1:1883` — confirm on cloud broker.
5. Publish `cmd` from cloud — confirm local subscriber receives it.

## Opta bring-up

After W5500 link works:

1. Opta Ethernet → T-ETH-Elite RJ45.
2. Opta `/setup` → broker **`192.168.1.1`**, port **1883**.
3. Cloud PeakLogic → add Opta `mqtt_parc` driver; telemetry should flow via the bridge.

## Production (cellular)

1. Insert IoT SIM; set APN in `/setup`.
2. Disable **WAN Wi-Fi fallback** in menuconfig for field images.
3. Confirm PPP log: `PPP up — WAN IP …` and cloud MQTT connects.
