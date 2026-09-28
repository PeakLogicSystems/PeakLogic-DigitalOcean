# PeakLogic Cloud — User Guide

Guide for **tenant operators** and **integrators** using Cloud Studio on a hosted PeakLogic SaaS deployment.

## Sign in

1. Open **https://your-domain/login**
2. Enter **Organization ID** (tenant slug, e.g. `demo`)
3. Enter **email** and **password**
4. After sign-in you land on the full **Studio** dashboard (same UI as the PC appliance)

**Sign out**

| Where you are | How to sign out |
|---------------|-----------------|
| **Studio** (`/`) | Second nav bar **Sign out** (top), or top-right **Sign out**, or **Help → Sign out** |
| **Sites, Fleet, CMMS, …** (`/sites`, `/fleet`, …) | Top-right **Sign out** on the Cloud nav bar |

Default demo (after `npm run seed`):

| Field | Value |
|-------|-------|
| Organization ID | `demo` |
| Email | `operator@demo.local` |
| Password | `demo` |

Platform admin: `admin@demo.local` / `ChangeMeAdmin!`

## Navigation

| Area | Path / menu | Purpose |
|------|-------------|---------|
| Studio | `/` | ST program, HMI, tags, drivers, historian |
| Sites | `/sites` | Pair edge appliances, remote cameras |
| All devices | `/sites/devices` | Fleet device inventory |
| Assets map | `/fleet` | Geographic / schematic asset view |
| People | `/people` | Tenant user list (admin) |
| CMMS | `/cmms` | CMMS entitlement status |
| Cloud Sims | Tools → Connectivity | Virtual device lab |
| Cellular Sims | `/cellular/sims` | SIM vendor inventory |

Press **F1** for in-app Help, **F2** for Training.

## Sites — pair an edge appliance

Site appliances run PeakLogic locally (port 3090) and uplink telemetry to cloud.

1. Cloud: **Sites → Create site** — note **site ID**, **pairing code**, **agent token**
2. Appliance: **System setup → Cloud remote**
   - Enable uplink
   - `tenantId` = your organization slug
   - `gatewayId` = site ID from step 1
   - Broker URL = cloud MQTT (`mqtts://your.domain:8883`)
   - MQTT username/password = from droplet Mosquitto env
3. Cloud: **Sites → Repair** or wait for agent heartbeat
4. **Sites → Cameras** — live view proxied through site agent (credentials stay on appliance)

Cameras are discovered on the **appliance**, not in cloud. Cloud shows inventory synced by the agent.

## Projects in Cloud Studio

Same workflow as appliance:

- **Project → Open / Save / Export** — `.est.zip` portable projects
- **Deploy project** — push ST to Opta via MQTT Parc (when hub configured)
- **Share project** — export for another tenant or appliance

Tenant workspaces are isolated per organization.

## Alarms and notifications

- Configure alarm limits in **Tags**
- **Alarms** top bar — view and acknowledge (logged to MongoDB system log)
- **Alarms → Notification users** — email/SMS profiles (not login accounts)

On appliance deployments, **System setup → Features** manages login access. Cloud SaaS uses organization roles instead.

## MQTT Parc / Opta

Cloud Studio supports **MQTT Parc** when:

- Cloud runtime on **3090** is enabled (`enable-runtime-3090.sh`), or
- Opta devices connect directly to cloud Mosquitto

Direct Opta commissioning: [OPTA_PARC_CLOUD.md](OPTA_PARC_CLOUD.md). C-store fleet onboarding (create tenant → add stores): [CSTORE_OPTA_PARC_CLOUD.md](CSTORE_OPTA_PARC_CLOUD.md).

**Modbus RTU** and other LAN buses require an **edge appliance** — cloud cannot reach plant serial ports.

See [EST_PC_PARITY.md](EST_PC_PARITY.md).

## CMMS entitlement

Tenant admins with CMMS enabled can open **CMMS** from the nav bar. Platform admin enables per tenant at `/admin/tenants`.

Integrated CMMS includes:

- Manual work orders and PM schedules
- **Alarm → WO** (reactive last line when limits trip)
- **PdM → proactive PM WO** (early warning when failure forecast is warning/critical)

See [CMMS_APPLIANCE.md](CMMS_APPLIANCE.md) and [pdm/PDM_PROACTIVE_CMMS.md](pdm/PDM_PROACTIVE_CMMS.md).

## Historian & PdM (predictive maintenance)

Cloud tenants with MongoDB configured (recommended on DigitalOcean) can use the same historian and PdM features as the appliance:

| Feature | Where |
|---------|--------|
| Mongo logger | **Historian → Logger config…** |
| PdM asset setup | **Historian → Logger config… → PdM** |
| Proactive CMMS | Enable **Issue CMMS PM on pending PdM failure** on PdM tab |
| Forecast / trends | **Historian** — Source **PdM (SCADA + Edge)** |
| PdM PDF | **Download PdM PDF** or **Reporting → Reports** |

**Proactive, not reactive:** PdM issues a planned PM work order days or weeks before an alarm — fix before breakdown.

Edge appliances uplink Parc telemetry with `edgeAi` payloads; cloud Mongo stores historian and PdM feature windows when the runtime on 3090 or site agent is connected.

## Platform admin

| Task | Path |
|------|------|
| Create tenant | `/admin/tenants` |
| Enable CMMS | PATCH tenant CMMS |
| List all users | `/admin/users` |

Requires platform admin login or `PLATFORM_ADMIN_KEY` for API calls.

## Roles

| Role | Capabilities |
|------|--------------|
| `operator` | HMI, controls, alarms, cameras, historian, reports, CMMS |
| `technician` | Operator + drivers, tags, program, runtime, setup, projects, connectivity (field commissioning) |
| `viewer` | Read-only HMI, alarms, cameras, reports |
| `homeowner` | Residential/mobile: HMI + alarms only |
| `tenant_admin` | All features + tenant user management (People page) |
| `platform_admin` | All tenants, admin console |

### Feature enable matrix (below `tenant_admin`)

`tenant_admin` and `platform_admin` always receive **all** features. Per-user overrides are saved on **People** (`/people`) by a tenant administrator.

| Feature | operator | technician | viewer | homeowner |
|---------|:--------:|:----------:|:------:|:---------:|
| HMI / dashboard | ✓ | ✓ | ✓ | ✓ |
| HMI controls | ✓ | ✓ | — | — |
| Program (ST) | — | ✓ | — | — |
| Tags | — | ✓ | — | — |
| Drivers | — | ✓ | — | — |
| Runtime start/stop | — | ✓ | — | — |
| Alarms | ✓ | ✓ | ✓ | ✓ |
| Cameras | ✓ | ✓ | ✓ | — |
| Historian & logging | ✓ | ✓ | — | — |
| Reports | ✓ | ✓ | ✓ | — |
| CMMS | ✓ | ✓ | — | — |
| Projects | — | ✓ | — | — |
| System setup | — | ✓ | — | — |
| User accounts | — | — | — | — |
| MV Draw | — | — | — | — |
| Connectivity tools | — | ✓ | — | — |

Non-admin users can open **People** to view role defaults and their own permissions (read-only).

## Support checklist

| Issue | Check |
|-------|-------|
| Cannot sign in | Org slug matches tenant; user belongs to org; run seed on fresh install |
| Site offline | Agent token, broker URL, firewall 8883/1883, appliance cloud remote enabled |
| No camera view | Agent connected; camera probed on appliance; cloud site repair |
| Modbus missing | Expected — use edge appliance for LAN field buses |
| BACnet missing in cloud | Expected — BACnet/IP runs on edge appliance (`docs/BACNET.md`) |

## Related docs

- [CLOUD_SAAS.md](CLOUD_SAAS.md) — deploy overview
- [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md) — DO droplet install
- [CAMERAS.md](CAMERAS.md) — agent protocol detail
- [EST_PC_PARITY.md](EST_PC_PARITY.md) — edge vs cloud feature matrix
