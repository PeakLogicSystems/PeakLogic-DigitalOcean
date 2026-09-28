'use strict';

window.MvDrawHelp = (function () {
  const SECTIONS = [
    {
      id: 'start',
      title: 'Getting started',
      html: `
        <p>MV Draw is a scaled site-plan editor for septic and DWTS layouts. Place tanks, lift stations, ATU trains, and drip dispersal on a calibrated background, then export PDF or DXF for submittals.</p>
        <h4>Typical workflow (blank sheet)</h4>
        <ol>
          <li><strong>File → New</strong> (or <strong>Save as…</strong> to name the file).</li>
          <li><strong>Workspace</strong> — pick sheet <strong>A–D</strong> and plot scale (<em>1 in =</em> ft). This sets drawing size and scale. New projects start on <strong>Arch D</strong> at 1 in = 10 ft.</li>
          <li><strong>Place</strong> symbols from the library and <strong>Connect</strong> ports (pipes or electric).</li>
          <li><strong>File → Save</strong>, then <strong>PDF</strong> / <strong>DXF</strong> when ready.</li>
        </ol>
        <h4>Over a scanned site plan</h4>
        <ol>
          <li><strong>Background…</strong> — import PNG/JPG.</li>
          <li><strong>Calibrate</strong> — two known points + distance (sets true-world scale).</li>
          <li>Optional: <strong>Extents</strong> or sheet <strong>A–D</strong> for export crop.</li>
          <li>Place and connect symbols as above.</li>
        </ol>
        <p>Projects use the <code>peaklogic-mvdraw</code> JSON format. Portable PeakLogic <code>.est.zip</code> archives store layouts under <code>mv-draw/doc.json</code>.</p>
        <h4>Top bar</h4>
        <p>Left to right: <strong>File</strong> and <strong>Composer</strong> mode, project name, drawing tools (Select, Connect, Snap, export…), then <strong>Help</strong> and <strong>Close</strong> on the right.</p>
      `,
    },
    {
      id: 'tools',
      title: 'Tools',
      html: `
        <table class="help-table">
          <tr><th>Tool</th><th>Use</th></tr>
          <tr><td><strong>Select</strong></td><td>Click to select; drag to move. Drag on empty canvas for marquee selection. Click a connection line to select it — drag yellow bend handles (snap applies), or double-click the line to add a bend. <kbd>Shift</kbd> adds/removes from selection. Shortcut: <kbd>V</kbd>.</td></tr>
          <tr><td><strong>Rotate</strong></td><td>Select symbol(s), then drag the symbol or its yellow handle around the center pivot. <kbd>Shift</kbd> snaps rotation to 15° steps. Shortcut: <kbd>R</kbd>.</td></tr>
          <tr><td><strong>Stretch</strong></td><td>Select one symbol, then drag cyan square handles to resize width/height so ports line up with pipes. <kbd>Shift</kbd> keeps aspect ratio. Shortcut: <kbd>X</kbd>. Width/height multipliers are also in Properties.</td></tr>
          <tr><td><strong>Group</strong></td><td>Select 2+ symbols → <strong>Group</strong> (<kbd>Ctrl</kbd>+<kbd>G</kbd>). Grouped symbols move together; purple outline shows group bounds.</td></tr>
          <tr><td><strong>Ungroup</strong></td><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> or <strong>Ungroup</strong> in the inspector.</td></tr>
          <tr><td><strong>Place</strong></td><td>After picking a library symbol, click the canvas to drop it (respects snap).</td></tr>
          <tr><td><strong>Connect</strong></td><td>Click a green port, then click the canvas for bend points (polyline, with snap), then click a destination port. <kbd>Backspace</kbd> removes the last bend; <kbd>Esc</kbd> cancels. Straight runs use two ports with no canvas clicks.</td></tr>
          <tr><td><strong>Calibrate</strong></td><td>Two clicks on the background, enter known distance, Apply scale.</td></tr>
          <tr><td><strong>Extents</strong></td><td>Two clicks for site/plot rectangle, or pick standard sheet <strong>A–D</strong> in the inspector. <strong>Zoom extents</strong> (<kbd>Home</kbd>) fits the view; PDF/DXF crop to extents.</td></tr>
          <tr><td><strong>Zoom extents</strong></td><td>Toolbar button or <kbd>Home</kbd> — zooms to the workspace boundary, or to drawing content if no extents are set.</td></tr>
        </table>
        <p>Mouse wheel zooms around the cursor. <strong>Pan:</strong> hold <kbd>Space</kbd> and drag, middle-mouse drag, or <kbd>Shift</kbd>+wheel.</p>
      `,
    },
    {
      id: 'symbols',
      title: 'Symbol library',
      html: `
        <p>Symbols are grouped in the left sidebar:</p>
        <ul>
          <li><strong>Tanks</strong> — septic, pump chamber, treatment, trash (2-compartment), dosing</li>
          <li><strong>Lift &amp; ATU panels</strong> — simplex/duplex lift stations and single/dual/quad ATU control panels (duplex + TPO)</li>
          <li><strong>Drainfield</strong> — drip field, 4-leg irrigation + return, drip laterals</li>
          <li><strong>Distribution</strong> — D-box</li>
          <li><strong>Site</strong> — building footprint</li>
        </ul>
        <p>Each symbol has connection <strong>ports</strong> (shown in Connect mode). Edit label, position, and rotation in the Properties panel.</p>
      `,
    },
    {
      id: 'snap',
      title: 'Snap &amp; align',
      html: `
        <p>Enable <strong>Snap</strong> in the toolbar (or press <kbd>S</kbd>) to align while dragging or placing:</p>
        <ul>
          <li><strong>Grid snap</strong> — 1, 5, or 10 ft spacing</li>
          <li><strong>Object snap</strong> — edges and centers of nearby symbols, site extents, and connection ports when editing bends</li>
          <li><strong>Temporarily off</strong> — hold <kbd>Alt</kbd> while dragging to move without snap</li>
        </ul>
        <p>Magenta guide lines appear when snapping during a drag or while placing/editing connection bends. Grid lines match the snap spacing in the toolbar.</p>
        <p>In the inspector <strong>Snap &amp; align</strong> section, align multi-selected symbols (Left, Center, Distribute, etc.) or center the selection on site extents.</p>
      `,
    },
    {
      id: 'file',
      title: 'File &amp; export',
      html: `
        <table class="help-table">
          <tr><th>Action</th><th>Description</th></tr>
          <tr><td><strong>New</strong></td><td>Blank layout (prompts if unsaved).</td></tr>
          <tr><td><strong>Open…</strong></td><td>Saved server projects or a local <code>.mvdraw.json</code> file.</td></tr>
          <tr><td><strong>Save</strong></td><td>Writes the active session project.</td></tr>
          <tr><td><strong>Save as…</strong></td><td>Named copy under <code>data/mv-draw/projects</code>.</td></tr>
          <tr><td><strong>Save to PeakLogic project…</strong></td><td>Aligns name with the open PeakLogic project, embeds the plan in the active <code>.est.zip</code>, and links the HMI composer to Plan mode.</td></tr>
          <tr><td><strong>Load from PeakLogic project</strong></td><td>Replace the active layout with the <code>mvDraw</code> section from the open <code>.est</code> snapshot.</td></tr>
          <tr><td><strong>PDF</strong></td><td>Vector layout download (respects extents). Use the <strong>Landscape</strong> / <strong>Portrait</strong> selector beside the export buttons.</td></tr>
          <tr><td><strong>DXF</strong></td><td>CAD export (basic R12-style polylines). Plot boundary respects the same orientation.</td></tr>
        </table>
        <p>Project name, site, client, and notes are stored in the inspector <strong>Project</strong> section.</p>
      `,
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      html: `
        <table class="help-table">
          <tr><th>Shortcut</th><th>Action</th></tr>
          <tr><td><kbd>F1</kbd></td><td>This help</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Open</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></td><td>Save as</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
          <tr><td><kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>
          <tr><td><kbd>Home</kbd></td><td>Zoom extents</td></tr>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>U</kbd> <kbd>D</kbd> <kbd>L</kbd> <kbd>R</kbd></td><td>Nudge selected symbol(s); uses snap grid when enabled (<kbd>Shift</kbd> = 5× step). <kbd>R</kbd> nudges right when a symbol is selected; otherwise switches to Rotate.</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Cancel connect or extents pick</td></tr>
          <tr><td><kbd>Backspace</kbd></td><td>While connecting, remove last polyline bend; on a selected connection, remove selected bend or last bend</td></tr>
          <tr><td><kbd>Delete</kbd></td><td>Delete selected symbol(s) or connection</td></tr>
        </table>
      `,
    },
  ];

  let rendered = false;

  function render() {
    const nav = document.getElementById('mv-help-nav');
    const body = document.getElementById('mv-help-body');
    if (!nav || !body || rendered) return;
    nav.innerHTML = SECTIONS.map(
      (s) => `<a href="#mv-help-${s.id}" class="mv-help-nav-link" data-mv-help-link="${s.id}">${s.title}</a>`,
    ).join('');
    body.innerHTML = SECTIONS.map(
      (s) => `<section id="mv-help-${s.id}" class="mv-help-section"><h4>${s.title}</h4>${s.html}</section>`,
    ).join('');
    nav.querySelectorAll('[data-mv-help-link]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = document.getElementById(`mv-help-${a.dataset.mvHelpLink}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    rendered = true;
  }

  function open(sectionId) {
    render();
    const dlg = document.getElementById('mv-help-dialog');
    if (!dlg) return;
    dlg.showModal();
    if (sectionId) {
      requestAnimationFrame(() => {
        document.getElementById(`mv-help-${sectionId}`)?.scrollIntoView({ block: 'start' });
      });
    }
  }

  function close() {
    document.getElementById('mv-help-dialog')?.close();
  }

  return { open, close, SECTIONS };
})();
