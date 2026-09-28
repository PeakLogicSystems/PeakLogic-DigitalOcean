# PeakLogic Cloud (DigitalOcean)

Three deployment paths on DigitalOcean:

| Path | Port | Guide | Use |
|------|------|-------|-----|
| **Phase 1 ATL (recommended)** | **3100** + **8883** + **8090** | [docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md) | SaaS + **dedicated MQTT** + archive |
| **Phase 1 production (legacy)** | **3100** + **8090** | [phase1/WINSCP-DEPLOY.md](phase1/WINSCP-DEPLOY.md) | MQTT colocated on SaaS |
| **Phase 1 ATL legacy** | **3100** + **8090** | [docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md](../../docs/CLOUD_DEPLOY_DO_PHASE1_ATL.md) | Atlanta prod + `test.peaklogic.io` sandbox |
| **Cloud SaaS only** | **3100** | [docs/CLOUD_DEPLOY_DO.md](../../docs/CLOUD_DEPLOY_DO.md) | Single droplet, no archive server |
| **Cloud VM / hub** | 3090 | This README (Docker / debian install) | MQTT Parc ingest, headless hub, local Mongo |

Build Phase 1 bundles from Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-phase1-bundles.ps1
# Upload dist/peaklogic-cloud-*d.tgz → cloud-1-saas
# Upload dist/peaklogic-archive-*.tgz → cloud-2-archive
```

SaaS-only bundle:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-saas-bundle.ps1
```

See also: [docs/CLOUD_SAAS.md](../../docs/CLOUD_SAAS.md), [debian/INSTALL-SAAS.txt](debian/INSTALL-SAAS.txt).

---

# PeakLogic Cloud VM (DigitalOcean) — port 3090 hub

Headless PeakLogic stack for initial cloud testing: **MongoDB**, **Mosquitto MQTT**, and the **PeakLogic Node app** (API + historian + MQTT Parc hub + tenant telemetry ingest).

Target: **Ubuntu 22.04** droplet with Docker Compose.

**Native Debian (no Docker):** see **[debian/README-debian.md](debian/README-debian.md)** — manual install on Debian 12 with systemd, MongoDB 7, Mosquitto, and Node 20. Default install path: **`/home/peaklogic`**. Transfer **`peaklogic-cloud`** (synced from est-pc) via `scripts/rsync-to-droplet.ps1`.

## What runs

| Service | Role | Host port |
|---------|------|-----------|
| `mongodb` | Config store (`peaklogic_config`) + historian | internal only |
| `mosquitto` | Parc + global + appliance uplink MQTT | **1883** (plain), **8883** (TLS when `MOSQUITTO_TLS=true`) |
| `peaklogic` | `server.js` with `PEAKLOGIC_DEPLOYMENT=cloud` | **3090** |

The app is the same codebase as the PC appliance (`est-pc`), not a separate cloud app. Site appliances relay Parc telemetry via `cloudRemote` → `applianceCloudRelay.js` to tenant topics `peaklogic/v1/{tenantId}/{deviceId}/telemetry`.

**MQTT credentials, TLS, and topic layout:** see **[MQTT.md](MQTT.md)**.

## Prerequisites

- DigitalOcean droplet, Ubuntu 22.04, ≥2 GB RAM recommended
- Docker Engine + Docker Compose plugin
- Git clone of this repo on the droplet

## Quick install

```bash
# On the droplet
sudo apt update && sudo apt install -y git docker.io docker-compose-v2
sudo usermod -aG docker $USER
# log out/in once so docker group applies

git clone <your-repo-url> peaklogic
cd peaklogic/deploy/cloud
cp .env.example .env
docker compose up -d --build
curl -s http://127.0.0.1:3090/health | jq .
```

Health should report `ok: true`, Mongo connected, and MQTT hub status when enabled in settings.

## Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3090/tcp comment 'PeakLogic API'
sudo ufw allow 1883/tcp comment 'MQTT Parc + cloud uplink'
sudo ufw allow 8883/tcp comment 'MQTT TLS'
# Do NOT expose 27017 — Mongo stays on the Docker network
sudo ufw enable
```

For production, terminate TLS on 443 (nginx/Caddy) and restrict 1883 to known appliance IPs.

## Configuration

1. Copy `deploy/cloud/.env.example` → `.env` and adjust.
2. First boot seeds Mongo config from empty `data/` if needed (`configStore` migration).
3. Open `http://<droplet-ip>:3090/health` — use PeakLogic PC client or REST `/api/*` for setup.
4. **MQTT Parc hub**: enabled by default when drivers exist; broker URL should be `mqtt://<droplet-ip>:1883` for field devices.
5. **Global P2P tags**: set matching `globalSiteKey` in System setup (PC) and on each Opta `/setup` (firmware **v2.3.48+**).

### Appliance → cloud uplink

On each site PeakLogic appliance (`PEAKLOGIC_DEPLOYMENT=appliance`):

- System setup → **Cloud remote**: `enabled`, `tenantId`, `gatewayId`, `brokerUrl=mqtts://peaklogic.io:8883` (or plain `mqtt://<droplet-ip>:1883`)
- Set **Cloud MQTT username/password** in System setup to match `MOSQUITTO_USER` / `MOSQUITTO_PASS` on the droplet.
- Parc hub stays on local broker; `applianceCloudRelay` forwards telemetry to cloud tenant topics.

### Mosquitto authentication (production)

By default the cloud bundle **requires MQTT credentials**. Set in `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MOSQUITTO_ALLOW_ANONYMOUS` | `false` | Set `true` for dev/LAN anonymous broker |
| `MOSQUITTO_USER` | — | Broker username (required when anonymous off) |
| `MOSQUITTO_PASS` | — | Broker password |
| `MOSQUITTO_TLS` | `true` | Enable TLS listener on port 8883 (self-signed cert auto-generated in Docker if `./certs/` empty) |
| `MOSQUITTO_TLS_PORT` | `8883` | Host port for TLS listener |

Mount TLS certs under `deploy/cloud/certs/` (`server.crt`, `server.key`, optional `ca.crt`) when `MOSQUITTO_TLS=true`.

Configure matching credentials on PeakLogic (System setup → MQTT Parc username/password) and on appliances (`cloudRemote.username` / `cloudRemote.password` in settings).

Self-signed test certs on a DO droplet:

```bash
cd deploy/cloud/certs
openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=mqtt"
# set MOSQUITTO_TLS=true in .env and docker compose up -d
```

## Manual MQTT tests

```bash
# Global tag (P2P) — hub mirrors into tag store when site key matches
mosquitto_pub -h localhost -t 'peaklogic/v1/g/0001/PumpRun' -m '{"v":true,"t":"BOOL"}' -r

# Tenant uplink shape (cloud hub ingests when PEAKLOGIC_DEPLOYMENT=cloud)
mosquitto_pub -h localhost -t 'peaklogic/v1/demo-tenant/opta_01/telemetry' \
  -m '{"deviceId":"opta_01","tags":[{"id":"I1","type":"BOOL","value":true}]}'
```

## Cloud sim management (virtual devices)

PeakLogic Cloud includes a **sim management** system for demo and integration testing without physical Opta hardware.

| Item | Detail |
|------|--------|
| **UI** | `http://<droplet-ip>:3090/cloud/sims` (Tools → **Cloud Sims** when `PEAKLOGIC_DEPLOYMENT=cloud`) |
| **API** | `GET/POST /api/cloud/sims`, `POST …/:id/start`, `POST …/:id/stop`, `DELETE …/:id` |
| **Persistence** | Mongo collection `cloud_sims` (or `data/cloud_sims.json` fallback) |
| **Telemetry** | Publishes tenant topics `peaklogic/v1/{tenantId}/{deviceId}/telemetry` |

### Quick start on cloud VM

```bash
# After docker compose up — create and start a virtual Opta
curl -s -X POST http://127.0.0.1:3090/api/cloud/sims \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo Opta","tenantId":"demo-tenant","type":"opta"}' | jq .

# Copy sim id from response, then:
curl -s -X POST http://127.0.0.1:3090/api/cloud/sims/<sim-id>/start | jq .

# Website demo — JXCT soil ×4 + pool chemistry (both start automatically)
curl -s -X POST http://127.0.0.1:3090/api/cloud/sims/seed-website-demo \
  -H 'Content-Type: application/json' -d '{"start":true}' | jq .
# Or: node scripts/seed-website-demo-sims.js

# Verify Parc registry ingests tenant telemetry
curl -s http://127.0.0.1:3090/api/parc/devices | jq '.devices[] | select(.deviceId|startswith("sim_opta"))'
```

Sim runners use the MQTT Parc hub broker URL from System setup (`settings.mqttParc.brokerUrl`, typically `mqtt://127.0.0.1:1883` inside the VM). Match Mosquitto credentials if auth is enabled.

**Local dev:** set `PEAKLOGIC_CLOUD_SIMS=1` with `npm start` to exercise sim APIs without full cloud deployment.

**Phase 2 (planned):** multi-tenant sim orchestration, per-tenant quotas, Kubernetes sim worker pods, Modbus TCP slave processes, and auto-provisioned `mqtt_parc` drivers per sim.

## Cellular SIM management (IoT vendors)

Manage physical cellular modem SIMs and eSIMs via vendor REST APIs — for Opta/appliances at remote sites with cellular backhaul.

| Item | Detail |
|------|--------|
| **UI** | `http://<host>:3090/cellular/sims` (Tools → **Cellular SIMs**) |
| **API** | `GET /api/cellular/sims`, `POST /api/cellular/sync`, `GET/POST /api/cellular/vendors` |
| **Persistence** | Mongo collection `cellular_sims` (or `data/cellular_sims.json` fallback) |
| **Credentials** | `settings.json` → `cellularSims.vendors[]` |

### Quick start

```bash
# Enable locally (appliance or cloud VM)
export PEAKLOGIC_CELLULAR_SIMS=1

# Add Hologram vendor config
curl -s -X POST http://127.0.0.1:3090/api/cellular/vendors \
  -H 'Content-Type: application/json' \
  -d '{"vendorId":"hologram","label":"Prod","credentials":{"apiKey":"YOUR_KEY","orgId":"12345"}}' | jq .

# Test connection and sync inventory
curl -s -X POST http://127.0.0.1:3090/api/cellular/vendors/<vendor-config-id>/test | jq .
curl -s -X POST http://127.0.0.1:3090/api/cellular/sync | jq .

# Link SIM to Parc device
curl -s -X PUT http://127.0.0.1:3090/api/cellular/sims/<sim-id>/link \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"opta_012355b52d66a109ee","gatewayId":"gw_remote_01"}' | jq .
```

**Implemented adapters:** Hologram, Twilio Super SIM. **Stub registry:** EMnify, Aeris, 1NCE, Onomondo, Telnyx IoT.

See `docs/CELLULAR_SIMS.md` for vendor signup links and adapter development.

## Opta firmware

Reflash **v2.3.48+** (`firmware/arduino-opta-mqtt-st`) for:

- NV **global site key** on `/setup`
- Global tag bytecode (`META_GLOBAL` / `GLOBAL_BOOL|INT|REAL`, `GB|GI|GR`)
- MQTT publish/subscribe on `peaklogic/v1/g/{siteKey4}/{tag}` at telemetry rate (retained QoS1)

## Local dev (unchanged)

PC development still uses `npm start` and `npm run mqtt:start` with local Mongo/Mosquitto. Cloud compose is isolated under `deploy/cloud/`.

## Debian native install

On **Debian 12 (Bookworm)** without Docker — install path **`/home/peaklogic`**:

```powershell
# Dev machine (Windows): sync est-pc → peaklogic-cloud, then rsync to droplet
cd est-pc
powershell -File scripts\sync-runtime-to-cloud.ps1
powershell -File scripts\rsync-to-droplet.ps1 -DropletHost root@<droplet-ip>
```

```bash
# Droplet: bootstrap MongoDB, Mosquitto, Node, systemd
export PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic
sudo -E bash /home/peaklogic/deploy/cloud/debian/install.sh
sudo nano /etc/peaklogic/env   # set MOSQUITTO_PASS, then re-run install.sh
```

Full manual steps (UFW, Mosquitto auth, verification, updates): **[debian/README-debian.md](debian/README-debian.md)**.

## Logs & ops

```bash
docker compose logs -f peaklogic
docker compose ps
docker compose restart peaklogic
```

Data volumes: `mongo-data`, `peaklogic-data`, `mosquitto-data`.

## Production blockers

- TLS termination on 443 (nginx/Caddy) for PeakLogic API still manual.
- Single-node Mongo — no replica set / backup automation in this compose file.
