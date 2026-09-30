# Facility Builder & HMI Composer Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** device-protocol-integration.md

This document exists in place of the `PeakLogic-AWS` artifact list's iOS/Windows-endpoint documents — this product has no native mobile/desktop client, but it does have a substantial, non-obvious client-side visual editor subsystem that deserves the same level of dedicated documentation.

## 1. Two related but distinct editors

- **HMI Composer** (`public/js/hmiSetupUi.js`, `public/js/hmi.js`, embedded in `views/dashboard.ejs` as a popup) — a tile-grid screen editor for building operator display screens: symbols, bindings, live values, alarm lists, trend charts. `window.PeaklogicHmi` (assigned at the top of `hmiSetupUi.js`) is the public API surface other modules call into.
- **Facility Builder** (`public/js/facilityDrawApp.js`, standalone page `views/facility-draw.ejs`, also embeddable via `?embedded=1`) — a site/floor-plan CAD-like tool: symbols (tanks, panels, drainfield components — see the library referenced in its UI), connections, a "Composer mode" toggle (`plan` / `grid` / `3d`) that can hand off into the HMI Composer above.

## 2. The composer-mode deep-link handoff (fixed this session — worth documenting precisely)

Facility Builder's toolbar has `.mv-composer-mode-btn` buttons for `plan`/`grid`/`3d`. `requestComposerMode(mode)` in `facilityDrawApp.js`:
- If Facility Builder is **embedded** in an iframe (`isFacilityDrawEmbedded()`), posts a `mv-composer-mode` message to the parent window — the parent (the dashboard) switches modes in-place.
- If **not embedded** (standalone page/tab), it instead does `window.location.href = '/?composerOpen=<mode>'` — a full navigation back to the main dashboard.

On the receiving end, `public/js/app.js`'s dashboard-bootstrap code reads the `composerOpen` query param and calls `PeaklogicHmi?.openComposerEditing?.(composerOpen)` — **this function did not exist anywhere in the codebase until this session.** The deep link silently stripped the query param and did nothing, leaving the user looking at a plain, unopened dashboard with no indication anything had gone wrong. Implemented as:

```javascript
async function openComposerEditing(mode) {
  await openSetupPopup();          // waits for the popup's own async settings-load to finish
  setComposerMode(mode, { skipDirty: true });
}
```

The `await` matters: `openSetupPopup()` triggers `openSetupPopupLoad()`, which fetches and applies the tenant's saved settings (including the *previously saved* composer mode) — calling `setComposerMode()` before that finishes meant the fresh server data would silently overwrite the just-requested mode a moment later. This exact race was hit and fixed live this session (traced via a temporary `console.trace()` in `setComposerMode`, confirmed the fix, then removed the trace before finalizing).

## 3. The separate popup-blocker bug in the *other* 3D feature

Distinct from the composer-mode handoff above: Facility Builder's `#mv-btn-3d` button opens a **standalone generated 3D scene** (`facility-draw/src/facilityDrawArtifacts.js`'s `writeFacilityDraw3dArtifacts()`, writing to `public/samples/<slug>-facilitydraw-3d.html` + a THREE.js-based viewer) in a new tab via an async API call (`POST /view-3d`). The original code called `window.open(data.url, ...)` *after* `await`ing that API call — modern browsers drop a `window.open()` made outside a synchronous user-gesture call stack, so the tab silently failed to open with no error, API call still succeeding. Fixed by reserving a blank tab synchronously inside the click handler (`window.open('', '_blank', 'noopener')`) before the `await`, then setting `.location.href` on that handle once the URL is known — the standard workaround for this class of bug. **Do not call `window.open()` after any `await` anywhere in this codebase's click handlers** — reserve the tab first, always.

## 4. What this document does not cover

The full HMI tile-grid binding/rendering pipeline, the symbol library's asset format (SVG-based, "3,400+ SVGs" per in-app copy), or Facility Builder's specific CAD interaction model (snap/align/connect tools) — all substantial enough for their own follow-up documents if a future session needs them.
