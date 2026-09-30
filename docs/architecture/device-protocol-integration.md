# Device & Protocol Integration Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** multi-tenant-deployment-modes.md

## 1. Driver framework

`src/drivers/index.js` is the registry point; every protocol driver implements against a common interface consumed by `src/engine/` (the ScanEngine, per `docs/ARCHITECTURE.md`'s monolith diagram) and `src/drivers/driverConfig.js` (per-tag/device driver configuration). `src/drivers/mockDriver.js` exists for demo/test data without real hardware.

## 2. Protocols and vendor integrations present in `src/drivers/`

| Protocol/vendor | Files | Notes |
|---|---|---|
| BACnet/IP | `bacnetClient.js`, `bacnetDiscovery.js`, `bacnetDriver.js`, `bacnetDeviceBuilder.js`, `bacnetApplyProfile.js`, `bacnetProfileStore.js`, `bacnetTagSync.js` | Edge-only per `docs/ARCHITECTURE.md`'s deployment table — see `docs/BACNET.md` for the feature-level guide |
| Modbus | `modbusDriver.js`, `modbusBridge.js`, `modbusMove.js` | Uses the `modbus-serial` npm dependency |
| MQTT | `mqttDriver.js`, `mqttParcOptaDriver.js`, `mqttSimDriver.js`, `mqttSimHub.js` | "Parc" is this codebase's name for its MQTT-based device fleet layer (see `docs/MQTT_PARC.md`) — "Opta" refers to Arduino Opta PLC hardware, a specific fleet target |
| HAL (native) | `halDriver.js`, `nativeSoDriver.js` | Optional native addon for embedded-Linux hardware access — see `docs/HAL.md`, built via `npm run build-native` |
| NextCentury (submetering) | `nextcenturyDriver.js`, `nextcenturyAuth.js`, `nextcenturyTagSync.js`, `nextcenturyCloudSizing.js`, `nextcenturyDeployEstimate.js`, `nextcenturyConstants.js` | A specific third-party vendor integration with its own portal/auth (`src/routes/nextcenturyPortal.js`) — the most heavily-represented single vendor in the driver tree, suggesting a real, significant customer relationship rather than a demo integration |
| Pool equipment | `haywardDriver.js`/`haywardProtocol.js`, `jandyDriver.js`/`jandyProtocol.js` | Residential/commercial pool automation vendors — corroborates the residential-pool demo data seen in `test/fixtures/` and `docs/RESIDENTIAL_POOL_SPA.md` |
| Generic HTTPS | `httpsDriver.js` | Catch-all for HTTP(S)-API-based devices |

## 3. Cameras (adjacent but distinct subsystem)

`src/cameras/` — ONVIF discovery, go2rtc live streaming proxy, GridFS snapshot storage. The HMI-embedded live-view popup (`HmiView.openCameraPopup`/`closeCameraPopup` in `public/js/hmi.js`, wired from the topbar Camera menu and the Cameras admin "Test" button) was **entirely non-functional until this session** — both functions were called via optional chaining (`window.HmiView?.openCameraPopup?.(...)`) against a `HmiView` object that never defined them, so every call silently no-opped. Fixed this session; see `CHANGELOG.md` and `technical-debt-register.md` for the broader pattern this bug represents.

## 4. Cellular / eSIM fleet (not a field-device protocol, but adjacent)

`src/cellular/` — vendor-agnostic `SimVendorAdapter` pattern with real adapters for Hologram and Twilio Super SIM (`src/cellular/vendors/`). See `docs/CELLULAR_SIMS.md`.

## 5. A recurring bug pattern worth naming

Both bugs found and fixed this session in this general area (camera popup, and Facility Builder's `openComposerEditing` deep link — see `facility-builder-hmi-composer.md`) had the identical shape: a function called via `window.SomeObject?.someMethod?.(...)`, where `someMethod` was never actually implemented anywhere in the codebase, so the call silently did nothing with no console error. **When debugging "this button does nothing" with no visible error, grep for the exact method name across `public/js/` before assuming the bug is elsewhere** — a missing implementation behind optional chaining is a real, repeated failure mode in this codebase, not a one-off.

## 6. What this document does not cover

The ScanEngine's actual scan-cycle timing/scheduling logic (`src/engine/`) — not read in this pass. Tag-to-device binding configuration UI — see `facility-builder-hmi-composer.md` and the existing `docs/*.md` device guides (`docs/devices/`).
