# Domain Model

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** srs.md

## 1. Core entities

### Tenant (cloud mode)
Source: `src/tenants/tenantStore.js`. Fields observed: `tenantId`, `tenantSlug`, `name`, `cmmsEnabled`, `cmms: { enabled, externalUrl }`, `createdAt`. A tenant is the unit of isolation in cloud mode — every user, session, and (indirectly, via config-store scoping) project belongs to exactly one tenant, except `platform_admin` users who can act across all of them.

### User
Fields observed: `userId`, `email`, `password` (hashed — verify hashing mechanism in `tenantStore.js` before assuming a specific algorithm), `name`, `role`, `tenantId` (home tenant). Role is a flat string, not a many-to-many permission set — see the role list below.

### Session
Fields observed on the in-memory/file session record: `sessionId`, `userId`, `activeTenantId` (**distinct from the user's home `tenantId`** — this is what lets a session "view" a different tenant than the user's own, used by both partner-switch-tenant and the platform-admin drill-down feature), `createdAt`, `expiresAt`.

### Roles (all string literals found in `src/`)
`platform_admin`, `tenant_admin`, `admin` (appliance-mode equivalent of tenant_admin), `operator`, `supervisor`, `technician`, `viewer`, `homeowner`, `partner_admin`, `partner_technician`, `appliance_gateway`. **Not formally documented anywhere in the existing codebase as a single list before this document** — cross-check against `src/tenants/tenantStore.js`, `src/auth/applianceAuthStore.js`, and `src/tenants/partnerAccess.js` if adding a new role, since authorization checks (`req.mvAuth.user.role === '...'`) are scattered across route files rather than centralized.

### Project / Workspace config
Source: `src/configStore/`. A tenant's HMI screens, tag definitions, driver config, and program source live as JSON "documents" in this store (`CONFIG_JSON_FILES`, `configProjects` collection) — keyed by tenant ID (`resolveConfigTenantId()`), Mongo-backed in real deployments, file-backed default for appliance mode, or in-memory for `PEAKLOGIC_CONFIG_URI=memory` dev/test.

### Tag
Source: `src/tags/`. The central live-data unit — bound to HMI elements, evaluated for alarms, written to the historian. Not fully modeled in this document; see `docs/` feature guides (no single `docs/TAGS.md` was found — check `src/tags/` directly and existing test files under `test/`).

### Device / Driver
Source: `src/drivers/`, `src/devices/`. A device is associated with a protocol driver (BACnet, Modbus, MQTT, NextCentury submeter family, etc.) — see `device-protocol-integration.md` for the driver framework itself.

### Work Order / PM Schedule (CMMS)
Source: `src/cmms/`. Work orders can be created manually, from an alarm transition, or from a PdM forecast (the "Proactive CMMS bridge" in `docs/ARCHITECTURE.md`).

### Facility / Site Plan
Source: `src/facilities/`, `facility-draw/`. A drawn site layout with placed symbols (tanks, panels, drainfield components, etc. — see the symbol library referenced in `views/facility-draw.ejs`), which can generate a 3D spatial preview artifact (`public/samples/<slug>-facilitydraw-3d.html`).

## 2. Key relationships

```
Tenant 1───* User
Tenant 1───* Session (via activeTenantId, not just the user's home tenant)
Tenant 1───* Project/Workspace config (HMI screens, tags, drivers, programs)
User   1───* Session
Tag    *───* HMI element binding (many-to-many, screen-scoped)
Tag    1───* Alarm transition ──> 0..1 Work Order (CMMS bridge)
Device 1───1 Driver instance
Facility 1───* Placed symbol ──> 0..1 generated 3D artifact
```

## 3. The activeTenantId pattern (worth calling out on its own)

A session's `activeTenantId` is what actually determines "which tenant's data am I looking at right now" — not the user's home `tenantId`. This is the mechanism behind three distinct features:

1. **Partner tenant-switching** — a partner user with access to multiple linked tenants switches which one they're viewing (`/api/partner/switch-tenant`, `switchActiveTenant()`).
2. **Platform admin drill-down** (added this session) — `createPlatformAdminSession()` mints a session for the seeded `platform_admin` user with `activeTenantId` set to the clicked tenant, rather than trying to "switch" a session that didn't previously exist.
3. Any future "view as" / impersonation-style feature should extend this same field rather than inventing a parallel mechanism — it already has the authorization check it needs via `canAccessTenant()` in `partnerAccess.js`.

## 4. What this document does not cover

Full database/collection schemas — see `data-storage-architecture.md`. Full API request/response shapes — see `api-specification.md`. This is entity/relationship level only.
