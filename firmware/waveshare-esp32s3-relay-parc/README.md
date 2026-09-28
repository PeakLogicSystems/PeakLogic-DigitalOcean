# Waveshare ESP32-S3-Relay-1CH-U — PeakLogic Parc

Arduino firmware for the **ESP32-S3-Relay-1CH** / **1CH-U** (external SMA antenna). The board is a **pool satellite**: IOT-LINK or Cloud Studio runs `30_pool_controller.st`; this module is remote I/O for **one isolated relay**.

Wiki: https://www.waveshare.com/wiki/ESP32-S3-Relay-1CH  
How to use it on a pool: [docs/WAVESHARE_ESP32S3_RELAY_POOL.md](../../docs/WAVESHARE_ESP32S3_RELAY_POOL.md)

## I/O

| Parc tag | Hardware | Notes |
|----------|----------|--------|
| `R1` | Onboard relay (GPIO **1**) | NO contact, ≤10 A 250 VAC / 30 VDC, opto-isolated |
| `I1` | SH1.0 **GPIO2** (active low, pull-up) | Flow switch or interlock |

MQTT loss **opens** the relay (fail-safe OFF). Use that for dose pumps, heater enable, and lights — not as the only protection for a filter pump that must keep circulating.

## Flash (Arduino IDE)

1. Board manager: **esp32 by Espressif** 3.x  
2. Board: **ESP32S3 Dev Module**  
3. **USB CDC On Boot: Enabled**  
4. Libraries: **ArduinoJson** 7.x, **PubSubClient**  
5. Open `PeaklogicWsRelay1ch/PeaklogicWsRelay1ch.ino` and upload (USB-C)

## Commission

1. Join AP **`PeakLogic-Relay1CH`** / `peaklogic`  
2. Open `http://192.168.4.1:8080/setup`  
3. Enter **home Wi-Fi** name + password, pool hub LAN IP (IOT-LINK Mosquitto), unique `deviceId` (`ws_relay_spa`, `ws_relay_acid`, …)  
4. **Save & join home Wi-Fi** — confirm WAN IP and `http://192.168.4.1:8080/api/status`  
5. In PeakLogic: **Drivers → Device template → Waveshare ESP32-S3-Relay-1CH-U** with that `deviceId`

Prefer the **-U** SKU plus the included SMA antenna at the equipment pad (metal enclosures kill the ceramic antenna).

## ESP-IDF alternative

`cellular-parc-st` can drive the same GPIO map:

```powershell
cd cellular-parc-st
idf.py -D SDKCONFIG_DEFAULTS="sdkconfig.defaults.waveshare_relay_1ch" set-target esp32s3
idf.py build flash monitor
```

Arduino is the supported path for 8 MB Waveshare modules; the IDF image is sized for LilyGO 16 MB + PSRAM.
