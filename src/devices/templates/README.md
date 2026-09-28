# Device templates (JSON)

Add a new Modbus device template by creating a `.json` file in this folder. PeakLogic picks up `*.json` files automatically (no server restart) and lists them under **Drivers → Device template** on the next dashboard poll.

## Example

Copy `opta_rtu_slave.json` or `datexel_dat10148.json` and edit:

| Field | Meaning |
|-------|---------|
| `id` | Unique preset id (used by API) |
| `label` | Text shown in the dropdown |
| `transport` | `modbus_rtu`, `modbus_tcp`, or `vgreen_epc` |
| `driverId` | Default driver id on apply — use the **same** id in several templates (e.g. `modbus_rtu`) so they share one bus connection; edit a driver in **Drivers** before Apply to target a different id |
| `sharedBus` | `false` for dedicated instruments (`tags.explicit` only) — creates/uses `driverId` instead of merging onto the first Modbus driver of the same transport |
| `defaults` | Serial port, baud, slave ID, parity |
| `tags.discrete` | BOOL inputs — FC02, `prefix` + number |
| `tags.coil` | BOOL outputs — FC01/05 |
| `tags.input` | INT inputs — FC04 (`start`, `suffix` optional) |
| `tags.holding` | INT memory — FC03 (`H1`… style) |
| `tags.explicit` | Named tags with exact Modbus address (REAL float32, status words, etc.) |
| `tags.fixture` | Load tag rows from one or more `st/fixtures/*.json` files (string or array). Every row is bound to the template's `driverId`. Use for devices whose tag set is defined by a shipped ST program fixture. |
| `stProgram` | Path under `st/` to the Structured Text program that **lives on this device** (e.g. `logic/lift_station_duplex.st`). On **Apply device template** it is set as the active program so the runtime deploys it (locally, or to the remote Opta). |
| `stProgramLabel` | Friendly name for the device's ST program (metadata only). |

## Blocks

Each array entry:

```json
{ "prefix": "DI", "count": 8, "start": 0, "suffix": "" }
```

- `start` — 0-based Modbus address (default 0)
- `suffix` — appended to tag id (e.g. `_RAW`, `_MV`)

After saving the JSON file, open **Drivers** (or wait for the next poll) — the new template appears in the dropdown.

**Shared Modbus bus:** use the same `driverId` / COM port for several templates (live reload, no restart). Each apply assigns the **next slave address**. Tag names continue sequentially (`DI1`–`DI16`, then `DI17`–`DI32` for a second 16-input module); slave is stored per tag, not in the name.

## S::CAN spectro::lyser

| Template | Transport | Default comm |
|----------|-----------|--------------|
| `scan_spectrolyser.json` | RS-485 Modbus RTU | 38400 8O1, slave **4** |
| `scan_spectrolyser_tcp.json` | Modbus TCP (con::nect / gateway) | host :502, slave **4** |

Register map follows community spectro::lyser mapping (EnviroDIY S-CAN-Modbus): input registers **120** device status, **122+8×n** parameter values as **float32** (`PARM1_VAL`…`PARM8_VAL`). Probe must be in **logging mode** for live values when connected directly (not via ana::gate).

## JXCT soil NPK (Modbus RTU)

| Template | Model | Tags |
|----------|-------|------|
| `jxct_npk_jxbs3001.json` | JXBS-3001-NPK-RS (7-in-1) | `SOIL_PH`, `SOIL_MOIST_PCT`, `SOIL_TEMP_C`, `SOIL_EC_US_CM`, `N_MG_KG`, `P_MG_KG`, `K_MG_KG` |

Default **9600 8N1**, slave **1**. FC03 holding: pH **0x0006**, moisture **0x0012**, temp **0x0013**, EC **0x0015**, N/P/K **0x001E–0x0020**. Config: address **0x0100**, baud **0x0101**.

## Seeed Studio RS485 probes (Modbus RTU)

| Template | SKU | Tags |
|----------|-----|------|
| `seeed_h2s_101990863.json` | 101990863 (S-H2S-01) | `H2S_PPM`, `H2S_TEMP_C`, `H2S_RH_PCT`, `H2S_MAX_PPM` |

Default **9600 8N1**, slave **16** (0x10). Measurements are **holding registers** (FC03): H2S float32 @ **0x2000**, temperature @ **0x2004**, humidity @ **0x2006**.

## APG True Echo radar (Modbus RTU)

| Template | Model | Tags |
|----------|-------|------|
| `apg_true_echo_rtu.json` | True Echo CR-L / Plus (RS-485) | `TE_DIST_CM`, `TE_DIST_MM`, `TE_LVL_CM`, `TE_LVL_MM`, `TE_SPACE`, `TE_LEVEL`, `TE_DIST` |

Default **9600 8N1**, slave **1**, `frameDelayMs` **100** (vendor minimum between transactions), `pollIntervalMs` **500**. Process values are **input registers** (FC04): uint16 distance/level at **0–3**; float32 **CDAB** space/level/distance at **36 / 38 / 40**. Bind `TE_LEVEL` to `TANK_LVL` / ALT analog for wet-well control. Manual: [apgsensors.com True Echo](https://apgsensors.com/).

**Opta bring-up:** flash `firmware/arduino-opta-true-echo/` (standalone). Production mqtt-st is MQTT Parc ST + I/O only (no EZ Meter fieldbus). True Echo on Opta remains the sample sketch or PC `apg_true_echo_rtu` master.

## DFRobot RS485 water-quality probes (Modbus RTU)

| Template | SKU | Tags (engineering units) |
|----------|-----|--------------------------|
| `dfrobot_sen0706_ec.json` | SEN0706 | `EC_US_CM`, `EC_TEMP_C`, `EC_SAL_PPM`, `EC_TDS_PPM` |
| `dfrobot_sen0709_orp.json` | SEN0709 | `ORP_MV`, `ORP_TEMP_C` |
| `dfrobot_sen0710_turbidity.json` | SEN0710 | `TURB_NTU`, `TURB_TEMP_C` |
| `dfrobot_sen0712_chlorine.json` | SEN0712 | `CL_MG_L` |
| `dfrobot_sen0711_ammonia_ph.json` | SEN0711 | `NH3_MG_L`, `NH3_PH`, `NH3_TEMP_C` |
| `dfrobot_sen0681_do.json` | SEN0681 | `DO_SAT_PCT`, `DO_MG_L`, `DO_TEMP_C` |

Default **4800 8N1**, slave **1** (per DFRobot wiki). Integer registers use tag **scale** for ×10 / ×100; SEN0681 uses **float32** big-endian. Multiple probes on one RS-485 bus: give each probe a unique slave ID (reg **0x07D0**), add a separate driver row per probe, or merge tags with per-tag `slaveId` in **Tags**.

## S::CAN con::cube

| Template | Transport | Default comm |
|----------|-----------|--------------|
| `scan_concube_tcp.json` | Modbus TCP (Ethernet on cube) | host :502, slave **1** |
| `scan_concube_rtu.json` | Modbus RTU (COM-5) | 38400 8O1, slave **1** |

Register map per con::cube D-330 manual §7.4: device status IR **120**, parameter *n* status IR **128+8×(n−1)**, value IR **130+8×(n−1)** as IEEE **float32** BE. In **Drivers → Apply device template**, set **Parameter groups (×4)** (1–16). Each apply adds that many groups; repeat apply to append the next block (up to **64** parameters). First apply also adds system tags `CUBE_DEV_STATUS` / `CUBE_MB_MAP_VER`.

Explicit tag example:

```json
{
  "id": "PARM1_VAL",
  "type": "REAL",
  "table": "input",
  "address": 122,
  "wordWidth": 32,
  "encoding": "float32",
  "byteOrder": "BE"
}
```

## Pentair pool RS-485 (9600 8N1)

Shared proprietary bus — **not Modbus**. One `pentair_rs485` driver can poll multiple device classes; tags carry `deviceClass` / `deviceAddr` in `driverAddress`.

| Template | Device class | Default addr | Tags |
|----------|--------------|--------------|------|
| `pentair_intelliflo.json` | `intelliflo` | 96 (0x60) | RPM, watts, flow, run/speed cmds |
| `pentair_intellichlor.json` | `intellichlor` | — (IC protocol) | Salt ppm, temp, errors, output % |
| `pentair_ultratemp.json` | `ultratemp` | 112 (0x70) | Heat pump mode/run |
| `pentair_valves.json` | `valve` | 16 (0x10 controller) | Valve 1–4 positions via panel GET |

**Wiring:** A/B/GND to pump, chlorinator, and heat pump on same bus. Only one bus master — disable Pentair panel remote or use chlorinator takeover. Set `busGapMs` ≥ 120 when mixing IntelliFlo + IntelliChlor on one port.

Fixtures: `st/fixtures/drivers.pentair_pool_bus.json`, `tags.pentair_*.json`.

## Jandy AquaLink RS-485 (9600 8N1)

DLE/STX/ETX framing — **not Modbus**. One `jandy_rs485` driver polls multiple Jandy device classes on the AquaLink bus.

| Template | Device class | Default addr | Tags |
|----------|--------------|--------------|------|
| `jandy_epump.json` | `epump` | 120 (0x78) | RPM, watts, run/speed cmds |
| `jandy_aquapure.json` | `aquapure` | 80 (0x50) | Salt ppm, SWG status, output % |
| `jandy_jxi_heater.json` | `jxi_heater` | 104 (0x68) | JXi running/error |
| `jandy_lx_heater.json` | `lx_heater` | 56 (0x38) | LX running/error |
| `jandy_heat_pump.json` | `heat_pump` | 112 (0x70) | Heat pump status |

Fixtures: `st/fixtures/drivers.jandy_pool_bus.json`, `tags.jandy_*.json`. IOT-LINK seed: `PEAKLOGIC_POOL_JANDY_BUS=true`.

## Hayward low-speed RS-485 (19200 8N2)

Proprietary VS pump bus (EcoStar, TriStar VS, MaxFlo VS). Pump must be in **RS485 control mode** with a unique HUA (Hayward Unique Address).

| Template | Device class | Default HUA | Tags |
|----------|--------------|-------------|------|
| `hayward_vs_pump.json` | `vs_pump` | 0 | Speed %, RPM, watts, run/speed cmds |
| `hayward_ecostar_vs.json` | `vs_pump` | 0 | EcoStar (8N1 simple frames) |
| `hayward_tristar_vs.json` | `vs_pump` | 0 | TriStar VS (OmniLogic 8N2) |

Driver type: **`hayward_rs485`**. Sends keepalive speed commands ~1 s; pump stops if commands cease. Fixtures: `st/fixtures/drivers.hayward_pool_bus.json`, `tags.hayward_vs_pump.json`. IOT-LINK seed: `PEAKLOGIC_POOL_HAYWARD_BUS=true`.

## SPECK BADU Pro-VI UVS (VGreen RS-485)

| Template | Transport | Default comm |
|----------|-----------|--------------|
| `speck_badu_pro_vi_uvs.json` | VGreen EPC RS-485 | 19200 8N1, slave **21** (0x15) |

Century VGreen motors use the **Regal GEN3 EPC** protocol (custom Modbus functions 0x41–0x45), not standard coils/registers. Driver type: **`vgreen_epc`**.

**Pump setup:** motor menu → digital input mode **Bus**; confirm baud **19200** and slave address. Sample ST: `st/logic/25_badu_pro_vi_filter_pump.st`.

## Nexcomm Halo (MQTT)

| Template | Transport | Tags |
|----------|-----------|------|
| `nexcomm_halo_mqtt.json` | MQTT subscribe | `BASE_TEMP`, `BASE_RH` + `X1`–`X10` (`*_TEMP`, `*_RH`) — 22 points |

Topic: `nexcomm/halo/<deviceId>/telemetry`. JSON: `base.temp_C`, `base.rh_pct`, `X1.temp_C`, `X1.rh_pct`, … Sample payload: `st/fixtures/halo-telemetry-sample.json`.

## Nexcomm HaLoW leak detector (MQTT)

| Template | Transport | Tags |
|----------|-----------|------|
| `nexcomm_halow_leak_mqtt.json` | MQTT subscribe | 6× (`CHn_LEAK` BOOL, `CHn_FLOW` REAL, `CHn_TOTAL` REAL) — 18 points |

Topic: `nexcomm/halow/<deviceId>/telemetry`. JSON per channel: `CHn.leak`, `CHn.flow_gpm`, `CHn.total_gal`. Sample: `st/fixtures/halow-telemetry-sample.json`.

## Nexcomm BME688 env sensor (MQTT)

| Template | Transport | Tags |
|----------|-----------|------|
| `nexcomm_bme688_env_mqtt.json` | MQTT subscribe | `BME_TEMP`, `BME_RH`, `BME_PRESS`, `BME_GAS_OHM`, `BME_IAQ`, `BME_IAQ_ACC`, `BME_VOC`, `BME_CO2_EQ` |

Topic: `nexcomm/env/<deviceId>/telemetry`. JSON under `bme688`: `temp_C`, `rh_pct`, `press_hPa`, `gas_ohm`, `iaq`, `iaq_acc`, `voc_ppm`, `co2_eq_ppm`. Sample: `st/fixtures/bme688-telemetry-sample.json`.

## MCXN947 edge devices (PeakLogic Parc MQTT)

Independent firmware projects on **NXP MCXN947**; only shared elements are the MCU and Parc MQTT topic layout.

| Template | Firmware path | Role |
|----------|---------------|------|
| `mcxn947_hvac_mcsa.json` | `C:/Users/Public/data/MCSA` | HVAC motor MCSA monitor |
| `mcxn947_pool_sensor.json` | `C:/Users/Public/data/mcxn947-pool-sensor` | Pool chemistry (CENSAR chip interface) |

Topic: `peaklogic/v1/<deviceId>/telemetry`. Pool sensor sample: `st/fixtures/pool-sensor-telemetry-sample.json`.

## Lift stations (PeakLogic Parc MQTT — ST lives on the device)

Wet-well sewage/stormwater lift stations for discrete field locations. Each type is a self-contained edge device (Arduino Opta) that **runs its own ST program on-device** via remote execution. Applying the template deploys the matching ST program and publishes the station's alarm/status tags to the SCADA tag database and PeakLogic cloud.

| Template | Type | Pumps | ST program | Key alarm/status tags |
|----------|------|-------|------------|-----------------------|
| `lift_station_simplex.json` | Simplex | 1 | `st/logic/lift_station_simplex.st` | `SPX_ALM`, `SPX_HI_ALM`, `SPX_LO_ALM`, `SPX_P1_RUN`, `SPX_LEVEL` |
| `lift_station_duplex.json` | Duplex | 2 (lead/lag) | `st/logic/lift_station_duplex.st` | `DPX_ALM`, `DPX_FAULT`, `DPX_HI_ALM`, `DPX_P1_RUN`, `DPX_P2_RUN`, `DPX_LEAD_RUN`, `DPX_LEVEL` |
| `lift_station_triplex.json` | Triplex | 3 (lead/lag/lag2) | `st/logic/lift_station_triplex.st` | `TPX_ALM`, `TPX_FAULT`, `TPX_HI_ALM`, `TPX_P1_RUN`…`TPX_P3_RUN`, `TPX_LEAD_RUN`, `TPX_LEVEL` |

Pump alternation uses the `ALT` function block (`ALT2`/`ALT3`) — lead rotation, lag/lag2 staging, high-level all-call, and auto-fault skip of offline pumps. Tag fixtures: `st/fixtures/tags.lift_station_{simplex,duplex,triplex}.json`.

## Split HVAC (PeakLogic Parc MQTT — ST lives on the device)

Single and double split systems (outdoor condenser + air handler). Opta firmware v2.3.81+ with `/mcsa` (HVAC or dual-cond facility preset) and `/ahu-env` for supply/return NTC + pan leak.

| Template | Bundled project | ST program | Key rollup tags |
|----------|-----------------|------------|-----------------|
| `arduino_opta_hvac_split.json` | `opta-split-hvac.est.zip` | `st/logic/opta_split_hvac.st` | `COND_ALM`, `AHU_ALM`, `SYS_ALM` |
| `arduino_opta_hvac_double_split.json` | `opta-double-split-hvac.est.zip` | `st/logic/opta_double_split_hvac.st` | `COND1/2_ALM`, `AHU1/2_ALM`, `SYS_ALM` |

3D viewers: `public/samples/opta-split-hvac-ortho-3d.html`, `opta-double-split-hvac-ortho-3d.html`. Generate with `npm run generate:opta-split-hvac` / `generate:opta-double-split-hvac`.

**3D fleet map:** `public/samples/fl-service-area-3d.html` renders these three station types as 3D objects at discrete geographic (lat/lon) locations across a defined Florida service area, polling `/api/dashboard` for live alarm/level state. Reusable objects: `public/samples/lift-station-3d.js`. Point an HMI screen at it via `layout.facility3dUrl = '/samples/fl-service-area-3d.html'` with `composerMode: '3d'`.
