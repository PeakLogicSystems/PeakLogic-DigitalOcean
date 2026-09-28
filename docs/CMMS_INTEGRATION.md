# PeakLogic CMMS Integration v1

PeakLogic is the **authoritative source** for alarm MQTT integration. CMMS systems (including TPS CMMS) **subscribe** to PeakLogic-published topics; PeakLogic does not adapt to undocumented CMMS formats.

**Integrated `/cmms` (same process):** Alarm and **PdM proactive** work orders are created in `data/cmms.json` without MQTT. PdM → CMMS is documented in [pdm/PDM_PROACTIVE_CMMS.md](pdm/PDM_PROACTIVE_CMMS.md). External MQTT bridge below is optional and separate.

## Direction

```
Tag alarm → alarm:transition → cmmsAlarmPublisher → MQTT broker → CMMS subscriber
```

## MQTT topics

Given `topicPrefix` (default `peaklogic/v1`) and `siteId` (default `local`):

| Topic | Purpose |
|-------|---------|
| `{topicPrefix}/{siteId}/alarms` | Alarm transition event only |
| `{topicPrefix}/{siteId}/alarm-notify` | Alarm + filtered notification recipients |

**Examples** (site `plant-a`):

- `peaklogic/v1/plant-a/alarms`
- `peaklogic/v1/plant-a/alarm-notify`

QoS defaults to **1**. Broker URL defaults to `mqtt://127.0.0.1:1883` (same as Parc).

## JSON schema: `peaklogic-cmms-integration-v1`

### Envelope (both topics)

```json
{
  "schema": "peaklogic-cmms-integration-v1",
  "publishedAt": "2026-06-14T18:30:00.000Z",
  "siteId": "plant-a",
  "tenantId": "local",
  "source": "peaklogic",
  "projectName": "line_a",
  "alarm": {
    "tagId": "TANK1_LEVEL",
    "level": "outerHigh",
    "previousLevel": "innerHigh",
    "value": 92.5,
    "since": 1718389800123
  }
}
```

### `alarm-notify` topic (adds recipients)

```json
{
  "schema": "peaklogic-cmms-integration-v1",
  "publishedAt": "2026-06-14T18:30:00.000Z",
  "siteId": "plant-a",
  "tenantId": "local",
  "source": "peaklogic",
  "projectName": "line_a",
  "alarm": {
    "tagId": "TANK1_LEVEL",
    "level": "outerHigh",
    "previousLevel": "innerHigh",
    "value": 92.5,
    "since": 1718389800123
  },
  "recipients": [
    {
      "id": "uuid",
      "email": "operator@plant.test",
      "role": "operator",
      "active": true,
      "profile": {
        "displayName": "Pat Operator",
        "firstName": "Pat",
        "lastName": "Operator",
        "title": "Shift lead",
        "department": "Operations",
        "phone": "",
        "mobile": "+15550100",
        "locale": "en-US",
        "timezone": "America/New_York",
        "alarmNotifications": {
          "enabled": true,
          "email": true,
          "sms": false,
          "push": false,
          "minLevel": "inner",
          "emailAddress": "",
          "phone": "+15550100",
          "quietHours": {
            "enabled": false,
            "start": "22:00",
            "end": "07:00",
            "timezone": "America/New_York"
          }
        }
      },
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

Recipients are PeakLogic **public user** rows, filtered by `shouldNotifyForLevel` and quiet hours (same rules as local email/SMS queue).

## Alarm levels

`innerLow`, `innerHigh`, `outerLow`, `outerHigh`, `alarm` (BOOL), `normal` (clear — not published on transition into alarm).

## PeakLogic configuration

### UI

**Alarms → Notification users… → CMMS / MQTT integration**

- Enable CMMS MQTT publish
- Broker URL, site ID, tenant ID, topic prefix, client ID
- Toggle each topic

### `data/settings.json`

```json
{
  "cmmsIntegration": {
    "enabled": true,
    "brokerUrl": "mqtt://127.0.0.1:1883",
    "topicPrefix": "peaklogic/v1",
    "siteId": "plant-a",
    "tenantId": "acme",
    "clientId": "peaklogic-cmms",
    "qos": 1,
    "publishAlarmTopic": true,
    "publishNotifyTopic": true
  }
}
```

### API

`PUT /api/settings` with body `{ "cmmsIntegration": { ... } }`

## TPS CMMS implementer notes

TPS CMMS today ingests IoT via HTTP/MongoDB rules (`routes/iot.js`). To consume PeakLogic alarms:

1. Subscribe to `peaklogic/v1/{siteId}/alarm-notify` on your MQTT broker.
2. On message, parse `schema === "peaklogic-cmms-integration-v1"`.
3. Create or update a work order from `alarm` + optional `recipients[0]` assignee hints.
4. Map `alarm.level` to CMMS priority: e.g. `outerHigh`/`alarm` → `high` or `critical`.

See `C:\Users\Public\data\tpscmms\docs\PEAKLOGIC_CMMS.md` for a minimal subscriber checklist.

## Cloud multi-tenant (est-pc Cloud SaaS)

Cloud SaaS runs from **est-pc** on port **3100** (`npm run start:saas` locally; `peaklogic-saas` systemd unit in production). TPS CMMS / integrated CMMS is a first-class module enabled **per tenant** by platform administration — not bundled for every signup.

| Mode | CMMS availability |
|------|-------------------|
| **Integrated appliance** (est-pc `:3090`) | CMMS UI runs in-process; always available locally; cloud entitlement N/A |
| **Standalone edge + cloud CMMS** | Edge publishes MQTT v1; cloud subscriber ingests with `tenantId` from payload |
| **Cloud tenant** (`:3100`) | CMMS routes gated by tenant entitlement; platform admin enables per org |

Tenant users see CMMS routes only when entitled on `GET /api/tenant` / `GET /api/auth/me`. PeakLogic CMMS Integration v1 MQTT from edge appliances is unchanged — cloud ingest does not require the tenant UI flag, but product UI should respect entitlement.

See **`docs/CLOUD_USER_GUIDE.md`** (tenant operators) and **`docs/EST_PC_PARITY.md`** (edge vs cloud matrix). Platform admin runbook: **`docs/CLOUD_DEPLOY_DO.md`**.

## Code references (est-pc)

| File | Role |
|------|------|
| `src/integrations/cmmsAlarmPublisher.js` | Payload builder + MQTT publish |
| `src/settings/cmmsIntegrationSettings.js` | Settings normalization |
| `src/runtime/applianceServices.js` | `alarm:transition` hook |
| `src/users/userProfileSchema.js` | Recipient profile shape |
