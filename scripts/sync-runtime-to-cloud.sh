#!/usr/bin/env bash
# Sync est-pc runtime into peaklogic-cloud (bash port of sync-runtime-to-cloud.ps1).
# Used on Linux CI and dev machines without PowerShell.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EST_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUD_ROOT="${1:-${PEAKLOGIC_CLOUD_ROOT:-$(cd "$EST_ROOT/../peaklogic-cloud" 2>/dev/null && pwd || true)}}"

log() { printf '[sync-cloud] %s\n' "$*"; }
die() { printf '[sync-cloud] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d "$CLOUD_ROOT" ]] || die "peaklogic-cloud not found at $CLOUD_ROOT"
[[ -d "$EST_ROOT/src" ]] || die "est-pc src/ missing at $EST_ROOT"

PRESERVE_SRC=(
  server.js config.js api/cloudApp.js loadEnv.js
  db auth
  routes/admin.js routes/adminWeb.js routes/auth.js routes/web.js
  routes/cmms.js routes/cmmsWeb.js routes/users.js
  routes/locations.js routes/locationSystems.js routes/systems.js routes/devices.js
  services tenants cmms web
)

is_preserved() {
  local rel="$1"
  local p
  for p in "${PRESERVE_SRC[@]}"; do
    [[ "$rel" == "$p" || "$rel" == "$p"/* ]] && return 0
  done
  return 1
}

log "est-pc:  $EST_ROOT"
log "cloud:   $CLOUD_ROOT"

# src/*
while IFS= read -r -d '' f; do
  rel="${f#"$EST_ROOT/src/"}"
  if is_preserved "$rel"; then
    log "  keep cloud: src/$rel"
    continue
  fi
  dest="$CLOUD_ROOT/src/$rel"
  mkdir -p "$(dirname "$dest")"
  cp -f "$f" "$dest"
  log "  sync: src/$rel"
done < <(find "$EST_ROOT/src" -type f -print0)

# NOTE: Do NOT delete src/fleet/ here. It is cloud-native (multitenant layer:
# src/routes/teamWeb.js requires ../fleet/floridaCounties and ../fleet/stationTypes)
# and is NOT superseded by the est-pc parc/ sync. Removing it crashes the cloud
# app on boot (Cannot find module '../fleet/floridaCounties'). fleet/ and parc/
# are meant to coexist in the cloud tree.

# Trees
for dir in st firmware config deploy; do
  if [[ -d "$EST_ROOT/$dir" ]]; then
    rm -rf "$CLOUD_ROOT/$dir"
    cp -a "$EST_ROOT/$dir" "$CLOUD_ROOT/$dir"
    log "  sync: $dir/"
  fi
done

# mv-draw
if [[ -d "$EST_ROOT/mv-draw" ]]; then
  rm -rf "$CLOUD_ROOT/mv-draw"
  cp -a "$EST_ROOT/mv-draw" "$CLOUD_ROOT/mv-draw"
  log "  sync: mv-draw/"
fi

# scripts (except seed.js)
mkdir -p "$CLOUD_ROOT/scripts"
for f in "$EST_ROOT/scripts"/*; do
  [[ -f "$f" ]] || continue
  [[ "$(basename "$f")" == "seed.js" ]] && continue
  cp -f "$f" "$CLOUD_ROOT/scripts/$(basename "$f")"
  log "  sync: scripts/$(basename "$f")"
done

# public/
if [[ -d "$EST_ROOT/public" ]]; then
  mkdir -p "$CLOUD_ROOT/public"
  rsync -a "$EST_ROOT/public/" "$CLOUD_ROOT/public/"
  log "  sync: public/"
fi

# data/projects snapshots
if [[ -d "$EST_ROOT/data/projects" ]]; then
  mkdir -p "$CLOUD_ROOT/data/projects"
  cp -f "$EST_ROOT/data/projects/"*.est.json "$CLOUD_ROOT/data/projects/" 2>/dev/null || true
  n="$(find "$CLOUD_ROOT/data/projects" -maxdepth 1 -name '*.est.json' 2>/dev/null | wc -l)"
  log "  sync: data/projects/ ($n snapshots)"
fi

# tests
mkdir -p "$CLOUD_ROOT/test"
for helper in preload-config-memory.js; do
  [[ -f "$EST_ROOT/test/$helper" ]] && cp -f "$EST_ROOT/test/$helper" "$CLOUD_ROOT/test/$helper"
done
KEEP_TESTS=(cloudApi.test.js userProfile.test.js limits.test.js)
for f in "$EST_ROOT/test/"*.test.js; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  for k in "${KEEP_TESTS[@]}"; do
    [[ "$base" == "$k" && -f "$CLOUD_ROOT/test/$base" ]] && continue 2
  done
  cp -f "$f" "$CLOUD_ROOT/test/$base"
  log "  sync: test/$base"
done

# server.js (appliance GUI)
cp -f "$EST_ROOT/server.js" "$CLOUD_ROOT/server.js"
log "  wrote: server.js"

# views (appliance only)
for v in dashboard.ejs layout.ejs io-map.ejs cellular-sims.ejs cloud-sims.ejs mv-draw.ejs; do
  [[ -f "$EST_ROOT/views/$v" ]] && cp -f "$EST_ROOT/views/$v" "$CLOUD_ROOT/views/$v" && log "  sync: views/$v"
done
if [[ -d "$EST_ROOT/views/pages" ]]; then
  rm -rf "$CLOUD_ROOT/views/pages"
  cp -a "$EST_ROOT/views/pages" "$CLOUD_ROOT/views/pages"
  log "  sync: views/pages/"
fi

# Merge package.json deps/scripts with node
node - "$EST_ROOT/package.json" "$CLOUD_ROOT/package.json" <<'NODE'
const fs = require('fs');
const [estPath, cloudPath] = process.argv.slice(2);
const est = JSON.parse(fs.readFileSync(estPath, 'utf8'));
const cloud = JSON.parse(fs.readFileSync(cloudPath, 'utf8'));
cloud.dependencies = cloud.dependencies || {};
for (const [k, v] of Object.entries(est.dependencies || {})) {
  if (!cloud.dependencies[k]) cloud.dependencies[k] = v;
}
const scripts = ['mqtt:start','mqtt:stop','opta-test','test:baseline','green','restart','stop',
  'seed:bundled-projects','generate:assisted-living','generate:mle-wastewater','generate:demo-american-house'];
cloud.scripts = cloud.scripts || {};
for (const s of scripts) {
  if (est.scripts && est.scripts[s]) cloud.scripts[s] = est.scripts[s];
}
fs.writeFileSync(cloudPath, JSON.stringify(cloud, null, 2) + '\n');
NODE
log "  merged: package.json deps/scripts"

log ""
log "Done. In peaklogic-cloud: npm install && npm run test:all"
