#!/usr/bin/env bash
# PeakLogic Phase 1 ATL — remote install (archive | mqtt | saas | finish | verify)
# Invoked by scripts/deploy-phase1-atl-mqtt.ps1 over SSH.
#
#   PHASE1_DEPLOY_ENV=/etc/peaklogic/phase1-deploy.env \
#   PHASE1_BUNDLE=/tmp/peaklogic-cloud-YYYYMMDDd.tgz \
#     bash phase1-remote-install.sh saas
set -euo pipefail

ROLE="${1:-}"
DEPLOY_ENV="${PHASE1_DEPLOY_ENV:-/etc/peaklogic/phase1-deploy.env}"
BUNDLE="${PHASE1_BUNDLE:-}"

log() { printf '[phase1-remote] %s\n' "$*"; }
die() { printf '[phase1-remote] ERROR: %s\n' "$*" >&2; exit 1; }

strip_crlf() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if grep -q $'\r' "$f" 2>/dev/null; then sed -i 's/\r$//' "$f"; fi
}

detect_private_ip() {
  ip -4 addr show 2>/dev/null | awk '/inet 10\./ {print $2}' | head -1 | cut -d/ -f1
}

[[ -n "$ROLE" ]] || die "Usage: $0 archive|mqtt|saas|finish|verify"
[[ -f "$DEPLOY_ENV" ]] || die "Missing $DEPLOY_ENV"
strip_crlf "$DEPLOY_ENV"
# shellcheck disable=SC1090
set -a
source "$DEPLOY_ENV"
set +a

MONGODB_DB="${MONGODB_DB:-peaklogic_cloud}"
MOSQUITTO_USER="${MOSQUITTO_USER:-peaklogic}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/data/archive}"
PEAKLOGIC_DOMAIN="${PEAKLOGIC_DOMAIN:-peaklogic.io}"
MQTT_DOMAIN="${MQTT_DOMAIN:-mqtt.peaklogic.io}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@peaklogic.io}"
RUN_MQTT_CERTBOT="${RUN_MQTT_CERTBOT:-true}"
RUN_SAAS_CERTBOT="${RUN_SAAS_CERTBOT:-false}"

require_var() {
  local name="$1" val="${!1:-}"
  [[ -n "$val" ]] || die "Set $name in $DEPLOY_ENV"
  [[ "$val" != CHANGE_ME* ]] || die "Replace placeholder for $name in $DEPLOY_ENV"
}

extract_saas_bundle() {
  local dest="$1"
  [[ -n "$BUNDLE" && -f "$BUNDLE" ]] || die "Set PHASE1_BUNDLE to peaklogic-cloud-*d.tgz on this host"
  install -d -m 0755 "$dest"
  log "Extracting $BUNDLE → $dest"
  tar xzf "$BUNDLE" -C "$dest" --strip-components=1
}

extract_archive_bundle() {
  local dest="$1"
  [[ -n "$BUNDLE" && -f "$BUNDLE" ]] || die "Set PHASE1_BUNDLE to peaklogic-archive-*.tgz on this host"
  install -d -m 0755 "$dest"
  log "Extracting $BUNDLE → $dest"
  tar xzf "$BUNDLE" -C "$dest" --strip-components=1
}

write_archive_env() {
  require_var ARCHIVE_SERVER_TOKEN
  install -d -m 0750 -o root -g peaklogic /etc/peaklogic 2>/dev/null || install -d -m 0750 /etc/peaklogic
  cat > /etc/peaklogic/archive.env <<EOF
PORT=8090
ARCHIVE_ROOT=${ARCHIVE_ROOT}
ARCHIVE_SERVER_TOKEN=${ARCHIVE_SERVER_TOKEN}
EOF
  chmod 0640 /etc/peaklogic/archive.env
  chown root:peaklogic /etc/peaklogic/archive.env 2>/dev/null || true
}

write_mqtt_env() {
  require_var MOSQUITTO_PASS
  install -d -m 0750 /etc/peaklogic
  cat > /etc/peaklogic/mqtt.env <<EOF
PEAKLOGIC_DOMAIN=${MQTT_DOMAIN}
MOSQUITTO_ALLOW_ANONYMOUS=false
MOSQUITTO_USER=${MOSQUITTO_USER}
MOSQUITTO_PASS=${MOSQUITTO_PASS}
MOSQUITTO_TLS=true
MOSQUITTO_TLS_PORT=8883
EOF
  chmod 0640 /etc/peaklogic/mqtt.env
}

write_saas_env() {
  require_var MONGODB_URI
  require_var JWT_SECRET
  require_var PLATFORM_ADMIN_KEY
  require_var PUBLIC_APP_URL
  require_var PUBLIC_API_URL
  install -d -m 0750 -o root -g peaklogic /etc/peaklogic 2>/dev/null || install -d -m 0750 /etc/peaklogic
  cat > /etc/peaklogic/saas.env <<EOF
PORT=3100
NODE_ENV=production
PEAKLOGIC_DEPLOYMENT=cloud
PEAKLOGIC_PRODUCT=cloud
PEAKLOGIC_DATA=/var/lib/peaklogic

MONGODB_URI=${MONGODB_URI}
MONGODB_DB=${MONGODB_DB}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-7d}
PLATFORM_ADMIN_KEY=${PLATFORM_ADMIN_KEY}

PUBLIC_APP_URL=${PUBLIC_APP_URL}
PUBLIC_API_URL=${PUBLIC_API_URL}
EOF
  chmod 0640 /etc/peaklogic/saas.env
  chown root:peaklogic /etc/peaklogic/saas.env 2>/dev/null || true
}

write_archive_compact_env() {
  require_var ARCHIVE_SERVER_TOKEN
  require_var ARCHIVE_PRIVATE_IP
  install -d -m 0750 -o root -g peaklogic /etc/peaklogic 2>/dev/null || install -d -m 0750 /etc/peaklogic
  cat > /etc/peaklogic/archive-compact.env <<EOF
MONGODB_DB=${MONGODB_DB}
MONGODB_COLLECTION=tag_logs
ARCHIVE_SERVER_URL=http://${ARCHIVE_PRIVATE_IP}:8090
ARCHIVE_SERVER_TOKEN=${ARCHIVE_SERVER_TOKEN}
ARCHIVE_COMPACT_DRY_RUN=0
ARCHIVE_ZSTD_LEVEL=3
ZSTD_BIN=zstd
EOF
  chmod 0640 /etc/peaklogic/archive-compact.env
  chown root:peaklogic /etc/peaklogic/archive-compact.env 2>/dev/null || true
}

role_archive() {
  local dir="${PEAKLOGIC_ARCHIVE_DIR:-/opt/peaklogic-archive}"
  extract_archive_bundle "$dir"
  write_archive_env
  PEAKLOGIC_SOURCE="$dir" PEAKLOGIC_ARCHIVE_DIR="$dir" PEAKLOGIC_ARCHIVE_ENV=/etc/peaklogic/archive.env \
    bash "$dir/deploy/cloud/debian/install-archive.sh"
  local priv="${ARCHIVE_PRIVATE_IP:-$(detect_private_ip)}"
  [[ -n "$priv" ]] || die "Could not detect archive private IP — set ARCHIVE_PRIVATE_IP in deploy env"
  curl -sf "http://127.0.0.1:8090/health" >/dev/null || die "Archive health check failed"
  log "ARCHIVE_PRIVATE_IP=${priv}"
  echo "PHASE1_RESULT_ARCHIVE_PRIVATE_IP=${priv}"
}

role_mqtt() {
  local dir="${PEAKLOGIC_MQTT_DIR:-/opt/peaklogic-mqtt}"
  extract_saas_bundle "$dir"
  write_mqtt_env
  if [[ "$RUN_MQTT_CERTBOT" == "true" ]]; then
    if [[ ! -f "/etc/letsencrypt/live/${MQTT_DOMAIN}/fullchain.pem" ]]; then
      log "Running certbot for ${MQTT_DOMAIN} (requires DNS A record → this droplet)"
      systemctl stop mosquitto 2>/dev/null || true
      certbot certonly --standalone -d "$MQTT_DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" \
        || die "certbot failed — point DNS ${MQTT_DOMAIN} to this host or set RUN_MQTT_CERTBOT=false"
    fi
  fi
  PEAKLOGIC_INSTALL_DIR="$dir" PEAKLOGIC_MQTT_ENV=/etc/peaklogic/mqtt.env \
    bash "$dir/deploy/cloud/debian/install-mqtt-droplet.sh"
  require_var MOSQUITTO_PASS
  mosquitto_pub -h 127.0.0.1 -u "$MOSQUITTO_USER" -P "$MOSQUITTO_PASS" -t phase1/ping -m ok \
    || die "mosquitto_pub local test failed"
  local priv="${MQTT_PRIVATE_IP:-$(detect_private_ip)}"
  [[ -n "$priv" ]] || die "Could not detect MQTT private IP"
  log "MQTT_PRIVATE_IP=${priv}"
  echo "PHASE1_RESULT_MQTT_PRIVATE_IP=${priv}"
}

role_saas() {
  local dir="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
  extract_saas_bundle "$dir"
  write_saas_env
  PEAKLOGIC_SOURCE="$dir" PEAKLOGIC_INSTALL_DIR="$dir" PEAKLOGIC_SAAS_ENV=/etc/peaklogic/saas.env \
    bash "$dir/deploy/cloud/debian/install-saas.sh"
  sudo -u peaklogic bash -lc "cd '$dir' && npm run seed" || log "seed warning (may already exist)"
  curl -sf "http://127.0.0.1:3100/health" >/dev/null || die "SaaS health check failed"
  if [[ "$RUN_SAAS_CERTBOT" == "true" ]]; then
    certbot --nginx -d "$PEAKLOGIC_DOMAIN" -d "www.${PEAKLOGIC_DOMAIN}" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" \
      || log "certbot nginx warning — set RUN_SAAS_CERTBOT=false until DNS cutover"
  fi
  log "SaaS install complete"
}

role_finish() {
  require_var MQTT_PRIVATE_IP
  require_var ARCHIVE_PRIVATE_IP
  local dir="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
  [[ -d "$dir" ]] || die "SaaS not installed at $dir — run saas role first"
  PEAKLOGIC_MQTT_PRIVATE_IP="$MQTT_PRIVATE_IP" PEAKLOGIC_SAAS_ENV=/etc/peaklogic/saas.env \
    bash "$dir/deploy/cloud/debian/configure-saas-mqtt-remote.sh"
  write_archive_compact_env
  PEAKLOGIC_INSTALL_DIR="$dir" PEAKLOGIC_ARCHIVE_COMPACT_ENV=/etc/peaklogic/archive-compact.env \
    bash "$dir/deploy/cloud/debian/enable-phase1-archive-compact.sh"
  sudo -u peaklogic bash -lc "cd '$dir' && ARCHIVE_COMPACT_DRY_RUN=1 node scripts/run-archive-compact.js" \
    || log "compact dry-run warning — check Mongo allowlist on SaaS public IP"
  systemctl is-active --quiet mosquitto 2>/dev/null && die "Local mosquitto still active on SaaS — should be disabled"
  log "Finish complete — mqtt://${MQTT_PRIVATE_IP}:1883 field mqtts://${MQTT_DOMAIN}:8883"
}

role_verify() {
  curl -sf "http://127.0.0.1:3100/health" && log "SaaS :3100 health OK" || die "SaaS health fail"
  if [[ -n "${ARCHIVE_PRIVATE_IP:-}" ]]; then
    curl -sf "http://${ARCHIVE_PRIVATE_IP}:8090/health" && log "Archive VPC health OK" || log "Archive VPC health FAIL"
  fi
  grep -q PEAKLOGIC_MQTT_BROKER /etc/peaklogic/saas.env && log "SaaS MQTT broker configured"
  systemctl is-active peaklogic-saas >/dev/null && log "peaklogic-saas active"
  systemctl list-timers 2>/dev/null | grep -q archive-compact && log "archive-compact timer present"
}

case "$ROLE" in
  archive) role_archive ;;
  mqtt) role_mqtt ;;
  saas) role_saas ;;
  finish) role_finish ;;
  verify) role_verify ;;
  *) die "Unknown role: $ROLE" ;;
esac
