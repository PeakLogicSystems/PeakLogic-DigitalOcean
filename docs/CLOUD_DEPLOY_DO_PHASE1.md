# PeakLogic Phase 1 — DigitalOcean deployment

Two-droplet **Phase 1** layout for production launch (~237 sites Year 1). Step-by-step **WinSCP** instructions: **[deploy/cloud/phase1/WINSCP-DEPLOY.md](../deploy/cloud/phase1/WINSCP-DEPLOY.md)**.

**Atlanta production (`atl1`) — recommended (dedicated MQTT):** **[CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md)**  
**Atlanta legacy (MQTT on SaaS):** [CLOUD_DEPLOY_DO_PHASE1_ATL.md](CLOUD_DEPLOY_DO_PHASE1_ATL.md) · NYC sandbox: `test.peaklogic.io`

Single-droplet SaaS-only path (no archive server): [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md).

---

## Architecture

```
                         Internet
                             │
              ┌──────────────┴──────────────┐
              │     Cloud firewall          │
              │  22, 80, 443, 8883 (MQTT)  │
              └──────────────┬──────────────┘
                             │
    ┌────────────────────────▼────────────────────────┐
    │  Droplet cloud-1-saas (4 GB, VPC)               │
    │  nginx :443 → peaklogic-saas :3100              │
    │  Mosquitto :8883 (TLS)                          │
    │  systemd: peaklogic-archive-compact.timer       │
    └────────────┬───────────────────────┬────────────┘
                 │ mongodb+srv://        │ http://10.x:8090
                 │                       │ (VPC private)
    ┌────────────▼────────────┐  ┌───────▼──────────────────┐
    │ DO Managed MongoDB    │  │ Droplet cloud-2-archive   │
    │ 7-day hot telemetry   │  │ peaklogic-archive :8090   │
    │ peaklogic_cloud       │  │ /data/archive (volume)    │
    └───────────────────────┘  └───────────────────────────┘
```

| Component | Port | Notes |
|-----------|------|-------|
| SaaS API / Studio | **3100** (internal), **443** (public) | `peaklogic-saas.service` |
| MQTT TLS | **8883** | Field Opta / appliance uplink |
| Archive API | **8090** | VPC-only; Bearer token |
| Edge runtime | **3090** | Optional — not required Phase 1 |

---

## DigitalOcean resources

| Resource | Spec | Purpose |
|----------|------|---------|
| VPC | Same region | Private traffic cloud 1 ↔ cloud 2 |
| MongoDB | 10–20 GB starter | Hot historian + config |
| cloud-1-saas | Debian 12, **4 GB** | SaaS + MQTT + compact cron |
| cloud-2-archive | Debian 12, 1–2 GB + **100 GB volume** | zstd blobs |
| Firewalls | See WinSCP guide | Restrict 8090 to cloud-1 private IP |

---

## Build bundles (Windows)

```powershell
cd C:\Users\public\data\est-pc
powershell -ExecutionPolicy Bypass -File scripts\create-phase1-bundles.ps1
```

| Bundle | Droplet |
|--------|---------|
| `dist/peaklogic-cloud-YYYYMMDDd.tgz` | cloud-1-saas |
| `dist/peaklogic-archive-YYYYMMDD.tgz` | cloud-2-archive |

---

## Config files (on droplets)

| Path | Template |
|------|----------|
| `/etc/peaklogic/saas.env` | `deploy/cloud/phase1/droplet-saas/saas.env.template` |
| `/etc/peaklogic/mqtt.env` | `deploy/cloud/phase1/droplet-saas/mqtt.env.template` |
| `/etc/peaklogic/archive-compact.env` | `deploy/cloud/phase1/droplet-saas/archive-compact.env.template` |
| `/etc/peaklogic/archive.env` | `deploy/cloud/phase1/droplet-archive/archive.env.template` |

---

## Install scripts

| Order | Droplet | Script |
|-------|---------|--------|
| 1 | cloud-2-archive | `deploy/cloud/debian/install-archive.sh` |
| 2 | cloud-1-saas | `deploy/cloud/debian/install-saas.sh` |
| 3 | cloud-1-saas | `deploy/cloud/debian/enable-saas-mqtt.sh` |
| 4 | cloud-1-saas | `deploy/cloud/debian/enable-phase1-archive-compact.sh` |

---

## Deploy order

1. **Archive droplet** — simpler; produces private IP + shared token
2. **SaaS droplet** — Mongo allowlist, TLS, seed
3. **MQTT + compaction** on SaaS
4. **Verify** — health, dry-run compact, login

Full WinSCP walkthrough: **[deploy/cloud/phase1/WINSCP-DEPLOY.md](../deploy/cloud/phase1/WINSCP-DEPLOY.md)**  
Checklist: **[deploy/cloud/phase1/CHECKLIST.txt](../deploy/cloud/phase1/CHECKLIST.txt)**

---

## Scaling beyond Phase 1

| Milestone | Change |
|-----------|--------|
| Y2–Y3 (~700–1500 sites) | Scale Mongo 50–250 GB; archive volume 2–8 TB |
| Y4+ | Split ingest/GUI tiers; object storage for archive |

See [PeakLogic-Infrastructure-Projections.md](marketing/PeakLogic-Infrastructure-Projections.md).

---

## Related

- [ARCHIVE_EXPORT.md](ARCHIVE_EXPORT.md)
- [CLOUD_SAAS.md](CLOUD_SAAS.md)
- [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md)
- [deploy/cloud/phase1/README.md](../deploy/cloud/phase1/README.md)
