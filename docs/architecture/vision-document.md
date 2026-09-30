# Vision Document

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** nothing (first artifact)

## 1. What this product is

PeakLogic is an industrial monitoring and control platform — SCADA/HMI, PLC-style ST (Structured Text) programming, a tag/alarm/historian runtime, integrated CMMS (maintenance work orders) and PdM (predictive maintenance), device connectivity (BACnet, Modbus, MQTT, cellular/eSIM fleets, IP cameras), and a visual site/facility layout tool ("Facility Builder"). It runs as **one codebase in two deployment modes**:

- **Appliance** — a single-tenant install on a site PC or embedded Linux box, talking directly to local field devices.
- **Cloud SaaS** — a multi-tenant hosted version (this repo's deployment target — see `docs/CLOUD_DEPLOY_DO.md`), where each customer organization ("tenant") gets an isolated view of the same UI, and site-level hardware connects up via an agent/hub rather than being directly wired to the server.

## 2. History and naming

This codebase was originally built under the "MooreVIEW" name (see `docs/PRODUCT_FORKS.md` and `docs/MOOREVIEW_CLOUD_UI_CHECKLIST.md` for the pre-rebrand product identity) and rebranded to PeakLogic in-place — not a rewrite. Evidence of the rebrand still being actively finished as of this session: `docs/PURPLE_STANDARD.md` documents an older, now-superseded brand color (`#6f42c1`) explicitly overridden by the current brand kit in `public/css/peaklogic.css`'s header comment; multiple views were still carrying "MV"/"MooreVIEW" references in copy and demo graphics before this session's work removed them (see `CHANGELOG.md`).

`peaklogic-digitalocean` is the package name, referring to the deployment target (a DigitalOcean droplet) this particular repo/branch is built for — sibling repos (`PeakLogic-AWS`, `PeakLogic-Azure`, `PeakLogic-Azure-V2`) represent **separate, architecturally unrelated rewrites** targeting different cloud providers, not branches of this same codebase. Do not assume feature parity or shared conventions between them.

## 3. Who it's for

Facilities operators and technicians at industrial, commercial, and multi-family/residential sites (the seeded demo data references utilities, environmental monitoring, assisted-living/residential properties — see `data/` and `test/fixtures/`) who need to monitor equipment, respond to alarms, and manage maintenance without hand-rolling PLC ladder logic or building a SCADA system from scratch. See `user-personas.md` for the specific roles this session identified from the actual role model in code (`platform_admin`, `tenant_admin`, appliance `admin`/`operator`, channel-partner-style roles referenced in `partnerAccess.js`).

## 4. Brand

**Single source of truth for the logomark and logotype:** the brand guide artifact the product owner maintains (referenced from this session's work; ask the user for the current link if it's not already in your context — do not guess or reconstruct it from memory). Two non-negotiable rules from that guide, both violated in the codebase at least once before being caught and fixed this session (see `CHANGELOG.md`):

- "Peak" flips color with the background (dark ink on light, white on dark); **"Logic" is always brand purple (`#7C3AED`)** — this is the one rule that never flips, straight from the guide's own text.
- The mark's height is always exactly **1.2× the wordmark's font-size**. Every icon+wordmark pairing in this codebase must maintain that ratio at every breakpoint — see `CLAUDE.md`'s Brand Assets section for the specific CSS pattern used to enforce this without hardcoding pixel values.

Palette: Purple `#7C3AED`, Green `#22C55E`, Ink/Navy `#0F172A` (`public/css/peaklogic.css`'s header comment cites these as verified against the brand kit).

## 5. What "done" looks like for this documentation effort

Not a finished product — an **onboarding artifact**. Success is: a developer or AI assistant with zero prior context on this repo can read `CLAUDE.md` plus this document set, in order, and understand (a) what exists and where, (b) the handful of architectural patterns that will bite them if ignored (the auth triad, the single-codebase-two-deployment-modes pattern, the brand sizing rule), and (c) what's known to be incomplete or fragile (`technical-debt-register.md`) — without having to re-derive any of it by reading 443 source files from scratch, the way this session had to.

## 6. Explicit non-goals of this document set

- Not a sales or marketing document — see `docs/CLOUD_USER_GUIDE.md` and the `marketing/` conventions in sibling repos for that.
- Not a replacement for the existing `docs/*.md` feature guides — those remain the detailed reference for a specific subsystem (BACnet, cameras, PdM, etc.); this set is the map that tells you which of those to go read.
- Not legally reviewed for compliance claims — see `compliance-roadmap.md`'s own disclaimer.
