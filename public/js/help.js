'use strict';

/**
 * PeakLogic in-app help â€” rendered into #help-content on first open.
 */
window.PeaklogicHelp = (function () {
  /** Sidebar groups â€” defines nav order and section grouping. */
  const NAV_GROUPS = [
    { label: 'Overview', ids: ['start', 'tutorial', 'cloud-studio', 'layout', 'projects', 'faq'] },
    { label: 'Program & runtime', ids: ['system-setup', 'st-editor', 'runtime', 'st-language'] },
    { label: 'Tags & drivers', ids: ['tags', 'alarms', 'drivers', 'mqtt-parc', 'cellular-sims', 'modbus', 'nextcentury', 'remote-io', 'serial-troubleshoot'] },
    { label: 'Historian', ids: ['historian', 'historian-config', 'historian-logger', 'historian-report', 'mongo-logging', 'pdm-predictive', 'roi-calculator'] },
    {
      label: 'HMI',
      ids: [
        'hmi-overview',
        'hmi-composer',
        'hmi-bindings',
        'hmi-widgets',
        'hmi-gauges',
        'hmi-navigation',
        'hmi-troubleshoot',
      ],
    },
    { label: 'Device guides', ids: ['waveshare', 'datexel-dat10148', 'jxct-sensors', 'seeed-sensors', 'dfrobot-sensors', 'is750-ion', 'r7c-orp', 'do3500', 'ezmeter-dds-rgb', 'scan-spectrolyser', 'scan-concube', 'opta', 'edgepoint-industrial'] },
    { label: 'Reference', ids: ['files', 'env'] },
  ];

  const SECTIONS = [
    {
      id: 'start',
      title: 'Getting started',
      html: `
        <p>PeakLogic is a single-page SCADA app: <strong>ST editor</strong>, <strong>tag database</strong>, <strong>I/O drivers</strong>, <strong>HMI composer</strong>, and a <strong>scan-cycle runtime</strong> in one Node process.</p>
        <h4>Where to open it</h4>
        <table class="help-table">
          <tr><th>Deployment</th><th>URL</th><th>Notes</th></tr>
          <tr><td><strong>PC appliance</strong> (<code>est-pc</code>)</td><td><code>http://127.0.0.1:3090</code></td><td><code>npm start</code> â€” default port 3090</td></tr>
          <tr><td><strong>Cloud tenant Studio</strong></td><td><code>http://localhost:3100/studio</code></td><td>Sign in at <code>/login</code> first; per-tenant workspace under <code>data/tenants/{tenantId}/</code></td></tr>
        </table>
        <h4>First-time setup (appliance)</h4>
        <ol>
          <li>Install: <code>npm install</code> in the MVP Suite folder (<code>est-pc</code> or <code>peaklogic-mvp-suite</code>).</li>
          <li>Run: <code>npm start</code></li>
          <li>Open <code>http://127.0.0.1:3090</code> in your browser (default port 3090).</li>
          <li>Configure <strong>Drivers</strong> (Modbus, MQTT, HTTPS, or simulation), then <strong>Tags</strong> or apply a <strong>device template</strong>.</li>
          <li>Edit the <strong>ST program</strong>, click <strong>Validate</strong>, then <strong>Start</strong>.</li>
        </ol>
        <p>Data is stored under <code>data/</code> (tags, drivers, settings). Programs live under <code>st/</code> as <code>.st</code> files.</p>
        <p><strong>Arduino Opta (MQTT):</strong> press <kbd>F1</kbd> â†’ <strong>MQTT Parc hub &amp; Opta</strong>, or see <code>firmware/arduino-opta-mqtt-st/OPTa_FEATURES.md</code>, <a href="/docs/OPTa_FEATURES.pdf" target="_blank" rel="noopener">OPTa_FEATURES.pdf</a> (in-app download), <code>docs/BASELINE_TEST.md</code>, and <code>docs/MQTT_PARC.md</code>.</p>
        <h4>Commissioning workflow</h4>
        <ol>
          <li><strong>Drivers</strong> â€” connect hardware or pick a device template</li>
          <li><strong>Tags</strong> â€” verify I/O mapping, scaling, and alarms</li>
          <li><strong>Program</strong> â€” edit ST, validate, start runtime</li>
          <li><strong>Tags â†’ Force</strong> â€” override inputs/outputs while debugging (with Program open for live trace)</li>
          <li><strong>HMI</strong> â€” compose screens and bindings; apply settings for the live display</li>
        </ol>
        <h4>Help topics (sidebar)</h4>
        <table class="help-table">
          <tr><th>Group</th><th>Topics</th></tr>
          <tr><td>Overview</td><td>Getting started, <strong>Cloud Studio</strong>, layout, projects, FAQ</td></tr>
          <tr><td>Program &amp; runtime</td><td>System setup, ST editor, Start/Pause/Stop, ST language reference</td></tr>
          <tr><td>Tags &amp; drivers</td><td>Tag table, force I/O, Modbus/MQTT/HTTPS, <strong>MQTT Parc</strong>, serial troubleshooting</td></tr>
          <tr><td>Historian</td><td>Trend chart, pen config, logger config, MongoDB archive, PdM (SCADA + Edge), CSV/PDF report</td></tr>
          <tr><td>HMI</td><td>Composer, bindings, pilots, gauges, composites (motor, alternator, TPO, PID), navigation</td></tr>
          <tr><td>Device guides</td><td>Waveshare, Datexel, S::CAN, Arduino Opta, EdgePoint Industrial</td></tr>
          <tr><td>Reference</td><td>Files &amp; folders, environment variables</td></tr>
        </table>
        <p>Press <kbd>F1</kbd> or click <strong>Help</strong> in the top bar. Each tool window also has a contextual <strong>Help</strong> button that jumps to the matching topic.</p>
        <p>See <strong>Help → Commissioning tutorial</strong> for a step-by-step walkthrough (project → hardware → HMI) and the <strong>Hardware wizard</strong> under <strong>Drivers</strong>.</p>
      `,
    },
    {
      id: 'tutorial',
      title: 'Commissioning tutorial',
      html: `
        <p>This tutorial walks through a typical PeakLogic commissioning path: create a project, connect hardware with a device template, then compose HMI screens. Use <strong>Drivers → Hardware wizard…</strong> for guided template apply, or follow the manual steps below.</p>
        <h4>Step 1 — Create or open a project</h4>
        <ol>
          <li><strong>Project ▾ → New project…</strong> — starts a blank tag database (confirm when prompted).</li>
          <li><strong>Project ▾ → Open project…</strong> — pick a saved project from <code>data/projects/</code>.</li>
          <li><strong>Project ▾ → Save project</strong> / <strong>Save project as…</strong> — writes <code>data/projects/*.est.zip</code> (tags, drivers, HMI, programs, settings).</li>
          <li><strong>Project ▾ → Save workspace</strong> — working copy to <code>data/workspace.est.zip</code> without a library entry.</li>
        </ol>
        <p><em>UI path:</em> top bar <strong>Project ▾</strong> menu. Project name appears to the right of the menu when a project is loaded.</p>
        <h4>Step 2 — Pick hardware (drivers &amp; templates)</h4>
        <ol>
          <li>Open <strong>Tools ▾ → Drivers</strong> (or the <strong>Drivers</strong> tool button).</li>
          <li>Click <strong>Hardware wizard…</strong> for a guided flow: transport → template → connection → apply.</li>
          <li>Or expand <strong>Apply device template</strong> manually — pick a template (e.g. <strong>Datexel DAT10148</strong>, <strong>Arduino Opta — MQTT Parc ST</strong>), set COM port or device ID, click <strong>Apply template</strong>.</li>
          <li>For Modbus RTU: edit the driver row for COM port and baud; each apply on a shared bus uses the <strong>next slave address</strong>.</li>
          <li>For MQTT Parc Opta: enable the hub in <strong>Project → System setup → MQTT Parc</strong>, then apply the Opta template or use <strong>Add Opta Parc devices (bulk)</strong>.</li>
        </ol>
        <p><em>Wizard vs manual:</em> both call <code>POST /devices/apply</code> with the same preset IDs from <code>src/devices/templates/</code>. The wizard filters templates by transport and collects connection fields; the manual bar also supports ConCube parameter groups and replace-tags.</p>
        <h4>Step 3 — Pick screen components (HMI)</h4>
        <ol>
          <li>On the live HMI panel, click <strong>Setup…</strong> (or <strong>Project → System setup → HMI</strong> → <strong>Open HMI composer</strong>).</li>
          <li>In the asset browser, filter <strong>Composites</strong> — place widgets such as <strong>Motor / pump (HOA)</strong>, <strong>TPO daily schedule</strong>, <strong>PID loop</strong>, or <strong>Alarm list</strong>.</li>
          <li>Select a tile → <strong>Bindings</strong> palette — map tag names to pilot states, text, gauges, and commands.</li>
          <li>Click <strong>Apply</strong> in the composer, then <strong>Project → System setup → Apply all settings</strong> if you changed the starting screen.</li>
        </ol>
        <p>See <strong>Help → HMI composer</strong> and <strong>HMI bindings</strong> for composite details.</p>
        <h4>Fixtures, templates, and composites — glossary</h4>
        <table class="help-table">
          <tr><th>Term</th><th>What it is</th><th>Where</th><th>Relates to</th></tr>
          <tr>
            <td><strong>Device template</strong></td>
            <td>Preset <strong>driver</strong> + <strong>tag</strong> definitions for a specific instrument or module. Example: <code>datexel_dat10148.json</code> adds 16 DI tags on Modbus RTU.</td>
            <td><code>src/devices/templates/*.json</code> + built-in presets in <code>devicePresets.js</code></td>
            <td>Applied via <strong>Hardware wizard</strong> or <strong>Drivers → Apply template</strong>; creates/updates drivers and tags.</td>
          </tr>
          <tr>
            <td><strong>Program fixture</strong></td>
            <td>Sample <strong>ST program</strong> plus matching <code>tags.*.json</code> and <code>drivers.*.json</code> for logic examples (motor HOA, TPO irrigation, alternator, Modbus demo).</td>
            <td><code>st/fixtures/</code> + <code>st/logic/*.st</code></td>
            <td>Loaded with <strong>Program → Load program</strong> and <strong>Load fixtures</strong>; does not replace device templates — it supplies example tags/drivers for the sample ST.</td>
          </tr>
          <tr>
            <td><strong>HMI composite</strong></td>
            <td>Pre-wired <strong>screen widget</strong> (SVG tiles + default bindings) — motor faceplate, PID faceplate, TPO schedule, alarm list, etc.</td>
            <td><code>public/hmi/svg/composites/</code> manifests via <code>hmiComposites.js</code></td>
            <td>Placed in <strong>HMI Setup</strong>; bindings reference <strong>tag names</strong> from your tag database (from templates, fixtures, or manual entry).</td>
          </tr>
        </table>
        <h4>How they work together</h4>
        <ol>
          <li><strong>Device template</strong> → hardware I/O tags (<code>DI1</code>, <code>MOTOR1_RUN</code>, …).</li>
          <li><strong>Program fixture</strong> (optional) → example ST logic + tag set for a use case; align tag names with your drivers or reload fixtures after apply.</li>
          <li><strong>HMI composite</strong> → visualizes and commands those tags on the operator display.</li>
        </ol>
        <p><strong>Hardware wizard</strong> covers step 2 only. After apply, use <strong>Tags</strong> to verify I/O, <strong>Program</strong> to run ST, and <strong>HMI Setup</strong> for step 3. Press <kbd>F1</kbd> → this topic anytime.</p>
      `,
    },
    {
      id: 'cloud-studio',
      title: 'PeakLogic Cloud Studio',
      html: `
        <p>Hosted tenants use <strong>Studio</strong> â€” the same ST/HMI/runtime UI as the PC appliance, inside the cloud shell.</p>
        <ol>
          <li>Run <code>peaklogic-cloud</code>: <code>npm run seed</code> then <code>npm start</code> (port <strong>3100</strong>).</li>
          <li>Sign in at <strong>/login</strong> (tenant slug + email + password).</li>
          <li>Open <strong>Studio</strong> from the nav bar or go to <strong>/studio</strong>.</li>
        </ol>
        <p>Runtime API base is <code>/api/studio</code> (tenant session cookie). Workspace files are isolated per tenant under <code>data/tenants/{tenantId}/</code> (tags, drivers, HMI, Parc registry).</p>
        <p><strong>MQTT Parc / Opta</strong> works in Studio when the hub and <code>mqtt_parc</code> drivers are configured â€” same as appliance. <strong>Modbus</strong> and other LAN field buses require an <strong>edge appliance</strong> or the cloud runtime fork (<code>npm run start:runtime</code> on port 3090), not the hosted multitenant process.</p>
        <p>See <code>peaklogic-cloud/docs/USER_GUIDE.md</code> and <code>docs/EST_PC_PARITY.md</code>.</p>
      `,
    },
    {
      id: 'layout',
      title: 'Screen layout',
      html: `
        <h4>Top bar</h4>
        <table class="help-table">
          <tr><th>Control</th><th>Purpose</th></tr>
          <tr><td><strong>Project &#9662;</strong></td><td>Status, system setup, new/open/save project, save project as, save workspace</td></tr>
          <tr><td>Project name</td><td>Current project indicator (right of Project menu)</td></tr>
          <tr><td><strong>Historian &#9662;</strong></td><td>Historian trend chart, logger config, pen config</td></tr>
          <tr><td><strong>Reporting &#9662;</strong></td><td>Historian reports — CSV export and print/PDF</td></tr>
          <tr><td><strong>Tools &#9662;</strong></td><td>Program, Tags, Drivers, Connectivity</td></tr>
          <tr><td><strong>Help &#9662;</strong></td><td>This panel (<kbd>F1</kbd>)</td></tr>
          <tr><td><strong>Facility Builder</strong></td><td>Site-plan layout editor (<code>/facility-draw</code>)</td></tr>
          <tr><td><strong>Alarms</strong></td><td>Active alarm list — scroll, per-row <strong>Ack</strong>, badge on button</td></tr>
          <tr><td><strong>Tags</strong></td><td>Floating tag database — edit tags, scale/alarms, <strong>Force</strong> I/O, <strong>Live I/O…</strong></td></tr>
          <tr><td><strong>Drivers</strong></td><td>Driver list, device templates, Modbus RTU tool (modal popup)</td></tr>
        </table>
        <h4>Main workspace (HMI)</h4>
        <p>Live operator display â€” composed tiles, tag-driven graphics, multi-screen navigation. Startup page: <strong>System setup â†’ General â†’ Starting HMI screen</strong>. Use <strong>Setupâ€¦</strong> on the HMI panel to open the composer. Screen tabs and <strong>Hide</strong> / <strong>Show status</strong> stack vertically on narrow screens.</p>
        <h4>Floating tool windows</h4>
        <table class="help-table">
          <tr><th>Window</th><th>Move / resize</th><th>Notes</th></tr>
          <tr><td><strong>Program</strong></td><td>â ¿ Move bar or header; edges/corners</td><td>Session layout remembered; no modal backdrop</td></tr>
          <tr><td><strong>Tags</strong></td><td>Same</td><td>Wide table; frozen Tag column; force column on the right</td></tr>
          <tr><td><strong>Live I/O</strong></td><td>Same</td><td>Opened from <strong>Tags â†’ Live I/Oâ€¦</strong>; program I/O while running</td></tr>
          <tr><td><strong>Historian</strong></td><td>Same</td><td>Chart resizes with the panel; session layout remembered</td></tr>
          <tr><td><strong>Pen config</strong></td><td>Same</td><td>Trend chart pens and live buffer size â€” <strong>Historian â†’ Pen configâ€¦</strong></td></tr>
          <tr><td><strong>Logger config</strong></td><td>Same</td><td>MongoDB connection, <strong>Hist</strong> tags, runtime auto-start, PdM asset map â€” <strong>Historian â†’ Logger configâ€¦</strong></td></tr>
          <tr><td><strong>Alarms</strong></td><td>Same</td><td>Scrolling active-alarm list; configure limits in <strong>Tags</strong></td></tr>
        </table>
        <h4>Window stacking</h4>
        <p>Every window has <strong>Front</strong> and <strong>Back</strong> in the header (first buttons in the action row). Click a window or drag it to raise it; use <strong>Front</strong> / <strong>Back</strong> to reorder overlapping panels.</p>
        <p>Keep <strong>Program</strong> and <strong>Tags</strong> open together while commissioning â€” trace logic in Program and force values in Tags.</p>
        <p>Modal popups (Drivers, Report, System setup, Help) also have <strong>Front</strong> / <strong>Back</strong> and can overlap floating panels.</p>
        <p>Click any top-bar menu (<strong>Project ▾</strong>, <strong>Historian ▾</strong>, <strong>Reporting ▾</strong>, <strong>Tools ▾</strong>, <strong>Help ▾</strong>) to open a vertical menu; click outside, press Escape, or pick an item to close. On narrow screens the top bar stacks vertically.</p>
        <p>Live data uses <strong>HTTP polling</strong> (60&nbsp;s in normal view, 10&nbsp;s with <strong>Test mode</strong> for technicians or demo projects), not WebSocket. Values refresh while the runtime is running.</p>
      `,
    },
    {
      id: 'projects',
      title: 'Projects',
      html: `
        <p>Click <strong>Project â–¾</strong> (next to the PeakLogic brand) to expand or collapse the project menu â€” <strong>Statusâ€¦</strong>, <strong>System setupâ€¦</strong>, <strong>New projectâ€¦</strong>, <strong>Open projectâ€¦</strong>, <strong>Export project fileâ€¦</strong>, <strong>Save projectâ€¦</strong>, <strong>Save project asâ€¦</strong>, and <strong>Save workspace</strong>. Click again, press Escape, or click outside to collapse. The active project name is shown to the right as a status indicator.</p>
        <p><strong>System setup</strong> covers project identity, scan rate, <strong>starting HMI screen</strong>, hardware defaults, archive maintenance, <strong>PdM</strong> batch settings, HMI composer access, and saved projects under <code>data/projects/</code>. Trend pens and MongoDB logging are under <strong>Historian â†’ Pen configâ€¦</strong> and <strong>Logger configâ€¦</strong>. See <strong>Help â†’ System setup</strong> for each tab.</p>
        <p><strong>Open projectâ€¦</strong> shows a picker of saved <code>.est.zip</code> projects in <code>data/projects/</code>. Use <strong>Import fileâ€¦</strong> to load a portable <code>.est.zip</code> / <code>.est.json</code> from another PC or PeakLogic version, or <strong>Export fileâ€¦</strong> to download the selected library project.</p>
        <p><strong>Export project fileâ€¦</strong> downloads the current open project as <code>&lt;name&gt;.est.json</code> (tags, drivers, program, HMI, settings) for use on another machine or PeakLogic version.</p>
        <p><strong>Save projectâ€¦</strong> writes the full snapshot to <code>data/projects/*.est.zip</code>. <strong>Save project asâ€¦</strong> prompts for a new name. <strong>Save workspace</strong> writes a working copy to <code>data/workspace.est.zip</code> without adding a library entry â€” used when startup mode is <strong>Last workspace</strong>.</p>
        <p><strong>Workspace &amp; Opta drivers:</strong> Adding or bulk-adding <code>mqtt_parc</code> drivers updates <code>workspace.est.json</code>. On restart, remote drivers in <code>drivers.json</code> are merged into the workspace snapshot so Opta drivers are not dropped.</p>
        <p>The <strong>Projects</strong> tab in System setup offers the same library plus <strong>Export fileâ€¦</strong> and <strong>Import fileâ€¦</strong>.</p>
        <p>Accepted formats (older and newer format versions are upgraded automatically on import):</p>
        <ul>
          <li>Official: <code>format: "peaklogic-est"</code>, <code>version: 1</code> (other format versions are migrated)</li>
          <li>Legacy bundle: JSON with <code>tags</code>, <code>drivers</code>, and <code>program</code> arrays (no format field)</li>
          <li>Tags-only JSON: array of tags or <code>{ "tags": [...] }</code></li>
        </ul>
        <p>Exports include <code>exportedBy</code> (PeakLogic app version). Import may show upgrade notes when the file came from an older or newer copy.</p>
        <p>A project import replaces tags (and drivers/program when present). Always check the tag count after opening a file.</p>
      `,
    },
    {
      id: 'system-setup',
      title: 'System setup',
      html: `
        <p>Open <strong>Project â†’ System setupâ€¦</strong> (or the setup icon on the HMI panel). Changes are written to <code>data/settings.json</code> when you click <strong>Apply all settings</strong> at the bottom of the dialog.</p>
        <table class="help-table">
          <tr><th>Tab</th><th>Settings</th></tr>
          <tr><td><strong>General</strong></td><td><strong>Project name</strong>, <strong>Active ST program</strong> (dropdown from <code>st/</code>), <strong>Scan interval (ms)</strong>, <strong>Starting HMI screen</strong>, <strong>Enable MQTT Parc hub</strong>, <strong>MQTT broker URL</strong>, <strong>Remote ST execution</strong> (deploy/run ST on Opta via MQTT), <strong>Auto-run ST on Opta after power-up</strong> (sends <code>autoRunOnBoot</code> with deploy; requires NV program on device)</td></tr>
          <tr><td><strong>Features</strong></td><td><strong>Enable Cloud Sim management</strong> and <strong>Enable Cellular SIM management</strong> — optional cloud tools on the PC appliance (no <code>.env</code> required). Apply all settings, then reload the page for <strong>Open Cloud Sims</strong> / <strong>Open Cellular SIMs</strong> links.</td></tr>
          <tr><td><strong>Hardware</strong></td><td>Default serial port, baud, Modbus slave id, and device template for new RTU drivers</td></tr>
          <tr><td><strong>Logging</strong></td><td>Archive demo seed and purge â€” MongoDB connection, <strong>Hist</strong> tags, and auto-start: <strong>Historian â†’ Logger configâ€¦</strong> (see <strong>Help â†’ Logger config</strong>)</td></tr>
          <tr><td><strong>PdM</strong></td><td>Asset â†’ tag map, feature windows, failure threshold, nightly batch, motor simulation â€” see <strong>Help â†’ PdM (predictive maintenance)</strong></td></tr>
          <tr><td><strong>HMI</strong></td><td>Summary counts and <strong>Open HMI composer</strong> â€” edit screens, tiles, and bindings in the composer; use <strong>Apply HMI settings</strong> there for layout changes</td></tr>
          <tr><td><strong>Projects</strong></td><td><strong>New project</strong>, open/save/delete snapshots under <code>data/projects/</code> â€” same library as <strong>Project â†’ Open/Save projectâ€¦</strong></td></tr>
        </table>
        <h4>Starting HMI screen</h4>
        <p>On <strong>General</strong>, pick any configured screen from the dropdown. After <strong>Apply all settings</strong>, the main-page live HMI opens on that screen (page refresh or next poll also picks up the change). Operators can still switch pages with the navigation bar or on-screen nav buttons.</p>
        <p>If you add or remove screens in the composer, screen ids are renumbered (<code>screen_1</code>, <code>screen_2</code>, â€¦). The starting screen setting is remapped to the same page when possible; if that screen was deleted, it falls back to <strong>Screen 1</strong>.</p>
        <p><strong>Apply all settings</strong> saves the starting screen even when the HMI composer is closed. Composer layout/bindings are included only when the composer is open and has unsaved edits.</p>
        <h4>MQTT Parc hub</h4>
        <p>On <strong>General</strong>, enable <strong>MQTT Parc hub</strong> and set the <strong>broker URL</strong> to your PC LAN address (e.g. <code>mqtt://192.168.1.233:1883</code>) â€” the same broker the Opta firmware uses (also set on the device <strong>/setup</strong> page). Enable <strong>Remote ST execution</strong> to deploy and run ST on the device.</p>
        <p>Check <strong>Auto-run ST on Opta after power-up</strong> when the device should start ST from NV after a power cycle (deploy at least once so bytecode is stored in QSPI). PeakLogic also waits ~8 s after PC boot before auto-deploy so the Opta MQTT cmd link can settle.</p>
        <p>After restart, the hub connects automatically when enabled; <code>mqtt_parc</code> drivers <strong>auto-link</strong> (driver card shows <strong>OK</strong>). Use <strong>Download &amp; Start</strong> in Program to deploy bytecode â€” linking is not the same as running ST on the Opta. See <strong>Help â†’ MQTT Parc hub &amp; Opta</strong>.</p>
      `,
    },
    {
      id: 'st-editor',
      title: 'ST program editor',
      html: `
        <table class="help-table">
          <tr><th>Button</th><th>Action</th></tr>
          <tr><td><strong>New</strong></td><td>Blank template; prompts for path under <code>st/</code>; save to create file</td></tr>
          <tr><td><strong>Open from st/â€¦</strong></td><td>Pick an existing <code>.st</code> from the programs folder</td></tr>
          <tr><td><strong>Import .st</strong></td><td>Copy a file from outside <code>st/</code> into the tree</td></tr>
          <tr><td><strong>Save program</strong></td><td>Write editor text to the active <code>.st</code> path</td></tr>
          <tr><td><strong>Save asâ€¦</strong></td><td>Save under a new relative path</td></tr>
          <tr><td><strong>Load selected</strong></td><td>Load program text only â€” does not change tags or drivers</td></tr>
          <tr><td><strong>Load fixtures</strong></td><td>Replace <em>all</em> tags and drivers with the <code>st/fixtures/</code> demo bundle for the selected program (Waveshare, Opta, motor, TPO irrigation, etc.)</td></tr>
          <tr><td><strong>Create tags from program</strong></td><td>Add missing tags referenced in the editor (existing tags unchanged â€” safe after HMI composite placement)</td></tr>
          <tr><td><strong>Reload from disk</strong></td><td>Re-read the active <code>.st</code> from the programs folder (use after editing the file externally or to pick up server-side fixes)</td></tr>
          <tr><td><strong>Clear active</strong></td><td>Unload the active program, clear the editor, and stop runtime if running</td></tr>
          <tr><td><strong>Revert</strong></td><td>Discard unsaved editor changes (keeps the same active file)</td></tr>
          <tr><td><strong>Show</strong></td><td>Program tag list and Live I/O: display <strong>Tag id</strong>, <strong>Label</strong>, or <strong>Label Â· id</strong>. ST source always uses raw tag names; the chip row under the toolbar maps names to labels.</td></tr>
          <tr><td><strong>Validate</strong></td><td>Parse ST and check tag names exist</td></tr>
          <tr><td><strong>Load for runtime</strong></td><td>Validate editor ST and load into PeakLogic runtime without saving to disk. Does <em>not</em> deploy to Opta â€” use <strong>Download &amp; Start</strong> when Remote is on.</td></tr>
          <tr><td><strong>Remote</strong></td><td>When checked, ST runs on a remote device (<strong>mqtt_parc</strong> MQTT Opta recommended, or legacy <code>opta_remote</code> HTTP). When off, the PC scan engine runs ST locally.</td></tr>
          <tr><td><strong>Connect / Disconnect</strong></td><td>Link the Opta MQTT cmd channel (<code>runtime_status</code> + <code>sync_time</code>). With <code>mqtt_parc</code>, drivers usually auto-link on boot â€” use Connect only to retry. <strong>Connect</strong> does not deploy or run ST. Stop remote runtime before disconnecting.</td></tr>
          <tr><td><strong>Download &amp; Start</strong></td><td>When Remote is on, the green button deploys ST bytecode (<code>put_program</code>) then starts the device runtime (<code>runtime_start</code>). Skips deploy when Opta NV CRC already matches PC bytecode and ST is running from auto-run.</td></tr>
          <tr><td><strong>Live I/O â†’ Enable I/O update</strong></td><td>Checkbox in the Live I/O panel (<code>mvLiveIoUpdate</code>, persisted in browser). When checked, forced values and live tag reads refresh while the panel is open during remote runtime.</td></tr>
        </table>
        <p><strong>Editing:</strong> Tab inserts two spaces; <kbd>Ctrl+S</kbd> saves. Unsaved edits are not overwritten by polling. Status shows <em>Unsaved changes</em> when dirty.</p>
        <h4>Live trace overlay (while running)</h4>
        <p>With the runtime <strong>Start</strong>ed, the editor shows a read-only overlay on your ST source:</p>
        <ul>
          <li><strong>True</strong> BOOL conditions â€” green <code>âœ“</code> beside the expression</li>
          <li><strong>False</strong> BOOL conditions â€” <code>âœ—</code></li>
          <li>Output tags in actions (e.g. <code>R1</code> in <code>TurnON(R1)</code>) â€” <strong>red</strong> when ON</li>
          <li>INT/REAL operations â€” <code>= value</code> beside the expression</li>
        </ul>
        <p>With <strong>Remote</strong> on and <strong>Download &amp; Start</strong>, live trace comes from Opta telemetry (same overlay rules). Deploy includes a <strong>traceMap</strong> (source spans) plus bytecode <code>TRACE_PEEK</code> ops; the Opta returns compact <code>programTrace</code> indices in telemetry and the PC maps them back to highlights. Trace updates at the device <strong>report interval</strong> â€” lower <code>reportIntervalMs</code> on the <code>mqtt_parc</code> driver for faster refresh (template default 200 ms). Status shows <em>waiting for trace telemetry</em> until the first report arrives.</p>
        <p>Open <strong>Tags</strong> alongside Program to force I/O values while watching logic trace. Drag the Program window by the <strong>â ¿ Move</strong> bar or header; resize from edges.</p>
        <p><strong>Library</strong> lists all <code>.st</code> files under <code>st/logic</code>, <code>st/modbus</code>, <code>st/mqtt</code>.</p>
      `,
    },
    {
      id: 'runtime',
      title: 'Runtime (Start / Pause / Stop)',
      html: `
        <p><strong>Start</strong> runs the scan loop at <code>scanMs</code> (default 100 ms). When <strong>Remote</strong> is on, the button reads <strong>Download &amp; Start</strong> â€” deploy ST to the Opta then run there.</p>
        <p><strong>Local</strong> (Program â†’ Remote off): read drivers â†’ execute ST on PC â†’ update timers/counters/PID/AVG â†’ write outputs.</p>
        <p><strong>Remote</strong> (Remote on + <code>mqtt_parc</code> driver): hub must be connected; driver should show <strong>OK</strong> / linked (auto-link on boot). <strong>Connect</strong> verifies the cmd link only. <strong>Download &amp; Start</strong> deploys bytecode and runs ST on the device; tag values sync from Parc telemetry. On PC boot with auto-start, PeakLogic waits ~8 s before deploy so Opta MQTT commands are ready. If NV on the Opta already holds the same program CRC and ST is running, deploy is skipped.</p>
        <p><strong>Pause</strong> stops scan cycles but keeps the runtime loaded (program and driver links). Live I/O values freeze. Click <strong>Resume</strong> (the green button relabels while paused) to continue scanning.</p>
        <p><strong>Stop</strong> halts the loop completely; the last values remain visible.</p>
        <p>While running, open <strong>Program</strong> for the live ST trace overlay and <strong>Tags</strong> to force inputs/outputs for commissioning. Forces persist across Pause; clear them from <strong>Tags â†’ Clear forces</strong> when done.</p>
        <p>Start fails with <em>Unknown tag</em> when the program uses a <strong>Tag id</strong> that is not in the table. Labels are display-only â€” they do not alias program names. Use <strong>Create tags from program</strong> (adds missing ids) or <strong>Load fixtures</strong> for bundled demos (<code>motor_hoa</code>, <code>23_tpo_irrigation.st</code>, etc.).</p>
        <p>Open <strong>Project â†’ Statusâ€¦</strong> for runtime state, serial/Modbus health, tag count, and program validity. Save <strong>Scan ms</strong> there to change cycle time (applied on next Start). Use <strong>Program</strong> for Start/Pause/Stop.</p>
      `,
    },
    {
      id: 'tags',
      title: 'Tags',
      html: `
        <p>Tags are named variables the ST program and drivers share. Max <strong>1024</strong> tags. Open <strong>Tags</strong> from the top bar.</p>
        <table class="help-table">
          <tr><th>Role</th><th>Meaning</th></tr>
          <tr><td>input</td><td>Read from driver each scan (unless forced)</td></tr>
          <tr><td>output</td><td>Written to driver when logic changes them (dirty)</td></tr>
          <tr><td>memory</td><td>Internal; optional VPB/VPI/VPR naming for BOOL/INT/REAL</td></tr>
          <tr><td>fb</td><td>Timer (TMR), counter (CTR), PID (PID), averager (AVG)</td></tr>
        </table>
        <p><strong>Types:</strong> BOOL, INT, REAL, TIMER, COUNTER, PID, AVG. I/O tags need a <strong>Driver</strong> id, <strong>Link</strong> (Modbus, MQTT, HTTPS, or Simulator), and an <strong>Addr</strong> (register, topic, or URL/path).</p>
        <p><strong>32-bit arrays:</strong> For INT tags set <strong>Bits</strong> to 32 and <strong>array length</strong> &gt; 1 (e.g. Ã—8). One Modbus holding block maps to consecutive registers â€” read FC3, write <strong>FC16</strong> (multiple registers). In ST use <code>MyArr[2]</code> or <code>ArrayValue(MyArr, 2)</code>; write with <code>SetArray(MyArr, 2, 100);</code>. Preset: <strong>Modbus 32-bit array â€” 8 DINT block</strong>.</p>
        <h4>Window &amp; table</h4>
        <ul>
          <li>Floating window â€” drag the <strong>â ¿ Move</strong> bar or header; resize from edges/corners. Position and size are remembered for the session.</li>
          <li><strong>Edit</strong> is beside each tag name in the frozen <strong>Tag</strong> column; <strong>Apply</strong> / <strong>Cancel</strong> appear there while editing. <strong>Ã—</strong> deletes at the row end.</li>
          <li>The <strong>Tag</strong> column stays fixed when you scroll horizontally through scale, alarm, and force columns.</li>
          <li>Click a <strong>column header</strong> to sort (click again to reverse).</li>
          <li><strong>Live I/Oâ€¦</strong> opens a separate floating panel for program I/O while the runtime runs.</li>
        </ul>
        <p>A <strong>new project</strong> starts with <strong>no tags</strong>, no drivers, and no active ST program. Add tags manually, with <strong>Create tags from program</strong>, from an HMI composite placement, or by opening a saved project. Each tag may have a <strong>Label</strong> (Tags table) used on HMI faceplates and in program/HMI pickers.</p>
        <h4>Recommended workflow (ST + HMI)</h4>
        <ol>
          <li><strong>Load selected</strong> â€” load the <code>.st</code> text only (does not change tags).</li>
          <li><strong>Create tags from program</strong> â€” adds missing tag names referenced in ST and fills default labels when empty.</li>
          <li><strong>Start</strong> â€” or fix any remaining validation errors.</li>
          <li><strong>HMI setup</strong> â€” place composites (PID, motor, gauges). Composite placement also creates its default tags if missing â€” no duplicates.</li>
          <li><strong>Apply HMI settings</strong> â€” save bindings. Bindings use tag id; the Tag column can show <strong>Label</strong>, id, or both via <strong>Show</strong>.</li>
        </ol>
        <p>Either order works if tag names match: ST-first is clearer because the program defines the tag contract. HMI-first is fine when composites create the same tag ids (e.g. <code>MOTOR1_*</code>, <code>PID1</code>) before you load ST.</p>
        <p><strong>Load fixtures</strong> (separate button) replaces <em>all</em> tags and drivers with a demo bundle from <code>st/fixtures/</code> â€” includes tag labels where defined (e.g. motor HOA sample).</p>
        <h4>Scaling (INT/REAL)</h4>
        <p><strong>Scale</strong> column: engineering value = <code>raw Ã— scale + offset</code>. Modbus reads/writes use this. Default is Ã—1 +0. Edit scale and offset on the row when type is INT or REAL.</p>
        <h4>Historian / archive (Hist column)</h4>
        <p>Plottable tags (BOOL, INT, REAL, PID, AVG, FLOW) are <strong>on by default</strong> for the live in-memory buffer and MongoDB archive while the runtime runs. Use the <strong>Hist</strong> column (or <strong>Historian â†’ Logger configâ€¦</strong>) to include or exclude each tag; the header checkbox selects or clears <strong>all</strong> plottable tags. Unchecked tags are not recorded. Changes save when you click <strong>Save tags</strong> or <strong>Save logger settings</strong>. <strong>Historian â†’ Pen configâ€¦</strong> trend pens are separate â€” they control chart display only, not what gets logged.</p>
        <h4>Alarms</h4>
        <table class="help-table">
          <tr><th>Type</th><th>Columns</th><th>Live state</th></tr>
          <tr><td>INT / REAL</td><td><strong>Alm</strong>, <strong>OL</strong>, <strong>IL</strong>, <strong>IH</strong>, <strong>OH</strong> (outer/inner limits)</td><td><strong>State</strong>: Outer low â†’ Inner low â†’ Normal â†’ Inner high â†’ Outer high</td></tr>
          <tr><td>BOOL</td><td><strong>Alm</strong>, <strong>Condition</strong> (When ON / When OFF)</td><td><strong>State</strong>: Alarm or Normal</td></tr>
        </table>
        <p><strong>Save tags</strong> writes <code>data/tags.json</code>. <strong>Live</strong> updates while the runtime is running.</p>
        <h4 id="help-force">Force I/O (inside Tags table)</h4>
        <p>Override tag values without changing the ST program. Force is part of the Tags table â€” two columns after <strong>Live</strong>: <strong>Force</strong> (on/off) and <strong>Force val</strong> (value + Apply). There is no separate Force window.</p>
        <table class="help-table">
          <tr><th>Column</th><th>Action</th></tr>
          <tr><td><strong>Force</strong></td><td>Check <strong>On</strong> to enable; uncheck to release. Toggling applies immediately</td></tr>
          <tr><td><strong>Force val</strong></td><td>BOOL: OFF/ON dropdown. INT/REAL: type a number. Click <strong>Apply</strong> or press <kbd>Enter</kbd> in the value field</td></tr>
          <tr><td>Toolbar</td><td><strong>Clear forces</strong> releases every forced tag at once</td></tr>
        </table>
        <p>PeakLogic picks the force direction from tag <strong>role</strong>:</p>
        <ul>
          <li><strong>input</strong> â€” skips the driver read; logic sees your forced value</li>
          <li><strong>output</strong> / <strong>memory</strong> / <strong>fb</strong> â€” overrides logic and drives the output write</li>
        </ul>
        <p>Forced rows highlight <strong>yellow</strong> with an <strong>F</strong> badge on the tag name. Forced points also show a <strong>FORCED</strong> badge in <strong>Live I/O</strong>. With <strong>Remote</strong> and <code>mqtt_parc</code>, forces are sent to the Opta via MQTT (<code>set_force</code> / <code>clear_force</code>) â€” telemetry reports both <strong>logic</strong> (hardware read) and <strong>effective</strong> (forced) values. Open <strong>Program</strong> and <strong>Tags</strong> together to trace logic and force I/O in one session.</p>
      `,
    },
    {
      id: 'alarms',
      title: 'Alarms',
      html: `
        <p>Open <strong>Alarms</strong> from the top bar for a scrolling list of <strong>active</strong> alarm conditions. Limits and enable flags come from the <strong>Tags</strong> table â€” there is no separate alarm configuration screen.</p>
        <h4>Configuration (Tags table)</h4>
        <table class="help-table">
          <tr><th>Type</th><th>Setup</th></tr>
          <tr><td><strong>INT / REAL</strong></td><td>Check <strong>Alm</strong>, set <strong>OL / IL / IH / OH</strong> (outer low, inner low, inner high, outer high). All four limits required.</td></tr>
          <tr><td><strong>BOOL</strong></td><td>Check <strong>Alm</strong>, set <strong>Condition</strong> to <strong>When ON</strong> or <strong>When OFF</strong>.</td></tr>
        </table>
        <h4>Alarm window</h4>
        <ul>
          <li>Floating panel â€” drag, resize, <strong>Front</strong> / <strong>Back</strong> like other tool windows.</li>
          <li>Lists tags in alarm (not Normal). Sorted by severity; unacknowledged rows first.</li>
          <li><strong>Ack</strong> on each row â€” silences annunciation while the condition remains active. Clearing the alarm (return to Normal) removes the row; a new excursion is unacknowledged again.</li>
          <li><strong>Ack all</strong> acknowledges every active alarm.</li>
          <li>Uncheck <strong>Show acknowledged</strong> to hide acked rows.</li>
          <li>Red badge on the <strong>Alarms</strong> tab shows unacknowledged count while the window is closed.</li>
        </ul>
        <p>Runtime must be <strong>Start</strong>ed for live values and alarm state to update from I/O scans.</p>
      `,
    },
    {
      id: 'drivers',
      title: 'Drivers',
      html: `
        <p>Drivers connect tags to hardware, field buses, or cloud APIs. <strong>Add driver</strong> â†’ pick type â†’ <strong>Edit</strong> â†’ <strong>Apply &amp; save</strong>.</p>
        <table class="help-table">
          <tr><th>Type</th><th>Use</th></tr>
          <tr><td>mock</td><td>Simulation (no hardware)</td></tr>
          <tr><td>hal</td><td>Built-in I/O HAL â€” on-board DI/DO/AI/AO and hardware counters (<code>DI0</code>, <code>CNT0</code>, â€¦). Use preset <strong>Built-in HAL (sim)</strong> or Linux plugin. See <strong>HAL I/O</strong> help.</td></tr>
          <tr><td>modbus_rtu</td><td>RS-485 / USB serial Modbus RTU</td></tr>
          <tr><td>modbus_tcp</td><td>Ethernet Modbus TCP</td></tr>
          <tr><td>modbus_bridge</td><td>RTU â†” TCP gateway tool</td></tr>
          <tr><td>mqtt</td><td>MQTT broker â€” subscribe/publish per tag <strong>topic</strong></td></tr>
          <tr><td>mqtt_parc</td><td>MQTT Parc / Arduino Opta â€” one driver per <strong>device ID</strong> (ATECC serial or plant <strong>position ID</strong>); broker URL in <strong>System setup</strong>; <strong>Sync tags from device</strong> and <strong>Scan expansions</strong> on the driver card. Health: <strong>OK</strong> when linked, <strong>Not linked</strong> when hub or device offline.</td></tr>
          <tr><td>https</td><td>HTTPS REST â€” GET/POST per tag <strong>URL or path</strong></td></tr>
          <tr><td>nextcentury</td><td>NextCentury Meters API â€” report <code>rt_4510</code> every 15 min; <strong>auto-syncs tags</strong> from each poll (<code>deviceId</code> + <code>totalUsage</code> / <code>temperature</code> / <code>leakActive</code>)</td></tr>
          <tr><td>serial</td><td>Generic USB/serial profile</td></tr>
          <tr><td>native_so</td><td>Native shared-library I/O (advanced)</td></tr>
        </table>
        <p><strong>Modbus:</strong> Edit driver for COM port (or <strong>Otherâ€¦</strong>), baud, slave ID. Tag addresses in <strong>Tags</strong> (<strong>Edit</strong> on row) or <strong>Edit address</strong> from the driver mapping table. Registers: <code>HR</code>, <code>IR</code>, <code>DI</code>, <code>CO</code> with optional per-tag <strong>slave</strong>.</p>
        <p><strong>NextCentury API:</strong> Open <strong>Drivers â†’ NextCentury API</strong> for cloud credentials (not Modbus/COM). Use <strong>Fill from example</strong> for offline setup; <strong>Load example tags</strong> merges <code>st/fixtures/tags.nextcentury.json</code>. See <strong>Help â†’ NextCentury API</strong>.</p>
        <p><strong>Device templates</strong> (Modbus only, live reload): share one RS-485 driver per COM port. Each <strong>Apply template</strong> uses the <strong>next slave address</strong>. Tag names continue <code>DI1</code>, <code>Q1</code>, â€¦ â€” a second 16-input module adds <code>DI17</code>â€“<code>DI32</code>. JSON templates under <code>src/devices/templates/</code> hot-reload without server restart.</p>
        <p>Only <strong>one</strong> enabled <code>modbus_rtu</code> driver per COM port. <strong>Test</strong> briefly opens the port â€” avoid while runtime is scanning the same COM.</p>
        <p><strong>Refresh ports</strong> rescans USB serial. If the saved port is missing, PeakLogic may auto-switch to an available port â€” update the driver to match.</p>
        <p>See <strong>Help â†’ MQTT &amp; HTTPS</strong> for payload templates and REST/MQTT tag addressing.</p>
        <h4>Bulk add MQTT Parc Opta</h4>
        <p><strong>Drivers â†’ Add Opta Parc devices (bulk)</strong> â€” add one or many <code>mqtt_parc</code> drivers:</p>
        <ul>
          <li><strong>Device ID</strong> â€” single Opta (<code>opta_&lt;ATECC608 serial&gt;</code> from firmware, or legacy <code>opta_st_01</code>)</li>
          <li><strong>Device IDs</strong> â€” one ID per line</li>
          <li><strong>Use numeric range</strong> â€” prefix + start + count (legacy numbered fleet)</li>
          <li><strong>Add from Parc registry</strong> â€” devices already seen on MQTT (recommended â€” uses ATECC-based ids automatically)</li>
        </ul>
        <p>Optionally <strong>Sync tags after add</strong>. Bulk add updates <code>workspace.est.json</code> so drivers survive restart.</p>
        <h4>Position-based driver IDs (hardware change-outs)</h4>
        <p>For permanent plant locations, use a stable <strong>position ID</strong> as the driver id (e.g. <code>mcc1_line3</code>, <code>motor_skid_main</code>) while the underlying <strong>deviceId</strong> stays the ATECC-based MQTT id. On the driver card: <strong>Set position name</strong>, <strong>Replace hardware</strong> (records swap in hardware history), and view recent events. Commission and swap events appear under <strong>Report â†’ MongoDB logs â†’ Hardware history</strong>.</p>
        <p>See <strong>Help â†’ MQTT Parc hub &amp; Opta</strong> for broker setup and commissioning.</p>
      `,
    },
    {
      id: 'cellular-sims',
      title: 'Cellular SIM management',
      html: `
        <p>Manage IoT SIM and eSIM inventory from vendor APIs (Hologram, Twilio Super SIM, AT&amp;T, Verizon ThingSpace, T-Mobile, Simetry, and extensible stubs). Open <strong>System setup → Features → Open Cellular SIMs</strong> or <code>/cellular/sims</code>.</p>
        <h4>Enable</h4>
        <p>Feature is on when <code>PEAKLOGIC_DEPLOYMENT=cloud</code>, <code>PEAKLOGIC_CELLULAR_SIMS=1</code> (local <code>.env</code>), or <strong>System setup → Enable Cellular SIM management</strong>.</p>
        <h4>Vendor credentials</h4>
        <table class="help-table">
          <tr><th>Vendor</th><th>Status</th><th>Credentials</th><th>Signup</th></tr>
          <tr><td>Hologram</td><td>Live adapter</td><td>API key (<code>apikey</code> basic auth), optional org ID</td><td><a href="https://dashboard.hologram.io/settings/api" target="_blank" rel="noopener">dashboard.hologram.io/settings/api</a></td></tr>
          <tr><td>Twilio Super SIM</td><td>Live adapter</td><td>Account SID + Auth Token</td><td><a href="https://www.twilio.com/console" target="_blank" rel="noopener">twilio.com/console</a></td></tr>
          <tr><td>AT&amp;T Control Center</td><td>Live adapter</td><td>Base URL, username, API key, account ID</td><td><a href="https://www.business.att.com/products/control-center.html" target="_blank" rel="noopener">business.att.com Control Center</a></td></tr>
          <tr><td>Verizon ThingSpace</td><td>Live adapter</td><td>App key/secret, UWS username/password, account name</td><td><a href="https://thingspace.verizon.com/" target="_blank" rel="noopener">thingspace.verizon.com</a></td></tr>
          <tr><td>T-Mobile Control Center</td><td>Live adapter</td><td>Base URL, username, API key, account ID</td><td><a href="https://www.t-mobile.com/business/solutions/iot/connectivity-management" target="_blank" rel="noopener">T-Mobile IoT</a></td></tr>
          <tr><td>Simetry</td><td>Live adapter</td><td>API key + API secret, optional client UUID, base URL</td><td><a href="https://simetry.com/" target="_blank" rel="noopener">simetry.com</a> · <a href="https://integrationapi.teal.global/swagger-ui.html" target="_blank" rel="noopener">API Swagger</a></td></tr>
          <tr><td>EMnify, Aeris, 1NCE, Onomondo, Telnyx</td><td>Stub registry</td><td>Per-vendor schema in UI wizard</td><td>See vendor docs in catalog</td></tr>
        </table>
        <p>Credentials are stored in <code>settings.json</code> under <code>cellularSims.vendors</code>. Secrets are masked in API responses.</p>
        <h4>API</h4>
        <ul>
          <li><code>GET /api/cellular/sims</code> — list inventory (<code>?sync=1</code> pulls vendors first)</li>
          <li><code>POST /api/cellular/sync</code> — sync all configured vendors</li>
          <li><code>POST /api/cellular/sims/:id/activate</code> / <code>deactivate</code> / <code>GET …/usage</code></li>
          <li><code>PUT /api/cellular/sims/:id/link</code> — link <code>deviceId</code>, <code>gatewayId</code>, <code>applianceId</code></li>
          <li><code>GET/POST /api/cellular/vendors</code> — configure providers; <code>POST …/:id/test</code></li>
        </ul>
        <p>SIM records persist in Mongo <code>cellular_sims</code> or <code>data/cellular_sims.json</code>. See <code>docs/CELLULAR_SIMS.md</code>.</p>
      `,
    },
    {
      id: 'mqtt-parc',
      title: 'MQTT Parc hub & Opta',
      html: `
        <p>PeakLogic PC is the <strong>central MQTT Parc hub</strong>. Opta firmware (<strong>PeaklogicOptaMqttSt</strong>, currently <strong>v2.3.47</strong>) publishes <code>peaklogic/v1/{deviceId}/telemetry</code>; the hub stores reports in <code>data/parc.json</code> for tag sync and remote ST. Integrator reference: <code>firmware/arduino-opta-mqtt-st/OPTa_FEATURES.md</code>.</p>
        <h4>Firmware vs Parc deploy</h4>
        <p><strong>Parc deploy</strong> (<code>put_program</code> over MQTT) updates the ST program and NV storage only â€” it does <strong>not</strong> flash the Arduino sketch. After pulling firmware changes from git, open Arduino IDE and <strong>Upload</strong> <code>PeaklogicOptaMqttSt.ino</code> again. Verify with GET <code>http://&lt;opta-ip&gt;/api/status</code>: <code>firmwareVersion</code> should match <code>mv_version.h</code> (e.g. <strong>2.3.8</strong>).</p>
        <h4>ATECC608 device identity</h4>
        <p>On boot, Opta firmware reads the on-board <strong>ATECC608B</strong> serial (via <strong>ArduinoECCX08</strong>) and sets <strong>deviceId</strong> to <code>opta_</code> + 18 hex digits (e.g. <code>opta_012355b52d66a109ee</code>). The serial is shown on <strong>/setup</strong> and <code>/api/status</code> but is <strong>not</strong> included in MQTT telemetry. PeakLogic stores the serial in the Parc registry and on <code>mqtt_parc</code> drivers from first-seen telemetry, bulk-add from registry, or driver config <code>ateccSerial</code>.</p>
        <h4>Global site key (P2P globals)</h4>
        <p>Commissioning: on Opta <strong>/setup</strong>, check <strong>Cloud MQTT (TLS)</strong> and Save — the device connects to <code>mqtt.peaklogic.io:8883</code>. Set the Opta <strong>global site key</strong> to this organization’s key so only that Cloud tenant can see the Opta. The same key is used for program tag topics <code>peaklogic/v1/g/{key}/{tagName}</code>.</p>
        <p>Open the Opta setup page (<code>/setup</code>) to confirm <strong>Device ID</strong> and <strong>ATECC serial</strong>. Use <strong>Drivers â†’ Add from Parc registry</strong> to register units without hand-typing ids.</p>
        <h4>Opta web UI (Ethernet)</h4>
        <p>Native HTTP on the Opta (port 80). Top nav links <strong>Setup</strong> and <strong>I/O Map</strong>.</p>
        <table class="help-table">
          <tr><th>Path</th><th>Purpose</th></tr>
          <tr><td><code>/setup</code> or <code>/</code></td><td>Ethernet/WiFi AP, MQTT broker, expansions, ST runtime status panel (auto-refresh)</td></tr>
          <tr><td><code>/io-map</code></td><td>Live base + expansion I/O grid; <strong>Enable I/O update</strong> checkbox polls <code>/api/io-map</code></td></tr>
          <tr><td><code>/api/status</code></td><td>Full JSON health (firmware, MQTT, program, RTC, expansions)</td></tr>
          <tr><td><code>/api/tags</code>, <code>/api/io-map</code></td><td>Tag snapshot and I/O map JSON (logic vs effective when forced)</td></tr>
        </table>
        <h4>MQTT broker on device</h4>
        <p>On <strong>/setup â†’ MQTT Parc broker</strong>, set broker IP (e.g. <code>192.168.1.233</code>) and port <strong>1883</strong>. Settings persist in device NV (KV store) â€” not <code>127.0.0.1</code>. Click <strong>Save settings</strong>, then <strong>Reboot device</strong>. Must match <strong>System setup â†’ MQTT broker URL</strong> on the PC.</p>
        <h4>Device mode (Standalone vs Remote I/O)</h4>
        <p>On <strong>/setup â†’ Device mode</strong> (firmware v2.3.46+):</p>
        <ul>
          <li><strong>Standalone</strong> (default) â€” ST runs on the Opta. Enable <strong>Remote ST execution</strong> on the PC and use <strong>Download &amp; Start</strong>.</li>
          <li><strong>Remote I/O</strong> â€” Opta scans physical I/O only; PC runs ST locally (<strong>Remote ST execution OFF</strong>). Output values are sent via MQTT <code>write_outputs</code>; inputs arrive in telemetry.</li>
        </ul>
        <p>Save mode and reboot the Opta. Driver health shows a hint when PC Remote setting and device mode disagree. MQTT: <code>set_device_mode</code> with <code>{ "mode": "remote_io" }</code> or <code>"standalone"</code>.</p>
        <h4>PC I/O mode (verify I1 â†’ R1)</h4>
        <ol>
          <li>Set Opta <strong>/setup â†’ Device mode â†’ Remote I/O</strong>, save, reboot.</li>
          <li><strong>System setup</strong> â€” MQTT Parc hub on; <strong>Remote ST execution OFF</strong>.</li>
          <li>Load a program with <code>IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;</code> and map I1/R1 to the <code>mqtt_parc</code> driver.</li>
          <li><strong>Start</strong> runtime on the PC (not Download &amp; Start).</li>
          <li>Toggle physical input I1 â€” R1 should follow on the Opta relay/LED; telemetry and Live I/O show I1/R1.</li>
        </ol>
        <h4>MQTT commands (PC â†’ Opta)</h4>
        <p>Topic: <code>peaklogic/v1/{deviceId}/cmd</code>. Responses on <code>â€¦/cmd/response</code>.</p>
        <table class="help-table">
          <tr><th>Command</th><th>Purpose</th></tr>
          <tr><td><code>put_program</code></td><td>Deploy ST bytecode + tags; saves to QSPI NV (<code>/fs/mv_program.bin</code>)</td></tr>
          <tr><td><code>runtime_start</code></td><td>Start scan loop (<code>scanMs</code> in body)</td></tr>
          <tr><td><code>runtime_stop</code></td><td>Stop scan loop</td></tr>
          <tr><td><code>set_force</code> / <code>clear_force</code></td><td>PLC-style force on tag (<code>tagId</code>, <code>forceInput</code>/<code>forceOutput</code>, <code>forceValue</code>)</td></tr>
          <tr><td><code>sync_time</code></td><td>Set software wall clock from PC (<code>unixUtc</code>, <code>tzOffsetMin</code>) â€” not during deploy</td></tr>
          <tr><td><code>set_autorun</code></td><td>Enable/disable auto-run ST from NV on power-up (<code>enabled</code> or <code>autoRunOnBoot</code>)</td></tr>
          <tr><td><code>clear_program</code></td><td>Clear loaded program and stop runtime</td></tr>
          <tr><td><code>write_outputs</code></td><td>Set output tag values (<code>outputs</code> map) â€” Remote I/O mode; PC scan writes R1â€“R4 etc.</td></tr>
          <tr><td><code>set_device_mode</code></td><td><code>mode</code>: <code>standalone</code> or <code>remote_io</code> (persisted in NV)</td></tr>
        </table>
        <h4>NV program storage &amp; auto-run</h4>
        <ul>
          <li>Bytecode stored on QSPI FAT at <code>/fs/mv_program.bin</code> with CRC â€” loaded on boot before MQTT connects.</li>
          <li><strong>Auto-run on power-up:</strong> enable on Opta (<code>set_autorun</code> or <code>/api/program/autorun</code>) and/or <strong>System setup â†’ Auto-run ST on Opta after power-up</strong> (PC sends flag with deploy).</li>
          <li>After NV load + MQTT connect, firmware auto-starts ST ~500 ms later when auto-run is on.</li>
          <li>PeakLogic skips <code>put_program</code> when telemetry <code>programNvCrc</code> matches PC bytecode and ST is already running.</li>
        </ul>
        <h4>Force &amp; I/O</h4>
        <p>Opta uses a PLC-style mux: <strong>logic</strong> fields hold hardware reads; <strong>effective</strong> values reflect forces. PC <strong>Tags â†’ Force</strong> sends <code>set_force</code> over MQTT when Remote is on. Relay outputs R1â€“R4 mirror to on-board relay LEDs (D0â€“D3). Expansion modules <strong>AFX00005 (D1608E)</strong> and <strong>AFX00007 (A0602)</strong> appear on <strong>/io-map</strong> and in telemetry after <strong>Scan expansions</strong>.</p>
        <h4>Time sync (RTC)</h4>
        <p>PeakLogic sends <code>sync_time</code> on <strong>Connect</strong> and daily for linked Opta drivers. Firmware uses a <strong>software wall clock</strong> (immediate) and queues HAL RTC when safe â€” <code>put_program</code> does not sync time. Serial <code>[MV â€¦]</code> timestamps show wall clock after sync; before sync, uptime format (<code>00:04:14</code> = 4 min since boot).</p>
        <h4>Serial debug</h4>
        <p>USB serial <strong>115200</strong>. Always-on milestones use <code>[MV*]</code> (boot, MQTT subscribe, cmd rx) even when verbose debug is off. Look for <code>MQTT subscribed cmd+config</code> after boot.</p>
        <h4>Quick start (PC)</h4>
        <ol>
          <li>Flash <strong>PeaklogicOptaMqttSt</strong> v2.3.41+ via Arduino IDE; set broker on <code>/setup</code>.</li>
          <li>Start Mosquitto on the PC (<code>npm run mqtt:start</code>) â€” broker must listen on your <strong>LAN IP</strong>, not only localhost.</li>
          <li><strong>System setup â†’ General</strong> â€” enable <strong>MQTT Parc hub</strong>, set <strong>broker URL</strong>, enable <strong>Remote ST execution</strong> â†’ <strong>Apply all settings</strong>.</li>
          <li><strong>Drivers</strong> â€” template <strong>Arduino Opta â€” MQTT Parc ST runtime</strong> or <strong>Add Opta Parc devices (bulk)</strong>. <strong>deviceId</strong> must match firmware.</li>
          <li>Restart or wait for telemetry â†’ <strong>Sync tags from device</strong> on the driver card.</li>
          <li><strong>Program â†’ Remote</strong> on â†’ <strong>Download &amp; Start</strong> to deploy and run ST on the Opta.</li>
        </ol>
        <h4>PC operation with Opta</h4>
        <ul>
          <li><strong>Connect</strong> â€” cmd link + <code>sync_time</code>; does not deploy or start ST.</li>
          <li><strong>Download &amp; Start</strong> â€” <code>put_program</code> (unless NV CRC matches) then <code>runtime_start</code>.</li>
          <li><strong>Live I/O</strong> panel â€” <strong>Enable I/O update</strong> checkbox (<code>mvLiveIoUpdate</code>) refreshes tag values while open.</li>
          <li><strong>Report â†’ MongoDB logs</strong> â€” system log and hardware history (commission/swap events for position-based drivers).</li>
          <li><strong>Auto-run ST on Opta after power-up</strong> in System setup â€” pairs with device NV auto-run.</li>
        </ul>
        <h4>Boot behavior</h4>
        <ul>
          <li>Hub starts when enabled (auto-enabled if an <code>mqtt_parc</code> driver exists or Remote is on).</li>
          <li><code>mqtt_parc</code> drivers <strong>auto-link</strong> after hub connect â€” driver card <strong>OK</strong>, Program shows <strong>Linked</strong>.</li>
          <li>If <code>parc.json</code> has devices but no driver, PeakLogic may <strong>restore drivers from the Parc registry</strong> on boot.</li>
          <li>PC auto-start waits ~8 s before Parc deploy when Remote is on (cmd link settle).</li>
          <li><strong>Linked</strong> â‰  ST running â€” use <strong>Download &amp; Start</strong> for deploy/run on device.</li>
        </ul>
        <h4>Driver health</h4>
        <table class="help-table">
          <tr><th>Display</th><th>Meaning</th></tr>
          <tr><td><strong>OK</strong> / MQTT</td><td>Linked to device via hub</td></tr>
          <tr><td><strong>Not linked</strong></td><td>Hub offline, device not on broker, or <code>deviceId</code> mismatch â€” detail in status line</td></tr>
          <tr><td>linked Â· ST not running</td><td>Connected but program not deployed â€” use <strong>Download &amp; Start</strong></td></tr>
        </table>
        <h4>Troubleshooting</h4>
        <table class="help-table">
          <tr><th>Symptom</th><th>Check</th></tr>
          <tr><td><code>hub not started</code> in console</td><td>Enable hub in System setup, add <code>mqtt_parc</code> driver, or turn Remote on</td></tr>
          <tr><td>Driver gone after restart</td><td>Re-add or bulk-add; workspace merge keeps Opta drivers â€” save workspace after changes</td></tr>
          <tr><td>No telemetry</td><td>Broker URL on PC vs Opta <code>/setup</code>; firewall; Mosquitto running on LAN IP</td></tr>
          <tr><td>Telemetry OK, commands timeout</td><td>Reflash firmware <strong>v2.3.41+</strong>; Serial must show <code>MQTT subscribed cmd+config</code>; broker IP match; avoid old 2.3.8 (stack overflow)</td></tr>
          <tr><td>Opta /setup “Test request failed”</td><td>HTTP dropped during TLS test on older builds — reflash <strong>v2.4.4+</strong>; or Save settings and confirm Serial <code>MQTT subscribed cmd+config</code></td></tr>
          <tr><td>Opta TLS/auth failed :8883</td><td>Reflash <strong>v2.4.6+</strong> (ISRG Root X2); host <code>mqtt.peaklogic.io</code>, TLS on, user/pass = Mosquitto credentials</td></tr>
          <tr><td>USB shows IP, Ethernet dead</td><td>TLS test / reconnect wedged Ethernet — <strong>power-cycle</strong>; reflash <strong>v2.4.7+</strong></td></tr>
          <tr><td>Opta “Status unavailable: Failed to fetch”</td><td>HTTP not reachable — power-cycle; ping Opta IP; reflash <strong>v2.4.7+</strong> (TLS reconnect backoff)</td></tr>
          <tr><td>Broker mismatch</td><td>PC <code>mqtt://192.168.x.x:1883</code> and Opta <code>/setup</code> broker IP must be the same host â€” not <code>127.0.0.1</code> on device</td></tr>
          <tr><td>HTTP dead during deploy</td><td>Normal on older firmware during large <code>put_program</code>; use MQTT deploy; upgrade to 2.3.41+</td></tr>
          <tr><td>Sync tags fails</td><td>Wait for first telemetry; matching <code>deviceId</code></td></tr>
        </table>
        <p>Hardware baseline: <code>docs/BASELINE_TEST.md</code>. Firmware: <code>firmware/arduino-opta-mqtt-st/</code> Â· <code>OPTa_FEATURES.md</code>.</p>
        <p>Legacy HTTP Opta (<code>opta_remote</code>) and Modbus RTU Opta are separate paths â€” see <strong>Arduino Opta Modbus RTU</strong> device guide.</p>
      `,
    },
    {
      id: 'hal-io',
      title: 'HAL I/O',
      html: `
        <p>The <strong>hal</strong> driver is a hardware abstraction layer for on-board digital, analog, and pulse-counter I/O.</p>
        <h4>Quick start</h4>
        <ol>
          <li><strong>Drivers</strong> â†’ device template <strong>Built-in HAL (sim)</strong> â†’ Apply.</li>
          <li>Tags get pins like <code>DI1</code> â†’ <code>DI0</code>, <code>HWCNT1</code> â†’ hardware counter.</li>
          <li>Start runtime â€” DI/AI/CNT update each scan; write BOOL outputs mapped to <code>DO*</code>.</li>
        </ol>
        <h4>Pin map</h4>
        <table class="help-table">
          <tr><th>Pin</th><th>Direction</th><th>Typical tag</th></tr>
          <tr><td><code>DI0</code>â€“<code>DI31</code></td><td>Digital in</td><td>BOOL input</td></tr>
          <tr><td><code>DO0</code>â€“<code>DO31</code></td><td>Digital out</td><td>BOOL output</td></tr>
          <tr><td><code>AI0</code>â€“<code>AI15</code></td><td>Analog in</td><td>INT / REAL input</td></tr>
          <tr><td><code>AO0</code>â€“<code>AO7</code></td><td>Analog out</td><td>INT / REAL output</td></tr>
          <tr><td><code>CNT0</code> + <code>field: freq</code></td><td>HW counter</td><td>INT count + REAL Hz</td></tr>
        </table>
        <p><strong>Linux boards:</strong> set driver <code>backend: native</code> and <code>pluginPath</code> to your <code>.so</code> (see <code>docs/HAL.md</code>). Stub: <code>hal/plugins/example_hal.c</code>. <strong>Raspberry Pi 4 + Sequent SM-I-001:</strong> build <code>hal/plugins/rpi4_sm_i001_hal.c</code> (<code>make sm_i001</code>), preset <em>Raspberry Pi 4 + Sequent SM-I-001 (HAL plugin)</em>, guide <code>hal/plugins/README_SM-I-001.md</code>. Run <code>npm run build-native</code> on the Pi.</p>
        <p>HAL <code>CNT*</code> channels are <em>hardware</em> pulse counters (encoders, meter pulses). ST <code>CTR*</code> tags are soft PLC counters â€” both can be used together.</p>
      `,
    },
    {
      id: 'waveshare',
      title: 'Waveshare 8 DI / 8 DO',
      html: `
        <ol>
          <li>Open <strong>Drivers</strong></li>
          <li>Device template: <strong>Waveshare Modbus RTU IO 8CH</strong></li>
          <li>Set <strong>Serial port</strong> — on Compulab IOT-LINK use <code>/dev/ttyLP6</code> (<strong>PORT A</strong>); on PC use COM port (e.g. COM11). Baud <strong>9600</strong>, slave ID <strong>1</strong></li>
          <li><strong>Apply device template</strong> â€” creates <code>ws_rtu_8</code> and tags DI1â€“DI8, Q1â€“Q8</li>
          <li>Load program <code>logic/17_waveshare_di1_q1.st</code> (or write your own using DI1/Q1)</li>
          <li><strong>Start</strong></li>
        </ol>
        <p>Modbus mapping: discrete inputs 0–7 (DI), coils 0–7 (Q). IOT-LINK: wire RS-485 to terminal <strong>PORT A</strong> (pins 5–6); do not use <code>/dev/ttyLP0</code> (system console). See Waveshare wiki for hardware details.</p>
      `,
    },
    {
      id: 'datexel-dat10148',
      title: 'Datexel DAT10148 (16 DI)',
      html: `
        <p>Datexel <strong>DAT10148</strong> â€” 16 isolated digital inputs (10â€“30&nbsp;VDC ON), Modbus RTU/ASCII on RS-485. Configure slave ID and baud with onboard DIP switches or <strong>DAT3000â€“10000</strong> software.</p>
        <ol>
          <li>Open <strong>Drivers</strong></li>
          <li>Device template: <strong>Datexel DAT10148 â€” 16 DI Modbus RTU</strong></li>
          <li>Set <strong>Serial port</strong>, baud (typically <strong>9600</strong>), slave ID (DIP default often <strong>1</strong>)</li>
          <li><strong>Apply device template</strong> â€” creates <code>dat10148</code> and tags <code>DI1</code>â€“<code>DI16</code></li>
          <li>Two 16-point modules on one bus â†’ <code>DI1</code>â€“<code>DI32</code>; use <code>IsON(DI17)</code> for the first input on slave&nbsp;2</li>
          <li><strong>Start</strong> runtime</li>
        </ol>
        <p>Modbus mapping: discrete inputs PDU addresses <strong>0â€“15</strong> (PLC notation 10001â€“10016). Inputs are read-only (function code 02).</p>
      `,
    },
    {
      id: 'scan-spectrolyser',
      title: 'S::CAN spectro::lyser (Modbus)',
      html: `
        <p><strong>s::can</strong> UV-Vis probes (spectro::lyser) on RS-485 via <strong>con::nect</strong> or direct probe cable. Default Modbus: <strong>38400 8O1</strong>, slave <strong>4</strong>.</p>
        <ol>
          <li>Wire RS-485 A/B (con::nect or probe terminal)</li>
          <li><strong>Drivers</strong> â†’ template <strong>S::CAN spectro::lyser â€” Modbus RTU</strong> (or <strong>Modbus TCP</strong> for con::nect Ethernet)</li>
          <li>Set serial port / host, confirm slave ID matches Io::Tool or ana::pro</li>
          <li>Enable probe <strong>logging mode</strong> (required for live parameter values on direct RS-485)</li>
          <li><strong>Apply device template</strong> â€” tags <code>PARM1_VAL</code>â€¦<code>PARM8_VAL</code> (float), status words, <code>SCAN_DEV_STATUS</code></li>
          <li><strong>Start</strong> runtime; graph <code>PARMn_VAL</code> tags in historian</li>
        </ol>
        <p>Parameter values are <strong>input registers</strong> as IEEE float32 (IR 122 + 8Ã—(nâˆ’1)). Map parameter order in ana::pro to <code>PARM1</code>â€¦<code>PARM8</code>. Register map based on community S-CAN-Modbus project; not all registers are documented by the vendor.</p>
      `,
    },
    {
      id: 'jxct-sensors',
      title: 'JXCT soil 7-in-1 sensor',
      html: `
        <p><strong>JXCT</strong> <code>JXBS-3001-NPK-RS</code> seven-in-one soil probe: pH, moisture, temperature, EC, and N/P/K on <strong>RS-485 Modbus RTU</strong> (FC03).</p>
        <table class="help-table">
          <tr><th>Tag</th><th>Register</th><th>Units</th></tr>
          <tr><td><code>SOIL_PH</code></td><td>0x0006</td><td>pH (Ã·100)</td></tr>
          <tr><td><code>SOIL_MOIST_PCT</code></td><td>0x0012</td><td>Moisture % (Ã·10)</td></tr>
          <tr><td><code>SOIL_TEMP_C</code></td><td>0x0013</td><td>Â°C (Ã·10)</td></tr>
          <tr><td><code>SOIL_EC_US_CM</code></td><td>0x0015</td><td>ÂµS/cm</td></tr>
          <tr><td><code>N_MG_KG</code></td><td>0x001E</td><td>N mg/kg</td></tr>
          <tr><td><code>P_MG_KG</code></td><td>0x001F</td><td>P mg/kg</td></tr>
          <tr><td><code>K_MG_KG</code></td><td>0x0020</td><td>K mg/kg</td></tr>
        </table>
        <ol>
          <li>Power 5â€“24 VDC (12 V typical) and wire RS-485 A/B</li>
          <li><strong>Drivers</strong> â†’ template <strong>JXCT JXBS-3001-NPK-RS â€” soil 7-in-1 sensor</strong></li>
          <li>Default <strong>9600 8N1</strong>, slave <strong>1</strong></li>
          <li><strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
      `,
    },
    {
      id: 'seeed-sensors',
      title: 'Seeed Studio RS485 probes',
      html: `
        <p><strong>SenseCAP / Seeed</strong> industrial RS-485 probes using <strong>Modbus RTU</strong> (FC03 holding registers).</p>
        <table class="help-table">
          <tr><th>Template</th><th>SKU</th><th>Tags</th></tr>
          <tr><td>Seeed SKU 101990863 â€” RS485 H2S sensor</td><td>101990863 (S-H2S-01)</td><td><code>H2S_PPM</code>, <code>H2S_TEMP_C</code>, <code>H2S_RH_PCT</code>, <code>H2S_MAX_PPM</code></td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B and 5 VDC power (aviation connector version)</li>
          <li><strong>Drivers</strong> â†’ template <strong>Seeed SKU 101990863 â€” RS485 H2S sensor</strong></li>
          <li>Default comm: <strong>9600 8N1</strong>, slave <strong>16</strong> (0x10) â€” change in driver row if reconfigured</li>
          <li><strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
        <p>H2S is IEEE <strong>float32</strong> at holding reg <strong>0x2000</strong> (ppm). Temperature and humidity are int16 at <strong>0x2004</strong> / <strong>0x2006</strong> (Ã·100 for Â°C and %RH).</p>
      `,
    },
    {
      id: 'dfrobot-sensors',
      title: 'DFRobot RS485 water probes',
      html: `
        <p>Industrial RS-485 probes from <strong>DFRobot</strong> using <strong>Modbus RTU</strong> (FC03/FC04). Default <strong>4800 8N1</strong>, slave <strong>1</strong>; address and baud are configurable at holding reg <strong>0x07D0</strong> / <strong>0x07D1</strong>.</p>
        <table class="help-table">
          <tr><th>Template</th><th>SKU</th><th>Tags</th></tr>
          <tr><td>DFRobot SEN0706 â€” RS485 conductivity (EC) probe</td><td>SEN0706</td><td><code>EC_US_CM</code>, <code>EC_TEMP_C</code>, <code>EC_SAL_PPM</code>, <code>EC_TDS_PPM</code></td></tr>
          <tr><td>DFRobot SEN0709 â€” RS485 ORP probe</td><td>SEN0709</td><td><code>ORP_MV</code>, <code>ORP_TEMP_C</code></td></tr>
          <tr><td>DFRobot SEN0710 â€” RS485 turbidity probe</td><td>SEN0710</td><td><code>TURB_NTU</code>, <code>TURB_TEMP_C</code></td></tr>
          <tr><td>DFRobot SEN0712 â€” RS485 residual chlorine probe</td><td>SEN0712</td><td><code>CL_MG_L</code></td></tr>
          <tr><td>DFRobot SEN0711 â€” RS485 ammonia / pH probe</td><td>SEN0711</td><td><code>NH3_MG_L</code>, <code>NH3_PH</code>, <code>NH3_TEMP_C</code></td></tr>
          <tr><td>DFRobot SEN0681 â€” RS485 dissolved oxygen probe</td><td>SEN0681</td><td><code>DO_SAT_PCT</code>, <code>DO_MG_L</code>, <code>DO_TEMP_C</code></td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B and 10â€“30 VDC power per probe manual</li>
          <li><strong>Drivers</strong> â†’ pick the probe template â†’ set COM port and slave ID</li>
          <li><strong>Apply device template</strong> â€” each probe type gets its own driver id (<code>df_sen0709</code>, â€¦)</li>
          <li><strong>Start</strong> runtime; graph tags in Historian</li>
        </ol>
        <p>Integer registers store scaled integers (Ã—10 or Ã—100); tag <strong>scale</strong> converts to engineering units. SEN0681 uses IEEE <strong>float32</strong> (saturation float 1.0 = 100%, tag scale 100 â†’ percent).</p>
        <p>Several probes on one bus: assign each a unique slave ID, then add one Modbus RTU driver per probe (or one driver with per-tag slave in the <strong>Tags</strong> Addr column).</p>
      `,
    },
    {
      id: 'is750-ion',
      title: 'Icon ProCon IS-750 ion sensor',
      html: `
        <p><strong>Icon Process Controls</strong> <code>ProCon IS-750</code> ion-selective probe on <strong>RS-485 Modbus RTU</strong> (FC03 holding registers 0â€“3, read-only measurement block).</p>
        <table class="help-table">
          <tr><th>Tag</th><th>HR</th><th>Units</th></tr>
          <tr><td><code>IS750_MV</code></td><td>0</td><td>Electrode mV (signed raw Ã·10)</td></tr>
          <tr><td><code>IS750_ION</code></td><td>1</td><td>Ion concentration raw (0â€¦10000)</td></tr>
          <tr><td><code>IS750_ION_DECIMAL</code></td><td>2</td><td>Decimal places 0â€¦2 for <code>IS750_ION</code></td></tr>
          <tr><td><code>IS750_TEMP_C</code></td><td>3</td><td>Temperature Â°C (Ã·10)</td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B and probe power per IS-750 manual</li>
          <li><strong>Drivers</strong> â†’ template <strong>Icon ProCon IS-750 â€” ion selective sensor (Modbus RTU)</strong></li>
          <li>Default <strong>9600 8N1</strong>, slave <strong>1</strong> â€” change address via broadcast slave <strong>255</strong> (HR 16) if needed</li>
          <li>Set COM port â†’ <strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
        <p>Driver id <code>is750_ion</code>. Dedicated driver per probe (<code>sharedBus: false</code>). Engineering ion value: <code>IS750_ION / POWER(10, IS750_ION_DECIMAL)</code> in ST. Calibration, buffer, and factory-restore registers (HR 4â€“26, 200, 109â€“111) are not mapped â€” add explicit tags if commissioning writes are required.</p>
      `,
    },
    {
      id: 'r7c-orp',
      title: 'Icon ProCon R7C ORP/pH transmitter',
      html: `
        <p><strong>Icon Process Controls</strong> <code>ProCon R7C</code> ORP/pH sensor transmitter on <strong>RS-485 Modbus RTU</strong> (FC03 holding registers 0â€“3, read-only measurement block).</p>
        <table class="help-table">
          <tr><th>Tag</th><th>HR</th><th>Units</th></tr>
          <tr><td><code>R7C_ORP_MV</code></td><td>0</td><td>ORP mV (signed raw Ã·10)</td></tr>
          <tr><td><code>R7C_PH</code></td><td>1</td><td>pH (raw Ã·100)</td></tr>
          <tr><td><code>R7C_TEMP_C</code></td><td>2</td><td>Temperature Â°C (Ã·10)</td></tr>
          <tr><td><code>R7C_CURRENT</code></td><td>3</td><td>Loop current output (raw)</td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B and probe power per R7C manual</li>
          <li><strong>Drivers</strong> â†’ template <strong>Icon ProCon R7C â€” ORP/pH transmitter (Modbus RTU)</strong></li>
          <li>Default <strong>9600 8N1</strong>, slave <strong>1</strong> â€” change address via broadcast slave <strong>255</strong> (HR 16) if needed</li>
          <li>Set COM port â†’ <strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
        <p>Driver id <code>r7c</code>. Dedicated driver per transmitter (<code>sharedBus: false</code>). Calibration, buffer, current-output config, and factory-restore registers (HR 4â€“21, 112â€“116, 200) are not mapped â€” add explicit tags if commissioning writes are required.</p>
      `,
    },
    {
      id: 'do3500',
      title: 'Icon ProCon DO3500 dissolved oxygen',
      html: `
        <p><strong>Icon Process Controls</strong> <code>ProCon DO3500</code> (DO3000 series) fluorescence dissolved-oxygen probe on <strong>RS-485 Modbus RTU</strong> (FC04 input registers).</p>
        <table class="help-table">
          <tr><th>Tag</th><th>IR</th><th>Units</th></tr>
          <tr><td><code>DO3500_DO</code></td><td>0</td><td>DO (Ã·100; typically mg/L)</td></tr>
          <tr><td><code>DO3500_TEMP_C</code></td><td>1</td><td>Temperature Â°C (Ã·10)</td></tr>
          <tr><td><code>DO3500_SAT_PCT</code></td><td>2</td><td>Saturation % (Ã·10)</td></tr>
          <tr><td><code>DO3500_BLU_V</code></td><td>3</td><td>Blu-ray voltage (diagnostic)</td></tr>
          <tr><td><code>DO3500_TEMP_R</code></td><td>4</td><td>Temperature resistance (diagnostic)</td></tr>
          <tr><td><code>DO3500_RED_V</code></td><td>5</td><td>Red-ray voltage (diagnostic)</td></tr>
          <tr><td><code>DO3500_CAL_STATUS</code></td><td>13</td><td>0=done, 1=on-site, 2=anaerobic, 3=air</td></tr>
          <tr><td><code>DO3500_RED_LIGHT_PHASE</code></td><td>18</td><td>Red light phase from zero calibration</td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B and probe power per DO3500 manual</li>
          <li><strong>Drivers</strong> â†’ template <strong>Icon ProCon DO3500 â€” dissolved oxygen sensor (Modbus RTU)</strong></li>
          <li>Default <strong>9600 8N1</strong>, slave <strong>1</strong> â€” change address via IR <strong>12</strong> if needed</li>
          <li>Set COM port â†’ <strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
        <p>Driver id <code>do3500</code>. Dedicated driver per probe (<code>sharedBus: false</code>). RW calibration and settings registers (IR 6â€“11, 14â€“17, 19â€“20) are not mapped â€” add explicit tags if commissioning writes are required.</p>
      `,
    },
    {
      id: 'ezmeter-dds-rgb',
      title: 'EZ Meter DDS-RGB 2.025',
      html: `
        <p><strong>EZ Meter</strong> polyphase revenue meter <code>DDS-RGB 2.025</code> (RGB firmware v1.600): per-phase and summed energy, voltage, current, real power, frequency, and power factor on <strong>RS-485 Modbus RTU</strong> (FC03 holding registers 40001+).</p>
        <table class="help-table">
          <tr><th>Tag prefix</th><th>Registers</th><th>Notes</th></tr>
          <tr><td><code>DDS_WH_*</code></td><td>40001â€“40022</td><td>32-bit acc. Wh / VAh (Ã—10)</td></tr>
          <tr><td><code>DDS_V_*</code>, <code>DDS_I_*</code></td><td>40025+ per phase</td><td>V and A (Ã—0.1)</td></tr>
          <tr><td><code>DDS_W_*</code></td><td>40027, 40033, 40039</td><td>Signed real power W (Ã—0.1)</td></tr>
          <tr><td><code>DDS_HZ_*</code>, <code>DDS_PF_*</code></td><td>40029â€“40042</td><td>Hz (Ã—0.1), PF (Ã—0.01)</td></tr>
          <tr><td><code>DDS_VA_*</code></td><td>40043â€“40047</td><td>Optional apparent VA (Ã—0.1)</td></tr>
        </table>
        <ol>
          <li>Wire RS-485 A/B to the meter comm port</li>
          <li><strong>Drivers</strong> â†’ template <strong>EZ Meter DDS-RGB 2.025 â€” polyphase meter (Modbus RTU)</strong></li>
          <li>Default <strong>9600 8N1</strong>, slave <strong>1</strong> â€” confirm baud and address on the meter display or full manual</li>
          <li>Set COM port â†’ <strong>Apply device template</strong> â†’ <strong>Start</strong> runtime</li>
        </ol>
        <p>Driver id <code>dds_rgb</code>. One dedicated driver per meter (not a shared multi-slave bus template). Poll from the PC USB–RS485 adapter — Opta Parc firmware does not master EZ Meter on RS-485.</p>
      `,
    },
    {
      id: 'scan-concube',
      title: 'S::CAN con::cube (Modbus)',
      html: `
        <p><strong>con::cube</strong> is the s::can station controller (up to 64 water-quality parameters). It exposes a built-in <strong>Modbus TCP</strong> server on Ethernet (default) and optional <strong>Modbus RTU</strong> on COM-5 when enabled in moni::tool.</p>
        <ol>
          <li>Connect the cube on your LAN (RJ45) or RS-485 COM-5</li>
          <li><strong>Drivers</strong> â†’ template <strong>S::CAN con::cube â€” Modbus TCP</strong> (or <strong>Modbus RTU</strong>)</li>
          <li>Set <strong>host</strong> / serial port and confirm <strong>slave ID</strong> (typically <strong>1</strong> for the cube itself)</li>
          <li>Set <strong>Parameter groups (Ã—4)</strong> â€” each group adds <code>PARMn_STS</code> + <code>PARMn_VAL</code> for 4 parameters (default 1 group = 4 parameters)</li>
          <li><strong>Apply device template</strong> â€” first apply also adds <code>CUBE_DEV_STATUS</code> and map version. Apply again to append the next group (e.g. group 2 â†’ <code>PARM5</code>â€¦<code>PARM8</code>)</li>
          <li><strong>Start</strong> runtime; map parameter order in moni::tool to <code>PARM1</code>, <code>PARM2</code>, â€¦</li>
        </ol>
        <p>Parameter values are <strong>input registers</strong> as IEEE float32: status IR <strong>128+8Ã—(nâˆ’1)</strong>, value IR <strong>130+8Ã—(nâˆ’1)</strong>. Device status IR <strong>120</strong>. Up to <strong>16 groups</strong> (64 parameters). Check <strong>Replace tags on this driver</strong> to rebuild from <code>PARM1</code>. This differs from the spectro::lyser probe map â€” use the con::cube template when talking to the cube directly.</p>
      `,
    },
    {
      id: 'opta',
      title: 'Arduino Opta Modbus RTU',
      html: `
        <p><strong>MQTT Parc ST (recommended):</strong> see <strong>Help â†’ MQTT Parc hub &amp; Opta</strong> and <code>firmware/arduino-opta-mqtt-st/OPTa_FEATURES.md</code> â€” Ethernet MQTT, bytecode deploy, NV auto-run, no RS-485 map.</p>
        <p>This guide is for the <strong>Modbus RTU slave</strong> sketch on RS-485:</p>
        <ol>
          <li>Upload your Opta Modbus RTU slave sketch to the Opta on RS-485</li>
          <li>Open <strong>Drivers</strong> â†’ template <strong>Arduino Opta â€” Modbus RTU Slave (example sketch)</strong> or <strong>official mV map</strong></li>
          <li>Set serial port, baud <strong>9600</strong>, parity <strong>none</strong>, slave ID <strong>2</strong></li>
          <li><strong>Apply device template</strong> or load program <code>opta/01_i1_to_r1.st</code> (loads <code>fixtures/tags.opta.json</code>)</li>
          <li><strong>Start</strong> runtime</li>
        </ol>
        <table class="help-table">
          <tr><th>Function</th><th>Addr</th><th>Count</th><th>Tags</th></tr>
          <tr><td>Coils (0x)</td><td>0</td><td>4</td><td>R1â€“R4 relays (D0â€“D3)</td></tr>
          <tr><td>Discrete (1x)</td><td>0</td><td>8</td><td>I1â€“I8 digital (A0â€“A7)</td></tr>
          <tr><td>Input reg (3x)</td><td>0</td><td>8</td><td>I1_RAWâ€“I8_RAW (0â€“1023)</td></tr>
          <tr><td>Holding (4x)</td><td>0</td><td>8</td><td>H1â€“H8</td></tr>
          <tr><td>Input reg (3x)</td><td>8</td><td>8</td><td>HM1â€“HM8 (mirror of H1â€“H8)</td></tr>
        </table>
      `,
    },
    {
      id: 'edgepoint-industrial',
      title: 'EdgePoint Industrial (MQTT)',
      html: `
        <p><strong>EdgePoint Industrial</strong> (Nexus) publishes gateway I/O as <strong>JSON over MQTT</strong>. PeakLogic uses the standard <strong>mqtt</strong> driver â€” no Modbus map on the gateway link itself.</p>
        <h4>MQTT topics (serial number = Nexus MAC / gateway ID)</h4>
        <table class="help-table">
          <tr><th>Direction</th><th>Topic</th></tr>
          <tr><td>Device â†’ broker (telemetry)</td><td><code>/devices/&lt;serialnum&gt;/messages/events/</code></td></tr>
          <tr><td>Broker â†’ device (commands)</td><td><code>/devices/&lt;serialnum&gt;/messages/devicebound/</code></td></tr>
          <tr><td>External Modbus module</td><td><code>/devices/&lt;serialnum&gt;/messages/events/module</code></td></tr>
        </table>
        <h4>Commissioning</h4>
        <ol>
          <li>Point the gateway at your MQTT broker (LUCI <code>192.168.3.1</code> Wiâ€‘Fi setup, or <code>{"file":{â€¦}}</code> on devicebound with <code>addr</code>/<code>port</code>/<code>user</code>/<code>password</code>)</li>
          <li>Note the gateway <strong>serial number</strong> (JSON field <code>"10"</code> in events payload, often same as MAC)</li>
          <li><strong>Drivers</strong> â†’ template <strong>EdgePoint Industrial â€” MQTT gateway</strong></li>
          <li>Set <strong>broker URL</strong> (default <code>mqtt://127.0.0.1:1883</code>), <strong>serial number</strong>, and broker credentials if required</li>
          <li><strong>Apply device template</strong> â€” creates <code>edgepoint1</code> and tags <code>EPI_AC_IN1</code>â€¦<code>EPI_AN4_V</code>, <code>EPI_RELAY1</code>â€¦<code>EPI_SINK10</code>, plus <code>*_CMD</code> output tags</li>
          <li><strong>Start</strong> runtime; read tags from the events topic JSON paths</li>
        </ol>
        <h4>Tag map (events topic)</h4>
        <table class="help-table">
          <tr><th>Tag</th><th>JSON path</th><th>Notes</th></tr>
          <tr><td><code>EPI_AC_INn</code></td><td><code>inputs.(nâˆ’1).90n0</code></td><td>AC digital inputs 1â€“16 (9010â€¦9160)</td></tr>
          <tr><td><code>EPI_ANn_V</code></td><td><code>inputs.(15+n).91n0</code></td><td>Analog voltage (9170â€¦9200), REAL</td></tr>
          <tr><td><code>EPI_RELAYn</code></td><td><code>outputs.(nâˆ’1).94n0</code></td><td>Relay state (9410â€¦9430)</td></tr>
          <tr><td><code>EPI_SINKn</code></td><td><code>outputs.(n+2).94n0</code></td><td>Current sink state (9440â€¦9530)</td></tr>
          <tr><td><code>EPI_VARIANT</code></td><td><code>variant</code></td><td>Hardware variant</td></tr>
        </table>
        <p>Output commands (<code>EPI_RELAY1_CMD</code>, etc.) publish to <strong>devicebound</strong> with template <code>edgepoint:output:&lt;register&gt;</code> (e.g. relay register <strong>9410</strong>). External Modbus register values are not in the default template â€” subscribe to <code>events/module</code> and add tags with <code>json:modbus.registers</code> paths as needed.</p>
        <p>Fixtures: <code>st/fixtures/drivers.edgepoint.json</code>, <code>tags.edgepoint.json</code>. Data dictionary extract: <code>st/fixtures/edgepoint-data-dictionary-extract.txt</code>.</p>
      `,
    },
    {
      id: 'remote-io',
      title: 'MQTT & HTTPS',
      html: `
        <p>MQTT and HTTPS drivers use the <strong>same payload templates</strong> on each tag. Configure the driver once, then map tags with topic/URL + template in the <strong>Addr</strong> column.</p>
        <h4>MQTT driver</h4>
        <ul>
          <li><strong>Broker</strong> â€” e.g. <code>mqtt://127.0.0.1:1883</code> or <code>mqtts://broker.example.com</code></li>
          <li><strong>Client ID</strong> â€” optional (default <code>peaklogic</code>)</li>
          <li>Topics from mapped tags are <strong>auto-subscribed</strong> at runtime (plus any <code>subscriptions</code> array in <code>drivers.json</code>)</li>
          <li>Tag <strong>Addr</strong>: MQTT <strong>topic</strong> + payload template</li>
          <li>Outputs <strong>publish</strong> to the tag topic when logic marks them dirty</li>
        </ul>
        <h4>HTTPS driver</h4>
        <ul>
          <li><strong>Base URL</strong> â€” e.g. <code>https://api.example.com</code></li>
          <li><strong>Poll ms</strong> â€” minimum interval between GETs per URL (<code>0</code> = every scan)</li>
          <li><strong>Bearer token</strong> â€” optional <code>Authorization</code> header</li>
          <li>Tag <strong>Addr</strong>: full URL or path relative to base (e.g. <code>/v1/temperature</code>) + payload template</li>
          <li>Inputs: <strong>GET</strong> each distinct URL; outputs: <strong>POST</strong> body from template</li>
        </ul>
        <h4>Payload templates</h4>
        <table class="help-table">
          <tr><th>Template</th><th>Read (parse)</th><th>Write</th></tr>
          <tr><td><code>bool</code></td><td><code>true</code>, <code>1</code>, <code>ON</code> â†’ ON</td><td><code>1</code> / <code>0</code></td></tr>
          <tr><td><code>number</code></td><td>Parse float</td><td>String value</td></tr>
          <tr><td><code>raw</code></td><td>String as-is</td><td>String value</td></tr>
          <tr><td><code>json:field</code></td><td>JSON body, extract <code>field</code> (dot paths OK)</td><td>â€”</td></tr>
          <tr><td><code>json</code></td><td>Full JSON parse</td><td><code>{"value":â€¦}</code></td></tr>
          <tr><td><code>edgepoint:output:&lt;reg&gt;</code></td><td>â€”</td><td><code>{"outputs":[{"reg":â€¦,"state":0|1}]}</code> to devicebound topic</td></tr>
          <tr><td>Custom</td><td>e.g. <code>json:data.temp</code></td><td>â€”</td></tr>
        </table>
        <h4>Example tag addresses</h4>
        <pre>MQTT input:  { "topic": "plant/tank/level", "payloadTemplate": "number" }
MQTT JSON:     { "topic": "sensors/ai1", "payloadTemplate": "json:value" }
HTTPS path:    { "url": "/api/level", "payloadTemplate": "json:data.value" }
HTTPS full:    { "url": "https://other.host/status", "payloadTemplate": "bool" }</pre>
        <p>Sample MQTT fixtures: <code>st/fixtures/drivers.mqtt.json</code> and programs under <code>st/mqtt/</code>.</p>
      `,
    },
    {
      id: 'modbus',
      title: 'Modbus tools',
      html: `
        <p>Open <strong>Drivers</strong> â†’ <strong>Modbus RTU â†” TCP</strong> for one-shot register block copies between serial RTU and Modbus TCP (advanced commissioning).</p>
        <p>For normal I/O, use <strong>Tags</strong> with Modbus address fields:</p>
        <ul>
          <li><code>HR:n</code> holding register n</li>
          <li><code>IR:n</code> input register</li>
          <li><code>DI:n</code> discrete input</li>
          <li><code>CO:n</code> coil</li>
        </ul>
      `,
    },
    {
      id: 'nextcentury',
      title: 'NextCentury API',
      html: `
        <p>NextCentury Meters are polled over HTTPS â€” <strong>not</strong> Modbus RTU/TCP and not a serial COM port. Open <strong>Drivers â†’ NextCentury API</strong> to configure the driver.</p>
        <h4>Setup tab</h4>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>Driver ID</strong></td><td>Tag <code>driverId</code> (default <code>nextcentury1</code>)</td></tr>
          <tr><td><strong>Email / Password</strong></td><td>NextCentury portal login â€” or set env vars (below) and leave password blank in the project</td></tr>
          <tr><td><strong>Report ID</strong></td><td>API report name (default <code>rt_4510</code> â€” current readings)</td></tr>
          <tr><td><strong>Poll interval ms</strong></td><td>How often to fetch the report (default <code>900000</code> = 15 minutes)</td></tr>
          <tr><td><strong>Property IDs</strong></td><td>Optional comma-separated filter (e.g. <code>39990, 40074</code>); blank = all properties</td></tr>
          <tr><td><strong>Auto-sync tags</strong></td><td>When enabled (default), each successful poll creates/updates tags from report rows â€” no manual tag list required</td></tr>
        </table>
        <h4>Auto-sync tags</h4>
        <p>On each poll the driver builds tags such as <code>NC_FA003195_USAGE</code>, <code>NC_FA003195_TEMP</code>, <code>NC_FA003195_LEAK</code> (leak sensors), plus <code>NC_STATUS_DEVICES</code> and <code>NC_STATUS_LAST_COLLECT</code>. Existing tag labels are preserved. Turn off auto-sync on the setup tab to manage tags manually; <strong>Load example tags</strong> is then useful for offline fixtures.</p>
        <h4>Startup behavior</h4>
        <p>On boot, API drivers (NextCentury, HTTPS, MQTT) stay <strong>disconnected</strong> until you <strong>Program â†’ Start</strong> or use <strong>Drivers â†’ Save &amp; connect</strong>. Enable <strong>Auto-start runtime on boot</strong> in <strong>System setup â†’ General</strong> (or Historian â†’ Logger configâ€¦) to start scanning automatically.</p>
        <h4>Buttons</h4>
        <ul>
          <li><strong>Fill from example</strong> â€” loads placeholder values from <code>st/fixtures/nextcentury.setup.example.json</code> (safe for repo; no real password)</li>
          <li><strong>Test connection</strong> â€” login + one report fetch using form values (requires valid credentials for live API)</li>
          <li><strong>Save &amp; connect</strong> â€” upserts the driver, saves, and connects</li>
          <li><strong>Load example tags</strong> â€” merges sample tags from <code>st/fixtures/tags.nextcentury.json</code> for the driver ID (replaces existing tags on that driver)</li>
        </ul>
        <h4>Tag addressing</h4>
        <p>Each tag uses <strong>deviceId</strong> + <strong>field</strong> in the Addr column, e.g. <code>FA003195</code> Â· <code>totalUsage</code>, <code>temperature</code>, <code>leakActive</code>. Meta fields: <code>_deviceCount</code>, <code>_lastCollectEpoch</code> on device <code>_meta</code>.</p>
        <h4>Offline debug</h4>
        <p>Use example setup + example tags, then run <code>node scripts/debug-nextcentury-fixture.js</code> against <code>test/fixtures/nextcenturydata.sample.json</code> without calling the live API.</p>
        <h4>Environment variables</h4>
        <p>On the server process, set <code>NEXTCENTURY_EMAIL</code> and <code>NEXTCENTURY_PASSWORD</code> to supply credentials without storing them in <code>drivers.json</code>.</p>
      `,
    },
    {
      id: 'historian',
      title: 'Historian',
      html: `
        <p>The <strong>Historian</strong> shows trend charts for configured pens. BOOL tags plot as 0/1; INT, REAL, PID, and AVG tags plot as numeric values. Drag the <strong>â ¿ Move</strong> bar or header to reposition; resize from edges or corners â€” the chart grows with the window (layout is remembered for the session).</p>
        <h4>Time axis</h4>
        <p>When samples include timestamps (live buffer and MongoDB archive), the horizontal axis is <strong>time</strong> â€” tick marks and labels along the bottom show start, middle, and end of the selected range. Preset ranges and custom <strong>From</strong> / <strong>To</strong> dates keep the chart aligned with the window you loaded.</p>
        <h4>Two data sources</h4>
        <table class="help-table">
          <tr><th>Source</th><th>When to use</th></tr>
          <tr><td><strong>Live buffer</strong></td><td>While the runtime is running â€” samples collected each scan into memory (default)</td></tr>
          <tr><td><strong>MongoDB archive</strong></td><td>Review stored SCADA pen history â€” requires MongoDB configured under <strong>Historian â†’ Logger configâ€¦</strong></td></tr>
          <tr><td><strong>PdM (SCADA + Edge)</strong></td><td>Combined asset trends (health index, edge score, mapped SCADA tags) and failure forecast â€” see <strong>Help â†’ PdM (predictive maintenance)</strong></td></tr>
        </table>
        <h4>Pen config &amp; Logger config</h4>
        <p><strong>Pen configâ€¦</strong> â€” up to 32 trend pens and live buffer size (chart display only). <strong>Logger configâ€¦</strong> â€” MongoDB URI, <strong>Hist</strong> tags, runtime auto-start, and PdM asset map. Both windows are movable and resizable. See <strong>Help â†’ Pen config</strong> and <strong>Help â†’ Logger config</strong>.</p>
        <h4>Live trends</h4>
        <ol>
          <li>Set <strong>Source</strong> to <strong>Live buffer</strong></li>
          <li><strong>Start</strong> the runtime</li>
          <li>Open <strong>Historian</strong> from the top bar</li>
          <li><strong>Clear buffer</strong> empties in-memory history only (does not delete MongoDB archive)</li>
        </ol>
        <h4>Load MongoDB archive</h4>
        <ol>
          <li>Set <strong>Source</strong> to <strong>MongoDB archive</strong></li>
          <li>Pick a preset <strong>Range</strong> (1 hour â€“ 30 days) or check <strong>Custom</strong> and set <strong>From</strong> / <strong>To</strong> date-times</li>
          <li>Each load window must be <strong>1 hour â€“ 30 days</strong> â€” for longer archives (e.g. 90-day seed data), load in consecutive chunks</li>
          <li>Click <strong>Load archive</strong></li>
        </ol>
        <p>See <strong>Help â†’ MongoDB logging</strong> for connection, seed demo data, and purge.</p>
        <h4>Load PdM view</h4>
        <ol>
          <li>Configure assets under <strong>Historian â†’ Logger configâ€¦</strong> (PdM assets section) or <strong>System setup â†’ PdM</strong> (JSON map)</li>
          <li>Set <strong>Source</strong> to <strong>PdM (SCADA + Edge)</strong></li>
          <li>Pick an <strong>Asset</strong> from the dropdown</li>
          <li>Choose <strong>Range</strong> or custom <strong>From</strong> / <strong>To</strong> (same 1 hour â€“ 30 day window as archive load)</li>
          <li>Click <strong>Load PdM</strong></li>
        </ol>
        <p>A colored <strong>failure forecast</strong> banner appears when enough feature windows exist. Pens on the chart include <code>HEALTH_IDX</code>, <code>EDGE_SCORE</code>, and mapped SCADA tags.</p>
      `,
    },
    {
      id: 'historian-config',
      title: 'Pen config',
      html: `
        <p>Open <strong>Historian â†’ Pen configâ€¦</strong> or <strong>Report â†’ Pen configâ€¦</strong>. The window is draggable and resizable; use <strong>Front</strong> / <strong>Back</strong> in the header to stack it with other panels. Pens are saved to <code>data/settings.json</code> when you click <strong>Save pens</strong> â€” they are not part of <strong>System setup â†’ Apply all settings</strong>. Pens choose which tags appear on trend charts and reports; MongoDB logging follows the <strong>Hist</strong> column in <strong>Tags</strong> or <strong>Logger configâ€¦</strong>, not this pen list.</p>
        <h4>Pen table</h4>
        <table class="help-table">
          <tr><th>Column</th><th>Purpose</th></tr>
          <tr><td><strong>Color</strong></td><td>Line color on the trend chart</td></tr>
          <tr><td><strong>Tag</strong></td><td>BOOL, INT, or REAL tag from the database (up to <strong>32</strong> pens, one tag each)</td></tr>
          <tr><td><strong>Scale / Offset</strong></td><td>Plotted value = raw Ã— scale + offset (independent of tag scaling)</td></tr>
          <tr><td><strong>Y min / Y max</strong></td><td>Fixed axis limits when <strong>Auto Y</strong> is off</td></tr>
          <tr><td><strong>Auto Y</strong></td><td>When checked, Y axis fits the data with padding</td></tr>
        </table>
        <h4>Buffer size</h4>
        <p><strong>Buffer size (samples)</strong> controls how many points per pen are kept in the in-memory live buffer (default 600). MongoDB archive retention is separate â€” configured in <strong>Logger configâ€¦</strong>.</p>
        <p>Click <strong>Add pen</strong> to add rows; tag detail appears below the table when you select a tag. BOOL tags plot as 0/1 on the chart.</p>
      `,
    },
    {
      id: 'historian-logger',
      title: 'Logger config',
      html: `
        <p>Open <strong>Historian â†’ Logger configâ€¦</strong>. This floating panel holds MongoDB archive settings, which tags are logged (<strong>Hist</strong>), runtime auto-start on boot, and PdM asset â†’ SCADA tag maps. Trend chart pens are configured separately under <strong>Pen configâ€¦</strong>. Click <strong>Save logger settings</strong> to persist MongoDB options and <code>autoStartRuntime</code> to <code>data/settings.json</code>; unsaved <strong>Hist</strong> tag changes are written to <code>tags.json</code> as part of the same save.</p>
        <h4>MongoDB connection</h4>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>MongoDB URI</strong></td><td>e.g. <code>mongodb://127.0.0.1:27017</code> â€” or set <code>MONGODB_URI</code> env var</td></tr>
          <tr><td><strong>Database</strong></td><td>Default <code>peaklogic</code> (<code>MONGODB_DB</code>)</td></tr>
          <tr><td><strong>SCADA collection</strong></td><td>Default <code>tag_logs</code> â€” <code>pen_sample</code> / <code>pen_selection</code> (<code>MONGODB_COLLECTION</code>)</td></tr>
          <tr><td><strong>Edge AI collection</strong></td><td>Default <code>edge_inference</code> â€” edge model scores from Parc telemetry (<code>MONGODB_EDGE_COLLECTION</code>)</td></tr>
          <tr><td><strong>Sample interval (ms)</strong></td><td>How often <strong>Hist</strong> tag values are written while runtime runs (default 5000; <code>MONGODB_SAMPLE_MS</code>)</td></tr>
        </table>
        <p>The status line shows connected / not connected and the active sample interval after save.</p>
        <h4>Hist tags</h4>
        <p>Plottable tags (BOOL, INT, REAL, PID, AVG, FLOW) can be checked for live buffer and MongoDB logging. The header checkbox selects or clears all plottable tags. This mirrors the <strong>Hist</strong> column in <strong>Tags</strong>; either place updates <code>graphEnabled</code> on the tag.</p>
        <h4>Auto-start runtime</h4>
        <p><strong>Auto-start runtime on boot</strong> starts driver polling and historian logging when PeakLogic launches. When unchecked, use <strong>Program â†’ Start</strong> manually. API drivers (NextCentury, etc.) do not connect until the runtime starts or you connect them from the Drivers page.</p>
        <h4>PdM assets</h4>
        <p>Map asset ids (e.g. <code>pump-101</code>) to one or more SCADA tag ids for combined PdM trends. Use <strong>New</strong>, pick tags in the multi-select, <strong>Save asset</strong>, or <strong>Delete</strong>. The table lists saved assets; <strong>Edit</strong> loads a row into the form. The same map is available as JSON on <strong>System setup â†’ PdM</strong>.</p>
        <p>Archive maintenance (90-day demo seed, purge range/all) remains under <strong>Project â†’ System setup â†’ Logging</strong> â€” see <strong>Help â†’ MongoDB logging</strong>.</p>
      `,
    },
    {
      id: 'historian-report',
      title: 'Historian report (CSV / PDF)',
      html: `
        <p><strong>Report</strong> exports or prints historian data â€” from the live buffer, a loaded MongoDB archive, or a loaded PdM view (same <strong>Source</strong>, <strong>Range</strong>, and date controls as Historian).</p>
        <ol>
          <li>Configure pens (<strong>Historian â†’ Pen configâ€¦</strong>) for live or archive sources</li>
          <li>For live data: <strong>Start</strong> the runtime and set <strong>Source â†’ Live buffer</strong></li>
          <li>For archive: set <strong>Source â†’ MongoDB archive</strong>, choose range or custom dates, click <strong>Load archive</strong></li>
          <li>For PdM: set <strong>Source â†’ PdM (SCADA + Edge)</strong>, pick <strong>Asset</strong>, click <strong>Load PdM</strong></li>
          <li>Open <strong>Report</strong> from the top bar (or <strong>Historian â†’ Reportâ€¦</strong>)</li>
          <li>Expand <strong>PDF layout &amp; sections</strong> â€” title, company, page size, orientation, optional notes, and which sections to include (including <strong>Failure forecast</strong> for PdM)</li>
          <li><strong>Save layout</strong> persists report settings in the project</li>
          <li><strong>Download PDF</strong> â€” server-generated PDF with chart, pen table, and statistics</li>
          <li><strong>Export CSV</strong> â€” spreadsheet with timestamp and values per pen (live/archive)</li>
          <li><strong>Export PdM CSV</strong> â€” when <strong>Source</strong> is PdM, exports the loaded feature-window series</li>
          <li><strong>Print preview</strong> â€” browser print dialog (no pop-up window)</li>
        </ol>
        <p>Live and archive reports require at least one configured pen and samples in the selected source. PdM reports require a successful <strong>Load PdM</strong> for the chosen asset.</p>
        <h4>MongoDB logs</h4>
        <p>Expand <strong>MongoDB logs (system, hardware, historian)</strong> at the bottom of the Report window to browse operational logs stored in MongoDB (or local fallback files when MongoDB is not configured).</p>
        <ul>
          <li><strong>System log</strong> â€” errors, warnings, info, and maintenance entries from the <code>sys_log</code> collection. Filter by level or category; default limit 100 rows.</li>
          <li><strong>Hardware history</strong> â€” commission and swap events from the hardware assignments collection (position, serial, event type, timestamps).</li>
          <li><strong>Historian / tags</strong> â€” tag logger connection status, collections, sample interval, and recent maintenance entries. Use <strong>Open Historian</strong> to load tag archive samples.</li>
        </ul>
        <p>Click <strong>Refresh</strong> to reload the active tab. When MongoDB is not configured, stores fall back to local JSON files under the project data directory.</p>
      `,
    },
    {
      id: 'mongo-logging',
      title: 'MongoDB logging',
      html: `
        <p>MongoDB stores long-term historian samples. Connection, <strong>Hist</strong> tags, sample interval, and auto-start are under <strong>Historian â†’ Logger configâ€¦</strong>. Live in-memory buffer size is in <strong>Pen configâ€¦</strong>. Open <strong>Project â†’ System setupâ€¦ â†’ Logging</strong> for archive maintenance tools.</p>
        <h4>Connection</h4>
        <p>Configure URI, database, SCADA collection, Edge AI collection, and sample interval in <strong>Logger configâ€¦</strong>, then click <strong>Save logger settings</strong>. Environment variables (<code>MONGODB_URI</code>, <code>MONGODB_DB</code>, etc.) apply when the URI field is empty on the server.</p>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>MongoDB URI</strong></td><td>e.g. <code>mongodb://127.0.0.1:27017</code></td></tr>
          <tr><td><strong>Database</strong></td><td>Default <code>peaklogic</code></td></tr>
          <tr><td><strong>SCADA collection</strong></td><td>Default <code>tag_logs</code> â€” <code>pen_sample</code> / <code>pen_selection</code></td></tr>
          <tr><td><strong>Edge AI collection</strong></td><td>Default <code>edge_inference</code></td></tr>
          <tr><td><strong>Sample interval (ms)</strong></td><td>Default 5000</td></tr>
        </table>
        <h4>Document types</h4>
        <ul>
          <li><code>pen_sample</code> â€” tag values for each tag with <strong>Hist</strong> checked, at the sample interval while runtime is running (pen styling from Pen config is stored in the document but does not control logging)</li>
          <li><code>pen_selection</code> â€” snapshot when trend pens are saved in <strong>Historian â†’ Pen configâ€¦</strong></li>
          <li><code>edge_inference</code> â€” edge AI results logged from Parc MQTT/HTTP when payloads include <code>edgeAi</code> (see <strong>Help â†’ PdM</strong>)</li>
        </ul>
        <h4>Demo seed (90 days)</h4>
        <p><strong>Seed 90-day demo data</strong> inserts random historian samples for testing archive load and reports:</p>
        <ul>
          <li><strong>4 digital:</strong> <code>SEED_DI1</code>â€“<code>SEED_DI4</code> (BOOL 0/1)</li>
          <li><strong>6 analog:</strong> <code>SEED_AI1</code>â€“<code>SEED_AI6</code> (REAL)</li>
          <li>15-minute intervals over 90 days; tags and historian pens are added automatically</li>
        </ul>
        <p>After seeding, open <strong>Historian</strong> â†’ <strong>MongoDB archive</strong> â†’ custom dates in 30-day chunks â†’ <strong>Load archive</strong>.</p>
        <h4>Purge archive</h4>
        <ul>
          <li><strong>Purge range</strong> â€” delete documents between <strong>From</strong> and <strong>To</strong> (any span)</li>
          <li><strong>Purge all</strong> â€” delete all <code>pen_sample</code> and <code>pen_selection</code> documents (confirmation required)</li>
        </ul>
        <p>Purge does not clear the in-memory historian buffer â€” use <strong>Historian â†’ Clear buffer</strong> for that.</p>
      `,
    },
    {
      id: 'pdm-predictive',
      title: 'PdM (predictive maintenance)',
      html: `
        <p><strong>PdM</strong> combines SCADA historian tags with <strong>edge AI</strong> inference to build time-windowed features, trend health, and a <strong>failure forecast</strong> (remaining useful life estimate). Open <strong>Project â†’ System setupâ€¦ â†’ PdM</strong>.</p>
        <h4>Prerequisites</h4>
        <ul>
          <li>MongoDB URI configured in <strong>Logger configâ€¦</strong> (SCADA collection + Edge AI collection)</li>
          <li>Asset â†’ SCADA tag map in <strong>Logger configâ€¦</strong> (PdM assets) or <strong>System setup â†’ PdM</strong></li>
          <li>SCADA samples in MongoDB (runtime with <strong>Hist</strong> tags enabled, or demo seed / motor simulation)</li>
          <li>Edge inference documents (from Parc devices reporting <code>edgeAi</code>, or <strong>Simulate motor start / cap failure</strong>)</li>
        </ul>
        <h4>PdM settings</h4>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>Window size (minutes)</strong></td><td>Align SCADA pen samples and edge scores into fixed windows (default 5)</td></tr>
          <tr><td><strong>Health failure threshold</strong></td><td>Health index (0â€“1) below which the asset is considered failed (default 0.3)</td></tr>
          <tr><td><strong>Features collection</strong></td><td>MongoDB collection for built feature rows (default <code>pdm_features</code>)</td></tr>
          <tr><td><strong>Nightly feature batch</strong></td><td>When enabled, rebuilds features for all mapped assets on a schedule</td></tr>
          <tr><td><strong>Batch interval (hours)</strong></td><td>Hours between automatic batch runs (default 24)</td></tr>
          <tr><td><strong>Asset â†’ SCADA tag map</strong></td><td>JSON object on <strong>PdM</strong> tab, or add/edit/delete in <strong>Historian â†’ Logger configâ€¦</strong> â€” e.g. <code>{"pump-101":["SEED_AI1","SEED_AI2"]}</code></td></tr>
        </table>
        <p><strong>Save PdM settings</strong> writes <code>pdm</code> to <code>data/settings.json</code>. <strong>Build features now</strong> aligns the last 7 days for every asset in the map. Status line shows batch enabled/disabled and asset count.</p>
        <h4>Edge AI ingest</h4>
        <p>Parc MQTT telemetry and <code>POST /api/parc/report</code> automatically log edge results when the JSON body includes <code>edgeAi</code> â€” either a single object or an array:</p>
        <pre>{
  "deviceId": "gateway-07",
  "edgeAi": {
    "modelId": "vib-anomaly-v3",
    "assetId": "pump-101",
    "score": 0.87,
    "label": "bearing_wear",
    "features": { "rms": 2.1 }
  }
}</pre>
        <p>Documents are stored in the <strong>Edge AI collection</strong> (<code>edge_inference</code> by default).</p>
        <h4>Motor start simulation</h4>
        <p><strong>Simulate motor start / cap failure</strong> seeds ~90 days of degrading motor start times for asset <code>motor-202</code> (model <code>single-phase-start-v1</code>): edge inference docs plus SCADA tags <code>MOTOR_START_MS</code>, <code>MOTOR_CURRENT</code>, <code>LINE_VOLTAGE</code>. The asset is added to your tag map automatically.</p>
        <h4>View trends and forecast</h4>
        <ol>
          <li>Open <strong>Historian</strong> or <strong>Report</strong></li>
          <li>Set <strong>Source â†’ PdM (SCADA + Edge)</strong></li>
          <li>Select <strong>Asset</strong>, set date range, click <strong>Load PdM</strong></li>
        </ol>
        <p>Chart pens: <code>HEALTH_IDX</code> (1 âˆ’ max edge score), <code>EDGE_SCORE</code>, and mapped SCADA tag averages per window. The forecast banner shows severity (ok / warning / critical / failed) and an estimated days-to-failure headline when trends support it.</p>
        <h4>Health index</h4>
        <p>Per window: <strong>health index = 1 âˆ’ max(edge score)</strong> in that window. Lower health over time triggers the RUL estimate against the failure threshold. Motor start time trends can also shorten the forecast when <code>MOTOR_START_MS</code> is mapped.</p>
      `,
    },
    {
      id: 'roi-calculator',
      title: 'ROI calculator (assets)',
      html: `
        <p>The <strong>ROI</strong> tab under <strong>Project â†’ System setupâ€¦</strong> estimates payback for monitored assets. Inputs are stored in <code>data/settings.json</code> under <code>roi</code> when you click <strong>Apply all settings</strong>.</p>
        <h4>Leak detection system</h4>
        <p>Models early leak alerts (e.g. NextCentury <code>_LEAK</code> tags or assisted-living bath/toilet leak inputs) against undetected water damage repair costs.</p>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>System cost</strong></td><td>Installed hardware + commissioning (capital)</td></tr>
          <tr><td><strong>Amortization (years)</strong></td><td>Spread system cost for net annual benefit (default 5)</td></tr>
          <tr><td><strong>Repair cost per leak event</strong></td><td>Average avoided repair when an alert catches a leak early (example <strong>$90</strong>)</td></tr>
          <tr><td><strong>Leak events per year</strong></td><td>Expected detections per year at the site</td></tr>
        </table>
        <p>Results: annual savings = events Ã— repair cost; net annual = savings âˆ’ amortized cost; simple payback = system cost Ã· annual savings; ROI % over the amortization window.</p>
        <h4>Pool â€” pump &amp; chemistry</h4>
        <p>Combines variable-speed or high-efficiency pump upgrades (energy) with automated chemistry (ORP/pH) for monthly chemical treatment savings.</p>
        <table class="help-table">
          <tr><th>Field</th><th>Purpose</th></tr>
          <tr><td><strong>Pump upgrade cost</strong></td><td>Capital for new pump / drive</td></tr>
          <tr><td><strong>Chemistry / control cost</strong></td><td>Controllers, sensors, dosing upgrades</td></tr>
          <tr><td><strong>Monthly energy savings</strong></td><td>Utility reduction after pump change</td></tr>
          <tr><td><strong>Monthly chemical savings</strong></td><td>Reduced chlorine/acid/chemical spend</td></tr>
        </table>
        <p>Combined monthly savings drive payback and ROI. The <strong>Combined assets</strong> footer sums leak + pool upfront and annual figures (each asset still uses its own amortization schedule).</p>
      `,
    },
    {
      id: 'hmi-overview',
      title: 'HMI â€” overview',
      html: `
        <p>The <strong>HMI</strong> panel on the main page is the live operator display: composed tiles, tag-driven colors/text, and multi-screen navigation. The <strong>tile grid composer</strong> (HMI setup) is for editing only â€” grid lines and cell labels appear there, not on the live display.</p>
        <h4>Quick workflow</h4>
        <ol>
          <li>Optional: <strong>System setup â†’ General</strong> â€” choose <strong>Starting HMI screen</strong> and <strong>Apply all settings</strong> so the main page opens on the right page.</li>
          <li>Open <strong>HMI â†’ Setupâ€¦</strong> (or <strong>System setup â†’ HMI â†’ Open HMI composer</strong>).</li>
          <li>Use the <strong>Symbols</strong> or <strong>Recently used</strong> section â€” drag symbols onto the <strong>Screen grid</strong> (large pane), or click a symbol then click a cell.</li>
          <li>Set placement in <strong>Object type</strong> (Z layer, span, symbol-specific panels). Add or edit rows in <strong>Bindings</strong>.</li>
          <li>Use per-row <strong>Test</strong> values and <strong>Test screen</strong> to preview in the composer.</li>
          <li>Click <strong>Apply HMI settings</strong> â€” required for the main-page live HMI to use layout/binding changes (<code>data/settings.json</code>).</li>
          <li><strong>Start</strong> the runtime so BOOL/INT/REAL tags update bindings on the live display.</li>
        </ol>
        <p>On the live HMI page, use <strong>Hide</strong> / <strong>Show status</strong> to collapse the screen title and hint below the navigation bar. Configure default visibility under <strong>Project layout â†’ Live status</strong> in the composer.</p>
        <p>With two or more screens configured, a navigation bar appears above the live HMI. The starting screen is independent of <strong>Screen 1</strong> â€” Screen 1 is the first page in the composer and cannot be removed, but any screen can be chosen as the startup page.</p>
        <p>Symbol library: SVG, PNG, GIF, and <strong>composites</strong> (multi-layer gauges, HOA switch) under <code>public/hmi/svg/library/</code> (vendor folder <code>mv</code>). Refresh imports with <code>npm run download-opto-svgs</code> and <code>npm run download-mblogic-svgs</code>, then <code>npm run organize-hmi-graphics</code>.</p>
        <p>Unsaved composer edits show a confirm dialog when closing. The live view reads saved settings, not unsaved dirty config.</p>
      `,
    },
    {
      id: 'hmi-composer',
      title: 'HMI â€” composer & grid',
      html: `
        <h4>Composer layout</h4>
        <p>Composer v1.2 uses a <strong>vertical section menu</strong> for settings and a large <strong>Screen grid</strong> for editing. <strong>Project layout</strong> is the first item (cell size, grid columns/rows). On wide windows the grid takes most of the width; the settings column stays narrow (content-sized). On phones and narrow windows the section menu stacks above the panel and the grid below.</p>
        <p>Header: <strong>Help</strong>, <strong>Apply HMI settings</strong>. Status hints appear in the bar below the header and clear when you close setup.</p>
        <h4>Section menu</h4>
        <table class="help-table">
          <tr><th>Section</th><th>Contents</th></tr>
          <tr><td><strong>Project layout</strong></td><td>Grid preset, columns/rows, cell size, grid lines, <strong>Live status</strong> show/hide on the main HMI page</td></tr>
          <tr><td><strong>Screen</strong></td><td>Screen to edit, alias, <strong>Add</strong> / <strong>Duplicate</strong> / <strong>Remove</strong> (red), <strong>Load demo</strong></td></tr>
          <tr><td><strong>Symbols</strong></td><td>Import graphic, quick filter, group/subgroup/type/search, symbol grid, <strong>Next page</strong> / <strong>Refresh assets</strong></td></tr>
          <tr><td><strong>Object type</strong></td><td>Placement type, Z layer, col/row span, page nav, label text; panels for strip chart, gauge column, push button, pilot light when a matching cell is selected</td></tr>
          <tr><td><strong>Recently used</strong></td><td>Symbols you placed recently â€” click or drag to the grid</td></tr>
          <tr><td><strong>Display size</strong></td><td>Background, logical size, display limit, <strong>Fit in viewport</strong></td></tr>
          <tr><td><strong>Bindings</strong></td><td>Binding table, <strong>Test screen</strong>, <strong>Clear test values</strong></td></tr>
        </table>
        <p>Picking a symbol or grid cell switches to <strong>Object type</strong>. Quick filter <strong>Recently used</strong> opens the <strong>Recently used</strong> section. Other quick filters open <strong>Symbols</strong> with the matching library filter.</p>
        <h4>Screens</h4>
        <ul>
          <li><strong>Screen to edit</strong> â€” switch between pages; <strong>Add screen</strong> / <strong>Duplicate</strong> / <strong>Remove</strong> (red â€” Screen 1 cannot be removed).</li>
          <li><strong>Alias</strong> â€” display name shown in navigation, the General-tab starting-screen dropdown, and nav button labels.</li>
          <li><strong>Starting page</strong> â€” chosen on <strong>System setup â†’ General</strong>, not in the composer; any screen can be the live startup page.</li>
          <li><strong>Load demo</strong> â€” sample multi-screen layout with example bindings (requires matching tags such as <code>DI1</code>, <code>Q1</code>).</li>
        </ul>
        <h4>Screen grid</h4>
        <p>The grid shows row/column labels for editing only â€” the live HMI hides grid lines. Above the grid:</p>
        <ul>
          <li><strong>Remove cell</strong> (red) â€” deletes the selected cellâ€™s symbol layers</li>
          <li><strong>Clear grid</strong> (red) â€” removes all symbols from the current screen (confirmation prompt)</li>
        </ul>
        <h4>Placing symbols</h4>
        <table class="help-table">
          <tr><th>Action</th><th>How</th></tr>
          <tr><td>Place</td><td><strong>Symbols</strong> or <strong>Recently used</strong> â€” select a symbol, then click an empty cell, or drag onto a cell</td></tr>
          <tr><td>Stack layer</td><td><strong>Object type â†’ Z layer</strong> 0â€“4 (0 = back, 4 = front) before placing; up to 5 layers per cell</td></tr>
          <tr><td>Oversized graphic</td><td><strong>Z layer = 0</strong>, set <strong>Col span</strong> / <strong>Row span</strong>, click the <em>top-left</em> anchor cell</td></tr>
          <tr><td>Move</td><td>Click a placed symbol to select its cell, then click a different empty cell</td></tr>
          <tr><td>Replace</td><td>With a symbol selected, click an occupied cell to place on that anchor (same cell)</td></tr>
          <tr><td>Remove</td><td>Select cell â†’ <strong>Remove cell</strong>, or <strong>Clear grid</strong> for the whole screen</td></tr>
        </table>
        <h4>Object type</h4>
        <table class="help-table">
          <tr><th>Type</th><th>Use</th></tr>
          <tr><td>Static image</td><td>Fixed SVG/GIF/PNG layer</td></tr>
          <tr><td>Static text</td><td>Fixed caption â€” edit <strong>Label text</strong> when a text layer is selected</td></tr>
          <tr><td>Dynamic text</td><td>Tag-driven value or label via <code>text</code> binding</td></tr>
          <tr><td>Dynamic image</td><td>Visibility or styling driven by tags</td></tr>
          <tr><td>Navigation button</td><td>Jumps to another screen on the live HMI â€” set <strong>Navigate to screen</strong></td></tr>
        </table>
        <h4>Symbol-specific panels (Object type)</h4>
        <p>When a placed cell is selected, extra panels appear for canonical library symbols:</p>
        <ul>
          <li><strong>Strip chart</strong> â€” pens 1â€“8, tag per pen, colors, <strong>Assign VPR1â€“N</strong>, left <strong>Y-axis scale</strong> (show, min, max, divisions, colors)</li>
          <li><strong>Gauge column</strong> â€” columns 1â€“8, tag per column, colors, <strong>Assign VPR1â€“N</strong>, same left <strong>Y-axis scale</strong> options</li>
          <li><strong>Push button</strong> â€” momentary/latched, shape, background/text/bezel palette</li>
          <li><strong>Pilot light</strong> â€” simple (BOOL) or complex (5-state INT), shape, color palette</li>
        </ul>
        <p>Per-pen/column <strong>Tag scale</strong> uses that tagâ€™s alarm <strong>OL/OH</strong> limits (set on the Tags page) for trace height or column fill. The left <strong>Y-axis scale</strong> is the displayed axis range (independent unless you match values manually).</p>
        <h4>Symbol picker shortcuts</h4>
        <p>Quick filter: dial backgrounds, pointers, composites, <strong>Strip charts</strong>, <strong>Gauge columns</strong>, push buttons (momentary/latched), pilot lights (simple/complex), recently used. <strong>Refresh assets</strong> rescans the server catalog. Canonical symbols: <code>strip_chart.svg</code>, <code>gauge_column.svg</code>, <code>push_button_*.svg</code>, <code>pilot_light_*.svg</code>.</p>
        <h4>Grid layout &amp; display size</h4>
        <p><strong>Project layout</strong> â€” grid columns/rows, cell size, grid lines, and whether the live HMI shows the status message below the nav bar.</p>
        <p><strong>Display size</strong> â€” logical resolution, display limit, fit mode, and screen background.</p>
        <p>Default <strong>8Ã—8</strong> cells at <strong>128Ã—100 px</strong> â†’ <strong>1024Ã—800</strong> logical design size. <strong>Display limit X/Y</strong> caps size on the live HMI and composer preview. <strong>Fit in viewport</strong>: <em>Contain</em>, <em>Stretch</em>, <em>Cover</em>, or <em>Native</em>.</p>
      `,
    },
    {
      id: 'hmi-bindings',
      title: 'HMI â€” bindings',
      html: `
        <p>Bindings connect tag values to SVG element properties. Each row: <strong>screen</strong>, <strong>element id</strong>, <strong>tag</strong>, <strong>property</strong>, then type-specific fields (colors, min/max, format, angles).</p>
        <p>Element ids autocomplete from symbols on the grid. Per-cell ids often look like <code>t4_2_z1__lamp</code> (column 4, row 2, layer Z1). Composites and HOA use ids such as <code>t4_2__hoa_switch</code>. Legacy short ids like <code>hmi_label</code> or <code>lamp</code> still resolve when unique on the screen.</p>
        <h4>Testing bindings</h4>
        <ol>
          <li>Enter a value in the row <strong>Test</strong> column (BOOL dropdown, or number/text for INT/REAL).</li>
          <li>Click row <strong>Test</strong> or <strong>Test screen</strong> to apply all test values in the composer preview.</li>
          <li><strong>Clear test values</strong> returns preview to live tag data (when runtime is running).</li>
        </ol>
        <p>Live HMI uses real tag values from the scan cycle, not composer test values.</p>
        <h4>Binding properties</h4>
        <table class="help-table">
          <tr><th>Property</th><th>Tag types</th><th>Effect</th></tr>
          <tr><td><code>fill</code></td><td>BOOL (simple pilots, shapes)</td><td>ON color vs OFF color on a shape/lamp id</td></tr>
          <tr><td><code>stroke</code></td><td>BOOL or numeric</td><td>Outline color â€” numeric maps value between min/max to OFF/ON stroke colors</td></tr>
          <tr><td><code>pilot state (5)</code> (<code>fill5</code>)</td><td>INT 0â€“4</td><td>Five-state pilot: Off, On, Warn (flash), Fault (flash), Offline â€” per-state colors</td></tr>
          <tr><td><code>fill color (8)</code> (<code>fill8</code>)</td><td>INT 0â€“7 or BOOL</td><td>Pick color from an 8-slot palette by tag value</td></tr>
          <tr><td><code>HOA position (3)</code> (<code>state3</code>)</td><td>INT 0â€“2</td><td>0 = Auto, 1 = Off, 2 = Hand â€” shows one of three switch layers</td></tr>
          <tr><td><code>text</code></td><td>BOOL, INT, REAL</td><td>BOOL: ON/OFF text strings; numeric: live value with <strong>format</strong> and min/max</td></tr>
          <tr><td><code>rotation</code></td><td>INT, REAL</td><td>Needle angle â€” set min/max tag range and angle at min/max (defaults 30Â° / 330Â°)</td></tr>
          <tr><td><code>trend</code></td><td>INT, REAL, PID (pv/sp/out)</td><td>Strip chart pen on <code>trend_pen1</code> â€¦ <code>trend_pen8</code> â€” set min/max, pen color (or use Strip chart panel), and sample count; live trace when runtime is running</td></tr>
          <tr><td><code>fill</code> (gauge column)</td><td>INT, REAL, PID</td><td>Column fill height on <code>gauge_col1</code> â€¦ <code>gauge_col8</code> â€” set min/max (or use Gauge column panel and <strong>Tag scale</strong> for OL/OH)</td></tr>
          <tr><td><code>visibility</code></td><td>BOOL</td><td>Show element when ON, hide when OFF</td></tr>
          <tr><td><code>opacity</code></td><td>Numeric</td><td>Fade by mapped tag value</td></tr>
          <tr><td><code>background fill</code></td><td>BOOL or numeric</td><td>Screen or rect background â€” element <code>@screen</code> for full display backdrop</td></tr>
          <tr><td><code>class</code></td><td>BOOL</td><td>Toggle CSS classes (e.g. motor run/stop animation)</td></tr>
        </table>
        <h4>Text formats (numeric)</h4>
        <table class="help-table">
          <tr><th>Format</th><th>Display</th></tr>
          <tr><td><code>int</code></td><td>Integer</td></tr>
          <tr><td><code>fixed0</code> â€¦ <code>fixed4</code></td><td>Fixed decimal places</td></tr>
          <tr><td><code>state3</code></td><td>Auto / Off / Hand (for HOA numeric bezels)</td></tr>
          <tr><td><code>state5</code></td><td>Motor status text â€” Off, Run, Warn, Fault, Offline</td></tr>
          <tr><td><code>tpoSta</code></td><td>TPO status text â€” Idle, Applying, Waiting, Outside window (<code>TPO1_STA</code> INT 0â€“4)</td></tr>
          <tr><td><code>hhmm</code></td><td>Minutes since midnight as <code>HH:MM</code> (e.g. <code>TPO1_TOD</code>, window start/end)</td></tr>
        </table>
        <h4>Click-to-edit (composite faceplates)</h4>
        <p>Some composite bindings include <strong>interaction: edit</strong> or <strong>toggle</strong>. On the live HMI, click underlined fields to change values (prompted) or toggle BOOL controls (e.g. TPO <strong>24 HOUR</strong>, <strong>AUTO</strong>, window times, minute parameters). Writes go to memory tags on the server.</p>
        <h4>Push buttons (library symbols)</h4>
        <p>Place from <em>Controls â€” Push buttons</em>. Use quick filters <strong>Push buttons â€” momentary</strong> or <strong>Push buttons â€” latched</strong> for canonical symbols (<code>push_button_*.svg</code>).</p>
        <ul>
          <li><strong>Momentary</strong> â€” active while pressed (pointer down = true, up = false). For START/STOP style commands.</li>
          <li><strong>Latched</strong> â€” each click toggles the BOOL tag. For enable/offline/checkbox style.</li>
          <li>Select the placed cell and use the <strong>Push button</strong> panel: <strong>Shape</strong> (square, rectangle, oblong, round) and color palette (<strong>Background</strong>, <strong>Text</strong>, <strong>Bezel</strong>).</li>
          <li>Bind BOOL <strong>fill</strong> to the <code>button</code> element (e.g. <code>t2_3_z1__button</code>). Legacy per-color SVGs migrate to canonical assets on save.</li>
        </ul>
        <p>For analog gauges: bind <strong>fill</strong> or <strong>rotation</strong> to shape/needle ids â€” not the grid container id <code>hmi-tile-grid</code>. For numeric readouts: bind <strong>text</strong> to the label element id for that cell/layer. For strip charts: bind <strong>trend</strong> to <code>trend_pen1</code> â€¦ <code>trend_penN</code>. For gauge columns: bind <strong>fill</strong> to <code>gauge_col1</code> â€¦ <code>gauge_colN</code>. Element id autocomplete includes prefixed ids such as <code>t4_2_z0__trend_pen1</code> or <code>t4_2_z0__gauge_col1</code>.</p>
      `,
    },
    {
      id: 'hmi-widgets',
      title: 'HMI â€” pilots, HOA & numeric',
      html: `
        <h4>Simple pilot lights (BOOL)</h4>
        <p>Place from <em>Controls â€” Pilot lights</em>. Use quick filter <strong>Pilot lights â€” simple (BOOL)</strong> for canonical symbols (<code>pilot_light_*.svg</code>).</p>
        <ul>
          <li>Select the placed cell and use the <strong>Pilot light</strong> panel: <strong>Type</strong> = Simple, <strong>Shape</strong> (round, square, octagonal), and OFF/ON color palette.</li>
          <li>Binding: property <strong>fill</strong>, element <code>â€¦__lamp</code> (or shape id from autocomplete)</li>
          <li>BOOL tag â€” typical OFF = green <code>#22c55e</code>, ON = red <code>#ef4444</code></li>
        </ul>
        <h4>Multi-state pilot lights (INT 0â€“4)</h4>
        <p>Use quick filter <strong>Pilot lights â€” complex (5-state)</strong> â€” same canonical <code>pilot_light_*.svg</code> symbol; set <strong>Type</strong> = Complex in the <strong>Pilot light</strong> panel.</p>
        <table class="help-table">
          <tr><th>INT</th><th>State</th><th>Default color</th><th>Flash</th></tr>
          <tr><td>0</td><td>Off</td><td>Green</td><td>No</td></tr>
          <tr><td>1</td><td>On</td><td>Red</td><td>No</td></tr>
          <tr><td>2</td><td>Warn</td><td>Alarm yellow <code>#fbed20</code></td><td>Yes</td></tr>
          <tr><td>3</td><td>Fault</td><td>Orange</td><td>Yes</td></tr>
          <tr><td>4</td><td>Offline</td><td>Slate gray</td><td>No</td></tr>
        </table>
        <ul>
          <li>Binding: property <strong>pilot state (5)</strong> (<code>fill5</code>), INT tag, <strong>min 0</strong>, <strong>max 4</strong></li>
          <li>Customize per-state colors in the <strong>Pilot light</strong> panel or binding row palette</li>
        </ul>
        <h4>HOA switch (Hand / Off / Auto)</h4>
        <p>Place any HOA switch symbol or composite <code>@composite/switch_hoa</code> â€” three layers (Auto, Off, Hand) at Z0â€“Z2.</p>
        <ul>
          <li>Binding: property <strong>HOA position (3)</strong>, element <code>t{col}_{row}__hoa_switch</code>, INT tag <strong>min 0 max 2</strong> (0=Auto, 1=Off, 2=Hand)</li>
          <li>On the <strong>live HMI</strong>, click the switch to cycle Auto â†’ Off â†’ Hand (writes the bound <strong>memory</strong> tag; ST logic then reacts normally)</li>
          <li>Composer preview also supports click-to-cycle when setup is open</li>
        </ul>
        <h4>Numeric display next to HOA</h4>
        <p>Place a <strong>bezel digit</strong> numeric display on the same cell (recommended <strong>Z3</strong> or higher if stacked with the switch).</p>
        <ul>
          <li>Binding: property <strong>text</strong>, element <code>t{col}_{row}_z{Z}__hmi_label</code></li>
          <li>Same INT tag as the HOA binding; format <strong>state3</strong> shows Auto/Off/Hand text (or <strong>int</strong> for 0/1/2)</li>
        </ul>
      `,
    },
    {
      id: 'hmi-gauges',
      title: 'HMI â€” gauges & composites',
      html: `
        <h4>Manual dial + needle (two steps)</h4>
        <ol>
          <li>Filter <strong>Dial backgrounds</strong> â†’ place <code>gauge_dialbg_*</code> at <strong>Z0</strong> on a cell.</li>
          <li>Filter <strong>Dial pointers</strong> â†’ place <code>gauge_dialpointer_*</code> at <strong>Z1</strong> on the <em>same</em> cell.</li>
          <li>Bindings: <strong>fill</strong> on dial face shape id (optional); <strong>rotation</strong> on needle id with REAL/INT tag, min/max engineering values, angle at min/max.</li>
        </ol>
        <h4>Composites (recommended)</h4>
        <p>Filter <strong>Composites</strong> â†’ pick e.g. <strong>gauge_analog</strong>. One placement adds dial + needle layers and default binding rows.</p>
        <ol>
          <li>Select a REAL or INT tag on each binding row (or accept the suggested first numeric tag).</li>
          <li>Enter <strong>Test</strong> value â†’ <strong>Test screen</strong> to verify needle position.</li>
          <li>Adjust min/max and angle limits on the rotation binding if needed.</li>
        </ol>
        <p>Composites are defined under <code>public/hmi/svg/composites/</code> as JSON manifests (multi-layer placement + default bindings).</p>
        <h4>Motor / pump faceplate (HOA + commands)</h4>
        <p>Filter <strong>Composites</strong> â†’ <strong>Motor / pump (HOA + commands)</strong> (<code>motor_hoa</code>). One placement adds status lamp, HOA readout, center runtime meter (run hours + start count), and START/STOP/RESET button visuals with default bindings.</p>
        <ol>
          <li>Re-place the composite to auto-create <code>MOTOR1_*</code> memory tags â€” or add them manually on Tags.</li>
          <li>Center meter: <code>run_hrs</code> shows <code>MOTOR1_HRS</code> (REAL, format <strong>fixed1</strong>) with legend <strong>HRS</strong>; <code>starts_count</code> shows <code>MOTOR1_STARTS</code> (INT) with legend <strong>STARTS</strong>.</li>
          <li><code>MOTOR1_HOA</code> INT: 0=Auto, 1=Off, 2=Hand â€” bound to <code>hoa_state</code> with format <strong>state3</strong>.</li>
          <li><code>MOTOR1_STA</code> INT: 0=Off, 1=Run, 2=Fault, 3=Warn, 4=Offline â€” bound to <code>status_lamp</code> with <strong>pilot state (5)</strong>; <code>run_state</code> text uses format <strong>state5</strong> (OFFLINE in light gray).</li>
          <li><code>btn_offline</code> toggles <code>MOTOR1_OFFLINE</code> (latching BOOL) â€” label shows <strong>ONLINE</strong> (green) or <strong>OFFLINE</strong> (slate); blocks motor run in Auto, Hand, and Off; status lamp and text show Offline when latched.</li>
          <li>Pair with sample ST <code>st/logic/22_motor_hoa.st</code> â€” accumulates run hours while <code>MOTOR1_RUN</code> is on and counts rising-edge starts. <strong>RESET</strong> clears hours, start count, and offline latch.</li>
        </ol>
        <h4>Alternator faceplate (lead/lag status)</h4>
        <p>Filter <strong>Composites</strong> → <strong>Alternator (lead/lag status)</strong> (<code>alternator</code>). One placement adds lead unit readout, pump stage label, and level stage lamps (Off / High / Lag / Lag2 / Fault) with default bindings to <code>ALT1</code>.</p>
        <table class="help-table">
          <tr><th>Faceplate area</th><th>ALT field / binding</th><th>Display</th></tr>
          <tr><td>Title</td><td><code>label</code> — <strong>text</strong></td><td>ALT tag label (e.g. 2-pump alternator)</td></tr>
          <tr><td><strong>LEAD UNIT</strong></td><td><code>activeUnit</code> — <strong>text</strong>, format <strong>int</strong></td><td>Active lead pump 1–4 (0 when fault/off)</td></tr>
          <tr><td><strong>STAGE</strong></td><td><code>pumpStage</code> — <strong>text</strong>, format <strong>altStage</strong></td><td>OFF · HIGH · LAG · LAG2 · LEAD</td></tr>
          <tr><td>Level lamps</td><td><code>offActive</code>, <code>highActive</code>, <code>lowActive</code>, <code>low2Active</code>, <code>fault</code> — <strong>fill</strong></td><td>Stage / fault BOOLs from ALT fb</td></tr>
        </table>
        <ol>
          <li>Load <code>st/logic/27_alternator_2pump.st</code> or <code>28_alternator_triplex.st</code> → <strong>Load matching fixtures</strong> (creates <code>ALT1</code> and <code>MOTORx_*</code> tags).</li>
          <li>Place composite on the grid; bindings auto-wire to <code>ALT1</code> fields. Use <strong>Test</strong> on ALT1 or level inputs to verify lamps and stage text.</li>
        </ol>
        <h4>TPO daily irrigation faceplate</h4>
        <p>Filter <strong>Composites</strong> â†’ <strong>TPO daily irrigation cycle</strong> (<code>tpo_daily</code>). One placement adds the full schedule faceplate with default bindings and <code>TPO1_*</code> memory tags if missing.</p>
        <table class="help-table">
          <tr><th>Faceplate area</th><th>Tag / binding</th><th>Operator use</th></tr>
          <tr><td><strong>OUTPUT</strong> lamp</td><td><code>TPO1_OUT</code> â€” <strong>fill</strong> green <code>#22c55e</code> when ON, red <code>#ef4444</code> when OFF</td><td>Physical irrigation / valve output state only</td></tr>
          <tr><td>Status under lamp</td><td><code>TPO1_STA</code> â€” <strong>text</strong>, format <strong>tpoSta</strong></td><td>Idle Â· Applying Â· Waiting Â· Outside window (fixed gray text)</td></tr>
          <tr><td><strong>TIME NOW</strong></td><td><code>TPO1_TOD</code> â€” <strong>text</strong>, format <strong>hhmm</strong></td><td>Simulated clock (read-only on faceplate; advances while enabled)</td></tr>
          <tr><td><strong>24 HOUR</strong></td><td><code>TPO1_24HR</code> â€” <strong>fill</strong> toggle</td><td>When ON, ignore START/END window</td></tr>
          <tr><td><strong>START</strong> / <strong>END</strong></td><td><code>TPO1_START</code>, <code>TPO1_END</code> â€” <strong>text</strong>, format <strong>hhmm</strong>, click to edit</td><td>Daily window (minutes 0â€“1439) when 24 HOUR is off</td></tr>
          <tr><td><strong>AUTO</strong></td><td><code>TPO1_EN</code> â€” <strong>fill</strong> toggle</td><td>Master enable â€” click to start/stop the schedule</td></tr>
          <tr><td><strong>MODE</strong></td><td><code>TPO1_OFFLINE</code> â€” <strong>fill</strong> toggle + label text</td><td>Click to latch offline â€” button shows <strong>ONLINE</strong> (green) or <strong>OFFLINE</strong> (slate); blocks schedule and output</td></tr>
          <tr><td>Application / repeat</td><td><code>TPO1_ON_MIN</code>, <code>TPO1_OFF_MIN</code> â€” <strong>text</strong>, format <strong>int</strong>, click to edit</td><td>Minutes ON per pulse and minutes between pulses (defaults 30 / 120)</td></tr>
        </table>
        <ol>
          <li>Set active program to <code>st/logic/23_tpo_irrigation.st</code> (TPO only) or <code>st/logic/24_motor_tpo_combined.st</code> (motor + TPO on one screen).</li>
          <li><strong>Load fixtures</strong> for that program, or place the composite (creates tags) then <strong>Create tags from program</strong>.</li>
          <li>Click <strong>AUTO</strong> on the live HMI with runtime <strong>Start</strong>ed. Default demo: 24 HOUR on, 30 min application, 120 min repeat between applications.</li>
          <li>Speed up the simulated clock for testing: set <code>TPO1_TOD_STEP</code> (minutes advanced each scan) in Tags â€” default 1.</li>
        </ol>
        <p>All schedule times are in <strong>minutes</strong> (not legacy millisecond timer presets). <code>TPO1_ON_MIN</code>, <code>TPO1_OFF_MIN</code>, and <code>TPO1_PULSE_REM</code> must be <strong>INT</strong> tags â€” if edits or ST <code>SetInt</code> fail, reload fixtures or restart the server (tags are repaired on load).</p>
        <h4>PID loop faceplate (3-pen trend)</h4>
        <p>Filter <strong>Composites</strong> â†’ <strong>PID loop faceplate</strong> (<code>pid_loop_standard</code>). One placement adds the full faceplate with PV/SP/OUT readouts, mode indicators, alarms, and a built-in <strong>3-pen strip chart</strong>.</p>
        <ol>
          <li>Accept or pick the first <strong>PID</strong> tag â€” default bindings wire <code>trend_pen1/2/3</code> to PV, SP, and OUT via <code>tagField</code>.</li>
          <li>Set engineering <strong>min/max</strong> on each trend row (default 0â€“100).</li>
          <li><strong>Start</strong> runtime â€” polylines scroll with live scan data. Initial history is seeded from the historian live buffer when the wired PV/SP/OUT tags match configured pens.</li>
        </ol>
        <h4>Strip chart symbols</h4>
        <p>Quick filter â†’ <strong>Strip charts</strong> and place <code>strip_chart.svg</code>. Select the placed cell, set <strong>Pens</strong> (1â€“8), pick a tag per pen, check <strong>Tag scale</strong> to use that tagâ€™s alarm <strong>OL/OH</strong> limits for the trace, and configure the left <strong>Y-axis scale</strong> (min, max, divisions, colors, show/hide) in the <strong>Strip chart</strong> panel.</p>
        <p>The SVG includes <code>strip_bg</code> (plot area) and <code>trend_pen1</code>â€“<code>trend_pen8</code> polylines. Unused pens are hidden automatically. <strong>Hover</strong> a live strip chart (crosshair) to read each pen value at that sample â€” like Historian cursor inspection.</p>
        <h4>Gauge column symbols</h4>
        <p>Quick filter â†’ <strong>Gauge columns</strong> and place <code>gauge_column.svg</code>. Select the cell, set <strong>Columns</strong> (1â€“8), pick a tag per column, set fill colors, and configure the left <strong>Y-axis scale</strong> in the <strong>Gauge column</strong> panel. Bind <strong>fill</strong> to <code>gauge_col1</code> â€¦ <code>gauge_colN</code> (auto-created when you set column count). Check <strong>Tag scale</strong> per column to use tag <strong>OL/OH</strong> for column height.</p>
        <h4>Layering tips</h4>
        <ul>
          <li>Large dial backgrounds: <strong>Z0</strong> with col/row span across multiple cells.</li>
          <li>Needles and indicators: <strong>Z1+</strong> on the anchor cell.</li>
          <li>Do not bind rotation to the whole grid container â€” use the needle element id from autocomplete.</li>
        </ul>
      `,
    },
    {
      id: 'hmi-navigation',
      title: 'HMI â€” multi-screen navigation',
      html: `
        <h4>Multiple screens</h4>
        <p>Each screen has its own tile grid and bindings. Switch <strong>Screen to edit</strong> in the composer. Screen numbers are reindexed when you add or remove screens; bindings stay tied to screen ids such as <code>screen_1</code>.</p>
        <h4>Starting screen</h4>
        <p><strong>System setup â†’ General â†’ Starting HMI screen</strong> sets which page loads when you open the dashboard or after <strong>Apply all settings</strong>. Saved as <code>hmi.activeScreen</code> in <code>data/settings.json</code> (screen ids such as <code>screen_2</code>). The <strong>HMI</strong> setup tab shows the current selection as read-only summary text.</p>
        <p>Additional screens are reached via the navigation bar or on-screen nav buttons. Navigating does not change the saved starting screen â€” only <strong>Apply all settings</strong> on General does.</p>
        <h4>Page navigation buttons</h4>
        <p><strong>Add page buttons (bottom row)</strong> places one navigation button per screen on the <strong>bottom row</strong> of the current screen at <strong>Z4</strong>, labeled with each screenâ€™s alias.</p>
        <p>Alternatively, place a single <strong>Navigation button</strong> object on any cell: set object type to <em>navButton</em>, choose <strong>Navigate to screen</strong>, and set label text.</p>
        <p>For invisible navigation over a background graphic, use <strong>Page hotspot (transparent)</strong> (<em>pageHotspot</em>): set Z layer <strong>1â€“4</strong> (not Z0), choose target screen, optionally set a composer-only label, and set <strong>Col/Row span</strong> to cover the clickable area. Click the exact spot on the graphic where the hotspot should start â€” on multi-cell backgrounds the composer maps your click to the correct grid cell. Live HMI shows no visible button; the composer shows a dashed outline.</p>
        <p>For a visual alarm highlight over equipment or graphics, use <strong>Flash overlay (alarm highlight)</strong> (<em>flashOverlay</em>): set Z layer <strong>1â€“4</strong>, choose <strong>red</strong> or <strong>bright amber</strong>, set <strong>Col/Row span</strong>, and click the grid cell (or a spot on a multi-cell background). The overlay pulses semi-transparently above graphics and does not block clicks. Optional: bind element id <code>â€¦__flash_overlay</code> with property <strong>visibility</strong> to a BOOL tag, or set <code>tagId</code> on the layer in saved config.</p>
        <h4>Live navigation bar</h4>
        <p>When two or more screens exist, tabs appear above the live HMI display (in addition to on-screen nav buttons). Clicking a tab or button switches the composed view without opening setup.</p>
        <h4>Saving &amp; project files</h4>
        <ul>
          <li><strong>Apply HMI settings</strong> â€” writes HMI screens, tiles, and bindings to <code>data/settings.json</code></li>
          <li><strong>System setup â†’ Apply all settings</strong> â€” saves General settings (including <strong>Starting HMI screen</strong>) and includes HMI composer config if the composer is open and dirty</li>
          <li><strong>Save projectâ€¦</strong> (top bar) or <strong>Save current as project</strong> (System setup) â€” full snapshot to <code>data/projects/</code>; includes HMI screens, bindings, and <code>activeScreen</code> when HMI settings were applied</li>
          <li><strong>Save workspace</strong> â€” working copy at <code>data/workspace.est.json</code></li>
        </ul>
        <p>After editing bindings or layout, always <strong>Apply HMI settings</strong> before expecting the main-page live HMI to match the composer.</p>
      `,
    },
    {
      id: 'hmi-troubleshoot',
      title: 'HMI â€” troubleshooting',
      html: `
        <table class="help-table">
          <tr><th>Problem</th><th>What to check</th></tr>
          <tr><td>Live HMI does not match composer</td><td>Click <strong>Apply HMI settings</strong>; live view uses saved <code>settings.json</code>, not unsaved edits</td></tr>
          <tr><td>Binding has no effect</td><td>Element id must match a shape on the grid â€” use autocomplete; run <strong>Test screen</strong> in composer first</td></tr>
          <tr><td>HOA click works in setup but not live</td><td>Apply settings; ensure INT tag binding exists for <code>â€¦__hoa_switch</code>; runtime should be scanning</td></tr>
          <tr><td>Pilot wrong color / no flash</td><td>Simple BOOL pilots use <code>fill</code>; multi-state use <code>pilot state (5)</code> with INT 0â€“4</td></tr>
          <tr><td>Gauge needle does not move</td><td>Bind <code>rotation</code> to needle id; set min/max to tag engineering range; tag must update while running</td></tr>
          <tr><td>No symbols in picker</td><td><strong>Refresh assets</strong>; check server route <code>/hmi/assets</code>; switch Asset type to <strong>All types</strong></td></tr>
          <tr><td>Empty recent symbols list</td><td>Place a symbol once, or switch to <strong>All types</strong> / filter buttons to browse library</td></tr>
          <tr><td>Strip chart flat / wrong scale</td><td>Set pen min/max or enable <strong>Tag scale</strong> (OL/OH on Tags page); adjust left <strong>Y-axis scale</strong> in the <strong>Strip chart</strong> panel; runtime must be <strong>Start</strong>ed for live traces</td></tr>
          <tr><td>Gauge column does not fill</td><td>Bind <strong>fill</strong> to <code>gauge_colN</code>; set column count in <strong>Gauge column</strong> panel; check min/max or <strong>Tag scale</strong>; match left <strong>Y-axis scale</strong> to engineering range</td></tr>
          <tr><td>Composer settings hard to read</td><td>On narrow screens sections stack vertically â€” use <strong>Bindings</strong> horizontal scroll; widen the composer window so the grid pane expands</td></tr>
          <tr><td>Tag value stuck on display</td><td><strong>Tags â†’ Clear forces</strong> or uncheck <strong>Enabled</strong> on the row; confirm <strong>Start</strong> runtime; check binding tag id spelling</td></tr>
          <tr><td>Wrong screen on load</td><td><strong>System setup â†’ General â†’ Starting HMI screen</strong> â†’ <strong>Apply all settings</strong>; or <strong>Reload screen</strong> on the HMI panel after saving</td></tr>
          <tr><td>Project not in Open list</td><td>Files must be <code>*.est.zip</code> (or legacy <code>*.est.json</code>) under <code>data/projects/</code>; use <strong>Save projectâ€¦</strong> or copy files there, then <strong>Open projectâ€¦</strong> again</td></tr>
          <tr><td>TPO OUTPUT wrong color (orange) or TIME NOW flickers</td><td>Remove legacy <code>tmr_on_lamp</code> / <code>tmr_off_lamp</code> binding rows if present; re-place <strong>TPO daily</strong> composite or <strong>Apply HMI settings</strong>; hard refresh (<kbd>Ctrl+F5</kbd>). Only <code>status_lamp</code> should bind <code>TPO1_OUT</code> fill.</td></tr>
          <tr><td>TPO minute values wonâ€™t edit or ST SetInt fails</td><td><code>TPO1_ON_MIN</code>, <code>TPO1_OFF_MIN</code>, <code>TPO1_PULSE_REM</code> must be INT â€” use <strong>Load fixtures</strong> for <code>23_tpo_irrigation.st</code> or restart server to repair tag types</td></tr>
          <tr><td>TPO click-to-edit does nothing</td><td>Runtime must be <strong>Start</strong>ed; binding must have <strong>interaction: edit</strong>; click the underlined value text or field background</td></tr>
        </table>
        <h4>Reload &amp; demo</h4>
        <p><strong>Reload screen</strong> on the main HMI panel forces a fresh load from saved settings. <strong>Load demo</strong> in the composer replaces config with a sample multi-screen demo (save/apply only if you want to keep it).</p>
        <p>Composer window: drag the header or <em>Move</em> bar; resize from edges. Default width is about <strong>920 px</strong>; at wider sizes the <strong>Screen grid</strong> grows and the settings column stays narrow. Changes persist only after <strong>Apply HMI settings</strong>.</p>
      `,
    },
    {
      id: 'st-language',
      title: 'ST language (supported)',
      html: `
        <h4>Conditions</h4>
        <pre>IF IsON(DI) THEN TurnON(Q); END_IF;
IF IsOFF(DI) THEN TurnOFF(Q); END_IF;
IF condition THEN ... ELSE ... END_IF;</pre>
        <h4>Logic</h4>
        <pre>IF a AND b THEN ... END_IF;
IF a OR b THEN ... END_IF;
IF NOT a THEN ... END_IF;</pre>
        <h4>Compare / limits</h4>
        <pre>IF AI &gt; 50 THEN ... END_IF;
IF WithInLimits(AI, 20.0, 80.0) THEN ... END_IF;</pre>
        <h4>Timers &amp; counters</h4>
        <pre>TimerInput(TMR, DI);
IF TimerDone(TMR) THEN TurnON(Q); END_IF;
CounterCu(CTR, DI);
IF CounterDone(CTR) THEN TurnON(Q); END_IF;
CounterReset(CTR);</pre>
        <h4>Flow meter (GPM)</h4>
        <pre>CounterCu(CTR1, I1);
TimerInput(TMR1, VPB_RUN);
FlowCtr(FLOW1, CTR1);
FlowTmr(FLOW1, TMR1);
FlowK(FLOW1, H1);
FlowOut(FLOW1, H2);
IF FlowReady(FLOW1) THEN TurnON(R1); END_IF;</pre>
        <p>Link a <strong>COUNTER</strong> (pulses), <strong>TIMER</strong> (typically 60000&nbsp;ms = 1&nbsp;min), and <strong>K factor</strong> (counts per gallon). Each timer period: <code>GPM = count / K</code>. Tag type <strong>FLOW</strong>; preset holds default K.</p>
        <h4>Alternator (lead/lag rotation)</h4>
        <pre>AltEnable(ALT1, SYS_RUN);
AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HI);
AltLow(ALT1, LVL_LO);
AltLevel(ALT1, TANK_LVL);
AltLevelBands(ALT1, 10.0, 25.0, 75.0, 90.0);
AltAdvance(ALT1, ALT_BUMP);
AltAutoFault(ALT1, VPB1);
AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltUnitOut(ALT1, 1, MOTOR1_RUN);
AltUnitOut(ALT1, 2, MOTOR2_RUN);
AltLead(ALT1, LEAD_RUN);
AltLeadSel(ALT1, 1, P1_LEAD_SEL);
AltLagSel(ALT1, 2, P2_LAG_SEL);
IF AltFault(ALT1) THEN TurnON(ALT_FAULT); END_IF;
IF AltPumpUp(ALT1) THEN TurnON(PUMP_UP); END_IF;</pre>
        <p>Tag type <strong>ALT</strong>; mode <strong>ALT2</strong>, <strong>ALT3</strong> (triplex), or <strong>ALT4</strong>. Round-robin selects the lead unit among units whose <strong>online</strong> BOOL is true. Offline units are skipped on manual <code>AltAdvance</code> and optional <code>AltAutoFault</code> (rotate when lead goes offline).</p>
        <p><strong>Level / off control</strong> (priority high → low): <code>AltOff</code> shuts all automatic run outputs off. <code>AltHigh</code> / high analog band runs <strong>all online pumps</strong>. <code>AltLow</code> / first lag float runs <strong>lead + lag</strong> (min 2 pumps). <code>AltLag2</code> / second lag float adds the third pump (min 3 on ALT3/ALT4) — floats are <strong>cumulative</strong>, not mutually exclusive stages. No level input → normal lead-only rotation (one pump). Set <code>levelInputMode</code> on the ALT tag fb to <code>digital</code>, <code>analog</code>, or <code>both</code> (default).</p>
        <p><strong>Manual unit select:</strong> <code>AltLeadSel(ALT, unit, tag)</code>, <code>AltLagSel</code>, <code>AltLag2Sel</code> — per-unit BOOL buttons override which unit is lead/lag while active (not operating modes). Status: <code>AltOffActive</code>, <code>AltHighActive</code>, <code>AltLowActive</code>, <code>AltLow2Active</code>, <code>AltPumpUp</code> (lag stage), <code>AltPumpDown</code> (high stage), <code>AltLag</code>.</p>
        <h4>ALT2 two-pump scenario</h4>
        <table class="help-table">
          <tr><th>Mode</th><th>Input</th><th>Pumps running (ALT2)</th></tr>
          <tr><td><strong>Off</strong></td><td><code>AltOff</code> or off band</td><td>0 — both OFF</td></tr>
          <tr><td><strong>High</strong></td><td><code>AltHigh</code> or high band</td><td>2 — all online (forced)</td></tr>
          <tr><td><strong>Lag</strong></td><td><code>AltLow</code> or lag band</td><td>2 — lead + lag when lag online</td></tr>
          <tr><td><strong>Lead</strong></td><td>normal (no band active)</td><td>1 — lead only, round-robin</td></tr>
        </table>
        <p>Sample: <code>st/logic/27_alternator_2pump.st</code> with <code>st/fixtures/tags.alternator_2pump.json</code>.</p>
        <h4>ALT3 triplex (3-pump) scenario</h4>
        <table class="help-table">
          <tr><th>Mode</th><th>Input</th><th>Pumps running (ALT3)</th></tr>
          <tr><td><strong>Off</strong></td><td><code>AltOff</code></td><td>0 — all OFF</td></tr>
          <tr><td><strong>High</strong></td><td><code>AltHigh</code></td><td>3 — all online (forced)</td></tr>
          <tr><td><strong>Lag2</strong></td><td><code>AltLag2</code> (with or without <code>AltLow</code>)</td><td>3 — lead + lag + lag2</td></tr>
          <tr><td><strong>Lag</strong></td><td><code>AltLow</code> only</td><td>2 — lead + lag</td></tr>
          <tr><td><strong>Lead</strong></td><td>normal (no float active)</td><td>1 — lead only, round-robin</td></tr>
        </table>
        <p>Sample: <code>st/logic/28_alternator_triplex.st</code> with <code>st/fixtures/tags.alternator_triplex.json</code>. Load program → <strong>Load matching fixtures</strong>.</p>
        <h4>ALT4 four-pump scenario</h4>
        <table class="help-table">
          <tr><th>Mode</th><th>Input</th><th>Pumps running (ALT4)</th></tr>
          <tr><td><strong>Off</strong></td><td><code>AltOff</code></td><td>0 — all OFF</td></tr>
          <tr><td><strong>High</strong></td><td><code>AltHigh</code></td><td>4 — all online (forced)</td></tr>
          <tr><td><strong>Lag2</strong></td><td><code>AltLag2</code></td><td>3 — lead + lag + lag2</td></tr>
          <tr><td><strong>Lag</strong></td><td><code>AltLow</code> only</td><td>2 — lead + lag</td></tr>
          <tr><td><strong>Lead</strong></td><td>normal</td><td>1 — lead only</td></tr>
        </table>
        <p>Wire <code>MOTORx_ONLINE</code> from motor comms/run status — typically <code>NOT MOTORx_OFFLINE</code> from the motor HOA faceplate. Live value shows active lead unit (1–4).</p>
        <h4>Reversing motor (RMOTOR)</h4>
        <pre>RmtFwdCmd(RMOTOR1, RM1_FWD_CMD);
RmtRevCmd(RMOTOR1, RM1_REV_CMD);
RmtFwdAux(RMOTOR1, RM1_FWD_AUX);
RmtRevAux(RMOTOR1, RM1_REV_AUX);
RmtOverload(RMOTOR1, RM1_OVL);
RmtHoa(RMOTOR1, RM1_HOA);
RmtFwdOut(RMOTOR1, RM1_FWD_OUT);
RmtRevOut(RMOTOR1, RM1_REV_OUT);
RmtSta(RMOTOR1, RM1_STA);
RmtHrs(RMOTOR1, RM1_HRS);
RmtStarts(RMOTOR1, RM1_STARTS);
IF RmtFault(RMOTOR1) THEN ... END_IF;</pre>
        <p>Tag type <strong>RMOTOR</strong>; preset = reversal deadtime (ms). Fwd and Rev contactors are mutually exclusive; direction change waits deadtime with both off. <code>RM1_STA</code>: 0=Off, 1=Fwd, 2=Rev, 3=Fault, 4=Offline, 5=Reversing. Sample: <code>st/logic/29_reversing_motor.st</code>.</p>
        <h4>Alternator level control (Off / High / Low)</h4>
        <pre>AltOff(ALT1, TANK_OFF);
AltHigh(ALT1, TANK_HIGH);
AltLow(ALT1, TANK_LOW);
AltLevel(ALT1, LEVEL_AI);
AltLevelBands(ALT1, 0, 15, 85, 100);
IF AltOffActive(ALT1) THEN ... END_IF;
IF AltHighActive(ALT1) THEN ... END_IF;
IF AltPumpUp(ALT1) THEN ... END_IF;
IF AltPumpDown(ALT1) THEN ... END_IF;</pre>
        <p>Optional digital BOOLs and/or analog level bands (via <code>AltLevel</code> + <code>AltLevelBands(lowLo, lowHi, highLo, highHi)</code>). Priority: <strong>Off</strong> &gt; manual unit select &gt; <strong>High</strong> &gt; <strong>Lag2 (AltLag2)</strong> &gt; <strong>Lag (AltLow)</strong> &gt; normal rotation. Lag floats are cumulative: <code>AltLow</code> adds the second pump; <code>AltLag2</code> adds the third (ALT3/ALT4). <strong>Off</strong> — all unit run outputs OFF. <strong>High</strong> — all online pumps ON. Normal rotation — single lead only.</p>
        <h4>One-shot (run once per Start)</h4>
        <pre>IF OneShot(OS1) THEN TurnON(R1); END_IF;</pre>
        <p><code>OneShot(id)</code> is true on the <strong>first scan</strong> after runtime <strong>Start</strong> for that latch id, then false until Stopâ†’Start. Use a BOOL memory tag (e.g. <code>OS1</code>) as the latch name.</p>
        <h4>PID loops</h4>
        <pre>PidPv(PID1, AI1);
PidSp(PID1, SP_TAG);
PidAuto(PID1);
PidManual(PID1);
PidOut(PID1, AO1);
IF PidAutoMode(PID1) AND PidError(PID1) &gt; 5.0 THEN ... END_IF;</pre>
        <table class="help-table">
          <tr><th>Tag</th><th>Setpoint (SP)</th><th>Modes</th></tr>
          <tr><td>TIMER (TMR)</td><td><strong>Timer SP</strong> â€” milliseconds</td><td><strong>TON</strong> on-delay Â· <strong>TOF</strong> off-delay Â· <strong>TP</strong> pulse</td></tr>
          <tr><td>COUNTER (CTR)</td><td><strong>Count SP</strong> â€” target count</td><td><strong>CTU</strong> count up Â· <strong>CTD</strong> count down</td></tr>
          <tr><td>PID (PID)</td><td><strong>Setpoint</strong> + <strong>Kp/Ki/Kd</strong> + out min/max</td><td><strong>P</strong> Â· <strong>PI</strong> Â· <strong>PID</strong> (derivative on PV)</td></tr>
        </table>
        <h4>Averaging</h4>
        <pre>AvgIn(AVG1, AI1);
AvgOut(AVG1, VPR1);
IF AvgReady(AVG1) THEN ... END_IF;
AvgReset(AVG1);</pre>
        <table class="help-table">
          <tr><th>Tag</th><th>Window (SP)</th><th>Modes</th></tr>
          <tr><td>AVG</td><td><strong>Window</strong> â€” sample count (1â€“256)</td><td><strong>MOV</strong> sliding average Â· <strong>EMA</strong> exponential</td></tr>
          <tr><td>ALT</td><td><strong>Units</strong> — 2, 3, or 4 (ALT2/ALT3/ALT4)</td><td><strong>ALT2</strong> 2-pump · <strong>ALT3</strong> triplex · <strong>ALT4</strong> 4-pump</td></tr>
        </table>
        <p>Live column shows <code>elapsed/SP</code> (timers), <code>count/SP</code> (counters), <code>PV/SP/OUT</code> (PID), or <code>PV â†’ AVG</code> (averager). Hover the mode pill for the full label.</p>
        <p><strong>Default memory tags</strong> in sample programs: <code>VPB1</code>â€“<code>VPB20</code> (BOOL), <code>VPI1</code>â€“<code>VPI10</code> (INT), <code>VPR1</code>â€“<code>VPR10</code> (REAL). Suite examples map <code>DIâ†’VPB1</code>, <code>DI2â†’VPB2</code>, <code>Qâ†’VPB3</code>, <code>AIâ†’VPI1</code>. Waveshare programs mirror <code>DInâ†’VPBn</code> and drive <code>Qn</code>.</p>
        <p>Comments: <code>(* ... *)</code>. Tag names must match the tag table exactly (case-sensitive).</p>
      `,
    },
    {
      id: 'serial-troubleshoot',
      title: 'Serial port troubleshooting',
      html: `
        <table class="help-table">
          <tr><th>Error</th><th>Typical cause</th></tr>
          <tr><td>File not found</td><td>Wrong COM number â€” check Device Manager</td></tr>
          <tr><td>Access denied</td><td>Port in use: second driver, PuTTY, another PeakLogic, or Test while running</td></tr>
          <tr><td>No serial activity</td><td>Driver shows Off â€” fix port first; runtime does not poll a closed port</td></tr>
        </table>
        <p><strong>Fix checklist:</strong></p>
        <ol>
          <li>One RTU driver per COM port; remove duplicates in Drivers</li>
          <li>Match COM in Device Manager (unplug/replug USB if needed)</li>
          <li>Restart PeakLogic after changing ports</li>
          <li>Status â†’ Serial/Modbus must show <strong>OK</strong> before expecting I/O</li>
        </ol>
      `,
    },
    {
      id: 'files',
      title: 'Files & folders',
      html: `
        <table class="help-table">
          <tr><th>Path</th><th>Content</th></tr>
          <tr><td><code>data/tags.json</code></td><td>Tag database</td></tr>
          <tr><td><code>data/drivers.json</code></td><td>Driver configs</td></tr>
          <tr><td><code>data/settings.json</code></td><td>Scan rate, active program, historian pens, <code>mongoLogger</code> (URI, SCADA/edge collections), <code>pdm</code> asset map and batch settings, HMI screens/bindings, <code>hmi.activeScreen</code></td></tr>
          <tr><td><code>st/**/*.st</code></td><td>ST source files</td></tr>
          <tr><td><code>st/fixtures/</code></td><td>Sample tags/drivers for test programs</td></tr>
        </table>
      `,
    },
    {
      id: 'env',
      title: 'Environment variables',
      html: `
        <table class="help-table">
          <tr><th>Variable</th><th>Default</th><th>Purpose</th></tr>
          <tr><td>PORT</td><td>3090</td><td>HTTP listen port</td></tr>
          <tr><td>PEAKLOGIC_DATA</td><td>./data</td><td>Persistence directory</td></tr>
          <tr><td>PEAKLOGIC_ST</td><td>./st</td><td>Programs directory</td></tr>
          <tr><td>MONGODB_URI</td><td>â€”</td><td>MongoDB connection for historian archive</td></tr>
          <tr><td>MONGODB_DB</td><td>peaklogic</td><td>Database name</td></tr>
          <tr><td>MONGODB_COLLECTION</td><td>tag_logs</td><td>SCADA collection for pen_sample / pen_selection</td></tr>
          <tr><td>MONGODB_EDGE_COLLECTION</td><td>edge_inference</td><td>Edge AI inference documents from Parc <code>edgeAi</code> payloads</td></tr>
          <tr><td>MONGODB_SAMPLE_MS</td><td>5000</td><td>Pen sample write interval while runtime runs</td></tr>
          <tr><td>NEXTCENTURY_EMAIL</td><td>â€”</td><td>NextCentury API login email (used when driver config email is blank)</td></tr>
          <tr><td>NEXTCENTURY_PASSWORD</td><td>â€”</td><td>NextCentury API login password (used when driver config password is blank)</td></tr>
        </table>
      `,
    },
    {
      id: 'faq',
      title: 'FAQ',
      html: `
        <table class="help-table">
          <tr><th>Question</th><th>Answer</th></tr>
          <tr><td>Start says <em>Unknown tag</em>?</td><td>ST tag names must match the tag table. Use <strong>Load selected</strong> (fixtures) or open a project with tags and program together.</td></tr>
          <tr><td>Edits disappear?</td><td>Unsaved edits are protected while dirty. Save or Apply; use <strong>Revert</strong> to undo.</td></tr>
          <tr><td><code>est</code> vs MVP Suite?</td><td><code>est</code> is embedded (LuCI, WebSocket). <strong>MVP Suite</strong> is this all-in-one Windows/Linux app with portable <code>.est</code> projects.</td></tr>
          <tr><td>MQTT tag stays stale?</td><td>Check broker URL and topic spelling; runtime must be <strong>Start</strong>ed. Topics auto-subscribe from tag addresses.</td></tr>
          <tr><td>Opta driver <strong>Not linked</strong>?</td><td>Enable MQTT Parc hub in System setup; check broker LAN IP; <code>deviceId</code> must match firmware. Drivers auto-link on boot when hub is up.</td></tr>
          <tr><td>Hub OK but no ST on Opta?</td><td><strong>Download &amp; Start</strong> with Remote on â€” linking is not deploy/run.</td></tr>
          <tr><td>Opta driver missing after restart?</td><td>Use bulk-add or template again; workspace merge preserves <code>mqtt_parc</code> drivers â€” bulk-add updates workspace.</td></tr>
          <tr><td>Opta MQTT cmd timeout?</td><td>Reflash <strong>PeaklogicOptaMqttSt v2.3.41+</strong>; match broker on PC and Opta <code>/setup</code>; Serial: <code>MQTT subscribed cmd+config</code>. Parc deploy does not update firmware.</td></tr>
          <tr><td>Opta broker mismatch?</td><td>Use PC LAN IP (e.g. <code>192.168.1.233</code>) in both System setup and Opta <code>/setup</code> â€” not <code>127.0.0.1</code> on the device.</td></tr>
          <tr><td>HTTPS returns no data?</td><td>Verify base URL, path, bearer token, and payload template (<code>json:field</code>). Use driver <strong>Test</strong> and <strong>Status</strong>.</td></tr>
          <tr><td>Alarm state incomplete?</td><td>INT/REAL: enable <strong>Alm</strong> and set OL â‰¤ IL â‰¤ IH â‰¤ OH. BOOL: set <strong>Condition</strong> (When ON/OFF).</td></tr>
          <tr><td>HMI opens on Screen 1?</td><td><strong>System setup â†’ General â†’ Starting HMI screen</strong> â†’ <strong>Apply all settings</strong> (<code>hmi.activeScreen</code>).</td></tr>
          <tr><td>Force does not stick?</td><td>In <strong>Tags</strong>, use <strong>Force</strong> + <strong>Force val</strong> columns. Check <strong>On</strong>, edit value, <strong>Apply</strong> or <kbd>Enter</kbd>.</td></tr>
          <tr><td>Where is Force window?</td><td>Inside <strong>Tags</strong> â€” scroll right to <strong>Force</strong> / <strong>Force val</strong> after <strong>Live</strong>.</td></tr>
          <tr><td>COM port / access denied?</td><td>See <strong>Serial port troubleshooting</strong> under Tags &amp; drivers.</td></tr>
          <tr><td>Strip chart flat / not updating?</td><td>Binding property must be <strong>trend</strong> on <code>trend_penN</code> (not <code>fill</code>). Runtime must be <strong>Start</strong>ed. Check min/max span matches tag range. Re-place <code>strip_chart.svg</code> if pen ids are missing.</td></tr>
          <tr><td>PID faceplate trend empty?</td><td>Ensure PID tag is wired (PV/SP/OUT ids). Re-add composite via <strong>Composites â†’ PID loop faceplate</strong> to refresh default trend bindings.</td></tr>
          <tr><td>HMI does not match composer?</td><td>Click <strong>Apply HMI settings</strong> â€” live view uses saved <code>settings.json</code>.</td></tr>
          <tr><td>TPO schedule not running?</td><td>Click <strong>AUTO</strong> (<code>TPO1_EN</code>); runtime <strong>Start</strong>ed; check <code>TPO1_STA</code> â€” <em>Outside</em> means outside START/END when 24 HOUR is off.</td></tr>
          <tr><td>TPO cycle too slow in demo?</td><td>Raise <code>TPO1_TOD_STEP</code> (minutes per scan) in Tags â€” logic uses minute-based pulses, not TMR ms presets.</td></tr>
          <tr><td>Historian archive empty?</td><td>Configure MongoDB under <strong>Logging</strong>, <strong>Apply all</strong>, <strong>Start</strong> runtime with at least one tag checked in <strong>Tags â†’ Hist</strong> â€” or use <strong>Seed 90-day demo data</strong>.</td></tr>
          <tr><td>Load archive fails?</td><td>Window must be 1 h â€“ 30 d. For 90-day seed data, use <strong>Custom</strong> dates in multiple chunks.</td></tr>
          <tr><td>Mongo connected but no new samples?</td><td>Runtime must be <strong>Start</strong>ed and at least one plottable tag checked in <strong>Tags â†’ Hist</strong>. Trend pens are not required for logging. Check sample interval on <strong>Logging</strong> tab.</td></tr>
          <tr><td>PdM load shows no data?</td><td>Map the asset to SCADA tags on <strong>PdM</strong> tab, ensure MongoDB has <code>pen_sample</code> and/or <code>edge_inference</code> docs in range, then click <strong>Build features now</strong> or <strong>Load PdM</strong> (auto-builds if features missing).</td></tr>
          <tr><td>No edge scores on PdM chart?</td><td>Edge devices must send <code>edgeAi</code> in Parc telemetry, or run <strong>Simulate motor start / cap failure</strong> for demo data.</td></tr>
          <tr><td>Forecast banner missing?</td><td>Need at least two feature windows with health index trend; widen date range or run batch/simulation to seed more history.</td></tr>
        </table>
      `,
    },
  ];

  const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

  function orderedSections() {
    const out = [];
    const seen = new Set();
    for (const group of NAV_GROUPS) {
      for (const id of group.ids) {
        const section = SECTION_BY_ID[id];
        if (section && !seen.has(id)) {
          out.push(section);
          seen.add(id);
        }
      }
    }
    for (const section of SECTIONS) {
      if (!seen.has(section.id)) out.push(section);
    }
    return out;
  }

  const ORDERED_SECTIONS = orderedSections();
  const SECTION_IDS = new Set(ORDERED_SECTIONS.map((s) => s.id));

  let rendered = false;

  function sectionTitle(id) {
    if (id === 'force') return 'Force (debug)';
    return SECTION_BY_ID[id]?.title || 'Help';
  }

  function setActiveNavLink(nav, id) {
    nav?.querySelectorAll('[data-help-link]').forEach((a) => {
      const link = a.dataset.helpLink;
      if (id === 'force') {
        a.classList.toggle('active', link === 'force');
      } else {
        a.classList.toggle('active', link === id);
      }
    });
  }

  function scrollToSection(id) {
    if (id !== 'force' && !SECTION_IDS.has(id)) return false;
    ensureRendered();
    const el = id === 'force'
      ? (document.getElementById('help-force') || document.getElementById('help-tags'))
      : document.getElementById(`help-${id}`);
    const nav = document.querySelector('[data-help-nav]');
    if (!el) return false;
    setActiveNavLink(nav, id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function renderNavHtml() {
    return NAV_GROUPS.map((group) => {
      const links = group.ids
        .map((id) => {
          const s = SECTION_BY_ID[id];
          if (!s) return '';
          let html = `<a href="#help-${s.id}" data-help-link="${s.id}">${s.title}</a>`;
          if (id === 'tags') {
            html += '<a href="#help-force" class="help-nav-sub" data-help-link="force">Force I/O</a>';
          }
          return html;
        })
        .join('');
      if (!links) return '';
      return `<div class="help-nav-group"><div class="help-nav-label">${group.label}</div>${links}</div>`;
    }).join('');
  }

  function render(container) {
    if (!container) return;
    const nav = container.querySelector('[data-help-nav]');
    const body = container.querySelector('[data-help-body]');
    if (!nav || !body) return;

    nav.innerHTML = renderNavHtml();

    body.innerHTML = ORDERED_SECTIONS.map(
      (s) => `<section id="help-${s.id}" class="help-section"><h3>${s.title}</h3>${s.html}</section>`
    ).join('');

    nav.querySelectorAll('[data-help-link]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToSection(a.dataset.helpLink);
      });
    });
    rendered = true;
  }

  function ensureRendered() {
    const container = document.getElementById('help-panel');
    if (container && !rendered) render(container);
  }

  return {
    SECTIONS: ORDERED_SECTIONS,
    NAV_GROUPS,
    SECTION_IDS,
    sectionTitle,
    scrollToSection,
    render,
    ensureRendered,
  };
})();
