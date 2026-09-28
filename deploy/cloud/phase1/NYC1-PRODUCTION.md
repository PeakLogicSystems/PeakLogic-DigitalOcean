# PeakLogic Phase 1 production — NYC1 (when Atlanta is unavailable)

Use this when **DigitalOcean has no `atl1`** in your account. Architecture is **identical** — only the region slug changes.

**Same 3-droplet layout:** cloud-1-saas · cloud-mqtt · cloud-2-archive + Managed Mongo + VPC.

---

## Prod vs sandbox (both may be NYC1)

| | **Production** | **Sandbox** |
|---|----------------|---------------|
| **Region** | `nyc1` | `nyc1` |
| **VPC** | `peaklogic-prod-nyc1` | `peaklogic-sandbox-nyc1` (separate) |
| **Mongo** | `peaklogic-prod-mongo` | `peaklogic-sandbox-mongo` (separate cluster) |
| **Droplets** | 3 (saas, mqtt, archive) | 1 all-in-one |
| **DNS** | `peaklogic.io`, `mqtt.peaklogic.io` | `test.peaklogic.io` |
| **Secrets** | prod JWT / MQTT pass | different values |

Do **not** share Mongo clusters or VPCs between prod and sandbox.

---

## DO resource names (NYC1 prod)

| Resource | Name | Region |
|----------|------|--------|
| VPC | `peaklogic-prod-nyc1` | nyc1 |
| MongoDB | `peaklogic-prod-mongo` | nyc1 |
| Droplet | `cloud-1-saas-nyc1` | nyc1 · 4 GB |
| Droplet | `cloud-mqtt-nyc1` | nyc1 · 4 GB |
| Droplet | `cloud-2-archive-nyc1` | nyc1 · 1–2 GB |
| Volume | `archive-prod-nyc1` | 100 GB+ → `/data/archive` |

Mongo connection string will contain **`nyc1`** or **`private-peaklogic-prod-mongo-....mongo.ondigitalocean.com`** (VPC private endpoint — normal).

---

## Deploy config

```powershell
cd C:\Users\public\data\est-pc
Copy-Item deploy\cloud\phase1\phase1-atl.env.example deploy\cloud\phase1\phase1-prod.local.env
notepad deploy\cloud\phase1\phase1-prod.local.env
```

Example Mongo URI (private VPC):

```ini
MONGODB_URI=mongodb+srv://doadmin:PASSWORD@private-peaklogic-prod-mongo-xxxxx.mongo.ondigitalocean.com/peaklogic_cloud?tls=true&authSource=admin
MONGODB_DB=peaklogic_cloud
```

Deploy (script name says `atl` but works for any region):

```powershell
npm run build:phase1-bundles
npm run deploy:phase1-prod
```

---

## Checklist

Same steps as [CHECKLIST-ATL-MQTT.txt](CHECKLIST-ATL-MQTT.txt) — substitute **`nyc1`** everywhere the ATL checklist says **`atl1`**.

Full architecture: [CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md) (region-agnostic layout).

---

## Migrate to Atlanta later

When `atl1` becomes available: create new VPC + Mongo + droplets in `atl1`, deploy bundles, cut DNS (`mqtt.peaklogic.io`, `peaklogic.io`). Field devices keep **`mqtts://mqtt.peaklogic.io:8883`** — no appliance reconfig if DNS moves with you.
