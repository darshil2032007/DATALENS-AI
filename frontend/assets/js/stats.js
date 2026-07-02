/* ============================================
   STATS.JS — JS-side statistics (fallback only)
   Used when backend is offline or as a quick
   client-side approximation alongside it.
   ============================================ */

function nums(arr) {
  return arr.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(Number);
}

function mean(arr) {
  const n = nums(arr);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

function median(arr) {
  const n = [...nums(arr)].sort((a, b) => a - b);
  if (!n.length) return null;
  const mid = Math.floor(n.length / 2);
  return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
}

function stdDev(arr) {
  const n = nums(arr);
  if (n.length < 2) return null;
  const m = mean(n);
  const variance = n.reduce((s, v) => s + (v - m) ** 2, 0) / (n.length - 1);
  return Math.sqrt(variance);
}

function quantile(arr, q) {
  const n = [...nums(arr)].sort((a, b) => a - b);
  if (!n.length) return null;
  const idx = (n.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? n[lo] : n[lo] + (n[hi] - n[lo]) * (idx - lo);
}

function countOutliers(arr) {
  const q1 = quantile(arr, 0.25), q3 = quantile(arr, 0.75);
  if (q1 === null) return 0;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return nums(arr).filter(v => v < lo || v > hi).length;
}

function inferType(values) {
  const sample = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 50);
  if (!sample.length) return 'unknown';
  const numCount = sample.filter(v => !isNaN(Number(v))).length;
  if (numCount / sample.length > 0.85) return 'numeric';
  const dateCount = sample.filter(v => !isNaN(Date.parse(String(v)))).length;
  if (dateCount / sample.length > 0.7) return 'date';
  return 'categorical';
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
}

export function columnStats(name, values) {
  const type    = inferType(values);
  const total   = values.length;
  const missing = values.filter(v => v === null || v === undefined || v === '').length;
  const unique  = new Set(values.filter(v => v !== null && v !== undefined && v !== '')).size;

  if (type === 'numeric') {
    return {
      name, type, total, missing, unique,
      mean: fmt(mean(values)), median: fmt(median(values)),
      stdDev: fmt(stdDev(values)),
      min: fmt(nums(values).length ? Math.min(...nums(values)) : null),
      max: fmt(nums(values).length ? Math.max(...nums(values)) : null),
      q1: fmt(quantile(values, 0.25)), q3: fmt(quantile(values, 0.75)),
      outliers: countOutliers(values),
    };
  }
  return { name, type, total, missing, unique, mean: '—', median: '—',
           stdDev: '—', min: '—', max: '—', q1: '—', q3: '—', outliers: 0 };
}

export function computeDatasetStats(data, columns) {
  return columns.map(col => columnStats(col, data.map(r => r[col] ?? null)));
}

export function correlationMatrix(data, numericCols) {
  const matrix = [];
  for (const a of numericCols) {
    const row = [];
    for (const b of numericCols) {
      row.push(pearson(nums(data.map(r => r[a])), nums(data.map(r => r[b]))));
    }
    matrix.push(row);
  }
  return matrix;
}

function pearson(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x != null && y != null);
  if (pairs.length < 2) return 0;
  const n = pairs.length;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0, dxa = 0, dya = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dxa += (x - mx) ** 2; dya += (y - my) ** 2; }
  const den = Math.sqrt(dxa * dya);
  return den === 0 ? 0 : +(num / den).toFixed(4);
}

export function qualityScore(stats) {
  let score = 100;
  const total = stats.reduce((s, c) => s + c.total, 0) || 1;
  const missing = stats.reduce((s, c) => s + c.missing, 0);
  score -= (missing / total) * 40;
  const outlierCols = stats.filter(c => c.outliers > 0).length;
  score -= (outlierCols / Math.max(stats.length, 1)) * 15;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function histogram(values, bins = 15) {
  const n = nums(values);
  if (!n.length) return { labels: [], counts: [] };
  const lo = Math.min(...n), hi = Math.max(...n);
  if (lo === hi) return { labels: [String(lo)], counts: [n.length] };
  const step = (hi - lo) / bins;
  const counts = Array(bins).fill(0);
  n.forEach(v => { let idx = Math.floor((v - lo) / step); if (idx >= bins) idx = bins - 1; counts[idx]++; });
  const labels = counts.map((_, i) => `${(lo + i * step).toFixed(1)}–${(lo + (i + 1) * step).toFixed(1)}`);
  return { labels, counts };
}

export function categoryFrequency(values, topN = 15) {
  const freq = {};
  values.filter(v => v !== null && v !== undefined && v !== '').forEach(v => { const k = String(v); freq[k] = (freq[k] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, topN);
  return { labels: sorted.map(([k]) => k), counts: sorted.map(([, v]) => v) };
}