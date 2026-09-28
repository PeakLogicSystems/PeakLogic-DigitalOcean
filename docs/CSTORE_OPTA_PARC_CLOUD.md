# C-Store Opta Parc Cloud — customer onboarding

Portable multi-tenant workflow: **one cloud install**, create each customer (tenant) in admin, import the empty starter project, add stores as Optas connect.

Circle K Florida (~500 stores) is the reference vertical — use tenant slug `circle-k-florida` when onboarding that operator.

Related: [OPTA_PARC_CLOUD.md](./OPTA_PARC_CLOUD.md) (field Opta), [CLOUD_USER_GUIDE.md](./CLOUD_USER_GUIDE.md) (login, Sites), [CLOUD_DEPLOY_DO.md](./CLOUD_DEPLOY_DO.md) (droplet install).

---

## Architecture

```text
PeakLogic Cloud SaaS (:3100)          Edge runtime (:3090) + Mosquitto
  /admin/tenants — create customer  ←→  MQTT Parc hub, ST runtime, Parc registry
  Login per org → Cloud Studio          Opta :1883 → peaklogic/v1/{deviceId}/telemetry
  Import cstore-opta-parc-starter       Per-store DUPLEXLS + remote ST
```

Each **customer** is a **tenant** (organization). Each **store** is one **Opta Parc driver** (position ID = stable store slug). No pre-loaded sites in the starter project.

---

## 1. Deploy portable cloud (once)

From `est-pc` on a dev machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-saas-bundle.ps1
```

Upload and install per [CLOUD_DEPLOY_DO.md](./CLOUD_DEPLOY_DO.md):

```bash
bash deploy/cloud/debian/install-saas.sh
sudo -u peaklogic bash -lc 'cd /home/peaklogic && npm run seed'
```

Enable **Opta Parc runtime** on the same droplet (Mosquitto + Studio drivers):

```bash
sudo PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash deploy/cloud/debian/enable-runtime-3090.sh
```

Edit `/etc/peaklogic/runtime.env` — use [deploy/cloud/.env.cstore-opta-parc.example](../deploy/cloud/.env.cstore-opta-parc.example):

- `MOSQUITTO_PASS` — **≤ 47 characters** (Opta NV limit)
- Open firewall **TCP 1883** for field Optas

**Do not** set `PEAKLOGIC_TENANT_ID` on multi-tenant SaaS (:3100). Tenants are created in admin.

---

## 2. Create customer (tenant)

Platform admin → **https://your-domain/admin/tenants**

| Field | Circle K example |
|-------|------------------|
| Organization slug | `circle-k-florida` |
| Name | `Circle K Florida` |
| CMMS | Enable if proactive PM work orders needed |

Create operator login: **People** (tenant admin) or POST `/api/tenant/users`:

| Field | Example |
|-------|---------|
| Email | `ops@circlek-florida.example` |
| Role | `tenant_admin` or `operator` |
| Password | (set securely) |

Customer signs in at `/login` with **Organization ID** = tenant slug.

---

## 3. Import starter project

Generate bundled starter (on dev machine or droplet):

```bash
npm run generate:circlek-fleet
node scripts/ensure-bundled-projects.js
```

Import in Cloud Studio:

1. Sign in as the new tenant
2. **Project → Import project file…**
3. Select `data/projects/cstore-opta-parc-starter.est.zip`
4. **Project → Open** → `cstore-opta-parc-starter`

Starter includes:

- **MQTT Parc hub** enabled (broker `mqtt://127.0.0.1:1883`)
- **Empty drivers** — add stores incrementally
- **Fleet 3D map** home screen (populates as drivers/tags are added)
- **PdM** template ready for duplex lift + CT

Optional sales demo with 12 pre-loaded Circle K sites:

```bash
node scripts/circlek-fleet/generate-artifacts.js --demo
# Import circle-k-florida-demo.est.zip instead
```

Full Circle K Florida planning project (**500 stores**, **400 monitored** lift/septic, phase 2 IoT-Link metadata):

```bash
npm run generate:circlek-fleet -- --fleet
node scripts/ensure-bundled-projects.js
# Import data/projects/circle-k-florida-fleet.est.zip
```

| Artifact | Purpose |
|----------|---------|
| `circle-k-florida-fleet.est.zip` | Cloud project — 400 Opta drivers, **401 HMI screens** (fleet 3D + DUPLEXLS faceplate per monitored store), PdM |
| `st/fixtures/fleet_import_circle_k_500.csv` | Bulk site metadata (500 rows, monitor flags) |
| `st/fixtures/fleet_circle_k_florida_500.json` | Fleet manifest (280 lift + 120 septic + 100 unmonitored) |
| `public/samples/circle-k-florida-fleet-3d.html` | 500-pin Florida fleet map |

Per store (monitored sites): **phase 1** Opta Parc direct (`CK001`–`CK400` tag prefixes), **phase 2** IoT-Link at same site slug for HVAC-R, leaks, cooler/freezer (planned). Unmonitored stores (100) appear on the fleet map only — no drivers until retrofit.

---

## 4. Add a store (site)

Repeat for each convenience store as Optas are installed.

### Field — Arduino Opta

Per [OPTA_PARC_CLOUD.md](./OPTA_PARC_CLOUD.md):

| Opta /setup | Value |
|-------------|-------|
| Broker host | Cloud public IP or `peaklogic.io` |
| Port | **1883** |
| Username / password | Match Mosquitto env |
| Global site key | `1` (match Studio **System setup → MQTT Parc**) |

Note **device ID** from `/setup` or `/api/status` (e.g. `mv_f2e689fd60d96bab`).

### Cloud Studio

1. **System setup → MQTT Parc** — hub enabled, broker `mqtt://127.0.0.1:1883`, credentials match Mosquitto
2. Wait for device in **Parc registry** (online, recent telemetry)
3. **Drivers → Add Opta Parc devices** (from registry):
   - **Position ID** = stable store slug, e.g. `tampa-fowler-ave` (survives hardware swap)
   - **Device ID** = from Opta firmware
   - Apply template **DUPLEXLS — dual duplex lift station** (`lift_station_dual_duplex`)
4. **Sync tags from device** → **Scan expansions** (D1608E + A0602 if fitted)
5. **Program → Remote → Connect → Download & Start** → deploy `logic/36_duplex_lift_station.st`
6. Add DUPLEXLS HMI screen: **Composites → DUPLEXLS** (or duplicate from demo project)
7. Extend fleet rollup ST with store alarm tag → `FLEET_ANY_ALM`

### Fleet map metadata (optional)

Register store location for `/fleet` asset map:

- **Fleet → Add asset** or POST `/api/tenant/fleet` with lat/lng, store number, slug
- Or bulk plan via `st/fixtures/fleet_import_circle_k.csv` (500-row rollout)

---

## 5. Scale to 500 stores

| Phase | Action |
|-------|--------|
| Planning | `st/fixtures/fleet_circle_k_florida.json` — reference manifest |
| Bulk metadata | `st/fixtures/fleet_import_circle_k.csv` — store slugs, lat/lng, planned device IDs |
| Commissioning | One Opta per row; registry bulk-add with `fromRegistry` + position IDs from CSV |
| PdM | **Historian → PdM** — assets auto-seed from `lift_station_dual_duplex` template per pump |

---

## Checklist

| Step | Pass |
|------|------|
| SaaS health `multiTenant: true` | ✓ |
| Runtime 3090 + Mosquitto 1883 | ✓ |
| Tenant created, user can sign in | ✓ |
| Starter project imported | ✓ |
| MQTT Parc hub connected | ✓ |
| First Opta online in registry | ✓ |
| Driver added with position ID | ✓ |
| Tags updating, remote ST running | ✓ |
| Fleet alarm rollup wired | ✓ |

---

## Reference files

| Path | Purpose |
|------|---------|
| `data/projects/cstore-opta-parc-starter.est.zip` | Empty tenant project |
| `st/fixtures/cstore_opta_parc_starter.json` | Starter manifest |
| `st/fixtures/fleet_import_circle_k.csv` | Bulk store import (Circle K FL) |
| `deploy/cloud/.env.cstore-opta-parc.example` | Runtime 3090 env |
| `scripts/circlek-fleet/generate-artifacts.js` | Regenerate artifacts |
