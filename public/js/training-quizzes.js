'use strict';

/**
 * Module quizzes for PeakLogic Training (M0–M15, CBM-1–CBM-13).
 * Each question: one right answer, one almost-right, one plausible, one similar.
 * Loaded before training.js; used by PeaklogicTraining Quizzes tab.
 */
window.PeaklogicTrainingQuizzes = (function () {
  const PASS_PERCENT = 80;

  function q(text, choices, answer, explain) {
    return { text, choices, answer, explain };
  }

  const QUIZZES = [
    {
      id: 'm0',
      track: 'mv',
      title: 'M0 — Product map & first launch',
      questions: [
        q('What is PeakLogic MVP Suite?', ['A local engineering appliance you run on a laptop', 'The cloud-only version of PeakLogic with no local runtime', 'Firmware that runs only on Arduino Opta hardware', 'A mobile app for viewing trends without configuration'], 0, 'MVP Suite is the local PeakLogic app at http://127.0.0.1:3090.'),
        q('Which key opens the full Training curriculum?', ['F1', 'F2', 'Ctrl+S', 'F1 then Training from Help sidebar'], 1, 'F2 opens Help → Training directly.'),
        q('What file type stores a PeakLogic project snapshot?', ['.csv export from Historian', '.mvbundle (legacy import only)', '.est.zip', '.json driver template only'], 2, 'Projects are saved as portable .est.zip archives (peaklogic-est-archive v1).'),
        q('The default home page at http://127.0.0.1:3090 is…', ['MV Draw site-plan editor', 'The operator dashboard with live HMI', 'Cloud Studio login only', 'Historian trend chart'], 1, 'Dashboard is / ; MV Draw is /mv-draw under Tools.'),
        q('F1 Help is mainly for…', ['Structured course modules and quizzes', 'Operator and engineering reference while you work', 'Flashing Opta firmware over USB', 'Configuring the MQTT Parc hub only'], 1, 'F1 = in-app help; F2 = structured training.'),
        q('Before M0 labs, students should be able to…', ['Complete the Parc baseline and flash T-HaLow', 'Start MVP Suite and open Training', 'Deploy ST remotely with Download & Start', 'Configure MongoDB and export PdM reports'], 1, 'M0 verifies first launch and navigation.'),
      ],
    },
    {
      id: 'm1',
      track: 'mv',
      title: 'M1 — UI layout, roles & projects',
      questions: [
        q('Where do you create or open a project?', ['Drivers → Apply template', 'Project ▾ menu', 'System setup → Apply all', 'Program → Validate'], 1, 'Project menu handles New, Open, Import, Save, Export.'),
        q('Tools ▾ menu opens…', ['Only the HMI composer', 'Only Modbus driver configuration', 'Program, Tags, Drivers, Connectivity, and more', 'Only Cloud Studio in the browser'], 2, 'Tools is the main engineering popup launcher.'),
        q('Export project is used to…', ['Push ST bytecode to Opta over Parc', 'Copy or back up a portable .est.zip file', 'Enable historian logging on tags', 'Apply driver changes to the runtime'], 1, 'Export creates a shareable .est.zip archive.'),
        q('A plant operator role typically needs…', ['Full driver editing and Modbus troubleshooting', 'HMI, alarms, trends — less driver editing', 'Firmware OTA and gateway APN setup', 'ST validation and remote Download & Start'], 1, 'Operator track focuses on running the system.'),
        q('Save as differs from Save because it…', ['Applies HMI bindings to the runtime', 'Stops the scan cycle immediately', 'Lets you choose a new filename/path', 'Syncs tags from a Parc device'], 2, 'Save as creates a new file; Save updates the current one.'),
      ],
    },
    {
      id: 'm2',
      track: 'mv',
      title: 'M2 — Commissioning path',
      questions: [
        q('A device template provides…', ['Sample ST logic for motor HOA control', 'Preset driver + tags for an instrument type', 'A finished HMI screen with all bindings applied', 'MongoDB archive settings for historian'], 1, 'Templates speed up driver and tag creation.'),
        q('A program fixture is…', ['A pre-wired HMI faceplate widget', 'A Modbus register map PDF', 'Sample ST plus matching tags/drivers', 'A cloud tenant entitlement record'], 2, 'Fixtures are teaching/demo ST bundles.'),
        q('An HMI composite is…', ['A device template for Datexel I/O', 'A Parc MQTT topic subscription', 'A pre-wired faceplate widget with default bindings', 'A historian pen color definition'], 2, 'Composites speed HMI layout.'),
        q('Which step comes first in the commissioning spine?', ['Drivers → Hardware wizard', 'Program → Validate → Start', 'Project (New/Open/Save)', 'HMI → Apply bindings'], 2, 'Spine: Project → Drivers → Tags → Program → Force → HMI → System setup.'),
        q('Checkpoint A tests whether you can explain…', ['Parc deviceId vs Position ID', 'MQTT broker firewall rules', 'Template vs fixture vs composite', 'Historian CSV vs PDF export'], 2, 'Checkpoint A is after M2 commissioning concepts.'),
      ],
    },
    {
      id: 'm3',
      track: 'mv',
      title: 'M3 — Tags, Force & Live I/O',
      questions: [
        q('Tag id is used for…', ['Display labels shown to operators only', 'ST logic and driver mapping', 'HMI font and color styling', 'CMMS work-order numbering'], 1, 'Tag id is the programmatic name; Label is for display.'),
        q('Force should be cleared before…', ['Running Validate on ST', 'Exporting the project to .est.zip', 'Handing a system to operators', 'Opening the Drivers panel'], 2, 'Force is for commissioning debug only.'),
        q('Live I/O shows…', ['Alarm ack history and CMMS status', 'Historian pen configuration', 'Current tag values from drivers/runtime', 'MV Draw symbol coordinates'], 2, 'Live I/O helps verify wiring and logic.'),
        q('Engineering scaling on a tag converts…', ['MQTT topics to Modbus registers', 'Alarm severity levels to email', 'Raw counts to real-world units', 'ST bytecode to MVBC format'], 2, 'Example: 4–20 mA → 0–100 PSI.'),
        q('After Force on an input, you should see…', ['Automatic Sync tags from device', 'HMI starting screen change', 'ST trace react if logic uses that tag', 'Historian archive write to MongoDB'], 2, 'M3 lab: Force → confirm in Program trace.'),
      ],
    },
    {
      id: 'm4',
      track: 'mv',
      title: 'M4 — Drivers & field buses',
      questions: [
        q('Driver Test is used to…', ['Export historian data to CSV', 'Deploy ST to Opta over Parc', 'Verify communication before relying on tags', 'Apply HMI composite bindings'], 2, 'Always Test after configuring a driver.'),
        q('Apply on a driver card…', ['Validates ST syntax before Start', 'Activates configuration to the runtime', 'Acknowledges active alarms', 'Saves the project under a new name'], 1, 'Apply commits driver settings.'),
        q('Modbus RTU problems are often caused by…', ['Hist flag not checked on tags', 'HMI bindings left unapplied', 'Wrong COM port or slave ID', 'Parc hub disabled in System setup'], 2, 'See F1 Serial port troubleshooting.'),
        q('mqtt_parc is a driver type for…', ['Modbus RTU on Arduino Opta serial', 'HTTPS REST polling to cloud APIs', 'MQTT Parc edge devices like Opta', 'Local mock drivers for bench simulation'], 2, 'Parc uses peaklogic/v1 topics.'),
        q('A device template applied from Drivers…', ['Only adds tags without a driver', 'Creates driver(s) and tags for that product', 'Replaces ST with a PDF manual', 'Configures MV Draw floor plans only'], 1, 'Templates are the fastest way to add field I/O.'),
        q('The bacnet driver is used to…', ['Replace the campus BMS entirely', 'Import BACnet/IP points on the edge appliance alongside existing BAS', 'Poll Modbus RTU over RS-485', 'Deploy ST bytecode to Opta'], 1, 'Coexistence model — see docs/BACNET.md; edge appliance only.'),
        q('EZ Meter facility PQ derived measurement set requires…', ['Replacing all DDS_* tags with MQTT topics', 'Applying the full Modbus map template first on driver dds_rgb', 'Cloud Studio login only', 'A HaLow radio on the meter'], 1, 'Two-step apply — see docs/facilities/EZMETER_FACILITY_PQ.md.'),
      ],
    },
    {
      id: 'm5',
      track: 'mv',
      title: 'M5 — ST program & runtime',
      questions: [
        q('Validate on ST checks…', ['Modbus slave ID and baud rate', 'MQTT broker credentials', 'Syntax and compile errors before run', 'Alarm limit thresholds on tags'], 2, 'Always Validate after editing ST.'),
        q('Scan cycle order is…', ['Run ST → read drivers → write HMI', 'Write outputs → run ST → read drivers', 'Read drivers → run ST → write outputs', 'HMI Apply → Force → Validate'], 2, 'Scan repeats at scanMs interval.'),
        q('Pause on runtime…', ['Deletes all forced tag values automatically', 'Stops logic updates while keeping state', 'Flashes new firmware to Opta', 'Disables the MQTT Parc hub'], 1, 'Pause holds the program; Stop clears running state per site policy.'),
        q('Motor HOA fixture teaches…', ['Parc telemetry topic layout', 'Historian pen configuration', 'Hand-Off-Auto control patterns', 'Cellular gateway APN setup'], 2, 'HOA is a common integrator pattern.'),
        q('Program live trace helps you…', ['Configure alarm escalation paths', 'See tag values as ST executes', 'Scale MV Draw site plans', 'Register devices in Cloud Studio'], 1, 'Trace pairs with Force in M3/M5 labs.'),
      ],
    },
    {
      id: 'm6',
      track: 'mv',
      title: 'M6 — HMI composer',
      questions: [
        q('HMI bindings connect…', ['Drivers directly to MongoDB', 'Alarms to CMMS work orders', 'Widgets to live tags', 'ST programs to firmware OTA'], 2, 'Bindings show real process data on screen.'),
        q('After editing HMI you must…', ['Validate ST and Start runtime', 'Sync tags from Parc device', 'Apply HMI changes', 'Run Driver Test on Modbus'], 2, 'Unapplied bindings show ??? on screen.'),
        q('Starting screen is…', ['The first screen operators see', 'The F1 Help default topic', 'The driver card expanded view', 'The MQTT broker configuration page'], 0, 'Set starting screen for operator mode.'),
        q('Motor HOA composite is an example of…', ['A device template for mqtt_parc', 'A historian logging preset', 'A reusable faceplate', 'A Modbus RTU slave map'], 2, 'Composites bundle graphics + default bindings.'),
        q('Checkpoint B requires…', ['Parc Download & Start on Opta', 'Only MV Draw symbol placement', 'Tags live, ST running, HMI bound', 'Cloud Studio login and entitlements'], 2, 'Checkpoint B follows M6 commissioning path.'),
      ],
    },
    {
      id: 'm7',
      track: 'mv',
      title: 'M7 — MQTT Parc hub & Opta',
      questions: [
        q('Parc telemetry topic pattern is…', ['modbus/rtu/slave/{id}/holding', 'peaklogic/v1/{deviceId}/telemetry', 'mqtt://broker/status only', 'parc/opta/telemetry/v2'], 1, 'All Parc peers use peaklogic/v1 layout.'),
        q('Enable the Parc hub in…', ['Drivers → mqtt_parc → Test', 'Program → Remote → Connect', 'Project → System setup → MQTT Parc', 'HMI → Setup → Apply'], 2, 'Hub must be enabled and Applied.'),
        q('deviceId is…', ['The stable plant location for replace-hardware workflows', 'The operator role name in Cloud Studio', 'The MQTT identity of the physical device', 'The historian pen series name'], 2, 'Position ID is separate — stable plant location.'),
        q('Download & Start deploys…', ['HMI screens to the operator display', 'Driver templates to the project file', 'ST bytecode to a remote Opta over Parc', 'Historian archive to MongoDB'], 2, 'Remote programming uses cmd topic.'),
        q('After Opta telemetry is live you should…', ['Immediately flash T-HaLow firmware', 'Disable other Modbus drivers', 'Sync tags from device on the driver card', 'Export .est.zip for site handoff'], 2, 'Sync imports tag definitions from the device.'),
      ],
    },
    {
      id: 'm8',
      track: 'mv',
      title: 'M8 — Historian & reports',
      questions: [
        q('Hist flag on a tag…', ['Controls which pens appear on charts', 'Enables logging that tag', 'Sets IH alarm limits', 'Maps the tag to Modbus registers'], 1, 'Hist is separate from pen display config.'),
        q('Pen config controls…', ['Which tags are logged to archive', 'Which tags appear on trend charts', 'MQTT telemetry publish rate', 'ST scan cycle interval'], 1, 'Pens are display series.'),
        q('Historian Report can export…', ['ST source code only', 'Driver Modbus maps only', 'CSV or PDF', 'Opta firmware .bin only'], 2, 'Reports use logged data.'),
        q('Flat historian line often means…', ['Hist not enabled or runtime stopped', 'MQTT Parc hub is working correctly', 'HMI bindings are all applied', 'Alarms are properly configured'], 0, 'Check Hist checkbox and runtime Start.'),
        q('MongoDB in PeakLogic is used for…', ['Storing the project library under data/projects/', 'Long-term historian archive (when configured)', 'MQTT broker message relay', 'ST syntax validation'], 1, 'Projects live in .est.zip files on disk; Mongo is optional for historian/logs.'),
      ],
    },
    {
      id: 'm9',
      track: 'mv',
      title: 'M9 — Alarms & CMMS',
      questions: [
        q('High limit (IH) on a tag…', ['Trips when value rises above setpoint', 'Acknowledges alarms in the Alarms panel', 'Enables historian logging', 'Sets Modbus slave address'], 0, 'Limits are configured on Tags.'),
        q('Alarm Ack is done by…', ['Automatic MQTT broker retain flag', 'Firmware OTA on the Opta', 'Operators or techs in the Alarms panel', 'Exporting historian CSV'], 2, 'Ack documents operator awareness.'),
        q('Integrated CMMS can…', ['Replace mqtt_parc drivers', 'Create and track work orders at /cmms (alarm auto-WO when enabled)', 'Validate ST before runtime Start', 'Sync HaLow sensor templates'], 1, 'See docs/CMMS_APPLIANCE.md; external MQTT is optional.'),
        q('Warning vs critical alarms differ in…', ['Which COM port Modbus uses', 'Severity and response urgency', 'HMI tile size on the composer grid', 'Whether Hist is enabled'], 1, 'Escalation paths use severity.'),
        q('M9 lab requires you to…', ['Flash LilyGO T-ETH gateway firmware', 'Complete Parc Download & Start', 'Trip an alarm and Ack it', 'Build MV Draw site plan symbols'], 2, 'Hands-on alarm workflow.'),
      ],
    },
    {
      id: 'm10',
      track: 'mv',
      title: 'M10 — MV Draw',
      questions: [
        q('MV Draw is used for…', ['Editing ST structured text programs', 'Configuring Modbus RTU baud rates', 'Site plans and symbol placement', 'Setting MQTT Parc hub credentials'], 2, 'MV Draw site plans are embedded in .est.zip under mv-draw/.'),
        q('Scaling a plan means…', ['Matching drawing units to real-world size', 'Setting IH/OH alarm limits on tags', 'Adjusting historian pen time range', 'Configuring ST scan cycle ms'], 0, 'Scale lets symbols align to floors/rooms.'),
        q('Symbols on a plan can represent…', ['Only HMI composite definitions', 'Only MQTT topic names', 'Equipment and sensor locations', 'Only alarm ack codes'], 2, 'Plans aid navigation for operators.'),
        q('.est.zip archives include…', ['Only tag names as CSV', 'ST programs, HMI, drivers, tags, and optional MV Draw', 'MongoDB connection strings only', 'Opta OTA firmware packages'], 1, 'Portable project archives pack everything needed to move a site.'),
        q('M10 lab verifies…', ['Remote ST deploy over Parc', 'Save and reload placed symbols', 'CMMS work-order creation', 'Cellular APN on T-ETH gateway'], 1, 'Persistence after reload is key.'),
      ],
    },
    {
      id: 'm11',
      track: 'mv',
      title: 'M11 — PdM & ROI',
      questions: [
        q('PdM stands for…', ['Program download mode', 'Predictive maintenance', 'Parc device mapping', 'Pen display management'], 1, 'PdM uses trends and analytics for forecasts.'),
        q('Health index in PdM…', ['Lists all Modbus slave IDs', 'Summarizes equipment condition', 'Stores HMI tile positions', 'Defines MQTT broker URL'], 1, 'Health index supports maintenance decisions.'),
        q('RUL means…', ['Remote unlock link for Opta setup', 'Runtime update latency', 'Remaining useful life', 'Report upload log'], 2, 'RUL is a forecast concept from CBM-10.'),
        q('ROI calculator helps…', ['Configure DHCP on the gateway', 'Set Modbus parity and stop bits', 'Justify monitoring investment cost vs savings', 'Bind HMI widgets to tag ids'], 2, 'Ties to CBM-1 business case.'),
        q('edgeAi in Parc telemetry feeds…', ['MV Draw symbol libraries', 'HMI starting screen selection', 'PdM / edge inference views', 'Driver template JSON schema'], 2, 'Edge devices can publish inference scores.'),
      ],
    },
    {
      id: 'm12',
      track: 'mv',
      title: 'M12 — Cloud Studio',
      questions: [
        q('Cloud Studio is…', ['The local MVP Suite at port 3090', 'PeakLogic cloud engineering/hosting tier', 'MV Draw desktop editor only', 'Opta firmware build toolchain'], 1, 'Contrast with local MVP Suite appliance.'),
        q('Modbus to field devices often requires…', ['Only a browser tab in Cloud Studio', 'Edge runtime at the site', 'Disabling all local drivers', 'Exporting historian PDF only'], 1, 'Field buses are edge-local.'),
        q('Entitlements control…', ['Modbus baud rate and parity', 'Which cloud features a tenant may use', 'HMI composite default bindings', 'Historian pen colors'], 1, 'Licensing and feature flags.'),
        q('M12 lab includes…', ['Parc baseline on Arduino Opta', 'Signing into Cloud Studio', 'T-HaLow ALF template selection', 'Modbus RTU wiring on bench'], 1, 'Hands-on cloud login and tour.'),
        q('Edge vs cloud means…', ['Some functions run on-site vs in data center', 'Operator vs technician HMI refresh rate', 'Analog vs digital I/O types', 'Warning vs critical alarm levels'], 0, 'Architecture split for latency and field buses.'),
      ],
    },
    {
      id: 'm13',
      track: 'mv',
      title: 'M13 — Vertical lab',
      questions: [
        q('M13 asks teams to…', ['Only complete module quizzes', 'Commission a domain demo end-to-end', 'Configure MongoDB without a project', 'Flash all Parc peers before M7'], 1, 'Vertical = pool, wastewater, assisted living, etc.'),
        q('Final demo should show…', ['Only driver Test results', 'HMI, alarm ack, and one trend', 'Only MV Draw without tags', 'Only Cloud Studio entitlements page'], 1, 'Final checkpoint rubric.'),
        q('Vertical .est.zip files come from…', ['Random internet template downloads', 'Product templates / generate-est scripts', 'Historian CSV import wizard', 'MQTT broker auto-discovery'], 1, 'See scripts/*/generate-est.js and ensure-bundled-projects.js.'),
        q('M13 builds on modules…', ['M7 and M14 Parc only', 'M12 cloud only', 'M2–M6 minimum', 'M0 navigation only'], 2, 'Commission path through HMI.'),
        q('Peer demo time is about…', ['10 minutes per team', '10 seconds per tag', 'No presentation — written test only', 'Full 8-hour lecture block'], 0, 'Presentation is part of assessment.'),
      ],
    },
    {
      id: 'm14',
      track: 'mv',
      title: 'M14 — Parc edge peers',
      questions: [
        q('M14 prerequisite is…', ['M10 MV Draw only', 'M7 Opta Parc baseline', 'M0 product map only', 'No prerequisites — start here'], 1, 'Complete Opta hub lab before LilyGO peers.'),
        q('LilyGO T-HaLow uses which path for MQTT data?', ['USB serial to the PC only', 'Standard Wi-Fi AP for all telemetry', 'HaLow (802.11ah)', 'Modbus RTU over RS-485'], 2, 'Wi-Fi AP PeakLogic-T-HaLow is setup-only.'),
        q('T-ETH gateway local broker for Opta is typically…', ['127.0.0.1:80', '192.168.4.1:8080 setup page', '192.168.1.1:1883', 'mqtt://cloud only — no local broker'], 2, 'Gateway forwards peaklogic/v1/# to cloud.'),
        q('T-HaLow ALF template #2 is for…', ['Mechanical room pulse meters', 'Rooftop A/C compressor monitoring', 'Client room sensors', 'Kitchen six-sink leak ropes only'], 2, 'Templates 1–6 match ALF locations.'),
        q('Checkpoint D verifies…', ['Only M0 quiz score', 'Template vs fixture vs composite oral', 'T-HaLow telemetry and/or T-ETH cloud bridge', 'Only Cloud Studio login'], 2, 'Parc peer on bench or cloud path.'),
      ],
    },
    {
      id: 'm15',
      track: 'mv',
      title: 'M15 — IP cameras & vision AI',
      questions: [
        q('ONVIF WS-Discovery uses which UDP port?', ['554 RTSP', '8000 device service', '3702 multicast', '3090 PeakLogic HTTP'], 2, 'UDP 239.255.255.250:3702 for discovery.'),
        q('Reolink cameras need which services enabled for PeakLogic probe?', ['FTP and SNMP only', 'ONVIF (8000) and RTSP (554)', 'Modbus RTU over RS-485', 'MQTT Parc hub only'], 1, 'ONVIF for probe/snapshot; RTSP for go2rtc.'),
        q('go2rtc in PeakLogic is used for…', ['Flashing Opta firmware', 'H.264 live streaming via WebRTC/MSE', 'MongoDB historian pen samples', 'Modbus register polling'], 1, 'go2rtc proxies RTSP to browser-friendly streams.'),
        q('Camera snapshots archive to GridFS bucket…', ['tag_logs', 'camera_snapshots', 'mqtt_parc', 'edge_inference only'], 1, 'JPEG snapshots stored in camera_snapshots bucket.'),
        q('Vision AI stub backend is for…', ['Production YOLO deployment', 'Dev/lab testing without external model', 'Disabling all inference permanently', 'ONVIF motion events only'], 1, 'Use http backend for real models in production.'),
        q('HMI I/O overlays on camera video are configured in…', ['Tags panel only', 'Tools → Cameras → Detail overlay registry', 'ST program editor', 'Historian pen setup'], 1, 'Per-camera overlay registry maps BOOL tags to video positions.'),
      ],
    },
    {
      id: 'cbm1',
      track: 'cbm',
      title: 'CBM-1 — Introduction to CBM',
      questions: [
        q('Condition-Based Monitoring means…', ['Maintaining when measured condition warrants it', 'Replacing all parts on a fixed calendar', 'Fixing equipment only after complete failure', 'Never using sensors — visual rounds only'], 0, 'CBM acts on actual equipment health signals.'),
        q('Reactive maintenance is…', ['Fix after failure', 'Fix on a fixed schedule regardless of condition', 'Fix when vibration trend exceeds baseline', 'Fix only when PdM forecast says 90% RUL'], 0, 'Highest downtime cost.'),
        q('Preventive maintenance is…', ['Fixed-interval service whether needed or not', 'Only when real-time sensors trip alarms', 'Never scheduled — purely reactive', 'Only performed after MQTT broker outage'], 0, 'May over- or under-maintain.'),
        q('CBM can reduce costs by…', ['Catching problems early', 'Disabling alarms to reduce notifications', 'Removing historians to save disk space', 'Skipping driver Test to save time'], 0, 'Early fixes are cheaper than emergencies.'),
        q('Remote monitoring helps because…', ['Staff see issues without always being on-site', 'It eliminates all field wiring requirements', 'It removes the need for any gateways', 'It guarantees zero equipment failures'], 0, 'PeakLogic provides remote dashboards and alerts.'),
      ],
    },
    {
      id: 'cbm2',
      track: 'cbm',
      title: 'CBM-2 — IoT fundamentals',
      questions: [
        q('An IoT gateway often…', ['Replaces all BAS controllers on day one', 'Connects field devices to the network/cloud', 'Stores only paper log sheets', 'Runs only inside a spreadsheet'], 1, 'Gateway aggregates and forwards data.'),
        q('PeakLogic in IoT architecture is…', ['Only a physical CT clamp', 'Cloud/HMI and analytics platform', 'Only the LilyGO setup Wi-Fi AP', 'Only a Modbus USB adapter'], 1, 'Sensors → gateway → PeakLogic.'),
        q('HaLow (802.11ah) is…', ['Long-range Wi-Fi for sensor networks', 'Standard Bluetooth audio streaming', 'Ethernet Power over Ethernet only', 'The same as cellular LTE Cat-1'], 0, 'Used by LilyGO T-HaLow peers.'),
        q('Parc protocol uses…', ['Modbus RTU function code 03 only', 'Proprietary fax on phone lines', 'MQTT topics under peaklogic/v1', 'HTTP GET to random public APIs'], 2, 'Parc is PeakLogic edge MQTT.'),
        q('Cellular IoT is useful when…', ['No reliable site Ethernet/Wi-Fi to cloud', 'You already have fiber to every sensor', 'You want to avoid all monthly carrier fees', 'Alarms and historians are permanently disabled'], 0, 'T-ETH gateway bridges Opta LAN to cloud.'),
      ],
    },
    {
      id: 'cbm3',
      track: 'cbm',
      title: 'CBM-3 — Sensors',
      questions: [
        q('A CT clamp measures…', ['Alternating current', 'Absolute room humidity only', 'Water leak along a rope length', 'Door open/close status only'], 0, 'CTs infer load and runtime.'),
        q('Leak rope is for…', ['Water leak detection along a line', 'Motor vibration on pump bearings', 'Supply air temperature at AHU', 'Modbus communication errors'], 0, 'Common in mechanical rooms and ceilings.'),
        q('Thermistor/temperature sensor on A/C might monitor…', ['Compressor MCSA signature only', 'Supply/return air or coil temp', 'Ethernet link speed', 'MQTT broker CPU load'], 1, 'Temperature is core HVAC CBM.'),
        q('Vibration sensor on a pump bearing helps detect…', ['Wear and imbalance early', 'IAQ CO₂ levels in offices', 'Incoming water pulse counts', 'Cloud tenant entitlement flags'], 0, 'MCSA/vibration → mechanical issues.'),
        q('Flow pulse sensor might count…', ['Water or gas usage pulses', 'Keyboard entries in PeakLogic', 'Alarm ack button presses', 'ST validate error messages'], 0, 'Pulse meters integrate flow over time.'),
      ],
    },
    {
      id: 'cbm4',
      track: 'cbm',
      title: 'CBM-4 — Residential',
      questions: [
        q('Whole-home monitoring might include…', ['HVAC, water heater, leak, sump, IAQ', 'Only industrial chiller plants', 'Only data-center server racks', 'Only commercial elevator controllers'], 0, 'Residential = dwellings and small sites.'),
        q('Sump pump monitoring helps…', ['Catch failure before flooding', 'Increase motor speed automatically', 'Disable all leak sensors', 'Remove MQTT from the home'], 0, 'High-value residential use case.'),
        q('IAQ sensors may measure…', ['CO₂, humidity, VOC, PM', 'Only 4–20 mA loop voltage', 'Only Modbus exception codes', 'Only Parc cmd response latency'], 0, 'Comfort and health.'),
        q('Residential case study ties to PeakLogic…', ['Alarms on temp and leak tags', 'Only enterprise CMMS at 50 sites', 'Only MV Draw for factory floors', 'Only deleting all driver templates'], 0, 'Dashboard + alarms for homeowners/facility.'),
        q('Solar/battery monitoring tracks…', ['Generation and storage health', 'Only HMI font preferences', 'Only Windows update schedule', 'Only ST comment syntax'], 0, 'Growing residential segment.'),
      ],
    },
    {
      id: 'cbm5',
      track: 'cbm',
      title: 'CBM-5 — Commercial',
      questions: [
        q('Commercial BAS often integrates with…', ['HVAC, lighting, access — PeakLogic can complement', 'Only residential game consoles', 'Nothing — BAS cannot share data', 'Only social media dashboards'], 0, 'PeakLogic can monitor critical assets.'),
        q('Multi-site office monitoring needs…', ['One sensor for all buildings', 'Consistent deviceId/Position ID strategy', 'No gateways at any site', 'No alarm escalation rules'], 1, 'Centralized PeakLogic project per org model.'),
        q('Chiller monitoring might use…', ['Temperature, pressure, current, flow', 'Only operator HMI font size', 'Only PDF report margins', 'Only email subject lines'], 0, 'Commercial HVAC assets.'),
        q('Generator monitoring checks…', ['Run hours, fuel, fault alarms', 'Only desktop wallpaper rotation', 'Only MV Draw line thickness', 'Only quiz pass percentages'], 0, 'Backup power is critical commercial load.'),
        q('Commercial case study emphasizes…', ['Centralized alarms and escalation', 'Disabling networks to reduce traffic', 'Removing all historians for privacy', 'No documentation of sensor placement'], 0, 'Operations at scale.'),
        q('PeakLogic BACnet/IP integration typically…', ['Runs on the edge appliance and imports read-mostly BMS points', 'Requires ripping out the incumbent BAS', 'Uses the same RS-485 port as Modbus RTU', 'Works only inside Cloud Studio without a site agent'], 0, 'See docs/BACNET.md and M4 optional lab.'),
      ],
    },
    {
      id: 'cbm6',
      track: 'cbm',
      title: 'CBM-6 — Installation',
      questions: [
        q('Site survey before install should record…', ['Locations, access, power, network paths', 'Only team lunch preferences', 'Only monitor screen resolution', 'Nothing — mount sensors randomly'], 0, 'Planning prevents rework.'),
        q('Sensor placement should consider…', ['What failure mode you need to detect', 'Only cable color matching the wall', 'Only the cheapest mounting tape', 'Maximum distance from any power'], 0, 'Mount where the physics matter.'),
        q('Functional test after wiring means…', ['Values make sense in PeakLogic Live I/O', 'Skip Driver Test to save time', 'Delete tags and reimport later', 'Close project without saving'], 0, 'Verify before leaving site.'),
        q('PPE is required because…', ['Electrical and mechanical hazards exist', 'PeakLogic cannot open without a hard hat', 'F1 Help requires safety glasses to display', 'Export .est.zip fails without gloves'], 0, 'Safety first on install labs.'),
        q('CBM-6 maps to PeakLogic…', ['M2 commissioning + M4 drivers', 'M12 cloud login only', 'M10 MV Draw symbols only', 'M11 ROI calculator only'], 0, 'Install → map tags → verify.'),
      ],
    },
    {
      id: 'cbm7',
      track: 'cbm',
      title: 'CBM-7 — Connectivity',
      questions: [
        q('DHCP on a bench gateway…', ['Assigns IP automatically', 'Permanently deletes ST programs', 'Disables MQTT on all ports', 'Formats the project .est.zip file'], 0, 'Static IP used when you need fixed broker address.'),
        q('Firewall must allow for MQTT often…', ['TCP 1883 (or TLS port if used)', 'Only ICMP ping — no TCP', 'Only UDP 53 with no other ports', 'All ports blocked by default always'], 0, 'Document site firewall rules.'),
        q('VPN might be used to…', ['Secure remote access to OT network', 'Increase motor RPM physically', 'Replace leak rope with software', 'Disable historian permanently'], 0, 'Cybersecurity segment from CBM-11.'),
        q('Cellular APN is configured on…', ['Every individual thermistor sensor', 'Gateway device (e.g. T-ETH), not always on every sensor', 'Only the PeakLogic HMI font dialog', 'Only the Historian Report PDF header'], 1, 'Cloud creds on gateway for Opta bridge.'),
        q('CBM-7 maps to PeakLogic…', ['M7 Parc, M12 cloud, M14 cellular', 'M3 Force tags only', 'M6 HMI composites only', 'M0 product map only'], 0, 'Networking labs across Parc path.'),
      ],
    },
    {
      id: 'cbm8',
      track: 'cbm',
      title: 'CBM-8 — Dashboards',
      questions: [
        q('Device registration in PeakLogic is done via…', ['Only sending email to support', 'Drivers + templates; Parc deviceId', 'Only drawing symbols in MV Draw', 'Only acking alarms in bulk'], 1, 'Drivers connect field data.'),
        q('Trend charts use…', ['Historian / live buffer pens', 'Only Modbus exception codes', 'Only ST syntax error list', 'Only CMMS ticket numbers'], 0, 'M8 historian module.'),
        q('HVAC dashboard should show…', ['Key temps, states, and alarms', 'Only broker source code', 'Only driver JSON on disk', 'Only Windows device manager'], 0, 'Operator-focused design.'),
        q('API integration might use…', ['REST / MQTT per PeakLogic deployment', 'Only handwritten fax', 'Only Morse code over radio', 'Only printing paper reports'], 0, 'See platform docs for endpoints.'),
        q('CBM-8 lab aligns with…', ['M6 HMI dashboard exercise', 'M14 T-HaLow template flash only', 'M4 Modbus wiring color code', 'M0 npm install only'], 0, 'Hands-on PeakLogic UI.'),
      ],
    },
    {
      id: 'cbm9',
      track: 'cbm',
      title: 'CBM-9 — Alarm management',
      questions: [
        q('Threshold alarms trip when…', ['A value crosses a configured limit', 'You export the project to .est.zip', 'Runtime Validate completes successfully', 'MV Draw saves a new symbol'], 0, 'Set limits on Tags.'),
        q('Escalation means…', ['Notify additional people if unresolved', 'Delete the sensor from the project', 'Disable MQTT broker permanently', 'Remove all HMI screens'], 0, 'Critical alarms need follow-through.'),
        q('Suppression is used to…', ['Reduce nuisance alarms during known events', 'Hide all equipment problems forever', 'Disable all safety interlocks', 'Stop logging historian data always'], 0, 'Use with documented procedure.'),
        q('Four alarm types in lab might include…', ['High temp, vibration, leak, power fail', 'Only font rendering errors', 'Only PDF export failures', 'Only quiz browser cache'], 0, 'Typical building CBM set.'),
        q('CBM-9 maps to PeakLogic…', ['M9 Alarms panel', 'M10 MV Draw scale tool', 'M7 Parc OTA only', 'M12 entitlements page only'], 0, 'Ack workflow in app.'),
      ],
    },
    {
      id: 'cbm10',
      track: 'cbm',
      title: 'CBM-10 — Data analysis & PdM',
      questions: [
        q('Baseline measurement is…', ['Normal operating signature for comparison', 'Always exactly zero', 'The time of last alarm ack only', 'The size of the .est.zip file in MB'], 0, 'Deviations from baseline matter.'),
        q('Trend analysis helps spot…', ['Gradual degradation over time', 'Only single-point typos in ST', 'Only HMI tile border color', 'Only DHCP lease duration'], 0, 'Historian data supports this.'),
        q('RUL estimate is…', ['Remaining useful life before likely failure', 'Random user login session id', 'Report upload bandwidth limit', 'Room unlock relay voltage'], 0, 'PdM forecast concept.'),
        q('Work orders may be triggered from…', ['Integrated CMMS on alarm transition (or manual WO)', 'Only saving the project file', 'Only placing MV Draw icons', 'Only opening F1 Help'], 0, 'M9 integrated CMMS + optional MQTT bridge.'),
        q('CBM-10 maps to PeakLogic…', ['M8 historian + M11 PdM', 'M4 Modbus slave ID only', 'M0 first launch only', 'M14 HaLow pairing only'], 0, 'Data + analytics modules.'),
      ],
    },
    {
      id: 'cbm11',
      track: 'cbm',
      title: 'CBM-11 — Cybersecurity',
      questions: [
        q('MFA stands for…', ['Multi-factor authentication', 'Motor force alarm on HOA tags', 'Main font attribute in HMI', 'Modbus file access protocol'], 0, 'Extra login security.'),
        q('MQTT credentials on Opta bridge site should be…', ['On gateway, not copied into every sensor unnecessarily', 'Emailed to all contractors in plain text', 'Posted on the operator HMI background', 'Disabled so brokers stay open'], 0, 'Least privilege.'),
        q('Network segmentation…', ['Separates OT from office IT', 'Deletes all PeakLogic drivers', 'Stops ST runtime permanently', 'Removes historian pens'], 0, 'Limits blast radius.'),
        q('Firmware updates should be…', ['Planned and authenticated', 'Never performed under any circumstance', 'Downloaded from any random website', 'Applied only during unplanned outages without backup'], 0, 'Supply chain matters.'),
        q('CBM-11 maps to PeakLogic…', ['M1 roles + M12 cloud tenancy', 'M10 MV Draw layers only', 'M3 Force on outputs only', 'M14 ALF template #6 only'], 0, 'Users and cloud isolation.'),
      ],
    },
    {
      id: 'cbm12',
      track: 'cbm',
      title: 'CBM-12 — Troubleshooting',
      questions: [
        q('Parc device offline — first check…', ['Broker reachability and online topic', 'HMI composite font family', 'Historian PDF page orientation', 'MV Draw grid snap setting'], 0, 'Network + MQTT path.'),
        q('Modbus timeout often means…', ['Wrong port, baud, or slave ID', 'Perfect wiring — ignore driver Test', 'Too many alarms acknowledged', 'Historian has too many pens'], 0, 'Driver Test isolates this.'),
        q('Flat historian line — check…', ['Hist enabled and runtime running', 'Only MV Draw symbol rotation', 'Only Cloud Studio logo', 'Only email signature length'], 0, 'Common student issue.'),
        q('Fault injection lab teaches…', ['Systematic diagnosis', 'Random guessing without symptoms', 'Deleting projects to fix comms', 'Ignoring driver Test results'], 0, 'Instructor breaks one thing per team.'),
        q('CBM-12 maps to PeakLogic…', ['M4 driver Test + M7 Parc + F1 guides', 'M11 ROI calculator only', 'M0 product naming only', 'M13 presentation slides only'], 0, 'Cross-module debug skills.'),
      ],
    },
    {
      id: 'cbm13',
      track: 'cbm',
      title: 'CBM-13 — Capstone',
      questions: [
        q('Capstone teams should deliver…', ['Survey → install → PeakLogic → alarms → presentation', 'Only a multiple-choice retake', 'Only reading F1 without hands-on', 'Only cloud login with no field I/O'], 0, 'Full CBM deployment story.'),
        q('Capstone is weighted at…', ['20% of CBM certification grade', '0% — attendance only', '100% — no labs required', '5% — quizzes replace it'], 0, 'See Assessments tab.'),
        q('Presentation should include…', ['Recommendations from trend/alarm data', 'Only desktop wallpaper choices', 'Only broker config file hex dump', 'Only ST comment formatting'], 0, 'Data-driven maintenance advice.'),
        q('Capstone uses PeakLogic modules…', ['M13 + M2–M9 + M14 integrated', 'M0 navigation only', 'Glossary definitions only', 'No PeakLogic — theory only'], 0, 'End-to-end integrator path.'),
        q('Team roles might include…', ['Lead, network, HMI, documentation', 'Only instructor — no student tasks', 'Only sales — no technical work', 'One passive observer only'], 0, 'See instructor guide capstone rubric.'),
      ],
    },
  ];

  function storageKey(quizId) {
    return `peaklogic-training-quiz-${quizId}`;
  }

  function loadResult(quizId) {
    try {
      const raw = localStorage.getItem(storageKey(quizId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveResult(quizId, payload) {
    try {
      localStorage.setItem(storageKey(quizId), JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function renderQuizSection(quiz) {
    const saved = loadResult(quiz.id);
    const savedBadge = saved
      ? `<p class="training-quiz-prior"><strong>Last attempt:</strong> ${saved.score}/${saved.total} (${saved.percent}%) — ${saved.passed ? 'Pass' : 'Not pass'} on ${saved.date}</p>`
      : '';
    const questionsHtml = quiz.questions
      .map((item, qi) => {
        const choicesHtml = item.choices
          .map((choice, ci) => {
            const inputId = `quiz-${quiz.id}-q${qi}-c${ci}`;
            return `<label class="training-quiz-choice" for="${inputId}">
              <input type="radio" name="quiz-${quiz.id}-q${qi}" id="${inputId}" value="${ci}" />
              <span>${choice}</span>
            </label>`;
          })
          .join('');
        return `<div class="training-quiz-question" data-quiz-q="${qi}">
          <p class="training-quiz-qtext"><strong>${qi + 1}.</strong> ${item.text}</p>
          <div class="training-quiz-choices">${choicesHtml}</div>
          <div class="training-quiz-feedback view-hidden" data-quiz-feedback="${qi}"></div>
        </div>`;
      })
      .join('');

    return `
      <section id="training-quiz-${quiz.id}" class="help-section training-quiz-section" data-quiz-id="${quiz.id}">
        <h3>${quiz.title}</h3>
        <p class="training-quiz-meta">${quiz.questions.length} questions · Pass: ${PASS_PERCENT}% · Open-book allowed</p>
        ${savedBadge}
        <form class="training-quiz-form" data-quiz-form="${quiz.id}">
          ${questionsHtml}
          <div class="training-quiz-actions">
            <button type="submit" class="btn primary">Submit answers</button>
            <button type="button" class="btn" data-quiz-reset="${quiz.id}">Clear &amp; retry</button>
          </div>
          <div class="training-quiz-summary view-hidden" data-quiz-summary="${quiz.id}"></div>
        </form>
      </section>`;
  }

  function buildQuizSections() {
    return QUIZZES.map((quiz) => ({
      id: `quiz-${quiz.id}`,
      title: quiz.title,
      html: renderQuizSection(quiz),
    }));
  }

  function gradeQuiz(form, quiz) {
    let correct = 0;
    const total = quiz.questions.length;
    quiz.questions.forEach((item, qi) => {
      const selected = form.querySelector(`input[name="quiz-${quiz.id}-q${qi}"]:checked`);
      const fb = form.querySelector(`[data-quiz-feedback="${qi}"]`);
      const block = form.querySelector(`[data-quiz-q="${qi}"]`);
      if (!fb || !block) return;
      fb.classList.remove('view-hidden');
      if (!selected) {
        fb.className = 'training-quiz-feedback training-quiz-miss';
        fb.innerHTML = `<strong>Not answered.</strong> ${item.explain}`;
        block.classList.add('training-quiz-wrong');
        return;
      }
      const pick = Number(selected.value);
      if (pick === item.answer) {
        correct += 1;
        fb.className = 'training-quiz-feedback training-quiz-correct';
        fb.innerHTML = `<strong>Correct.</strong> ${item.explain}`;
        block.classList.remove('training-quiz-wrong');
        block.classList.add('training-quiz-right');
      } else {
        fb.className = 'training-quiz-feedback training-quiz-wrong';
        const letter = item.choices[item.answer];
        fb.innerHTML = `<strong>Incorrect.</strong> Best answer: ${letter}. ${item.explain}`;
        block.classList.add('training-quiz-wrong');
        block.classList.remove('training-quiz-right');
      }
    });
    const percent = Math.round((correct / total) * 100);
    const passed = percent >= PASS_PERCENT;
    const summary = form.querySelector(`[data-quiz-summary="${quiz.id}"]`);
    if (summary) {
      summary.classList.remove('view-hidden');
      summary.className = `training-quiz-summary ${passed ? 'training-quiz-pass' : 'training-quiz-fail'}`;
      summary.innerHTML = `<strong>Score: ${correct}/${total} (${percent}%)</strong> — ${passed ? 'Pass' : `Not pass (need ${PASS_PERCENT}%)`}`;
    }
    saveResult(quiz.id, {
      score: correct,
      total,
      percent,
      passed,
      date: new Date().toLocaleString(),
    });
    return { correct, total, percent, passed };
  }

  function resetQuiz(form, quizId) {
    form.reset();
    form.querySelectorAll('.training-quiz-feedback').forEach((el) => {
      el.classList.add('view-hidden');
      el.textContent = '';
    });
    form.querySelectorAll('.training-quiz-question').forEach((el) => {
      el.classList.remove('training-quiz-wrong', 'training-quiz-right');
    });
    const summary = form.querySelector(`[data-quiz-summary="${quizId}"]`);
    if (summary) {
      summary.classList.add('view-hidden');
      summary.textContent = '';
    }
    try {
      localStorage.removeItem(storageKey(quizId));
    } catch {
      /* ignore */
    }
    const section = form.closest('.training-quiz-section');
    const prior = section?.querySelector('.training-quiz-prior');
    if (prior) prior.remove();
  }

  function bindQuizHandlers(root) {
    if (!root) return;
    root.querySelectorAll('[data-quiz-form]').forEach((form) => {
      const quizId = form.dataset.quizForm;
      const quiz = QUIZZES.find((z) => z.id === quizId);
      if (!quiz || form.dataset.bound === '1') return;
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        gradeQuiz(form, quiz);
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    root.querySelectorAll('[data-quiz-reset]').forEach((btn) => {
      const quizId = btn.dataset.quizReset;
      const quiz = QUIZZES.find((z) => z.id === quizId);
      btn.addEventListener('click', () => {
        const form = root.querySelector(`[data-quiz-form="${quizId}"]`);
        if (form && quiz) resetQuiz(form, quizId);
      });
    });
  }

  function renderQuizzesTabHtml() {
    const mvCount = QUIZZES.filter((z) => z.track === 'mv').length;
    const cbmCount = QUIZZES.filter((z) => z.track === 'cbm').length;
    const sections = buildQuizSections();
    return `
      <nav class="help-nav" data-training-nav="quizzes" aria-label="Module quizzes"></nav>
      <div class="help-body popup-scroll" data-training-body="quizzes">
        <section id="training-quiz-intro" class="help-section">
          <h3>Module quizzes</h3>
          <p><strong>${QUIZZES.length} quizzes</strong> (${mvCount} PeakLogic + ${cbmCount} IoT CBM) · 5 questions each · <strong>${PASS_PERCENT}%</strong> to pass · Open-book (F1/F2 allowed).</p>
          <p>Each question has four similar choices — read carefully. Wrong answers are often almost correct.</p>
          <p>Scores save in this browser only (localStorage). Instructors: answer key in <code>docs/training/quizzes-answer-key.md</code>.</p>
          <p>Assign after each module; CBM certification counts quizzes toward 20% of final grade.</p>
        </section>
        ${sections.map((s) => s.html).join('')}
      </div>`;
  }

  return {
    QUIZZES,
    PASS_PERCENT,
    buildQuizSections,
    renderQuizzesTabHtml,
    bindQuizHandlers,
    gradeQuiz,
  };
})();
