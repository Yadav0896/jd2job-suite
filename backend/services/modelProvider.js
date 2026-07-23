const { streamLlamaFast } = require('./llamaFastProvider');
const fetch = require('node-fetch');

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const GROQ_CHAT_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const NVIDIA_CHAT_URL   = 'https://integrate.api.nvidia.com/v1/chat/completions';

const PROVIDER_TIMEOUT_MS = 2000; // Fail fast — 2s per provider, fall through immediately

function fetchWithTimeout(url, options, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Routes the chat request to the fastest available provider.
 * Fails FAST (2s per provider) and falls through immediately to the next.
 * Chain: Groq 8B → NVIDIA 8B → DeepSeek Chat
 */
async function handleChatRoute(req) {
  const { provider, model, selectedModel, ...llmBody } = req.body;

  // ── Fast mode: ultra-fast Llama 8B on Groq/NVIDIA ─────────────────────
  if (selectedModel === 'llama_fast') {
    try {
      console.log('[ModelProvider] ▶ llama_fast: trying Groq 8B...');
      const upstreamRes = await streamLlamaFast(llmBody);
      console.log('[ModelProvider] ✓ llama_fast connected');
      return upstreamRes;
    } catch (error) {
      console.warn('[ModelProvider] ⚠ llama_fast failed — falling through to next provider:', error.message.substring(0, 100));
    }
    // Don't return — fall through to the chain below
  }

  const groqKey = process.env.GROQ_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  // ── Explicit DeepSeek route ──────────────────────────────────────────
  if (provider === 'deepseek' && deepseekKey) {
    console.log('[ModelProvider] ▶ DeepSeek (explicit route)...');
    try {
      const dsModel = model === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
      const dsRes = await fetchWithTimeout(DEEPSEEK_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({ ...llmBody, model: dsModel }),
      });
      if (dsRes.ok) { console.log('[ModelProvider] ✓ DeepSeek connected'); return dsRes; }
      console.warn(`[ModelProvider] ⚠ DeepSeek explicit failed (${dsRes.status}) — falling through`);
    } catch (err) {
      console.warn('[ModelProvider] ⚠ DeepSeek explicit error — falling through:', err.message.substring(0, 100));
    }
  }

  // ── Chain 1: Groq (fastest) ──────────────────────────────────────────
  if (groqKey) {
    try {
      let groqModel = 'llama-3.1-8b-instant';
      if (model && !model.includes('8b')) groqModel = 'llama-3.3-70b-versatile';
      console.log(`[ModelProvider] ▶ Groq (${groqModel})...`);
      const groqRes = await fetchWithTimeout(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({ ...llmBody, model: groqModel }),
      });
      if (groqRes.ok) { console.log('[ModelProvider] ✓ Groq connected'); return groqRes; }
      console.warn(`[ModelProvider] ⚠ Groq failed (${groqRes.status}) — falling through`);
    } catch (err) {
      console.warn('[ModelProvider] ⚠ Groq error — falling through:', err.message.substring(0, 100));
    }
  }

  // ── Chain 2: NVIDIA NIM ──────────────────────────────────────────────
  if (nvidiaKey) {
    try {
      console.log('[ModelProvider] ▶ NVIDIA NIM...');
      const nvidiaRes = await fetchWithTimeout(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({ ...llmBody, model: model || 'meta/llama-3.1-8b-instruct' }),
      });
      if (nvidiaRes.ok) { console.log('[ModelProvider] ✓ NVIDIA connected'); return nvidiaRes; }
      console.warn(`[ModelProvider] ⚠ NVIDIA failed (${nvidiaRes.status}) — falling through`);
    } catch (err) {
      console.warn('[ModelProvider] ⚠ NVIDIA error — falling through:', err.message.substring(0, 100));
    }
  }

  // ── Chain 3: DeepSeek (guaranteed last resort) ───────────────────────
  if (deepseekKey) {
    try {
      console.log('[ModelProvider] ▶ DeepSeek Chat (final fallback)...');
      const dsRes = await fetchWithTimeout(DEEPSEEK_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({ ...llmBody, model: 'deepseek-chat' }),
      }, 3000); // DeepSeek gets 3s (slightly more for cold start)
      if (dsRes.ok) { console.log('[ModelProvider] ✓ DeepSeek connected'); return dsRes; }
      const errText = await dsRes.text().catch(() => dsRes.statusText);
      console.error(`[ModelProvider] ✗ DeepSeek failed (${dsRes.status}): ${errText}`);
      throw new Error(`DeepSeek API error (${dsRes.status}): ${errText}`);
    } catch (err) {
      console.error('[ModelProvider] ✗ DeepSeek error:', err.message.substring(0, 200));
      throw new Error(`All providers failed. DeepSeek error: ${err.message}`);
    }
  }

  throw new Error('No LLM provider configured. Set at least one API key: GROQ_API_KEY, NVIDIA_API_KEY, or DEEPSEEK_API_KEY');
}

module.exports = {
  handleChatRoute
};
