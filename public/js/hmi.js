'use strict';

/**
 * PeakLogic HMI — load SVG/GIF/PNG screens, layout, and tag bindings.
 */
(function (global) {
  // User zoom for the live display viewport (mobile readability / tap targets).
  // 1 = fit-to-viewport (default). Higher values enlarge the screen using real
  // layout (crisp text, accurate hit areas) while the viewport scrolls/pans.
  let liveDisplayZoom = 1;
  let liveDisplayCtx = null;

  function isLiveDisplayViewport(container) {
    return !!(container && container.classList
      && container.classList.contains('hmi-viewport-live'));
  }

  function isPidFaceplateAssetPath(assetPath) {
    return /pid-faceplates|pid_loop_standard/i.test(String(assetPath || ''));
  }

  function isMotorFaceplateAssetPath(assetPath) {
    return /motor-faceplates|motor_hoa/i.test(String(assetPath || ''));
  }

  function isTpoFaceplateAssetPath(assetPath) {
    return /schedules\/peaklogic\/tpo_daily|tpo_daily/i.test(String(assetPath || ''));
  }

  function isPoolFaceplateAssetPath(assetPath) {
    return /pool-faceplates|pool_(overview|pump|chemistry|backwash|controller|lighting)/i.test(String(assetPath || ''));
  }

  function poolCompositeIdFromAssetPath(assetPath) {
    const p = String(assetPath || '');
    if (/pool_pump/i.test(p)) return 'pool_pump';
    if (/pool_chemistry/i.test(p)) return 'pool_chemistry';
    if (/pool_backwash/i.test(p)) return 'pool_backwash';
    if (/pool_lighting/i.test(p)) return 'pool_lighting';
    if (/pool_controller/i.test(p)) return 'pool_controller';
    return 'pool_overview';
  }

  function isAlternatorFaceplateAssetPath(assetPath) {
    return /alternator-faceplates|\/alternator\.svg|@composite\/alternator/i.test(String(assetPath || ''));
  }

  function isAlarmListAssetPath(assetPath) {
    return /\/composites\/alarm_list(?:\.svg|\.json)?|@composite\/alarm_list/i.test(String(assetPath || ''));
  }

  function isCompositeFaceplateAssetPath(assetPath) {
    return isPidFaceplateAssetPath(assetPath)
      || isMotorFaceplateAssetPath(assetPath)
      || isTpoFaceplateAssetPath(assetPath)
      || isPoolFaceplateAssetPath(assetPath)
      || isAlternatorFaceplateAssetPath(assetPath);
  }

  function effectiveLiveValue(entry) {
    if (!entry || typeof entry !== 'object') return undefined;
    if (entry.forceInput || entry.forceOutput) {
      const fv = entry.forceValue;
      if (fv !== undefined && fv !== null && fv !== '') return fv;
    }
    if ('value' in entry) return entry.value;
    return undefined;
  }

  function wiredAnalogFromMap(liveMap, tagId) {
    if (!tagId || !liveMap) return null;
    const e = liveMap[tagId];
    if (!e) return null;
    const v = effectiveLiveValue(e);
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function inferPidTagField(elementId) {
    const s = String(elementId || '').toLowerCase();
    if (s.includes('loop_label') || s.includes('hmi_label')) return 'label';
    if (s.includes('pv_value') || s.includes('pv_needle') || s.endsWith('__pv_dial')) return 'pv';
    if (s.includes('sp_value')) return 'sp';
    if (s.includes('out_value') || s.includes('out_bar')) return 'out';
    if (s.includes('mode_manual')) return 'manual';
    if (s.includes('mode_auto')) return 'auto';
    if (s.includes('alarm_hi')) return 'alarmHi';
    if (s.includes('alarm_lo')) return 'alarmLo';
    return '';
  }

  function tagValue(liveMap, tagId, tagField) {
    const e = liveMap?.[tagId];
    if (!e) return undefined;
    const field = String(tagField || '').trim();
    if (field === 'label') {
      const text = String(e.label ?? '').trim();
      return text || e.tagId || tagId || '';
    }
    if (field && e.type === 'PID') {
      const fb = e.fb && typeof e.fb === 'object' ? e.fb : {};
      if (field === 'pv') {
        return wiredAnalogFromMap(liveMap, fb.pvId) ?? fb.pv ?? 0;
      }
      if (field === 'sp') {
        return wiredAnalogFromMap(liveMap, fb.spId) ?? fb.sp ?? e.preset ?? 0;
      }
      if (field === 'out') {
        if (e.forceOutput) {
          const fv = Number(e.forceValue);
          if (Number.isFinite(fv)) return fv;
        }
        return wiredAnalogFromMap(liveMap, fb.outId) ?? fb.out ?? effectiveLiveValue(e) ?? 0;
      }
      if (field === 'auto') return fb.enabled !== false;
      if (field === 'manual') return fb.enabled === false;
      if (field === 'alarmHi') {
        const hiId = fb.alarmHiId;
        if (hiId && liveMap[hiId]) return !!effectiveLiveValue(liveMap[hiId]);
        return !!fb.alarmHi;
      }
      if (field === 'alarmLo') {
        const loId = fb.alarmLoId;
        if (loId && liveMap[loId]) return !!effectiveLiveValue(liveMap[loId]);
        return !!fb.alarmLo;
      }
      if (field === 'err') return fb.err ?? 0;
    }
    if (field && e.type === 'TIMER') {
      const fb = e.fb && typeof e.fb === 'object' ? e.fb : {};
      if (field === 'running') return !!fb.running;
      if (field === 'done') return !!fb.done;
      if (field === 'elapsed') return fb.elapsed ?? 0;
    }
    if (field && e.type === 'ALT') {
      const fb = e.fb && typeof e.fb === 'object' ? e.fb : {};
      if (field === 'label') {
        const text = String(e.label ?? '').trim();
        return text || e.tagId || tagId || '';
      }
      if (field === 'activeUnit') return fb.activeUnit ?? 0;
      if (field === 'fault') return !!fb.fault;
      if (field === 'offActive') return !!fb.offActive;
      if (field === 'highActive') return !!fb.highActive;
      if (field === 'lowActive') return !!fb.lowActive;
      if (field === 'low2Active') return !!fb.low2Active;
      if (field === 'pumpStage') return String(fb.pumpStage || 'normal');
      if (field === 'ready') return !!fb.ready;
    }
    if (e && typeof e === 'object' && 'value' in e) return effectiveLiveValue(e);
    return e;
  }

  function bindingTagValue(binding, liveMap) {
    const field = binding?.tagField || (liveMap?.[binding?.tagId]?.type === 'PID'
      ? inferPidTagField(binding?.elementId)
      : '');
    return tagValue(liveMap, binding?.tagId, field);
  }

  function isTruthy(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return !!v;
  }

  function normalizeFlashStateMode(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'amber' || v === 'yellow') return 'amber';
    if (v === 'red') return 'red';
    return 'hidden';
  }

  function applyFlashOverlayState(el, mode) {
    if (!el?.classList?.contains('hmi-flash-overlay')) return;
    const m = normalizeFlashStateMode(mode);
    if (el.dataset.hmiFlashMode === m) return;
    el.dataset.hmiFlashMode = m;
    el.classList.remove('hmi-flash-overlay--red', 'hmi-flash-overlay--amber');
    if (m === 'hidden') {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.classList.add(m === 'amber' ? 'hmi-flash-overlay--amber' : 'hmi-flash-overlay--red');
  }

  function flashStateModeFromBinding(binding, liveMap) {
    const le = liveMap?.[binding?.tagId];
    if (le?.alarmAcked) return 'hidden';
    const tagType = String(le?.type || '').toUpperCase();
    if (tagType === 'INT' || tagType === 'REAL') {
      const v = bindingTagValue(binding, liveMap);
      const idx = state3Index(v, binding);
      return ['hidden', 'red', 'amber'][idx] || 'hidden';
    }
    const on = isTruthy(bindingTagValue(binding, liveMap));
    return normalizeFlashStateMode(on ? binding.onValue : binding.offValue);
  }

  function paintTargets(el, binding) {
    if (!el) return [];
    const tag = el.tagName?.toLowerCase() || '';
    let list = [];
    if (tag === 'g' || tag === 'svg') {
      list = [...el.querySelectorAll('circle, rect, polygon, path, ellipse, line, polyline')];
    } else if (/^(circle|rect|polygon|path|ellipse|line|polyline)$/.test(tag)) {
      list = [el];
    } else {
      list = [el];
    }
    const prop = binding?.property;
    if (prop === 'fill' || prop === 'fill5' || prop === 'fill8' || prop === 'backgroundFill') {
      list = list.filter((t) => !/^(line|polyline)$/i.test(t.tagName));
      list = list.filter((t) => {
        if (t.tagName?.toLowerCase() !== 'circle') return true;
        const r = parseFloat(String(t.getAttribute('r') || '').replace(/px$/i, ''));
        return !Number.isFinite(r) || r > 8;
      });
    }
    return list;
  }

  function setPaintOnTarget(t, attr, value) {
    const color = String(value ?? '').trim();
    if (!color) return;
    try {
      t.setAttribute(attr, color);
      if (t.namespaceURI === 'http://www.w3.org/2000/svg') {
        t.setAttributeNS(null, attr, color);
      }
    } catch { /* ignore */ }
    try {
      t.style.setProperty(attr, color, 'important');
    } catch { /* ignore */ }
  }

  function setPaint(el, attr, value, binding) {
    for (const t of paintTargets(el, binding)) setPaintOnTarget(t, attr, value);
  }

  function parseHexColor(hex) {
    const s = String(hex || '').trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function lerpHexColor(offHex, onHex, t) {
    const a = parseHexColor(offHex) || parseHexColor('#94a3b8');
    const b = parseHexColor(onHex) || parseHexColor('#22c55e');
    const u = Math.max(0, Math.min(1, Number(t) || 0));
    const r = Math.round(a.r + (b.r - a.r) * u);
    const g = Math.round(a.g + (b.g - a.g) * u);
    const bl = Math.round(a.b + (b.b - a.b) * u);
    return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }

  function analogFillT(v, binding) {
    if (typeof v === 'boolean') return null;
    const n = scaledNumeric(v, binding);
    if (n == null) return null;
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 100;
    if (max === min) return isTruthy(v) ? 1 : 0;
    const boolish = (v === 0 || v === 1 || v === '0' || v === '1')
      && n >= min && n <= min + 1 && max - min > 1;
    if (boolish) return null;
    return Math.max(0, Math.min(1, (n - min) / (max - min)));
  }

  function applyFillOrStrokeColor(el, binding, color) {
    const strokeMode = binding.property === 'stroke';
    const gTag = el?.tagName?.toLowerCase();
    if (gTag === 'g' && String(el.getAttribute('fill') || '').includes('url(')) {
      el.setAttribute('fill', 'none');
      try { el.style.fill = 'none'; } catch { /* ignore */ }
    }
    for (const t of paintTargets(el, binding)) {
      const fill = (t.getAttribute('fill') || '').toLowerCase();
      const tag = t.tagName?.toLowerCase() || '';
      const useStroke = strokeMode || fill === 'none' || tag === 'line' || tag === 'polyline';
      if (useStroke) setPaintOnTarget(t, 'stroke', color);
      if (!strokeMode) setPaintOnTarget(t, 'fill', color);
    }
  }

  function applyFillOrStroke(el, binding, on) {
    const color = on ? binding.onValue : binding.offValue;
    applyFillOrStrokeColor(el, binding, color);
  }

  function asNumber(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  const trendSampleBuffers = new Map();

  function trendBindingKey(binding) {
    const tagId = binding?.tagId || '';
    const field = binding?.tagField || binding?.elementId || '';
    return `${tagId}:${field}`;
  }

  function trendSampleLimit(binding) {
    const n = Number(binding?.samples);
    return Number.isFinite(n) && n >= 2 ? Math.min(Math.max(Math.floor(n), 2), 512) : 64;
  }

  function clearTrendBuffers() {
    trendSampleBuffers.clear();
  }

  function tagTrendScaleLimits(tag) {
    if (!tag || typeof tag !== 'object') return null;
    const ol = Number(tag.alarmOuterLow);
    const oh = Number(tag.alarmOuterHigh);
    if (Number.isFinite(ol) && Number.isFinite(oh) && oh !== ol) {
      return { min: ol, max: oh };
    }
    const il = Number(tag.alarmInnerLow);
    const ih = Number(tag.alarmInnerHigh);
    if (Number.isFinite(il) && Number.isFinite(ih) && ih !== il) {
      return { min: il, max: ih };
    }
    return null;
  }

  function resolveTrendHistoryTagId(binding, liveMap) {
    const tag = liveMap?.[binding?.tagId];
    if (binding?.tagField && tag?.type === 'PID') {
      const fb = tag.fb && typeof tag.fb === 'object' ? tag.fb : {};
      if (binding.tagField === 'pv' && fb.pvId) return fb.pvId;
      if (binding.tagField === 'sp' && fb.spId) return fb.spId;
      if (binding.tagField === 'out' && fb.outId) return fb.outId;
    }
    return binding?.tagId || '';
  }

  function syncTrendBuffersFromHistory(history, bindings, liveMap) {
    if (!history || !bindings?.length) return;
    for (const b of bindings) {
      if (b.property !== 'trend') continue;
      const key = trendBindingKey(b);
      const existing = trendSampleBuffers.get(key);
      if (existing?.length) continue;
      const tagId = resolveTrendHistoryTagId(b, liveMap);
      const pts = history[tagId];
      if (!pts?.length) continue;
      const limit = trendSampleLimit(b);
      const vals = pts.slice(-limit)
        .map((p) => asNumber(p?.value))
        .filter((v) => v != null);
      if (vals.length) trendSampleBuffers.set(key, vals);
    }
  }

  function pushTrendSample(binding, value) {
    const key = trendBindingKey(binding);
    const limit = trendSampleLimit(binding);
    let buf = trendSampleBuffers.get(key);
    if (!buf) {
      buf = [];
      trendSampleBuffers.set(key, buf);
    }
    const n = scaledNumeric(value, binding);
    if (n == null) return buf;
    buf.push(n);
    while (buf.length > limit) buf.shift();
    return buf;
  }

  function findStripBackground(polylineEl) {
    const grp = polylineEl?.parentElement;
    if (grp?.querySelector) {
      const inGrp = grp.querySelector('[id$="__strip_bg"], #strip_bg');
      if (inGrp) return inGrp;
    }
    const svg = polylineEl?.closest?.('svg');
    return svg?.querySelector?.('[id$="__strip_bg"], #strip_bg') || null;
  }

  function findGaugeBackground(el) {
    const svg = el?.closest?.('svg');
    return svg?.querySelector?.('[id$="__gauge_bg"], #gauge_bg') || null;
  }

  function findChartBackground(svg) {
    if (!svg?.querySelector) return null;
    return svg.querySelector('[id$="__strip_bg"], #strip_bg, [id$="__gauge_bg"], #gauge_bg');
  }

  const DEFAULT_CHART_SCALE = {
    show: true,
    min: 0,
    max: 100,
    divisions: 5,
    labelColor: '#64748b',
    tickColor: '#94a3b8',
  };

  function normalizeChartScale(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const minRaw = src.min;
    const maxRaw = src.max;
    const divisionsRaw = src.divisions;
    const min = minRaw != null && minRaw !== '' ? Number(minRaw) : NaN;
    const max = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : NaN;
    const divisions = divisionsRaw != null && divisionsRaw !== '' ? Number(divisionsRaw) : NaN;
    return {
      show: src.show !== false,
      min: Number.isFinite(min) ? min : DEFAULT_CHART_SCALE.min,
      max: Number.isFinite(max) ? max : DEFAULT_CHART_SCALE.max,
      divisions: Number.isFinite(divisions)
        ? Math.max(2, Math.min(20, Math.floor(divisions)))
        : DEFAULT_CHART_SCALE.divisions,
      labelColor: /^#[0-9a-f]{6}$/i.test(String(src.labelColor || ''))
        ? String(src.labelColor).trim()
        : DEFAULT_CHART_SCALE.labelColor,
      tickColor: /^#[0-9a-f]{6}$/i.test(String(src.tickColor || ''))
        ? String(src.tickColor).trim()
        : DEFAULT_CHART_SCALE.tickColor,
    };
  }

  function formatChartScaleLabel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
    if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
    return n.toFixed(1);
  }

  function applyChartScale(svg, chartScale) {
    if (!svg) return;
    const scale = normalizeChartScale(chartScale);
    const existing = svg.querySelector('g.hmi-chart-scale');
    if (!scale.show) {
      existing?.remove();
      return;
    }
    const bg = findChartBackground(svg);
    const plotBox = stripPlotBoxFromBg(bg, svg);
    const pad = 2;
    const top = plotBox.y + pad;
    const bottom = plotBox.y + plotBox.height - pad;
    const plotH = Math.max(1, bottom - top);
    const axisX = plotBox.x - 2;
    const tickLen = 4;
    const labelX = 2;
    let g = existing;
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'hmi-chart-scale');
      g.setAttribute('pointer-events', 'none');
      svg.insertBefore(g, svg.firstChild);
    }
    g.innerHTML = '';
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', String(axisX));
    axis.setAttribute('x2', String(axisX));
    axis.setAttribute('y1', String(top));
    axis.setAttribute('y2', String(bottom));
    axis.setAttribute('stroke', scale.tickColor);
    axis.setAttribute('stroke-width', '1');
    axis.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(axis);
    const span = scale.max - scale.min || 1;
    for (let i = 0; i <= scale.divisions; i++) {
      const frac = i / scale.divisions;
      const y = top + frac * plotH;
      const val = scale.max - frac * span;
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', String(axisX - tickLen));
      tick.setAttribute('x2', String(axisX));
      tick.setAttribute('y1', String(y));
      tick.setAttribute('y2', String(y));
      tick.setAttribute('stroke', scale.tickColor);
      tick.setAttribute('stroke-width', '1');
      tick.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(tick);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(labelX));
      label.setAttribute('y', String(y + 3));
      label.setAttribute('fill', scale.labelColor);
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'system-ui, sans-serif');
      label.setAttribute('text-anchor', 'start');
      label.textContent = formatChartScaleLabel(val);
      g.appendChild(label);
    }
  }

  function isGaugeColumnSvg(svg) {
    return !!svg?.querySelector?.('[id$="__gauge_bg"], #gauge_bg')
      && !!svg.querySelector('[id*="gauge_col"]');
  }

  function gaugeColumnIndexFromElement(el) {
    const m = String(el?.id || '').match(/gauge_col(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  function gaugeColumnGradientId(index) {
    return `hmi_col_grad_${index}`;
  }

  function ensureGaugeColumnGradient(svg, index) {
    const gradId = gaugeColumnGradientId(index);
    let grad = svg.querySelector(`#${gradId}`);
    if (grad) return grad;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '1');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '0');
    defs.appendChild(grad);
    return grad;
  }

  function paintGaugeColumnGradient(el, fillColor, emptyColor, t) {
    const svg = el?.ownerSVGElement || el?.closest?.('svg');
    if (!svg) return;
    const idx = gaugeColumnIndexFromElement(el);
    if (!idx) return;
    const grad = ensureGaugeColumnGradient(svg, idx);
    const pct = Math.max(0, Math.min(100, (Number(t) || 0) * 100));
    const fill = fillColor || '#22c55e';
    const empty = emptyColor || '#e2e8f0';
    grad.innerHTML = '';
    const addStop = (offset, color) => {
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop.setAttribute('offset', `${offset}%`);
      stop.setAttribute('stop-color', color);
      grad.appendChild(stop);
    };
    addStop(0, fill);
    addStop(pct, fill);
    addStop(pct, empty);
    addStop(100, empty);
    const target = el.tagName?.toLowerCase() === 'rect' ? el : el.querySelector('rect') || el;
    target.setAttribute('fill', `url(#${grad.id})`);
    try { target.style.fill = `url(#${grad.id})`; } catch { /* ignore */ }
  }

  function effectiveFillBinding(binding, liveMap) {
    if (!binding?.useTagScale) return binding;
    const tag = liveMap?.[binding?.tagId];
    const limits = tagTrendScaleLimits(tag);
    if (!limits) return binding;
    return { ...binding, min: limits.min, max: limits.max };
  }

  function applyGaugeColumnPenVisibility(svg, columnCount) {
    if (!svg) return;
    const n = Math.max(1, Math.min(8, Number(columnCount) || 1));
    for (let i = 1; i <= 8; i++) {
      const el = svg.querySelector(`[id$="__gauge_col${i}"], #gauge_col${i}`);
      if (!el) continue;
      const show = i <= n;
      el.style.display = show ? '' : 'none';
      el.style.visibility = show ? 'visible' : 'hidden';
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function stripPlotBoxFromBg(bg, svg) {
    if (bg) {
      const tag = bg.tagName?.toLowerCase();
      if (tag === 'rect') {
        return {
          x: Number(bg.getAttribute('x') || 0),
          y: Number(bg.getAttribute('y') || 0),
          width: Number(bg.getAttribute('width') || 200),
          height: Number(bg.getAttribute('height') || 100),
        };
      }
      try {
        const bb = bg.getBBox();
        if (bb.width > 0 && bb.height > 0) {
          return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
        }
      } catch { /* ignore */ }
    }
    const vb = svg?.viewBox?.baseVal;
    if (vb && vb.width > 0) {
      return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    }
    return { x: 0, y: 0, width: 200, height: 100 };
  }

  function trendValueToY(value, binding, top, plotH) {
    const min = Number(binding?.min ?? 0);
    const max = Number(binding?.max ?? 100);
    const span = max - min || 1;
    const t = Math.max(0, Math.min(1, (value - min) / span));
    return top + (1 - t) * plotH;
  }

  function buildTrendPoints(samples, binding, plotBox) {
    const pad = 2;
    const left = plotBox.x + pad;
    const right = plotBox.x + plotBox.width - pad;
    const top = plotBox.y + pad;
    const bottom = plotBox.y + plotBox.height - pad;
    const plotH = Math.max(1, bottom - top);
    const width = Math.max(1, right - left);
    if (!samples.length) {
      const mid = top + plotH / 2;
      return `${left.toFixed(1)},${mid.toFixed(1)} ${right.toFixed(1)},${mid.toFixed(1)}`;
    }
    if (samples.length === 1) {
      const py = trendValueToY(samples[0], binding, top, plotH);
      return `${left.toFixed(1)},${py.toFixed(1)} ${right.toFixed(1)},${py.toFixed(1)}`;
    }
    const pts = [];
    for (let i = 0; i < samples.length; i++) {
      const px = left + (i / (samples.length - 1)) * width;
      const py = trendValueToY(samples[i], binding, top, plotH);
      pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return pts.join(' ');
  }

  function effectiveTrendBinding(binding, liveMap) {
    if (!binding?.useTagScale) return binding;
    const tagId = resolveTrendHistoryTagId(binding, liveMap);
    const tag = liveMap?.[tagId] || liveMap?.[binding?.tagId];
    const limits = tagTrendScaleLimits(tag);
    if (!limits) return binding;
    return { ...binding, min: limits.min, max: limits.max };
  }

  function applyStripChartPenVisibility(svg, penCount) {
    if (!svg) return;
    const n = Math.max(1, Math.min(8, Number(penCount) || 1));
    for (let i = 1; i <= 8; i++) {
      const el = svg.querySelector(`[id$="__trend_pen${i}"], #trend_pen${i}`);
      if (!el) continue;
      const show = i <= n;
      el.style.display = show ? '' : 'none';
      el.style.visibility = show ? 'visible' : 'hidden';
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function findPushButtonStyleElement(svg, suffix) {
    if (!svg) return null;
    return svg.querySelector(`[id$="__${suffix}"], #${suffix}`);
  }

  function applyPushButtonStyle(svg, pushButton) {
    if (!svg || !pushButton?.colors) return;
    const colors = pushButton.colors;
    const background = String(colors.background || '').trim();
    const text = String(colors.text || '').trim();
    const bezel = String(colors.bezel || '').trim();
    const bezelEl = findPushButtonStyleElement(svg, 'button_bezel');
    const faceEl = findPushButtonStyleElement(svg, 'button');
    const textEl = findPushButtonStyleElement(svg, 'button_text')
      || svg.querySelector('text:not([id*="bezel"])');
    if (bezelEl && /^#[0-9a-f]{6}$/i.test(bezel)) setPaintOnTarget(bezelEl, 'fill', bezel);
    if (faceEl && /^#[0-9a-f]{6}$/i.test(background)) setPaintOnTarget(faceEl, 'fill', background);
    if (textEl && /^#[0-9a-f]{6}$/i.test(text)) {
      setPaintOnTarget(textEl, 'fill', text);
      setPaintOnTarget(textEl, 'stroke', text);
    }
  }

  function findPilotLightLampElement(svg) {
    if (!svg) return null;
    return svg.querySelector('[id$="__lamp"], #lamp');
  }

  function applyPilotLightStyle(svg, pilotLight) {
    if (!svg || !pilotLight) return;
    const lamp = findPilotLightLampElement(svg);
    if (!lamp) return;
    const colors = pilotLight.colors;
    if (pilotLight.kind === 'complex' && Array.isArray(colors)) {
      const off = String(colors[0] || '').trim();
      if (/^#[0-9a-f]{6}$/i.test(off)) applyPilotLampFill(lamp, null, off);
      return;
    }
    const off = String(colors?.off || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(off)) applyPilotLampFill(lamp, null, off);
  }

  function applyTrendBinding(el, binding, liveMap) {
    if (!el || el.tagName?.toLowerCase() !== 'polyline') return;
    const trendBinding = effectiveTrendBinding(binding, liveMap);
    const v = bindingTagValue(binding, liveMap);
    const samples = pushTrendSample(trendBinding, v);
    const svg = el.ownerSVGElement || el.closest('svg');
    const plotBox = stripPlotBoxFromBg(findStripBackground(el), svg);
    el.setAttribute('points', buildTrendPoints(samples, trendBinding, plotBox));
    const stroke = /^#[0-9a-f]{6}$/i.test(String(binding?.onValue || ''))
      ? binding.onValue
      : '#2563eb';
    el.setAttribute('stroke', stroke);
    try { el.style.stroke = stroke; } catch { /* ignore */ }
  }

  function stripInspectEsc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function trendPenIndexFromElement(el) {
    const m = String(el?.id || '').match(/trend_pen(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  function isStripChartSvg(svg) {
    return !!svg?.querySelector?.('[id$="__strip_bg"], #strip_bg')
      && !!svg.querySelector('polyline[id*="trend_pen"]');
  }

  function trendBindingsForStripSvg(svg, bindings) {
    const out = [];
    for (const binding of bindings || []) {
      if (binding.property !== 'trend') continue;
      for (const el of findBindingElements(svg, binding.elementId)) {
        if (el.tagName?.toLowerCase() !== 'polyline') continue;
        if (el.style.display === 'none' || el.style.visibility === 'hidden') continue;
        out.push({ el, binding, pen: trendPenIndexFromElement(el) });
      }
    }
    out.sort((a, b) => a.pen - b.pen);
    return out;
  }

  function svgPointFromClient(svg, evt) {
    if (!svg?.createSVGPoint || !svg.getScreenCTM) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function sampleIndexAtPlotX(x, plotBox, sampleCount) {
    const pad = 2;
    const left = plotBox.x + pad;
    const right = plotBox.x + plotBox.width - pad;
    const width = Math.max(1, right - left);
    const t = Math.max(0, Math.min(1, (x - left) / width));
    if (sampleCount <= 1) return 0;
    return Math.round(t * (sampleCount - 1));
  }

  function plotXForSampleIndex(idx, plotBox, sampleCount) {
    const pad = 2;
    const left = plotBox.x + pad;
    const right = plotBox.x + plotBox.width - pad;
    const width = Math.max(1, right - left);
    if (sampleCount <= 1) return left;
    return left + (idx / (sampleCount - 1)) * width;
  }

  function ensureStripInspectOverlay(svg) {
    let g = svg.querySelector('g.hmi-strip-inspect-overlay');
    if (g) return g;
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'hmi-strip-inspect-overlay');
    g.setAttribute('pointer-events', 'none');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'hmi-strip-inspect-line');
    line.setAttribute('stroke', '#64748b');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('stroke-dasharray', '4 4');
    line.setAttribute('visibility', 'hidden');
    g.appendChild(line);
    const markers = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markers.setAttribute('class', 'hmi-strip-inspect-markers');
    g.appendChild(markers);
    svg.appendChild(g);
    return g;
  }

  function clearStripChartHover(svg) {
    if (!svg) return;
    const g = svg.querySelector('g.hmi-strip-inspect-overlay');
    g?.querySelector('.hmi-strip-inspect-line')?.setAttribute('visibility', 'hidden');
    const markers = g?.querySelector('.hmi-strip-inspect-markers');
    if (markers) markers.innerHTML = '';
    const host = svg.closest('.hmi-tile-layer') || svg.parentElement;
    host?.querySelector('.hmi-strip-inspect-tooltip')?.remove();
    svg.classList.remove('hmi-strip-inspect-active');
    delete svg.dataset.stripInspectIdx;
  }

  function getStripChartHover(svg, bindings, liveMap, evt) {
    if (!isStripChartSvg(svg)) return null;
    const pens = trendBindingsForStripSvg(svg, bindings);
    if (!pens.length) return null;
    const bg = findStripBackground(pens[0].el);
    const plotBox = stripPlotBoxFromBg(bg, svg);
    const pt = svgPointFromClient(svg, evt);
    if (!pt) return null;
    const pad = 2;
    const left = plotBox.x + pad;
    const right = plotBox.x + plotBox.width - pad;
    const top = plotBox.y + pad;
    const bottom = plotBox.y + plotBox.height - pad;
    if (pt.x < left || pt.x > right || pt.y < top - 10 || pt.y > bottom + 10) return null;

    let bufLen = 0;
    for (const p of pens) {
      const buf = trendSampleBuffers.get(trendBindingKey(p.binding)) || [];
      bufLen = Math.max(bufLen, buf.length);
    }
    const sampleCount = Math.max(1, bufLen, ...pens.map((p) => trendSampleLimit(p.binding)));
    const idx = sampleIndexAtPlotX(pt.x, plotBox, sampleCount);
    const crossX = plotXForSampleIndex(idx, plotBox, sampleCount);
    const plotH = Math.max(1, bottom - top);
    const samples = pens.map((p) => {
      const trendBinding = effectiveTrendBinding(p.binding, liveMap);
      const buf = trendSampleBuffers.get(trendBindingKey(p.binding)) || [];
      const value = buf.length ? buf[Math.min(idx, buf.length - 1)] : null;
      const color = /^#[0-9a-f]{6}$/i.test(String(p.binding?.onValue || ''))
        ? p.binding.onValue
        : '#2563eb';
      return {
        pen: p.pen,
        tagId: p.binding.tagId,
        binding: p.binding,
        trendBinding,
        value,
        color,
        x: crossX,
        y: value != null ? trendValueToY(value, trendBinding, top, plotH) : null,
      };
    });
    return { idx, sampleCount, crossX, top, bottom, samples };
  }

  function renderStripChartHover(svg, hover, evt, liveMap) {
    if (!hover) {
      clearStripChartHover(svg);
      return;
    }
    const g = ensureStripInspectOverlay(svg);
    const line = g.querySelector('.hmi-strip-inspect-line');
    line.setAttribute('x1', String(hover.crossX));
    line.setAttribute('x2', String(hover.crossX));
    line.setAttribute('y1', String(hover.top));
    line.setAttribute('y2', String(hover.bottom));
    line.setAttribute('visibility', 'visible');
    const markers = g.querySelector('.hmi-strip-inspect-markers');
    markers.innerHTML = '';
    for (const s of hover.samples) {
      if (s.y == null) continue;
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(s.x));
      dot.setAttribute('cy', String(s.y));
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', s.color);
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '1.5');
      dot.setAttribute('vector-effect', 'non-scaling-stroke');
      markers.appendChild(dot);
    }
    const host = svg.closest('.hmi-tile-layer') || svg.parentElement;
    if (!host) return;
    let tip = host.querySelector('.hmi-strip-inspect-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'hmi-strip-inspect-tooltip';
      host.appendChild(tip);
    }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const rows = hover.samples.map((s) => {
      const label = s.tagId ? stripInspectEsc(s.tagId) : `Pen ${s.pen}`;
      const val = s.value != null ? stripInspectEsc(formatNumeric(s.value, s.trendBinding)) : '—';
      return `<div class="hmi-strip-inspect-row"><span class="hmi-strip-inspect-swatch" style="background:${stripInspectEsc(s.color)}"></span><span class="hmi-strip-inspect-tag">${label}</span><span class="hmi-strip-inspect-val">${val}</span></div>`;
    }).join('');
    tip.innerHTML = `<div class="hmi-strip-inspect-head">Sample ${hover.idx + 1} / ${hover.sampleCount}</div><div class="hmi-strip-inspect-rows">${rows}</div>`;
    tip.style.display = 'block';
    const layerRect = host.getBoundingClientRect();
    const x = Math.max(4, Math.min(evt.clientX - layerRect.left + 12, layerRect.width - 200));
    const y = Math.max(4, Math.min(evt.clientY - layerRect.top + 12, layerRect.height - 60));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    svg.classList.add('hmi-strip-inspect-active');
    svg.dataset.stripInspectIdx = String(hover.idx);
  }

  function bindStripChartInspect(svg, getBindings, getLiveMap) {
    if (!svg || svg.dataset.stripInspectBound === '1' || !isStripChartSvg(svg)) return;
    svg.dataset.stripInspectBound = '1';
    svg.classList.add('hmi-strip-chart');
    let raf = 0;
    const onMove = (evt) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const hover = getStripChartHover(svg, getBindings(), getLiveMap(), evt);
        const prev = svg.dataset.stripInspectIdx ?? '';
        const next = hover ? String(hover.idx) : '';
        renderStripChartHover(svg, hover, evt, getLiveMap());
        if (next !== prev) svg.dataset.stripInspectIdx = next;
      });
    };
    const onLeave = (evt) => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (evt.relatedTarget && svg.contains(evt.relatedTarget)) return;
      clearStripChartHover(svg);
    };
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', onLeave);
  }

  function markStripChartLayersInteractive(scope) {
    const root = scope?.querySelector?.('.hmi-tile-grid') || scope;
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.hmi-tile-layer.hmi-strip-chart-layer').forEach((layer) => {
      if (!layer.querySelector('svg.hmi-strip-chart')) {
        layer.classList.remove('hmi-strip-chart-layer');
        if (layer.dataset.kind !== 'navButton' && layer.dataset.kind !== 'pageHotspot' && layer.dataset.kind !== 'flashOverlay') layer.style.pointerEvents = '';
      }
    });
    root.querySelectorAll('svg.hmi-tile-asset').forEach((svg) => {
      if (!isStripChartSvg(svg)) return;
      const layer = svg.closest('.hmi-tile-layer');
      if (layer) {
        layer.classList.add('hmi-strip-chart-layer');
        layer.style.pointerEvents = 'auto';
      }
      svg.style.pointerEvents = 'auto';
      const wrap = svg.closest('.hmi-tile-asset-wrap');
      if (wrap) wrap.style.pointerEvents = 'auto';
    });
  }

  function wireStripChartInspectors(scope, bindings, liveMap) {
    const root = scope?.querySelector?.('.hmi-tile-grid') || scope;
    if (!root?.querySelectorAll) return;
    markStripChartLayersInteractive(scope);
    root.querySelectorAll('svg.hmi-tile-asset').forEach((svg) => {
      if (!isStripChartSvg(svg)) return;
      bindStripChartInspect(svg, () => bindings, () => liveMap);
    });
  }

  function scaledNumeric(v, binding) {
    const n = asNumber(v);
    if (n == null) return null;
    const min = Number(binding?.min);
    const max = Number(binding?.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max !== min) {
      return Math.max(min, Math.min(max, n));
    }
    return n;
  }

  const STATE3_TEXT_LABELS = ['Auto', 'Off', 'Hand'];

  const STATION_STA_LABELS = ['ONLINE', 'FAULT', 'WARNING', 'OFFLINE'];
  const STATION_STA_COLORS = ['#22c55e', '#ef4444', '#fbed20', '#64748b'];

  const STATE5_TEXT_LABELS = ['STOP', 'RUN', 'FAULT', 'WARN', 'OFFLINE'];
  const STATE5_TEXT_COLORS = ['#334155', '#334155', '#ef4444', '#ca8a04', '#94a3b8'];

  const TPO_STA_LABELS = ['IDLE', 'OFFLINE', 'APPLY', 'WAIT', 'OUTSIDE'];
  const TPO_STA_COLORS = ['#64748b', '#64748b', '#16a34a', '#f59e0b', '#94a3b8'];
  const POOL_BW_STA_LABELS = ['IDLE', 'BACKWASH', 'RINSE', 'RETURN', 'DONE'];
  const POOL_LIGHT_OP_LABELS = ['OFF', 'ALL ON', 'ZONE SEL', 'COLOR SET', 'SCHEDULE'];
  const POOL_LIGHT_COLOR_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const POOL_BW_STA_COLORS = ['#64748b', '#2563eb', '#06b6d4', '#f59e0b', '#22c55e'];
  const ALT_STAGE_LABELS = {
    off: 'OFF',
    high: 'HIGH',
    down: 'HIGH',
    lag: 'LAG',
    up: 'LAG',
    lag2: 'LAG2',
    normal: 'LEAD',
  };

  function altStageTextLabel(v) {
    const key = String(v ?? '').trim().toLowerCase();
    return ALT_STAGE_LABELS[key] || ALT_STAGE_LABELS.normal;
  }

  function hhmmFromMinutes(v) {
    const n = Math.max(0, Math.min(1439, Math.trunc(Number(v) || 0)));
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function dowTextLabel(v) {
    const i = Math.trunc(Number(v) || 0) % 7;
    return DOW_LABELS[i < 0 ? i + 7 : i] || String(v ?? '');
  }

  function hoursFromMinutes(v) {
    const n = Math.max(0, Number(v) || 0);
    return (n / 60).toFixed(1);
  }

  function parseHoursToMinutes(raw) {
    const n = Number(String(raw ?? '').trim());
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 60);
  }

  function parseHhmmToMinutes(raw) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || min >= 60 || h >= 24) return null;
    return h * 60 + min;
  }

  function tpoStaTextLabel(v, binding) {
    const idx = state5Index(v, binding);
    return TPO_STA_LABELS[idx] || String(idx);
  }

  function poolBwStaTextLabel(v, binding) {
    const idx = state5Index(v, binding);
    return POOL_BW_STA_LABELS[idx] || String(idx);
  }

  function poolLightOpTextLabel(v, binding) {
    const idx = drumIndex(v, binding);
    return POOL_LIGHT_OP_LABELS[idx] || String(idx);
  }

  function poolLightColorTextLabel(v, binding) {
    const idx = drumIndex(v, binding);
    return POOL_LIGHT_COLOR_LABELS[idx] || String(idx + 1);
  }

  function state3TextLabel(v, binding) {
    const idx = state3Index(v, binding);
    return STATE3_TEXT_LABELS[idx] || String(idx);
  }

  function stationStaIndex(v, binding) {
    const n = scaledNumeric(v, binding) ?? Number(v);
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 3;
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  function stationStaTextLabel(v, binding) {
    const idx = stationStaIndex(v, binding);
    return STATION_STA_LABELS[idx] || String(idx);
  }

  function state5TextLabel(v, binding) {
    const idx = state5Index(v, binding);
    return STATE5_TEXT_LABELS[idx] || String(idx);
  }

  function formatNumeric(v, binding) {
    const n = scaledNumeric(v, binding) ?? Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    if (binding.format === 'state3') return state3TextLabel(v, binding);
    if (binding.format === 'stationSta') return stationStaTextLabel(v, binding);
    if (binding.format === 'state5') return state5TextLabel(v, binding);
    if (binding.format === 'tpoSta') return tpoStaTextLabel(v, binding);
    if (binding.format === 'poolBwSta') return poolBwStaTextLabel(v, binding);
    if (binding.format === 'poolLightOp') return poolLightOpTextLabel(v, binding);
    if (binding.format === 'poolLightColor') return poolLightColorTextLabel(v, binding);
    if (binding.format === 'altStage') return altStageTextLabel(v);
    if (binding.format === 'hhmm') return hhmmFromMinutes(v);
    if (binding.format === 'dow') return dowTextLabel(v);
    if (binding.format === 'hoursFromMin') return hoursFromMinutes(v);
    if (binding.format === 'int') return String(Math.round(n));
    if (binding.format === 'fixed1') return n.toFixed(1);
    if (binding.format === 'fixed2') return n.toFixed(2);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function isNumericDisplayLayer(layerEl) {
    if (!layerEl || layerEl.dataset?.kind !== 'dynamicText') return false;
    const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
    const path = svg?.dataset?.hmiAssetPath || '';
    return /numeric-display|numeric_display|numeric_bezel|bezel_digit|bezel_inc|bezel_simple|\/displays\//i.test(path);
  }

  function applyDynamicTextLayerBinding(scope, binding, liveMap) {
    const parsed = parseCellElementId(binding?.elementId);
    if (!parsed || binding.property !== 'text') return false;
    const zN = parsed.z != null ? parsed.z : 0;
    const cell = scope?.querySelector?.(
      `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
    );
    if (!cell) return false;
    const layer = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
    if (!layer) return false;
    if (layer.dataset.kind === 'staticText') return false;
    const svg = layer.querySelector('svg.hmi-tile-asset, svg');
    const hasSvgText = svg && labelTextElement(svg);
    if (!isNumericDisplayLayer(layer) && layer.dataset.kind !== 'dynamicText') return false;
    if (hasSvgText && !isNumericDisplayLayer(layer)) return false;
    const ov = ensureValueOverlay(layer, parsed.col, parsed.row, zN);
    ov.classList.toggle('hmi-numeric-display-value', isNumericDisplayLayer(layer));
    applyBinding(ov, binding, liveMap);
    fitValueOverlay(layer);
    return true;
  }

  const FILL5_DEFAULT_COLORS = [
    '#22c55e', '#ef4444', '#fbed20', '#f97316', '#64748b',
  ];
  const FILL5_DEFAULT_FLASH = [2, 3];
  const FILL8_DEFAULT_COLORS = [
    '#94a3b8', '#22c55e', '#eab308', '#ef4444', '#2563eb', '#f97316', '#9333ea', '#0891b2',
  ];

  const FILL5_LEGACY_WARN_YELLOWS = new Set(['#eab308', '#facc15']);

  function normalizeFill5Colors(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return FILL5_DEFAULT_COLORS.map((d, i) => {
      const c = String(src[i] ?? '').trim();
      if (!/^#[0-9a-f]{6}$/i.test(c)) return d;
      if (i === 2 && FILL5_LEGACY_WARN_YELLOWS.has(c.toLowerCase())) return FILL5_DEFAULT_COLORS[2];
      return c;
    });
  }

  function normalizeFlashStates(raw) {
    const src = Array.isArray(raw) ? raw : FILL5_DEFAULT_FLASH;
    const out = [...new Set(src.map((n) => Math.trunc(Number(n))).filter((n) => n >= 0 && n <= 4))];
    if (!out.length) return [...FILL5_DEFAULT_FLASH];
    if (out.length === 1 && out[0] === 2) return [2, 3];
    return out;
  }

  function normalizeFill8Colors(raw) {
    const src = Array.isArray(raw) ? raw : [];
    return FILL8_DEFAULT_COLORS.map((d, i) => {
      const c = String(src[i] ?? '').trim();
      return /^#[0-9a-f]{6}$/i.test(c) ? c : d;
    });
  }

  const HOA_SWITCH_PATH_RE = /switch_hoa_(auto|off|hand)\.svg$/i;

  function isHoaSwitchAssetPath(path) {
    return HOA_SWITCH_PATH_RE.test(String(path || ''));
  }

  function hoaLayerIndexFromPath(path) {
    const m = HOA_SWITCH_PATH_RE.exec(String(path || ''));
    if (!m) return null;
    const pos = m[1].toLowerCase();
    if (pos === 'auto') return 0;
    if (pos === 'off') return 1;
    if (pos === 'hand') return 2;
    return null;
  }

  function state3Index(v, binding) {
    const n = scaledNumeric(v, binding);
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 2;
    if (n != null) {
      if (max === min) return Math.max(0, Math.min(2, Math.trunc(n)));
      return Math.max(0, Math.min(2, Math.round(n - min)));
    }
    return 0;
  }

  function drumIndex(v, binding) {
    const n = scaledNumeric(v, binding);
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 0;
    const span = max - min;
    if (n == null) return 0;
    if (span <= 0) return Math.max(0, Math.trunc(n));
    return Math.max(0, Math.min(span, Math.round(n - min)));
  }

  function drumStepCount(binding) {
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 0;
    return Math.max(1, max - min + 1);
  }

  function state5Index(v, binding) {
    return fill5Index(v, isTruthy(v), {
      ...binding,
      property: 'fill5',
      min: Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0,
      max: Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 4,
    });
  }

  function hoaLayerIndexForElement(layerEl) {
    if (!layerEl) return null;
    const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
    const path = svg?.dataset?.hmiAssetPath || layerEl.dataset?.hmiAssetPath || '';
    return hoaLayerIndexFromPath(path);
  }

  function cellHasHoaSwitchLayers(cell) {
    if (!cell) return false;
    let n = 0;
    for (const layer of cell.querySelectorAll('.hmi-tile-layer')) {
      if (hoaLayerIndexForElement(layer) != null) n++;
    }
    return n >= 2;
  }

  function applyHoaSwitchState(cell, stateIndex, tagId) {
    if (!cell || !cellHasHoaSwitchLayers(cell)) return;
    const idx = Math.max(0, Math.min(2, Math.trunc(Number(stateIndex) || 0)));
    cell.classList.add('hmi-hoa-switch');
    cell.dataset.hoaState = String(idx);
    if (tagId) cell.dataset.hoaTagId = String(tagId);
    for (const layerEl of cell.querySelectorAll('.hmi-tile-layer')) {
      const layerIdx = hoaLayerIndexForElement(layerEl);
      if (layerIdx == null) continue;
      const show = layerIdx === idx;
      layerEl.style.display = show ? '' : 'none';
      layerEl.style.pointerEvents = show ? 'auto' : 'none';
      layerEl.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function applyHoaState3Binding(scope, binding, liveMap) {
    const parsed = parseCellElementId(binding?.elementId);
    if (!parsed || parsed.col == null || parsed.row == null) return false;
    const cell = scope?.querySelector?.(
      `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
    );
    if (!cell) return false;
    const v = bindingTagValue(binding, liveMap);
    applyHoaSwitchState(cell, state3Index(v, binding), binding.tagId);
    return true;
  }

  function normalizeFill5Binding(binding) {
    if (!binding || binding.property !== 'fill5') return binding;
    const min = Number.isFinite(Number(binding.min)) ? Number(binding.min) : 0;
    let max = Number.isFinite(Number(binding.max)) ? Number(binding.max) : 4;
    if (max - min > 4 || max > 4) max = 4;
    return {
      ...binding,
      min,
      max,
      colors: normalizeFill5Colors(binding.colors),
      flashStates: normalizeFlashStates(binding.flashStates),
    };
  }

  function fill5Index(v, on, binding) {
    const b = normalizeFill5Binding(binding);
    const n = scaledNumeric(v, b);
    if (n != null) {
      const min = b.min;
      const max = b.max;
      const span = max - min;
      if (span <= 0) return Math.max(0, Math.min(4, Math.trunc(n)));
      if (span <= 4) return Math.max(0, Math.min(4, Math.round(n - min)));
      const t = (n - min) / span;
      return Math.max(0, Math.min(4, Math.round(t * 4)));
    }
    return on ? 1 : 0;
  }

  function fill8Index(v, on, binding) {
    const n = scaledNumeric(v, binding);
    if (n != null) {
      const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
      const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 100;
      if (max !== min) {
        const t = (n - min) / (max - min);
        return Math.max(0, Math.min(7, Math.round(t * 7)));
      }
      return Math.max(0, Math.min(7, Math.trunc(n)));
    }
    return on ? 1 : 0;
  }

  function backgroundPaintTargets(el) {
    if (!el) return [];
    if (el.tagName === 'g' || el.tagName === 'G') {
      const bg = el.querySelector('[id*="bg" i], [id*="BG"], [class*="bg" i], rect, path');
      return bg ? [bg] : [];
    }
    if (/^(rect|circle|ellipse|path|polygon)$/i.test(el.tagName)) return [el];
    return [];
  }

  function setBackgroundFill(el, color) {
    if (!el) return;
    const targets = backgroundPaintTargets(el);
    for (const t of targets) t.setAttribute('fill', color);
    if (el.style) el.style.backgroundColor = color;
  }

  const HMI_LABEL_ID = 'hmi_label';
  const HMI_DIAL_POINTER_ID = 'dial_pointer';
  /** MV dial-pointer SVG points down (+Y) at 0° CSS rotation. */
  const DIAL_NEEDLE_ZERO_DEG = 90;
  const DIAL_ANGLE_MIN_DEFAULT = 30;
  const DIAL_ANGLE_MAX_DEFAULT = 330;

  function ensureSvgBindingIds(root) {
    if (!root?.querySelectorAll) return;
    const texts = [...root.querySelectorAll('text')].filter((el) => !el.id);
    texts.forEach((textEl, i) => {
      textEl.id = texts.length === 1 ? HMI_LABEL_ID : `${HMI_LABEL_ID}_${i}`;
    });
  }

  function labelTextElement(root) {
    if (!root) return null;
    if (root.tagName === 'text' || root.tagName === 'TEXT') return root;
    return root.querySelector?.(`[id$="__${HMI_LABEL_ID}"]`)
      || root.querySelector?.(`#${CSS.escape(HMI_LABEL_ID)}`)
      || root.querySelector?.('text');
  }

  function applyLabelText(root, label) {
    const textEl = labelTextElement(root);
    if (!textEl || label == null) return;
    textEl.textContent = String(label);
    fitTextLabelSvg(root);
  }

  function applyLabelToLayer(layerEl, label) {
    if (!layerEl || label == null) return;
    const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
    if (svg && labelTextElement(svg)) applyLabelText(svg, label);
  }

  function applyLabelToCell(cell, label, options = {}) {
    if (!cell || label == null) return;
    const preferZ = options.z;
    const preferKind = options.kind || 'staticText';
    if (preferZ != null) {
      const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${preferZ}"]`);
      if (layerEl) {
        applyLabelToLayer(layerEl, label);
        return;
      }
    }
    for (const layerEl of cell.querySelectorAll('.hmi-tile-layer')) {
      if (preferKind && layerEl.dataset.kind !== preferKind) continue;
      if (labelTextElement(layerEl.querySelector('svg.hmi-tile-asset, svg'))) {
        applyLabelToLayer(layerEl, label);
        return;
      }
    }
    for (const svg of cell.querySelectorAll('svg.hmi-tile-asset, svg')) {
      if (labelTextElement(svg)) {
        applyLabelText(svg, label);
        return;
      }
    }
  }

  function isTextLabelSvg(svg) {
    if (!svg) return false;
    if (svg.querySelector('[id$="__hmi_label"], #hmi_label')) return true;
    if (!svg.querySelector('text')) return false;
    const graphics = svg.querySelectorAll('circle, rect, path, polygon, ellipse, line, polyline');
    return graphics.length === 0;
  }

  function fitTileSvg(svg, assetFit) {
    if (!svg) return;
    const vb = svg.viewBox?.baseVal;
    if (!vb || vb.width <= 0) {
      const w = parseFloat(String(svg.getAttribute('width') || '').replace(/px$/i, ''));
      const h = parseFloat(String(svg.getAttribute('height') || '').replace(/px$/i, ''));
      if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
    if (assetFit === 'scroll') {
      svg.classList.add('hmi-tile-asset-scroll');
      svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = '100%';
      svg.style.maxHeight = 'none';
      svg.style.minHeight = '0';
      svg.style.display = 'block';
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      return;
    }
    svg.classList.remove('hmi-tile-asset-scroll');
    if (assetFit === 'stretch') {
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.width = '100%';
      svg.style.height = '100%';
      return;
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '100%';
    svg.style.display = 'block';
  }

  function pilotLightViewBox(svg) {
    const w = parseFloat(String(svg.getAttribute('width') || '').replace(/px$/i, ''));
    const h = parseFloat(String(svg.getAttribute('height') || '').replace(/px$/i, ''));
    if (w > 0 && h > 0) return `0 0 ${w} ${h}`;
    try {
      const bbox = svg.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        const pad = 4;
        return `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`;
      }
    } catch { /* not in layout yet */ }
    return '0 0 100 100';
  }

  function clearDialPointerMisclassification(svg, prefix, assetPath) {
    if (!svg || !isPilotLightAssetPath(assetPath)) return;
    svg.classList.remove('hmi-dial-pointer');
    const dialId = `${prefix}__${HMI_DIAL_POINTER_ID}`;
    if (svg.id === dialId) svg.id = `${prefix}__svg`;
  }

  function fitPilotLightSvg(svg, assetFit) {
    if (!svg) return;
    svg.classList.add('hmi-pilot-light', 'hmi-tile-asset');
    svg.classList.remove('hmi-dial-pointer');
    svg.setAttribute('viewBox', pilotLightViewBox(svg));
    if (assetFit === 'stretch') {
      svg.setAttribute('preserveAspectRatio', 'none');
    } else {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '100%';
    svg.style.minWidth = '0';
    svg.style.minHeight = '0';
    svg.style.display = 'block';
  }

  function assetFitFromContainer(container) {
    const vp = container?.closest?.(
      '.hmi-viewport, .hmi-setup-preview, .hmi-tile-composer, .hmi-display-viewport, .hmi-workspace-viewport'
    );
    if (vp?.classList?.contains('hmi-fit-stretch')) return 'stretch';
    if (vp?.classList?.contains('hmi-fit-cover')) return 'cover';
    return 'contain';
  }

  function fitTextLabelSvg(svg) {
    if (!svg || !isTextLabelSvg(svg)) return;
    fitTileSvg(svg);
    const textEl = labelTextElement(svg);
    if (!textEl) return;
    let bbox;
    try {
      bbox = textEl.getBBox();
    } catch {
      return;
    }
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return;
    const pad = 4;
    const vbX = bbox.x - pad;
    const vbY = bbox.y - pad;
    const vbW = Math.max(8, bbox.width + pad * 2);
    const vbH = Math.max(8, bbox.height + pad * 2);
    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
  }

  function textBindingTarget(el) {
    if (!el) return null;
    if (el.classList?.contains('hmi-value-overlay')) return el;
    if (el.tagName === 'text' || el.tagName === 'TEXT') return el;
    return el.querySelector?.('text') || el;
  }

  function isPilotLightAssetPath(assetPath) {
    const p = String(assetPath || '').toLowerCase();
    return /pilot-lights\/(standard|multicolor)\/|\/pl_(multi_)?(round|square|octagonal)\.svg/.test(p);
  }

  function isMultiPilotLightAssetPath(assetPath) {
    const p = String(assetPath || '').toLowerCase();
    return /pilot-lights\/multicolor\/|\/pl_multi_/.test(p);
  }

  function isPilotLightSvg(svg) {
    if (!svg) return false;
    if (svg.classList?.contains('hmi-pilot-light')) return true;
    if (isPilotLightAssetPath(svg.dataset?.hmiAssetPath)) return true;
    if (svg.classList?.contains('hmi-dial-pointer')) return false;
    const lamp = svg.querySelector('[id$="__lamp"], circle#lamp');
    if (!lamp) return false;
    const bigCircles = [...svg.querySelectorAll('circle')].filter((c) => {
      const r = parseFloat(String(c.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      return r > 8;
    });
    return bigCircles.length === 1;
  }

  function isPilotLampElement(el) {
    const id = String(el?.id || '');
    if (/(^|__)lamp$/i.test(id)) return true;
    const tag = el?.tagName?.toLowerCase() || '';
    return !!el?.closest?.('svg.hmi-pilot-light, svg[data-hmi-asset-path*="pilot-lights"]')
      && (tag === 'circle' || tag === 'rect' || tag === 'polygon')
      && String(el.getAttribute('stroke') || '').toLowerCase() === 'black';
  }

  function findPilotLampInSvg(svg) {
    if (!svg?.querySelector) return null;
    return svg.querySelector('[id$="__lamp"], #lamp, circle#lamp, rect#lamp, polygon#lamp');
  }

  function ensurePilotLampId(root, prefix, assetPath) {
    if (!root || !prefix || !isPilotLightAssetPath(assetPath)) return null;
    const tagged = root.querySelector(`[id="${prefix}__lamp"]`);
    if (tagged) return tagged;
    const legacy = root.querySelector('circle#lamp, #lamp');
    if (legacy) {
      legacy.id = `${prefix}__lamp`;
      return legacy;
    }
    const shapes = [...root.querySelectorAll('circle, rect, polygon')].filter(
      (el) => !el.closest('defs, mask, clipPath')
    );
    let lampEl = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const el = shapes[i];
      const stroke = String(el.getAttribute('stroke') || '').toLowerCase();
      if (stroke && stroke !== 'none') {
        lampEl = el;
        break;
      }
    }
    if (!lampEl) lampEl = shapes[shapes.length - 1];
    if (lampEl) {
      lampEl.id = `${prefix}__lamp`;
      return lampEl;
    }
    return null;
  }

  function clearPilotLayerDecor(layerEl) {
    if (!layerEl) return;
    layerEl.querySelector('.hmi-analog-ring')?.remove();
    layerEl.querySelector('.hmi-value-overlay')?.remove();
  }

  function applyPilotLampFill(lampEl, layerEl, color) {
    if (!lampEl || !color) return;
    clearPilotLayerDecor(layerEl);
    setPaintOnTarget(lampEl, 'fill', color);
    setPaintOnTarget(lampEl, 'stroke', '#000000');
    const sw = lampEl.getAttribute('stroke-width') || '5px';
    lampEl.setAttribute('stroke-width', sw);
    try { lampEl.style.setProperty('stroke-width', sw.replace(/px$/i, '') ? `${sw}` : sw, 'important'); } catch { /* ignore */ }
  }

  function paintFaceplateStatusLamp(el, color, binding, stateIdx) {
    const scope = el?.tagName?.toLowerCase() === 'g'
      ? el
      : el?.closest?.('g[id*="status_lamp"], g[id*="__status_lamp"]') || el;
    if (!scope?.querySelectorAll) return false;
    if (scope.tagName?.toLowerCase() === 'svg') return false;
    if (!/status_lamp/i.test(String(scope.id || ''))) return false;
    const circles = [...scope.querySelectorAll('circle')].filter((c) => !c.closest('defs, mask, clipPath'));
    if (!circles.length || !color) return false;
    circles.sort((a, b) => {
      const ra = parseFloat(String(a.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      const rb = parseFloat(String(b.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      return rb - ra;
    });
    setPaintOnTarget(circles[0], 'fill', color);
    setPaintOnTarget(circles[0], 'stroke', '#334155');
    if (!circles[0].getAttribute('stroke-width')) circles[0].setAttribute('stroke-width', '3');
    if (circles[1]) {
      setPaintOnTarget(circles[1], 'fill', color);
      circles[1].removeAttribute('opacity');
      circles[1].style.opacity = '0.5';
    }
    for (let i = 2; i < circles.length; i++) {
      circles[i].style.opacity = '0.3';
    }
    applyPilotFlash(scope, binding, stateIdx);
    return true;
  }

  function paintFaceplateOfflineButton(el, on) {
    const scope = el?.tagName?.toLowerCase() === 'g'
      ? el
      : el?.closest?.('g[id*="btn_offline"], g[id*="__btn_offline"]');
    if (!scope || !/btn_offline/i.test(String(scope.id || ''))) return false;
    const label = scope.querySelector('text');
    if (label) {
      label.textContent = on ? 'OFFLINE' : 'ONLINE';
      setPaintOnTarget(label, 'fill', '#ffffff');
    }
    return true;
  }

  function bindingUsesTextLabels(binding, liveMap) {
    const onStr = String(binding?.onValue ?? '');
    const offStr = String(binding?.offValue ?? '');
    if (!onStr && !offStr) return false;
    const looksLikeColor = (s) => /^#[0-9a-f]{6}$/i.test(String(s || '').trim());
    if (looksLikeColor(onStr) || looksLikeColor(offStr)) return false;
    const tagType = String(liveMap?.[binding?.tagId]?.type || '').toUpperCase();
    return tagType === 'BOOL' || onStr !== '' || offStr !== '';
  }

  function ensureAnalogRing(layerEl, color) {
    if (!layerEl) return null;
    let ring = layerEl.querySelector('.hmi-analog-ring');
    if (!ring) {
      ring = document.createElement('div');
      ring.className = 'hmi-analog-ring';
      ring.setAttribute('aria-hidden', 'true');
      layerEl.appendChild(ring);
    }
    ring.style.borderColor = color || '#22c55e';
    return ring;
  }

  function paintDialSvgAnalog(svg, color, binding) {
    if (!svg || !color) return;
    svg.querySelectorAll('g').forEach((g) => {
      const gf = String(g.getAttribute('fill') || '');
      if (gf.includes('url(')) {
        g.setAttribute('fill', 'none');
        g.style.setProperty('fill', 'none', 'important');
      }
    });
    const strokeMode = binding?.property === 'stroke';
    const circles = [...svg.querySelectorAll('circle')]
      .map((el) => ({
        el,
        r: parseFloat(String(el.getAttribute('r') || '').replace(/px$/i, '')) || 0,
      }))
      .filter((x) => x.r > 8)
      .sort((a, b) => b.r - a.r);
    circles.forEach(({ el, r }, i) => {
      const id = String(el.id || '');
      const isOuter = i === 0 || id.includes('dial_outer');
      if (isOuter) {
        setPaintOnTarget(el, 'fill', 'none');
        setPaintOnTarget(el, 'stroke', color);
        const sw = strokeMode ? '6' : '5';
        el.setAttribute('stroke-width', sw);
        try { el.style.setProperty('stroke-width', `${sw}px`, 'important'); } catch { /* ignore */ }
      } else {
        setPaintOnTarget(el, 'fill', color);
        if (!strokeMode) {
          setPaintOnTarget(el, 'stroke', '#334155');
          el.setAttribute('stroke-width', '1');
        }
      }
    });
  }

  function ensureValueOverlay(layerEl, col, row, z) {
    if (!layerEl) return null;
    const prefix = layerPrefix(col, row, z);
    const id = `${prefix}__${HMI_LABEL_ID}`;
    let ov = layerEl.querySelector('.hmi-value-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'hmi-value-overlay';
      ov.setAttribute('aria-hidden', 'true');
      layerEl.appendChild(ov);
    }
    ov.id = id;
    return ov;
  }

  function ensurePilotLightWrap(layerEl, svg) {
    if (!layerEl || !svg || svg.closest('.hmi-pilot-light-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'hmi-pilot-light-wrap';
    layerEl.insertBefore(wrap, svg);
    wrap.appendChild(svg);
  }

  function ensureCellBindingIds(cell, col, row, z) {
    if (!cell) return;
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
    if (!layerEl) return;
    const prefix = layerPrefix(col, row, zN);
    const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
    if (svg) {
      const assetPath = svg.dataset.hmiAssetPath || '';
      prefixSvgIds(svg, prefix, assetPath);
      if (isPilotLightAssetPath(assetPath)) {
        clearDialPointerMisclassification(svg, prefix, assetPath);
        ensurePilotLightWrap(layerEl, svg);
        fitPilotLightSvg(svg, assetFitFromContainer(layerEl));
      } else {
        ensureDialPointerSetup(svg, prefix, assetPath);
        if (svg.classList.contains('hmi-dial-pointer')) fitDialPointerSvg(svg);
      }
      clearGaugeChromeFromReadoutLayer(layerEl, svg, assetPath);
    }
    const img = layerEl.querySelector('img.hmi-tile-asset, img.hmi-raster');
    if (img && (!img.id || !img.id.startsWith(`${prefix}__`))) {
      img.id = `${prefix}__img`;
    }
  }

  function isRasterBindingElement(el) {
    const tag = el?.tagName?.toLowerCase() || '';
    return tag === 'img' || el?.classList?.contains('hmi-raster');
  }

  function rasterBindingColor(binding, v, on) {
    if (binding?.property === 'fill5') {
      const palette = normalizeFill5Colors(binding.colors);
      return palette[fill5Index(v, on, binding)];
    }
    if (binding?.property === 'fill8') {
      const palette = normalizeFill8Colors(binding.colors);
      return palette[fill8Index(v, on, binding)];
    }
    const t = analogFillT(v, binding);
    if (t != null && (binding.onValue || binding.offValue)) {
      return lerpHexColor(binding.offValue, binding.onValue, t);
    }
    return on ? binding.onValue : binding.offValue;
  }

  function applyRasterPaint(el, binding, v, on) {
    const layer = el?.closest?.('.hmi-tile-layer');
    const t = (binding?.property === 'fill5' || binding?.property === 'fill8') ? null : analogFillT(v, binding);
    const color = rasterBindingColor(binding, v, on);
    if (layer && color) {
      layer.style.backgroundColor = color;
      layer.style.borderRadius = '50%';
    }
    if (binding.property === 'opacity' || t != null) {
      const op = t != null ? Math.max(0.15, Math.min(1, 0.15 + t * 0.85)) : (on ? 1 : 0.35);
      el.style.opacity = String(op);
    } else if (color) {
      el.style.outline = `3px solid ${color}`;
      el.style.outlineOffset = '-2px';
    }
  }

  function fitValueOverlay(layerEl) {
    const ov = layerEl?.querySelector?.('.hmi-value-overlay');
    const cell = layerEl?.closest?.('.hmi-tile-cell');
    if (!ov || !cell) return;
    const h = cell.clientHeight || 80;
    const w = cell.clientWidth || 80;
    const base = Math.min(h, w);
    const scale = ov.classList.contains('hmi-numeric-display-value') ? 0.34 : 0.24;
    ov.style.fontSize = `${Math.max(10, Math.round(base * scale))}px`;
  }

  function setBoundText(el, text) {
    const t = textBindingTarget(el);
    if (!t) return;
    t.textContent = String(text ?? '');
    const layer = el.closest?.('.hmi-tile-layer');
    if (layer) {
      fitValueOverlay(layer);
      return;
    }
    const svg = t.ownerSVGElement || el.closest?.('svg');
    if (svg?.classList?.contains('hmi-tile-asset')) fitTextLabelSvg(svg);
  }

  function findHmiViewport(root) {
    return root?.closest?.('.hmi-viewport')
      || (typeof document !== 'undefined' ? document.getElementById('hmi-viewport') : null)
      || (typeof document !== 'undefined' ? document.getElementById('hmi-setup-preview') : null);
  }

  function applyScreenBackgroundBinding(root, binding, liveMap) {
    const vp = findHmiViewport(root);
    if (!vp || !binding?.tagId) return;
    const v = bindingTagValue(binding, liveMap);
    const on = isTruthy(v);
    if (binding.property === 'fill8') {
      const palette = normalizeFill8Colors(binding.colors);
      vp.style.background = palette[fill8Index(v, on, binding)];
    } else if (binding.property === 'backgroundFill') {
      vp.style.background = on ? binding.onValue : binding.offValue;
    }
  }

  function tileLayerKind(el) {
    return el?.closest?.('.hmi-tile-layer')?.dataset?.kind || '';
  }

  function pilotFlashLayer(el) {
    return el?.closest?.('.hmi-tile-layer') || el;
  }

  function applyPilotFlash(el, binding, stateIndex) {
    const layer = pilotFlashLayer(el);
    if (!layer?.classList) return;
    const flashStates = normalizeFlashStates(binding?.flashStates);
    layer.classList.toggle('hmi-lamp-flash', flashStates.includes(stateIndex));
  }

  function isCaptionTextBindingTarget(el, binding) {
    if (binding?.property !== 'text' || tileLayerKind(el) !== 'staticText') return false;
    const id = String(el?.id || '');
    return id.endsWith(`__${HMI_LABEL_ID}`) || /__hmi_label/i.test(id);
  }

  function bindingElementSuffix(elementId) {
    const id = String(elementId || '');
    const i = id.lastIndexOf('__');
    return i >= 0 ? id.slice(i + 2) : id;
  }

  function isFaceplateControlSuffix(suffix) {
    return /^(btn_|chk_|status_lamp|hoa_state|run_state|run_hrs|starts_count|run_meter|btn_offline|btn_enable|tod_value|window_start|window_end|param_app_min|param_repeat_min|param_on_min|param_off_min|tmr_on_lamp|tmr_off_lamp|motor_|tpo_|sch_fp|filter_)/i.test(String(suffix || ''));
  }

  function isFaceplateFillControlSuffix(suffix) {
    return /^(btn_|chk_|status_lamp)$/i.test(String(suffix || ''));
  }

  function lockFaceplateReadoutTextStyle(el, fill) {
    const t = textBindingTarget(el);
    if (!t) return;
    const color = fill || '#0f172a';
    t.setAttribute('fill', color);
    try { t.style.fill = color; } catch { /* ignore */ }
  }

  function compositeFaceplateCell(scope, col, row) {
    const cell = scope?.querySelector?.(
      `.hmi-tile-cell[data-col="${col}"][data-row="${row}"]`
    );
    if (!cell) return null;
    const svg = cell.querySelector('.hmi-tile-layer svg.hmi-tile-asset, .hmi-tile-layer svg');
    return isCompositeFaceplateSvg(svg) ? cell : null;
  }

  function shouldApplyDialLayerPaint(binding, elementId) {
    const id = String(elementId || '');
    if (!/dial|gauge|lamp|shape_|__img$/i.test(id)) return false;
    if (isFaceplateControlSuffix(bindingElementSuffix(id))) return false;
    if (/status_lamp|run_state|hoa_state|run_hrs|starts_count|btn_|tmr_on_lamp|tmr_off_lamp|tod_value|window_|param_|schedule_panel|panel_bg|chk_24hr/i.test(id)) {
      return false;
    }
    return true;
  }

  function isCompositeFaceplateSvg(svg) {
    return isCompositeFaceplateAssetPath(svg?.dataset?.hmiAssetPath || '')
      || !!svg?.querySelector?.('[id$="__btn_start"], [id*="__btn_start"], #btn_start, [id$="__status_lamp"], #status_lamp');
  }

  function applyBinding(el, binding, liveMap) {
    if (!el || !binding?.tagId) return;
    if (isCaptionTextBindingTarget(el, binding)) return;
    let v = bindingTagValue(binding, liveMap);
    const pulseDisplay = resolveHandModePumpDisplayValue(binding, liveMap);
    if (pulseDisplay != null) v = pulseDisplay;
    const on = isTruthy(v);
    switch (binding.property) {
      case 'visibility':
        if (el.classList?.contains('hmi-flash-overlay')) {
          applyFlashOverlayState(el, on ? (normalizeFlashStateMode(binding.onValue) === 'hidden' ? 'red' : binding.onValue) : 'hidden');
        } else {
          el.style.display = on ? '' : 'none';
        }
        break;
      case 'flashState':
        applyFlashOverlayState(el, flashStateModeFromBinding(binding, liveMap));
        break;
      case 'fill': {
        if (isRasterBindingElement(el)) {
          applyRasterPaint(el, binding, v, on);
          break;
        }
        const svg = el?.closest?.('svg.hmi-tile-asset, svg');
        const tFill = analogFillT(v, binding);
        const color = tFill != null && (binding.onValue || binding.offValue)
          ? lerpHexColor(binding.offValue, binding.onValue, tFill)
          : (on ? binding.onValue : binding.offValue);
        const layerEl = el.closest('.hmi-tile-layer');
        const cellEl = el.closest('.hmi-tile-cell');
        const elSuffix = bindingElementSuffix(el.id || binding?.elementId || '');
        if (isFaceplateFillControlSuffix(elSuffix)) {
          if (/status_lamp/i.test(elSuffix)) {
            paintFaceplateStatusLamp(el, color, binding, on ? 1 : 0);
          } else if (tFill != null && (binding.onValue || binding.offValue)) {
            applyFillOrStrokeColor(el, binding, color);
          } else {
            applyFillOrStroke(el, binding, on);
          }
          break;
        }
        if (/btn_offline/i.test(elSuffix)) {
          applyFillOrStroke(el, binding, on);
          paintFaceplateOfflineButton(el, on);
          break;
        }
        if (/lamp/i.test(elSuffix) && color) {
          setPaintOnTarget(el, 'fill', color);
          setPaintOnTarget(el, 'stroke', color);
          break;
        }
        if (svg && isPilotLightSvg(svg) && color) {
          const lamp = isPilotLampElement(el) ? el : findPilotLampInSvg(svg);
          if (lamp) {
            applyPilotLampFill(lamp, layerEl, color);
            break;
          }
        }
        if (svg && isGaugeColumnSvg(svg) && /gauge_col/i.test(String(el.id || ''))) {
          const eff = effectiveFillBinding(binding, liveMap);
          const tCol = analogFillT(v, eff);
          if (tCol != null) {
            paintGaugeColumnGradient(el, binding.onValue, binding.offValue, tCol);
            break;
          }
        }
        if (svg && layerEl && cellEl && cellHasDialGauge(cellEl, layerEl.dataset.z) && color) {
          ensureAnalogRing(layerEl, color);
          paintDialSvgAnalog(svg, color, binding);
          break;
        }
        if (tFill != null && (binding.onValue || binding.offValue)) {
          applyFillOrStrokeColor(el, binding, color);
        } else {
          applyFillOrStroke(el, binding, on);
        }
        break;
      }
      case 'fill5': {
        binding = normalizeFill5Binding(binding);
        const stateIdx = fill5Index(v, on, binding);
        const palette = normalizeFill5Colors(binding.colors);
        const color = palette[stateIdx];
        const layerEl5 = el.closest('.hmi-tile-layer');
        const svg5 = el?.closest?.('svg.hmi-tile-asset, svg');
        const fill5Suffix = bindingElementSuffix(el.id || binding?.elementId || '');
        if (isRasterBindingElement(el)) {
          applyRasterPaint(el, binding, v, on);
          applyPilotFlash(el, binding, stateIdx);
        } else if (svg5 && isPilotLightSvg(svg5)) {
          const lamp = isPilotLampElement(el) ? el : findPilotLampInSvg(svg5);
          if (lamp) applyPilotLampFill(lamp, layerEl5, color);
          else setPaint(el, 'fill', color, binding);
          applyPilotFlash(el, binding, stateIdx);
        } else if (/status_lamp|__status_lamp/i.test(fill5Suffix) || /status_lamp/i.test(String(el.id || ''))) {
          if (!paintFaceplateStatusLamp(el, color, binding, stateIdx)) {
            setPaint(el, 'fill', color, binding);
            applyPilotFlash(el, binding, stateIdx);
          }
        } else if (/lamp/i.test(fill5Suffix)) {
          const scope = el.tagName?.toLowerCase() === 'g' ? el : el.closest('g[id*="lamp"]') || el;
          let lamp = null;
          let bestR = 0;
          for (const c of scope.querySelectorAll('circle')) {
            if (c.closest('defs, mask, clipPath')) continue;
            const r = parseFloat(String(c.getAttribute('r') || '').replace(/px$/i, '')) || 0;
            if (r > bestR && r > 8) {
              bestR = r;
              lamp = c;
            }
          }
          if (lamp) applyPilotLampFill(lamp, layerEl5, color);
          else setPaint(el, 'fill', color, binding);
          applyPilotFlash(el, binding, stateIdx);
        } else if (svg5 && isCompositeFaceplateSvg(svg5)) {
          setPaint(el, 'fill', color, binding);
          applyPilotFlash(el, binding, stateIdx);
        } else {
          setPaint(el, 'fill', color, binding);
          applyPilotFlash(el, binding, stateIdx);
        }
        break;
      }
      case 'fill8': {
        if (isRasterBindingElement(el)) {
          applyRasterPaint(el, binding, v, on);
          break;
        }
        const palette = normalizeFill8Colors(binding.colors);
        setPaint(el, 'fill', palette[fill8Index(v, on, binding)], binding);
        break;
      }
      case 'backgroundFill': {
        const color = on ? binding.onValue : binding.offValue;
        setBackgroundFill(el, color);
        break;
      }
      case 'stroke': {
        if (isRasterBindingElement(el)) {
          applyRasterPaint(el, binding, v, on);
          break;
        }
        const tStroke = analogFillT(v, binding);
        const color = tStroke != null && (binding.onValue || binding.offValue)
          ? lerpHexColor(binding.offValue, binding.onValue, tStroke)
          : (on ? binding.onValue : binding.offValue);
        setPaint(el, 'stroke', color);
        break;
      }
      case 'rotation':
        applyNeedleRotation(el, binding, liveMap);
        break;
      case 'text': {
        const textField = String(binding.tagField || inferPidTagField(binding.elementId) || '').trim();
        if (textField === 'label') {
          setBoundText(el, String(v ?? ''));
          break;
        }
        if (bindingUsesTextLabels(binding, liveMap)) {
          setBoundText(el, isTruthy(v) ? String(binding.onValue ?? '') : String(binding.offValue ?? ''));
          if (/btn_offline_label/i.test(bindingElementSuffix(el.id || binding?.elementId || ''))) {
            lockFaceplateReadoutTextStyle(el, '#ffffff');
          }
          if (binding.format === 'state3') {
            const cell = el.closest?.('.hmi-tile-cell');
            if (cell) cell.dataset.hoaState = String(state3Index(v, binding));
          }
          break;
        }
        if (binding.format === 'stationSta') {
          const idx = stationStaIndex(v, binding);
          setBoundText(el, STATION_STA_LABELS[idx] || String(idx));
          const palette = Array.isArray(binding.colors) && binding.colors.length
            ? binding.colors
            : STATION_STA_COLORS;
          const color = palette[idx] || STATION_STA_COLORS[idx];
          if (color) {
            el.setAttribute('fill', color);
            try { el.style.fill = color; } catch { /* ignore */ }
          }
          break;
        }
        if (binding.format === 'state5') {
          const idx = state5Index(v, binding);
          setBoundText(el, STATE5_TEXT_LABELS[idx] || String(idx));
          const palette = normalizeFill5Colors(binding.colors);
          const color = palette[idx] || STATE5_TEXT_COLORS[idx];
          if (color) {
            el.setAttribute('fill', color);
            try { el.style.fill = color; } catch { /* ignore */ }
          }
          break;
        }
        if (binding.format === 'tpoSta') {
          const idx = state5Index(v, binding);
          setBoundText(el, TPO_STA_LABELS[idx] || String(idx));
          const palette = normalizeFill5Colors(binding.colors);
          const color = palette[idx] || TPO_STA_COLORS[idx];
          if (color) {
            el.setAttribute('fill', color);
            try { el.style.fill = color; } catch { /* ignore */ }
          } else {
            lockFaceplateReadoutTextStyle(el, '#334155');
          }
          break;
        }
        if (binding.format === 'poolBwSta') {
          const idx = state5Index(v, binding);
          setBoundText(el, POOL_BW_STA_LABELS[idx] || String(idx));
          const palette = normalizeFill5Colors(binding.colors);
          const color = palette[idx] || POOL_BW_STA_COLORS[idx];
          if (color) {
            el.setAttribute('fill', color);
            try { el.style.fill = color; } catch { /* ignore */ }
          } else {
            lockFaceplateReadoutTextStyle(el, '#334155');
          }
          break;
        }
        if (binding.format === 'poolLightOp') {
          setBoundText(el, poolLightOpTextLabel(v, binding));
          lockFaceplateReadoutTextStyle(el, '#0f172a');
          const cell = el.closest?.('.hmi-tile-cell');
          const n = scaledNumeric(v, binding);
          if (cell && n != null) cell.dataset.hoaState = String(n);
          break;
        }
        if (binding.format === 'poolLightColor') {
          setBoundText(el, poolLightColorTextLabel(v, binding));
          lockFaceplateReadoutTextStyle(el, '#ffffff');
          const cell = el.closest?.('.hmi-tile-cell');
          const n = scaledNumeric(v, binding);
          if (cell && n != null) cell.dataset.hoaState = String(n);
          break;
        }
        if (binding.format === 'altStage') {
          setBoundText(el, altStageTextLabel(v));
          lockFaceplateReadoutTextStyle(el, '#0f172a');
          break;
        }
        if (binding.format === 'hhmm') {
          setBoundText(el, hhmmFromMinutes(v));
          lockFaceplateReadoutTextStyle(el, '#0f172a');
          break;
        }
        const n = asNumber(v);
        if (n != null) {
          setBoundText(el, formatNumeric(v, binding));
          if (binding.format === 'state3') {
            const cell = el.closest?.('.hmi-tile-cell');
            if (cell) cell.dataset.hoaState = String(state3Index(v, binding));
          }
          break;
        }
        setBoundText(el, String(v ?? ''));
        break;
      }
      case 'opacity': {
        let op = on ? 1 : 0;
        const n = scaledNumeric(v, binding);
        if (n != null) {
          const min = Number(binding.min ?? 0);
          const max = Number(binding.max ?? 100);
          const t = max === min ? 0 : (n - min) / (max - min);
          op = Math.max(0, Math.min(1, t));
        }
        el.style.opacity = String(op);
        break;
      }
      case 'trend':
        applyTrendBinding(el, binding, liveMap);
        break;
      case 'class':
        el.classList.remove(binding.classOn, binding.classOff);
        el.classList.add(on ? binding.classOn : binding.classOff);
        break;
      default:
        break;
    }
  }

  function ensureStage(container) {
    let stage = container.querySelector('.hmi-screen-stage');
    if (!stage) {
      container.innerHTML = '';
      stage = document.createElement('div');
      stage.className = 'hmi-screen-stage';
      container.appendChild(stage);
    }
    return stage;
  }

  function isTileGridViewport(container) {
    return !!container?.classList?.contains('hmi-display-viewport')
      || !!container?.classList?.contains('hmi-workspace-viewport')
      || !!container?.classList?.contains('hmi-setup-preview')
      || !!container?.classList?.contains('hmi-tile-composer');
  }

  function getLiveDisplayZoom() {
    return liveDisplayZoom;
  }

  function setLiveDisplayZoom(z) {
    const next = Math.max(1, Math.min(4, Number(z) || 1));
    liveDisplayZoom = next;
    const ctx = liveDisplayCtx;
    if (ctx && ctx.container && ctx.grid && ctx.container.isConnected) {
      delete ctx.grid.dataset.hmiSizeSig;
      try {
        applyScreenLayout(ctx.container, ctx.screen, ctx.grid);
      } catch (_) {
        try { sizeTileGridElement(ctx.container, ctx.grid, ctx.screen); } catch (__) { /* ignore */ }
      }
    }
    return liveDisplayZoom;
  }

  function getDisplayLimits(screen, container) {
    const g = getScreenGrid(screen);
    const logicalW = g.width;
    const logicalH = g.height;
    let limitW = Number(screen?.displayMaxWidth);
    let limitH = Number(screen?.displayMaxHeight);
    if (!Number.isFinite(limitW) || limitW < 100) limitW = logicalW;
    if (!Number.isFinite(limitH) || limitH < 100) limitH = logicalH;
    limitW = Math.max(100, Math.min(4096, Math.round(limitW)));
    limitH = Math.max(100, Math.min(4096, Math.round(limitH)));
    const pad = isTileGridViewport(container) ? 24 : 16;
    // Live viewport honours the user zoom: inflating the available space makes
    // the fitted screen physically larger. maxW/maxH stay clamped to the logical
    // size below, so zoom tops out at native 100% and the viewport scrolls.
    const zoom = isLiveDisplayViewport(container) ? Math.max(1, liveDisplayZoom) : 1;
    const availW = Math.max(100, ((container?.clientWidth || limitW) - pad) * zoom);
    const availH = Math.max(100, ((container?.clientHeight || limitH) - pad) * zoom);
    return {
      limitW,
      limitH,
      maxW: Math.min(limitW, availW),
      maxH: Math.min(limitH, availH),
      logicalW,
      logicalH,
    };
  }

  function measureTileGridSize(container, screen) {
    const g = getScreenGrid(screen);
    const cols = g.cols;
    const rows = g.rows;
    const { limitW, limitH, maxW, maxH, logicalW, logicalH } = getDisplayLimits(screen, container);
    const fit = screen?.fit || 'contain';
    let width;
    let height;
    let scale = 1;
    if (fit === 'stretch') {
      width = Math.max(160, Math.round(maxW));
      height = Math.max(120, Math.round(maxH));
      scale = Math.max(width / logicalW, height / logicalH);
    } else if (fit === 'cover') {
      scale = Math.max(maxW / logicalW, maxH / logicalH);
      width = Math.max(160, Math.round(logicalW * scale));
      height = Math.max(120, Math.round(logicalH * scale));
    } else {
      scale = Math.min(maxW / logicalW, maxH / logicalH);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      width = Math.max(160, Math.round(logicalW * scale));
      height = Math.max(120, Math.round(logicalH * scale));
    }
    return {
      width,
      height,
      maxW,
      maxH,
      limitW,
      limitH,
      cellWidth: width / cols,
      cellHeight: height / rows,
      logicalWidth: logicalW,
      logicalHeight: logicalH,
      scale,
      fit,
      cols,
      rows,
      gridCellWidth: g.cellWidth,
      gridCellHeight: g.cellHeight,
    };
  }

  function sizeTileGridElement(container, grid, screen) {
    if (!container || !grid || !screen) return;
    if (isLiveDisplayViewport(container)) {
      liveDisplayCtx = { container, grid, screen };
    }
    const run = () => {
      const size = measureTileGridSize(container, screen);
      const sig = [
        size.width, size.height, size.limitW, size.limitH, size.fit,
        size.logicalWidth, size.logicalHeight,
      ].join('|');
      if (grid.dataset.hmiSizeSig === sig) return size;
      grid.dataset.hmiSizeSig = sig;
      const frame = grid.closest('.hmi-grid-frame');
      if (size.fit === 'stretch') {
        grid.style.width = '100%';
        grid.style.height = `${size.height}px`;
        grid.style.maxWidth = `${size.maxW}px`;
        grid.style.minWidth = '0';
        if (frame) {
          frame.style.width = '100%';
          frame.style.maxWidth = `${size.maxW}px`;
          frame.style.height = '';
        }
      } else {
        grid.style.width = `${size.width}px`;
        grid.style.height = `${size.height}px`;
        grid.style.maxWidth = `${size.width}px`;
        grid.style.minWidth = '';
        if (frame) {
          frame.style.width = 'fit-content';
          frame.style.maxWidth = `${size.width + 32}px`;
          frame.style.height = 'fit-content';
        }
      }
      grid.dataset.logicalWidth = String(size.logicalWidth);
      grid.dataset.logicalHeight = String(size.logicalHeight);
      grid.dataset.displayLimitW = String(size.limitW);
      grid.dataset.displayLimitH = String(size.limitH);
      grid.dataset.cellWidth = String(Math.round(size.gridCellWidth || size.logicalWidth / (size.cols || GRID_SIZE)));
      grid.dataset.cellHeight = String(Math.round(size.gridCellHeight || size.logicalHeight / (size.rows || GRID_SIZE)));
      return size;
    };
    run();
    if (container._hmiResizeObs) {
      container._hmiResizeObs.disconnect();
      container._hmiResizeObs = null;
    }
    if (typeof ResizeObserver !== 'undefined') {
      container._hmiResizeObs = new ResizeObserver(() => {
        delete grid.dataset.hmiSizeSig;
        run();
      });
      container._hmiResizeObs.observe(container);
    } else if ((container.clientWidth || 0) < 40) {
      requestAnimationFrame(() => {
        delete grid.dataset.hmiSizeSig;
        run();
      });
    }
  }

  function applyScreenLayout(container, screen, rootEl) {
    const stage = ensureStage(container);
    const fit = screen?.fit || 'contain';
    const xSize = Math.max(1, Number(screen?.width) || 1024);
    const ySize = Math.max(1, Number(screen?.height) || 800);
    const scale = Math.max(0.1, Math.min(4, (Number(screen?.scale) || 100) / 100));
    const bg = screen?.background || '#f1f5f9';
    const isTileGrid = rootEl?.classList?.contains('hmi-tile-grid');
    const isSquareWorkspace = isTileGrid && (
      container.classList.contains('hmi-display-viewport')
      || container.classList.contains('hmi-workspace-viewport')
      || container.classList.contains('hmi-tile-composer')
    );

    container.classList.remove('hmi-fit-native', 'hmi-fit-contain', 'hmi-fit-cover', 'hmi-fit-stretch');
    container.classList.add(`hmi-fit-${fit}`);
    container.style.background = bg;

    if (isSquareWorkspace) {
      const limits = getDisplayLimits(screen, container);
      stage.style.display = 'block';
      stage.style.alignItems = fit === 'stretch' ? 'stretch' : '';
      stage.style.justifyContent = '';
      stage.style.width = '100%';
      stage.style.height = 'auto';
      stage.style.maxWidth = `${limits.maxW}px`;
      stage.style.aspectRatio = fit === 'stretch' ? '' : `${limits.logicalW} / ${limits.logicalH}`;
      stage.style.transform = '';
      stage.style.transformOrigin = '';
      stage.style.margin = '0 auto';
      stage.style.overflow = 'visible';
      stage.style.minHeight = '0';
      if (rootEl?.classList?.contains('hmi-tile-grid')) {
        rootEl.style.width = '';
        rootEl.style.height = '';
        rootEl.style.maxWidth = '';
        rootEl.style.aspectRatio = '';
        rootEl.style.minHeight = '';
        rootEl.style.margin = '';
        sizeTileGridElement(container, rootEl, screen);
      }
      return stage;
    }

    stage.style.width = `${xSize}px`;
    stage.style.height = `${ySize}px`;
    const ox = Number(screen?.offsetX) || 0;
    const oy = Number(screen?.offsetY) || 0;
    const parts = [];
    if (ox || oy) parts.push(`translate(${ox}px, ${oy}px)`);
    if (scale !== 1) parts.push(`scale(${scale})`);
    stage.style.transform = parts.length ? parts.join(' ') : '';
    stage.style.transformOrigin = 'top left';
    container.dataset.hmiEditable = screen?.editable === false ? '0' : '1';

    if (!rootEl) return stage;

    if (rootEl.tagName === 'svg' || rootEl.tagName === 'SVG') {
      rootEl.classList.add('hmi-screen-root');
      if (fit === 'stretch') {
        rootEl.setAttribute('width', '100%');
        rootEl.setAttribute('height', '100%');
        rootEl.setAttribute('preserveAspectRatio', 'none');
      } else if (fit === 'cover') {
        rootEl.setAttribute('width', '100%');
        rootEl.setAttribute('height', '100%');
        rootEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      } else if (fit === 'native') {
        rootEl.removeAttribute('width');
        rootEl.removeAttribute('height');
        rootEl.style.width = '100%';
        rootEl.style.height = '100%';
        rootEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      } else {
        rootEl.setAttribute('width', '100%');
        rootEl.setAttribute('height', '100%');
        rootEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
    } else if (rootEl.tagName === 'IMG') {
      rootEl.classList.add('hmi-screen-root');
      rootEl.style.width = fit === 'native' ? 'auto' : '100%';
      rootEl.style.height = fit === 'native' ? 'auto' : '100%';
      rootEl.style.maxWidth = '100%';
      rootEl.style.maxHeight = '100%';
      rootEl.style.objectFit = fit === 'stretch' ? 'fill' : fit === 'cover' ? 'cover' : 'contain';
    } else if (rootEl.classList?.contains('hmi-tile-grid')) {
      sizeTileGridElement(container, rootEl, screen);
    }
    return stage;
  }

  async function loadScreenInto(container, url, screen) {
    if (!container || !url) return null;
    const stage = ensureStage(container);
    stage.innerHTML = '';
    let root = null;
    if (/\.(gif|png|jpe?g|webp)$/i.test(url)) {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'hmi-raster';
      img.id = 'hmi-screen';
      img.alt = '';
      stage.appendChild(img);
      root = img;
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Screen not found: ${url}`);
      const text = await res.text();
      stage.innerHTML = text;
      root = stage.querySelector('svg');
    }
    if (screen) applyScreenLayout(container, screen, root);
    return root;
  }

  async function loadSvgInto(container, svgUrl, screen) {
    return loadScreenInto(container, svgUrl, screen);
  }

  async function measureAsset(url) {
    if (!url) throw new Error('No asset URL');
    if (/\.svg$/i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`SVG not found: ${url}`);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) throw new Error('Invalid SVG');
      const vb = svg.getAttribute('viewBox');
      let vbW;
      let vbH;
      if (vb) {
        const p = vb.trim().split(/[\s,]+/).map(Number);
        if (p.length === 4 && p.every(Number.isFinite)) {
          vbW = p[2];
          vbH = p[3];
        }
      }
      const attrW = parseFloat(String(svg.getAttribute('width') || '').replace(/px$/i, ''));
      const attrH = parseFloat(String(svg.getAttribute('height') || '').replace(/px$/i, ''));
      if (Number.isFinite(attrW) && attrW > 0 && Number.isFinite(attrH) && attrH > 0) {
        return { width: Math.round(attrW), height: Math.round(attrH) };
      }
      if (Number.isFinite(vbW) && vbW > 0 && Number.isFinite(vbH) && vbH > 0) {
        return { width: Math.round(vbW), height: Math.round(vbH) };
      }
      return { width: 1024, height: 800 };
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({
        width: img.naturalWidth || 1024,
        height: img.naturalHeight || 800,
      });
      img.onerror = () => reject(new Error(`Could not load: ${url}`));
      img.src = url;
    });
  }

  const GRID_SIZE = 8;
  const MAX_GRID_COLS = 24;
  const MAX_GRID_ROWS = 24;
  const DEFAULT_GRID_COLS = 8;
  const DEFAULT_GRID_ROWS = 8;
  const DEFAULT_CELL_WIDTH = 128;
  const DEFAULT_CELL_HEIGHT = 100;
  const HMI_MAX_LAYERS = 5;
  const HMI_OBJ_KINDS = ['staticImage', 'staticText', 'dynamicText', 'dynamicImage', 'navButton', 'pageHotspot', 'roomHotspot', 'flashOverlay', 'alarmList'];

  const HMI_ALARM_LABELS = {
    outerLow: 'Outer low',
    innerLow: 'Inner low',
    normal: 'Normal',
    innerHigh: 'Inner high',
    outerHigh: 'Outer high',
    alarm: 'Alarm',
  };
  const HMI_ALARM_PRIORITY = {
    outerLow: 50,
    outerHigh: 50,
    innerLow: 30,
    innerHigh: 30,
    alarm: 40,
  };

  function isHmiAlarmCapableType(type) {
    const u = String(type || '').toUpperCase();
    return u === 'BOOL' || u === 'INT' || u === 'REAL' || u === 'PID';
  }

  function hmiAlarmLevel(tag, liveEntry) {
    if (liveEntry?.alarmLevel) return liveEntry.alarmLevel;
    return tag?.alarmLevel || null;
  }

  function isHmiAlarmActiveLevel(level) {
    return !!level && level !== 'normal';
  }

  function collectHmiActiveAlarms(tags, liveList) {
    const liveMap = liveMapFromList(liveList);
    const rows = [];
    for (const t of tags || []) {
      if (!t?.alarmsEnabled || !isHmiAlarmCapableType(t.type)) continue;
      const le = liveMap[t.id];
      const level = hmiAlarmLevel(t, le);
      if (!isHmiAlarmActiveLevel(level)) continue;
      rows.push({
        tag: t,
        live: le,
        level,
        acked: !!(le?.alarmAcked),
        since: le?.alarmSince || null,
      });
    }
    rows.sort((a, b) => {
      const pa = HMI_ALARM_PRIORITY[a.level] || 0;
      const pb = HMI_ALARM_PRIORITY[b.level] || 0;
      if (pa !== pb) return pb - pa;
      if (a.acked !== b.acked) return a.acked ? 1 : -1;
      return String(a.tag.id).localeCompare(String(b.tag.id));
    });
    return rows;
  }

  function escHmiHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatHmiAlarmValue(tag, live) {
    if (!tag) return '—';
    if (live?.forceInput || live?.forceOutput) {
      const fv = live.forceValue;
      if (fv !== undefined && fv !== null && fv !== '') return String(fv);
    }
    if (String(tag.type || '').toUpperCase() === 'BOOL') {
      return live?.value ? 'ON' : 'OFF';
    }
    if (String(tag.type || '').toUpperCase() === 'PID' && live?.fb) {
      const pv = live.fb.pv;
      if (pv != null && pv !== '') return String(pv);
    }
    if (live?.value != null && live.value !== '') return String(live.value);
    return '—';
  }

  function hmiAlarmLevelPillClass(level) {
    if (level === 'normal') return 'tag-alarm-normal';
    if (level === 'innerLow' || level === 'innerHigh') return 'tag-alarm-inner';
    return 'tag-alarm-outer';
  }

  function renderHmiAlarmListHtml(rows, options = {}) {
    const showAcked = options.showAcked !== false;
    const editable = !!options.editable;
    const filtered = showAcked ? rows : rows.filter((r) => !r.acked);
    if (!filtered.length) {
      const emptyMsg = showAcked || !rows.length
        ? 'No active alarms'
        : 'No unacknowledged alarms';
      return `<p class="hmi-alarm-list-empty muted">${emptyMsg}</p>`;
    }
    const trs = filtered.map(({ tag: t, live, level, acked, since }) => {
      const label = String(t.label || '').trim() || t.id;
      const rowCls = acked ? 'alarm-row-acked' : `alarm-row-active alarm-row-${level}`;
      const sinceStr = since
        ? (window.PeaklogicTime?.formatFriendly?.(since)
          || new Date(since).toLocaleString(undefined, window.PeaklogicTime?.localeOpts?.() || {}))
        : '—';
      const levelLabel = HMI_ALARM_LABELS[level] || level;
      const ackCell = editable
        ? (acked ? '<span class="muted">Acked</span>' : '<span class="muted">—</span>')
        : (acked
          ? '<span class="muted">Acked</span>'
          : `<button type="button" class="btn btn-sm btn-alarm-ack" data-hmi-alarm-ack="${escHmiHtml(t.id)}">Ack</button>`);
      return `<tr class="${rowCls}">
        <td class="alarm-tag"><strong>${escHmiHtml(t.id)}</strong></td>
        <td class="alarm-label">${escHmiHtml(label)}</td>
        <td><span class="tag-alarm-pill ${hmiAlarmLevelPillClass(level)}">${escHmiHtml(levelLabel)}</span></td>
        <td class="cell-mono alarm-val">${escHmiHtml(formatHmiAlarmValue(t, live))}</td>
        <td class="alarm-since muted cell-mono">${escHmiHtml(sinceStr)}</td>
        <td class="alarm-ack-cell">${ackCell}</td>
      </tr>`;
    }).join('');
    return `<div class="hmi-alarm-list-scroll"><table class="data-table alarms-table hmi-alarm-list-table">
      <thead><tr><th>Tag</th><th>Label</th><th>Level</th><th>Value</th><th>Since</th><th>Ack</th></tr></thead>
      <tbody>${trs}</tbody>
    </table></div>`;
  }

  function applyAlarmListLayers(scope, liveList, tags, options = {}) {
    if (!scope?.querySelectorAll) return;
    const allRows = collectHmiActiveAlarms(tags, liveList);
    scope.querySelectorAll('.hmi-alarm-list[data-hmi-alarm-list]').forEach((panel) => {
      const panelShowAcked = panel.dataset.showAcked !== '0';
      const showAcked = options.editable ? panelShowAcked : false;
      const body = panel.querySelector('.hmi-alarm-list-body') || panel;
      body.innerHTML = renderHmiAlarmListHtml(allRows, { showAcked, editable: !!options.editable });
      if (!options.editable) {
        body.querySelectorAll('[data-hmi-alarm-ack]').forEach((btn) => {
          btn.onclick = () => {
            const tagId = btn.dataset.hmiAlarmAck;
            if (tagId && typeof options.onAck === 'function') options.onAck(tagId);
          };
        });
      }
    });
  }

  function getScreenGrid(screen) {
    const legacy = Number(screen?.gridSize);
    let cols = Number(screen?.gridCols);
    let rows = Number(screen?.gridRows);
    if (!Number.isFinite(cols) || cols < 1) {
      cols = Number.isFinite(legacy) && legacy > 0 ? legacy : DEFAULT_GRID_COLS;
    }
    if (!Number.isFinite(rows) || rows < 1) {
      rows = Number.isFinite(legacy) && legacy > 0 ? legacy : DEFAULT_GRID_ROWS;
    }
    cols = Math.max(1, Math.min(MAX_GRID_COLS, Math.round(cols)));
    rows = Math.max(1, Math.min(MAX_GRID_ROWS, Math.round(rows)));
    const width = Math.max(200, Math.min(4096, Number(screen?.width) || cols * DEFAULT_CELL_WIDTH));
    const height = Math.max(150, Math.min(4096, Number(screen?.height) || rows * DEFAULT_CELL_HEIGHT));
    let cellWidth = Number(screen?.cellWidth);
    let cellHeight = Number(screen?.cellHeight);
    if (!Number.isFinite(cellWidth) || cellWidth < 8) cellWidth = Math.round(width / cols);
    if (!Number.isFinite(cellHeight) || cellHeight < 8) cellHeight = Math.round(height / rows);
    cellWidth = Math.max(8, Math.min(512, Math.round(cellWidth)));
    cellHeight = Math.max(8, Math.min(512, Math.round(cellHeight)));
    return {
      cols,
      rows,
      cellWidth,
      cellHeight,
      width: cols * cellWidth,
      height: rows * cellHeight,
    };
  }

  function tileColSpan(tile) {
    return Math.max(1, Math.min(MAX_GRID_COLS, Number(tile?.colSpan) || 1));
  }

  function tileRowSpan(tile) {
    return Math.max(1, Math.min(MAX_GRID_ROWS, Number(tile?.rowSpan) || 1));
  }

  function pageHotspotRegion(layer, tileCol, tileRow, tileColSpan, tileRowSpan) {
    const regionKind = layer?.kind;
    if (!layer || !['pageHotspot', 'roomHotspot', 'flashOverlay', 'navButton', 'alarmList'].includes(regionKind)) {
      return {
        col: tileCol,
        row: tileRow,
        colSpan: tileColSpan || 1,
        rowSpan: tileRowSpan || 1,
      };
    }
    const tcs = tileColSpan || 1;
    const trs = tileRowSpan || 1;
    const hasPos = Number.isFinite(Number(layer.hotspotCol)) && Number.isFinite(Number(layer.hotspotRow));
    const hcs = Number(layer.hotspotColSpan);
    const hrs = Number(layer.hotspotRowSpan);
    const hasHotspotColSpan = Number.isFinite(hcs) && hcs > 0;
    const hasHotspotRowSpan = Number.isFinite(hrs) && hrs > 0;
    const hasHotspotSpan = hasHotspotColSpan || hasHotspotRowSpan;
    const defaultSpan = hasPos || hasHotspotSpan ? 1 : null;
    if (regionKind === 'flashOverlay' && !hasPos && !hasHotspotSpan) {
      return {
        col: tileCol,
        row: tileRow + Math.max(0, trs - 2),
        colSpan: tcs,
        rowSpan: Math.min(2, trs),
      };
    }
    return {
      col: hasPos ? Number(layer.hotspotCol) : tileCol,
      row: hasPos ? Number(layer.hotspotRow) : tileRow,
      colSpan: Math.max(1, Math.min(MAX_GRID_COLS, hasHotspotColSpan ? hcs : (defaultSpan ?? tcs))),
      rowSpan: Math.max(1, Math.min(MAX_GRID_ROWS, hasHotspotRowSpan ? hrs : (defaultSpan ?? trs))),
    };
  }

  function layerCellFraction(layer) {
    const v = Number(layer?.cellFraction);
    if (v === 0.25 || v === 0.5 || v === 0.75) return v;
    return 1;
  }

  function applyPageHotspotLayerBounds(layerEl, layer, tileCol, tileRow, tileColSpan, tileRowSpan) {
    if (!layerEl || !layer) return;
    const region = pageHotspotRegion(layer, tileCol, tileRow, tileColSpan, tileRowSpan);
    const tcs = tileColSpan || 1;
    const trs = tileRowSpan || 1;
    const dc = region.col - tileCol;
    const dr = region.row - tileRow;
    const wFrac = region.colSpan / tcs;
    const hFrac = region.rowSpan / trs;
    const cf = layerCellFraction(layer);
    const insetW = wFrac * (1 - cf) / 2;
    const insetH = hFrac * (1 - cf) / 2;
    layerEl.style.position = 'absolute';
    layerEl.style.inset = 'auto';
    layerEl.style.right = 'auto';
    layerEl.style.bottom = 'auto';
    layerEl.style.left = `${((dc / tcs) + insetW) * 100}%`;
    layerEl.style.top = `${((dr / trs) + insetH) * 100}%`;
    layerEl.style.width = `${wFrac * cf * 100}%`;
    layerEl.style.height = `${hFrac * cf * 100}%`;
  }

  function buildTileOccupancy(tiles, cols, rows) {
    const anchorMap = new Map();
    const covered = new Map();
    for (const tile of tiles || []) {
      const c0 = Number(tile.col);
      const r0 = Number(tile.row);
      if (!Number.isFinite(c0) || !Number.isFinite(r0)) continue;
      const cs = tileColSpan(tile);
      const rs = tileRowSpan(tile);
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const key = `${c},${r}`;
          if (dc === 0 && dr === 0) anchorMap.set(key, tile);
          else covered.set(key, { col: c0, row: r0 });
        }
      }
    }
    return { anchorMap, covered };
  }

  function applyTileSpanToCell(cell, col, row, tile) {
    if (!cell || !tile) return;
    const c = Number(col);
    const r = Number(row);
    const cs = tileColSpan(tile);
    const rs = tileRowSpan(tile);
    cell.style.gridColumnStart = String(c + 1);
    cell.style.gridColumnEnd = `span ${cs}`;
    cell.style.gridRowStart = String(r + 1);
    cell.style.gridRowEnd = `span ${rs}`;
    cell.classList.toggle('hmi-tile-span', cs > 1 || rs > 1);
    cell.classList.toggle('hmi-tile-span-bg', cs > 1 || rs > 1);
    cell.dataset.colSpan = String(cs);
    cell.dataset.rowSpan = String(rs);
  }

  function applyGridTemplate(grid, screen) {
    const g = getScreenGrid(screen);
    grid.style.gridTemplateColumns = `repeat(${g.cols}, ${g.cellWidth}fr)`;
    grid.style.gridTemplateRows = `repeat(${g.rows}, ${g.cellHeight}fr)`;
    if (screen?.fit === 'stretch') grid.style.aspectRatio = '';
    else grid.style.aspectRatio = `${g.width} / ${g.height}`;
    grid.dataset.gridCols = String(g.cols);
    grid.dataset.gridRows = String(g.rows);
    grid.dataset.cellWidth = String(g.cellWidth);
    grid.dataset.cellHeight = String(g.cellHeight);
    return g;
  }

  function wireNavButtons(grid, onNavigate, onOpenRoom) {
    if (!grid || (typeof onNavigate !== 'function' && typeof onOpenRoom !== 'function')) return;
    if (grid._hmiNavClick) {
      grid.removeEventListener('click', grid._hmiNavClick, true);
    }
    const setupGrid = grid.classList.contains('hmi-tile-grid-editable');
    grid._hmiNavClick = (e) => {
      const btn = e.target.closest?.('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-room-hotspot-btn');
      if (!btn || !grid.contains(btn)) return;
      if (setupGrid && !e.altKey) return;
      if (btn.classList.contains('hmi-room-hotspot-btn')) {
        const roomNum = Math.trunc(Number(btn.dataset.hmiRoomNum));
        if (!Number.isFinite(roomNum) || roomNum < 1) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof onOpenRoom === 'function') onOpenRoom(roomNum);
        return;
      }
      const target = btn.getAttribute('data-hmi-nav-target') || btn.dataset.hmiNavTarget || '';
      if (!target.trim() || typeof onNavigate !== 'function') return;
      e.preventDefault();
      e.stopPropagation();
      onNavigate(target.trim());
    };
    grid.addEventListener('click', grid._hmiNavClick, true);
    grid.querySelectorAll('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-room-hotspot-btn').forEach((btn) => {
      btn.type = 'button';
      btn.tabIndex = 0;
      if (setupGrid) {
        const hint = btn.classList.contains('hmi-room-hotspot-btn')
          ? `room ${btn.dataset.hmiRoomNum || ''}`
          : (btn.classList.contains('hmi-page-hotspot-btn') ? 'hotspot' : (btn.textContent || 'Page'));
        btn.title = `${hint} — click to select, Alt+click to preview page`;
      }
    });
  }

  function buildRoomHotspotHitList(screen) {
    const hits = [];
    for (const tile of screen?.tiles || []) {
      const tc = Number(tile.col);
      const tr = Number(tile.row);
      if (!Number.isFinite(tc) || !Number.isFinite(tr)) continue;
      const tcs = tileColSpan(tile);
      const trs = tileRowSpan(tile);
      for (const layer of tileLayers(tile)) {
        if (layer.kind !== 'roomHotspot') continue;
        const roomNum = Number(layer.roomNum);
        if (!Number.isFinite(roomNum) || roomNum < 1) continue;
        const region = pageHotspotRegion(layer, tc, tr, tcs, trs);
        const centerCol = Number.isFinite(Number(layer.centerCol))
          ? Number(layer.centerCol)
          : region.col + region.colSpan / 2;
        const centerRow = Number.isFinite(Number(layer.centerRow))
          ? Number(layer.centerRow)
          : region.row + region.rowSpan / 2;
        hits.push({
          ...region,
          roomNum: Math.trunc(roomNum),
          centerCol,
          centerRow,
        });
      }
    }
    return hits;
  }

  function buildPageHotspotHitList(screen) {
    const hits = [];
    for (const tile of screen?.tiles || []) {
      const tc = Number(tile.col);
      const tr = Number(tile.row);
      if (!Number.isFinite(tc) || !Number.isFinite(tr)) continue;
      const tcs = tileColSpan(tile);
      const trs = tileRowSpan(tile);
      for (const layer of tileLayers(tile)) {
        if (layer.kind !== 'pageHotspot') continue;
        const targetScreenId = String(layer.targetScreenId || '').trim();
        if (!targetScreenId) continue;
        const region = pageHotspotRegion(layer, tc, tr, tcs, trs);
        hits.push({
          ...region,
          targetScreenId,
          label: String(layer.label || '').trim(),
        });
      }
    }
    return hits;
  }

  function hotspotRegionContains(hit, col, row) {
    return col >= hit.col && col < hit.col + hit.colSpan
      && row >= hit.row && row < hit.row + hit.rowSpan;
  }

  /** Map pointer position within a spanned tile cell to logical grid col/row. */
  function gridCellFromPointer(cell, clientX, clientY) {
    if (!cell) return { col: NaN, row: NaN };
    const anchorCol = Number(cell.dataset.col);
    const anchorRow = Number(cell.dataset.row);
    const colSpan = Math.max(1, Number(cell.dataset.colSpan) || 1);
    const rowSpan = Math.max(1, Number(cell.dataset.rowSpan) || 1);
    if (!Number.isFinite(anchorCol) || !Number.isFinite(anchorRow)) {
      return { col: anchorCol, row: anchorRow };
    }
    if (colSpan === 1 && rowSpan === 1) {
      return { col: anchorCol, row: anchorRow };
    }
    const rect = cell.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { col: anchorCol, row: anchorRow };
    }
    const relX = Math.max(0, Math.min(rect.width - 0.001, clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height - 0.001, clientY - rect.top));
    const dc = Math.min(colSpan - 1, Math.floor((relX / rect.width) * colSpan));
    const dr = Math.min(rowSpan - 1, Math.floor((relY / rect.height) * rowSpan));
    return { col: anchorCol + dc, row: anchorRow + dr };
  }

  function gridFractionFromPointer(grid, clientX, clientY) {
    if (!grid) return { col: NaN, row: NaN };
    const rect = grid.getBoundingClientRect();
    if (!rect.width || !rect.height) return { col: NaN, row: NaN };
    const cols = Math.max(1, Number(grid.dataset.gridCols) || MAX_GRID_COLS);
    const rows = Math.max(1, Number(grid.dataset.gridRows) || MAX_GRID_ROWS);
    return {
      col: ((clientX - rect.left) / rect.width) * cols,
      row: ((clientY - rect.top) / rect.height) * rows,
    };
  }

  function pickRoomHotspotHit(hits, ptrCol, ptrRow) {
    const candidates = hits.filter((hit) => hotspotRegionContains(hit, ptrCol, ptrRow));
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0];
    let bestDist = Infinity;
    for (const hit of candidates) {
      const hx = Number.isFinite(hit.centerCol) ? hit.centerCol : hit.col + hit.colSpan / 2;
      const hy = Number.isFinite(hit.centerRow) ? hit.centerRow : hit.row + hit.rowSpan / 2;
      const d = (hx - ptrCol) ** 2 + (hy - ptrRow) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = hit;
      }
    }
    return best;
  }

  /** Live HMI: map clicks anywhere in a room-hotspot region. */
  function wireRoomHotspotGridHits(grid, screen, onOpenRoom) {
    if (!grid || typeof onOpenRoom !== 'function' || grid.classList.contains('hmi-tile-grid-editable')) {
      return;
    }
    const hits = buildRoomHotspotHitList(screen);
    grid._hmiRoomHotspotHits = hits;
    if (grid._hmiRoomHotspotGridClick) {
      grid.removeEventListener('click', grid._hmiRoomHotspotGridClick, true);
    }
    if (!hits.length) {
      grid._hmiRoomHotspotGridClick = null;
      return;
    }
    grid._hmiRoomHotspotGridClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-bool-cmd-btn, .hmi-bool-toggle-btn, .hmi-page-hotspot-btn')) return;
      if (!grid.contains(e.target)) return;
      const ptr = gridFractionFromPointer(grid, e.clientX, e.clientY);
      if (!Number.isFinite(ptr.col) || !Number.isFinite(ptr.row)) return;
      const hit = pickRoomHotspotHit(hits, ptr.col, ptr.row);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      onOpenRoom(hit.roomNum);
    };
    grid.addEventListener('click', grid._hmiRoomHotspotGridClick, true);
    if (grid._hmiRoomHotspotGridHover) {
      grid.removeEventListener('mousemove', grid._hmiRoomHotspotGridHover, true);
    }
    grid._hmiRoomHotspotGridHover = (e) => {
      if (grid.classList.contains('hmi-tile-grid-editable')) return;
      const ptr = gridFractionFromPointer(grid, e.clientX, e.clientY);
      const hit = Number.isFinite(ptr.col) && Number.isFinite(ptr.row)
        ? pickRoomHotspotHit(hits, ptr.col, ptr.row)
        : null;
      grid.title = hit ? `Room ${String(hit.roomNum).padStart(3, '0')} — click to open` : '';
    };
    grid.addEventListener('mousemove', grid._hmiRoomHotspotGridHover, true);
    grid.addEventListener('mouseleave', () => { grid.title = ''; }, true);
  }

  function pickPageHotspotHit(hits, ptrCol, ptrRow) {
    const candidates = hits.filter((hit) => hotspotRegionContains(hit, ptrCol, ptrRow));
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    candidates.sort((a, b) => (a.colSpan * a.rowSpan) - (b.colSpan * b.rowSpan));
    return candidates[0];
  }

  /** Live HMI: map clicks anywhere in a hotspot region (including over Z0 graphics). */
  function wirePageHotspotGridHits(grid, screen, onNavigate) {
    if (!grid || typeof onNavigate !== 'function' || grid.classList.contains('hmi-tile-grid-editable')) {
      return;
    }
    const hits = buildPageHotspotHitList(screen);
    grid._hmiHotspotHits = hits;
    if (grid._hmiHotspotGridClick) {
      grid.removeEventListener('click', grid._hmiHotspotGridClick, true);
    }
    if (!hits.length) {
      grid._hmiHotspotGridClick = null;
      return;
    }
    grid._hmiHotspotGridClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-bool-cmd-btn, .hmi-bool-toggle-btn, .hmi-bool-cmd-btn, .hmi-room-hotspot-btn')) return;
      if (!grid.contains(e.target)) return;
      const ptr = gridFractionFromPointer(grid, e.clientX, e.clientY);
      if (!Number.isFinite(ptr.col) || !Number.isFinite(ptr.row)) return;
      const hit = pickPageHotspotHit(hits, ptr.col, ptr.row);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      onNavigate(hit.targetScreenId);
    };
    grid.addEventListener('click', grid._hmiHotspotGridClick, true);
    if (grid._hmiHotspotGridHover) {
      grid.removeEventListener('mousemove', grid._hmiHotspotGridHover, true);
    }
    grid._hmiHotspotGridHover = (e) => {
      if (grid.classList.contains('hmi-tile-grid-editable')) return;
      const ptr = gridFractionFromPointer(grid, e.clientX, e.clientY);
      const hit = Number.isFinite(ptr.col) && Number.isFinite(ptr.row)
        ? pickPageHotspotHit(hits, ptr.col, ptr.row)
        : null;
      grid.title = hit?.label ? `${hit.label} — click to open` : '';
    };
    grid.addEventListener('mousemove', grid._hmiHotspotGridHover, true);
  }

  function markPageHotspotBackgroundsPassThrough(grid) {
    if (!grid || grid.classList.contains('hmi-tile-grid-editable')) return;
    grid.querySelectorAll('.hmi-tile-cell').forEach((cell) => {
      const hasHotspot = cell.classList.contains('hmi-tile-has-hotspot')
        || cell.classList.contains('hmi-tile-has-room-hotspot')
        || cell.querySelector('.hmi-page-hotspot-btn, .hmi-room-hotspot-btn');
      if (!hasHotspot) return;
      cell.querySelectorAll('.hmi-tile-layer:not([data-kind="pageHotspot"]):not([data-kind="roomHotspot"])').forEach((layer) => {
        layer.style.pointerEvents = 'none';
        layer.querySelectorAll('svg, img, .hmi-tile-asset-wrap, .hmi-pilot-light-wrap').forEach((el) => {
          el.style.pointerEvents = 'none';
        });
      });
      cell.querySelectorAll('.hmi-tile-layer[data-kind="pageHotspot"], .hmi-tile-layer[data-kind="roomHotspot"]').forEach((layer) => {
        layer.style.pointerEvents = 'auto';
        layer.style.zIndex = '12';
      });
    });
  }

  function findHoaSwitchCell(target, grid) {
    let el = target;
    while (el && el !== grid) {
      if (!el.classList?.contains('hmi-tile-cell')) {
        el = el.parentElement;
        continue;
      }
      if (el.classList.contains('hmi-hoa-switch') && cellHasHoaSwitchLayers(el)) return el;
      if (cellHasHoaSwitchLayers(el)) {
        el.classList.add('hmi-hoa-switch');
        return el;
      }
      return null;
    }
    return null;
  }

  function hoaTagIdForCell(cell, grid) {
    if (!cell) return '';
    if (cell.dataset.hoaTagId) return cell.dataset.hoaTagId;
    const key = `${cell.dataset.col},${cell.dataset.row}`;
    return grid?._hmiHoaTagByCell?.get(key) || '';
  }

  function markHoaSwitchCellsInteractive(grid) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-tile-cell').forEach((cell) => {
      const isHoa = cellHasHoaSwitchLayers(cell);
      if (!isHoa) {
        cell.classList.remove('hmi-hoa-switch', 'hmi-hoa-switch-interactive');
        return;
      }
      cell.classList.add('hmi-hoa-switch', 'hmi-hoa-switch-interactive');
      if (!cell.title) cell.title = 'HOA switch — click to cycle Auto → Off → Hand';
    });
  }

  function wireHoaSwitches(grid, onCycle) {
    if (!grid || typeof onCycle !== 'function') return;
    if (grid._hmiHoaClick) {
      grid.removeEventListener('click', grid._hmiHoaClick, true);
      grid.removeEventListener('pointerup', grid._hmiHoaClick, true);
    }
    grid._hmiHoaClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn')) return;
      if (e.type === 'pointerup' && e.button !== 0 && e.pointerType === 'mouse') return;
      const cell = findHoaSwitchCell(e.target, grid);
      if (!cell || !grid.contains(cell)) return;
      const tagId = hoaTagIdForCell(cell, grid);
      if (!tagId) return;
      const now = Date.now();
      if (now - (grid._hmiHoaLastFire || 0) < 350) return;
      grid._hmiHoaLastFire = now;
      e.preventDefault();
      e.stopPropagation();
      const cur = Number(cell.dataset.hoaState);
      const next = Number.isFinite(cur) ? (cur + 1) % 3 : 0;
      onCycle(tagId, next, cell);
    };
    grid.addEventListener('click', grid._hmiHoaClick, true);
    grid.addEventListener('pointerup', grid._hmiHoaClick, true);
    markHoaSwitchCellsInteractive(grid);
  }

  function isBoolToggleBinding(binding, tagType) {
    if (!binding?.tagId || !binding.elementId) return false;
    const ty = String(tagType || '').toUpperCase();
    if (ty && ty !== 'BOOL') return false;
    if (binding.property !== 'fill' && binding.property !== 'stroke') return false;
    if (binding.interaction === 'toggle') return true;
    if (binding.interaction === 'pulse' || binding.interaction === 'command') return false;
    return /btn_offline|chk_/i.test(bindingElementSuffix(binding.elementId));
  }

  function isBoolCommandBinding(binding, tagType) {
    if (!binding?.tagId || !binding.elementId) return false;
    const ty = String(tagType || '').toUpperCase();
    if (ty && ty !== 'BOOL') return false;
    if (binding.property !== 'fill' && binding.property !== 'stroke') return false;
    if (isBoolToggleBinding(binding, tagType)) return false;
    if (binding.interaction === 'pulse' || binding.interaction === 'command') return true;
    const suf = bindingElementSuffix(binding.elementId);
    if (/^button$/i.test(suf)) return binding.interaction !== 'toggle';
    return /^btn_/i.test(suf);
  }

  function resolveBoolCommandFromEvent(e, grid) {
    if (!e?.target || !grid) return null;
    const fromBtn = e.target.classList?.contains('hmi-bool-cmd-btn')
      ? e.target
      : e.target.closest?.('.hmi-bool-cmd-btn');
    if (fromBtn && grid.contains(fromBtn) && fromBtn.dataset.boolCmdTagId) {
      return { tagId: fromBtn.dataset.boolCmdTagId, el: fromBtn };
    }
    let node = e.target;
    for (let i = 0; i < 3 && node; i += 1) {
      const sib = node.previousElementSibling;
      if (sib?.classList?.contains('hmi-bool-cmd-btn') && sib.dataset.boolCmdTagId && grid.contains(sib)) {
        return { tagId: sib.dataset.boolCmdTagId, el: sib };
      }
      node = node.parentElement;
    }
    return null;
  }

  function motorCommandParts(tagId) {
    const m = /^MOTOR(\d+)_(START|STOP)$/i.exec(String(tagId || ''));
    if (!m) return null;
    return { n: m[1], action: m[2].toUpperCase() };
  }

  function resolveHandModePumpWrite(tagId, pressed, hoaState) {
    const parts = motorCommandParts(tagId);
    if (!parts) return null;
    if (Math.trunc(Number(hoaState)) !== 2) return null;
    if (!pressed) return { skip: true };
    return {
      tagId: `MOTOR${parts.n}_HAND`,
      value: parts.action === 'START',
      hoaTag: `MOTOR${parts.n}_HOA`,
    };
  }

  /** One Opta write_memory: HOA=Hand + START/STOP pulse + HAND latch. */
  function resolvePumpCommandWrites(tagId, pressed, hoaState) {
    const parts = motorCommandParts(tagId);
    if (!parts) return [{ tagId, value: !!pressed }];
    if (!pressed) return [{ tagId, value: false }];
    if (Math.trunc(Number(hoaState)) !== 2) {
      return [{ tagId, value: true }];
    }
    return [
      { tagId: `MOTOR${parts.n}_HOA`, value: 2 },
      { tagId, value: true },
      { tagId: `MOTOR${parts.n}_HAND`, value: parts.action === 'START' },
    ];
  }

  function resolveHandModePumpDisplayValue(binding) {
    if (!binding || String(binding.interaction || '') !== 'pulse') return null;
    if (!motorCommandParts(binding.tagId)) return null;
    return false;
  }

  function hoaValueForBinding(binding) {
    if (binding?.hoaValue != null && Number.isFinite(Number(binding.hoaValue))) {
      return Math.max(0, Math.min(2, Math.trunc(Number(binding.hoaValue))));
    }
    const suf = bindingElementSuffix(binding?.elementId);
    if (/_hand$/i.test(suf)) return 2;
    if (/_off$/i.test(suf)) return 1;
    return 0;
  }

  function isHoaModeButtonBinding(binding, tagType) {
    if (!binding?.tagId || !binding.elementId) return false;
    const ty = String(tagType || '').toUpperCase();
    if (ty && ty !== 'INT' && !ty.includes('INT')) return false;
    if (String(binding.interaction || '') === 'hoaMode') return true;
    if (binding.property !== 'fill5' && binding.property !== 'fill') return false;
    return /^btn_p\d+_(auto|off|hand)$/i.test(bindingElementSuffix(binding.elementId));
  }

  function isState3ReadoutBinding(binding, tagType) {
    if (!binding?.tagId || !binding.elementId) return false;
    if (String(tagType || '').toUpperCase() !== 'INT') return false;
    if (binding.property !== 'text') return false;
    if (binding.format === 'poolLightOp' || binding.format === 'poolLightColor') return true;
    if (binding.format === 'int' && /light_sel_drum/i.test(bindingElementSuffix(binding.elementId))) return true;
    return binding.format === 'state3' || /hoa/i.test(bindingElementSuffix(binding.elementId));
  }

  function isParamEditBinding(binding, tagType) {
    if (!binding?.tagId || !binding.elementId) return false;
    if (binding.property !== 'text') return false;
    const fmt = String(binding.format || '').toLowerCase();
    if (binding.interaction === 'edit' && (fmt === 'hhmm' || fmt === 'dow' || fmt === 'hoursfrommin' || fmt === 'int' || fmt === 'fixed0' || fmt === 'fixed1')) {
      return true;
    }
    const ty = String(tagType || '').toUpperCase();
    if (ty !== 'INT' && ty !== 'REAL') return false;
    const suf = bindingElementSuffix(binding.elementId);
    if (/^(window_start|window_end|param_app_min|param_repeat_min|param_on_min|param_off_min|orp_sp_value|pump_speed_sp)$/i.test(suf)) {
      return fmt === 'hhmm' || fmt === 'int';
    }
    return false;
  }

  function clearPushButtonOverlayHits(svg) {
    if (!svg?.querySelectorAll) return;
    for (const el of svg.querySelectorAll('text, tspan, [id$="__button_text"], #button_text, [id$="__button_bezel"], #button_bezel, .btn-text')) {
      el.style.pointerEvents = 'none';
    }
  }

  function markBoolCommandElementsInteractive(grid, bindings, tagTypeFor) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-bool-cmd-btn').forEach((el) => {
      el.classList.remove('hmi-bool-cmd-btn');
      el.style.pointerEvents = '';
      delete el.dataset.boolCmdTagId;
    });
    grid.querySelectorAll('.hmi-bool-cmd-cell').forEach((el) => el.classList.remove('hmi-bool-cmd-cell'));
    for (const b of bindings || []) {
      const tagType = typeof tagTypeFor === 'function' ? tagTypeFor(b.tagId) : '';
      if (!isBoolCommandBinding(b, tagType)) continue;
      for (const el of findBindingElements(grid, b.elementId)) {
        el.classList.add('hmi-bool-cmd-btn');
        el.style.pointerEvents = 'auto';
        el.dataset.boolCmdTagId = b.tagId;
        const svg = el.ownerSVGElement || el.closest('svg');
        if (svg?.style) svg.style.pointerEvents = 'auto';
        svg?.closest?.('.hmi-tile-asset-wrap')?.style.setProperty('pointer-events', 'auto');
        clearPushButtonOverlayHits(svg);
        const cell = el.closest?.('.hmi-tile-cell');
        if (cell) cell.classList.add('hmi-bool-cmd-cell');
      }
    }
  }

  function markBoolToggleElementsInteractive(grid, bindings, tagTypeFor) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-bool-toggle-btn').forEach((el) => {
      el.classList.remove('hmi-bool-toggle-btn');
      el.style.pointerEvents = '';
      delete el.dataset.boolToggleTagId;
    });
    grid.querySelectorAll('.hmi-bool-toggle-cell').forEach((el) => el.classList.remove('hmi-bool-toggle-cell'));
    for (const b of bindings || []) {
      const tagType = typeof tagTypeFor === 'function' ? tagTypeFor(b.tagId) : '';
      if (!isBoolToggleBinding(b, tagType)) continue;
      for (const el of findBindingElements(grid, b.elementId)) {
        el.classList.add('hmi-bool-toggle-btn');
        el.style.pointerEvents = 'auto';
        el.dataset.boolToggleTagId = b.tagId;
        const svg = el.ownerSVGElement || el.closest('svg');
        clearPushButtonOverlayHits(svg);
        const cell = el.closest?.('.hmi-tile-cell');
        if (cell) cell.classList.add('hmi-bool-toggle-cell');
      }
    }
  }

  function wireBoolToggleButtons(grid, bindings, tagTypeFor, onToggle) {
    if (!grid || typeof onToggle !== 'function') return;
    markBoolToggleElementsInteractive(grid, bindings, tagTypeFor);
    if (grid._hmiBoolToggleClick) {
      grid.removeEventListener('click', grid._hmiBoolToggleClick, true);
    }
    grid._hmiBoolToggleClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-bool-cmd-btn, .hmi-hoa-mode-btn')) return;
      const btn = e.target.closest('.hmi-bool-toggle-btn');
      if (!btn || !grid.contains(btn)) return;
      const tagId = btn.dataset.boolToggleTagId;
      if (!tagId) return;
      const now = Date.now();
      if (now - (grid._hmiBoolToggleLastFire || 0) < 350) return;
      grid._hmiBoolToggleLastFire = now;
      e.preventDefault();
      e.stopPropagation();
      onToggle(tagId, btn);
    };
    grid.addEventListener('click', grid._hmiBoolToggleClick, true);
  }

  function restoreBoolCommandActive(grid, wasActive) {
    if (!wasActive?.tagId || wasActive.pointerId == null) return null;
    const esc = typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(wasActive.tagId)
      : String(wasActive.tagId).replace(/"/g, '\\"');
    const btn = grid.querySelector(`.hmi-bool-cmd-btn[data-bool-cmd-tag-id="${esc}"]`);
    return btn ? { tagId: wasActive.tagId, pointerId: wasActive.pointerId, el: btn } : null;
  }

  function wireBoolCommandButtons(grid, bindings, tagTypeFor, onPulse) {
    if (!grid || typeof onPulse !== 'function') return;
    const wasActive = grid._hmiBoolActive;
    markBoolCommandElementsInteractive(grid, bindings, tagTypeFor);
    if (grid._hmiBoolCmdDown) {
      grid.removeEventListener('pointerdown', grid._hmiBoolCmdDown, true);
      grid.removeEventListener('pointerup', grid._hmiBoolCmdUp, true);
      grid.removeEventListener('pointercancel', grid._hmiBoolCmdUp, true);
    }
    grid._hmiBoolActive = restoreBoolCommandActive(grid, wasActive);
    grid._hmiBoolCmdDown = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn')) return;
      const hit = resolveBoolCommandFromEvent(e, grid);
      if (!hit?.tagId) return;
      e.preventDefault();
      e.stopPropagation();
      hit.el.classList?.add?.('hmi-bool-cmd-pressed');
      grid._hmiBoolActive = { tagId: hit.tagId, pointerId: e.pointerId, el: hit.el };
      try { hit.el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      onPulse(hit.tagId, true, hit.el);
    };
    grid._hmiBoolCmdUp = (e) => {
      const active = grid._hmiBoolActive;
      if (!active || e.pointerId !== active.pointerId) return;
      try { active.el?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
      active.el?.classList?.remove?.('hmi-bool-cmd-pressed');
      grid._hmiBoolActive = null;
      onPulse(active.tagId, false, active.el);
    };
    grid.addEventListener('pointerdown', grid._hmiBoolCmdDown, true);
    grid.addEventListener('pointerup', grid._hmiBoolCmdUp, true);
    grid.addEventListener('pointercancel', grid._hmiBoolCmdUp, true);
  }

  function markHoaModeElementsInteractive(grid, bindings, tagTypeFor) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-hoa-mode-btn').forEach((el) => {
      el.classList.remove('hmi-hoa-mode-btn');
      el.style.pointerEvents = '';
      delete el.dataset.hoaModeTagId;
      delete el.dataset.hoaModeValue;
    });
    grid.querySelectorAll('.hmi-hoa-mode-cell').forEach((el) => el.classList.remove('hmi-hoa-mode-cell'));
    for (const b of bindings || []) {
      const tagType = typeof tagTypeFor === 'function' ? tagTypeFor(b.tagId) : '';
      if (!isHoaModeButtonBinding(b, tagType)) continue;
      const hoaValue = hoaValueForBinding(b);
      for (const el of findBindingElements(grid, b.elementId)) {
        el.classList.add('hmi-hoa-mode-btn');
        el.style.pointerEvents = 'auto';
        el.dataset.hoaModeTagId = b.tagId;
        el.dataset.hoaModeValue = String(hoaValue);
        const svg = el.ownerSVGElement || el.closest('svg');
        if (svg?.style) svg.style.pointerEvents = 'auto';
        svg?.closest?.('.hmi-tile-asset-wrap')?.style.setProperty('pointer-events', 'auto');
        clearPushButtonOverlayHits(svg);
        const cell = el.closest?.('.hmi-tile-cell');
        if (cell) cell.classList.add('hmi-hoa-mode-cell');
      }
    }
  }

  function wireHoaModeButtons(grid, bindings, tagTypeFor, onSelect) {
    if (!grid || typeof onSelect !== 'function') return;
    markHoaModeElementsInteractive(grid, bindings, tagTypeFor);
    if (grid._hmiHoaModeClick) {
      grid.removeEventListener('click', grid._hmiHoaModeClick, true);
    }
    grid._hmiHoaModeClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-bool-cmd-btn')) return;
      const btn = e.target.closest('.hmi-hoa-mode-btn');
      if (!btn || !grid.contains(btn)) return;
      const tagId = btn.dataset.hoaModeTagId;
      if (!tagId) return;
      const now = Date.now();
      if (now - (grid._hmiHoaModeLastFire || 0) < 250) return;
      grid._hmiHoaModeLastFire = now;
      e.preventDefault();
      e.stopPropagation();
      const next = Math.max(0, Math.min(2, Math.trunc(Number(btn.dataset.hoaModeValue) || 0)));
      onSelect(tagId, next, btn);
    };
    grid.addEventListener('click', grid._hmiHoaModeClick, true);
  }

  function markState3ReadoutsInteractive(grid, bindings, tagTypeFor) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-state3-readout-interactive').forEach((el) => {
      el.classList.remove('hmi-state3-readout-interactive');
      el.style.pointerEvents = '';
      delete el.dataset.state3TagId;
    });
    grid.querySelectorAll('.hmi-state3-readout-cell').forEach((el) => el.classList.remove('hmi-state3-readout-cell'));
    for (const b of bindings || []) {
      const tagType = typeof tagTypeFor === 'function' ? tagTypeFor(b.tagId) : '';
      if (!isState3ReadoutBinding(b, tagType)) continue;
      for (const el of findBindingElements(grid, b.elementId)) {
        el.classList.add('hmi-state3-readout-interactive');
        el.style.pointerEvents = 'auto';
        el.dataset.state3TagId = b.tagId;
        const cell = el.closest?.('.hmi-tile-cell');
        if (cell) cell.classList.add('hmi-state3-readout-cell');
      }
    }
  }

  function wireState3Readouts(grid, bindings, tagTypeFor, onCycle) {
    if (!grid || typeof onCycle !== 'function') return;
    markState3ReadoutsInteractive(grid, bindings, tagTypeFor);
    if (grid._hmiState3Click) {
      grid.removeEventListener('click', grid._hmiState3Click, true);
      grid.removeEventListener('pointerup', grid._hmiState3Click, true);
    }
    grid._hmiState3Click = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-bool-cmd-btn, .hmi-hoa-mode-btn')) return;
      if (e.type === 'pointerup' && e.button !== 0 && e.pointerType === 'mouse') return;
      const el = e.target.closest('.hmi-state3-readout-interactive');
      if (!el || !grid.contains(el)) return;
      const tagId = el.dataset.state3TagId;
      if (!tagId) return;
      const cell = el.closest('.hmi-tile-cell');
      if (!cell) return;
      const now = Date.now();
      if (now - (grid._hmiState3LastFire || 0) < 350) return;
      grid._hmiState3LastFire = now;
      e.preventDefault();
      e.stopPropagation();
      const binding = (bindings || []).find((b) => b.tagId === tagId);
      const cur = Number(cell.dataset.hoaState);
      if (binding?.format === 'state3' || /hoa/i.test(bindingElementSuffix(binding?.elementId))) {
        const next = Number.isFinite(cur) ? (cur + 1) % 3 : 0;
        onCycle(tagId, next, cell);
        return;
      }
      const steps = binding ? drumStepCount(binding) : 3;
      const base = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
      const rel = Number.isFinite(cur) ? cur - base : 0;
      const next = base + ((Number.isFinite(rel) ? rel + 1 : 0) % steps);
      onCycle(tagId, next, cell);
    };
    grid.addEventListener('click', grid._hmiState3Click, true);
    grid.addEventListener('pointerup', grid._hmiState3Click, true);
  }

  function markParamEditElementsInteractive(grid, bindings, tagTypeFor) {
    if (!grid) return;
    grid.querySelectorAll('.hmi-param-edit').forEach((el) => {
      el.classList.remove('hmi-param-edit');
      el.style.pointerEvents = '';
      delete el.dataset.paramEditTagId;
      delete el.dataset.paramEditFormat;
      delete el.title;
    });
    grid.querySelectorAll('.hmi-param-edit-cell').forEach((el) => el.classList.remove('hmi-param-edit-cell'));
    for (const b of bindings || []) {
      const tagType = typeof tagTypeFor === 'function' ? tagTypeFor(b.tagId) : '';
      if (!isParamEditBinding(b, tagType)) continue;
      for (const el of findBindingElements(grid, b.elementId)) {
        const markHit = (node) => {
          if (!node) return;
          node.classList.add('hmi-param-edit');
          node.style.pointerEvents = 'auto';
          node.style.cursor = 'pointer';
          node.dataset.paramEditTagId = b.tagId;
          node.dataset.paramEditFormat = b.format || 'int';
          node.title = b.format === 'hhmm'
            ? 'Click to set time (HH:MM)'
            : (b.format === 'hoursFromMin' ? 'Click to set turnover hours (e.g. 6.0)' : 'Click to set value');
        };
        markHit(el);
        el.querySelectorAll?.('rect, text').forEach(markHit);
        const cell = el.closest?.('.hmi-tile-cell');
        if (cell) {
          cell.classList.add('hmi-param-edit-cell');
          cell.querySelectorAll('.hmi-tile-layer').forEach((layer) => {
            if (!layer.querySelector('[data-param-edit-tag-id]')) return;
            layer.style.pointerEvents = 'auto';
            layer.querySelector('.hmi-tile-asset-wrap')?.style.setProperty('pointer-events', 'auto');
            layer.querySelector('svg.hmi-tile-asset, svg')?.style.setProperty('pointer-events', 'auto');
          });
        }
      }
    }
  }

  function wireParamEditFields(grid, bindings, tagTypeFor, onEdit) {
    if (!grid || typeof onEdit !== 'function') return;
    markParamEditElementsInteractive(grid, bindings, tagTypeFor);
    if (grid._hmiParamEditClick) {
      grid.removeEventListener('click', grid._hmiParamEditClick, true);
    }
    grid._hmiParamEditClick = (e) => {
      if (e.target.closest('.hmi-nav-cell-btn, .hmi-page-hotspot-btn, .hmi-bool-cmd-btn, .hmi-bool-toggle-btn')) return;
      const el = e.target.closest('[data-param-edit-tag-id]');
      if (!el || !grid.contains(el)) return;
      const tagId = el.dataset.paramEditTagId;
      if (!tagId) return;
      const binding = (bindings || []).find((b) => b.tagId === tagId && isParamEditBinding(b, tagTypeFor?.(tagId)));
      if (!binding) return;
      const now = Date.now();
      if (now - (grid._hmiParamEditLastFire || 0) < 350) return;
      grid._hmiParamEditLastFire = now;
      e.preventDefault();
      e.stopPropagation();
      onEdit(tagId, binding, el);
    };
    grid.addEventListener('click', grid._hmiParamEditClick, true);
  }

  /** Prefix uses grid coord labels (1-based), same as corner labels on each cell. */
  function tilePrefix(col, row) {
    return `t${Number(col) + 1}_${Number(row) + 1}`;
  }

  function layerPrefix(col, row, z) {
    return `${tilePrefix(col, row)}_z${Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0))}`;
  }

  function layerElementId(col, row, z, suffix) {
    return `${layerPrefix(col, row, z)}__${suffix}`;
  }

  function parseCellElementId(elementId) {
    const id = String(elementId || '');
    const zMatch = /^t(\d+)_(\d+)_z(\d+)__(.+)$/.exec(id);
    if (zMatch) {
      return {
        col: Number(zMatch[1]) - 1,
        row: Number(zMatch[2]) - 1,
        z: Number(zMatch[3]),
        suffix: zMatch[4],
        displayCol: Number(zMatch[1]),
        displayRow: Number(zMatch[2]),
      };
    }
    const match = /^t(\d+)_(\d+)__(.+)$/.exec(id);
    if (match) {
      return {
        col: Number(match[1]) - 1,
        row: Number(match[2]) - 1,
        z: null,
        suffix: match[3],
        displayCol: Number(match[1]),
        displayRow: Number(match[2]),
      };
    }
    const layerOnly = /^t(\d+)_(\d+)_z(\d+)$/.exec(id);
    if (layerOnly) {
      return {
        col: Number(layerOnly[1]) - 1,
        row: Number(layerOnly[2]) - 1,
        z: Number(layerOnly[3]),
        suffix: '*',
        displayCol: Number(layerOnly[1]),
        displayRow: Number(layerOnly[2]),
      };
    }
    return null;
  }

  /** Room summary SVGs with inline val_* readouts and lamp_* status circles — not dial gauges. */
  function isInlineReadoutFaceplateSvg(svg, assetPath) {
    if (!svg) return false;
    const path = String(assetPath || svg.dataset?.hmiAssetPath || '').toLowerCase();
    if (/assisted-living\/(kitchen_room|mechanical_room|pool_room|conference_room|room_interior|room_detail|support_restroom|nurse_bath|nurse_sink|kitchen_freezer|kitchen_reefer|kitchen_sink|pool_detail)/.test(path)) {
      return true;
    }
    if ([...svg.querySelectorAll('[id]')].some((el) => /val_/.test(el.id))) return true;
    const largeCircles = [...svg.querySelectorAll('circle')].filter((c) => {
      const r = parseFloat(String(c.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      return r > 8;
    });
    return largeCircles.length >= 2
      && largeCircles.every((c) => /lamp/i.test(String(c.id || '')));
  }

  function clearGaugeChromeFromReadoutLayer(layerEl, svg, assetPath) {
    if (!layerEl || !isInlineReadoutFaceplateSvg(svg, assetPath)) return;
    layerEl.querySelector('.hmi-value-overlay')?.remove();
    layerEl.querySelector('.hmi-analog-ring')?.remove();
  }

  function cellHasDialGauge(cell, z) {
    if (!cell) return false;
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const layer = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
    if (!layer) return false;
    const svg = layer.querySelector('svg.hmi-tile-asset, svg');
    if (svg) {
      if (isPilotLightSvg(svg)) return false;
      if (isCompositeFaceplateSvg(svg)) return false;
      if (isInlineReadoutFaceplateSvg(svg)) return false;
      const circles = [...svg.querySelectorAll('circle')].filter((c) => {
        const r = parseFloat(String(c.getAttribute('r') || '').replace(/px$/i, '')) || 0;
        return r > 8;
      });
      if (circles.length >= 2) return true;
      if (/dialbg|dial-bg|gauge_dial/i.test(svg.innerHTML || '')
        || /dialbg|dial-bg|gauge_dial/i.test(String(svg.dataset?.hmiAssetPath || ''))) return true;
    }
    const img = layer.querySelector('img.hmi-tile-asset, img.hmi-raster');
    if (img && /dialbg|dial-bg|gauge.*dial|gauge.*face/i.test(img.src || '')) return true;
    return false;
  }

  function dialNeedleSweep(binding) {
    const aMin = asNumber(binding?.offValue);
    const aMax = asNumber(binding?.onValue);
    return {
      angleMin: Number.isFinite(aMin) ? aMin : DIAL_ANGLE_MIN_DEFAULT,
      angleMax: Number.isFinite(aMax) ? aMax : DIAL_ANGLE_MAX_DEFAULT,
    };
  }

  function needleRotationDeg(v, binding) {
    const { angleMin, angleMax } = dialNeedleSweep(binding);
    const n = scaledNumeric(v, binding);
    const min = Number.isFinite(Number(binding?.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding?.max)) ? Number(binding.max) : 100;
    let angle = angleMin;
    if (n != null) {
      const t = max === min ? 0 : (n - min) / (max - min);
      angle = angleMin + t * (angleMax - angleMin);
    }
    return angle - DIAL_NEEDLE_ZERO_DEG;
  }

  function isDialPointerSvg(svg, assetPath) {
    if (!svg) return false;
    const path = String(assetPath || svg.dataset?.hmiAssetPath || '');
    if (isCompositeFaceplateAssetPath(path)) return false;
    if (isPilotLightAssetPath(assetPath) || isPilotLightAssetPath(svg.dataset?.hmiAssetPath)) return false;
    if (svg.classList?.contains('hmi-pilot-light') || isPilotLightSvg(svg)) return false;
    if (/dialpointer|dial-pointer/i.test(String(assetPath || ''))) return true;
    if (findPilotLampInSvg(svg)) return false;
    return !!(svg.querySelector('polygon') && !svg.querySelector('circle[r="55"], circle[r="50"]'));
  }

  /** MV pointer hub is at (0,0); viewBox must be centered there for layer alignment. */
  const DIAL_POINTER_VIEWBOX = '-36 -36 72 72';

  function dialPointerRotatorRoot(svg) {
    if (!svg) return null;
    if (svg.__hmiNeedleRoot) return svg.__hmiNeedleRoot;
    let root = svg.querySelector('[data-hmi-needle-root]');
    if (!root) {
      const gs = [...svg.querySelectorAll('g')].filter((g) => !g.closest('defs, mask, clipPath'));
      root = gs.find((g) => g.querySelector('polygon')) || gs[0];
      if (root) {
        root.setAttribute('data-hmi-needle-root', '1');
        const pref = String(svg.id || '').match(/^(t\d+_\d+_z\d+)__/)?.[1];
        if (pref && (!root.id || !root.id.startsWith(`${pref}__`))) {
          root.id = `${pref}__dial_needle_root`;
        }
      }
    }
    if (root) svg.__hmiNeedleRoot = root;
    return root;
  }

  function fitDialPointerSvg(svg) {
    if (!svg) return;
    svg.setAttribute('viewBox', DIAL_POINTER_VIEWBOX);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.transform = '';
    svg.style.transformOrigin = '';
  }

  function ensureDialPointerSetup(svg, prefix, assetPath) {
    if (!svg || !prefix || !isDialPointerSvg(svg, assetPath)) return;
    svg.id = `${prefix}__${HMI_DIAL_POINTER_ID}`;
    svg.classList.add('hmi-tile-asset', 'hmi-dial-pointer');
    dialPointerRotatorRoot(svg);
    fitDialPointerSvg(svg);
  }

  function layerHasDialPointer(layer) {
    if (!layer) return null;
    const hit = layer.querySelector('svg.hmi-dial-pointer');
    if (hit) return hit;
    for (const svg of layer.querySelectorAll('svg.hmi-tile-asset, svg')) {
      if (isPilotLightSvg(svg) || isPilotLightAssetPath(svg.dataset?.hmiAssetPath)) continue;
      if (svg.classList.contains('hmi-dial-pointer')) return svg;
      if (/dialpointer|dial-pointer/i.test(String(svg.id || ''))) return svg;
      const poly = svg.querySelector('polygon');
      const bigCircle = svg.querySelector('circle[r="50"], circle[r="55"], circle[r="48"]');
      if (poly && !bigCircle && !findPilotLampInSvg(svg)) return svg;
    }
    return null;
  }

  function findDialPointerInCell(cell, z) {
    if (!cell) return null;
    // null/undefined = search all layers; Number(null) is 0 — do not use Number() for the sentinel.
    const zFilter = z == null
      ? null
      : (Number.isFinite(Number(z)) ? Number(z) : null);
    const layers = [...cell.querySelectorAll('.hmi-tile-layer')].sort(
      (a, b) => (Number(b.dataset.z) || 0) - (Number(a.dataset.z) || 0)
    );
    for (const layer of layers) {
      const lz = Number(layer.dataset.z) || 0;
      if (zFilter !== null && lz !== zFilter) continue;
      const svg = layerHasDialPointer(layer);
      if (svg) return svg;
    }
    if (zFilter !== null) return findDialPointerInCell(cell, undefined);
    return null;
  }

  function applyNeedleRotation(el, binding, liveMap) {
    const v = bindingTagValue(binding, liveMap);
    const deg = needleRotationDeg(v, binding);
    const tag = el?.tagName?.toLowerCase();
    if ((tag === 'g' || tag === 'path') && /pv_needle|needle/i.test(String(el.id || ''))) {
      const rotator = tag === 'g' ? el : el.closest?.('g');
      if (rotator) {
        rotator.setAttribute('transform', `rotate(${deg} 0 0)`);
        return;
      }
    }
    let svg = null;
    if (el?.tagName?.toLowerCase() === 'svg') svg = el;
    else if (el?.classList?.contains('hmi-dial-pointer') || String(el?.id || '').includes('dial_pointer')) {
      svg = el.closest?.('svg') || (el.tagName?.toLowerCase() === 'g' ? el.ownerSVGElement : null);
    }
    if (!svg) {
      const cell = el?.closest?.('.hmi-tile-cell');
      const parsed = binding?.elementId ? parseCellElementId(binding.elementId) : null;
      const zHint = parsed?.z ?? el?.closest?.('.hmi-tile-layer')?.dataset?.z;
      svg = findDialPointerInCell(cell, zHint != null ? Number(zHint) : undefined)
        || el?.closest?.('.hmi-tile-layer')?.querySelector('svg.hmi-dial-pointer, svg.hmi-tile-asset');
    }
    if (!svg) return;
    const rotator = dialPointerRotatorRoot(svg);
    if (!rotator) return;
    svg.style.transform = '';
    svg.style.transformOrigin = '';
    rotator.setAttribute('transform', `rotate(${deg} 0 0)`);
  }

  function bindingPaintColor(v, binding, on) {
    const t = analogFillT(v, binding);
    if (t != null && (binding.onValue || binding.offValue)) {
      return lerpHexColor(binding.offValue, binding.onValue, t);
    }
    const c = on ? binding.onValue : binding.offValue;
    return c ? String(c) : '';
  }

  function applyGaugeLayerBinding(scope, binding, liveMap) {
    const parsed = parseCellElementId(binding.elementId);
    if (!parsed || parsed.col == null || parsed.row == null) return false;
    if (isFaceplateControlSuffix(parsed.suffix || bindingElementSuffix(binding.elementId))) return false;
    const zN = parsed.z != null ? parsed.z : 0;
    const cell = scope.querySelector(
      `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
    );
    if (!cell || !cellHasDialGauge(cell, zN)) return false;
    const layerSvg = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"] svg.hmi-tile-asset, .hmi-tile-layer[data-z="${zN}"] svg`);
    if (isPilotLightSvg(layerSvg)) return false;
    if (isCompositeFaceplateSvg(layerSvg)) return false;
    if (isInlineReadoutFaceplateSvg(layerSvg)) return false;
    ensureCellBindingIds(cell, parsed.col, parsed.row, zN);
    const layer = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
    if (!layer) return false;
    const v = bindingTagValue(binding, liveMap);
    const on = isTruthy(v);

    if (binding.property === 'text') {
      const ov = ensureValueOverlay(layer, parsed.col, parsed.row, zN);
      applyBinding(ov, binding, liveMap);
      fitValueOverlay(layer);
      return true;
    }

    if (binding.property !== 'fill' && binding.property !== 'stroke'
      && binding.property !== 'fill5' && binding.property !== 'fill8') {
      return false;
    }
    const color = bindingPaintColor(v, binding, on);
    if (!color) return false;

    ensureAnalogRing(layer, color);

    const svg = layer.querySelector('svg.hmi-tile-asset, svg');
    if (svg) paintDialSvgAnalog(svg, color, binding);
    const img = layer.querySelector('img.hmi-tile-asset, img.hmi-raster');
    if (img) applyRasterPaint(img, binding, v, on);
    return true;
  }

  function bindingElementTargetsCell(elementId, col, row) {
    const parsed = parseCellElementId(elementId);
    if (!parsed) return false;
    const c = Number(col);
    const r = Number(row);
    return parsed.col === c && parsed.row === r;
  }

  function bindingElementIdVariants(col, row, z, suffix) {
    const c = Number(col);
    const r = Number(row);
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const suf = suffix || HMI_LABEL_ID;
    const ids = [
      layerElementId(c, r, zN, suf),
      `t${c}_${r}_z${zN}__${suf}`,
    ];
    return [...new Set(ids)];
  }

  function ensureLayerLabelId(col, row, z) {
    const cell = typeof document !== 'undefined'
      ? document.querySelector(
        `#hmi-setup-preview .hmi-tile-cell[data-col="${col}"][data-row="${row}"], `
        + `#hmi-viewport .hmi-tile-cell[data-col="${col}"][data-row="${row}"], `
        + `.hmi-tile-cell[data-col="${col}"][data-row="${row}"]`
      )
      : null;
    if (!cell) return null;
    const zN = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(z) || 0));
    const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
    if (!layerEl) return null;
    const kind = layerEl.dataset.kind || '';
    if (kind !== 'staticText' && kind !== 'dynamicText') return null;
    const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
    if (!svg) return null;
    ensureSvgBindingIds(svg);
    const textEl = labelTextElement(svg);
    if (!textEl) return null;
    const c = Number(col);
    const r = Number(row);
    const prefix = layerPrefix(c, r, zN);
    if (!textEl.id || !textEl.id.includes('hmi_label')) {
      textEl.id = `${prefix}__${HMI_LABEL_ID}`;
    }
    return textEl.id;
  }

  function tileLayers(tile) {
    if (!tile) return [];
    if (Array.isArray(tile.layers) && tile.layers.length) {
      return tile.layers.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    }
    if (tile.svg) {
      const faceplate = isCompositeFaceplateAssetPath(tile.svg);
      const kind = faceplate
        ? 'staticImage'
        : (HMI_OBJ_KINDS.includes(tile.kind) ? tile.kind : (tile.label ? 'staticText' : 'staticImage'));
      return [{
        kind,
        z: 0,
        svg: tile.svg,
        label: faceplate ? '' : (tile.label || ''),
        tagId: tile.tagId || '',
      }];
    }
    return [];
  }

  function ensureTileStack(cell) {
    let stack = cell.querySelector('.hmi-tile-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'hmi-tile-stack';
      cell.appendChild(stack);
    }
    return stack;
  }

  function clearTileCellContent(cell) {
    if (!cell) return;
    cell.querySelectorAll('.hmi-tile-stack, svg, img.hmi-raster, img.hmi-tile-asset, .hmi-tile-asset-wrap').forEach((el) => el.remove());
    cell.classList.remove('has-tile');
  }

  function prefixSvgIds(root, prefix, assetPath) {
    if (!root || !prefix) return;
    root.querySelectorAll('[id]').forEach((el) => {
      if (el.closest('defs, mask, clipPath')) return;
      if (el.id && !el.id.startsWith(`${prefix}__`)) {
        el.id = `${prefix}__${el.id}`;
      }
    });
    let shapeN = 0;
    const circles = [...root.querySelectorAll('circle')].filter((el) => !el.closest('defs, mask, clipPath'));
    circles.sort((a, b) => {
      const ra = parseFloat(String(a.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      const rb = parseFloat(String(b.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      return rb - ra;
    });
    const readoutFaceplate = isInlineReadoutFaceplateSvg(root, assetPath);
    circles.forEach((el, i) => {
      if (el.id) return;
      const r = parseFloat(String(el.getAttribute('r') || '').replace(/px$/i, '')) || 0;
      if (readoutFaceplate) {
        el.id = `${prefix}__shape_${shapeN++}`;
        return;
      }
      if (circles.length >= 2 && i === 0) el.id = `${prefix}__dial_outer`;
      else if (circles.length >= 2 && i === 1) el.id = `${prefix}__dial_face`;
      else if (r > 0 && r <= 8) el.id = `${prefix}__dial_hub`;
      else el.id = `${prefix}__shape_${shapeN++}`;
    });
    root.querySelectorAll('rect, polygon, path, ellipse').forEach((el) => {
      if (el.closest('defs, mask, clipPath')) return;
      if (!el.id) {
        el.id = `${prefix}__shape_${shapeN++}`;
      }
    });
    root.querySelectorAll('g').forEach((el) => {
      if (el.closest('defs, mask, clipPath')) return;
      if (!el.id && el.querySelector('circle, rect, polygon, path, ellipse, line')) {
        el.id = `${prefix}__grp`;
      }
    });
    if (!root.id) root.id = `${prefix}__svg`;
    if (isDialPointerSvg(root, assetPath)) {
      root.id = `${prefix}__${HMI_DIAL_POINTER_ID}`;
      root.classList.add('hmi-dial-pointer');
    }
    ensurePilotLampId(root, prefix, assetPath);
  }

  async function loadAssetIntoContainer(container, url, prefix, options = {}) {
    if (!container || !url) return null;
    const assetUrl = global.HmiAssetPaths?.resolveHmiAssetUrl?.(url) || url;
    if (/\.(gif|png|jpe?g|webp)$/i.test(assetUrl)) {
      const img = document.createElement('img');
      img.src = assetUrl;
      img.className = 'hmi-tile-asset hmi-raster';
      img.alt = '';
      img.draggable = false;
      if (prefix) img.id = `${prefix}__img`;
      const fit = options.assetFit || assetFitFromContainer(container);
      if (fit === 'stretch') {
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'fill';
      }
      container.appendChild(img);
      return img;
    }
    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`Asset not found: ${assetUrl}`);
    const text = await res.text();
    const wrap = document.createElement('div');
    wrap.className = 'hmi-tile-asset-wrap';
    wrap.innerHTML = text;
    const svg = wrap.querySelector('svg');
    if (svg) {
      svg.classList.add('hmi-tile-asset');
      svg.setAttribute('draggable', 'false');
      if (options.assetPath) svg.dataset.hmiAssetPath = String(options.assetPath);
      if (options.textLabelLayer) ensureSvgBindingIds(svg);
      const assetPath = options.assetPath || url;
      if (prefix) prefixSvgIds(svg, prefix, assetPath);
      const pilotAsset = isPilotLightAssetPath(assetPath);
      if (pilotAsset) clearDialPointerMisclassification(svg, prefix, assetPath);
      else ensureDialPointerSetup(svg, prefix, assetPath);
      if (options.label != null && options.label !== '') applyLabelText(svg, options.label);
      const fit = options.assetFit || assetFitFromContainer(container);
      if (pilotAsset) {
        const pilotWrap = document.createElement('div');
        pilotWrap.className = 'hmi-pilot-light-wrap';
        container.appendChild(pilotWrap);
        pilotWrap.appendChild(svg);
        fitPilotLightSvg(svg, fit);
      } else {
        container.appendChild(svg);
        if (svg.classList.contains('hmi-dial-pointer')) fitDialPointerSvg(svg);
        else {
          fitTileSvg(svg, fit);
          fitTextLabelSvg(svg);
        }
      }
      return svg;
    }
    container.appendChild(wrap);
    return wrap;
  }

  async function appendTileLayer(cell, layer, col, row, options = {}) {
    if (!cell || !layer) return null;
    const z = Math.max(0, Math.min(HMI_MAX_LAYERS - 1, Number(layer.z) || 0));
    const stack = ensureTileStack(cell);
    stack.querySelector(`.hmi-tile-layer[data-z="${z}"]`)?.remove();
    const layerEl = document.createElement('div');
    layerEl.className = 'hmi-tile-layer';
    const assetPath = String(layer.svg || '');
    const faceplateLayer = isCompositeFaceplateAssetPath(assetPath);
    const kind = faceplateLayer ? 'staticImage' : (layer.kind || 'staticImage');
    layerEl.dataset.z = String(z);
    layerEl.dataset.kind = kind;
    layerEl.style.zIndex = String(z);
    if (layer.kind !== 'pageHotspot' && layer.kind !== 'roomHotspot' && layer.kind !== 'flashOverlay'
      && layer.kind !== 'alarmList' && layer.kind !== 'navButton') {
      layerEl.style.width = '100%';
      layerEl.style.height = '100%';
    }
    stack.appendChild(layerEl);
    const tileCs = options.tileColSpan ?? 1;
    const tileRs = options.tileRowSpan ?? 1;
    if (layer.kind === 'navButton') {
      const target = String(layer.targetScreenId || '').trim();
      if (!target) return null;
      const hasRegion = Number.isFinite(Number(layer.hotspotCol)) && Number.isFinite(Number(layer.hotspotRow));
      const navLayer = hasRegion ? layer : {
        ...layer,
        hotspotCol: 0,
        hotspotRow: 0,
        hotspotColSpan: Number(layer.hotspotColSpan) > 0 ? Number(layer.hotspotColSpan) : 2,
        hotspotRowSpan: Number(layer.hotspotRowSpan) > 0 ? Number(layer.hotspotRowSpan) : 1,
      };
      applyPageHotspotLayerBounds(layerEl, navLayer, col, row, tileCs, tileRs);
      layerEl.style.pointerEvents = 'auto';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hmi-nav-cell-btn';
      btn.textContent = String(layer.label || 'Page').trim() || 'Page';
      btn.dataset.hmiNavTarget = target;
      btn.title = `Go to screen: ${target}`;
      btn.setAttribute('aria-label', `Navigate to ${btn.textContent}`);
      layerEl.appendChild(btn);
      cell.classList.add('has-tile', 'hmi-tile-has-nav');
      return btn;
    }
    if (layer.kind === 'pageHotspot') {
      const target = String(layer.targetScreenId || '').trim();
      if (!target) return null;
      applyPageHotspotLayerBounds(layerEl, layer, col, row, tileCs, tileRs);
      layerEl.style.pointerEvents = 'auto';
      const editable = !!cell.closest('.hmi-tile-grid-editable');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hmi-page-hotspot-btn';
      btn.dataset.hmiNavTarget = target;
      const composerLabel = String(layer.label || '').trim();
      if (editable) {
        btn.textContent = composerLabel || '';
        btn.title = composerLabel
          ? `${composerLabel} → ${target}`
          : `Page hotspot → ${target}`;
      } else {
        btn.title = `Go to screen: ${target}`;
      }
      btn.setAttribute('aria-label', editable && composerLabel
        ? `Navigate to ${composerLabel}`
        : `Navigate to ${target}`);
      layerEl.appendChild(btn);
      cell.classList.add('has-tile', 'hmi-tile-has-hotspot');
      return btn;
    }
    if (layer.kind === 'roomHotspot') {
      const roomNum = Math.trunc(Number(layer.roomNum));
      if (!Number.isFinite(roomNum) || roomNum < 1) return null;
      applyPageHotspotLayerBounds(layerEl, layer, col, row, tileCs, tileRs);
      layerEl.style.pointerEvents = 'auto';
      const editable = !!cell.closest('.hmi-tile-grid-editable');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hmi-room-hotspot-btn';
      btn.dataset.hmiRoomNum = String(roomNum);
      const composerLabel = String(layer.label || '').trim();
      const roomLabel = composerLabel || `Room ${String(roomNum).padStart(3, '0')}`;
      if (editable) {
        btn.textContent = composerLabel || '';
        btn.title = `${roomLabel} → room popup`;
      } else {
        btn.title = `Open ${roomLabel}`;
      }
      btn.setAttribute('aria-label', `Open ${roomLabel}`);
      layerEl.appendChild(btn);
      cell.classList.add('has-tile', 'hmi-tile-has-room-hotspot');
      return btn;
    }
    if (layer.kind === 'flashOverlay') {
      applyPageHotspotLayerBounds(layerEl, layer, col, row, tileCs, tileRs);
      layerEl.style.pointerEvents = 'none';
      const overlay = document.createElement('div');
      overlay.className = 'hmi-flash-overlay';
      overlay.classList.add(layer.color === 'amber' ? 'hmi-flash-overlay--amber' : 'hmi-flash-overlay--red');
      const overlaySuffix = String(layer.overlaySuffix || layer.overlayId || 'flash_overlay').trim() || 'flash_overlay';
      overlay.id = layerElementId(col, row, z, overlaySuffix);
      if (layer.tagId) overlay.dataset.tagId = layer.tagId;
      overlay.style.display = 'none';
      if (cell.closest('.hmi-tile-grid-editable')) {
        overlay.classList.add('hmi-flash-overlay--composer');
      }
      layerEl.appendChild(overlay);
      cell.classList.add('has-tile');
      return overlay;
    }
    if (layer.kind === 'alarmList') {
      layerEl.classList.add('hmi-alarm-list-layer');
      layerEl.style.pointerEvents = 'auto';
      const hasRegion = Number.isFinite(Number(layer.hotspotCol))
        || Number.isFinite(Number(layer.hotspotRow))
        || Number.isFinite(Number(layer.hotspotColSpan))
        || Number.isFinite(Number(layer.hotspotRowSpan));
      const regionLayer = hasRegion ? layer : {
        ...layer,
        hotspotCol: 0,
        hotspotRow: Math.max(0, tileRs - 2),
        hotspotColSpan: tileCs,
        hotspotRowSpan: Math.min(2, tileRs),
      };
      applyPageHotspotLayerBounds(layerEl, regionLayer, col, row, tileCs, tileRs);
      const panel = document.createElement('div');
      panel.className = 'hmi-alarm-list';
      panel.id = layerElementId(col, row, z, 'alarm_list');
      panel.dataset.hmiAlarmList = '1';
      panel.dataset.showAcked = layer.alarmList?.showAcked === false ? '0' : '1';
      const title = document.createElement('div');
      title.className = 'hmi-alarm-list-title';
      title.textContent = 'Active alarms';
      panel.appendChild(title);
      const body = document.createElement('div');
      body.className = 'hmi-alarm-list-body';
      body.innerHTML = '<p class="hmi-alarm-list-empty muted">No active alarms</p>';
      panel.appendChild(body);
      layerEl.appendChild(panel);
      cell.classList.add('has-tile', 'hmi-tile-has-alarm-list');
      return panel;
    }
    if (!layer.svg) return null;
    const label = faceplateLayer ? '' : (options.label != null ? options.label : layer.label);
    const isTextLayer = !faceplateLayer && (kind === 'staticText' || kind === 'dynamicText');
    const root = await loadAssetIntoContainer(
      layerEl,
      layer.svg,
      layerPrefix(col, row, z),
      { label: label || '', textLabelLayer: isTextLayer, assetPath: layer.svg, assetFit: layer.assetFit }
    );
    if (label && root && root.tagName !== 'svg' && !labelTextElement(root)) {
      const svg = layerEl.querySelector('svg.hmi-tile-asset, svg');
      if (svg) applyLabelText(svg, label);
    }
    if (root) {
      cell.classList.add('has-tile');
      if (layer.assetFit === 'scroll') cell.classList.add('hmi-tile-scroll-faceplate');
      if (isHoaSwitchAssetPath(layer.svg)) cell.classList.add('hmi-hoa-switch');
      if (root.tagName?.toLowerCase() === 'svg' && layer.stripChart?.penCount) {
        applyStripChartPenVisibility(root, layer.stripChart.penCount);
      }
      if (root.tagName?.toLowerCase() === 'svg' && layer.stripChart?.chartScale) {
        applyChartScale(root, layer.stripChart.chartScale);
      } else if (root.tagName?.toLowerCase() === 'svg' && layer.stripChart) {
        applyChartScale(root, normalizeChartScale(layer.stripChart.chartScale));
      }
      if (root.tagName?.toLowerCase() === 'svg' && layer.gaugeColumn?.columnCount) {
        applyGaugeColumnPenVisibility(root, layer.gaugeColumn.columnCount);
      }
      if (root.tagName?.toLowerCase() === 'svg' && layer.gaugeColumn?.chartScale) {
        applyChartScale(root, layer.gaugeColumn.chartScale);
      } else if (root.tagName?.toLowerCase() === 'svg' && layer.gaugeColumn) {
        applyChartScale(root, normalizeChartScale(layer.gaugeColumn.chartScale));
      }
      if (root.tagName?.toLowerCase() === 'svg' && layer.pushButton?.colors) {
        applyPushButtonStyle(root, layer.pushButton);
      }
      if (root.tagName?.toLowerCase() === 'svg' && layer.pilotLight) {
        applyPilotLightStyle(root, layer.pilotLight);
      }
    }
    return root;
  }

  async function loadTileCellFromData(cell, tile, col, row) {
    if (!cell) return [];
    clearTileCellContent(cell);
    const layers = tileLayers(tile);
    if (!layers.length) return [];
    const roots = [];
    const tileCs = tileColSpan(tile);
    const tileRs = tileRowSpan(tile);
    for (const layer of layers) {
      const root = await appendTileLayer(cell, layer, col, row, { tileColSpan: tileCs, tileRowSpan: tileRs });
      if (root) roots.push(root);
      if (layer.label && layer.kind === 'staticText' && !isCompositeFaceplateAssetPath(layer.svg)) {
        const layerEl = cell.querySelector(`.hmi-tile-layer[data-z="${layer.z}"]`);
        if (layerEl) applyLabelToLayer(layerEl, layer.label);
      }
    }
    return roots;
  }

  async function loadAssetIntoCell(cell, url, prefix, options = {}) {
    clearTileCellContent(cell);
    if (!url) return null;
    const root = await loadAssetIntoContainer(cell, url, prefix, options);
    if (root) cell.classList.add('has-tile');
    return root;
  }

  async function updateTileCell(cell, tileOrUrl, col, row, options = {}) {
    if (!cell) return null;
    if (tileOrUrl == null) {
      clearTileCellContent(cell);
      return [];
    }
    if (typeof tileOrUrl === 'object') {
      return loadTileCellFromData(cell, tileOrUrl, col, row);
    }
    return loadAssetIntoCell(cell, tileOrUrl || '', tilePrefix(col, row), options);
  }

  function buildTileGridFrame(gridSpec) {
    const cols = gridSpec?.cols || DEFAULT_GRID_COLS;
    const rows = gridSpec?.rows || DEFAULT_GRID_ROWS;
    const cw = Math.max(1, Number(gridSpec?.cellWidth) || DEFAULT_CELL_WIDTH);
    const ch = Math.max(1, Number(gridSpec?.cellHeight) || DEFAULT_CELL_HEIGHT);
    const frame = document.createElement('div');
    frame.className = 'hmi-grid-frame';
    const corner = document.createElement('div');
    corner.className = 'hmi-grid-corner';
    corner.setAttribute('aria-hidden', 'true');
    const colLabels = document.createElement('div');
    colLabels.className = 'hmi-grid-col-labels';
    colLabels.setAttribute('aria-hidden', 'true');
    colLabels.style.gridTemplateColumns = `repeat(${cols}, ${cw}fr)`;
    for (let c = 0; c < cols; c++) {
      const lbl = document.createElement('span');
      lbl.textContent = String(c + 1);
      colLabels.appendChild(lbl);
    }
    const rowLabels = document.createElement('div');
    rowLabels.className = 'hmi-grid-row-labels';
    rowLabels.setAttribute('aria-hidden', 'true');
    rowLabels.style.gridTemplateRows = `repeat(${rows}, ${ch}fr)`;
    for (let r = 0; r < rows; r++) {
      const lbl = document.createElement('span');
      lbl.textContent = String(r + 1);
      rowLabels.appendChild(lbl);
    }
    frame.appendChild(corner);
    frame.appendChild(colLabels);
    frame.appendChild(rowLabels);
    return frame;
  }

  async function loadTileGridInto(container, screen, options = {}) {
    if (!container) return { grid: null, roots: [] };
    if (screenUsesSvgBackground(screen)) {
      const svgUrl = resolveScreenAssetUrl(screen.svg);
      const root = await loadScreenInto(container, svgUrl, screen);
      wireNavButtons(root, options.onNavigate, options.onOpenRoom);
      wirePageHotspotGridHits(root, screen, options.onPageHotspotNavigate || options.onNavigate);
      wireRoomHotspotGridHits(root, screen, options.onOpenRoom);
      wireHoaSwitches(root, options.onHoaCycle);
      markPageHotspotBackgroundsPassThrough(root);
      return { grid: root, roots: root ? [root] : [] };
    }
    const g = getScreenGrid(screen);
    const { cols, rows } = g;
    const showGridChrome = options.showGridChrome ?? !!options.editable;
    const swap = !!options.swap && !!container.querySelector('.hmi-screen-stage');
    const stage = document.createElement('div');
    stage.className = 'hmi-screen-stage';
    const frame = showGridChrome ? buildTileGridFrame(g) : null;
    const grid = document.createElement('div');
    grid.className = 'hmi-tile-grid';
    if (options.editable) grid.classList.add('hmi-tile-grid-editable');
    else grid.classList.add('hmi-tile-grid-live');
    if (!showGridChrome) grid.classList.add('hmi-tile-grid-runtime');
    grid.id = 'hmi-tile-grid';
    grid.dataset.gridSize = String(Math.max(cols, rows));
    applyGridTemplate(grid, screen);
    const tiles = screen?.tiles || [];
    const { anchorMap, covered } = buildTileOccupancy(tiles, cols, rows);
    const roots = [];
    const assetLoads = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${col},${row}`;
        if (covered.has(key)) continue;
        const cell = document.createElement('div');
        cell.className = 'hmi-tile-cell';
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cell.style.gridColumnStart = String(col + 1);
        cell.style.gridRowStart = String(row + 1);
        cell.style.gridColumnEnd = 'span 1';
        cell.style.gridRowEnd = 'span 1';
        if (options.editable) {
          cell.dataset.dropCell = '1';
          cell.classList.add('hmi-tile-cell-editable');
          cell.title = `Row ${row + 1}, column ${col + 1} — top-left anchor for spans; Z0 = back layer`;
          const coord = document.createElement('span');
          coord.className = 'hmi-tile-coord';
          coord.textContent = `${col + 1},${row + 1}`;
          cell.appendChild(coord);
        }
        const tile = anchorMap.get(key);
        if (tile) {
          applyTileSpanToCell(cell, col, row, tile);
          if (tileLayers(tile).length) {
            assetLoads.push(
              loadTileCellFromData(cell, tile, col, row)
                .then((layerRoots) => { for (const root of layerRoots) roots.push(root); })
                .catch(() => { /* leave empty cell */ })
            );
          }
        }
        grid.appendChild(cell);
      }
    }
    if (frame) {
      frame.appendChild(grid);
      stage.appendChild(frame);
    } else {
      stage.appendChild(grid);
    }
    if (assetLoads.length) await Promise.all(assetLoads);
    markPageHotspotBackgroundsPassThrough(grid);
    wirePageHotspotGridHits(grid, screen, options.onPageHotspotNavigate || options.onNavigate);
    wireRoomHotspotGridHits(grid, screen, options.onOpenRoom);
    wireNavButtons(grid, options.onNavigate, options.onOpenRoom);
    wireHoaSwitches(grid, options.onHoaCycle);
    const prevStage = container.querySelector('.hmi-screen-stage');
    if (swap && prevStage) container.replaceChild(stage, prevStage);
    else {
      container.innerHTML = '';
      container.appendChild(stage);
    }
    applyScreenLayout(container, screen, grid);
    return { grid, roots };
  }

  function isBindableElementId(id, el) {
    if (!id || id === 'hmi-tile-grid') return false;
    const tag = el?.tagName?.toLowerCase() || '';
    if (['lineargradient', 'radialgradient', 'filter', 'clippath', 'mask', 'pattern', 'marker', 'defs'].includes(tag)) {
      return false;
    }
    if (/gradient|filter|mask|clip|pattern|marker|shadow|bezel/i.test(id)) return false;
    return true;
  }

  function listElementIdsFromStage(container) {
    const stage = container?.querySelector?.('.hmi-screen-stage') || container;
    if (!stage) return [];
    const ids = new Set();
    stage.querySelectorAll('[id]').forEach((el) => {
      if (el.id && isBindableElementId(el.id, el)) ids.add(el.id);
    });
    return [...ids].sort((a, b) => a.localeCompare(b));
  }

  function screenUsesTiles(screen) {
    return Array.isArray(screen?.tiles) && screen.tiles.length > 0;
  }

  function screenUsesSvgBackground(screen) {
    return !!String(screen?.svg || '').trim() && !screenUsesTiles(screen);
  }

  function resolveScreenAssetUrl(url) {
    const p = String(url || '').trim();
    if (!p) return p;
    if (typeof window !== 'undefined' && window.HmiAssetPaths?.resolveHmiAssetUrl) {
      return window.HmiAssetPaths.resolveHmiAssetUrl(p);
    }
    return p;
  }

  function listElementIds(root) {
    if (!root) return [];
    if (root.classList?.contains('hmi-tile-grid')) {
      return listElementIdsFromStage(root.closest('.hmi-screen-stage') || root);
    }
    const ids = new Set();
    if (root.id) ids.add(root.id);
    root.querySelectorAll?.('[id]').forEach((el) => {
      if (el.id) ids.add(el.id);
    });
    return [...ids].sort((a, b) => a.localeCompare(b));
  }

  function bindingSearchScope(root) {
    if (!root) return null;
    if (root.classList?.contains('hmi-tile-grid')) {
      return root.closest?.('.hmi-screen-stage') || root;
    }
    return root.closest?.('.hmi-screen-stage') || root.parentElement || root;
  }

  function findBindingElements(root, elementId) {
    if (!root || !elementId || elementId === '@screen') return [];
    if (root.id === elementId) return [root];
    const parsed = parseCellElementId(elementId);
    const scope = bindingSearchScope(root);
    if (!scope?.querySelectorAll) return [];
    const out = [];
    const seen = new Set();
    const add = (el) => {
      if (el && !seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    };
    if (parsed) {
      const zN = parsed.z != null ? parsed.z : 0;
      const labelSuffix = parsed.suffix === HMI_LABEL_ID || String(parsed.suffix || '').includes('label');
      if (labelSuffix) {
        const cell = scope.querySelector(
          `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
        );
        const textKinds = ['staticText', 'dynamicText'];
        for (const kind of textKinds) {
          const layerEl = cell?.querySelector(
            `.hmi-tile-layer[data-z="${zN}"][data-kind="${kind}"]`
          );
          if (!layerEl) continue;
          const textEl = labelTextElement(layerEl.querySelector('svg.hmi-tile-asset, svg'));
          if (textEl?.id) add(textEl);
          if (out.length) return out;
        }
        const anyLayer = cell?.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
        if (anyLayer) {
          ensureCellBindingIds(cell, parsed.col, parsed.row, zN);
          const svg = anyLayer.querySelector('svg.hmi-tile-asset, svg');
          if (svg) {
            ensureSvgBindingIds(svg);
            const prefix = layerPrefix(parsed.col, parsed.row, zN);
            const textEl = labelTextElement(svg);
            if (textEl && !textEl.id.includes(HMI_LABEL_ID)) {
              textEl.id = `${prefix}__${HMI_LABEL_ID}`;
            } else if (textEl && !textEl.id.startsWith(`${prefix}__`)) {
              textEl.id = `${prefix}__${textEl.id}`;
            }
            if (textEl?.id) add(textEl);
            if (out.length) return out;
          }
          const overlay = ensureValueOverlay(anyLayer, parsed.col, parsed.row, zN);
          if (overlay) add(overlay);
          if (out.length) return out;
        }
      }
      const variants = bindingElementIdVariants(parsed.col, parsed.row, zN, parsed.suffix);
      for (const fullId of variants) {
        try {
          add(scope.querySelector(`#${CSS.escape(fullId)}`));
        } catch { /* ignore */ }
        scope.querySelectorAll('[id]').forEach((node) => {
          if (node.id === fullId) add(node);
        });
        if (out.length) return out;
      }
      const layerPrefixStr = layerPrefix(parsed.col, parsed.row, zN);
      scope.querySelectorAll('[id]').forEach((node) => {
        if (!node.id) return;
        if (node.id.startsWith(`${layerPrefixStr}__`) && node.id.endsWith(`__${parsed.suffix}`)) add(node);
      });
      if (out.length) return out;
      const ensured = ensureLayerLabelId(parsed.col, parsed.row, zN);
      if (ensured) {
        try {
          add(scope.querySelector(`#${CSS.escape(ensured)}`));
        } catch { /* ignore */ }
        if (out.length) return out;
      }
      const cell = scope.querySelector(
        `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
      );
      if (parsed.suffix === 'flash_overlay') {
        const layerEl = cell?.querySelector(`.hmi-tile-layer[data-kind="flashOverlay"][data-z="${zN}"]`)
          || cell?.querySelector('.hmi-tile-layer[data-kind="flashOverlay"]');
        const overlay = layerEl?.querySelector('.hmi-flash-overlay')
          || layerEl?.querySelector(`#${CSS.escape(`${layerPrefix(parsed.col, parsed.row, zN)}__flash_overlay`)}`);
        if (overlay) add(overlay);
        if (out.length) return out;
      }
      const layerEl = cell?.querySelector(`.hmi-tile-layer[data-z="${zN}"]`);
      const layerSvg = layerEl?.querySelector('svg.hmi-tile-asset, svg');
      if (parsed.suffix === HMI_DIAL_POINTER_ID) {
        const ptr = findDialPointerInCell(cell, zN)
          || (layerSvg?.classList?.contains('hmi-dial-pointer') ? layerSvg : null)
          || layerSvg;
        if (ptr) add(ptr);
        if (out.length) return out;
      }
      if (layerSvg && !labelSuffix) {
        ensureCellBindingIds(cell, parsed.col, parsed.row, zN);
        const wanted = `${layerPrefix(parsed.col, parsed.row, zN)}__${parsed.suffix}`;
        const hit = layerSvg.querySelector(`#${CSS.escape(wanted)}`)
          || [...layerSvg.querySelectorAll('[id]')].find((n) => n.id === wanted);
        if (hit) add(hit);
        if (out.length) return out;
        if (parsed.suffix === 'img') {
          const img = layerEl?.querySelector('img.hmi-tile-asset, img.hmi-raster');
          if (img?.id) add(img);
          if (out.length) return out;
        }
      }
    }
    try {
      add(scope.querySelector(`#${CSS.escape(elementId)}`));
      scope.querySelectorAll(`[id$="__${CSS.escape(elementId)}"]`).forEach(add);
    } catch { /* ignore */ }
    if (!out.length) {
      scope.querySelectorAll('[id]').forEach((node) => {
        if (!node.id) return;
        if (node.id === elementId || node.id.endsWith(`__${elementId}`)) add(node);
      });
    }
    if (!out.length && root.getElementById) {
      const byId = root.getElementById(elementId);
      if (byId) add(byId);
    }
    return out;
  }

  function findBindingElement(root, elementId) {
    return findBindingElements(root, elementId)[0] || null;
  }

  function listBindingElementIds(root) {
    const full = listElementIdsFromStage(bindingSearchScope(root) || root);
    const ids = new Set(full);
    const shortCounts = new Map();
    const zShortCounts = new Map();
    for (const id of full) {
      const zm = /^t(\d+)_(\d+)_z(\d+)__(.+)$/.exec(id);
      if (zm) {
        const key = `${zm[4]}@${zm[1]},${zm[2]},z${zm[3]}`;
        zShortCounts.set(key, (zShortCounts.get(key) || 0) + 1);
        ids.add(id);
        continue;
      }
      const m = /^t(\d+)_(\d+)__(.+)$/.exec(id);
      if (!m) continue;
      shortCounts.set(m[3], (shortCounts.get(m[3]) || 0) + 1);
    }
    for (const [short, count] of shortCounts) {
      if (count === 1) ids.add(short);
    }
    const scope = bindingSearchScope(root) || root;
    scope?.querySelectorAll?.('.hmi-tile-cell.hmi-hoa-switch[data-col][data-row]').forEach((cell) => {
      const col = Number(cell.dataset.col);
      const row = Number(cell.dataset.row);
      if (Number.isFinite(col) && Number.isFinite(row)) {
        ids.add(`${tilePrefix(col, row)}__hoa_switch`);
      }
    });
    return [...ids].sort((a, b) => a.localeCompare(b));
  }

  function applyDialLayerPaint(scope, parsed, binding, liveMap) {
    if (!scope || !parsed || !binding) return false;
    const zN = parsed.z != null ? parsed.z : 0;
    const cell = scope.querySelector(
      `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
    );
    if (cell) ensureCellBindingIds(cell, parsed.col, parsed.row, zN);
    const prefix = layerPrefix(parsed.col, parsed.row, zN);
    let painted = false;
    for (const suffix of ['lamp', 'dial_face', 'dial_outer', 'shape_0', 'img']) {
      const id = `${prefix}__${suffix}`;
      for (const el of findBindingElements(scope, id)) {
        applyBinding(el, binding, liveMap);
        painted = true;
      }
    }
    return painted;
  }

  function applyFlashOverlayTagVisibility(scope, liveMap) {
    if (!scope?.querySelectorAll) return;
    const live = liveMap || {};
    scope.querySelectorAll('.hmi-flash-overlay[data-tag-id]').forEach((el) => {
      const tagId = el.dataset.tagId;
      if (!tagId) return;
      const le = live[tagId];
      if (le?.alarmAcked) {
        el.style.display = 'none';
        return;
      }
      const v = (le && typeof le === 'object' && 'value' in le) ? le.value : le;
      el.style.display = isTruthy(v) ? '' : 'none';
    });
  }

  function applyBindings(svgRoot, bindings, liveMap) {
    if (!svgRoot) return;
    const live = liveMap || {};
    const scope = bindingSearchScope(svgRoot) || svgRoot;
    if (bindings?.length) {
      for (const b of bindings) {
        if (b.property === 'state3') {
          applyHoaState3Binding(scope, b, live);
          continue;
        }
        if (b.elementId === '@screen') {
          applyScreenBackgroundBinding(svgRoot, b, live);
          continue;
        }
        let els = findBindingElements(svgRoot, b.elementId);
        const parsed = parseCellElementId(b.elementId);
        if (parsed) {
          const cell = scope.querySelector(
            `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
          );
          if (cell) {
            ensureCellBindingIds(cell, parsed.col, parsed.row, parsed.z ?? 0);
            els = findBindingElements(svgRoot, b.elementId);
          }
        }
        if (b.property === 'text' && parsed) {
          if (applyDynamicTextLayerBinding(scope, b, live)) continue;
        }
        if (!els.length && parsed && (b.property === 'fill' || b.property === 'stroke' || b.property === 'fill5' || b.property === 'fill8' || b.property === 'text')) {
          if (applyDialLayerPaint(scope, parsed, b, live)) continue;
        }
        if (b.property === 'rotation') {
          const cell = parsed ? scope.querySelector(
            `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
          ) : null;
          const zN = parsed?.z != null ? parsed.z : null;
          let ptr = findDialPointerInCell(cell, zN);
          if (!ptr && cell) ptr = findDialPointerInCell(cell, undefined);
          if (!ptr && els.length) {
            const hit = els.find((e) => e.tagName?.toLowerCase() === 'svg' || String(e.id || '').includes('dial_pointer'));
            if (hit) ptr = hit.tagName?.toLowerCase() === 'svg' ? hit : hit.closest?.('svg');
          }
          if (ptr) {
            applyNeedleRotation(ptr, b, live);
            continue;
          }
        }
        if (b.property === 'trend') {
          if (!els.length && parsed) {
            const cell = scope.querySelector(
              `.hmi-tile-cell[data-col="${parsed.col}"][data-row="${parsed.row}"]`
            );
            if (cell) {
              ensureCellBindingIds(cell, parsed.col, parsed.row, parsed.z ?? 0);
              els = findBindingElements(svgRoot, b.elementId);
            }
          }
          for (const el of els) applyTrendBinding(el, b, live);
          continue;
        }
        for (const el of els) {
          if (b.property === 'text' && tileLayerKind(el) === 'staticText') continue;
          applyBinding(el, b, live);
        }
        if (parsed) {
          const boundSvgText = b.property === 'text' && els.some((el) => {
            const tag = el.tagName?.toLowerCase();
            return tag === 'text' || tag === 'tspan';
          });
          if (!boundSvgText) applyGaugeLayerBinding(scope, b, live);
          const faceplateCell = compositeFaceplateCell(scope, parsed.col, parsed.row);
          if (!faceplateCell
            && shouldApplyDialLayerPaint(b, b.elementId)
            && (b.property === 'fill' || b.property === 'stroke' || b.property === 'fill5' || b.property === 'fill8')) {
            applyDialLayerPaint(scope, parsed, b, live);
          }
        } else if (b.property === 'text' && /hmi_label|label/i.test(String(b.elementId))) {
          const scope2 = bindingSearchScope(svgRoot) || svgRoot;
          scope2.querySelectorAll('.hmi-tile-layer').forEach((layerEl) => {
            const cell = layerEl.closest('.hmi-tile-cell');
            if (!cell || !cellHasDialGauge(cell, layerEl.dataset.z)) return;
            const col = Number(cell.dataset.col);
            const row = Number(cell.dataset.row);
            const z = Number(layerEl.dataset.z) || 0;
            const ov = ensureValueOverlay(layerEl, col, row, z);
            applyBinding(ov, b, live);
            fitValueOverlay(layerEl);
          });
        }
      }
    }
    wireStripChartInspectors(scope, bindings, live);
    applyFlashOverlayTagVisibility(scope, live);
  }

  function refreshAlarmListLayers(scope, liveList, tags, options = {}) {
    applyAlarmListLayers(scope, liveList, tags, options);
  }

  function liveMapFromList(liveList) {
    const m = {};
    for (const t of liveList || []) {
      const id = t?.tagId ?? t?.id;
      if (id != null) m[id] = t;
    }
    return m;
  }

  function bindPan(container, getScreen, onOffsetChange) {
    if (!container || container.dataset.hmiPanBound === '1') return;
    container.dataset.hmiPanBound = '1';
    container.classList.add('hmi-pan-viewport');
    let drag = null;

    function endDrag() {
      if (!drag) return;
      drag = null;
      container.classList.remove('hmi-pan-dragging');
    }

    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('input, select, button, a, label, textarea')) return;
      const stage = container.querySelector('.hmi-screen-stage');
      if (!stage) return;
      const s = getScreen();
      if (!s) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        ox: Number(s.offsetX) || 0,
        oy: Number(s.offsetY) || 0,
      };
      container.classList.add('hmi-pan-dragging');
      try { container.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    });

    container.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const nx = Math.round(drag.ox + (e.clientX - drag.startX));
      const ny = Math.round(drag.oy + (e.clientY - drag.startY));
      onOffsetChange(nx, ny);
      const s = { ...getScreen(), offsetX: nx, offsetY: ny };
      const root = container.querySelector('.hmi-screen-stage')?.querySelector('svg, img.hmi-raster');
      applyScreenLayout(container, s, root);
    });

    container.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      try { container.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      endDrag();
    });
    container.addEventListener('pointercancel', endDrag);
  }

  global.HmiView = {
    GRID_SIZE,
    MAX_GRID_COLS,
    MAX_GRID_ROWS,
    getScreenGrid,
    getDisplayLimits,
    getLiveDisplayZoom,
    setLiveDisplayZoom,
    buildTileOccupancy,
    tileColSpan,
    tileRowSpan,
    applyTileSpanToCell,
    applyGridTemplate,
    wireNavButtons,
    wirePageHotspotGridHits,
    wireRoomHotspotGridHits,
    buildRoomHotspotHitList,
    markPageHotspotBackgroundsPassThrough,
    gridCellFromPointer,
    pageHotspotRegion,
    applyPageHotspotLayerBounds,
    buildPageHotspotHitList,
    wireHoaSwitches,
    wireHoaModeButtons,
    wireBoolCommandButtons,
    wireBoolToggleButtons,
    resolveBoolCommandFromEvent,
    isBoolToggleBinding,
    isHoaModeButtonBinding,
    hoaValueForBinding,
    resolveHandModePumpWrite,
    resolvePumpCommandWrites,
    resolveHandModePumpDisplayValue,
    motorCommandParts,
    wireState3Readouts,
    isParamEditBinding,
    wireParamEditFields,
    hhmmFromMinutes,
    parseHhmmToMinutes,
    parseHoursToMinutes,
    hoursFromMinutes,
    cellHasHoaSwitchLayers,
    isBoolCommandBinding,
    isState3ReadoutBinding,
    markHoaSwitchCellsInteractive,
    isHoaSwitchAssetPath,
    applyHoaSwitchState,
    state3Index,
    HMI_MAX_LAYERS,
    HMI_OBJ_KINDS,
    tileLayers,
    layerPrefix,
    layerElementId,
    bindingElementIdVariants,
    parseCellElementId,
    bindingElementTargetsCell,
    ensureLayerLabelId,
    ensureCellBindingIds,
    ensureValueOverlay,
    cellHasDialGauge,
    isPilotLightSvg,
    isPilotLightAssetPath,
    isMultiPilotLightAssetPath,
    applyLabelToLayer,
    loadScreenInto,
    loadSvgInto,
    loadTileGridInto,
    loadTileCellFromData,
    appendTileLayer,
    updateTileCell,
    clearTileCellContent,
    applyScreenLayout,
    sizeTileGridElement,
    measureTileGridSize,
    measureAsset,
    listElementIds,
    listElementIdsFromStage,
    listBindingElementIds,
    findBindingElements,
    isBindableElementId,
    HMI_LABEL_ID,
    applyLabelToCell,
    applyLabelText,
    fitTextLabelSvg,
    fitTileSvg,
    labelTextElement,
    screenUsesTiles,
    screenUsesSvgBackground,
    applyBindings,
    liveMapFromList,
    applyBinding,
    applyTrendBinding,
    applyStripChartPenVisibility,
    applyGaugeColumnPenVisibility,
    applyChartScale,
    normalizeChartScale,
    applyPushButtonStyle,
    applyPilotLightStyle,
    clearTrendBuffers,
    syncTrendBuffersFromHistory,
    wireStripChartInspectors,
    bindPan,
    inferPidTagField,
    isPidFaceplateAssetPath,
    isMotorFaceplateAssetPath,
    isTpoFaceplateAssetPath,
    isPoolFaceplateAssetPath,
    poolCompositeIdFromAssetPath,
    isAlternatorFaceplateAssetPath,
    isAlarmListAssetPath,
    isCompositeFaceplateAssetPath,
    applyAlarmListLayers,
    refreshAlarmListLayers,
    collectHmiActiveAlarms,
    renderHmiAlarmListHtml,
  };
})(window);
