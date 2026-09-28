#!/usr/bin/env bash
# PeakLogic archive server (cloud 2) — zstd blob store on :8090. No MongoDB.
#
# Run as root after WinSCP upload:
#   sudo PEAKLOGIC_SOURCE=/opt/peaklogic-archive PEAKLOGIC_ARCHIVE_DIR=/opt/peaklogic-archive \
#     bash deploy/cloud/debian/install-archive.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE_ENV="${PEAKLOGIC_ARCHIVE_ENV:-/etc/peaklogic/archive.env}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/data/archive}"
ARCHIVE_DIR="${PEAKLOGIC_ARCHIVE_DIR:-/opt/peaklogic-archive}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"
SOURCE_DIR="${PEAKLOGIC_SOURCE:-$ARCHIVE_DIR}"
SAAS_DROPLET_IP="${PEAKLOGIC_SAAS_IP:-}"

log() { printf '[peaklogic-archive] %s\n' "$*"; }
die() { printf '[peaklogic-archive] ERROR: %s\n' "$*" >&2; exit 1; }

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

[[ -f "$SOURCE_DIR/server.js" ]] || die "Missing $SOURCE_DIR/server.js — extract archive bundle first"

export DEBIAN_FRONTEND=noninteractive

log "Installing base packages (Node 20)…"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]]; then
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

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating system user $SERVICE_USER…"
  useradd --system --home-dir "$ARCHIVE_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic
strip_crlf "$SCRIPT_DIR/peaklogic-archive.service"

ENV_TEMPLATE=""
for candidate in \
  "$SOURCE_DIR/deploy/cloud/phase1/droplet-archive/archive.env.template" \
  "$SCRIPT_DIR/../phase1/droplet-archive/archive.env.template"; do
  if [[ -f "$candidate" ]]; then
    ENV_TEMPLATE="$candidate"
    break
  fi
done

if [[ ! -f "$ARCHIVE_ENV" ]]; then
  if [[ -n "$ENV_TEMPLATE" ]]; then
    log "Creating $ARCHIVE_ENV from phase1 template"
    install -m 0640 -o root -g "$SERVICE_USER" "$ENV_TEMPLATE" "$ARCHIVE_ENV"
  else
    log "Creating minimal $ARCHIVE_ENV — set ARCHIVE_SERVER_TOKEN before production"
    cat > "$ARCHIVE_ENV" <<EOF
PORT=8090
ARCHIVE_ROOT=${ARCHIVE_ROOT}
ARCHIVE_SERVER_TOKEN=CHANGE_ME_ARCHIVE_TOKEN
EOF
    chown root:"$SERVICE_USER" "$ARCHIVE_ENV"
    chmod 0640 "$ARCHIVE_ENV"
  fi
else
  log "Keeping existing $ARCHIVE_ENV"
fi
strip_crlf "$ARCHIVE_ENV"

if grep -qE '^ARCHIVE_SERVER_TOKEN=CHANGE_ME' "$ARCHIVE_ENV" 2>/dev/null; then
  die "Edit $ARCHIVE_ENV — set ARCHIVE_SERVER_TOKEN (must match cloud 1 archive-compact.env)"
fi

# shellcheck disable=SC1090
set -a
source "$ARCHIVE_ENV"
set +a
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/data/archive}"
PORT="${PORT:-8090}"

install -d -m 0755 "$ARCHIVE_DIR"
if [[ "$SOURCE_DIR" != "$ARCHIVE_DIR" ]]; then
  log "Installing archive server to $ARCHIVE_DIR…"
  install -m 0755 "$SOURCE_DIR/server.js" "$ARCHIVE_DIR/server.js"
  if [[ -d "$SOURCE_DIR/deploy" ]]; then
    rsync -a "$SOURCE_DIR/deploy/" "$ARCHIVE_DIR/deploy/"
  fi
fi

install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$ARCHIVE_ROOT"
chown -R "$SERVICE_USER:$SERVICE_USER" "$ARCHIVE_DIR"

sed -e "s|@PEAKLOGIC_ARCHIVE_DIR@|${ARCHIVE_DIR}|g" \
    -e "s|@ARCHIVE_ROOT@|${ARCHIVE_ROOT}|g" \
  "$SCRIPT_DIR/peaklogic-archive.service" > /etc/systemd/system/peaklogic-archive.service
chmod 0644 /etc/systemd/system/peaklogic-archive.service

systemctl daemon-reload
systemctl enable peaklogic-archive.service
systemctl restart peaklogic-archive.service

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || true
  if [[ -n "$SAAS_DROPLET_IP" ]]; then
    log "UFW: allowing TCP ${PORT} from SaaS droplet ${SAAS_DROPLET_IP} only"
    ufw allow from "$SAAS_DROPLET_IP" to any port "$PORT" proto tcp >/dev/null 2>&1 || true
  else
    log "UFW: allowing TCP ${PORT} (set PEAKLOGIC_SAAS_IP on re-run to restrict source IP)"
    ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
  fi
  ufw --force enable >/dev/null 2>&1 || true
fi

log "Done — archive server on port ${PORT}"
if systemctl is-active --quiet peaklogic-archive.service 2>/dev/null; then
  log "  peaklogic-archive: active"
else
  log "  peaklogic-archive: NOT running (journalctl -u peaklogic-archive -n 40)"
fi
log "  Health: curl -s http://127.0.0.1:${PORT}/health"
log "  Root:   ${ARCHIVE_ROOT}"
log "  Env:    ${ARCHIVE_ENV}"
log "  Logs:   journalctl -u peaklogic-archive -f"
