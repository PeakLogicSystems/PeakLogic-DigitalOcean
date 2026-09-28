# PeakLogic Phase 1 — Atlanta production rollout (legacy: MQTT on SaaS)

> **Recommended:** dedicated MQTT droplet from day one — **[CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md)** + [CHECKLIST-ATL-MQTT.txt](../deploy/cloud/phase1/CHECKLIST-ATL-MQTT.txt). Future scale = add SaaS + bump Mongo; broker stays on `mqtt.peaklogic.io`.

**This doc:** two-droplet layout with Mosquitto **on cloud-1-saas** (colocated).

**Production (Year 1):** DigitalOcean region **`atl1`** (Atlanta) — two-droplet layout + Managed MongoDB.  
**Sandbox:** separate **`nyc1`** single-server stack at **`test.peaklogic.io`** (see [NYC sandbox](#nyc1-sandbox-testpeaklogicio) below).
WinSCP procedure: [deploy/cloud/phase1/WINSCP-DEPLOY.md](../deploy/cloud/phase1/WINSCP-DEPLOY.md)  
Checklist: [deploy/cloud/phase1/CHECKLIST-ATL.txt](../deploy/cloud/phase1/CHECKLIST-ATL.txt)

---

## Environment summary

| | **Production (ATL)** | **Sandbox (NYC)** |
|---|---------------------|-------------------|
| **Region** | `atl1` Atlanta | `nyc1` New York |
| **DNS** | `peaklogic.io` (after verification) | `test.peaklogic.io` |
| **Layout** | Cloud 1 SaaS + Cloud 2 archive | Single droplet, all roles |
| **Mongo** | DO Managed Mongo (`atl1`) | DO Managed Mongo (`nyc1`) or smaller tier |
| **MQTT** | Cloud 1 Mosquitto :8883 | Same droplet :8883 |
| **Archive** | Cloud 2 dedicated + volume | Local `:8090` on same droplet (dev) |
| **Purpose** | Y1 fleet (~237 sites) | Integration / demo / pre-prod |

Deploy and verify production on **`atl1` using the droplet public IP** (or a temporary hostname). **Cut DNS to `peaklogic.io` only after the verification gate** at the end of this doc.

---

## Atlanta architecture (`atl1`)

```
                         Internet
                             │
              ┌──────────────┴──────────────┐
              │  fw-saas-atl1               │
              │  22, 80, 443, 8883          │
              └──────────────┬──────────────┘
                             │
    ┌────────────────────────▼────────────────────────┐
    │  cloud-1-saas-atl1 (4 GB, VPC peaklogic-prod)   │
    │  nginx :443 → peaklogic-saas :3100              │
    │  Mosquitto :8883                                │
    │  peaklogic-archive-compact.timer                │
    └────────────┬───────────────────────┬────────────┘
                 │ mongodb+srv://       │ http://10.x.x.x:8090
                 │ (Managed Mongo atl1) │ VPC private
    ┌────────────▼────────────┐  ┌───────▼──────────────────────┐
    │ DO Managed MongoDB      │  │ cloud-2-archive-atl1         │
    │ peaklogic_cloud         │  │ peaklogic-archive :8090      │
    │ automated backups ON    │  │ volume /data/archive         │
    └─────────────────────────┘  │ volume snapshots ON          │
                                 └──────────────────────────────┘
```

**nginx:** on cloud 1 only — TLS + reverse proxy to :3100. No DO Load Balancer at Y1 launch.  
**LB (future):** add when scaling to 2+ SaaS droplets (Y2–Y3); see [Load balancer (future)](#load-balancer-future).

---

## DO resource naming (recommended)

| Resource | Name | Region | Notes |
|----------|------|--------|-------|
| VPC | `peaklogic-prod-atl1` | atl1 | |
| MongoDB cluster | `peaklogic-prod-mongo` | atl1 | 10–20 GB; DB `peaklogic_cloud` |
| Droplet | `cloud-1-saas-atl1` | atl1 | 4 GB / 2 vCPU |
| Droplet | `cloud-2-archive-atl1` | atl1 | 1–2 GB |
| Volume | `archive-prod-atl1` | atl1 | 100 GB+ → `/data/archive` |
| Firewall | `fw-saas-atl1` | atl1 | attach cloud-1 |
| Firewall | `fw-archive-atl1` | atl1 | attach cloud-2 |

---

## Firewall rules

### `fw-saas-atl1` (cloud 1)

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your IP |
| HTTP | 80 | All (certbot) |
| HTTPS | 443 | All |
| MQTT TLS | 8883 | All *(tighten to site IPs when known)* |

### `fw-archive-atl1` (cloud 2)

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your IP |
| Archive API | 8090 | **cloud-1 private IP only** |

---

## Secrets (generate once — separate prod vs sandbox)

```powershell
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # PLATFORM_ADMIN_KEY
openssl rand -hex 32   # ARCHIVE_SERVER_TOKEN
openssl rand -hex 16   # MOSQUITTO_PASS
```

Use **different values** for Atlanta production and NYC sandbox.

---

## Atlanta env files

Copy templates before running install scripts. Set `PUBLIC_*` URLs to match cutover state:

### Pre-DNS verification (use droplet IP or staging host)

```ini
PUBLIC_APP_URL=https://YOUR_DROPLET_IP
PUBLIC_API_URL=https://YOUR_DROPLET_IP
```

Or HTTP-only smoke test before certbot:

```ini
PUBLIC_APP_URL=http://YOUR_DROPLET_IP
PUBLIC_API_URL=http://YOUR_DROPLET_IP
```

### After DNS cutover to production

```ini
PUBLIC_APP_URL=https://peaklogic.io
PUBLIC_API_URL=https://peaklogic.io
```

| File (cloud 1) | Template |
|----------------|----------|
| `/etc/peaklogic/saas.env` | `deploy/cloud/phase1/droplet-saas/saas.env.template` |
| `/etc/peaklogic/mqtt.env` | `deploy/cloud/phase1/droplet-saas/mqtt.env.template` |
| `/etc/peaklogic/archive-compact.env` | `deploy/cloud/phase1/droplet-saas/archive-compact.env.template` |

| File (cloud 2) | Template |
|----------------|----------|
| `/etc/peaklogic/archive.env` | `deploy/cloud/phase1/droplet-archive/archive.env.template` |

**`archive-compact.env`** — use cloud 2 **VPC private IP**:

```ini
ARCHIVE_SERVER_URL=http://10.x.x.x:8090
ARCHIVE_SERVER_TOKEN=<same as cloud 2 archive.env>
MONGODB_DB=peaklogic_cloud
```

---

## Deploy order (Atlanta)

1. Build bundles: `npm run build:phase1-bundles`
2. Create VPC, Mongo, firewalls, droplets, volume (all **`atl1`**)
3. **Cloud 2 archive** — WinSCP bundle → `install-archive.sh` → record private IP
4. **Cloud 1 SaaS** — WinSCP bundle → `saas.env` → `install-saas.sh`
5. Mongo **Trusted sources** → cloud-1 **public** IP
6. `npm run seed` (demo tenant)
7. **Verify on IP** (see gate below) — *before DNS*
8. `certbot --nginx -d peaklogic.io -d www.peaklogic.io` *(after DNS, or use `-d` with IP-only if using temporary name)*
9. `enable-saas-mqtt.sh` → `enable-phase1-archive-compact.sh`
10. Dry-run compact job
11. **DNS cutover** → `peaklogic.io`
12. Update `PUBLIC_*` in `saas.env` if needed → `systemctl restart peaklogic-saas`

---

## Backups & integrity

| Layer | Resource | Action |
|-------|----------|--------|
| Hot + app data | Managed Mongo (`atl1`) | Enable **automated backups** in DO panel |
| Archive blobs | Volume on cloud 2 | Schedule **volume snapshots** (daily/weekly) |
| Write integrity | Archive pipeline | SHA256 verify before Mongo delete (built-in) |

Cloud 2 stays **same region as cloud 1** — no cross-region primary archive at Y1.

---

## Verification gate (before `peaklogic.io` DNS)

Complete on **cloud-1 public IP** (or temporary A record):

```bash
# SaaS
curl -s http://127.0.0.1:3100/health
curl -sI https://YOUR_DROPLET_IP/login   # after certbot, or http before TLS

# Archive (from cloud 1 via private IP)
curl -s http://10.x.x.x:8090/health

# MQTT
mosquitto_pub -h 127.0.0.1 -u peaklogic -P '...' -t test -m ok

# Compact dry-run
sudo -u peaklogic bash -lc 'cd /home/peaklogic && ARCHIVE_COMPACT_DRY_RUN=1 node scripts/run-archive-compact.js'

# Services
systemctl status peaklogic-saas peaklogic-archive mosquitto
systemctl list-timers | grep archive-compact
```

Browser: login org `demo`, Studio loads, Sites page reachable.

**Only then:**

1. Point **A** `peaklogic.io` → cloud-1 public IP  
2. Point **A/CNAME** `www.peaklogic.io` → same  
3. Re-run certbot if certs were IP-only  
4. Update appliance docs: `mqtts://peaklogic.io:8883`

---

## DNS plan

| Hostname | Target | When |
|----------|--------|------|
| `peaklogic.io` | cloud-1-saas-atl1 public IP | After verification gate |
| `www.peaklogic.io` | same | With production cutover |
| `test.peaklogic.io` | NYC sandbox droplet IP | Independent; keep for sandbox |

Production and sandbox use **separate Mongo clusters** and **separate secrets** — do not point sandbox at prod Mongo.

---

## Load balancer (future)

**Not required for Y1 Atlanta launch.**

Add **DO Load Balancer** when running 2+ SaaS droplets:

```
Internet → DO LB :443 → cloud-1a / cloud-1b (nginx → :3100)
```

- Health check: `GET /health`
- Consider sticky sessions for WebSockets/Studio
- MQTT (:8883) typically stays direct to a broker node or dedicated MQTT host — plan TCP passthrough separately from HTTP LB

---

## NYC1 sandbox (`test.peaklogic.io`)

Single droplet for integration testing — **all Phase 1 functions on one box**:

| Function | On sandbox droplet |
|----------|-------------------|
| SaaS :3100 | Yes |
| nginx + TLS | Yes (`test.peaklogic.io`) |
| Mosquitto :8883 | Yes |
| Archive :8090 | Yes (`127.0.0.1` — not a second droplet) |
| Managed Mongo | Yes (`nyc1`, separate cluster) |

Guide: [deploy/cloud/phase1/droplet-sandbox/INSTALL.txt](../deploy/cloud/phase1/droplet-sandbox/INSTALL.txt)  
Env template: [deploy/cloud/phase1/droplet-sandbox/saas.env.template](../deploy/cloud/phase1/droplet-sandbox/saas.env.template)

```
Region nyc1 — single droplet (2–4 GB)
├── peaklogic-saas :3100
├── nginx → test.peaklogic.io
├── Mosquitto :8883
├── peaklogic-archive :8090 → /var/lib/peaklogic/archive (local disk)
├── archive-compact → http://127.0.0.1:8090
└── Managed Mongo (nyc1, separate from prod)
```

Use sandbox for bundle smoke tests, MQTT/appliance pairing trials, and CMMS demos. Promote bundles to Atlanta after sandbox passes.

---

## Related

- [CLOUD_DEPLOY_DO_PHASE1.md](CLOUD_DEPLOY_DO_PHASE1.md) — generic Phase 1 architecture
- [deploy/cloud/phase1/WINSCP-DEPLOY.md](../deploy/cloud/phase1/WINSCP-DEPLOY.md)
- [ARCHIVE_EXPORT.md](ARCHIVE_EXPORT.md)
- [CLOUD_USER_GUIDE.md](CLOUD_USER_GUIDE.md)
