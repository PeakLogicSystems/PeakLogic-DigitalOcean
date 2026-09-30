# User Stories

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** user-personas.md

Written retroactively from what the code actually implements (verified this session) rather than prospectively. Each story cites the feature it describes.

## Platform Administrator
- As a platform admin, I can sign in with the shared Control Center key so I can manage tenants. *(`/admin/login`, `security-architecture.md` §1.2)*
- As a platform admin, I can create a new tenant with an initial admin user and CMMS entitlement in one step. *(`tenantService.createTenantAsPlatform`)*
- As a platform admin, I can click a tenant's name in the list and land directly in that tenant's live dashboard, instead of only a read-only detail page. *(Added this session — `security-architecture.md` §2)*
- As a platform admin, I can toggle a tenant's CMMS entitlement and external URL. *(`tenantService.updateTenantCmms`)*

## Tenant Administrator
- As a tenant admin, I can sign in with my organization ID, email, and password (organization ID left blank if I'm actually the system admin). *(`views/cloud-login.ejs`)*
- As a tenant admin, I can see my organization's name and slug reflected consistently in the header everywhere I go in the app. *(Brand/header consistency work this session — see `CHANGELOG.md`)*

## Operator / Supervisor / Technician
- As an operator, I can open a live camera feed from the topbar Camera menu to check a site visually. *(Fixed this session — was completely non-functional before, `facility-builder-hmi-composer.md` §5 / `device-protocol-integration.md` §3)*
- As an operator, I can open Facility Builder's 3D site view in a new tab to see the physical layout. *(Fixed this session — was silently blocked by the browser before, `facility-builder-hmi-composer.md` §3)*
- As an operator, I can switch Facility Builder into 2D-grid or 3D composer mode from its own standalone toolbar, even when it isn't embedded in the main dashboard. *(Fixed this session — the deep link previously did nothing, `facility-builder-hmi-composer.md` §2)*
- As an operator, I can build an HMI screen from a library of 3,400+ symbols with live tag bindings. *(Pre-existing — `views/dashboard.ejs`, `public/js/hmiSetupUi.js`)*
- As a technician, I can work CMMS work orders that were automatically created from an alarm transition or a PdM forecast, without manually creating one. *(Pre-existing "Proactive CMMS bridge" — `docs/ARCHITECTURE.md`)*

## Channel Partner
- As a channel partner admin, I can access only the tenants explicitly linked to my partner account, not every tenant. *(`partnerAccess.js`'s `canAccessTenant`)*
- As a channel partner, I can switch which linked tenant I'm currently viewing. *(`/api/partner/switch-tenant`, `switchActiveTenant()`)*

## Cross-cutting
- As any authenticated user, I expect the "PeakLogic" logo and "Control Center"/product label to look visually consistent — correct brand colors, correctly proportioned mark-to-wordmark sizing — on every page I visit. *(This session's entire header/branding/login-page body of work — see `CHANGELOG.md`)*

## What this document does not cover

Stories for personas whose actual UI/workflow wasn't directly exercised this session (`viewer`, `homeowner`, `appliance_gateway`) — see `user-personas.md` for why those remain thin. A full backlog-style story set with acceptance criteria per story — this is a representative sample grounded in verified behavior, not an exhaustive backlog.
