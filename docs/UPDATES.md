# PeakLogic updates (no WinSCP)

One workflow: **push from your PC → pull on the target**. GitHub is the transfer layer.

| Repo | Folder | Deploy target |
|------|--------|---------------|
| `peaklogic-pc` | `est-pc/` | MVP Suite, IoT-Link, **Cloud SaaS** (`/opt/peaklogic` or `/home/peaklogic`) |
| `peaklogic-est` | `est/` | Embedded Linux / OpenWrt (`/opt/peaklogic`) |
| `peaklogic-docs` | `peaklogic-docs/` | Documentation only (no runtime) |

**Cloud SaaS** ships from **est-pc** (`npm run start:saas`, port **3100**) — not a separate application repo. Build production bundles with `scripts/create-saas-bundle.ps1`; install with `docs/CLOUD_DEPLOY_DO.md`.

## Dev machine (Windows)

From `est-pc`:

```powershell
cd C:\Users\public\data\est-pc
npm run green
git push origin main
cursaves sync    # optional: sync Cursor chats before switching PCs
```

### Second dev PC (MV-workstation)

Copy data and sync Cursor chats between home PC and **MV-workstation** (`192.168.1.76`):

```powershell
# Home PC
cd C:\Users\Public\data\est-pc\scripts
.\push-data-to-mv-workstation.ps1

# MV-workstation (PowerShell outside Cursor)
cd C:\data\est-pc\scripts
.\mv-workstation-cursaves-sync.ps1
```

Daily on either machine before switching: `cd` to your `est-pc` folder, run `cursaves sync`, fully quit Cursor. Full runbook: **`docs/MV-WORKSTATION-CURSAVES.md`**.


Optional — push and pull on a droplet in one step:

```powershell
powershell -File scripts/publish-update.ps1 -RemoteUpdate root@YOUR_DROPLET_IP
```

For embedded `est/`:

```powershell
cd C:\Users\public\data\est
npm test
git push origin main
```

Refresh the public docs repo after marketing/training edits:

```powershell
cd C:\Users\public\data\peaklogic-docs
powershell -File scripts\sync-from-sources.ps1
git add content/; git commit -m "Sync docs"; git push
```

## Target host (Linux)

All targets use the same script (preserves `data/`, `/etc/peaklogic/*`, restarts systemd):

```bash
sudo bash deploy/update-from-github.sh
```

### Cloud droplet (`/home/peaklogic`)

First-time: `deploy/cloud/debian/install-saas.sh` (see `docs/CLOUD_DEPLOY_DO.md`).

Updates:

```bash
ssh root@YOUR_DROPLET_IP
sudo bash /home/peaklogic/deploy/update-from-github.sh
```

Defaults: repo `peaklogic/peaklogic-pc`, service `peaklogic-saas` (port 3100).

### IOT-LINK / appliance (`/opt/peaklogic`)

```bash
ssh root@<gateway-ip>
sudo PEAKLOGIC_INSTALL_DIR=/opt/peaklogic bash /opt/peaklogic/deploy/update-from-github.sh
```

Defaults: repo `peaklogic/peaklogic-pc`.

### Embedded `est` (`/opt/peaklogic`, port 3080)

```bash
ssh root@<device>
sudo bash /opt/peaklogic/deploy/update-from-github.sh
```

Defaults: repo `peaklogic/peaklogic-est`, service `peaklogic-runtime`.

Override repo/branch:

```bash
sudo PEAKLOGIC_GITHUB_REPO=YourOrg/peaklogic-pc \
     PEAKLOGIC_GITHUB_BRANCH=main \
     bash deploy/update-from-github.sh
```

## Tagged releases (optional)

Tag `est-pc` on GitHub — Actions build and attach bundles:

```powershell
cd C:\Users\public\data\est-pc
git tag v2.3.9
git push origin v2.3.9
```

On a target without git (or pinned version):

```bash
sudo bash deploy/update-from-github.sh --release v2.3.9
```

Assets: `peaklogic-appliance-<ver>.tgz`, `peaklogic-saas-<ver>.tgz`, `peaklogic-est-<ver>.tgz`.

## One-time: convert tarball install → git pull

If the host was installed from a `.tgz` (no `.git` yet), the update script clones from GitHub, rsyncs code over the install dir (keeps `data/`), then tracks git for future pulls.

## GitHub setup

1. Push `est-pc` → `peaklogic/peaklogic-pc`
2. Push `est` → `peaklogic/peaklogic-est`
3. Push docs → `peaklogic/peaklogic-docs` (optional, for distribution)
4. On each server, clone once **or** run update script after first tarball install

## Legacy note

Older workflows used a separate **`peaklogic-cloud`** fork and `scripts/sync-runtime-to-cloud.ps1`. That path is **deprecated** — Cloud SaaS is built from **est-pc**. `publish-update.ps1` still calls the sync script only if a sibling `peaklogic-cloud/` folder exists on your dev PC.

## What this replaces

| Old | New |
|-----|-----|
| WinSCP bundle upload | `git push` + `update-from-github.sh` on host |
| Separate cloud repo push | Single `peaklogic-pc` push; SaaS bundle from `create-saas-bundle.ps1` |
| USB / sneakernet | SSH + git pull (or `--release`) |

Keep `create-saas-bundle.ps1` output for air-gapped cloud installs only.

## Troubleshooting

```bash
# Cloud health
curl -sS http://127.0.0.1:3100/health

# Service logs
journalctl -u peaklogic-saas -n 50 --no-pager
journalctl -u peaklogic-iot-link-generic -n 50 --no-pager

# Dry run
sudo bash deploy/update-from-github.sh --dry-run
```

Private repo on target: `export GITHUB_TOKEN=ghp_...` before running update (read-only token is enough).
