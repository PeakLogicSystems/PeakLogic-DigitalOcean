#!/usr/bin/env bash
# Fix nginx + SaaS for sandbox test.peaklogic.io (nyc1 single-server).
# Run as root on the sandbox droplet after install-saas.sh.
#
#   sudo bash /home/peaklogic/deploy/cloud/debian/fix-sandbox-web.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
DOMAIN="test.peaklogic.io"
PORT=3100
SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"

log() { printf '[fix-sandbox] %s\n' "$*"; }
die() { printf '[fix-sandbox] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root on sandbox droplet"

log "Domain: ${DOMAIN}"

# Align saas.env PUBLIC_* with sandbox hostname
if [[ -f "$SAAS_ENV" ]]; then
  for key in PUBLIC_APP_URL PUBLIC_API_URL; do
    if grep -qE "^${key}=" "$SAAS_ENV"; then
      sed -i "s|^${key}=.*|${key}=https://${DOMAIN}|" "$SAAS_ENV"
    else
      printf '%s=https://%s\n' "$key" "$DOMAIN" >> "$SAAS_ENV"
    fi
  done
  systemctl restart peaklogic-saas 2>/dev/null || true
fi

apt-get update -qq
apt-get install -y -qq nginx

PEAKLOGIC_DOMAIN="$DOMAIN" PEAKLOGIC_SAAS_PORT="$PORT" NGINX_SITE="/etc/nginx/sites-available/peaklogic-saas" \
  bash "$SCRIPT_DIR/write-nginx-saas-site.sh"

if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  journalctl -u peaklogic-saas -n 30 --no-pager || true
  die "SaaS not healthy on :${PORT} — check $SAAS_ENV and Mongo allowlist"
fi

CODE="$(curl -sf -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1/login)"
log "nginx /login -> HTTP ${CODE}"

if [[ ! -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]]; then
  log "TLS: certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@peaklogic.io"
else
  certbot install --nginx -d "$DOMAIN" 2>/dev/null || certbot --nginx -d "$DOMAIN" --non-interactive || true
  systemctl reload nginx
  log "HTTPS: https://${DOMAIN}/login"
fi

log "Done — https://${DOMAIN}/login (demo / demo after seed)"
