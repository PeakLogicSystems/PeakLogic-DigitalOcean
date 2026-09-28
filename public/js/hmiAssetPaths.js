'use strict';

/** Resolve legacy / reorganized HMI asset URLs on the client (mirrors server resolveAssetPath). */
window.HmiAssetPaths = (function () {
  const LEGACY_DEMO = {
    '/hmi/svg/demo_controls.svg': '/hmi/svg/demos/demo_controls.svg',
    '/hmi/svg/demo_process.svg': '/hmi/svg/demos/demo_process.svg',
  };

  let pathSet = new Set();
  let byBasename = new Map();

  function migrateHmiSvgPath(svg) {
    const p = String(svg || '').trim();
    if (!p) return p;
    return LEGACY_DEMO[p] || p;
  }

  function indexPath(p) {
    const s = migrateHmiSvgPath(String(p || '').trim());
    if (!s || s.startsWith('@composite/')) return;
    pathSet.add(s);
    const base = s.split('/').pop()?.toLowerCase();
    if (base && !byBasename.has(base)) byBasename.set(base, s);
  }

  function setAssetIndex(assets) {
    pathSet = new Set();
    byBasename = new Map();
    for (const a of assets || []) {
      indexPath(a.path);
      indexPath(a.preview);
      if (a.composite?.preview) indexPath(a.composite.preview);
      if (Array.isArray(a.composite?.parts)) {
        for (const part of a.composite.parts) indexPath(part.svg);
      }
    }
  }

  function resolveHmiAssetUrl(urlPath) {
    let p = migrateHmiSvgPath(urlPath);
    if (!p || p.startsWith('@composite/')) return p;
    if (pathSet.has(p)) return p;
    const mv = p.replace(/\/(opto22|mblogic)\//gi, '/mv/');
    if (mv !== p && pathSet.has(mv)) return mv;
    const base = p.split('/').pop()?.toLowerCase();
    if (base && byBasename.has(base)) return byBasename.get(base);
    if (mv !== p) {
      const mvBase = mv.split('/').pop()?.toLowerCase();
      if (mvBase && byBasename.has(mvBase)) return byBasename.get(mvBase);
    }
    return mv !== p ? mv : p;
  }

  function migrateHmiConfigPaths(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    for (const screen of cfg.screens || []) {
      if (screen?.svg) screen.svg = resolveHmiAssetUrl(screen.svg);
      for (const tile of screen.tiles || []) {
        if (tile?.svg) tile.svg = resolveHmiAssetUrl(tile.svg);
        for (const layer of tile.layers || []) {
          if (layer?.svg) layer.svg = resolveHmiAssetUrl(layer.svg);
        }
      }
    }
    return cfg;
  }

  function isKnownPath(p) {
    const s = String(p || '').trim();
    return s.startsWith('@composite/') || pathSet.has(s);
  }

  return {
    migrateHmiSvgPath,
    setAssetIndex,
    resolveHmiAssetUrl,
    migrateHmiConfigPaths,
    isKnownPath,
  };
})();
