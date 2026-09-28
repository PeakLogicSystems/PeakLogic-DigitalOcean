# PeakLogic — Tag Scaling Architecture (1M · 5M · 25M)

**Current Phase 1 stack · DigitalOcean elastic services · when to switch**

**Document version:** 1.0 · Run `npm run build:tag-scaling-pdf` for build date

**A company powered by The Purple Standard** · [purple-standard.com](https://purple-standard.com)

---

## Executive summary

PeakLogic Cloud today runs as a **Phase 1 monolith** (SaaS + MQTT + archive + Managed Mongo) with a default **`PEAKLOGIC_MAX_TAGS` cap of 70,912**. That architecture is correct through **~70K cloud tags** and **~500 cloud-centric field devices**. Beyond that, scale in **stages** — first on **DigitalOcean vertical resize and Managed MongoDB scalable storage**, then **VM split** (`ARCHITECTURE.md`), then **horizontal sharding** — rather than raising one env var on a 4 GB droplet.

| Tier | Cloud tags (TagStore) | Architecture mode | Primary DO move |
|------|----------------------|-------------------|-----------------|
| **Phase 1** | **≤ 70,912** | Single monolith stack | 4 GB SaaS · 15 GB Mongo (baseline) |
| **Phase 2a** | **70K – 250K** | Monolith + tenant shard | 8–32 GB SaaS · Mongo **16–32 GB** + **scalable storage** |
| **Phase 2b** | **250K – 1M** | **VM split** (ingest · GUI · alarms) | Multi-droplet + **HA Mongo** · **Load Balancer** |
| **Phase 3** | **1M – 5M** | Sharded ingest + partitioned historian | **64 GB Mongo HA** · **Spaces** archive · MQTT cluster |
| **Phase 4** | **5M – 25M** | National platform | **Mongo sharding** · **DOKS** · **edge rollup mandatory** |

**Critical rule:** At **1M+ tags**, **full cloud mirror** of every edge tag is not the default product path — **site-agent rollup** (~15–25% of on-prem tags) keeps cloud TagStore within Phase 2–3 bounds. The **1M / 5M / 25M** rows below model **worst-case full mirror** for capacity planning; operational fleets should plan at **rollup ratios** (see §2).

---

## Part 1 — Current architecture (Phase 1 baseline)

### Topology

```
Internet → DO Firewall → nginx :443 → SaaS server.js :3100  (4 GB droplet)
                              │              │
                              │              ├── TagStore (in-memory Map)
                              │              ├── ScanEngine (full tag scan)
                              │              └── Mongo historian (7 d hot)
                              │ mongodb+srv
                       Managed MongoDB (1–4 GiB tier, 15 GB base storage)
                              ▲
              mqtt.peaklogic.io :8883 (2 GB Mosquitto)
                              ▲
                    field devices / site agents

Archive droplet :8090 (2 GB + block volume) ← day-7 compact job
```

### Code constraints (why tags ≠ “just add RAM”)

| Component | File / config | Limiting behavior |
|-----------|---------------|-------------------|
| **TagStore** | `src/tags/tagStore.js` | In-memory `Map`; one object per tag; `assertCapacity()` @ `MAX_TAGS` |
| **Tag cap** | `PEAKLOGIC_MAX_TAGS` · `src/config.js` | Cloud default **70,912** (`nextcenturyCloudSizing.js`) |
| **ScanEngine** | `src/runtime/scanEngine.js` | Iterates **all tags** each scan cycle |
| **Historian** | `src/logger/mongoTagLogger.js` | Logs `graphEnabled` pens; default **5 s** sample (`MONGODB_SAMPLE_MS`) |
| **Hot retention** | `ARCHIVE_EXPORT.md` | **7 days** Mongo → zstd archive compact |
| **JSON import** | `REQUEST_JSON_LIMIT=32mb` | Large `.est` tag imports need headroom or chunked merge |

### Phase 1 numeric limits (single stack)

| Resource | Max | Reference fleet |
|----------|-----|-----------------|
| **`PEAKLOGIC_MAX_TAGS`** | **70,912** | ~3K–8K @ 500 devices |
| **Devices / tenant** | **1,000** | 500 |
| **MQTT connections** | **~2,000** | ~532 |
| **Historian pens (hot)** | **~50,000** (Mongo tier bound) | ~3,000 |
| **Hot Mongo steady** | **15 GB** base plan | ~6.5 GB |

Detail: `Phase1-SaaS-Architecture-Costs.md` · runbook `docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md`.

---

## Part 2 — Tag definitions & planning formulas

### Three “tag” counts

| Count | Definition | 1M example (full mirror) |
|-------|------------|--------------------------|
| **TagStore tags** | Pens in cloud SaaS `TagStore` | **1,000,000** |
| **Historian pens** | Tags with `graphEnabled` logged to Mongo | **~400,000** @ 40% ratio |
| **MQTT endpoints** | Devices/brokers connected to Mosquitto | **~200K – 350K** @ 3–5 tags/device |

### Rollup vs mirror (operational planning)

| Sync model | Cloud tags @ 667 campuses × 1,500 assets | Use |
|------------|-------------------------------------------|-----|
| **Full mirror** (~3 tags/asset) | **~3,000,000** | **Avoid** — forces Phase 4 |
| **Rollup** (~800 pens/campus) | **~534,000** | **Recommended** — Phase 2b |
| **Per-campus tenant** (~4,500/campus) | **4,500 × N tenants** | Franchise / multi-org |

### RAM estimate (TagStore working set)

Directional: **~1.5 – 2.5 KB / tag** in Node heap (metadata + runtime state + average function-block footprint).

| Tags | Est. TagStore RAM | Min SaaS RAM (TagStore only) |
|------|-------------------|------------------------------|
| 70,912 | ~140 MB | 4 GB (Phase 1 OK) |
| 250,000 | ~500 MB | 8 GB |
| 1,000,000 | ~2 GB | 16 GB+ (scan overhead dominates) |
| 5,000,000 | ~10 GB | **Split ingest** — no single process |
| 25,000,000 | ~50 GB | **Sharded** — not one TagStore |

### Hot Mongo estimate (7-day @ 5 s sample)

Calibrated from Phase 1 reference: **~3,000 pens → ~6.5 GB hot** ⇒ **~2.2 MB / pen / 7 days**.

| TagStore tags | Historian pens (40%) | Hot Mongo (7 d) | DO Mongo action |
|---------------|----------------------|-----------------|-----------------|
| 70,912 | ~28,000 | ~**60 GB** | 16 GB tier + **scalable storage** |
| 250,000 | ~100,000 | ~**220 GB** | 32 GB tier + storage |
| 1,000,000 | ~400,000 | ~**880 GB** | **64 GB HA** + **~900 GB scalable storage** |
| 5,000,000 | ~2,000,000 | ~**4.4 TB** | **64 GB+ HA** + **multi-TiB storage** or historian partition |
| 25,000,000 | ~10,000,000 | ~**22 TB** | **Sharded cluster** · tiered hot/cold · **Spaces** archive |

*Reduce pens via longer sample interval, rollup-only sync, or edge historian for ALF/apartment/hotel fleets.*

### ScanEngine throughput (switch trigger)

Monolith scan cost grows **O(n tags)**. Directional sustained limits on a single Node process:

| SaaS droplet | Practical tag scan ceiling @ 1 s scan | Action if exceeded |
|--------------|--------------------------------------|--------------------|
| 4 GB | **~50K – 80K** | Step RAM; reduce scan rate |
| 16 GB | **~150K – 250K** | **VM split** — dedicated ingest |
| 32 GB | **~250K – 400K** (soft) | **Partition** by tenant/site |
| Multi-node ingest | **1M+** | Sharded ScanEngine (platform work) |

---

## Part 3 — DigitalOcean elastic services (how to scale on DO)

### Managed MongoDB — compute + **scalable storage**

Primary elastic database service for hot historian and tenant config.

| Feature | Use for PeakLogic | Notes |
|---------|-------------------|-------|
| **Vertical resize** | Step **1 → 4 → 16 → 32 → 64 GiB** RAM tiers | Brief failover on HA clusters |
| **Scalable storage** | Add **10 GiB increments** @ **~$0.215/GiB/mo** | **Scale storage without compute** — ideal for historian growth |
| **Storage autoscale** | Enable @ **~80% disk** threshold | Adds increment **per node** on HA clusters |
| **3-node HA replica set** | Production @ **≥ 1M tags** | ~3× single-node list price |
| **Max storage** | Up to **~16 TiB** per cluster (plan-dependent) | See DO Mongo plan storage range |

List pricing (directional, 2026): **1 GiB $15/mo** · **4 GiB $61/mo** · **16 GiB $244/mo** · **32 GiB $488/mo** · **64 GiB $975/mo**.

**Switch to scalable storage** when hot Mongo exceeds **base plan included GiB** (~15 GB on entry tier) — **before** jumping compute tier if CPU is idle.

### Droplets — vertical scale (SaaS · MQTT · archive)

| Workload | Phase 1 | Phase 2a | Phase 2b / 1M | Phase 3 / 5M |
|----------|---------|----------|---------------|--------------|
| **SaaS / GUI** | 4 GB ($24) | 8–16 GB ($48–96) | **2–4 × 16–32 GB** + LB | **DOKS** pool or 8+ dedicated nodes |
| **MQTT broker** | 2 GB ($12) | 8 GB ($48) | **2 × 8 GB** cluster | **EMQX/HiveMQ** or 3-node Mosquitto |
| **Archive API** | 2 GB + volume | 4 GB + volume | **Spaces** primary | **Spaces Cold** for compliance years |

Memory-optimized droplets (directional): **64 GiB / 8 vCPU ~$524/mo** · **128 GiB / 16 vCPU ~$1,048/mo** — use for **single-tenant ingest** only until DOKS split.

### Spaces object storage — archive tier

Replace block-volume archive when cumulative zstd exceeds **~500 GB – 1 TB**.

| Item | Rate |
|------|------|
| Base | **$5/mo** (250 GiB + 1 TiB egress) |
| Additional Standard | **$0.02/GiB/mo** |
| Cold storage | **$0.007/GiB/mo** (13 mo compliance) |

**Switch from archive droplet → Spaces** when block volume **> 500 GB** or multi-TB fleet (`Phase1-SaaS-Architecture-Costs.md` trigger).

### Load Balancers & DOKS

| Service | When to add | Cost (directional) |
|---------|-------------|-------------------|
| **Load Balancer** | **≥ 2 SaaS GUI nodes** (Phase 2b) | ~$12/mo |
| **DOKS** (Kubernetes) | **≥ 5M tags** or **> 10 SaaS replicas** | Control plane + worker pool |
| **VPC** | All tiers | Private MQTT ↔ SaaS ↔ Mongo |

### DO elastic scaling playbook (order of operations)

1. **Enable Mongo scalable storage** + autoscale threshold **80%**
2. **Resize SaaS droplet** RAM (4 → 8 → 16 GB) if CPU/RAM **> 70% sustained**
3. **Raise `PEAKLOGIC_MAX_TAGS`** only after RAM headroom confirmed
4. **Add second SaaS node + LB** before single node exceeds **~250K tags**
5. **Migrate archive to Spaces** before **500 GB** block volume
6. **Step Mongo compute tier** when query latency or CPU bound (not just disk)
7. **Enable Mongo HA 3-node** before **1M tags** production
8. **Introduce DOKS / sharding** at **5M+ tags** — do not vertical-scale past **128 GB** monolith

---

## Part 4 — Tier detail @ 1M · 5M · 25M tags

### Assumptions (full-cloud mirror worst case)

| Parameter | Value |
|-----------|-------|
| Historian pen ratio | **40%** of TagStore tags |
| Sample interval | **5 s** |
| Hot retention | **7 days** |
| Archive | zstd compact → **Spaces** @ Phase 3+ |
| Region | NYC1 / NYC3 |

---

### @ 1,000,000 tags — **Phase 2b → early Phase 3**

**Architecture**

```
                    DO Load Balancer :443
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        GUI API × 2              Ingest × 2–3
        (16–32 GB)               (16–32 GB)
              │                         │
              └────────────┬────────────┘
                           │
              Alarm + notify VM (8 GB)
                           │
         MongoDB HA 64 GiB (3-node)  ~900 GB scalable storage
                           │
              MQTT cluster (2 × 8 GB)
                           │
              Spaces archive (10–50 TB growing)
```

| Resource | Specification |
|----------|---------------|
| **TagStore** | **2–4 shards** by `tenantId` or `siteId` (platform) — **not** one 1M Map |
| **`PEAKLOGIC_MAX_TAGS`** | **262,144 – 1,048,576** per shard |
| **Hot Mongo** | **~880 GB** — **64 GiB HA** + **~900 GiB scalable storage** |
| **MQTT** | **~200K – 350K** connections → **2-node broker cluster** |
| **Scan** | Partitioned ingest — **≤ 250K tags / process** |

**When to switch TO this tier**

| Signal | Threshold |
|--------|-----------|
| TagStore count | **> 250,000** on one tenant or aggregate |
| SaaS RAM | **> 70%** sustained on **32 GB** droplet |
| Scan cycle | **> 2 s** p95 @ 1 s target |
| Hot Mongo | **> 200 GB** steady |
| MQTT | **> 2,000** connections on **2 GB** broker |

**Directional DO opex (cloud only)**

| Line | Monthly |
|------|---------|
| SaaS **4 × 16 GB** ingest/GUI/alarm | ~$384 |
| MQTT **2 × 8 GB** | ~$96 |
| Mongo **64 GiB HA × 3** | ~$2,925 |
| Mongo **~900 GiB** extra storage | ~$194 |
| Spaces **~20 TB** archive | ~$410 |
| Load balancer | ~$12 |
| **Total** | **~$4,000 – 5,000/mo** |

**Platform work required:** VM split per `ARCHITECTURE.md` · tag partition · message bus for `alarm:transition` · historian index by `{tagId, ts}` · archive writer to Spaces.

---

### @ 5,000,000 tags — **Phase 3**

**Architecture**

```
 DOKS or dedicated fleet
 ├── ingest deployment (N replicas, HPA on MQTT lag)
 ├── gui-api deployment (M replicas)
 ├── alarm-notify deployment
 └── archive-compactor CronJob → Spaces

 MongoDB: sharded cluster (shard key: tenantId + siteId)
   ├── shard A: 0–1.25M tags
   ├── shard B: 1.25–2.5M
   ├── shard C: 2.5–3.75M
   └── shard D: 3.75–5M

 Hot tier: 7 d rolling per shard · ~4.4 TB aggregate
 Cold tier: Spaces Standard → Cold @ 13 mo
 MQTT: dedicated cluster (3+ nodes) or managed EMQX
 Edge policy: rollup required — mirror only by exception
```

| Resource | Specification |
|----------|---------------|
| **TagStore** | **Mongo-backed or Redis** with local LRU — not full in-memory Map |
| **Hot Mongo** | **~4.4 TB** — **multiple 64 GiB shards** or **storage-optimized** DO plans |
| **Historian** | **Partition collections** by week · consider **downsample** after 24 h |
| **Ingest** | **Horizontally scaled** · **10M device** path in `ARCHITECTURE.md` |

**When to switch TO this tier**

| Signal | Threshold |
|--------|-----------|
| Aggregate tags | **> 1,000,000** full mirror OR **> 5,000,000** rollup-equivalent load |
| Mongo | Single cluster **> 1 TiB** hot or **CPU > 60%** sustained |
| Ingest | **> 50K MQTT msg/s** peak |
| SaaS nodes | **> 8** vertical-scaled droplets — **move to DOKS** |

**Directional DO opex**

| Line | Monthly |
|------|---------|
| Compute (DOKS **8 × 16 GB** workers + 3 × 32 GB dedicated) | ~$2,500 – 4,000 |
| Mongo **sharded** (4 × 64 GiB HA) | ~$12,000 – 15,000 |
| Mongo / Spaces storage **~5 – 8 TB** hot + **100+ TB** archive | ~$2,000 – 4,000 |
| MQTT cluster / LB / monitoring | ~$500 – 800 |
| **Total** | **~$17,000 – 25,000/mo** |

**Platform work required:** Shard router · scan worker pool · stream bus (Kafka/Redis Streams) · tenant quota enforcement · **mandatory rollup** for campus verticals.

---

### @ 25,000,000 tags — **Phase 4 (national ceiling)**

**Architecture**

Aligns with `PeakLogic-Infrastructure-Projections.md` Part 7 ceiling and `ARCHITECTURE.md` **10M devices / 10K users** target — extended to **25M tag pens** (multi-vertical national fleet).

```
 Multi-region DO (NYC + ATL + SFO) — tenant-aware routing
 ├── Regional ingest pools (DOKS)
 ├── Global GUI + auth (CDN-fronted)
 ├── Alarm/notify regional fanout
 └── Archive: Spaces multi-bucket · PB-class · lifecycle to Cold

 MongoDB: 8–16 shards · 64–128 GiB primaries · TiB+ scalable storage each
 Historian: hot 7 d · warm 90 d Mongo · cold Spaces · compliance 13 mo edge
 Edge: 100K+ IoT-Link + 500+ MVP Suite — **rollup only to cloud**
```

| Resource | Specification |
|----------|---------------|
| **TagStore** | **Distributed** — no single-process TagStore |
| **Hot Mongo** | **~22 TB** theoretical @ full mirror — **reduce to ~2–4 TB** via rollup + downsample |
| **Archive** | **PB-class** Spaces · **$0.007/GiB Cold** for year 2+ |
| **MQTT** | **Regional brokers** · **100K+ connections** per region |

**When to switch TO this tier**

| Signal | Threshold |
|--------|-----------|
| National fleet | **> 100K sites** or **> 5M tags** sustained with **full mirror** |
| Single-region DO | Egress / latency SLO breach |
| Mongo | **> 5M tags** hot historian without shard expansion |
| Business | **$50M+ ARR** portfolio (`Infrastructure Projections` ceiling) |

**Directional DO opex**

| Line | Monthly |
|------|---------|
| Multi-region compute (DOKS + dedicated) | ~$15,000 – 25,000 |
| Mongo **sharded national** | ~$50,000 – 80,000 |
| Storage (hot + warm + **500 TB – 2 PB** archive) | ~$10,000 – 40,000 |
| Network / LB / observability | ~$3,000 – 5,000 |
| **Total** | **~$80,000 – 150,000/mo** |

**Contact DO sales** for storage-optimized and multi-TiB Mongo commitments.

---

## Part 5 — When to switch (decision matrix)

### By tag count (primary trigger)

| Cloud TagStore tags | Stay on | Switch to | DO elastic action |
|---------------------|---------|-----------|-------------------|
| **≤ 70,912** | **Phase 1 monolith** | — | 4 GB SaaS · 15 GB Mongo |
| **70K – 131K** | Phase 1 (stretched) | **Phase 2a** | 8–16 GB SaaS · `MAX_TAGS=131072` · Mongo **16 GB** + storage |
| **131K – 250K** | Phase 2a | **Phase 2a shard** | **2 × 16 GB SaaS** OR per-tenant VM · Mongo **32 GB** |
| **250K – 1M** | — | **Phase 2b VM split** | LB + **Mongo HA 32–64 GB** · **scalable storage** · Spaces archive |
| **1M – 5M** | Phase 2b | **Phase 3 sharded** | **DOKS** · **Mongo sharding** · MQTT cluster |
| **5M – 25M** | Phase 3 | **Phase 4 national** | Multi-region · **PB Spaces** · edge rollup policy |

### By resource signal (override tag count)

| Signal | Threshold | Switch |
|--------|-----------|--------|
| `PEAKLOGIC_MAX_TAGS` API 413 errors | Any | Raise cap **or** shard tenant **before** raising cap |
| SaaS heap **> 80%** | Sustained 15 min | Vertical resize **then** split ingest |
| Mongo disk **> 80%** | Primary node | **Enable autoscale storage** (10 GiB increment) |
| Mongo CPU **> 60%** | Sustained | **Resize compute tier** (not just storage) |
| MQTT connections | **> 2,000** | Second broker · bridge · or EMQX cluster |
| Archive volume | **> 500 GB** | **Spaces** migration |
| p95 API latency | **> 500 ms** on tag list | Partition TagStore · CDN static · WS throttling |
| Full mirror requested @ **> 18 campuses** | ~81K+ tags | **Reject** — enforce **model B rollup** |

### Vertical-specific shortcuts

| Vertical | Tags @ scale | Cloud plan |
|----------|--------------|------------|
| **Wastewater 500 devices** | ~7K | **Phase 1** — no change |
| **ALF 60 campuses** | ~48K–72K rollup · **270K on-prem** | **Phase 2** SaaS · rollup only |
| **Apartment 20 / Hotel 12** | ~16K–24K / ~10K–14K | **Phase 1** |
| **Enterprise full mirror** | **1M+** | **Phase 2b minimum** |

---

## Part 6 — Migration runbook (Phase 1 → 2b @ ~250K tags)

Ordered steps on DigitalOcean **without downtime goal**:

1. **Provision Mongo HA 32 GiB** cluster · enable **scalable storage** + **autoscale @ 80%**
2. **Migrate hot historian** (`mongodump` / logical migration) · verify indexes on `{ tagId: 1, ts: -1 }`
3. **Deploy second SaaS ingest node** — MQTT consumer only · same codebase `PEAKLOGIC_ROLE=ingest`
4. **Add DO Load Balancer** — GUI node registers; ingest bypasses LB (MQTT direct)
5. **Split alarm notify** to third VM · wire `eventBus` → Redis/Kafka (platform seam)
6. **Raise `PEAKLOGIC_MAX_TAGS`** per shard · **never** above **250K** per process
7. **Migrate archive** to **Spaces** · point `ARCHIVE_SERVER_URL` to S3-compatible adapter
8. **Load test** @ 80% target tags · watch scan p95 · Mongo disk slope
9. **Cutover DNS** · drain Phase 1 monolith
10. **Document tenant shard map** in `cloud_tenants.json` / Mongo `tenants` collection

Rollback: keep Phase 1 stack **7 days** · DNS revert · Mongo read-only replica of old cluster.

---

## Part 7 — Cost vs revenue sanity (directional)

Cloud opex alone — **not** cellular or support labor.

| Tags | Est. cloud opex/mo | Illustrative renewal to cover cloud @ 10% rule |
|------|-------------------|-----------------------------------------------|
| 70,912 | **~$150 – 300** | **~$1.5K – 3K/mo** |
| 250,000 | **~$800 – 1,500** | **~$8K – 15K/mo** |
| 1,000,000 | **~$4K – 5K** | **~$40K – 50K/mo** |
| 5,000,000 | **~$17K – 25K** | **~$170K – 250K/mo** |
| 25,000,000 | **~$80K – 150K** | **~$800K – 1.5M/mo** |

At ALF/apartment pricing (**$110/asset**), **1M cloud tags** (rollup) is **far smaller** than **1M mirror** — operational fleets should size cloud tags, not on-prem asset counts.

---

## Appendix — related documents

| Document | Purpose |
|----------|---------|
| `Phase1-SaaS-Architecture-Costs.md` | Phase 1 limits & 500-device opex |
| `DO-Phase1-Storage-Cost-Review.md` | Mongo storage economics |
| `docs/ARCHITECTURE.md` | VM split · 10M device target |
| `docs/ARCHIVE_EXPORT.md` | Hot → archive pipeline |
| `PeakLogic-Infrastructure-Projections.md` | Y1–Y5 + Part 10–11 verticals |
| [DO Mongo scalable storage](https://docs.digitalocean.com/products/databases/mongodb/how-to/resize/) | Autoscale & resize |
| [DO Spaces pricing](https://www.digitalocean.com/pricing/spaces-object-storage) | Archive tier |

### Env vars (scaling-relevant)

| Variable | Default | Scale note |
|----------|---------|------------|
| `PEAKLOGIC_MAX_TAGS` | **70912** (cloud) | Per-process cap — shard above **250K** |
| `PEAKLOGIC_DEPLOYMENT` | `cloud` | Enables cloud sizing defaults |
| `MONGODB_URI` | — | Point to HA cluster @ 1M+ |
| `MONGODB_SAMPLE_MS` | **5000** | Increase to reduce hot Mongo slope |
| `ARCHIVE_SERVER_URL` | archive droplet | **Spaces** @ TB scale |

**Disclaimer:** Directional capacity planning — not an SLA, quote, or commitment to implement sharding by a specific date. Code changes for Phase 2b+ are roadmap items in `ARCHITECTURE.md`.

---

*Tag Scaling Architecture v1.0 — PeakLogic platform planning.*

*PeakLogic is a company powered by [The Purple Standard](https://purple-standard.com). © Purple Standard Holdings.*
