# EZ Meter DDS-RGB — facility power quality (Modbus)

Polyphase revenue metering and **basic facility power quality** for mechanical rooms, main service panels, and institutional campuses using **EZ Meter DDS-RGB 2.025** on **RS-485 Modbus RTU**.

**In-app help:** F1 → **EZ Meter DDS-RGB 2.025**  
**RGB firmware:** v1.600 (register map §9.1 control + §9.2 metered values)

---

## Overview

| Layer | PeakLogic artifact | Purpose |
|-------|-------------------|---------|
| Raw Modbus | Template **EZ Meter DDS-RGB 2.025 (full map)** | 50 tags: `DDS_*` energy, V/I/W/Hz/PF/VA, control/status |
| Facility mirrors | Template **EZ Meter — facility PQ derived measurement set** | `MECH_METER_KWH`, `MECH_PQ_VA`… wired to `DDS_*` |
| Computed PQ | ST `logic/ezmeter_facility_pq.st` | kW sum, imbalance %, interval kWh, PQ alarms |
| Campus sync | `settings.assistedLiving.ezMeter` | Thresholds + semantic map on project open |

**Not included:** THD, harmonics, sag/swell event logs — RGB v1.600 has no harmonic registers.

**HaLow:** Use Modbus at the mechanical room edge; HaLow carries MQTT sensor telemetry only (see M14 training).

---

## Two-step apply (recommended)

### Step 1 — Full Modbus map

1. Wire RS-485 A/B to the meter comm port (**9600 8N1**, slave **1** — confirm on meter).
2. **Drivers** → **EZ Meter DDS-RGB 2.025 — polyphase meter (Modbus RTU, full map)**.
3. Set COM port (USB-RS485 / IoT Link) → **Apply device template**.
4. Driver id: `dds_rgb` (one dedicated driver per meter).

Creates **50 holding-register tags** (`DDS_WH_*`, `DDS_V_*`, `DDS_CTL_*`, …).

### Step 2 — Derived measurement set

1. With `dds_rgb` driver and `DDS_V_A` / `DDS_WH_SUM_IMP` present, select **EZ Meter — facility PQ derived measurement set**.
2. **Apply device template** (do not replace `DDS_*` tags).
3. Sets active program **`logic/ezmeter_facility_pq.st`** and enables **`assistedLiving.ezMeter`** in settings.

Adds **~35 facility tags**:

- **12 mirrors** — same Modbus address as source `DDS_*` (`MECH_METER_KWH`, `MECH_PQ_VA`, …)
- **23 memory tags** — filled by ST (`MECH_PQ_KW_SUM`, `MECH_PQ_ALM`, `MECH_PQ_CFG_*`, …)

4. **Program → Validate → Start** runtime.

**Replace tags** on step 2 rebuilds only the derived set (mirrors + memory), not the Modbus map.

---

## Register map summary

| HR range | Tags | Notes |
|----------|------|-------|
| 40001–40023 | `DDS_WH_*`, `DDS_VAH_*` | 32-bit acc. Wh/VAh (×10) |
| 40025–40047 | `DDS_V_*`, `DDS_I_*`, `DDS_W_*`, `DDS_HZ_*`, `DDS_PF_*`, `DDS_VA_*` | Live per-phase (×0.1 V/A/W/Hz, ×0.01 PF) |
| 41011–41034 | `DDS_CTL_*` | Read-only: serial, comm, model, customer ID |

Source extract: `st/fixtures/dds-rgb-modbus-extract.txt`  
Code map: `src/facilities/ezmeterRegisterMap.js`

---

## PQ alarms (ST)

Program: `st/logic/ezmeter_facility_pq.st`

| Alarm tag | Condition (default thresholds) |
|-----------|--------------------------------|
| `MECH_PQ_UNDERVOLT` | Any phase V &lt; 108 V (120 V service) |
| `MECH_PQ_OVERVOLT` | Any phase V &gt; 132 V |
| `MECH_PQ_PHASE_LOSS` | One phase &lt; 10 V while others live |
| `MECH_PQ_V_IMBAL` | Imbalance &gt; 5% |
| `MECH_PQ_LOW_PF` | System PF low under load (&gt; 1 A total) |
| `MECH_PQ_FREQ_FAULT` | Frequency outside 59.5–60.5 Hz |
| `MECH_PQ_ALM` | Any PQ alarm active |

Thresholds are memory tags `MECH_PQ_CFG_*` (defaults from `settings.assistedLiving.ezMeter` on sync).

`MECH_PQ_ALM` asserts **`ALF_MECH_ALM`** (OR — does not clear other mechanical alarms).

---

## Assisted living / campus

Default site meter in ALF demos is **NextCentury API** (`MECH_METER_KWH` → cloud). For on-prem **EZ Meter** at main service:

```json
"assistedLiving": {
  "facility": { "driver": "ezmeter" },
  "ezMeter": {
    "enabled": true,
    "driverId": "dds_rgb",
    "nominalVoltage": 120,
    "undervoltV": 108,
    "overvoltV": 132,
    "lowPf": 0.85,
    "freqMinHz": 59.5,
    "freqMaxHz": 60.5,
    "vImbalancePct": 5,
    "loadedCurrentA": 1
  }
}
```

Semantic map: `scripts/assisted-living/ezmeter-map.js`  
Sync on project load: `src/settings/assistedLivingSettings.js` → `syncEzMeterSemanticTags`

Mechanical HMI bindings (`MECH_METER_KWH`, `MECH_METER_INTERVAL_KWH`) work with either NextCentury or EZ Meter.

---

## Standalone PQ project

Generate import-ready `.est`:

```powershell
node scripts/facilities/generate-ezmeter-pq-est.js
```

Output: `st/fixtures/projects.ezmeter-facility-pq.json`

---

## Historian / CMMS

- Enable **Hist** on `DDS_V_*`, `DDS_PF_*`, `MECH_PQ_KW_SUM`, `MECH_PQ_V_IMBAL_PCT` for trend review after utility events.
- PQ alarms with `alarmsEnabled` can auto-create CMMS work orders when alarm auto-WO is enabled (`docs/CMMS_APPLIANCE.md`).

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Derived apply fails “Missing tag” | Apply **full map** template first |
| Derived apply fails “Driver not found” | `dds_rgb` driver row exists |
| Flat `MECH_PQ_*` memory tags | ST program running; `DDS_*` tags live |
| Flat `MECH_PQ_VA` mirrors | Semantic wiring; source `DDS_V_A` updating |
| Modbus timeout | COM port, 9600 8N1, slave ID, A/B wiring — F1 Serial port troubleshooting |

---

## Related files

| Path | Role |
|------|------|
| `src/facilities/ezmeterRegisterMap.js` | Modbus register definitions |
| `src/facilities/ezmeterPq.js` | PQ tags, presets, campus sync |
| `src/devices/applyDerivedPreset.js` | Derived measurement set apply |
| `st/logic/ezmeter_facility_pq.st` | PQ computation + alarms |
| `test/ezmeterPq.test.js` | Unit tests |
