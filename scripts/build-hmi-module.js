'use strict';

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../public/js/app.js');
const outPath = path.join(__dirname, '../public/js/hmiSetupUi.js');
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/);

function slice(start1, end1) {
  return lines.slice(start1 - 1, end1).join('\n');
}

const chunks = [
  slice(594, 608),
  slice(614, 616),
  slice(682, 914),
  slice(2080, 3976),
  slice(4452, 4688),
];

let body = chunks.join('\n\n');

body = body.replace(/\bfunction \$\(/g, 'function domGet(');
body = body.replace(/\$\(/g, 'domGet(');
body = body.replace(/\bconst \$ = /g, 'const domGet = ');

const replacements = [
  [/\btags\.find\b/g, 'tagList().find'],
  [/\btags\.filter\b/g, 'tagList().filter'],
  [/\btags\.forEach\b/g, 'tagList().forEach'],
  [/\btags\.length\b/g, 'tagList().length'],
  [/\btags\.some\b/g, 'tagList().some'],
  [/\btags\.map\b/g, 'tagList().map'],
  [/\[\.\.\.tags\]/g, '[...tagList()]'],
  [/\bfor \(const t of tags\)/g, 'for (const t of tagList())'],
  [/\btags\[0\]/g, 'tagList()[0]'],
  [/\bconst tagList = tags\.list\b/g, 'const tagList = tagList()'],
  [/\blastLive\b/g, 'lastLive()'],
  [/\blastSettings\b/g, 'lastSettings()'],
  [/\bprojectName\b/g, 'projectName()'],
  [/\brefreshAll\b/g, 'refreshAll()'],
];

for (const [re, rep] of replacements) {
  body = body.replace(re, rep);
}

const header = `'use strict';

/** HMI live view + setup composer */
window.PeaklogicHmi = (function () {
  const { esc } = window.PeaklogicCore;
  const domGet = window.PeaklogicCore.$;
  const HmiView = window.HmiView;

  const HMI_BINDING_PROPS = ['visibility', 'fill', 'fill8', 'backgroundFill', 'stroke', 'text', 'opacity', 'class'];
  const HMI_BINDING_PROP_LABELS = { fill8: 'fill color (8)', backgroundFill: 'background fill' };
  const HMI_SCREEN_BG_ELEMENT_ID = '@screen';
  const HMI_GRID_CONTAINER_ID = 'hmi-tile-grid';
  const HMI_MAX_LAYERS = 5;
  const HMI_OBJ_KINDS = ['staticImage', 'staticText', 'dynamicText', 'dynamicImage'];
  const HMI_FILL8_DEFAULT_COLORS = [
    '#94a3b8', '#22c55e', '#eab308', '#ef4444', '#2563eb', '#f97316', '#9333ea', '#0891b2',
  ];
  const HMI_FILL8_PALETTE = [
    { label: 'Gray', hex: '#94a3b8' },
    { label: 'Dark gray', hex: '#64748b' },
    { label: 'Slate', hex: '#475569' },
    { label: 'Black', hex: '#1e293b' },
    { label: 'White', hex: '#f8fafc' },
    { label: 'Green', hex: '#22c55e' },
    { label: 'Lime', hex: '#84cc16' },
    { label: 'Yellow', hex: '#eab308' },
    { label: 'Amber', hex: '#f59e0b' },
    { label: 'Orange', hex: '#f97316' },
    { label: 'Red', hex: '#ef4444' },
    { label: 'Rose', hex: '#f43f5e' },
    { label: 'Pink', hex: '#ec4899' },
    { label: 'Purple', hex: '#9333ea' },
    { label: 'Blue', hex: '#2563eb' },
    { label: 'Sky', hex: '#0ea5e9' },
    { label: 'Cyan', hex: '#0891b2' },
    { label: 'Teal', hex: '#14b8a6' },
  ];
  const HOME_SCREEN_ID = 'screen_1';
  const HMI_ASSET_PAGE_SIZE = 100;
  const HMI_DEFAULT_WIDTH = 1024;
  const HMI_DEFAULT_HEIGHT = 800;
  const HMI_GRID_SIZE = 8;

  let deps = null;
  let hmiConfig = { activeScreen: HOME_SCREEN_ID, screens: [], bindings: [] };
  let hmiEditScreenId = '';
  let hmiViewScreenId = '';
  let hmiAssets = [];
  let hmiAssetPagesLoaded = 1;
  let hmiDirty = false;
  let hmiLoadedUrl = '';
  let hmiSvgRoot = null;
  let hmiElementIds = [];
  let hmiPreviewToken = 0;
  let hmiPreviewSvg = '';
  let hmiPreviewTilesKey = '';
  let hmiSelectedAssetPath = '';
  let hmiSelectedTileCell = null;

  function d() { return deps; }
  function tagList() { return d().getTags(); }
  function lastLive() { return d().getLastLive(); }
  function lastSettings() { return d().getLastSettings(); }
  function projectName() { return d().getProjectName(); }
  function refreshAll() { return d().refreshAll(); }
  function isPopupOpen(name) {
    const el = document.querySelector(\`[data-popup="\${name}"]\`);
    return el && !el.classList.contains('view-hidden');
  }
  function setTabActive(name, on) {
    document.querySelectorAll(\`[data-popup-open="\${name}"]\`).forEach((b) => {
      b.classList.toggle('active', on);
    });
  }

`;

const footer = `
  function openSetupPopup() {
    bindHmiSetupPanel();
    positionHmiSetupPopup(true);
    if (!hmiDirty && lastSettings()?.hmi?.screens?.length) {
      hmiConfig = migrateHmiConfig(JSON.parse(JSON.stringify(lastSettings().hmi)));
    } else {
      ensureHmiConfigLoaded();
    }
    if (!hmiEditScreenId || !hmiConfig.screens.some((s) => s.id === hmiEditScreenId)) {
      hmiEditScreenId = HOME_SCREEN_ID;
    }
    resetHmiAssetPages();
    renderHmiSetup().then(() => {
      if (!isHmiSetupOpen()) return;
      clampHmiSetupOnResize();
    }).catch(console.error);
  }

  function closeSetupPopup() {
    if (hmiDirty) {
      hmiDirty = false;
      if (lastSettings()?.hmi) hmiConfig = lastSettings().hmi;
      hmiEditScreenId = '';
      hmiPreviewSvg = '';
    }
  }

  function handleDashboardPoll(data) {
    if (!hmiDirty && data.settings?.hmi && !isHmiSetupOpen()) {
      hmiConfig = migrateHmiConfig(JSON.parse(JSON.stringify(data.settings.hmi)));
    }
    if (isHmiViewActive()) {
      ensureHmiConfigLoaded();
      renderHmiNavBar();
      if (hmiSvgRoot && viewportHasHmiStage()) {
        applyHmiViewerLayout();
        refreshHmiBindings(hmiSvgRoot);
      } else {
        loadHmiScreen(false).catch(console.error);
      }
    } else if (isHmiSetupOpen() && !hmiDirty && !isHmiEditorFocused()) {
      syncHmiScreenFieldsFromConfig();
      scheduleHmiPreview();
    }
    if (isPopupOpen('project') && !hmiDirty) updateHomeScreenLabel();
  }

  function refreshLiveBindings(live) {
    refreshHmiBindings(isHmiViewActive() ? hmiSvgRoot : null);
    if (isHmiSetupOpen()) {
      const previewRoot = hmiSetupBindingRoot();
      if (previewRoot) refreshHmiBindings(previewRoot);
    }
  }

  function syncFromFieldsIfDirty() {
    if (isHmiSetupOpen() && hmiDirty) syncHmiFromFields();
  }

  function getConfig() { return hmiConfig; }
  function setConfig(cfg) { hmiConfig = cfg; }
  function isDirty() { return hmiDirty; }
  function getConfigForSave() {
    syncHmiFromFields();
    return hmiConfig;
  }

  function init(appDeps) {
    deps = appDeps;
  }

  return {
    init,
    initMainHmi,
    isHmiViewActive,
    isHmiSetupOpen,
    openSetupPopup,
    closeSetupPopup,
    bindHmiToolbar,
    bindHmiSetupPanel,
    clampHmiSetupOnResize,
    handleDashboardPoll,
    refreshLiveBindings,
    syncFromFieldsIfDirty,
    getConfig,
    setConfig,
    isDirty,
    getConfigForSave,
    updateHomeScreenLabel,
    migrateHmiConfig,
    reindexHmiScreensClient,
    HOME_SCREEN_ID,
  };
})();
`;

fs.writeFileSync(outPath, header + body + footer);
console.log('Wrote', outPath, 'lines', (header + body + footer).split('\\n').length);
