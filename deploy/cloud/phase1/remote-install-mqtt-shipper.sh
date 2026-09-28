#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP=/tmp
install -d -m 0755 "$SCRIPT_DIR" 2>/dev/null || true
cp "$TMP/mosquitto-log-shipper.py" "$SCRIPT_DIR/mosquitto-log-shipper.py"
cp "$TMP/install-mqtt-log-shipper.sh" "$SCRIPT_DIR/install-mqtt-log-shipper.sh"
cp "$TMP/install-mqtt-droplet.sh" "$SCRIPT_DIR/install-mqtt-droplet.sh"
chmod +x "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR"/*.py
bash "$SCRIPT_DIR/install-mqtt-droplet.sh"
TOKEN="$(ssh mv-saas "grep '^PEAKLOGIC_MQTT_LOG_INGEST_TOKEN=' /etc/peaklogic/saas.env | cut -d= -f2-" 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(ssh mv-saas "grep '^PLATFORM_ADMIN_KEY=' /etc/peaklogic/saas.env | cut -d= -f2-")"
fi
export PEAKLOGIC_MQTT_LOG_INGEST_TOKEN="$TOKEN"
export PEAKLOGIC_MQTT_LOG_INGEST_URL="${PEAKLOGIC_MQTT_LOG_INGEST_URL:-https://peaklogic.io}"
bash "$SCRIPT_DIR/install-mqtt-log-shipper.sh"
systemctl is-active peaklogic-mqtt-log-shipper
