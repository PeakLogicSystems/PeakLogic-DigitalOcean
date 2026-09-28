'use strict';

window.GraphDraw = {
  applyPenValue(raw, pen) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return 0;
    return v * (pen.scale ?? 1) + (pen.offset ?? 0);
  },

  yRange(pen, scaledValues) {
    if (!pen.autoScale && pen.ymax > pen.ymin) {
      return { min: pen.ymin, max: pen.ymax };
    }
    if (!scaledValues.length) return { min: 0, max: 100 };
    let min = Math.min(...scaledValues);
    let max = Math.max(...scaledValues);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.05 || 1;
    return { min: min - pad, max: max + pad };
  },

  /** Shared time window for historian charts (ms). */
  timeRange(history, pens, opts = {}) {
    if (opts.timeRange?.from != null && opts.timeRange?.to != null) {
      const from = Number(opts.timeRange.from);
      const to = Number(opts.timeRange.to);
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        return { from, to, span: to - from };
      }
    }
    const meta = this.historyMeta(history, pens);
    if (meta.tMin != null && meta.tMax != null && meta.tMax > meta.tMin) {
      return { from: meta.tMin, to: meta.tMax, span: meta.tMax - meta.tMin };
    }
    return null;
  },

  formatAxisTime(ms, spanMs) {
    const d = new Date(ms);
    if (!Number.isFinite(ms)) return '—';
    const tz = window.PeaklogicTime?.localeOpts?.() || {};
    const dayMs = 24 * 60 * 60 * 1000;
    if ((spanMs || 0) >= 7 * dayMs) {
      return d.toLocaleString(undefined, { ...tz, month: 'short', day: 'numeric' });
    }
    if ((spanMs || 0) >= dayMs) {
      return d.toLocaleString(undefined, {
        ...tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    }
    return d.toLocaleString(undefined, {
      ...tz, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  },

  plotMargins(penCount = 1) {
    const cols = Math.min(Math.max(penCount, 1), 6);
    const multiPen = penCount > 1;
    return {
      left: 44 + cols * 68,
      right: 16,
      top: multiPen ? 40 : 18,
      bottom: 50,
    };
  },

  plotArea(w, h, penCount = 1) {
    const m = this.plotMargins(penCount);
    return {
      left: m.left,
      right: w - m.right,
      top: m.top,
      bottom: h - m.bottom,
      width: w - m.left - m.right,
      height: h - m.top - m.bottom,
    };
  },

  formatYValue(val) {
    if (!Number.isFinite(val)) return '—';
    const a = Math.abs(val);
    if (a >= 10000) return val.toExponential(1);
    if (a >= 1000) return val.toFixed(0);
    if (a >= 100) return val.toFixed(1);
    if (a >= 10) return val.toFixed(1);
    if (a >= 1) return val.toFixed(2);
    return val.toFixed(3);
  },

  _yTickCount() {
    return 4;
  },

  /** Left-side Y scale per pen (independent min/max per trace). */
  _drawYAxes(ctx, plot, series) {
    if (!series?.length) return;
    const count = Math.min(series.length, 6);
    const colW = 68;
    const ticks = this._yTickCount();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plot.bottom);
    ctx.stroke();

    for (let idx = 0; idx < count; idx++) {
      const s = series[idx];
      if (!s.points.length) continue;
      const xCol = plot.left - 6 - idx * colW;
      ctx.fillStyle = s.pen.color || '#2563eb';
      ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let g = 0; g <= ticks; g++) {
        const frac = g / ticks;
        const val = s.min + (s.max - s.min) * (1 - frac);
        const y = plot.top + plot.height * frac;
        ctx.beginPath();
        ctx.moveTo(plot.left - 3, y);
        ctx.lineTo(plot.left, y);
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();
        ctx.fillStyle = s.pen.color || '#2563eb';
        ctx.fillText(this.formatYValue(val), xCol, y);
      }

      if (count > 1) {
        const labelY = plot.top - 32;
        ctx.font = 'bold 13px system-ui';
        ctx.textBaseline = 'top';
        ctx.fillText(s.pen.tagId, xCol, labelY);
        ctx.strokeStyle = s.pen.color || '#2563eb';
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(xCol - 52, labelY + 16);
        ctx.lineTo(xCol, labelY + 16);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 17px ui-monospace, monospace';
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#e5e7eb';
  },

  _timeTickCount(spanMs) {
    const dayMs = 24 * 60 * 60 * 1000;
    if ((spanMs || 0) >= 14 * dayMs) return 7;
    if ((spanMs || 0) >= dayMs) return 6;
    return 5;
  },

  _drawTimeAxis(ctx, plot, tr) {
    if (!tr || !plot) return;
    const axisY = plot.bottom;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, axisY);
    ctx.lineTo(plot.right, axisY);
    ctx.stroke();

    const ticks = this._timeTickCount(tr.span);
    ctx.fillStyle = '#475569';
    ctx.font = '13px system-ui';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= ticks; i++) {
      const frac = i / ticks;
      const t = tr.from + tr.span * frac;
      const x = plot.left + plot.width * frac;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 5);
      ctx.stroke();
      const align = i === 0 ? 'left' : (i === ticks ? 'right' : 'center');
      ctx.textAlign = align;
      ctx.fillText(this.formatAxisTime(t, tr.span), x, axisY + 8);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '13px system-ui';
    ctx.fillText('Time', plot.left + plot.width / 2, axisY + 26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  },

  /** Plot geometry + per-pen screen points for draw and hover. */
  buildModel(canvas, history, pens, opts = {}) {
    if (!canvas?.width) return null;
    const w = canvas.width;
    const h = canvas.height;
    const list = this._activePens(pens);
    const plot = this.plotArea(w, h, list.length);
    const tr = this.timeRange(history, list, opts);
    const series = list.map((pen) => {
      const pts = history?.[pen.tagId] || [];
      const scaled = pts.map((p) => this.applyPenValue(p.value, pen));
      const { min, max } = this.yRange(pen, scaled);
      const span = max - min || 1;
      const points = pts.map((pt, i) => {
        let x;
        if (tr && pt?.ts != null && Number.isFinite(pt.ts)) {
          x = plot.left + (plot.width * (pt.ts - tr.from)) / tr.span;
        } else {
          x = plot.left + (plot.width * i) / Math.max(1, pts.length - 1);
        }
        const val = scaled[i];
        const y = plot.bottom - (plot.height * (val - min)) / span;
        return { x, y, pt, i, scaled: val, raw: pt.value };
      });
      return { pen, pts, scaled, min, max, points };
    });
    return { plot, tr, series, w, h };
  },

  /**
   * Hover at canvas pixel — snaps to nearest time on X, returns all pen samples at that time.
   * @returns {{ time: number, crossX: number, samples: Array, plot: object } | null}
   */
  getHoverAtCanvasPos(canvas, history, pens, opts, mx, my) {
    const model = this.buildModel(canvas, history, pens, opts);
    if (!model?.tr) return null;
    const { plot, tr, series } = model;
    if (mx < plot.left || mx > plot.right || my < plot.top - 12 || my > plot.bottom + 12) return null;
    const time = tr.from + ((mx - plot.left) / plot.width) * tr.span;
    const samples = [];
    for (const s of series) {
      if (!s.points.length) continue;
      let best = null;
      let bestD = Infinity;
      for (const p of s.points) {
        const t = p.pt?.ts;
        if (t == null || !Number.isFinite(t)) continue;
        const d = Math.abs(t - time);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) {
        samples.push({
          pen: s.pen,
          pt: best.pt,
          raw: best.raw,
          scaled: best.scaled,
          x: best.x,
          y: best.y,
        });
      }
    }
    if (!samples.length) return null;
    const crossX = plot.left + (plot.width * (time - tr.from)) / tr.span;
    return { time, crossX, samples, plot };
  },

  _drawHoverOverlay(ctx, hover, plot) {
    if (!hover?.samples?.length) return;
    const x = hover.crossX;
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const s of hover.samples) {
      ctx.fillStyle = s.pen.color || '#2563eb';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Record<string, Array>} history
   * @param {Array<{tagId,color,scale,offset,ymin,ymax,autoScale}>} pens
   * @param {{ timeRange?: { from: number, to: number }, hover?: object }} [opts]
   */
  draw(canvas, history, pens, opts = {}) {
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    const model = this.buildModel(canvas, history, pens, opts);
    if (!model) return;
    const { plot, tr, series, w, h } = model;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    if (!series.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px system-ui';
      ctx.fillText('No pens configured — Historian → Pen config… to add up to 32 pens.', plot.left, h / 2 - 7);
      return;
    }

    const yTicks = this._yTickCount();
    for (let g = 0; g <= yTicks; g++) {
      const y = plot.top + (plot.height * g) / yTicks;
      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
    }

    this._drawYAxes(ctx, plot, series);

    if (tr) {
      const vTicks = this._timeTickCount(tr.span);
      ctx.strokeStyle = '#f1f5f9';
      for (let i = 1; i < vTicks; i++) {
        const x = plot.left + (plot.width * i) / vTicks;
        ctx.beginPath();
        ctx.moveTo(x, plot.top);
        ctx.lineTo(x, plot.bottom);
        ctx.stroke();
      }
    }

    series.forEach((s) => {
      if (s.points.length < 2) return;
      ctx.strokeStyle = s.pen.color || '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });

    if (opts.hover) this._drawHoverOverlay(ctx, opts.hover, plot);

    this._drawTimeAxis(ctx, plot, tr);
  },

  _activePens(pens) {
    return (pens || []).filter((p) => p.tagId);
  },

  historyMeta(history, pens) {
    const list = this._activePens(pens);
    let samples = 0;
    let tMin = null;
    let tMax = null;
    for (const pen of list) {
      const pts = history?.[pen.tagId] || [];
      samples = Math.max(samples, pts.length);
      for (const pt of pts) {
        const t = pt?.ts;
        if (t == null) continue;
        if (tMin == null || t < tMin) tMin = t;
        if (tMax == null || t > tMax) tMax = t;
      }
    }
    return {
      penCount: list.length,
      samples,
      tMin,
      tMax,
      pens: list,
    };
  },

  _csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  },

  /**
   * @returns {{ ok: boolean, error?: string }}
   */
  exportCsv(history, pens, meta = {}) {
    const list = this._activePens(pens);
    if (!list.length) return { ok: false, error: 'No pens configured' };
    const maxLen = Math.max(0, ...list.map((p) => (history?.[p.tagId] || []).length));
    if (!maxLen) return { ok: false, error: 'No historian data to export' };

    const headers = ['sample', 'timestamp'];
    list.forEach((p) => {
      headers.push(`${p.tagId}_raw`, `${p.tagId}_scaled`);
    });

    const lines = [
      `# PeakLogic historian export`,
      `# project: ${meta.projectName || 'untitled'}`,
      `# exported: ${new Date().toISOString()}`,
      headers.join(','),
    ];

    for (let i = 0; i < maxLen; i++) {
      let ts = '';
      const row = [i];
      for (const pen of list) {
        const pt = history[pen.tagId]?.[i];
        if (pt && !ts) ts = new Date(pt.ts).toISOString();
      }
      row.push(ts);
      for (const pen of list) {
        const pt = history[pen.tagId]?.[i];
        if (pt == null) {
          row.push('', '');
        } else {
          row.push(pt.value, this.applyPenValue(pt.value, pen));
        }
      }
      lines.push(row.map((c) => this._csvCell(c)).join(','));
    }

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `PeakLogic_historian_${stamp}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, rows: maxLen };
  },

  printReport(canvas, history, pens, meta = {}) {
    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const list = this._activePens(pens);
    const img = canvas?.toDataURL?.('image/png');
    if (!img) return { ok: false, error: 'Report chart not ready' };

    const penTable = list.map((p) => {
      const pts = history?.[p.tagId] || [];
      const last = pts.at(-1);
      const scaled = last != null ? this.applyPenValue(last.value, p) : '—';
      return `<tr>
        <td><span style="display:inline-block;width:12px;height:12px;background:${p.color};border-radius:2px"></span></td>
        <td>${escapeHtml(p.tagId)}</td>
        <td>${escapeHtml(String(p.scale ?? 1))}</td>
        <td>${escapeHtml(String(p.offset ?? 0))}</td>
        <td>${last != null ? escapeHtml(String(last.value)) : '—'}</td>
        <td>${escapeHtml(String(scaled))}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>PeakLogic Historian Report — ${escapeHtml(meta.projectName || 'untitled')}</title>
      <style>
        body { font-family: Segoe UI, system-ui, sans-serif; margin: 24px; color: #0f172a; }
        h1 { font-size: 1.35rem; margin: 0 0 0.25rem; }
        .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1rem; }
        img { max-width: 100%; height: auto; border: 1px solid #cbd5e1; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.85rem; }
        th, td { border: 1px solid #e2e8f0; padding: 0.35rem 0.5rem; text-align: left; }
        th { background: #f8fafc; }
        @media print { body { margin: 12px; } }
      </style>
    </head><body>
      <h1>PeakLogic — Historian Report</h1>
      <p class="meta">Project: ${escapeHtml(meta.projectName || 'untitled')} · ${escapeHtml(meta.rangeLabel || '')} · Printed ${escapeHtml(new Date().toLocaleString())}</p>
      <img src="${img}" alt="Historian trend">
      <table>
        <thead><tr><th></th><th>Tag</th><th>Scale</th><th>Offset</th><th>Raw</th><th>Scaled</th></tr></thead>
        <tbody>${penTable || '<tr><td colspan="6">No pens</td></tr>'}</tbody>
      </table>
    </body></html>`;

    // Hidden iframe — avoids popup blockers and window.open(..., 'noopener') returning null.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'PeakLogic historian print');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win?.document) {
      iframe.remove();
      return { ok: false, error: 'Print preview unavailable in this browser' };
    }
    const cleanup = () => {
      try { iframe.remove(); } catch { /* ignore */ }
    };
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 120000);
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    const doPrint = () => {
      try { win.print(); } catch (e) {
        cleanup();
        return { ok: false, error: e.message || 'Print failed' };
      }
      return { ok: true };
    };
    if (win.document.readyState === 'complete') return doPrint();
    win.addEventListener('load', () => { doPrint(); }, { once: true });
    return { ok: true };
  },

  /** @deprecated use printReport */
  printPdf(canvas, history, pens, meta) {
    return this.printReport(canvas, history, pens, meta);
  },
};
