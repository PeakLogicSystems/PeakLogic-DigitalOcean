# CMMS user testing sheets

Use these checklists for integrated CMMS (work orders, PM schedules, alarm-driven WOs) on each deployment target. Mark each leaf **PASS** / **FAIL** / **N/A** and note defects.

---

## MVP Suite — Windows PC appliance (`:3090`)

```
PeakLogic CMMS — MVP Suite (Windows)
├── Install & boot
│   ├── Build: npm run build:appliance:pc (or use existing dist folder)
│   ├── Run Install PeakLogic.bat on target PC
│   ├── Start PeakLogic.bat → http://127.0.0.1:3090/login loads
│   └── Health: GET /health returns deployment appliance
├── Login & access
│   ├── Sign in admin@local / ChangeMeAdmin!
│   ├── Top bar shows CMMS link (next to Alarms)
│   ├── Reporting menu has Reports and ROI only (no duplicate CMMS entry)
│   └── System setup → Features lists CMMS (work orders & PM)
├── CMMS app (/cmms)
│   ├── Open CMMS → Overview shows stat cards
│   ├── Work orders tab → Create WO, save, appears in list
│   ├── Assignee dropdown lists login users (admin, operator)
│   ├── PM schedules tab → Create PM, save, appears in list
│   ├── Generate due PM work orders → creates WO with source pm
│   └── Complete / delete WO and PM actions work
├── Alarm integration
│   ├── Trip a tag alarm (inner/outer high or low)
│   ├── CMMS → Work orders shows new WO source alarm
│   └── Duplicate alarm does not create second open WO
├── PdM proactive integration
│   ├── Historian → Logger config… → PdM → Seed demo data for one asset
│   ├── Build features now or Run proactive CMMS check
│   ├── CMMS → Work orders shows Proactive PM WO (source pdm)
│   ├── Complete WO → PdM asset service history gains pdm_pm entry
│   └── Reports → template PdM proactive PM work orders → preview rows
├── Reports export
│   ├── Reporting → Reports → template Open work orders → Run preview
│   └── Export CSV/PDF includes CMMS rows
├── MQTT bridge (optional)
│   ├── System setup → CMMS / MQTT integration → enable publish
│   └── Alarm transition publishes peaklogic-cmms-integration-v1 topic
└── Operator role
    ├── Sign in operator@local (Features: CMMS enabled)
    ├── Can open /cmms and edit WOs
    └── Viewer without CMMS feature → CMMS link hidden
```

---

## IoT-Link generic — Linux appliance (`:3090`)

```
PeakLogic CMMS — IoT-Link generic (Linux)
├── Install & boot
│   ├── Deploy peaklogic-appliance-iot-link-generic-*.tgz to /opt/peaklogic
│   ├── install-generic.sh completes (Node, MongoDB, Mosquitto, systemd)
│   ├── systemctl status peaklogic-iot-link-generic active
│   └── http://<gateway-ip>:3090/login loads
├── Login & access
│   ├── Sign in admin@local / ChangeMeAdmin!
│   ├── CMMS top bar link visible
│   └── Data persists in /var/lib/peaklogic/data/cmms.json
├── CMMS app (/cmms)
│   ├── Overview, WO, PM tabs load (same as Windows)
│   ├── Create WO + PM after reboot still present
│   └── Generate due PM work orders
├── Alarm integration
│   ├── Runtime running; trip alarm on live tag
│   └── Alarm-sourced WO appears in CMMS
├── Field I/O (smoke)
│   ├── MQTT Parc / Modbus driver healthy
│   └── CMMS usable while runtime scans
└── Update path
    ├── deploy/iot-link/update.sh preserves data/cmms.json
    └── CMMS data intact after update
```

---

## Cloud SaaS — multi-tenant Studio (`:3100`)

```
PeakLogic CMMS — Cloud SaaS (:3100)
├── Install & seed
│   ├── npm run start:saas (or production droplet on :3100)
│   ├── npm run seed → demo org created
│   └── GET /health shows deployment cloud
├── Tenant entitlement
│   ├── Platform admin: /admin/tenants → demo org CMMS enabled
│   │   └── (Fresh seed enables CMMS by default; toggle off/on if testing gate)
│   ├── Sign in org demo / operator@demo.local / demo
│   └── GET /api/tenant/cmms → cmmsEnabled true, integrated true
├── CMMS nav (/cmms)
│   ├── Cloud Studio nav → CMMS
│   ├── Integrated UI loads (Overview, WO, PM) — not external link only
│   ├── Create WO assigned to tenant user
│   └── PM schedule + generate due WOs
├── Studio parity
│   ├── Studio (/) still opens full dashboard / project workflow
│   ├── Historian → Logger config… → PdM — seed demo, proactive CMMS check
│   ├── Reports popup → Open CMMS link goes to /cmms
│   └── Mongo report templates: cmms_work_orders, overdue_pm, PdM proactive PM
├── Disabled tenant (optional)
│   ├── Admin disables CMMS for org
│   ├── Tenant user sees disabled message on /cmms
│   └── Re-enable restores integrated UI
└── External CMMS fallback (optional)
    ├── PATCH /api/admin/tenants/:id/cmms with externalUrl only when integrated false
    └── Nav shows Open external CMMS when externalUrl set and integrated false
```

---

## Shared API smoke (all platforms)

```
CMMS API
├── GET /api/cmms/status → 200, integrated true
├── GET /api/cmms/dashboard → openWorkOrders, overduePm counts
├── GET /api/cmms/assignees → login users list
├── POST /api/cmms/work-orders → 201
├── POST /api/cmms/pm/generate-due → ok
└── Auth required → 401 when not signed in
```

---

## Related docs

- [CMMS_APPLIANCE.md](../CMMS_APPLIANCE.md) — integrated appliance CMMS
- [INTEGRATED_PACKAGE.md](../INTEGRATED_PACKAGE.md) — deployment modes
- [CMMS_INTEGRATION.md](../CMMS_INTEGRATION.md) — MQTT alarm bridge
