# PeakLogic architecture

## Strategy (current)

**Appliance and Cloud SaaS share one codebase** (`est-pc`). Deployment mode is set by `PEAKLOGIC_DEPLOYMENT`:

| Mode | Port | Guide |
|------|------|-------|
| Appliance (edge) | 3090 | Default — site PC, IoT-Link |
| Cloud hub | 3090 | `npm run start:cloud` — MQTT ingest |
| **Cloud SaaS** | **3100** | [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md) — DO droplet multi-tenant |

Goal: **nearly identical Studio UI and API**; field buses that need LAN stay on the edge appliance.

| | Appliance (PC / Linux) | Cloud SaaS (DO) |
|--|------------------------|-----------------|
| **Processes** | 1 monolith (`server.js`) | 1 monolith per droplet (nginx → 3100) |
| **Scale** | Single site, local I/O | Multi-tenant orgs + site agents |
| **Data** | `data/*.json` + optional Mongo | DO Managed Mongo + tenant JSON/Mongo |
| **Users** | `appliance_auth.json` login | `cloud_tenants.json` org login |
| **Tenant** | Synthetic `tenantId: local` | Real tenant per organization |
| **Alarm notify** | In-process + notification profiles | Same + CMMS entitlement |

Set `PEAKLOGIC_DEPLOYMENT=appliance` (default) or `cloud`. Health: `GET /health` returns `deployment` and `tenantId`.

---

## Monolith layout (appliance)

```
server.js
  ├── Express API (/api/*) + EJS dashboard
  ├── TagStore + ScanEngine + drivers
  ├── eventBus (in-process)
  └── applianceServices → alarm notifier, (future: historian hooks)
```

### Event seam

`TagStore` emits **`alarm:transition`** on new or escalated alarms:

```javascript
{ tagId, level, previousLevel, value, since }
```

On appliance, `applianceServices` subscribes and calls `alarmNotifier` (user profile queue).

On cloud, the same payload will be published to a message bus; a dedicated **alarm + notification VM** will consume it and fan out email/SMS using tenant user profiles.

No direct `tagStore → alarmNotifier` coupling — keeps PC and cloud wiring aligned.

---

## Appliance completion checklist

Use this on PC/Linux before shifting focus to cloud.

| Area | Status | Notes |
|------|--------|-------|
| ST runtime + scan | Done | |
| Tags, drivers, alarms (annunciator) | Done | |
| User profiles + alarm prefs | Done | System setup → Users |
| Alarm notify queue | Done | Delivery (SMTP/SMS) TBD |
| Historian (Mongo) | Done | Optional local Mongo |
| MQTT fleet / Parc | Done | |
| PdM batch | Done | Nightly features + proactive CMMS + optional scheduled PDF |
| Proactive CMMS bridge | Done | PdM forecast → `/cmms` WO; WO complete → service history |
| HMI composer | Done | |
| `.est` project export | Done | |
| Event bus seam | Done | `src/runtime/eventBus.js` |
| Auth (optional local) | Open | Single-operator default; token optional |
| Email/SMS delivery | Open | Queue exists; wire SendGrid/Twilio later |

---

## Cloud roadmap (after appliance)

Planned VM split (same domain code, different `main.js`):

1. **Ingestion** — MQTT, device drivers, tag updates, historian writes  
2. **Alarm + notify** — `alarm:transition` consumer, user prefs, outbound channels  
3. **GUI API** — multi-user REST/WS, HMI CRUD, auth  
4. **AI** — PdM features, DO AI or external inference  

Shared packages (future): extract `userProfileSchema`, `tagStore`, alarm evaluation, and API routers from `est-pc` so cloud imports them instead of forking.

Limits today: 1k locations / systems / devices per tenant (configurable). Target: 10M devices, 10K users with sharded ingestion and stream-based alarm evaluation.

### Cloud sim management (Phase 1)

Virtual Opta/Modbus devices for cloud demo and test:

- **Store:** `src/cloud/simStore.js` — Mongo `cloud_sims` or `data/cloud_sims.json`
- **Runner:** `src/cloud/simRunner.js` — in-process MQTT publisher to tenant Parc topics
- **API/UI:** `/api/cloud/sims`, page `/cloud/sims` (enabled when `PEAKLOGIC_DEPLOYMENT=cloud` or `PEAKLOGIC_CLOUD_SIMS=1`)
- **Phase 2:** k8s sim workers, Modbus TCP slaves, tenant quotas, auto driver provisioning

See `deploy/cloud/README.md` for VM usage.

### Cellular SIM management (vendor APIs)

IoT SIM/eSIM inventory from Hologram, Twilio Super SIM, and extensible vendor registry:

- **Store:** `src/cellular/simStore.js` — Mongo `cellular_sims` or `data/cellular_sims.json`
- **Adapters:** `src/cellular/vendors/` — vendor-agnostic `SimVendorAdapter` pattern
- **API/UI:** `/api/cellular/sims`, `/api/cellular/vendors`, `/api/cellular/sync`, page `/cellular/sims`
- **Enabled:** `PEAKLOGIC_DEPLOYMENT=cloud` or `PEAKLOGIC_CELLULAR_SIMS=1`

See `docs/CELLULAR_SIMS.md` for credentials and adding new vendors.

---

## Debugging on PC or Linux

```bash
cd est-pc
npm install
npm start          # http://127.0.0.1:3090
npm run green      # full test suite
```

Linux appliance: same tree; use `PEAKLOGIC_DATA` for persistent data dir. Optional `npm run build-native` for HAL plugins.

Cloud API (when needed): **est-pc Cloud SaaS** on port **3100** (`npm run start:saas`) — same codebase as the appliance. See `docs/EST_PC_PARITY.md`; do not block appliance work on cloud parity until the checklist above is satisfied.
