/* ============================================
   CHARTS.JS — Chart.js fallback (interactive)
   Used when backend matplotlib PNGs are unavailable
   ============================================ */
import { histogram, categoryFrequency, correlationMatrix } from './stats.js';

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#374151';

const ACCENT_COLORS = [
  'rgba(249,199,154,0.85)', 'rgba(245,158,11,0.85)', 'rgba(249,115,22,0.85)',
  'rgba(239,68,68,0.85)', 'rgba(16,185,129,0.8)', 'rgba(59,130,246,0.8)',
];

let activeChart = null;
function destroyChart() { if (activeChart) { activeChart.destroy(); activeChart = null; } }
function getCanvas() { return document.getElementById('mainChart')?.getContext('2d'); }

export function renderHistogram(data, column) {
  destroyChart();
  const ctx = getCanvas();
  if (!ctx) return;
  const values = data.map(r => r[column]).filter(v => v !== null && v !== undefined && v !== '');
  const { labels, counts } = histogram(values);

  activeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: column, data: counts, backgroundColor: ACCENT_COLORS[0], borderColor: '#000', borderWidth: 1.5, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => `Range: ${i[0].label}`, label: i => `Count: ${i.raw}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 35, font: { size: 10 }, maxTicksLimit: 10 } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } }, title: { display: true, text: 'Frequency', font: { size: 11 } } },
      },
    },
  });
}

export function renderCategoryChart(data, column) {
  destroyChart();
  const ctx = getCanvas();
  if (!ctx) return;
  const values = data.map(r => r[column]);
  const { labels, counts } = categoryFrequency(values, 15);
  const colors = labels.map((_, i) => ACCENT_COLORS[i % ACCENT_COLORS.length]);

  activeChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: column, data: counts, backgroundColor: colors, borderColor: '#000', borderWidth: 1.5, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: labels.length > 8 ? 'y' : 'x',
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } } },
    },
  });
}

export function renderScatter(data, colX, colY) {
  destroyChart();
  const ctx = getCanvas();
  if (!ctx) return;
  const points = data.map(r => ({ x: Number(r[colX]), y: Number(r[colY]) })).filter(p => !isNaN(p.x) && !isNaN(p.y));

  activeChart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: [{ label: `${colX} vs ${colY}`, data: points, backgroundColor: 'rgba(245,158,11,0.55)', borderColor: '#000', borderWidth: 1, pointRadius: 4, pointHoverRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => `(${i.parsed.x.toFixed(2)}, ${i.parsed.y.toFixed(2)})` } } },
      scales: {
        x: { title: { display: true, text: colX, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { title: { display: true, text: colY, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
      },
    },
  });
}

export function renderHeatmap(data, numericCols) {
  destroyChart();
  const ctx = getCanvas();
  if (!ctx) return;
  if (numericCols.length < 2) {
    const wrap = document.getElementById('chartWrap');
    if (wrap) wrap.insertAdjacentHTML('beforeend', '<p style="color:var(--color-text-muted);text-align:center;padding:40px;font-size:13px;">Need at least 2 numeric columns for a correlation heatmap.</p>');
    return;
  }
  const matrix = correlationMatrix(data, numericCols);
  const matrixData = [];
  numericCols.forEach((rowLabel, r) => numericCols.forEach((colLabel, c) => matrixData.push({ x: colLabel, y: rowLabel, v: matrix[r][c] })));

  activeChart = new Chart(ctx, {
    type: 'matrix',
    data: {
      datasets: [{
        label: 'Correlation', data: matrixData,
        backgroundColor(context) { const v = context.dataset.data[context.dataIndex]?.v ?? 0; return heatColor(v); },
        borderColor: '#fff', borderWidth: 1,
        width:  ({ chart }) => (chart.chartArea?.width  || 200) / numericCols.length - 1,
        height: ({ chart }) => (chart.chartArea?.height || 200) / numericCols.length - 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => { const d = items[0]?.dataset.data[items[0].dataIndex]; return d ? `${d.y} × ${d.x}` : ''; },
          label: item => `r = ${(item.dataset.data[item.dataIndex]?.v ?? 0).toFixed(3)}`,
        } },
      },
      scales: {
        x: { type: 'category', labels: numericCols, offset: true, ticks: { font: { size: 9 }, maxRotation: 35 }, grid: { display: false } },
        y: { type: 'category', labels: [...numericCols].reverse(), offset: true, ticks: { font: { size: 9 } }, grid: { display: false } },
      },
    },
  });
}

function heatColor(v) {
  const c = Math.max(-1, Math.min(1, v));
  if (c >= 0) { const t = c; return `rgba(255,${Math.round(255-t*(255-158))},${Math.round(255-t*255)},0.88)`; }
  const t = -c; return `rgba(255,${Math.round(255-t*(255-68))},${Math.round(255-t*(255-68))},0.88)`;
}

export function destroyActiveChart() { destroyChart(); }