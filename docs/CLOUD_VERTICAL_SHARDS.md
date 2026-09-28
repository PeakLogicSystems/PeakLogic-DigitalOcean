# PeakLogic Cloud — Vertical Shard Architecture

**Document version:** 1.0  
**Product:** PeakLogic Cloud SaaS  
**Audience:** Platform operators, integrators, CFO / capacity planning  
**Generated:** Run `npm run build:cloud-vertical-shards-pdf` for build date

---

## Executive summary

PeakLogic cloud scale-out uses **vertical ingest shards** (lift/septic/WWTP, pools, ALF, c-store/grocery) on top of a **fixed control plane** (SaaS + LB + shared Mongo + MQTT + archive). MQTT topics remain **`peaklogic/v1/{tenantId}/{deviceId}/…`** — sharding is implemented via a **tenant → vertical → shard** registry, not a wire-protocol change.

**Key rules:**

- **LB on `:3100` (SaaS)** — yes, from launch.
- **LB on `:3090` (ingest)** — no for telemetry; optional tenant-aware proxy for Parc HTTP commands only.
- **One ingest cell ≈ 500K live cloud tags**; add cells within a vertical when a shard exceeds ~450K tags.
- **M18 hybrid:** 2 cells (field + retail). **M36 target:** ~11 cells across 4 verticals at 5M tags.

---

## 1. Reference fleet (planning baseline)

Assumptions: **5 min scheduled report + exception-on-change**; **ALF slim mirror** (~400 cloud tags/campus, full model on appliance); pools **lift-like I/O** (~85 tags/site).

| Segment | M12 | M18 | M24 | M36 |
|---------|----:|----:|----:|----:|
| Lift / septic / WWTP | 2,000 | 3,000 | 13,100 | 30,100 |
| Pools | 667 | 1,000 | 4,380 | 10,000 |
| C-store / grocery | 333 | 500 | 2,568 | 6,600 |
| ALF campus | 33 | 50 | 256 | 660 |
| **Total sites** | **3,033** | **4,550** | **21,304** | **54,360** |
| **Cloud tags** | **277K** | **415K** | **1.94M** | **5.0M** |

Tag mix @ M18: lift **61%** · pool **21%** · c-store **12%** · ALF slim **5%**.

---

## 2. Full platform diagram

```text
                         INTERNET / FIELD
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    Cellular Opta         IoT-Link /           Site agents
    (lift/pool/c-store)   MVP Suite (ALF)      (cameras)
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │ mqtts://broker:8883
                               ▼
              ┌────────────────────────────────────────┐
              │  MQTT TIER  (cloud-mqtt-atl1 — mqtt.peaklogic.io) │
              │  peaklogic/v1/{tenant}/{device}/…        │
              └────────────────┬───────────────────────┘
                               │  N hub subscribers (1 per ingest cell)
                               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  INGEST TIER  (:3090 — 1 droplet per vertical cell)           │
    │  shard-lift │ shard-pool │ shard-alf │ shard-cstore          │
    └──────────────────────────────┬───────────────────────────────┘
                                   │ mongodb+srv:// (VPC)
                                   ▼
              ┌────────────────────────────────────────┐
              │  DO Managed MongoDB (shared)           │
              │  hot 7d historian · ingest_shards      │
              └────────────────┬───────────────────────┘
                               │ daily compact
                               ▼
              ┌────────────────────────────────────────┐
              │  ARCHIVE TIER  (zstd, no Mongo)        │
              └────────────────────────────────────────┘

              ┌────────────────────────────────────────┐
              │  CONTROL PLANE                       │
              │  DO LB :443 → SaaS ×2 (:3100)        │
              └────────────────────────────────────────┘
```

---

## 3. Vertical shards

| Shard | Vertical | M18 tags | Reporting | Cloud profile |
|-------|----------|----------:|-----------|---------------|
| **A** | Lift / septic / WWTP | ~255K | 5 min + exception | Full mirror, PdM/ONNX |
| **B** | Pools | ~85K | 5 min + exception | Lift-like I/O |
| **C** | ALF campus | ~20K | 5 min + exception (slim) | Appliance-heavy, ~400 tags uplink |
| **D** | C-store / grocery | ~50K | 5 min + exception | ~100 tags, cold chain |

### 3.1 Shard A — Lift / septic / WWTP

| Setting | Value |
|---------|-------|
| `PEAKLOGIC_INGEST_SHARD_ID` | `shard-lift` |
| `PEAKLOGIC_VERTICAL` | `lift` |
| `PEAKLOGIC_MAX_TAGS` | `525312` |
| Droplet | **32 GB / 8 vCPU** |
| Host ONNX | **on** (`host-supplement`) |
| Historian pens | 8/site @ **300 s** |

### 3.2 Shard B — Pools

| Setting | Value |
|---------|-------|
| `PEAKLOGIC_INGEST_SHARD_ID` | `shard-pool` |
| `PEAKLOGIC_VERTICAL` | `pool` |
| `PEAKLOGIC_MAX_TAGS` | `131072` |
| Droplet | **16 GB** |
| Historian pens | 8/site (PH, ORP, flow, pump) |

### 3.3 Shard C — ALF

| Setting | Value |
|---------|-------|
| `PEAKLOGIC_INGEST_SHARD_ID` | `shard-alf` |
| `PEAKLOGIC_VERTICAL` | `alf` |
| `PEAKLOGIC_MAX_TAGS` | `26112` |
| Droplet | **8 GB** |
| Host ONNX | **off** |
| Uplink | Appliance `cloudRemote` slim ~400 tags |

### 3.4 Shard D — C-store / grocery

| Setting | Value |
|---------|-------|
| `PEAKLOGIC_INGEST_SHARD_ID` | `shard-cstore` |
| `PEAKLOGIC_VERTICAL` | `cstore` |
| `PEAKLOGIC_MAX_TAGS` | `65536` |
| Droplet | **16 GB** |
| Historian pens | 6/site (cooler, RTU, leak) |

---

## 4. MQTT plumbing

**Wire format (unchanged):**

```text
peaklogic/v1/{tenantId}/{deviceId}/telemetry
peaklogic/v1/{tenantId}/{deviceId}/online
```

**Shard assignment** via tenant metadata — each cell subscribes only to assigned tenants:

```text
shard-lift:    peaklogic/v1/ace-septic/#, peaklogic/v1/putnam-county/#, …
shard-pool:    peaklogic/v1/pool-cloud/#, …
shard-alf:     peaklogic/v1/alf-sunrise/#, …
shard-cstore:  peaklogic/v1/circle-k-florida/#, …
```

**Do not** run multiple ingest nodes with global `peaklogic/v1/+/telemetry` subscribe — that duplicates all processing.

---

## 5. HTTP / SaaS routing

```text
POST /api/parc/devices/{deviceId}/cmd
  1. Session → tenantId
  2. tenant.vertical → ingest_shards.internalUrl
  3. Proxy → http://10.0.0.2X:3090/api/parc/devices/{id}/cmd

GET /fleet
  → parallel fan-out to all shards, OR denormalized fleet_devices in Mongo
```

**Shard registry** (Mongo `ingest_shards`):

```json
{
  "shardId": "shard-lift",
  "vertical": "lift",
  "internalUrl": "http://10.0.0.21:3090",
  "tenants": ["ace-septic", "putnam-county-utilities"],
  "maxTags": 525312,
  "tagCount": 412000,
  "status": "active"
}
```

---

## 6. Mongo (shared)

| Collection | Partition | Retention |
|------------|-----------|-----------|
| `tag_logs` / `tag_samples_ts` | `company`, `siteId`, `at` | 7 d hot → archive |
| `edge_inference_ts` | `deviceId`, `at` | 7 d |
| `ingest_shards` | `shardId` | permanent |
| `archive_registry` | `company`, `siteId` | permanent |

Fleet historian: **`sampleIntervalMs: 300000`** (match 5 min reports). Do not use 5 s default at fleet scale.

---

## 7. Scale-out by period

### Period 1 — 0–12 months (ends ~277K tags)

| Component | M0–M6 | M6–M12 |
|-----------|-------|--------|
| SaaS | 1× 4 GB | LB + 2× 4 GB |
| Ingest | 1× 16 GB (field) | 1× 16 GB field + 1× 8 GB retail |
| MQTT | 1× 4 GB | 1× 4 GB |
| Mongo | entry tier | 4 GB RAM / ~80 GB disk |

### Period 2 — 12–24 months (277K → 1.94M tags)

**M18 (~415K):** 2 cells — field 32 GB + retail 16 GB.

**M24 (~1.94M):** 6 cells:

| Vertical | Tags | Cells |
|----------|-----:|------:|
| Lift / septic / WWTP | ~1.19M | 3× 32 GB |
| Pools | ~398K | 1× 16 GB |
| C-store | ~233K | 1× 16 GB |
| ALF | ~93K | 1× 8 GB |

### Period 3 — 24–36 months (1.94M → 5M tags)

| Vertical | Cells @ 5M |
|----------|------------|
| Lift / septic / WWTP | **6× 32 GB** |
| Pools | **2× 16 GB** |
| C-store | **2× 16 GB** |
| ALF | **1× 16 GB** |
| **Total ingest** | **11 droplets** |

MQTT: **2× 16 GB** (or EMQX HA) above ~50K connections.

---

## 8. Hybrid vs full vertical split

| | **M18 hybrid (recommended)** | **Full 4-vertical @ M18** |
|--|------------------------------|---------------------------|
| Ingest droplets | 2 (field + retail) | 4 |
| Extra cost | — | ~+$120–180/mo |
| Ops | Simpler | Best isolation |

**Recommendation:** Start **2 shards @ M18**; split pools to own shard when pool tags > **150K**; full 4-vertical by M24.

---

## 9. Multi-vertical tenants

MQTT topics are tenant-scoped. Options:

| Approach | When |
|----------|------|
| **Split tenant per vertical** (`acme-lift`, `acme-pool`) | Recommended M18–M36 |
| Route by `device.category` in SaaS | Single tenant, multiple verticals |
| Topic v2 `peaklogic/v2/{vertical}/…` | Only if tenant-split outgrown |

---

## 10. Software prerequisites

| Item | Purpose |
|------|---------|
| `tenant.vertical` | `lift \| pool \| alf \| cstore` |
| Mongo `ingest_shards` | Tenant → shard routing |
| `PEAKLOGIC_INGEST_TENANTS` + filtered hub subscribe | No global `+/telemetry` |
| SaaS shard router | Parc cmds + live tags |
| Fleet aggregator | `/fleet` across shards |
| Slim ALF uplink on appliance | Keep ALF shard small |

---

## 11. Private network (VPC)

| Host | Role | Expose publicly? |
|------|------|------------------|
| LB + SaaS | Operators | **443 only** |
| MQTT | Devices | **8883** (TLS) |
| Ingest shards | Internal | **No** |
| Mongo | Managed | **No** (allowlist) |
| Archive | Internal | **No** |

---

## 12. Related documentation

| Topic | Path |
|-------|------|
| Cloud infra pricing (0–36 mo) | `docs/marketing/CLOUD_INFRA_PRICING.md` |
| DO SaaS deploy | `docs/CLOUD_DEPLOY_DO.md` |
| Phase 1 ATL + dedicated MQTT | `docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md` |
| Archive pipeline | `docs/ARCHIVE_EXPORT.md` |
| AI / edge / cloud roles | `docs/AI_EDGE_CLOUD.md` |
| Infrastructure projections | `docs/marketing/PeakLogic-Infrastructure-Projections.md` |

---

*PeakLogic Cloud Vertical Shards v1.0 — platform planning.*

*PeakLogic is a company powered by [The Purple Standard](https://purple-standard.com).*
