'use strict';

(() => {
  const root = document.getElementById('cs-app');
  const main = document.getElementById('cs-main');
  if (!root || !main || !window.api) return;

  const page = root.dataset.page || 'sites';
  const pathSiteId = String(root.dataset.siteId || '').trim();
  const role = root.dataset.role || '';

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function agentBadge(online) {
    return online
      ? '<span class="badge badge-ok">online</span>'
      : '<span class="badge badge-off">offline</span>';
  }

  function controllerBadge(count, online, commissioned, stale, lastReportAt) {
    if (!count) {
      return '<span class="badge badge-off" title="No Opta linked to this site">not assigned</span>';
    }
    if (online) {
      return `<span class="badge badge-ok" title="${count} controller(s) with fresh telemetry">${count} online</span>`;
    }
    if (commissioned && stale) {
      const when = lastReportAt ? ` — last telemetry ${lastReportAt.slice(0, 10)}` : '';
      return `<span class="badge badge-muted" title="Assigned and commissioned; waiting for fresh MQTT telemetry${when}">${count} commissioned · stale</span>`;
    }
    return `<span class="badge badge-off" title="${count} controller(s)">${count} offline</span>`;
  }

  function roleLabel(role) {
    const labels = {
      operator: 'Operator',
      technician: 'Technician',
      supervisor: 'Supervisor',
      tenant_admin: 'Tenant admin',
      platform_admin: 'Platform admin',
      partner_admin: 'Partner admin',
      partner_technician: 'Partner technician',
    };
    return labels[String(role || '')] || esc(role || '—');
  }

  function siteKeyCell(row) {
    const hex = row?.globalSiteKeyHex;
    const digits = row?.globalSiteKeyDigits;
    if (!hex) return '<span class="cs-muted">unassigned</span>';
    return `<code>${esc(hex)}</code>${digits ? ` · <code>${esc(digits)}</code>` : ''}`;
  }

  function statusBadge(st) {
    const s = String(st || 'offline').toLowerCase();
    const cls = s === 'fault' || s === 'alarm' ? 'badge-off'
      : s === 'warning' || s === 'warn' ? 'badge-warn'
        : s === 'offline' ? 'badge-muted'
          : s === 'online' || s === 'ok' ? 'badge-ok'
            : 'badge-muted';
    const label = s === 'ok' ? 'online' : s;
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  function playerUrl(siteId, cameraId) {
    return `/api/sites/${encodeURIComponent(siteId)}/cameras/${encodeURIComponent(cameraId)}/player`;
  }

  document.querySelectorAll('.cs-nav a[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-nav') === page
      || (page === 'cameras' && a.getAttribute('data-nav') === 'sites')
      || (page === 'site' && a.getAttribute('data-nav') === 'sites'));
  });
  function setAdminNavVisible(visible) {
    document.getElementById('nav-admin')?.classList.toggle('view-hidden', !visible);
  }
  function setMqttNavVisible(visible) {
    document.getElementById('nav-mqtt')?.classList.toggle('view-hidden', !visible);
  }
  setAdminNavVisible(role === 'platform_admin');
  setMqttNavVisible(role === 'platform_admin' || role === 'partner_admin');
  if (role !== 'platform_admin') {
    api.authMe().then((me) => {
      const r = me?.user?.role || '';
      setAdminNavVisible(r === 'platform_admin');
      setMqttNavVisible(r === 'platform_admin' || r === 'partner_admin' || !!me?.isPartner);
    }).catch(() => {});
  }

  document.getElementById('cs-logout')?.addEventListener('click', async () => {
    try { await api.logout(); } catch { /* ignore */ }
    location.href = '/login';
  });

  async function initOrgSwitcher() {
    const wrap = document.getElementById('cs-org-wrap');
    const sel = document.getElementById('cs-org-switch');
    const label = document.getElementById('cs-user-label');
    const peopleNav = document.querySelector('.cs-nav a[data-nav="people"]');
    const partnerNav = document.getElementById('nav-partner');
    if (!sel || !wrap) return;
    try {
      const me = await api.authMe();
      const user = me.user || {};
      let tenants = me.accessibleTenants || [];
      const isPlatformAdmin = user.role === 'platform_admin';
      const isPartner = !!me.isPartner;
      if (label && me.tenant?.tenantSlug) label.textContent = me.tenant.tenantSlug;
      if (isPartner && user.role === 'partner_admin' && partnerNav) {
        partnerNav.classList.remove('view-hidden');
      }
      if (isPartner && !me.isPartnerHome && peopleNav) {
        peopleNav.classList.add('view-hidden');
      }
      if ((isPartner || isPlatformAdmin) && tenants.length === 0) {
        try {
          const extra = isPlatformAdmin
            ? (await api.listAdminTenants()).tenants
            : (await api.listAccessibleTenants()).tenants;
          if (Array.isArray(extra) && extra.length) tenants = extra;
        } catch { /* ignore */ }
      }
      const byId = new Map(tenants.map((t) => [t.tenantId, t]));
      tenants = [...byId.values()];
      if ((isPartner || isPlatformAdmin) && tenants.length > 0) {
        wrap.classList.remove('view-hidden');
        sel.innerHTML = tenants.map((t) => {
          const home = isPartner && t.tenantId === user.tenantId;
          const suffix = home ? ' (partner)' : (t.partnerId ? '' : '');
          return `<option value="${esc(t.tenantId)}"${me.tenant && t.tenantId === me.tenant.tenantId ? ' selected' : ''}>${esc(t.name)} (${esc(t.tenantSlug)})${suffix}</option>`;
        }).join('');
        sel.onchange = async () => {
          try {
            await api.switchPartnerTenant({ tenantId: sel.value });
            location.reload();
          } catch (e) {
            alert(e.message || 'Could not switch organization');
          }
        };
      }
    } catch { /* ignore */ }
  }

  initOrgSwitcher();

  function roleOptionsHtml(isPartnerHomeOrg) {
    if (isPartnerHomeOrg) {
      return `
            <option value="partner_admin">Partner admin</option>
            <option value="partner_technician">Partner technician</option>`;
    }
    return `
            <option value="operator">Operator</option>
            <option value="technician">Technician</option>
            <option value="supervisor">Supervisor</option>
            <option value="tenant_admin">Tenant admin</option>`;
  }

  function isPartnerOrg(t) {
    return !!(t && (t.isPartner || t.tenantType === 'partner'));
  }

  function defaultRoleForOrg(t, meSession) {
    if (meSession?.isPartnerHome || isPartnerOrg(t)) return 'partner_admin';
    return 'operator';
  }

  async function renderSites() {
    let countyOptions = [];
    try {
      const fleet = await api.listFleetAssets();
      countyOptions = fleet.counties || [];
    } catch { /* ignore */ }

    const countySelectHtml = (selected, id) => {
      const opts = ['<option value="">County (optional)</option>']
        .concat(countyOptions.map((c) => {
          const sel = c.slug === selected ? ' selected' : '';
          return `<option value="${esc(c.slug)}"${sel}>${esc(c.name)}</option>`;
        }));
      return `<select id="${esc(id)}" aria-label="County">${opts.join('')}</select>`;
    };

    main.innerHTML = `
      <h1>Sites</h1>
      <p class="cs-lead">Create a site with address, then assign field Optas under <strong>Devices</strong>. Sites with a county appear on the <a href="/fleet">Assets map</a>.</p>
      <div class="cs-card cs-admin-section">
        <h2 class="cs-subhead">New site</h2>
        <div class="cs-site-form-grid">
          <label>Site ID <input id="cs-new-site-id" placeholder="7767_Land_O_Lakes_Blvd"></label>
          <label>Store / name <input id="cs-new-site-name" placeholder="store 2707575"></label>
          <label class="cs-form-span-2">Street address <input id="cs-new-site-address" placeholder="7767 Land O Lakes Blvd, Land O Lakes, FL"></label>
          <label>County ${countySelectHtml('', 'cs-new-site-county')}</label>
          <div><button type="button" class="btn btn-primary" id="cs-create-site">Create site</button></div>
        </div>
      </div>
      <div class="cs-toolbar">
        <button type="button" class="btn" id="cs-refresh-sites">Refresh</button>
        <a class="btn btn-primary" href="/sites/devices">Assign devices</a>
        <a class="btn" href="/fleet">Assets map</a>
      </div>
      <div id="cs-assign-banner"></div>
      <div id="cs-pairing-banner"></div>
      <div id="cs-site-edit-panel" class="cs-edit-panel view-hidden"></div>
      <div class="cs-card"><div id="cs-sites-table"></div></div>
      <p class="cs-msg" id="cs-sites-status"></p>`;

    const tableHost = document.getElementById('cs-sites-table');
    const statusEl = document.getElementById('cs-sites-status');
    const banner = document.getElementById('cs-pairing-banner');
    const assignBanner = document.getElementById('cs-assign-banner');
    const editPanel = document.getElementById('cs-site-edit-panel');
    let editingSiteId = null;

    function closeEditPanel() {
      editingSiteId = null;
      if (editPanel) {
        editPanel.classList.add('view-hidden');
        editPanel.innerHTML = '';
      }
    }

    function openEditPanel(site) {
      editingSiteId = site.siteId;
      editPanel.classList.remove('view-hidden');
      editPanel.innerHTML = `
        <h2>Edit site · <code>${esc(site.siteId)}</code></h2>
        <div class="cs-site-form-grid">
          <label>Store / name <input id="cs-edit-site-name" value="${esc(site.name || '')}"></label>
          <label>County ${countySelectHtml(site.county || '', 'cs-edit-site-county')}</label>
          <label class="cs-form-span-2">Street address <input id="cs-edit-site-address" value="${esc(site.address || '')}"></label>
          <div>
            <button type="button" class="btn btn-primary" id="cs-save-site">Save</button>
            <button type="button" class="btn" id="cs-cancel-site">Cancel</button>
          </div>
        </div>`;
      document.getElementById('cs-cancel-site').onclick = closeEditPanel;
      document.getElementById('cs-save-site').onclick = async () => {
        try {
          await api.updateSite(site.siteId, {
            name: document.getElementById('cs-edit-site-name').value.trim(),
            address: document.getElementById('cs-edit-site-address').value.trim(),
            county: document.getElementById('cs-edit-site-county').value.trim(),
          });
          closeEditPanel();
          statusEl.innerHTML = '<span class="cs-ok">Site updated.</span>';
          await load();
        } catch (e) {
          statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
        }
      };
      editPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function load() {
      try {
        const data = await api.listSites();
        const sites = data.sites || [];
        const pending = Number(data.unassignedCheckIn) || 0;
        if (assignBanner) {
          assignBanner.innerHTML = pending
            ? `<div class="cs-hint-banner cs-hint-warn"><strong>${pending} Opta(s) checked in</strong> — driver synced and telemetry received, but not linked to a site yet. Open <a href="/sites/devices">Devices → Assign to site</a> to finish commissioning.</div>`
            : '';
        }
        if (!sites.length) {
          tableHost.innerHTML = '<p class="cs-empty">No sites yet for this organization.</p>';
          return;
        }
        tableHost.innerHTML = `<table class="cs-table"><thead><tr>
          <th>Site</th><th>Name</th><th>Address</th><th>County</th><th>Controller</th><th>Edge agent</th><th>Cameras</th><th></th>
        </tr></thead><tbody>
          ${sites.map((s) => `<tr>
            <td><code>${esc(s.siteId)}</code></td>
            <td>${esc(s.name)}</td>
            <td>${esc(s.address || '—')}</td>
            <td>${esc(s.county || '—')}</td>
            <td>${controllerBadge(Number(s.controllerCount) || 0, s.controllerOnline, s.controllerCommissioned, s.controllerStale, s.controllerLastReportAt)}</td>
            <td>${agentBadge(!!s.agentOnline)}</td>
            <td>${Number(s.cameraCount) || 0}</td>
            <td>
              <button type="button" class="btn" data-edit-site="${esc(s.siteId)}">Edit</button>
              <a class="btn btn-primary" href="/sites/devices">Assign</a>
              <a class="btn" href="/sites/${encodeURIComponent(s.siteId)}/cameras">Cameras</a>
              <button type="button" class="btn btn-danger" data-del="${esc(s.siteId)}">Delete</button>
            </td>
          </tr>`).join('')}
        </tbody></table>`;
        tableHost.querySelectorAll('[data-edit-site]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const site = sites.find((x) => x.siteId === btn.dataset.editSite);
            if (site) openEditPanel(site);
          });
        });
        tableHost.querySelectorAll('[data-del]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(`Delete ${btn.dataset.del}?`)) return;
            await api.deleteSite(btn.dataset.del);
            await load();
          });
        });
        statusEl.textContent = `${sites.length} site(s)`;
      } catch (e) {
        tableHost.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
      }
    }

    document.getElementById('cs-refresh-sites').onclick = () => load();
    document.getElementById('cs-create-site').onclick = async () => {
      try {
        const created = await api.createSite({
          siteId: document.getElementById('cs-new-site-id').value.trim() || undefined,
          name: document.getElementById('cs-new-site-name').value.trim() || undefined,
          address: document.getElementById('cs-new-site-address').value.trim(),
          county: document.getElementById('cs-new-site-county').value.trim(),
        });
        const pairing = created.pairingCode || '';
        const id = created.site?.siteId || '';
        banner.innerHTML = pairing
          ? `<div class="cs-pairing"><strong>Pairing code for <code>${esc(id)}</code></strong><code>${esc(pairing)}</code></div>`
          : '';
        document.getElementById('cs-new-site-id').value = '';
        document.getElementById('cs-new-site-name').value = '';
        document.getElementById('cs-new-site-address').value = '';
        document.getElementById('cs-new-site-county').value = '';
        await load();
      } catch (e) {
        statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
      }
    };
    await load();
  }

  async function renderCameras(siteId) {
    main.innerHTML = `
      <h1>Cameras · <code>${esc(siteId)}</code></h1>
      <p class="cs-lead">Redacted catalog from the site agent.</p>
      <div class="cs-toolbar">
        <a class="btn" href="/sites">← Sites</a>
        <button type="button" class="btn" id="cs-refresh-cams">Refresh</button>
        <span id="cs-agent-badge"></span>
      </div>
      <div class="cs-card"><div id="cs-cams-table"></div></div>
      <div class="cs-card" id="cs-player-card" hidden>
        <h2 id="cs-player-title">Live view</h2>
        <iframe class="player-frame" id="cs-player" title="Live" allow="autoplay"></iframe>
      </div>`;
    const tableHost = document.getElementById('cs-cams-table');
    async function load() {
      const data = await api.siteCameras(siteId);
      document.getElementById('cs-agent-badge').innerHTML = agentBadge(!!data.agentOnline);
      const cams = data.cameras || [];
      if (!cams.length) {
        tableHost.innerHTML = '<p class="cs-empty">No cameras synced yet.</p>';
        return;
      }
      tableHost.innerHTML = `<table class="cs-table"><thead><tr>
        <th>ID</th><th>Name</th><th>Model</th><th>Probe</th><th></th>
      </tr></thead><tbody>
        ${cams.map((c) => `<tr>
          <td><code>${esc(c.cameraId)}</code></td>
          <td>${esc(c.name)}</td>
          <td>${esc(c.model || '—')}</td>
          <td>${esc(c.probeStatus || '—')}</td>
          <td><button type="button" class="btn btn-primary" data-open="${esc(c.cameraId)}" data-name="${esc(c.name || c.cameraId)}">Open live</button></td>
        </tr>`).join('')}
      </tbody></table>`;
      tableHost.querySelectorAll('[data-open]').forEach((btn) => {
        btn.onclick = () => {
          const card = document.getElementById('cs-player-card');
          card.hidden = false;
          document.getElementById('cs-player-title').textContent = `Live · ${btn.dataset.name}`;
          document.getElementById('cs-player').src = playerUrl(siteId, btn.dataset.open);
        };
      });
    }
    document.getElementById('cs-refresh-cams').onclick = () => load().catch((e) => {
      tableHost.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
    });
    try { await load(); } catch (e) {
      tableHost.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  async function renderDevices() {
    main.innerHTML = `
      <h1>Devices</h1>
      <p class="cs-lead">On Opta <code>/setup</code>, check <strong>Cloud MQTT (TLS)</strong> and Save to connect to <code>mqtt.peaklogic.io</code>. The device appears here only when its <strong>global site key</strong> matches this organization.</p>
      <div class="cs-card" id="cs-dev-fence"></div>
      <div class="cs-toolbar">
        <button type="button" class="btn" id="cs-refresh-dev">Refresh</button>
        <a class="btn" href="/sites">Manage sites</a>
      </div>
      <p class="cs-msg" id="cs-dev-status" aria-live="polite"></p>
      <div class="cs-card"><div id="cs-dev-table"></div></div>`;

    const host = document.getElementById('cs-dev-table');
    const statusEl = document.getElementById('cs-dev-status');
    let siteOptions = [];

    function fmtRelTime(iso) {
      if (!iso) return '—';
      const ms = Date.now() - Date.parse(iso);
      if (!Number.isFinite(ms)) return '—';
      if (ms < 60_000) return 'just now';
      if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
      if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
      return `${Math.floor(ms / 86_400_000)}d ago`;
    }

    function siteSelectHtml(selectedSiteId, selectId) {
      if (!siteOptions.length) {
        return '<span class="cs-warn-inline">No sites — create one under Sites</span>';
      }
      const opts = siteOptions.map((s) => {
        const sel = s.siteId === selectedSiteId ? ' selected' : '';
        return `<option value="${esc(s.siteId)}"${sel}>${esc(s.name || s.siteId)}</option>`;
      }).join('');
      return `<select id="${esc(selectId)}" aria-label="Assign to site">${opts}</select>`;
    }

    async function assignDevice(btn, payload) {
      btn.disabled = true;
      if (statusEl) statusEl.innerHTML = '';
      try {
        await api.createSiteDevice(payload);
        const siteName = siteOptions.find((s) => s.siteId === payload.siteId)?.name || payload.siteId;
        if (statusEl) {
          statusEl.innerHTML = `<span class="cs-ok">Commissioned — ${esc(payload.deviceId)} assigned to ${esc(siteName)}.</span>`;
        }
        await load();
      } catch (e) {
        if (statusEl) statusEl.innerHTML = `<span class="cs-err">${esc(e.message || 'Assign failed')}</span>`;
        btn.disabled = false;
      }
    }

    function bindAssignButtons(scope) {
      scope.querySelectorAll('[data-assign]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const siteSel = document.getElementById(btn.dataset.siteSelect);
          const siteId = siteSel?.value?.trim() || '';
          if (!siteId) {
            if (statusEl) statusEl.innerHTML = '<span class="cs-err">Choose a site first.</span>';
            return;
          }
          const held = btn.dataset.held || '';
          if (held) {
            const siteName = siteOptions.find((s) => s.siteId === siteId)?.name || siteId;
            if (!window.confirm(`This Opta is assigned to ${held}. Move it to ${siteName}?`)) return;
          }
          assignDevice(btn, {
            deviceId: btn.dataset.assign,
            siteId,
            name: btn.dataset.name || btn.dataset.assign,
            serial: btn.dataset.serial || '',
            iccid: btn.dataset.iccid || '',
            eid: btn.dataset.eid || '',
            gatewayId: btn.dataset.gatewayId || '',
            sim: btn.dataset.iccid || '',
            kind: 'controller',
            commissioning: 'commissioned',
          });
        });
      });
    }

    async function unassignDevice(btn) {
      const deviceId = btn.dataset.unassign || '';
      const siteId = btn.dataset.site || '';
      if (!deviceId) return;
      const siteName = siteOptions.find((s) => s.siteId === siteId)?.name || siteId || 'site';
      if (!window.confirm(`Unassign ${deviceId} from ${siteName}? The Opta returns to the checked-in list.`)) {
        return;
      }
      btn.disabled = true;
      if (statusEl) statusEl.innerHTML = '';
      try {
        await api.unassignSiteDevice(deviceId);
        if (statusEl) {
          statusEl.innerHTML = `<span class="cs-ok">Unassigned — ${esc(deviceId)} removed from ${esc(siteName)}.</span>`;
        }
        await load();
      } catch (e) {
        if (statusEl) statusEl.innerHTML = `<span class="cs-err">${esc(e.message || 'Unassign failed')}</span>`;
        btn.disabled = false;
      }
    }

    function bindUnassignButtons(scope) {
      scope.querySelectorAll('[data-unassign]').forEach((btn) => {
        btn.addEventListener('click', () => unassignDevice(btn));
      });
    }

    async function load() {
      const [checkedIn, sitesData, registered, keyInfo] = await Promise.all([
        api.listCheckedInDevices().catch(() => ({ devices: [] })),
        api.listSites().catch(() => ({ sites: [], tenantId: '' })),
        api.listSiteDevices().catch(() => ({ devices: [] })),
        api.tenantCommissionKey().catch(() => ({})),
      ]);
      const fenceHost = document.getElementById('cs-dev-fence');
      if (fenceHost) {
        const hex = keyInfo.globalSiteKeyHex || checkedIn.fence?.globalSiteKeyHex || '—';
        const digits = keyInfo.globalSiteKeyDigits || checkedIn.fence?.globalSiteKeyDigits || '';
        fenceHost.innerHTML = `
          <p><strong>Organization global site key</strong> <code>${esc(hex)}</code>
            ${digits ? ` · entry <code>${esc(digits)}</code>` : ''}</p>
          <p class="cs-muted">Copy this key onto the Opta at <code>/setup</code>. TLS + Save connects to <code>mqtt.peaklogic.io:8883</code>; the key decides which org sees the device.</p>
          <div class="cs-toolbar">
            <label>Device ID <input id="cs-claim-id" placeholder="mv_…" spellcheck="false"></label>
            <label>Global site key <input id="cs-claim-key" placeholder="${esc(hex)}" spellcheck="false"></label>
            <button type="button" class="btn btn-primary" id="cs-claim-btn">Show / claim device</button>
          </div>`;
        document.getElementById('cs-claim-btn')?.addEventListener('click', async () => {
          const deviceId = document.getElementById('cs-claim-id')?.value?.trim() || '';
          const globalSiteKey = document.getElementById('cs-claim-key')?.value?.trim() || hex;
          if (!deviceId) {
            if (statusEl) statusEl.innerHTML = '<span class="cs-err">Enter the Opta deviceId from /setup.</span>';
            return;
          }
          try {
            await api.claimSiteDevice({ deviceId, globalSiteKey });
            if (statusEl) statusEl.innerHTML = `<span class="cs-ok">Claimed ${esc(deviceId)} — it is now fenced to this organization.</span>`;
            await load();
          } catch (e) {
            if (statusEl) statusEl.innerHTML = `<span class="cs-err">${esc(e.message || 'Claim failed')}</span>`;
          }
        });
      }
      const activeTid = sitesData.tenantId || '';
      siteOptions = (sitesData.sites || []).filter((s) => !activeTid || s.tenantId === activeTid);

      const unassigned = checkedIn.devices || [];
      const assigned = (registered.devices || []).filter((d) => {
        const id = String(d.deviceId || '');
        if (d.kind === 'site_agent' || d.kind === 'camera') return false;
        if (id.startsWith('site-agent:') || id.startsWith('cam:')) return false;
        return true;
      });
      const unassignedIds = new Set(unassigned.map((d) => d.deviceId));
      const rows = [
        ...unassigned.map((d) => ({ ...d, needsAssign: true })),
        ...assigned
          .filter((d) => !unassignedIds.has(d.deviceId))
          .map((d) => ({ ...d, needsAssign: !String(d.siteId || '').trim() })),
      ];

      if (!rows.length) {
        host.innerHTML = '<p class="cs-empty">No Optas match this organization\'s global site key yet. Power the Opta, set the key on /setup, or claim a device ID above.</p>';
        return;
      }

      host.innerHTML = `<table class="cs-table"><thead><tr>
        <th>Device</th><th>Platform</th><th>Key</th><th>Last check-in</th><th>Online</th><th>Site</th><th>Status</th><th></th>
      </tr></thead><tbody>
        ${rows.map((d, idx) => {
          const selectId = `dev-site-${idx}`;
          const siteCell = d.needsAssign
            ? siteSelectHtml(d.siteId || '', selectId)
            : `<code>${esc(d.siteId)}</code>`;
          const staleNote = d.stale ? ' <span class="cs-warn-inline">stale</span>' : '';
          const pendingNote = d.pendingTelemetry ? ' <span class="cs-warn-inline" title="MQTT connected; waiting for first telemetry">awaiting telemetry</span>' : '';
          const held = d.foreignAssignment;
          const heldNote = held
            ? ` <span class="cs-warn-inline" title="Assigned under ${esc(held.assignedTenantName || held.assignedTenantSlug)}">held by ${esc(held.assignedTenantSlug)}${held.assignedSiteId ? ` · ${esc(held.assignedSiteId)}` : ''}</span>`
            : '';
          const statusCell = d.needsAssign
            ? `<span class="cs-warn-inline">${held ? 'held by other org' : 'needs site'}</span>${heldNote}${pendingNote}`
            : (d.stale
              ? '<span class="badge badge-muted">commissioned · stale</span>'
              : '<span class="badge badge-ok">commissioned</span>');
          const actionCell = d.needsAssign
            ? `<button type="button" class="btn btn-primary btn-sm"
                data-assign="${esc(d.deviceId)}"
                data-name="${esc(d.name || d.deviceId)}"
                data-serial="${esc(d.serial || '')}"
                data-iccid="${esc(d.iccid || '')}"
                data-eid="${esc(d.eid || '')}"
                data-gateway-id="${esc(d.gatewayId || '')}"
                data-site-select="${esc(selectId)}"
                data-held="${esc(held ? `${held.assignedTenantSlug} · ${held.assignedSiteId}` : '')}"
                ${siteOptions.length ? '' : ' disabled'}>${held ? 'Move to site' : 'Assign to site'}</button>`
            : `<button type="button" class="btn btn-danger btn-sm"
                data-unassign="${esc(d.deviceId)}"
                data-site="${esc(d.siteId || '')}">Unassign</button>`;
          return `<tr>
            <td><code>${esc(d.deviceId)}</code><br><span class="muted">${esc(d.name || '')}</span></td>
            <td>${esc(d.platform || d.kind || '—')}</td>
            <td><code>${esc(d.globalSiteKeyHex || '—')}</code></td>
            <td>${esc(fmtRelTime(d.lastReportAt))}</td>
            <td>${agentBadge(!!d.online && !d.stale)}${staleNote}</td>
            <td>${siteCell}</td>
            <td>${statusCell}</td>
            <td>${actionCell}</td>
          </tr>`;
        }).join('')}
      </tbody></table>`;
      bindAssignButtons(host);
      bindUnassignButtons(host);
    }

    document.getElementById('cs-refresh-dev').onclick = () => load();
    try { await load(); } catch (e) {
      host.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  async function renderFleet() {
    main.innerHTML = `
      <h1>Assets map</h1>
      <p class="cs-lead">Florida service area with county range rings. Add manual map assets below, or click a site pin to open its HMI. Green = online, grey = offline, red = fault, yellow = warning/stale.</p>
      <div class="cs-toolbar fleet-asset-form">
        <input type="hidden" id="asset-id">
        <label>Name <input id="asset-name" placeholder="Pump 101"></label>
        <label>Site <input id="asset-site" placeholder="site-id"></label>
        <label>Status
          <select id="asset-status">
            <option value="ok">ok</option>
            <option value="warn">warn</option>
            <option value="alarm">alarm</option>
            <option value="offline">offline</option>
          </select>
        </label>
        <label>X% <input id="asset-x" type="number" value="40" min="0" max="100" style="width:4rem"></label>
        <label>Y% <input id="asset-y" type="number" value="40" min="0" max="100" style="width:4rem"></label>
        <button type="button" class="btn btn-primary" id="asset-save">Add asset</button>
        <button type="button" class="btn view-hidden" id="asset-cancel-edit">Cancel</button>
        <button type="button" class="btn" id="asset-refresh">Refresh</button>
        <a class="btn" href="/sites">Sites</a>
      </div>
      <div class="fleet-map-legend">
        <span><i class="fleet-legend-ring"></i> County range</span>
        <span><i style="background:#16a34a"></i> Online</span>
        <span><i style="background:#64748b"></i> Offline</span>
        <span><i style="background:#dc2626"></i> Fault</span>
        <span><i style="background:#eab308"></i> Warning</span>
      </div>
      <div class="cs-fleet-layout">
        <div class="cs-card cs-fleet-map-card" id="fleet-map-wrap">
          <div id="fleet-map" class="fleet-map-layer"></div>
        </div>
        <aside class="cs-card fleet-sidebar" id="fleet-sidebar">
          <div class="fleet-sidebar-head">
            <strong>Assets</strong>
            <span class="cs-muted" id="fleet-sidebar-count"></span>
          </div>
          <input type="search" class="fleet-list-filter" id="fleet-list-filter" placeholder="Filter sites & assets…" autocomplete="off">
          <div class="fleet-list-section">
            <div class="fleet-list-label">Sites</div>
            <ul class="fleet-list" id="fleet-site-list"></ul>
          </div>
          <div class="fleet-list-section">
            <div class="fleet-list-label">Manual assets</div>
            <ul class="fleet-list" id="fleet-asset-list"></ul>
          </div>
          <div class="fleet-list-section">
            <div class="fleet-list-label">Counties <span class="cs-muted" id="fleet-county-count"></span></div>
            <ul class="fleet-list fleet-list-counties" id="fleet-county-list"></ul>
          </div>
        </aside>
      </div>`;
    const map = document.getElementById('fleet-map');
    const siteList = document.getElementById('fleet-site-list');
    const assetList = document.getElementById('fleet-asset-list');
    const countyList = document.getElementById('fleet-county-list');
    const sidebarCount = document.getElementById('fleet-sidebar-count');
    const countyCountEl = document.getElementById('fleet-county-count');
    const listFilter = document.getElementById('fleet-list-filter');
    const assetIdInput = document.getElementById('asset-id');
    const assetNameInput = document.getElementById('asset-name');
    const assetSiteInput = document.getElementById('asset-site');
    const assetStatusInput = document.getElementById('asset-status');
    const assetXInput = document.getElementById('asset-x');
    const assetYInput = document.getElementById('asset-y');
    const assetSaveBtn = document.getElementById('asset-save');
    const assetCancelBtn = document.getElementById('asset-cancel-edit');
    let lastData = { counties: [], sites: [], assets: [] };

    function fleetStatusClass(st) {
      const s = String(st || 'offline').toLowerCase();
      if (s === 'online' || s === 'ok') return 'online';
      if (s === 'fault' || s === 'alarm') return 'fault';
      if (s === 'warning' || s === 'warn') return 'warning';
      return 'offline';
    }

    function countyRingHtml(item, siteCount) {
      const title = esc(item.name || item.slug || '');
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
      const slug = esc(item.slug || '');
      const active = siteCount > 0 ? ' has-sites' : '';
      const countHint = siteCount > 0 ? ` — ${siteCount} site(s)` : '';
      return `<div class="fleet-county-marker${active}" data-kind="county" data-slug="${slug}" style="left:${x}%;top:${y}%" title="${title} County${countHint}">
        <span class="fleet-county-ring fleet-county-ring-3"></span>
        <span class="fleet-county-ring fleet-county-ring-2"></span>
        <span class="fleet-county-ring fleet-county-ring-1"></span>
        <span class="fleet-pin fleet-pin-county"></span>
      </div>`;
    }

    function sitePinHtml(item) {
      const title = esc(item.name || item.siteId || '');
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
      const status = fleetStatusClass(item.status);
      const extra = item.address ? ` — ${esc(item.address)}` : '';
      const href = item.hmiUrl ? esc(item.hmiUrl) : '';
      const click = href ? ` data-hmi-url="${href}" role="link" tabindex="0"` : '';
      const id = esc(item.siteId || '');
      return `<div class="fleet-pin fleet-pin-site status-${status}${href ? ' fleet-pin-link' : ''}" data-kind="site" data-id="${id}" style="left:${x}%;top:${y}%" title="${title}${extra} — click for HMI"${click}></div>`;
    }

    function clearFleetHighlight() {
      map.querySelectorAll('.fleet-highlight').forEach((el) => el.classList.remove('fleet-highlight'));
      siteList.querySelectorAll('.fleet-highlight').forEach((el) => el.classList.remove('fleet-highlight'));
      assetList.querySelectorAll('.fleet-highlight').forEach((el) => el.classList.remove('fleet-highlight'));
      countyList.querySelectorAll('.fleet-highlight').forEach((el) => el.classList.remove('fleet-highlight'));
    }

    function resetAssetForm() {
      assetIdInput.value = '';
      assetNameInput.value = '';
      assetSiteInput.value = '';
      assetStatusInput.value = 'ok';
      assetXInput.value = '40';
      assetYInput.value = '40';
      assetSaveBtn.textContent = 'Add asset';
      assetCancelBtn.classList.add('view-hidden');
    }

    function loadAssetForm(asset) {
      if (!asset) {
        resetAssetForm();
        return;
      }
      assetIdInput.value = asset.assetId || '';
      assetNameInput.value = asset.name || '';
      assetSiteInput.value = asset.siteId || '';
      assetStatusInput.value = String(asset.status || 'ok').toLowerCase();
      assetXInput.value = String(Number.isFinite(Number(asset.x)) ? asset.x : 40);
      assetYInput.value = String(Number.isFinite(Number(asset.y)) ? asset.y : 40);
      assetSaveBtn.textContent = 'Save asset';
      assetCancelBtn.classList.remove('view-hidden');
    }

    function highlightFleetItem(kind, key) {
      clearFleetHighlight();
      if (!key) return;
      const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
      const mapSel = kind === 'county'
        ? `[data-kind="county"][data-slug="${safe}"]`
        : `[data-kind="site"][data-id="${safe}"], [data-kind="asset"][data-id="${safe}"]`;
      map.querySelectorAll(mapSel).forEach((el) => el.classList.add('fleet-highlight'));
      if (kind === 'county') {
        countyList.querySelectorAll(`[data-county-slug="${safe}"]`).forEach((el) => {
          el.classList.add('fleet-highlight');
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        siteList.querySelectorAll(`[data-county-slug="${safe}"]`).forEach((el) => el.classList.add('fleet-highlight'));
      } else if (kind === 'asset') {
        assetList.querySelectorAll(`[data-asset-id="${safe}"]`).forEach((el) => {
          el.classList.add('fleet-highlight');
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      } else {
        siteList.querySelectorAll(`[data-site-id="${safe}"]`).forEach((el) => {
          el.classList.add('fleet-highlight');
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
    }

    function bindFleetPins() {
      map.querySelectorAll('[data-hmi-url]').forEach((el) => {
        const go = () => { window.location.href = el.getAttribute('data-hmi-url'); };
        el.onclick = (e) => {
          e.stopPropagation();
          highlightFleetItem('site', el.getAttribute('data-id'));
          go();
        };
        el.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        };
      });
      map.querySelectorAll('.fleet-county-marker').forEach((el) => {
        el.onclick = () => highlightFleetItem('county', el.getAttribute('data-slug'));
      });
      map.querySelectorAll('.fleet-pin-site:not([data-hmi-url])').forEach((el) => {
        el.onclick = () => {
          const kind = el.getAttribute('data-kind') || 'site';
          const id = el.getAttribute('data-id');
          highlightFleetItem(kind, id);
          if (kind === 'asset') {
            const asset = lastData.assets.find((a) => a.assetId === id);
            if (asset) loadAssetForm(asset);
          }
        };
      });
    }

    function sitesByCounty(sites) {
      const counts = {};
      for (const s of sites) {
        const slug = String(s.county || '').trim().toLowerCase();
        if (slug) counts[slug] = (counts[slug] || 0) + 1;
      }
      return counts;
    }

    function renderSidebar(filterText) {
      const { counties, sites, assets } = lastData;
      const q = String(filterText || '').trim().toLowerCase();
      const countySiteCounts = sitesByCounty(sites);
      const siteRows = sites.map((s) => ({
        name: s.name,
        place: s.address || s.county || s.siteId,
        status: fleetStatusClass(s.status),
        id: s.siteId,
        county: String(s.county || '').trim().toLowerCase(),
        hmiUrl: s.hmiUrl || '',
      })).filter((r) => {
        if (!q) return true;
        return [r.name, r.place, r.id, r.county].some((v) => String(v || '').toLowerCase().includes(q));
      });

      const assetRows = assets.map((a) => ({
        name: a.name,
        place: a.siteId || '—',
        status: fleetStatusClass(a.status),
        id: a.assetId,
      })).filter((r) => {
        if (!q) return true;
        return [r.name, r.place, r.id].some((v) => String(v || '').toLowerCase().includes(q));
      });

      sidebarCount.textContent = `${sites.length} site(s) · ${assets.length} asset(s)`;
      countyCountEl.textContent = `(${counties.length})`;

      siteList.innerHTML = siteRows.length
        ? siteRows.map((r) => {
          const statusCls = r.status === 'fault' ? 'alm' : r.status === 'online' ? 'ok' : r.status === 'warning' ? 'warn' : 'off';
          const statusLabel = r.status === 'fault' ? 'FAULT' : r.status === 'online' ? 'OK' : r.status === 'warning' ? 'WARN' : 'OFF';
          return `<li class="fleet-list-item${r.hmiUrl ? ' fleet-list-link' : ''}" data-site-id="${esc(r.id)}"${r.county ? ` data-county-slug="${esc(r.county)}"` : ''}${r.hmiUrl ? ` data-hmi-url="${esc(r.hmiUrl)}"` : ''}>
            <span class="fleet-list-name">${esc(r.name)}</span>
            <span class="fleet-list-meta">${esc(r.place)}</span>
            <span class="fleet-list-status ${statusCls}">${statusLabel}</span>
          </li>`;
        }).join('')
        : `<li class="fleet-list-empty">${counties.length} counties on map. Add sites under <a href="/sites">Sites</a> with address/county.</li>`;

      assetList.innerHTML = assetRows.length
        ? assetRows.map((r) => {
          const statusCls = r.status === 'fault' ? 'alm' : r.status === 'online' ? 'ok' : r.status === 'warning' ? 'warn' : 'off';
          const statusLabel = r.status === 'fault' ? 'FAULT' : r.status === 'online' ? 'OK' : r.status === 'warning' ? 'WARN' : 'OFF';
          return `<li class="fleet-list-item fleet-list-asset" data-asset-id="${esc(r.id)}">
            <span class="fleet-list-name">${esc(r.name)}</span>
            <span class="fleet-list-meta">${esc(r.place)}</span>
            <span class="fleet-list-status ${statusCls}">${statusLabel}</span>
            <button type="button" class="btn btn-danger fleet-list-del" data-del="${esc(r.id)}" title="Delete asset">Delete</button>
          </li>`;
        }).join('')
        : '<li class="fleet-list-empty">No manual assets — use the form above to add one.</li>';

      const countyRows = counties.map((c) => ({
        name: c.name,
        slug: c.slug,
        siteCount: countySiteCounts[c.slug] || 0,
      })).filter((c) => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.slug.includes(q);
      });

      countyList.innerHTML = countyRows.map((c) => {
        const meta = c.siteCount ? `${c.siteCount} site(s)` : '—';
        return `<li class="fleet-list-item fleet-list-county" data-county-slug="${esc(c.slug)}">
          <span class="fleet-list-name">${esc(c.name)}</span>
          <span class="fleet-list-meta">${meta}</span>
        </li>`;
      }).join('');

      siteList.querySelectorAll('.fleet-list-link').forEach((row) => {
        row.onclick = (e) => {
          if (e.target.closest('a') || e.target.closest('button')) return;
          highlightFleetItem('site', row.getAttribute('data-site-id'));
          window.location.href = row.getAttribute('data-hmi-url');
        };
      });
      siteList.querySelectorAll('.fleet-list-item:not(.fleet-list-link):not(.fleet-list-empty)').forEach((row) => {
        row.onclick = (e) => {
          if (e.target.closest('button')) return;
          highlightFleetItem('site', row.getAttribute('data-site-id'));
        };
      });
      assetList.querySelectorAll('.fleet-list-asset').forEach((row) => {
        row.onclick = (e) => {
          if (e.target.closest('button')) return;
          const id = row.getAttribute('data-asset-id');
          highlightFleetItem('asset', id);
          const asset = lastData.assets.find((a) => a.assetId === id);
          if (asset) loadAssetForm(asset);
        };
      });
      assetList.querySelectorAll('[data-del]').forEach((btn) => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-del');
          if (!id || !window.confirm('Delete this asset?')) return;
          await api.deleteFleetAsset(id);
          if (assetIdInput.value === id) resetAssetForm();
          await load();
        };
      });
      countyList.querySelectorAll('.fleet-list-item').forEach((row) => {
        row.onclick = () => highlightFleetItem('county', row.getAttribute('data-county-slug'));
      });
    }

    async function load() {
      const data = await api.listFleetAssets();
      const counties = data.counties || [];
      const sites = data.sites || [];
      const assets = data.assets || [];
      lastData = { counties, sites, assets };
      const countySiteCounts = sitesByCounty(sites);
      map.innerHTML = [
        ...counties.map((c) => countyRingHtml(c, countySiteCounts[c.slug] || 0)),
        ...sites.map((s) => sitePinHtml(s)),
        ...assets.filter((a) => Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y))).map((a) => {
          const status = fleetStatusClass(a.status);
          return `<div class="fleet-pin fleet-pin-site status-${status}" data-kind="asset" data-id="${esc(a.assetId)}" style="left:${Number(a.x)}%;top:${Number(a.y)}%" title="${esc(a.name)}"></div>`;
        }),
      ].join('');
      bindFleetPins();
      renderSidebar(listFilter.value);
    }

    document.getElementById('asset-refresh').onclick = () => load();
    listFilter.oninput = () => renderSidebar(listFilter.value);
    assetSaveBtn.onclick = async () => {
      const body = {
        name: assetNameInput.value.trim() || 'Asset',
        siteId: assetSiteInput.value.trim(),
        status: assetStatusInput.value,
        x: Number(assetXInput.value),
        y: Number(assetYInput.value),
        kind: 'equipment',
      };
      const editingId = assetIdInput.value.trim();
      if (editingId) body.assetId = editingId;
      await api.createFleetAsset(body);
      resetAssetForm();
      await load();
    };
    assetCancelBtn.onclick = () => {
      resetAssetForm();
      clearFleetHighlight();
    };
    try { await load(); } catch (e) {
      siteList.innerHTML = `<li class="fleet-list-empty cs-err">${esc(e.message)}</li>`;
    }
  }

  async function renderPeople() {
    const urlOrg = new URLSearchParams(location.search).get('org') || '';
    let orgSlug = root.dataset.tenant || '';
    let me = null;
    let tenants = [];
    try {
      me = await api.authMe();
      orgSlug = me.tenant?.tenantSlug || orgSlug;
    } catch { /* ignore */ }
    const isPlatformAdmin = (me?.user?.role || role) === 'platform_admin';
    if (isPlatformAdmin) {
      try {
        const data = await api.listAdminTenants();
        tenants = data.tenants || [];
      } catch { /* ignore */ }
    }
    let accessCatalog = null;
    try {
      accessCatalog = await api.cloudAccessCatalog();
    } catch { /* ignore */ }

    let selectedTenant = me?.tenant || null;
    if (isPlatformAdmin && tenants.length) {
      const pick = urlOrg || orgSlug || tenants[0].tenantSlug;
      selectedTenant = tenants.find((t) => t.tenantSlug === pick || t.tenantId === pick) || tenants[0];
    }

    const orgSelect = isPlatformAdmin && tenants.length
      ? `<label>Organization
          <select id="u-org">
            ${tenants.map((t) => `<option value="${esc(t.tenantId)}" data-slug="${esc(t.tenantSlug)}"${selectedTenant && t.tenantId === selectedTenant.tenantId ? ' selected' : ''}>${esc(t.name)} (${esc(t.tenantSlug)})</option>`).join('')}
          </select>
        </label>`
      : '';

    const displaySlug = selectedTenant?.tenantSlug || orgSlug;
    const isPartnerHomeOrg = !!me?.isPartnerHome || isPartnerOrg(selectedTenant);
    const orgHint = isPlatformAdmin && !tenants.length
      ? '<p class="cs-lead cs-err">No tenants yet. Create one under <a href="/admin/tenants">Admin</a>, then add users here.</p>'
      : displaySlug
        ? `<p class="cs-lead">Users in organization <code>${esc(displaySlug)}</code>${isPlatformAdmin ? ' — platform admin can switch org below.' : ''}${isPartnerHomeOrg ? ' — partner staff (use partner roles only).' : ''}</p>`
        : '<p class="cs-lead cs-err">No organization in session. Sign out and sign in again with Organization ID (e.g. <code>demo</code>).</p>';

    main.innerHTML = `
      <h1>People</h1>
      ${orgHint}
      <h2 class="cs-subhead">Invite user</h2>
      <p class="cs-lead">Sends an email invite. The user sets their own password. Sign-in then requires a email verification code (system admin exempt).</p>
      ${isPartnerHomeOrg ? '<p class="cs-lead cs-warn-inline">Partner org — role must be <strong>Partner admin</strong> (owner) or <strong>Partner technician</strong>.</p>' : ''}
      <div class="cs-toolbar" id="u-add-toolbar">
        ${orgSelect}
        <label>Email <input id="u-email" type="email"></label>
        <label>Name <input id="u-name"></label>
        <label>Role
          <select id="u-role">${roleOptionsHtml(isPartnerHomeOrg)}</select>
        </label>
        <button type="button" class="btn btn-primary" id="u-add"${selectedTenant || (!isPlatformAdmin && orgSlug) ? '' : ' disabled'}>Send invite</button>
      </div>
      <h2 class="cs-subhead">Users</h2>
      <div class="cs-card cs-user-list-card">
        <div class="cs-user-list-toolbar">
          <span id="u-list-meta" class="cs-user-list-meta"></span>
          <div class="cs-user-list-scroll-btns" role="group" aria-label="Scroll user list">
            <button type="button" class="btn btn-sm" id="u-scroll-up" title="Scroll up" aria-label="Scroll up">▲ Up</button>
            <button type="button" class="btn btn-sm" id="u-scroll-down" title="Scroll down" aria-label="Scroll down">▼ Down</button>
          </div>
        </div>
        <div id="u-table" class="cs-user-list-scroll" tabindex="0"></div>
      </div>
      <div id="u-edit-panel" class="cs-edit-panel view-hidden">
        <h2>User profile · <span id="u-edit-email-label"></span></h2>
        <p class="cs-matrix-hint">Role, access, and alarm contact in one place. Save applies all changes.</p>
        <div class="cs-user-form">
          <div class="cs-user-form-grid">
            <label>Name <input id="u-edit-name"></label>
            <label>Mobile <input id="u-edit-mobile" placeholder="SMS number"></label>
            <label>Timezone
              <select id="u-edit-tz">
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label>New password <input id="u-edit-pass" type="password" placeholder="Leave blank to keep"></label>
            <label>Role
              <select id="u-edit-role">${roleOptionsHtml(isPartnerHomeOrg)}</select>
            </label>
            <label class="cs-check cs-check-block"><input type="checkbox" id="u-alarm-enabled"> Alarm contact on</label>
            <label class="cs-check cs-check-block"><input type="checkbox" id="u-alarm-email"> Email alerts</label>
            <label class="cs-check cs-check-block"><input type="checkbox" id="u-alarm-sms"> SMS alerts</label>
            <label>Min alarm level
              <select id="u-alarm-min">
                <option value="all">All</option>
                <option value="inner">Inner+</option>
                <option value="outer">Outer+</option>
                <option value="alarm">Alarm only</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>Alert email <input id="u-alarm-email-addr" type="email" placeholder="Optional override"></label>
            <label>Alert phone <input id="u-alarm-phone" placeholder="Optional override"></label>
          </div>
          <div class="cs-user-form-row">
            <span class="cs-field-label">Contact days</span>
            <label class="cs-check"><input type="checkbox" data-notify-day="0"> Sun</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="1"> Mon</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="2"> Tue</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="3"> Wed</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="4"> Thu</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="5"> Fri</label>
            <label class="cs-check"><input type="checkbox" data-notify-day="6"> Sat</label>
          </div>
          <div class="cs-user-form-hours">
            <div class="cs-hours-block">
              <label class="cs-check"><input type="checkbox" id="u-notify-hours-enabled"> Limit to contact hours</label>
              <label>Contact from <input id="u-notify-start" type="time" value="08:00"></label>
              <label>Contact to <input id="u-notify-end" type="time" value="17:00"></label>
            </div>
            <div class="cs-hours-block">
              <label class="cs-check"><input type="checkbox" id="u-quiet-enabled"> Quiet hours</label>
              <label>Quiet from <input id="u-quiet-start" type="time" value="22:00"></label>
              <label>Quiet to <input id="u-quiet-end" type="time" value="07:00"></label>
            </div>
          </div>
          <div class="cs-user-form-row cs-alarm-scope-mode">
            <span class="cs-field-label">Alarm assignment</span>
            <label class="cs-check cs-check-block"><input type="checkbox" id="u-alarm-scope-all" checked> All sites, devices &amp; assets</label>
          </div>
          <div id="u-alarm-scope-pickers" class="cs-user-form-grid cs-alarm-scope-pickers">
            <label>Sites
              <select id="u-alarm-scope-sites" multiple size="5" disabled title="Hold Ctrl or Cmd to select multiple"></select>
            </label>
            <label>Devices
              <select id="u-alarm-scope-devices" multiple size="5" disabled title="Hold Ctrl or Cmd to select multiple"></select>
            </label>
            <label>Assets
              <select id="u-alarm-scope-assets" multiple size="5" disabled title="Hold Ctrl or Cmd to select multiple"></select>
            </label>
          </div>
          <p class="cs-matrix-hint" id="u-alarm-scope-hint">Checked = all alarms in the org. Uncheck to pick specific sites, devices, and/or assets below.</p>
          <div id="u-edit-matrix-host" class="cs-user-form-access"></div>
          <details class="cs-role-ref" id="u-role-ref-details">
            <summary>Role access reference</summary>
            <div id="u-role-ref-host"></div>
          </details>
          <div class="cs-user-form-actions">
            <button type="button" class="btn btn-primary" id="u-save">Save profile</button>
            <button type="button" class="btn" id="u-cancel">Cancel</button>
          </div>
        </div>
      </div>
      <p class="cs-msg" id="u-status" aria-live="polite"></p>`;
    const host = document.getElementById('u-table');
    const statusEl = document.getElementById('u-status');
    const emailEl = document.getElementById('u-email');
    const nameEl = document.getElementById('u-name');
    const roleEl = document.getElementById('u-role');
    const addBtn = document.getElementById('u-add');
    const editPanel = document.getElementById('u-edit-panel');
    const editEmailLabel = document.getElementById('u-edit-email-label');
    const editNameEl = document.getElementById('u-edit-name');
    const editMobileEl = document.getElementById('u-edit-mobile');
    const editTzEl = document.getElementById('u-edit-tz');
    const editPassEl = document.getElementById('u-edit-pass');
    const editRoleEl = document.getElementById('u-edit-role');
    const saveBtn = document.getElementById('u-save');
    const cancelBtn = document.getElementById('u-cancel');
    const editMatrixHost = document.getElementById('u-edit-matrix-host');
    const editRoleRefHost = document.getElementById('u-role-ref-host');
    // Prefer live session from /auth/me; dataset role is fallback only.
    let sessionRole = me?.user?.role || role || '';
    let sessionFeatures = me?.user?.features || null;
    let canEditRoles = true;
    let canEditAccessMatrix = isPlatformAdmin || sessionRole === 'tenant_admin';
    let editingUserId = null;
    let currentUsers = [];
    let editingFeatures = null;
    let userSort = { key: 'email', dir: 'asc' };
    let scopeCatalog = { sites: [], devices: [], assets: [] };

    function syncScopeModeUi() {
      const allMode = !!document.getElementById('u-alarm-scope-all')?.checked;
      ['u-alarm-scope-sites', 'u-alarm-scope-devices', 'u-alarm-scope-assets'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = allMode;
      });
      const hint = document.getElementById('u-alarm-scope-hint');
      if (hint) {
        hint.innerHTML = allMode
          ? 'This contact receives <strong>all</strong> alarms in the organization (subject to min level and schedule). Uncheck to limit by site, device, or asset.'
          : 'Pick <strong>sites</strong>, <strong>devices</strong>, and/or <strong>assets</strong> below (Ctrl/Cmd+click). Notified when an alarm matches <em>any</em> selection.';
      }
    }

    function populateScopeSelects(catalog) {
      const sitesEl = document.getElementById('u-alarm-scope-sites');
      const devicesEl = document.getElementById('u-alarm-scope-devices');
      const assetsEl = document.getElementById('u-alarm-scope-assets');
      if (!sitesEl || !devicesEl || !assetsEl) return;
      const sites = catalog?.sites || [];
      const devices = catalog?.devices || [];
      const assets = catalog?.assets || [];
      sitesEl.innerHTML = sites.length
        ? sites.map((s) => `<option value="${esc(s.siteId)}">${esc(s.name || s.siteId)}</option>`).join('')
        : '<option disabled value="">(no sites — create under Sites)</option>';
      devicesEl.innerHTML = devices.length
        ? devices.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.name || d.deviceId)}${d.siteId ? ` · ${esc(d.siteId)}` : ''}</option>`).join('')
        : '<option disabled value="">(no devices — assign under Devices)</option>';
      assetsEl.innerHTML = assets.length
        ? assets.map((a) => `<option value="${esc(a.assetId)}">${esc(a.name || a.assetId)}${a.siteId ? ` · ${esc(a.siteId)}` : ''}</option>`).join('')
        : '<option disabled value="">(no assets — add on Fleet map)</option>';
      syncScopeModeUi();
    }

    function setMultiSelectValues(el, values) {
      if (!el) return;
      const set = new Set((values || []).map(String));
      [...el.options].forEach((opt) => {
        opt.selected = set.has(opt.value);
      });
    }

    function readMultiSelectValues(el) {
      if (!el) return [];
      return [...el.selectedOptions].map((o) => o.value).filter(Boolean);
    }

    async function loadScopeCatalog(tenantId) {
      const data = await api.notificationScopeCatalog(tenantId);
      scopeCatalog = {
        sites: data.sites || [],
        devices: data.devices || [],
        assets: data.assets || [],
      };
      populateScopeSelects(scopeCatalog);
    }

    function fillScopeFields(scope) {
      const s = scope || {};
      const allEl = document.getElementById('u-alarm-scope-all');
      if (allEl) allEl.checked = s.mode !== 'scoped';
      setMultiSelectValues(document.getElementById('u-alarm-scope-sites'), s.siteIds);
      setMultiSelectValues(document.getElementById('u-alarm-scope-devices'), s.deviceIds);
      setMultiSelectValues(document.getElementById('u-alarm-scope-assets'), s.assetIds);
      syncScopeModeUi();
    }

    function readScopeFields() {
      const allMode = !!document.getElementById('u-alarm-scope-all')?.checked;
      if (allMode) {
        return { mode: 'all', siteIds: [], deviceIds: [], assetIds: [] };
      }
      return {
        mode: 'scoped',
        siteIds: readMultiSelectValues(document.getElementById('u-alarm-scope-sites')),
        deviceIds: readMultiSelectValues(document.getElementById('u-alarm-scope-devices')),
        assetIds: readMultiSelectValues(document.getElementById('u-alarm-scope-assets')),
      };
    }

    document.getElementById('u-alarm-scope-all')?.addEventListener('change', syncScopeModeUi);
    syncScopeModeUi();

    function refreshRolePermissions() {
      const liveRole = String(me?.user?.role || sessionRole || role || '').trim();
      sessionRole = liveRole || sessionRole;
      canEditRoles = isPlatformAdmin
        || liveRole === 'platform_admin'
        || liveRole === 'tenant_admin'
        || liveRole === 'supervisor'
        || !!(sessionFeatures && sessionFeatures.people);
      canEditAccessMatrix = isPlatformAdmin
        || liveRole === 'platform_admin'
        || liveRole === 'tenant_admin';
      if (editRoleEl) {
        // System / tenant admins must always be able to change roles
        editRoleEl.disabled = false;
        editRoleEl.removeAttribute('disabled');
        if (!canEditRoles) {
          editRoleEl.disabled = true;
        }
        const adminOpt = editRoleEl.querySelector('option[value="tenant_admin"]');
        if (adminOpt) {
          adminOpt.disabled = !canEditAccessMatrix;
          if (!canEditAccessMatrix) adminOpt.title = 'Tenant admin only';
          else adminOpt.removeAttribute('title');
        }
      }
    }
    refreshRolePermissions();
    const scrollUpBtn = document.getElementById('u-scroll-up');
    const scrollDownBtn = document.getElementById('u-scroll-down');
    const listMetaEl = document.getElementById('u-list-meta');

    const USER_SORT_COLS = [
      { key: 'email', label: 'Email' },
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'org', label: 'Org' },
    ];

    function userSortValue(user, key) {
      if (key === 'role') return roleLabel(user.role).toLowerCase();
      if (key === 'org') return String(user.tenantSlug || user.tenantId || '').toLowerCase();
      if (key === 'status') return user.invitePending ? 'invite pending' : 'active';
      return String(user[key] || '').toLowerCase();
    }

    function sortedUsers(users) {
      const list = [...users];
      const { key, dir } = userSort;
      const mul = dir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        const va = userSortValue(a, key);
        const vb = userSortValue(b, key);
        if (va < vb) return -1 * mul;
        if (va > vb) return 1 * mul;
        return 0;
      });
      return list;
    }

    function userSortHeaderHtml(col) {
      const active = userSort.key === col.key;
      const arrow = active ? (userSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<button type="button" class="th-sort${active ? ' active' : ''}" data-user-sort="${esc(col.key)}" title="Sort by ${esc(col.label)}">${esc(col.label)}${arrow}</button>`;
    }

    function bindUserSortHeaders() {
      host.querySelectorAll('[data-user-sort]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const key = btn.getAttribute('data-user-sort');
          if (userSort.key === key) userSort.dir = userSort.dir === 'asc' ? 'desc' : 'asc';
          else {
            userSort.key = key;
            userSort.dir = 'asc';
          }
          renderUserTable();
        });
      });
    }

    function updateListMeta(count) {
      if (!listMetaEl) return;
      const n = count ?? currentUsers.length;
      listMetaEl.textContent = n === 1 ? '1 user' : `${n} users`;
    }

    function updateScrollControls() {
      if (!host || !scrollUpBtn || !scrollDownBtn) return;
      const canScroll = host.scrollHeight > host.clientHeight + 2;
      scrollUpBtn.disabled = !canScroll || host.scrollTop <= 1;
      scrollDownBtn.disabled = !canScroll || host.scrollTop + host.clientHeight >= host.scrollHeight - 2;
    }

    function scrollUserList(delta) {
      host?.scrollBy({ top: delta, behavior: 'smooth' });
    }

    scrollUpBtn?.addEventListener('click', () => scrollUserList(-160));
    scrollDownBtn?.addEventListener('click', () => scrollUserList(160));
    host?.addEventListener('scroll', updateScrollControls);
    host?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); scrollUserList(-80); }
      if (e.key === 'ArrowDown') { e.preventDefault(); scrollUserList(80); }
      if (e.key === 'PageUp') { e.preventDefault(); scrollUserList(-host.clientHeight * 0.85); }
      if (e.key === 'PageDown') { e.preventDefault(); scrollUserList(host.clientHeight * 0.85); }
    });

    function capMark(on) {
      return on
        ? '<span class="cap-yes" aria-label="yes">✓</span>'
        : '<span class="cap-no" aria-label="no">—</span>';
    }

    function featuresFromRole(roleKey) {
      if (!accessCatalog?.roleDefaults?.[roleKey]) return {};
      return { ...accessCatalog.roleDefaults[roleKey] };
    }

    function renderRoleReferenceMatrix() {
      if (!accessCatalog) return '';
      const { catalog, roleDefaults, roles } = accessCatalog;
      const head = roles.map((r) => `<th>${esc(r.label)}</th>`).join('');
      const rows = catalog.map((cap) => {
        const cells = roles.map((r) => {
          const on = !!(roleDefaults[r.key] && roleDefaults[r.key][cap.key]);
          return `<td>${capMark(on)}</td>`;
        }).join('');
        return `<tr class="role-ref"><td>${esc(cap.label)}</td>${cells}</tr>`;
      }).join('');
      return `<p class="cs-matrix-hint">Default capabilities per role (reference only).</p>
        <div class="cs-access-matrix-wrap"><table class="cs-access-matrix"><thead><tr><th>Capability</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function renderUserAccessMatrix(userFeatures, roleKey, locked) {
      if (!accessCatalog) {
        return '<p class="cs-matrix-hint">Access catalog unavailable — refresh the page.</p>';
      }
      const { catalog } = accessCatalog;
      const rows = catalog.map((cap) => {
        const checked = !!userFeatures[cap.key];
        const disabled = locked ? ' disabled' : '';
        return `<tr><td>${esc(cap.label)}</td><td><input type="checkbox" data-cap-key="${esc(cap.key)}"${checked ? ' checked' : ''}${disabled} aria-label="${esc(cap.label)}"></td></tr>`;
      }).join('');
      return `<div class="cs-user-form-access-head">
          <span class="cs-field-label">Studio access</span>
          <span class="cs-matrix-hint">${locked ? 'Tenant admin has full access to all areas.' : `Based on ${roleLabel(roleKey)} — toggle or change role for defaults.`}</span>
        </div>
        <div class="cs-access-matrix-wrap"><table class="cs-access-matrix"><thead><tr><th>Capability</th><th>Allowed</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function refreshEditMatrix(userFeatures, roleKey) {
      if (!editMatrixHost) return;
      const locked = roleKey === 'tenant_admin';
      editingFeatures = { ...userFeatures };
      editMatrixHost.innerHTML = renderUserAccessMatrix(editingFeatures, roleKey, locked);
    }

    function collectEditFeatures() {
      const out = { ...(editingFeatures || {}) };
      editMatrixHost?.querySelectorAll('[data-cap-key]').forEach((cb) => {
        out[cb.getAttribute('data-cap-key')] = cb.checked;
      });
      return out;
    }

    function currentTenantId() {
      if (isPlatformAdmin) {
        const sel = document.getElementById('u-org');
        return sel?.value || selectedTenant?.tenantId || null;
      }
      return selectedTenant?.tenantId || me?.tenant?.tenantId || null;
    }

    function tenantRecordForId(tid) {
      if (!tid) return selectedTenant;
      if (selectedTenant && selectedTenant.tenantId === tid) return selectedTenant;
      return tenants.find((t) => t.tenantId === tid) || selectedTenant;
    }

    function applyRoleOptionsForTenant(t) {
      const partner = !!me?.isPartnerHome || isPartnerOrg(t);
      const html = roleOptionsHtml(partner);
      if (roleEl) {
        roleEl.innerHTML = html;
        roleEl.value = defaultRoleForOrg(t, me);
      }
      if (editRoleEl) editRoleEl.innerHTML = html;
    }

    function closeEditPanel() {
      editingUserId = null;
      editPanel.classList.add('view-hidden');
      host.querySelectorAll('.cs-row-editing').forEach((row) => row.classList.remove('cs-row-editing'));
    }

    function fillAlarmContact(user) {
      const p = user?.profile || {};
      const n = p.alarmNotifications || {};
      const nh = n.notifyHours || {};
      const qh = n.quietHours || {};
      const days = Array.isArray(n.notifyDays) ? n.notifyDays.map(Number) : [0, 1, 2, 3, 4, 5, 6];
      if (editMobileEl) editMobileEl.value = p.mobile || p.phone || '';
      if (editTzEl) editTzEl.value = p.timezone || 'America/New_York';
      const setChk = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      setChk('u-alarm-enabled', n.enabled !== false);
      setChk('u-alarm-email', n.email !== false);
      setChk('u-alarm-sms', !!n.sms);
      setVal('u-alarm-min', n.minLevel || 'inner');
      setVal('u-alarm-email-addr', n.emailAddress || '');
      setVal('u-alarm-phone', n.phone || '');
      editPanel.querySelectorAll('[data-notify-day]').forEach((cb) => {
        cb.checked = days.includes(Number(cb.getAttribute('data-notify-day')));
      });
      setChk('u-notify-hours-enabled', !!nh.enabled);
      setVal('u-notify-start', (nh.start || '08:00').slice(0, 5));
      setVal('u-notify-end', (nh.end || '17:00').slice(0, 5));
      setChk('u-quiet-enabled', !!qh.enabled);
      setVal('u-quiet-start', (qh.start || '22:00').slice(0, 5));
      setVal('u-quiet-end', (qh.end || '07:00').slice(0, 5));
    }

    function readAlarmContactProfile(displayName) {
      const days = [...editPanel.querySelectorAll('[data-notify-day]:checked')]
        .map((cb) => Number(cb.getAttribute('data-notify-day')))
        .filter((d) => d >= 0 && d <= 6);
      return {
        displayName,
        mobile: editMobileEl?.value.trim() || '',
        phone: editMobileEl?.value.trim() || '',
        timezone: editTzEl?.value || 'America/New_York',
        alarmNotifications: {
          enabled: !!document.getElementById('u-alarm-enabled')?.checked,
          email: !!document.getElementById('u-alarm-email')?.checked,
          sms: !!document.getElementById('u-alarm-sms')?.checked,
          minLevel: document.getElementById('u-alarm-min')?.value || 'inner',
          emailAddress: document.getElementById('u-alarm-email-addr')?.value.trim() || '',
          phone: document.getElementById('u-alarm-phone')?.value.trim() || '',
          notifyDays: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
          notifyHours: {
            enabled: !!document.getElementById('u-notify-hours-enabled')?.checked,
            start: (document.getElementById('u-notify-start')?.value || '08:00').slice(0, 5),
            end: (document.getElementById('u-notify-end')?.value || '17:00').slice(0, 5),
          },
          quietHours: {
            enabled: !!document.getElementById('u-quiet-enabled')?.checked,
            start: (document.getElementById('u-quiet-start')?.value || '22:00').slice(0, 5),
            end: (document.getElementById('u-quiet-end')?.value || '07:00').slice(0, 5),
            timezone: editTzEl?.value || 'America/New_York',
          },
          notificationScope: readScopeFields(),
        },
      };
    }

    async function startEdit(user) {
      if (!user?.userId) return;
      editingUserId = user.userId;
      editEmailLabel.textContent = user.email || '';
      editNameEl.value = user.name || user.profile?.displayName || '';
      editPassEl.value = '';
      editRoleEl.value = user.role || 'operator';
      fillAlarmContact(user);
      try {
        await loadScopeCatalog(user.tenantId || currentTenantId());
        fillScopeFields(user.profile?.alarmNotifications?.notificationScope);
      } catch {
        populateScopeSelects(scopeCatalog);
        fillScopeFields(user.profile?.alarmNotifications?.notificationScope);
      }
      const refDetails = document.getElementById('u-role-ref-details');
      refreshRolePermissions();
      if (editRoleRefHost) editRoleRefHost.innerHTML = canEditRoles ? renderRoleReferenceMatrix() : '';
      if (refDetails) refDetails.classList.toggle('view-hidden', !canEditRoles);
      if (canEditAccessMatrix) {
        refreshEditMatrix(user.features || featuresFromRole(user.role), user.role || 'operator');
      } else if (editMatrixHost) {
        editMatrixHost.innerHTML = canEditRoles
          ? '<p class="cs-matrix-hint">Role can be changed. Studio access matrix: tenant admin only.</p>'
          : '<p class="cs-matrix-hint">Alarm contact schedule can be saved. Role/access: admin or supervisor.</p>';
      }
      editPanel.classList.remove('view-hidden');
      statusEl.textContent = `Editing ${user.email}`;
      host.querySelectorAll('.cs-row-editing').forEach((row) => row.classList.remove('cs-row-editing'));
      const row = host.querySelector(`tr[data-user-id="${String(user.userId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
      if (row) row.classList.add('cs-row-editing');
      editPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      editNameEl.focus();
    }

    editRoleEl.addEventListener('change', () => {
      refreshEditMatrix(featuresFromRole(editRoleEl.value), editRoleEl.value);
    });

    async function updateUser(userId, payload) {
      if (isPlatformAdmin) await api.updateAdminUser(userId, payload);
      else await api.updateTenantUser(userId, payload);
    }

    async function removeUser(userId) {
      if (isPlatformAdmin) await api.deleteAdminUser(userId);
      else await api.deleteTenantUser(userId);
    }

    function renderUserTable() {
      const users = sortedUsers(currentUsers);
      if (!users.length) {
        host.innerHTML = '<p class="cs-empty">No users in this organization yet.</p>';
        updateListMeta(0);
        updateScrollControls();
        return;
      }
      const myId = me?.user?.userId || '';
      const head = USER_SORT_COLS.map((col) => `<th>${userSortHeaderHtml(col)}</th>`).join('');
      host.innerHTML = `<table class="cs-table"><thead><tr>
        ${head}<th></th>
      </tr></thead><tbody>
        ${users.map((u) => `<tr data-user-id="${esc(u.userId)}"${editingUserId === u.userId ? ' class="cs-row-editing"' : ''}>
          <td>${esc(u.email)}</td>
          <td>${esc(u.name)}</td>
          <td>${roleLabel(u.role)}</td>
          <td>${u.invitePending ? '<span class="cs-warn">Invite pending</span>' : 'Active'}</td>
          <td><code>${esc(u.tenantSlug || u.tenantId || '—')}</code></td>
          <td class="cs-actions">
            <button type="button" class="btn" data-edit-id="${esc(u.userId)}">Edit</button>
            ${u.invitePending ? `<button type="button" class="btn" data-resend-id="${esc(u.userId)}" data-email="${esc(u.email)}">Resend invite</button>` : ''}
            ${myId === u.userId ? '' : `<button type="button" class="btn btn-danger" data-del-id="${esc(u.userId)}" data-email="${esc(u.email)}">Delete</button>`}
          </td>
        </tr>`).join('')}
      </tbody></table>`;
      updateListMeta(users.length);
      bindUserSortHeaders();
      host.querySelectorAll('[data-edit-id]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-edit-id');
          const user = currentUsers.find((u) => u.userId === id);
          startEdit(user);
        });
      });
      host.querySelectorAll('[data-resend-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-resend-id');
          const email = btn.getAttribute('data-email') || id;
          statusEl.innerHTML = '';
          try {
            if (isPlatformAdmin) await api.resendAdminInvite(id);
            else await api.resendTenantInvite(id);
            statusEl.textContent = `Invite resent to ${email}.`;
            await load();
          } catch (err) {
            statusEl.innerHTML = `<span class="cs-err">${esc(err.message)}</span>`;
          }
        });
      });
      host.querySelectorAll('[data-del-id]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-del-id');
          const email = btn.getAttribute('data-email') || id;
          if (!confirm(`Delete user ${email}?`)) return;
          statusEl.innerHTML = '';
          try {
            await removeUser(id);
            if (editingUserId === id) closeEditPanel();
            statusEl.textContent = 'User deleted.';
            await load();
          } catch (err) {
            statusEl.innerHTML = `<span class="cs-err">${esc(err.message)}</span>`;
          }
        });
      });
      requestAnimationFrame(updateScrollControls);
    }

    async function load() {
      try {
        me = await api.authMe();
        sessionRole = me?.user?.role || sessionRole || '';
        sessionFeatures = me?.user?.features || sessionFeatures;
        refreshRolePermissions();
      } catch { /* keep prior session */ }
      const tid = currentTenantId();
      if (isPlatformAdmin && !tid) {
        host.innerHTML = '<p class="cs-empty">Select an organization.</p>';
        updateListMeta(0);
        updateScrollControls();
        return;
      }
      const data = isPlatformAdmin
        ? await api.listAdminUsers(tid)
        : await api.listTenantUsers();
      const users = (data.users || []).filter((u) => u.role !== 'platform_admin');
      currentUsers = users;
      if (!users.length) {
        closeEditPanel();
      }
      renderUserTable();
      try {
        await loadScopeCatalog(tid);
      } catch {
        populateScopeSelects(scopeCatalog);
      }
    }

    document.getElementById('u-org')?.addEventListener('change', () => {
      closeEditPanel();
      statusEl.textContent = '';
      applyRoleOptionsForTenant(tenantRecordForId(currentTenantId()));
      load().catch((e) => {
        host.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
      });
    });

    cancelBtn.addEventListener('click', () => {
      closeEditPanel();
      statusEl.textContent = '';
    });

    saveBtn.addEventListener('click', async () => {
      if (!editingUserId) return;
      statusEl.innerHTML = '';
      const name = editNameEl.value.trim();
      const payload = {
        name,
        profile: readAlarmContactProfile(name),
      };
      // Always send role for platform/tenant admins; never drop it on save
      if (canEditRoles || isPlatformAdmin) {
        payload.role = editRoleEl?.value || payload.role;
      }
      if (canEditAccessMatrix || isPlatformAdmin) {
        payload.features = collectEditFeatures();
      }
      const newPass = editPassEl.value;
      if (newPass) payload.password = newPass;
      try {
        await updateUser(editingUserId, payload);
        closeEditPanel();
        statusEl.textContent = 'User profile and alarm contact saved.';
        await load();
      } catch (e) {
        statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
      }
    });

    addBtn.addEventListener('click', async () => {
      statusEl.innerHTML = '';
      const tid = currentTenantId();
      if (!tid) {
        statusEl.innerHTML = '<span class="cs-err">Select an organization first.</span>';
        return;
      }
      const payload = {
        email: emailEl.value.trim(),
        name: nameEl.value.trim(),
        role: roleEl.value,
        invite: true,
      };
      if (!payload.email) {
        statusEl.innerHTML = '<span class="cs-err">Email is required.</span>';
        return;
      }
      try {
        if (isPlatformAdmin) {
          await api.createAdminUser({ ...payload, tenantId: tid });
        } else {
          await api.createTenantUser(payload);
        }
        emailEl.value = '';
        nameEl.value = '';
        applyRoleOptionsForTenant(tenantRecordForId(tid));
        statusEl.textContent = 'Invite email sent.';
        await load();
      } catch (e) {
        statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
      }
    });
    try {
      await load();
      applyRoleOptionsForTenant(selectedTenant);
    } catch (e) {
      host.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  async function renderPartner() {
    main.innerHTML = `
      <h1>Customer accounts</h1>
      <p class="cs-lead">Linked customer organizations and billing summary. Switch org in the header to manage a customer's sites and equipment. MQTT traffic for your orgs is on <a href="/admin/mqtt">MQTT console</a>.</p>
      <div class="cs-card" id="partner-summary"></div>
      <div class="cs-card"><div id="partner-table"></div></div>
      <p class="cs-msg" id="partner-status"></p>`;
    const summaryHost = document.getElementById('partner-summary');
    const tableHost = document.getElementById('partner-table');
    const statusEl = document.getElementById('partner-status');
    try {
      const data = await api.partnerBilling();
      const partner = data.partner || {};
      summaryHost.innerHTML = `
        <p><strong>${esc(partner.name || partner.tenantSlug || 'Partner')}</strong> · <code>${esc(partner.tenantSlug || '')}</code></p>
        <p class="cs-lead">${Number(data.customerCount) || 0} linked customer(s) · ${Number(data.totalSites) || 0} total site(s)</p>`;
      const rows = data.customers || [];
      if (!rows.length) {
        tableHost.innerHTML = '<p class="cs-empty">No linked customers yet. Platform admin links customers under Admin → Tenants.</p>';
        return;
      }
      tableHost.innerHTML = `<table class="cs-table"><thead><tr>
        <th>Customer</th><th>Code</th><th>Site key</th><th>Sites</th><th>Online</th><th>CMMS</th><th></th>
      </tr></thead><tbody>
        ${rows.map((c) => `<tr>
          <td>${esc(c.name)}</td>
          <td><code>${esc(c.tenantSlug)}</code></td>
          <td>${siteKeyCell(c)}</td>
          <td>${Number(c.siteCount) || 0}</td>
          <td>${Number(c.sitesOnline) || 0}</td>
          <td>${c.cmmsEnabled ? statusBadge('ok') : statusBadge('offline')}</td>
          <td><button type="button" class="btn btn-primary" data-open="${esc(c.tenantId)}">Open</button></td>
        </tr>`).join('')}
      </tbody></table>`;
      tableHost.querySelectorAll('[data-open]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api.switchPartnerTenant({ tenantId: btn.dataset.open });
            location.href = '/sites';
          } catch (e) {
            statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
          }
        };
      });
      statusEl.textContent = `${rows.length} customer account(s)`;
    } catch (e) {
      main.innerHTML = `<h1>Customer accounts</h1><p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  async function renderAdmin() {
    try {
      const me = await api.authMe();
      if (me?.user?.role !== 'platform_admin') {
        main.innerHTML = `<h1>Platform admin</h1><p class="cs-err">Platform admin required. Sign in as system admin to manage organizations.</p>`;
        return;
      }
    } catch (e) {
      main.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
      return;
    }
    main.innerHTML = `
      <h1>Platform admin · Organizations</h1>
      <p class="cs-lead">Create orgs, link customer tenants to partner vendors, and edit existing organizations.</p>
      <div id="t-admin-hints"></div>
      <p class="cs-msg" id="t-status" aria-live="polite"></p>

      <div class="cs-card cs-admin-section">
        <h2>Create organization</h2>
        <div class="cs-toolbar">
          <label>Org code <input id="t-org-id" placeholder="circlek-002"></label>
          <label>Name <input id="t-name" placeholder="Circle K #1234"></label>
          <label>Type
            <select id="t-type">
              <option value="customer">Customer</option>
              <option value="partner">Partner / vendor</option>
            </select>
          </label>
          <button type="button" class="btn btn-primary" id="t-add">Create</button>
        </div>
      </div>

      <div class="cs-card cs-admin-section">
        <h2>Link customer to partner</h2>
        <p class="cs-muted">Choose a partner vendor, then pick a customer org to link.</p>
        <div class="cs-toolbar">
          <label>Partner / vendor
            <select id="link-partner"><option value="">— select partner —</option></select>
          </label>
          <label>Customer
            <select id="link-customer"><option value="">— select customer —</option></select>
          </label>
          <button type="button" class="btn btn-primary" id="link-save">Link customer</button>
          <button type="button" class="btn" id="link-unlink">Unlink</button>
        </div>
        <div id="link-linked-list" class="cs-linked-list"></div>
      </div>

      <div class="cs-card cs-admin-section" id="edit-org-section">
        <h2>Edit organization</h2>
        <p class="cs-muted">Rename or change type. To <strong>invite partner staff</strong>, use <strong>Invite users</strong> on the org row (not Edit).</p>
        <div class="cs-toolbar">
          <label>Organization
            <select id="edit-tenant"><option value="">— select org —</option></select>
          </label>
          <label>Name <input id="edit-name" placeholder="Display name"></label>
          <label>Type
            <select id="edit-type">
              <option value="customer">Customer</option>
              <option value="partner">Partner / vendor</option>
            </select>
          </label>
          <label id="edit-partner-wrap">Linked partner
            <select id="edit-partner"><option value="">— not linked —</option></select>
          </label>
        </div>
        <div class="cs-toolbar">
          <button type="button" class="btn btn-primary" id="edit-save">Save changes</button>
          <button type="button" class="btn cs-btn-danger" id="edit-delete">Delete organization</button>
          <button type="button" class="btn" id="t-refresh">Refresh</button>
        </div>
      </div>

      <div class="cs-card cs-admin-section">
        <h2>All organizations</h2>
        <div id="t-table"></div>
      </div>`;

    const host = document.getElementById('t-table');
    const statusEl = document.getElementById('t-status');
    const hintsEl = document.getElementById('t-admin-hints');
    const typeEl = document.getElementById('t-type');
    const linkPartnerSel = document.getElementById('link-partner');
    const linkCustomerSel = document.getElementById('link-customer');
    const linkLinkedList = document.getElementById('link-linked-list');
    const editTenantSel = document.getElementById('edit-tenant');
    const editNameEl = document.getElementById('edit-name');
    const editTypeEl = document.getElementById('edit-type');
    const editPartnerWrap = document.getElementById('edit-partner-wrap');
    const editPartnerSel = document.getElementById('edit-partner');

    let tenantsCache = [];
    let partnersCache = [];
    let customersCache = [];

    function isPartner(t) {
      return t.isPartner || t.tenantType === 'partner';
    }

    function showAck(message, ok = true) {
      statusEl.innerHTML = ok
        ? `<span class="cs-save-ack">✓ ${esc(message)}</span>`
        : `<span class="cs-err">${esc(message)}</span>`;
    }

    function tenantById(id) {
      return tenantsCache.find((t) => t.tenantId === id);
    }

    function fillSelect(sel, items, { valueKey = 'tenantId', labelFn, placeholder, currentValue } = {}) {
      if (!sel) return;
      const opts = items.map((item) => {
        const val = item[valueKey];
        const label = labelFn(item);
        const selected = currentValue && val === currentValue ? ' selected' : '';
        return `<option value="${esc(val)}"${selected}>${label}</option>`;
      });
      sel.innerHTML = placeholder
        ? `<option value="">${esc(placeholder)}</option>${opts.join('')}`
        : opts.join('');
      sel.disabled = !items.length;
    }

    function syncEditPartnerField() {
      if (!editPartnerWrap || !editTypeEl) return;
      editPartnerWrap.classList.toggle('view-hidden', editTypeEl.value === 'partner');
    }

    function populateEditForm(tenantId) {
      const t = tenantById(tenantId);
      if (!t) {
        editNameEl.value = '';
        editTypeEl.value = 'customer';
        fillSelect(editPartnerSel, partnersCache, {
          placeholder: '— not linked —',
          labelFn: (p) => `${esc(p.name)} (${esc(p.tenantSlug)})`,
        });
        syncEditPartnerField();
        return;
      }
      editNameEl.value = t.name || '';
      editTypeEl.value = isPartner(t) ? 'partner' : 'customer';
      fillSelect(editPartnerSel, partnersCache, {
        placeholder: '— not linked —',
        currentValue: t.partnerId || '',
        labelFn: (p) => `${esc(p.name)} (${esc(p.tenantSlug)})`,
      });
      syncEditPartnerField();
    }

    function renderLinkedCustomers(partnerId) {
      if (!linkLinkedList) return;
      if (!partnerId) {
        linkLinkedList.innerHTML = '';
        return;
      }
      const linked = customersCache.filter((c) => c.partnerId === partnerId);
      const partner = tenantById(partnerId);
      if (!linked.length) {
        linkLinkedList.innerHTML = `<p class="cs-muted">No customers linked to <code>${esc(partner?.tenantSlug || '')}</code> yet.</p>`;
        return;
      }
      linkLinkedList.innerHTML = `<p class="cs-muted"><strong>Linked to ${esc(partner?.name || '')}:</strong> ${linked.map((c) => `<code>${esc(c.tenantSlug)}</code>`).join(', ')}</p>`;
    }

    function syncLinkCustomerDropdown(partnerId) {
      const available = partnerId
        ? customersCache.filter((c) => !c.partnerId || c.partnerId === partnerId)
        : customersCache.filter((c) => !c.partnerId);
      fillSelect(linkCustomerSel, available, {
        placeholder: partnerId ? '— select customer —' : '— select partner first —',
        labelFn: (c) => `${esc(c.name)} (${esc(c.tenantSlug)})`,
      });
      renderLinkedCustomers(partnerId);
    }

    async function loadPartners() {
      try {
        const data = await api.listAdminPartners();
        return data.partners || [];
      } catch {
        const data = await api.listAdminTenants();
        return (data.tenants || []).filter(isPartner);
      }
    }

    async function loadCustomers() {
      try {
        const data = await api.listAdminCustomers();
        return data.customers || [];
      } catch {
        const data = await api.listAdminTenants();
        return (data.tenants || []).filter((t) => !isPartner(t));
      }
    }

    async function load() {
      const data = await api.listAdminTenants();
      tenantsCache = data.tenants || [];
      partnersCache = await loadPartners();
      customersCache = await loadCustomers();

      fillSelect(linkPartnerSel, partnersCache, {
        placeholder: '— select partner —',
        labelFn: (p) => `${esc(p.name)} (${esc(p.tenantSlug)})`,
      });
      fillSelect(editTenantSel, tenantsCache, {
        placeholder: '— select org —',
        labelFn: (t) => `${esc(t.name)} (${esc(t.tenantSlug)})${isPartner(t) ? ' · partner' : ''}`,
        currentValue: editTenantSel?.value || '',
      });
      fillSelect(editPartnerSel, partnersCache, {
        placeholder: '— not linked —',
        labelFn: (p) => `${esc(p.name)} (${esc(p.tenantSlug)})`,
      });

      const partnerId = linkPartnerSel?.value || '';
      syncLinkCustomerDropdown(partnerId);
      if (editTenantSel?.value) populateEditForm(editTenantSel.value);

      if (hintsEl) {
        if (!partnersCache.length) {
          hintsEl.innerHTML = `<div class="cs-hint-banner cs-hint-warn"><strong>No partner org yet.</strong> Create one or change an existing org to <strong>Partner / vendor</strong> under Edit organization.</div>`;
        } else {
          const partnerNames = partnersCache.map((p) => `<code>${esc(p.tenantSlug)}</code>`).join(', ');
          const unlinked = customersCache.filter((c) => !c.partnerId);
          hintsEl.innerHTML = unlinked.length
            ? `<div class="cs-hint-banner"><strong>Partners:</strong> ${partnerNames}. Unlinked customers: ${unlinked.map((t) => `<code>${esc(t.tenantSlug)}</code>`).join(', ')}.</div>`
            : `<div class="cs-hint-banner cs-hint-ok"><strong>Partners:</strong> ${partnerNames}. All customers linked.</div>`;
        }
      }

      host.innerHTML = `<table class="cs-table cs-table-admin"><thead><tr>
        <th>Code</th><th>Name</th><th>Type</th><th>Partner</th><th>Site key</th><th>CMMS</th><th>Actions</th>
      </tr></thead><tbody>
        ${tenantsCache.map((t) => {
          const partnerRow = isPartner(t);
          const partnerName = t.partnerId
            ? esc(tenantById(t.partnerId)?.name || t.partnerId)
            : '—';
          return `<tr>
          <td><code>${esc(t.tenantSlug || '')}</code></td>
          <td>${esc(t.name)}</td>
          <td>${partnerRow ? 'Partner / vendor' : 'Customer'}</td>
          <td>${partnerRow ? '—' : partnerName}</td>
          <td>${siteKeyCell(t)}</td>
          <td>${t.cmmsEnabled ? statusBadge('ok') : statusBadge('offline')}</td>
          <td class="cs-actions-cell">
            <button type="button" class="btn" data-edit="${esc(t.tenantId)}" data-slug="${esc(t.tenantSlug || '')}">Configure</button>
            <a class="btn btn-primary" href="/people?org=${encodeURIComponent(t.tenantSlug || '')}">Invite users</a>
            <button type="button" class="btn" data-cmms="${esc(t.tenantId)}" data-on="${t.cmmsEnabled ? '0' : '1'}">
              ${t.cmmsEnabled ? 'Disable CMMS' : 'Enable CMMS'}
            </button>
          </td>
        </tr>`;
        }).join('')}
      </tbody></table>`;

      host.querySelectorAll('[data-cmms]').forEach((btn) => {
        btn.onclick = async () => {
          await api.patchTenantCmms(btn.dataset.cmms, { enabled: btn.dataset.on === '1' });
          await load();
        };
      });
      host.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.onclick = () => {
          const tenantId = btn.dataset.edit;
          const slug = btn.dataset.slug || '';
          editTenantSel.value = tenantId;
          populateEditForm(tenantId);
          const section = document.getElementById('edit-org-section');
          section?.classList.add('cs-section-highlight');
          window.setTimeout(() => section?.classList.remove('cs-section-highlight'), 2500);
          section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          editNameEl?.focus();
          const t = tenantById(tenantId);
          showAck(`Configure ${t?.name || slug || 'organization'} below — to email an invite, click Invite users.`);
        };
      });
    }

    linkPartnerSel?.addEventListener('change', () => syncLinkCustomerDropdown(linkPartnerSel.value));
    editTenantSel?.addEventListener('change', () => populateEditForm(editTenantSel.value));
    editTypeEl?.addEventListener('change', syncEditPartnerField);

    document.getElementById('link-save')?.addEventListener('click', async () => {
      const partnerId = linkPartnerSel?.value;
      const customerId = linkCustomerSel?.value;
      if (!partnerId) return showAck('Select a partner first.', false);
      if (!customerId) return showAck('Select a customer to link.', false);
      const customer = tenantById(customerId);
      try {
        await api.patchTenantPartner(customerId, { partnerId });
        showAck(`Linked ${customer?.tenantSlug || customerId} to ${tenantById(partnerId)?.tenantSlug || partnerId}.`);
        await load();
      } catch (e) {
        showAck(e.message || String(e), false);
      }
    });

    document.getElementById('link-unlink')?.addEventListener('click', async () => {
      const customerId = linkCustomerSel?.value;
      if (!customerId) return showAck('Select a customer to unlink.', false);
      const customer = tenantById(customerId);
      if (!customer?.partnerId) return showAck('That customer is not linked to a partner.', false);
      try {
        await api.patchTenantPartner(customerId, { clear: true });
        showAck(`Unlinked ${customer.tenantSlug}.`);
        await load();
      } catch (e) {
        showAck(e.message || String(e), false);
      }
    });

    document.getElementById('edit-save')?.addEventListener('click', async () => {
      const tenantId = editTenantSel?.value;
      if (!tenantId) return showAck('Select an organization to edit.', false);
      const name = editNameEl?.value?.trim();
      if (!name) return showAck('Name is required.', false);
      const tenantType = editTypeEl?.value || 'customer';
      const t = tenantById(tenantId);
      const btn = document.getElementById('edit-save');
      btn.disabled = true;
      try {
        await api.updateAdminTenant(tenantId, { name, tenantType });
        if (tenantType === 'customer') {
          const partnerId = editPartnerSel?.value || '';
          const prevPartner = t?.partnerId || '';
          if (partnerId !== prevPartner) {
            if (partnerId) await api.patchTenantPartner(tenantId, { partnerId });
            else await api.patchTenantPartner(tenantId, { clear: true });
          }
        }
        showAck(`Saved ${t?.tenantSlug || tenantId}.`);
        await load();
        editTenantSel.value = tenantId;
        populateEditForm(tenantId);
      } catch (e) {
        showAck(e.message || String(e), false);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('edit-delete')?.addEventListener('click', async () => {
      const tenantId = editTenantSel?.value;
      if (!tenantId) return showAck('Select an organization to delete.', false);
      const t = tenantById(tenantId);
      if (!window.confirm(`Delete organization "${t?.name || tenantId}" (${t?.tenantSlug})? This cannot be undone.`)) return;
      try {
        await api.deleteAdminTenant(tenantId);
        showAck(`Deleted ${t?.tenantSlug || tenantId}.`);
        editTenantSel.value = '';
        populateEditForm('');
        await load();
      } catch (e) {
        showAck(e.message || String(e), false);
      }
    });

    document.getElementById('t-refresh').onclick = () => load();
    document.getElementById('t-add').onclick = async () => {
      statusEl.innerHTML = '';
      const slug = document.getElementById('t-org-id').value.trim();
      const name = document.getElementById('t-name').value.trim();
      const tenantType = typeEl?.value || 'customer';
      if (!slug || !name) {
        showAck('Org code and name are required.', false);
        return;
      }
      try {
        const created = await api.createAdminTenant({ tenantSlug: slug, name, tenantType });
        const org = created.tenant?.tenantSlug || slug;
        const isNewPartner = tenantType === 'partner';
        showAck(isNewPartner
          ? `Created partner ${org}. Click Invite users on that row to email the owner (Partner admin role).`
          : `Created ${org}. Use Link customer to partner or Configure to edit.`);
        document.getElementById('t-org-id').value = '';
        document.getElementById('t-name').value = '';
        await load();
      } catch (e) {
        showAck(e.message || String(e), false);
      }
    };

    try { await load(); } catch (e) {
      host.innerHTML = `<p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  async function renderCmms() {
    main.innerHTML = '<div id="cmms-cloud-root" class="cmms-page cmms-cloud-embed"></div>';
    try {
      const data = await api.tenantCmms();
      if (!data.cmmsEnabled) {
        main.innerHTML = `<h1>CMMS</h1><div class="cs-card"><p><span class="badge badge-off">disabled</span> ${esc(data.message)}</p></div>`;
        return;
      }
      if (data.externalUrl && !data.integrated) {
        main.innerHTML = `<h1>CMMS</h1><div class="cs-card"><p><span class="badge badge-ok">enabled</span> ${esc(data.message)}</p>
          <p><a class="btn btn-primary" href="${esc(data.externalUrl)}" target="_blank" rel="noopener">Open external CMMS</a></p></div>`;
        return;
      }
      if (typeof PeaklogicCmms === 'undefined') {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = `/js/cmmsApp.js?v=${encodeURIComponent(root.dataset.version || '')}`;
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }
      const host = document.getElementById('cmms-cloud-root');
      if (host) {
        host.innerHTML = '<h1>CMMS</h1>';
        const mount = document.createElement('div');
        mount.id = 'cmms-app-root';
        host.appendChild(mount);
        await PeaklogicCmms.mount(mount);
      }
    } catch (e) {
      main.innerHTML = `<h1>CMMS</h1><div class="cs-card"><p class="cs-err">${esc(e.message)}</p></div>`;
    }
  }

  async function renderMqttConsole() {
    main.innerHTML = `
      <h1>MQTT console</h1>
      <p class="cs-lead">Platform hub status, per-organization traffic, and global site key fencing. Partners see only their orgs. Tenants never see unmatched devices.</p>
      <p class="cs-msg" id="mqtt-status" aria-live="polite"></p>
      <div class="cs-card" id="mqtt-hub"></div>
      <div class="cs-card"><h2>Organizations</h2><div id="mqtt-orgs"></div></div>
      <div class="cs-card"><h2>Devices</h2><div id="mqtt-devices"></div></div>
      <div class="cs-card"><h2>MQTT traffic</h2><div id="mqtt-traffic"></div></div>`;
    const statusEl = document.getElementById('mqtt-status');
    const hubHost = document.getElementById('mqtt-hub');
    const orgHost = document.getElementById('mqtt-orgs');
    const devHost = document.getElementById('mqtt-devices');
    const trafficHost = document.getElementById('mqtt-traffic');

    async function load() {
      const data = await api.mqttConsole();
      const hub = data.hub || {};
      hubHost.innerHTML = `
        <p><strong>Hub</strong> ${hub.connected ? '<span class="badge badge-ok">connected</span>' : '<span class="badge badge-off">offline</span>'}
          · ${esc(hub.brokerUrl || '—')}</p>
        <p class="cs-muted">${data.scope === 'all' ? 'Global view — all partners and tenants.' : 'Partner view — your organizations only.'}
          ${data.unfencedCount ? ` · ${data.unfencedCount} unfenced device(s)` : ''}</p>`;
      const orgs = data.orgs || [];
      orgHost.innerHTML = orgs.length
        ? `<table class="cs-table"><thead><tr>
            <th>Org</th><th>Type</th><th>Site key</th><th>Entry</th><th>Assigned</th><th>Online</th><th>Checked in</th><th></th>
          </tr></thead><tbody>
          ${orgs.map((o) => `<tr>
            <td>${esc(o.name)}<br><code>${esc(o.tenantSlug)}</code></td>
            <td>${o.isPartner ? 'partner' : 'customer'}</td>
            <td><code>${esc(o.globalSiteKeyHex || '—')}</code></td>
            <td><code>${esc(o.globalSiteKeyDigits || '')}</code></td>
            <td>${Number(o.deviceCount) || 0}</td>
            <td>${Number(o.onlineCount) || 0}</td>
            <td>${Number(o.checkedInCount) || 0}</td>
            <td>${data.scope === 'all' ? `<button type="button" class="btn btn-sm" data-set-key="${esc(o.tenantId)}" data-hex="${esc(o.globalSiteKeyHex || '')}">Set key</button>` : ''}</td>
          </tr>`).join('')}
          </tbody></table>`
        : '<p class="cs-empty">No organizations in scope.</p>';
      orgHost.querySelectorAll('[data-set-key]').forEach((btn) => {
        btn.onclick = async () => {
          const next = window.prompt('Global site key (0x0001 or 000001)', btn.dataset.hex || '0x0001');
          if (!next) return;
          try {
            await api.mqttConsoleSetSiteKey(btn.dataset.setKey, { globalSiteKey: next });
            statusEl.innerHTML = '<span class="cs-ok">Site key updated.</span>';
            await load();
          } catch (e) {
            statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
          }
        };
      });
      const devices = data.devices || [];
      devHost.innerHTML = devices.length
        ? `<table class="cs-table"><thead><tr>
            <th>Device</th><th>Org</th><th>Site key</th><th>Last</th><th>Status</th><th></th>
          </tr></thead><tbody>
          ${devices.map((d) => `<tr>
            <td><code>${esc(d.deviceId)}</code></td>
            <td>${esc(d.tenantName || d.tenantSlug || (d.fenced ? '—' : 'unfenced'))}</td>
            <td><code>${esc(d.globalSiteKeyHex || '—')}</code></td>
            <td>${esc((d.lastReportAt || '').slice(0, 19).replace('T', ' '))}</td>
            <td>${d.assigned ? '<span class="badge badge-ok">assigned</span>' : (d.fenced ? '<span class="badge badge-muted">checked in</span>' : '<span class="badge badge-off">unfenced</span>')}</td>
            <td>${!d.fenced && data.scope === 'all' ? `<button type="button" class="btn btn-sm btn-primary" data-bind="${esc(d.deviceId)}">Bind key</button>` : ''}</td>
          </tr>`).join('')}
          </tbody></table>`
        : '<p class="cs-empty">No MQTT devices in scope.</p>';
      devHost.querySelectorAll('[data-bind]').forEach((btn) => {
        btn.onclick = async () => {
          const next = window.prompt('Bind global site key (0x0001 or 000001)');
          if (!next) return;
          try {
            await api.mqttConsoleFenceDevice(btn.dataset.bind, { globalSiteKey: next });
            statusEl.innerHTML = `<span class="cs-ok">Bound ${esc(btn.dataset.bind)}.</span>`;
            await load();
          } catch (e) {
            statusEl.innerHTML = `<span class="cs-err">${esc(e.message)}</span>`;
          }
        };
      });
      try {
        const traffic = await api.mqttConsoleTraffic();
        const entries = traffic.entries || [];
        trafficHost.innerHTML = entries.length
          ? `<table class="cs-table"><thead><tr><th>Time</th><th>Event</th><th>Message</th></tr></thead><tbody>
              ${entries.slice(0, 80).map((e) => `<tr>
                <td>${esc((e.at || e.ts || '').toString().slice(0, 19).replace('T', ' '))}</td>
                <td>${esc(e.detail?.event || e.level || '')}</td>
                <td>${esc(e.message || '')}</td>
              </tr>`).join('')}
            </tbody></table>`
          : '<p class="cs-empty">No MQTT log rows in scope yet.</p>';
      } catch (e) {
        trafficHost.innerHTML = `<p class="cs-muted">${esc(e.message || 'Traffic log unavailable')}</p>`;
      }
    }

    try { await load(); } catch (e) {
      main.innerHTML = `<h1>MQTT console</h1><p class="cs-err">${esc(e.message)}</p>`;
    }
  }

  if (page === 'cameras' && pathSiteId) renderCameras(pathSiteId);
  else if (page === 'site' && pathSiteId) location.replace(`/sites/${encodeURIComponent(pathSiteId)}/cameras`);
  else if (page === 'devices') renderDevices();
  else if (page === 'fleet') renderFleet();
  else if (page === 'people') renderPeople();
  else if (page === 'partner') renderPartner();
  else if (page === 'admin') renderAdmin();
  else if (page === 'mqtt') renderMqttConsole();
  else if (page === 'cmms') renderCmms();
  else renderSites();
})();
