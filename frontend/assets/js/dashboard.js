/* ============================================
   DASHBOARD.JS — Backend-driven orchestrator
   Every step actively calls the FastAPI backend.
   JS (stats.js/groq.js/mlSuggestions.js/charts.js)
   is used ONLY as an explicit fallback when the
   backend health-check fails at boot.
   ============================================ */
import { initUpload }                            from './upload.js';
import { loadSample }                            from './csvParser.js';
import { computeDatasetStats, qualityScore,
         correlationMatrix }                     from './stats.js';
import { generateSummary, generateInsights,
         askDataset }                            from './groq.js';
import { renderHistogram, renderCategoryChart,
         renderScatter, renderHeatmap }          from './charts.js';
import { suggestML }                             from './mlSuggestions.js';
import { exportPDF, exportJSON,
         exportStatsCSV, exportMarkdown }        from './export.js';
import { initScrollReveal }                      from './main.js';
import { Notification }                          from './notifications.js';
import {
  checkBackend, uploadFile as backendUpload,
  fetchCleaningSuggestions, applyCleaning,
  downloadCleanedCSV as backendDownloadCSV,
  fetchAnalysis, fetchMLRecommend,
  fetchHistogram, fetchCategoryChart, fetchScatter, fetchHeatmap,
  streamSummary, fetchInsights, streamAsk,
  getSessionId, clearSession,
} from './api.js';

/* ====================================================
   STATE
   ==================================================== */
let state = {
  data: [], columns: [], filename: '', stats: [], mlResult: null,
  summary: '', insights: [], chatHistory: [], activeViz: 'histogram',
  activeCol: null, scatterX: null, scatterY: null, currentStep: 1,
  cleaningLog: [], fixesApplied: false, backendOnline: false,
  backendProfile: null, backendSuggestions: [], backendAnalysis: null,
};

/* ====================================================
   BOOT
   ==================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  initApiKey();
  initSampleButtons();
  initNavActions();
  initStepNav();

  await detectBackend();
  initUpload({ onFile: handleDataLoaded, onError: handleUploadError });

  const sample = sessionStorage.getItem('loadSample');
  if (sample) {
    sessionStorage.removeItem('loadSample');
    try {
      const result = loadSample(sample);
      await handleDataLoaded(result);
    } catch (e) {
      Notification.show({ type: 'error', title: 'Sample load failed', description: e.message, autoDismiss: 5000 });
    }
  }
});

async function detectBackend() {
  state.backendOnline = await checkBackend();
  const badge = document.getElementById('backendStatusBadge');
  if (!badge) return;

  badge.style.display = '';
  if (state.backendOnline) {
    badge.textContent = '🟢 Backend Online';
    badge.className   = 'badge badge-success';
    Notification.show({ type: 'success', title: 'Backend connected', description: 'Using pandas + scikit-learn for analysis', autoDismiss: 3000 });
  } else {
    badge.textContent = '🔴 Backend Offline (JS fallback)';
    badge.className   = 'badge badge-warning';
    Notification.show({ type: 'warning', title: 'Backend offline', description: 'Start the FastAPI server for pandas-accurate analysis.', autoDismiss: 6000 });
  }
}

/* ====================================================
   API KEY (only relevant in JS fallback mode)
   ==================================================== */
function initApiKey() {
  const input     = document.getElementById('apiKeyInput');
  const saveBtn   = document.getElementById('btnSaveKey');
  const clearBtn  = document.getElementById('btnClearKey');
  const keyStatus = document.getElementById('keyStatus');

  const saved = localStorage.getItem('groqApiKey');
  if (saved) {
    input.value = saved;
    keyStatus.textContent = '✓ Key saved';
    keyStatus.style.color = '#10B981';
  }

  saveBtn?.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) { Notification.show({ type: 'error', title: 'No API key', description: 'Enter a key first', autoDismiss: 4000 }); return; }
    localStorage.setItem('groqApiKey', val);
    keyStatus.textContent = '✓ Key saved';
    keyStatus.style.color = '#10B981';
    Notification.show({ type: 'success', title: 'API key saved', autoDismiss: 3000 });
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem('groqApiKey');
    input.value = '';
    keyStatus.textContent = '';
    Notification.show({ type: 'info', title: 'API key cleared', autoDismiss: 3000 });
  });

  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn?.click(); });
}

function showApiSection() {
  if (state.backendOnline) return; // never needed in backend mode
  const el = document.getElementById('apiKeySection');
  if (el && el.style.display === 'none') {
    el.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ====================================================
   SAMPLE BUTTONS
   ==================================================== */
function initSampleButtons() {
  document.querySelectorAll('[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const result = loadSample(btn.dataset.sample);
        handleDataLoaded(result);
      } catch (e) {
        Notification.show({ type: 'error', title: 'Sample load failed', description: e.message, autoDismiss: 5000 });
      }
    });
  });
}

/* ====================================================
   NAV ACTIONS
   ==================================================== */
function initNavActions() {
  document.getElementById('btnReset')?.addEventListener('click', () => {
    document.getElementById('apiKeySection').style.display = 'none';
    resetDashboard();
  });
  document.getElementById('btnExportNav')?.addEventListener('click', () => {
    goToStep(6);
    setTimeout(() => document.getElementById('sectionExport')?.scrollIntoView({ behavior: 'smooth' }), 300);
  });
  document.getElementById('btnReset2')?.addEventListener('click', resetDashboard);
}

function resetDashboard() {
  clearSession();
  state = {
    data: [], columns: [], filename: '', stats: [], mlResult: null,
    summary: '', insights: [], chatHistory: [], activeViz: 'histogram',
    activeCol: null, scatterX: null, scatterY: null, currentStep: 1,
    cleaningLog: [], fixesApplied: false, backendOnline: state.backendOnline,
    backendProfile: null, backendSuggestions: [], backendAnalysis: null,
  };
  document.getElementById('uploadView').style.display    = '';
  document.getElementById('analysisView').style.display  = 'none';
  document.getElementById('btnReset').style.display      = 'none';
  document.getElementById('btnExportNav').style.display  = 'none';
  document.getElementById('fileNameBadge').style.display = 'none';
  document.getElementById('stepWizard').classList.remove('visible');
  Notification.show({ type: 'info', title: 'Dashboard reset', description: 'Upload a new file to begin', autoDismiss: 3000 });
}

/* ====================================================
   STEP WIZARD
   ==================================================== */
function initStepNav() {
  document.querySelectorAll('.step-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (state.data.length > 0 || state.backendProfile) goToStep(parseInt(tab.dataset.step));
    });
  });
  document.getElementById('step1Next')?.addEventListener('click', () => goToStep(2));
  document.getElementById('step2Next')?.addEventListener('click', () => goToStep(3));
  document.getElementById('step3Next')?.addEventListener('click', () => goToStep(4));
  document.getElementById('step4Next')?.addEventListener('click', () => goToStep(5));
  document.getElementById('step5Next')?.addEventListener('click', () => goToStep(6));
  document.getElementById('step2Back')?.addEventListener('click', () => goToStep(1));
  document.getElementById('step3Back')?.addEventListener('click', () => goToStep(2));
  document.getElementById('step4Back')?.addEventListener('click', () => goToStep(3));
  document.getElementById('step5Back')?.addEventListener('click', () => goToStep(4));
  document.getElementById('step6Back')?.addEventListener('click', () => goToStep(5));
}

function goToStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step-tab').forEach(tab => {
    const t = parseInt(tab.dataset.step);
    tab.classList.remove('active', 'completed');
    if (t === n) tab.classList.add('active');
    else if (t < n) tab.classList.add('completed');
  });
  document.querySelectorAll('.step-panel').forEach(panel => {
    panel.classList.remove('active');
    if (parseInt(panel.dataset.stepPanel) === n) panel.classList.add('active');
  });

  if (n === 2) renderCleaningStep();
  if (n === 3) renderAnalysisStep();
  if (n === 4) initVisualizations();
  if (n === 5) renderMLRecommendations();
  if (n === 6) renderReport();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { lucide.createIcons(); initScrollReveal(); }, 100);
}

/* ====================================================
   MAIN DATA HANDLER
   ==================================================== */
async function handleDataLoaded(result) {
  const { data, columns, filename } = result;

  state.data = data; state.columns = columns; state.filename = filename;

  document.getElementById('uploadView').style.display    = 'none';
  document.getElementById('analysisView').style.display  = '';
  document.getElementById('btnReset').style.display      = '';
  document.getElementById('btnExportNav').style.display  = '';
  document.getElementById('stepWizard').classList.add('visible');

  const badge = document.getElementById('fileNameBadge');
  badge.textContent = filename;
  badge.style.display = '';

  if (state.backendOnline) {
    try {
      Notification.show({ type: 'loading', title: 'Profiling with pandas…', description: filename });
      const file = result._isFile || new File([toCSV(data, columns)], filename, { type: 'text/csv' });
      const backendResult = await backendUpload(file);
      state.backendProfile     = backendResult.profile;
      state.backendSuggestions = backendResult.cleaning_suggestions || [];
      Notification.update({ type: 'success', title: 'Profiled with pandas', description: `${backendResult.profile.rows} rows × ${backendResult.profile.columns} cols`, autoDismiss: 3000 });
    } catch (e) {
      console.error('[DataLens] Backend profiling failed:', e);
      const isCORS = e.message.includes('CORS') || e.message.includes('fetch') || e.message.includes('Failed to fetch');
      Notification.update({
        type: 'error',
        title: 'Backend profiling failed',
        description: isCORS
          ? 'CORS error — restart backend with updated main.py, then refresh'
          : e.message,
        subtitle: 'Using JS fallback for this dataset',
        autoDismiss: 8000,
      });
      state.backendProfile = null;
    }
  }

  state.stats = computeDatasetStats(state.data, columns);

  renderOverview();
  renderStatsTable();
  initAskDataset();
  initExportPanel();

  document.getElementById('btnGenerateSummary')?.addEventListener('click', runSummary);
  document.getElementById('btnGenerateInsights')?.addEventListener('click', runInsights);
  document.getElementById('btnApplyAllFixes')?.addEventListener('click', applyAllFixes);
  document.getElementById('btnDownloadClean')?.addEventListener('click', handleDownloadClean);

  goToStep(1);
  initScrollReveal();
  setTimeout(() => lucide.createIcons(), 100);
}

function handleUploadError(err) {
  console.error('[DataLens] Upload error:', err);
}

function toCSV(data, columns) {
  const headers = columns.join(',');
  const rows = data.map(row => columns.map(col => {
    const v = row[col];
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(','));
  return [headers, ...rows].join('\n');
}

/* ====================================================
   STEP 1 — OVERVIEW
   ==================================================== */
function renderOverview() {
  const { data, columns, filename, stats, backendProfile } = state;
  document.getElementById('overviewFilename').textContent = filename;

  const rowCount   = backendProfile?.rows           ?? data.length;
  const colCount   = backendProfile?.columns        ?? columns.length;
  const missing    = backendProfile?.total_missing  ?? stats.reduce((s, c) => s + c.missing, 0);
  const numericCnt = backendProfile?.numeric_count  ?? stats.filter(s => s.type === 'numeric').length;
  const qs         = backendProfile?.quality_score  ?? qualityScore(stats);
  const duplicates = backendProfile?.duplicates     ?? 0;
  const memHuman   = backendProfile?.memory_human   ?? '—';

  const cards = [
    { icon: 'rows',         label: 'Total Rows',    value: rowCount.toLocaleString() },
    { icon: 'columns',      label: 'Columns',        value: colCount },
    { icon: 'alert-circle', label: 'Missing Values', value: missing.toLocaleString() },
    { icon: 'bar-chart',    label: 'Numeric Cols',   value: numericCnt },
  ];

  const container = document.getElementById('overviewCards');
  container.classList.toggle('six-cards', !!backendProfile);

  if (backendProfile) {
    cards.push({ icon: 'copy',       label: 'Duplicate Rows', value: duplicates });
    cards.push({ icon: 'hard-drive', label: 'Memory',         value: memHuman });
  }

  container.innerHTML = cards.map(c => `
    <div class="overview-stat">
      <div class="overview-stat__icon"><i data-lucide="${c.icon}"></i></div>
      <div class="overview-stat__info">
        <div class="overview-stat__value">${c.value}</div>
        <div class="overview-stat__label">${c.label}</div>
      </div>
    </div>`).join('');

  document.getElementById('qualityScore').textContent = `${qs}%`;
  document.getElementById('qualityFill').style.width  = `${qs}%`;
  document.getElementById('qualityFill').style.background =
    qs >= 80 ? '#10B981' : qs >= 55 ? '#F59E0B' : '#EF4444';
  document.getElementById('qualityDesc').textContent =
    qs >= 80 ? 'Good quality — ready for analysis.' :
    qs >= 55 ? 'Moderate quality — some missing values detected.' :
               'Low quality — significant missing data. Consider cleaning first.';

  const qRight = document.getElementById('qualityFill').closest('.quality-ring')?.querySelector('.quality-ring__right');
  if (qRight) {
    qRight.querySelectorAll('.badge-success, .backend-flag').forEach(el => el.remove());
    const flag = document.createElement('span');
    flag.className  = backendProfile ? 'badge badge-success' : 'badge badge-warning backend-flag';
    flag.textContent = backendProfile ? '✓ Powered by pandas' : '⚠ JS fallback mode';
    qRight.appendChild(flag);
  }

  setTimeout(() => lucide.createIcons(), 50);
}

/* ====================================================
   STEP 1 — STATS TABLE
   ==================================================== */
function renderStatsTable() {
  const { stats, backendProfile } = state;
  document.getElementById('statsColCount').textContent = `${columnCount()} columns`;
  const tbody = document.getElementById('statsTableBody');

  if (backendProfile?.columns_profile) {
    tbody.innerHTML = backendProfile.columns_profile.map(c => {
      const missingColor = c.missing > 0 ? '#EF4444' : 'inherit';
      const typeClass    = c.dtype_group === 'numeric' ? 'badge-success' : 'badge-outline';
      return `<tr>
        <td class="col-name">${c.name}</td>
        <td><span class="badge ${typeClass} type-badge">${c.dtype_group} (${c.dtype})</span></td>
        <td>${c.total}</td>
        <td><span style="color:${missingColor};font-weight:700;">${c.missing}</span></td>
        <td>${c.mean ?? '—'}</td>
        <td>${c.median ?? '—'}</td>
        <td>${c.std ?? '—'}</td>
        <td>${c.min ?? '—'}</td>
        <td>${c.max ?? '—'}</td>
        <td>${c.q1 ?? '—'}</td>
        <td>${c.q3 ?? '—'}</td>
      </tr>`;
    }).join('');
  } else {
    tbody.innerHTML = stats.map(s => `
      <tr>
        <td class="col-name">${s.name}</td>
        <td><span class="badge ${s.type === 'numeric' ? 'badge-success' : 'badge-outline'} type-badge">${s.type}</span></td>
        <td>${s.total}</td>
        <td>${s.missing > 0 ? `<span style="color:#EF4444;font-weight:700;">${s.missing}</span>` : '0'}</td>
        <td>${s.mean}</td><td>${s.median}</td><td>${s.stdDev}</td>
        <td>${s.min}</td><td>${s.max}</td><td>${s.q1}</td><td>${s.q3}</td>
      </tr>`).join('');
  }
}

function columnCount() {
  return state.backendProfile?.columns_profile?.length ?? state.stats.length;
}

/* ====================================================
   STEP 1 — AI SUMMARY (backend Groq route)
   ==================================================== */
async function runSummary() {
  const btn = document.getElementById('btnGenerateSummary');
  const content = document.getElementById('summaryContent');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Generating…';
  lucide.createIcons();
  content.innerHTML = '<div class="ai-loading"><i data-lucide="loader" class="anim-spin" style="width:16px;height:16px;"></i> Writing summary…</div>';
  lucide.createIcons();

  let full = '';
  try {
    const sessionId = getSessionId();
    if (state.backendOnline && sessionId) {
      await streamSummary(sessionId, (chunk, acc) => {
        full = acc;
        content.innerHTML = `<p class="ai-summary-text cursor-blink">${escHtml(acc)}</p>`;
      });
    } else {
      showApiSection();
      const apiKey = localStorage.getItem('groqApiKey') || document.getElementById('apiKeyInput')?.value?.trim();
      if (!apiKey) throw new Error('No Groq API key set. Add your key above, or start the backend for server-side AI.');
      await generateSummary(buildMeta(), (chunk, acc) => {
        full = acc;
        content.innerHTML = `<p class="ai-summary-text cursor-blink">${escHtml(acc)}</p>`;
      });
    }
    state.summary = full;
    content.innerHTML = `<p class="ai-summary-text">${escHtml(full)}</p>`;
    content.classList.remove('empty-state');
    const rEl = document.getElementById('reportSummary');
    if (rEl) rEl.textContent = full;
    Notification.show({ type: 'success', title: 'Summary ready', autoDismiss: 3000 });
  } catch (e) {
    content.innerHTML = `<p style="color:#EF4444;font-size:13px;">Error: ${escHtml(e.message)}</p>`;
    Notification.show({ type: 'error', title: 'Summary failed', description: e.message, autoDismiss: 5000 });
  }
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="sparkles" style="width:14px;height:14px;"></i> Regenerate';
  lucide.createIcons();
}

/* ====================================================
   STEP 1 — AI INSIGHTS
   ==================================================== */
async function runInsights() {
  const btn = document.getElementById('btnGenerateInsights');
  const grid = document.getElementById('insightsGrid');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Thinking…';
  lucide.createIcons();
  grid.innerHTML = `<div class="ai-loading" style="grid-column:1/-1;"><i data-lucide="loader" class="anim-spin" style="width:16px;height:16px;"></i> Generating insights…</div>`;
  lucide.createIcons();

  const typeIcons = { correlation: '🔗', quality: '🛡️', trend: '📈', ml_readiness: '🤖' };
  try {
    let insights;
    const sessionId = getSessionId();
    if (state.backendOnline && sessionId) {
      insights = await fetchInsights(sessionId);
    } else {
      showApiSection();
      const apiKey = localStorage.getItem('groqApiKey') || document.getElementById('apiKeyInput')?.value?.trim();
      if (!apiKey) throw new Error('No Groq API key set. Add your key above, or start the backend for server-side AI.');
      insights = await generateInsights(buildMeta());
    }
    state.insights = insights;
    grid.innerHTML = insights.map(ins => `
      <div class="insight-card fade-up visible">
        <div class="insight-card__type">${typeIcons[ins.type] || '✦'} ${ins.type.replace('_', ' ')}</div>
        <h4 class="insight-card__title">${escHtml(ins.title)}</h4>
        <p class="insight-card__body">${escHtml(ins.body)}</p>
      </div>`).join('');
    grid.classList.remove('empty-state');
    Notification.show({ type: 'success', title: 'Insights ready', description: `${insights.length} insights generated`, autoDismiss: 3000 });
  } catch (e) {
    grid.innerHTML = `<p style="color:#EF4444;grid-column:1/-1;font-size:13px;">Error: ${escHtml(e.message)}</p>`;
    Notification.show({ type: 'error', title: 'Insights failed', description: e.message, autoDismiss: 5000 });
  }
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="zap" style="width:14px;height:14px;"></i> Regenerate';
  lucide.createIcons();
}

/* ====================================================
   STEP 2 — DATA CLEANING
   ==================================================== */
async function renderCleaningStep() {
  const list  = document.getElementById('cleanIssueList');
  const count = document.getElementById('cleanIssueCount');
  list.innerHTML = `<div class="ai-loading"><i data-lucide="loader" class="anim-spin" style="width:16px;height:16px;"></i> Detecting issues…</div>`;
  lucide.createIcons();

  let issues = [];
  const sessionId = getSessionId();

  if (state.backendOnline && sessionId) {
    try {
      const res = await fetchCleaningSuggestions(sessionId);
      issues = res.suggestions || [];
      state.backendSuggestions = issues;
    } catch (e) {
      console.warn('[DataLens] Backend suggestions failed, using JS:', e.message);
      issues = detectIssuesJS();
    }
  } else {
    issues = detectIssuesJS();
  }

  window._cleaningIssues  = issues;
  window._backendCleaning = state.backendOnline && !!sessionId;

  if (count) count.textContent = `${issues.length} issue${issues.length !== 1 ? 's' : ''}`;

  if (!issues.length) {
    list.innerHTML = `<div class="step-empty">
      <i data-lucide="check-circle" style="width:32px;height:32px;color:#10B981;display:block;margin:0 auto var(--space-3);"></i>
      No issues detected — your data looks clean!
    </div>`;
    lucide.createIcons();
    return;
  }

  list.innerHTML = issues.map((issue, idx) => {
    const title = issue.title || '';
    const desc  = issue.description || issue.desc || '';
    const severity = issue.severity || 'warning';
    const methods   = buildMethodOptions(issue);
    return `
      <div class="clean-issue" id="issue-${idx}">
        <div class="clean-issue__header">
          <div class="clean-issue__title">
            <i data-lucide="${severityIcon(severity)}" style="width:16px;height:16px;color:${severityColor(severity)};"></i>
            ${escHtml(title)}
          </div>
          <span class="clean-issue__badge clean-issue__badge--${severity}">${severity}</span>
        </div>
        <p class="clean-issue__desc">${escHtml(desc)}</p>
        <div class="clean-issue__actions">
          ${methods ? `<select class="clean-method-select" id="method-${idx}">${methods}</select>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="applyFix(${idx})">
            <i data-lucide="wrench" style="width:12px;height:12px;"></i> Apply Fix
          </button>
          <span id="fix-status-${idx}" style="font-size:11px;color:var(--color-text-muted);"></span>
        </div>
      </div>`;
  }).join('');

  updateCleaningCode(issues);
  setTimeout(() => lucide.createIcons(), 50);
}

function severityIcon(s)  { return s === 'error' ? 'alert-circle' : 'alert-triangle'; }
function severityColor(s) { return s === 'error' ? '#EF4444' : '#F59E0B'; }

function buildMethodOptions(issue) {
  if (issue.operation) {
    const op = issue.operation;
    if (op.type === 'fill_missing') {
      return `<option value="median">Fill with Median</option>
        <option value="mean">Fill with Mean</option>
        <option value="mode">Fill with Mode</option>
        <option value="zero">Fill with 0</option>
        <option value="drop_rows">Drop rows</option>`;
    }
    if (op.type === 'remove_outliers') {
      return `<option value="iqr">Remove (IQR method)</option>
        <option value="zscore">Remove (Z-score method)</option>`;
    }
    return null;
  }
  if (issue.methods) return issue.methods.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  return null;
}

window.applyFix = async function(idx) {
  const issues   = window._cleaningIssues || [];
  const issue    = issues[idx];
  if (!issue) return;

  const methodEl  = document.getElementById(`method-${idx}`);
  const method    = methodEl?.value || 'median';
  const statusEl  = document.getElementById(`fix-status-${idx}`);
  const sessionId = getSessionId();

  if (window._backendCleaning && sessionId) {
    let operation;
    if (issue.operation) {
      operation = { ...issue.operation };
      if (operation.type === 'fill_missing')    operation.method = method;
      if (operation.type === 'remove_outliers') operation.method = method;
    } else {
      operation = buildOperationFromJS(issue, method);
    }
    try {
      const res = await applyCleaning([operation], sessionId);
      state.cleaningLog.push(...(res.log || []));
      state.fixesApplied = true;
      if (res.profile) {
        state.backendProfile = res.profile;
        renderOverview();
        renderStatsTable();
      }
      if (statusEl) { statusEl.textContent = '✓ Applied'; statusEl.style.color = '#10B981'; }
      updateDownloadButton();
      Notification.show({ type: 'success', title: 'Fix applied', description: res.log?.[0] || 'Done', autoDismiss: 3000 });
      return;
    } catch (e) {
      Notification.show({ type: 'error', title: 'Fix failed', description: e.message, autoDismiss: 4000 });
      return;
    }
  }

  const changed = applyFixJS(issue, method);
  if (changed !== null) {
    state.stats = computeDatasetStats(state.data, state.columns);
    state.fixesApplied = true;
    renderOverview();
    renderStatsTable();
    if (statusEl) { statusEl.textContent = `✓ ${changed} changes`; statusEl.style.color = '#10B981'; }
    updateDownloadButton();
    Notification.show({ type: 'success', title: 'Fix applied', description: `${changed} values changed`, autoDismiss: 3000 });
  }
};

function buildOperationFromJS(issue, method) {
  if (issue.type === 'duplicates') return { type: 'drop_duplicates' };
  if (issue.type === 'missing')    return { type: 'fill_missing', column: issue.column, method };
  if (issue.type === 'outliers')   return { type: 'remove_outliers', column: issue.column, method: 'iqr' };
  return { type: issue.type };
}

function applyFixJS(issue, method) {
  let changed = 0;
  if (issue.type === 'duplicates') {
    const before = state.data.length;
    const seen = new Set();
    state.data = state.data.filter(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    changed = before - state.data.length;
    state.cleaningLog.push(`Dropped ${changed} duplicate rows`);
  }
  else if (issue.type === 'missing') {
    const col  = issue.column;
    const vals = state.data.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).map(Number);
    let fillVal;
    if (method === 'median') { const s = [...vals].sort((a,b)=>a-b); fillVal = s[Math.floor(s.length/2)]; }
    else if (method === 'mean') { fillVal = vals.reduce((a,b)=>a+b,0)/vals.length; }
    else if (method === 'zero') { fillVal = 0; }
    else if (method === 'mode') {
      const freq = {}; state.data.forEach(r => { const v = r[col]; if (v !== null && v !== undefined && v !== '') freq[v]=(freq[v]||0)+1; });
      fillVal = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]?.[0];
    } else if (method === 'drop' || method === 'drop_rows') {
      const before = state.data.length;
      state.data = state.data.filter(r => r[col] !== null && r[col] !== undefined && r[col] !== '');
      changed = before - state.data.length;
      state.cleaningLog.push(`Dropped ${changed} rows where '${col}' was missing`);
      return changed;
    }
    if (fillVal !== undefined) {
      state.data.forEach(r => { if (r[col] === null || r[col] === undefined || r[col] === '') { r[col] = fillVal; changed++; } });
      state.cleaningLog.push(`Filled ${changed} missing in '${col}' with ${method}`);
    }
  }
  else if (issue.type === 'outliers') {
    const col = issue.column;
    const nums = state.data.map(r=>Number(r[col])).filter(v=>!isNaN(v)).sort((a,b)=>a-b);
    const q1 = nums[Math.floor(nums.length*0.25)], q3 = nums[Math.floor(nums.length*0.75)];
    const iqr = q3-q1, lo = q1-1.5*iqr, hi = q3+1.5*iqr;
    const before = state.data.length;
    state.data = state.data.filter(r => { const v=Number(r[col]); return isNaN(v)||(v>=lo&&v<=hi); });
    changed = before - state.data.length;
    state.cleaningLog.push(`Removed ${changed} outliers from '${col}'`);
  }
  return changed;
}

async function applyAllFixes() {
  const issues    = window._cleaningIssues || [];
  const sessionId = getSessionId();

  if (window._backendCleaning && sessionId) {
    try {
      const operations = issues.map((issue, idx) => {
        const methodEl = document.getElementById(`method-${idx}`);
        const method   = methodEl?.value || 'median';
        if (issue.operation) {
          const op = { ...issue.operation };
          if (op.type === 'fill_missing')    op.method = method;
          if (op.type === 'remove_outliers') op.method = method;
          return op;
        }
        return buildOperationFromJS(issue, method);
      });
      const res = await applyCleaning(operations, sessionId);
      state.cleaningLog.push(...(res.log || []));
      state.fixesApplied = true;
      if (res.profile) { state.backendProfile = res.profile; renderOverview(); renderStatsTable(); }
      updateDownloadButton();
      Notification.show({ type: 'success', title: 'All fixes applied', description: `${(res.log||[]).length} operations`, autoDismiss: 3000 });
      state.backendSuggestions = res.cleaning_suggestions || [];
      window._cleaningIssues   = state.backendSuggestions;
      issues.forEach((_, idx) => {
        const s = document.getElementById(`fix-status-${idx}`);
        if (s) { s.textContent = '✓ Done'; s.style.color = '#10B981'; }
      });
      return;
    } catch (e) {
      Notification.show({ type: 'error', title: 'Bulk fix failed', description: e.message, autoDismiss: 4000 });
      return;
    }
  }

  for (let i = 0; i < issues.length; i++) {
    const methodEl = document.getElementById(`method-${i}`);
    applyFixJS(issues[i], methodEl?.value || 'median');
    const s = document.getElementById(`fix-status-${i}`);
    if (s) { s.textContent = '✓'; s.style.color = '#10B981'; }
  }
  state.stats = computeDatasetStats(state.data, state.columns);
  state.fixesApplied = true;
  renderOverview();
  renderStatsTable();
  updateDownloadButton();
  Notification.show({ type: 'success', title: 'All fixes applied', autoDismiss: 3000 });
}

function updateDownloadButton() {
  const btn = document.getElementById('btnDownloadClean');
  if (!btn) return;
  btn.disabled = false;
  const descEl = document.getElementById('downloadAreaDesc');
  const rows = state.backendProfile?.rows ?? state.data.length;
  if (descEl) descEl.textContent = `${rows.toLocaleString()} rows after cleaning. Click to download.`;
}

async function handleDownloadClean() {
  const sessionId = getSessionId();
  if (state.backendOnline && sessionId && state.fixesApplied) {
    backendDownloadCSV(sessionId);
    Notification.show({ type: 'success', title: 'Downloading cleaned CSV', autoDismiss: 2500 });
    return;
  }
  downloadCSVFromMemory();
}

function downloadCSVFromMemory() {
  const csv  = toCSV(state.data, state.columns);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = state.filename.replace(/\.[^.]+$/, '') + '_cleaned.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  Notification.show({ type: 'success', title: 'Downloaded!', description: a.download, autoDismiss: 3000 });
}

function detectIssuesJS() {
  const issues = [];
  const { data, stats } = state;
  const seen = new Set(); let dupes = 0;
  data.forEach(r => { const k = JSON.stringify(r); if (seen.has(k)) dupes++; else seen.add(k); });
  if (dupes > 0) issues.push({ type: 'duplicates', severity: 'error', column: null,
    title: `${dupes} duplicate rows detected`,
    desc: `${dupes} rows are exact duplicates (${(dupes/data.length*100).toFixed(1)}%). Removing prevents bias.` });

  stats.forEach(s => {
    if (s.missing > 0) {
      const pct = (s.missing/s.total*100).toFixed(1);
      const isNum = s.type === 'numeric';
      issues.push({ type: 'missing', severity: parseFloat(pct) > 20 ? 'error' : 'warning',
        column: s.name, colType: s.type,
        title: `'${s.name}': ${s.missing} missing values (${pct}%)`,
        desc: `Recommended: fill with ${isNum ? 'median' : 'mode'}.`,
        methods: isNum
          ? [{ value:'median',label:'Median (skewed data)'},{value:'mean',label:'Mean (normal data)'},
             { value:'zero',label:'Fill with 0'},{value:'drop_rows',label:'Drop rows'}]
          : [{ value:'mode',label:'Mode (most frequent)'},{value:'drop_rows',label:'Drop rows'}] });
    }
    if (s.type === 'numeric' && s.outliers > 0) {
      const pct = (s.outliers/s.total*100).toFixed(1);
      if (parseFloat(pct) < 3) return;
      issues.push({ type: 'outliers', severity: 'warning', column: s.name,
        title: `'${s.name}': ${s.outliers} outliers (${pct}%)`,
        desc: 'IQR-based detection. Outliers can skew model training.',
        methods: [{ value:'iqr',label:'Remove (IQR method)'},{value:'cap_iqr',label:'Cap at IQR fences'}] });
    }
  });
  return issues;
}

function updateCleaningCode(issues) {
  const el = document.getElementById('cleaningCodePre');
  if (!el) return;
  const lines = ['import pandas as pd', '', `df = pd.read_csv("${state.filename}")`, '',
    'print(f"Shape: {df.shape}")', 'print(f"Duplicates: {df.duplicated().sum()}")', 'print(df.isnull().sum())', ''];
  issues.forEach(issue => {
    if (issue.type === 'duplicates' || issue.operation?.type === 'drop_duplicates') {
      lines.push('# Drop duplicate rows'); lines.push('df = df.drop_duplicates()'); lines.push('');
    } else if (issue.type === 'missing' || issue.operation?.type === 'fill_missing') {
      const col = issue.column || issue.operation?.column || '?';
      const typ = issue.colType || 'numeric';
      lines.push(`# Fill missing: '${col}'`);
      lines.push(typ === 'numeric'
        ? `df['${col}'] = df['${col}'].fillna(df['${col}'].median())`
        : `df['${col}'] = df['${col}'].fillna(df['${col}'].mode()[0])`);
      lines.push('');
    } else if (issue.type === 'outliers' || issue.operation?.type === 'remove_outliers') {
      const col = issue.column || issue.operation?.column || '?';
      lines.push(`# Remove outliers: '${col}'`);
      lines.push(`Q1 = df['${col}'].quantile(0.25); Q3 = df['${col}'].quantile(0.75); IQR = Q3 - Q1`);
      lines.push(`df = df[(df['${col}'] >= Q1 - 1.5*IQR) & (df['${col}'] <= Q3 + 1.5*IQR)]`);
      lines.push('');
    }
  });
  lines.push(`df.to_csv("${state.filename.replace(/\.[^.]+$/, '')}_cleaned.csv", index=False)`);
  lines.push('print(f"Cleaned shape: {df.shape}")');
  el.textContent = lines.join('\n');
}

/* ====================================================
   STEP 3 — DEEP ANALYSIS (backend pandas + scipy)
   ==================================================== */
async function renderAnalysisStep() {
  const { stats } = state;
  const numericCols = stats.filter(s => s.type === 'numeric').map(s => s.name);
  const sessionId   = getSessionId();

  if (state.backendOnline && sessionId) {
    try {
      const analysis = await fetchAnalysis(sessionId);
      state.backendAnalysis = analysis;
      renderCorrPairsFromBackend(analysis.correlation);
      renderSkewnessFromBackend(analysis.skewness_report);
      renderOutlierReportFromBackend(analysis.outlier_report);
      return;
    } catch (e) {
      console.warn('[DataLens] Backend analysis failed, using JS:', e.message);
    }
  }
  renderCorrPairsJS(numericCols);
  renderSkewnessJS(stats);
  renderOutlierReportJS(stats);
}

function renderCorrPairsFromBackend(corr) {
  const el = document.getElementById('corrPairList');
  if (!el || !corr) return;
  const pairs = corr.strong_pairs || [];
  if (!pairs.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">No strong correlations found (|r| ≥ 0.7).</p>'; return; }
  el.innerHTML = pairs.map(p => `
    <div class="corr-pair">
      <span class="corr-pair__cols">${p.col_a} × ${p.col_b}</span>
      <span class="corr-pair__val ${p.r >= 0 ? 'corr-pair__val--pos' : 'corr-pair__val--neg'}">r = ${p.r.toFixed(3)} ${Math.abs(p.r) >= 0.7 ? '🔗' : ''}</span>
    </div>`).join('');
}

function renderCorrPairsJS(numericCols) {
  const el = document.getElementById('corrPairList');
  if (!el) return;
  if (numericCols.length < 2) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">Need at least 2 numeric columns.</p>'; return; }
  const matrix = correlationMatrix(state.data, numericCols);
  const pairs  = [];
  numericCols.forEach((c1, i) => numericCols.forEach((c2, j) => {
    if (i >= j) return;
    const r = matrix[i][j];
    if (Math.abs(r) >= 0.5) pairs.push({ col_a: c1, col_b: c2, r });
  }));
  pairs.sort((a,b) => Math.abs(b.r)-Math.abs(a.r));
  if (!pairs.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">No strong correlations found (|r| ≥ 0.5).</p>'; return; }
  el.innerHTML = pairs.slice(0,10).map(p => `
    <div class="corr-pair">
      <span class="corr-pair__cols">${p.col_a} × ${p.col_b}</span>
      <span class="corr-pair__val ${p.r>=0?'corr-pair__val--pos':'corr-pair__val--neg'}">r = ${p.r.toFixed(3)}</span>
    </div>`).join('');
}

function renderSkewnessFromBackend(report) {
  const el = document.getElementById('skewnessList');
  if (!el || !report) return;
  el.innerHTML = report.map(s => `
    <div class="skew-row">
      <span class="skew-row__col">${s.column}</span>
      <span class="skew-row__label">${s.label}</span>
      <span style="font-family:var(--font-display);font-size:10px;color:var(--color-text-muted);">skew=${s.skewness}</span>
      <span class="skew-row__action">${s.action}</span>
    </div>`).join('');
}

function renderSkewnessJS(stats) {
  const el = document.getElementById('skewnessList');
  if (!el) return;
  const numeric = stats.filter(s => s.type === 'numeric');
  if (!numeric.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">No numeric columns.</p>'; return; }
  el.innerHTML = numeric.map(s => {
    const vals = state.data.map(r=>r[s.name]).filter(v=>v!==null&&!isNaN(Number(v))).map(Number);
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const std  = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    const skew = std ? vals.reduce((a,b)=>a+((b-mean)/std)**3,0)/vals.length : 0;
    const label  = Math.abs(skew)<0.5?'normal':skew>0?'right skewed':'left skewed';
    const action = Math.abs(skew)>1?'Apply log transform':Math.abs(skew)>0.5?'Apply sqrt transform':'No transform needed';
    return `<div class="skew-row">
      <span class="skew-row__col">${s.name}</span>
      <span class="skew-row__label">${label}</span>
      <span style="font-family:var(--font-display);font-size:10px;color:var(--color-text-muted);">skew=${isNaN(skew)?'—':skew.toFixed(3)}</span>
      <span class="skew-row__action">${action}</span>
    </div>`;
  }).join('');
}

function renderOutlierReportFromBackend(report) {
  const el = document.getElementById('outlierReport');
  if (!el || !report) return;
  const withOutliers = report.filter(r => r.count > 0);
  if (!withOutliers.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">No significant outliers detected.</p>'; return; }
  el.innerHTML = withOutliers.map(r => `
    <div class="skew-row">
      <span class="skew-row__col">${r.column}</span>
      <span class="clean-issue__badge clean-issue__badge--${r.pct>10?'error':'warning'}">${r.count} outliers</span>
      <span style="font-size:10px;color:var(--color-text-muted);">${r.pct}%</span>
      <span class="skew-row__action">fence: [${r.lower_fence} – ${r.upper_fence}]</span>
    </div>`).join('');
}

function renderOutlierReportJS(stats) {
  const el = document.getElementById('outlierReport');
  if (!el) return;
  const withO = stats.filter(s => s.type==='numeric' && s.outliers>0);
  if (!withO.length) { el.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--text-xs);">No significant outliers.</p>'; return; }
  el.innerHTML = withO.map(s => {
    const pct = (s.outliers/s.total*100).toFixed(1);
    return `<div class="skew-row">
      <span class="skew-row__col">${s.name}</span>
      <span class="clean-issue__badge clean-issue__badge--${parseFloat(pct)>10?'error':'warning'}">${s.outliers} outliers</span>
      <span style="font-size:10px;color:var(--color-text-muted);">${pct}%</span>
      <span class="skew-row__action">IQR: [${s.q1} – ${s.q3}]</span>
    </div>`;
  }).join('');
}

/* ====================================================
   STEP 4 — VISUALIZATIONS
   Backend: real matplotlib/seaborn PNGs
   ==================================================== */
function initVisualizations() {
  const { columns, stats, backendProfile } = state;
  const numericCols = backendProfile
    ? backendProfile.columns_profile.filter(c => c.dtype_group === 'numeric').map(c => c.name)
    : stats.filter(s => s.type === 'numeric').map(s => s.name);
  const allCols = backendProfile ? backendProfile.columns_profile.map(c => c.name) : columns;

  const selector = document.getElementById('columnSelector');
  selector.innerHTML = allCols.map(col =>
    `<button class="col-btn${col === allCols[0] ? ' active' : ''}" data-col="${col}">${col}</button>`
  ).join('');

  state.activeCol = allCols[0];
  state.scatterX  = numericCols[0] || allCols[0];
  state.scatterY  = numericCols[1] || allCols[1] || allCols[0];

  const sx = document.getElementById('scatterX');
  const sy = document.getElementById('scatterY');
  sx.innerHTML = ''; sy.innerHTML = '';
  numericCols.forEach(c => {
    sx.innerHTML += `<option value="${c}" ${c===state.scatterX?'selected':''}>${c}</option>`;
    sy.innerHTML += `<option value="${c}" ${c===state.scatterY?'selected':''}>${c}</option>`;
  });

  sx.addEventListener('change', () => { state.scatterX = sx.value; drawChart(); });
  sy.addEventListener('change', () => { state.scatterY = sy.value; drawChart(); });

  selector.addEventListener('click', (e) => {
    const btn = e.target.closest('.col-btn');
    if (!btn) return;
    selector.querySelectorAll('.col-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeCol = btn.dataset.col;
    drawChart();
  });

  document.querySelectorAll('.viz-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.viz-tab').forEach(t => {
        t.classList.remove('active'); t.classList.add('btn-ghost'); t.classList.remove('btn-secondary');
      });
      tab.classList.add('active','btn-secondary'); tab.classList.remove('btn-ghost');
      state.activeViz = tab.dataset.viz;
      const scatterCtrl = document.getElementById('scatterControls');
      const colSelector = document.getElementById('columnSelector');
      if (state.activeViz === 'scatter') { scatterCtrl.style.display='flex'; colSelector.style.display='none'; }
      else if (state.activeViz === 'heatmap') { scatterCtrl.style.display='none'; colSelector.style.display='none'; }
      else { scatterCtrl.style.display='none'; colSelector.style.display='flex'; }
      drawChart();
    });
  });

  drawChart();
}

async function drawChart() {
  const { activeViz, activeCol, scatterX, scatterY, backendProfile } = state;
  const canvas    = document.getElementById('mainChart');
  const imgEl     = document.getElementById('backendChartImg');
  const sessionId = getSessionId();

  if (state.backendOnline && sessionId) {
    if (canvas) canvas.style.display = 'none';
    imgEl.style.display = '';
    imgEl.src = '';
    imgEl.alt = 'Loading chart…';

    try {
      let b64;
      if (activeViz === 'histogram') {
        const colType = backendProfile?.columns_profile.find(c => c.name === activeCol)?.dtype_group;
        b64 = colType === 'numeric' ? await fetchHistogram(activeCol, 25, sessionId) : await fetchCategoryChart(activeCol, 15, sessionId);
      } else if (activeViz === 'category') {
        b64 = await fetchCategoryChart(activeCol, 15, sessionId);
      } else if (activeViz === 'scatter') {
        b64 = await fetchScatter(scatterX, scatterY, true, sessionId);
      } else if (activeViz === 'heatmap') {
        b64 = await fetchHeatmap(sessionId);
      }
      if (b64) { imgEl.src = `data:image/png;base64,${b64}`; return; }
    } catch (e) {
      console.warn('[DataLens] Backend chart failed, falling back to Chart.js:', e.message);
      Notification.show({ type: 'warning', title: 'Backend chart failed', description: e.message, autoDismiss: 4000 });
    }
  }

  imgEl.style.display = 'none';
  if (canvas) canvas.style.display = '';
  drawChartJS();
}

function drawChartJS() {
  const { data, stats, activeViz, activeCol, scatterX, scatterY } = state;
  const numericCols = stats.filter(s=>s.type==='numeric').map(s=>s.name);
  const colStat     = stats.find(s=>s.name===activeCol);
  const wrap = document.getElementById('chartWrap');
  if (!document.getElementById('mainChart')) {
    wrap.insertAdjacentHTML('afterbegin', '<canvas id="mainChart"></canvas>');
  }
  if      (activeViz === 'histogram') colStat?.type==='numeric' ? renderHistogram(data, activeCol) : renderCategoryChart(data, activeCol);
  else if (activeViz === 'category')  renderCategoryChart(data, activeCol);
  else if (activeViz === 'scatter')   renderScatter(data, scatterX, scatterY);
  else if (activeViz === 'heatmap')   renderHeatmap(data, numericCols);
}

/* ====================================================
   STEP 5 — ML RECOMMENDATIONS (backend, no training)
   ==================================================== */
async function renderMLRecommendations() {
  const sessionId = getSessionId();
  let mlResult;

  if (state.backendOnline && sessionId) {
    try {
      const raw = await fetchMLRecommend(null, sessionId);
      state.mlResult = {
        taskType: raw.task,
        taskDesc: raw.task_info?.reasoning || raw.task,
        targetColumn: raw.target_column || 'Unknown',
        confidence: Math.round((raw.readiness || 0) * 0.9 + 10),
        readiness: raw.readiness || 0,
        numericFeatures: raw.numeric_features?.length || 0,
        categoricalFeatures: raw.categorical_features?.length || 0,
        models: (raw.models || []).map(m => ({ name: m.name, note: m.desc, score: m.score })),
        preprocessingSteps: raw.preprocessing_steps || [],
      };
      mlResult = state.mlResult;
    } catch (e) {
      console.warn('[DataLens] Backend ML recommend failed, using JS:', e.message);
      state.mlResult = suggestML(state.stats, state.data);
      mlResult = state.mlResult;
    }
  } else {
    state.mlResult = suggestML(state.stats, state.data);
    mlResult = state.mlResult;
  }
  if (!mlResult) return;

  const meta = document.getElementById('mlMeta');
  meta.innerHTML = `
    <div class="ml-meta-item"><div class="ml-meta-item__label">Task Type</div><div class="ml-meta-item__value">${formatTaskType(mlResult.taskType)}</div></div>
    <div class="ml-meta-item"><div class="ml-meta-item__label">Target Column</div><div class="ml-meta-item__value">${mlResult.targetColumn}</div></div>
    <div class="ml-meta-item"><div class="ml-meta-item__label">ML Readiness</div><div class="ml-meta-item__value">${mlResult.readiness}%</div></div>
    <div class="ml-meta-item"><div class="ml-meta-item__label">Confidence</div><div class="ml-meta-item__value">${mlResult.confidence}%</div></div>`;

  const grid = document.getElementById('mlGrid');
  grid.innerHTML = mlResult.models.map(m => `
    <div class="ml-model-card">
      <div class="ml-model-card__name">${m.name}</div>
      <div class="ml-model-card__desc">${m.note || m.desc || ''}</div>
      <div class="ml-score-bar"><div class="ml-score-fill" style="width:${m.score}%;"></div></div>
      <div style="font-size:10px;color:var(--color-text-muted);margin-top:6px;font-family:var(--font-display);font-weight:700;">Score: ${m.score}/100</div>
    </div>`).join('');

  renderBestModel();
}

function renderBestModel() {
  const ml = state.mlResult;
  if (!ml) return;
  const best = ml.models[0];
  const numericCols = state.backendProfile
    ? state.backendProfile.columns_profile.filter(c=>c.dtype_group==='numeric'&&c.name!==ml.targetColumn).map(c=>c.name)
    : state.stats.filter(s=>s.type==='numeric'&&s.name!==ml.targetColumn).map(s=>s.name);
  const el     = document.getElementById('bestModelContent');
  const codeEl = document.getElementById('mlCodePre');

  const preprocessHTML = ml.preprocessingSteps?.length
    ? `<div class="ml-reason-list" style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--color-border-light);">
        ${ml.preprocessingSteps.map(s => `<div class="ml-reason"><strong>${s.step}:</strong>&nbsp;${s.detail}</div>`).join('')}
      </div>` : '';

  el.innerHTML = `
    <div class="ml-rec-card">
      <div class="ml-rec-card__header">
        <div>
          <h3 style="font-size:1.2rem;margin-bottom:6px;">${best.name}</h3>
          <p style="font-size:var(--text-sm);color:var(--color-text-muted);">${best.note || best.desc || ''}</p>
        </div>
        <div class="ml-rec-card__best">⭐ Best Match — Score: ${best.score}/100</div>
      </div>
      <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-bottom:var(--space-4);">
        Task: <strong>${formatTaskType(ml.taskType)}</strong> &nbsp;|&nbsp;
        Target: <strong>${ml.targetColumn}</strong> &nbsp;|&nbsp;
        Features: <strong>${ml.numericFeatures} numeric, ${ml.categoricalFeatures} categorical</strong>
      </p>
      <div class="ml-reason-list">
        <div class="ml-reason">${ml.taskDesc}</div>
        <div class="ml-reason">${(state.backendProfile?.rows ?? state.data.length)} rows — ${(state.backendProfile?.rows ?? state.data.length)>1000?'sufficient for reliable training':'small dataset; consider cross-validation'}</div>
        <div class="ml-reason">${ml.readiness>=80?'Good data quality — minimal preprocessing needed':'Run cleaning in Step 2 before training'}</div>
        <div class="ml-reason">We recommend training this model — not done here to keep results unbiased. Use the Python code below.</div>
      </div>
      ${preprocessHTML}
    </div>`;

  if (codeEl) codeEl.textContent = generateMLCode(ml, numericCols);
}

function generateMLCode(ml, numericCols) {
  const cols   = JSON.stringify(numericCols.slice(0, 8));
  const target = ml.targetColumn;
  const prefix = `import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
import numpy as np

df = pd.read_csv("${state.filename.replace(/\.[^.]+$/, '')}_cleaned.csv")

X = df[${cols}]
y = df['${target}']

imp = SimpleImputer(strategy='median')
X = pd.DataFrame(imp.fit_transform(X), columns=X.columns)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
`;
  const taskSnippets = {
    regression: `from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_squared_error

model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

print(f"R²   = {r2_score(y_test, y_pred):.4f}")
print(f"RMSE = {np.sqrt(mean_squared_error(y_test, y_pred)):.4f}")

cv = cross_val_score(model, X, y, cv=5, scoring='r2')
print(f"CV R² = {cv.mean():.4f} ± {cv.std():.4f}")

fi = pd.Series(model.feature_importances_, index=X.columns)
print("\\nTop features:\\n", fi.sort_values(ascending=False).head(5))`,
    binary_classification: `from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, classification_report

model = GradientBoostingClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

print(f"Accuracy = {accuracy_score(y_test, y_pred):.4f}")
print(classification_report(y_test, y_pred))

cv = cross_val_score(model, X, y, cv=5, scoring='accuracy')
print(f"CV Accuracy = {cv.mean():.4f} ± {cv.std():.4f}")`,
    multiclass_classification: `from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

print(f"Accuracy = {accuracy_score(y_test, y_pred):.4f}")
print(classification_report(y_test, y_pred))`,
    clustering: `from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

inertias = []
for k in range(2, 9):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_scaled)
    inertias.append(km.inertia_)

print("k → inertia:", dict(zip(range(2,9), [round(i,1) for i in inertias])))

km = KMeans(n_clusters=3, random_state=42, n_init=10)
df['cluster'] = km.fit_predict(X_scaled)
print(df['cluster'].value_counts())`,
  };
  return prefix + '\n' + (taskSnippets[ml.taskType] || taskSnippets.regression);
}

function formatTaskType(t) {
  return { regression:'Regression', binary_classification:'Binary Classification',
           multiclass_classification:'Multi-class Classification', clustering:'Clustering' }[t] || t;
}

/* ====================================================
   ASK DATASET
   ==================================================== */
function initAskDataset() {
  const chatInput  = document.getElementById('chatInput');
  const btnAsk     = document.getElementById('btnAsk');
  const btnClear   = document.getElementById('btnClearChat');
  const chatThread = document.getElementById('chatThread');

  btnAsk?.addEventListener('click', sendChat);
  chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  btnClear?.addEventListener('click', () => {
    chatThread.innerHTML = `
      <div class="chat-msg chat-msg--ai">
        <div class="chat-msg__avatar">🤖</div>
        <div class="chat-msg__bubble">Cleared! Ask me anything about your dataset.</div>
      </div>`;
    state.chatHistory = [];
  });

  async function sendChat() {
    const question = chatInput?.value.trim();
    if (!question) return;
    chatInput.value = '';
    appendMsg(chatThread, 'user', question);
    const aiRow  = appendMsg(chatThread, 'ai', '…');
    const bubble = aiRow.querySelector('.chat-msg__bubble');
    state.chatHistory.push({ role: 'user', content: question });

    try {
      let full = '';
      const sessionId = getSessionId();
      if (state.backendOnline && sessionId) {
        await streamAsk(question, state.chatHistory.slice(-8), sessionId, (chunk, acc) => {
          full = acc; bubble.textContent = acc;
          chatThread.scrollTop = chatThread.scrollHeight;
        });
      } else {
        showApiSection();
        const apiKey = localStorage.getItem('groqApiKey') || document.getElementById('apiKeyInput')?.value?.trim();
        if (!apiKey) throw new Error('No Groq API key set. Add your key above, or start the backend for server-side AI.');
        await askDataset(question, buildMeta(), state.chatHistory.slice(-8), (chunk, acc) => {
          full = acc; bubble.textContent = acc;
          chatThread.scrollTop = chatThread.scrollHeight;
        });
      }
      state.chatHistory.push({ role: 'assistant', content: full });
    } catch (e) {
      bubble.innerHTML = `<span style="color:#EF4444;">Error: ${escHtml(e.message)}</span>`;
    }
    chatThread.scrollTop = chatThread.scrollHeight;
  }
}

function appendMsg(thread, role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg--${role}`;
  div.innerHTML = `
    <div class="chat-msg__avatar">${role==='user'?'👤':'🤖'}</div>
    <div class="chat-msg__bubble">${escHtml(text)}</div>`;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return div;
}

/* ====================================================
   STEP 6 — REPORT
   ==================================================== */
function renderReport() {
  const { filename, stats, mlResult, summary, cleaningLog, backendProfile } = state;
  const rowCount = backendProfile?.rows ?? state.data.length;
  const missing  = backendProfile?.total_missing ?? stats.reduce((s,c)=>s+c.missing,0);
  const qs       = backendProfile?.quality_score ?? qualityScore(stats);

  const setEl = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  setEl('reportDataset',  `${filename} — ${rowCount.toLocaleString()} rows × ${columnCount()} columns${backendProfile?` | ${backendProfile.memory_human}`:''}`);
  setEl('reportQuality',  `Quality score: ${qs}% | Missing: ${missing} | Duplicates: ${backendProfile?.duplicates??'—'} | Numeric: ${backendProfile?.numeric_count??stats.filter(s=>s.type==='numeric').length} | Categorical: ${backendProfile?.categorical_count??stats.filter(s=>s.type==='categorical').length}`);
  setEl('reportCleaning', cleaningLog.length ? cleaningLog.join('\n') : 'No cleaning applied.');
  setEl('reportFindings', `Analysed ${backendProfile?.numeric_count??stats.filter(s=>s.type==='numeric').length} numeric and ${backendProfile?.categorical_count??stats.filter(s=>s.type==='categorical').length} categorical columns. ${missing>0?`Found ${missing} missing values.`:'No missing values.'}`);
  setEl('reportML',       mlResult ? `Recommended: ${mlResult.models[0]?.name} for ${formatTaskType(mlResult.taskType)} (readiness: ${mlResult.readiness}%, confidence: ${mlResult.confidence}%)` : 'Visit Step 5 to generate ML recommendations.');
  setEl('reportSummary',  summary || 'Generate the AI summary in Step 1 to include it here.');
}

/* ====================================================
   EXPORT PANEL
   ==================================================== */
function initExportPanel() {
  document.getElementById('exportPDF')?.addEventListener('click', () =>
    exportPDF(state.filename, state.summary, state.stats, state.insights, state.mlResult));
  document.getElementById('exportJSON')?.addEventListener('click', () =>
    exportJSON(state.stats, state.insights, state.mlResult, state.filename));
  document.getElementById('exportCSV')?.addEventListener('click', () =>
    exportStatsCSV(state.stats, state.filename));
  document.getElementById('exportMarkdown')?.addEventListener('click', () =>
    exportMarkdown(state.summary, state.insights, state.mlResult, state.filename));
}

/* ====================================================
   HELPERS
   ==================================================== */
function buildMeta() {
  return { filename: state.filename, rowCount: state.data.length, colCount: state.columns.length,
           columns: state.columns, sampleStats: state.stats };
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
