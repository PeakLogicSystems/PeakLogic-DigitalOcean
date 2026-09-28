#!/usr/bin/env bash
# Diagnose PLATFORM_ADMIN_KEY login failures on SaaS (port 3100).
set -euo pipefail

SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"

log() { printf '[diagnose-admin] %s\n' "$*"; }
warn() { printf '[diagnose-admin] WARN: %s\n' "$*" >&2; }

[[ "${EUID:-0}" -eq 0 ]] || { warn "Run as root for full checks (sudo bash $0)"; }

if [[ -f "$SAAS_ENV" ]]; then
  sed -i 's/\r$//' "$SAAS_ENV" 2>/dev/null || true
  log "Canonical env: $SAAS_ENV"
else
  warn "Missing $SAAS_ENV — run install-saas.sh first"
fi

if [[ -f "$INSTALL_DIR/saas.env" ]]; then
  warn "Repo copy exists: $INSTALL_DIR/saas.env — this is NOT used at runtime; edit $SAAS_ENV instead"
fi

if [[ -L "$INSTALL_DIR/.env" ]]; then
  log ".env symlink -> $(readlink -f "$INSTALL_DIR/.env" 2>/dev/null || readlink "$INSTALL_DIR/.env")"
elif [[ -f "$INSTALL_DIR/.env" ]]; then
  warn "$INSTALL_DIR/.env is a regular file (expected symlink to $SAAS_ENV)"
fi

if [[ -f "$SAAS_ENV" ]]; then
  line="$(grep -E '^[[:space:]]*PLATFORM_ADMIN_KEY=' "$SAAS_ENV" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    warn "PLATFORM_ADMIN_KEY not set in $SAAS_ENV"
  else
    val="${line#PLATFORM_ADMIN_KEY=}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    if [[ "$val" =~ ^(REPLACE_WITH_|CHANGE_ME|YOUR_|XXXXX) ]] || [[ "$val" =~ replace_with_openssl_rand ]]; then
      warn "PLATFORM_ADMIN_KEY is still a template placeholder — set a real key:"
      warn "  openssl rand -hex 24"
    else
      log "PLATFORM_ADMIN_KEY length in $SAAS_ENV: ${#val} characters"
    fi
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active peaklogic-saas >/dev/null 2>&1 && log "peaklogic-saas: active" || warn "peaklogic-saas: not active"
fi

if [[ -d "$INSTALL_DIR" ]] && command -v node >/dev/null 2>&1; then
  log "Node config check (as peaklogic user):"
  sudo -u peaklogic bash -lc "cd '$INSTALL_DIR' && node -e \"
    require('./src/loadEnv').loadEnv();
    const cfg = require('./src/config');
    const k = cfg.PLATFORM_ADMIN_KEY || '';
    console.log('  configured:', cfg.isPlatformAdminConfigured());
    console.log('  key length:', k.length);
    console.log('  placeholder:', !k);
  \"" 2>/dev/null || warn "Could not load config from $INSTALL_DIR"
fi

log ""
log "After editing $SAAS_ENV:"
log "  sudo systemctl restart peaklogic-saas"
log "  curl -sf http://127.0.0.1:3100/health && echo OK"
log "Then sign in at /admin/login with the exact key value (no quotes)."
