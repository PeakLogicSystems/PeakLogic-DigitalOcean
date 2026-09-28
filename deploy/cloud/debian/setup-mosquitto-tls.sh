#!/usr/bin/env bash
# Install TLS cert/key for Mosquitto MQTT listener (8883).
# Uses Let's Encrypt paths when present; otherwise generates a self-signed cert.
set -euo pipefail

CERT_DIR="${MOSQUITTO_CERT_DIR:-/etc/mosquitto/certs}"
DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
LE_DIR="/etc/letsencrypt/live/${DOMAIN}"
DAYS="${MOSQUITTO_TLS_SELF_SIGNED_DAYS:-825}"

log() { echo "[setup-mosquitto-tls] $*"; }

install -d -m 0750 -o root -g mosquitto "$CERT_DIR"

if [[ -f "${LE_DIR}/fullchain.pem" && -f "${LE_DIR}/privkey.pem" ]]; then
  log "Using Let's Encrypt cert for ${DOMAIN}"
  install -m 0644 -o root -g mosquitto "${LE_DIR}/fullchain.pem" "${CERT_DIR}/server.crt"
  install -m 0640 -o root -g mosquitto "${LE_DIR}/privkey.pem" "${CERT_DIR}/server.key"
  if [[ -f "${LE_DIR}/chain.pem" ]]; then
    install -m 0644 -o root -g mosquitto "${LE_DIR}/chain.pem" "${CERT_DIR}/ca.crt"
  fi
else
  log "Generating self-signed MQTT cert for CN=${DOMAIN} (${DAYS} days)"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${CERT_DIR}/server.key" \
    -out "${CERT_DIR}/server.crt" \
    -days "$DAYS" \
    -subj "/CN=${DOMAIN}" \
    >/dev/null 2>&1
  chown root:mosquitto "${CERT_DIR}/server.key" "${CERT_DIR}/server.crt"
  chmod 0640 "${CERT_DIR}/server.key"
  chmod 0644 "${CERT_DIR}/server.crt"
fi

log "TLS material ready in ${CERT_DIR}"
