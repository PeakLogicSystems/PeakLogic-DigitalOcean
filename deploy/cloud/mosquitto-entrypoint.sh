#!/bin/sh
set -e

CONF="/mosquitto/config/mosquitto.conf"
PASSWD="/mosquitto/config/passwd"
ALLOW_ANON="${MOSQUITTO_ALLOW_ANONYMOUS:-false}"
TLS="${MOSQUITTO_TLS:-false}"
DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
USER="${MOSQUITTO_USER:-}"
PASS="${MOSQUITTO_PASS:-}"

TLS_CERT="/mosquitto/certs/server.crt"
TLS_KEY="/mosquitto/certs/server.key"
TLS_CA="/mosquitto/certs/ca.crt"
TLS_DIR="/mosquitto/config/tls"

if [ "$TLS" = "true" ]; then
  if [ ! -f "$TLS_CERT" ] || [ ! -f "$TLS_KEY" ]; then
    mkdir -p "$TLS_DIR"
    if command -v openssl >/dev/null 2>&1; then
      echo "[mosquitto-entrypoint] Generating self-signed TLS cert for CN=${DOMAIN}" >&2
      openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "${TLS_DIR}/server.key" \
        -out "${TLS_DIR}/server.crt" \
        -days 825 \
        -subj "/CN=${DOMAIN}" \
        >/dev/null 2>&1
      TLS_CERT="${TLS_DIR}/server.crt"
      TLS_KEY="${TLS_DIR}/server.key"
    else
      echo "[mosquitto-entrypoint] MOSQUITTO_TLS=true but no certs and openssl missing" >&2
      TLS="false"
    fi
  fi
fi

cat > "$CONF" <<EOF
persistence true
persistence_location /mosquitto/data/
log_dest stdout
connection_messages true
EOF

if [ "$TLS" = "true" ] && [ -f "$TLS_CERT" ] && [ -f "$TLS_KEY" ]; then
  cat >> "$CONF" <<EOF

listener 8883
certfile $TLS_CERT
keyfile $TLS_KEY
EOF
  if [ -f "$TLS_CA" ]; then
    echo "cafile $TLS_CA" >> "$CONF"
  fi
  if [ "$ALLOW_ANON" = "true" ]; then
    echo "allow_anonymous true" >> "$CONF"
  else
    echo "allow_anonymous false" >> "$CONF"
    if [ -n "$USER" ] && [ -n "$PASS" ]; then
      mosquitto_passwd -b -c "$PASSWD" "$USER" "$PASS"
      echo "password_file $PASSWD" >> "$CONF"
    fi
  fi
fi

cat >> "$CONF" <<EOF

listener 1883
EOF

if [ "$ALLOW_ANON" = "true" ]; then
  echo "allow_anonymous true" >> "$CONF"
else
  echo "allow_anonymous false" >> "$CONF"
  if [ -n "$USER" ] && [ -n "$PASS" ]; then
    if [ ! -f "$PASSWD" ]; then
      mosquitto_passwd -b -c "$PASSWD" "$USER" "$PASS"
    fi
    echo "password_file $PASSWD" >> "$CONF"
  else
    echo "[mosquitto-entrypoint] MOSQUITTO_ALLOW_ANONYMOUS=false but MOSQUITTO_USER/PASS unset — clients cannot connect" >&2
  fi
fi

exec /usr/sbin/mosquitto -c "$CONF"
