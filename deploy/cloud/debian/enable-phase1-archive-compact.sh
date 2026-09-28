#!/usr/bin/env bash
# Enable daily Mongo → zstd archive compaction on cloud 1 (SaaS droplet).
# Requires full est-pc bundle at PEAKLOGIC_INSTALL_DIR and archive server on cloud 2.
#
#   sudo PEAKLOGIC_INSTALL_DIR=/home/peaklogic bash deploy/cloud/debian/enable-phase1-archive-compact.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
COMPACT_ENV="${PEAKLOGIC_ARCHIVE_COMPACT_ENV:-/etc/peaklogic/archive-compact.env}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"

log() { printf '[peaklogic-archive-compact] %s\n' "$*"; }
die() { printf '[peaklogic-archive-compact] ERROR: %s\n' "$*" >&2; exit 1; }

strip_crlf() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -q $'\r' "$f" 2>/dev/null; then
    sed -i 's/\r$//' "$f"
  fi
}

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "Run as root"
fi

[[ -f "$INSTALL_DIR/scripts/run-archive-compact.js" ]] \
  || die "Missing $INSTALL_DIR/scripts/run-archive-compact.js — install SaaS bundle first"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq zstd

install -d -m 0750 -o root -g "$SERVICE_USER" /etc/peaklogic

ENV_TEMPLATE=""
for candidate in \
  "$INSTALL_DIR/deploy/cloud/phase1/droplet-saas/archive-compact.env.template" \
  "$SCRIPT_DIR/../phase1/droplet-saas/archive-compact.env.template"; do
  if [[ -f "$candidate" ]]; then
    ENV_TEMPLATE="$candidate"
    break
  fi
done

if [[ ! -f "$COMPACT_ENV" ]]; then
  if [[ -n "$ENV_TEMPLATE" ]]; then
    log "Creating $COMPACT_ENV from phase1 template"
    install -m 0640 -o root -g "$SERVICE_USER" "$ENV_TEMPLATE" "$COMPACT_ENV"
  else
    die "Create $COMPACT_ENV with ARCHIVE_SERVER_URL and ARCHIVE_SERVER_TOKEN"
  fi
else
  log "Keeping existing $COMPACT_ENV"
fi
strip_crlf "$COMPACT_ENV"

if grep -qE 'ARCHIVE_SERVER_URL=.*CHANGE_ME|ARCHIVE_SERVER_URL=$' "$COMPACT_ENV" 2>/dev/null; then
  die "Edit $COMPACT_ENV — set ARCHIVE_SERVER_URL to cloud 2 (private IP :8090 recommended)"
fi
if grep -qE 'ARCHIVE_SERVER_TOKEN=CHANGE_ME' "$COMPACT_ENV" 2>/dev/null; then
  die "Edit $COMPACT_ENV — set ARCHIVE_SERVER_TOKEN (must match archive droplet)"
fi

for unit in peaklogic-archive-compact.service peaklogic-archive-compact.timer; do
  strip_crlf "$SCRIPT_DIR/$unit"
done

sed "s|@PEAKLOGIC_INSTALL_DIR@|${INSTALL_DIR}|g" \
  "$SCRIPT_DIR/peaklogic-archive-compact.service" \
  > /etc/systemd/system/peaklogic-archive-compact.service
install -m 0644 "$SCRIPT_DIR/peaklogic-archive-compact.timer" \
  /etc/systemd/system/peaklogic-archive-compact.timer

systemctl daemon-reload
systemctl enable peaklogic-archive-compact.timer
systemctl start peaklogic-archive-compact.timer

log "Archive compaction timer enabled (daily 02:15 UTC)"
log "  Dry run: sudo -u $SERVICE_USER bash -lc 'cd $INSTALL_DIR && ARCHIVE_COMPACT_DRY_RUN=1 node scripts/run-archive-compact.js'"
log "  Timer:   systemctl list-timers peaklogic-archive-compact.timer"
log "  Logs:    journalctl -u peaklogic-archive-compact.service -n 50"
log "  Env:     $COMPACT_ENV"
