/* ============================================
   DASHBOARD.JS — Main orchestrator
   ============================================ */
import { initUpload }                            from './upload.js';
import { loadSample }                            from './csvParser.js';
import { computeDatasetStats, qualityScore, inferType } from './stats.js';
import { generateSummary, generateInsights, askDataset } from './groq.js';
import { renderHistogram, renderCategoryChart, renderScatter, renderHeatmap } from './charts.js';
import { suggestML }                             from './mlSuggestions.js';
import { exportPDF, exportJSON, exportStatsCSV, exportMarkdown } from './export.js';
import { showToast, initScrollReveal }           from './main.js';

/* ---- State ---- */
let state = {
  data: [],
  columns: [],
  filename: '',
  stats: [],
  mlResult: null,
  summary: '',
  insights: [],
  chatHistory: [],
  activeViz: 'histogram',
  activeCol: null,
  scatterX: null,
  scatterY: null,
};

/* ====================================================
   BOOT
   ==================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  initApiKey();
  initUpload({ onFile: handleDataLoaded, onError: console.error });
  initSampleButtons();
  initNavActions();

  // Check if we should auto-load a sample (from landing page)
  const sample = sessionStorage.getItem('loadSample');
  if (sample) {
    sessionStorage.removeItem('loadSample');
    try {
      const result = loadSample(sample);
      await handleDataLoaded(result);
    } catch (e) { showToast(e.message, 'error'); }
  }
});

/* ====================================================
   API KEY
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
    if (!val) { showToast('Enter a key first', 'error'); return; }
    localStorage.setItem('groqApiKey', val);
    keyStatus.textContent = '✓ Key saved';
    keyStatus.style.color = '#10B981';
    showToast('API key saved', 'success');
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem('groqApiKey');
    input.value = '';
    keyStatus.textContent = '';
    showToast('API key cleared', 'info');
  });

  // Save on Enter
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn?.click(); });
}
function showApiSection() {
  const apiSection = document.getElementById("apiKeySection");

  if (apiSection.style.display === "none") {
    apiSection.style.display = "block";

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
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
      } catch (e) { showToast(e.message, 'error'); }
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
    document.getElementById('sectionExport')?.scrollIntoView({
      behavior: 'smooth'
    });
  });
}

function resetDashboard() {
  state = { data: [], columns: [], filename: '', stats: [], mlResult: null,
             summary: '', insights: [], chatHistory: [], activeViz: 'histogram',
             activeCol: null, scatterX: null, scatterY: null };
  document.getElementById('uploadView').style.display = '';
  document.getElementById('analysisView').style.display = 'none';
  document.getElementById('btnReset').style.display = 'none';
  document.getElementById('btnExportNav').style.display = 'none';
  document.getElementById('fileNameBadge').style.display = 'none';
  showToast('Cleared. Upload a new file.', 'info');
}

/* ====================================================
   MAIN DATA HANDLER
   ==================================================== */
async function handleDataLoaded({ data, columns, filename }) {
  state.data = data;
  state.columns = columns;
  state.filename = filename;

  // Switch views
  document.getElementById('uploadView').style.display = 'none';
  document.getElementById('analysisView').style.display = '';
  document.getElementById('btnReset').style.display = '';
  document.getElementById('btnExportNav').style.display = '';

  const badge = document.getElementById('fileNameBadge');
  badge.textContent = filename;
  badge.style.display = '';

  // Compute stats
  state.stats = computeDatasetStats(data, columns);
  state.mlResult = suggestML(state.stats, data);

  // Render all sections
  renderOverview();
  renderStatsTable();
  renderMLRecommendations();
  initVisualizations();
  initAskDataset();
  initExportPanel();

  // Wire generate buttons
  document.getElementById('btnGenerateSummary')?.addEventListener('click', runSummary);
  document.getElementById('btnGenerateInsights')?.addEventListener('click', runInsights);

  // Scroll to top of analysis
  document.getElementById('analysisView')?.scrollIntoView({ behavior: 'smooth' });
  initScrollReveal();
  setTimeout(() => lucide.createIcons(), 100);
}

/* ====================================================
   OVERVIEW
   ==================================================== */
function renderOverview() {
  const { data, columns, filename, stats } = state;
  document.getElementById('overviewFilename').textContent = filename;

  const missing = stats.reduce((s, c) => s + c.missing, 0);
  const qs      = qualityScore(stats);

  const cards = [
    { icon: 'rows',    label: 'Total Rows',    value: data.length.toLocaleString() },
    { icon: 'columns', label: 'Columns',        value: columns.length },
    { icon: 'alert-circle', label: 'Missing Values', value: missing.toLocaleString() },
    { icon: 'bar-chart',    label: 'Numeric Cols',   value: stats.filter(s => s.type === 'numeric').length },
  ];

  const container = document.getElementById('overviewCards');
  container.innerHTML = cards.map(c => `
  <div class="overview-stat">
    <div class="overview-stat__icon"><i data-lucide="${c.icon}"></i></div>
    <div class="overview-stat__info">
      <div class="overview-stat__value">${c.value}</div>
      <div class="overview-stat__label">${c.label}</div>
    </div>
  </div>`).join('');

  // Quality bar
  document.getElementById('qualityScore').textContent = `${qs}%`;
  document.getElementById('qualityFill').style.width  = `${qs}%`;
  document.getElementById('qualityFill').style.background =
    qs >= 80 ? '#10B981' : qs >= 55 ? '#F59E0B' : '#EF4444';
  document.getElementById('qualityDesc').textContent =
    qs >= 80 ? 'Good quality — ready for analysis.' :
    qs >= 55 ? 'Moderate quality — some missing values detected.' :
               'Low quality — significant missing data. Consider cleaning first.';

  setTimeout(() => lucide.createIcons(), 50);
}

/* ====================================================
   STATS TABLE
   ==================================================== */
function renderStatsTable() {
  const { stats } = state;
  document.getElementById('statsColCount').textContent = `${stats.length} columns`;

  const tbody = document.getElementById('statsTableBody');
  tbody.innerHTML = stats.map(s => `
    <tr>
      <td class="col-name">${s.name}</td>
      <td><span class="badge ${s.type === 'numeric' ? 'badge-success' : 'badge-outline'}" style="font-size:9px;">${s.type}</span></td>
      <td>${s.total}</td>
      <td>${s.missing > 0 ? `<span style="color:#EF4444;font-weight:700;">${s.missing}</span>` : '0'}</td>
      <td>${s.mean}</td>
      <td>${s.median}</td>
      <td>${s.stdDev}</td>
      <td>${s.min}</td>
      <td>${s.max}</td>
      <td>${s.q1}</td>
      <td>${s.q3}</td>
    </tr>`).join('');
}

/* ====================================================
   AI SUMMARY
   ==================================================== */
async function runSummary() {
  showApiSection();

  const apiKey =
    localStorage.getItem("groq_api_key") ||
    document.getElementById("apiKeyInput")?.value?.trim();

  if (!apiKey) {
    showToast("Please add your Groq API key first", "error");
    return;
  }
  const btn = document.getElementById('btnGenerateSummary');
  const content = document.getElementById('summaryContent');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Generating…';
  lucide.createIcons();

  content.innerHTML = '<div class="ai-loading"><i data-lucide="loader" class="anim-spin" style="width:16px;height:16px;"></i> Writing summary…</div>';
  lucide.createIcons();

  const meta = buildMeta();
  let full = '';
  try {
    await generateSummary(meta, (chunk, accumulated) => {
      full = accumulated;
      content.innerHTML = `<p class="ai-summary-text cursor-blink">${escHtml(accumulated)}</p>`;
    });
    state.summary = full;
    content.innerHTML = `<p class="ai-summary-text">${escHtml(full)}</p>`;
    showToast('Summary ready', 'success');
  } catch (e) {
    content.innerHTML = `<p style="color:#EF4444;font-size:13px;">Error: ${escHtml(e.message)}</p>`;
    showToast(e.message, 'error');
  }
  summaryContent.classList.remove("empty-state");
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="sparkles" style="width:14px;height:14px;"></i> Regenerate';
  lucide.createIcons();
}

/* ====================================================
   AI INSIGHTS
   ==================================================== */
async function runInsights() {
  showApiSection();

  const apiKey =
    localStorage.getItem("groq_api_key") ||
    document.getElementById("apiKeyInput")?.value?.trim();

  if (!apiKey) {
    showToast("Please add your Groq API key first", "error");
    return;
  }
  const btn  = document.getElementById('btnGenerateInsights');
  const grid = document.getElementById('insightsGrid');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;"></i> Thinking…';
  lucide.createIcons();

  grid.innerHTML = `<div class="ai-loading" style="grid-column:1/-1;"><i data-lucide="loader" class="anim-spin" style="width:16px;height:16px;"></i> Generating insights…</div>`;
  lucide.createIcons();

  const typeIcons = { correlation: '🔗', quality: '🛡️', trend: '📈', ml_readiness: '🤖' };
  const meta = buildMeta();
  try {
    const insights = await generateInsights(meta);
    state.insights = insights;
    grid.innerHTML = insights.map(ins => `
      <div class="insight-card fade-up visible">
        <div class="insight-card__type">${typeIcons[ins.type] || '✦'} ${ins.type.replace('_', ' ')}</div>
        <h4 class="insight-card__title">${escHtml(ins.title)}</h4>
        <p class="insight-card__body">${escHtml(ins.body)}</p>
      </div>`).join('');
    showToast('Insights ready', 'success');
  } catch (e) {
    grid.innerHTML = `<p style="color:#EF4444;grid-column:1/-1;font-size:13px;">Error: ${escHtml(e.message)}</p>`;
    showToast(e.message, 'error');
  }
  insightsGrid.classList.remove("empty-state");
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="zap" style="width:14px;height:14px;"></i> Regenerate';
  lucide.createIcons();
}

/* ====================================================
   VISUALIZATIONS
   ==================================================== */
function initVisualizations() {
  const { data, columns, stats } = state;
  const numericCols = stats.filter(s => s.type === 'numeric').map(s => s.name);

  // Column selector
  const selector = document.getElementById('columnSelector');
  selector.innerHTML = columns.map(col =>
    `<button class="col-btn${col === columns[0] ? ' active' : ''}" data-col="${col}">${col}</button>`
  ).join('');

  state.activeCol = columns[0];
  state.scatterX  = numericCols[0] || columns[0];
  state.scatterY  = numericCols[1] || columns[1] || columns[0];

  // Populate scatter selects
  const sx = document.getElementById('scatterX');
  const sy = document.getElementById('scatterY');
  numericCols.forEach(c => {
    sx.innerHTML += `<option value="${c}" ${c === state.scatterX ? 'selected' : ''}>${c}</option>`;
    sy.innerHTML += `<option value="${c}" ${c === state.scatterY ? 'selected' : ''}>${c}</option>`;
  });

  sx.addEventListener('change', () => { state.scatterX = sx.value; drawChart(); });
  sy.addEventListener('change', () => { state.scatterY = sy.value; drawChart(); });

  // Column btn clicks
  selector.addEventListener('click', (e) => {
    const btn = e.target.closest('.col-btn');
    if (!btn) return;
    selector.querySelectorAll('.col-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeCol = btn.dataset.col;
    drawChart();
  });

  // Viz tab clicks
  document.querySelectorAll('.viz-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.viz-tab').forEach(t => {
        t.classList.remove('active');
        t.classList.add('btn-ghost');
        t.classList.remove('btn-secondary');
      });
      tab.classList.add('active', 'btn-secondary');
      tab.classList.remove('btn-ghost');
      state.activeViz = tab.dataset.viz;

      // Show/hide scatter controls
      const scatterCtrl = document.getElementById('scatterControls');
      const colSelector  = document.getElementById('columnSelector');
      if (state.activeViz === 'scatter') {
        scatterCtrl.style.display = 'flex';
        colSelector.style.display = 'none';
      } else if (state.activeViz === 'heatmap') {
        scatterCtrl.style.display = 'none';
        colSelector.style.display = 'none';
      } else {
        scatterCtrl.style.display = 'none';
        colSelector.style.display = 'flex';
      }
      drawChart();
    });
  });

  drawChart();
}

function drawChart() {
  const { data, stats, activeViz, activeCol, scatterX, scatterY } = state;
  const numericCols = stats.filter(s => s.type === 'numeric').map(s => s.name);
  const colStat     = stats.find(s => s.name === activeCol);

  // Re-init canvas to avoid Chart.js size bugs
  const wrap = document.getElementById('chartWrap');
  wrap.innerHTML = '<canvas id="mainChart"></canvas>';

  if (activeViz === 'histogram') {
    if (colStat?.type === 'numeric') {
      renderHistogram(data, activeCol);
    } else {
      renderCategoryChart(data, activeCol);
    }
  } else if (activeViz === 'category') {
    renderCategoryChart(data, activeCol);
  } else if (activeViz === 'scatter') {
    renderScatter(data, scatterX, scatterY);
  } else if (activeViz === 'heatmap') {
    renderHeatmap(data, numericCols);
  }
}

/* ====================================================
   ML RECOMMENDATIONS
   ==================================================== */
function renderMLRecommendations() {
  const { mlResult } = state;
  if (!mlResult) return;

  const meta = document.getElementById('mlMeta');
  meta.innerHTML = `
  <div class="ml-meta-item">
    <div class="ml-meta-item__label">Task Type</div>
    <div class="ml-meta-item__value">${formatTaskType(mlResult.taskType)}</div>
  </div>
  <div class="ml-meta-item">
    <div class="ml-meta-item__label">Target Column</div>
    <div class="ml-meta-item__value">${mlResult.targetColumn}</div>
  </div>
  <div class="ml-meta-item">
    <div class="ml-meta-item__label">ML Readiness</div>
    <div class="ml-meta-item__value">${mlResult.readiness}%</div>
  </div>
  <div class="ml-meta-item">
    <div class="ml-meta-item__label">Confidence</div>
    <div class="ml-meta-item__value">${mlResult.confidence}%</div>
  </div>`;

  const grid = document.getElementById('mlGrid');
  grid.innerHTML = mlResult.models.map(m => `
    <div class="ml-model-card">
      <div class="ml-model-card__name">${m.name}</div>
      <div class="ml-model-card__desc">${m.note}</div>
      <div class="ml-score-bar">
        <div class="ml-score-fill" style="width:${m.score}%"></div>
      </div>
      <div style="font-size:10px;color:var(--color-text-muted);margin-top:6px;font-family:var(--font-display);font-weight:700;">
        Score: ${m.score}/100
      </div>
    </div>`).join('');
}

function formatTaskType(t) {
  return { regression: 'Regression', binary_classification: 'Binary Classification',
           multiclass_classification: 'Multi-class', clustering: 'Clustering' }[t] || t;
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

    // User bubble
    appendMsg(chatThread, 'user', question);

    // AI bubble (streaming)
    const aiRow = appendMsg(chatThread, 'ai', '…');
    const bubble = aiRow.querySelector('.chat-msg__bubble');

    state.chatHistory.push({ role: 'user', content: question });

    try {
      let full = '';
      await askDataset(question, buildMeta(), state.chatHistory.slice(-8), (chunk, acc) => {
        full = acc;
        bubble.textContent = acc;
        chatThread.scrollTop = chatThread.scrollHeight;
      });
      state.chatHistory.push({ role: 'assistant', content: full });
    } catch (e) {
      bubble.innerHTML = `<span style="color:#EF4444;">Error: ${escHtml(e.message)}</span>`;
    }
    chatThread.scrollTop = chatThread.scrollHeight;
    lucide.createIcons();
  }
}

function appendMsg(thread, role, text) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg--${role}`;
  div.innerHTML = `
    <div class="chat-msg__avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="chat-msg__bubble">${escHtml(text)}</div>`;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return div;
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
  return {
    filename:    state.filename,
    rowCount:    state.data.length,
    colCount:    state.columns.length,
    columns:     state.columns,
    sampleStats: state.stats,
  };
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}