#!/usr/bin/env bash
# PeakLogic multi-tenant SaaS — port 3100 only (login, CMMS, Studio).
# Uses DO Managed MongoDB via MONGODB_URI in /etc/peaklogic/saas.env.
# Optional edge runtime on 3090: deploy/cloud/debian/enable-runtime-3090.sh
#
# Run as root:
#   sudo PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic \
#     bash deploy/cloud/debian/install-saas.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"
DATA_DIR="${PEAKLOGIC_DATA_DIR:-/var/lib/peaklogic}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"
SOURCE_DIR="${PEAKLOGIC_SOURCE:-$REPO_ROOT}"
DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"

log() { printf '[peaklogic-saas] %s\n' "$*"; }
die() { printf '[peaklogic-saas] ERROR: %s\n' "$*" >&2; exit 1; }

strip_crlf() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -q $'\r' "$f" 2>/dev/null; then
    log "Normalizing Windows line endings in $f"
    sed -i 's/\r$//' "$f"
  fi
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "Run as root: sudo bash $0"
fi

if [[ ! -f "$SOURCE_DIR/package.json" ]] || [[ ! -f "$SOURCE_DIR/server.js" ]]; then
  die "PeakLogic source not found at $SOURCE_DIR (need server.js — set PEAKLOGIC_SOURCE)"
fi

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages (Node only — no local MongoDB for SaaS)…"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg rsync nginx

# --- Node.js 20 LTS ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  log "Installing Node.js 20 LTS…"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
else
  log "Node.js $(node -v) already present"
fi

# --- Service user ---
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating system user $SERVICE_USER…"
  if [[ -d "$INSTALL_DIR" ]]; then
    useradd --system --home-dir "$INSTALL_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  else
    useradd --system --home-dir "$INSTALL_DIR" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
fi

install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic
for deploy_file in "$SCRIPT_DIR"/.env.saas.debian.example "$SCRIPT_DIR"/peaklogic-saas.service \
  "$SCRIPT_DIR"/peaklogic-runtime.service "$SCRIPT_DIR"/nginx-peaklogic-saas.conf \
  "$SCRIPT_DIR"/install-saas.sh "$SCRIPT_DIR"/enable-saas-mqtt.sh \
  "$SCRIPT_DIR"/enable-phase1-archive-compact.sh "$SCRIPT_DIR"/peaklogic-archive-compact.service \
  "$SCRIPT_DIR"/peaklogic-archive-compact.timer "$SCRIPT_DIR"/write-nginx-saas-site.sh; do
  strip_crlf "$deploy_file"
done

if [[ ! -f "$SAAS_ENV" ]]; then
  log "Creating $SAAS_ENV — edit MONGODB_URI, JWT_SECRET, PLATFORM_ADMIN_KEY before production"
  install -m 0640 -o root -g "$SERVICE_USER" "$SCRIPT_DIR/.env.saas.debian.example" "$SAAS_ENV"
else
  log "Keeping existing $SAAS_ENV"
fi
strip_crlf "$SAAS_ENV"

# SaaS must listen on 3100 — fix legacy env copied from appliance / hub installs
if grep -qE '^PORT=3090' "$SAAS_ENV" 2>/dev/null; then
  log "Fixing PORT=3090 → 3100 in $SAAS_ENV"
  sed -i 's/^PORT=3090/PORT=3100/' "$SAAS_ENV"
elif ! grep -qE '^PORT=' "$SAAS_ENV" 2>/dev/null; then
  log "Adding PORT=3100 to $SAAS_ENV"
  printf '\nPORT=3100\n' >> "$SAAS_ENV"
fi
if grep -qE '^PEAKLOGIC_PORT=3090' "$SAAS_ENV" 2>/dev/null; then
  sed -i 's/^PEAKLOGIC_PORT=3090/PEAKLOGIC_PORT=3100/' "$SAAS_ENV"
fi

# Block boot-loop from template placeholders
if grep -qE '^MONGODB_URI=.*@(HOST|YOUR_|REPLACE|XXXXX|CHANGE_ME)' "$SAAS_ENV" 2>/dev/null \
  || grep -qE '^MONGODB_URI=mongodb\+srv://USER:' "$SAAS_ENV" 2>/dev/null; then
  die "Edit $SAAS_ENV — set a real MONGODB_URI from DigitalOcean Databases (Connection string). HOST/USER placeholders will not work."
fi

# --- Application tree ---
install -d -m 0755 "$INSTALL_DIR"
if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
  log "Syncing app to $INSTALL_DIR…"
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'data/' \
    --exclude '.env' \
    --exclude 'deploy/cloud/.env' \
    --exclude 'products/' \
    --exclude 'azure/' \
    --exclude 'test/' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"
else
  log "Source and install dir are the same ($INSTALL_DIR) — skipping rsync"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

log "Installing npm production dependencies…"
sudo -u "$SERVICE_USER" bash -lc "cd '$INSTALL_DIR' && npm ci --omit=dev"

install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR"
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR/projects"

# Legacy installs kept tenant users under $INSTALL_DIR/data before PEAKLOGIC_DATA=/var/lib/peaklogic.
LEGACY_DATA="$INSTALL_DIR/data"
RUNTIME_TENANTS="$DATA_DIR/cloud_tenants.json"
if [[ -f "$LEGACY_DATA/cloud_tenants.json" ]] && [[ ! -f "$RUNTIME_TENANTS" || "$(wc -c < "$RUNTIME_TENANTS" | tr -d ' ')" -lt 4096 ]]; then
  legacy_size="$(wc -c < "$LEGACY_DATA/cloud_tenants.json" | tr -d ' ')"
  if [[ "${legacy_size:-0}" -gt 4096 ]]; then
    log "Migrating cloud_tenants.json from legacy $LEGACY_DATA → $DATA_DIR"
    cp -a "$LEGACY_DATA/cloud_tenants.json" "$RUNTIME_TENANTS"
    chown "$SERVICE_USER:$SERVICE_USER" "$RUNTIME_TENANTS"
  fi
fi
if [[ -d "$LEGACY_DATA" ]] && [[ "$LEGACY_DATA" != "$DATA_DIR" ]]; then
  for legacy_file in settings.json workspace.est.zip workspace.est.json parc.json drivers.json tags.json \
    cloud_sites.json hardware_assignments.json cameras.json program-deploy.json; do
    src="$LEGACY_DATA/$legacy_file"
    dest="$DATA_DIR/$legacy_file"
    if [[ ! -f "$src" ]]; then continue; fi
    if [[ ! -f "$dest" ]] || [[ "$(wc -c < "$src" | tr -d ' ')" -gt "$(wc -c < "$dest" | tr -d ' ')" ]]; then
      log "Migrating $legacy_file from legacy data → $DATA_DIR"
      cp -a "$src" "$dest"
      chown "$SERVICE_USER:$SERVICE_USER" "$dest"
    fi
  done
  if [[ -d "$LEGACY_DATA/projects" ]]; then
    log "Merging legacy data/projects → $DATA_DIR/projects"
    rsync -a "$LEGACY_DATA/projects/" "$DATA_DIR/projects/"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR/projects"
  fi
fi

# Ship bundled Studio snapshots into runtime data dir (PEAKLOGIC_DATA=/var/lib/peaklogic).
# Bundle extracts them under $INSTALL_DIR/data/projects; the service does not read that path.
BUNDLED_PROJECTS_SRC=""
if [[ -d "$SOURCE_DIR/data/projects" ]]; then
  BUNDLED_PROJECTS_SRC="$SOURCE_DIR/data/projects"
elif [[ -d "$INSTALL_DIR/data/projects" ]]; then
  BUNDLED_PROJECTS_SRC="$INSTALL_DIR/data/projects"
fi
if [[ -n "$BUNDLED_PROJECTS_SRC" ]]; then
  n_src="$(find "$BUNDLED_PROJECTS_SRC" -maxdepth 1 -type f -name '*.est.json' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${n_src:-0}" -gt 0 ]]; then
    log "Installing $n_src bundled project snapshot(s) (.est.zip + .est.json) → $DATA_DIR/projects/"
    rsync -a --include='*.est.zip' --include='*.est.json' --exclude='*' "$BUNDLED_PROJECTS_SRC/" "$DATA_DIR/projects/"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR/projects"
  else
    log "No *.est.json in $BUNDLED_PROJECTS_SRC — skipping project seed copy"
  fi
else
  log "No bundled data/projects/ in source or install tree — $DATA_DIR/projects stays empty until seeded"
fi

# .env symlink for npm run seed / migrate
ln -sf "$SAAS_ENV" "$INSTALL_DIR/.env"
chown -h "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env" 2>/dev/null || true

# --- systemd: SaaS on 3100 ---
sed "s|@PEAKLOGIC_INSTALL_DIR@|${INSTALL_DIR}|g" "$SCRIPT_DIR/peaklogic-saas.service" \
  > /etc/systemd/system/peaklogic-saas.service
chmod 0644 /etc/systemd/system/peaklogic-saas.service

# Runtime unit installed but not enabled (3090 — optional later)
sed "s|@PEAKLOGIC_INSTALL_DIR@|${INSTALL_DIR}|g" "$SCRIPT_DIR/peaklogic-runtime.service" \
  > /etc/systemd/system/peaklogic-runtime.service
chmod 0644 /etc/systemd/system/peaklogic-runtime.service

systemctl daemon-reload
systemctl enable peaklogic-saas.service

# Retire legacy single-port appliance service if present
if systemctl list-unit-files peaklogic.service >/dev/null 2>&1; then
  log "Disabling legacy peaklogic.service (port 3090 appliance) — use peaklogic-saas on 3100"
  systemctl disable --now peaklogic.service 2>/dev/null || true
fi

if systemctl is-active --quiet peaklogic-saas.service 2>/dev/null; then
  systemctl restart peaklogic-saas.service
else
  systemctl start peaklogic-saas.service
fi

# --- nginx -> 3100 ---
NGINX_SITE="/etc/nginx/sites-available/peaklogic-saas"
PEAKLOGIC_DOMAIN="$DOMAIN" PEAKLOGIC_SAAS_PORT=3100 NGINX_SITE="$NGINX_SITE" \
  bash "$SCRIPT_DIR/write-nginx-saas-site.sh"

# --- UFW (HTTP/HTTPS only; 3090 not exposed until runtime enabled) ---
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

log "Done — multi-tenant SaaS on port 3100"
if systemctl is-active --quiet peaklogic-saas.service 2>/dev/null; then
  log "  peaklogic-saas: active"
else
  log "  peaklogic-saas: NOT running (journalctl -u peaklogic-saas -n 40)"
fi
log "  Health:  curl -s http://127.0.0.1:3100/health"
log "  Login:   https://${DOMAIN}/login  (after TLS: certbot --nginx -d ${DOMAIN})"
log "  Env:     $SAAS_ENV"
log "  Seed:    sudo -u $SERVICE_USER bash -lc 'cd $INSTALL_DIR && npm run seed'  (once, after setting secrets)"
log "  Runtime: enable port 3090 later: sudo bash $SCRIPT_DIR/enable-runtime-3090.sh"
log "  Logs:    journalctl -u peaklogic-saas -f"
