# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Naming

- **Company:** PeakLogic (PeakLogicSystems on GitHub)
- **Product:** PeakLogic Cloud Control Center (multi-tenant SaaS) / PeakLogic MVP Suite (single-tenant on-prem appliance) — **one codebase, one deployment-mode flag**, not two products
- **Internal package name:** `peaklogic-digitalocean` (this repo was originally seeded from a MooreVIEW-lineage codebase — see `docs/PRODUCT_FORKS.md` and the Vision Document §1 for the rebrand history)

This repo is one of several PeakLogic repositories on this machine (`PeakLogic-AWS`, `PeakLogic-Azure`, `PeakLogic-Azure-V2`, `PeakLogic-Cloudflare-Website`). **It is not a fork or a shared codebase with those** — it is an independent product line (the original MVP Suite / MooreVIEW-descended monolith) that predates and is architecturally unrelated to the AWS/Azure rewrites. Do not assume conventions, schemas, or infrastructure from those repos apply here unless a doc in this repo explicitly says so.

## Governance: architecture-first (adopted 2026-09-29)

This project is adopting the same architecture-first documentation discipline used by the IronQuill and PeakLogic-AWS projects: documents are produced in dependency order in `docs/architecture/` (see `docs/architecture/README.md` for the live status table and full artifact list — Vision → PRD → SRS → Domain Model → ... → Roadmap), every future implementation decision should trace to the PRD, and later documents can force revisions to earlier ones.

**Existing code and existing docs are reference, not superseded.** Unlike a greenfield adoption, this repo already has a working, deployed v2.3.7 product with an extensive organic `docs/*.md` tree (feature-by-feature guides — CMMS, cameras, BACnet, cloud deploy runbooks, etc. — see that directory's own files). The new `docs/architecture/` layer does not replace those; it sits above them, reverse-engineered from the real implementation as of 2026-09-29, to give a new reader (human or AI) a fast, ordered path to understanding the whole system before diving into feature-level docs. Where the two disagree, treat the architecture docs' own Revision History and the actual code as authoritative — the feature docs may lag.

## Monorepo Structure

This is a **single Node.js/Express monolith**, not a multi-package repo. One `server.js` boots everything; deployment mode (`cloud` vs `appliance`) is a runtime flag, not a build target.

| Directory | Purpose |
|-----------|---------|
| `server.js` | Single entry point — Express app, all route mounting, EJS view engine setup |
| `src/` | ~440 files across ~40 domain subdirectories (`tenants/`, `auth/`, `drivers/`, `hmi/`, `cmms/`, `pdm/`, `mqtt/`, `cameras/`, `configStore/`, `routes/`, ...) — see `docs/architecture/domain-model.md` for the full map |
| `views/` | 17 EJS templates — server-rendered pages (dashboard, admin console, login, Cloud Studio shell, standalone tools) |
| `public/` | Static assets served directly — `js/` (client-side app logic, largest files run 4,000–10,000+ lines), `css/`, `branding/` (brand SVGs — see Brand Assets below), `samples/` (generated Facility Builder artifacts) |
| `test/` | 238 test files, run via Node's built-in test runner (`node --test`), no external test framework |
| `docs/` | Organic feature-level documentation (pre-existing) plus the new `docs/architecture/` artifact set |
| `scripts/` | Dev/ops tooling — start scripts for each deployment mode, seeding, deploy automation (mostly PowerShell), MQTT broker control |
| `deploy/cloud/` | DigitalOcean droplet deployment runbooks and `.env` templates per environment |
| `data/` | Default on-disk data directory (JSON stores) when no MongoDB is configured — see `PEAKLOGIC_DATA` in Environment Setup |

## Common Commands

```bash
npm install
npm start                 # node server.js — appliance mode by default, port 3090
npm run dev                # node --watch server.js — auto-restart on file change
npm run start:cloud        # scripts/start-cloud.js — sets PEAKLOGIC_DEPLOYMENT=cloud + cloud sims, port 3090
npm run start:saas         # scripts/start-saas.js — cloud SaaS mode, port 3100 (see docs/CLOUD_DEPLOY_DO.md)
npm test                   # node --test test/*.test.js — full suite
npm run green               # same suite, preloaded with an in-memory config store (test/preload-config-memory.js)
npm run seed:saas           # scripts/seed-saas.js — seed demo tenants/users for cloud mode
npm run stop / npm run restart   # scripts/stop-server.js — graceful stop, used by the restart script
```

**Local dev without a real MongoDB or a platform admin key** (this is what this session's live-testing used — see Deployment Architecture §5 for why each variable exists):
```bash
PEAKLOGIC_CONFIG_URI=memory PLATFORM_ADMIN_KEY="<any-string>" PORT=3090 node scripts/start-cloud.js
```
`PEAKLOGIC_CONFIG_URI=memory` swaps the Mongo-backed config store for an in-process Map (`src/configStore/mongoBackend.js`'s `isMemoryMode()`) — config/project data does **not** persist across a restart in this mode, but tenant/user accounts do (they live in a separate file-backed store, `src/tenants/tenantStore.js`, unaffected by this flag). Without `PLATFORM_ADMIN_KEY` set, `/admin/login` is disabled outright (`isPlatformAdminConfigured()` returns false).

There is no CI pipeline yet — see `docs/architecture/cicd-pipeline.md`.

## Architecture

### The Auth Triad (Critical Pattern)

Three independent, differently-shaped credentials coexist. Confusing them is the single easiest way to introduce an auth bug in this codebase — read `docs/architecture/security-architecture.md` in full before touching any of the three.

1. **`mv_session`** (HttpOnly cookie, `src/tenants/authMiddleware.js`) — the real per-user session, backing **both** deployment modes. `attachSession` middleware resolves it every request into `req.mvAuth = { user, tenant, ... }` via `sessionFromToken()`, which dispatches to `tenantStore` (cloud) or `applianceAuthStore` (appliance) depending on `PEAKLOGIC_DEPLOYMENT`. `requireAuth`, `requirePlatformAdmin`, `requireTenantAccess` all gate on `req.mvAuth`. This is the *only* cookie the tenant dashboard, Cloud Studio (`/sites`, `/people`, `/cmms`, `/fleet`), and the appliance login all actually use.
2. **`mv_platform_admin`** (HttpOnly cookie, `src/auth/platformAdminSession.js`) — gates the platform "Control Center" (`/admin/*`, tenant list/creation/CMMS entitlement). **Not a per-user session** — its value is a deterministic `HMAC-SHA256(JWT_SECRET, "platform-admin:" + PLATFORM_ADMIN_KEY)`, so anyone who knows the one shared `PLATFORM_ADMIN_KEY` gets an identical, non-attributable token. There is currently no per-admin identity or audit trail here — see the Technical Debt Register.
3. A dead third system (`src/routes/web.js`, `mv_token` cookie via `src/auth/webSession.js`) exists in the tree but **is never mounted in `server.js`** — do not use it as a reference for how login actually works; it renders a `login.ejs` view that is likewise unreachable. Both cloud and appliance mode's real login pages are `views/cloud-login.ejs` and `views/appliance-login.ejs`, wired from `server.js` directly (not through `src/routes/pages.js` or `web.js`).

**The bridge between #1 and #2** (added this session, `src/tenants/tenantStore.js`'s `createPlatformAdminSession()` / `src/services/tenantService.js`'s `enterTenantPortal()`, wired at `POST /admin/tenants/:id/enter`): a platform admin authenticated only via `mv_platform_admin` has **no** `mv_session` by default and can't see a tenant's live portal. This endpoint mints a real `mv_session` for the seeded `platform_admin` user, scoped to the clicked tenant's `activeTenantId`, and redirects into `/` — letting Control Center "drill down" into a tenant's actual live dashboard instead of only a read-only admin detail page.

### Request Flow

```
Browser → server.js (Express, EJS view engine)
        → static middleware (public/) → attachSession (resolves req.mvAuth from mv_session)
          → src/routes/pages.js         (/, /io-map, /facility-draw, /cmms [appliance only], ...)
          → src/routes/cloudStudioPages.js  (/sites, /people, /cmms [cloud], /fleet, /admin/tenants view, /partner — all behind requireAuth)
          → src/routes/adminWeb.js      (/admin/* — behind mv_platform_admin, separate from requireAuth)
          → /api/*                       (createExpressApi — REST API for the SPA-like client JS in public/js/)

Field devices (BACnet/Modbus/MQTT) → src/drivers/* → src/engine (ScanEngine) → TagStore
                                                                              → alarms/historian/CMMS/PdM subsystems
```

### Deployment Modes Are One Codebase (Critical Pattern)

`PEAKLOGIC_DEPLOYMENT` (`cloud` | `appliance`, resolved in `src/config.js`) is checked throughout the codebase to select a store implementation (`tenantStore` vs `applianceAuthStore`), enable/disable routes (`/cmms` appliance-only vs cloud-only), and change page rendering (`dashboard.ejs`'s title, `dashboardViewLocals()` in `pages.js`). **There is no separate appliance build** — the same `server.js` and the same `views/`/`public/js/` files run both; do not create mode-specific duplicates of a view or route when an `if (deployment === 'cloud')` branch will do, matching the existing pattern.

## Key Files

| File | What to know |
|------|-------------|
| `src/config.js` | All environment variable resolution — `DEPLOYMENT_MODE`, `JWT_SECRET` (auto-generates and warns if unset in cloud mode — sessions won't survive a restart), `PLATFORM_ADMIN_KEY`, Mongo config URI resolution |
| `src/tenants/authMiddleware.js` | The auth triad's core — `attachSession`, `requireAuth`, `requirePlatformAdmin`, `requireTenantAccess`. Read before touching any auth-gated route. |
| `src/tenants/tenantStore.js` | File-backed (or Mongo-backed, cloud) tenant/user/session store — the source of truth for `mv_session` in cloud mode |
| `src/auth/platformAdminSession.js` | The `mv_platform_admin` shared-secret cookie mechanism |
| `src/configStore/mongoBackend.js` | Project/workspace config storage — Mongo-backed in real deployments, `PEAKLOGIC_CONFIG_URI=memory` swaps in an in-process Map for dev/test |
| `server.js` | All route mounting order — mounting order matters here (see its comment about `/admin` needing to be registered before `createCloudStudioPages` to avoid a conflicting `/admin/tenants` route) |
| `views/dashboard.ejs` | The main Studio/HMI shell — by far the largest, most complex view; hosts the HMI composer, tag/driver/program popups, and most of the in-app tool surface |
| `public/js/app.js`, `hmi.js`, `hmiSetupUi.js` | The largest client-side files (thousands of lines each) — most dashboard interactivity lives here, not in `views/` |
| `docs/ARCHITECTURE.md` | Pre-existing informal architecture notes (deployment-mode comparison table, event-bus pattern, cloud roadmap) — still accurate, treat as a companion to `docs/architecture/` rather than superseded by it |

## Brand Assets — Single Source of Truth (superseded 2026-10-01)

**`marketing/brand/BRAND_GUIDELINES.md` is now the authoritative source of truth for PeakLogic's visual identity, across every PeakLogic repository — not the artifact link this section used to point to.** That artifact was the original source and is still consistent with the committed file, but the committed file is now canonical since it's version-controlled alongside the code it governs. The implementation notes below remain accurate and specific to this repo; keep them.

**Known regression, found in a 2026-10-01 cross-repo audit:** the "Logic is always `#7C3AED`" rule — believed fixed 2026-09-29 by removing the `--ps-purple-light` token — was independently reintroduced through a *second*, differently-named token, `--ps-purple-mid` (`#8b5cf6`), wired into `.topbar-brand span`/`​.cs-brand span` (`public/css/pc.css:1558`, `public/css/cloud-studio.css:93`). This affects `dashboard.ejs` and 6 other high-traffic tool pages — the most heavily used UI shell in the app. The two real login pages and the `peaklogic.css` admin/marketing pattern are unaffected and remain correct. See `marketing/BRAND_AUDIT_FINDINGS.md` in `PeakLogic-MooreView-Dev` for the full cross-repo register; fix tracked there, not yet applied here.

Two hard rules from the guideline, restated here since they're the ones most often violated in this repo specifically:
- **"Logic" is always brand purple (`#7C3AED`)** — never a lighter token, under either name above.
- **The mark's height must equal 1.2× the wordmark's font-size, always.** Every icon+wordmark pairing in this codebase (`public/css/pc.css`'s `.topbar-brand-icon`, `public/css/cloud-studio.css`'s `.cs-brand-icon`, `public/css/peaklogic.css`'s `.brand-logo-icon`) is sized in `em` relative to its own text, specifically so this ratio can't drift if a breakpoint changes the surrounding font-size. If you add a new header or logo placement, size the icon the same way — never a fixed px value independent of the accompanying text's font-size. This one is implemented correctly and consistently everywhere in this repo — it's the reference pattern cited in the cross-repo guideline for other repos to copy.
- The two login pages (`views/cloud-login.ejs`, `views/appliance-login.ejs`) inline the guideline's exact combined mark+wordmark SVG (`viewBox="0 0 230 48"`) rather than composing an `<img>` + `<span>`, specifically because that guarantees pixel-perfect adherence to the spec — prefer that pattern over icon+span composition for any new full-lockup placement (splash screens, marketing pages), and reserve the CSS-ratio approach above for compact in-toolbar placements where an inline SVG would be needlessly heavy markup.
- `public/branding/peaklogic-favicon.svg` must have **no background shape** — transparent canvas, mark only. It briefly had a light/dark-adaptive background rect; that was removed as a deliberate specification, not an oversight — don't re-add it without checking with the user first.

## Environment Setup

```bash
PEAKLOGIC_DEPLOYMENT=cloud|appliance     # default: appliance
PORT=3090                                 # 3100 conventionally used for cloud SaaS (docs/CLOUD_DEPLOY_DO.md)
PEAKLOGIC_DATA=/path/to/data              # overrides default data/ dir for JSON stores
JWT_SECRET=<random hex>                   # required in production cloud mode — auto-generated + warns otherwise
PLATFORM_ADMIN_KEY=<shared secret>        # required for /admin/* (Control Center) to be reachable at all
PEAKLOGIC_CONFIG_URI=memory|mongodb://... # config store backend; "memory" for dev/test only
MONGODB_URI / MONGO_URL                   # alternate names config.js also checks for the same value
```

Full DigitalOcean droplet deployment environment (nginx, systemd, `.env` file layout) is in `docs/CLOUD_DEPLOY_DO.md` and `deploy/cloud/` — not duplicated here.

## Branching & Commits

- `main` — the only long-lived branch observed in this repo's history to date; no `dev` branch convention has been established here (unlike `PeakLogic-AWS`) — confirm with the user before introducing one.
- Commit prefix convention observed in existing history: plain, descriptive, present/imperative-tense subject lines (e.g. `Fix appliance (local/non-cloud) mode: unusable before this`, `Header redesign, Facility Builder rename, remove visible MV references`) — **not** the `feat:`/`fix:`/`docs:` Conventional Commits prefix style used in `PeakLogic-AWS`. Match the existing style in *this* repo's log rather than importing the other repo's convention.

## Version Control Standards

`package.json` currently carries `2.3.7` with no enforced SemVer bump discipline tied to commits (no CHANGELOG-driven release process existed before this session — see `CHANGELOG.md`, newly introduced 2026-09-29). Going forward:

- Follow [Semantic Versioning 2.0.0](https://semver.org) for `package.json`'s `version` field.
- Maintain `CHANGELOG.md` per [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — categories `Added`/`Changed`/`Fixed`/`Deprecated`/`Removed`/`Security` only, always an `[Unreleased]` section at the top for in-progress work.
- This is a **new** discipline as of this session, not a formalization of an existing one — do not assume past commits/tags follow it retroactively.

## Git Discipline

Commit meaningful units of work with descriptive messages explaining *why*, matching this repo's existing log style (see above). Do not push without the user's explicit go-ahead — this repo has a real GitHub remote (`PeakLogicSystems/PeakLogic-DigitalOcean`) and pushing is a shared-state action, not a local one.
