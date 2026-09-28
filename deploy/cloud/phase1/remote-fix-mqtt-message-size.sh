#!/usr/bin/env bash
# Raise Mosquitto message_size_limit to 16 KB for Opta MQTT Parc (telemetry + put_program).
# Run on mv-mqtt (or any PeakLogic Mosquitto host) as root:
#   sudo bash deploy/cloud/phase1/remote-fix-mqtt-message-size.sh
set -euo pipefail

CONF="${PEAKLOGIC_MOSQUITTO_CONF:-/etc/mosquitto/conf.d/peaklogic.conf}"
LIMIT="${PEAKLOGIC_MQTT_MESSAGE_SIZE:-16384}"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
[[ -f "$CONF" ]] || { echo "Missing $CONF" >&2; exit 1; }

if grep -q '^message_size_limit ' "$CONF"; then
  sed -i "s/^message_size_limit .*/message_size_limit ${LIMIT}/" "$CONF"
else
  awk -v limit="$LIMIT" '
    { print }
    /^connection_messages true/ && !done {
      print "message_size_limit " limit
      done = 1
    }
  ' "$CONF" > "${CONF}.tmp"
  mv "${CONF}.tmp" "$CONF"
fi

grep '^message_size_limit ' "$CONF"
mosquitto -c /etc/mosquitto/mosquitto.conf 2>&1 | head -3 || true
systemctl restart mosquitto
sleep 1
systemctl is-active mosquitto
echo "[mqtt] message_size_limit ${LIMIT} applied"
