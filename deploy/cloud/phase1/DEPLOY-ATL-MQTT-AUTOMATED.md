# PeakLogic Phase 1 ATL — automated deploy (after DO setup)

One-command deploy from Windows after DigitalOcean **`atl1`** resources exist: upload bundles, write env files, run install scripts on **archive → mqtt → saas → finish**.

**Architecture:** [CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md)  
**Checklist:** [CHECKLIST-ATL-MQTT.txt](CHECKLIST-ATL-MQTT.txt)  
**Manual fallback:** [WINSCP-DEPLOY.md](WINSCP-DEPLOY.md)

---

## What automation covers

| Step | Automated | Notes |
|------|-----------|--------|
| Build `peaklogic-cloud-*d.tgz` + `peaklogic-archive-*.tgz` | Yes | `npm run build:phase1-bundles` |
| SCP bundles to droplets | Yes | |
| Write `/etc/peaklogic/*.env` from your config | Yes | |
| `install-archive.sh` | Yes | archive role |
| certbot + `install-mqtt-droplet.sh` | Yes* | *requires DNS for `mqtt.peaklogic.io` unless `RUN_MQTT_CERTBOT=false` |
| `install-saas.sh` + seed | Yes | |
| `configure-saas-mqtt-remote.sh` | Yes | finish role |
| `enable-phase1-archive-compact.sh` + dry-run | Yes | finish role |
| Health / verify | Yes | verify role |

## What you still do in DO console (before deploy)

Complete **CHECKLIST-ATL-MQTT.txt** sections through droplet + firewall creation:

1. VPC `peaklogic-prod-atl1` (region **atl1**)
2. Managed Mongo `peaklogic-prod-mongo` — save connection string
3. Droplets: `cloud-2-archive-atl1`, `cloud-mqtt-atl1`, `cloud-1-saas-atl1` (same VPC)
4. Volume on archive → `/data/archive`
5. Firewalls: archive 8090 from SaaS private IP; mqtt 8883; saas 443 only (no 8883)
6. **DNS:** `A mqtt.peaklogic.io` → MQTT public IP (before deploy if using certbot)
7. Mongo **trusted sources:** add SaaS droplet **public** IP (can do right after SaaS step)

---

## Quick start

### 1. Generate secrets (PowerShell)

```powershell
function New-Secret { -join ((1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })) }
Write-Host "JWT_SECRET=$(New-Secret)"
Write-Host "PLATFORM_ADMIN_KEY=$(New-Secret)"
Write-Host "ARCHIVE_SERVER_TOKEN=$(New-Secret)"
Write-Host "MOSQUITTO_PASS=$(New-Secret)"
```

### 2. Create local config (gitignored)

```powershell
cd C:\Users\public\data\est-pc
Copy-Item deploy\cloud\phase1\phase1-atl.env.example deploy\cloud\phase1\phase1-atl.local.env
notepad deploy\cloud\phase1\phase1-atl.local.env
```

Fill at minimum:

| Variable | Example |
|----------|---------|
| `ARCHIVE_SSH` | `root@10.x.x.x` or `root@archive-ip` |
| `MQTT_SSH` | `root@mqtt-ip` |
| `SAAS_SSH` | `root@saas-ip` |
| `MONGODB_URI` | Full DO Mongo connection string |
| `JWT_SECRET`, `PLATFORM_ADMIN_KEY`, `ARCHIVE_SERVER_TOKEN`, `MOSQUITTO_PASS` | Generated above |
| `PUBLIC_APP_URL` / `PUBLIC_API_URL` | `http://SAAS_PUBLIC_IP` until DNS cutover |
| `SAAS_PUBLIC_IP` | For your records |

Optional: set `ARCHIVE_PRIVATE_IP` / `MQTT_PRIVATE_IP` if already known; otherwise the script detects them during install.

For **IP-only smoke test** before DNS:

```ini
RUN_MQTT_CERTBOT=false
RUN_SAAS_CERTBOT=false
```

### 3. SSH access

Ensure `ssh root@<each-droplet-ip>` works from this PC (key in agent or set `SSH_KEY=C:\Users\you\.ssh\id_ed25519` in config).

### 4. Deploy

```powershell
npm run deploy:phase1-atl
```

This runs:

1. Build bundles
2. **archive** — extract, env, install, health
3. **mqtt** — extract cloud bundle (for scripts), certbot (if enabled), Mosquitto
4. **saas** — extract, env, install, seed
5. **finish** — point SaaS at VPC broker, archive compact timer, dry-run compact
6. **verify** — local health checks on SaaS

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run build:phase1-bundles` | Build both tgz only |
| `npm run deploy:phase1-atl` | Full automated deploy |
| `npm run deploy:phase1-atl:dry-run` | Print steps without SSH |
| `npm run deploy:phase1-atl:upload-only` | Build + upload only (no remote install) |

### Run a single step

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-phase1-atl-mqtt.ps1 -Step mqtt
powershell -ExecutionPolicy Bypass -File scripts\deploy-phase1-atl-mqtt.ps1 -Step finish -SkipBuild
```

### Custom config path

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-phase1-atl-mqtt.ps1 -ConfigPath D:\secrets\prod-atl.env
```

---

## Post-deploy checklist

After `npm run deploy:phase1-atl` succeeds:

- [ ] Mongo trusted source = **SaaS public IP**
- [ ] `curl https://mqtt.peaklogic.io:8883` or TLS test from field network
- [ ] Login at `http://SAAS_PUBLIC_IP` (demo tenant)
- [ ] Confirm **no** `mosquitto` on SaaS: `ssh SAAS 'systemctl is-active mosquitto'` → inactive
- [ ] Archive from SaaS VPC: `curl http://ARCHIVE_PRIVATE_IP:8090/health`
- [ ] DNS cutover: `peaklogic.io` → SaaS IP, update `PUBLIC_*` to `https://peaklogic.io`, restart SaaS
- [ ] Field provisioning doc: **`mqtts://mqtt.peaklogic.io:8883`**, user/pass = `MOSQUITTO_USER` / `MOSQUITTO_PASS`

Save detected private IPs back into `phase1-atl.local.env` for future re-runs:

```ini
ARCHIVE_PRIVATE_IP=10.x.x.x
MQTT_PRIVATE_IP=10.x.y.y
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| SSH hangs | Set `SSH_KEY` in config; test `ssh -o ConnectTimeout=15 root@IP` |
| certbot fails on mqtt | Point DNS `mqtt.peaklogic.io` first, or `RUN_MQTT_CERTBOT=false` and add certs later |
| SaaS health OK, no MQTT hub | Re-run `-Step finish`; check `PEAKLOGIC_MQTT_BROKER` in `/etc/peaklogic/saas.env` |
| Compact dry-run fails | Add SaaS public IP to Mongo allowlist |
| `CHANGE_ME` error | Replace all placeholders in `phase1-atl.local.env` |

Remote install log prefix: `[phase1-remote]`. Re-run a single role safely; archive/mqtt/saas re-extract over existing dirs.

---

## Files

| File | Role |
|------|------|
| [phase1-atl.env.example](phase1-atl.env.example) | Config template |
| `phase1-atl.local.env` | Your secrets (gitignored) |
| [remote/phase1-remote-install.sh](remote/phase1-remote-install.sh) | Runs on each droplet |
| [scripts/deploy-phase1-atl-mqtt.ps1](../../scripts/deploy-phase1-atl-mqtt.ps1) | Windows orchestrator |
