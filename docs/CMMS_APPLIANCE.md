# Integrated CMMS (appliance & cloud)

Single-tenant **integrated CMMS** ships in the PeakLogic monolith — the cloud SaaS equivalent on one site, without a separate TPS CMMS install.

**Proactive, not reactive:** CMMS receives work from three automatic sources — **PdM pending failure** (early), **alarm transitions** (urgent), and **PM schedules** (calendar). See [pdm/PDM_PROACTIVE_CMMS.md](pdm/PDM_PROACTIVE_CMMS.md).

## Where to open it

| Deployment | Entry |
|------------|--------|
| **Appliance** (3090) | Top bar **CMMS** → `/cmms` |
| **Cloud SaaS** (3100) | Cloud Studio nav **CMMS** → `/cmms` (when tenant entitlement enabled) |
| **Reports** | Link **Open CMMS**; template **PdM proactive PM work orders** |

## Features

- **Overview** — open WO count, overdue PM, alarm/PM/**PdM** WO counts
- **Work orders** — CRUD, complete, assignee from login users
- **PM schedules** — intervals, next due, generate due work orders
- **Alarm → WO** — on alarm transition (inner/outer high/low), auto-creates one open WO per tag/level (appliance; enabled by default)
- **PdM → proactive PM WO** — when failure forecast is warning/critical/failed, auto-creates one open WO per asset (`source: pdm`); priority escalates as RUL shortens (enabled by default)
- **Service history sync** — completing a PdM WO appends to PdM asset service history (when enabled)
- **MQTT bridge** — optional publish to external CMMS (`Alarms → Notification users… → CMMS / MQTT integration`)

## Work order sources

| Source | Trigger | Typical priority |
|--------|---------|------------------|
| `manual` | User creates WO | normal |
| `pdm` | PdM forecast pending failure | high → urgent |
| `alarm` | Tag alarm transition | normal → high |
| `pm` | PM schedule due | normal |

## Data

| Item | Location |
|------|----------|
| Work orders & PM | `data/cmms.json` |
| PdM asset context & service history | `data/settings.json` → `pdm.assetContext` |
| Assignees | Login users (`appliance_auth.json` or cloud tenant users) |
| Feature gate | `cmms` in Features matrix (appliance) or tenant CMMS entitlement (cloud) |

## Settings

| Key | Default | Purpose |
|-----|---------|---------|
| `cmms.autoWorkOrdersFromAlarms` | `true` | Alarm → WO bridge |
| `cmms.autoWorkOrdersFromPdm` | `true` | PdM forecast → proactive PM WO |
| `cmms.appendServiceHistoryOnWoComplete` | `true` | WO complete → PdM service history |

Configure PdM proactive options under **Historian → Logger config… → PdM → Proactive CMMS & reports**.

## API

| Method | Path |
|--------|------|
| GET | `/api/cmms/status`, `/api/cmms/dashboard`, `/api/cmms/assignees` |
| GET/POST/PUT/DELETE | `/api/cmms/work-orders`, `/api/cmms/pm-schedules` |
| POST | `/api/cmms/pm/generate-due` |
| POST | `/api/pdm/proactive/run` | Run PdM → CMMS check |
| POST | `/api/pdm/build` | Build features + proactive check |

## Testing

See [testing/CMMS_USER_TESTING.md](testing/CMMS_USER_TESTING.md) for platform checklists (Windows MVP Suite, IoT-Link Linux, Cloud SaaS).

PdM proactive path: [testing/FULL_SYSTEM_TEST.md](testing/FULL_SYSTEM_TEST.md) § PdM proactive CMMS.
