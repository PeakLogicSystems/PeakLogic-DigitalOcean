'use strict';

/**
 * Hardware connection wizard — guided device template apply for new users.
 */
window.PeaklogicHwWizard = (function () {
  const { esc } = window.PeaklogicCore || { esc: (s) => String(s ?? '') };
  const domGet = window.PeaklogicCore?.$ || ((id) => document.getElementById(id));

  const STEPS = ['transport', 'template', 'connection', 'apply', 'done'];
  let transportGroups = [];
  let presets = [];
  let serialPorts = [];
  let hwDefaults = {};
  let state = {
    step: 0,
    transportGroup: '',
    presetId: '',
    values: {},
    replaceTags: false,
    paramGroups: 1,
    applying: false,
    result: null,
    error: null,
  };

  let deps = {
    applyPreset: null,
    openHelp: null,
    openHmiSetup: null,
    refreshAll: null,
    onClose: null,
  };

  function $(id) {
    return typeof id === 'string' ? domGet(id) : id;
  }

  function presetById(id) {
    return presets.find((p) => p.id === id) || null;
  }

  function transportGroupForPreset(preset) {
    const map = {
      modbus_rtu: 'modbus_rtu',
      vgreen_epc: 'modbus_rtu',
      pentair_rs485: 'modbus_rtu',
      jandy_rs485: 'modbus_rtu',
      hayward_rs485: 'modbus_rtu',
      modbus_tcp: 'modbus_tcp',
      mqtt_parc: 'mqtt_parc',
      mqtt_parc_telemetry: 'mqtt_parc',
      mqtt: 'mqtt',
      nextcentury: 'nextcentury',
      hal: 'hal',
      https: 'https',
    };
    return map[preset?.transport] || null;
  }

  function filterPresetsByGroup(groupId) {
    if (!groupId) return presets.slice();
    return presets.filter((p) => transportGroupForPreset(p) === groupId);
  }

  function connectionFields(preset) {
    if (!preset) return [];
    const transport = preset.transport;
    const defs = preset.defaults || {};
    if (transport === 'modbus_tcp') {
      return [
        { id: 'host', label: 'TCP host', type: 'text', default: defs.host || '127.0.0.1' },
        { id: 'port', label: 'TCP port', type: 'number', default: defs.port ?? 502 },
        { id: 'slaveId', label: 'Slave ID', type: 'number', default: defs.slaveId ?? 1 },
      ];
    }
    if (transport === 'mqtt_parc' || transport === 'mqtt_parc_telemetry') {
      return [
        {
          id: 'deviceId',
          label: 'Opta device ID',
          type: 'text',
          default: defs.deviceId || preset.driverId || 'opta_st_01',
          hint: 'ATECC serial id from Opta /setup (mv_… or opta_…)',
        },
        {
          id: 'driverId',
          label: 'Position / driver ID',
          type: 'text',
          default: preset.driverId || 'opta_st_01',
          hint: 'Stable plant name — tags and ST bind here',
        },
        {
          id: 'brokerNote',
          label: 'MQTT broker (Opta /setup)',
          type: 'hint',
          default: '',
          hint: 'Set PeakLogic / IOT-LINK gateway LAN IP:1883 on the Opta /setup page (not 127.0.0.1). System setup broker stays mqtt://127.0.0.1:1883 on the gateway.',
        },
      ];
    }
    if (transport === 'mqtt') {
      return [
        { id: 'brokerUrl', label: 'Broker URL', type: 'text', default: defs.brokerUrl || 'mqtt://127.0.0.1:1883' },
        { id: 'topicPrefix', label: 'Topic prefix', type: 'text', default: defs.topicPrefix || '' },
        { id: 'clientId', label: 'Client ID', type: 'text', default: defs.clientId || '' },
      ];
    }
    if (transport === 'nextcentury' || transport === 'hal' || transport === 'https') {
      return [];
    }
    return [
      { id: 'serialPort', label: 'COM port', type: 'port', default: defs.serialPort || hwDefaults.serialPort || 'COM3' },
      { id: 'baud', label: 'Baud', type: 'number', default: defs.baud ?? hwDefaults.baud ?? 9600 },
      { id: 'slaveId', label: 'Slave ID', type: 'number', default: defs.slaveId ?? hwDefaults.slaveId ?? 1 },
      { id: 'parity', label: 'Parity', type: 'text', default: defs.parity || 'none' },
      { id: 'stopBits', label: 'Stop bits', type: 'number', default: defs.stopBits ?? 1 },
    ];
  }

  function defaultValues(preset) {
    const out = {};
    for (const f of connectionFields(preset)) {
      out[f.id] = f.default;
    }
    return out;
  }

  function buildApplyBody(preset, values) {
    const transport = preset.transport;
    const body = {
      presetId: preset.id,
      replaceTags: state.replaceTags,
      slaveId: values.slaveId != null ? +values.slaveId : (preset.defaults?.slaveId ?? 1),
    };
    if (preset.concube) body.paramGroups = state.paramGroups;
    if (values.driverId) body.driverId = String(values.driverId).trim();
    if (transport === 'modbus_tcp') {
      if (values.host) body.host = values.host;
      if (values.port != null) body.port = +values.port;
    } else if (transport === 'mqtt_parc' || transport === 'mqtt_parc_telemetry') {
      if (values.deviceId) body.deviceId = String(values.deviceId).trim();
      if (values.driverId) body.driverId = String(values.driverId).trim();
    } else if (transport === 'mqtt') {
      if (values.brokerUrl) body.brokerUrl = values.brokerUrl;
      if (values.topicPrefix) body.topicPrefix = values.topicPrefix;
      if (values.clientId) body.clientId = values.clientId;
    } else if (
      transport !== 'nextcentury'
      && transport !== 'https'
      && transport !== 'hal'
    ) {
      if (values.serialPort) body.serialPort = values.serialPort;
      if (values.baud != null) body.baud = +values.baud;
      if (values.parity) body.parity = values.parity;
      if (values.stopBits != null) body.stopBits = +values.stopBits;
    }
    return body;
  }

  function readFormValues() {
    const preset = presetById(state.presetId);
    if (!preset) return {};
    const out = { ...state.values };
    for (const f of connectionFields(preset)) {
      const el = $('hw-wizard-field-' + f.id);
      if (!el) continue;
      out[f.id] = f.type === 'number' ? (+el.value || f.default) : el.value;
    }
    const replaceEl = $('hw-wizard-replace-tags');
    if (replaceEl) state.replaceTags = replaceEl.checked;
    const groupsEl = $('hw-wizard-param-groups');
    if (groupsEl) state.paramGroups = Math.max(1, Math.min(16, parseInt(groupsEl.value, 10) || 1));
    state.values = out;
    return out;
  }

  function renderStepNav() {
    const nav = $('hw-wizard-step-nav');
    if (!nav) return;
    const labels = ['Transport', 'Template', 'Connection', 'Apply', 'Done'];
    nav.innerHTML = STEPS.map((id, i) => {
      const cls = i === state.step ? 'active' : (i < state.step ? 'done' : '');
      return `<button type="button" class="hw-wizard-step ${cls}" data-wizard-step="${i}" ${i > state.step ? 'disabled' : ''}>${i + 1}. ${labels[i]}</button>`;
    }).join('');
    nav.querySelectorAll('[data-wizard-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.wizardStep;
        if (idx <= state.step) {
          state.step = idx;
          render();
        }
      });
    });
  }

  function renderTransportStep() {
    const body = $('hw-wizard-body');
    if (!body) return;
    const groups = transportGroups.length ? transportGroups : [
      { id: 'modbus_rtu', label: 'Modbus RTU', hint: 'RS-485 / USB serial' },
      { id: 'mqtt_parc', label: 'MQTT Parc / Opta', hint: 'Arduino Opta remote ST' },
    ];
    body.innerHTML = `
      <p class="panel-hint">Choose how this device talks to PeakLogic. You can add more drivers later from <strong>Drivers</strong>.</p>
      <div class="hw-wizard-transport-grid">
        ${groups.map((g) => `
          <button type="button" class="hw-wizard-card${state.transportGroup === g.id ? ' selected' : ''}" data-transport-group="${esc(g.id)}">
            <strong>${esc(g.label)}</strong>
            <span class="muted">${esc(g.hint || '')}</span>
          </button>
        `).join('')}
      </div>
    `;
    body.querySelectorAll('[data-transport-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.transportGroup = btn.dataset.transportGroup;
        state.presetId = '';
        state.values = {};
        render();
      });
    });
  }

  function renderTemplateStep() {
    const body = $('hw-wizard-body');
    const list = filterPresetsByGroup(state.transportGroup);
    if (!list.length) {
      body.innerHTML = '<p class="muted">No templates for this transport. Pick another transport or use <strong>Drivers → Apply device template</strong> manually.</p>';
      return;
    }
    body.innerHTML = `
      <p class="panel-hint">Device templates add a driver and I/O tags in one step. Pick the model that matches your hardware.</p>
      <ul class="hw-wizard-template-list">
        ${list.map((p) => {
          const io = [
            p.diCount ? `${p.diCount} DI` : '',
            p.doCount ? `${p.doCount} DO` : '',
            p.aiCount ? `${p.aiCount} AI` : '',
            p.hrCount ? `${p.hrCount} HR` : '',
          ].filter(Boolean).join(' · ');
          const sel = state.presetId === p.id ? ' selected' : '';
          return `<li><button type="button" class="hw-wizard-template-row${sel}" data-preset-id="${esc(p.id)}">
            <span class="hw-wizard-template-label">${esc(p.label)}</span>
            <span class="muted">${esc(p.vendor || '')}${io ? ' — ' + esc(io) : ''}${p.tagsFromDevice ? ' · tags from device' : ''}</span>
          </button></li>`;
        }).join('')}
      </ul>
    `;
    body.querySelectorAll('[data-preset-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.presetId = btn.dataset.presetId;
        state.values = defaultValues(presetById(state.presetId));
        render();
      });
    });
  }

  function portSelectHtml(value) {
    const v = String(value || '').trim();
    const ports = serialPorts.length ? serialPorts : [{ path: 'COM3', label: 'COM3' }];
    const known = ports.some((p) => p.path === v);
    const opts = ports.map((p) =>
      `<option value="${esc(p.path)}"${p.path === v ? ' selected' : ''}>${esc(p.label)}${p.usb ? ' [USB]' : ''}</option>`
    ).join('');
    const custom = v && !known ? `<option value="${esc(v)}" selected>${esc(v)} (saved)</option>` : '';
    return `<select id="hw-wizard-field-serialPort">${custom}${opts}</select>`;
  }

  function renderConnectionStep() {
    const body = $('hw-wizard-body');
    const preset = presetById(state.presetId);
    if (!preset) {
      body.innerHTML = '<p class="muted">Select a template first.</p>';
      return;
    }
    const fields = connectionFields(preset);
    if (!fields.length) {
      const hint = preset.transport === 'nextcentury'
        ? 'After apply, open <strong>Drivers → NextCentury API</strong> to enter credentials, then return here or use the manual template bar.'
        : preset.transport === 'hal'
          ? 'HAL templates apply immediately. Edit the driver row for plugin path, stack, and I2C bus if needed.'
          : 'No connection fields for this template — click <strong>Next</strong> to apply.';
      body.innerHTML = `<p class="panel-hint">${hint}</p>`;
      return;
    }
    const fieldHtml = fields.map((f) => {
      if (f.type === 'hint') {
        return `<p class="panel-hint span-all">${esc(f.hint || f.label)}</p>`;
      }
      const val = state.values[f.id] ?? f.default;
      let input;
      if (f.type === 'port') {
        input = portSelectHtml(val);
      } else if (f.type === 'number') {
        input = `<input id="hw-wizard-field-${esc(f.id)}" type="number" value="${esc(val)}">`;
      } else {
        input = `<input id="hw-wizard-field-${esc(f.id)}" type="text" value="${esc(val)}">`;
      }
      const hint = f.hint ? `<span class="muted field-hint">${esc(f.hint)}</span>` : '';
      return `<label class="span-all">${esc(f.label)} ${input}${hint}</label>`;
    }).join('');
    const concube = preset.concube ? `
      <label>Parameter groups (×4)
        <input type="number" id="hw-wizard-param-groups" min="1" max="16" value="${state.paramGroups}">
      </label>
    ` : '';
    body.innerHTML = `
      <p class="panel-hint">Connection settings for <strong>${esc(preset.label)}</strong>. Shared Modbus buses use the <strong>next slave address</strong> on each apply.</p>
      <div class="form-grid compact">${fieldHtml}${concube}</div>
      <label class="checkbox-inline">
        <input type="checkbox" id="hw-wizard-replace-tags"${state.replaceTags ? ' checked' : ''}>
        Replace tags on this driver (removes existing tags for the driver)
      </label>
    `;
  }

  function renderApplyStep() {
    const body = $('hw-wizard-body');
    const preset = presetById(state.presetId);
    if (!preset) {
      body.innerHTML = '<p class="muted">Select a template first.</p>';
      return;
    }
    readFormValues();
    const bodyPreview = buildApplyBody(preset, state.values);
    const lines = Object.entries(bodyPreview)
      .filter(([k]) => k !== 'replaceTags')
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td><code>${esc(String(v))}</code></td></tr>`)
      .join('');
    body.innerHTML = `
      <p class="panel-hint">Review and apply. This calls the same <code>POST /devices/apply</code> API as <strong>Drivers → Apply template</strong>.</p>
      <table class="help-table hw-wizard-review">
        <tr><th>Template</th><td>${esc(preset.label)}</td></tr>
        <tr><th>Transport</th><td><code>${esc(preset.transport)}</code></td></tr>
        ${lines}
        <tr><th>Replace tags</th><td>${state.replaceTags ? 'Yes' : 'No'}</td></tr>
      </table>
      <p id="hw-wizard-apply-msg" class="muted" aria-live="polite">${state.error ? esc(state.error) : ''}</p>
    `;
  }

  function renderDoneStep() {
    const body = $('hw-wizard-body');
    const r = state.result;
    if (!r) {
      body.innerHTML = '<p class="muted">Apply a template to see results here.</p>';
      return;
    }
    const slaveNote = r.slaveId != null && !state.replaceTags ? `, slave ${r.slaveId}` : '';
    body.innerHTML = `
      <p class="hw-wizard-success"><strong>${esc(r.preset?.label || 'Template')}</strong> ${r.merged ? 'added to' : 'applied on'}
        driver <code>${esc(r.driver?.id || '')}</code>${slaveNote}: <strong>${r.tagsAdded}</strong> tag(s), ${r.tagCount} total.</p>
      ${r.nextStep ? `<p class="panel-hint">${esc(r.nextStep)}</p>` : ''}
      <h4>Next steps</h4>
      <ul>
        <li><strong>Tags</strong> — verify I/O mapping and scaling</li>
        <li><strong>Program</strong> — edit ST, validate, start runtime</li>
        <li><strong>HMI</strong> — compose screens and bind tags to composites</li>
      </ul>
      <div class="toolbar wrap">
        <button type="button" id="hw-wizard-open-hmi" class="btn primary">Open HMI Setup</button>
        <button type="button" id="hw-wizard-open-tutorial" class="btn">Tutorial: screen components</button>
        <button type="button" id="hw-wizard-open-drivers" class="btn">Open Drivers</button>
      </div>
    `;
    $('hw-wizard-open-hmi')?.addEventListener('click', () => {
      close();
      deps.openHmiSetup?.();
    });
    $('hw-wizard-open-tutorial')?.addEventListener('click', () => {
      deps.openHelp?.('tutorial');
    });
    $('hw-wizard-open-drivers')?.addEventListener('click', () => {
      close();
      deps.onClose?.('drivers');
    });
  }

  function renderFooter() {
    const back = $('hw-wizard-back');
    const next = $('hw-wizard-next');
    const apply = $('hw-wizard-apply');
    if (back) back.disabled = state.step === 0 || state.applying;
    if (next) {
      next.classList.toggle('view-hidden', state.step === 3 || state.step === 4);
      next.disabled = !canAdvance() || state.applying;
    }
    if (apply) {
      apply.classList.toggle('view-hidden', state.step !== 3);
      apply.disabled = state.applying || !state.presetId;
    }
    if (next && state.step === 4) next.classList.add('view-hidden');
  }

  function canAdvance() {
    if (state.step === 0) return !!state.transportGroup;
    if (state.step === 1) return !!state.presetId;
    if (state.step === 2) return !!state.presetId;
    return true;
  }

  function render() {
    renderStepNav();
    const stepId = STEPS[state.step];
    if (stepId === 'transport') renderTransportStep();
    else if (stepId === 'template') renderTemplateStep();
    else if (stepId === 'connection') renderConnectionStep();
    else if (stepId === 'apply') renderApplyStep();
    else if (stepId === 'done') renderDoneStep();
    renderFooter();
  }

  function reset() {
    state = {
      step: 0,
      transportGroup: '',
      presetId: '',
      values: {},
      replaceTags: false,
      paramGroups: 1,
      applying: false,
      result: null,
      error: null,
    };
  }

  function open(options = {}) {
    if (options.transportGroups?.length) transportGroups = options.transportGroups;
    if (options.presets?.length) presets = options.presets;
    if (options.serialPorts) serialPorts = options.serialPorts;
    if (options.hwDefaults) hwDefaults = options.hwDefaults;
    if (options.deps) deps = { ...deps, ...options.deps };
    reset();
    if (options.presetId) {
      const p = presetById(options.presetId);
      if (p) {
        state.presetId = options.presetId;
        state.transportGroup = transportGroupForPreset(p) || '';
        state.values = defaultValues(p);
        state.step = state.transportGroup ? 1 : 0;
      }
    }
    render();
    const popup = document.querySelector('[data-popup="hw-wizard"]');
    popup?.classList.remove('view-hidden');
    if (popup) window.MvWindowStack?.onOpen?.(popup);
  }

  function close() {
    const popup = document.querySelector('[data-popup="hw-wizard"]');
    popup?.classList.add('view-hidden');
  }

  function goBack() {
    if (state.step > 0) {
      state.step -= 1;
      state.error = null;
      render();
    }
  }

  function goNext() {
    if (!canAdvance()) return;
    if (state.step === 2) readFormValues();
    if (state.step < STEPS.length - 1) {
      state.step += 1;
      state.error = null;
      render();
    }
  }

  function formatApplyError(e) {
    let msg = e?.message || String(e);
    if (/Tag id already in use/i.test(msg)) {
      msg += ' Enable "Replace tags on this driver" on the Connection step, or remove conflicting tags first.';
    }
    return msg;
  }

  async function runApply() {
    const preset = presetById(state.presetId);
    if (!preset || !deps.applyPreset) return;
    readFormValues();
    if (state.replaceTags && !window.confirm(
      `Apply "${preset.label}"?\n\nThis replaces all tags on the target driver.`
    )) {
      return;
    }
    state.applying = true;
    state.error = null;
    renderApplyStep();
    renderFooter();
    try {
      const r = await deps.applyPreset(buildApplyBody(preset, state.values));
      state.result = r;
      state.step = 4;
      state.applying = false;
      render();
      deps.refreshAll?.({ force: true })?.catch(() => {});
    } catch (e) {
      state.error = formatApplyError(e);
      state.applying = false;
      render();
      const msg = $('hw-wizard-apply-msg');
      if (msg) msg.textContent = state.error;
    }
  }

  function bindControls() {
    $('hw-wizard-back')?.addEventListener('click', goBack);
    $('hw-wizard-next')?.addEventListener('click', goNext);
    $('hw-wizard-apply')?.addEventListener('click', () => runApply());
  }

  bindControls();

  return {
    open,
    close,
    reset,
    buildApplyBody,
    filterPresetsByGroup,
    transportGroupForPreset,
    connectionFields,
  };
})();
