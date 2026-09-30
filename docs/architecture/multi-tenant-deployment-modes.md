# Multi-Tenant & Deployment-Mode Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** security-architecture.md

## 1. One codebase, one runtime flag

`PEAKLOGIC_DEPLOYMENT` (`cloud` | `appliance`, default `appliance` — `src/config.js`'s `resolveDeploymentMode()`) is the single source of truth for which mode a running process is in. There is no separate build artifact per mode; `server.js` branches on `DEPLOYMENT_MODE` at a handful of well-defined points rather than the tree forking anywhere. New features should extend this same pattern (an `if (deployment === 'cloud')` branch or a store-selection dispatch like `sessionFromToken()`'s), not introduce a second flag or a parallel file tree.

`resolveDeploymentMode()` also has a fallback: if `PEAKLOGIC_DEPLOYMENT` isn't explicitly `cloud`, it still checks `isCloudDeployment()` from `src/cloud/agentProtocol.js` before defaulting to `appliance` — that function's own logic wasn't read in this pass; check it before assuming the env var is the *only* signal.

## 2. What actually differs between modes

| Aspect | Appliance | Cloud |
|--------|-----------|-------|
| Auth session store | `applianceAuthStore` | `tenantStore` |
| Tenant concept | Synthetic single tenant (`tenantId: 'local'` per `docs/ARCHITECTURE.md`) | Real multi-tenant, `tenantId` per organization |
| `/cmms` route/view | `views/cmms.ejs` standalone (`src/routes/pages.js`) | `views/cloud-studio.ejs` with `page='cmms'` (`src/routes/cloudStudioPages.js`) |
| Login page | `views/appliance-login.ejs` | `views/cloud-login.ejs` (adds Organization ID + optional MFA step — see its own `<script>` for the `/api/auth/mfa/verify` flow) |
| `/cloud/sims`, `/cellular/sims` | Present but likely not the primary use case | Primary fleet-management surfaces for cloud ops |
| Port convention | 3090 | 3090 for the "cloud hub" variant, 3100 for full multi-tenant SaaS (`npm run start:saas`) — see `deployment-architecture.md` |
| Field device connectivity | Direct — BACnet/Modbus/MQTT on the local network | Via an agent/hub, not the server talking to field devices directly (see `docs/ARCHITECTURE.md`'s cloud roadmap notes on this being only partially realized) |

## 3. Tenant isolation mechanism (cloud mode)

Two independent layers, both keyed on tenant ID, neither a database-level row-security policy (unlike, for contrast, `PeakLogic-AWS`'s Postgres RLS approach — this product's isolation is entirely application-level):

1. **Session-level:** every `mv_session` resolves to a `tenant`/`activeTenantId` (see `domain-model.md`); route handlers that touch tenant data are expected to scope their query/store access by that value. This is convention, not framework-enforced — there is no equivalent of AWS's `withTenant()` wrapper that would fail loudly if a query forgot to scope itself. Treat any new tenant-scoped route as needing an explicit, manual review for this, since nothing will catch a missed scope automatically.
2. **Config-store level:** `src/configStore/`'s document cache keys are tenant-qualified (`cacheKey(tid, key)`, `resolveConfigTenantId()`) — HMI/project config for one tenant should not be reachable by another's session, but this was not independently verified/penetration-tested this session.

## 4. Cloud roadmap gap (from the existing `docs/ARCHITECTURE.md`, still accurate)

The pre-existing architecture notes describe a planned split into four separate processes (ingestion / alarm+notify / GUI API / AI), sharing extracted packages instead of one monolith importing everything. **This has not happened** — as of this session, cloud and appliance are still both one process each, differing only by the `PEAKLOGIC_DEPLOYMENT` branches described above. Do not assume any of the described VM/process boundaries exist when reasoning about scaling or fault isolation; see `roadmap.md` for whether/when this is still planned.

## 5. What this document does not cover

The actual DigitalOcean droplet topology (nginx, systemd units, one droplet vs. several) — see `deployment-architecture.md`.
