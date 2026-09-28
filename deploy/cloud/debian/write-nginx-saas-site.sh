#!/usr/bin/env bash
# Write full nginx server block for SaaS (:3100). Does not overwrite TLS (certbot) configs.
#
#   PEAKLOGIC_DOMAIN=test.peaklogic.io bash deploy/cloud/debian/write-nginx-saas-site.sh
#   PEAKLOGIC_DOMAIN=peaklogic.io PEAKLOGIC_SAAS_PORT=3100 bash ...
set -euo pipefail

DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
PORT="${PEAKLOGIC_SAAS_PORT:-3100}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/peaklogic-saas}"
ENABLE_LINK="${NGINX_ENABLE_LINK:-1}"

log() { printf '[write-nginx-saas] %s\n' "$*"; }
die() { printf '[write-nginx-saas] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root"

if [[ -f "$NGINX_SITE" ]] && grep -qE 'ssl_certificate|listen 443' "$NGINX_SITE"; then
  log "TLS site exists — patching proxy_pass only in $NGINX_SITE"
  sed -i "s|proxy_pass http://127.0.0.1:3090|proxy_pass http://127.0.0.1:${PORT}|g" "$NGINX_SITE"
  sed -i "s|proxy_pass http://127.0.0.1:[0-9]\+|proxy_pass http://127.0.0.1:${PORT}|g" "$NGINX_SITE" 2>/dev/null || true
  if ! grep -q "server_name.*${DOMAIN}" "$NGINX_SITE" 2>/dev/null; then
    log "NOTE: server_name may not include ${DOMAIN} — re-run certbot if needed"
  fi
else
  log "Writing HTTP site ${DOMAIN} -> 127.0.0.1:${PORT}"
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF
fi

if [[ "$ENABLE_LINK" == "1" ]]; then
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/peaklogic-saas
  rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/peaklogic 2>/dev/null || true
fi

nginx -t
systemctl reload nginx
log "OK — nginx proxies ${DOMAIN} -> :${PORT}"
