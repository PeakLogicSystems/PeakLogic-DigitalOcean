'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function fmtNum(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

function fmtTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(iso);
}

function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)} min`;
  return `${(ms / 3600000).toFixed(2)} h`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, height) {
  const bottom = doc.page.height - doc.page.margins.bottom - 24;
  if (doc.y + height <= bottom) return;
  drawFooter(doc);
  doc._mvPageNum = (doc._mvPageNum || 1) + 1;
  doc.addPage({ size: 'LETTER', layout: 'portrait', margin: 48 });
}

function drawFooter(doc) {
  const savedY = doc.y;
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const y = doc.page.height - 28;
  doc.fontSize(8).fillColor('#64748b');
  doc.text(
    `PeakLogic · Putnam County RUN↔amps · Page ${doc._mvPageNum || 1}`,
    left,
    y,
    { width, align: 'left', lineBreak: false },
  );
  doc.fillColor('#0f172a').fontSize(10);
  doc.y = savedY;
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 28);
  doc.moveDown(0.4);
  doc.fontSize(13).fillColor('#0f172a').font('Helvetica-Bold').text(title);
  doc.font('Helvetica').fontSize(10).fillColor('#334155');
  doc.moveDown(0.3);
}

function drawTable(doc, columns, rows) {
  const width = contentWidth(doc);
  const rowH = 16;
  const left = doc.page.margins.left;

  ensureSpace(doc, rowH * 2);
  let y = doc.y;
  let x = left;
  doc.rect(x, y, width, rowH).fill('#e2e8f0');
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
  columns.forEach((c) => {
    const cw = width * c.w;
    doc.text(c.label, x + 3, y + 4, { width: cw - 6, lineBreak: false });
    x += cw;
  });
  doc.font('Helvetica');
  y += rowH;

  rows.forEach((row, idx) => {
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 24) {
      drawFooter(doc);
      doc._mvPageNum = (doc._mvPageNum || 1) + 1;
      doc.addPage({ size: 'LETTER', layout: 'portrait', margin: 48 });
      y = doc.page.margins.top;
      x = left;
      doc.rect(x, y, width, rowH).fill('#e2e8f0');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8);
      columns.forEach((c) => {
        const cw = width * c.w;
        doc.text(c.label, x + 3, y + 4, { width: cw - 6, lineBreak: false });
        x += cw;
      });
      doc.font('Helvetica');
      y += rowH;
    }
    x = left;
    if (idx % 2 === 0) doc.rect(x, y, width, rowH).fill('#f8fafc');
    doc.fillColor('#0f172a').fontSize(8);
    columns.forEach((c, i) => {
      const cw = width * c.w;
      doc.text(String(row[i] ?? '—'), x + 3, y + 4, { width: cw - 6, lineBreak: false });
      x += cw;
    });
    y += rowH;
  });
  doc.y = y + 8;
}

function mean(vals) {
  const v = vals.filter((n) => Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function percentile(vals, p) {
  const v = vals.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.floor((p / 100) * (v.length - 1))));
  return v[i];
}

function siteStats(training, siteId) {
  const rows = training.filter((t) => t.siteId === siteId);
  const runA = rows.map((r) => r.features?.runCurrentA);
  const peakA = rows.map((r) => r.features?.peakStartCurrentA);
  const inrush = rows.map((r) => r.features?.inrushRatio);
  const dur = rows.map((r) => r.features?.runDurationMs);
  const labels = rows.reduce((acc, r) => {
    const l = r.inference?.label || 'unknown';
    acc[l] = (acc[l] || 0) + 1;
    return acc;
  }, {});
  return {
    count: rows.length,
    meanRunA: mean(runA),
    meanPeakA: mean(peakA),
    p50RunA: percentile(runA, 50),
    p90PeakA: percentile(peakA, 90),
    meanInrush: mean(inrush),
    meanDurMs: mean(dur),
    labels,
    rows,
  };
}

/**
 * Build a PDF buffer summarizing RUN↔amps correlation + training data.
 */
function buildRunAmpsPdfReport({ report, training, meta = {} } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc._mvPageNum = 1;
    const left = doc.page.margins.left;
    const width = contentWidth(doc);

    // Cover / header
    doc.fontSize(20).fillColor('#0f172a').font('Helvetica-Bold')
      .text(meta.title || 'Putnam County — RUN↔Amps Analysis');
    doc.moveDown(0.2);
    doc.fontSize(11).font('Helvetica').fillColor('#475569')
      .text(meta.subtitle || 'Lift-station motor current correlation & AI training data');
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#64748b');
    doc.text(`Model: ${report.modelId || 'lift-station-run-amps-v1'}`);
    doc.text(`Built: ${fmtTs(report.builtAt || meta.exportedAt || new Date().toISOString())}`);
    doc.text(`Sites: ${report.siteCount ?? report.sites?.length ?? 0}  ·  Training runs: ${report.runCount ?? training?.length ?? 0}`);
    if (meta.source) doc.text(`Source: ${meta.source}`);
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).stroke('#cbd5e1');
    doc.moveDown(0.5);

    sectionTitle(doc, '1. Executive summary');
    doc.fontSize(10).fillColor('#334155');
    doc.text(
      'Historian CSVs from five Putnam County lift stations were imported into PeakLogic. '
      + 'Each site was analyzed to correlate RUN (or inverted fault) digitals with CT amp channels, '
      + 'segment motor run intervals, and extract PeakLogic motor-start features '
      + '(peakStartCurrentA, runCurrentA, inrushRatio, startTimeMs) for AI training.',
      { width, align: 'left' },
    );
    doc.moveDown(0.4);
    doc.text(
      'Hiawatha and Paradise Point show no usable CT current above the 2 A run threshold in this window '
      + '(CTs idle / not measuring). Currie, Port BV, and Putnam County Blvd produced the training set.',
      { width },
    );

    sectionTitle(doc, '2. Site correlation map (RUN → amps)');
    const siteRows = (report.sites || []).map((s) => {
      const c = s.correlation || {};
      return [
        s.siteId?.replace(/^putnam-/, '') || s.fileName,
        s.runCount ?? 0,
        c.digital || '—',
        c.inverted ? 'yes' : 'no',
        (c.ct || '—').replace('Motor ', '').replace(' CT', ''),
        fmtNum(c.delta, 2),
        c.usable ? 'yes' : 'no',
      ];
    });
    drawTable(doc, [
      { label: 'Site', w: 0.22 },
      { label: 'Runs', w: 0.08 },
      { label: 'Digital', w: 0.16 },
      { label: 'Inv', w: 0.07 },
      { label: 'CT channel', w: 0.22 },
      { label: 'ΔA', w: 0.1 },
      { label: 'Usable', w: 0.15 },
    ], siteRows);

    sectionTitle(doc, '3. Per-site training statistics');
    for (const s of report.sites || []) {
      const st = siteStats(training || [], s.siteId);
      ensureSpace(doc, 70);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
        .text(s.siteId || s.fileName);
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(
        `File: ${s.fileName}  ·  Rows: ${s.rowCount ?? '—'}  ·  `
        + `Range: ${fmtTs(s.from)} → ${fmtTs(s.to)}`,
      );
      if (!st.count) {
        doc.text('No run segments above amp threshold — excluded from training.');
        doc.moveDown(0.35);
        continue;
      }
      const labelStr = Object.entries(st.labels).map(([k, v]) => `${k}: ${v}`).join(', ');
      doc.text(
        `Runs: ${st.count}  ·  Mean run A: ${fmtNum(st.meanRunA)}  ·  Mean peak A: ${fmtNum(st.meanPeakA)}  ·  `
        + `P50 run A: ${fmtNum(st.p50RunA)}  ·  P90 peak A: ${fmtNum(st.p90PeakA)}`,
      );
      doc.text(
        `Mean inrush: ${fmtNum(st.meanInrush, 3)}  ·  Mean duration: ${fmtDur(st.meanDurMs)}  ·  Labels: ${labelStr}`,
      );
      doc.moveDown(0.35);
    }

    sectionTitle(doc, '4. Classification mix (all sites)');
    const allLabels = (training || []).reduce((acc, r) => {
      const l = r.inference?.label || 'unknown';
      acc[l] = (acc[l] || 0) + 1;
      return acc;
    }, {});
    const labelRows = Object.entries(allLabels).map(([k, v]) => {
      const pct = training?.length ? ((100 * v) / training.length).toFixed(1) : '0';
      return [k, String(v), `${pct}%`];
    });
    if (labelRows.length) {
      drawTable(doc, [
        { label: 'Label', w: 0.4 },
        { label: 'Count', w: 0.3 },
        { label: 'Share', w: 0.3 },
      ], labelRows);
    } else {
      doc.text('No labeled runs.');
    }
    doc.fontSize(9).fillColor('#64748b');
    doc.text(
      'Labels reuse PeakLogic single-phase start classifier when settle time is available; '
      + 'otherwise inrush ratio (peak/run) thresholds are applied. '
      + '~5-minute historian samples limit true inrush timing resolution.',
      { width },
    );

    sectionTitle(doc, '5. Sample training rows (latest 25)');
    const sample = [...(training || [])]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 25)
      .map((r) => [
        (r.siteId || '').replace(/^putnam-/, '').slice(0, 14),
        fmtTs(r.at).slice(0, 17),
        fmtNum(r.features?.peakStartCurrentA),
        fmtNum(r.features?.runCurrentA),
        fmtNum(r.features?.inrushRatio, 2),
        fmtDur(r.features?.runDurationMs),
        r.inference?.label || '—',
      ]);
    drawTable(doc, [
      { label: 'Site', w: 0.16 },
      { label: 'Start', w: 0.2 },
      { label: 'Peak A', w: 0.12 },
      { label: 'Run A', w: 0.12 },
      { label: 'Inrush', w: 0.1 },
      { label: 'Duration', w: 0.14 },
      { label: 'Label', w: 0.16 },
    ], sample);

    sectionTitle(doc, '6. Method notes');
    doc.fontSize(9).fillColor('#334155');
    const bullets = [
      'Auto-discover strongest digital↔CT pair (including inverted contacts such as MS 2 Fault Off = running).',
      'Segment contiguous RUN intervals; require amp support so idle inverted contacts do not invent runs.',
      'Features match PeakLogic motor-start shape used by PdM / edge_inference.',
      'Artifacts: training.csv, training.json, edge_inference.json, correlation-report.json.',
      'API: POST /api/pdm/import/run-amps-csv  ·  CLI: npm run build-putnam-training',
    ];
    for (const b of bullets) {
      ensureSpace(doc, 16);
      doc.text(`•  ${b}`, { width });
    }

    drawFooter(doc);
    doc.end();
  });
}

async function writeRunAmpsPdfReport(opts = {}) {
  const trainingDir = opts.trainingDir
    || path.join(process.cwd(), 'data', 'training', 'putnam-county');
  const reportPath = opts.reportPath || path.join(trainingDir, 'correlation-report.json');
  const trainPath = opts.trainPath || path.join(trainingDir, 'training.json');
  if (!fs.existsSync(reportPath)) throw new Error(`Missing report: ${reportPath}`);
  if (!fs.existsSync(trainPath)) throw new Error(`Missing training: ${trainPath}`);

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const training = JSON.parse(fs.readFileSync(trainPath, 'utf8'));
  const buf = await buildRunAmpsPdfReport({
    report,
    training,
    meta: {
      title: opts.title || 'Putnam County — RUN↔Amps Analysis',
      subtitle: opts.subtitle || 'Lift-station motor current correlation & AI training data',
      exportedAt: new Date().toISOString(),
      source: opts.source || trainingDir,
    },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = opts.outPath
    || path.join(trainingDir, `Putnam_RUN_Amps_Report_${stamp}.pdf`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  // Also write a stable latest name for easy open
  const latestPath = path.join(path.dirname(outPath), 'Putnam_RUN_Amps_Report.pdf');
  fs.writeFileSync(latestPath, buf);
  return { outPath, latestPath, bytes: buf.length, runCount: training.length, siteCount: report.siteCount };
}

module.exports = {
  buildRunAmpsPdfReport,
  writeRunAmpsPdfReport,
  siteStats,
};
