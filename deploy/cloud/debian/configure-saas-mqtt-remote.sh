#!/usr/bin/env bash
# Point SaaS (:3100) at a dedicated MQTT droplet over VPC. Do NOT run enable-saas-mqtt.sh on SaaS.
#
#   sudo PEAKLOGIC_MQTT_PRIVATE_IP=10.x.x.x bash deploy/cloud/debian/configure-saas-mqtt-remote.sh
set -euo pipefail

SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"
BROKER_IP="${PEAKLOGIC_MQTT_PRIVATE_IP:-}"

log() { printf '[peaklogic-saas-mqtt] %s\n' "$*"; }
die() { printf '[peaklogic-saas-mqtt] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "Run as root on the SaaS droplet (cloud-1-saas)"
fi

[[ -f "$SAAS_ENV" ]] || die "Missing $SAAS_ENV — run install-saas.sh first"
[[ -n "$BROKER_IP" ]] || die "Set PEAKLOGIC_MQTT_PRIVATE_IP to the MQTT droplet VPC address"

BROKER_LINE="PEAKLOGIC_MQTT_BROKER=mqtt://${BROKER_IP}:1883"

if grep -qE '^PEAKLOGIC_MQTT_BROKER=' "$SAAS_ENV"; then
  sed -i "s|^PEAKLOGIC_MQTT_BROKER=.*|${BROKER_LINE}|" "$SAAS_ENV"
else
  printf '\n# Dedicated MQTT droplet (VPC plain)\n%s\n' "$BROKER_LINE" >> "$SAAS_ENV"
fi

if systemctl is-active --quiet mosquitto 2>/dev/null; then
  log "Stopping local Mosquitto on SaaS (use dedicated broker only)"
  systemctl stop mosquitto 2>/dev/null || true
  systemctl disable mosquitto 2>/dev/null || true
fi

systemctl restart peaklogic-saas.service 2>/dev/null || log "Restart peaklogic-saas manually if service name differs"

log "SaaS hub broker → mqtt://${BROKER_IP}:1883"
log "Field appliances → mqtts://mqtt.peaklogic.io:8883 (same MOSQUITTO_USER/PASS)"
