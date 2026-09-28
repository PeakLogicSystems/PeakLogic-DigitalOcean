#!/usr/bin/env bash
# Dedicated Mosquitto MQTT droplet (Phase 1 ATL — cloud-mqtt-atl1).
# Does NOT install PeakLogic SaaS. Field devices: mqtts://mqtt.peaklogic.io:8883
#
#   sudo PEAKLOGIC_INSTALL_DIR=/opt/peaklogic-mqtt bash deploy/cloud/debian/install-mqtt-droplet.sh
#
# Requires deploy/cloud/debian/* and phase1/droplet-mqtt/mqtt.env.template on the host
# (included in peaklogic-cloud-*d.tgz SaaS bundle, or copy scripts manually).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/opt/peaklogic-mqtt}"
MQTT_ENV="${PEAKLOGIC_MQTT_ENV:-/etc/peaklogic/mqtt.env}"
DOMAIN="${PEAKLOGIC_DOMAIN:-mqtt.peaklogic.io}"

log() { printf '[peaklogic-mqtt-droplet] %s\n' "$*"; }
die() { printf '[peaklogic-mqtt-droplet] ERROR: %s\n' "$*" >&2; exit 1; }

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

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq mosquitto mosquitto-clients certbot

install -d -m 0755 "$INSTALL_DIR"
install -d -m 0750 -o root -g root /etc/peaklogic

ENV_TEMPLATE=""
for candidate in \
  "$INSTALL_DIR/deploy/cloud/phase1/droplet-mqtt/mqtt.env.template" \
  "$SCRIPT_DIR/../phase1/droplet-mqtt/mqtt.env.template"; do
  if [[ -f "$candidate" ]]; then
    ENV_TEMPLATE="$candidate"
    break
  fi
done

if [[ ! -f "$MQTT_ENV" ]]; then
  if [[ -n "$ENV_TEMPLATE" ]]; then
    log "Creating $MQTT_ENV from droplet-mqtt template"
    install -m 0640 -o root -g root "$ENV_TEMPLATE" "$MQTT_ENV"
  else
    die "No mqtt.env template — create $MQTT_ENV manually"
  fi
fi
strip_crlf "$MQTT_ENV"

if grep -qE '^MOSQUITTO_PASS=CHANGE_ME' "$MQTT_ENV" 2>/dev/null; then
  die "Edit $MQTT_ENV — set MOSQUITTO_USER and MOSQUITTO_PASS"
fi

# shellcheck disable=SC1090
set -a
source "$MQTT_ENV"
set +a

MOSQUITTO_ALLOW_ANONYMOUS="${MOSQUITTO_ALLOW_ANONYMOUS:-false}"
MOSQUITTO_USER="${MOSQUITTO_USER:-peaklogic}"
MOSQUITTO_PASS="${MOSQUITTO_PASS:-}"
MOSQUITTO_TLS="${MOSQUITTO_TLS:-true}"
MOSQUITTO_TLS_PORT="${MOSQUITTO_TLS_PORT:-8883}"
PEAKLOGIC_DOMAIN="${PEAKLOGIC_DOMAIN:-$DOMAIN}"

MOSQUITTO_CONFD="/etc/mosquitto/conf.d/peaklogic.conf"
MOSQUITTO_MAIN="/etc/mosquitto/mosquitto.conf"

install -d -m 0755 -o mosquitto -g mosquitto /var/lib/mosquitto
install -d -m 0755 /etc/mosquitto/conf.d

if [[ -f "$MOSQUITTO_MAIN" ]]; then
  sed -i 's/^[[:space:]]*port[[:space:]]/# port /' "$MOSQUITTO_MAIN" 2>/dev/null || true
  sed -i 's/^[[:space:]]*allow_anonymous[[:space:]]/# allow_anonymous /' "$MOSQUITTO_MAIN" 2>/dev/null || true
  sed -i 's/^[[:space:]]*password_file[[:space:]]/# password_file /' "$MOSQUITTO_MAIN" 2>/dev/null || true
fi

for f in /etc/mosquitto/conf.d/*; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  [[ "$base" == "peaklogic.conf" ]] && continue
  [[ "$base" == *.disabled ]] && continue
  log "Disabling stock Mosquitto config: $f"
  mv -f "$f" "${f}.disabled"
done

install -m 0644 "$SCRIPT_DIR/mosquitto-debian.conf" "$MOSQUITTO_CONFD"

if [[ "$MOSQUITTO_ALLOW_ANONYMOUS" == "true" ]]; then
  sed -i 's/^allow_anonymous false/allow_anonymous true/' "$MOSQUITTO_CONFD"
  sed -i '/^password_file /d' "$MOSQUITTO_CONFD"
  rm -f /etc/mosquitto/passwd
else
  mosquitto_passwd -b -c /etc/mosquitto/passwd "$MOSQUITTO_USER" "$MOSQUITTO_PASS"
  chown root:mosquitto /etc/mosquitto/passwd 2>/dev/null || chown root:root /etc/mosquitto/passwd
  chmod 0640 /etc/mosquitto/passwd
fi

if [[ "$MOSQUITTO_TLS" == "true" ]]; then
  if [[ ! -f "/etc/letsencrypt/live/${PEAKLOGIC_DOMAIN}/fullchain.pem" ]]; then
    log "No LE cert yet for ${PEAKLOGIC_DOMAIN} — run certbot first, then re-run this script"
    log "  certbot certonly --standalone -d ${PEAKLOGIC_DOMAIN} --non-interactive --agree-tos -m admin@peaklogic.io"
  fi
  PEAKLOGIC_DOMAIN="$PEAKLOGIC_DOMAIN" bash "$SCRIPT_DIR/setup-mosquitto-tls.sh"
  if [[ -f "$SCRIPT_DIR/mosquitto-tls.conf" ]]; then
    grep -q '^listener 8883' "$MOSQUITTO_CONFD" 2>/dev/null || cat "$SCRIPT_DIR/mosquitto-tls.conf" >> "$MOSQUITTO_CONFD"
  fi
fi

systemctl enable mosquitto >/dev/null 2>&1 || true
systemctl restart mosquitto || die "Mosquitto failed — journalctl -xeu mosquitto.service"

if command -v ufw >/dev/null 2>&1; then
  ufw allow 8883/tcp comment 'MQTT TLS' >/dev/null 2>&1 || true
  ufw allow 1883/tcp comment 'MQTT plain VPC' >/dev/null 2>&1 || true
fi

PRIVATE_IP="$(hostname -I | awk '{print $1}')"
log "Dedicated MQTT droplet ready"
log "  Field:    mqtts://${PEAKLOGIC_DOMAIN}:${MOSQUITTO_TLS_PORT} (user ${MOSQUITTO_USER})"
log "  Internal: mqtt://${PRIVATE_IP}:1883 (VPC — set on SaaS PEAKLOGIC_MQTT_BROKER)"
log "  Env:      $MQTT_ENV"
log "Next: configure SaaS — PEAKLOGIC_MQTT_PRIVATE_IP=${PRIVATE_IP} bash deploy/cloud/debian/configure-saas-mqtt-remote.sh"
