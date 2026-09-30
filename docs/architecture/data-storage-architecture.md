# Data & Storage Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** domain-model.md

This product uses **no SQL database** — unlike `PeakLogic-AWS`'s Postgres/RLS model, storage here is a mix of MongoDB collections, GridFS, and flat JSON files, selected per-subsystem rather than through one unified data layer.

## 1. Storage backends by subsystem

| Data | Backend | Source |
|------|---------|--------|
| Tenant/user accounts, sessions | File-backed (default) or Mongo (cloud) | `src/tenants/tenantStore.js` |
| Appliance-mode auth | File-backed | `src/auth/applianceAuthStore.js` |
| Project/workspace config (HMI screens, tags, drivers, programs) | Mongo (`configDocuments`/`configProjects` collections) or in-memory (`PEAKLOGIC_CONFIG_URI=memory`) | `src/configStore/mongoBackend.js` |
| Historian (trend data) | MongoDB | `src/graph/` |
| Camera snapshots | GridFS | `src/cameras/` |
| Cloud sim device state | Mongo `cloud_sims` or `data/cloud_sims.json` | `src/cloud/simStore.js` |
| Cellular/eSIM inventory | Mongo `cellular_sims` or `data/cellular_sims.json` | `src/cellular/simStore.js` |
| Default on-disk fallback for the above | `data/` (or `PEAKLOGIC_DATA`) | `src/config.js` |
| Facility Builder generated artifacts | Static files | `public/samples/<slug>-facilitydraw-3d.html`, `<slug>-site-config.js` |

**Pattern:** most subsystems follow a "Mongo if configured, JSON file otherwise" dual-mode design (explicitly by choice, per `docs/ARCHITECTURE.md`'s appliance/cloud comparison table: `data/*.json` + optional Mongo for appliance, DO Managed Mongo + tenant JSON/Mongo for cloud). A new subsystem should follow this same dual-mode convention rather than hard-requiring Mongo, to keep appliance-mode's "just run it on a PC with no external dependencies" property intact.

## 2. No canonical schema document exists

Unlike `PeakLogic-AWS`'s hand-maintained `docs/data-model.sql`, this repo has no single file enumerating every Mongo collection's shape. `src/configStore/mongoBackend.js`'s `CONFIG_JSON_FILES` constant and the various `*Store.js` files across `src/` are the closest thing to a schema, expressed as code rather than documentation. **This is a real gap** — see `technical-debt-register.md`. If this documentation effort continues, a follow-up pass should extract these into a proper schema reference rather than requiring a reader to grep `src/` for every store's field names, the way this document's own author had to.

## 3. Tenant scoping (cloud mode)

Config-store documents are cached and presumably persisted with tenant-qualified keys (`cacheKey(tid, key)`, `resolveConfigTenantId()` in `src/configStore/index.js`) — see `multi-tenant-deployment-modes.md` §3 for the caveat that this is convention-enforced, not framework-enforced the way a database-level policy would be.

## 4. What this document does not cover

Backup/restore procedures for the Managed MongoDB instance in production (not found documented anywhere in `docs/CLOUD_DEPLOY_DO*.md` in the portions read this session — worth confirming this is genuinely absent, not just unread, before treating it as a gap in `technical-debt-register.md`). Data retention policy for historian/camera-snapshot data — not found documented.
