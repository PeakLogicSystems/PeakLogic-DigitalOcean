# Information Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** user-stories.md

## 1. Top-level page map (from `views/` and route mounting)

```
/                         Main Studio/HMI dashboard (dashboard.ejs)
/login                    cloud-login.ejs (cloud) or appliance-login.ejs (appliance)
/forgot-password, /reset-password, /accept-invite    Auth-flow pages (cloud mode)
/io-map                   I/O map tool
/facility-draw            Facility Builder (standalone; ?embedded=1 for iframe use)
/cmms                     CMMS — cmms.ejs (appliance) or cloud-studio.ejs page='cmms' (cloud)
/cloud/sims, /cellular/sims   Fleet/connectivity management
/sites, /sites/devices, /sites/:id, /sites/:id/cameras   Cloud Studio site management
/fleet, /people, /partner    Cloud Studio (fleet, team, channel-partner views)
/admin/login, /admin/tenants, /admin/tenants/new, /admin/tenants/:id, /admin/mqtt   Platform Control Center
```

## 2. Two distinct "shells" a page can live in

1. **Dashboard shell** (`views/dashboard.ejs` and its sibling standalone tool pages — `io-map.ejs`, `cmms.ejs`, `cloud-sims.ejs`, `cellular-sims.ejs`, `facility-draw.ejs`, `scada-dashboard.ejs`) — dark navy topbar (`.topbar-brand`), uses `public/css/pc.css`.
2. **Cloud Studio shell** (`views/cloud-studio.ejs`, covering `/sites`, `/people`, `/cmms` in cloud mode, `/fleet`, `/admin/tenants` view, `/admin/mqtt`, `/partner`) — its own header (`.cs-brand`), uses `public/css/cloud-studio.css`. A second, structurally distinct multi-tenant shell layered on top of the same dashboard content model.
3. **Admin/Bootstrap shell** (`views/admin/*.ejs`, `views/public-home.ejs`, partials `views/partials/shell-nav.ejs`/`shell-foot.ejs`) — Bootstrap-based, `public/css/peaklogic.css`.

A new page should be placed in whichever shell matches its actual audience (platform-admin-only → Admin shell; per-tenant multi-page section → Cloud Studio shell; standalone tool reachable from the main dashboard → Dashboard shell) rather than inventing a fourth pattern.

## 3. Navigation entry points per shell

- **Dashboard shell:** topbar buttons/menus for Historian, Reporting, PdM, Alarms, CMMS, Facility Builder, Camera, Tools, Help — all in `dashboard.ejs`'s topbar, not a separate nav partial.
- **Cloud Studio shell:** `.cs-nav` — Studio, Sites, Devices, Assets, People, CMMS, MQTT, Admin (visible items depend on role/entitlement — not fully traced this session).
- **Admin shell:** `views/admin/_nav.ejs` — Tenants, Create tenant, account dropdown (Tenant app / Log out).

## 4. What this document does not cover

A full sitemap with every sub-route under each shell (e.g., every `/sites/:id` sub-view) — see `api-specification.md` for the route-file inventory this would be built from. Actual click-path/user-flow diagrams — see `ux-wireframes.md`.
