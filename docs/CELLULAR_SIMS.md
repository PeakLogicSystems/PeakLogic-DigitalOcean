# Cellular SIM management

PeakLogic includes a **vendor-agnostic cellular SIM/eSIM management** layer for IoT connectivity at remote sites (Opta appliances with cellular modems, cloud gateways, etc.).

## Architecture

```
src/cellular/
  cellularSimsEnabled.js   # feature flag
  simRecordSchema.js       # normalized SIM record model
  simStore.js              # Mongo / JSON persistence
  simManager.js            # sync, activate, link orchestration
  cellularSettings.js      # vendor credentials in settings.json
  vendors/
    index.js               # adapter registry
    baseAdapter.js         # SimVendorAdapter base class
    hologram.js            # Hologram REST (live)
    twilioWireless.js      # Twilio Super SIM (live)
    jasperControlCenter.js # Cisco Control Center / Jasper shared base
    att.js                 # AT&T Control Center (live)
    verizon.js             # Verizon ThingSpace (live)
    tmobile.js             # T-Mobile Control Center (live)
    simetry.js             # Simetry / Teal Connectivity Marketplace (live)
    emnify.js              # stub + schema
    stubVendor.js          # generic stub factory
```

Each vendor implements `SimVendorAdapter`:

| Method | Purpose |
|--------|---------|
| `testConnection()` | Validate credentials |
| `listSims()` | Pull inventory → normalized snapshots |
| `activateSim(vendorSimId)` | Resume / enable data |
| `deactivateSim(vendorSimId)` | Pause / disable data |
| `getUsage(vendorSimId)` | Data usage in MB |

Normalized SIM records include: `iccid`, `imsi`, `eid`, `msisdn`, `vendor`, `vendorSimId`, `status`, `dataUsageMb`, `plan`, `deviceId`, `gatewayId`, `applianceId`, `tenantId`, `lastSyncAt`.

## Enable

| Environment | Flag |
|-------------|------|
| Cloud VM | `PEAKLOGIC_DEPLOYMENT=cloud` (default in cloud compose) |
| Local dev | `PEAKLOGIC_CELLULAR_SIMS=1` |
| Also works | `PEAKLOGIC_CLOUD_SIMS=1` (shared dev flag) |

## UI

- **Page:** `/cellular/sims` (Tools → **Cellular SIMs**)
- Vendor credential wizard, sync button, SIM table with activate/pause/usage

## API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/cellular/sims/status` | GET | Manager + store status |
| `/api/cellular/vendors/catalog` | GET | All registered vendors + config schemas |
| `/api/cellular/vendors` | GET/POST | Configured provider credentials |
| `/api/cellular/vendors/:id` | PUT/DELETE | Update/remove provider |
| `/api/cellular/vendors/:id/test` | POST | Test connection |
| `/api/cellular/sync` | POST | Pull from all enabled vendors |
| `/api/cellular/sims` | GET | List SIMs (`?sync=1` syncs first) |
| `/api/cellular/sims/:id` | GET | Single SIM |
| `/api/cellular/sims/:id/link` | PUT | Link `deviceId`, `gatewayId`, `applianceId`, `tenantId` |
| `/api/cellular/sims/:id/activate` | POST | Activate/resume via vendor API |
| `/api/cellular/sims/:id/deactivate` | POST | Pause via vendor API |
| `/api/cellular/sims/:id/usage` | GET | Refresh usage from vendor |

## Configuration

Vendor credentials live in `settings.json`:

```json
{
  "cellularSims": {
    "enabled": true,
    "vendors": [
      {
        "id": "cv_abc123",
        "vendorId": "hologram",
        "label": "Production",
        "enabled": true,
        "credentials": {
          "apiKey": "YOUR_HOLOGRAM_API_KEY",
          "orgId": "12345"
        }
      }
    ]
  }
}
```

Environment variable fallbacks (per adapter):

| Vendor | Env vars |
|--------|----------|
| Hologram | `HOLOGRAM_API_KEY`, `HOLOGRAM_ORG_ID` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| AT&T Control Center | `ATT_CONTROL_CENTER_BASE_URL`, `ATT_CONTROL_CENTER_USERNAME`, `ATT_CONTROL_CENTER_API_KEY`, `ATT_CONTROL_CENTER_ACCOUNT_ID` |
| Verizon ThingSpace | `VERIZON_APP_KEY`, `VERIZON_APP_SECRET`, `VERIZON_UWS_USERNAME`, `VERIZON_UWS_PASSWORD`, `VERIZON_ACCOUNT_NAME` |
| T-Mobile Control Center | `TMOBILE_CONTROL_CENTER_BASE_URL`, `TMOBILE_CONTROL_CENTER_USERNAME`, `TMOBILE_CONTROL_CENTER_API_KEY`, `TMOBILE_CONTROL_CENTER_ACCOUNT_ID` |
| Simetry | `SIMETRY_API_KEY`, `SIMETRY_API_SECRET`, `SIMETRY_BASE_URL`, `SIMETRY_CLIENT_UUID`, `SIMETRY_CALLBACK_URL` |

Secrets are masked (`••••••••`) in API list responses. Do not commit API keys.

### AT&T Control Center (Jasper)

Credentials from Control Center → **APIs → REST APIs → Getting Started** (base URL, username, API key, account ID).

- Auth: HTTP Basic (`username:apiKey`)
- List SIMs: `GET /rws/api/v1/devices?accountId=…&modifiedSince=…`
- Activate/deactivate: `PUT /rws/api/v1/devices/{iccid}` with `{ "status": "ACTIVATED" | "DEACTIVATED" }`
- Usage: `GET /rws/api/v1/devices/{iccid}/ctdUsages`

Sandbox base URL: `https://rws-jpotest.jasper.com/rws/api/v1` ([DevNet sandbox](https://developer.cisco.com/docs/control-center/getting-started/)).

### Verizon ThingSpace

1. **ThingSpace OAuth** — app key + secret from **My Keys**; `POST /api/ts/v1/oauth2/token` (client credentials).
2. **Connectivity Management session** — UWS username/password; `POST /api/m2m/v1/session/login` → `VZ-M2M-Token`.
3. **List devices** — `POST /api/m2m/v1/devices/actions/list` with `accountName`.
4. **Activate / suspend** — `POST /api/m2m/v1/devices/actions/activate|suspend`.
5. **Usage** — `POST /api/m2m/v1/devices/usage/actions/list` (best-effort; response shape varies by account).

### T-Mobile Control Center (Jasper)

Same REST API as AT&T Control Center. Portal URL and API key are issued by your T-Mobile for Business account; map status/usage the same way as Jasper docs above.

### Simetry (Teal Connectivity Marketplace)

API keys from Simetry Connectivity Marketplace → **Account**. Uses the Teal integration API (async queue + poll).

- Base URL: `https://integrationapi.teal.global/api/v1` ([Swagger](https://integrationapi.teal.global/swagger-ui.html))
- Auth: `ApiKey` + `ApiSecret` headers
- List SIMs: `GET /esims` → poll `GET /operation-result?requestId=…`
- Enable / disable data: `POST /esims/enable|disable` with `{ "entries": ["<eid>"] }`
- Usage: `GET /data-consumption/data?eid=…&dataType=MONTHLY&periodStart=…&periodEnd=…`
- Every request requires `requestId` (UUID) and `callbackUrl` query params; PeakLogic polls operation results (callback URL is a placeholder unless you configure webhooks separately).

Optional `clientUuid` filters inventory to one Simetry client/account.

## Vendor status

| Vendor | Adapter | Signup / docs |
|--------|---------|---------------|
| **Hologram** | **Live** | [API keys](https://dashboard.hologram.io/settings/api) · [REST docs](https://docs.hologram.io/api/v1) |
| **Twilio Super SIM** | **Live** | [Console](https://www.twilio.com/console) · [Super SIM API](https://www.twilio.com/docs/iot/supersim/api) |
| **AT&T Control Center** | **Live** (Jasper REST) | [AT&T Control Center](https://www.business.att.com/products/control-center.html) · [Cisco DevNet API](https://developer.cisco.com/docs/control-center/) |
| **Verizon ThingSpace** | **Live** (Connectivity Management) | [ThingSpace portal](https://thingspace.verizon.com/) · [Getting started](https://thingspace.verizon.com/documentation/apis/connectivity-management/getting-started.html) |
| **T-Mobile Control Center** | **Live** (Jasper REST) | [T-Mobile IoT](https://www.t-mobile.com/business/solutions/iot/connectivity-management) · [Cisco DevNet API](https://developer.cisco.com/docs/control-center/) |
| **Simetry** | **Live** (Teal async REST) | [Simetry API guide](https://simetry.freshdesk.com/support/solutions/articles/154000189151-api-access-to-connectivity-marketplace) · [Swagger](https://integrationapi.teal.global/swagger-ui.html) |
| EMnify | Stub | [docs.emnify.com](https://docs.emnify.com/developers/api) |
| Aeris | Stub | [docs.aeris.com](https://docs.aeris.com/) |
| 1NCE | Stub | [help.1nce.com/dev-hub](https://help.1nce.com/dev-hub/docs/api-reference) |
| Onomondo | Stub | [docs.onomondo.com](https://docs.onomondo.com/) |
| Telnyx IoT | Stub | [developers.telnyx.com/docs/iot](https://developers.telnyx.com/docs/iot) |

## Adding a vendor adapter

1. Create `src/cellular/vendors/myvendor.js` extending `SimVendorAdapter` or use `createStubVendorAdapter()`.
2. Register in `src/cellular/vendors/index.js` (`ADAPTERS` map + `IMPLEMENTED` set when ready).
3. Define `configSchema` with `{ key, label, required, secret? }` fields.
4. Map vendor-specific status strings via `normalizeStatus()` in `simRecordSchema.js`.
5. Add mocked tests in `test/cellularSims.test.js`.

## Persistence

- Mongo collection: `cellular_sims` (override: `PEAKLOGIC_CELLULAR_SIMS_COLLECTION`)
- Fallback: `data/cellular_sims.json`
- Indexes: `id`, `(iccid, vendor)`, `deviceId`, `tenantId`

## Integration

Link SIMs to PeakLogic devices after sync:

```bash
curl -X PUT http://127.0.0.1:3090/api/cellular/sims/<sim-id>/link \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"opta_012355b52d66a109ee","gatewayId":"appliance-uuid","tenantId":"acme"}'
```

Use Parc `deviceId` from the MQTT registry or `cloudRemote.gatewayId` from appliance pairing.

## Tests

```bash
PEAKLOGIC_CELLULAR_SIMS=1 npm test -- test/cellularSims.test.js
```

Uses mocked `fetch` — no live API keys required.
