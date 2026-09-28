# PdM → proactive CMMS (fix before breakdown)

**North star:** PeakLogic is **proactive, not reactive**. PdM detects degradation early; CMMS schedules the fix **before** failure — not after an alarm or overflow call.

## Flow

```
Edge AI + SCADA historian
  → PdM feature windows (pdm_features)
  → Failure forecast (warning / critical / failed)
  → CMMS proactive PM work order (source: pdm)
  → Technician completes WO
  → Service history appended to PdM asset context
  → Next forecast reflects the repair
```

## When a work order is created

After feature build (nightly batch, **Build features now**, or **Seed demo data**), PeakLogic evaluates each mapped asset:

| Forecast severity | Action |
|-------------------|--------|
| **ok** / **unknown** | No auto WO |
| **warning** (≤30 days RUL) | Create or update open WO — priority **high** |
| **critical** (≤7 days) | Priority **urgent** |
| **failed** (at/past threshold) | Priority **urgent**, due at predicted failure |

- **One open WO per asset** — deduped by `sourceRef: pdm:{assetId}`
- **Escalation** — if severity worsens, priority and description update on the existing WO
- **Title example:** `Proactive PM: pump-2 (restaurant) — pending failure`

## Settings (`data/settings.json`)

```json
{
  "cmms": {
    "autoWorkOrdersFromAlarms": true,
    "autoWorkOrdersFromPdm": true,
    "appendServiceHistoryOnWoComplete": true
  },
  "pdm": {
    "buildEnabled": true,
    "buildIntervalHours": 24,
    "reportEnabled": false,
    "reportIntervalHours": 168,
    "reportTitle": "PdM Report"
  }
}
```

Configure in **Historian → Logger config… → PdM** under **Proactive CMMS & reports**.

## UI

| Action | Where |
|--------|--------|
| Configure assets (motor type, location, service history) | **Historian → Logger config… → PdM** |
| Enable proactive PM | Checkbox **Issue CMMS PM on pending PdM failure** |
| Manual check | **Run proactive CMMS check** |
| View work orders | Top bar **CMMS** → `/cmms` (filter source **pdm**) |
| Download report | **Download PdM PDF** or **Report** with PdM source |

## Service history feedback

When a PdM-sourced work order is marked **complete**, PeakLogic appends a `pdm_pm` (or inferred type) entry to `pdm.assetContext[assetId].serviceHistory`. This persists in the project `.est.zip` on save.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/pdm/build` | Build features + run proactive CMMS |
| POST | `/api/pdm/proactive/run` | Run proactive check only (`assetId` optional) |
| POST | `/api/pdm/report/pdf` | Download/store PdM PDF for one asset |
| GET | `/api/pdm/view?asset=` | Forecast + RUL for UI |

## Reports

- **Historian / Report** — PdM PDF with forecast and asset setup sections
- **Scheduled reports** — when `pdm.reportEnabled`, nightly batch stores PDFs in GridFS
- **Mongo report templates** — *PdM proactive PM work orders*, *PdM feature health (MongoDB)*

## vs alarm-driven CMMS

| Trigger | Timing | Source |
|---------|--------|--------|
| **PdM forecast** | Days–weeks before failure | `pdm` |
| **Alarm transition** | Condition already out of limits | `alarm` |
| **PM schedule** | Calendar interval | `pm` |

All three can coexist. PdM is the **early warning** layer; alarms are the **last line**.

## Lift-station assets

Duplex lag pumps (`pump-2`), location class (strip_mall, restaurant, …), and install/service history affect sim wear rates and forecast context. See [LIFT-STATION-PDM-TRAINING-REVIEW.md](./LIFT-STATION-PDM-TRAINING-REVIEW.md).

## Related

- [CMMS_APPLIANCE.md](../CMMS_APPLIANCE.md) — integrated `/cmms` UI
- [CMMS_INTEGRATION.md](../CMMS_INTEGRATION.md) — external MQTT bridge (separate)
- [testing/FULL_SYSTEM_TEST.md](../testing/FULL_SYSTEM_TEST.md) — verification checklist
- **Help (F1)** → PdM, Integrated CMMS
