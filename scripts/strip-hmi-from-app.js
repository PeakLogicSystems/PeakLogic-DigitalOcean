'use strict';

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../public/js/app.js');
const lines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/);

/** 1-based inclusive ranges to remove */
const removeRanges = [
  [14, 42],
  [44, 62],
  [594, 608],
  [614, 616],
  [682, 914],
  [2080, 3976],
  [4452, 4688],
];

const remove = new Set();
for (const [a, b] of removeRanges) {
  for (let i = a; i <= b; i++) remove.add(i);
}

const out = [];
for (let i = 0; i < lines.length; i++) {
  const n = i + 1;
  if (remove.has(n)) continue;
  out.push(lines[i]);
}

let text = out.join('\n');

text = text.replace(
  /    if \(name === 'hmi-setup'\) \{\n      bindHmiSetupPanel\(\);\n      positionHmiSetupPopup\(true\);\n[\s\S]*?\.catch\(console\.error\);\n    \}/,
  `    if (name === 'hmi-setup') {
      window.PeaklogicHmi?.openSetupPopup();
    }`
);

text = text.replace(
  /    if \(name === 'hmi-setup'\) \{\n      if \(hmiDirty\) \{\n        hmiDirty = false;\n        if \(lastSettings\?\.hmi\) hmiConfig = lastSettings\.hmi;\n        hmiEditScreenId = '';\n        hmiPreviewSvg = '';\n      \}\n    \}/,
  `    if (name === 'hmi-setup') {
      window.PeaklogicHmi?.closeSetupPopup();
    }`
);

text = text.replace(
  /    refreshHmiBindings\(isHmiViewActive\(\) \? hmiSvgRoot : null\);\n    if \(isHmiSetupOpen\(\)\) \{\n      const previewRoot = hmiSetupBindingRoot\(\);\n      if \(previewRoot\) refreshHmiBindings\(previewRoot\);\n    \}/,
  '    window.PeaklogicHmi?.refreshLiveBindings(live);'
);

text = text.replace(
  /    if \(!hmiDirty && data\.settings\?\.hmi && !isHmiSetupOpen\(\)\) \{\n      hmiConfig = migrateHmiConfig\(JSON\.parse\(JSON\.stringify\(data\.settings\.hmi\)\)\);\n    \}\n    if \(isHmiViewActive\(\)\) \{[\s\S]*?scheduleHmiPreview\(\);\n    \}\n    if \(isPopupOpen\('project'\) && !hmiDirty\) updateHomeScreenLabel\(\);/,
  '    window.PeaklogicHmi?.handleDashboardPoll(data);'
);

text = text.replace(
  /      if \(isHmiSetupOpen\(\) && hmiDirty\) \{\n        syncHmiFromFields\(\);\n      \}\n      hmiConfig\.activeScreen = HOME_SCREEN_ID;/,
  `      if (window.PeaklogicHmi) {
        window.PeaklogicHmi.syncFromFieldsIfDirty();
        const hmiCfg = window.PeaklogicHmi.getConfig();
        if (hmiCfg) hmiCfg.activeScreen = window.PeaklogicHmi.HOME_SCREEN_ID;
      }`
);

text = text.replace(
  /      next\.hmi = hmiConfig\?\.screens\?\.length \? hmiConfig : \(next\.hmi \|\| lastSettings\?\.hmi\);/,
  '      next.hmi = window.PeaklogicHmi?.getConfig()?.screens?.length ? window.PeaklogicHmi.getConfig() : (next.hmi || lastSettings?.hmi);'
);

text = text.replace(
  /    bindHmiSetupPanel\(\);\n    window\.addEventListener\('resize', \(\) => clampHmiSetupOnResize\(\)\);/,
  "    window.addEventListener('resize', () => window.PeaklogicHmi?.clampHmiSetupOnResize());"
);

text = text.replace(
  /\$\('btn-hmi-setup'\)\?\.addEventListener\('click', \(\) => openPopup\('hmi-setup'\)\);/,
  "$('btn-hmi-setup')?.addEventListener('click', () => openPopup('hmi-setup'));"
);

text = text.replace(
  /      initMainHmi\(\);/,
  `      if (window.PeaklogicHmi) {
        PeaklogicHmi.init({
          getTags: () => tags,
          getLastLive: () => lastLive,
          getLastRuntime: () => lastRuntime,
          getLastSettings: () => lastSettings,
          setLastSettings: (s) => { lastSettings = s; },
          patchLastSettings: (patch) => { lastSettings = { ...lastSettings, ...patch }; },
          getProjectName: () => projectName,
          refreshAll,
        });
        PeaklogicHmi.bindHmiToolbar();
      }
      PeaklogicHmi?.initMainHmi();`
);

text = text.replace(
  /    if \(window\.PeaklogicProgram\) \{\n      PeaklogicProgram\.init\(\{[\s\S]*?\}\);\n    \}/,
  (m) => m
);

fs.writeFileSync(appPath, text);
console.log('Stripped app.js to', out.length, 'lines');
