/* ============================================
   EXPORT.JS — PDF, JSON, CSV, Markdown exports
   ============================================ */
import { Notification } from './notifications.js';

export function exportJSON(stats, insights, mlResult, filename) {
  const payload = {
    meta: { filename, exportedAt: new Date().toISOString() },
    statistics: stats,
    mlRecommendations: mlResult,
    aiInsights: insights,
  };
  downloadBlob(JSON.stringify(payload, null, 2), `datalens_${stripExt(filename)}_analysis.json`, 'application/json');
  Notification.show({ type: 'success', title: 'JSON exported', autoDismiss: 3000 });
}

export function exportStatsCSV(stats, filename) {
  const headers = ['Column','Type','Total','Missing','Unique','Mean','Median','StdDev','Min','Max','Q1','Q3','Outliers'];
  const rows = stats.map(s =>
    [s.name,s.type,s.total,s.missing,s.unique,s.mean,s.median,s.stdDev,s.min,s.max,s.q1,s.q3,s.outliers]
      .map(v => `"${String(v ?? '').replace(/"/g,'""')}"`)
      .join(',')
  );
  downloadBlob([headers.join(','), ...rows].join('\n'), `datalens_${stripExt(filename)}_stats.csv`, 'text/csv');
  Notification.show({ type: 'success', title: 'Stats CSV exported', autoDismiss: 3000 });
}

export function exportMarkdown(summary, insights, mlResult, filename) {
  const insightsMD = (insights || [])
    .map(i => `### ${i.title}\n> **Type:** ${i.type}\n\n${i.body}`)
    .join('\n\n');
  const mlMD = mlResult
    ? `## ML Recommendations\n\n**Task:** ${mlResult.taskDesc}\n**Target:** ${mlResult.targetColumn}\n**Readiness:** ${mlResult.readiness}/100\n\n### Top Models\n${mlResult.models.map(m => `- **${m.name}** (${m.score}/100) — ${m.note}`).join('\n')}`
    : '';
  const md = `# DataLens AI — Analysis Report\n**File:** ${filename}  \n**Exported:** ${new Date().toLocaleString()}\n\n---\n\n## Executive Summary\n\n${summary || '_Not generated._'}\n\n---\n\n## AI Insights\n\n${insightsMD || '_Not generated._'}\n\n---\n\n${mlMD}`;
  downloadBlob(md, `datalens_${stripExt(filename)}_report.md`, 'text/markdown');
  Notification.show({ type: 'success', title: 'Markdown exported', autoDismiss: 3000 });
}

export async function exportPDF(filename, summary, stats, insights, mlResult) {
  Notification.show({ type: 'loading', title: 'Generating PDF…', description: filename });
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210, margin = 16, col = pageW - margin * 2;
    let y = margin;

    // Header
    doc.setFillColor(249, 199, 154);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(17, 24, 39);
    doc.text('DataLens AI — Analysis Report', margin, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    doc.text(`File: ${filename}  |  ${new Date().toLocaleString()}`, margin, 20);
    y = 36;

    const section = (title) => {
      if (y > 260) { doc.addPage(); y = margin; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(17, 24, 39);
      doc.text(title, margin, y);
      y += 2;
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5);
      doc.line(margin, y, margin + col, y);
      y += 6;
    };

    const bodyText = (text, size = 9) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(55, 65, 81);
      const lines = doc.splitTextToSize(text, col);
      lines.forEach(line => { if (y > 272) { doc.addPage(); y = margin; } doc.text(line, margin, y); y += 5; });
      y += 2;
    };

    if (summary) { section('Executive Summary'); bodyText(summary); y += 4; }

    section('Statistical Analysis');
    const colWidths = [30, 16, 16, 16, 20, 20, 20, 20, 20];
    const headers   = ['Column','Type','Count','Missing','Mean','Median','StdDev','Min','Max'];
    let xOff = margin;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(17, 24, 39);
    headers.forEach((h, i) => { doc.text(h, xOff, y); xOff += colWidths[i]; });
    y += 4;

    stats.forEach((s, idx) => {
      if (y > 272) { doc.addPage(); y = margin; }
      if (idx % 2 === 0) { doc.setFillColor(250, 250, 248); doc.rect(margin - 1, y - 4, col + 2, 6, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(55, 65, 81);
      const vals = [s.name, s.type, String(s.total), String(s.missing), s.mean, s.median, s.stdDev, s.min, s.max];
      xOff = margin;
      vals.forEach((v, i) => { doc.text(String(v ?? '—').substring(0, 14), xOff, y); xOff += colWidths[i]; });
      y += 6;
    });
    y += 4;

    if (insights?.length) {
      section('AI Insights');
      insights.forEach(ins => {
        if (y > 265) { doc.addPage(); y = margin; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(17, 24, 39);
        doc.text(`[${ins.type.toUpperCase()}] ${ins.title}`, margin, y);
        y += 5;
        bodyText(ins.body);
      });
      y += 2;
    }

    if (mlResult) {
      section('ML Recommendations');
      bodyText(`Task: ${mlResult.taskDesc}`);
      bodyText(`Target: ${mlResult.targetColumn}  |  Readiness: ${mlResult.readiness}/100`);
      y += 2;
      mlResult.models.forEach(m => bodyText(`• ${m.name} (${m.score}/100) — ${m.note}`, 8.5));
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(156, 163, 175);
      doc.text(`DataLens AI  |  Page ${i} of ${pageCount}`, margin, 292);
    }

    doc.save(`datalens_${stripExt(filename)}_report.pdf`);
    Notification.update({ type: 'success', title: 'PDF downloaded!', autoDismiss: 3000 });
  } catch (err) {
    console.error(err);
    Notification.update({ type: 'error', title: 'PDF generation failed', description: err.message, autoDismiss: 5000 });
  }
}

function downloadBlob(content, name, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}