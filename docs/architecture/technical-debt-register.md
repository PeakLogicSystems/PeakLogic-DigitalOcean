# Technical Debt Register

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** threat-model.md

Each item: description, severity (Low/Medium/High — no item found this session rises to a "drop everything" severity), and status as of this session.

## Resolved this session

| ID | Item | Severity (was) | Fix |
|---|---|---|---|
| TD-1 | Appliance mode had no working auth at all — `attachSession` was cloud-only gated | High | Fixed prior to this documentation pass (see `CHANGELOG.md` prior-history commit `7e2e84a`) |
| TD-2 | `HmiView.openCameraPopup`/`closeCameraPopup` called but never implemented — camera live-view popup silently did nothing | Medium | Implemented this session, see `facility-builder-hmi-composer.md` §5 pattern note and `device-protocol-integration.md` §3 |
| TD-3 | `PeaklogicHmi.openComposerEditing` called but never implemented — Facility Builder's standalone 3D/2D-grid composer buttons silently no-opped | Medium | Implemented this session, see `facility-builder-hmi-composer.md` §2 |
| TD-4 | Facility Builder's `#mv-btn-3d` popup blocked by browser (window.open after await) | Low-Medium | Fixed this session, see `facility-builder-hmi-composer.md` §3 |
| TD-5 | CSS specificity bug: `.topbar-brand span` unintentionally overrode `.topbar-cloud-badge`'s intended plain-text styling, rendering "Control Center" in bold purple instead of small grey | Low | Fixed via `:not(.topbar-cloud-badge)` scoping |
| TD-6 | "Logic" wordmark rendered in washed-out `--ps-purple-light` instead of true brand purple on login pages | Low | Fixed |
| TD-7 | Login logo lockup sized with `vw` units — grew/shrank continuously on window resize | Low | Fixed — replaced with fixed sizing + one breakpoint |
| TD-8 | Every header logo instance (`pc.css`, `cloud-studio.css`, `peaklogic.css`) sized icon in fixed px independent of the accompanying text's font-size, risking ratio drift at breakpoints and, in at least the admin-nav/public-home case, rendering measurably below the brand guide's 1.2:1 ratio | Low | Fixed — all three converted to `em`-relative sizing |
| TD-9 | `peaklogic-favicon.svg` had a light/dark-adaptive background rect instead of a transparent canvas | Low | Fixed per explicit user requirement |

## Open — carried forward

| ID | Item | Severity | Notes |
|---|---|---|---|
| TD-22 | MQTT topic prefix default changed `mooreview/v1` → `peaklogic/v1` (commit `a9e431e`); matching Arduino Opta firmware rewritten but never compiled or flashed to real hardware | High (if real field devices exist and this ships without a migration step) | See `CLAUDE.md`'s "⚠️ Known Pre-Production Deploy Risk" section for the full writeup and the per-device mitigation. Added 2026-10-01 after a pre-deploy risk review; not yet resolved — do not deploy to an environment with real field devices until this is explicitly checked off. |
| TD-10 | `mv_platform_admin` is a shared-secret token with no per-admin identity or audit trail | Medium | See `security-architecture.md` §1.2, `threat-model.md` §1. Blast radius increased by TD-11's own bridge (any admin-key holder can now mint a session for any tenant). |
| TD-11 | Platform-admin → tenant-session bridge (`enterTenantPortal`) has no additional confirmation step before minting a full tenant session | Low-Medium | Intended behavior for a superuser console, but worth the user's explicit sign-off that this is the desired security posture, not an oversight |
| TD-12 | `src/routes/web.js` / `src/auth/webSession.js` / `views/login.ejs` are dead code (never mounted) left in the tree | Low | Real risk is developer confusion (this session initially edited `login.ejs` believing it was live) rather than a live vulnerability. Recommend either removing it or adding a header comment marking it dead, pending user decision |
| TD-13 | No framework-level tenant-scoping enforcement (no `withTenant()`-equivalent) | Medium | See `threat-model.md` §2 — the single highest-value future investment named in this pass |
| TD-14 | `mv_session` token accepted via `?token=` query param, not just cookie/header | Low-Medium | See `threat-model.md` §1 |
| TD-15 | `JWT_SECRET` auto-generates randomly if unset in cloud mode, invalidating all sessions on restart | Low (dev) / High (if this ever happens in prod) | Verify `deploy/cloud/`'s `.env` templates actually set this — not independently confirmed this session |
| TD-16 | No CI pipeline | Medium | See `cicd-pipeline.md` for a proposed minimal fix, not implemented |
| TD-17 | This session's own bug fixes (TD-2 through TD-9 equivalents) have no new automated regression tests, despite the codebase's own dense existing test suite (238 files) | Low-Medium | See `test-strategy.md` §3 |
| TD-18 | No documented rollback procedure for the DigitalOcean cloud deployment | Medium | See `deployment-architecture.md` §5 |
| TD-19 | No canonical schema document for MongoDB collections (schema exists only as scattered `*Store.js` code) | Low | See `data-storage-architecture.md` §2 |
| TD-20 | No rate limiting found on login endpoints | Medium | See `threat-model.md` §4 — not independently confirmed absent everywhere, but not found where expected |
| TD-21 | No API request/response schema documentation for either route tree (~60+ files) | Low | See `api-specification.md` §5 — flagged as a multi-session follow-up, not attempted here |

## How to use this register going forward

Add a new row here whenever a real gap or shortcut is knowingly taken (matching `PeakLogic-AWS`'s own convention of dated, disclosed trade-offs rather than silent ones — see that repo's TD-43 entry for the pattern to follow: state what's different, why, and what has to happen before it's acceptable in a higher-stakes context). Move an item to "Resolved" with the fixing commit/session date rather than deleting it, so the register also serves as a record of what's already been checked and closed.
