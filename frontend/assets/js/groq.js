/* ============================================
   GROQ.JS — Client-side Groq API fallback
   Used when backend is offline
   ============================================ */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.1-8b-instant';

function getApiKey() {
  return localStorage.getItem('groqApiKey') || '';
}

async function groqChat(messages, streaming = false, onChunk = null) {
  const key = getApiKey();
  if (!key) throw new Error('No Groq API key set. Please add your key above.');

  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.4, max_tokens: 1024, stream: streaming }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error: ${res.status}`);
  }

  if (!streaming) {
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const json  = JSON.parse(trimmed.slice(6));
          const chunk = json.choices?.[0]?.delta?.content ?? '';
          if (chunk) { full += chunk; onChunk?.(chunk, full); }
        } catch {}
      }
    }
  }
  return full;
}

function buildContext(datasetMeta) {
  const { filename, rowCount, colCount, sampleStats } = datasetMeta;
  let ctx = `Dataset: "${filename}" — ${rowCount} rows, ${colCount} columns.\n\nColumns:\n`;
  sampleStats.forEach(s => {
    ctx += `• ${s.name} (${s.type}): `;
    if (s.type === 'numeric') {
      ctx += `mean=${s.mean}, median=${s.median}, min=${s.min}, max=${s.max}, missing=${s.missing}`;
    } else {
      ctx += `unique=${s.unique}, missing=${s.missing}`;
    }
    ctx += '\n';
  });
  return ctx;
}

export async function generateSummary(datasetMeta, onChunk) {
  const ctx = buildContext(datasetMeta);
  return groqChat([
    { role: 'system', content: `You are a senior data analyst. Write clear, concise executive summaries.\nStructure: 1) What the dataset is about, 2) Key patterns, 3) Data quality notes, 4) One actionable recommendation.\nKeep it under 250 words. Prefer prose over bullet points.` },
    { role: 'user',   content: `Write an executive summary for this dataset:\n\n${ctx}` },
  ], true, onChunk);
}

export async function generateInsights(datasetMeta) {
  const ctx = buildContext(datasetMeta);
  const raw = await groqChat([
    { role: 'system', content: `You are a data science expert. Return ONLY a JSON array of exactly 4 insight objects. No markdown, no explanation.\nEach object: { "type": string, "title": string, "body": string }\nTypes: "correlation", "quality", "trend", "ml_readiness"\nKeep each body under 60 words.` },
    { role: 'user',   content: `Generate 4 insights for:\n\n${ctx}` },
  ], false);
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return [{ type: 'quality', title: 'Insight generation failed', body: raw.slice(0, 200) }];
  }
}

export async function askDataset(question, datasetMeta, chatHistory = [], onChunk) {
  const ctx = buildContext(datasetMeta);
  return groqChat([
    { role: 'system', content: `You are a helpful data analyst assistant. Answer questions about the dataset below. Be concise and data-driven.\nDataset context:\n${ctx}` },
    ...chatHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ], true, onChunk);
}