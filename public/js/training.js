'use strict';

/**
 * PeakLogic Training — full curriculum (PeakLogic M0–M15 + IoT CBM CBM-1–CBM-13).
 * Open via Tools → Training.
 */
window.PeaklogicTraining = (function () {
  const MV_MODULES = [
    {
      id: 'm0',
      title: 'M0 — Product map & first launch',
      hours: 1,
      level: 'Foundation',
      prereq: '—',
      outcomes: 'Name appliance vs Cloud Studio vs embedded est; start MVP Suite; open dashboard (not Facility Draw); open F1 help.',
      lab: 'npm install → npm start → http://127.0.0.1:3090 (dashboard) → F1 Getting started.',
      help: 'F1 → Getting started',
    },
    {
      id: 'm1',
      title: 'M1 — UI layout, roles & projects',
      hours: 1.5,
      level: 'Foundation',
      prereq: 'M0',
      outcomes: 'Navigate Project ▾ and Tools ▾; create/open/import/save/export .est.zip projects.',
      lab: 'New project → Save as → Export .est.zip → Import on same or second PC.',
      help: 'F1 → Screen layout, Projects',
    },
    {
      id: 'm2',
      title: 'M2 — Commissioning path (end-to-end)',
      hours: 2,
      level: 'Core',
      prereq: 'M1',
      outcomes: 'Run standard commission sequence; explain template vs fixture vs composite.',
      lab: 'Follow F1 Commissioning tutorial with device template + one composite.',
      help: 'F1 → Commissioning tutorial',
    },
    {
      id: 'm3',
      title: 'M3 — Tags, scaling, Force & Live I/O',
      hours: 2,
      level: 'Core',
      prereq: 'M2',
      outcomes: 'Create/bind tags; configure scale and alarms; use Force safely.',
      lab: 'Force an input; confirm ST reaction in Program live trace; clear Force.',
      help: 'F1 → Tags, Alarms',
    },
    {
      id: 'm4',
      title: 'M4 — Drivers, templates & field buses',
      hours: 2.5,
      level: 'Core',
      prereq: 'M3',
      outcomes: 'Add/test drivers; apply device template; troubleshoot Modbus RTU; optional BACnet/IP discover and tag import; optional EZ Meter facility PQ two-step apply.',
      lab: 'Apply Datexel or mock template → verify tags → Test driver. Optional: `bacnet` driver → Discover → Load example tags. Optional: EZ Meter full map + derived PQ set → `MECH_PQ_KW_SUM` live.',
      help: 'F1 → Drivers + Device guides; docs/BACNET.md; docs/facilities/EZMETER_FACILITY_PQ.md',
    },
    {
      id: 'm5',
      title: 'M5 — ST program & scan-cycle runtime',
      hours: 3,
      level: 'Core',
      prereq: 'M3',
      outcomes: 'Edit, validate, run ST; explain scan cycle; use Start/Pause/Stop.',
      lab: 'Load motor HOA fixture, Validate, Start, Force HOA inputs.',
      help: 'F1 → ST program editor, Runtime',
    },
    {
      id: 'm6',
      title: 'M6 — HMI composer & operator display',
      hours: 2.5,
      level: 'Core',
      prereq: 'M5',
      outcomes: 'Build multi-tile screen; bind tags; set starting screen.',
      lab: 'Place Motor/HOA composite, bind tags, Apply, set as starting screen.',
      help: 'F1 → HMI overview, composer, bindings',
    },
    {
      id: 'm7',
      title: 'M7 — MQTT Parc hub & Arduino Opta',
      hours: 3,
      level: 'Advanced',
      prereq: 'M4, M5',
      outcomes: 'Enable Parc hub; register Opta; remote Download & Start.',
      lab: 'Complete docs/BASELINE_TEST.md: hub up, telemetry, remote ST.',
      help: 'F1 → MQTT Parc hub & Opta; docs/MQTT_PARC.md',
    },
    {
      id: 'm8',
      title: 'M8 — Historian, pens & reports',
      hours: 2,
      level: 'Advanced',
      prereq: 'M3',
      outcomes: 'Enable Hist; configure pens; export CSV/PDF report.',
      lab: 'Enable Hist on two tags, configure pens, capture 5 min, export CSV.',
      help: 'F1 → Historian, Pen config, Logger, Report',
    },
    {
      id: 'm9',
      title: 'M9 — Alarms, notifications & CMMS',
      hours: 2,
      level: 'Advanced',
      prereq: 'M3',
      outcomes: 'Configure alarm limits; ack workflow; use integrated /cmms work orders; distinguish reactive alarm WO vs proactive PdM WO; optional external CMMS MQTT v1 bridge.',
      lab: 'Trip high-limit alarm, Ack, open /cmms and verify alarm WO; seed PdM demo and verify proactive PM WO (source pdm); review CMMS_APPLIANCE.md and PDM_PROACTIVE_CMMS.md.',
      help: 'F1 → Alarms, Integrated CMMS; docs/CMMS_APPLIANCE.md',
    },
    {
      id: 'm10',
      title: 'M10 — Facility Draw site plans',
      hours: 2,
      level: 'Specialty',
      prereq: 'M1',
      outcomes: 'Open Facility Draw; scale plan; place symbols; save into .est.zip project.',
      lab: 'Open assisted-living plan; place symbols; Save to PeakLogic project; export .est.zip.',
      help: 'F1 → Facility Draw; facility-draw/README.md',
    },
    {
      id: 'm11',
      title: 'M11 — PdM & ROI',
      hours: 1.5,
      level: 'Specialty',
      prereq: 'M8',
      outcomes: 'Configure PdM assets; interpret forecast; run proactive CMMS check; complete PM WO and verify service history; run ROI calculator.',
      lab: 'Logger config → PdM: seed demo data, build features, run proactive check, open /cmms, download PdM PDF.',
      help: 'F1 → PdM, Integrated CMMS, ROI calculator; docs/pdm/PDM_PROACTIVE_CMMS.md',
    },
    {
      id: 'm12',
      title: 'M12 — Cloud Studio & entitlements',
      hours: 2,
      level: 'Specialty',
      prereq: 'M0, M7 recommended',
      outcomes: 'Log into Cloud Studio with organization ID; use Sites, All devices, Assets map, and /cmms when entitled; explain edge vs cloud field buses.',
      lab: 'Local: npm run start:saas && npm run seed; sign in org demo; tour /sites, /sites/devices, /fleet, /cmms; Deploy/Share a project in Studio. Production: see docs/CLOUD_DEPLOY_DO.md.',
      help: 'F1 → Cloud Studio, Integrated CMMS; docs/CLOUD_USER_GUIDE.md',
    },
    {
      id: 'm13',
      title: 'M13 — Vertical lab (choose one)',
      hours: 3,
      level: 'Specialty',
      prereq: 'M6',
      outcomes: 'Commission domain demo end-to-end; present operator HMI + alarms.',
      lab: 'Open vertical .est.zip demo; complete M2–M6 path; demo to peer.',
      help: 'scripts/*/generate-est.js + product-templates/',
    },
    {
      id: 'm14',
      title: 'M14 — Parc edge peers (LilyGO HaLow & cellular)',
      hours: 3,
      level: 'Specialty',
      prereq: 'M7',
      outcomes: 'Commission LilyGO T-HaLow and T-ETH Parc peers after Opta baseline.',
      lab: 'Complete M7 Opta baseline first; then flash T-HaLow template #2 and T-ETH gateway.',
      help: 'Training → Parc tab; halow-xiao-sta/README.md; cellular-opta-gateway/README.md',
    },
    {
      id: 'm15',
      title: 'M15 — IP cameras & vision AI',
      hours: 2.5,
      level: 'Specialty',
      prereq: 'M6; MongoDB recommended',
      outcomes: 'Discover ONVIF cameras; probe Reolink; place HMI camera popup or overlay tile; configure I/O overlays; archive snapshots to GridFS; configure vision AI stub or HTTP backend.',
      lab: 'Tools → Cameras: credentials → Discover → Probe → Detail overlays → HMI camera overlay tile → Capture snapshot → Run infer (stub). Optional: go2rtc download + live player.',
      help: 'F1 → Cameras & video; docs/CAMERAS.md; F2 → M15 quiz',
    },
  ];

  const CBM_MODULES = [
    { id: 'cbm1', num: 1, title: 'Introduction to Condition-Based Monitoring', mapsTo: 'M11, M0', exercise: 'Compare reactive vs preventive vs CBM maintenance costs.' },
    { id: 'cbm2', num: 2, title: 'IoT Fundamentals', mapsTo: 'M0, M7, M14', exercise: 'Draw IoT architecture for a commercial building.' },
    { id: 'cbm3', num: 3, title: 'Sensors Used in Condition Monitoring', mapsTo: 'M3, M4, M14', exercise: 'Match each sensor type to the monitored asset.' },
    { id: 'cbm4', num: 4, title: 'Residential Applications', mapsTo: 'M13 vertical', exercise: 'Case study: whole-home monitoring implementation.' },
    { id: 'cbm5', num: 5, title: 'Commercial Applications', mapsTo: 'M13 vertical, M4 BACnet', exercise: 'Case study: multi-site office building monitoring; optional BAS point import.' },
    { id: 'cbm6', num: 6, title: 'Installation & Commissioning', mapsTo: 'M2, M4, M14', exercise: 'Install sensors on demonstration equipment.' },
    { id: 'cbm7', num: 7, title: 'Connectivity & Networking', mapsTo: 'M7, M12, M14', exercise: 'Configure gateway network and cloud reachability.' },
    { id: 'cbm8', num: 8, title: 'Cloud Platforms & Dashboards — PeakLogic', mapsTo: 'M6, M8, M12, M15', exercise: 'Create HVAC equipment dashboard in PeakLogic; add camera popup on mechanical room screen.' },
    { id: 'cbm9', num: 9, title: 'Alarm Management', mapsTo: 'M9', exercise: 'Configure high temp, vibration, leak, power failure alarms.' },
    { id: 'cbm10', num: 10, title: 'Data Analysis & Predictive Maintenance', mapsTo: 'M8, M11, M9, M15', exercise: 'Analyze six months of equipment trend data; review camera inference history.' },
    { id: 'cbm11', num: 11, title: 'Cybersecurity Best Practices', mapsTo: 'M1, M12', exercise: 'Review user roles and cloud tenant isolation.' },
    { id: 'cbm12', num: 12, title: 'Troubleshooting', mapsTo: 'M4, M7, F1 device guides', exercise: 'Diagnose offline Parc device and restore telemetry.' },
    { id: 'cbm13', num: 13, title: 'Hands-On Capstone Project', mapsTo: 'M13 + M2–M9 + M14 + M15 (optional)', exercise: 'Team capstone: full CBM deployment on demo site; optional camera on critical asset.' },
  ];

  const CBM_TOPICS = {
    cbm1: 'Define CBM; compare reactive, preventive, predictive, condition-based maintenance; ROI; remote monitoring.',
    cbm2: 'Sensors, controllers, edge devices, gateways, PeakLogic cloud, mobile apps; Wi-Fi, Ethernet, Bluetooth, HaLow, cellular.',
    cbm3: 'Temperature, vibration/MCSA, current, voltage, pressure, flow, environmental, leak, occupancy sensors.',
    cbm4: 'Heat pumps, A/C, furnaces, water heaters, sump pumps, IAQ, leak detection, solar, battery storage.',
    cbm5: 'Commercial HVAC, chillers, towers, boilers, compressors, pumps, refrigeration, BAS (PeakLogic BACnet/IP coexistence), generators.',
    cbm6: 'Site surveys, sensor placement, mounting, wiring, wireless survey, gateway install, calibration, functional test.',
    cbm7: 'IP addressing, DHCP, static IP, Wi-Fi, Ethernet, cellular, VPN, firewalls, cloud communications.',
    cbm8: 'Device registration, dashboard design, trend charts, asset management, reports, API integration.',
    cbm9: 'Thresholds, warning vs critical, escalation, notifications, suppression, workflows.',
    cbm10: 'Baseline measurements, trend analysis, RUL, energy consumption, maintenance recommendations, work orders.',
    cbm11: 'Passwords, MFA, encryption, secure remote access, firmware updates, network segmentation.',
    cbm12: 'Offline devices, sensor failures, gateway issues, network problems, calibration, firmware recovery.',
    cbm13: 'Site survey → install → gateway → cloud → dashboards → alarms → analysis → presentation.',
  };

  const INSTRUCTOR_MV = [
    { id: 'm0', title: 'M0 — Product map & first launch', time: '60 min', prep: 'Port 3090 free; sample .est.zip ready.', teach: 'Product map → npm start → dashboard at / → F1 vs F2 → save empty project.', lab: 'Each student saves training-{name}.est.zip.', pitfalls: 'Wrong port; npm PATH; opening /facility-draw instead of dashboard.', verify: 'MVP Suite dashboard + saved project.' },
    { id: 'm1', title: 'M1 — UI layout, roles & projects', time: '90 min', prep: 'Sample .est.zip on share.', teach: 'Top bar, Project menu, Tools menu, import/export zip and legacy json archives.', lab: 'New → Save as → Export → Import → reopen.', pitfalls: 'Save vs Save as; legacy .est.json needs Import project file, not Open.', verify: 'Reopened export shows correct name and tag count.' },
    { id: 'm2', title: 'M2 — Commissioning path', time: '120 min', prep: 'Device template + composite in scratch project.', teach: 'F1 Commissioning tutorial; template vs fixture vs composite; spine.', lab: 'Follow tutorial with template + composite.', pitfalls: 'Skipping Validate or System setup Apply.', verify: 'Checkpoint A oral + saved .est.zip.' },
    { id: 'm3', title: 'M3 — Tags, Force & Live I/O', time: '120 min', prep: 'Motor HOA fixture loaded.', teach: 'Tag id/Label; scaling; Force safety; Live I/O.', lab: 'Force input; trace ST; clear Force.', pitfalls: 'Forcing outputs on live plant.', verify: 'Trace shows forced value.' },
    { id: 'm4', title: 'M4 — Drivers & field buses', time: '150 min', prep: 'Modbus USB or mock; know COM port. Optional BACnet/IP on lab VLAN. Optional EZ Meter or Modbus PQ simulator.', teach: 'Driver Test/Apply; templates; Modbus troubleshooting; bacnet Discover/Browse; EZ Meter two-step PQ apply.', lab: 'Apply template → Test → live tags. Optional: bacnet import or EZ Meter PQ derived set.', pitfalls: 'Wrong COM/slave ID; BACnet on wrong VLAN; derived set before full map.', verify: 'Driver Test passes; MECH_PQ_* live when ST running.' },
    { id: 'm5', title: 'M5 — ST & scan cycle', time: '180 min', prep: 'HOA fixture; syntax error for Validate demo.', teach: 'Validate; scan cycle; Start/Pause/Stop; trace.', lab: 'Load fixture, Start, Force inputs.', pitfalls: 'Edit without re-validate.', verify: 'Runtime Running.' },
    { id: 'm6', title: 'M6 — HMI composer', time: '150 min', prep: 'Tags from M5 for bindings.', teach: 'Composites; bindings; Apply; starting screen.', lab: 'Motor/HOA composite bound.', pitfalls: '??? bindings; forgot Apply.', verify: 'Checkpoint B full path.' },
    { id: 'm7', title: 'M7 — Parc hub & Opta', time: '180 min', prep: 'Opta flashed; broker up; BASELINE_TEST on board.', teach: 'Parc topics; hub enable; mqtt_parc; Download & Start.', lab: 'Rotate pairs on Opta bench.', pitfalls: 'Hub off; deviceId typo.', verify: 'Checkpoint C telemetry + remote start.' },
    { id: 'm8', title: 'M8 — Historian & reports', time: '120 min', prep: 'Mongo optional; two changing tags.', teach: 'Hist vs pens; logger; CSV export.', lab: '5 min capture; export CSV.', pitfalls: 'Hist unchecked; runtime stopped.', verify: 'CSV has timestamps.' },
    { id: 'm9', title: 'M9 — Alarms & CMMS', time: '120 min', prep: 'Tag with IH limit; CMMS enabled for student login.', teach: 'Limits; ack; integrated /cmms WO + alarm auto-WO (reactive); PdM proactive PM WO (early warning); external MQTT bridge (optional).', lab: 'Trip alarm; Ack; open CMMS; seed PdM and verify proactive WO.', pitfalls: 'Wrong tag type for limit; confusing integrated CMMS vs MQTT publish; reactive vs proactive WO.', verify: 'Alarm trips, acks, CMMS WO visible; student explains proactive vs reactive.' },
    { id: 'm10', title: 'M10 — Facility Draw', time: '120 min', prep: 'Assisted-living plan asset.', teach: 'Scale plan; symbols; Save to PeakLogic project; .est.zip includes facility-draw/.', lab: 'Place symbols; save to project; export .est.zip; reload.', pitfalls: 'Lost scale factor; Plan composer mode vs dashboard.', verify: 'Symbols persist after import on second machine.' },
    { id: 'm11', title: 'M11 — PdM & ROI', time: '90 min', prep: 'Demo with Hist or edge samples; Mongo recommended.', teach: 'Asset setup; health index; forecast; proactive CMMS; ROI calc — proactive not reactive.', lab: 'Seed demo data; build features; proactive check; CMMS WO; PdM PDF.', pitfalls: 'No data — use Seed demo data; proactive disabled in settings.', verify: 'Student explains forecast + proactive PM WO.' },
    { id: 'm12', title: 'M12 — Cloud Studio', time: '120 min', prep: 'Local: npm run start:saas + npm run seed. Or hosted DO droplet.', teach: 'Organization ID login; Sites, All devices, Assets map, /cmms entitlement; edge vs cloud field buses (Modbus, BACnet/IP); Deploy/Share project. Optional: CLOUD_DEPLOY_DO.md for integrators.', lab: 'Sign in org demo; tour /sites, /sites/devices, /fleet, /cmms; Deploy/Share in Studio; explain appliance + cloud remote uplink.', pitfalls: 'Cloud down — use slides; Modbus/BACnet on cloud fails by design — use edge appliance.', verify: 'Login + device inventory + map colors explained; CMMS entitlement articulated if enabled.' },
    { id: 'm13', title: 'M13 — Vertical lab', time: '180 min', prep: 'Vertical .est.zip per team.', teach: 'Assign vertical; M2–M6 on domain demo.', lab: 'Peer demo 10 min.', pitfalls: 'Team skips alarms.', verify: 'Final demo rubric.' },
    { id: 'm14', title: 'M14 — Parc edge peers', time: '180 min', prep: 'M7 done; T-HaLow/gateway charged.', teach: 'HaLow setup AP vs data path; T-ETH bridge.', lab: 'Template #2 or cellular bridge.', pitfalls: 'Broker on wrong interface.', verify: 'Checkpoint D peer telemetry.' },
    { id: 'm15', title: 'M15 — IP cameras & vision AI', time: '150 min', prep: 'One ONVIF camera on LAN; Mongo optional; go2rtc download script run.', teach: 'ONVIF discover/probe; go2rtc vs MJPEG; GridFS archive; overlay registry + tag bridge; AI stub vs HTTP.', lab: 'Discover → Probe → Detail overlays → HMI overlay tile → snapshot → infer.', pitfalls: 'ONVIF off on camera; no Mongo for GridFS; overlay tile without registry.', verify: 'Checkpoint E: live HMI video + one BOOL overlay updates + one archived snapshot.' },
  ];

  const INSTRUCTOR_CBM = [
    { id: 'cbm1', title: 'CBM-1 — Intro to CBM', time: '60 min', teach: 'Maintenance strategies; downtime cost; ROI.', exercise: 'Group cost compare one pump.', mapsTo: 'M11 preview' },
    { id: 'cbm2', title: 'CBM-2 — IoT fundamentals', time: '75 min', teach: 'Architecture diagram; connectivity options.', exercise: 'Draw commercial building IoT.', mapsTo: 'M0, M7, M14' },
    { id: 'cbm3', title: 'CBM-3 — Sensors', time: '90 min', teach: 'Sensor categories table; pass physical samples.', exercise: 'Match sensor to asset.', mapsTo: 'M3, M4, M14' },
    { id: 'cbm4', title: 'CBM-4 — Residential', time: '60 min', teach: 'Whole-home case study.', exercise: 'Leak + temp alarm plan.', mapsTo: 'M13 vertical' },
    { id: 'cbm5', title: 'CBM-5 — Commercial', time: '60 min', teach: 'Multi-site office case.', exercise: 'Centralized alarm escalation.', mapsTo: 'M13; Position ID' },
    { id: 'cbm6', title: 'CBM-6 — Installation', time: '120 min', teach: 'Site survey; mounting; wiring safety.', exercise: 'Install on demo skid.', mapsTo: 'M2, M4' },
    { id: 'cbm7', title: 'CBM-7 — Networking', time: '90 min', teach: 'IP, DHCP, cellular, VPN.', exercise: 'Classroom IP table.', mapsTo: 'M7, M12, M14' },
    { id: 'cbm8', title: 'CBM-8 — Dashboards', time: '120 min', teach: 'PeakLogic registration + HMI; optional camera popup.', exercise: 'HVAC dashboard lab.', mapsTo: 'M6, M8, M15' },
    { id: 'cbm9', title: 'CBM-9 — Alarms', time: '90 min', teach: 'Thresholds; escalation.', exercise: 'Four alarm types.', mapsTo: 'M9' },
    { id: 'cbm10', title: 'CBM-10 — PdM analysis', time: '90 min', teach: 'Trends; RUL; proactive CMMS before alarm.', exercise: 'Seed PdM demo; verify proactive WO.', mapsTo: 'M8, M11, M9' },
    { id: 'cbm11', title: 'CBM-11 — Cybersecurity', time: '60 min', teach: 'MFA; segmentation; creds on gateway.', exercise: 'Review roles.', mapsTo: 'M1, M12' },
    { id: 'cbm12', title: 'CBM-12 — Troubleshooting', time: '90 min', teach: 'Fault injection lab.', exercise: 'Diagnose injected fault.', mapsTo: 'M4, M7' },
    { id: 'cbm13', title: 'CBM-13 — Capstone', time: '240 min', teach: 'Team roles; full deployment.', exercise: 'Present recommendations.', mapsTo: 'M13 + M2–M9 + M14 + M15 (optional)' },
  ];

  function instructorModuleHtml(m, isCbm) {
    if (isCbm) {
      return `
        <p><strong>Time:</strong> ${m.time} · <strong>PeakLogic labs:</strong> ${m.mapsTo}</p>
        <h4>Teach</h4><p>${m.teach}</p>
        <h4>Exercise</h4><p>${m.exercise}</p>
      `;
    }
    return `
      <p><strong>Time:</strong> ${m.time}</p>
      <h4>Prep</h4><p>${m.prep}</p>
      <h4>Teach</h4><p>${m.teach}</p>
      <h4>Lab</h4><p>${m.lab}</p>
      <h4>Pitfalls</h4><p>${m.pitfalls}</p>
      <h4>Verify</h4><p>${m.verify}</p>
    `;
  }

  function buildInstructorSections() {
    const core = [
      {
        id: 'ig-intro',
        title: 'How to use this guide',
        html: `
          <p>Instructor-facing notes for the unified <strong>PeakLogic M0–M15</strong> + <strong>IoT CBM CBM-1–CBM-13</strong> curriculum. Learners use other Training tabs; trainers use this tab and the full document:</p>
          <p><code>docs/training/instructor-guide.md</code></p>
          <h4>Opening script</h4>
          <p>Start every cohort with F2 → <strong>Overview → Start here</strong>. Who / Where / What / Why / How — about 10–15 minutes before M0 or CBM-1.</p>
          <h4>Each module includes</h4>
          <ul>
            <li><strong>Prep</strong> — verify before class</li>
            <li><strong>Teach</strong> — lecture/demo sequence</li>
            <li><strong>Lab</strong> — hands-on facilitation</li>
            <li><strong>Pitfalls</strong> — common student mistakes</li>
            <li><strong>Verify</strong> — pass criteria before advancing</li>
          </ul>
          <h4>Delivery models</h4>
          <table class="help-table">
            <tr><th>Model</th><th>Duration</th><th>Modules</th></tr>
            <tr><td>CBM Basic</td><td>1 day</td><td>CBM-1–4 + M0</td></tr>
            <tr><td>CBM Intermediate</td><td>2 days</td><td>CBM-1–10 + M6/M8/M9</td></tr>
            <tr><td>CBM Advanced</td><td>3 days</td><td>Full CBM + capstone</td></tr>
            <tr><td>PeakLogic Operator</td><td>~12 h</td><td>M0, M1, M3, M6, M8, M9, M13</td></tr>
            <tr><td>PeakLogic Integrator</td><td>~7 days</td><td>M0–M15</td></tr>
          </table>
        `,
      },
      {
        id: 'ig-prep',
        title: 'Pre-course checklist',
        html: `
          <h4>Software (per laptop)</h4>
          <ul>
            <li>Node.js LTS; <code>npm install</code>; <code>npm start</code> → port 3090</li>
            <li>Optional MongoDB for historian archive (M8, M10, M11) and camera GridFS (M15)</li>
          </ul>
          <h4>Instructor demo machine</h4>
          <ul>
            <li>Known-good vertical .est.zip projects; motor HOA fixture</li>
            <li>Optional: portable install bundle (<code>npm run build:portable-install</code>) for handoff labs</li>
            <li>F1 Help and F2 Training tested on projector</li>
          </ul>
          <h4>Hardware bench (integrator track)</h4>
          <ul>
            <li>Arduino Opta (MQTT Parc ST) · local Mosquitto broker</li>
            <li>Optional: LilyGO T-HaLow, T-ETH cellular gateway</li>
            <li>Optional: ONVIF IP camera (Reolink) on classroom LAN for M15</li>
            <li>Modbus USB/mock · sensor samples (CT, leak, thermistor)</li>
          </ul>
          <h4>Day-before runbook</h4>
          <ol>
            <li>Run BASELINE_TEST end-to-end; label Opta deviceId</li>
            <li>Run <code>npm run go2rtc:download</code> if teaching M15</li>
            <li>Export gold .est.zip recovery project</li>
            <li>Print checkpoint rubrics; test HDMI</li>
          </ol>
        `,
      },
      {
        id: 'ig-schedules',
        title: 'Delivery schedules',
        html: `
          <h4>CBM certification — 3 days</h4>
          <table class="help-table">
            <tr><th>Day</th><th>AM</th><th>PM</th></tr>
            <tr><td>1</td><td>CBM-1–3 + quiz</td><td>CBM-4–5; M0 demo</td></tr>
            <tr><td>2</td><td>CBM-6 install lab</td><td>CBM-7–8 + M6 dashboard</td></tr>
            <tr><td>3</td><td>CBM-9–10</td><td>CBM-11–12; CBM-13 capstone</td></tr>
          </table>
          <h4>PeakLogic integrator — 7 days</h4>
          <table class="help-table">
            <tr><th>Day</th><th>Modules</th><th>Checkpoint</th></tr>
            <tr><td>1</td><td>M0, M1, M2</td><td>A</td></tr>
            <tr><td>2</td><td>M3, M4</td><td>—</td></tr>
            <tr><td>3</td><td>M5, M6</td><td>B</td></tr>
            <tr><td>4</td><td>M7</td><td>C</td></tr>
            <tr><td>5</td><td>M8, M9</td><td>—</td></tr>
            <tr><td>6</td><td>M14</td><td>D</td></tr>
            <tr><td>7+</td><td>M10–M13, M15</td><td>E (optional) / Final</td></tr>
          </table>
        `,
      },
      {
        id: 'ig-rubrics',
        title: 'Assessment rubrics',
        html: `
          <h4>PeakLogic checkpoints</h4>
          <table class="help-table">
            <tr><th>Gate</th><th>Pass criteria</th></tr>
            <tr><td>A (M2)</td><td>Template vs fixture vs composite; saved .est.zip</td></tr>
            <tr><td>B (M6)</td><td>Tags live; ST running; HMI bound</td></tr>
            <tr><td>C (M7)</td><td>Parc telemetry + Download &amp; Start</td></tr>
            <tr><td>D (M14)</td><td>T-HaLow tags and/or T-ETH cloud bridge</td></tr>
            <tr><td>E (M15, optional)</td><td>Camera probed; HMI popup live; one GridFS snapshot</td></tr>
            <tr><td>Final</td><td>Vertical demo: HMI + alarm ack + trend</td></tr>
          </table>
          <h4>Capstone rubric (100 pts)</h4>
          <table class="help-table">
            <tr><th>Criterion</th><th>Pts</th></tr>
            <tr><td>Site survey documented</td><td>10</td></tr>
            <tr><td>Gateway commissioned</td><td>20</td></tr>
            <tr><td>Drivers + tags correct</td><td>15</td></tr>
            <tr><td>ST/logic running</td><td>15</td></tr>
            <tr><td>Operator HMI</td><td>15</td></tr>
            <tr><td>Alarms demonstrated</td><td>10</td></tr>
            <tr><td>Historian/trend</td><td>10</td></tr>
            <tr><td>Presentation</td><td>5</td></tr>
          </table>
        `,
      },
      {
        id: 'ig-parc-labs',
        title: 'Parc hardware facilitator script',
        html: `
          <h4>Opta baseline (M7 / Checkpoint C)</h4>
          <ol>
            <li>Mosquitto listening; Opta <code>/setup</code> — broker IP, deviceId</li>
            <li>System setup → MQTT Parc → enable → Apply</li>
            <li>Drivers → Arduino Opta — MQTT Parc ST runtime → match deviceId</li>
            <li>Sync tags from device after telemetry (~30 s)</li>
            <li>Program → Remote → Download &amp; Start</li>
          </ol>
          <h4>T-HaLow (M14)</h4>
          <ol>
            <li>AP <code>PeakLogic-T-HaLow</code> → <code>192.168.4.1:8080/setup</code></li>
            <li>Set HaLow broker IP, deviceId, template #2</li>
            <li>Pair HaLow; add driver; Sync tags</li>
          </ol>
          <h4>T-ETH bridge (M14)</h4>
          <ol>
            <li>Gateway <code>PeakLogic-Gateway</code> → cloud broker + APN</li>
            <li>Opta broker = <code>192.168.1.1:1883</code></li>
            <li>Confirm <code>peaklogic/v1/#</code> on cloud broker</li>
          </ol>
          <h4>IP cameras (M15 / Checkpoint E)</h4>
          <ol>
            <li>Camera: ONVIF + RTSP enabled</li>
            <li>Tools → Cameras → credentials → Discover → Probe</li>
            <li>Optional go2rtc: <code>npm run go2rtc:download</code></li>
            <li>Detail tab: add BOOL overlay (tag, X/Y %, snapshot on rising)</li>
            <li>HMI <strong>Camera + I/O overlays</strong> tile (span 2×2) → inventory picker → Apply</li>
            <li>Live HMI: video + overlay reacts to tag; capture snapshot; Run infer (stub)</li>
          </ol>
          <p><strong>Stuck?</strong> <code>mosquitto_sub -t 'peaklogic/v1/#' -v</code> · cameras: <code>docs/CAMERAS.md</code></p>
        `,
      },
      {
        id: 'ig-troubleshoot',
        title: 'Instructor quick fixes',
        html: `
          <table class="help-table">
            <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
            <tr><td>Blank HMI</td><td>Bindings not Applied</td><td>HMI Apply</td></tr>
            <tr><td>Driver Test fail</td><td>COM/slave/IP</td><td>F1 serial guide</td></tr>
            <tr><td>No Parc telemetry</td><td>Hub disabled</td><td>System setup → MQTT Parc</td></tr>
            <tr><td>Download timeout</td><td>deviceId mismatch</td><td>Compare Opta /setup vs driver</td></tr>
            <tr><td>Flat historian</td><td>Hist off or runtime stopped</td><td>Tags Hist + Start</td></tr>
            <tr><td>Alarm no trip</td><td>Wrong limit/type</td><td>Tags alarm column</td></tr>
          </table>
          <h4>CBM-12 fault injection ideas</h4>
          <ul>
            <li>Stop broker → Parc offline</li>
            <li>Wrong Modbus slave → Test fails</li>
            <li>Uncheck Hist → flat trend</li>
            <li>Stop runtime → frozen outputs</li>
          </ul>
        `,
      },
    ];
    const mv = INSTRUCTOR_MV.map((m) => ({
      id: m.id,
      title: m.title,
      html: instructorModuleHtml(m, false),
    }));
    const cbm = INSTRUCTOR_CBM.map((m) => ({
      id: m.id,
      title: m.title,
      html: instructorModuleHtml(m, true),
    }));
    return [
      ...core,
      { id: 'ig-mv-header', title: 'PeakLogic modules (M0–M15)', html: '<p>Module-by-module instructor notes. Cross-reference learner tab <strong>PeakLogic</strong>.</p>' },
      ...mv,
      { id: 'ig-cbm-header', title: 'IoT CBM modules (CBM-1–CBM-13)', html: '<p>Theory and exercises. Cross-reference learner tab <strong>IoT CBM</strong> and <strong>Mapping</strong>.</p>' },
      ...cbm,
    ];
  }

  const TOP_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'peaklogic', label: 'PeakLogic' },
    { id: 'cbm', label: 'IoT CBM' },
    { id: 'mapping', label: 'Mapping' },
    { id: 'parc', label: 'Parc' },
    { id: 'quizzes', label: 'Quizzes' },
    { id: 'instructor', label: 'Instructor' },
    { id: 'assess', label: 'Assessments' },
    { id: 'glossary', label: 'Glossary' },
  ];

  let rendered = false;
  let activeTab = 'overview';

  function mvModuleHtml(m) {
    return `
      <p><strong>Level:</strong> ${m.level} · <strong>Hours:</strong> ${m.hours} · <strong>Prereq:</strong> ${m.prereq}</p>
      <h4>Outcomes</h4>
      <p>${m.outcomes}</p>
      <h4>Lab</h4>
      <p>${m.lab}</p>
      <p><strong>Reference:</strong> ${m.help}</p>
    `;
  }

  function cbmModuleHtml(m) {
    return `
      <p><strong>PeakLogic labs:</strong> ${m.mapsTo}</p>
      <h4>Topics</h4>
      <p>${CBM_TOPICS[m.id] || ''}</p>
      <h4>Exercise</h4>
      <p>${m.exercise}</p>
    `;
  }

  function buildMvSections() {
    return MV_MODULES.map((m) => ({
      id: m.id,
      title: m.title,
      html: mvModuleHtml(m),
    }));
  }

  function buildCbmSections() {
    return CBM_MODULES.map((m) => ({
      id: m.id,
      title: `CBM-${m.num} — ${m.title}`,
      html: cbmModuleHtml(m),
    }));
  }

  const TAB_CONTENT = {
    overview: {
      nav: false,
      html: `
        <section class="help-section">
          <h3>Start here — plain introduction</h3>
          <p class="training-intro-lead">Read this first if you are new to PeakLogic or building monitoring.</p>
          <table class="help-table training-intro-table">
            <tr><th>Who</th><td>This training is for people who work on buildings and equipment: HVAC and service technicians, electricians, maintenance staff, facility managers, building engineers, sales staff, and anyone learning to set up PeakLogic.</td></tr>
            <tr><th>Where</th><td>You learn in a classroom or on a laptop running PeakLogic at <code>http://127.0.0.1:3090</code> (press <kbd>F2</kbd> for this Training screen). On real jobs, sensors and controllers sit in mechanical rooms, on rooftops, and inside equipment. Data can stay on-site or go to the cloud through a gateway.</td></tr>
            <tr><th>What</th><td><strong>PeakLogic</strong> is software that watches building equipment—heaters, air conditioners, pumps, leaks, and power use. This course has two parts: <strong>CBM-1–CBM-13</strong> explains <em>why</em> and <em>when</em> to monitor equipment health; <strong>M0–M15</strong> shows <em>how</em> to set up PeakLogic step by step (screens, alarms, charts, and remote controllers like Arduino Opta).</td></tr>
            <tr><th>Why</th><td>Fix problems <em>before</em> equipment fails. Avoid costly emergency repairs and downtime. Keep people comfortable and safe. Catch leaks, overheating, and failing motors early—when fixes are cheaper and easier.</td></tr>
            <tr><th>How</th><td>Open <strong>Tools → Training</strong> (<kbd>F2</kbd>). Work through the tabs: <strong>PeakLogic</strong> for hands-on labs, <strong>IoT CBM</strong> for concepts, <strong>Mapping</strong> to see how they connect. Basic path: connect sensors → gateway → PeakLogic → set alarms and dashboards → check trends. Your instructor may assign a shorter track (operator, integrator, or CBM certification).</td></tr>
          </table>

          <h3>Unified training curriculum</h3>
          <p><strong>PeakLogic platform labs</strong> (M0–M15) plus <strong>IoT Condition-Based Monitoring</strong> (CBM-1–CBM-13). Source: <code>IoT Condition monitoring training.pdf</code> v1.0.</p>
          <h4>Intended audience</h4>
          <p>Service and HVAC technicians, electricians, maintenance staff, facility/building engineers, sales and operations managers, integrators.</p>
          <h4>Duration</h4>
          <table class="help-table">
            <tr><th>Track</th><th>Duration</th><th>Modules</th></tr>
            <tr><td>CBM Basic</td><td>1 day</td><td>CBM-1–4 + PeakLogic intro</td></tr>
            <tr><td>CBM Intermediate</td><td>2 days</td><td>CBM-1–10</td></tr>
            <tr><td>CBM Advanced certification</td><td>3 days</td><td>Full CBM + capstone</td></tr>
            <tr><td>PeakLogic Operator</td><td>~12 h</td><td>M0, M1, M3, M6, M8, M9, M13</td></tr>
            <tr><td>PeakLogic Integrator</td><td>~32 h</td><td>M0–M15 (full path)</td></tr>
          </table>
          <h4>Learning objectives</h4>
          <ul>
            <li>Explain Condition-Based Monitoring concepts and maintenance strategies</li>
            <li>Describe IoT architecture: sensors → gateway → PeakLogic cloud/HMI</li>
            <li>Install, commission, and troubleshoot PeakLogic projects</li>
            <li>Build dashboards, historian trends, alarms, and PdM views</li>
            <li>Commission MQTT Parc hub, Arduino Opta, edge peers (LilyGO), and optional BACnet/IP from campus BAS</li>
          </ul>
          <h4>Commissioning spine</h4>
          <ol>
            <li><strong>Project</strong> — New / Open / Save</li>
            <li><strong>Drivers</strong> — Hardware wizard or device template</li>
            <li><strong>Tags</strong> — scaling, alarms, Live I/O</li>
            <li><strong>Program</strong> — Validate → Start</li>
            <li><strong>Force</strong> — debug I/O with Program trace open</li>
            <li><strong>HMI</strong> — composites, bindings, Apply</li>
            <li><strong>System setup</strong> — Apply all settings</li>
          </ol>
          <p>Use the tabs above for PeakLogic modules, IoT CBM modules, cross-reference mapping, Parc edge hardware, <strong>Quizzes</strong>, assessments, glossary, and <strong>Instructor</strong> (trainer guide).</p>
        </section>
      `,
    },
    mapping: {
      nav: false,
      html: `
        <section class="help-section">
          <h3>CBM ↔ PeakLogic module map</h3>
          <table class="help-table">
            <tr><th>CBM</th><th>Title</th><th>PeakLogic labs</th></tr>
            ${CBM_MODULES.map((m) => `<tr><td>CBM-${m.num}</td><td>${m.title}</td><td>${m.mapsTo}</td></tr>`).join('')}
          </table>
          <h4>Role tracks (PeakLogic)</h4>
          <table class="help-table">
            <tr><th>Track</th><th>Modules</th><th>Hours</th></tr>
            <tr><td>Operator</td><td>M0, M1, M3, M6, M8, M9, M13</td><td>~12 h</td></tr>
            <tr><td>Integrator</td><td>M0–M15</td><td>~32 h</td></tr>
            <tr><td>Admin</td><td>M0, M1, M2, M4, M7, M9, M11, M12, M14, M15</td><td>~22 h</td></tr>
            <tr><td>Maintenance</td><td>M0, M3, M8, M9, M11, M13, M14, M15</td><td>~18 h</td></tr>
          </table>
        </section>
      `,
    },
    parc: {
      nav: false,
      html: `
        <section class="help-section">
          <h3>MQTT Parc — PeakLogic edge protocol</h3>
          <p>All Parc peers publish on <code>peaklogic/v1/{deviceId}/…</code>. Enable the hub in <strong>Project → System setup → MQTT Parc</strong>, then add <code>mqtt_parc</code> drivers. See <strong>M7</strong> for hub baseline lab.</p>
          <table class="help-table">
            <tr><th>Topic</th><th>Direction</th><th>Purpose</th></tr>
            <tr><td><code>peaklogic/v1/{id}/telemetry</code></td><td>Device → hub</td><td>Tag snapshot + runtime status (~1 Hz)</td></tr>
            <tr><td><code>peaklogic/v1/{id}/online</code></td><td>Device → hub</td><td>Retained LWT / presence</td></tr>
            <tr><td><code>peaklogic/v1/{id}/cmd</code></td><td>Hub → device</td><td><code>put_program</code>, <code>runtime_start</code>, <code>runtime_stop</code>, writes</td></tr>
            <tr><td><code>peaklogic/v1/{id}/cmd/response</code></td><td>Device → hub</td><td>Command ack / error</td></tr>
            <tr><td><code>peaklogic/v1/{id}/config</code></td><td>Hub → device</td><td>Pause telemetry during debug attach</td></tr>
            <tr><td><code>peaklogic/v1/{id}/g/{key}/{tag}</code></td><td>Both</td><td>Global site key grouped tags</td></tr>
          </table>
          <h4>PeakLogic PC — hub &amp; drivers</h4>
          <ol>
            <li><strong>System setup → MQTT Parc</strong> — broker URL, hub enable, site key</li>
            <li><strong>Drivers → Apply template</strong> — <strong>Arduino Opta — MQTT Parc ST runtime</strong> or bulk <strong>Add Opta Parc devices</strong></li>
            <li><strong>Sync tags from device</strong> on the driver card after telemetry is live</li>
            <li><strong>Program → Remote</strong> — Connect, <strong>Download &amp; Start</strong> to deploy ST to Opta</li>
          </ol>
          <p><strong>deviceId</strong> — physical MQTT identity (e.g. <code>opta_a1b2c3</code>). <strong>Position ID</strong> — stable plant location id for replace-hardware workflows.</p>

          <h3>Arduino Opta — MQTT Parc ST</h3>
          <p>Firmware: <code>firmware/arduino-opta-mqtt-st/PeaklogicOptaMqttSt/</code> — on-device ST VM + Parc MQTT + setup web UI.</p>
          <table class="help-table">
            <tr><th>Item</th><th>Detail</th></tr>
            <tr><td>Driver type</td><td><code>mqtt_parc</code></td></tr>
            <tr><td>Device template</td><td>Arduino Opta — MQTT Parc ST runtime</td></tr>
            <tr><td>Setup UI</td><td>Device soft-AP or Ethernet → <code>/setup</code> — broker IP, deviceId, expansions</td></tr>
            <tr><td>Local HTTP</td><td><code>/api/status</code>, <code>/api/tags</code>, <code>PUT /api/program</code>, OTA <code>/api/firmware</code></td></tr>
            <tr><td>ST programs</td><td><code>st/opta/*.st</code>, <code>st/opta-mqtt/README.md</code></td></tr>
            <tr><td>Baseline lab</td><td>Hub up → telemetry → remote ST start (M7 / Checkpoint C)</td></tr>
          </table>
          <p>Modbus RTU Opta (no MQTT): template <strong>Arduino Opta — Modbus RTU Slave</strong> — see F1 → Arduino Opta Modbus RTU.</p>

          <h3>Parc edge peers — LilyGO</h3>
          <p>Sensor nodes and cellular bridges using the same Parc topic layout. Covered in <strong>M14</strong>.</p>
          <table class="help-table">
            <tr><th>Product</th><th>Role</th><th>Platform id</th><th>Firmware path</th></tr>
            <tr><td><strong>Arduino Opta</strong></td><td>ST runtime + I/O + Parc MQTT</td><td><code>opta_*</code></td><td><code>firmware/arduino-opta-mqtt-st/</code></td></tr>
            <tr><td>LilyGO T-HaLow (T4)</td><td>Parc sensor node over HaLow</td><td><code>lilygo-t-halow</code> / <code>thalow_*</code></td><td><code>halow-xiao-sta/</code></td></tr>
            <tr><td>LilyGO T-ETH-ELITE-A7670X</td><td>Cellular MQTT bridge (Opta LAN → cloud)</td><td>gateway</td><td><code>cellular-opta-gateway/</code></td></tr>
            <tr><td>T-ETH-Elite + LTE shield</td><td>Same bridge (stacked)</td><td>gateway</td><td><code>cellular-opta-gateway/</code> menuconfig</td></tr>
          </table>

          <h4>LilyGO T-HaLow provisioning</h4>
          <ul>
            <li>MQTT runs over <strong>HaLow</strong> (802.11ah); Wi-Fi AP <code>PeakLogic-T-HaLow</code> is setup-only</li>
            <li>Provisioning: <code>http://192.168.4.1:8080/setup</code> — broker IP, HaLow IP, deviceId, sensor template</li>
            <li>Pair HaLow AP per LilyGO workflow; broker must be reachable on the HaLow LAN</li>
          </ul>

          <h4>LilyGO T-ETH cellular gateway (Opta bridge)</h4>
          <ul>
            <li>Local broker for Opta: <strong>192.168.1.1:1883</strong> (configure once on bench)</li>
            <li>Gateway forwards all <code>peaklogic/v1/#</code> to cloud Mosquitto over cellular</li>
            <li>Gateway setup: Wi-Fi AP <code>PeakLogic-Gateway</code> → <code>http://192.168.4.1:8080/setup</code> — cloud broker, APN</li>
            <li>Cloud MQTT credentials live on the gateway, not in Opta firmware</li>
          </ul>

          <h4>T-HaLow ALF sensor templates</h4>
          <p>Selected on device <code>/setup</code> (NVS <code>sensor_tpl</code>). Spec: <code>data/lilygo t4 HaLoW templates</code></p>
          <table class="help-table">
            <tr><th>#</th><th>Location</th><th>I/O summary</th></tr>
            <tr><td>1</td><td>Mechanical room</td><td>Water/gas pulse, 3× WH temp/CT, leak rope</td></tr>
            <tr><td>2</td><td>Client room</td><td>3× thermistor, blower/stove CT, pan leak</td></tr>
            <tr><td>3</td><td>Client bathroom</td><td>Toilet flow pulse, tub/shower leak</td></tr>
            <tr><td>4</td><td>Rooftop A/C</td><td>High/low temp, compressor + fan CT, pan leak</td></tr>
            <tr><td>5</td><td>Kitchen</td><td>Incoming water pulse, refer + freezer temp</td></tr>
            <tr><td>6</td><td>Kitchen six sinks</td><td>6× sink leak rope + 6× sink flow pulse</td></tr>
          </table>
          <p><strong>References:</strong> <code>firmware/arduino-opta-mqtt-st/README.md</code>, <code>halow-xiao-sta/README.md</code>, <code>cellular-opta-gateway/README.md</code>, F1 → Drivers (mqtt_parc).</p>
        </section>
      `,
    },
    assess: {
      nav: false,
      html: `
        <section class="help-section">
          <h3>Assessments</h3>
          <h4>CBM course weights</h4>
          <table class="help-table">
            <tr><th>Component</th><th>Weight</th></tr>
            <tr><td>Module quizzes</td><td>20%</td></tr>
            <tr><td colspan="2"><em>Take quizzes in Training → <strong>Quizzes</strong> tab (5 questions per module, 80% pass, open-book).</em></td></tr>
            <tr><td>Installation lab</td><td>20%</td></tr>
            <tr><td>Dashboard configuration</td><td>15%</td></tr>
            <tr><td>Alarm configuration</td><td>15%</td></tr>
            <tr><td>Troubleshooting exercise</td><td>10%</td></tr>
            <tr><td>Final capstone project</td><td>20%</td></tr>
          </table>
          <h4>PeakLogic checkpoints</h4>
          <table class="help-table">
            <tr><th>Gate</th><th>Format</th><th>Pass criteria</th></tr>
            <tr><td>Checkpoint A (after M2)</td><td>Oral</td><td>Explain template vs fixture vs composite; show saved .est.zip</td></tr>
            <tr><td>Checkpoint B (after M6)</td><td>Lab</td><td>Commission site: tags live, ST running, HMI bound</td></tr>
            <tr><td>Checkpoint C (after M7)</td><td>Lab</td><td>Parc baseline: telemetry + remote Download &amp; Start</td></tr>
            <tr><td>Checkpoint D (after M14)</td><td>Lab</td><td>Parc edge peer: T-HaLow telemetry and/or T-ETH Opta↔cloud bridge</td></tr>
            <tr><td>Checkpoint E (after M15, optional)</td><td>Lab</td><td>ONVIF camera: probed, HMI popup, one GridFS snapshot</td></tr>
            <tr><td>Final (after M13/M14)</td><td>Demo</td><td>Vertical walkthrough: HMI + alarm ack + one trend</td></tr>
          </table>
          <h4>Suggested schedules</h4>
          <p><strong>CBM certification (3 days):</strong> Day 1 CBM-1–3 · Day 2 CBM-4–8 · Day 3 CBM-9–13 capstone.</p>
          <p><strong>PeakLogic integrator:</strong> Day 1 M0–M2 · Day 2 M3–M5 · Day 3 M6 · Day 4 M7 Parc/Opta · Day 5 M8–M9 · Day 6 M14 Parc peers · Day 7+ M10–M13, M15 cameras.</p>
          <h4>Equipment</h4>
          <ul>
            <li>Arduino Opta (MQTT Parc ST firmware)</li>
            <li>Parc edge peers: LilyGO T-ETH gateway, T-HaLow sensor nodes</li>
            <li>ONVIF IP camera (Reolink) for M15 — same LAN as laptops</li>
            <li>Wireless sensors, CTs, leak rope, flow pulse</li>
            <li>Laptop, tablet, PeakLogic web commissioning UI</li>
            <li>Network tester, DMM, hand tools, PPE</li>
          </ul>
        </section>
      `,
    },
    glossary: {
      nav: false,
      html: `
        <section class="help-section">
          <h3>Glossary</h3>
          <table class="help-table">
            <tr><th>Term</th><th>Meaning</th></tr>
            <tr><td>CBM</td><td>Condition-Based Monitoring</td></tr>
            <tr><td>IoT</td><td>Internet of Things</td></tr>
            <tr><td>BAS</td><td>Building automation system — PeakLogic coexists via BACnet/IP import on edge appliances, not BMS rip-replace</td></tr>
            <tr><td>CMMS</td><td>Computerized Maintenance Management System</td></tr>
            <tr><td>CT</td><td>Current Transformer</td></tr>
            <tr><td>MCSA</td><td>Motor Current Signature Analysis</td></tr>
            <tr><td>RUL</td><td>Remaining Useful Life</td></tr>
            <tr><td>ST</td><td>Structured Text — IEC-style control logic</td></tr>
            <tr><td>MQTT Parc</td><td>PeakLogic edge protocol — peaklogic/v1 topics for Opta and peers</td></tr>
            <tr><td>deviceId</td><td>MQTT Parc device identity (e.g. opta_*, thalow_*)</td></tr>
            <tr><td>Position ID</td><td>Stable plant location id (replace-hardware)</td></tr>
            <tr><td>mqtt_parc</td><td>PeakLogic driver type for Parc MQTT devices</td></tr>
            <tr><td>bacnet</td><td>BACnet/IP driver — Who-Is discovery, object browse, present-value read/write (edge appliance)</td></tr>
            <tr><td>Download &amp; Start</td><td>Deploy ST bytecode to remote Opta over Parc</td></tr>
            <tr><td>Device template</td><td>Preset driver + tags for an instrument</td></tr>
            <tr><td>HMI composite</td><td>Pre-wired faceplate widget with default bindings</td></tr>
            <tr><td>HaLow</td><td>802.11ah long-range Wi-Fi (LilyGO T-HaLow)</td></tr>
            <tr><td>ONVIF</td><td>IP camera discovery and control standard (UDP 3702)</td></tr>
            <tr><td>go2rtc</td><td>Local RTSP→WebRTC/MSE streaming proxy for camera live view</td></tr>
            <tr><td>GridFS</td><td>MongoDB file storage for camera snapshots (optional; projects use .est.zip on disk)</td></tr>
            <tr><td>.est.zip</td><td>Portable PeakLogic project archive (tags, drivers, ST programs, HMI, Facility Draw)</td></tr>
            <tr><td>PdM</td><td>Predictive maintenance — SCADA + edge features, failure forecast, proactive CMMS PM</td></tr>
          </table>
        </section>
      `,
    },
  };

  function renderNavForTab(tabId, sections) {
    return sections
      .map((s) => `<a href="#training-${s.id}" data-training-link="${s.id}">${s.title}</a>`)
      .join('');
  }

  function renderTabBody(tabId) {
    if (tabId === 'peaklogic') {
      const sections = buildMvSections();
      return `
        <nav class="help-nav" data-training-nav="peaklogic" aria-label="PeakLogic modules"></nav>
        <div class="help-body popup-scroll" data-training-body="peaklogic">
          ${sections.map((s) => `<section id="training-${s.id}" class="help-section"><h3>${s.title}</h3>${s.html}</section>`).join('')}
        </div>`;
    }
    if (tabId === 'cbm') {
      const sections = buildCbmSections();
      return `
        <nav class="help-nav" data-training-nav="cbm" aria-label="IoT CBM modules"></nav>
        <div class="help-body popup-scroll" data-training-body="cbm">
          ${sections.map((s) => `<section id="training-${s.id}" class="help-section"><h3>${s.title}</h3>${s.html}</section>`).join('')}
        </div>`;
    }
    if (tabId === 'instructor') {
      const sections = buildInstructorSections();
      return `
        <nav class="help-nav" data-training-nav="instructor" aria-label="Instructor guide"></nav>
        <div class="help-body popup-scroll" data-training-body="instructor">
          ${sections.map((s) => `<section id="training-${s.id}" class="help-section"><h3>${s.title}</h3>${s.html}</section>`).join('')}
        </div>`;
    }
    if (tabId === 'quizzes' && window.PeaklogicTrainingQuizzes) {
      return window.PeaklogicTrainingQuizzes.renderQuizzesTabHtml();
    }
    const content = TAB_CONTENT[tabId];
    return `<div class="help-body popup-scroll training-body-single">${content?.html || ''}</div>`;
  }

  function showTab(tabId) {
    activeTab = tabId;
    const panel = document.getElementById('training-panel');
    if (!panel) return;
    panel.querySelectorAll('[data-training-tab-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.trainingTabBtn === tabId);
    });
    panel.querySelectorAll('[data-training-tab]').forEach((pane) => {
      pane.classList.toggle('view-hidden', pane.dataset.trainingTab !== tabId);
    });
    const pane = panel.querySelector(`[data-training-tab="${tabId}"]`);
    if (!pane || pane.dataset.rendered === '1') return;
    pane.innerHTML = renderTabBody(tabId);
    pane.dataset.rendered = '1';
    if (tabId === 'quizzes' && window.PeaklogicTrainingQuizzes) {
      const quizNav = pane.querySelector('[data-training-nav="quizzes"]');
      const sections = window.PeaklogicTrainingQuizzes.buildQuizSections();
      if (quizNav) {
        quizNav.innerHTML = `<div class="help-nav-group"><div class="help-nav-label">Quizzes</div>
          <a href="#training-quiz-intro" data-training-link="quiz-intro">Overview</a>
          ${sections.map((s) => `<a href="#training-${s.id}" data-training-link="${s.id}">${s.title}</a>`).join('')}
        </div>`;
        quizNav.querySelectorAll('[data-training-link]').forEach((a) => {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            const linkId = a.dataset.trainingLink;
            if (linkId === 'quiz-intro') {
              document.getElementById('training-quiz-intro')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              scrollToSection(linkId);
            }
          });
        });
      }
      window.PeaklogicTrainingQuizzes.bindQuizHandlers(pane);
    }
    if (tabId === 'peaklogic' || tabId === 'cbm' || tabId === 'instructor') {
      const sections =
        tabId === 'peaklogic' ? buildMvSections() : tabId === 'cbm' ? buildCbmSections() : buildInstructorSections();
      const nav = pane.querySelector('[data-training-nav]');
      if (nav) {
        const label =
          tabId === 'peaklogic' ? 'M0–M15' : tabId === 'cbm' ? 'CBM-1–CBM-13' : 'Instructor';
        nav.innerHTML = `<div class="help-nav-group"><div class="help-nav-label">${label}</div>${renderNavForTab(tabId, sections)}</div>`;
        nav.querySelectorAll('[data-training-link]').forEach((a) => {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToSection(a.dataset.trainingLink);
          });
        });
      }
    }
  }

  function scrollToSection(id) {
    const el = document.getElementById(`training-${id}`);
    if (!el) return false;
    document.querySelectorAll('[data-training-link]').forEach((a) => {
      a.classList.toggle('active', a.dataset.trainingLink === id);
    });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function render(container) {
    if (!container) return;
    const tabs = container.querySelector('[data-training-tabs]');
    if (tabs) {
      tabs.innerHTML = TOP_TABS.map(
        (t, i) => `<button type="button" class="setup-tab${i === 0 ? ' active' : ''}" data-training-tab-btn="${t.id}">${t.label}</button>`
      ).join('');
      tabs.querySelectorAll('[data-training-tab-btn]').forEach((btn) => {
        btn.addEventListener('click', () => showTab(btn.dataset.trainingTabBtn));
      });
    }
    TOP_TABS.forEach((t) => {
      const pane = container.querySelector(`[data-training-tab="${t.id}"]`);
      if (pane && t.id === 'overview') {
        pane.innerHTML = renderTabBody(t.id);
        pane.dataset.rendered = '1';
      }
    });
    rendered = true;
  }

  function ensureRendered() {
    const container = document.getElementById('training-panel');
    if (container && !rendered) render(container);
    showTab(activeTab);
  }

  return {
    MV_MODULES,
    CBM_MODULES,
    TOP_TABS,
    scrollToSection,
    showTab,
    ensureRendered,
  };
})();
