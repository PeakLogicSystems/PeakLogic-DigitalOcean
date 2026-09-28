# PeakLogic product forks

`est-pc/` is the **development source tree** for all products. The shipped all-in-one desktop app is **MVP Suite**.

| Product | Directory | Role |
|---------|-----------|------|
| **MVP Suite** | `est-pc/` or `../peaklogic-mvp-suite/` | All-in-one for **Windows and Linux**: ST + runtime + HMI + historian + Parc + alarms |
| **ST MVP** | `../peaklogic-st-mvp/` | Linux ST runtime with web GUI: project, program, tags, drivers, help (no HMI/Mongo/Parc) |
| **MV Client** | `../peaklogic-client/` | Browser HMI and operator UI — remote API |
| **Opta Parc** | `../peaklogic-opta-parc/` | Browser HMI pointed at **peaklogic.io** (`PEAKLOGIC_API_BASE` default) |
| **Cloud SaaS** | `est-pc` (same repo) | Multi-tenant platform (port **3100**): login, Sites, agent hub, DO Mongo — see [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md) |

Historical **`est/`** is the older embedded stack (OpenWrt, WebSocket). **`peaklogic-st-mvp`** is the est-pc–aligned embedded fork.

## Generate forks

From `est-pc`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-product-forks.ps1
```

Options:

```powershell
powershell -File scripts/create-product-forks.ps1 -SkipHmiAssets
powershell -File scripts/create-product-forks.ps1 -Products mvp-suite
powershell -File scripts/create-product-forks.ps1 -Products mvp-suite,client -Clean
powershell -File scripts/create-product-forks.ps1 -Products opta-parc
```

## MVP Suite (all-in-one)

Single Node process on a Windows or Linux PC:

- Integrated dashboard (program, tags, drivers, HMI, historian, alarms, Parc)
- `.est` project files
- Optional MongoDB tag historian
- Default port **3090**

Develop in `est-pc/`; distribute a copy as `peaklogic-mvp-suite/` via the fork script.

## Shared core (future npm packages)

Extract when forks stabilize:

- `@peaklogic/engine`, `@peaklogic/tags`, `@peaklogic/runtime`, `@peaklogic/drivers`, `@peaklogic/programs`

## API contract (MV Client ↔ server)

Client uses `public/js/api.js`. Servers must expose `GET /api/dashboard` and the REST routes documented in the MVP Suite README.

Set client API base: `PEAKLOGIC_API_BASE=https://host/api`

**Opta Parc** defaults to `PEAKLOGIC_API_BASE=https://peaklogic.io/api` (override if needed).

## Deploy

| Product | Target | Start |
|---------|--------|-------|
| MVP Suite | Windows / Linux PC | `npm start` → :3090 |
| ST MVP | Embedded Linux / PC browser | `npm start` → web GUI + API (systemd in `deploy/`) |
| MV Client | nginx / static | `PEAKLOGIC_API_BASE=… npm start` |
| Opta Parc | nginx / static | `npm start` → :3081 (API → peaklogic.io) |
| Cloud | Linux VM / container | `npm start`; Mongo + MQTT |

## Environment

| Variable | MVP Suite | ST MVP | Client | Opta Parc | Cloud |
|----------|-----------|--------|--------|-----------|-------|
| `PEAKLOGIC_PRODUCT` | `mvp-suite` | `st-mvp` | `client` | `opta-parc` | `cloud` |
| `PEAKLOGIC_DATA` | ✓ | ✓ | — | — | ✓ |
| `MONGODB_URI` | ✓ | — | — | — | ✓ |
| `PEAKLOGIC_API_BASE` | — | — | ✓ | ✓ (default `https://peaklogic.io/api`) | — |
| `PORT` | ✓ | ✓ | ✓ | ✓ (3081) | ✓ |
