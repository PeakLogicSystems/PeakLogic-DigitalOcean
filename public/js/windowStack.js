'use strict';

/** Z-order for floating panels and modal popups — Front / Back controls. */
window.MvWindowStack = (function () {
  const BASE = 210;
  const MAX = 399;
  let seq = BASE;
  /** @type {HTMLElement[]} */
  const order = [];

  function indexOf(el) {
    return order.indexOf(el);
  }

  function renormalize() {
    seq = BASE;
    order.forEach((node) => {
      seq += 1;
      node.style.zIndex = String(seq);
    });
  }

  function bringToFront(el) {
    if (!el) return;
    const i = indexOf(el);
    if (i >= 0) order.splice(i, 1);
    order.push(el);
    seq = Math.min(seq + 1, MAX);
    el.style.zIndex = String(seq);
    if (seq >= MAX - 10) renormalize();
  }

  function sendToBack(el) {
    if (!el) return;
    const i = indexOf(el);
    if (i >= 0) order.splice(i, 1);
    order.unshift(el);
    renormalize();
  }

  /** Prefer fixed chrome on body; fall back to modal shell. */
  function resolveTarget(root) {
    if (!root) return null;
    if (root.classList?.contains('popup-chrome')) return root;
    if (root.id && root.classList?.contains('popup-chrome-floater')) return root;
    if (root.classList?.contains('app-popup')) {
      const chrome = root.querySelector('.popup-chrome');
      if (chrome && getComputedStyle(chrome).position === 'fixed') return chrome;
      return root;
    }
    return root;
  }

  function controlsHost(el) {
    return el.querySelector('.popup-header-actions')
      || el.querySelector('.popup-header')
      || el.querySelector('[data-floater-drag-handle], [data-hmi-drag-handle], [data-live-io-drag-handle]');
  }

  function ensureControls(root) {
    const el = resolveTarget(root);
    if (!el) return null;
    if (indexOf(el) < 0) order.push(el);

    if (el.dataset.stackBound !== '1') {
      el.dataset.stackBound = '1';
      const host = controlsHost(el);
      if (host) {
        const wrap = document.createElement('div');
        wrap.className = 'window-stack-controls';
        wrap.innerHTML = [
          '<button type="button" class="btn btn-sm" data-window-front title="Bring to front">Front</button>',
          '<button type="button" class="btn btn-sm" data-window-back title="Send to back">Back</button>',
        ].join('');
        host.insertBefore(wrap, host.firstChild);
      }
      el.addEventListener('mousedown', (e) => {
        if (e.target.closest('[data-window-front], [data-window-back]')) return;
        if (e.target.closest('button, a, input, select, textarea, label')) return;
        bringToFront(el);
      }, true);
      el.querySelector('[data-window-front]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        bringToFront(el);
      });
      el.querySelector('[data-window-back]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendToBack(el);
      });
    }
    return el;
  }

  function register(root) {
    return ensureControls(root);
  }

  function onOpen(root) {
    const el = ensureControls(root);
    if (el) bringToFront(el);
  }

  return { register, onOpen, bringToFront, sendToBack, ensureControls, BASE };
})();
