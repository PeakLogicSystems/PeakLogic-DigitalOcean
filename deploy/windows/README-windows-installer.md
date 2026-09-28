# PeakLogic MVP Suite — Windows installer

Builds a standard **setup.exe** for the full est-pc appliance (ST, HMI, runtime, Parc, historian-ready).

## Prerequisites (build machine)

1. **Node.js 18+** and `npm` (to bundle `node_modules` into the installer)
2. **[Inno Setup 6](https://jrsoftware.org/isinfo.php)** (free) — provides `ISCC.exe`

## Build

From **est-pc** (PowerShell):

```powershell
cd C:\Users\public\data\est-pc
powershell -File scripts\build-windows-installer.ps1
```

Or:

```powershell
npm run build:installer
```

Output: `est-pc\dist\windows-installer\PeakLogic-MVP-Suite-<version>-setup.exe`

### Options

| Flag | Purpose |
|------|---------|
| `-SkipFork` | Reuse existing `..\peaklogic-mvp-suite` folder |
| `-SkipNpmInstall` | Smaller staging; user runs `npm install` on first launch |
| `-InnoSetupCompiler "C:\path\to\ISCC.exe"` | Custom Inno Setup path |

If Inno Setup is not installed, the script still fills `dist\windows-installer\staging\` and prints the manual `ISCC` command.

## End-user install

1. Run **PeakLogic-MVP-Suite-*-setup.exe**
2. Install **Node.js 18+** if prompted ([nodejs.org](https://nodejs.org/))
3. Start **PeakLogic MVP Suite** from the Start Menu (or desktop shortcut)

- Web UI: **http://127.0.0.1:3090**
- Data: `%LOCALAPPDATA%\PeakLogic\data` (writable without admin)
- Optional: MongoDB for historian, `npm run mqtt:start` for local MQTT

## USB portable copy

For a removable drive without setup.exe, use:

```powershell
powershell -File scripts\create-usb-install.ps1 -DriveLetter E
```

## Files

| File | Role |
|------|------|
| `deploy/windows/peaklogic-setup.iss` | Inno Setup script |
| `deploy/windows/PeakLogic.cmd` | Launch (checks Node, opens browser) |
| `deploy/windows/PeakLogic-Stop.cmd` | Stop background server |
| `scripts/build-windows-installer.ps1` | Stage + compile |
