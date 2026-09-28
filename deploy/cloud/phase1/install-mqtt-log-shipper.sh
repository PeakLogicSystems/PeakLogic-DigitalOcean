#!/usr/bin/env bash
# Install Mosquitto log shipper on mv-mqtt (posts broker auth/connect events to SaaS).
# Run as root after SaaS has PEAKLOGIC_MQTT_LOG_INGEST_TOKEN set.
#
#   sudo PEAKLOGIC_MQTT_LOG_INGEST_TOKEN='…' \
#     PEAKLOGIC_MQTT_LOG_INGEST_URL='https://peaklogic.io' \
#     bash deploy/cloud/phase1/install-mqtt-log-shipper.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_MQTT_SHIPPER_DIR:-/opt/peaklogic-mqtt-shipper}"
UNIT=/etc/systemd/system/peaklogic-mqtt-log-shipper.service
ENV_FILE=/etc/peaklogic/mqtt-log-shipper.env

log() { printf '[mqtt-log-shipper] %s\n' "$*"; }
die() { printf '[mqtt-log-shipper] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root"

TOKEN="${PEAKLOGIC_MQTT_LOG_INGEST_TOKEN:-}"
[[ -n "$TOKEN" ]] || die "Set PEAKLOGIC_MQTT_LOG_INGEST_TOKEN (must match SaaS saas.env)"

API_URL="${PEAKLOGIC_MQTT_LOG_INGEST_URL:-${PUBLIC_API_URL:-https://peaklogic.io}}"
LOG_PATH="${PEAKLOGIC_MOSQUITTO_LOG_PATH:-/var/log/mosquitto/mosquitto.log}"
LOG_HOST="${PEAKLOGIC_MOSQUITTO_LOG_HOST:-$(hostname -s)}"

install -d -m 0755 "$INSTALL_DIR"
install -m 0755 "$SCRIPT_DIR/mosquitto-log-shipper.py" "$INSTALL_DIR/mosquitto-log-shipper.py"
install -d -m 0750 /etc/peaklogic
cat > "$ENV_FILE" <<EOF
PEAKLOGIC_MQTT_LOG_INGEST_URL=${API_URL}
PEAKLOGIC_MQTT_LOG_INGEST_TOKEN=${TOKEN}
PEAKLOGIC_MOSQUITTO_LOG_PATH=${LOG_PATH}
PEAKLOGIC_MOSQUITTO_LOG_HOST=${LOG_HOST}
EOF
chmod 0640 "$ENV_FILE"

cat > "$UNIT" <<EOF
[Unit]
Description=PeakLogic Mosquitto log shipper
After=network-online.target mosquitto.service
Wants=network-online.target
Requires=mosquitto.service

[Service]
Type=simple
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/mosquitto-log-shipper.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable peaklogic-mqtt-log-shipper
systemctl restart peaklogic-mqtt-log-shipper
log "Shipper running → ${API_URL}/api/mqtt-broker-log/ingest"
systemctl is-active peaklogic-mqtt-log-shipper
