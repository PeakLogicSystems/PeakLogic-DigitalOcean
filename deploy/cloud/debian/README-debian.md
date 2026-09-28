# PeakLogic Cloud on Debian / Ubuntu (native install — **full GUI**)

Headless PeakLogic cloud VM on **Debian 12** or **Ubuntu 22.04/24.04** without Docker: **MongoDB 7**, **Mosquitto MQTT**, and the **full PeakLogic GUI** (ST editor, HMI, runtime, historian, Parc) on port **3090**.

For **multi-tenant SaaS** (`/login`, port **3100**, DO Managed MongoDB), see **[docs/CLOUD_DEPLOY_DO.md](../../../docs/CLOUD_DEPLOY_DO.md)** and **[debian/INSTALL-SAAS.txt](INSTALL-SAAS.txt)**.

Build bundle from est-pc (no separate repo required):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-saas-bundle.ps1
```

Legacy sync via sibling `peaklogic-cloud` repo: `scripts/create-cloud-bundle.ps1`.

**Install path:** `/home/peaklogic`  
**Target platforms:** Debian 11/12 or Ubuntu 22.04/24.04 on **amd64** (DigitalOcean droplet, bare metal) and **arm64** SBC (e.g. Raspberry Pi 64-bit). ≥2 GB RAM recommended.

For Docker Compose on Ubuntu, see [../README.md](../README.md).  
For the **multi-tenant SaaS API** (port 3100, managed MongoDB), see **[docs/CLOUD_DEPLOY_DO.md](../../../docs/CLOUD_DEPLOY_DO.md)**.

## What runs

| Service | Role | Host port |
|---------|------|-----------|
| `mongod` | Config store + historian | **127.0.0.1:27017** only |
| `mosquitto` | Parc + global + appliance uplink MQTT | **1883** |
| `peaklogic` | Full GUI + API + historian + MQTT hub | **3090** |

Site appliances relay telemetry via `cloudRemote` → tenant topics `peaklogic/v1/{tenantId}/{deviceId}/telemetry`.

---

## 1. Prepare files on your dev machine

The droplet receives **`peaklogic-cloud`**, not raw `est-pc`. Sync the est-pc runtime into peaklogic-cloud first, then transfer.

### 1a. Sync est-pc → peaklogic-cloud

From **est-pc** (Windows PowerShell):

```powershell
cd C:\Users\public\data\est-pc
powershell -File scripts\sync-runtime-to-cloud.ps1
```

This copies runtime code, `deploy/cloud/debian/`, `public/`, `firmware/`, `st/`, etc. into the sibling **peaklogic-cloud** repo while preserving cloud-only multitenant files (`src/server.js`, auth, CMMS, views).

Verify locally:

```powershell
cd ..\peaklogic-cloud
npm install
npm run test:baseline
```

### 1b. What gets transferred to the droplet

| Included | Excluded (rebuilt on server) |
|----------|------------------------------|
| `server.js`, `src/` (runtime + synced code) | `node_modules/` |
| `package.json`, `package-lock.json` | `.git/` |
| `public/`, `views/`, `config/`, `st/`, `firmware/` | `data/` (runtime state) |
| `deploy/cloud/debian/` (install.sh, systemd, Mosquitto) | `products/`, `azure/`, `test/` |
| `scripts/` (except cloud-only seed) | `.env` |

---

## 2. Create and prepare the DigitalOcean droplet

1. **Create droplet:** Debian 12 x64, ≥2 GB RAM, your SSH key.
2. **SSH in as root** (or a sudo user):

```bash
ssh root@<droplet-ip>
```

3. **Base packages** (install.sh installs the rest, but rsync needs an target directory):

```bash
apt update && apt install -y curl rsync ufw jq
mkdir -p /home/peaklogic
```

4. **Optional — create a deploy SSH user** (if not using root for file transfer):

```bash
# Only if you prefer non-root SSH; install.sh creates the peaklogic system user for the service
adduser deploy
usermod -aG sudo deploy
```

---

## 3. Transfer files to `/home/peaklogic`

### Option A — helper script (Windows dev machine)

From **est-pc** (runs sync + rsync):

```powershell
cd C:\Users\public\data\est-pc
powershell -File scripts\rsync-to-droplet.ps1 -DropletHost root@<droplet-ip>
```

Requires `rsync` in PATH (WSL, Git for Windows, or cwRsync). Use `-SkipSync` if peaklogic-cloud is already up to date. Use `-DryRun` to preview.

### Option B — manual rsync (Linux/macOS/WSL)

From **peaklogic-cloud**:

```bash
cd /path/to/peaklogic-cloud
rsync -avz --delete \
  --exclude-from=../est-pc/deploy/cloud/debian/rsync-exclude.txt \
  -e ssh \
  ./ root@<droplet-ip>:/home/peaklogic/
```

### Option C — tar/gzip bundle (recommended for SBC + bare metal)

On your **dev machine** (Windows):

```powershell
cd C:\Users\public\data\est-pc
powershell -File scripts\create-cloud-bundle.ps1
```

Output: `est-pc\dist\peaklogic-cloud-YYYYMMDD.tgz` (syncs est-pc → peaklogic-cloud, excludes `node_modules`, secrets, `test/`, etc.).

On **Linux/macOS/WSL**:

```bash
cd /path/to/est-pc
bash deploy/cloud/debian/create-bundle.sh
```

Transfer and install on the target host (droplet, bare metal, or SBC):

```bash
scp est-pc/dist/peaklogic-cloud-*.tgz root@<host>:/tmp/
ssh root@<host>
mkdir -p /home/peaklogic
tar xzf /tmp/peaklogic-cloud-*.tgz -C /home/peaklogic --strip-components=1
export PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic
bash /home/peaklogic/deploy/cloud/debian/install.sh
```

See `INSTALL.txt` inside the archive for a short checklist.

### Option D — manual tar (no helper script)

```bash
cd /path/to/peaklogic-cloud
tar czf /tmp/peaklogic-cloud.tgz \
  --exclude=node_modules --exclude=.git --exclude=data \
  --exclude=products --exclude=azure --exclude=test \
  .
scp /tmp/peaklogic-cloud.tgz root@<host>:/tmp/
ssh root@<host> 'mkdir -p /home/peaklogic && tar xzf /tmp/peaklogic-cloud.tgz -C /home/peaklogic'
```

---

## 4. Install on the server

SSH to the host and run the bootstrap script. Source and install dir are both `/home/peaklogic`:

```bash
ssh root@<host-ip>

export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
bash /home/peaklogic/deploy/cloud/debian/install.sh
```

`install.sh` (idempotent — safe to re-run):

| Step | Action |
|------|--------|
| Packages | Node.js 20 (NodeSource), MongoDB 7 (official Debian/Ubuntu repo), Mosquitto |
| User | System user `peaklogic` (runs the Node service) |
| App | `npm ci --omit=dev` in `/home/peaklogic` |
| Env | Creates `/etc/peaklogic/env` from template; strips Windows CRLF if present |
| Mosquitto | Disables stock `conf.d` conflicts; listener-first config; `passwd` owned by `mosquitto:mosquitto` |
| systemd | `peaklogic.service` registered before Mosquitto start (re-runs always restore the unit) |
| Data | `/var/lib/peaklogic` |
| MQTT | `/etc/mosquitto/conf.d/peaklogic.conf` + `/etc/mosquitto/passwd` |

### Set MQTT password (required before production)

```bash
sudo nano /etc/peaklogic/env
# Set MOSQUITTO_PASS to a strong secret (not "change-me")

export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
sudo -E bash /home/peaklogic/deploy/cloud/debian/install.sh
```

---

## 5. Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp comment 'HTTP (domain + certbot)'
sudo ufw allow 443/tcp comment 'HTTPS peaklogic.io'
sudo ufw allow 3090/tcp comment 'PeakLogic API (optional if using nginx)'
sudo ufw allow 1883/tcp comment 'MQTT Parc + cloud uplink'
# Do NOT expose 27017 — Mongo stays on localhost
sudo ufw enable
sudo ufw status
```

For production, terminate TLS on 443 (nginx/Caddy) and restrict 1883 to known appliance IPs.

### Port 80 (optional — browse without `:3090`)

Reverse-proxy with nginx so `http://<host>/` serves PeakLogic:

```bash
sudo apt install -y nginx
sudo cp /home/peaklogic/deploy/cloud/debian/nginx-peaklogic.conf /etc/nginx/sites-available/peaklogic
sudo ln -sf /etc/nginx/sites-available/peaklogic /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl reload nginx
sudo ufw allow 80/tcp comment 'HTTP PeakLogic'
```

HTTPS later: `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d your.domain`

### Custom domain (e.g. peaklogic.io)

1. **DNS** — A record `peaklogic.io` and `www` → your droplet IP (e.g. `206.189.198.96`).

2. **nginx** — use `nginx-peaklogic-domain.conf` (edit `server_name` if needed):

```bash
sudo cp /home/peaklogic/deploy/cloud/debian/nginx-peaklogic-domain.conf /etc/nginx/sites-available/peaklogic
sudo ln -sf /etc/nginx/sites-available/peaklogic /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

3. **UFW** — allow web ports (logs showing `[UFW BLOCK] ... DPT=443` mean HTTPS is blocked):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

4. **TLS**:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d peaklogic.io -d www.peaklogic.io
```

5. **Verify**:

```bash
curl -sI http://peaklogic.io | head -5
curl -s http://127.0.0.1:3090/health
systemctl status nginx peaklogic
ss -tlnp | grep -E ':80|:443'
```

### Site still down after `ufw allow 80` / `443`

**DigitalOcean Cloud Firewall** (separate from UFW) often blocks 80/443 until you add rules in the control panel:

1. [DigitalOcean](https://cloud.digitalocean.com/) → **Networking** → **Firewalls**
2. Open the firewall attached to your droplet (or create one)
3. **Inbound rules**: TCP **22**, **80**, **443** (sources: All IPv4 / All IPv6, or restrict as needed)
4. Apply to droplet `peaklogic-cloud`

One-shot fix on the server:

```bash
sudo bash /home/peaklogic/deploy/cloud/debian/fix-web-ports.sh
# or with domain:
sudo PEAKLOGIC_DOMAIN=peaklogic.io bash /home/peaklogic/deploy/cloud/debian/fix-web-ports.sh
```

Check listeners and UFW:

```bash
sudo ufw status numbered
sudo ss -tlnp | grep -E ':80|:443|:3090'
curl -sI -H 'Host: peaklogic.io' http://127.0.0.1/
dig +short peaklogic.io A
curl -4 ifconfig.me   # compare to DNS
```

---

## 6. Environment variables

Default file: **`/etc/peaklogic/env`** (from `debian/.env.debian.example`).

| Variable | Example | Purpose |
|----------|---------|---------|
| `PORT` | `3090` | HTTP API |
| `PEAKLOGIC_DEPLOYMENT` | `cloud` | Cloud hub mode |
| `MONGO_URL` / `MONGODB_URI` | `mongodb://127.0.0.1:27017/peaklogic` | Config + historian |
| `PEAKLOGIC_MQTT_BROKER` | `mqtt://127.0.0.1:1883` | Parc hub broker |
| `MOSQUITTO_USER` / `MOSQUITTO_PASS` | `peaklogic` / *(secret)* | Broker auth |
| `MOSQUITTO_ALLOW_ANONYMOUS` | `false` | Set `true` for dev/LAN only |
| `MOSQUITTO_TLS` | `true` | TLS listener on **8883** (see [MQTT.md](../MQTT.md)) |
| `PEAKLOGIC_DOMAIN` | `peaklogic.io` | TLS cert CN + public broker hostname |

Full MQTT credentials, TLS setup, and topic layout: **[deploy/cloud/MQTT.md](../MQTT.md)**.

After editing env:

```bash
sudo systemctl restart peaklogic
# Re-run install.sh if Mosquitto credentials changed
sudo bash /home/peaklogic/deploy/cloud/debian/install.sh
```

---

## 7. systemd service

Installed automatically by `install.sh`:

```bash
sudo systemctl status peaklogic mongod mosquitto
sudo journalctl -u peaklogic -f
sudo systemctl restart peaklogic
```

Unit file: `/etc/systemd/system/peaklogic.service` (from `debian/peaklogic.service`, install dir substituted at install time).

---

## 8. Verification

```bash
# Health (should show ok: true, Mongo connected)
curl -s http://127.0.0.1:3090/health | jq .

# From your PC (after UFW allows 3090)
curl -s http://<droplet-ip>:3090/health | jq .

# MQTT with auth
mosquitto_pub -h localhost -p 1883 -u peaklogic -P '<password>' \
  -t 'peaklogic/v1/g/0001/PumpRun' -m '{"v":true,"t":"BOOL"}' -r

# Tenant uplink test
mosquitto_pub -h localhost -p 1883 -u peaklogic -P '<password>' \
  -t 'peaklogic/v1/demo-tenant/opta_01/telemetry' \
  -m '{"deviceId":"opta_01","tags":[{"id":"I1","type":"BOOL","value":true}]}'
```

Open `http://<droplet-ip>:3090` or `http://peaklogic.io/` (with nginx). Press **F1** for in-app help.

### Upgrade headless install → full GUI

If `/` shows plain text (*Use peaklogic-client for operator UI*), re-deploy from an updated bundle, then:

```bash
sudo bash /home/peaklogic/deploy/cloud/debian/upgrade-to-full-gui.sh
```

Or from dev PC: `sync-runtime-to-cloud.ps1` → `create-cloud-bundle.ps1` → re-upload tarball → `install.sh`.

---

## 9. Cloud remote pairing (site appliances)

On each site PeakLogic appliance:

- **System setup → Cloud remote**: `enabled`, `tenantId`, `gatewayId`, `brokerUrl=mqtt://<droplet-ip>:1883`
- Matching MQTT credentials when auth is enabled.
- Parc hub stays on the local broker; `applianceCloudRelay` forwards telemetry to cloud tenant topics.

**Global P2P tags:** set matching `globalSiteKey` in System setup (PC) and on each Opta `/setup` (firmware **v2.3.48+**).

---

## 10. Keeping the droplet up to date

On your **dev machine**:

```powershell
cd C:\Users\public\data\est-pc
powershell -File scripts\rsync-to-droplet.ps1 -DropletHost root@<droplet-ip>
```

On the **droplet** (re-run install to npm ci + restart services):

```bash
export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
sudo -E bash /home/peaklogic/deploy/cloud/debian/install.sh
curl -s http://127.0.0.1:3090/health | jq .
```

To update only env or Mosquitto credentials without a full code sync, edit `/etc/peaklogic/env` and re-run `install.sh`.

---

## Install script overrides

```bash
export PEAKLOGIC_SOURCE=/home/peaklogic
export PEAKLOGIC_INSTALL_DIR=/home/peaklogic
export PEAKLOGIC_ENV_FILE=/etc/peaklogic/env
export PEAKLOGIC_DATA_DIR=/var/lib/peaklogic
sudo -E bash /home/peaklogic/deploy/cloud/debian/install.sh
```

---

## Mosquitto authentication

By default the Debian bundle **requires MQTT credentials** (same as Docker cloud).

1. Set `MOSQUITTO_USER` and `MOSQUITTO_PASS` in `/etc/peaklogic/env`.
2. Re-run `install.sh` to regenerate `/etc/mosquitto/passwd`.
3. In PeakLogic **System setup**, set matching **MQTT Parc** username/password.
4. On appliances, set `cloudRemote.brokerUrl=mqtt://<droplet-ip>:1883` and matching credentials.

Config template: [`mosquitto-debian.conf`](mosquitto-debian.conf) → `/etc/mosquitto/conf.d/peaklogic.conf`.

### Anonymous dev mode

```bash
MOSQUITTO_ALLOW_ANONYMOUS=true   # in /etc/peaklogic/env
```

Re-run `install.sh`. Lab/LAN only — not for public droplets.

### TLS (optional)

1. Place certs under `/etc/mosquitto/certs/` (`server.crt`, `server.key`, optional `ca.crt`).
2. Uncomment the TLS `listener` block in `/etc/mosquitto/conf.d/peaklogic.conf`.
3. `sudo systemctl restart mosquitto`
4. Point clients at `mqtts://<host>:8883`.

---

## Troubleshooting

### `set: pipefail: invalid option name` (or garbled error on line 4)

**Cause:** `install.sh` has Windows CRLF line endings (`\r`). Common when the bundle was built on Windows before LF normalization.

**Fix on the server (no re-upload needed):**

```bash
sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/install.sh
sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/*.sh
bash /home/peaklogic/deploy/cloud/debian/install.sh
```

Or: `apt install -y dos2unix && dos2unix /home/peaklogic/deploy/cloud/debian/*.sh`

### `/etc/peaklogic/env: line N: $'\r': command not found`

**Cause:** The env template (`.env.debian.example`) had Windows CRLF line endings; `install.sh` sources `/etc/peaklogic/env` with bash.

**Fix on the server:**

```bash
sed -i 's/\r$//' /etc/peaklogic/env
sed -i 's/\r$//' /home/peaklogic/deploy/cloud/debian/.env.debian.example
bash /home/peaklogic/deploy/cloud/debian/install.sh
```

Updated `install.sh` strips CRLF from the env file automatically on re-run.

### `mosquitto.service failed` / `Address already in use` on port 1883

**Cause:** Mosquitto 2.x on Debian. Stock files in `/etc/mosquitto/conf.d/` or `allow_anonymous` / `password_file` placed *before* `listener` in config start a hidden default listener on 1883; a second `listener 1883` then fails.

**Diagnose:**

```bash
journalctl -xeu mosquitto.service --no-pager | tail -30
mosquitto -c /etc/mosquitto/mosquitto.conf -v
ls -la /etc/mosquitto/conf.d/
```

**Fix on the server** (or re-run updated `install.sh`):

```bash
# Disable stock conf.d except peaklogic.conf
for f in /etc/mosquitto/conf.d/*; do
  [ -f "$f" ] || continue
  [ "$(basename "$f")" = "peaklogic.conf" ] && continue
  mv -f "$f" "$f.disabled"
done

# Listener must be first in peaklogic.conf (auth lines after listener)
cat > /etc/mosquitto/conf.d/peaklogic.conf <<'EOF'
listener 1883 0.0.0.0
protocol mqtt
allow_anonymous false
password_file /etc/mosquitto/passwd
log_dest syslog
connection_messages true
EOF

source /etc/peaklogic/env
set +a
MOSQUITTO_USER="${MOSQUITTO_USER//$'\r'/}"
MOSQUITTO_PASS="${MOSQUITTO_PASS//$'\r'/}"
mosquitto_passwd -b -c /etc/mosquitto/passwd "$MOSQUITTO_USER" "$MOSQUITTO_PASS"
chmod 600 /etc/mosquitto/passwd
chown mosquitto:mosquitto /etc/mosquitto/passwd
mosquitto -c /etc/mosquitto/mosquitto.conf -t
systemctl restart mosquitto
systemctl status mosquitto
```

### `Cannot find module './test/preload-config-memory.js'` (Require stack: `internal/preload`)

**Cause:** `test/preload-config-memory.js` is only for local `npm test` / `npm run test:baseline` (in-memory Mongo config). The `test/` tree is **not** deployed to the droplet (`rsync-exclude.txt` and `install.sh` exclude it). The error means Node is loading that file via `NODE_OPTIONS=--require ./test/preload-config-memory.js` (from `/etc/peaklogic/env`) or you ran an npm test script on the server.

**Fix on the droplet (immediate):**

```bash
grep NODE_OPTIONS /etc/peaklogic/env
sudo sed -i '/^NODE_OPTIONS=/d' /etc/peaklogic/env
sudo sed -i '/preload-config-memory/d' /etc/peaklogic/env
sudo systemctl daemon-reload
sudo systemctl restart peaklogic
journalctl -u peaklogic -n 20 --no-pager
```

Do **not** run `npm test` or `npm run test:baseline` on the droplet — run those on your dev machine after `sync-runtime-to-cloud.ps1`.

Re-run `install.sh` after syncing updated deploy files; it strips mistaken `NODE_OPTIONS` lines and reinstalls a systemd unit that clears `NODE_OPTIONS` for the service.

---

## Operations reference

| Path / command | Purpose |
|----------------|---------|
| `/home/peaklogic` | Application tree |
| `/var/lib/peaklogic` | Runtime data |
| `/var/lib/mongodb` | Mongo data |
| `/etc/peaklogic/env` | Environment |
| `journalctl -u peaklogic -f` | App logs |

---

## Production blockers

- TLS termination on 443 for PeakLogic API still manual (nginx/Caddy).
- Single-node Mongo — no replica set / backup automation in this install path.
