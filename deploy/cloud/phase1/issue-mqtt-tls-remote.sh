#!/usr/bin/env bash
# Issue Let's Encrypt cert for mqtt.peaklogic.io and reload Mosquitto TLS
# Requires: DNS A mqtt.peaklogic.io → this droplet public IP, port 80 open
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq certbot

# Mosquitto does not use :80 — free it for standalone challenge
if ss -lnt | grep -q ':80 '; then
  systemctl stop nginx 2>/dev/null || true
fi

certbot certonly --standalone \
  -d mqtt.peaklogic.io \
  --non-interactive --agree-tos \
  --register-unsafely-without-email \
  --preferred-challenges http

PEAKLOGIC_DOMAIN=mqtt.peaklogic.io \
  bash /home/peaklogic/deploy/cloud/debian/setup-mosquitto-tls.sh

systemctl restart mosquitto
sleep 1
systemctl is-active mosquitto
ss -lnt | grep ':8883'

set -a
# shellcheck disable=SC1091
. /etc/peaklogic/mqtt.env
set +a

mosquitto_pub -h mqtt.peaklogic.io -p 8883 \
  --capath /etc/ssl/certs \
  -u "$MOSQUITTO_USER" -P "$MOSQUITTO_PASS" \
  -t test/ping -m le-ok && echo MQTT_LE_TLS_OK

ls -la /etc/letsencrypt/live/mqtt.peaklogic.io/
echo "Mosquitto using LE material via /etc/mosquitto/certs/"
