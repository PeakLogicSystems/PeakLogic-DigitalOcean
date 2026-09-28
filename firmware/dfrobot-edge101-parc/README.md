# DFRobot Edge101 — PeakLogic Parc

Arduino firmware for the **DFRobot Edge101** (SKU **DFR0886**): industrial ESP32 with isolated RS-485, isolated CAN, 10/100 Ethernet, and optional mini-PCIe 4G.

This tree is the PeakLogic **MQTT Parc** field controller. The board polls DFRobot water probes on the isolated RS-485 port and publishes tags to the cloud broker. It is **not** an on-device ST/MVBC PLC (use `cellular-parc-st` / Opta for that).

Wiki: https://wiki.dfrobot.com/dfr0886/

## Role

| Job | How |
|-----|-----|
| WAN | **Ethernet** (IP101GRI RMII) first; 2.4 GHz Wi-Fi STA as fallback |
| Commission | Setup AP `PeakLogic-Edge101` / `peaklogic` → `http://192.168.4.1:8080/setup` |
| Chemistry | Isolated RS-485, **4800 8N1**, SEN0711 slave **1** + SEN0712 slave **2** |
| Cloud | MQTT Parc (`platform`: `dfrobot-edge101`, protocol **2**) |

## I/O / tags

| Tag | Hardware | Notes |
|-----|----------|--------|
| `I1` | Onboard button GPIO38 | Active low (pressed = true) |
| `I2` | Header GPIO37 | Input-only spare DI (wire an external pull-up) |
| `ETH_LINK` | IP101 | True when Ethernet has an IP |
| `PH_AI` | SEN0711 IR1 | pH (×0.01) |
| `ORP_AI` | SEN0712 IR0 | Free chlorine ppm (pool ST treats `ORP_*` as CL2) |
| `WATER_TEMP_C` | SEN0711 IR2 | °C (×0.1) |
| `NH3_MG_L` | SEN0711 IR0 | Ammonia mg/L (×0.01) |
| `CHEM_OK` | Both probes | True when last SEN0711 and SEN0712 replies succeeded |

Set unique Modbus addresses (holding `0x07D0`) before both probes share the bus.

## Pin map (from DFRobot / Arduino-ESP32 variant)

| Function | GPIO |
|----------|------|
| User LED (active low) | 15 |
| User button | 38 |
| Spare DI | 37 |
| RS485 TX / RX / DE | 17 / 36 / 16 |
| Ethernet PHY power / MDC / MDIO / REF_CLK | 2 / 4 / 13 / 0 (input) |
| I2C SDA / SCL (PCF8563 + Gravity) | 18 / 23 |
| CAN TX / RX (unused) | 32 / 35 |
| 4G UART1 TX / RX (unused) | 33 / 34 |

Do not reuse GPIO0 or GPIO2 — they belong to the Ethernet PHY.

## Flash (Arduino IDE)

1. Board manager: **esp32 by Espressif** 3.x
2. Optional DFRobot package URL: `https://downloadcd.dfrobot.com.cn/DFRobot_Edge101/package_Edge101_index.json` → board **Edge101 IOT Controller**
3. Or board **ESP32 Dev Module** (pins are in `mv_board.h`)
4. Libraries: **ArduinoJson** 7.x, **PubSubClient**
5. Open `PeaklogicEdge101Parc/PeaklogicEdge101Parc.ino` and upload (USB-C / CH9102F)

## Commission

1. Join AP **`PeakLogic-Edge101`** / `peaklogic`
2. Open `http://192.168.4.1:8080/setup`
3. Set a unique `deviceId` (default `edge101_01`)
4. Plug Ethernet **or** enter 2.4 GHz Wi-Fi
5. Confirm WAN IP and `http://192.168.4.1:8080/api/status` (also on the Ethernet/STA IP after join)
6. In PeakLogic: **Drivers → Device template → DFRobot Edge101 — MQTT Parc**

## vs other DFRobot paths

| Path | When |
|------|------|
| This firmware | Edge101 on-site: Ethernet/Wi-Fi + isolated RS-485 probes |
| `dfrobot_pool_chemistry` | IOT-LINK / PC USB RS-485 (no Edge101) |
| `dfrobot_pool_chemistry_dragino` | NB-IoT Dragino gateway, no Ethernet controller |

CAN and mini-PCIe 4G are wired on the board but not used in v0.1.
