# Integrated package vs standalone CMMS

How PeakLogic and TPS CMMS deploy together on the **appliance** (est-pc `:3090`) vs **Cloud SaaS** (est-pc `:3100`) vs **standalone CMMS** (tpscmms).

## Deployment modes

```
┌─────────────────────────────────────────────────────────────────┐
│ Integrated appliance (est-pc)                                   │
│  Single Node process: PeakLogic UI + CMMS UI + shared users     │
│  Alarms → cmmsAlarmPublisher → local MQTT (optional) → in-proc  │
│  CMMS always on locally — no tenant entitlement                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Standalone edge + standalone CMMS                               │
│  PeakLogic (est-pc) ──MQTT v1──► broker ──► tpscmms subscriber  │
│  Separate processes; shared users only if configured manually   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Cloud multi-tenant (est-pc Cloud SaaS :3100)                    │
│  Platform admin enables CMMS per tenant (feature flag)          │
│  Edge appliances publish MQTT with tenantId → cloud subscriber  │
│  Tenant UI/API gated by CMMS entitlement                        │
└─────────────────────────────────────────────────────────────────┘
```

## Integrated appliance (est-pc)

- CMMS frontend mounted in the same Express app as PeakLogic.
- Default admin user seeded locally (`admin` / `admin` — change after first login).
- Users tab in System setup; alarm recipients picked from user list.
- `cmmsAlarmPublisher` publishes to MQTT for external subscribers if enabled.
- **Cloud entitlement does not apply** — the appliance is single-tenant local.

## Standalone (est-pc + tpscmms)

- PeakLogic publishes **PeakLogic CMMS Integration v1** (`docs/CMMS_INTEGRATION.md`).
- TPS CMMS runs separately; `services/peaklogicAlarmSubscriber.js` creates work orders.
- Alarming path: tag → `alarm:transition` → MQTT → `peaklogicAlarmHandler.js` → work order + `peaklogic_alarms` collection.

## Cloud multi-tenant

- **Platform admin** enables CMMS for an organization: `PATCH /api/admin/tenants/:id/cmms` with `PLATFORM_ADMIN_KEY`.
- Tenant signs in at `:3100/login` → **PeakLogic shell** with conditional **CMMS** nav module.
- CMMS web routes under `/cmms/*` (dashboard, work orders, assets, facilities, users).
- Edge MQTT ingest continues independently — subscriber uses `tenantId` from the v1 payload to scope work orders.
- Full CMMS UI port is incremental; entitlement and module shell ship first.

See `docs/CLOUD_USER_GUIDE.md`, `docs/EST_PC_PARITY.md`, and `docs/CMMS_INTEGRATION.md`.

## Recommendation

| Use case | Prefer |
|----------|--------|
| Plant floor appliance, one site | **Integrated** est-pc package |
| Existing TPS CMMS deployment, multiple sites | **Standalone** MQTT bridge |
| SaaS multi-org PeakLogic cloud | **Cloud module** + tenant gate + MQTT ingest from edge |
