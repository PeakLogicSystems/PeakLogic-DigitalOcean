# Security Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** domain-model.md

## 1. The Auth Triad (Critical Pattern — read this before touching any auth code)

Three independent credential mechanisms coexist in this codebase. They are **not** layers of one system — each is checked by different middleware, stored in a different cookie, and has a different security shape.

### 1.1 `mv_session` — the real per-user session

- File: `src/tenants/authMiddleware.js`.
- Cookie: `mv_session`, `HttpOnly; SameSite=Lax`, `Path=/`, opaque token (not a JWT despite some code/comments elsewhere in the repo loosely calling session concepts "auth" generically — verify before assuming JWT structure anywhere near this cookie specifically).
- Resolution: `attachSession` middleware runs on every request, calls `extractToken()` (checks `Authorization: Bearer`, then `?token=`, then the cookie, in that order — so a `token` query param can authenticate a request, worth knowing for log-scrubbing/URL-sharing hygiene), then `sessionFromToken()`, which dispatches to `tenantStore` (cloud) or `applianceAuthStore` (appliance) depending on `PEAKLOGIC_DEPLOYMENT`. Result is set as `req.mvAuth = { user, tenant, activeTenantId, ... }`.
- This is the **only** cookie the tenant dashboard, Cloud Studio pages (`/sites`, `/people`, `/cmms` in cloud mode, `/fleet`, `/partner`), and both login pages actually use.
- `requireAuth`, `requirePlatformAdmin` (checks `req.mvAuth.user.role === 'platform_admin'`), `requireApplianceAdmin`, `requireTenantAccess` all gate on `req.mvAuth`.

### 1.2 `mv_platform_admin` — the Control Center shared secret

- File: `src/auth/platformAdminSession.js`.
- Cookie: `mv_platform_admin`, `HttpOnly`, scoped to `Path=/admin` (won't be sent on any request outside that path), 24h `maxAge`.
- **Not a per-user session.** Its value is `HMAC-SHA256(JWT_SECRET, "platform-admin:" + PLATFORM_ADMIN_KEY)` — a single deterministic token derived from one shared secret (`PLATFORM_ADMIN_KEY` env var). Anyone who knows that one key gets the identical cookie value; there is no per-admin identity, and no way to tell from this cookie alone *which* human operator is acting. See `technical-debt-register.md` — this is a known, real gap, not fixed this session.
- Verification is constant-time (`crypto.timingSafeEqual`) — the comparison itself is sound; the gap is architectural (shared secret vs. per-identity credential), not cryptographic.
- Gates `src/routes/adminWeb.js` (`/admin/*`) exclusively — `requireAuth`/`req.mvAuth` are irrelevant on that router.

### 1.3 A dead third system — do not use as a reference

- `src/routes/web.js` defines its own `GET/POST /login`, `GET /logout`, a `mv_token` cookie (`src/auth/webSession.js`), and JWT signing (`signToken`) — **this router is never mounted in `server.js`**. `views/login.ejs` (which it renders) is likewise unreachable in the live app.
- Discovered directly this session: editing `login.ejs` under the assumption it was the real login page produced changes with zero visible effect, because nothing routes to it. The real login pages are `views/cloud-login.ejs` and `views/appliance-login.ejs`, rendered directly from `server.js` (see `deployment-architecture.md` for the exact `app.get('/login', ...)` wiring).
- Do not "fix" or extend `web.js` under the assumption it's in the request path. If it needs to be removed entirely as dead code, that's a deliberate cleanup decision for the user to make, not an incidental one.

## 2. The platform-admin → tenant-session bridge (added this session)

**Problem:** a `mv_platform_admin`-authenticated operator has no `mv_session` at all by default (§1.2 is not a per-user session, so there's no user record to attach one to) — Control Center's tenant list could only link to a read-only admin detail page, never the tenant's actual live portal.

**Fix:** `POST /admin/tenants/:id/enter` (`src/routes/adminWeb.js`, behind `requirePlatformAdminWeb`) calls `tenantService.enterTenantPortal(tenantId)` → `tenantStore.createPlatformAdminSession(tenantId)`, which:
1. Finds the one seeded user with `role: 'platform_admin'` in the tenant store.
2. Mints a **real** `mv_session` for that user, with `activeTenantId` set to the target tenant.
3. Sets the `mv_session` cookie via `setSessionCookie()` and redirects to `/`.

Result: clicking a tenant name in Control Center lands the operator in that tenant's actual live dashboard, using the normal `mv_session`-based auth path — not a special-cased "admin view" render. Verified live this session (clicked "Acme Utilities" in `/admin/tenants`, landed on `/` scoped to that tenant, org selector showed "Acme Utilities").

**Security note worth flagging, not yet acted on:** this bridge means *any* successful `/admin/login` (i.e., anyone who knows `PLATFORM_ADMIN_KEY`) can mint a full tenant-scoped session for *any* tenant with zero additional confirmation step. That's the intended behavior for a superuser console, but it means `PLATFORM_ADMIN_KEY`'s blast radius is "every tenant's data," not just "the admin list view" — treat that key with proportionally more care than a typical admin password, and see the shared-secret gap in §1.2 above for why per-admin identity would materially improve this.

## 3. Deployment-mode security asymmetry

- **Appliance mode** was, until this session, completely broken for auth — `attachSession` was cloud-only gated (see `technical-debt-register.md` for the exact fix). Anything relying on `req.mvAuth` being populated in appliance mode should be re-verified against the current code rather than assumed fixed-and-forgotten.
- **Cloud mode's `JWT_SECRET`** auto-generates randomly at boot if unset, with a console warning — meaning every `mv_session` becomes invalid on process restart in that config. Fine for local dev (this session ran exactly this way); **must** be set to a stable value in any real deployment, or every user gets logged out on every deploy/restart. Verify `deploy/cloud/` `.env` templates actually set this before treating a real deployment as correctly configured.

## 4. Known gaps (see technical-debt-register.md for the full list)

- No per-admin identity for the Control Center (§1.2).
- Dead auth code (`web.js`/`webSession.js`) left in the tree, a maintenance/confusion risk even though not in the live request path.
- No rate limiting observed on `/login`, `/admin/login`, or `/api/auth/login` in the files read this session — not confirmed absent codebase-wide, but not found where expected either.

## 5. What this document does not cover

Row/document-level authorization within a tenant's own data (e.g., can a `viewer` role write a tag) — that's enforced per-route in `src/api/routes/*.js` and `src/routes/*.js`, not centrally, and is out of scope for this pass. Field-device-facing security (BACnet/Modbus/MQTT credentials, TLS) — see `device-protocol-integration.md`.
