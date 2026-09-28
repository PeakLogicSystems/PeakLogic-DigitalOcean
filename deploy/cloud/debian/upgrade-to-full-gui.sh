#!/usr/bin/env bash
# Upgrade an existing headless cloud VM install to full GUI (est-pc server.js).
# Run on the droplet after syncing or copying updated files to /home/peaklogic.
set -euo pipefail

INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
ENV_FILE="${PEAKLOGIC_ENV_FILE:-/etc/peaklogic/env}"

log() { printf '[upgrade-gui] %s\n' "$*"; }
die() { printf '[upgrade-gui] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-0}" -eq 0 ]] || die "Run as root"

if [[ ! -f "$INSTALL_DIR/server.js" ]] || [[ ! -f "$INSTALL_DIR/views/dashboard.ejs" ]]; then
  die "Missing GUI files in $INSTALL_DIR — re-upload bundle or rsync peaklogic-cloud first"
fi

if grep -q 'Use peaklogic-client for operator UI' "$INSTALL_DIR/server.js" 2>/dev/null; then
  die "server.js is still headless — run sync-runtime-to-cloud.ps1 on dev PC, rebuild bundle, re-extract, then re-run this script"
fi

log "Enabling full GUI in $ENV_FILE"
grep -q '^PEAKLOGIC_PRODUCT=' "$ENV_FILE" 2>/dev/null \
  && sed -i 's/^PEAKLOGIC_PRODUCT=.*/PEAKLOGIC_PRODUCT=cloud/' "$ENV_FILE" \
  || echo 'PEAKLOGIC_PRODUCT=cloud' >> "$ENV_FILE"

systemctl start mongod mosquitto 2>/dev/null || true

if [[ -f "$INSTALL_DIR/deploy/cloud/debian/install.sh" ]]; then
  log "Re-running install.sh (systemd, deps, mosquitto)..."
  export PEAKLOGIC_SOURCE="$INSTALL_DIR"
  export PEAKLOGIC_INSTALL_DIR="$INSTALL_DIR"
  bash "$INSTALL_DIR/deploy/cloud/debian/install.sh"
else
  systemctl daemon-reload
  systemctl restart peaklogic
fi

log "Done. Open http://<your-host>/ (nginx) or http://<ip>:3090"
log "Health: curl -s http://127.0.0.1:3090/health | head -c 200"
