#!/usr/bin/env bash
# PeakLogic cloud — native Debian 11/12 / Ubuntu 22.04+ bootstrap (idempotent-ish).
# Run as root: sudo PEAKLOGIC_SOURCE=/home/peaklogic PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash deploy/cloud/debian/install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
ENV_FILE="${PEAKLOGIC_ENV_FILE:-/etc/peaklogic/env}"
DATA_DIR="${PEAKLOGIC_DATA_DIR:-/var/lib/peaklogic}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"
SOURCE_DIR="${PEAKLOGIC_SOURCE:-$REPO_ROOT}"

log() { printf '[peaklogic-install] %s\n' "$*"; }
die() { printf '[peaklogic-install] ERROR: %s\n' "$*" >&2; exit 1; }

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
  die "PeakLogic source not found at $SOURCE_DIR (set PEAKLOGIC_SOURCE if needed)"
fi

DEBIAN_VERSION=""
OS_ID=""
ARCH="$(uname -m)"
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  DEBIAN_VERSION="${VERSION_ID:-}"
  OS_ID="${ID:-}"
fi
case "${OS_ID}${DEBIAN_VERSION}" in
  debian11|debian12) log "OS: Debian $DEBIAN_VERSION" ;;
  ubuntu22.04|ubuntu24.04) log "OS: Ubuntu $DEBIAN_VERSION" ;;
  *)
    log "Warning: tested on Debian 11/12 and Ubuntu 22.04/24.04; detected ${PRETTY_NAME:-unknown OS}"
    ;;
esac

case "$ARCH" in
  x86_64|amd64|aarch64|arm64)
    log "Architecture: $ARCH (supported)"
    ;;
  armv7l|armv6l)
    die "32-bit ARM ($ARCH) is not supported — use Debian arm64 (64-bit OS) on your SBC"
    ;;
  *)
    log "Warning: untested architecture $ARCH — Node/Mongo packages may be unavailable"
    ;;
esac

if command -v free >/dev/null 2>&1; then
  MEM_MB="$(free -m | awk '/^Mem:/{print $2}')"
  if [[ "${MEM_MB:-0}" -lt 1800 ]]; then
    log "Warning: ${MEM_MB} MB RAM detected — PeakLogic cloud needs ≥2 GB (swap may help on SBC)"
  fi
fi

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages…"
apt-get update -qq
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  rsync \
  mosquitto \
  mosquitto-clients \
  acl

# --- Node.js 20 LTS (NodeSource) ---
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
  log "Node.js $(node -v) already present — skipping NodeSource install"
fi

# --- MongoDB 7 (official repo) ---
MONGO_DIST="debian"
MONGO_CODENAME="bookworm"
case "${OS_ID:-}" in
  debian)
    if [[ "$DEBIAN_VERSION" == "11" ]]; then
      MONGO_CODENAME="bullseye"
    fi
    ;;
  ubuntu)
    MONGO_DIST="ubuntu"
    case "$DEBIAN_VERSION" in
      22.04) MONGO_CODENAME="jammy" ;;
      24.04) MONGO_CODENAME="noble" ;;
      20.04) MONGO_CODENAME="focal" ;;
      *)
        log "Warning: untested Ubuntu $DEBIAN_VERSION for MongoDB — trying jammy repo"
        MONGO_CODENAME="jammy"
        ;;
    esac
    ;;
esac

if ! command -v mongod >/dev/null 2>&1; then
  log "Installing MongoDB 7 (${MONGO_DIST}/${MONGO_CODENAME})…"
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
    | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/${MONGO_DIST} ${MONGO_CODENAME}/mongodb-org/7.0 main" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -qq
  apt-get install -y -qq mongodb-org
else
  log "mongod already installed — skipping MongoDB repo install"
fi

systemctl enable mongod >/dev/null 2>&1 || true
if ! systemctl is-active --quiet mongod; then
  systemctl start mongod
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

# --- Environment file ---
install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic
for deploy_file in "$SCRIPT_DIR"/.env.debian.example "$SCRIPT_DIR"/mosquitto-debian.conf \
  "$SCRIPT_DIR"/peaklogic.service "$SCRIPT_DIR"/install.sh; do
  strip_crlf "$deploy_file"
done
if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating $ENV_FILE from template (edit MOSQUITTO_PASS before production)…"
  install -m 0640 -o root -g "$SERVICE_USER" "$SCRIPT_DIR/.env.debian.example" "$ENV_FILE"
else
  log "Keeping existing $ENV_FILE"
fi
strip_crlf "$ENV_FILE"
# test/preload-config-memory.js is not deployed; strip mistaken NODE_OPTIONS from env
if grep -q 'preload-config-memory' "$ENV_FILE" 2>/dev/null; then
  log "Removing NODE_OPTIONS test preload from $ENV_FILE (not used in production)…"
  sed -i '/preload-config-memory/d' "$ENV_FILE"
  sed -i '/^NODE_OPTIONS=/d' "$ENV_FILE"
fi

# --- Application tree ---
install -d -m 0755 "$INSTALL_DIR"
if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
  log "Syncing app to $INSTALL_DIR from $SOURCE_DIR…"
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

BUNDLED_PROJECTS_SRC=""
if [[ -d "$SOURCE_DIR/data/projects" ]]; then
  BUNDLED_PROJECTS_SRC="$SOURCE_DIR/data/projects"
elif [[ -d "$INSTALL_DIR/data/projects" ]]; then
  BUNDLED_PROJECTS_SRC="$INSTALL_DIR/data/projects"
fi
if [[ -n "$BUNDLED_PROJECTS_SRC" ]]; then
  n_src="$(find "$BUNDLED_PROJECTS_SRC" -maxdepth 1 -type f -name '*.est.json' 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${n_src:-0}" -gt 0 ]]; then
    log "Installing $n_src bundled project snapshot(s) → $DATA_DIR/projects/"
    rsync -a --include='*.est.json' --exclude='*' "$BUNDLED_PROJECTS_SRC/" "$DATA_DIR/projects/"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR/projects"
  fi
fi

ONLY_DEPS="${PEAKLOGIC_ONLY_DEPS:-0}"

if [[ "$ONLY_DEPS" != "1" ]]; then
  # --- systemd unit (install before mosquitto so re-runs always register the service) ---
  sed "s|@PEAKLOGIC_INSTALL_DIR@|${INSTALL_DIR}|g" "$SCRIPT_DIR/peaklogic.service" \
    > /etc/systemd/system/peaklogic.service
  chmod 0644 /etc/systemd/system/peaklogic.service
  systemctl daemon-reload
  systemctl enable peaklogic.service
fi

# --- Mosquitto (auth from env) ---
strip_crlf "$ENV_FILE"
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

MOSQUITTO_ALLOW_ANONYMOUS="${MOSQUITTO_ALLOW_ANONYMOUS:-false}"
MOSQUITTO_USER="${MOSQUITTO_USER:-}"
MOSQUITTO_PASS="${MOSQUITTO_PASS:-}"
MOSQUITTO_ALLOW_ANONYMOUS="${MOSQUITTO_ALLOW_ANONYMOUS//$'\r'/}"
MOSQUITTO_USER="${MOSQUITTO_USER//$'\r'/}"
MOSQUITTO_PASS="${MOSQUITTO_PASS//$'\r'/}"

MOSQUITTO_MAIN="/etc/mosquitto/mosquitto.conf"
MOSQUITTO_CONFD="/etc/mosquitto/conf.d/peaklogic.conf"

install -d -m 0755 -o mosquitto -g mosquitto /var/lib/mosquitto
install -d -m 0755 /etc/mosquitto/conf.d

# Legacy 'port' in main config + listener in conf.d => duplicate bind on 1883 (Mosquitto 2.x)
if [[ -f "$MOSQUITTO_MAIN" ]]; then
  if grep -qE '^[[:space:]]*port[[:space:]]+' "$MOSQUITTO_MAIN"; then
    log "Disabling legacy port directive in $MOSQUITTO_MAIN"
    sed -i 's/^[[:space:]]*port[[:space:]]/# port /' "$MOSQUITTO_MAIN"
  fi
  # Auth before include_dir/listener starts implicit listener on 1883 (Ubuntu + Debian packages)
  if grep -qE '^[[:space:]]*allow_anonymous[[:space:]]+' "$MOSQUITTO_MAIN"; then
    log "Disabling allow_anonymous in $MOSQUITTO_MAIN (use peaklogic.conf)"
    sed -i 's/^[[:space:]]*allow_anonymous[[:space:]]/# allow_anonymous /' "$MOSQUITTO_MAIN"
  fi
  if grep -qE '^[[:space:]]*password_file[[:space:]]+' "$MOSQUITTO_MAIN"; then
    log "Disabling password_file in $MOSQUITTO_MAIN (use peaklogic.conf)"
    sed -i 's/^[[:space:]]*password_file[[:space:]]/# password_file /' "$MOSQUITTO_MAIN"
  fi
  if grep -qE '^[[:space:]]*per_listener_settings[[:space:]]+' "$MOSQUITTO_MAIN"; then
    log "Disabling per_listener_settings in $MOSQUITTO_MAIN"
    sed -i 's/^[[:space:]]*per_listener_settings[[:space:]]/# per_listener_settings /' "$MOSQUITTO_MAIN"
  fi
fi

# Stock conf.d snippets often define listener/auth and conflict with peaklogic.conf
for f in /etc/mosquitto/conf.d/*; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  [[ "$base" == "peaklogic.conf" ]] && continue
  [[ "$base" == *.disabled ]] && continue
  log "Disabling stock Mosquitto config: $f"
  mv -f "$f" "${f}.disabled"
done

install -m 0644 "$SCRIPT_DIR/mosquitto-debian.conf" "$MOSQUITTO_CONFD"

if [[ "$MOSQUITTO_ALLOW_ANONYMOUS" == "true" ]]; then
  log "Mosquitto: anonymous access enabled (dev/LAN only)"
  sed -i 's/^allow_anonymous false/allow_anonymous true/' "$MOSQUITTO_CONFD"
  sed -i '/^password_file /d' "$MOSQUITTO_CONFD"
  rm -f /etc/mosquitto/passwd
elif [[ -n "$MOSQUITTO_USER" && -n "$MOSQUITTO_PASS" ]]; then
  log "Mosquitto: password auth for user $MOSQUITTO_USER"
  mosquitto_passwd -b -c /etc/mosquitto/passwd "$MOSQUITTO_USER" "$MOSQUITTO_PASS"
  # Mosquitto 2.x warns/refuses if passwd is not owned by root. Broker runs as
  # user mosquitto, so use root:mosquitto 0640 (owner root, group-readable by broker).
  chown root:mosquitto /etc/mosquitto/passwd 2>/dev/null || chown root:root /etc/mosquitto/passwd
  chmod 0640 /etc/mosquitto/passwd
else
  log "Warning: MOSQUITTO_ALLOW_ANONYMOUS=false but MOSQUITTO_USER/PASS unset — MQTT clients cannot connect"
fi

MOSQUITTO_TLS="${MOSQUITTO_TLS:-false}"
MOSQUITTO_TLS="${MOSQUITTO_TLS//$'\r'/}"
PEAKLOGIC_DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
if [[ "$MOSQUITTO_TLS" == "true" ]]; then
  log "Mosquitto: enabling TLS listener on port ${MOSQUITTO_TLS_PORT:-8883}"
  bash "$SCRIPT_DIR/setup-mosquitto-tls.sh"
  if [[ -f "$SCRIPT_DIR/mosquitto-tls.conf" ]]; then
    grep -q '^listener 8883' "$MOSQUITTO_CONFD" 2>/dev/null || cat "$SCRIPT_DIR/mosquitto-tls.conf" >> "$MOSQUITTO_CONFD"
  fi
fi

# Validate by (re)starting the service — the real test. Standalone `mosquitto -t`
# was removed in 2.0.18, and a manual smoke test collides with the live 1883 listener.
systemctl enable mosquitto >/dev/null 2>&1 || true
if ! systemctl restart mosquitto; then
  log "mosquitto restart failed — recent logs:"
  journalctl -u mosquitto.service -n 30 --no-pager >&2 || true
  die "Fix Mosquitto config (journalctl -xeu mosquitto.service)"
fi
sleep 1
if ! systemctl is-active --quiet mosquitto; then
  log "mosquitto not active after restart — recent logs:"
  journalctl -u mosquitto.service -n 30 --no-pager >&2 || true
  die "Fix Mosquitto config (journalctl -xeu mosquitto.service)"
fi

if [[ "$ONLY_DEPS" == "1" ]]; then
  log "PEAKLOGIC_ONLY_DEPS=1 — MongoDB + Mosquitto ready (no peaklogic.service start)"
  exit 0
fi

if systemctl is-active --quiet peaklogic.service 2>/dev/null; then
  systemctl restart peaklogic.service
else
  systemctl start peaklogic.service
fi

log "Done."
for svc in mongod mosquitto peaklogic; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    log "  $svc: active"
  else
    log "  $svc: NOT running (systemctl status $svc)"
  fi
done
log "  Health: curl -s http://127.0.0.1:3090/health"
log "  Env:    $ENV_FILE"
log "  Logs:   journalctl -u peaklogic -f"
log "  Edit MOSQUITTO_PASS in $ENV_FILE and re-run this script to rotate MQTT credentials."
if [[ "${MOSQUITTO_TLS:-false}" == "true" ]]; then
  log "  MQTT TLS: mqtts://${PEAKLOGIC_DOMAIN:-peaklogic.io}:${MOSQUITTO_TLS_PORT:-8883} (user ${MOSQUITTO_USER:-?})"
else
  log "  MQTT: mqtt://${PEAKLOGIC_DOMAIN:-<host>}:1883 (set MOSQUITTO_TLS=true for mqtts://:8883)"
fi
log "  Docs: deploy/cloud/MQTT.md"
