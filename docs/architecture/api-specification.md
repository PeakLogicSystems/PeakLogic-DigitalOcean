# API Specification

**Status:** 🟡 Draft v1 (index-level) — reverse-engineered 2026-09-29
**Depends on:** data-storage-architecture.md

This is an **index**, not a full request/response reference — the real API surface is large enough (two separate route-file trees, ~30+ files each) that a complete per-endpoint spec is out of scope for one session. This document tells you where to look, not what every endpoint returns.

## 1. Two distinct route trees — do not confuse them

- **`src/api/routes/`** — the JSON REST API, mounted at `/api/*` (`createExpressApi` in `server.js`). Consumed by the client-side JS in `public/js/` (via `public/js/api.js`'s `request()` wrapper — see its `logout: () => request('POST', '/auth/logout', {})` for the exact base-path convention).
- **`src/routes/`** — server-rendered **page** routes (EJS `res.render(...)`), plus a few page-adjacent POST handlers (e.g., `adminWeb.js`'s `/admin/tenants/:id/enter`, a form POST that sets a cookie and redirects, not a JSON API call).

A new feature needing both a page and data almost always needs one file in each tree, following the existing pattern (e.g., `cloudStudioPages.js` renders the page, `api/routes/cloudSites.js`-style files serve its data).

## 2. `src/api/routes/` inventory (by filename, not yet read individually)

`alarms`, `cameras`, `cellularSims`, `cloudSims`, `cloudSites`, `cloudStudioUsers`, `cmms`, `dashboard`, `developer`, `drivers`, `hardwareHistory`, `hmi`, `inference`, `ioMap`, `messaging`, `misc`, `mqttBrokerLog`, `mqttConsole`, `parc`, `pdm`, `pdmSchedulerHolder`, `programs`, `project`, `projectHub`, `reports`, `runtime`, `settings`, `storage`, `sysLog`, `tags`, `tenantAuth`, `tenantFleet`, `users`.

## 3. `src/routes/` inventory (by filename)

`admin` (platform admin JSON API, distinct from `adminWeb`'s page routes), `adminWeb`, `appliance`, `auth`, `cloudStudioPages`, `cmms`, `cmmsWeb`, `connectivityBilling`, `devices`, `fleet`, `fleetWeb`, `ingest`, `installManifest`, `installWeb`, `locations`, `locationSystems`, `nextcenturyPortal`, `pages`, `projectHub`, `sitesWeb`, `staticAssets`, `studio`, `systems`, `teamWeb`, `users`, **`web` (dead — see security-architecture.md §1.3, do not mount or extend)**.

## 4. Routes documented precisely elsewhere in this artifact set

- The auth triad's actual endpoints (`/login`, `/admin/login`, `/admin/tenants/:id/enter`, `/api/auth/login`, `/api/auth/mfa/verify`, `/api/auth/logout`) — `security-architecture.md`.
- Facility Builder's `/view-3d` artifact-generation endpoint — `facility-builder-hmi-composer.md`.

## 5. What a real API spec pass should produce (not done this session)

Per-endpoint: method, path, auth requirement (which of the triad, which role), request/response shape, and which of the two route trees it belongs to. Given the volume (60+ files across both trees), this is realistically several sessions' worth of careful, verified work — flagged here as a concrete next step rather than attempted shallowly.
