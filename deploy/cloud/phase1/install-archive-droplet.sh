#!/usr/bin/env bash
# Phase 1 — archive droplet (cloud 2). No MongoDB.
# Requires Node 20 + /home/peaklogic/deploy/cloud/archive-server/server.js
#
#   sudo bash deploy/cloud/phase1/install-archive-droplet.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
ARCHIVE_ENV="${PEAKLOGIC_ARCHIVE_ENV:-/etc/peaklogic/archive.env}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"
SERVER_JS="$INSTALL_DIR/deploy/cloud/archive-server/server.js"

log() { printf '[peaklogic-archive] %s\n' "$*"; }
die() { printf '[peaklogic-archive] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root"
[[ -f "$SERVER_JS" ]] || die "Missing $SERVER_JS — extract SaaS bundle or sync repo first"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  log "Installing Node.js 20 LTS…"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic
install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" /data/archive

if [[ ! -f "$ARCHIVE_ENV" ]]; then
  install -m 0640 -o root -g "$SERVICE_USER" "$SCRIPT_DIR/.env.archive.example" "$ARCHIVE_ENV"
  die "Created $ARCHIVE_ENV — set ARCHIVE_SERVER_TOKEN, then re-run"
fi
sed -i 's/\r$//' "$ARCHIVE_ENV"

if grep -q 'CHANGE_ME_SHARED_ARCHIVE_TOKEN' "$ARCHIVE_ENV"; then
  die "Replace CHANGE_ME_SHARED_ARCHIVE_TOKEN in $ARCHIVE_ENV (must match SaaS saas.env)"
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/deploy/cloud/archive-server" 2>/dev/null || true

install -m 0644 "$SCRIPT_DIR/peaklogic-archive.service" /etc/systemd/system/peaklogic-archive.service
systemctl daemon-reload
systemctl enable peaklogic-archive.service
systemctl restart peaklogic-archive.service

if command -v ufw >/dev/null 2>&1; then
  log "UFW: prefer DO Cloud Firewall (8090 from SaaS IP only). Not opening 8090 to world."
fi

sleep 1
if curl -sf http://127.0.0.1:8090/health >/dev/null; then
  log "Archive healthy on :8090"
else
  journalctl -u peaklogic-archive -n 30 --no-pager || true
  die "Archive health check failed"
fi

log "Point SaaS ARCHIVE_SERVER_URL at http://<this-ip>:8090"
log "Logs: journalctl -u peaklogic-archive -f"
