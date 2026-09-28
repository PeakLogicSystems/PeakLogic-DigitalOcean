# PeakLogic Phase 1 — DigitalOcean deployment

## Recommended: three droplets (dedicated MQTT)

Atlanta **`atl1`** — MQTT on **`cloud-mqtt-atl1`** from day one. Future growth: **add SaaS droplets + bump Mongo**; broker stays on `mqtt.peaklogic.io`.

| Droplet | Role | Port(s) | RAM |
|---------|------|---------|-----|
| **cloud-1-saas** | Multi-tenant SaaS (no local Mosquitto) | 443→3100 | **4 GB** |
| **cloud-mqtt-atl1** | Mosquitto TLS for field + VPC plain for hubs | **8883**, 1883 | **4 GB** |
| **cloud-2-archive** | zstd blob store (no Mongo) | 8090 (VPC) | **1–2 GB** + volume |

Plus **DO Managed MongoDB** (same region).

| Document | Purpose |
|----------|---------|
| **[NYC1-PRODUCTION.md](NYC1-PRODUCTION.md)** | **Prod in nyc1 when atl1 unavailable** |
| **[DEPLOY-ATL-MQTT-AUTOMATED.md](DEPLOY-ATL-MQTT-AUTOMATED.md)** | **Automated upload + install (`npm run deploy:phase1-prod`)** |
| **[docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md)** | **Recommended ATL guide** |
| **[CHECKLIST-ATL-MQTT.txt](CHECKLIST-ATL-MQTT.txt)** | Three-droplet checklist |
| **[droplet-mqtt/INSTALL.txt](droplet-mqtt/INSTALL.txt)** | MQTT droplet install |

## Legacy: two droplets (MQTT on SaaS)

| Droplet | Role | Port(s) | RAM |
|---------|------|---------|-----|
| **cloud-1-saas** | SaaS + Mosquitto | 443→3100, 8883 | **4 GB** |
| **cloud-2-archive** | Archive | 8090 | **1–2 GB** |

## Guides

| Document | Purpose |
|----------|---------|
| **[WINSCP-DEPLOY.md](WINSCP-DEPLOY.md)** | Full step-by-step — build bundles on Windows, upload via WinSCP, configure each droplet |
| **[CHECKLIST-ATL-MQTT.txt](CHECKLIST-ATL-MQTT.txt)** | **Recommended** Atlanta checklist (dedicated MQTT) |
| **[CHECKLIST-ATL.txt](CHECKLIST-ATL.txt)** | Legacy Atlanta (MQTT on SaaS) |
| **[CHECKLIST.txt](CHECKLIST.txt)** | Generic Phase 1 checklist |
| [docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md) | Dedicated MQTT architecture + future scaling |
| [docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md) | Legacy ATL (MQTT on SaaS) |
| [docs/CLOUD_DEPLOY_DO_PHASE1.md](../../docs/CLOUD_DEPLOY_DO_PHASE1.md) | Generic architecture |
| [droplet-sandbox/INSTALL.txt](droplet-sandbox/INSTALL.txt) | Single-server sandbox (all functions) |
| [docs/ARCHIVE_EXPORT.md](../../docs/ARCHIVE_EXPORT.md) | Archive pipeline spec |

## Config templates

| File | Copy to (on droplet) |
|------|----------------------|
| [droplet-saas/saas.env.template](droplet-saas/saas.env.template) | `/etc/peaklogic/saas.env` |
| [droplet-saas/mqtt.env.template](droplet-saas/mqtt.env.template) | `/etc/peaklogic/mqtt.env` |
| [droplet-saas/archive-compact.env.template](droplet-saas/archive-compact.env.template) | `/etc/peaklogic/archive-compact.env` |
| [droplet-archive/archive.env.template](droplet-archive/archive.env.template) | `/etc/peaklogic/archive.env` |
| [droplet-mqtt/mqtt.env.template](droplet-mqtt/mqtt.env.template) | `/etc/peaklogic/mqtt.env` on **cloud-mqtt** |

## Scripts (on droplet after bundle extract)

| Script | Run on |
|--------|--------|
| `deploy/cloud/debian/install-mqtt-droplet.sh` | **cloud-mqtt-atl1** |
| `deploy/cloud/debian/configure-saas-mqtt-remote.sh` | **cloud-1-saas** (after MQTT private IP known) |
| `deploy/cloud/debian/enable-saas-mqtt.sh` | Legacy only — MQTT on SaaS |

## Build bundles (Windows)

```powershell
cd C:\Users\public\data\est-pc
npm run build:phase1-bundles
```

## Automated deploy (after DO atl1 setup)

```powershell
Copy-Item deploy\cloud\phase1\phase1-atl.env.example deploy\cloud\phase1\phase1-atl.local.env
# Edit phase1-atl.local.env — SSH hosts, Mongo URI, secrets
npm run deploy:phase1-atl
```

See **[DEPLOY-ATL-MQTT-AUTOMATED.md](DEPLOY-ATL-MQTT-AUTOMATED.md)**.

Output in `dist/`:

- `peaklogic-cloud-YYYYMMDDd.tgz` — cloud 1 SaaS
- `peaklogic-archive-YYYYMMDD.tgz` — cloud 2 archive server

## Install scripts (on droplets)

| Script | Droplet |
|--------|---------|
| `deploy/cloud/debian/install-saas.sh` | cloud 1 |
| `deploy/cloud/debian/enable-saas-mqtt.sh` | cloud 1 |
| `deploy/cloud/debian/enable-phase1-archive-compact.sh` | cloud 1 |
| `deploy/cloud/debian/install-archive.sh` | cloud 2 |

## Order of operations

1. Create DO resources (Mongo, VPC, droplets, firewall, DNS)
2. Deploy **cloud 2 archive** first (simpler; yields token + private IP)
3. Deploy **cloud 1 SaaS** (Mongo allowlist, TLS, seed)
4. Enable MQTT + archive compaction on cloud 1
5. Verify health + dry-run compact job

See **WINSCP-DEPLOY.md** for the complete procedure.
