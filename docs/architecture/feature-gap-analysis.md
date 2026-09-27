# Feature Gap Analysis: MooreView → PeakLogic

**Status:** Draft v0.1 (2026-09-27)
**Purpose:** Establish what this codebase already has, what `PeakLogic-Azure-V2` has that we want, and what we deliberately are *not* porting — before any implementation branch starts. Mirrors the architecture-first discipline `PeakLogic-Azure-V2` itself uses (`docs/architecture/README.md` there): docs go first, code reconciles against them, and later findings are allowed to revise earlier sections rather than being silently ignored.

**Honesty note:** this analysis is based on a targeted read of `PeakLogic-Azure-V2` (its `CLAUDE.md`, `platform-control-center-architecture.md`, and a grep pass over `multi-tenant-architecture.md`/`domain-model.md`), not all ~50 documents under its `docs/architecture/`. Treat anything below sourced from those docs as directionally right but re-verify specifics (exact role names, exact table names) against the source doc before an implementation PR depends on them.

---

## 1. Decisions already made (do not re-litigate without a new decision record)

| Decision | Choice | Why |
|---|---|---|
| Base infrastructure | **Keep this repo's Node/Express/MongoDB backend** (`RoyMooreACE/mooreview-cloud` lineage) | Explicit instruction: MooreView is the foundation; PeakLogic is the rebrand + feature donor, not a replacement stack. |
| Frontend architecture | **One consolidated React + Vite + Tailwind SPA**, not three separate portals | PeakLogic-Azure-V2 splits customer/partner/operator into three deployed apps. We're a single product for now — one app, one deploy, one auth session; access differences are handled by RBAC-driven rendering, not separate codebases. |
| Access control | **Role-Based Access Control (RBAC)**, configured by an administrator | Same functional goal as PeakLogic's Platform Control Center RBAC, adapted to a single-app shape. |
| Admin surface | **"PeakLogic Cloud Control Center"** — an in-app console for provisioning/configuring tenants and defining roles/permissions | Renamed, scoped-down equivalent of PeakLogic's Platform Control Center concept (see §3.3) — ours governs tenants + RBAC, not device fleets/OTA. |
| Git workflow | **Feature branches → PR → `main`**, even solo | Clean, revertible history; teaches real review discipline. Branch protection is not available on this private org repo without a paid GitHub plan (verified 2026-09-27) — enforced by convention instead: nothing gets pushed straight to `main`. |
| First deliverable | **This document**, before any code changes | Establish shared understanding before touching a two-mode, multi-subsystem codebase. |

---

## 2. Current state: this repo

### 2.1 Two runtime modes in one codebase — the most important structural fact

This is not one product; it's two, sharing a `src/` tree:

| Mode | Entry point | Persistence | Tenant concept | Purpose |
|---|---|---|---|---|
| **Cloud multi-tenant API** | `src/server.js` (`npm start`) | MongoDB | account → location → system → device hierarchy, JWT-scoped | The SaaS backend — what a rebrand + RBAC + Control Center actually apply to. |
| **Local runtime ("MVP Suite")** | root `server.js` (`npm run start:runtime`) | Local JSON files (`persistence.readJson`) + in-memory `tagStore`/`programStore` | **None** — single machine, no auth in the routes we sampled | An all-in-one on-prem app (ST programming, PLC runtime, HMI, historian, MQTT) — conceptually the closest thing this codebase has to a PeakLogic Hub, except it's a mode of the same repo rather than a separately deployed edge agent. |

**Why this matters for everything downstream:** RBAC, the Control Center, and tenant provisioning are cloud-mode concepts. The local runtime mode has no tenant/user boundary to apply a role to — a design question (§6) is whether it stays out of scope for this effort, gets its own lightweight auth, or is eventually treated as this product's edge-equivalent.

### 2.2 Current access control (cloud mode)

- **Tenant-level roles today:** flat, three values — `admin`, `operator`, `viewer` (`src/users/userStore.js`), enforced by `requireRole(...roles)` middleware (`src/auth/middleware.js`) reading a `role` claim off the JWT. No granular permissions, no per-resource scoping beyond that one string.
- **Platform-admin bypass exists, but it's minimal:** `src/auth/platformAdminSession.js` implements a *single shared secret* (`PLATFORM_ADMIN_KEY`), HMAC-derived and compared with `timingSafeEqual` (that part's done correctly), set as a scoped cookie under `/admin`. There is **no per-staff-user identity, no staff roles, and no audit trail** of what a platform-admin session did — functionally a master password, not a staff RBAC layer.
- **No audit logging found anywhere in `src/`.** PeakLogic's `audit_log_entries` (append-only, who/what/when/why) has no equivalent here yet.
- **Tenant scoping mechanism:** not yet confirmed to be systematically enforced at the query layer (needs a follow-up pass through `src/api/routes/*` — the one route sampled, `dashboard.js`, turned out to be *local-runtime-mode* code with no tenant scoping at all, which says nothing about the cloud-mode routes). **Do not assume cloud-mode tenant isolation is correct or incorrect until that pass happens** — call it out explicitly rather than guess, the same way `multi-tenant-architecture.md` treats its own RLS audit as a first-class, load-bearing finding rather than an assumption.

### 2.3 Current UI surface

Server-rendered EJS, and it's thin:

- `views/login.ejs`, `forgot-password.ejs`, `reset-password.ejs`, `accept-invite.ejs` — auth flows.
- `views/team/users.ejs` — the only real management page (team/user list).
- `src/hmi/hmiConfig.js`, `hmiAssetCatalog.js`, `hmiComposites.js` — **data/config models for an HMI dashboard, with no renderer built against them yet** (no dashboard view exists in `views/`). This is a real asset: the data model for screens/assets/composites already exists; the SPA doesn't have to invent that shape from scratch, just render it (and improve it).
- `src/web/shellContext.js` — small (39 lines), looks like a shared shell-context helper; worth reading in full before the SPA's shell/layout work starts, since it may already express some of what a `Shell.tsx`-equivalent needs.

### 2.4 What has no equivalent here yet

Policy/alert engine beyond basic alarms (needs verification — `src/mail/alarmDelivery.js` exists, scope unconfirmed), compliance report generation, CMMS/work-order lifecycle, a help/assistant system (PeakAssist-equivalent), tenant self-service or staff-driven tenant provisioning UI, granular RBAC, audit logging.

---

## 3. Reference state: PeakLogic-Azure-V2

### 3.1 What it actually is

A TypeScript/Postgres/Azure-Functions platform, architected as three separate Vite/React/Tailwind frontends (`customer-portal`, `channel-partner-portal`, `peakview360`) over one backend, plus a `windows-hub` .NET edge agent and Bicep IaC. It follows an explicit architecture-first discipline: ~50 documents under `docs/architecture/`, PRD-traceable, allowed to force revisions to earlier docs.

### 3.2 Portal feature inventory (condensed, page-level)

| Portal | Audience | Pages (from `src/pages`) |
|---|---|---|
| `customer-portal` | Equipment owners | Home, SiteDetail, Alerts, Reports, WaterQualityReport, Settings, Login |
| `channel-partner-portal` | Service company staff | Home, Facility, SiteDetail, DeviceOnboard, Tickets, Settings, PartnerLogin (plus `PartnerSwitcher`/`PartnerContext` for multi-account staff, `DeviceDetail`, `PlantFacility`/`PoolFacility` — vertical-specific facility views) |
| `peakview360` | Live per-location operator view | Not yet inventoried in this pass — flagged as a follow-up read (`peakview360-hmi-architecture.md`) since it's the closest analog to our HMI dashboard work. |

**Translation for our single-SPA shape:** these aren't three products to rebuild separately — they're three **role-scoped views over the same data** (an owner sees their sites; a partner sees their whole book of business; an operator gets the live facility view). That's exactly what RBAC-driven rendering in one app should collapse them into. The page lists above are the feature checklist to satisfy per role, not three apps to port.

### 3.3 RBAC / Platform Control Center — what transfers and what doesn't

PeakLogic's `platform-control-center-architecture.md` (Draft v0.2) defines a **7-role RBAC model**: Platform Admin, Release Admin, Security Admin (platform/staff side), Customer Administrator, Field Technician, Read-Only Auditor (delegated tenant/partner side) — extending a coarser existing model (`admin`/`operator` for customers, `superadmin`/`account_manager` for staff).

**What transfers to our "PeakLogic Cloud Control Center":**
- The RBAC *shape*: a platform-staff tier (can manage tenants, roles, billing-equivalent, cross-tenant visibility) distinct from a tenant-scoped tier (Customer Admin down to Read-Only Auditor), each with granular, configurable permissions, not just a role name.
- The audit principle: every Control Center action traceable (who/what/when/why/prev→new state), append-only.
- The isolation principle: the Control Center itself must never do an ambient cross-tenant query — fleet/tenant-wide views are deliberate aggregations, not a loophole.

**What explicitly does NOT transfer** — this is the majority of that document, and porting it would be a wasted effort:
- Everything about Azure IoT Hub device twins, DPS enrollment groups, Device Update for IoT Hub (ADU), Event Grid, A/B atomic firmware rollback, and the millions-of-devices scale architecture. That entire document is solving **fleet OTA/firmware-update management at hardware scale** — a different problem from "configure tenants and roles," and it assumes an Azure-specific stack we're not using.
- The Postgres Row-Level-Security enforcement mechanism (`multi-tenant-architecture.md`'s `withTenant()`/RLS/`set_config` pattern). Our backend is MongoDB — tenant isolation has to be enforced in application-layer query scoping instead, not a transferable RLS pattern. The *lesson* transfers (verify isolation by enumeration, don't trust that a pattern exists everywhere it should — see §2.2's open question); the *mechanism* doesn't.

### 3.4 Other PeakLogic capabilities noted but not yet detailed here (follow-up reads before their own gap section is trustworthy)

PeakAssist (help/assistant system), Policy Engine (config-driven alert thresholds), Compliance report generation, CMMS work-order lifecycle, AI analytics (anomaly detection). Each has its own architecture doc; each needs a targeted read before we commit to a specific port, the same way §3.3 needed the actual doc read rather than the one-line CLAUDE.md summary.

---

## 4. Gap table

| Capability | MooreView today | PeakLogic-Azure-V2 | Our target | Priority |
|---|---|---|---|---|
| Branding | "MooreVIEW" throughout code, config, UI text, domain refs (`mooreview.io`) | "PeakLogic" naming system (locked, see its `CLAUDE.md`) | Full rebrand pass | High — low-risk, high-visibility, good first PR |
| RBAC granularity | 3 flat roles, no permissions model | 7-role model + granular permissions | Configurable roles/permissions via Control Center | High |
| Admin/tenant provisioning UI | None (implied manual/ops-side) | Platform Control Center (device/fleet-focused) | **PeakLogic Cloud Control Center** — tenant CRUD + role/permission config | High |
| Audit logging | None found | Append-only `audit_log_entries` | Needed for Control Center actions at minimum | High |
| Frontend | EJS auth pages only, no dashboard renderer | 3 React/Vite/Tailwind SPAs | 1 consolidated React/Vite/Tailwind SPA | High (headline goal) |
| HMI dashboard | Data model exists (`hmiConfig`/`hmiAssetCatalog`/`hmiComposites`), no renderer | `peakview360` (not yet detailed here) | Render existing data model in new SPA; compare to peakview360 once read | Medium — needs peakview360 read first |
| Alerting | `alarmDelivery.js` exists, scope unconfirmed | Rule-based + config-driven Policy Engine | TBD after both sides are read | Medium |
| Compliance reporting | None found | Report generator (Postgres-specific) | TBD — needs its own design against Mongo | Low/Medium |
| Work orders / CMMS | None found | Full lifecycle (`service_tickets` timestamps → KPIs) | TBD | Low/Medium |
| Help/assistant system | None found | PeakAssist | TBD | Low |
| Local runtime mode | Exists, no tenant/auth concept | No direct analog surfaced yet | **Open question** — see §6 | Open |

---

## 5. Explicit non-goals for this effort

- Porting Postgres/RLS, Azure Functions, Azure IoT Hub/DPS/ADU/Event Grid, or any fleet-OTA/firmware-update machinery. Different infrastructure, different problem.
- Building three separate portal apps. One SPA, RBAC-scoped.
- Rebuilding PeakLogic's millions-of-devices scale architecture. Out of proportion for this product's scale today.

## 6. Open questions to resolve before implementation starts

1. **Local runtime mode:** does the rebrand/RBAC effort touch it at all, or is it explicitly out of scope for this phase?
2. **Tenant isolation audit:** we have not yet verified how consistently cloud-mode routes scope queries by tenant. This should probably be its own short audit pass (mirroring `multi-tenant-architecture.md`'s own methodology) before or alongside the rebrand, since RBAC built on top of an unverified isolation layer would be building on sand.
3. **`peakview360`, PeakAssist, Policy Engine, Compliance, CMMS** each need their own targeted read before we write a gap section for them we'd actually trust for planning.

## 7. Proposed sequencing (not started — for discussion)

1. Rebrand pass (mechanical, low-risk, high learning value for search/replace + config-driven naming discipline).
2. Tenant-isolation audit pass on cloud-mode routes (open question §6.2) — before RBAC is layered on top.
3. RBAC data model + middleware (extends today's 3-role check into a real permission model).
4. PeakLogic Cloud Control Center (tenant CRUD + role/permission config UI) — first real SPA surface.
5. SPA shell + auth + role-aware routing, then HMI dashboard rendering against the existing `hmiConfig` data model.
6. Remaining feature ports (alerting/policy engine, compliance, CMMS, PeakAssist) — each preceded by its own short design note once its source doc is actually read.
