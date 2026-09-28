# PeakLogic Phase 1 — WinSCP deployment guide

Complete procedure for DigitalOcean droplets plus **Managed MongoDB**, uploading bundles from Windows via **WinSCP**.

**Recommended Atlanta (`atl1`) — three droplets (dedicated MQTT):** [docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md) · [CHECKLIST-ATL-MQTT.txt](CHECKLIST-ATL-MQTT.txt)

**Legacy Atlanta (MQTT on SaaS):** [docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md) · [CHECKLIST-ATL.txt](CHECKLIST-ATL.txt)

This guide describes the **two-droplet** upload flow (SaaS + archive). For dedicated MQTT, also upload the SaaS bundle to **`cloud-mqtt-atl1`** and follow [droplet-mqtt/INSTALL.txt](droplet-mqtt/INSTALL.txt).

| Droplet | Hostname (example) | Bundle |
|---------|-------------------|--------|
| **Cloud 1 — SaaS hot** | `cloud-1-saas-atl1` | `peaklogic-cloud-YYYYMMDDd.tgz` |
| **Cloud 2 — Archive** | `cloud-2-archive-atl1` | `peaklogic-archive-YYYYMMDD.tgz` |
| **Cloud 3 — MQTT** (recommended) | `cloud-mqtt-atl1` | same SaaS bundle (for `deploy/` scripts only) |

Infrastructure target: **~237 sites Year 1** — 4 GB SaaS, 7-day hot Mongo, zstd archive, MQTT uplink. See [PeakLogic-Infrastructure-Projections.md](marketing/PeakLogic-Infrastructure-Projections.md).

Quick checklist: [deploy/cloud/phase1/CHECKLIST.txt](../deploy/cloud/phase1/CHECKLIST.txt)

---

## Part A — Prepare on Windows

### A1. Build both bundles

```powershell
cd C:\Users\public\data\est-pc
powershell -ExecutionPolicy Bypass -File scripts\create-phase1-bundles.ps1
```

Files appear in `dist\`:

- `peaklogic-cloud-YYYYMMDDd.tgz` (~cloud 1)
- `peaklogic-archive-YYYYMMDD.tgz` (~few KB — archive server only)
- Matching `.txt` manifests with copy-paste SSH commands

### A2. Generate secrets (save in password manager)

```powershell
# Run in PowerShell or Git Bash on Windows
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # PLATFORM_ADMIN_KEY
openssl rand -hex 32   # ARCHIVE_SERVER_TOKEN (same on both droplets)
openssl rand -hex 16   # MOSQUITTO_PASS
```

### A3. Prepare env files locally (optional — edit on droplet works too)

Copy templates from `deploy\cloud\phase1\` and fill placeholders:

| Template | Variable |
|----------|----------|
| `droplet-saas\saas.env.template` | `MONGODB_URI`, `JWT_SECRET`, `PLATFORM_ADMIN_KEY` |
| `droplet-saas\mqtt.env.template` | `MOSQUITTO_PASS` |
| `droplet-saas\archive-compact.env.template` | `ARCHIVE_SERVER_URL`, `ARCHIVE_SERVER_TOKEN` |
| `droplet-archive\archive.env.template` | `ARCHIVE_SERVER_TOKEN` |

---

## Part B — DigitalOcean control panel

### B1. VPC

1. **Networking → VPC → Create**
2. Name: `peaklogic-prod`, region e.g. `nyc3`
3. Both droplets must join this VPC (private `10.x.x.x` addresses)

### B2. Managed MongoDB

1. **Databases → Create → MongoDB**
2. Same region as droplets, **10 GB** starter (scale later)
3. Database name: `peaklogic_cloud`
4. Copy **Connection string** (`mongodb+srv://doadmin:...@...`)

Trusted sources: add **cloud 1 public IP** after that droplet exists (step D5).

### B3. Droplet — cloud-2-archive (deploy first)

| Setting | Value |
|---------|-------|
| Image | Debian 12 x64 |
| Size | Basic **1 GB** or **2 GB** |
| VPC | `peaklogic-prod` |
| Hostname | `cloud-2-archive` |

**Block storage (recommended):**

1. **Volumes → Create** — 100 GB+ (scale per [ARCHIVE_EXPORT.md](ARCHIVE_EXPORT.md))
2. Attach to `cloud-2-archive`
3. On droplet (SSH):

```bash
lsblk
# Format once (replace device if different):
mkfs.ext4 -F /dev/disk/by-id/scsi-0DO_Volume_archive
mkdir -p /data/archive
echo '/dev/disk/by-id/scsi-0DO_Volume_archive /data/archive ext4 defaults,nofail,discard 0 2' >> /etc/fstab
mount -a
```

### B4. Droplet — cloud-1-saas

| Setting | Value |
|---------|-------|
| Image | Debian 12 x64 |
| Size | Basic **4 GB** / 2 vCPU |
| VPC | `peaklogic-prod` |
| Hostname | `cloud-1-saas` |

### B5. Cloud Firewalls

**Archive firewall** (`fw-archive`):

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your office IP |
| Archive API | 8090 | cloud-1 **private** IP only |

**SaaS firewall** (`fw-saas`):

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your office IP |
| HTTP | 80 | All |
| HTTPS | 443 | All |
| MQTT TLS | 8883 | All (or site IP ranges) |

Do **not** expose MongoDB port 27017.

### B6. DNS

A record: `peaklogic.io` → **cloud-1 public IP**  
A record: `www.peaklogic.io` → same (or CNAME)

---

## Part C — WinSCP setup

### C1. Session — archive droplet

1. Open **WinSCP**, New Session
2. **File protocol:** SFTP
3. **Host name:** archive droplet **public IP**
4. **User name:** `root`
5. **Private key:** your DO SSH key (`.ppk` or convert OpenSSH key)
6. Save as `DO cloud-2-archive`

### C2. Session — SaaS droplet

Same steps, save as `DO cloud-1-saas`.

### C3. Upload rules

- Upload bundles to **`/tmp/`** on each droplet (not `/root/`)
- Binary mode: `.tgz` files
- After upload, verify size matches Windows `dist\` folder (WinSCP log or `ls -lh /tmp/*.tgz` over SSH)

---

## Part D — Deploy cloud 2 (archive)

### D1. WinSCP upload

Connect to **cloud-2-archive** → drag `peaklogic-archive-YYYYMMDD.tgz` to `/tmp/`

### D2. SSH — extract and configure

```bash
ssh root@ARCHIVE_PUBLIC_IP

ls -lh /tmp/peaklogic-archive-*.tgz
mkdir -p /opt/peaklogic-archive
tar xzf /tmp/peaklogic-archive-*.tgz -C /opt/peaklogic-archive --strip-components=1
ls /opt/peaklogic-archive/server.js
```

### D3. Secrets

```bash
mkdir -p /etc/peaklogic
cp /opt/peaklogic-archive/deploy/cloud/phase1/droplet-archive/archive.env.template \
   /etc/peaklogic/archive.env
nano /etc/peaklogic/archive.env
```

Set:

```ini
PORT=8090
ARCHIVE_ROOT=/data/archive
ARCHIVE_SERVER_TOKEN=<your ARCHIVE_SERVER_TOKEN from A2>
```

Ensure `/data/archive` exists and is writable (volume mounted in B3).

### D4. Install service

Replace `10.x.x.x` with **cloud-1 private IP** (get after cloud-1 exists; re-run ufw step if needed):

```bash
PEAKLOGIC_SOURCE=/opt/peaklogic-archive \
PEAKLOGIC_ARCHIVE_DIR=/opt/peaklogic-archive \
PEAKLOGIC_SAAS_IP=10.x.x.x \
bash /opt/peaklogic-archive/deploy/cloud/debian/install-archive.sh
```

### D5. Verify

```bash
curl -s http://127.0.0.1:8090/health
systemctl status peaklogic-archive
ip -4 addr show eth1 | grep inet    # private VPC IP — record this
```

**Record:** archive private IP = `____________`

---

## Part E — Deploy cloud 1 (SaaS)

### E1. WinSCP upload

Connect to **cloud-1-saas** → drag `peaklogic-cloud-YYYYMMDDd.tgz` to `/tmp/`  
(Large file — allow several minutes.)

### E2. SSH — extract

```bash
ssh root@SAAS_PUBLIC_IP

mkdir -p /home/peaklogic
tar xzf /tmp/peaklogic-cloud-*d.tgz -C /home/peaklogic --strip-components=1
ls /home/peaklogic/server.js /home/peaklogic/deploy/cloud/debian/install-saas.sh
sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/*.sh
```

### E3. SaaS secrets (before install)

```bash
mkdir -p /etc/peaklogic
cp /home/peaklogic/deploy/cloud/phase1/droplet-saas/saas.env.template /etc/peaklogic/saas.env
nano /etc/peaklogic/saas.env
```

Required:

- `MONGODB_URI` — full DO connection string
- `JWT_SECRET`, `PLATFORM_ADMIN_KEY`
- `PUBLIC_APP_URL=https://peaklogic.io`
- `PUBLIC_API_URL=https://peaklogic.io`

### E4. Run installer

```bash
export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
bash /home/peaklogic/deploy/cloud/debian/install-saas.sh
```

### E5. MongoDB allowlist

In DO **Databases → your cluster → Settings → Trusted sources**:

- Add **cloud-1-saas public IP**

Restart if service was failing:

```bash
systemctl restart peaklogic-saas
journalctl -u peaklogic-saas -n 30 --no-pager
```

### E6. Seed demo tenant

```bash
sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed'
curl -s http://127.0.0.1:3100/health
```

### E7. TLS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d peaklogic.io -d www.peaklogic.io
curl -sI https://peaklogic.io/login
```

Login: org `demo`, `operator@demo.local` / `demo`

---

## Part F — MQTT on cloud 1

After TLS cert exists (for `mqtts://peaklogic.io:8883`):

```bash
cp /home/peaklogic/deploy/cloud/phase1/droplet-saas/mqtt.env.template /etc/peaklogic/mqtt.env
nano /etc/peaklogic/mqtt.env
# MOSQUITTO_PASS=<from A2>, MOSQUITTO_TLS=true

bash /home/peaklogic/deploy/cloud/debian/enable-saas-mqtt.sh
systemctl status mosquitto peaklogic-saas
```

Test:

```bash
mosquitto_pub -h 127.0.0.1 -u peaklogic -P 'YOUR_PASS' -t peaklogic/test -m ok
```

Field appliances: **System setup → Cloud remote** — broker `mqtts://peaklogic.io:8883`, same MQTT user/password.

---

## Part G — Archive compaction (cloud 1 → cloud 2)

```bash
cp /home/peaklogic/deploy/cloud/phase1/droplet-saas/archive-compact.env.template \
   /etc/peaklogic/archive-compact.env
nano /etc/peaklogic/archive-compact.env
```

Set:

```ini
ARCHIVE_SERVER_URL=http://10.x.x.x:8090
ARCHIVE_SERVER_TOKEN=<same token as cloud 2>
MONGODB_DB=peaklogic_cloud
```

Enable daily timer (02:15 UTC):

```bash
bash /home/peaklogic/deploy/cloud/debian/enable-phase1-archive-compact.sh
```

Dry-run test:

```bash
sudo -u peaklogic bash -lc 'cd /home/peaklogic && ARCHIVE_COMPACT_DRY_RUN=1 node scripts/run-archive-compact.js'
systemctl list-timers | grep archive
```

---

## Part H — Final verification

| Check | Command / URL |
|-------|----------------|
| SaaS health | `curl -s https://peaklogic.io/health` |
| Archive health | On cloud 2: `curl -s http://127.0.0.1:8090/health` |
| Services | `systemctl status peaklogic-saas peaklogic-archive mosquitto` |
| Timer | `systemctl list-timers peaklogic-archive-compact.timer` |
| Mongo | SaaS logs show no connection errors |

---

## Part I — Updates via WinSCP

1. Re-run `create-phase1-bundles.ps1` on Windows
2. WinSCP upload new `.tgz` to `/tmp/` on target droplet
3. **SaaS:**

```bash
tar xzf /tmp/peaklogic-cloud-*d.tgz -C /home/peaklogic --strip-components=1
export PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic
bash /home/peaklogic/deploy/cloud/debian/install-saas.sh
```

4. **Archive:**

```bash
tar xzf /tmp/peaklogic-archive-*.tgz -C /opt/peaklogic-archive --strip-components=1
PEAKLOGIC_SOURCE=/opt/peaklogic-archive PEAKLOGIC_ARCHIVE_DIR=/opt/peaklogic-archive \
  bash /opt/peaklogic-archive/deploy/cloud/debian/install-archive.sh
```

Env files in `/etc/peaklogic/` are preserved across re-runs.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| WinSCP upload missing on droplet | Re-upload; confirm `/tmp/` path and complete transfer |
| SaaS restart loop | Fix `MONGODB_URI` in `saas.env`; Mongo allowlist |
| 502 on login | `journalctl -u peaklogic-saas -n 50`; `systemctl restart peaklogic-saas nginx` |
| Archive 401 | Token mismatch between `archive.env` and `archive-compact.env` |
| Compact job can't reach archive | Use **private IP**; check archive firewall allows cloud-1 |
| MQTT TLS fails | Run certbot first; re-run `enable-saas-mqtt.sh` |
| `zstd: not found` | Re-run `enable-phase1-archive-compact.sh` (installs zstd) |

---

## Related docs

- [CLOUD_DEPLOY_DO_PHASE1.md](CLOUD_DEPLOY_DO_PHASE1.md) — architecture summary
- [ARCHIVE_EXPORT.md](ARCHIVE_EXPORT.md) — compaction spec
- [CLOUD_USER_GUIDE.md](CLOUD_USER_GUIDE.md) — Sites pairing
- [deploy/cloud/phase1/README.md](../deploy/cloud/phase1/README.md) — file index
