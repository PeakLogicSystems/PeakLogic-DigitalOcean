# Deploy PeakLogic Cloud SaaS on DigitalOcean

Step-by-step guide for a production multi-tenant PeakLogic droplet with **Managed MongoDB**, **nginx**, and **TLS**.

**Phase 1 Atlanta (recommended):** three droplets (SaaS + **dedicated MQTT** + archive) — **[CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md)**.  
**Phase 1 generic:** [CLOUD_DEPLOY_DO_PHASE1.md](CLOUD_DEPLOY_DO_PHASE1.md) · **Legacy ATL (MQTT on SaaS):** [CLOUD_DEPLOY_DO_PHASE1_ATL.md](CLOUD_DEPLOY_DO_PHASE1_ATL.md) · WinSCP: [deploy/cloud/phase1/WINSCP-DEPLOY.md](../deploy/cloud/phase1/WINSCP-DEPLOY.md).

## Architecture

```
                    Internet
                        │
                   DO Cloud Firewall
                   (22, 80, 443)
                        │
              ┌─────────▼─────────┐
              │  Droplet (Debian) │
              │  nginx :80/:443   │
              │       │           │
              │  peaklogic-saas   │
              │  Node server.js   │
              │  port 3100        │
              └─────────┬─────────┘
                        │ mongodb+srv://
              ┌─────────▼─────────┐
              │ DO Managed Mongo  │
              │ (allowlist IP)    │
              └───────────────────┘

Site appliances (3090) ──MQTT──► optional 3090 runtime on same droplet
```

## 1. Create DigitalOcean resources

### Droplet

| Setting | Value |
|---------|-------|
| Image | Debian 12 x64 |
| Plan | ≥2 GB RAM (4 GB recommended for Studio + historian) |
| Region | Same as MongoDB cluster |
| Authentication | SSH key |

### Managed MongoDB

1. **Databases → Create → MongoDB**
2. Same region as droplet
3. Create database `peaklogic_cloud`
4. Copy **Connection string** (`mongodb+srv://...`)
5. After droplet exists: **Settings → Trusted sources → Add droplet IP**

### DNS (optional but recommended)

A record: `peaklogic.io` → droplet public IP  
A record: `www` → droplet public IP

### Cloud Firewall

Attach to droplet:

| Inbound | Port | Source |
|---------|------|--------|
| SSH | 22 | Your IP |
| HTTP | 80 | All |
| HTTPS | 443 | All |

Do **not** expose MongoDB port 27017 publicly.

## 2. Build install bundle (Windows dev machine)

From `est-pc`:

```powershell
cd C:\Users\public\data\est-pc
powershell -ExecutionPolicy Bypass -File scripts\create-saas-bundle.ps1
```

Output: `dist/peaklogic-saas-YYYYMMDD.tgz`

**Deprecated:** `scripts/create-cloud-bundle.ps1` targeted a legacy separate `peaklogic-cloud` repo. Use **`create-saas-bundle.ps1`** only.

## 3. Upload to droplet

```powershell
powershell -ExecutionPolicy Bypass -File scripts\upload-cloud-bundle.ps1 `
  -DropletHost root@YOUR_DROPLET_IP `
  -BundlePath dist\peaklogic-saas-YYYYMMDD.tgz
```

Or manually:

```bash
scp dist/peaklogic-saas-*.tgz root@YOUR_DROPLET_IP:/tmp/
```

## 4. Extract and configure

SSH to droplet:

```bash
ssh root@YOUR_DROPLET_IP
mkdir -p /home/peaklogic
tar xzf /tmp/peaklogic-saas-*.tgz -C /home/peaklogic --strip-components=1
ls /home/peaklogic/server.js   # must exist
```

Edit secrets **before** or **immediately after** install:

```bash
nano /etc/peaklogic/saas.env
```

Set:

- `MONGODB_URI` — full DO connection string (no placeholders)
- `JWT_SECRET` — `openssl rand -hex 32`
- `PLATFORM_ADMIN_KEY` — `openssl rand -hex 24`
- `PUBLIC_APP_URL` / `PUBLIC_API_URL` — your domain

## 5. Run installer

```bash
export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
bash /home/peaklogic/deploy/cloud/debian/install-saas.sh
```

Installer:

- Installs Node 20, nginx
- Creates `peaklogic` system user
- Runs `npm ci --omit=dev`
- Enables `peaklogic-saas.service` (port 3100)
- Configures nginx proxy

## 6. Seed demo tenant

```bash
sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed'
```

## 7. TLS (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d peaklogic.io -d www.peaklogic.io
```

Renewal is automatic via certbot timer.

## 8. Verify

```bash
curl -s http://127.0.0.1:3100/health | jq .
systemctl status peaklogic-saas nginx
curl -sI https://peaklogic.io/login
```

Expected health:

```json
{
  "deployment": "cloud",
  "role": "saas",
  "multiTenant": true
}
```

Sign in: **https://peaklogic.io/login** — org `demo`, `operator@demo.local` / `demo`

## 9. Connect site appliances

On each edge PeakLogic (appliance mode):

1. **Project → System setup → Cloud remote**
2. Enable uplink
3. Set `tenantId` (matches cloud org slug)
4. Set `gatewayId` from cloud **Sites** pairing
5. Broker: `mqtts://peaklogic.io:8883` (when MQTT TLS enabled)

See [CLOUD_USER_GUIDE.md](CLOUD_USER_GUIDE.md) for Sites pairing.

## 10. Optional MQTT / runtime (3090)

For Parc hub and appliance API on the same host:

```bash
sudo bash /home/peaklogic/deploy/cloud/debian/enable-runtime-3090.sh
```

Open 1883/8883 only to known site IPs (UFW + DO firewall).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 502 Bad Gateway | `journalctl -u peaklogic-saas -n 50` — check `MONGODB_URI`, Mongo allowlist |
| Service restart loop | Placeholder secrets in `saas.env` — install script blocks `CHANGE_ME` Mongo hosts |
| Login fails | Run `npm run seed`; check `data/cloud_tenants.json` permissions |
| External 443 blocked | DO Cloud Firewall — add HTTP/HTTPS rules |
| nginx wrong port | Run `deploy/cloud/debian/fix-saas-web.sh` or `repair-saas-502.sh` |

## Updates

```bash
cd /home/peaklogic
sudo bash deploy/update-from-github.sh
# or re-upload bundle + install-saas.sh
```

## Related

- [CLOUD_SAAS.md](CLOUD_SAAS.md)
- [deploy/cloud/debian/INSTALL-SAAS.txt](../deploy/cloud/debian/INSTALL-SAAS.txt)
- [EST_PC_PARITY.md](EST_PC_PARITY.md)
