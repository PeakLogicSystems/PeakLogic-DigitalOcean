# PeakLogic Cloud Phase 1 — Atlanta Deploy (atl1)

**Document version:** 1.0 · Run `npm run build:phase1-atl-deploy-pdf` for build date

**Production (Year 1):** DigitalOcean **`atl1`** or **`nyc1`** — **three-droplet** layout + Managed MongoDB.

Mosquitto lives on **`cloud-mqtt-atl1`** from day one. Future growth is mostly: add SaaS droplets (+ Load Balancer when >1), bump Managed Mongo tier, optionally resize MQTT RAM — **no broker migration**.

**Field broker URL (permanent):** `mqtts://mqtt.peaklogic.io:8883`

**Automated deploy:** `npm run deploy:phase1-atl` (after DO resources exist)

---

## 1. Architecture

```text
                         Internet
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
  peaklogic.io:443    mqtt.peaklogic.io:8883   (archive VPC only)
         │                   │
  ┌──────▼──────────┐  ┌─────▼─────────────┐
  │ cloud-1-saas    │  │ cloud-mqtt-atl1   │
  │ 4 GB            │  │ 4 GB (→ 8 GB)     │
  │ nginx → :3100   │  │ Mosquitto :8883   │
  │ NO Mosquitto    │  │ :1883 VPC plain   │
  └──────┬──────────┘  └─────────┬─────────┘
         │    mqtt://10.x:1883    │
         └───────────┬────────────┘
                     │
         ┌───────────▼───────────┐     ┌─────────────────────┐
         │ DO Managed Mongo atl1 │     │ cloud-2-archive-atl1 │
         │ peaklogic_cloud       │     │ :8090 + volume       │
         └───────────────────────┘     └─────────────────────┘
```

| Hostname | Role | Public ports |
|----------|------|--------------|
| `peaklogic.io` | SaaS Studio, login, API | **443** (80 for certbot) |
| `mqtt.peaklogic.io` | Field MQTT TLS | **8883** |
| Archive | zstd blobs | **none** (VPC 8090 from SaaS only) |

**SaaS firewall:** 22, 80, 443 — **not 8883**.  
**MQTT firewall:** 22, **8883**.  
**Never** put a Load Balancer on MQTT ingest `:8883`.

---

## 2. DigitalOcean resources

| Resource | Name | Region | Spec |
|----------|------|--------|------|
| VPC | `peaklogic-prod-atl1` | atl1 | |
| MongoDB | `peaklogic-prod-mongo` | atl1 | 10–20 GB → scale tier |
| Droplet | `cloud-1-saas-atl1` | atl1 | **4 GB** / 2 vCPU |
| Droplet | `cloud-mqtt-atl1` | atl1 | **4 GB** / 2 vCPU |
| Droplet | `cloud-2-archive-atl1` | atl1 | **1–2 GB** |
| Volume | `archive-prod-atl1` | atl1 | 100 GB+ → `/data/archive` |
| Firewall | `fw-saas-atl1` | atl1 | cloud-1: 22, 80, 443 |
| Firewall | `fw-mqtt-atl1` | atl1 | cloud-mqtt: 22, 8883 |
| Firewall | `fw-archive-atl1` | atl1 | cloud-2: 8090 from SaaS private IP only |

---

## 3. DNS

| Record | Target | When |
|--------|--------|------|
| **`mqtt.peaklogic.io`** | **cloud-mqtt public IP** | **Before field device onboarding** |
| `peaklogic.io` | cloud-1-saas public IP | After SaaS verification gate |
| `www.peaklogic.io` | same | Production cutover |
| `test.peaklogic.io` | NYC sandbox | Independent |

---

## 4. Secrets (production only)

Generate once (different from sandbox):

```powershell
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # PLATFORM_ADMIN_KEY
openssl rand -hex 32   # ARCHIVE_SERVER_TOKEN
openssl rand -hex 16   # MOSQUITTO_PASS  (shared: mqtt + SaaS hub + field)
```

| Secret | Used on |
|--------|---------|
| `JWT_SECRET` | SaaS |
| `PLATFORM_ADMIN_KEY` | SaaS admin API |
| `ARCHIVE_SERVER_TOKEN` | Archive + SaaS compact job |
| `MOSQUITTO_PASS` | MQTT droplet, field devices, SaaS hub |

---

## 5. Env files (on droplets)

| Droplet | File | Purpose |
|---------|------|---------|
| cloud-mqtt | `/etc/peaklogic/mqtt.env` | `PEAKLOGIC_DOMAIN=mqtt.peaklogic.io`, Mosquitto auth |
| cloud-1-saas | `/etc/peaklogic/saas.env` | Mongo URI, JWT, `PUBLIC_*` URLs |
| cloud-1-saas | `/etc/peaklogic/archive-compact.env` | Archive private IP + token |
| cloud-2-archive | `/etc/peaklogic/archive.env` | `ARCHIVE_ROOT`, token, port 8090 |

**SaaS MQTT:** Do **not** run `enable-saas-mqtt.sh`. Use `configure-saas-mqtt-remote.sh` to set `PEAKLOGIC_MQTT_BROKER=mqtt://10.x.x.x:1883`.

Templates in repo: `deploy/cloud/phase1/droplet-*/`

---

## 6. Deploy order

### 6a. Automated (recommended)

After DO console setup (Section 7):

1. Copy `deploy/cloud/phase1/phase1-atl.env.example` → `phase1-atl.local.env`
2. Fill SSH hosts (`ARCHIVE_SSH`, `MQTT_SSH`, `SAAS_SSH`), `MONGODB_URI`, secrets, `PUBLIC_*`
3. Ensure SSH from Windows PC to all three droplets
4. Run: **`npm run deploy:phase1-atl`**

Automation runs: **archive → mqtt → saas → finish → verify**

| npm command | Purpose |
|-------------|---------|
| `npm run build:phase1-bundles` | Build tgz only |
| `npm run deploy:phase1-atl` | Full deploy |
| `npm run deploy:phase1-atl:dry-run` | Preview without SSH |
| `npm run deploy:phase1-atl:upload-only` | Upload bundles + scripts only |

**IP-only smoke test** (before DNS): set in `phase1-atl.local.env`:

```ini
RUN_MQTT_CERTBOT=false
RUN_SAAS_CERTBOT=false
```

### 6b. Manual order (WinSCP fallback)

1. `npm run build:phase1-bundles`
2. Create VPC, Mongo, firewalls, three droplets, archive volume — all **atl1**
3. DNS: `mqtt.peaklogic.io` → MQTT droplet IP
4. **cloud-2-archive** — install → record **private IP**
5. **cloud-mqtt-atl1** — certbot → `install-mqtt-droplet.sh` → record **private IP**
6. **cloud-1-saas** — `saas.env` → `install-saas.sh` → Mongo allowlist → seed
7. `configure-saas-mqtt-remote.sh` with MQTT private IP
8. Verify on IPs — **before** `peaklogic.io` DNS
9. `certbot --nginx` for peaklogic.io (after DNS)
10. `enable-phase1-archive-compact.sh`
11. DNS cutover → update `PUBLIC_*` → restart SaaS

---

## 7. Pre-deploy checklist (DO console)

### Automated path

- [ ] DO resources created (VPC, Mongo, droplets, firewalls, volume)
- [ ] `phase1-atl.local.env` filled (SSH, Mongo URI, secrets)
- [ ] DNS `A mqtt.peaklogic.io` → MQTT public IP (or `RUN_MQTT_CERTBOT=false`)
- [ ] SSH works to archive, mqtt, saas from deploy PC
- [ ] `npm run deploy:phase1-atl`
- [ ] Mongo trusted source = SaaS **public** IP

### VPC and Mongo

- [ ] VPC: `peaklogic-prod-atl1` (region atl1)
- [ ] Managed Mongo: `peaklogic-prod-mongo`, DB `peaklogic_cloud`
- [ ] Mongo automated backups enabled
- [ ] Connection string saved

### cloud-2-archive-atl1

- [ ] Droplet 1–2 GB, same VPC
- [ ] Volume 100+ GB mounted at `/data/archive`
- [ ] Firewall: 8090 from SaaS private IP only
- [ ] `curl http://127.0.0.1:8090/health` OK
- [ ] Private IP recorded: 10._______

### cloud-mqtt-atl1

- [ ] Droplet 4 GB, same VPC
- [ ] Firewall: 22, 8883
- [ ] certbot for `mqtt.peaklogic.io` (if not automated)
- [ ] `mosquitto_pub` local test OK
- [ ] Private IP recorded: 10._______

### cloud-1-saas-atl1

- [ ] Droplet 4 GB, same VPC
- [ ] Firewall: 22, 80, 443 only (**no 8883**)
- [ ] `install-saas.sh` — **no** `enable-saas-mqtt.sh`
- [ ] Mongo allowlist includes SaaS public IP
- [ ] `configure-saas-mqtt-remote.sh` with MQTT private IP
- [ ] `curl http://127.0.0.1:3100/health` (hub connected)

### Archive compact (SaaS)

- [ ] `/etc/peaklogic/archive-compact.env` configured
- [ ] `enable-phase1-archive-compact.sh`
- [ ] Compact dry-run OK

---

## 8. Verification gate

**MQTT droplet:**

```bash
mosquitto_pub -h 127.0.0.1 -u peaklogic -P '...' -t test -m ok
systemctl status mosquitto
```

**SaaS droplet:**

```bash
curl -s http://127.0.0.1:3100/health
grep PEAKLOGIC_MQTT_BROKER /etc/peaklogic/saas.env
systemctl status peaklogic-saas
! systemctl is-active mosquitto && echo "OK: no local mosquitto"
```

**End-to-end (SaaS via VPC):**

```bash
mosquitto_pub -h 10.x.x.x -u peaklogic -P '...' \
  -t 'peaklogic/v1/demo-tenant/test_device/telemetry' \
  -m '{"deviceId":"test_device","tags":[{"id":"T1","type":"BOOL","value":true}]}'
```

**Post-deploy:**

- [ ] `mqtt.peaklogic.io:8883` TLS reachable
- [ ] SaaS login on droplet IP — demo tenant
- [ ] No mosquitto on SaaS droplet
- [ ] Archive reachable from SaaS (private IP)

---

## 9. DNS cutover (production)

- [ ] `A peaklogic.io` → cloud-1-saas public IP
- [ ] `PUBLIC_APP_URL` / `PUBLIC_API_URL` → `https://peaklogic.io`
- [ ] `systemctl restart peaklogic-saas`
- [ ] `https://peaklogic.io/login` verified
- [ ] Field provisioning: **`mqtts://mqtt.peaklogic.io:8883`**

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| SSH hangs on deploy | Set `SSH_KEY` in config; test `ssh -o ConnectTimeout=15 root@IP` |
| certbot fails on mqtt | Point DNS first, or `RUN_MQTT_CERTBOT=false` |
| SaaS health OK, no MQTT hub | Re-run deploy `-Step finish`; check `PEAKLOGIC_MQTT_BROKER` |
| Compact dry-run fails | Add SaaS public IP to Mongo allowlist |
| Local mosquitto on SaaS | Re-run `configure-saas-mqtt-remote.sh` |

---

## 11. Future scaling (summary)

| Stays fixed | Grows with fleet |
|-------------|------------------|
| `mqtt.peaklogic.io` hostname | + SaaS droplets + LB on :443 |
| Archive volume + compact pipeline | Managed Mongo tier/disk |
| VPC `peaklogic-prod-atl1` | Ingest shards (:3090) → same MQTT VPC broker |

**Do not redo:** field broker URL, Mongo URI pattern, archive pipeline, MQTT topic layout.

---

## 12. Cost reference (atl1)

| Layout | ~Monthly |
|--------|----------|
| 2-droplet (MQTT on SaaS) | ~$70–90 |
| **3-droplet (+ dedicated MQTT 4 GB)** | **~$95–115** |

See also: `docs/CLOUD_VERTICAL_SHARDS.md` · `docs/marketing/CLOUD_INFRA_PRICING.md`

---

## Repo references

| Path | Purpose |
|------|---------|
| `docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md` | Architecture (markdown) |
| `deploy/cloud/phase1/DEPLOY-ATL-MQTT-AUTOMATED.md` | Automated runbook |
| `deploy/cloud/phase1/CHECKLIST-ATL-MQTT.txt` | Printable checklist |
| `deploy/cloud/phase1/phase1-atl.env.example` | Deploy config template |
| `scripts/deploy-phase1-atl-mqtt.ps1` | Windows orchestrator |

**Sandbox:** `nyc1` @ `test.peaklogic.io` — separate from production atl1.
