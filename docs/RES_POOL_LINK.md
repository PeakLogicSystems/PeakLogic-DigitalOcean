# PeakLogic Res-Pool-Link

Product id: **`res-pool-link`**. The **ESP32 is the appliance**: home Wi-Fi, DFRobot chemistry, IntelliFlo setup, IntelliChlor status, and a local backwash sequencer. **No IOT-LINK.**

```text
Home Wi-Fi
    │
    ├─ phone / tablet  →  http://<esp32>:8080/   IntelliFlo · IntelliChlor · chem · filter
    │
    └─ ESP32-S3-Relay-6CH
          ├── UART1 9600 8N1 ── IntelliFlo (96) + IntelliChlor
          ├── UART2 4800 8N1 ── SEN0711 (1) + SEN0712 (2)
          └── CH1–4          ── inlet / outlet / waste / spare
```

Firmware: `firmware/esp32-res-pool-link/`  
Join AP **`PeakLogic-ResPool`** / `peaklogic` → `http://192.168.4.1:8080/` → enter **home Wi-Fi**. MQTT defaults match Opta Parc (`mqtt.peaklogic.io:8883`, user `peaklogic`).

## Two RS-485 pairs

| Bus | Baud | Use |
|-----|------|-----|
| Pentair | **9600** 8N1 | IntelliFlo + IntelliChlor on one twisted pair |
| DFRobot | **4800** 8N1 | SEN0711 pH/NH3/temp + SEN0712 free chlorine |

Do not hang the chemistry probes on the Pentair cable.

Default 6CH GPIOs: Pentair TX/RX/DE = **17 / 18 / 8**; chemistry **15 / 16 / 7**. Two MAX3485 (or equivalent) modules.

## IntelliFlo / IntelliChlor

On-device menus (same protocol as `src/drivers/pentairProtocol.js`):

| Device | Read | Setup |
|--------|------|-------|
| IntelliFlo | RPM, watts, drive, flow | Remote, run/stop, RPM 450–3450 |
| IntelliChlor | salt ppm, water °F, faults, % | Output %, takeover (if no panel master) |

## Backwash valves

| Ch | Tag | Role | Filter | Backwash | Rinse |
|----|-----|------|--------|----------|-------|
| R1 | `FILT_INLET` | Filter inlet | ON | ON | ON |
| R2 | `FILT_OUTLET` | Filter outlet | ON | OFF | ON |
| R3 | `BW_WASTE` | Backwash waste | OFF | ON | ON |
| R4 | `BW_SPARE` | Spare | OFF | OFF | OFF |

Local cycle: backwash **180 s** → rinse **60 s** → filter. Stop or boot → filter (waste closed). Three valves are enough; R4 may stay unwired.

Pilot actuators or contactors. Do not switch a pump motor on the relay contacts.

## MQTT Parc (same as Opta)

Defaults are the Opta sketch values: host `mqtt.peaklogic.io`, TLS **8883**, user `peaklogic`, firmware MOSQUITTO_PASS. The pad keeps running when that link is down.

An IOT-LINK seed still exists for shops that want a PC hub (`deploy/iot-link/.env.res-pool-link.example`). That is **not** required for this device.

## Related

- Firmware README: `firmware/esp32-res-pool-link/README.md`
- Residential pad (hub profile): [`docs/RESIDENTIAL_POOL_SPA.md`](RESIDENTIAL_POOL_SPA.md)
