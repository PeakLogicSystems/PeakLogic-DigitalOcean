# Product Requirements Document (PRD)

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** vision-document.md

## 1. Scope

This PRD describes what the product **already does**, organized as requirements, because it was written after the fact from a working implementation rather than before one. Treat each section as "the product shall continue to do X" plus, where noted, "and does not yet do Y."

## 2. Functional areas (derived from `src/` top-level subdirectories and `views/`)

| Area | Source | What it does |
|------|--------|---------------|
| ST programming & runtime | `src/engine/`, `src/programs/`, `st/` | Structured Text program authoring and a scan-cycle runtime engine, PLC-style |
| Tags & live data | `src/tags/`, `src/db/` | Central tag store; live values feed HMI, alarms, historian |
| Alarms | `src/alarms/` | Alarm evaluation, annunciation, notification profiles per user |
| HMI / Studio | `views/dashboard.ejs`, `src/hmi/`, `public/js/hmi.js`, `hmiSetupUi.js` | Visual screen composer with a tile-grid editor, live bindings, symbol library (3,400+ SVGs referenced in dashboard copy) |
| Facility Builder | `src/facilities/`, `public/js/facilityDrawApp.js`, `views/facility-draw.ejs`, `scripts/facility-draw/` | Site/floor-plan CAD-like editor with a generated 3D spatial preview (`facilitydraw-3d-html.js`) — see `facility-builder-hmi-composer.md` |
| Historian | `src/graph/`, "historian" popups in `dashboard.ejs` | Trend/graph storage and retrieval, Mongo-backed |
| CMMS | `src/cmms/` | Work orders, PM (preventive maintenance) schedules, alarm-driven work order creation |
| PdM | `src/pdm/` | Predictive maintenance — nightly feature extraction, forecasts that feed the CMMS bridge (`docs/ARCHITECTURE.md`'s "Proactive CMMS bridge") |
| Device drivers | `src/drivers/` | BACnet, Modbus, MQTT, and vendor-specific integrations (NextCentury submeter driver family — `nextcenturyDriver.js`, `nextcenturyTagSync.js`, etc.) |
| Cameras | `src/cameras/`, `public/js/cameraAdminUi.js`, `public/js/hmi.js`'s `openCameraPopup`/`closeCameraPopup` | ONVIF discovery, go2rtc live streaming, HMI-embedded live-view popup (fixed this session — see CHANGELOG) |
| Fleet / connectivity | `src/fleet/`, `src/cellular/`, `src/cloud/` | Cloud sim device management, cellular/eSIM inventory (Hologram/Twilio vendor adapters), MQTT "Parc" fleet |
| Multi-tenant admin | `src/tenants/`, `src/routes/adminWeb.js` | Platform "Control Center" — tenant creation, CMMS entitlement toggling, and (new this session) direct drill-down into a tenant's live portal |
| Reporting | `src/reports/`, PDF export (`pdfkit` dependency) | Tabular/report export, CMMS templates referenced in UI copy |

## 3. Cross-cutting requirements

- **REQ-1 (dual deployment):** every feature above must function correctly under both `PEAKLOGIC_DEPLOYMENT=appliance` and `=cloud` without a separate code path unless a documented reason exists (see `multi-tenant-deployment-modes.md`). Violation found and fixed this session: appliance mode's `attachSession` was cloud-only gated, making the entire appliance mode unusable — see `security-architecture.md`.
- **REQ-2 (session model):** every authenticated surface uses the `mv_session` cookie via `attachSession`/`requireAuth` — no feature should invent its own auth check. See `security-architecture.md`'s Auth Triad section.
- **REQ-3 (brand consistency):** every page with a header must use one of the three brand-CSS logo patterns (`.topbar-brand`, `.cs-brand`, `.brand-logo-icon`+`.brand-logotype`) at the guide's 1.2:1 mark-to-text ratio — not a one-off inline size. See `CLAUDE.md`'s Brand Assets section.

## 4. Known incomplete / partial features (from `docs/ARCHITECTURE.md`'s own checklist, still accurate as of this session)

- Auth (optional local, appliance mode): listed "Open" in the existing architecture notes — appliance auth exists (`applianceAuthStore`) but was non-functional until this session's fix; verify current state against `security-architecture.md` rather than trusting this line alone.
- Email/SMS alarm delivery: queue exists, SendGrid/Twilio wiring not yet done.
- Cloud roadmap's planned VM split (ingestion / alarm+notify / GUI API / AI as separate processes) has not happened — everything still runs in one monolith process per deployment. See `roadmap.md`.

## 5. Explicit non-requirements

- Native mobile apps — no iOS/Android client exists or is referenced anywhere in this codebase (unlike the `PeakLogic-AWS` product line, which has a distinct iOS Application architecture doc — that does not apply here).
- Blockchain/ledger functionality — not part of this product's domain (unlike the IronQuill project this documentation discipline was adapted from).
