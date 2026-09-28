#!/usr/bin/env bash
# Restore cloud-1-saas-nyc1 code files known to differ from 8.13 bundle baseline.
set -euo pipefail

INSTALL_DIR="${PEAKLOGIC_INSTALL_DIR:-/home/peaklogic}"
BACKUP_DIR="/tmp/peaklogic-pre-813-repair-$(date +%Y%m%d%H%M%S)"

log() { printf '[repair-813] %s\n' "$*"; }

log "Backing up suspect files to $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
for f in st/program.st public/js/hmi.js public/js/hmiSetupUi.js views/dashboard.ejs public/css/pc.css; do
  if [[ -f "$INSTALL_DIR/$f" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    cp -a "$INSTALL_DIR/$f" "$BACKUP_DIR/$f"
  fi
done

log "Fix st/program.st (was corrupted fragment TurnON(Q);)"
cat > "$INSTALL_DIR/st/program.st" <<'EOF'
(* no active *)
EOF
chown peaklogic:peaklogic "$INSTALL_DIR/st/program.st"

log "Ensure putnam fleet rollup ST exists (cloud bundle baseline)"
if [[ ! -f "$INSTALL_DIR/st/logic/putnam_fleet_rollup.st" ]]; then
  log "WARNING: missing st/logic/putnam_fleet_rollup.st — redeploy 8.13 bundle"
fi

log "Reset runtime activeProgram if stuck on local putnam-county dev project"
SETTINGS="/var/lib/peaklogic/settings.json"
if [[ -f "$SETTINGS" ]]; then
  python3 - <<'PY'
import json
from pathlib import Path
p = Path("/var/lib/peaklogic/settings.json")
s = json.loads(p.read_text())
proj = ((s.get("project") or {}).get("name") or "").strip()
active = (s.get("activeProgram") or "").strip()
changed = False
if proj == "putnam-county" or active == "logic/putnam_county_combined.st":
    s["activeProgram"] = "logic/putnam_fleet_rollup.st"
    s.setdefault("project", {})["name"] = "putnam-county-cloud"
    changed = True
    print("reset activeProgram -> logic/putnam_fleet_rollup.st")
    print("reset project.name -> putnam-county-cloud")
elif not active or active == "program.st":
    s["activeProgram"] = "logic/putnam_fleet_rollup.st"
    changed = True
    print("set activeProgram -> logic/putnam_fleet_rollup.st")
if changed:
    p.write_text(json.dumps(s, indent=2) + "\n")
    print("updated", p)
else:
    print("settings unchanged:", "project=", proj, "activeProgram=", active)
PY
  chown peaklogic:peaklogic "$SETTINGS" 2>/dev/null || true
fi

log "Current checksums"
md5sum \
  "$INSTALL_DIR/st/program.st" \
  "$INSTALL_DIR/server.js" \
  "$INSTALL_DIR/public/js/hmi.js" \
  "$INSTALL_DIR/public/js/hmiSetupUi.js" \
  "$INSTALL_DIR/views/dashboard.ejs" \
  "$INSTALL_DIR/public/css/pc.css" \
  "$INSTALL_DIR/package.json" 2>/dev/null || true

log "Runtime data snapshot"
if [[ -f /var/lib/peaklogic/settings.json ]]; then
  python3 - <<'PY'
import json
for path in ("/var/lib/peaklogic/settings.json",):
    try:
        s = json.load(open(path))
        print("activeProgram:", s.get("activeProgram"))
        print("project:", (s.get("project") or {}).get("name"))
    except Exception as e:
        print(path, e)
PY
fi
wc -c /var/lib/peaklogic/project.est.json 2>/dev/null || true

log "Restart peaklogic-saas"
systemctl restart peaklogic-saas
sleep 2
curl -sf "http://127.0.0.1:3100/health" | python3 -m json.tool || curl -sf "http://127.0.0.1:3100/health" || true

log "Done. If programOk is still false, redeploy peaklogic-cloud-20260813d.tgz bundle."
