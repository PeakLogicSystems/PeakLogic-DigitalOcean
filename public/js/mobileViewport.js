/*
 * Mobile viewport + orientation handling for PeakLogic cloud/studio.
 * Uses the shorter screen dimension so phones match in portrait AND landscape.
 */
(function () {
  'use strict';

  const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, interactive-widget=resizes-content';
  const MOBILE_SHORT_MAX = 640;

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight,
    };
  }

  function shortSide() {
    const { width, height } = viewportSize();
    return Math.min(width, height);
  }

  function isMobileLayout() {
    const s = shortSide();
    if (s <= 520) return true;
    try {
      if (window.matchMedia('(pointer: coarse)').matches && s <= MOBILE_SHORT_MAX) return true;
    } catch { /* ignore */ }
    return false;
  }

  function refreshViewportMeta() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    meta.setAttribute('content', 'width=device-width, initial-scale=1');
    void document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      meta.setAttribute('content', VIEWPORT_CONTENT);
      void document.documentElement.offsetHeight;
      run(false);
    });
  }

  function closeMobileMenus() {
    document.querySelectorAll('.topbar-mobile-menu[open], .cloud-studio-nav-menu[open], .cs-nav-menu[open]')
      .forEach((el) => el.removeAttribute('open'));
  }

  function syncChromeTop() {
    const chrome = document.querySelector('.dashboard-header-chrome') || document.querySelector('.cs-top');
    if (!chrome || !isMobileLayout()) {
      document.documentElement.style.removeProperty('--mv-mobile-chrome-top');
      return;
    }
    document.documentElement.style.setProperty(
      '--mv-mobile-chrome-top',
      `${Math.ceil(chrome.getBoundingClientRect().height)}px`,
    );
  }

  function setViewportVars() {
    const { width, height } = viewportSize();
    const root = document.documentElement;
    root.style.setProperty('--mv-vw', `${width}px`);
    root.style.setProperty('--mv-vh', `${height}px`);
    root.style.setProperty('--mv-short-side', `${Math.min(width, height)}px`);
  }

  function unlockOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch { /* ignore — some browsers require user gesture */ }
  }

  function invalidateLiveHmiLayout() {
    const vp = document.getElementById('hmi-viewport');
    if (!vp) return;
    vp.querySelectorAll('.hmi-tile-grid').forEach((grid) => {
      delete grid.dataset.hmiSizeSig;
    });
  }

  function syncTopbarMenuDetails() {
    const menu = document.querySelector('.topbar-mobile-menu');
    if (!menu) return;
    const { width, height } = viewportSize();
    const inlineDesktop = width >= 721 && height > 480;
    if (inlineDesktop) menu.setAttribute('open', '');
  }

  function run(dispatch) {
    const mobile = isMobileLayout();
    document.documentElement.classList.toggle('mv-mobile', mobile);
    setViewportVars();
    syncChromeTop();
    syncTopbarMenuDetails();
    unlockOrientation();
    invalidateLiveHmiLayout();
    if (dispatch !== false) {
      window.dispatchEvent(new CustomEvent('mv-viewport-change', {
        detail: { mobile, ...viewportSize() },
      }));
    }
  }

  function onOrientationChange() {
    closeMobileMenus();
    refreshViewportMeta();
    setTimeout(run, 80);
    setTimeout(run, 250);
    setTimeout(run, 600);
  }

  run(false);

  window.addEventListener('resize', () => run(true));
  window.addEventListener('orientationchange', onOrientationChange);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) onOrientationChange();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => run(true));
    window.visualViewport.addEventListener('scroll', syncChromeTop);
  }

  window.PeaklogicMobileViewport = {
    run,
    syncChromeTop,
    isMobileLayout,
    refreshViewportMeta,
    shortSide,
  };
})();
