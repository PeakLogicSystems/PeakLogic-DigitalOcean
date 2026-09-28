# PeakLogic Cloud SaaS

Multi-tenant **Cloud Studio** for DigitalOcean (and other Linux hosts). One codebase (`est-pc`) runs as:

| Mode | Port | Entry | Use |
|------|------|-------|-----|
| **Appliance** | 3090 | `npm start` | Site PC / IoT-Link edge |
| **Cloud hub** | 3090 | `PEAKLOGIC_DEPLOYMENT=cloud npm start` | MQTT Parc ingest, cloud sims |
| **Cloud SaaS** | **3100** | `npm run start:saas` | Login, tenants, Sites, full Studio |

Production SaaS uses **nginx → 3100**, **DO Managed MongoDB** (historian + optional config), and **session-based tenant auth**.

## Quick start (local dev)

```bash
cd est-pc
npm install
npm run start:saas    # http://127.0.0.1:3100
npm run seed          # demo org + users (first time)
```

Open **http://127.0.0.1:3100/login**

## Seed accounts (first boot)

| Role | Organization ID | Email | Password |
|------|-----------------|-------|----------|
| Operator | `demo` | `operator@demo.local` | `demo` |
| Tenant admin | `demo` | (created via admin) | — |
| Platform admin | `demo` (optional org) | `admin@demo.local` | `ChangeMeAdmin!` |

Override with env vars in `/etc/peaklogic/saas.env` or `.env`:

- `PEAKLOGIC_SEED_TENANT`
- `PEAKLOGIC_SEED_ADMIN_EMAIL` / `PEAKLOGIC_SEED_ADMIN_PASSWORD`
- `PEAKLOGIC_SEED_OPERATOR_EMAIL` / `PEAKLOGIC_SEED_OPERATOR_PASSWORD`

Run `npm run seed` after editing secrets to ensure demo org exists.

## Production on DigitalOcean

Full runbook: **[CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md)**

Summary:

1. Create DO droplet (Debian 12, ≥2 GB RAM) + Managed MongoDB cluster
2. Build bundle: `powershell -File scripts/create-saas-bundle.ps1`
3. Upload + extract to `/home/peaklogic`
4. Edit `/etc/peaklogic/saas.env` — real `MONGODB_URI`, `JWT_SECRET`, `PLATFORM_ADMIN_KEY`
5. Allowlist droplet IP on MongoDB cluster
6. `bash deploy/cloud/debian/install-saas.sh`
7. `sudo -u peaklogic npm run seed`
8. `certbot --nginx -d your.domain`

## Environment (`/etc/peaklogic/saas.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | yes | `3100` for SaaS |
| `PEAKLOGIC_DEPLOYMENT` | yes | `cloud` |
| `MONGODB_URI` | yes (prod) | DO Managed Mongo connection string |
| `MONGODB_DB` | yes | e.g. `peaklogic_cloud` |
| `JWT_SECRET` | yes | Long random string |
| `PLATFORM_ADMIN_KEY` | yes | Platform admin API key |
| `PUBLIC_APP_URL` | recommended | `https://peaklogic.io` |
| `PEAKLOGIC_DATA` | optional | Default `/var/lib/peaklogic` |

Template: `deploy/cloud/debian/.env.saas.debian.example`

## Key routes

| Path | Purpose |
|------|---------|
| `/login` | Organization + email sign-in |
| `/` | Full Studio dashboard |
| `/sites` | Sites pairing + remote cameras |
| `/sites/devices` | Fleet device inventory |
| `/fleet` | Assets map |
| `/people` | Tenant users |
| `/cmms` | CMMS entitlement |
| `/admin/tenants` | Platform tenant admin |
| `/health` | Deployment + runtime status |

## Data storage

| Data | Location |
|------|----------|
| Tenants, users, sessions | `data/cloud_tenants.json` (or Mongo when configured) |
| Cloud sites / pairing | `data/cloud_sites.json` |
| Tenant workspace | `data/` + Mongo historian |
| Bundled demos | `npm run ensure:bundled-projects` → `data/projects/*.est.zip` (+ `.est.json`) copied to `/var/lib/peaklogic/projects` on install |

## User guide

Tenant operators and integrators: **[CLOUD_USER_GUIDE.md](CLOUD_USER_GUIDE.md)**

Edge vs cloud capabilities: **[EST_PC_PARITY.md](EST_PC_PARITY.md)**

## Optional edge runtime (port 3090)

For MQTT Parc ingest and appliance API relay on the same droplet:

```bash
sudo bash deploy/cloud/debian/enable-runtime-3090.sh
```

Appliances uplink via **System setup → Cloud remote** (`mqtts://your.domain:8883`).

## Updates

On the droplet:

```bash
sudo bash /home/peaklogic/deploy/update-from-github.sh
# or re-upload bundle and re-run install-saas.sh
```

## Related docs

- [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md) — DO droplet step-by-step
- [deploy/cloud/debian/INSTALL-SAAS.txt](../deploy/cloud/debian/INSTALL-SAAS.txt) — install checklist
- [ARCHITECTURE.md](ARCHITECTURE.md) — appliance vs cloud architecture
- [CAMERAS.md](CAMERAS.md) — site agent + remote cameras
