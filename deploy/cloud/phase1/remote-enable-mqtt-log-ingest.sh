#!/usr/bin/env bash
set -euo pipefail
ENV=/etc/peaklogic/saas.env
if grep -q '^PEAKLOGIC_MQTT_LOG_INGEST_TOKEN=' "$ENV" 2>/dev/null; then
  echo 'PEAKLOGIC_MQTT_LOG_INGEST_TOKEN already set'
else
  TOKEN="$(grep '^PLATFORM_ADMIN_KEY=' "$ENV" | cut -d= -f2-)"
  printf '\nPEAKLOGIC_MQTT_LOG_INGEST_TOKEN=%s\n' "$TOKEN" >> "$ENV"
  echo 'Added PEAKLOGIC_MQTT_LOG_INGEST_TOKEN from PLATFORM_ADMIN_KEY'
fi
systemctl restart peaklogic-saas
sleep 3
systemctl is-active peaklogic-saas
curl -s http://127.0.0.1:3100/api/mqtt-broker-log/status
