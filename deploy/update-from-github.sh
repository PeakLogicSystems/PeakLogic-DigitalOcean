#!/usr/bin/env bash
# PeakLogic — pull updates from GitHub (git clone/pull or release tarball).
# Replaces WinSCP / manual bundle transfer for cloud droplets and IOT-LINK appliances.
#
# Examples (run on the target host as root):
#   sudo bash deploy/update-from-github.sh
#   sudo bash deploy/update-from-github.sh --release v2.3.9
#   sudo PEAKLOGIC_GITHUB_REPO=RoyMooreACE/peaklogic-cloud bash deploy/update-from-github.sh
#   sudo PEAKLOGIC_INSTALL_DIR=/opt/peaklogic bash deploy/update-from-github.sh
#
# Dev machine (push then remote pull):
#   powershell -File scripts/publish-update.ps1
#   ssh root@peaklogic-cloud 'sudo bash /home/peaklogic/deploy/update-from-github.sh'
#
if grep -q $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r$//' "$0"
  exec bash "$0" "$@"
fi
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-}"
ENV_FILE="${PEAKLOGIC_ENV_FILE:-/etc/peaklogic/env}"
SAAS_ENV="${PEAKLOGIC_SAAS_ENV:-/etc/peaklogic/saas.env}"
DATA_DIR="${PEAKLOGIC_DATA_DIR:-/var/lib/peaklogic}"
SERVICE_USER="${PEAKLOGIC_USER:-peaklogic}"
GITHUB_REPO="${PEAKLOGIC_GITHUB_REPO:-}"
GITHUB_BRANCH="${PEAKLOGIC_GITHUB_BRANCH:-main}"
RELEASE_REPO="${PEAKLOGIC_RELEASE_REPO:-RoyMooreACE/peaklogic-pc}"
GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
MODE="git"
RELEASE_TAG=""
DRY_RUN=0

log() { printf '[peaklogic-update] %s\n' "$*"; }
die() { printf '[peaklogic-update] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: update-from-github.sh [options]

  --git                 Pull latest from GitHub (default)
  --release TAG         Download GitHub Release asset (e.g. v2.3.9 or 2.3.9)
  --repo OWNER/NAME     GitHub repo (overrides PEAKLOGIC_GITHUB_REPO)
  --branch NAME         Git branch (default: main)
  --install-dir PATH    Install root (auto-detected if omitted)
  --dry-run             Show actions without changing files
  -h, --help            Show this help

Environment:
  PEAKLOGIC_INSTALL_DIR   /home/peaklogic (cloud) or /opt/peaklogic (appliance)
  PEAKLOGIC_GITHUB_REPO   RoyMooreACE/peaklogic-cloud or .../peaklogic-pc
  PEAKLOGIC_RELEASE_REPO  Repo with Release assets (default: RoyMooreACE/peaklogic-pc)
  PEAKLOGIC_GITHUB_BRANCH main
  GITHUB_TOKEN            Optional — private repos or higher API rate limits

Targets auto-detect from install dir:
  cloud      peaklogic-cloud multitenant stack
  appliance  est-pc (server.js at repo root)
  est        embedded runtime (src/server.js, peaklogic-runtime)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --git) MODE="git"; shift ;;
    --release) MODE="release"; RELEASE_TAG="${2:-}"; shift 2 ;;
    --repo) GITHUB_REPO="$2"; shift 2 ;;
    --branch) GITHUB_BRANCH="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

detect_install_dir() {
  if [[ -n "$INSTALL_DIR" ]]; then
    return 0
  fi
  for candidate in /home/peaklogic /opt/peaklogic "$(cd "$SCRIPT_DIR/.." && pwd)"; do
    if [[ -f "$candidate/package.json" ]]; then
      INSTALL_DIR="$candidate"
      return 0
    fi
  done
  die "Could not detect install dir — set PEAKLOGIC_INSTALL_DIR"
}

detect_target() {
  if [[ -f "$INSTALL_DIR/src/server.js" ]] && {
    [[ -f "$INSTALL_DIR/src/api/cloudApp.js" ]] ||
    [[ -d "$INSTALL_DIR/src/tenants" ]] ||
    grep -q '"name"[[:space:]]*:[[:space:]]*"peaklogic-cloud"' "$INSTALL_DIR/package.json" 2>/dev/null
  }; then
    TARGET="cloud"
    [[ -n "$GITHUB_REPO" ]] || GITHUB_REPO="${PEAKLOGIC_GITHUB_REPO:-RoyMooreACE/peaklogic-cloud}"
    [[ -n "${PEAKLOGIC_SERVICE:-}" ]] || PEAKLOGIC_SERVICE="peaklogic-saas"
    return 0
  fi
  if [[ -f "$INSTALL_DIR/server.js" ]]; then
    TARGET="appliance"
    [[ -n "$GITHUB_REPO" ]] || GITHUB_REPO="${PEAKLOGIC_GITHUB_REPO:-RoyMooreACE/peaklogic-pc}"
    [[ -n "${PEAKLOGIC_SERVICE:-}" ]] || PEAKLOGIC_SERVICE="auto"
    return 0
  fi
  if [[ -f "$INSTALL_DIR/src/server.js" ]]; then
    TARGET="est"
    [[ -n "$GITHUB_REPO" ]] || GITHUB_REPO="${PEAKLOGIC_GITHUB_REPO:-RoyMooreACE/peaklogic-est}"
    [[ -n "${PEAKLOGIC_SERVICE:-}" ]] || PEAKLOGIC_SERVICE="peaklogic-runtime"
    return 0
  fi
  die "Unrecognized PeakLogic install at $INSTALL_DIR"
}

strip_crlf_tree() {
  local root="$1"
  find "$root" -type f \( -name '*.sh' -o -name '*.service' -o -name '.env*' \) -print0 2>/dev/null \
    | while IFS= read -r -d '' f; do
        if grep -q $'\r' "$f" 2>/dev/null; then
          sed -i 's/\r$//' "$f"
        fi
      done
}

detect_service() {
  local unit="${PEAKLOGIC_SERVICE:-}"
  if [[ "$unit" == "auto" || -z "$unit" ]]; then
    for candidate in peaklogic-iot-link-generic peaklogic-iot-link peaklogic-saas peaklogic peaklogic-mvp-suite peaklogic-runtime; do
      if systemctl list-unit-files "${candidate}.service" 2>/dev/null | grep -qE '^[^ ]+'; then
        if systemctl is-enabled "${candidate}.service" &>/dev/null || systemctl cat "${candidate}.service" &>/dev/null; then
          unit="$candidate"
          break
        fi
      fi
    done
  fi
  printf '%s' "$unit"
}

stop_service() {
  local unit="$1"
  [[ -z "$unit" ]] && return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] systemctl stop $unit"
    return 0
  fi
  log "Stopping $unit…"
  systemctl stop "$unit" 2>/dev/null || true
}

start_service() {
  local unit="$1"
  [[ -z "$unit" ]] && return 0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] systemctl start $unit"
    return 0
  fi
  log "Starting $unit…"
  systemctl daemon-reload 2>/dev/null || true
  systemctl start "$unit"
  sleep 2
  if systemctl is-active --quiet "$unit"; then
    log "Service active: $unit"
  else
    log "Warning: $unit not active — journalctl -u $unit -n 40"
  fi
}

run_npm_ci() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] npm ci --omit=dev in $INSTALL_DIR"
    return 0
  fi
  log "Installing npm dependencies…"
  cd "$INSTALL_DIR"
  if id "$SERVICE_USER" &>/dev/null; then
    sudo -u "$SERVICE_USER" env HOME="$DATA_DIR" npm ci --omit=dev
  else
    npm ci --omit=dev
  fi
}

rsync_preserve() {
  local src="$1"
  local dest="$2"
  local excludes=(
    --exclude node_modules/
    --exclude .git/
    --exclude data/
    --exclude .env
    --exclude dist/
    --exclude products/
    --exclude azure/
  )
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] rsync ${excludes[*]} $src/ → $dest/"
    return 0
  fi
  rsync -a --delete "${excludes[@]}" "$src/" "$dest/"
}

git_auth_header() {
  if [[ -n "$GITHUB_TOKEN" ]]; then
    printf 'Authorization: Bearer %s' "$GITHUB_TOKEN"
  fi
}

update_git() {
  local clone_url="https://github.com/${GITHUB_REPO}.git"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  log "Fetching $GITHUB_REPO @ $GITHUB_BRANCH …"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] git clone --depth 1 --branch $GITHUB_BRANCH $clone_url"
    return 0
  fi

  if [[ -n "$GITHUB_TOKEN" ]]; then
    clone_url="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
  fi

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Git pull in $INSTALL_DIR …"
    cd "$INSTALL_DIR"
    if [[ -n "$GITHUB_TOKEN" ]]; then
      git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git" 2>/dev/null || true
    fi
    git fetch origin "$GITHUB_BRANCH" --depth 1
    git checkout "$GITHUB_BRANCH" 2>/dev/null || git checkout -B "$GITHUB_BRANCH" "origin/$GITHUB_BRANCH"
    git reset --hard "origin/$GITHUB_BRANCH"
  else
    log "Cloning into staging (tarball install → git track)…"
    git clone --depth 1 --branch "$GITHUB_BRANCH" "$clone_url" "$tmp/src"
    rsync_preserve "$tmp/src" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    git init -q
    git remote add origin "https://github.com/${GITHUB_REPO}.git"
    git fetch origin "$GITHUB_BRANCH" --depth 1
    git checkout -B "$GITHUB_BRANCH" "origin/$GITHUB_BRANCH" 2>/dev/null || true
  fi
}

release_asset_name() {
  case "$TARGET" in
    cloud) printf 'peaklogic-cloud-%s.tgz' "$1" ;;
    appliance) printf 'peaklogic-appliance-%s.tgz' "$1" ;;
    est) printf 'peaklogic-est-%s.tgz' "$1" ;;
    *) die "Unknown target for release: $TARGET" ;;
  esac
}

update_release() {
  local tag="$RELEASE_TAG"
  [[ -z "$tag" ]] && die "--release requires a tag (e.g. v2.3.9)"
  tag="${tag#v}"
  local version_tag="v${tag}"
  local asset
  asset="$(release_asset_name "$tag")"
  local api="https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${version_tag}"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  log "Resolving release $version_tag ($asset) …"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] download $api → extract to $INSTALL_DIR"
    return 0
  fi

  local curl_args=(-fsSL)
  if [[ -n "$GITHUB_TOKEN" ]]; then
    curl_args+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  local asset_url
  asset_url="$(curl "${curl_args[@]}" "$api" | grep -o "\"browser_download_url\": \"[^\"]*${asset}[^\"]*\"" | head -1 | sed 's/.*: "\(.*\)"/\1/')"
  if [[ -z "$asset_url" ]]; then
    die "Release asset not found: $asset at $api"
  fi

  log "Downloading $asset_url …"
  curl "${curl_args[@]}" -L "$asset_url" -o "$tmp/$asset"

  local stage="$tmp/stage"
  mkdir -p "$stage"
  tar -xzf "$tmp/$asset" -C "$stage"
  local inner
  inner="$(find "$stage" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -n "$inner" ]] || die "Empty release archive"
  rsync_preserve "$inner" "$INSTALL_DIR"
}

# --- main ---
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  die "Run as root: sudo bash $0"
fi

detect_install_dir
detect_target
SERVICE="$(detect_service)"

log "Target:    $TARGET"
log "Install:   $INSTALL_DIR"
log "Repo:      $GITHUB_REPO"
log "Branch:    $GITHUB_BRANCH"
log "Mode:      $MODE"
[[ -n "$SERVICE" ]] && log "Service:   $SERVICE"

stop_service "$SERVICE"

case "$MODE" in
  git) update_git ;;
  release) update_release ;;
  *) die "Unknown mode: $MODE" ;;
esac

if [[ "$DRY_RUN" -eq 0 ]]; then
  strip_crlf_tree "$INSTALL_DIR"
  run_npm_ci
  usermod -aG dialout "$SERVICE_USER" 2>/dev/null || true
fi

start_service "$SERVICE"

case "$TARGET" in
  cloud)
    log "Cloud API: curl -sS http://127.0.0.1:3100/health"
    log "SaaS env:  $SAAS_ENV (unchanged)"
    ;;
  appliance)
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    log "Studio: http://${IP:-127.0.0.1}:3090"
    log "Env:    $ENV_FILE (unchanged)"
    ;;
  est)
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    log "Runtime: http://${IP:-127.0.0.1}:3080"
    log "Data:   $DATA_DIR (unchanged)"
    ;;
esac

log "Done."
