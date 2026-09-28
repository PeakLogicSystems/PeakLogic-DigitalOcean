#!/usr/bin/env bash
set -a
# shellcheck disable=SC1091
. /etc/peaklogic/mqtt.env
set +a

echo "=== openssl ==="
openssl s_client -connect 127.0.0.1:8883 -servername mqtt.peaklogic.io </dev/null 2>&1 | head -30

echo "=== mosquitto_pub cafile ==="
mosquitto_pub -h 127.0.0.1 -p 8883 \
  --cafile /etc/mosquitto/certs/server.crt \
  -u "$MOSQUITTO_USER" -P "$MOSQUITTO_PASS" \
  -t test/ping -m ok-tls -d 2>&1 | tail -40
echo "exit=$?"

echo "=== mosquitto_pub insecure ==="
mosquitto_pub -h 127.0.0.1 -p 8883 --insecure \
  -u "$MOSQUITTO_USER" -P "$MOSQUITTO_PASS" \
  -t test/ping -m ok-tls -d 2>&1 | tail -40
echo "exit=$?"

echo "=== conf ==="
cat /etc/mosquitto/conf.d/peaklogic.conf
tail -20 /var/log/mosquitto/mosquitto.log
