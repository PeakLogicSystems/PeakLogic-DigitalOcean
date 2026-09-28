# MV-workstation and Cursor chat sync (cursaves)

Second Windows PC setup for PeakLogic development with **Cursor chat history** synced between machines via a private GitHub repo.

## Overview

| Item | Value |
|------|--------|
| Workstation | **MV-workstation** (`192.168.1.76`) |
| Data path (workstation) | `C:\data\est-pc` |
| Data path (home PC) | `C:\Users\Public\data\est-pc` |
| Windows file share | `\\192.168.1.76\workbox` — user **`roy`** |
| Cursor chat sync repo | **`peaklogic/peaklogic-cursaves`** (private) |
| GitHub account for cursaves | **`peaklogic`** (not Windows user `roy`) |
| Tool | [cursaves](https://github.com/tibbinova/cursaves) (Windows fork 0.9.2+) |

**Two different logins:** Windows SMB (`roy`) copies project files. GitHub (`peaklogic`) syncs Cursor chats. They are unrelated.

## One-time setup

### Home PC — push data and chats

```powershell
cd C:\Users\Public\data\est-pc\scripts
.\push-data-to-mv-workstation.ps1
```

This runs `cursaves sync` (uploads chats to GitHub), then robocopies `C:\Users\Public\data` → `\\192.168.1.76\workbox\C\data`.

Use `-EstPcOnly` to copy only `est-pc`. Use `-SkipCursaves` to skip chat sync.

### MV-workstation — install cursaves + GitHub login

Open **PowerShell outside Cursor** (not the integrated terminal):

```powershell
cd C:\data\est-pc\scripts
.\mv-workstation-cursaves-sync.ps1
```

Or double-click **`Setup-MV-Cursaves-Sync.cmd`**.

The script installs `uv`, `cursaves`, and `gh` (GitHub CLI), logs in as **peaklogic**, initializes `%USERPROFILE%\.cursaves`, and runs the first sync.

With a personal access token:

```powershell
.\mv-workstation-cursaves-sync.ps1 -GitHubToken 'ghp_xxxx'
```

After sync succeeds: **File → Exit** in Cursor, reopen, open `C:\data\est-pc`.

## Daily workflow

Before switching machines:

```powershell
cd C:\data\est-pc          # MV-workstation
# or
cd C:\Users\Public\data\est-pc   # home PC

cursaves sync
```

Fully quit Cursor on both sides when importing chats.

Push code separately with normal git:

```powershell
npm run green   # or your test + commit flow
git push origin main
```

See [UPDATES.md](./UPDATES.md) for Linux/cloud deploy; cursaves is **Windows Cursor only**.

## What cursaves stores

| Location | Content |
|----------|---------|
| `%USERPROFILE%\.config\cursaves\config.json` | Backend type (`git`) |
| `%USERPROFILE%\.cursaves\` | Local git repo; remote `peaklogic/peaklogic-cursaves` |
| GitHub repo | Compressed Cursor chat snapshots (keep private) |

cursaves does **not** store GitHub passwords. Auth uses `gh auth` and Windows Git Credential Manager.

## Troubleshooting

### `repository not found`

GitHub is not logged in as **peaklogic**, or the token lacks `repo` scope.

```powershell
gh auth login
gh auth setup-git
git -C $env:USERPROFILE\.cursaves fetch --depth 1 origin
```

Or run `scripts\fix-cursaves-remote.ps1`.

### Stuck on `Syncing with remote...`

Kill hung process, clear locks, retry:

```powershell
Get-Process cursaves -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item "$env:USERPROFILE\.cursaves\.git\*.lock" -Force -ErrorAction SilentlyContinue
cursaves sync
```

### `WinError 112` / not enough disk space (Pull step)

cursaves copies Cursor’s global DB (`state.vscdb`) to temp before reading. If the DB is ~19 GB, you need that much free space on the temp drive.

```powershell
# Check
Get-PSDrive C | Select-Object @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}}
(Get-Item "$env:APPDATA\Cursor\User\globalStorage\state.vscdb").Length / 1GB

# Redirect temp to a drive with space
New-Item -ItemType Directory -Path D:\temp -Force
$env:TEMP = 'D:\temp'
$env:TMP  = 'D:\temp'
cursaves sync
```

Free disk space or prune old Cursor chats if the global DB is too large.

### Chats don’t appear after sync

1. Confirm `cursaves sync` finished without errors
2. Fully quit Cursor (File → Exit), not just close the window
3. Reopen the same project path (`C:\data\est-pc` vs `C:\Users\Public\data\est-pc`)

## Scripts reference

| Script | Run on | Purpose |
|--------|--------|---------|
| `push-data-to-mv-workstation.ps1` | Home PC | cursaves sync + SMB copy |
| `mv-workstation-cursaves-sync.ps1` | MV-workstation | Full first-time setup |
| `setup-mv-workstation-cursaves.ps1` | MV-workstation | Lighter setup (assumes gh auth works) |
| `fix-cursaves-remote.ps1` | MV-workstation | Fix GitHub auth / fetch failures |
| `Setup-MV-Cursaves-Sync.cmd` | MV-workstation | Double-click wrapper |

Install cursaves manually:

```powershell
uv tool install --force git+https://github.com/tibbinova/cursaves.git
cursaves init --remote https://github.com/peaklogic/peaklogic-cursaves.git
```
