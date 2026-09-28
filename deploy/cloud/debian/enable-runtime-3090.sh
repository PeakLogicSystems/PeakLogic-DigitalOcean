#!/usr/bin/env bash
# Optional: enable edge runtime API on port 3090 (client apps / appliance hub).
# SaaS on 3100 (peaklogic-saas.service) keeps running.
#
#   sudo PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash deploy/cloud/debian/enable-runtime-3090.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
RUNTIME_ENV="${PEAKLOGIC_RUNTIME_ENV:-/etc/peaklogic/runtime.env}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"

log() { printf '[peaklogic-runtime] %s\n' "$*"; }
die() { printf '[peaklogic-runtime] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "Run as root"
fi

[[ -f "$INSTALL_DIR/server.js" ]] || die "Missing $INSTALL_DIR/server.js — extract bundle first"

# Runtime env (local Mongo + MQTT — separate from SaaS managed Mongo)
if [[ ! -f "$RUNTIME_ENV" ]]; then
  log "Creating $RUNTIME_ENV from appliance template"
  install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic
  install -m 0640 -o root -g "$SERVICE_USER" "$SCRIPT_DIR/.env.debian.example" "$RUNTIME_ENV"
  sed -i 's/\r$//' "$RUNTIME_ENV"
fi

# MongoDB + Mosquitto via install.sh (deps only — does not start peaklogic.service)
log "Ensuring MongoDB and Mosquitto (runtime dependencies)…"
PEAKLOGIC_SOURCE="$INSTALL_DIR" \
PEAKLOGIC_INSTALL_DIR="$INSTALL_DIR" \
PEAKLOGIC_ENV_FILE="$RUNTIME_ENV" \
PEAKLOGIC_ONLY_DEPS=1 \
bash "$SCRIPT_DIR/install.sh"

sed "s|@PEAKLOGIC_INSTALL_DIR@|${INSTALL_DIR}|g" "$SCRIPT_DIR/peaklogic-runtime.service" \
  > /etc/systemd/system/peaklogic-runtime.service
chmod 0644 /etc/systemd/system/peaklogic-runtime.service
systemctl daemon-reload
systemctl enable peaklogic-runtime.service
systemctl restart peaklogic-runtime.service

if command -v ufw >/dev/null 2>&1; then
  ufw allow 3090/tcp >/dev/null 2>&1 || true
  ufw allow 1883/tcp >/dev/null 2>&1 || true
fi

log "Edge runtime enabled on port 3090"
log "  Health: curl -s http://127.0.0.1:3090/health"
log "  Client: set PEAKLOGIC_API_BASE=http://<host>:3090/api (or reverse-proxy a subdomain)"
log "  SaaS:   https://peaklogic.io/login still served on 3100 via peaklogic-saas"
log "  Logs:   journalctl -u peaklogic-runtime -f"
