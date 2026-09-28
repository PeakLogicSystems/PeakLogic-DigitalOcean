# PeakLogic Parc MQTT peer — LilyGO T-HaLow



ESP-IDF firmware for the **LilyGO T-HaLow** (ESP32-S3). It publishes sensor

telemetry to **PeakLogic PC / IOT-link** over the **PeakLogic Parc** MQTT protocol

(`peaklogic/v1`), same as the Arduino Opta.



## MQTT over HaLow, setup over Wi-Fi (Opta-style)



**MQTT uses HaLow** — TCP runs on a custom L2 netif (raw Ethernet frames via

TX-AH `AT+TXDATA` / `+RXDATA`).



**Wi-Fi is setup-only** — the ESP32 soft-AP (`PeakLogic-T-HaLow`) exposes

`http://192.168.4.1:8080/setup` for broker, device ID, and HaLow IP config

(saved to NVS), mirroring the Opta workflow.



```

 [ LilyGO T-HaLow ] ---- HaLow (802.11ah) ----> [ HaLow AP / broker on HaLow LAN ]

        |

        +--- 2.4 GHz Wi-Fi AP (192.168.4.1) --- phone/laptop for /setup only

```



The MQTT broker IP must be **reachable from the HaLow network** (often the AP

gateway, e.g. `10.10.10.1`, or a routed LAN host).



## Build

See **[BUILD.md](BUILD.md)** for toolchain install (ESP-IDF 5.1+, Windows/Linux/macOS) and flash steps.

```bash

cd halow-xiao-sta

idf.py set-target esp32s3

idf.py menuconfig   # HaLow pairing, broker defaults, sensors

idf.py build flash monitor

```



No `MMIOT_ROOT` or Morse Micro SDK required.



### menuconfig essentials



| Menu | Setting |

| ---- | ------- |

| **Device config** | default broker, HaLow IP (`10.10.10.2`), setup AP SSID/password |

| **TX-AH** | pairing vs manual SSID, UART pins |

| **PeakLogic Parc** | device ID (`thalow_01`), site key |

| **Sensors** | template + GPIO pins |



### First-time provisioning



1. Flash firmware; put HaLow AP in **pairing mode** (LilyGO workflow).

2. Connect phone/laptop to Wi-Fi AP `PeakLogic-T-HaLow` / `peaklogic`.

3. Open `http://192.168.4.1:8080/setup` — set broker IP, HaLow IP, device ID.

4. Save & reboot. MQTT connects over HaLow when the link is up.



### ALF sensor templates (select on `/setup`)

| # | Location | I/O |
|---|----------|-----|
| 1 | Mechanical room | Water + gas pulse, 3× WH temp/CT, leak rope |
| 2 | Client room | 3× thermistor, 2× AC blower CT + stove CT, pan leak |
| 3 | Client bathroom | Toilet flow pulse, tub/shower leak rope |
| 4 | Rooftop A/C | High/low temp, compressor + fan CT, pan leak |
| 5 | Kitchen | Incoming water pulse, refer + freezer temp |
| 6 | Kitchen six sinks | 6× sink leak rope + 6× sink flow pulse |

Template choice is saved in NVS (`sensor_tpl`). **Save & reboot** after changing.

Leak latch reset via MQTT `write_outputs`: `LEAK_RST`, `LEAK1_RST`, `LEAK_PAN_RST`, etc.

## Telemetry tags



| Tag | Source |

| --- | ------ |

| `RSSI`, `LINK` | HaLow link (MQTT path) |

| `FLOW`, `CT1`/`CT2`, `LEAK`, `ROPE` | Field sensors |



## Sensor defaults (no camera)



| Sensor | GPIO |

| ------ | ---- |

| Flow | 46 |

| CT1 / CT2 | 3 / 6 |

| Leak rope | 7 |



## Files



| File | Purpose |

| ---- | ------- |

| `main/main.c` | Boot: setup AP + HaLow net + Parc loop |

| `main/halow_net.c/.h` | esp_netif over TX-AH Ethernet frames |

| `main/wifi_setup.c/.h` | Wi-Fi soft-AP for local setup |

| `main/setup_web.c/.h` | Opta-style `/setup` HTTP UI |

| `main/device_cfg.c/.h` | NVS config (broker, HaLow IP, AP) |

| `main/tx_ah.c/.h` | TX-AH UART AT + frame TX/RX |

| `main/mqtt_parc.c/.h` | PeakLogic Parc client |

| `main/sensors.c/.h` | Flow, CT, leak rope |

