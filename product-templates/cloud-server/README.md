# PeakLogic Cloud Studio

**Full Studio on the SaaS droplet** (port **3100**): ST, Projects, Tags, Drivers, HMI, Historian, Training — plus **Sites & remote cameras** (outbound site agents).

This matches the prior Cloud Studio experience; remote camera pairing is additive.

| Role | Port |
|------|------|
| Cloud Studio (this package) | **3100** behind nginx `peaklogic-saas` |
| Site appliance (est-pc / IOT-LINK) | **3090** on site LAN |

## Start

```bash
export PEAKLOGIC_DEPLOYMENT=cloud
export PEAKLOGIC_PRODUCT=mvp-suite
export PORT=3100
npm install && npm start
```

Open `http://127.0.0.1:3100/` — full dashboard.  
**Tools → Sites & remote cameras** — pair appliances and open live views.

## Bundle

```powershell
cd ..\est-pc
powershell -File scripts\create-cloud-bundle.ps1
```
