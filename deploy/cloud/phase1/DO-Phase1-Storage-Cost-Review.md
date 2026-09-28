# PeakLogic Phase 1 — DigitalOcean Storage & Server Cost Review

**500 devices · 50 MB/month per device · $10/mo renewal · NYC1 Phase 1 topology**

**Document version:** 1.1 · Run `npm run build:do-phase1-storage-cost-pdf` for build date

**A company powered by The Purple Standard** · [purple-standard.com](https://purple-standard.com)

---

## Executive summary

Directional **cost and revenue** estimate for PeakLogic **Phase 1 DigitalOcean** deployment (`do-inventory.md` / `CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md`) at **500 monitored devices**, **50 MB/month** ingest per device, and **$10/month** monitoring renewal per device.

### Revenue @ $10/mo per device

| Metric | Monthly | Annual |
|--------|---------|--------|
| **Gross renewal revenue** | **$5,000** | **$60,000** |
| Per device | $10 | $120 |

### Cloud infrastructure cost

| Metric | Year 1 average | Year-end run rate |
|--------|------------------|-------------------|
| **Data storage only** | ~**$180/year** | ~**$360/year** |
| **Per device (storage only)** | ~**$0.36/device/year** | ~**$0.72/device/year** |
| **All-in server stack** | ~**$1,119/year** | ~**$1,119/year** |
| **Per device (all-in server)** | ~**$2.24/device/year** | ~**$2.24/device/year** |

### Margin (renewal revenue minus DO cloud stack only)

| Metric | Monthly | Annual | % of revenue |
|--------|---------|--------|--------------|
| Gross renewal revenue | $5,000 | $60,000 | 100% |
| DO Phase 1 stack | ~$93 | ~$1,119 | **1.9%** |
| **Gross margin after cloud infra** | **~$4,907** | **~$58,881** | **98.1%** |

**Per device (annual):** $120 revenue − $2.24 cloud cost = **~$117.76 gross margin** (cloud infra only).

*Not included in margin: hardware/commissioning, cellular ($3/mo typical), DNS, backups, bandwidth overages, support labor, payment processing, or sales/marketing.*

---

## Revenue estimation @ $10/mo per device

Assumes **500 billable devices** on renewal at list **$10/month** (residential / light commercial band in Pricing Guide v2.4).

| Line | Calculation | Monthly | Annual |
|------|-------------|---------|--------|
| Devices on renewal | — | 500 | 500 |
| Renewal rate | $10/device/mo | $10 | $120/yr |
| **Gross renewal revenue** | 500 × $10 | **$5,000** | **$60,000** |

### Revenue vs cloud cost (per device)

| | Per device/mo | Per device/yr |
|--|---------------|---------------|
| Renewal revenue | $10.00 | $120.00 |
| Cloud infra (all-in) | ~$0.19 | ~$2.24 |
| Cloud storage only (Y1 avg) | ~$0.03 | ~$0.36 |
| Cloud storage only (steady) | ~$0.06 | ~$0.72 |
| **Gross margin after cloud infra** | **~$9.81** | **~$117.76** |

### Break-even (cloud infra only)

| Cost covered | Devices needed @ $10/mo |
|--------------|-------------------------|
| Full Phase 1 stack (~$93/mo) | **~10 devices** |
| Archive storage run-rate (~$30/mo) | **~3 devices** |

At 500 devices, cloud infrastructure is **~1.9% of renewal revenue** — storage alone is **~0.6%** at year-end run rate.

---

## Reference configuration

Production inventory (NYC1 VPC):

| Host | Role | Size |
|------|------|------|
| `cloud-1-saas-nyc1` | SaaS nginx → :3100 | 4 GB / 2 vCPU / 80 GB SSD |
| `cloud-mqtt-nyc` | Mosquitto 1883/8883 | 2 GB / 1 vCPU / 50 GB SSD |
| `archive-prod-nyc` | Archive API :8090 | 2 GB / 1 vCPU + block volume |
| Managed MongoDB | Hot historian (7-day rolling) | 10–20 GB tier |

**Data pipeline:** appliances → MQTT → SaaS ingest → **Mongo hot (0–7 days)** → day-7 compaction → **zstd archive** on archive droplet volume.

**Pricing basis (Aug 2026):**

- Droplets: 4 GB = $24/mo · 2 GB = $12/mo
- Block storage (Volumes): **$0.10/GiB/month**
- Managed MongoDB (smallest plan): **$15.23/mo** (15 GB storage included); extra scalable storage **$0.215/GiB/mo**

---

## Data volume @ 500 devices × 50 MB/month

| Layer | Calculation | Fleet total |
|-------|-------------|-------------|
| Ingest rate | 500 × 50 MB | **25 GB/month** |
| Hot Mongo (7-day rolling) | 25 GB × (7 ÷ 30) | **~5.8 GB** steady state |
| Archive growth (Year 1) | 25 GB × 12 months | **~300 GB** cumulative |

The hot tier (~5.8 GB) fits within the **15 GB** base Managed Mongo plan — **$0 marginal hot-storage cost** at this load.

The configured **200 GB** archive volume covers roughly **8 months** at this ingest rate; add ~100 GB (~$10/mo) before month 12.

---

## Annual data storage cost (storage only)

| Item | Year 1 (ramping) | Year-end run rate |
|------|------------------|-------------------|
| Archive volume (300 GB × $0.10 × 12) | ~**$180** avg | **$360/year** |
| Hot Mongo extra storage | **$0** | **$0** |
| **Total storage** | **~$180/year** | **~$360/year** |

**Per device (storage only):**

- Year 1 average: **~$0.36/device/year** (0.3% of $120 renewal)
- Steady state (year-end): **~$0.72/device/year** (0.6% of $120 renewal)

---

## Overall server cost @ 500 devices

Fixed Phase 1 compute + storage, allocated across 500 devices:

| Component | Monthly | Annual |
|-----------|---------|--------|
| SaaS 4 GB droplet | $24 | $288 |
| MQTT 2 GB droplet | $12 | $144 |
| Archive 2 GB droplet | $12 | $144 |
| Archive volume (~300 GB) | $30 | $360 |
| Managed Mongo (1 GB / 15 GB) | $15.23 | $183 |
| **Total** | **~$93** | **~$1,119/year** |

**Per device (all-in server):** **~$2.24/device/year** (~**$0.19/device/month**) — **1.9% of $10/mo renewal**.

### Cost breakdown per device ($2.24/year)

| Category | $/device/year | Share of cloud cost | Share of $120 renewal |
|----------|---------------|---------------------|------------------------|
| Data storage (archive) | ~$0.72 | ~32% | ~0.6% |
| Compute (droplets + Mongo base) | ~$1.52 | ~68% | ~1.3% |

---

## P&L snapshot (cloud layer only)

Single-site fleet of **500 devices** at steady state (Year 1, $10/mo renewal):

| | Monthly | Annual |
|--|---------|--------|
| Gross renewal revenue | $5,000 | $60,000 |
| DO cloud infrastructure | −$93 | −$1,119 |
| **Contribution after cloud** | **$4,907** | **$58,881** |

If **$3/mo cellular** is bundled and passed through at cost on all 500 devices (−$1,500/mo), contribution after cloud + cell becomes **~$3,407/mo (~$40,884/yr)** — still **~68% of gross renewal** before labor and hardware amortization.

---

## Scaling notes

1. **50 MB/month/device** is modest for this stack — archive volume is the primary scaling cost; hot Mongo stays on the smallest tier.
2. At **~25 GB/month** ingest, SaaS and MQTT droplets likely remain at 4 GB / 2 GB for Year 1.
3. Mongo **compute** may need a step-up before **storage** if query/report load grows with fleet size.
4. Revenue scales linearly with devices ($10/mo each); cloud stack is **largely fixed** until archive/compute tiers step up — margin improves with density until the next DO tier.
5. For comparison, Infrastructure Projections v1.0 assumes ~**3 MB/day/site** compressed archive (site-level, not per-device).

---

## Assumptions & disclaimer

| Assumption | Value |
|------------|-------|
| Devices | 500 |
| Renewal rate | **$10/device/month** ($120/year) |
| Per-device ingest | 50 MB/month (compressed archive equivalent) |
| Hot retention | 7 days (Mongo), then zstd export |
| Archive retention | Cumulative (Year 1 model) |
| Region | NYC1 / NYC3 (DigitalOcean) |
| Topology | Phase 1 split: SaaS + MQTT + Archive + Managed Mongo |

**Disclaimer:** Directional planning estimate for capacity, revenue, and capex review. Not a financial forecast, hardware quote, tax advice, or SLA commitment. DigitalOcean list prices as of document generation; formal quotes and renewal contracts may vary.

---

*Phase 1 Storage Cost Review v1.1 — PeakLogic platform planning.*

*PeakLogic is a company powered by [The Purple Standard](https://purple-standard.com). © Purple Standard Holdings.*
