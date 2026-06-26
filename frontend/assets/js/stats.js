/* ============================================
   STATS.JS — Statistical calculations
   ============================================ */

/* ---- Basic helpers ---- */
function cleanNums(arr) {
  return arr.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(Number);
}

export function mean(arr) {
  const n = cleanNums(arr);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

export function median(arr) {
  const n = [...cleanNums(arr)].sort((a, b) => a - b);
  if (!n.length) return null;
  const mid = Math.floor(n.length / 2);
  return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
}

export function mode(arr) {
  const freq = {};
  arr.filter(v => v !== null && v !== undefined && v !== '').forEach(v => {
    freq[v] = (freq[v] || 0) + 1;
  });
  const max = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === max);
  return modes.length === Object.keys(freq).length ? null : modes[0]; // null if all equal
}

export function stdDev(arr) {
  const n = cleanNums(arr);
  if (n.length < 2) return null;
  const m = mean(n);
  const variance = n.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n.length - 1);
  return Math.sqrt(variance);
}

export function min(arr) {
  const n = cleanNums(arr);
  return n.length ? Math.min(...n) : null;
}

export function max(arr) {
  const n = cleanNums(arr);
  return n.length ? Math.max(...n) : null;
}

export function quantile(arr, q) {
  const n = [...cleanNums(arr)].sort((a, b) => a - b);
  if (!n.length) return null;
  const idx = (n.length - 1) * q;
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return lo === hi ? n[lo] : n[lo] + (n[hi] - n[lo]) * (idx - lo);
}

export function q1(arr)  { return quantile(arr, 0.25); }
export function q3(arr)  { return quantile(arr, 0.75); }

/* ---- Outlier detection (IQR method) ---- */
export function countOutliers(arr) {
  const _q1 = q1(arr), _q3 = q3(arr);
  if (_q1 === null) return 0;
  const iqr = _q3 - _q1;
  const lo = _q1 - 1.5 * iqr, hi = _q3 + 1.5 * iqr;
  return cleanNums(arr).filter(v => v < lo || v > hi).length;
}

/* ---- Column type inference ---- */
export function inferType(values) {
  const sample = values.filter(v => v !== null && v !== undefined && v !== '').slice(0, 50);
  if (!sample.length) return 'unknown';
  const numCount = sample.filter(v => !isNaN(Number(v))).length;
  if (numCount / sample.length > 0.85) return 'numeric';
  // Date check
  const dateCount = sample.filter(v => !isNaN(Date.parse(String(v)))).length;
  if (dateCount / sample.length > 0.7) return 'date';
  return 'categorical';
}

/* ---- Full column stats ---- */
export function columnStats(colName, values) {
  const type     = inferType(values);
  const total    = values.length;
  const missing  = values.filter(v => v === null || v === undefined || v === '').length;
  const unique   = new Set(values.filter(v => v !== null && v !== undefined && v !== '')).size;

  if (type === 'numeric') {
    return {
      name: colName, type, total, missing, unique,
      mean:    fmt(mean(values)),
      median:  fmt(median(values)),
      mode:    fmt(mode(values)),
      stdDev:  fmt(stdDev(values)),
      min:     fmt(min(values)),
      max:     fmt(max(values)),
      q1:      fmt(q1(values)),
      q3:      fmt(q3(values)),
      outliers: countOutliers(values),
    };
  }

  return {
    name: colName, type, total, missing, unique,
    mean: '—', median: '—', mode: String(mode(values) ?? '—'),
    stdDev: '—', min: '—', max: '—', q1: '—', q3: '—', outliers: 0,
  };
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
}

/* ---- Full dataset stats ---- */
export function computeDatasetStats(data, columns) {
  const colValues = {};
  columns.forEach(col => {
    colValues[col] = data.map(row => row[col] ?? null);
  });
  return columns.map(col => columnStats(col, colValues[col]));
}

/* ---- Correlation matrix (Pearson r) ---- */
export function correlationMatrix(data, numericCols) {
  const matrix = [];
  for (const colA of numericCols) {
    const row = [];
    for (const colB of numericCols) {
      const a = cleanNums(data.map(r => r[colA]));
      const b = cleanNums(data.map(r => r[colB]));
      row.push(pearson(a, b));
    }
    matrix.push(row);
  }
  return matrix;
}

function pearson(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  // Use paired values only
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x != null && y != null);
  if (pairs.length < 2) return 0;
  const n  = pairs.length;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0, dxa = 0, dya = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dxa += (x - mx) ** 2;
    dya += (y - my) ** 2;
  }
  const den = Math.sqrt(dxa * dya);
  return den === 0 ? 0 : +(num / den).toFixed(4);
}

/* ---- Data quality score (0–100) ---- */
export function qualityScore(stats) {
  let score = 100;
  const total = stats.reduce((s, c) => s + c.total, 0) || 1;
  const missing = stats.reduce((s, c) => s + c.missing, 0);
  const missingPct = missing / total;
  score -= missingPct * 40;   // penalise missing values (up to 40)
  const outlierCols = stats.filter(c => c.outliers > 0).length;
  score -= (outlierCols / Math.max(stats.length, 1)) * 15;  // up to 15
  return Math.round(Math.max(0, Math.min(100, score)));
}

/* ---- Histogram bins ---- */
export function histogram(values, bins = 15) {
  const nums = cleanNums(values);
  if (!nums.length) return { labels: [], counts: [] };
  const lo = Math.min(...nums), hi = Math.max(...nums);
  if (lo === hi) return { labels: [String(lo)], counts: [nums.length] };
  const step = (hi - lo) / bins;
  const counts = Array(bins).fill(0);
  nums.forEach(v => {
    let idx = Math.floor((v - lo) / step);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  });
  const labels = counts.map((_, i) => `${(lo + i * step).toFixed(1)}–${(lo + (i + 1) * step).toFixed(1)}`);
  return { labels, counts };
}

/* ---- Category frequency ---- */
export function categoryFrequency(values, topN = 15) {
  const freq = {};
  values.filter(v => v !== null && v !== undefined && v !== '').forEach(v => {
    const k = String(v);
    freq[k] = (freq[k] || 0) + 1;
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, topN);
  return { labels: sorted.map(([k]) => k), counts: sorted.map(([, v]) => v) };
}