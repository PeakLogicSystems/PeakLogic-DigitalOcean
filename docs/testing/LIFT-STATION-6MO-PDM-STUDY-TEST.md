<div class="title-page">

<div class="brand">Moore<span>VIEW</span></div>

# Lift Station 6-Month PdM Study

**Test plan · acceptance criteria · results**


| | |
|---|---|
| **Document ID** | MV-LS6MO-PDM-1.0 |
| **Product** | PeakLogic MVP Suite (est-pc) |
| **Study run** | `ls-6mo-4way-2026-07-25T12-33-53` |
| **Generated** | 2026-07-26T08:39:09.941Z |

</div>

<div class="page-break"></div>

## 1. Purpose

This document validates the **duplex lift station 6-month predictive maintenance (PdM) study** across four MCSA / inference scenarios. It records **test criteria**, **automated checks**, and **observed results** from the simulated restaurant duplex lift station (180 days, 8 PdM assets, CMMS auto work orders).


## 2. Scenario matrix (acceptance design)


| ID | Title | MCSA source | Host path | Expected early warning |
|----|-------|-------------|-----------|------------------------|
| `opta-mcsa-regression` | Opta pseudo MCSA uplink — PdM regression only | Opta pseudo MCSA | None (PdM regression only) | Late (month 6+) |
| `opta-mcsa-onnx` | Opta pseudo MCSA — host ONNX | Opta pseudo MCSA | Host onnx | Early (month 1) |
| `true-mcsa-regression` | True MCSA (FFT sim) — host rules | True FFT MCSA (sim) | Host rule | Early (month 1) |
| `true-mcsa-onnx` | True MCSA (FFT sim) — host ONNX | True FFT MCSA (sim) | Host onnx | Early (month 1) |

## 3. Automated unit tests


Run before or after the study:


```text
cd est-pc
node --test test/liftStationStudy.test.js test/hostInference.test.js
```

| Suite | Criterion | Result |
|-------|-----------|--------|
| `liftStationStudy.test.js` | Four scenario IDs match design matrix | **PASS** |
| `liftStationStudy.test.js` | Regression scenario produces zero edge docs in sim | **PASS** |
| `liftStationStudy.test.js` | Production early-warning profile (host supplement + CMMS) | **PASS** |
| `hostInference.test.js` | MCSA feature vector, registry, host orchestration | **PASS** |
| **Summary** | 14 passed · 0 failed (exit 0) | **PASS** |

### 3.1 Unit test definitions


| Test | Pass criterion |
|------|----------------|
| Scenario matrix | `STUDY_SCENARIOS` = opta-mcsa-regression, opta-mcsa-onnx, true-mcsa-regression, true-mcsa-onnx with hostInference false / onnx / rule / onnx |
| Asset registration | 8 study assets + live `pump-1` / `pump-2`; all three PdM forecast methods enabled |
| Production profile | `inference.hostEnabled`, `mode: host-supplement`, `cmms.autoWorkOrdersFromPdm` |
| True MCSA sim | FFT channels include bearing and eccentricity metadata |
| Regression sim | `edgeDocs.length === 0` with >50 start events over 90-day sample |
| MCSA features | 64-dim vector from Opta lite telemetry fixture |
| Host inference | Supplement skips when device `edgeAi` present; runs for HVAC without edge |

## 4. Integration study criteria


| # | Criterion | Target |
|---|-----------|--------|
| I1 | Simulated duration | 180 days |
| I2 | Registered PdM assets | 8 (`pump-{1,2}-{scenario}`) |
| I3 | MCSA uplink reports per scenario | ~7,400 (all motor starts) |
| I4 | Pen historian samples per scenario | ~45,120 |
| I5 | Total proactive CMMS work orders | 8 (2 per scenario) |
| I6 | WO source | `pdm` with urgent priority |
| I7 | Regression-only path | Latest WO month (≥6) vs inference paths (≤1) |
| I8 | PdM failure threshold | 0.35 health index |
| I9 | Forecast methods stacked | health_index, run_amps_creep, start_time_ms (shortest RUL wins) |
| I10 | ONNX model | `data/models/lift-submersible-v3.onnx` |

## 5. Study results by scenario


### Opta pseudo MCSA uplink — PdM regression only (`opta-mcsa-regression`)


| Metric | Value |
|--------|-------|
| MCSA uplink reports | 7400 |
| Host / edge inferences | 0 |
| Pen samples | 45120 |
| Proactive work orders | 2 |
| First alert month | 6 |

| WO | Asset | Priority | First alert month |
|----|-------|----------|-------------------|
| WO-0019 | pump-2-opta-mcsa-regression | urgent | 6 |
| WO-0018 | pump-1-opta-mcsa-regression | urgent | 6 |

| Acceptance check | Result |
|------------------|--------|
| No host inference docs written (regression-only path) | **PASS** |
| MCSA uplink reports generated (lite mode) | **PASS** |
| Exactly 2 proactive CMMS work orders (lead + lag pump) | **PASS** |
| First proactive WO issued in month 6 or later (SCADA/regression lag) | **PASS** |

**Final forecasts (end of study):**


| Asset | Severity | Health | Headline |
|-------|----------|--------|----------|
| pump-1-opta-mcsa-regression | failed | — | pump-1-opta-mcsa-regression: At or past predicted run amp creep / impeller load — service now |
| pump-2-opta-mcsa-regression | failed | — | pump-2-opta-mcsa-regression: At or past predicted run amp creep / impeller load — service now |

### Opta pseudo MCSA — host ONNX (`opta-mcsa-onnx`)


| Metric | Value |
|--------|-------|
| MCSA uplink reports | 7400 |
| Host / edge inferences | 7400 |
| Pen samples | 45120 |
| Proactive work orders | 2 |
| First alert month | 1 |

| WO | Asset | Priority | First alert month |
|----|-------|----------|-------------------|
| WO-0021 | pump-2-opta-mcsa-onnx | urgent | 1 |
| WO-0020 | pump-1-opta-mcsa-onnx | urgent | 1 |

| Acceptance check | Result |
|------------------|--------|
| Host inference runs on every motor start (onnx) | **PASS** |
| MCSA uplink reports generated (lite mode) | **PASS** |
| Exactly 2 proactive CMMS work orders (lead + lag pump) | **PASS** |
| First proactive WO issued by month 1 (inference early warning) | **PASS** |

**Final forecasts (end of study):**


| Asset | Severity | Health | Headline |
|-------|----------|--------|----------|
| pump-1-opta-mcsa-onnx | failed | 0.12 | pump-1-opta-mcsa-onnx: At or past predicted health threshold breach — service now |
| pump-2-opta-mcsa-onnx | failed | 0.12 | pump-2-opta-mcsa-onnx: At or past predicted health threshold breach — service now |

### True MCSA (FFT sim) — host rules (`true-mcsa-regression`)


| Metric | Value |
|--------|-------|
| MCSA uplink reports | 7400 |
| Host / edge inferences | 7400 |
| Pen samples | 45120 |
| Proactive work orders | 2 |
| First alert month | 1 |

| WO | Asset | Priority | First alert month |
|----|-------|----------|-------------------|
| WO-0023 | pump-2-true-mcsa-regression | urgent | 1 |
| WO-0022 | pump-1-true-mcsa-regression | urgent | 1 |

| Acceptance check | Result |
|------------------|--------|
| Host inference runs on every motor start (rule) | **PASS** |
| MCSA uplink reports generated (fft mode) | **PASS** |
| Exactly 2 proactive CMMS work orders (lead + lag pump) | **PASS** |
| First proactive WO issued by month 1 (inference early warning) | **PASS** |

**Final forecasts (end of study):**


| Asset | Severity | Health | Headline |
|-------|----------|--------|----------|
| pump-1-true-mcsa-regression | failed | 0.12 | pump-1-true-mcsa-regression: At or past predicted health threshold breach — service now |
| pump-2-true-mcsa-regression | failed | 0.12 | pump-2-true-mcsa-regression: At or past predicted health threshold breach — service now |

### True MCSA (FFT sim) — host ONNX (`true-mcsa-onnx`)


| Metric | Value |
|--------|-------|
| MCSA uplink reports | 7400 |
| Host / edge inferences | 7400 |
| Pen samples | 45120 |
| Proactive work orders | 2 |
| First alert month | 1 |

| WO | Asset | Priority | First alert month |
|----|-------|----------|-------------------|
| WO-0025 | pump-2-true-mcsa-onnx | urgent | 1 |
| WO-0024 | pump-1-true-mcsa-onnx | urgent | 1 |

| Acceptance check | Result |
|------------------|--------|
| Host inference runs on every motor start (onnx) | **PASS** |
| MCSA uplink reports generated (fft mode) | **PASS** |
| Exactly 2 proactive CMMS work orders (lead + lag pump) | **PASS** |
| First proactive WO issued by month 1 (inference early warning) | **PASS** |

**Final forecasts (end of study):**


| Asset | Severity | Health | Headline |
|-------|----------|--------|----------|
| pump-1-true-mcsa-onnx | failed | 0.12 | pump-1-true-mcsa-onnx: At or past predicted health threshold breach — service now |
| pump-2-true-mcsa-onnx | failed | 0.12 | pump-2-true-mcsa-onnx: At or past predicted health threshold breach — service now |

<div class="page-break"></div>

## 6. Cross-scenario comparison


| Scenario | First WO month | Edge inferences | Forecast driver (regression path) |
|----------|----------------|-----------------|-----------------------------------|
| opta-mcsa-regression | 6 | 0 | run_amps_creep (no health index from inference) |
| opta-mcsa-onnx | 1 | 7400 | health_index (inference-fed) |
| true-mcsa-regression | 1 | 7400 | health_index (inference-fed) |
| true-mcsa-onnx | 1 | 7400 | health_index (inference-fed) |

**Early-warning delta (Opta pseudo MCSA):** regression-only detected failure **5 simulated month(s)** later than host ONNX (6 vs 1).


## 7. Overall verdict


| Gate | Result |
|------|--------|
| Automated unit tests | **PASS** |
| All scenario acceptance checks (16) | **PASS** |
| Total proactive WOs = 8 | **PASS** (8) |
| **Release recommendation** | **PASS** |

## 8. Manual verification in PeakLogic UI


After loading study settings:


1. **Historian → Logger config → PdM** — confirm 8 assets (`pump-1-*` / `pump-2-*`).
2. **CMMS** (`/cmms`) — filter **source: pdm** — verify WO-0018 through WO-0025 (or current run).
3. **Per-scenario PDFs** — open `PdM_{scenario}_pump-*.pdf` under each scenario folder in the study output directory.
4. **Production profile** — review `data/pdm-production-early-warning.json`; apply with `npm run pdm:production-profile`.

## 9. Reproduce


```text
cd est-pc
py -3 scripts/gen-lift-study-onnx.py          # if model missing
npm run study:ls-6mo                          # ~30 min, requires MongoDB
npm run build:ls-6mo-study-test-pdf           # this document
```

Study artifacts: `C:/Users/Public/data/est-pc/data/sim-studies/ls-6mo-4way-2026-07-25T12-33-53`


## 10. Sign-off


| Role | Name | Date | Signature |
|------|------|------|-----------|
| Test engineer | | | |
| PdM / reliability | | | |
| Product owner | | | |
