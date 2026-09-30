# Software Requirements Specification (SRS)

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** prd.md

This SRS translates the PRD's functional areas into system-level behavior actually observable in the code, focused on the parts most likely to surprise a new contributor. It intentionally does not restate every route/handler in `src/routes/` and `src/api/` — see `api-specification.md` for that inventory.

## 1. Authentication & session behavior

- **SRS-1.1:** A request with no valid `mv_session` cookie hitting a `requireAuth`-gated page redirects to `/login?next=<original path>`; hitting a `requireAuth`-gated API/JSON request instead returns `401 {"error":"Authentication required"}`. The distinguishing logic (`src/tenants/authMiddleware.js`'s `requireAuth`) checks `originalUrl` starting with `/api/` or `/auth/`, or an `Accept`/`Content-Type` header containing `application/json` — a page request that happens to send a JSON `Accept` header would get the API-style 401 instead of a redirect. This is existing behavior, not a bug filed this session, but worth knowing if debugging an unexpected 401 on what looks like a page load.
- **SRS-1.2:** `req.mvAuth.user.role === 'platform_admin'` bypasses tenant-scoping checks in multiple places (`requireTenantAccess`, `partnerAccess.js`'s `canAccessTenant`) — a platform admin's `mv_session`, once minted (see below), can act as any tenant.
- **SRS-1.3:** Platform admin's `mv_platform_admin` cookie and a tenant user's `mv_session` cookie are independent — holding one does not imply the other. `POST /admin/tenants/:id/enter` is the only code path that converts platform-admin authority into a real per-tenant `mv_session` (see `security-architecture.md`).
- **SRS-1.4:** In cloud mode, if `JWT_SECRET` is unset, `src/config.js` generates a random one at boot and logs a warning — **every session becomes invalid on process restart** in that configuration. This is real, currently-true behavior for local/dev use (this session's own testing hit it directly), not a hypothetical.

## 2. Deployment-mode-conditional behavior

- **SRS-2.1:** `sessionFromToken()` dispatches to `tenantStore` (cloud) or `applianceAuthStore` (appliance) based on `isCloudDeployment()` (`src/cloud/agentProtocol.js`) — any new auth-adjacent code must go through this dispatch, not call one store directly, or it will silently misbehave in the other deployment mode.
- **SRS-2.2:** `/cmms` resolves to two entirely different views depending on deployment mode (`views/cmms.ejs` standalone in appliance mode vs. `views/cloud-studio.ejs` with `page='cmms'` in cloud mode, per `src/routes/pages.js` and `src/routes/cloudStudioPages.js`) — a change to CMMS UI behavior may need to be made in both places, or consciously scoped to one.

## 3. Config/project storage behavior

- **SRS-3.1:** `PEAKLOGIC_CONFIG_URI` (or `MONGODB_URI`/`MONGO_URL` as fallbacks) selects the config-store backend. The literal value `"memory"` activates an in-process Map (`mongoBackend.js`'s `isMemoryMode()`) that does not persist across restarts — this is a real, intentional dev/test mode, not a stub awaiting a real implementation.
- **SRS-3.2:** Tenant/user account data (`tenantStore.js`) is **not** subject to SRS-3.1 — it persists to its own file-backed (or Mongo, in real cloud deploys) store regardless of the config-store memory-mode flag. A session that restarts the server with `PEAKLOGIC_CONFIG_URI=memory` will lose project/workspace config but keep logged-in tenant accounts intact (observed directly this session).

## 4. Brand/UI consistency requirements

- **SRS-4.1:** Any element pairing the PeakLogic icon (`/branding/peaklogic-icon.svg`) with the "PeakLogic" wordmark must maintain a 1.2:1 icon-height-to-wordmark-font-size ratio, implemented via `em`-relative CSS sizing (not independent fixed px values) so the ratio survives breakpoint changes. See `CLAUDE.md`.
- **SRS-4.2:** "Logic" in the wordmark is always `#7C3AED` (`--ps-purple`), never any other purple token. Verified/fixed on both login pages this session.

## 5. Non-functional notes

- **Test execution:** `node --test test/*.test.js` — 238 test files as of this session, no external test framework (no Jest/Mocha/Vitest). See `test-strategy.md`.
- **No CI pipeline exists** — tests are run manually. See `cicd-pipeline.md`.
- **Client-side JS is not bundled/transpiled** — `public/js/*.js` files are served as-is (some individually thousands of lines: `app.js`, `hmi.js`, `hmiSetupUi.js`), loaded via plain `<script>` tags in the EJS views, not through a build tool (no webpack/vite/esbuild config found in `package.json`).
