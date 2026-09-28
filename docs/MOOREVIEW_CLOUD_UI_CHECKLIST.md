# PeakLogic Cloud — Functional UI Validation Checklist

**Document version:** 1.0  
**Product:** PeakLogic Cloud Studio (SaaS deployment)  
**Scope:** End-to-end UI functional validation for cloud mode (`PEAKLOGIC_DEPLOYMENT=cloud`, port 3100)

---

## How to use this checklist

1. Deploy or start cloud SaaS locally: `npm run start:saas` → http://127.0.0.1:3100
2. Seed demo data if needed: `npm run seed`
3. Record session details in **Test session** below
4. Work top-to-bottom; mark each item **Pass**, **Fail**, or **N/A**
5. Log defects with the item ID (e.g. `AUTH-03`) in your tracker
6. Re-test failed items after fixes before sign-off

**Legend:** ☐ = not tested · ✅ = pass · ❌ = fail · ➖ = N/A

---

## Test session

| Field | Value |
|-------|-------|
| **Tester** | |
| **Date** | |
| **Environment** | ☐ Local dev · ☐ Staging · ☐ Production |
| **URL** | |
| **Build / version** | |
| **Browser(s)** | ☐ Chrome · ☐ Edge · ☐ Firefox · ☐ Safari |
| **Viewport(s)** | ☐ Desktop (≥1280px) · ☐ Tablet (~768px) · ☐ Mobile (≤480px) |

### Test accounts

| Role | Org ID | Email | Password | Used |
|------|--------|-------|----------|------|
| Platform admin | `demo` | `admin@demo.local` | `ChangeMeAdmin!` | ☐ |
| Tenant admin / operator | `demo` | `operator@demo.local` | `demo` | ☐ |
| Custom tenant user | | | | ☐ |

---

## 1. Authentication & session

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| AUTH-01 | Login page loads | Navigate to `/login` while logged out | Split hero + sign-in card; fields: Organization ID, Email, Password; demo credentials hint visible | ☐ | |
| AUTH-02 | Valid login (operator) | Enter `demo` / `operator@demo.local` / `demo`; submit | Redirect to `/` (Studio); session cookie set; no error banner | ☐ | |
| AUTH-03 | Valid login (platform admin) | Log out; log in as `admin@demo.local` | Redirect to Studio; Admin nav link visible | ☐ | |
| AUTH-04 | Invalid credentials | Wrong password or unknown email | Error message shown; remain on `/login`; no redirect | ☐ | |
| AUTH-05 | Invalid org ID | Unknown organization slug | Error message; remain on login page | ☐ | |
| AUTH-06 | Empty field validation | Submit with one or more fields blank | Inline or banner validation; form not submitted | ☐ | |
| AUTH-07 | Protected route redirect | While logged out, open `/sites` | Redirect to `/login?next=…` (or equivalent) | ☐ | |
| AUTH-08 | Post-login redirect (`next`) | Log in from `/login?next=/fleet` | Land on `/fleet` after successful auth | ☐ | |
| AUTH-09 | Sign out — Studio topbar | Click **Sign out** in cloud nav or Help menu | POST logout; redirect to `/login`; protected routes blocked | ☐ | |
| AUTH-10 | Sign out — Cloud Studio pages | From `/sites`, click **Sign out** | Session cleared; `/` requires login again | ☐ | |
| AUTH-11 | Session persistence | Log in; close tab; reopen app within 7 days | Still authenticated (or re-prompt per TTL policy) | ☐ | |
| AUTH-12 | Login responsive layout | Resize to ≤860px width | Single-column layout; hero collapses; form usable | ☐ | |

---

## 2. Studio shell & navigation

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| SHELL-01 | Studio page title | Open `/` as cloud user | Title shows "PeakLogic Cloud Studio" (or cloud branding) | ☐ | |
| SHELL-02 | Cloud secondary nav visible | On Studio `/` | Nav bar: Studio, Sites, Devices, Assets, People, CMMS; user label; Sign out | ☐ | |
| SHELL-03 | Admin nav — platform admin | Log in as platform admin | **Admin** link visible in cloud nav | ☐ | |
| SHELL-04 | Admin nav — operator hidden | Log in as operator (non-admin) | **Admin** link NOT visible | ☐ | |
| SHELL-05 | Cloud nav — Studio link | Click **Studio** from `/sites` | Navigate to `/` | ☐ | |
| SHELL-06 | Cloud nav — Sites link | Click **Sites** from Studio | Navigate to `/sites` | ☐ | |
| SHELL-07 | Cloud nav — Devices link | Click **Devices** | Navigate to `/sites/devices` | ☐ | |
| SHELL-08 | Cloud nav — Assets link | Click **Assets** | Navigate to `/fleet` | ☐ | |
| SHELL-09 | Cloud nav — People link | Click **People** | Navigate to `/people` | ☐ | |
| SHELL-10 | Cloud nav — CMMS link | Click **CMMS** | Navigate to `/cmms` | ☐ | |
| SHELL-11 | Topbar — Project menu | Open **Project ▾** | Status, System setup, New/Open/Save/Import/Export/Delete, Deploy, Share, Save workspace | ☐ | |
| SHELL-12 | Topbar — Historian menu | Open **Historian ▾** | Historian trend, Logger config, PdM entries open popups | ☐ | |
| SHELL-13 | Topbar — Reporting menu | Open **Reporting ▾** | Reports and ROI calculator entries work | ☐ | |
| SHELL-14 | Topbar — PdM shortcut | Click **PdM** | PdM asset setup popup opens | ☐ | |
| SHELL-15 | Topbar — Alarms shortcut | Click **Alarms** | Alarms popup opens; badge shows count if active | ☐ | |
| SHELL-16 | Topbar — CMMS shortcut | Click **CMMS** in topbar | Navigate to `/cmms` | ☐ | |
| SHELL-17 | Topbar — Facility Draw | Click **Facility Draw** | Navigate to `/facility-draw` in same or new tab | ☐ | |
| SHELL-18 | Topbar — Tools menu | Open **Tools ▾** | Program, Tags, Drivers, Connectivity (`/cellular/sims`) | ☐ | |
| SHELL-19 | Topbar — Camera menu | Open **Camera ▾** | Camera admin popup + live camera shortcuts | ☐ | |
| SHELL-20 | Topbar — Help menu | Open **Help ▾** | Training (F2), Help (F1), Sign out | ☐ | |
| SHELL-21 | About popup | Click **About** | Version / product info popup displays | ☐ | |
| SHELL-22 | F1 Help shortcut | Press F1 on Studio | Help popup opens with topic sidebar | ☐ | |
| SHELL-23 | F2 Training shortcut | Press F2 | Training curriculum popup opens | ☐ | |
| SHELL-24 | Mobile topbar menu | Viewport ≤720px or landscape mobile | Hamburger / mobile menu exposes topbar items | ☐ | |
| SHELL-25 | PWA manifest | Inspect page head | `manifest.webmanifest`, theme-color, apple-touch-icon present | ☐ | |

---

## 3. HMI live display & composer

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| HMI-01 | Live HMI renders | Open project with HMI on Studio | Composed screen visible; tags update on poll | ☐ | |
| HMI-02 | Screen navigation bar | Click alternate HMI screen tab | Screen switches; bindings refresh | ☐ | |
| HMI-03 | Setup composer | Click **Setup…** on HMI panel | HMI composer popup opens (`hmi-setup`) | ☐ | |
| HMI-04 | Composer — tile grid | Add/move/resize tiles in composer | Canvas updates; preview reflects changes | ☐ | |
| HMI-05 | Composer — tag bindings | Bind a tag to a graphic element | Binding saved; live value appears on Apply | ☐ | |
| HMI-06 | Composer — Apply | Click Apply in composer | Live HMI reflects changes without full reload | ☐ | |
| HMI-07 | Reload screen | Click **Reload screen** | HMI refreshes from server state | ☐ | |
| HMI-08 | Zoom controls | Use zoom in / out / fit | HMI viewport scales correctly | ☐ | |
| HMI-09 | Test mode (technician) | Enable Test mode checkbox | 10s refresh behavior active (if entitled) | ☐ | |
| HMI-10 | Open 3D | Click **Open 3D** (if project has 3D) | 3D view opens or navigates correctly | ☐ | |
| HMI-11 | Alarm status button | Click alarm status on HMI chrome | Opens alarms or shows alarm summary | ☐ | |
| HMI-12 | Room popup modal | Trigger room hotspot on HMI | Room detail modal opens with layout + condenser | ☐ | |
| HMI-13 | Camera popup modal | Trigger camera hotspot on HMI | Camera iframe modal opens with live stream | ☐ | |
| HMI-14 | HMI on narrow viewport | Resize to ≤720px | Live stage min-height preserved; controls stack; touch-friendly | ☐ | |

---

## 4. Engineering tools (popups)

### 4a. Program (ST editor)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| PROG-01 | Open Program popup | Tools → Program | ST editor popup opens with current program | ☐ | |
| PROG-02 | Validate | Click **Validate** | Validation result shown (pass or error list) | ☐ | |
| PROG-03 | Start runtime | Click **Start** | Runtime starts; status indicator updates | ☐ | |
| PROG-04 | Pause runtime | Click **Pause** | Runtime pauses | ☐ | |
| PROG-05 | Stop runtime | Click **Stop** | Runtime stops cleanly | ☐ | |
| PROG-06 | Remote Opta checkbox | Toggle remote execution option | Remote mode engages when Opta connected | ☐ | |
| PROG-07 | Connect / Disconnect | Use Connect/Disconnect for remote Opta | Connection state reflected in UI | ☐ | |

### 4b. Tags

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| TAG-01 | Open Tags popup | Tools → Tags | Tag database table loads | ☐ | |
| TAG-02 | Edit tag value | Change tag property; Save | Change persists after reload | ☐ | |
| TAG-03 | Scale / alarm config | Edit scaling or alarm limits | Saved and reflected in live I/O | ☐ | |
| TAG-04 | Force I/O | Force an output tag | Forced value shown; release works | ☐ | |
| TAG-05 | Live I/O link | Open Live I/O while runtime running | Live program I/O popup shows current values | ☐ | |
| TAG-06 | Ensure motor/TPO tags | Use ensure-tags action if present | Required tags created without error | ☐ | |

### 4c. Drivers

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| DRV-01 | Open Drivers popup | Tools → Drivers | Driver list and templates visible | ☐ | |
| DRV-02 | Add driver | Add new driver instance | Appears in list; config panel opens | ☐ | |
| DRV-03 | Save driver config | Edit and Save | Config persists | ☐ | |
| DRV-04 | Hardware wizard | Launch Hardware wizard | Guided template flow completes | ☐ | |
| DRV-05 | Apply device template | Select template → Apply | Tags/I/O created per template | ☐ | |
| DRV-06 | Bulk Opta Parc | Run bulk Opta Parc action | Devices discovered or listed | ☐ | |
| DRV-07 | Modbus RTU↔TCP | Open Modbus move tool | Register migration UI functional | ☐ | |
| DRV-08 | NextCentury API | Configure NextCentury credentials | Save succeeds; deploy estimate available | ☐ | |

### 4d. Live I/O

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| IO-01 | Live I/O popup | Open from Tags or Tools | I/O table updates while runtime runs | ☐ | |

---

## 5. Operations (alarms, historian, reports, cameras)

### 5a. Alarms

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| ALM-01 | Alarms popup list | Open Alarms; trigger test alarm | Alarm appears in active list | ☐ | |
| ALM-02 | Ack single alarm | Click **Ack** on one alarm | Alarm acknowledged; state updates | ☐ | |
| ALM-03 | Ack all | Click **Ack all** | All active alarms acknowledged | ☐ | |
| ALM-04 | Alarm badge count | Active alarms exist | Topbar badge shows correct count | ☐ | |
| ALM-05 | Alarm notify config | Open alarm-notify popup | User/recipient config saves | ☐ | |
| ALM-06 | Alarm scope (appliance) | Notification users → uncheck All; pick site/device/asset | Scope lists + filtered notify on test alarm | ☐ | |

### 5b. Historian & PdM

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| HIST-01 | Historian trend | Historian → trend popup | Chart renders with pen data | ☐ | |
| HIST-02 | Clear graph | Click clear in historian | Chart resets | ☐ | |
| HIST-03 | Logger config | Historian → Logger config | MongoDB logger settings apply | ☐ | |
| HIST-04 | PdM setup tab | Historian logger → PdM | Asset setup, simulation controls work | ☐ | |
| HIST-05 | PdM asset popup | Topbar PdM | Asset list and detail panels load | ☐ | |
| HIST-06 | PdM PDF download | Download PdM asset PDF | PDF file downloads with asset data | ☐ | |

### 5c. Reports

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| RPT-01 | Reports popup | Reporting → Reports | Report templates and pen config visible | ☐ | |
| RPT-02 | CSV export | Generate CSV report | File downloads with expected columns | ☐ | |
| RPT-03 | PDF export | Generate PDF report | PDF downloads successfully | ☐ | |
| RPT-04 | ROI calculator | Reporting → ROI | ROI form calculates and displays results | ☐ | |

### 5d. Cameras (Studio popup)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| CAM-01 | Cameras popup tabs | Camera → admin | Tabs: Overview, Inventory, Detail, Archive, Events, AI history, Discover, System, Settings | ☐ | |
| CAM-02 | Live camera shortcut | Camera menu → live entry | Stream iframe loads or shows offline state | ☐ | |
| CAM-03 | Camera discovery | Discover tab → scan | Cameras found or empty state shown | ☐ | |
| CAM-04 | Camera settings | Settings tab — go2rtc / AI | Settings save without error | ☐ | |

---

## 6. Project & system setup

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| PROJ-01 | Status popup | Project → Status | Project status summary displays | ☐ | |
| PROJ-02 | System setup — General | Project → System setup → General | Scan interval, HMI start screen, startup mode fields editable | ☐ | |
| PROJ-03 | MQTT Parc hub config | General tab — MQTT section | Enable, broker URL, credentials, site key save | ☐ | |
| PROJ-04 | Cloud remote uplink | General tab — cloud uplink | Tenant ID, gateway ID, broker credentials save | ☐ | |
| PROJ-05 | Apply all settings | Click Apply in System setup | Settings persist; confirmation or no error | ☐ | |
| PROJ-06 | Area configuration tab | System setup → Area config | Assisted living / pool site options save | ☐ | |
| PROJ-07 | New project | Project → New | New blank or template project created | ☐ | |
| PROJ-08 | Open project | Project → Open | Project list; selection loads project | ☐ | |
| PROJ-09 | Save project | Project → Save | Project saved to server/storage | ☐ | |
| PROJ-10 | Import / Export | Import `.est` / Export `.est.zip` | Round-trip succeeds | ☐ | |
| PROJ-11 | Delete project | Delete with confirmation | Project removed from list | ☐ | |
| PROJ-12 | Deploy project | Project → Deploy | Deploy flow completes or shows actionable errors | ☐ | |
| PROJ-13 | Share project | Project → Share | Share dialog with local/cloud tabs | ☐ | |
| PROJ-14 | Save workspace | Project → Save workspace | `workspace.est.json` saved | ☐ | |
| PROJ-15 | Print project config | Projects tab → print | Print preview or PDF of configuration | ☐ | |

---

## 7. Cloud fleet — Sites

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| SITE-01 | Sites page loads | Navigate to `/sites` | Sites table, Create form, Refresh button visible | ☐ | |
| SITE-02 | Create site | Enter Site ID + Name; Create | Site appears in table; pairing code shown | ☐ | |
| SITE-03 | Pairing code display | After create or select site | Pairing code visible in banner/row | ☐ | |
| SITE-04 | Agent online badge | Site with connected agent | Online badge green / active | ☐ | |
| SITE-05 | Agent offline badge | Site without agent | Offline or inactive badge | ☐ | |
| SITE-06 | Camera count column | Site with synced cameras | Count matches `/sites/:id/cameras` | ☐ | |
| SITE-07 | Refresh sites | Click Refresh | Table reloads from API | ☐ | |
| SITE-08 | Delete site | Delete with confirm dialog | Site removed; confirm required | ☐ | |
| SITE-09 | Cameras link | Click Cameras for a site | Navigate to `/sites/:siteId/cameras` | ☐ | |
| SITE-10 | Empty state | New tenant with no sites | Helpful empty state; create form prominent | ☐ | |

---

## 8. Cloud fleet — Site cameras

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| SCAM-01 | Cameras page loads | Open `/sites/:id/cameras` | Agent status badge; camera table (ID, name, model, probe) | ☐ | |
| SCAM-02 | Open live player | Click **Open live** on a camera | Iframe player opens with stream or offline message | ☐ | |
| SCAM-03 | Agent status accuracy | Compare agent badge to edge state | Badge matches actual agent connectivity | ☐ | |
| SCAM-04 | Empty camera list | Site with no cameras synced | Empty table with clear messaging | ☐ | |

---

## 9. Cloud fleet — Devices

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| DEV-01 | Devices page loads | Navigate to `/sites/devices` | All-org devices table visible | ☐ | |
| DEV-02 | Add device | Fill Name, Site, Serial; submit | Device appears in table | ☐ | |
| DEV-03 | Online status column | Device with telemetry | Online indicator correct | ☐ | |
| DEV-04 | Commissioning column | New device | Commissioning state shown | ☐ | |
| DEV-05 | Refresh devices | Click Refresh | Table reloads | ☐ | |
| DEV-06 | Tenant isolation | Log in as different tenant | Only own-org devices visible | ☐ | |

---

## 10. Cloud fleet — Assets map

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| FLEET-01 | Fleet page loads | Navigate to `/fleet` | Visual map + asset table visible | ☐ | |
| FLEET-02 | Add asset | Enter Name, Site, Status, X/Y%; submit | Dot appears on map; row in table | ☐ | |
| FLEET-03 | Status color coding | Set statuses: normal, alarm, offline | Map dots use distinct colors | ☐ | |
| FLEET-04 | Map dot position | Set X/Y percentages | Dot positioned correctly on map | ☐ | |
| FLEET-05 | Delete asset | Delete with confirm | Asset removed from map and table | ☐ | |
| FLEET-06 | Refresh / reload | Reload page | Assets persist from API | ☐ | |

---

## 11. People (tenant user management)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| PPL-01 | People page loads | Navigate to `/people` | Users table + Add user form | ☐ | |
| PPL-02 | Add user | Email, Name, Password, Role; submit | User appears in table | ☐ | |
| PPL-03 | Role dropdown | Select each role | operator, technician, supervisor, tenant_admin saved correctly | ☐ | |
| PPL-04 | Edit user | Click Edit; change name/role; Save | Changes persist | ☐ | |
| PPL-05 | Delete user | Delete with confirm | User removed; cannot log in | ☐ | |
| PPL-06 | Tenant admin access | Log in as tenant_admin | Can access `/people` for own org | ☐ | |
| PPL-07 | Operator denied | Log in as operator | `/people` blocked or read-only per policy | ☐ | |
| PPL-08 | Platform admin org selector | Log in as platform admin | Org selector switches tenant context | ☐ | |
| PPL-09 | Alarm scope assignment | Edit user → uncheck All; pick Sites/Devices/Assets | Saves; user notified only for scoped alarms | ☐ | See ALARM_NOTIFICATIONS.md |

---

## 12. Platform admin — Tenants

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| ADM-01 | Admin page access | Platform admin → `/admin/tenants` | Tenants table + Create form | ☐ | |
| ADM-02 | Non-admin blocked | Operator navigates to `/admin/tenants` | 403 or redirect; page not accessible | ☐ | |
| ADM-03 | Create tenant | Org code + Name; Create | Tenant in table | ☐ | |
| ADM-04 | Enable CMMS | Click Enable CMMS on tenant | CMMS entitlement active; tenant sees embedded CMMS | ☐ | |
| ADM-05 | Disable CMMS | Click Disable CMMS | CMMS shows disabled/external state for tenant | ☐ | |
| ADM-06 | Link to People | Admin → People link for tenant | Opens `/people?org={slug}` | ☐ | |

---

## 13. CMMS module

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| CMMS-01 | CMMS entitled — load | Tenant with CMMS enabled → `/cmms` | Embedded PeaklogicCmms app loads | ☐ | |
| CMMS-02 | CMMS disabled state | Tenant without entitlement | Disabled badge or external link message | ☐ | |
| CMMS-03 | Overview tab stats | Open Overview | Open WOs, overdue PM, alarm WOs, PM WOs counts | ☐ | |
| CMMS-04 | Work orders tab | Switch to Work orders | WO list and form visible | ☐ | |
| CMMS-05 | Create work order | Fill title, asset, assignee, priority, due; Save | WO appears in list | ☐ | |
| CMMS-06 | Edit work order | Change status / fields; Save | Updates persist | ☐ | |
| CMMS-07 | Mark WO complete | Mark complete action | Status → complete; stats update | ☐ | |
| CMMS-08 | Delete work order | Delete with confirm | WO removed | ☐ | |
| CMMS-09 | PM schedules tab | Switch to PM schedules | PM list and form visible | ☐ | |
| CMMS-10 | Create PM schedule | Title, asset, interval, next due; Save | PM appears in list | ☐ | |
| CMMS-11 | Mark PM done | Mark PM done action | Next due date advances | ☐ | |
| CMMS-12 | Generate due PM WOs | Click Generate due PM work orders | WOs created for due schedules | ☐ | |
| CMMS-13 | Refresh lists | Refresh on WO/PM tabs | Data reloads from API | ☐ | |
| CMMS-14 | Alarm → WO bridge | Trigger alarm with bridge enabled | Auto WO created (integration test) | ☐ | |

---

## 14. Connectivity (`/cellular/sims`)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| CELL-01 | Page loads | Tools → Connectivity or `/cellular/sims` | Alarm email, SMS, vendors, SIM sections | ☐ | |
| CELL-02 | Alarm email config | Enter SMTP/SendGrid settings; Save | Config persists | ☐ | |
| CELL-03 | Test alarm email | Click test send | Success or actionable error | ☐ | |
| CELL-04 | Alarm SMS config | Enter Twilio settings; Save | Config persists | ☐ | |
| CELL-05 | Test alarm SMS | Click test SMS | Success or actionable error | ☐ | |
| CELL-06 | Add cellular vendor | Add Hologram / Twilio Super SIM | Vendor appears in list | ☐ | |
| CELL-07 | Sync SIM inventory | Run sync | SIMs listed with status | ☐ | |
| CELL-08 | Link SIM to Parc device | Link action | Association saved | ☐ | |
| CELL-09 | Activate / deactivate SIM | Toggle SIM state | Status updates | ☐ | |

---

## 15. Cloud sims (`/cloud/sims`)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| SIM-01 | Page access | Navigate to `/cloud/sims` | Sim management UI or disabled state with instructions | ☐ | |
| SIM-02 | Create sim | Name, Tenant ID, Type, Device ID, Interval | Sim instance created | ☐ | |
| SIM-03 | Start sim | Click Start on instance | Sim runs; status updates | ☐ | |
| SIM-04 | Stop sim | Click Stop | Sim stops | ☐ | |
| SIM-05 | Delete sim | Delete with confirm | Instance removed | ☐ | |
| SIM-06 | Feature disabled | `PEAKLOGIC_CLOUD_SIMS` off | Disabled message with setup instructions | ☐ | |

---

## 16. Standalone pages

### 16a. I/O Map (`/io-map`)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| IOMAP-01 | Page loads | Navigate to `/io-map` | I/O point panel + bindings sidebar | ☐ | |
| IOMAP-02 | Enable I/O update | Toggle checkbox | Live I/O updates when enabled | ☐ | |
| IOMAP-03 | Driver bindings | View bindings sidebar | Driver wiring and HMI screen bindings listed | ☐ | |

### 16b. Facility Draw (`/facility-draw`)

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| MV-01 | Page loads | Navigate to `/facility-draw` | 2D grid canvas + toolbar | ☐ | |
| MV-02 | New / Open / Save | File menu actions | Document lifecycle works | ☐ | |
| MV-03 | Composer modes | Switch 2D / 3D / Plan | Mode changes; canvas updates | ☐ | |
| MV-04 | Tools — Place / Connect | Place symbol; connect edges | Objects appear on canvas | ☐ | |
| MV-05 | Undo / Redo | Perform edit; Undo; Redo | History stack works | ☐ | |
| MV-06 | Compile HMI | Compile HMI from draw | HMI screens generated or errors shown | ☐ | |
| MV-07 | Export package | Export package action | File downloads | ☐ | |
| MV-08 | Unsaved changes alert | Navigate away with edits | Confirmation modal appears | ☐ | |
| MV-09 | Responsive layout | Viewport ≤640px | Toolbar/layout adapts per breakpoints | ☐ | |

---

## 17. Cloud Studio shared chrome

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| CS-01 | Brand header | Any Cloud Studio page | PeakLogic brand visible | ☐ | |
| CS-02 | Tenant slug label | Logged-in user on `/sites` | Correct tenant slug displayed | ☐ | |
| CS-03 | Active nav highlight | Navigate between pages | Current page nav item highlighted | ☐ | |
| CS-04 | Sign out — all pages | Sign out from People, Fleet, etc. | Consistent logout behavior | ☐ | |
| CS-05 | Nav wrap — mobile | Viewport ≤720px | Nav wraps; all links reachable | ☐ | |

---

## 18. Health, API & degraded states

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| DEG-01 | Health endpoint | GET `/health` | JSON status: deployment, runtime, dependencies | ☐ | |
| DEG-02 | MongoDB unavailable | Simulate DB down (if possible) | UI shows graceful errors; no white screen | ☐ | |
| DEG-03 | MQTT broker offline | Stop broker | Drivers/MQTT sections show offline; app usable | ☐ | |
| DEG-04 | Empty data tables | Fresh tenant, no sites/devices | Empty states with guidance, not broken UI | ☐ | |
| DEG-05 | API error handling | Force 500 on an API call | User-facing error message; no silent failure | ☐ | |
| DEG-06 | Session expired | Invalidate session cookie; click action | Redirect to login with message | ☐ | |

---

## 19. Cross-browser & accessibility smoke

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| XBR-01 | Chrome desktop | Run AUTH-02, SHELL-06, SITE-02 | All pass on Chrome | ☐ | |
| XBR-02 | Edge desktop | Run AUTH-02, HMI-01, FLEET-02 | All pass on Edge | ☐ | |
| XBR-03 | Firefox desktop | Run login + Studio load | No layout breakage | ☐ | |
| XBR-04 | Keyboard navigation | Tab through login form | Focus order logical; Enter submits | ☐ | |
| XBR-05 | Color contrast — login | Inspect login card text | Readable against Purple Standard background | ☐ | |

---

## 20. End-to-end integration flows

| ID | Test case | Steps | Expected result | Result | Notes |
|----|-----------|-------|-----------------|--------|-------|
| E2E-01 | Platform onboarding | Admin creates tenant → adds user via People | New user can log in to Studio | ☐ | |
| E2E-02 | Site pairing flow | Create site → copy code → configure edge agent | Agent online; cameras sync | ☐ | |
| E2E-03 | Commissioning flow | System setup → Drivers → Tags → Program → HMI Apply | Project runs; HMI live | ☐ | |
| E2E-04 | Operator day shift | Login → HMI → ack alarm → open camera → sign out | Full shift workflow without errors | ☐ | |
| E2E-05 | CMMS maintenance | Enable CMMS → create PM → generate WO → complete | WO lifecycle complete | ☐ | |
| E2E-06 | Fleet visibility | Add site + device + fleet asset | All three views consistent | ☐ | |

---

## Sign-off summary

| Metric | Count |
|--------|-------|
| **Total test cases** | 175 |
| **Passed** | |
| **Failed** | |
| **N/A** | |
| **Pass rate** | |

### Open defects

| ID | Severity | Summary | Ticket |
|----|----------|---------|--------|
| | | | |
| | | | |

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA / Tester | | | |
| Product owner | | | |
| Engineering lead | | | |

---

*Generated from PeakLogic MVP Suite cloud UI inventory. Routes and features reflect `PEAKLOGIC_DEPLOYMENT=cloud` SaaS mode (port 3100).*
