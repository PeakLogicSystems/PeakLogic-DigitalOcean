# Developer mode & companion workflow

PeakLogic MVP Suite is the **appliance / plant PC** runtime. **Cursor + GitHub** are the companion for product development and version control.

## Split

| On the PC / appliance | In GitHub (open in Cursor) |
|-----------------------|----------------------------|
| Live `data/` — tags, drivers, settings, workspace, PIDs, plant-specific ST | App source (`src/`, `public/`, `views/`, `server.js`) |
| MongoDB / MQTT local secrets and broker state | Shipped ST samples (`st/`), firmware, HMI library |
| Operator HMI and scan cycle | Deploy scripts, docs, tests |
| | Deliberate **Save project…** `.est.json` exports when config should be versioned |

`data/` is ignored by git (see root `.gitignore`). Do not commit live plant state.

## Developer mode

1. Open **Project → System setup → General**.
2. Enable **Developer mode** (stored in browser `localStorage`; also written to `settings.json` on **Apply all**).
3. When on:
   - **Open in Cursor** launches the desktop IDE on this repo root
   - Tags table shows **Force** columns (commissioning I/O)
   - Logging **Archive tools** (seed / purge) are visible

## Open in Cursor

Requires the Cursor app (or `cursor` CLI on `PATH`). On Windows, default install under `%LOCALAPPDATA%\Programs\cursor` is detected automatically.

API:

- `GET /api/developer/status` — `{ cursorAvailable, root, … }`
- `POST /api/developer/open-cursor` — spawn Cursor on the product root

## Versioning tip

Use **Save project…** for portable snapshots. Prefer those exports in git over copying `data/workspace.est.json` (which may include live values).