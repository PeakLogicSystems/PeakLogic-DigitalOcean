<div class="title-page">

<div class="brand">Moore<span>VIEW</span></div>

# Lift Station PdM — Training Data & Setup Review

**Pump condition monitoring · setup criteria · proposed PdM extensions**

| | |
|---|---|
| **Document ID** | MV-PDM-LS-0.1 |
| **Status** | **Implemented — v0.2** |
| **Scope** | Setup schema, location profiles, lifecycle metadata, PdM extensions, logger popup UI |
| **Seed range** | 30–360 days via **Demo seed days** + **Seed demo data** |
| **Generated** | Run `npm run build:lift-station-pdm-review-pdf` for build date |

</div>

<div class="page-break"></div>

## 1. Purpose

This document captures the **design review and implementation reference** for lift-station PdM training data. It defines:

1. **Setup criteria** PeakLogic stores for each lift station (pull-down float ladder, simplex / duplex / triplex, location class, pump age, install/repair history).
2. **Implemented PdM extensions** — motor asset setup, 30–360 day sim, feature batch, failure forecast, **proactive CMMS PM work orders**.
3. **Training data path** — **Seed demo data** builds Mongo historian + edge + `pdm_features` for the full seed range.

**Operating principle:** **Proactive, not reactive** — PdM forecast triggers CMMS PM before failure, not after high-level alarm.

See also [PDM_PROACTIVE_CMMS.md](./PDM_PROACTIVE_CMMS.md).

---

## 2. Summary of prior discussion

PeakLogic PdM today combines:

| Layer | Source | Role |
|-------|--------|------|
| SCADA historian | Mongo `pen_sample` | Run hours, starts, CT amps, levels |
| Edge inference | Mongo `edge_inference` | Per-start signature, anomaly score, label |
| Feature windows | `pdm_features` (default 5 min) | Aggregated stats → **health index** |
| Forecast | `failureForecast.js` | RUL from health trend + optional start-time trend |

Existing demo path: **Simulate motor start / cap failure** (`motorStartSim.js`, model `single-phase-start-v1`) — 90–180 days of degrading start times.

For **lift-station submersible pumps** (e.g. Pump 2 in a duplex alternator), training data must reflect:

| Criterion | Why it matters |
|-----------|----------------|
| **Pump age factor** | Scales wear rate; same CT signature ≠ same RUL on old vs new pump |
| **Pump starts** | Cycle fatigue, electrical inrush events |
| **Pump runtime** | Continuous load, seal heat, impeller erosion |
| **Application: lift station** | Float ladder, alternator, fail-to-run, FOG/solids |
| **Location class** | Load pattern and contaminant prior (mall vs school vs restaurant) |

Duplex **lag pump** (Pump 2) has fewer starts but often longer runs when `LVL_LAG` / `LVL_HIGH` demand both pumps — it must be modeled as a **separate PdM asset**, not merged with Pump 1.

---

## 3. Lift station physical model (pull-down)

### 3.1 Float ladder — pump-down (pull-down)

PeakLogic duplex logic uses cumulative floats (liquid **at or above** float = ON):

| Float | Tag (duplex) | Meaning |
|-------|--------------|---------|
| Off / stop | `LVL_OFF` | Wet well drained — pumps off |
| Lead | `LVL_LEAD` | First demand — lead pump runs |
| Lag | `LVL_LAG` | Second demand — lead + lag |
| High alarm | `LVL_HIGH` | Critical level — all online pumps + alarm |

**Pull-down behavior:** As level falls, floats drop in reverse order (high → lag → lead → off). Training data should include level-driven **start/stop edges**, not random Poisson starts.

### 3.2 Pump configurations

| Config | Pumps | PeakLogic program (reference) | Alternator | Typical use |
|--------|-------|------------------------------|------------|-------------|
| **Simplex** | 1 | `logic/lift_simplex` / single-pump ST | N/A | Small tenant, low flow |
| **Duplex** | 2 | `logic/36_duplex_lift_station.st` / `37_duplex_lift_station_parc_st.st` | `ALT2` lead/lag | Mall, restaurant, ALF |
| **Triplex** | 3 | `logic/28_alternator_triplex.st` / triplex fixtures | `ALT3` / `ALT4` | School campus, large strip center |

Per-pump SCADA tags (duplex example — extend numbering for triplex):

| Field | Pump 1 | Pump 2 | Pump 3 (triplex) |
|-------|--------|--------|------------------|
| Run hours | `MOTOR1_HRS` | `MOTOR2_HRS` | `MOTOR3_HRS` |
| Start count | `MOTOR1_STARTS` | `MOTOR2_STARTS` | `MOTOR3_STARTS` |
| CT phase A | `I1_RAW` / `AI1` | `I4_RAW` / `AI4` | per I/O map |
| Run feedback | `P1_RUN_FB` | `P2_RUN_FB` | `P3_RUN_FB` |
| Alternator role | lead/lag rotate | lead/lag rotate | lead/lag/lag2 |

---

## 4. Location variation profiles

Each site gets a **location class** that drives simulation priors and PdM context metadata. Values are starting points for review — field calibration can adjust.

| Class | ID | Peak flow pattern | FOG / solids index (0–1) | Rain sensitivity | Notes |
|-------|-----|-------------------|--------------------------|------------------|-------|
| Strip mall | `strip_mall` | Business hours + dining eve | 0.55 | High (large roof) | Multiple restaurants, shared interceptor |
| School | `school` | Class hours; low summer | 0.25 | Medium | Seasonal idle; duplex common |
| Assisted living (ALF) | `alf` | Steady 24/7; meal peaks | 0.40 | Medium | Consistent load; reliability critical |
| Convenience store | `convenience_store` | Moderate; spikes from restrooms | 0.35 | Low–medium | Often simplex; grease from food prep |
| Standalone restaurant | `restaurant` | Lunch + dinner peaks | 0.75 | Medium | Highest FOG; ragging/clog risk |

**Derived simulation parameters (review defaults):**

| Parameter | strip_mall | school | alf | convenience_store | restaurant |
|-----------|------------|--------|-----|-------------------|------------|
| Base starts/day (lead pump) | 22 | 14 | 18 | 10 | 26 |
| Base starts/day (lag pump) | 10 | 6 | 8 | — | 12 |
| Avg run length (min) | 6–12 | 8–15 | 10–18 | 5–10 | 4–10 |
| Material load multiplier | 1.25 | 0.85 | 1.05 | 1.00 | 1.45 |
| Weekend factor | 0.85 | 0.15 | 1.0 | 1.0 | 1.1 |

---

## 5. Pump age and lifecycle

### 5.1 Age factor

Age is metadata + counter initialization, not a live sensor.

```
ageYears = (referenceDate − installDate) / 365.25
ageFactor = 1 + 0.04 × max(0, ageYears − 3)
```

| Age band | Years | ageFactor (approx) | Training use |
|----------|-------|-------------------|--------------|
| New | 0–3 | 1.00 | Baseline signatures |
| Mid-life | 4–8 | 1.04–1.20 | Normal wear slopes |
| Aged | 9–14 | 1.24–1.44 | Accelerated degradation |
| End of life | 15+ | 1.48+ | Pre-failure scenarios |

**Equivalent age (optional):** `ageEqHours = MOTORx_HRS + 0.02 × MOTORx_STARTS` — useful when install date unknown.

### 5.2 Installation and repair history

Each pump maintains a **service timeline**. Repairs reset or partially reset specific failure modes but do not always reset age.

| Event type | ID | Effect on metadata |
|------------|-----|-------------------|
| Original install | `install` | Sets `installDate`; baseline counters optional |
| Pump replacement | `pump_replacement` | New `installDate` for that pump asset; reset `MOTORx_HRS` / `MOTORx_STARTS` in field |
| Seal repair | `seal_service` | Resets seal-wear contribution; age factor unchanged |
| Impeller / wear ring | `impeller_service` | Resets hydraulic wear; may improve run amps |
| Motor / starter | `motor_or_starter` | Resets electrical start signature baseline |
| Cable / splice | `cable_repair` | Resets phase imbalance baseline |
| Clog / jetting | `clog_clearing` | Operational event; not a hardware refresh |

**Review rule:** PdM context uses **effective install date** = date of last `pump_replacement`, else original `install`.

---

## 6. Proposed setup data schema (for review)

Stored per site in project data (proposed file: `data/lift-stations.json` or embedded in project `.est` archive). PdM reads **asset context** at feature-build time.

### 6.1 Site record

```json
{
  "siteId": "ls-strip-mall-01",
  "name": "Westfield Lift Station #1",
  "configuration": "duplex",
  "floatLadder": "pull_down",
  "locationClass": "strip_mall",
  "coordinates": { "lat": 28.05, "lng": -82.45 },
  "commissionedDate": "2024-03-15",
  "notes": "Shared grease interceptor; 4 restaurant tenants",
  "pumps": ["pump-1", "pump-2"]
}
```

### 6.2 Pump asset record

```json
{
  "assetId": "pump-2",
  "siteId": "ls-strip-mall-01",
  "pumpIndex": 2,
  "role": "lag",
  "configuration": "duplex",
  "locationClass": "strip_mall",
  "installDate": "2017-06-01",
  "manufacturer": "Example Submersible Co",
  "model": "4DF-15",
  "hp": 5,
  "scadaTags": {
    "runHours": "MOTOR2_HRS",
    "starts": "MOTOR2_STARTS",
    "runFeedback": "P2_RUN_FB",
    "ctPhaseA": "I4_RAW",
    "ctPhaseB": "I5_RAW",
    "ctPhaseC": "I6_RAW"
  },
  "pdm": {
    "modelId": "lift-submersible-v2",
    "enabled": true
  },
  "serviceHistory": [
    {
      "date": "2017-06-01",
      "type": "install",
      "vendor": "ABC Plumbing",
      "notes": "Original duplex install"
    },
    {
      "date": "2022-11-08",
      "type": "seal_service",
      "vendor": "ABC Plumbing",
      "notes": "Upper seal replaced; wet well cleaned"
    },
    {
      "date": "2025-04-02",
      "type": "clog_clearing",
      "vendor": "Jetting Services",
      "notes": "FOG slug after interceptor bypass"
    }
  ]
}
```

### 6.3 Computed context (written to edge inference / feature docs)

At build or simulate time:

```json
{
  "context": {
    "siteId": "ls-strip-mall-01",
    "assetId": "pump-2",
    "configuration": "duplex",
    "pumpIndex": 2,
    "pumpRole": "lag",
    "locationClass": "strip_mall",
    "application": "lift_station",
    "floatLadder": "pull_down",
    "installDate": "2017-06-01",
    "effectiveInstallDate": "2017-06-01",
    "pumpAgeYears": 8.2,
    "ageFactor": 1.21,
    "lastServiceType": "clog_clearing",
    "lastServiceDate": "2025-04-02",
    "materialProfile": {
      "fogIndex": 0.55,
      "regime": "fog_heavy"
    }
  }
}
```

### 6.4 Configuration tag map (PdM asset → SCADA)

**Simplex**

```json
{
  "pump-1": ["MOTOR1_HRS", "MOTOR1_STARTS", "I1_RAW", "I2_RAW", "I3_RAW", "LVL_LEAD", "LVL_HIGH"]
}
```

**Duplex**

```json
{
  "pump-1": ["MOTOR1_HRS", "MOTOR1_STARTS", "I1_RAW", "I2_RAW", "I3_RAW", "P1_RUN_FB"],
  "pump-2": ["MOTOR2_HRS", "MOTOR2_STARTS", "I4_RAW", "I5_RAW", "I6_RAW", "P2_RUN_FB"]
}
```

**Triplex**

```json
{
  "pump-1": ["MOTOR1_HRS", "MOTOR1_STARTS", "I1_RAW", "I2_RAW", "I3_RAW"],
  "pump-2": ["MOTOR2_HRS", "MOTOR2_STARTS", "I4_RAW", "I5_RAW", "I6_RAW"],
  "pump-3": ["MOTOR3_HRS", "MOTOR3_STARTS", "I7_RAW", "I8_RAW", "I9_RAW"]
}
```

*(Exact CT tag names follow project I/O map — Parc ST duplex uses `I1_RAW`–`I6_RAW`.)*

---

## 7. Proposed PdM changes (review only — not implemented)

### 7.1 Settings extension (`settings.json` → `pdm`)

Current shape (`pdmSettings.js`):

```json
{
  "assetTags": { "motor-202": ["MOTOR_START_MS", "MOTOR_CURRENT"] },
  "windowMin": 5,
  "featuresCollection": "pdm_features",
  "failureThreshold": 0.3,
  "buildEnabled": false,
  "buildIntervalHours": 24
}
```

**Proposed additions:**

| Field | Type | Purpose |
|-------|------|---------|
| `assetContext` | `{ [assetId]: LiftPumpContext }` | Static setup: location, config, install date, role |
| `siteRegistryPath` | string | Optional path to `lift-stations.json` |
| `liftModelId` | string | Default edge model id (`lift-submersible-v2`) |
| `forecastMethods` | string[] | Enable `health_index`, `run_amps_creep`, `start_time_ms` |

### 7.2 New modules (planned)

| Module | Responsibility |
|--------|----------------|
| `src/pdm/liftStationSetup.js` | Load/validate site + pump records; compute `ageFactor`, effective install |
| `src/pdm/liftPumpContext.js` | Merge setup + live counters into context blob |
| `src/pdm/liftPumpSim.js` | 180-day generator: pull-down cycles, location profile, degradation |
| `src/pdm/liftForecast.js` | Extend `failureForecast` for run-amp creep + clog labels |

### 7.3 API routes (planned)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/pdm/lift-setup` | List sites / pumps |
| PUT | `/pdm/lift-setup` | Save site or pump record + service history |
| POST | `/pdm/sim/lift-pump` | Seed Mongo with simulated 180-day sample |
| GET | `/pdm/context/:assetId` | Resolved context for an asset (review/debug) |

### 7.4 Feature alignment changes

`featureAlign.js` — attach `context` and per-window derived metrics:

- `deltaRunHours`, `startsInWindow`, `avgRunAmps`, `dutyCycle`
- Copy from `assetContext` at build time

### 7.5 UI (planned, post-approval)

- **Historian → PdM → Lift station setup** tab: site form, pump table, service history editor
- Location class dropdown; configuration simplex/duplex/triplex
- Install date + repair log with type picker
- **Simulate lift pump (180d)** button (disabled until schema approved)

### 7.6 Mongo collections (unchanged names)

| Collection | Addition |
|------------|----------|
| `pen_sample` | No schema change |
| `edge_inference` | Optional top-level `context` object |
| `pdm_features` | Optional `context` + `derived` per window |

---

## 8. Training data plan (implemented)

| Deliverable | Status |
|-------------|--------|
| Motor asset setup (`motorAssetSetup.js`) | **Done** — pump/fan/compressor, location profiles, service history |
| Demo seed sim (`motorAssetSim.js`, `POST /pdm/sim/asset`) | **Done** — 30–360 days |
| Feature batch + forecast | **Done** — `pdmBatchScheduler`, `failureForecast.js` |
| Proactive CMMS PM WO | **Done** — `pdmCmmsBridge.js` on warning/critical |
| Service history on WO complete | **Done** — `appendServiceHistoryFromWorkOrder` |
| PdM PDF + scheduled reports | **Done** — `pdmReportService.js` |
| Lift-station bundled project | **Done** — duplex-lift-station `.est.zip` with `pump-1` / `pump-2` |

**Lab path:** Historian → Logger config… → PdM → configure `pump-2` (lag) → **Seed demo data** → **Run proactive CMMS check** → open `/cmms`.

---

## 9. Review checklist

Use this section in the review meeting. Mark `[ ]` open · `[x]` approved · `[~]` revise.

### 9.1 Setup schema

- [ ] Site record fields (`siteId`, `configuration`, `locationClass`, `floatLadder`)
- [ ] Pump record fields (`installDate`, `role`, `scadaTags`, `serviceHistory`)
- [ ] Service event types (`install`, `pump_replacement`, `seal_service`, …)
- [ ] Effective install date rule after pump replacement
- [ ] Age factor formula (`1 + 0.04 × max(0, age − 3)`)

### 9.2 Location profiles

- [ ] Five classes: strip_mall, school, alf, convenience_store, restaurant
- [ ] Default starts/day and FOG index table (Section 4)
- [ ] Material regime labels for edge inference context

### 9.3 Configuration coverage

- [ ] Simplex tag map
- [ ] Duplex tag map (Pump 1 lead / Pump 2 lag)
- [ ] Triplex tag map
- [ ] Pull-down float ladder reflected in sim (not random starts)

### 9.4 PdM code scope

- [x] `assetContext` in `settings.json` (`pdm.assetContext`)
- [x] `/pdm/setup`, `/pdm/sim/asset`, `/pdm/proactive/run` routes
- [x] `lift-submersible-v2` model id and failure mode labels
- [x] Extended failure forecast (run amps + health index + start time)
- [x] UI in Historian → Logger config… → PdM
- [x] Proactive CMMS bridge (`source: pdm`)

### 9.5 Out of scope / future

- [ ] Production edge firmware model deployment on device
- [ ] External TPS CMMS auto-rules (integrated `/cmms` only)
- [ ] ML export pipeline beyond PdM CSV/PDF

---

## 10. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Product / domain | | | |
| PdM / data | | | |
| Engineering | | | |

**Next step:** Use training modules M10/M11 and `docs/pdm/PDM_PROACTIVE_CMMS.md` for classroom labs. Regenerate PDF: `npm run build:lift-station-pdm-review-pdf`.

---

## Appendix A — Failure mode labels (proposed)

| Label | Typical signature | Location sensitivity |
|-------|-------------------|---------------------|
| `healthy` | Stable run amps, normal starts | All |
| `impeller_worn` | Run amp creep 10–25% over months | All; faster with grit |
| `seal_leak` | Longer starts, thermal drift | Aged pumps |
| `clog_ragging` | Short cycles, restart bursts | restaurant, strip_mall |
| `bearing_wear` | Current ripple (if modeled) | Aged, high runtime |
| `phase_imbalance` | CT spread on I4–I6 | cable_repair resets |

## Appendix B — Reference: existing PdM demo

| Item | Value |
|------|-------|
| Sim endpoint | `POST /pdm/sim/asset` (lift/pump/fan/compressor) or `POST /pdm/sim/motor` (legacy start-time demo) |
| Model | `lift-submersible-v2` (pump) or `single-phase-start-v1` (motor lab) |
| Assets | `pump-1`, `pump-2`, or custom asset id |
| Max days | 360 |
| Proactive CMMS | Auto PM WO when forecast warning/critical — see PDM_PROACTIVE_CMMS.md |

Lift-station sim uses pull-down level logic, location profiles, and service-history-aware age factor.
