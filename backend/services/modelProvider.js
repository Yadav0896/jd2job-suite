const { streamLlamaFast } = require('./llamaFastProvider');
const fetch = require('node-fetch');

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const GROQ_CHAT_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const NVIDIA_CHAT_URL   = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Routes the chat request to the correct provider.
 * Respects the user's selected provider and model, and provides smart fallbacks.
 */
async function handleChatRoute(req) {
  const { provider, model, selectedModel, ...llmBody } = req.body;

  // ── Fast mode: use llama_fast provider (Groq 8B) ─────────────────────────
  if (selectedModel === 'llama_fast') {
    try {
      console.log('[ModelProvider] Attempting llama_fast route (Groq 8B)');
      const upstreamRes = await streamLlamaFast(llmBody);
      return upstreamRes;
    } catch (error) {
      console.error('[ModelProvider] Fast model route failed, falling back:', error.message);
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  // ── Route directly if provider is specified ──────────────────────────────
  if (provider === 'deepseek' && deepseekKey) {
    console.log('[ModelProvider] Routing directly to DeepSeek');
    const dsModel = model === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
    const dsBody = { ...llmBody, model: dsModel };
    const dsRes = await fetch(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify(dsBody),
    });
    if (dsRes.ok) return dsRes;
    console.error(`[ModelProvider] DeepSeek direct route failed: ${dsRes.status}`);
  }

  // If user selected Nvidia but Nvidia key is invalid/unauthorized (like the expired nvapi key),
  // we redirect it to Groq to keep it ultra-fast (~0.2s) and working.
  if ((provider === 'nvidia' || !provider) && groqKey) {
    try {
      // Map Nvidia models to Groq equivalents
      let groqModel = 'llama-3.3-70b-versatile';
      if (model && model.includes('8b')) {
        groqModel = 'llama-3.1-8b-instant';
      } else if (model && model.includes('mixtral')) {
        groqModel = 'llama-3.3-70b-versatile'; // mixtral-8x7b was decommissioned on Groq
      }

      console.log(`[ModelProvider] Routing to Groq (${groqModel}) for speed & reliability`);
      const body = {
        ...llmBody,
        model: groqModel,
      };

      const groqRes = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify(body),
      });

      if (groqRes.ok) return groqRes;
      const errText = await groqRes.text().catch(() => groqRes.statusText);
      console.error(`[ModelProvider] Groq routing failed (${groqRes.status}): ${errText}`);
    } catch (error) {
      console.error('[ModelProvider] Groq routing error:', error.message);
    }
  }

  // ── Fallback to Nvidia NIM if key exists and Groq failed ──────────────────
  if (nvidiaKey) {
    try {
      console.log('[ModelProvider] Routing to Nvidia NIM');
      const body = {
        ...llmBody,
        model: model || 'meta/llama-3.1-70b-instruct',
      };

      const nvidiaRes = await fetch(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify(body),
      });

      if (nvidiaRes.ok) return nvidiaRes;
      const errText = await nvidiaRes.text().catch(() => nvidiaRes.statusText);
      console.error(`[ModelProvider] Nvidia NIM failed (${nvidiaRes.status}): ${errText}`);
    } catch (error) {
      console.error('[ModelProvider] Nvidia routing error:', error.message);
    }
  }

  // ── Last resort: DeepSeek ─────────────────────────────────────────────────
  if (deepseekKey) {
    console.log('[ModelProvider] Routing to DeepSeek (last resort)');
    const dsBody = { ...llmBody, model: 'deepseek-chat' };
    const dsRes = await fetch(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify(dsBody),
    });

    if (dsRes.ok) return dsRes;
    const err = await dsRes.text().catch(() => dsRes.statusText);
    throw new Error(`DeepSeek API error (${dsRes.status}): ${err}`);
  }

  throw new Error('No LLM provider API key configured');
}

module.exports = {
  handleChatRoute
};
