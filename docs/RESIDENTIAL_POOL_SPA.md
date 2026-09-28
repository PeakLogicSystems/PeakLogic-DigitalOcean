# PeakLogic — residential pool & spa

Home-pad app: **Pentair IntelliFlo + IntelliChlor on one RS-485**, optional Waveshare satellites on **home Wi-Fi**, IOT-LINK (or a small PC) as the hub.

```text
Home Wi-Fi
    │
    ├─ phone / tablet  →  PeakLogic HMI  (homeowner)
    │
    └─ Waveshare ESP32-S3-Relay-1CH-U  (spa jets, lights, acid)
              │  MQTT Parc
              ▼
IOT-LINK / PC  (30_pool_controller.st)
    │
    └─ RS-485 PORT B  9600 8N1  ──┬── IntelliFlo VS  (addr 96)
                                  └── IntelliChlor     (same cable)
```

Seed:

```bash
# /etc/peaklogic/env  — see deploy/iot-link/.env.residential-pool-spa.example
PEAKLOGIC_POOL_PROFILE=residential-spa
node deploy/iot-link/seed-pool-config.js --force
```

## Shared RS-485: IntelliFlo + IntelliChlor

**Yes.** They speak Pentair automation on **one** twisted pair (A/B), **9600 8N1**. PeakLogic uses a single `pentair_bus` driver and tags with `deviceClass` `intelliflo` vs `intellichlor`.

| Device | Address / class | Control | Monitor |
|--------|-----------------|---------|---------|
| IntelliFlo VS/VSF | 96 / `intelliflo` | `PUMP_RUN_CMD`, `PUMP_RPM_CMD`, `IFLO_REMOTE_CMD` | RPM, watts, running |
| IntelliChlor | same bus / `intellichlor` | `IC_PERCENT_CMD` (0–100%), `IC_TAKEOVER_CMD` | salt ppm, water °F, no-flow, low/high salt |

Daisy-chain A/B (and shield/GND) pump ↔ cell ↔ IOT-LINK **PORT B**. Leave **120 Ω** at the far end if the run is long. `busGapMs` 120–150 so the two devices are not polled on top of each other.

**Do not** put DFRobot SEN0711/SEN0712 on this cable. Those are Modbus at **4800**. Use a second adapter (USB RS-485) or skip them — IntelliChlor already reports salt and cell temp.

If an EasyTouch / IntelliTouch is still master, set `IC_TAKEOVER_CMD` only when you want PeakLogic to own output %. Otherwise leave the panel in charge and treat IC tags as monitor-only.

## Home Wi-Fi (Waveshare satellites)

Each 1CH module is commissioned on a phone:

1. Join AP **`PeakLogic-Relay1CH`** / password `peaklogic`.
2. Open `http://192.168.4.1:8080/setup`.
3. **Home Wi-Fi name + password** (your house router).
4. **Hub address** = IOT-LINK LAN IP (Mosquitto `:1883`).
5. Unique `deviceId` (`ws_relay_spa`, `ws_relay_lz1`, …).
6. **Save & join home Wi-Fi** — the setup AP stays up so you can fix a typo.

Prefer **ESP32-S3-Relay-1CH-U** + SMA antenna at the equipment pad.

```bash
PEAKLOGIC_POOL_WAVESHARE_RELAYS=spa_jets:ws_relay_spa,light_z1:ws_relay_lz1,dose_acid:ws_relay_acid:flow_sw
```

IntelliFlo does **not** need a Waveshare pump pilot — speed and run live on the Pentair bus.

## Spa

`CFG_FP2` is turned on (spa filter / spa mode). `SPA_JETS` can be a Waveshare relay (blower or jet pump contactor). Volume tags `SPA_VOL_GAL` / `SPA_TURNOVER_MIN` stay in the pool program for turnover math.

## Res-Pool-Link (standalone ESP32)

Product **`res-pool-link`** on the ESP32 is a **standalone** pad: home Wi-Fi, DFRobot SEN0711/SEN0712, IntelliFlo read + setup menus, IntelliChlor status, and four backwash valves. No IOT-LINK. See [`docs/RES_POOL_LINK.md`](RES_POOL_LINK.md).

## What this profile is not

- Not the cloud-only `pool-cloud-residential` telemetry tenant (that is homeowner view of an uplink).
- Not a replacement for EasyTouch scheduling unless you take over IC + pump.
- Not one RS-485 for Pentair **and** Modbus chemistry.
