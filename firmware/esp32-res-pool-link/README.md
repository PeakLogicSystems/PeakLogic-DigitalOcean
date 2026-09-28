# Res-Pool-Link — standalone ESP32 pool & spa

Arduino firmware for a **home-pad controller**. It joins **home Wi-Fi**, talks to the equipment locally, and serves menus on a phone. **No IOT-LINK. No MQTT hub required.**

| Job | How |
|-----|-----|
| Network | Setup AP → home Wi-Fi |
| Chemistry | DFRobot SEN0711 + SEN0712 on **4800** Modbus RS-485 |
| Pump | IntelliFlo read + setup (remote, run/stop, RPM) |
| Salt cell | IntelliChlor salt / temp / faults / % |
| Filter | Local backwash sequencer on 4 relays |

MQTT Parc uses the **same cloud credentials as Opta**: `mqtt.peaklogic.io:8883`, user `peaklogic`, firmware MOSQUITTO_PASS, Let's Encrypt Gen-Y CA. The pad still runs if that link is down. Valves do **not** fail-safe when MQTT is down.

Open `http://192.168.4.1:8080/` on AP **`PeakLogic-ResPool`** / `peaklogic`, or `http://<lan-ip>:8080/` after it joins the house router.

## Two RS-485 pairs

Pentair (9600) and DFRobot (4800) **cannot share a cable**.

```text
ESP32-S3-Relay-6CH
 ├── UART1  9600 8N1  MAX3485  ── IntelliFlo (96) + IntelliChlor
 ├── UART2  4800 8N1  MAX3485  ── SEN0711 (slave 1) + SEN0712 (slave 2)
 └── CH1–4 relays               ── inlet / outlet / waste / spare
```

| Bus | Baud | TX / RX / DE (6CH default) | Devices |
|-----|------|----------------------------|---------|
| Pentair | 9600 8N1 | GPIO 17 / 18 / 8 | IntelliFlo addr 96, IntelliChlor |
| Chemistry | 4800 8N1 | GPIO 15 / 16 / 7 | SEN0711 slave 1, SEN0712 slave 2 |

Set unique Modbus addresses (holding `0x07D0`) before both probes share the chemistry pair.

## Valves

| Ch | Tag | Role | Filter | Backwash | Rinse |
|----|-----|------|--------|----------|-------|
| R1 | `FILT_INLET` | Filter inlet | ON | ON | ON |
| R2 | `FILT_OUTLET` | Filter outlet | ON | OFF | ON |
| R3 | `BW_WASTE` | Backwash waste | OFF | ON | ON |
| R4 | `BW_SPARE` | Spare | OFF | OFF | OFF |

**Start backwash** on the Filter tab: waste 180 s (default) → rinse 60 s → filter. Stop returns filter (waste closed). Three valves are enough; leave R4 unwired.

Pilot actuators or contactors. Do not switch a pump motor on these contacts.

## Menus

- **IntelliFlo** — RPM, watts, drive state. Enable remote, then Run / Stop / set RPM (presets 1100 / 1750 / 2350 / 3110).
- **IntelliChlor** — salt ppm, water °F, no-flow / low / high salt / clean cell. Optional output % and takeover (only if no EasyTouch is master).
- **Chemistry** — pH, Cl ppm, °C, NH3 from the DFRobot probes.

## Flash (Arduino IDE)

1. Board manager: **esp32 by Espressif** 3.x
2. Board: **ESP32S3 Dev Module**
3. **USB CDC On Boot: Enabled**
4. Libraries: **ArduinoJson** 7.x, **PubSubClient**
5. Open `PeaklogicResPoolLink/PeaklogicResPoolLink.ino` and upload

| Board | Define in `mv_board.h` | R1–R4 GPIO |
|-------|------------------------|------------|
| Waveshare ESP32-S3-Relay-6CH (default) | `BOARD_WS_S3_RELAY_6CH` | 1, 2, 41, 42 |
| Waveshare-style 4CH S3 | `BOARD_WS_S3_RELAY_4CH` | 1, 2, 41, 42 |
| Generic ESP32 + 4-relay | `BOARD_GENERIC_4RELAY` | 16, 17, 18, 19 |

Firmware `2.0.0-standalone`. Optional host product notes: `docs/RES_POOL_LINK.md`.
