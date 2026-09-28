# PeakLogic MVP Suite

**All-in-one** PeakLogic for **Windows and Linux**: ST programming, integrated HMI, PLC runtime, tag historian, alarms, and MQTT Parc in a single Node application.

This folder (`est-pc`) is the **development source**. A distributable copy is generated as `peaklogic-mvp-suite/` — see [docs/PRODUCT_FORKS.md](docs/PRODUCT_FORKS.md).

- **Integrated dashboard** — program, tags, drivers, HMI, historian, alarms, Parc, **integrated CMMS**, **PdM (proactive maintenance)**, **BACnet/IP** (edge)
- **IP cameras** — ONVIF discovery (Reolink), go2rtc live streaming, GridFS snapshots, vision AI
- **Portable `.est.zip` projects** — tags, drivers, ST, HMI, MV Draw, settings in one archive
- **HTTP polling** — `GET /api/dashboard`
- **`.est` project files** — portable project export/import (includes camera inventory)

## Documentation

| Area | Path |
|------|------|
| Training (F2) | [docs/training/](docs/training/) |
| Marketing / sales PDFs | [docs/marketing/](docs/marketing/) · [peaklogic-docs](https://github.com/peaklogic/peaklogic-docs) |
| Cloud SaaS | [docs/CLOUD_SAAS.md](docs/CLOUD_SAAS.md) · [docs/CLOUD_USER_GUIDE.md](docs/CLOUD_USER_GUIDE.md) |
| Archive export (cloud fleet) | [docs/ARCHIVE_EXPORT.md](docs/ARCHIVE_EXPORT.md) |

## Start

```powershell
cd est-pc
npm install
npm start
```

`npm install` does **not** build the optional Linux HAL native addon. On embedded Linux, run `npm run build-native` when you need `native_so` / plugin drivers (see [docs/HAL.md](docs/HAL.md)).

## Green build (CI / pre-release)

```powershell
cd est-pc
npm install
npm run green
```

`npm run green` runs the full unit test suite (`node --test test/*.test.js`). Use semicolons (`;`) between commands in PowerShell — `&&` is not supported on older Windows shells.

Open **http://127.0.0.1:3090**

Press **F1** for the in-app help guide. **Training** (F2) includes PeakLogic modules M0–M15 and the IoT Condition-Based Monitoring course — see `docs/training/`. **Sales & marketing PDFs:** `docs/marketing/README.md`. **PdM → proactive CMMS:** `docs/pdm/PDM_PROACTIVE_CMMS.md`.

Toolbar: **Open project…** / **Import project file…** / **Save project** / **Save workspace** — portable **`.est.zip`** archives (legacy `.est.json` imports supported)

## IP cameras (Reolink / ONVIF)

1. Enable ONVIF (port 8000) and RTSP on each camera.
2. **Tools → Cameras** — set credentials, **Discover ONVIF**, **Probe all**.
3. Optional: `npm run go2rtc:download` then enable go2rtc in camera settings for H.264 WebRTC/MSE.
4. **HMI Setup** — place **Camera** button and pick from inventory.
5. Optional vision AI: stub backend for labs; HTTP backend for production models.

Requires MongoDB (`mongoLogger.uri` in **Historian → Logger config…**) for GridFS snapshot archive and AI history.

Full guide: [docs/CAMERAS.md](docs/CAMERAS.md)

## Layout

```
est-pc/                  # dev tree (= MVP Suite source)
  server.js              Express boot + scan engine
  src/                   engine, runtime, API, HMI, parc, logger
  views/dashboard.ejs    Integrated UI
  public/js/app.js       Client polling
  st/                    ST programs and fixtures
  data/                  Runtime persistence (cameras.json, settings)
  docs/CAMERAS.md        IP camera integration guide
```

## Camera npm scripts

| Script | Purpose |
|--------|---------|
| `npm run go2rtc:download` | Install go2rtc to `vendor/go2rtc/` |
| `npm run go2rtc:start` | Start go2rtc standalone |
| `npm run go2rtc:stop` | Stop go2rtc |

## Other products (from this tree)

| Product | Folder | When to use |
|---------|--------|-------------|
| MVP Suite | `est-pc` / `peaklogic-mvp-suite` | Full desktop app on Windows or Linux |
| ST MVP | `peaklogic-st-mvp` | Embedded Linux, API only |
| MV Client | `peaklogic-client` | UI only, remote server |
| Cloud server | `peaklogic-cloud` | Headless Linux server |

```powershell
powershell -File scripts/create-product-forks.ps1
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3090 | HTTP listen port |
| `PEAKLOGIC_PRODUCT` | `mvp-suite` | Product identifier |
| `PEAKLOGIC_DATA` | `./data` | Config/program storage |
| `MONGODB_URI` | — | MongoDB tag historian (optional) |
| `MONGODB_DB` | `peaklogic` | Historian database |
| `MONGODB_COLLECTION` | `tag_logs` | Historian collection |
| `MONGODB_SAMPLE_MS` | `5000` | Runtime pen sample interval |

## vs embedded `est`

| | **est** | **MVP Suite** (this) |
|--|---------|----------------------|
| HTTP | Node `http` | Express |
| GUI | LuCI / minimal | Full integrated dashboard |
| Live data | WebSocket | Dashboard poll |
| Target | OpenWrt / edge | Windows / Linux PC |
