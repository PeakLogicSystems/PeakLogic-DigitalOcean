#!/usr/bin/env bash
# Full 8/13/2026 SaaS code deploy on cloud-1-saas-nyc1 (preserves /etc/peaklogic + /var/lib/peaklogic).
set -euo pipefail

BUNDLE="/tmp/peaklogic-cloud-20260813d-repair.tgz"
INSTALL_DIR="/home/peaklogic"
REPAIR="/tmp/repair-cloud1-813.sh"

log() { printf '[deploy-813] %s\n' "$*"; }
die() { printf '[deploy-813] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-0}" -eq 0 ]] || die "Run as root"

[[ -f "$BUNDLE" ]] || die "Missing $BUNDLE — upload bundle to /tmp first"

log "Extract 8/13 bundle -> $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
tar xzf "$BUNDLE" -C "$INSTALL_DIR" --strip-components=1

log "Normalize shell scripts"
find "$INSTALL_DIR/deploy/cloud/debian" -type f -name '*.sh' -print0 \
  | xargs -0 sed -i 's/\r$//' 2>/dev/null || true

log "Run install-saas.sh"
export PEAKLOGIC_SOURCE="$INSTALL_DIR"
export PEAKLOGIC_INSTALL_DIR="$INSTALL_DIR"
bash "$INSTALL_DIR/deploy/cloud/debian/install-saas.sh"

log "Restore runtime program settings (putnam-county-cloud baseline)"
if [[ -f "$REPAIR" ]]; then
  sed -i 's/\r$//' "$REPAIR" 2>/dev/null || true
  bash "$REPAIR"
else
  log "repair script not found — skipping runtime reset"
fi

log "Verify"
sleep 2
curl -sf "http://127.0.0.1:3100/health" | python3 -m json.tool || curl -sf "http://127.0.0.1:3100/health" || die "health check failed"

log "Deploy complete"
