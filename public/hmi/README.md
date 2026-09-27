# PeakLogic HMI — SVG graphics

Graphics are organized under `svg/library/` by function, with demo screens in `svg/demos/`.

## Library groups (HMI Setup → Group filter)

| Group | Path | Contents |
|-------|------|----------|
| **Demos** | `demos/` | Built-in PeakLogic demo screens |
| **Controls — Pilot lights** | `library/controls/pilot-lights/` | PeakLogic `light_symbol*`, `pl_*` |
| **Controls — Push buttons** | `library/controls/push-buttons/` | PeakLogic `roundsymbol_*`, `pb_*` |
| **Controls — Switches** | `library/controls/selector-switches/` | PeakLogic selector switches |
| **Gauges & meters** | `library/gauges-meters/` | Dials, bar graphs, columns, needles |
| **Charts & trends** | `library/charts-trends/` | Strip charts, trend areas |
| **Numeric displays** | `library/numeric-displays/` | Bezels, display panels, numeric entry |
| **PID faceplates** | `library/pid-faceplates/` | Ready-made PID loop faceplate |
| **Process equipment** | `library/process-equipment/` | Tanks, motors, conveyors, etc. |
| **Pumps / Valves / Tanks / Piping** | `library/pumps/`, `valves/`, … | Equipment by type |
| **Animations** | `library/animations/` | PeakLogic GIF/PNG gauge animations |
| **Text & labels** | `library/text-labels/` | PeakLogic text widgets |

Full index: `svg/graphics-catalog.json` · Legacy path redirects: `svg/path-aliases.json`

## PID faceplate

PeakLogic includes a ready-made PID loop faceplate:

**`/hmi/svg/library/pid-faceplates/peaklogic/pid_loop_standard.svg`**

Bind element ids: `pv_dial`, `pv_value`, `sp_value`, `out_bar_fill`, `out_value`, `mode_auto`, `mode_manual`, `alarm_hi`, `alarm_lo`.

**Build-your-own parts** (see `svg/pid-faceplate-index.json`):

| Part | Path |
|------|------|
| Dial + needle | `library/gauges-meters/standard/peaklogic/editable/gaugedial_3d_h1.svg` + `gaugeneedle.svg` |
| Bar graph (OUT) | `library/gauges-meters/standard/peaklogic/editable/bargraph.svg` |
| Numeric bezel (SP/PV) | `library/numeric-displays/bezels/peaklogic/bezel_digit_*.svg` |
| Trend strip | `library/charts-trends/strip-charts/peaklogic/` |
| Control valve + gauge | `library/gauges-meters/standard/peaklogic/editable/controlvalvewgauge.svg` |

## Refresh / reorganize

```bash
npm run download-opto-svgs        # import staging → peaklogic-import/
npm run download-mblogic-svgs      # import staging → library/.../peaklogic/
npm run organize-hmi-graphics      # Classify + move new assets
node scripts/organize-hmi-graphics.js --catalog-only   # Rebuild index only
```

## Demo screens

- `demos/demo_controls.svg` — PeakLogic pilot + start/stop samples (DI1 / Q1)
- `demos/demo_process.svg` — Tank / pump / valve process demo

## Grid composer (configurable layout)

Per screen in **HMI Setup → Grid layout**:

- **Columns / rows** (1–24 each; default **8×8**)
- **Cell width / height** in px (default **128×100** → **1024×800** display)
- **Col span / row span** on placement for oversized graphics (anchor = top-left cell)
- **Display limit X / Y** — max viewport size for live HMI and preview (default matches logical size)
- **Fit in viewport** — **Stretch** fills limit X×Y (horizontal + vertical); **Contain** keeps aspect inside the limit
- **Navigation button** object: label + target screen; works on live HMI and in setup preview

Each grid **anchor cell** can hold up to **5 stacked layers** (Z0 = back … Z4 = front):

| Kind | Purpose | Typical binding |
|------|---------|-----------------|
| **staticImage** | Decorative SVG/GIF/PNG | none |
| **staticText** | Fixed caption / label | optional (usually none) |
| **dynamicText** | Numeric or string from tag | `text` (+ format for INT/REAL) |
| **dynamicImage** | State overlay (run/stop/warning/fault/offline) | `visibility`, `fill`, or `class` per layer |
| **navButton** | Page / screen change | none (uses `targetScreenId`) |
| **pageHotspot** | Transparent page navigation (Z1–4) | none (uses `targetScreenId`; optional composer label) |
| **flashOverlay** | Flashing semi-transparent alarm highlight (Z1–4) | optional `visibility` on `…__flash_overlay` or layer `tagId` |

Example: five pilot images in one cell at Z0–Z4, each bound to a BOOL (or one INT with `fill8`) so only the active state shows.

Legacy screens (`tile.svg` only) load as a single Z0 layer. Saved as `tile.layers[]` in project settings.
