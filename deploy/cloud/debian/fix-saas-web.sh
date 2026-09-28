#!/usr/bin/env bash
# Fix peaklogic.io when nginx shows 502 — SaaS on port 3100.
# Run as root on the droplet after install-saas.sh.
set -euo pipefail

log() { printf '[fix-saas] %s\n' "$*"; }
die() { printf '[fix-saas] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-0}" -eq 0 ]] || die "Run as root: sudo bash $0"

PORT="${PEAKLOGIC_SAAS_PORT:-3100}"
DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"
NGINX_SITE="/etc/nginx/sites-available/peaklogic-saas"

log "=== Diagnose ==="
ss -tlnp | grep -E ":${PORT} |:80 |:443 " || ss -tlnp | head -15
systemctl is-active peaklogic-saas 2>/dev/null && log "peaklogic-saas: active" || log "peaklogic-saas: NOT active"
curl -sf "http://127.0.0.1:${PORT}/health" && log "health OK on :${PORT}" || log "health FAILED on :${PORT} (see journalctl below)"

if [[ -f "$SAAS_ENV" ]]; then
  if grep -qE '^(MONGODB_URI=|JWT_SECRET=|PLATFORM_ADMIN_KEY=).*CHANGE_ME' "$SAAS_ENV" 2>/dev/null; then
    log "WARNING: $SAAS_ENV still has CHANGE_ME placeholders — edit before SaaS can start"
  fi
  if grep -qE '^MONGODB_URI=mongodb://localhost' "$SAAS_ENV" 2>/dev/null; then
    log "WARNING: MONGODB_URI points at localhost — SaaS needs DO Managed Mongo (mongodb+srv://)"
  fi
else
  log "WARNING: missing $SAAS_ENV"
fi

log "=== Recent peaklogic-saas logs ==="
journalctl -u peaklogic-saas -n 25 --no-pager 2>/dev/null || true

log "=== UFW ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp || true
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable || true
  ufw status | head -20
fi

log "=== nginx -> :${PORT} ==="
apt-get update -qq
apt-get install -y -qq nginx

WRITE_NGINX="${INSTALL_DIR}/deploy/cloud/debian/write-nginx-saas-site.sh"
[[ -f "$WRITE_NGINX" ]] || WRITE_NGINX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/write-nginx-saas-site.sh"
PEAKLOGIC_DOMAIN="$DOMAIN" PEAKLOGIC_SAAS_PORT="$PORT" bash "$WRITE_NGINX"

log "=== Restart peaklogic-saas ==="
if systemctl list-unit-files peaklogic-saas.service >/dev/null 2>&1; then
  systemctl restart peaklogic-saas || true
  sleep 2
  systemctl status peaklogic-saas --no-pager -l | head -20 || true
else
  log "peaklogic-saas.service not installed — run install-saas.sh first"
fi

if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  log "Backend OK on :${PORT}"
else
  die "Backend still down. Fix $SAAS_ENV (MONGODB_URI + secrets), allowlist droplet IP on DO Mongo, then: systemctl restart peaklogic-saas"
fi

curl -sf -o /dev/null -w "nginx :80 -> %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/ || die "nginx still failing"

PUBLIC_IP="$(curl -sf -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
log "Public IP: ${PUBLIC_IP:-unknown} — DNS ${DOMAIN} should point here"
log ""
log "HTTPS: apt install -y certbot python3-certbot-nginx && certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
log "If browser still fails: DO Control Panel -> Firewalls -> allow TCP 80 and 443"
log "Login: http://${DOMAIN}/login  (https after certbot)"
