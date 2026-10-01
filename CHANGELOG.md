# Changelog

All notable changes to this project are documented in this file, following
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This file was
introduced 2026-09-29 — entries before that date are reconstructed from git
history and this session's own record, not maintained contemporaneously.

## [Unreleased]

### Added
- Documented a pre-production deploy risk (MQTT topic prefix changed from `mooreview/v1` to `peaklogic/v1`, matching Arduino Opta firmware never compiled/flashed to real hardware) in `CLAUDE.md` and `docs/architecture/technical-debt-register.md` (TD-22) — not yet resolved, flagged for explicit sign-off before any deploy where real field devices might connect.
- Admin "Control Center" tenant list can now drill directly into a tenant's live portal by clicking the tenant name, instead of only reaching a read-only detail page (`POST /admin/tenants/:id/enter`, `tenantStore.createPlatformAdminSession()`, `tenantService.enterTenantPortal()`).
- `docs/architecture/` — a new architecture-first documentation set (Vision, PRD, SRS, Domain Model, Security Architecture, and others — see that directory's `README.md` for the full index and status).
- Root `CLAUDE.md` and this `CHANGELOG.md` — did not exist before this session.

### Changed
- Rebranded the product from its MooreVIEW-lineage naming to PeakLogic across the tenant portal, admin console, and login pages (headers, favicons, logo lockups, "Facility Draw" → "Facility Builder", MV references removed from demo graphics).
- Tenant-portal headers' "Control Center" label restyled to plain subdued text, matching the admin console's existing style, instead of a purple pill/badge.
- Admin console pages (`tenants.ejs`, `tenant-new.ejs`, `tenant-detail.ejs`) gained top padding between the header and page content.
- Login pages (`cloud-login.ejs`, `appliance-login.ejs`) fully redesigned: single centered card on a full-page brand gradient (modeled on a NextCentury Meters reference the user supplied), replacing the prior split hero/card layout.
- Login page logomark switched from a separately-sized icon + text composition to an inline SVG using the brand guide's exact combined mark+wordmark markup, guaranteeing the mark stays proportioned to the wordmark at any size instead of drifting.
- All header logo placements (`pc.css`'s `.topbar-brand-icon`, `cloud-studio.css`'s `.cs-brand-icon`, `peaklogic.css`'s `.brand-logo-icon`) resized from fixed pixel values to `em`-relative sizing, locking the mark-to-wordmark ratio at 1.2:1 per the brand guide across every breakpoint.
- Browser tab title for the tenant-facing Cloud Studio pages (`/sites`, `/people`, `/cmms`, `/fleet`, `/admin/tenants` view, `/admin/mqtt`, `/partner`) and the shared auth-flow pages changed from "PeakLogic Cloud Studio" to "PeakLogic Control Center".

### Fixed
- **Appliance (local/non-cloud) mode was completely unusable** — `attachSession` middleware was cloud-only gated, meaning single-tenant on-prem installs had no working auth at all.
- Facility Builder's 3D site-view button (`#mv-btn-3d`) silently failed to open a tab — `window.open()` was called after an `await`, which modern browsers drop as an untrusted popup. Fixed by reserving a blank tab synchronously inside the click handler, then redirecting it once the URL resolves.
- Facility Builder's standalone "View 3D"/"2D grid" composer-mode buttons redirected to `/?composerOpen=<mode>` but the receiving handler, `PeaklogicHmi.openComposerEditing`, did not exist anywhere in the codebase — the deep link silently no-opped, dumping the user back on the plain dashboard. Implemented the handler, including a fix for a race where the setup popup's own async settings-load was overwriting the just-requested mode.
- The HMI camera live-view popup (topbar Camera menu, Cameras admin "Test" button) called `HmiView.openCameraPopup()` / `closeCameraPopup()`, neither of which was ever implemented — clicking a camera did nothing, silently. Implemented both, plus backdrop-click-to-close.
- A CSS specificity bug caused the tenant-portal "Control Center" header label to render in bold purple at the wordmark's size instead of small and grey — a pre-existing `.topbar-brand span` rule (styling the "Logic" wordmark) was unintentionally also matching the label span nested in the same element, and won on specificity over the label's own class rule.
- "Logic" in the wordmark rendered in a washed-out light lavender (`--ps-purple-light`) on the login pages instead of true brand purple (`--ps-purple`, `#7C3AED`).
- The login pages' logo lockup was sized with `vw` (viewport-width-relative) units, so it grew and shrank continuously while the browser window was resized — replaced with a fixed size (one breakpoint at ≤480px), so branding no longer drifts during a resize.
- `public/branding/peaklogic-favicon.svg` had a light/dark-adaptive background rect behind the mark; removed per an explicit brand requirement that the favicon's logomark sit on a transparent background.

### Security
- No changes in this release. See `docs/architecture/security-architecture.md` §Known Gaps for the pre-existing `mv_platform_admin` shared-secret-with-no-per-admin-identity characteristic, documented but not yet changed.

## Prior History

Not reconstructed entry-by-entry before this session. See `git log` for the full commit history predating 2026-09-29; notable recent commits at the time this file was introduced:

- `0b7a554` — Add a dark/light-adaptive favicon, wire it into every page *(superseded by the Unreleased "Fixed" entry above — the favicon is transparent-background-only now, not adaptive)*
- `966b140` — Login hero: restore a smooth gradient instead of flat navy
- `d57c7a6` — Header redesign, Facility Builder rename, remove visible MV references
- `fadf568` — Fix cloud-login hero panel: dark navy background, not purple
- `7e2e84a` — Fix appliance (local/non-cloud) mode: unusable before this
