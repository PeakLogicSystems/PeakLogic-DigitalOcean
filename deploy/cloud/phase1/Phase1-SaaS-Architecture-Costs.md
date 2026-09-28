# PeakLogic Phase 1 — SaaS Architecture, Limits & Cost Model

**500 devices · 32 camera/appliance uplinks · NYC1 Phase 1 topology · 2026**

**Document version:** 1.0 · Run `npm run build:phase1-saas-architecture-pdf` for build date

**A company powered by The Purple Standard** · [purple-standard.com](https://purple-standard.com)

---

## Executive summary

Phase 1 production topology for PeakLogic Cloud SaaS: **three DigitalOcean droplets** (SaaS, dedicated MQTT, archive) plus **Managed MongoDB**. This document adds **device/tag capacity limits** and a **2026 cost model** for a fleet of **500 field-service devices** and **32 camera/appliance cellular uplinks**.

| Category | Monthly | Annual |
|----------|---------|--------|
| **Gross renewal revenue** (500 × $10/mo) | **$5,000** | **$60,000** |
| DO Phase 1 cloud stack | ~$93 | ~$1,119 |
| Cellular — 500 field devices ($2 SIM + $0.50/50 MB) | **$1,250** | **$15,000** |
| Cellular — 32 cameras/appliances ($2 SIM + $5/1 GB) | **$224** | **$2,688** |
| **Total infrastructure (cloud + cellular)** | **~$1,567** | **~$18,807** |
| **Contribution after infra** | **~$3,433** | **~$41,193** |
| **Infra as % of revenue** | **~31.3%** | **~31.3%** |

At 500 devices, cloud infrastructure alone remains **~1.9% of revenue**; cellular field connectivity dominates operating cost at **~29.5%**.

---

## Phase 1 architecture

```
                         Internet
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        DO FW SaaS     DO FW MQTT     DO FW Archive
        22/80/443      22+1883/8883   22+8090 (SaaS IP)
              │              │              │
       ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
       │ saas        │ │ mqtt       │ │ archive    │
       │ nginx→3100  │ │ Mosquitto  │ │ Node :8090 │
       │ 4 GB droplet│ │ 2 GB       │ │ 2 GB+disk  │
       └──────┬──────┘ └─────▲──────┘ └─────▲──────┘
              │ mongodb+srv  │              │
       ┌──────▼──────┐       │              │
       │ Managed     │  Opta / IoT-Link /   │ compact job
       │ MongoDB     │  site appliances     │ from SaaS
       │ 10–20 GB    │  ──MQTT 8883──►      │
       └─────────────┘                      │
              └──── ARCHIVE_SERVER_URL ─────┘
```

### Data & control flow

```
Tenant operator ──HTTPS──► nginx :443 ──► SaaS server.js :3100
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              tenantStore   TagStore   Mongo historian
              cloud_sites   ScanEngine  (7-day hot)
                    │           │
                    └─────┬─────┘
                          │ MQTT client
                          ▼
              mqtt.peaklogic.io :8883 (Mosquitto)
                          ▲
          ┌───────────────┼───────────────┐
          │               │               │
    Opta firmware   IoT-Link gateway   Site appliance :3090
    (Parc telemetry) (cellular uplink) (cameras + agent)
```

### SaaS application stack (:3100)

| Layer | Components |
|-------|------------|
| **Auth** | `/login` — org + email; `tenantStore`; JWT/session; roles (operator, tenant_admin, platform_admin) |
| **Cloud Studio** | ST program, tags, HMI, drivers, alarms, historian — same runtime as appliance |
| **Fleet** | `/sites` pairing, site agent heartbeat, `/fleet` map, `/sites/devices` inventory |
| **Integrations** | CMMS entitlement, Cloud Sims, Cellular SIM vendor registry |
| **Runtime core** | `TagStore` → `ScanEngine` → `DriverManager`; `eventBus` → `alarmNotifier` |
| **Data** | `cloud_tenants.json` / Mongo; `cloud_sites.json`; `/var/lib/peaklogic` workspace; Mongo historian |

---

## Phase 1 capacity limits (max)

Directional limits for a **single Phase 1 stack** before the next DO tier or VM split (see `ARCHITECTURE.md`).

### Platform & tenant limits

| Resource | Phase 1 max (configured) | Phase 1 recommended @ 500 devices | Notes |
|----------|------------------------|-----------------------------------|-------|
| **Devices per tenant** | **1,000** | 500 | Configurable tenant quota; `ARCHITECTURE.md` |
| **Locations / sites per tenant** | **1,000** | ~50–200 | Sites = paired edge appliances |
| **Users per tenant** | **10,000** (target) | 5–50 | Cloud target scale |
| **Tenants on one stack** | **~10–50** (directional) | 1–5 | Depends on aggregate device count |
| **MQTT connections (broker)** | **~2,000** (2 GB droplet) | 532 | 500 field + 32 uplink + overhead |
| **Historian pens (hot Mongo)** | **~50,000 tags** (Mongo tier) | **~3,000** | 500 devices × ~6 pens |

### Tag limits (`PEAKLOGIC_MAX_TAGS`)

| Profile | Calculation | Max tags |
|---------|-------------|----------|
| **Cloud default** (NextCentury planning) | 15 sites × 1,500 devices × 3 tags + 2, +5% headroom | **70,912** |
| **500-device fleet** (typical) | 500 × 6 pens + 2, +5% headroom | **3,328** |
| **500-device fleet** (minimal) | 500 × 3 pens + 2, +5% headroom | **1,664** |
| **Appliance (edge PC)** | Default | **4,096** |

Override at deploy time: `PEAKLOGIC_MAX_TAGS=3328` in `/etc/peaklogic/saas.env`.

### Device counts @ 500-device reference fleet

| Device class | Count | Uplink | Data plan |
|--------------|-------|--------|-----------|
| **Field-service monitors** (Opta / IoT-Link) | **500** | Cellular MQTT | $2/SIM + $0.50 per 50 MB/mo |
| **Camera / appliance uplinks** (MVP Suite site agents) | **32** | Cellular | $2/SIM + $5 per 1 GB/mo |
| **Total MQTT endpoints** | **532** | — | — |

### Storage & ingest @ 500 + 32

| Layer | Field fleet (500 × 50 MB/mo) | Camera/appliance (32 × ~100 MB/mo est.) | Combined |
|-------|------------------------------|-------------------------------------------|----------|
| Monthly ingest | **25 GB** | **~3.2 GB** | **~28 GB** |
| Hot Mongo (7-day rolling) | ~5.8 GB | ~0.7 GB | **~6.5 GB** |
| Archive Year 1 cumulative | ~300 GB | ~38 GB | **~338 GB** |

Hot tier (~6.5 GB) fits within the **15 GB** base Managed Mongo plan. Archive volume: start **200 GB**, add **~150 GB** (~$15/mo) before month 12.

### When to scale beyond Phase 1

| Signal | Threshold | Next step |
|--------|-----------|-----------|
| Devices per tenant | > **1,000** | Tenant shard or second SaaS node |
| Total fleet devices | > **~2,000** on one MQTT droplet | Dedicated ingest VM or broker cluster |
| Tag count | > **70,912** (or env cap) | Raise `PEAKLOGIC_MAX_TAGS`; scale Mongo compute — see **`Phase1-Tag-Scaling-1M-5M-25M.md`** |
| Hot Mongo | > **15 GB** steady | Add scalable storage ($0.215/GiB/mo) |
| Archive | > **500 GB** | Expand block volume; consider object storage |
| SaaS CPU/RAM | Sustained >70% on 4 GB | Step to 8 GB droplet ($48/mo) |

Long-term target (`ARCHITECTURE.md`): **10M devices, 10K users** with sharded ingestion and VM split (ingestion · alarms · GUI · AI).

**ALF large-tag fleets:** 60 campuses × 4,000 on-prem tags — use **rollup site-agent sync** (~600 cloud tags/campus). Full mirror breaks default **70,912** tag cap at ~18 campuses. See `PeakLogic-Infrastructure-Projections.md` Part 10.

---

## Cloud infrastructure cost @ 500 devices

DigitalOcean list pricing (Aug 2026). See also `DO-Phase1-Storage-Cost-Review.md`.

| Component | Monthly | Annual |
|-----------|---------|--------|
| SaaS 4 GB droplet | $24 | $288 |
| MQTT 2 GB droplet | $12 | $144 |
| Archive 2 GB droplet | $12 | $144 |
| Archive volume (~338 GB Y1 avg) | ~$34 | ~$408 |
| Managed Mongo (15 GB base) | $15.23 | $183 |
| **Cloud subtotal** | **~$97** | **~$1,167** |

**Per device (cloud only):** ~**$0.19/device/month** (~**$2.33/device/year**) — **1.9% of $10/mo renewal**.

---

## Cellular cost — field service fleet (500 devices)

Assumes each monitored asset uses one IoT SIM for MQTT Parc uplink.

| Line | Rate | Monthly | Annual |
|------|------|---------|--------|
| SIM fee | $2.00/device/mo | $1,000 | $12,000 |
| Data (50 MB/mo included plan) | $0.50/device/mo | $250 | $3,000 |
| **Field fleet subtotal** | **$2.50/device/mo** | **$1,250** | **$15,000** |

**Per device:** $2.50/mo (**25% of $10/mo renewal**).

*50 MB/mo is sufficient for sparse telemetry (5 s sample, compressed Parc JSON). High-rate PdM or firmware OTA may require higher data tiers.*

---

## Cellular cost — camera / appliance uplinks (32 units)

Site appliances (MVP Suite on **3090**) with cellular for site-agent heartbeat, inventory sync, and remote camera proxy.

| Line | Rate | Monthly | Annual |
|------|------|---------|--------|
| SIM fee | $2.00/unit/mo | $64 | $768 |
| Data (1 GB/mo plan) | $5.00/unit/mo | $160 | $1,920 |
| **Camera/appliance subtotal** | **$7.00/unit/mo** | **$224** | **$2,688** |

**Per unit:** $7.00/mo. These 32 units are typically **enterprise/campus** sites (ALF, multi-building) — often billed at higher SaaS tiers; shown here for infra planning only.

*1 GB/mo supports site-agent heartbeat, inventory sync, and occasional camera thumbnail/live-view proxy. Continuous HD streaming requires a higher tier or local LAN-only cameras.*

---

## Combined cost & margin (2026 reference fleet)

Fleet: **500 field devices** + **32 camera/appliance uplinks** · renewal **$10/device/mo** on the 500 field assets.

| | Monthly | Annual | % of $5,000/mo revenue |
|--|---------|--------|------------------------|
| Gross renewal revenue (500 × $10) | $5,000 | $60,000 | 100% |
| DO Phase 1 cloud stack | −$97 | −$1,167 | 1.9% |
| Cellular — 500 field devices | −$1,250 | −$15,000 | 25.0% |
| Cellular — 32 camera/appliance | −$224 | −$2,688 | 4.5% |
| **Total infrastructure** | **−$1,571** | **−$18,855** | **31.4%** |
| **Contribution after infra** | **$3,429** | **$41,145** | **68.6%** |

### Per-device economics (500 field devices)

| | Per device/mo | Per device/yr |
|--|---------------|---------------|
| Renewal revenue | $10.00 | $120.00 |
| Cloud infra (allocated) | ~$0.19 | ~$2.33 |
| Cellular (field) | $2.50 | $30.00 |
| Camera/appliance cell (allocated) | ~$0.45 | ~$5.38 |
| **Contribution after infra** | **~$6.86** | **~$82.29** |

*Camera/appliance cellular ($224/mo) allocated across 500 renewal devices for portfolio view; actual billing may attach to enterprise site fees.*

### Break-even (infrastructure only)

| Cost covered | Devices @ $10/mo |
|--------------|------------------|
| Cloud stack alone (~$97/mo) | **~10 devices** |
| Cloud + field cellular (~$1,347/mo) | **~135 devices** |
| Full stack incl. 32 uplinks (~$1,571/mo) | **~157 devices** |

---

## Revenue vs cost summary

```
Revenue (500 devices × $10/mo)     $5,000/mo  ████████████████████  100%
Cloud (DO Phase 1)                   −$97/mo  █                       1.9%
Cellular — field (500 × $2.50)   −$1,250/mo  ██████                 25.0%
Cellular — cameras (32 × $7)       −$224/mo  █                       4.5%
─────────────────────────────────────────────────────────────────────────
Contribution                       $3,429/mo                         68.6%
```

---

## Reference configuration (production)

| Host | Role | Size |
|------|------|------|
| `cloud-1-saas-nyc1` | SaaS nginx → :3100 | 4 GB / 2 vCPU / 80 GB SSD |
| `cloud-mqtt-nyc` | Mosquitto 1883/8883 | 2 GB / 1 vCPU / 50 GB SSD |
| `archive-prod-nyc` | Archive API :8090 | 2 GB / 1 vCPU + block volume |
| Managed MongoDB | Hot historian (7-day rolling) | 10–20 GB tier |

**DNS:** `peaklogic.io` → SaaS · `mqtt.peaklogic.io` → MQTT · `archive.peaklogic.io` → Archive (optional)

**Env:** `/etc/peaklogic/saas.env` — `MONGODB_URI`, `JWT_SECRET`, `PEAKLOGIC_MQTT_BROKER=mqtts://mqtt.peaklogic.io:8883`, `ARCHIVE_SERVER_URL`, `PEAKLOGIC_MAX_TAGS`

---

## Assumptions & disclaimer

| Assumption | Value |
|------------|-------|
| Field devices | 500 on $10/mo renewal |
| Camera/appliance uplinks | 32 (enterprise sites; not in the 500 renewal count) |
| Field cellular | $2/SIM + $0.50 per 50 MB/mo |
| Camera/appliance cellular | $2/SIM + $5 per 1 GB/mo |
| Field ingest | 50 MB/device/month |
| Camera ingest (est.) | ~100 MB/unit/month |
| Hot retention | 7 days Mongo → zstd archive |
| Region | NYC1 / NYC3 (DigitalOcean) |
| Topology | Phase 1: SaaS + MQTT + Archive + Managed Mongo |

**Not included:** hardware/commissioning, DNS, payment processing, support labor, sales/marketing, firmware, Opta/IoT-Link capex, overage charges beyond stated data plans.

**Disclaimer:** Directional planning document for architecture, capacity, and opex review. Not a financial forecast, hardware quote, or SLA commitment.

---

## Related documents

| Document | Purpose |
|----------|---------|
| `CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md` | Phase 1 deploy runbook |
| `DO-Phase1-Storage-Cost-Review.md` | Storage-only cost deep dive |
| `ARCHITECTURE.md` | Appliance vs cloud roadmap |
| `CLOUD_SAAS.md` | SaaS modes, routes, seed accounts |
| `PeakLogic-Infrastructure-Projections.md` | 5-year portfolio scaling |
| `Phase1-Tag-Scaling-1M-5M-25M.md` | **1M / 5M / 25M tags** · DO elastic · when to switch |

---

*Phase 1 SaaS Architecture & Cost Model v1.0 — PeakLogic platform planning.*

*PeakLogic is a company powered by [The Purple Standard](https://purple-standard.com). © Purple Standard Holdings.*
