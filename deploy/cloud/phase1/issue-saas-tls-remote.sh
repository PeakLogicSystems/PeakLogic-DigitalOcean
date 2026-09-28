#!/usr/bin/env bash
# Issue Let's Encrypt cert for cloud-1 SaaS (peaklogic.io + www)
set -euo pipefail

# Minimal HTTP site so certbot --nginx can authenticate
cat > /etc/nginx/sites-available/peaklogic-saas <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name peaklogic.io www.peaklogic.io;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/peaklogic-saas /etc/nginx/sites-enabled/peaklogic-saas
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot --nginx \
  -d peaklogic.io -d www.peaklogic.io \
  --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --redirect

echo "--- cert ---"
ls -la /etc/letsencrypt/live/peaklogic.io/
echo "SAAS_TLS_OK"
curl -sI https://peaklogic.io/ | head -5 || true
