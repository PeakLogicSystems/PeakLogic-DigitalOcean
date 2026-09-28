# PeakLogic — Site Admin, Login & Quick Start

Operator and administrator guide for **edge appliances** (port 3090) and **Cloud SaaS** (port 3100): sign-in, first-time setup, site pairing, remote cameras, and user administration.

---

## Quick start — PC appliance

Local all-in-one PeakLogic for Windows or Linux field use.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` (optional flags)
3. Start the server: `npm start` or `npm run start:pc`
4. Open **http://127.0.0.1:3090/login**
5. Sign in with default admin credentials (see Login section below)
6. Configure **Drivers** (Modbus, MQTT, HTTPS, or simulation), then **Tags** or apply a **device template**
7. Edit the **ST program**, click **Validate**, then **Start**

**Windows installer:** copy `dist/peaklogic-appliance-mvp-suite-*` to the target PC, run **Install PeakLogic.bat**, then **Start PeakLogic.bat**.

**IoT-Link (Linux gateway):** upload the tarball, run `deploy/iot-link/install-generic.sh`, open `http://<gateway-ip>:3090/login`.

Bundled demo project: **duplex-lift-station** (`.est.zip` in `data/projects/`).

Press **F1** for in-app Help, **F2** for Training.

---

## Quick start — Cloud SaaS (local dev)

Multi-tenant Cloud Studio with login, Sites, and fleet management.

```bash
npm install
npm run start:saas    # http://127.0.0.1:3100
npm run seed          # demo org + users (first time only)
```

Open **http://127.0.0.1:3100/login** and sign in with demo credentials (see Login section).

**Production:** deploy to a Linux VM (DigitalOcean recommended). See `docs/CLOUD_DEPLOY_DO.md` and `docs/CLOUD_SAAS.md`.

| Mode | Port | Entry | Use |
|------|------|-------|-----|
| Appliance | 3090 | `npm start` | Site PC / IoT-Link edge |
| Cloud hub | 3090 | `PEAKLOGIC_DEPLOYMENT=cloud npm start` | MQTT Parc ingest, cloud sims |
| Cloud SaaS | **3100** | `npm run start:saas` | Login, tenants, Sites, full Studio |

---

## Quick start — pair a site to cloud

Connect an edge appliance to Cloud Studio for fleet visibility and remote cameras.

### On Cloud Studio (`/sites`)

1. Sign in at `/login`
2. Open **Sites** from the nav bar
3. Click **Create site** — enter Site ID, store/name, street address, and optional county
4. Copy the **pairing code** and note the **site ID** and **agent token** shown after creation
5. Optionally open **Devices → Assign to site** to link field Optas

### On the edge appliance

**Telemetry uplink (Parc / MQTT):**

1. **Project → System setup → Cloud remote**
2. Enable uplink
3. Set `tenantId` = your organization slug (e.g. `demo`)
4. Set `gatewayId` = site ID from cloud
5. Broker URL = cloud MQTT (e.g. `mqtts://your.domain:8883`)
6. MQTT username/password = from droplet Mosquitto env
7. Click **Apply all settings**

**Remote cameras (site agent):**

1. **Tools → Cameras → Settings → Cloud Studio**
2. Enter Cloud URL, Site ID, and Pairing code
3. Click **Save cloud pairing**
4. Agent connects; inventory syncs to cloud automatically

### Verify

- Cloud **Sites** table shows **Edge agent: Online**
- **Sites → Cameras** lists cameras discovered on the appliance
- **Fleet** map plots sites with county/address set

---

## Login

### Appliance (port 3090)

| Field | Default value |
|-------|---------------|
| Email | `admin@local` |
| Password | `ChangeMeAdmin!` |

Operator account (when seeded): `operator@local` (password set in System setup).

- Login page: **http://127.0.0.1:3090/login**
- **Sign out:** Help → Sign out, or top-right Sign out
- Protected routes redirect to `/login` when session expires
- Manage login accounts: **Project → System setup → Features** tab (admin only)
- **Alarm notifications** are separate from login — configure under **Alarms → Notification users…** (see [ALARM_NOTIFICATIONS.md](ALARM_NOTIFICATIONS.md))

Change default passwords before production deployment.

### Appliance — alarm notification users

Path: **Alarms → Notification users…** (separate from login accounts in **System setup → Features**)

1. Select a user or **Add user**
2. Set email/SMS, min alarm level, quiet hours
3. **Alarm assignment** — uncheck **All sites, devices & assets** to limit by **Sites** (CMMS/cloud site ID), **Devices** (drivers), and/or **Assets** (PdM)
4. **Save user**

See [ALARM_NOTIFICATIONS.md](ALARM_NOTIFICATIONS.md) for scope rules and API details.

### Cloud SaaS (port 3100)

Sign in at **https://your-domain/login** (or `http://127.0.0.1:3100/login` locally).

| Field | Description |
|-------|-------------|
| Organization ID | Tenant slug, e.g. `demo` |
| Email | User email |
| Password | User password |

**Demo accounts** (after `npm run seed`):

| Role | Organization ID | Email | Password |
|------|-----------------|-------|----------|
| Operator | `demo` | `operator@demo.local` | `demo` |
| Platform admin | `demo` | `admin@demo.local` | `ChangeMeAdmin!` |

Override seed values with env vars: `PEAKLOGIC_SEED_TENANT`, `PEAKLOGIC_SEED_ADMIN_EMAIL`, `PEAKLOGIC_SEED_ADMIN_PASSWORD`, `PEAKLOGIC_SEED_OPERATOR_EMAIL`, `PEAKLOGIC_SEED_OPERATOR_PASSWORD`.

**Sign out:**

| Where | How |
|-------|-----|
| Studio (`/`) | Cloud nav bar **Sign out**, top-right **Sign out**, or **Help → Sign out** |
| Sites, Fleet, CMMS, … | Top-right **Sign out** on the Cloud nav bar |

New users invited via **People** receive an email invite and set their own password. Sign-in may require an email verification code (platform admin exempt).

---

## Cloud navigation

| Area | Path | Purpose |
|------|------|---------|
| Studio | `/` | ST program, HMI, tags, drivers, historian |
| Sites | `/sites` | Create sites, pair edge appliances, remote cameras |
| All devices | `/sites/devices` | Fleet device inventory and site assignment |
| Assets map | `/fleet` | Geographic / schematic asset view |
| People | `/people` | Tenant user list and invites (admin) |
| CMMS | `/cmms` | CMMS entitlement status |
| Admin | `/admin/tenants` | Platform tenant admin |
| Cloud Sims | Tools → Connectivity | Virtual device lab |
| Cellular Sims | `/cellular/sims` | SIM vendor inventory |

Press **F1** for in-app Help, **F2** for Training.

---

## Site admin — Sites page

Path: **/sites** (Cloud nav → **Sites**)

### Create a site

1. Enter **Site ID** (unique identifier, e.g. `7767_Land_O_Lakes_Blvd`)
2. Enter **Store / name** (display label)
3. Enter **Street address** (required for fleet map geocoding)
4. Select **County** (optional — sites with county appear on **Assets map**)
5. Click **Create site**
6. Copy the **pairing code** immediately — it is shown once in the banner

### Manage sites

The sites table shows: Site ID, name, address, county, controller status, edge agent status, and camera count.

| Action | Purpose |
|--------|---------|
| **Edit** | Update name, address, county |
| **Assign** | Open **Devices** to link field Optas to this site |
| **Cameras** | View remote camera inventory for this site |
| **Delete** | Remove site (confirm prompt) |
| **Refresh** | Reload site list |

### Repair / re-pair

If the agent token is lost or the site goes offline:

1. Open **Sites** and use **Repair** on the site row (issues new pairing credentials)
2. On the appliance, paste the new pairing code under **Cameras → Settings → Cloud Studio**
3. Or reconfigure **System setup → Cloud remote** with updated gateway ID and broker credentials

---

## Site admin — Devices

Path: **/sites/devices** (Cloud nav → **Devices**)

Assign field Optas and other Parc devices to sites after they check in.

1. Devices that have synced drivers and sent telemetry but are not yet linked show a banner: **"N Opta(s) checked in — Assign to site"**
2. Select a device and assign it to a site
3. Controller column on **Sites** updates to show online/commissioned status

Devices uplink telemetry via MQTT Parc when the appliance or Opta connects to the cloud broker.

---

## Site admin — Remote cameras

Cameras are discovered and probed on the **edge appliance**, not in cloud. Cloud shows inventory synced by the site agent.

### Operator flow (cloud)

1. Ensure cameras are configured on the appliance (**Tools → Cameras**)
2. Pair the site agent (see Quick start — pair a site)
3. Cloud: **Sites → Cameras** for the site
4. Click **Open live** to view stream proxied through the agent (credentials stay on appliance)

### Appliance camera quick start (Reolink / ONVIF)

1. Enable **ONVIF** (port 8000) and **RTSP** (port 554) on each camera
2. **Tools → Cameras → Settings**: set default username/password
3. **Discover ONVIF → Probe all**
4. Optional: `npm run go2rtc:download` for H.264 WebRTC streaming

Cloud catalog fields (no passwords): `siteId`, `cameraId`, `name`, `host`, `model`, `probeStatus`, `hasStream`, `viewerPath`, `lastSeenAt`.

---

## Site admin — Cloud remote uplink

On the edge appliance: **Project → System setup → Cloud remote**

| Setting | Value |
|---------|-------|
| Enable uplink | On |
| tenantId | Organization slug from cloud login |
| gatewayId | Site ID from **Sites → Create site** |
| Broker URL | Cloud MQTT (`mqtts://your.domain:8883`) |
| MQTT username / password | From droplet Mosquitto env |

Click **Apply all settings**. Cloud **Sites → Repair** or wait for agent heartbeat to confirm online status.

**Note:** Modbus RTU and other LAN field buses require an **edge appliance** — cloud cannot reach plant serial ports directly.

---

## Tenant admin — People

Path: **/people** (requires `tenant_admin` or `platform_admin` role)

### Invite a user

1. Open **People**
2. Enter email, name, and role (`operator` or `tenant_admin`)
3. Click **Send invite**
4. User receives email, sets password, and may verify email on first sign-in

### Manage users

- Edit profile: name, mobile, timezone, password, role
- Configure **alarm contact** settings (email/SMS alerts, contact days/hours, quiet hours)
- **Alarm assignment** — **All sites, devices & assets** checkbox; uncheck to enable multi-select **Sites**, **Devices**, and **Assets** (see [ALARM_NOTIFICATIONS.md](ALARM_NOTIFICATIONS.md))
- Platform admin can switch organization via the org selector dropdown

Login accounts and alarm notification contacts are managed separately. Alarm recipients do not need Studio login access. Scoped contacts only receive alarms matching their selected sites, devices, or assets.

---

## Platform admin

Path: **/admin/tenants** (requires `platform_admin` role)

Sign in as `admin@demo.local` / `ChangeMeAdmin!` (after seed) or use `PLATFORM_ADMIN_KEY` for API calls.

| Task | How |
|------|-----|
| Create organization | Admin → Create organization (org code, name, type) |
| Enable CMMS | PATCH tenant CMMS flag or Admin UI |
| Link customer to partner | Admin → Link customer to partner |
| Invite users to any org | Admin → **Invite users** on org row, or **People** with org selector |
| List all users | `/admin/users` or **People** per org |
| Delete organization | Admin → Edit organization → Delete |

### Seed environment variables (production)

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Session signing |
| `PLATFORM_ADMIN_KEY` | Platform admin API key |
| `MONGODB_URI` | DO Managed Mongo connection string |
| `PUBLIC_APP_URL` | e.g. `https://peaklogic.io` |

---

## Roles

| Role | Capabilities |
|------|--------------|
| `operator` | Studio, sites read, alarms, acknowledge |
| `tenant_admin` | + tenant user management (People), access matrix |
| `platform_admin` | All tenants, admin console, org selector |
| `partner_admin` | Partner org staff management |
| `partner_technician` | Partner-scoped site access |

On the appliance, feature access is controlled per user in **System setup → Features** (admin only).

---

## First-time commissioning (appliance)

1. **Drivers** — connect hardware or pick a device template
2. **Tags** — verify I/O mapping, scaling, and alarms
3. **Program** — edit ST, validate, start runtime
4. **Tags → Force** — override inputs/outputs while debugging
5. **HMI** — compose screens and bindings; apply settings for live display

**Arduino Opta (MQTT Parc) quick start:**

1. Flash **PeaklogicOptaMqttSt** v2.3.41+ via Arduino IDE; set broker on `/setup`
2. Start Mosquitto on the PC (`npm run mqtt:start`) — broker must listen on **LAN IP**, not only localhost
3. **System setup → General** — enable **MQTT Parc hub**, set **broker URL**, enable **Remote ST execution** → **Apply all settings**
4. **Drivers** — template **Arduino Opta — MQTT Parc ST runtime** or **Add Opta Parc devices (bulk)**; `deviceId` must match firmware
5. Restart or wait for telemetry → **Sync tags from device** on the driver card
6. **Program → Remote** on → **Download & Start** to deploy and run ST on the Opta

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Cannot sign in (cloud) | Org slug matches tenant; user belongs to org; run `npm run seed` on fresh install |
| Cannot sign in (appliance) | Default credentials changed? Check **System setup → Features** user list |
| Site offline | Agent token, broker URL, firewall 8883/1883, appliance cloud remote enabled |
| No camera view in cloud | Agent connected; camera probed on appliance; run **Sites → Repair** |
| Optas checked in but not on site | **Devices → Assign to site** |
| Modbus missing in cloud | Expected — use edge appliance for LAN field buses |
| BACnet missing in cloud | Expected — BACnet/IP runs on edge appliance |
| Session expired | Sign out and sign in again; protected routes redirect to `/login` |
| Login 502 (production) | Check `MONGODB_URI`, Mongo allowlist, `journalctl -u peaklogic-saas` |
| Scoped alarm contact gets no email | Scoped mode with empty lists; alarm tag not linked to selected site/device/asset |

---

## Related documentation

| Document | Topic |
|----------|-------|
| `docs/ALARM_NOTIFICATIONS.md` | Alarm contacts and scoped assignment |
| `docs/CLOUD_USER_GUIDE.md` | Full cloud operator guide |
| `docs/CLOUD_SAAS.md` | SaaS deployment overview |
| `docs/CLOUD_DEPLOY_DO.md` | DigitalOcean droplet install |
| `docs/CAMERAS.md` | Camera integration and site agent protocol |
| `docs/EST_PC_PARITY.md` | Edge vs cloud feature matrix |
| `deploy/appliance/README.md` | Appliance install (PC + IoT-Link) |
| `docs/BASELINE_TEST.md` | MQTT Parc + Opta baseline test |
