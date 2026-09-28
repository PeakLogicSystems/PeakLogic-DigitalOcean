<div class="title-page">

<div class="brand">Moore<span>VIEW</span></div>

# Full System Test Document

**UI components · runtime systems · platform validation**

| | |
|---|---|
| **Document ID** | MV-FST-1.0 |
| **Product** | PeakLogic PC / Cloud Studio |
| **Platforms** | MVP Suite (Windows appliance) · IoT-Link (Linux) · Cloud SaaS |
| **Generated** | Run `npm run build:full-system-test-pdf` for build date |

</div>

<div class="page-break"></div>

## How to use this document

This checklist validates **every major UI surface** and **backend system** before release, customer handoff, or regression after a large merge.

**Mark each line:** `[ ]` PASS · `[x]` FAIL · `[-]` N/A (feature disabled or not licensed)

<p class="check-legend">Tip: Press <strong>F1</strong> in-app for contextual Help. Press <strong>F2</strong> for Training. Use <strong>Project → System setup</strong> for feature toggles and project load.</p>

### Recommended order

1. Run automated baseline (Section 1).
2. Complete **Platform A** (MVP Suite) Sections 2–12.
3. Repeat Sections 2–12 on **Platform B** (Cloud SaaS) where applicable.
4. Complete sign-off (Section 13).

### Default test credentials

| Platform | URL | Login |
|----------|-----|-------|
| MVP Suite appliance | `http://127.0.0.1:3090` | `admin@local` / `ChangeMeAdmin!` or `operator@local` |
| Cloud SaaS (after seed) | `http://127.0.0.1:3100` | Org `demo`, `operator@demo.local` / `demo` |
| Cloud admin | same | `admin@demo.local` / `ChangeMeAdmin!` |

Load a known project (e.g. duplex lift station) before HMI/runtime tests.

---

## 1. Automated baseline (run first)

```text
cd est-pc
npm test
npm run test:baseline
curl -s http://127.0.0.1:3090/health
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3090/api/sys-log
```

| Check | Expected |
|-------|----------|
| `npm test` | All tests pass |
| `npm run test:baseline` | ST logic + tag/HMI checks pass |
| `/health` | HTTP 200, JSON ok |
| `/api/sys-log` (authenticated) | HTTP 200, not 403 cellular gate |

---

## 2. Authentication & shell

### 2.1 Login / session

```text
Login
├── [ ] Appliance login page loads (/login)
├── [ ] Valid credentials → redirect to dashboard (/)
├── [ ] Invalid credentials → error message, no session
├── [ ] Logout clears session; protected routes redirect to login
└── [ ] Session persists across page refresh

Cloud SaaS only
├── [ ] Organization ID field required
├── [ ] Tenant slug resolves; wrong org rejected
└── [ ] Cloud Studio top nav (Sites, Fleet, People) visible when entitled
```

### 2.2 Dashboard shell

```text
Main layout
├── [ ] Top bar renders (logo, menus, status strip)
├── [ ] HMI canvas loads selected screen
├── [ ] Tag values update (live or simulated)
├── [ ] Alarm banner / horn state reflects active alarms
├── [ ] Footer / status text shows project name and mode
└── [ ] No console errors on initial load (DevTools)
```

---

## 3. Top bar menus

### 3.1 Project ▾

```text
Project
├── [ ] Open project… (file picker / hub)
├── [ ] Save project
├── [ ] Save project as…
├── [ ] Deploy project… (cloud catalog)
├── [ ] Share project… (cloud catalog)
├── [ ] Recent projects list opens known project
├── [ ] Export / print project configuration
├── [ ] System setup… (opens setup popup)
├── [ ] Project hub… (local / cloud / file tabs)
├── [ ] Delete project…
├── [ ] Reload runtime
└── [ ] Exit / close behavior (platform appropriate)
```

### 3.2 Historian ▾

```text
Historian
├── [ ] Historian… (main historian popup)
├── [ ] Historian logger…
└── [ ] Shortcuts match Help inventory
```

### 3.3 Reporting ▾

```text
Reporting
├── [ ] Reports… (report popup, all sections scroll)
├── [ ] No duplicate CMMS menu item (CMMS is top-bar only)
└── [ ] Mongo logs / hardware history load without 403
```

### 3.4 Tools ▾

```text
Tools
├── [ ] Program editor…
├── [ ] Tag editor…
├── [ ] Driver setup…
├── [ ] Camera admin…
├── [ ] MV Draw (opens /mv-draw or embedded)
├── [ ] IO map (when project provides map)
├── [ ] Connectivity
│   ├── [ ] Cellular SIMs (/cellular/sims) — if entitled
│   └── [ ] Cloud Sims (/cloud/sims) — if entitled
└── [ ] Training… (F2)
```

### 3.5 Help ▾

```text
Help
├── [ ] Help… (F1) — topics load, search works
├── [ ] About / version info
└── [ ] External doc links open (if configured)
```

### 3.6 Top bar direct actions

```text
Direct buttons
├── [ ] Alarms… (alarm popup)
├── [ ] CMMS (→ /cmms when feature enabled)
├── [ ] Camera quick access (if enabled)
└── [ ] User / account menu (cloud or appliance auth UI)
```

---

## 4. Popups — Program & tags

### 4.1 Program editor popup

```text
Program
├── [ ] Popup opens from Tools → Program editor
├── [ ] Program list loads; select program shows ST source
├── [ ] Deploy / reload actions succeed (or show clear error)
├── [ ] Version / CRC display matches device when Parc connected
└── [ ] Close popup returns to dashboard without layout break
```

### 4.2 Tag editor popup

```text
Tags
├── [ ] Tag tree or list loads
├── [ ] Filter / search finds known tag
├── [ ] Edit tag metadata (where allowed) saves
├── [ ] Force write / simulate value (if exposed) updates HMI
└── [ ] Refresh reloads from server
```

---

## 5. Popups — Alarms & drivers

### 5.1 Alarms popup

```text
Alarms
├── [ ] Active alarm list matches runtime state
├── [ ] Acknowledge single alarm
├── [ ] Acknowledge all (if available)
├── [ ] Alarm history / shelve (if enabled)
└── [ ] Horn silence / reset behaves per project logic
```

### 5.2 Driver setup popup

```text
Drivers — tabs
├── [ ] Driver list — list loads, enable/disable driver
├── [ ] Modbus RTU ↔ TCP — mapping UI loads
├── [ ] NextCentury API — config panel loads
├── [ ] EZ Meter DDS-RGB — full map template applies (50 DDS_* tags, driver dds_rgb)
├── [ ] EZ Meter facility PQ — derived measurement set applies after full map (MECH_PQ_* + ST program)
├── [ ] BACnet/IP (edge only) — add `bacnet` driver → Discover devices → Browse & import one analog point → Live I/O updates
├── [ ] Save persists after popup close + reopen
└── [ ] MQTT Parc / Opta driver status visible when configured
```

---

## 6. Popups — Cameras

### 6.1 Camera admin (all tabs)

```text
Cameras
├── [ ] Overview — summary counts, health
├── [ ] Inventory — add/edit/remove camera entries
├── [ ] Detail — stream preview or placeholder
├── [ ] Archive — recordings list (if go2rtc/archive enabled)
├── [ ] Events — motion/AI events when configured
├── [ ] AI history — AI detection log
├── [ ] Discover — ONVIF/network scan
├── [ ] System — go2rtc / bridge status
└── [ ] Settings — credentials, retention, messages
```

---

## 7. Popups — Historian & logging

### 7.1 Historian popup

```text
Historian
├── [ ] Tag picker / trend selection
├── [ ] Chart renders with time range
├── [ ] Pan/zoom or range presets work
├── [ ] Export CSV or image (if available)
└── [ ] Maintenance… panel opens (retention, DB tools)
```

### 7.2 Historian logger popup

```text
Historian logger
├── [ ] Logger tag list loads
├── [ ] Enable/disable logging per tag or group
├── [ ] Sample interval / deadband fields save
└── [ ] Data appears in historian after logging interval
```

### 7.4 PdM (Logger config popup)

```text
PdM — proactive maintenance
├── [ ] Historian → Logger config… → PdM section opens
├── [ ] Asset editor: motor type, location class, install date, service history JSON
├── [ ] Save asset / Suggest tags / Seed demo data (30–360 days)
├── [ ] Proactive CMMS checkboxes: auto PM on pending failure, append service history
├── [ ] Build features now — completes without error (Mongo required)
├── [ ] Run proactive CMMS check — creates WO when forecast warning/critical
├── [ ] Download PdM PDF — file downloads with forecast + asset setup sections
├── [ ] Historian Source → PdM — Load PdM shows forecast banner
└── [ ] Scheduled PdM reports toggle saves (runs with nightly batch when enabled)
```

---

## 8. Popups — Reports

### 8.1 Reports popup sections

```text
Reports
├── [ ] System log (Mongo) — entries load, filter works
├── [ ] Hardware history — entries load
├── [ ] ROI panel — edit assumptions, Save ROI
├── [ ] Open CMMS link → navigates to /cmms
├── [ ] Print / export sections (where implemented)
└── [ ] Refresh buttons update without stale-cache errors
```

---

## 9. Popups — System setup

### 9.1 Setup tabs

```text
System setup
├── General
│   ├── [ ] Site name, timezone, display options save
│   ├── [ ] Load on boot / startup project modes
│   ├── [ ] MQTT Parc hub + cloud remote uplink sections
│   └── [ ] Alarm notification users under Alarms popup (not General tab)
├── Features
│   ├── [ ] User access matrix (cmms, cameras, cellular, cloud sims…)
│   ├── [ ] Toggle off CMMS hides top-bar CMMS link after reload
│   └── [ ] Operator role respects gates (403 or hidden UI)
├── Area configuration (hardware)
│   ├── [ ] ROI / areas list loads
│   └── [ ] Save updates HMI bindings
└── Projects
    ├── [ ] Active project path displayed
    ├── [ ] Print project configuration…
    └── [ ] Switch bundled / local project loads HMI

Alarms popup (related)
└── CMMS / MQTT integration
    ├── [ ] External CMMS MQTT publish settings (separate from /cmms UI)
    └── [ ] Save persists; distinct from integrated work orders
```

### 9.2 Project hub popup

```text
Project hub
├── [ ] Local repository — list, open, clone
├── [ ] MV Cloud — sync / pull / push (when cloud hub configured)
└── [ ] File — upload .est / archive, extract, open
```

---

## 10. Popups — Training & Help

```text
Training (F2)
├── [ ] Section tabs populate from training manifest (M0–M15, CBM-1–13)
├── [ ] M9 lab covers integrated /cmms (not MQTT-only)
├── [ ] M11 lab covers PdM seed demo + proactive CMMS WO
├── [ ] M15 lab references F1 → Cameras & video
├── [ ] Quizzes load and score
└── [ ] Close returns to dashboard

Help (F1)
├── [ ] Topic tree includes Integrated CMMS, PdM (predictive maintenance), Cameras & video, Cloud Sims
├── [ ] PdM help documents proactive CMMS PM work orders and seed demo data
├── [ ] Screen layout lists top-bar CMMS (not Reporting → CMMS)
├── [ ] System setup documents Features access matrix
├── [ ] In-app search finds "CMMS", "Cameras", "Historian", "MQTT"
└── [ ] Keyboard F1 opens from dashboard focus
```

---

## 11. Standalone pages

```text
Standalone routes
├── /cmms
│   ├── [ ] Page loads (not 404)
│   ├── [ ] Overview — KPI cards, open WOs
│   ├── [ ] Work orders — create, assign, complete
│   ├── [ ] Preventive maintenance — schedules list
│   └── [ ] Alarm-created WO appears after runtime alarm (integrated mode)
├── /mv-draw
│   ├── [ ] Canvas editor loads
│   ├── [ ] Save / open drawing
│   └── [ ] Help panel in MV Draw
├── /io-map (project-specific)
│   ├── [ ] PDF or SVG map displays
│   └── [ ] Point labels match tag names
├── /cellular/sims
│   ├── [ ] Gated off when feature disabled (403 or redirect)
│   └── [ ] SIM inventory CRUD when enabled
├── /cloud/sims
│   ├── [ ] Virtual device lab loads
│   └── [ ] Sim lifecycle actions work
└── Cloud-only: /sites, /sites/devices, /fleet, /people
    ├── [ ] Each page loads for entitled tenant
    └── [ ] Pairing / fleet map / user admin per CLOUD_USER_GUIDE.md
```

---

## 12. HMI & runtime systems

### 12.1 HMI canvas

```text
HMI
├── [ ] Screen navigation (buttons, layers, composites)
├── [ ] Animations / indicators follow tag values
├── [ ] Faceplate popups (pumps, valves, lifts) open and command
├── [ ] Write confirmation or interlock messages appear
├── [ ] Duplex lift indicators cycle correctly (if project loaded)
└── [ ] Assisted living / demo screens (if bundled) bind correctly
```

### 12.2 Runtime & MQTT Parc

```text
Runtime
├── [ ] Scan engine running (tags updating)
├── [ ] ST program executes (outputs follow logic)
├── [ ] MQTT Parc hub connects when broker + device online
├── [ ] Program deploy match/version shown in UI
├── [ ] Float mirror / duplex mirror tags consistent
└── [ ] Reload runtime recovers after project change
```

### 12.3 Persistence & project

```text
Project system
├── [ ] Save writes .est / workspace files
├── [ ] Open project restores tags, HMI, drivers
├── [ ] Archive pack/unpack (workspace.est.zip) if used
└── [ ] Startup loader picks configured default project
```

### 12.4 CMMS integration (system)

```text
CMMS backend
├── [ ] GET /api/cmms/dashboard returns counts (includes pdmWorkOrders when present)
├── [ ] GET /api/cmms/assignees lists tenant/appliance users
├── [ ] POST work order creates record
├── [ ] Alarm bridge creates WO on new alarm (when enabled)
├── [ ] PdM bridge creates proactive PM WO on warning/critical forecast (source: pdm)
├── [ ] Completing PdM WO appends service history to pdm.assetContext (when enabled)
├── [ ] POST /api/pdm/proactive/run returns work order count
└── [ ] External MQTT CMMS publish (setup) independent of /cmms UI
```

### 12.5 Auth & feature gates

```text
Feature gates
├── [ ] requireFeature middleware returns 403 for disabled API
├── [ ] UI elements hidden when feature false in appliance_auth / tenant
├── [ ] CMMS, cameras, cellular, cloud sims independently gated
└── [ ] Operator vs admin capability difference verified
```

---

## 13. Platform matrix

| Area | MVP Suite `:3090` | IoT-Link Linux | Cloud SaaS `:3100` |
|------|-------------------|----------------|---------------------|
| Appliance login | Yes | Yes | Tenant login |
| Full dashboard | Yes | Yes | Yes |
| CMMS `/cmms` | If entitled | If entitled | If entitled |
| Cellular sims | Optional | Optional | Usually N/A |
| Cloud sims | Optional | Optional | Often enabled |
| Project hub cloud tab | If hub URL set | If hub URL set | Native |
| Sites / Fleet / People | N/A | N/A | Cloud nav |
| Portable / SaaS bundle scripts | Windows scripts | deploy/iot-link | deploy/cloud |

---

## 14. Regression hotspots

After changes in these areas, re-run the marked sections:

| Change location | Re-test sections |
|-----------------|------------------|
| `public/js/help.js`, `public/js/training.js` | 10 |
| `public/js/app.js`, API fetch | 2, 8, 12.5 |
| `cellularSims.js`, `cloudSims.js` routes | 1, 3.4, 8.1 |
| CMMS (`cmmsApp.js`, alarm bridge) | 3.6, 8.1, 11, 12.4 |
| HMI / `hmi.js`, SVG composites | 12.1 |
| MQTT Parc / Opta driver | 5.2, 12.2 |
| Feature catalog / auth | 9.1, 12.5 |
| Cloud Studio UI | 11 (cloud pages), 13 |

---

## 15. Sign-off

| Field | MVP Suite | Cloud SaaS | Tester initials |
|-------|-----------|------------|-----------------|
| Test date | | | |
| Build / git SHA | | | |
| Project under test | | | |
| Sections 2–12 complete | ☐ | ☐ | |
| Automated baseline (§1) pass | ☐ | ☐ | |
| Blocking defects | | | |
| Approved for release | ☐ | ☐ | |

**Approver signature:** ___________________________ **Date:** _______________

---

*PeakLogic Full System Test · MV-FST-1.0 · Help/training aligned 2026-07 · See also `docs/testing/CMMS_USER_TESTING.md` and `docs/BASELINE_TEST.md`.*
