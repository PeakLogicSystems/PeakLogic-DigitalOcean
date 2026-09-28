'use strict';

(function initProjectHubUi() {
  const $ = (id) => document.getElementById(id);
  const sortApi = () => window.PeaklogicProjectListSort;

  function closeProjectMenu() {
    const details = $('project-menu-details');
    if (details) details.open = false;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function currentProjectName() {
    return String($('project-name')?.textContent || 'project').trim() || 'project';
  }

  function selectedLocationId() {
    return String(
      $('studio-location-select')?.value
      || $('project-hub-location')?.value
      || window.PEAKLOGIC_STUDIO_LOCATION_ID
      || '',
    ).trim();
  }

  function syncLocationPickers() {
    const id = selectedLocationId();
    const studioSel = $('studio-location-select');
    const hubSel = $('project-hub-location');
    if (studioSel && id && studioSel.value !== id) studioSel.value = id;
    if (hubSel && id && hubSel.value !== id) hubSel.value = id;
  }

  function setHubMsg(text) {
    const el = $('project-hub-msg');
    if (el) el.textContent = text || '';
  }

  function showDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function hideDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close('cancel');
    else dlg.removeAttribute('open');
  }

  let hubMode = 'deploy';
  let hubTab = 'local';
  let pendingFileDoc = null;
  let hubProjects = [];
  let hubSort = sortApi()?.defaultState() || { key: 'date', dir: 'desc' };

  function normalizeHubProject(p) {
    const apiSort = sortApi();
    const defaults = {
      source: hubTab === 'cloud' ? 'cloud' : 'local',
      format: hubTab === 'cloud' ? 'cloud' : (p?.format || 'json'),
    };
    return apiSort ? apiSort.normalizeRecord(p, defaults) : { ...p, ...defaults };
  }

  function hubOptionLabel(p) {
    const apiSort = sortApi();
    if (apiSort) return apiSort.optionLabel(p);
    return p.name || p.id || '';
  }

  function setHubTab(tab) {
    hubTab = tab;
    pendingFileDoc = null;
    $('project-hub-tabs')?.querySelectorAll('[data-hub-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-hub-tab') === tab);
    });
    const fileInput = $('project-hub-file');
    const list = $('project-hub-list');
    const sortBar = document.querySelector('[data-project-sort-scope="hub"]');
    const locWrap = $('project-hub-location-wrap');
    if (fileInput) fileInput.value = '';
    if (locWrap) locWrap.classList.toggle('view-hidden', tab !== 'cloud');
    const hint = $('project-hub-hint');
    if (hint) {
      hint.textContent = tab === 'cloud'
        ? 'Deploy a project published to MV Cloud for this site.'
        : tab === 'file'
          ? 'Choose a .est or .json project file from your computer.'
          : 'Deploy a project saved in this Studio workspace (data/projects).';
    }
    if (tab === 'file') {
      list?.classList.add('view-hidden');
      sortBar?.classList.add('view-hidden');
      fileInput?.classList.remove('view-hidden');
    } else {
      list?.classList.remove('view-hidden');
      sortBar?.classList.remove('view-hidden');
      fileInput?.classList.add('view-hidden');
    }
    refreshHubList().catch((e) => setHubMsg(e.message));
  }

  function fillHubList(items) {
    const sel = $('project-hub-list');
    if (!sel) return;
    hubProjects = (Array.isArray(items) ? items : []).map(normalizeHubProject);
    if (hubTab === 'file') {
      sel.innerHTML = '<option value="">(choose file below)</option>';
      sel.disabled = true;
      $('project-hub-file')?.click();
      return;
    }
    sel.disabled = false;
    const sorted = sortApi()?.sortItems(hubProjects, hubSort) || hubProjects;
    sortApi()?.syncButtons('hub', hubSort);
    if (!sorted.length) {
      sel.innerHTML = '<option value="">(no projects)</option>';
      return;
    }
    sel.innerHTML = sorted.map((p) =>
      `<option value="${esc(p.id)}">${esc(hubOptionLabel(p))}</option>`,
    ).join('');
  }

  async function refreshHubList() {
    setHubMsg('');
    if (hubTab === 'file') {
      fillHubList([]);
      return;
    }
    if (hubTab === 'cloud') {
      const locationId = selectedLocationId();
      const data = await api.listProjectHubCatalog(locationId || undefined);
      fillHubList(data.projects || []);
      if (!locationId) setHubMsg('Choose a site above to list cloud projects.');
      return;
    }
    const data = await api.listProjects();
    fillHubList((data.projects || []).map((p) => normalizeHubProject({ ...p, format: p.format || 'zip' })));
  }

  async function applyDeployedProject(nameHint) {
    const refresh = window.peaklogicRefreshAll;
    if (typeof refresh !== 'function') {
      throw new Error('Studio UI is still loading — try again in a moment.');
    }
    const data = await refresh({ force: true });
    window.applyProjectLoadToUi?.(data?.settings?.project?.name || nameHint || currentProjectName(), data);
    return data;
  }

  async function deployFromSelection() {
    const sel = $('project-hub-list');
    const id = sel?.value;
    if (hubTab === 'file') {
      if (!pendingFileDoc) throw new Error('Choose a project file first.');
      if (!window.confirm('Deploy this project file? This replaces tags, drivers, program, and settings.')) return;
      await api.openEst(pendingFileDoc);
      const name = pendingFileDoc.project?.name || pendingFileDoc.name || currentProjectName();
      await applyDeployedProject(name);
      alert(`Deployed project: ${name}`);
      return;
    }
    if (!id) throw new Error('Select a project first.');
    const entry = hubProjects.find((p) => p.id === id);
    const label = entry?.name || id;
    if (!window.confirm(`Deploy "${label}"? This replaces tags, drivers, program, and settings.`)) return;
    if (hubTab === 'cloud') {
      const payload = await api.fetchProjectHubEst(id);
      const doc = payload?.doc;
      if (!doc || typeof doc !== 'object') throw new Error('Cloud project has no .est document');
      await api.openEst(doc);
      await applyDeployedProject(payload.entry?.name || label);
    } else {
      await api.openProject(id);
      await applyDeployedProject(label);
    }
    alert(`Deployed project: ${label}`);
  }

  async function publishCurrentProject() {
    const locationId = selectedLocationId();
    if (!locationId) throw new Error('Choose a site before publishing to MV Cloud.');
    const name = currentProjectName();
    if (!window.confirm(`Publish "${name}" to MV Cloud for this site?`)) return;
    await window.PeaklogicHmi?.applyHmiSettingsIfDirty?.();
    const doc = await api.exportEstDoc(name);
    const result = await api.publishProjectHub({ name, doc, locationId });
    const entry = result.entry || result;
    setHubMsg(`Published ${entry.name || name} (v${entry.version || 1}).`);
    alert(`Published to MV Cloud: ${entry.name || name}`);
  }

  async function runPrimaryAction() {
    setHubMsg('Working…');
    try {
      if (hubMode === 'share') {
        await publishCurrentProject();
      } else {
        await deployFromSelection();
        hideDialog($('project-hub-dialog'));
      }
    } catch (e) {
      setHubMsg(e.message || String(e));
      alert(e.message || String(e));
    }
  }

  function configureHubDialog(mode) {
    hubMode = mode;
    pendingFileDoc = null;
    const title = $('project-hub-title');
    const primary = $('project-hub-primary');
    const secondary = $('project-hub-secondary');
    const tabs = $('project-hub-tabs');
    if (mode === 'share') {
      if (title) title.textContent = 'Share project';
      if (primary) primary.textContent = 'Publish to MV Cloud';
      if (secondary) secondary.hidden = true;
      if (tabs) tabs.hidden = true;
      hubTab = 'cloud';
      const locWrap = $('project-hub-location-wrap');
      if (locWrap) locWrap.classList.remove('view-hidden');
      const hint = $('project-hub-hint');
      if (hint) hint.textContent = 'Publish the current Studio project to MV Cloud for the selected site.';
      const list = $('project-hub-list');
      if (list) {
        list.hidden = true;
        list.disabled = true;
      }
      document.querySelector('[data-project-sort-scope="hub"]')?.classList.add('view-hidden');
    } else {
      if (title) title.textContent = 'Deploy project';
      if (primary) primary.textContent = 'Deploy';
      if (secondary) secondary.hidden = true;
      if (tabs) tabs.hidden = false;
      const list = $('project-hub-list');
      if (list) {
        list.hidden = false;
        list.disabled = false;
      }
      document.querySelector('[data-project-sort-scope="hub"]')?.classList.remove('view-hidden');
      setHubTab(hubTab || 'local');
    }
  }

  async function openHubDialog(mode) {
    closeProjectMenu();
    const dlg = $('project-hub-dialog');
    if (!dlg) return;
    hubTab = mode === 'share' ? 'cloud' : 'local';
    configureHubDialog(mode);
    syncLocationPickers();
    if (mode !== 'share') {
      await refreshHubList();
    } else {
      setHubMsg('');
    }
    sortApi()?.syncButtons('hub', hubSort);
    showDialog(dlg);
  }

  function fillLocationSelects(locations) {
    const items = Array.isArray(locations) ? locations : [];
    const opts = items.length
      ? items.map((loc) => `<option value="${esc(loc.id)}">${esc(loc.name || loc.slug || loc.id)}</option>`).join('')
      : '<option value="">(no sites)</option>';
    const preferred = String(window.PEAKLOGIC_STUDIO_LOCATION_ID || '').trim();
    const studioSel = $('studio-location-select');
    const hubSel = $('project-hub-location');
    const studioWrap = $('studio-location-wrap');
    if (studioSel) {
      studioSel.innerHTML = opts;
      if (preferred && items.some((loc) => loc.id === preferred)) studioSel.value = preferred;
    }
    if (hubSel) {
      hubSel.innerHTML = opts;
      if (preferred && items.some((loc) => loc.id === preferred)) hubSel.value = preferred;
    }
    if (studioWrap) studioWrap.classList.toggle('view-hidden', items.length === 0);
    syncLocationPickers();
  }

  async function loadLocations() {
    if (!$('studio-location-select') && !$('project-hub-location')) return;
    try {
      const data = await api.listLocations();
      fillLocationSelects(data.locations || []);
    } catch (e) {
      const msg = e.message || 'Could not load sites';
      if ($('studio-location-select')) {
        $('studio-location-select').innerHTML = `<option value="">${esc(msg)}</option>`;
      }
      console.warn('[project-hub]', msg);
    }
  }

  function bindLocationPickers() {
    const onChange = () => {
      syncLocationPickers();
      if ($('project-hub-dialog')?.open && hubMode === 'deploy' && hubTab === 'cloud') {
        refreshHubList().catch((e) => setHubMsg(e.message));
      }
    };
    $('studio-location-select')?.addEventListener('change', onChange);
    $('project-hub-location')?.addEventListener('change', onChange);
  }

  function bindHubSortControls() {
    const bar = document.querySelector('[data-project-sort-scope="hub"]');
    if (!bar || bar.dataset.hubSortBound === '1') return;
    bar.dataset.hubSortBound = '1';
    bar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-project-sort]');
      if (!btn || !bar.contains(btn)) return;
      ev.preventDefault();
      const key = btn.getAttribute('data-project-sort');
      sortApi()?.cycleSort(hubSort, key);
      fillHubList(hubProjects);
    });
  }

  function bindHubDialog() {
    const dlg = $('project-hub-dialog');
    if (!dlg) return;

    $('project-hub-cancel')?.addEventListener('click', () => hideDialog(dlg));
    $('project-hub-primary')?.addEventListener('click', () => {
      runPrimaryAction().catch((e) => alert(e.message));
    });
    $('project-hub-tabs')?.querySelectorAll('[data-hub-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setHubTab(btn.getAttribute('data-hub-tab') || 'local'));
    });
    $('project-hub-file')?.addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          pendingFileDoc = JSON.parse(String(reader.result || ''));
          const name = pendingFileDoc.project?.name || pendingFileDoc.name || file.name.replace(/\.(est|json)$/i, '');
          setHubMsg(`Ready: ${name}`);
        } catch (e) {
          pendingFileDoc = null;
          setHubMsg(e.message || 'Invalid project file');
        }
      };
      reader.onerror = () => {
        pendingFileDoc = null;
        setHubMsg('Could not read file');
      };
      reader.readAsText(file);
    });
    bindHubSortControls();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('project-hub-dialog') || !window.PEAKLOGIC_BUILD || window.PEAKLOGIC_BUILD.deployment !== 'cloud') return;
    bindHubDialog();
    bindLocationPickers();
    loadLocations().catch(console.error);
    window.PeaklogicProjectHubUi = {
      openHubDialog,
      refreshHubList,
    };
  });
})();
