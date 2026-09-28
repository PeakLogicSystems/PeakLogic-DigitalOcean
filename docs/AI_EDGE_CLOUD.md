# AI, Edge, and Cloud Architecture

**Document version:** 1.0  
**Product:** PeakLogic  
**Audience:** Integrators, cloud operators, IoT-Link field deployment  
**Generated:** Run `npm run build:ai-edge-cloud-pdf` for build date

---

## One-line summary

**Cloud is the product** (fleet, PdM, CMMS, historians, host ML). **IoT-Link is the production edge** (HaLow hub, concentrated I/O, optional edge AI). **est-pc / MVP Suite PC is dev/eval only**. Remote Opta lift panels are cloud-connected leaves.

---

## 1. Layer roles — do not conflate

| Layer | Deploy target | Role |
|-------|---------------|------|
| **Cloud SaaS** | Droplet `:3100` + runtime `:3090` + Mosquitto | Multi-tenant ops, Parc ingest, host ONNX/rules, PdM forecast, CMMS, fleet |
| **IoT-Link** | Compulab Linux gateway (`deploy/iot-link/`) | Production appliance: Modbus/BACnet, local MQTT hub, HaLow aggregation, `cloudRemote` uplink |
| **est-pc / MVP Suite** | Windows/Linux dev PC | Full-stack evaluation, sim studies, firmware parity — **not** the field appliance story |
| **Opta (remote lift)** | Arduino panel at store | Grease/lift I/O, lightweight pseudo-AI, MQTT Parc direct to cloud |

Appliances **link to cloud**; they do not replace it. Field buses (Modbus RTU, BACnet/IP, ONVIF discover) stay on the edge per `docs/EST_PC_PARITY.md`.

---

## 2. Data flow (reference architecture)

```text
                    CLOUD (primary product)
                    ┌─────────────────────────────────────┐
 HaLow sensors ──►  │ IoT-Link (:3090)                    │
 (leak, temp,       │  • MQTT broker / HaLow aggregation  │
  Halo nodes)       │  • Modbus / BACnet / local ST       │
       │            │  • Optional: host rule/onnx         │
       └──────────► │  • cloudRemote uplink ──────────────┼──► Cloud :3090
                    └─────────────────────────────────────┘      │
                                                                 │
 Opta (lift only) ───────────── MQTT :1883 direct ─────────────►│
                                                                 │
                    ┌──────────────────────────────────────────┤
                    │ Parc ingest → tags / historian (Mongo)   │
                    │ Host ONNX or rules (when configured)     │
                    │ PdM failure forecast → proactive CMMS WO │
                    │ Operators / tenants / fleet (:3100)      │
                    └──────────────────────────────────────────┘
```

**Circle K phase 1 (lift only):** Opta → cloud Mosquitto — no IoT-Link required.  
**Circle K phase 2 (HVAC-R, leaks, coolers):** IoT-Link at store → `cloudRemote` → same cloud tenant.

---

## 3. AI vs pseudo-AI — where each resides

PeakLogic uses **five processing layers**. **Host ONNX** is neural inference on cloud / IoT-Link; **UNO Q** runs true FFT MCSA and on-device classification (heuristic + spectral, optional ONNX later).

### 3.1 Device pseudo-AI (Arduino Opta firmware)

| Item | Detail |
|------|--------|
| **Code** | `firmware/arduino-opta-mqtt-st/PeaklogicOptaMqttSt/mv_edge_ai.cpp` + `mv_mcsa_m7.cpp` |
| **Pseudo MCSA** | Between ingest windows: `mcsa[]` spectra **synthesized** from CT amps |
| **M4 true FFT (2.3.80+)** | Every **5 min** M7 captures I1–I6 (0–1 V: 16-bit, 16× burst OS, 512 Hz / 2048 samp / 4 s) → SRAM4 → **Cortex-M4** residual FFT. Flash `PeaklogicOptaMcsaM4` with 1.5/0.5 MB split. |
| **edgeAi[]** | Start-time labels on M7; spectral labels from M4 after each ingest |
| **Labels** | `healthy`, `seal_leak`, `clog_ragging`, `impeller_worn`, plus M4 `bearing_wear` / `eccentricity` |
| **Uplink** | Parc telemetry → cloud or via IoT-Link LAN broker |

M7 ST scan is not blocked by FFT. Default **0–1 V DC RMS** CTs: 16-bit ADC, scan 32× oversample, M4 512 Hz / 4 s / 16× burst ingest, residual ripple + modulation (not 60 Hz MCSA). Opta **`/mcsa`** web setup mirrors MCXN947 `deviceType` 0–5 (fan/pump/compressor/turbine/all) plus HVAC env layout. Optional **50 mA CT** uses a **shunt to GND** (`MV_CT_BURDEN_OHM`), not a series resistor. AC line MCSA: `-DMV_CT_WAVEFORM=1` + bias.

### 3.2 Device true MCSA (Nexcomm MCXN947 class)

| Item | Detail |
|------|--------|
| **Template** | `mcxn947_hvac_mcsa`, lift MCSA platforms |
| **Signal** | Real FFT cooked spectra in `mcsa[]` (fund, rotor, bearing bins) |
| **Classification** | Typically on **PeakLogic host** after uplink |
| **Typical site** | C-store RTU, IoT-Link + HaLow/MCSA node |

Signal processing on device; **decision layer** on cloud or IoT-Link runtime.

### 3.2b Device true MCSA + edge classify (Arduino UNO Q)

| Item | Detail |
|------|--------|
| **Code** | `firmware/arduino-uno-q-mcsa/` (MCU sketch + Linux Python) |
| **Template** | `arduino_uno_q_mcsa` |
| **Signal** | Real 2048 Hz / 2048-pt FFT on **A0–A5** (6 CTs) cooked spectra in `mcsa[]` (fund, rotor, bearing, ecc, pump) |
| **Classification** | On Qualcomm MPU (`edgeAi[]`) — start-time labels plus `bearing_wear` / `eccentricity` |
| **Typical site** | Shield-level motor / pump monitor, MQTT direct to cloud or IoT-Link |

MCU (STM32U585) captures AC CT windows; MPU (QRB2210) cooks FFT and publishes Parc. See `docs/projects/UNO-Q-EDGE-MOTOR-FAULT.md`.

### 3.3 Host inference (rules + ONNX)

| Item | Detail |
|------|--------|
| **Code** | `src/inference/hostInference.js`, triggered from `src/parc/mqttCentralHub.js` |
| **Runs where** | Any process hosting the MQTT Parc hub — **cloud :3090** or **IoT-Link :3090** |
| **Storage** | MongoDB `edge_inference_ts` (when logger configured) |

**Backends** (`settings.inference.backend`):

| Backend | Type | Notes |
|---------|------|-------|
| `rule` | Pseudo-AI | Thresholds on MCSA metrics + start context (`ruleClassifier.js`) |
| `onnx` | Real ML | Requires model in `data/models/`; uses `onnxBackend.js` |
| `auto` | Prefer ONNX, fall back to rules | Default path |

**Modes** (`settings.inference.mode`):

| Mode | Behavior |
|------|----------|
| `host-supplement` | Run host **only if device did not send `edgeAi`** — production default |
| `host-override` | Always run host (ignore device edgeAi) |
| `host-on-start` | Host on motor starts when no device edgeAi |
| `off` | No host inference |

### 3.4 PdM failure forecast (always host / cloud)

| Item | Detail |
|------|--------|
| **Code** | `src/pdm/failureForecast.js`, `src/pdm/featureAlign.js` |
| **Type** | **Statistical regression** on historian — not a neural net |
| **Inputs** | SCADA pens (`MOTOR_START_MS`, run amps) + aligned `edge_inference_ts` windows |
| **Methods** | `health_index`, `run_amps_creep`, `start_time_ms`, `starts_analytics` |
| **Output** | RUL estimate, proactive CMMS work orders |

Belongs at **cloud scale** (or IoT-Link with Mongo for isolated sites).

### 3.5 Camera inference (separate path)

| Item | Detail |
|------|--------|
| **Code** | `src/cameras/cameraInference.js` |
| **Runs where** | Edge with camera access (IoT-Link); results uplinked or stored locally |
| **Backends** | HTTP to external service, or stub (dev only) |
| **Storage** | MongoDB `edge_inference_ts`, `camera_events` |

Unrelated to lift MCSA / Parc pump paths.

---

## 4. Recommended placement by scenario

| Scenario | Edge (IoT-Link / Opta) | Cloud |
|----------|------------------------|-------|
| Circle K lift only (Opta) | Opta: pseudo edgeAi + mcsa-lite | Host ONNX + PdM + CMMS |
| UNO Q motor / pump panel | True FFT + on-device edgeAi | Host-supplement (or override ONNX) + PdM |
| C-store full (HaLow + RTU + lift) | IoT-Link: buses, HaLow hub; optional local host | Fleet PdM, historian, operators |
| Putnam-style Nexcomm lift | None (cellular MQTT direct) | Cloud ingest + `lift_station_epi` |
| Camera + leak detection | IoT-Link: ONVIF + HaLow peers | Site agent + cloud live view |

**HaLow sensor nodes:** telemetry only → IoT-Link MQTT broker → cloud. No heavy AI on the HaLow MCU.

**Edge AI when appropriate:** motor starts / MCSA at IoT-Link or Opta; **fleet learning, WO policy, and county-scale ops** stay in cloud.

---

## 5. PdM study matrix (6-month lift station eval)

From `docs/testing/LIFT-STATION-6MO-PDM-STUDY-TEST.md` — validates paths in **est-pc** sim:

| Scenario ID | MCSA source | Host path | Early warning |
|-------------|-------------|-----------|---------------|
| `opta-mcsa-regression` | Opta pseudo MCSA | None (PdM regression only) | **Late** (month 6+) |
| `opta-mcsa-onnx` | Opta pseudo MCSA | Host ONNX | **Early** (month 1) |
| `true-mcsa-regression` | True FFT MCSA (sim) | Host rules | **Early** |
| `true-mcsa-onnx` | True FFT MCSA (sim) | Host ONNX | **Early** |

**Production recommendation for cloud lift fleets:** uplink pseudo or true MCSA → **enable host ONNX on cloud :3090** → PdM → proactive CMMS WO.

Default production profile: `inference.hostEnabled: true`, `mode: host-supplement`, `backend: auto` or `onnx`.

---

## 6. What belongs where — quick reference

| Capability | Cloud | IoT-Link | Opta | UNO Q | est-pc PC (dev) |
|------------|:-----:|:--------:|:----:|:-----:|:---------------:|
| Multi-tenant orgs / users | ✓ | — | — | — | eval |
| MQTT Parc fleet ingest | ✓ | uplink | direct | direct | ✓ |
| Modbus / BACnet LAN | — | ✓ | — | — | ✓ |
| HaLow sensor aggregation | — | ✓ | — | — | sim |
| Pseudo MCSA + edgeAi | — | — | ✓ | — | ✓ |
| True FFT MCSA | via device | via device | — | ✓ | sim / `MV_SIM=1` |
| On-device spectral classify | — | — | — | ✓ | sim |
| Host rule / ONNX inference | ✓ | optional | — | — | ✓ |
| PdM failure forecast | ✓ | w/ Mongo | — | — | ✓ |
| Proactive CMMS WO | ✓ | w/ CMMS | — | — | ✓ |
| ONVIF cameras | via agent | ✓ | — | — | ✓ |
| 4-way PdM sim studies | — | — | — | — | ✓ |

---

## 7. est-pc vs production deploy artifacts

| Artifact | Purpose |
|----------|---------|
| `est-pc` repo / MVP Suite PC | Development, training, automated PdM studies, project generation |
| `deploy/cloud/debian/install-saas.sh` | Production **cloud** droplet |
| `deploy/iot-link/install-generic.sh` | Production **IoT-Link** edge image |
| `deploy/cloud/.env.cstore-opta-parc.example` | Cloud runtime env for Opta Parc fleets |
| `deploy/iot-link/.env.generic.example` | Blank IoT-Link appliance |

Do **not** position the Windows MVP Suite PC as the primary field appliance. **IoT-Link** is the concentrated I/O product; **cloud** is the operator and analytics plane.

---

## 8. Related documentation

| Topic | Path |
|-------|------|
| Edge vs cloud parity | `docs/EST_PC_PARITY.md` |
| Cloud operator guide | `docs/CLOUD_USER_GUIDE.md` |
| C-store / Circle K cloud onboarding | `docs/CSTORE_OPTA_PARC_CLOUD.md` |
| Opta direct to cloud | `docs/OPTA_PARC_CLOUD.md` |
| IoT-Link install | `deploy/iot-link/README-generic.md` |
| C-store HaLow + IoT-Link story | `docs/nexcomm/cstore-halow-story.md` |
| Lift PdM study acceptance | `docs/testing/LIFT-STATION-6MO-PDM-STUDY-TEST.md` |
| Host inference settings | `src/settings/inferenceSettings.js` |

---

## 9. Key source files (implementers)

| Concern | Path |
|---------|------|
| Opta pseudo-AI / MCSA-lite | `firmware/.../mv_edge_ai.cpp` |
| Opta M4 true FFT (5 min ingest) | `firmware/.../mv_mcsa_m7.cpp`, `PeaklogicOptaMcsaM4/` |
| UNO Q true FFT + edge classify | `firmware/arduino-uno-q-mcsa/` |
| Host inference orchestration | `src/inference/hostInference.js` |
| Rule classifier (pseudo) | `src/inference/ruleClassifier.js` |
| ONNX backend | `src/inference/onnxBackend.js` |
| Parc hub → host trigger | `src/parc/mqttCentralHub.js` |
| PdM forecast | `src/pdm/failureForecast.js` |
| Feature alignment | `src/pdm/featureAlign.js` |
| Cloud remote uplink | `src/integrations/applianceCloudRelay.js` |
| IoT-Link service | `deploy/iot-link/peaklogic-iot-link-generic.service` |

---

*PeakLogic · AI / Edge / Cloud architecture v1.0*
