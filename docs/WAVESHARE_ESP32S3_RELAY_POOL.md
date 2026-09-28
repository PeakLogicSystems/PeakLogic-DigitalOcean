# Waveshare ESP32-S3-Relay-1CH-U on a pool

Industrial DIN-rail **one-channel** Wi-Fi relay (ESP32-S3, isolated NO contact, USB-C). The **-U** SKU uses an **external SMA antenna** — use that at the equipment pad.

This is **not** a replacement for Opta, IOT-LINK, or a VS pump bus. It is a **cheap satellite** for a single load that pool ST already computes.

```text
30_pool_controller.st  (IOT-LINK / Cloud Studio)
        │  MQTT Parc  write_outputs { R1: true }
        ▼
Waveshare ESP32-S3-Relay-1CH-U
        │  isolated NO contact
        ▼
Dose pump  ·  heater fireman switch  ·  one light zone  ·  pump-contactor coil
```

Firmware: `firmware/waveshare-esp32s3-relay-parc/`  
Template: **Waveshare ESP32-S3-Relay-1CH-U — MQTT Parc (pool satellite)**  
Platform: `waveshare-esp32s3-relay-1ch`

## Use it effectively

**One board per load.** Buy several, give each a unique `deviceId` (`ws_relay_acid`, `ws_relay_lz1`, …), and bind each to one pool tag. Do not try to run the whole pad from a single 1CH module.

| Role | Pool tag | When it is the right tool |
|------|----------|---------------------------|
| `dose_acid` / `dose_base` / `dose_cl` / `dose_salt` | `DOSE_*` | Best fit. Fail-safe OFF stops chemical on Wi-Fi loss. |
| `light_z1` … `light_z6` | `LIGHT_Z*` | One color-wheel / transformer zone. |
| `heater` | `HP_RUN_CMD` | Dry contact / fireman switch. Heat pump RS-485 stays on PORT B. |
| `pump_pilot` | `PUMP_RUN_CMD` | **Contactor coil only.** VS pumps (Speck / Pentair / Jandy / Hayward) stay on RS-485. |
| `bw_valve` | `BW_VALVE_BW` | Solenoid or actuator enable — not a substitute for IntelliValve. |
| `spa_jets` | `SPA_JETS` | Spa jets or blower contactor (residential pool & spa). |
| `flow_sw` (aux DI) | `POOL_FLOW_SW` | SH1.0 GPIO2, active low. Same board as a dose relay. |

**Pilot, do not switch motors.** Contact rating is ≤10 A 250 VAC / 30 VDC. Filter-pump inrush is often far above that. Wire `R1` to a properly sized contactor or SSR; put a fuse or breaker on the load.

**Fail-safe is OFF.** MQTT drop opens the NO contact. That is correct for dose, heater, and lights. It is **wrong** as the only control for a filter pump that must keep circulating — use the pump’s own schedule or a local HOA, and treat the Waveshare as a remote enable.

**-U + SMA antenna.** Mount the antenna outside the metal can. The non-U ceramic antenna is for a bench or plastic enclosure.

**5 V only** on the screw terminal or USB-C. The relay side is isolated; keep line voltage on the NO/COM terminals only.

**GPIO2** is the spare DI (flow switch, lid interlock). Do not put 24 V on it — it is a 3.3 V ESP32 pin on the SH1.0 header.

## Commission

1. Flash `firmware/waveshare-esp32s3-relay-parc` (Arduino IDE, ESP32S3 Dev Module, USB CDC on).
2. Join AP **`PeakLogic-Relay1CH`** / `peaklogic` → `http://192.168.4.1:8080/setup`.
3. Enter **home Wi-Fi** name + password and the **pool hub** LAN IP (IOT-LINK Mosquitto `:1883`).
4. Unique `deviceId`. Save.
5. **Drivers → MQTT Parc → Waveshare ESP32-S3-Relay-1CH-U** with that `deviceId`.
6. Bind the pool tag (seed env below, or set the tag’s `driverId` + `driverAddress.channel` = `R1`).

IOT-LINK pool already runs ST on the appliance (`remoteExecution: false`). The Parc driver sends `write_outputs` for dirty coils. Device mode on the board is **remote I/O**.

## IOT-LINK env

Single board:

```bash
PEAKLOGIC_POOL_WAVESHARE_RELAY=true
PEAKLOGIC_POOL_WAVESHARE_ROLE=dose_acid
PEAKLOGIC_POOL_WAVESHARE_DEVICE_ID=ws_relay_acid
PEAKLOGIC_POOL_WAVESHARE_DI=flow_sw
```

Several boards (recommended):

```bash
PEAKLOGIC_POOL_WAVESHARE_RELAYS=dose_acid:ws_relay_acid:flow_sw,dose_cl:ws_relay_cl,light_z1:ws_relay_lz1
```

Format: `role:deviceId[:diRole]`. Then:

```bash
node deploy/iot-link/seed-pool-config.js --force
```

Roles: `dose_acid`, `dose_base`, `dose_cl`, `dose_salt`, `light_z1`…`light_z6`, `pump_pilot`, `heater`, `bw_valve`, `spa_jets`. Optional DI: `flow_sw`.

Residential pool & spa (`PEAKLOGIC_POOL_PROFILE=residential-spa`) defaults to `spa_jets:ws_relay_spa` if no list is set. See `docs/RESIDENTIAL_POOL_SPA.md`.

## Chemistry: SEN0711 + SEN0712

Hang the probes on **IOT-LINK PORT B**, not on the Waveshare RS-485 (this firmware is remote I/O only). Pool ST already treats `ORP_*` as **CL2 ppm**, so SEN0712 maps to `ORP_AI`.

| Probe | Slave | Baud | Pool tags |
|-------|-------|------|-----------|
| SEN0711 ammonia / pH | **1** | 4800 8N1 | `PH_AI` (pH), `WATER_TEMP_C`, `NH3_MG_L` |
| SEN0712 residual chlorine | **2** | 4800 8N1 | `ORP_AI` (mg/L / ppm) |

Set unique Modbus addresses (holding **0x07D0**) **before** both share A/B. Enable 120 Ω if the run is long.

```bash
PEAKLOGIC_POOL_MODBUS_CHEM=true
PEAKLOGIC_POOL_WAVESHARE_RELAYS=dose_acid:ws_relay_acid:flow_sw,dose_cl:ws_relay_cl
node deploy/iot-link/seed-pool-config.js --force
```

ST averages `PH_AI` → `PH_PV` and `ORP_AI` → `ORP_PV`, then drives `DOSE_ACID` / `DOSE_BASE` / `DOSE_CL` — those coils can be the Waveshare satellites above.

Drivers template: **DFRobot pool chemistry — SEN0711 pH + SEN0712 chlorine (RS-485)**. Cellular without IOT-LINK: **… via Dragino**.

## What not to use it for

- Full chemistry + lighting + backwash on one 1CH module  
- Direct switching of a 1.5–3 hp filter pump  
- Replacing Pentair / Jandy / Hayward RS-485  
- Outdoor wet-niche without a listed enclosure and GFCI  

Waveshare **Modbus RTU IO 8CH** is the right product when you need eight relays on one RS-485 drop next to the IOT-LINK. This ESP32 board is for **Wi-Fi satellites** around the pad.
