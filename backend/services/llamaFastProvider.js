const fetch = require('node-fetch');

/**
 * llamaFastProvider - Provider for ultra-fast Llama inference.
 * 
 * Priority order:
 *   1. Custom URL (LLAMA_FAST_API_URL) — e.g. local Ollama instance
 *   2. Groq (GROQ_API_KEY) — ultra-fast LPU chips, ~800-1000 tokens/sec
 *   3. Nvidia NIM (NVIDIA_API_KEY) — fallback GPU inference
 */
async function streamLlamaFast(llmBody) {
  const fastUrl = process.env.LLAMA_FAST_API_URL;

  // ── Option 1: Custom local URL (e.g. Ollama) ─────────────────────────────
  if (fastUrl) {
    console.log(`[LlamaFastProvider] Routing to custom fast model API: ${fastUrl}`);
    const body = {
      model: process.env.LLAMA_FAST_MODEL_NAME || 'meta/llama-3.1-8b-instruct',
      messages: llmBody.messages,
      max_tokens: llmBody.max_tokens || 1024,
      temperature: llmBody.temperature || 0.4,
      top_p: llmBody.top_p || 0.9,
      stream: true
    };

    const isNativeOllama = fastUrl.endsWith('/api/chat') || fastUrl.includes(':11434/api/chat');
    const finalBody = isNativeOllama ? {
      model: process.env.LLAMA_FAST_MODEL_NAME || 'llama3.1',
      messages: llmBody.messages,
      stream: true,
      options: {
        num_predict: llmBody.max_tokens || 256,
        temperature: llmBody.temperature || 0.4,
        top_p: llmBody.top_p || 0.9
      }
    } : body;

    const response = await fetch(fastUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalBody)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Custom Fast Model API failed with status ${response.status}: ${text}`);
    }

    return response;
  }

  // ── Option 2: Groq (primary - ultra-fast LPU inference) ──────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    console.log(`[LlamaFastProvider] Routing to Groq LPU (ultra-fast)`);
    const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
      model: 'llama-3.1-8b-instant',  // Groq's fastest Llama model
      messages: llmBody.messages,
      max_tokens: llmBody.max_tokens || 1024,
      temperature: llmBody.temperature || 0.4,
      top_p: llmBody.top_p || 0.9,
      stream: true
    };

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[LlamaFastProvider] Groq failed (${response.status}): ${text}`);
      // Fall through to Nvidia NIM
      console.log('[LlamaFastProvider] Falling back to Nvidia NIM...');
    } else {
      return response;
    }
  }

  // ── Option 3: Nvidia NIM (fallback) ──────────────────────────────────────
  console.log(`[LlamaFastProvider] Routing to Nvidia NIM Llama 3.1 8B (fallback)`);
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    throw new Error('No fast model provider configured: set GROQ_API_KEY or NVIDIA_API_KEY');
  }

  const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const body = {
    model: 'meta/llama-3.1-8b-instruct',
    messages: llmBody.messages,
    max_tokens: llmBody.max_tokens || 1024,
    temperature: llmBody.temperature || 0.4,
    top_p: llmBody.top_p || 0.9,
    stream: true
  };

  const response = await fetch(NVIDIA_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${nvidiaKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nvidia NIM fallback failed with status ${response.status}: ${text}`);
  }

  return response;
}

module.exports = {
  streamLlamaFast
};
