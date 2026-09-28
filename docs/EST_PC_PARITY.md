# est-pc vs Cloud SaaS — feature parity

PeakLogic uses one codebase (`est-pc`) with deployment mode controlled by `PEAKLOGIC_DEPLOYMENT`.

## Deployment matrix

| Capability | Appliance (3090) | Cloud hub (3090) | Cloud SaaS (3100) |
|------------|------------------|------------------|-------------------|
| Full Studio UI | yes | yes | yes |
| Login required | yes (local users) | no* | yes (org + email) |
| Multi-tenant | no (single site) | no | yes |
| MQTT Parc hub | yes | yes (default on) | via optional 3090 runtime |
| Modbus / serial LAN | yes | yes | **edge only** |
| Cloud remote uplink | optional | n/a | n/a (this is the cloud) |
| Sites / agent hub | no | yes | yes |
| Remote cameras | local ONVIF | via sites | via site agent |
| Cloud sims | flag / setup | yes | yes |
| Cellular sims | flag / setup | yes | yes |
| Historian / Mongo | optional | optional | recommended (DO Mongo) |
| PdM (SCADA + Edge) | yes | yes | yes (with Mongo) |
| Proactive CMMS (PdM → WO) | yes | yes | yes (when CMMS entitled) |
| CMMS | integrated `/cmms` app | integrated `/cmms` when entitled | integrated `/cmms` when entitled |

\* Cloud hub 3090 can enable auth separately; SaaS 3100 always requires login.

## Ports

| Port | Service |
|------|---------|
| 3090 | Appliance or cloud runtime (Studio + field I/O) |
| 3100 | Multi-tenant SaaS (login + Studio + sites API) |
| 1883 | MQTT plain (Parc, appliance uplink) |
| 8883 | MQTT TLS |

nginx on production droplet terminates TLS on 443 and proxies to **3100**.

## Field buses

| Bus | Appliance | Cloud SaaS |
|-----|-----------|------------|
| Modbus RTU/TCP | Direct driver (incl. EZ Meter DDS-RGB facility PQ) | Edge appliance only |
| BACnet/IP | Direct driver (UDP) | Edge appliance only |
| MQTT Parc (Opta) | Direct + hub | Cloud broker or edge relay |
| NextCentury cloud API | Driver | Driver (HTTP outbound) |
| ONVIF cameras | Local discover/probe | Site agent proxy |

**Rule:** anything requiring LAN broadcast, serial COM, or subnet sweep runs on the **edge appliance**.

## Auth models

| Mode | Store | Login |
|------|-------|-------|
| Appliance | `appliance_auth.json` | Email + password, feature matrix |
| Cloud SaaS | `cloud_tenants.json` (+ Mongo optional) | Org ID + email + password |

Appliance **notification users** (`users.json`) are separate from login accounts on both modes.

## Data paths

| Data | Appliance | Cloud SaaS |
|------|-----------|------------|
| Project library | `data/projects/` | per-tenant workspace |
| Tags / drivers | `data/*.json` | tenant workspace |
| Tenants | n/a | `data/cloud_tenants.json` |
| Sites | n/a | `data/cloud_sites.json` |
| Historian | Mongo optional | DO Managed Mongo |

## When to use which

| Scenario | Deploy |
|----------|--------|
| Plant floor PC, offline-capable | Appliance image |
| Pool / building IoT-Link | Appliance (generic) |
| Multi-customer hosted Studio | Cloud SaaS 3100 on DO |
| Central MQTT + telemetry only | Cloud hub 3090 |
| Site with LAN I/O + cloud visibility | Appliance + cloud remote uplink |

## Dev commands

```bash
# Appliance (local site)
npm start                          # :3090, login required

# Cloud hub (dev)
npm run start:cloud                # :3090, PEAKLOGIC_DEPLOYMENT=cloud

# Cloud SaaS (dev)
npm run start:saas                 # :3100
npm run seed                       # demo org
```

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CLOUD_SAAS.md](CLOUD_SAAS.md)
- [CLOUD_DEPLOY_DO.md](CLOUD_DEPLOY_DO.md)
