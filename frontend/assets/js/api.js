/**
 * api.js — All calls to the DataLens AI FastAPI backend.
 * Place at: assets/js/api.js
 *
 * Change BACKEND_URL to your Render deployment URL after deploying.
 * Local dev: http://localhost:8000
 */

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = (
  window.DATALENS_BACKEND_URL ||
  localStorage.getItem('datalens_backend_url') ||
  'http://localhost:8000'
).replace(/\/$/, '');

let _sessionId = null;

// ── Session helpers ───────────────────────────────────────────────────────────
export function getSessionId()   { return _sessionId; }
export function setSessionId(id) { _sessionId = id; sessionStorage.setItem('datalens_session', id); }
export function clearSession()   { _sessionId = null; sessionStorage.removeItem('datalens_session'); }
export function restoreSession() { _sessionId = sessionStorage.getItem('datalens_session'); return _sessionId; }
export function setBackendUrl(url) { localStorage.setItem('datalens_backend_url', url.replace(/\/$/, '')); location.reload(); }

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkBackend() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-cache',
    });
    clearTimeout(timer);
    if (res.ok) {
      console.log('[DataLens] Backend reachable at', BACKEND_URL);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('[DataLens] Backend unreachable:', e.message);
    return false;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/upload`, {
      method: 'POST',
      body: form,
      mode: 'cors',
      cache: 'no-cache',
    });
  } catch (e) {
    console.error('[DataLens] Upload network error:', e);
    throw new Error(`Cannot reach backend at ${BACKEND_URL}. Is it running? (${e.message})`);
  }
  if (!res.ok) {
    // Try to read error body — on 500 errors the body has the Python traceback
    let errDetail = res.statusText;
    try {
      const errBody = await res.json();
      errDetail = errBody.detail || errBody.traceback?.split('\n').filter(Boolean).pop() || errDetail;
    } catch (_) {}
    console.error(`[DataLens] Upload failed ${res.status}:`, errDetail);
    throw new Error(`Upload failed (${res.status}): ${errDetail}`);
  }
  const data = await res.json();
  setSessionId(data.session_id);
  return data;
}

// ── Profile ───────────────────────────────────────────────────────────────────
export async function fetchProfile(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/profile/${sessionId}`);
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchHead(sessionId = _sessionId, n = 10) {
  const res = await fetch(`${BACKEND_URL}/api/profile/${sessionId}/head?n=${n}`);
  if (!res.ok) throw new Error(`Head fetch failed: ${res.status}`);
  return res.json();
}

// ── Cleaning ──────────────────────────────────────────────────────────────────
export async function fetchCleaningSuggestions(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/clean/${sessionId}/suggest`);
  if (!res.ok) throw new Error(`Suggestions failed: ${res.status}`);
  return res.json();
}

export async function applyCleaning(operations, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/clean/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Cleaning failed: ${res.status}`);
  }
  return res.json();
}

export async function resetCleaning(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/clean/${sessionId}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
  return res.json();
}

export function downloadCleanedCSV(sessionId = _sessionId) {
  window.open(`${BACKEND_URL}/api/clean/${sessionId}/download`, '_blank');
}

// ── Analysis ──────────────────────────────────────────────────────────────────
export async function fetchAnalysis(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/analyze/${sessionId}`);
  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
  return res.json();
}

export async function fetchCorrelation(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/analyze/${sessionId}/correlation`);
  if (!res.ok) throw new Error(`Correlation failed: ${res.status}`);
  return res.json();
}

export async function fetchOutliers(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/analyze/${sessionId}/outliers`);
  if (!res.ok) throw new Error(`Outliers failed: ${res.status}`);
  return res.json();
}

export async function fetchSkewness(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/analyze/${sessionId}/skewness`);
  if (!res.ok) throw new Error(`Skewness failed: ${res.status}`);
  return res.json();
}

// ── Charts (base64 PNG from backend matplotlib) ───────────────────────────────
export async function fetchHistogram(col, bins = 25, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/histogram?col=${encodeURIComponent(col)}&bins=${bins}`);
  if (!res.ok) throw new Error(`Histogram failed: ${res.status}`);
  return (await res.json()).chart;
}

export async function fetchCategoryChart(col, topN = 15, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/category?col=${encodeURIComponent(col)}&top_n=${topN}`);
  if (!res.ok) throw new Error(`Category chart failed: ${res.status}`);
  return (await res.json()).chart;
}

export async function fetchScatter(colX, colY, trendline = true, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/scatter?col_x=${encodeURIComponent(colX)}&col_y=${encodeURIComponent(colY)}&trendline=${trendline}`);
  if (!res.ok) throw new Error(`Scatter failed: ${res.status}`);
  return (await res.json()).chart;
}

export async function fetchHeatmap(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/heatmap`);
  if (!res.ok) throw new Error(`Heatmap failed: ${res.status}`);
  return (await res.json()).chart;
}

export async function fetchBoxPlot(col, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/boxplot?col=${encodeURIComponent(col)}`);
  if (!res.ok) throw new Error(`Box plot failed: ${res.status}`);
  return (await res.json()).chart;
}

export async function fetchMissingChart(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/charts/${sessionId}/missing`);
  if (!res.ok) throw new Error(`Missing chart failed: ${res.status}`);
  return res.json();
}

// ── ML ────────────────────────────────────────────────────────────────────────
export async function fetchMLRecommend(targetCol = null, sessionId = _sessionId) {
  const url = targetCol
    ? `${BACKEND_URL}/api/ml/${sessionId}/recommend?target=${encodeURIComponent(targetCol)}`
    : `${BACKEND_URL}/api/ml/${sessionId}/recommend`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ML recommend failed: ${res.status}`);
  return res.json();
}

export async function trainModels(targetCol, featureCols = null, testSize = 0.2, sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/ml/${sessionId}/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_column: targetCol, feature_columns: featureCols, test_size: testSize }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Training failed: ${res.status}`);
  }
  return res.json();
}

// ── Groq AI (backend handles API key — no client-side key needed) ─────────────

export async function streamSummary(sessionId = _sessionId, onChunk) {
  const res = await fetch(`${BACKEND_URL}/api/groq/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Summary failed: ${res.status}`);
  }
  return _readStream(res, onChunk);
}

export async function fetchInsights(sessionId = _sessionId) {
  const res = await fetch(`${BACKEND_URL}/api/groq/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Insights failed: ${res.status}`);
  }
  return (await res.json()).insights;
}

export async function streamAsk(question, chatHistory = [], sessionId = _sessionId, onChunk) {
  const res = await fetch(`${BACKEND_URL}/api/groq/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question, chat_history: chatHistory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Ask failed: ${res.status}`);
  }
  return _readStream(res, onChunk);
}

// ── Stream reader ─────────────────────────────────────────────────────────────
async function _readStream(res, onChunk) {
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onChunk?.(chunk, full);
  }
  return full;
}
