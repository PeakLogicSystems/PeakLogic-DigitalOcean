# Waveshare ESP32-S3-Relay-1CH — Pentair Link

Standalone **IntelliFlo + IntelliChlor** on the Waveshare **1CH-U** onboard RS-485 screw terminals (**A+ / B−**). No DFRobot chemistry, no valve relays, no IOT-LINK required.

## Wire

| Terminal | Pentair bus |
|----------|-------------|
| **A+** | RS-485 A |
| **B−** | RS-485 B |
| GND | Equipment ground (same reference as pump/chlorinator) |

One twisted pair at **9600 8N1** — pump (default addr **0x60**) and IntelliChlor share the cable.

## Flash

Arduino IDE or CLI:

- Board: **ESP32S3 Dev Module**
- USB CDC On Boot: **Enabled**
- FQBN: `esp32:esp32:esp32s3:CDCOnBoot=cdc,USBMode=hwcdc,UploadMode=cdc`
- Libraries: **ArduinoJson 7.x**, **PubSubClient**

Sketch: `PeaklogicWsPentairLink/PeaklogicWsPentairLink.ino`

## Use

1. Join AP **`PeakLogic-Pentair`** / `peaklogic`
2. Open **http://192.168.4.1:8080/**
3. **Wi-Fi** tab → home network + optional `mqtt.peaklogic.io`
4. **IntelliFlo** / **IntelliChlor** tabs for pump and cell control

Pump keeps running locally if Wi-Fi or MQTT drops (unlike the relay-parc dose satellite).

## vs other builds

| Firmware | Board | Pentair | DFRobot |
|----------|-------|---------|---------|
| **waveshare-esp32s3-pentair-link** (this) | 1CH | yes | no |
| esp32-res-pool-link | 6CH | yes | yes |
| waveshare-esp32s3-relay-parc | 1CH | no (MQTT relay only) | no |
