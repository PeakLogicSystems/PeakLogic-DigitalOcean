'use strict';

/** Draggable / resizable floating tool windows (ST program, Force, Live I/O, …). */
window.MvFloater = (function () {
  function pointerXY(e) {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function primaryButton(e) {
    return e.button === undefined || e.button === 0;
  }

  function create(opts) {
    const {
      chromeId,
      popupName,
      layoutKey,
      minW = 280,
      minH = 200,
      defaultW = 420,
      defaultH = 360,
      defaultLeft = 12,
      defaultTop = 64,
      shellStubClass,
      sizedClass,
      onOpen,
      onClose,
      migrateLayout,
    } = opts;

    let drag = null;
    let resize = null;

    function chrome() {
      return document.getElementById(chromeId);
    }

    function shell() {
      return document.querySelector(`[data-popup="${popupName}"]`);
    }

    function mount() {
      const el = chrome();
      if (!el || el.dataset.mvFloater === '1') return;
      document.body.appendChild(el);
      el.dataset.mvFloater = '1';
      const stub = shell();
      if (stub) stub.classList.add('view-hidden', shellStubClass);
    }

    function isOpen() {
      const el = chrome();
      return !!(el && !el.classList.contains('view-hidden'));
    }

    function clampSize(width, height) {
      return {
        width: Math.max(minW, Math.min(window.innerWidth - 16, width)),
        height: Math.max(minH, Math.min(window.innerHeight - 48, height)),
      };
    }

    function clampPos(left, top, width, height) {
      const pad = 8;
      const maxL = Math.max(pad, window.innerWidth - width - pad);
      const maxT = Math.max(48, window.innerHeight - height - pad);
      return {
        left: Math.min(Math.max(pad, left), maxL),
        top: Math.min(Math.max(48, top), maxT),
      };
    }

    function applyLayout(layout) {
      const el = chrome();
      if (!el || !layout) return;
      const size = clampSize(Number(layout.width) || defaultW, Number(layout.height) || defaultH);
      const pos = clampPos(
        Number(layout.left) ?? defaultLeft,
        Number(layout.top) ?? defaultTop,
        size.width,
        size.height
      );
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.right = 'auto';
      el.classList.add(sizedClass);
    }

    function currentLayout() {
      const el = chrome();
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    function readLayout() {
      try {
        const raw = sessionStorage.getItem(layoutKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (migrateLayout) return migrateLayout(parsed);
          return parsed;
        }
      } catch { /* ignore */ }
      return {
        left: defaultLeft,
        top: defaultTop,
        width: defaultW,
        height: defaultH,
      };
    }

    function saveLayout() {
      const el = chrome();
      if (!el || el.classList.contains('view-hidden')) return;
      const rect = el.getBoundingClientRect();
      try {
        sessionStorage.setItem(layoutKey, JSON.stringify({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }));
      } catch { /* ignore */ }
    }

    function clampOnResize() {
      if (!isOpen()) return;
      const layout = currentLayout();
      if (layout) applyLayout(layout);
    }

    function dragMove(e) {
      if (!drag) return;
      const el = chrome();
      if (!el) return;
      const { x, y } = pointerXY(e);
      const pos = clampPos(
        drag.ox + x - drag.sx,
        drag.oy + y - drag.sy,
        drag.width,
        drag.height
      );
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.right = 'auto';
      if (e.cancelable) e.preventDefault();
    }

    function dragEnd() {
      if (!drag) return;
      const el = chrome();
      drag = null;
      el?.querySelector('[data-floater-drag-handle]')?.classList.remove('hmi-dragging');
      el?.querySelector('.popup-header-draggable')?.classList.remove('popup-dragging');
      document.removeEventListener('mousemove', dragMove, true);
      document.removeEventListener('mouseup', dragEnd, true);
      document.removeEventListener('touchmove', dragMove, { capture: true });
      document.removeEventListener('touchend', dragEnd, true);
      document.removeEventListener('touchcancel', dragEnd, true);
      saveLayout();
    }

    function resizeMove(e) {
      if (!resize) return;
      const el = chrome();
      if (!el) return;
      const { x, y } = pointerXY(e);
      const dx = x - resize.sx;
      const dy = y - resize.sy;
      const dir = resize.dir;
      let width = resize.width;
      let height = resize.height;
      let left = resize.left;
      const top = resize.top;
      if (dir.includes('e')) width = resize.width + dx;
      if (dir.includes('w')) width = resize.width - dx;
      if (dir.includes('s')) height = resize.height + dy;
      const size = clampSize(width, height);
      if (dir.includes('w')) left = resize.left + (resize.width - size.width);
      const pos = clampPos(left, top, size.width, size.height);
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.right = 'auto';
      el.classList.add(sizedClass);
      if (e.cancelable) e.preventDefault();
    }

    function resizeEnd() {
      if (!resize) return;
      const el = chrome();
      resize = null;
      el?.classList.remove('popup-resizing');
      document.removeEventListener('mousemove', resizeMove, true);
      document.removeEventListener('mouseup', resizeEnd, true);
      document.removeEventListener('touchmove', resizeMove, { capture: true });
      document.removeEventListener('touchend', resizeEnd, true);
      document.removeEventListener('touchcancel', resizeEnd, true);
      saveLayout();
    }

    function onResizeStart(e, handleEl) {
      const el = chrome();
      const handle = handleEl || e.currentTarget;
      if (!el || !handle?.dataset?.resize || drag || resize || !isOpen()) return false;
      if (!primaryButton(e)) return false;
      window.MvWindowStack?.bringToFront(el);
      const rect = el.getBoundingClientRect();
      applyLayout({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height || defaultH,
      });
      const { x, y } = pointerXY(e);
      resize = {
        dir: handle.dataset.resize || 'se',
        sx: x,
        sy: y,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      el.classList.add('popup-resizing');
      document.addEventListener('mousemove', resizeMove, true);
      document.addEventListener('mouseup', resizeEnd, true);
      document.addEventListener('touchmove', resizeMove, { capture: true, passive: false });
      document.addEventListener('touchend', resizeEnd, true);
      document.addEventListener('touchcancel', resizeEnd, true);
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      return false;
    }

    function onDragStart(e) {
      const el = chrome();
      if (!el || drag || resize || !isOpen()) return false;
      if (!primaryButton(e)) return false;
      window.MvWindowStack?.bringToFront(el);
      if (e.target?.closest?.('button, a, input, select, textarea, label')) return false;
      const rect = el.getBoundingClientRect();
      applyLayout({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height || defaultH,
      });
      const { x, y } = pointerXY(e);
      drag = {
        sx: x,
        sy: y,
        ox: rect.left,
        oy: rect.top,
        width: rect.width,
        height: rect.height,
      };
      el.querySelector('[data-floater-drag-handle]')?.classList.add('hmi-dragging');
      el.querySelector('.popup-header-draggable')?.classList.add('popup-dragging');
      document.addEventListener('mousemove', dragMove, true);
      document.addEventListener('mouseup', dragEnd, true);
      document.addEventListener('touchmove', dragMove, { capture: true, passive: false });
      document.addEventListener('touchend', dragEnd, true);
      document.addEventListener('touchcancel', dragEnd, true);
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      return false;
    }

    function bind() {
      mount();
      const el = chrome();
      if (!el || el.dataset.floaterBound === '1') return;
      el.dataset.floaterBound = '1';
      el.querySelector('[data-floater-drag-handle]')?.addEventListener('mousedown', onDragStart);
      el.querySelector('[data-floater-drag-handle]')?.addEventListener('touchstart', onDragStart, { passive: false });
      const header = el.querySelector('.popup-header-draggable');
      header?.addEventListener('mousedown', onDragStart);
      header?.addEventListener('touchstart', onDragStart, { passive: false });
      el.querySelectorAll('[data-resize]').forEach((handle) => {
        handle.addEventListener('mousedown', (ev) => onResizeStart(ev, handle));
        handle.addEventListener('touchstart', (ev) => onResizeStart(ev, handle), { passive: false });
      });
    }

    function open() {
      mount();
      const el = chrome();
      if (!el) return;
      applyLayout(readLayout());
      el.classList.remove('view-hidden');
      window.MvWindowStack?.onOpen(el);
      onOpen?.();
    }

    function close() {
      const el = chrome();
      if (!el) return;
      saveLayout();
      el.classList.add('view-hidden');
      onClose?.();
    }

    return {
      bind, open, close, isOpen, clampOnResize, mount,
    };
  }

  return { create, pointerXY, primaryButton };
})();
