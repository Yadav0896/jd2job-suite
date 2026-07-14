# Interview Copilot

An AI-powered live interview and sales/meeting coaching assistant.

## Features

- **Real-Time Voice Coaching:** Captures speech and suggests highly structured answers (STAR method, spin selling, facilitator checklists).
- **Dual Model Modes:**
  - **Default (Comprehensive):** Routes to smarter LLMs (DeepSeek V3 / R1 or high-quality Nvidia NIM models) for deep, detailed analysis.
  - **Ultra-Fast (Speed Mode):** Routes to Llama 3.1 8B (locally via Ollama or remotely via Nvidia NIM) with latency optimized for <1 second responses.
- **Glassmorphism UI:** Elegant visual indicators, theme toggles, stealth mode overlays, and latency statistics.

## Environment Variables

Copy the template from `backend/.env.example` to `backend/.env`:

```env
# Server
PORT=3001

# STT Provider
DEEPGRAM_API_KEY=your-deepgram-api-key

# LLM Providers (Default)
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
NVIDIA_API_KEY=nvapi-your-nvidia-api-key

# Ultra-Fast Model Configuration (Optional)
# If LLAMA_FAST_API_URL is omitted, requests route to Nvidia NIM's Llama 3.1 8B endpoint automatically.
LLAMA_FAST_API_URL=http://localhost:11434/v1/chat/completions # or /api/chat for local Ollama
LLAMA_FAST_MODEL_NAME=meta/llama-3.1-8b-instruct
```

## Running the Application

1. **Start Backend & Frontend:**
   ```bash
   npm run dev
   ```
2. **Launch in browser:** Open [http://localhost:5173](http://localhost:5173).

## Testing

Execute the AppContext unit tests to verify model selection persistence and reducer logic:
```bash
npm test
```
