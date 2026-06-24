/* ============================================
   GROQ.JS — Groq API: summary, insights, ask
   ============================================ */

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.1-8b-instant';

function getApiKey() {
  return localStorage.getItem('groqApiKey') || '';
}

async function groqChat(messages, streaming = false, onChunk = null) {
  const key = getApiKey();
  if (!key) throw new Error('No Groq API key set. Please add your key above.');

  const body = {
    model: MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 1024,
    stream: streaming,
  };

  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error: ${res.status}`);
  }

  if (!streaming) {
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // Streaming
  const reader = res.body.getReader();
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
          if (chunk) {
            full += chunk;
            onChunk?.(chunk, full);
          }
        } catch {}
      }
    }
  }
  return full;
}

/* ---- Build a compact dataset context string ---- */
function buildContext(datasetMeta) {
  const { filename, rowCount, colCount, columns, sampleStats } = datasetMeta;
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

/* ---- Executive Summary (streaming) ---- */
export async function generateSummary(datasetMeta, onChunk) {
  const ctx = buildContext(datasetMeta);
  const messages = [
    {
      role: 'system',
      content: `You are a senior data analyst. Write clear, concise, executive-level summaries. 
Use plain English. Structure: 1) What the dataset is about, 2) Key patterns, 3) Data quality notes, 4) One actionable recommendation.
Keep it under 250 words. Use bullet points sparingly — prefer prose.`,
    },
    {
      role: 'user',
      content: `Here is a dataset summary. Write an executive overview:\n\n${ctx}`,
    },
  ];
  return groqChat(messages, true, onChunk);
}

/* ---- AI Insights (returns structured JSON) ---- */
export async function generateInsights(datasetMeta) {
  const ctx = buildContext(datasetMeta);
  const messages = [
    {
      role: 'system',
      content: `You are a data science expert. Return ONLY a JSON array (no markdown, no explanation) of exactly 4 insight objects.
Each object: { "type": string, "title": string, "body": string }
Types must be one of: "correlation", "quality", "trend", "ml_readiness"
Keep each body under 60 words.`,
    },
    {
      role: 'user',
      content: `Generate 4 insights for this dataset:\n\n${ctx}`,
    },
  ];
  const raw = await groqChat(messages, false);
  try {
    // Strip possible markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: return a single error insight
    return [{ type: 'quality', title: 'Insight generation failed', body: raw.slice(0, 200) }];
  }
}

/* ---- Ask Dataset ---- */
export async function askDataset(question, datasetMeta, chatHistory = [], onChunk) {
  const ctx = buildContext(datasetMeta);
  const systemMsg = {
    role: 'system',
    content: `You are a helpful data analyst assistant. Answer questions about the dataset below.
Be concise, accurate, and data-driven. If the answer requires calculations you can't do, say so clearly.
Dataset context:\n${ctx}`,
  };

  const messages = [
    systemMsg,
    ...chatHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  return groqChat(messages, true, onChunk);
}