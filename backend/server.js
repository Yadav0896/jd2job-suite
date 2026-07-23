const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const fetch = require('node-fetch');

const app = express();

// Configure CORS based on ALLOWED_ORIGIN or default to allow all in development
const allowedOrigin = process.env.CORS_ORIGIN;
if (allowedOrigin) {
  const origins = allowedOrigin.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin, Chrome Extensions, or matched allowed origins
      if (!origin || origin.startsWith('chrome-extension://') || origins.indexOf(origin) !== -1 || origins.indexOf('*') !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
} else {
  app.use(cors());
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Trust the first proxy (required for correct req.ip behind nginx/Railway/load balancers)
app.set('trust proxy', 1);

// ── Supabase Client (service role for privileged operations) ──
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://your-project.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'
);

const PORT = process.env.PORT || 3001;

// ── Auth Middleware ─────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = authHeader.replace('Bearer ', '');
  
  // Support mock tokens for offline/local-mock developer mode
  if (token.startsWith('mock-token-')) {
    const userId = token.replace('mock-token-', '');
    req.user = { id: userId, email: 'mock-user@example.com' };
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid session' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── WebSocket Auth Helper ───────────────────────────────────────────────────
// WS upgrades can't use Express middleware, so verify the Supabase token here.
async function verifyWsAuth(request) {
  try {
    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const token = searchParams.get('token');
    if (!token) return null;
    if (token.startsWith('mock-token-')) {
      return { id: token.replace('mock-token-', ''), email: 'mock-user@example.com' };
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// Strip the auth token from the query string before forwarding upstream.
function forwardableQuery(requestUrl) {
  const idx = requestUrl.indexOf('?');
  if (idx === -1) return '';
  const params = new URLSearchParams(requestUrl.slice(idx + 1));
  params.delete('token');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── Simple In-Memory Rate Limiter ───────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimiter(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + windowMs;
    } else {
      record.count++;
    }

    rateLimitMap.set(key, record);

    if (record.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) rateLimitMap.delete(key);
  }
}, 300000);

// ── Sanitize Middleware ─────────────────────────────────────────────────────
function sanitizeInput(req, res, next) {
  const MAX_TEXT_LENGTH = 10000;
  const MAX_JSONB_LENGTH = 100000;

  if (req.body) {
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (typeof val === 'string' && val.length > MAX_TEXT_LENGTH) {
        req.body[key] = val.substring(0, MAX_TEXT_LENGTH);
      }
    }
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length > MAX_JSONB_LENGTH) {
      return res.status(400).json({ error: 'Request payload too large' });
    }
  }
  next();
}

app.use(sanitizeInput);

// ElevenLabs TTS Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

const VOICE_SETTINGS = {
  neutral: { stability: 0.5, style: 0.0, similarity_boost: 0.75 },
  happy: { stability: 0.3, style: 0.6, similarity_boost: 0.75 },
  concerned: { stability: 0.6, style: 0.2, similarity_boost: 0.75 },
  curious: { stability: 0.4, style: 0.4, similarity_boost: 0.75 },
  thinking: { stability: 0.7, style: 0.1, similarity_boost: 0.75 }
};

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

// ElevenLabs TTS Endpoint - Generate Speech
app.post('/api/tts/speak', requireAuth, rateLimiter(30, 60000), async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const { text, voice_id, emotion } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const voiceId = voice_id || DEFAULT_VOICE_ID;
  const emotionSettings = VOICE_SETTINGS[emotion] || VOICE_SETTINGS.neutral;

  try {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: emotionSettings
      })
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      console.error('ElevenLabs TTS error:', err);
      return res.status(response.status).json({ error: `ElevenLabs API error: ${err}` });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    
    response.body.on('error', (err) => {
      if (err.code !== 'EPIPE') console.error('TTS stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });
    response.body.pipe(res);
  } catch (error) {
    console.error('TTS proxy error:', error);
    res.status(500).json({ error: 'TTS proxy error' });
  }
});

// ElevenLabs TTS Endpoint - Stream Speech (Lower Latency)
app.post('/api/tts/stream', requireAuth, rateLimiter(30, 60000), async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const { text, voice_id, emotion } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const voiceId = voice_id || DEFAULT_VOICE_ID;
  const emotionSettings = VOICE_SETTINGS[emotion] || VOICE_SETTINGS.neutral;

  try {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: emotionSettings
      })
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      return res.status(response.status).json({ error: `ElevenLabs API error: ${err}` });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    
    response.body.on('error', (err) => {
      if (err.code !== 'EPIPE') console.error('TTS stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });
    response.body.pipe(res);
  } catch (error) {
    console.error('TTS stream proxy error:', error);
    res.status(500).json({ error: 'TTS stream proxy error' });
  }
});

// Get available voices
app.get('/api/tts/voices', requireAuth, rateLimiter(10, 60000), async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      return res.status(response.status).json({ error: `ElevenLabs API error: ${err}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Get voices error:', error);
    res.status(500).json({ error: 'Failed to get voices' });
  }
});

// ── Global Error Handling ──────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  if (err.code === 'EPIPE') return; // Ignore EPIPE common in proxies
});

// ── Global Request Logger ──────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
  next();
});

// ── LLM Proxy (Streaming Chat) ──────────────────────────────────────────────
const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const { handleChatRoute } = require('./services/modelProvider');

app.post('/api/deepseek/chat', requireAuth, rateLimiter(60, 60000), async (req, res) => {
  try {
    const upstreamRes = await handleChatRoute(req);

    // Stream the response back to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    upstreamRes.body.on('error', (err) => {
      if (err.code !== 'EPIPE') console.error('Chat proxy stream error:', err.message);
      if (!res.headersSent) res.status(502).end();
    });
    upstreamRes.body.pipe(res);
  } catch (error) {
    console.error('Chat proxy error:', error);
    res.status(500).json({ error: error.message || 'Chat proxy error' });
  }
});

// ── DeepSeek Vision Proxy (Screen Reader) ────────────────────────────────────
// DeepSeek doesn't have a native vision API yet, so we use TOGETHER_AI as fallback
const TOGETHER_AI_URL = process.env.TOGETHER_AI_URL || 'https://api.together.ai/v1/chat/completions';
const TOGETHER_AI_KEY = process.env.TOGETHER_AI_KEY;

app.post('/api/deepseek/vision', requireAuth, async (req, res) => {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const togetherKey = process.env.TOGETHER_AI_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (!nvidiaKey && !togetherKey && !deepseekKey) {
    return res.status(500).json({ error: 'No vision API key (Nvidia/Together) configured on server' });
  }

  let targetUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
  let targetAuth = nvidiaKey;
  let modelOverride = 'meta/llama-3.2-11b-vision-instruct';

  if (togetherKey) {
    targetUrl = process.env.TOGETHER_AI_URL || 'https://api.together.ai/v1/chat/completions';
    targetAuth = togetherKey;
    modelOverride = 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo';
  } else if (!nvidiaKey && deepseekKey) {
    targetUrl = DEEPSEEK_CHAT_URL;
    targetAuth = deepseekKey;
    modelOverride = 'deepseek-chat'; // Fallback
  }

  const requestBody = {
    ...req.body,
    model: modelOverride
  };

  try {
    const upstreamRes = await fetch(targetUrl, { 
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${targetAuth}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstreamRes.ok) {
      const errBody = await upstreamRes.text().catch(() => 'No body');
      console.error(`Vision Error (${upstreamRes.status}):`, errBody);
      return res.status(upstreamRes.status).send(`Vision API error ${upstreamRes.status}: ${errBody}`);
    }

    const data = await upstreamRes.json();
    console.log('Vision Success:', JSON.stringify(data).substring(0, 100) + '...');
    res.json(data);
  } catch (error) {
    console.error('Vision proxy error:', error);
    res.status(500).json({ error: 'Vision proxy error' });
  }
});

const { exec } = require('child_process');
const fs = require('fs');

app.get('/api/capture-screen', requireAuth, async (req, res) => {
  const tempPath = path.join(__dirname, 'screenshot.jpg');
  
  // Use macOS native screencapture tool
  exec(`screencapture -x -t jpg "${tempPath}"`, (error) => {
    if (error) {
      console.error('[Capture] screencapture failed:', error);
      return res.status(500).json({ error: 'Failed to capture screen' });
    }
    
    try {
      const imgBuffer = fs.readFileSync(tempPath);
      const base64Image = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
      
      // Clean up temp file
      fs.unlinkSync(tempPath);
      
      res.json({ screenshotUrl: base64Image });
    } catch (err) {
      console.error('[Capture] file read failed:', err);
      res.status(500).json({ error: 'Failed to read screenshot file' });
    }
  });
});

// ── HTTP Server setup ──────────────────────────────────────────────────────
const server = createServer(app);

// ── Deepgram WebSocket Proxy ───────────────────────────────────────────────
const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen';
const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const wss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });

wss.on('connection', (clientWs, req) => {
  const connectionId = Math.random().toString(36).substring(7);
  console.log(`[Proxy] New Connection: ${connectionId} | URL: ${req.url}`);

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error(`[Proxy] ${connectionId} | Error: API Key missing`);
    clientWs.close(1011, 'Deepgram API key missing');
    return;
  }

  const qs = forwardableQuery(req.url);
  const dgWs = new WebSocket(`${DEEPGRAM_URL}${qs}`, ['token', apiKey]);

  let preConnectBuffer = [];
  let isUpstreamOpen = false;
  let keepAliveInterval = null;

  // Timeout: if Deepgram doesn't open within 10s, close with clear error
  const connectTimeout = setTimeout(() => {
    if (!isUpstreamOpen) {
      console.error(`[Proxy] ${connectionId} | Deepgram connection timed out`);
      try { clientWs.send(JSON.stringify({ type: 'Error', description: 'Deepgram connection timed out. Check API key and network.' })); } catch {}
      clientWs.close(1011, 'Deepgram connection timed out');
      dgWs.terminate();
    }
  }, 10000);

  dgWs.on('open', () => {
    clearTimeout(connectTimeout);
    console.log(`[Proxy] ${connectionId} | Connected to Deepgram Upstream`);
    isUpstreamOpen = true;
    console.log(`[Proxy] ${connectionId} | Flushing ${preConnectBuffer.length} buffered chunks`);
    preConnectBuffer.forEach(chunk => dgWs.send(chunk.data, { binary: chunk.isBinary }));
    preConnectBuffer = [];
    
    // Send KeepAlive every 3 seconds to prevent Deepgram from dropping idle connections
    keepAliveInterval = setInterval(() => {
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 3000);
  });
  dgWs.on('message', (data, isBinary) => {
    // isBinary=false → Deepgram JSON text frame → must forward as text, NOT binary.
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });
  dgWs.on('error', (err) => {
    console.error(`[Proxy] ${connectionId} | Deepgram Error:`, err.message);
    try { clientWs.send(JSON.stringify({ type: 'Error', description: `Deepgram connection error: ${err.message}` })); } catch {}
  });
  dgWs.on('close', (code, reason) => {
    clearTimeout(connectTimeout);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    const reasonStr = reason?.toString() || 'none';
    console.log(`[Proxy] ${connectionId} | Deepgram Closed: Code ${code}, Reason: ${reasonStr}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1011, reasonStr);
    }
  });
  dgWs.on('unexpected-response', (request, response) => {
    clearTimeout(connectTimeout);
    console.error(`[Proxy] ${connectionId} | Deepgram Unexpected HTTP Response: ${response.statusCode}`);
    response.on('data', chunk => console.error(`[Proxy] ${connectionId} | Response Body:`, chunk.toString()));
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'Error', description: `Deepgram rejected connection: HTTP ${response.statusCode}` }));
      clientWs.close(1011, `Deepgram HTTP ${response.statusCode}`);
    }
  });

  let frameCount = 0;
  let totalBytes = 0;
  clientWs.on('message', (data, isBinary) => {
    frameCount++;
    totalBytes += data.byteLength || 0;
    if (frameCount % 100 === 0) {
      console.log(`[Proxy] ${connectionId} | Streaming: ${frameCount} frames (${totalBytes} bytes)`);
    }
    if (isUpstreamOpen) {
      if (dgWs.readyState === WebSocket.OPEN) dgWs.send(data, { binary: isBinary });
    } else {
      preConnectBuffer.push({ data, isBinary });
      if (preConnectBuffer.length % 10 === 0) {
        console.log(`[Proxy] ${connectionId} | Buffering: ${preConnectBuffer.length} chunks`);
      }
    }
  });
  clientWs.on('error', (err) => console.error(`[Proxy] ${connectionId} | Frontend Error:`, err.message));
  clientWs.on('close', (code, reason) => {
    console.log(`[Proxy] ${connectionId} | Frontend Closed: Code ${code}, Reason: ${reason || 'None'}`);
    if (dgWs.readyState === WebSocket.OPEN || dgWs.readyState === WebSocket.CONNECTING) dgWs.close();
  });
});

agentWss.on('connection', (clientWs, req) => {
  const connectionId = Math.random().toString(36).substring(7);
  console.log(`[Agent Proxy] New Connection: ${connectionId} | URL: ${req.url}`);

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error(`[Agent Proxy] ${connectionId} | Error: API Key missing`);
    clientWs.close(1011, 'Deepgram API key missing');
    return;
  }

  const qs = forwardableQuery(req.url);
  const dgWs = new WebSocket(`${DEEPGRAM_AGENT_URL}${qs}`, ['token', apiKey]);

  let preConnectBuffer = [];
  let isUpstreamOpen = false;
  let keepAliveInterval = null;

  const connectTimeout = setTimeout(() => {
    if (!isUpstreamOpen) {
      console.error(`[Agent Proxy] ${connectionId} | Deepgram connection timed out`);
      try { clientWs.send(JSON.stringify({ type: 'Error', description: 'Deepgram connection timed out. Check API key and network.' })); } catch {}
      clientWs.close(1011, 'Deepgram connection timed out');
      dgWs.terminate();
    }
  }, 10000);

  dgWs.on('open', () => {
    clearTimeout(connectTimeout);
    console.log(`[Agent Proxy] ${connectionId} | Connected to Deepgram Upstream`);
    isUpstreamOpen = true;
    console.log(`[Agent Proxy] ${connectionId} | Flushing ${preConnectBuffer.length} buffered chunks`);
    preConnectBuffer.forEach(chunk => dgWs.send(chunk.data, { binary: chunk.isBinary }));
    preConnectBuffer = [];
    
    keepAliveInterval = setInterval(() => {
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 15000);
  });
  dgWs.on('message', (data, isBinary) => {
    const isBin = typeof data !== 'string' && (!Buffer.isBuffer(data) || (data[0] !== 123 || data[data.length-1] !== 125));
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBin });
  });
  dgWs.on('error', (err) => {
    console.error(`[Agent Proxy] ${connectionId} | Deepgram Error:`, err.message);
    try { clientWs.send(JSON.stringify({ type: 'Error', description: `Deepgram connection error: ${err.message}` })); } catch {}
  });
  dgWs.on('close', (code, reason) => {
    clearTimeout(connectTimeout);
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    const reasonStr = reason?.toString() || 'none';
    console.log(`[Agent Proxy] ${connectionId} | Deepgram Closed: Code ${code}, Reason: ${reasonStr}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code || 1011, reasonStr);
    }
  });
  dgWs.on('unexpected-response', (request, response) => {
    clearTimeout(connectTimeout);
    console.error(`[Agent Proxy] ${connectionId} | Deepgram Unexpected HTTP Response: ${response.statusCode}`);
    response.on('data', chunk => console.error(`[Agent Proxy] ${connectionId} | Response Body:`, chunk.toString()));
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'Error', description: `Deepgram rejected connection: HTTP ${response.statusCode}` }));
      clientWs.close(1011, `Deepgram HTTP ${response.statusCode}`);
    }
  });

  let frameCount = 0;
  let totalBytes = 0;
  clientWs.on('message', (data, isBinary) => {
    frameCount++;
    totalBytes += data.byteLength || 0;
    const isBin = typeof data !== 'string' && (!Buffer.isBuffer(data) || (data[0] !== 123 || data[data.length-1] !== 125));
    if (isUpstreamOpen) {
      if (dgWs.readyState === WebSocket.OPEN) dgWs.send(data, { binary: isBin });
    } else {
      preConnectBuffer.push({ data, isBinary: isBin });
    }
  });
  clientWs.on('error', (err) => console.error(`[Agent Proxy] ${connectionId} | Frontend Error:`, err.message));
  clientWs.on('close', (code, reason) => {
    console.log(`[Agent Proxy] ${connectionId} | Frontend Closed: Code ${code}, Reason: ${reason || 'None'}`);
    if (dgWs.readyState === WebSocket.OPEN || dgWs.readyState === WebSocket.CONNECTING) dgWs.close();
  });
});

server.on('upgrade', async (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname !== '/api/deepgram' && pathname !== '/api/deepgram-agent') {
    socket.destroy();
    return;
  }

  const user = await verifyWsAuth(request);
  if (!user) {
    console.warn(`[WS] Rejected unauthenticated upgrade to ${pathname}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (pathname === '/api/deepgram') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    agentWss.handleUpgrade(request, socket, head, (ws) => {
      agentWss.emit('connection', ws, request);
    });
  }
});

// Validate critical environment variables on startup
const REQUIRED_ENV_VARS = [
  'DEEPGRAM_API_KEY',
  'DEEPSEEK_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

server.listen(PORT, () => {
  console.log(`Backend proxy running on http://localhost:${PORT}`);
  
  // Perform env checks
  const missing = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn('\n⚠️  [WARNING] The following environment variables are missing:');
    missing.forEach(v => console.warn(`   - ${v}`));
    console.warn('Some features might not function correctly. Ensure these are defined in your backend/.env file.\n');
  } else {
    console.log('✅ All required environment variables are configured.');
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════════════════════
// COMPANY ENRICHMENT — /api/company-enrichment?name=<CompanyName>
// Uses the Nvidia NIM inference API to generate brief company context
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/company-enrichment', requireAuth, rateLimiter(10, 60000), async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Company name is required' });

  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  if (!NVIDIA_API_KEY) {
    // Fallback: return a generic template with the company name
    return res.json({
      companyName: name,
      summary: `${name} is a well-known company. Research their products, engineering culture, and tech stack before the interview.`,
      techStack: [],
      recentNews: [],
      interviewTips: [`Research ${name}'s core product offerings`, `Understand ${name}'s engineering culture`, 'Check recent news and blog posts'],
    });
  }

  try {
    const prompt = `You are an expert interview research assistant. Give a brief but comprehensive company profile for "${name}" from an interview candidate's perspective.
Return ONLY valid JSON (no markdown, no extra text):
{
  "companyName": "${name}",
  "summary": "<2-3 sentence company overview>",
  "industry": "<industry>",
  "techStack": ["<tech1>", "<tech2>", "<tech3>", "<tech4>", "<tech5>"],
  "keyProducts": ["<product1>", "<product2>"],
  "recentNews": ["<brief news item 1>", "<brief news item 2>"],
  "interviewTips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"],
  "culture": "<1-2 sentences about engineering culture>"
}`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      throw new Error(`Nvidia API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse company data');

    const enrichment = JSON.parse(jsonMatch[0]);
    res.json(enrichment);
  } catch (err) {
    console.error('Company enrichment error:', err.message);
    // Graceful fallback
    res.json({
      companyName: name,
      summary: `${name} is a leading company in its industry. Research their latest products, engineering blog, and team culture before your interview.`,
      techStack: [],
      recentNews: [],
      interviewTips: [`Understand ${name}'s core business model`, `Study ${name}'s engineering blog if available`, 'Prepare STAR stories aligned to their stated values'],
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SUPABASE API ROUTES (privileged operations via service role key)
// ════════════════════════════════════════════════════════════════════════════

// Verify user session (used by frontend to confirm auth before privileged ops)
app.get('/api/supabase/session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

    const token = authHeader.replace('Bearer ', '');
    
    if (token.startsWith('mock-token-')) {
      const userId = token.replace('mock-token-', '');
      return res.json({ user: { id: userId, email: 'mock-user@example.com' } });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: 'Invalid session' });

    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user profile (own profile only)
app.get('/api/supabase/profile/:userId', requireAuth, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.userId)
      .single();

    if (error) return res.status(404).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deduct credits (privileged — uses service role to bypass RLS; own account only)
app.post('/api/supabase/credits/deduct', requireAuth, async (req, res) => {
  try {
    const { userId, amount = 1, sessionId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError) return res.status(404).json({ error: 'User not found' });
    if (profile.credits < amount) return res.status(402).json({ error: 'Insufficient credits' });

    const newCredits = profile.credits - amount;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (updateError) return res.status(500).json({ error: updateError.message });

    // Log transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: -amount,
      reason: 'session_started',
      session_id: sessionId || null,
    });

    res.json({ credits: newCredits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's session history (own sessions only)
app.get('/api/supabase/sessions/:userId', requireAuth, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Fetch sessions
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });

    // Attach transcript for each session
    const withTranscripts = await Promise.all((sessions || []).map(async (session) => {
      try {
        const { data: transcripts } = await supabase
          .from('transcripts')
          .select('speaker, text, created_at')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true })
          .limit(200);
        return { ...session, transcript: transcripts || [] };
      } catch {
        return { ...session, transcript: [] };
      }
    }));

    res.json(withTranscripts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Dashboard ──────────────────────────────────────────────────
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', userId).single();
    if (!profile) return res.status(403).json({ error: 'Forbidden' });

    const [users, sessions, transactions] = await Promise.all([
      supabase.from('profiles').select('id, plan_type', { count: 'exact', head: true }),
      supabase.from('sessions').select('id, status', { count: 'exact', head: true }),
      supabase.from('credit_transactions').select('amount, created_at').order('created_at', { ascending: false }).limit(100),
    ]);

    const totalUsers = users.count || 0;
    const totalSessions = sessions.count || 0;
    const allTxns = transactions.data || [];
    const revenue = allTxns.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0) * 249;
    const recentTxns = allTxns.slice(0, 10).map(t => ({ amount: t.amount, date: t.created_at }));

    res.json({ totalUsers, totalSessions, estimatedRevenue: revenue, recentTransactions: recentTxns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Referral reward: credit referrer when new user signs up ─────────
app.post('/api/referral/claim', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data: profile } = await supabase.from('profiles').select('referred_by, credits').eq('id', userId).single();
    
    if (!profile?.referred_by) {
      return res.json({ claimed: false, reason: 'No referrer' });
    }

    // Check if already claimed
    const { data: existing } = await supabase.from('credit_transactions')
      .select('id').eq('user_id', profile.referred_by).eq('reason', 'referral_bonus').eq('metadata->>referred_user', userId).maybeSingle();
    
    if (existing) return res.json({ claimed: false, reason: 'Already claimed' });

    // Credit referrer 2 credits
    const { data: referrer } = await supabase.from('profiles').select('credits').eq('id', profile.referred_by).single();
    if (!referrer) return res.json({ claimed: false, reason: 'Referrer not found' });

    await supabase.from('profiles').update({ credits: referrer.credits + 2, updated_at: new Date().toISOString() }).eq('id', profile.referred_by);
    await supabase.from('credit_transactions').insert({
      user_id: profile.referred_by, amount: 2, reason: 'referral_bonus',
      metadata: { referred_user: userId },
    });

    res.json({ claimed: true, message: 'Referral credited!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Interview Prep: Get Next Question ───────────────────────────────
const { generateNextQuestion } = require('./agents/interviewerAgent');

app.post('/api/interview/next-question', requireAuth, async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DeepSeek API key not configured on server' });
  }

  const { interviewType, difficulty, resumeData, jobDescription, previousQuestions, questionNumber } = req.body;

  try {
    const result = await generateNextQuestion({
      interviewType,
      difficulty,
      resumeData,
      jobDescription,
      previousQuestions,
      questionNumber
    });
    res.json(result);
  } catch (error) {
    console.error('Interview question error:', error);
    res.status(500).json({ error: 'Failed to generate question' });
  }
});

// ── Interview Prep: Evaluate Answer (powered by DeepSeek V3) ──────────────
const { evaluateAnswer } = require('./agents/evaluatorAgent');

app.post('/api/interview/evaluate-answer', requireAuth, async (req, res) => {
  const { question, userAnswer, resumeData, difficulty } = req.body;
  try {
    const result = await evaluateAnswer({ question, userAnswer, resumeData, difficulty });
    res.json(result);
  } catch (error) {
    console.error('Evaluate answer error:', error);
    res.status(500).json({ error: 'Failed to evaluate answer' });
  }
});


// Quick Deepgram API key validation — opens a WebSocket, checks it connects, closes it
app.get('/api/deepgram/test', requireAuth, async (req, res) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'DEEPGRAM_API_KEY not set in .env' });

  try {
    await new Promise((resolve, reject) => {
      const testWs = new WebSocket(
        'wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000',
        ['token', apiKey]
      );
      const timer = setTimeout(() => { testWs.terminate(); reject(new Error('Connection timed out')); }, 8000);
      testWs.on('open', () => { clearTimeout(timer); testWs.close(1000, 'test'); resolve(); });
      testWs.on('error', (err) => { clearTimeout(timer); reject(err); });
      testWs.on('close', (code, reason) => {
        if (code !== 1000) { clearTimeout(timer); reject(new Error(`Closed ${code}: ${reason}`)); }
      });
    });
    res.json({ ok: true, message: 'Deepgram API key is valid and reachable' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// NOTE: The Deepgram Voice Agent runs through the authenticated WS proxy at
// /api/deepgram-agent (see server.on('upgrade')). The old unauthenticated
// /api/interview/agent/config|url|voices endpoints were removed as dead code —
// the frontend builds its own Settings payload (deepgramAgentService.js).

// ════════════════════════════════════════════════════════════════════════════
// RAZORPAY PAYMENT ROUTES
// ════════════════════════════════════════════════════════════════════════════
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpayInstance = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

// Server-side plan prices (INR) — the client can NEVER set the amount.
const PLAN_PRICES = {
  base: 999,
  topup: 249,
  monthly_unlimited: 3999,
  quarterly_unlimited: 9999,
};

// Create order
app.post('/api/payments/create-order', requireAuth, async (req, res) => {
  if (!razorpayInstance) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }

  const { planId } = req.body;
  const amount = PLAN_PRICES[planId];
  if (!amount) {
    return res.status(400).json({ error: 'Unknown or missing planId' });
  }
  const userId = req.user.id;

  try {
    const order = await razorpayInstance.orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: `credit_${userId}_${Date.now()}`,
      notes: { userId, planId },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment and credit user
app.post('/api/payments/verify', requireAuth, async (req, res) => {
  if (!razorpayInstance) {
    return res.status(500).json({ error: 'Razorpay not configured' });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  const userId = req.user.id; // never trust a client-supplied userId

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  try {
    // Idempotency: a payment id must only ever credit once (blocks replay attacks).
    // IMPORTANT: For complete race-condition safety, add this unique index in
    // your Supabase SQL editor (ensures no two concurrent requests both pass):
    //   CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_payment_id
    //     ON credit_transactions ((metadata->>'payment_id'))
    //     WHERE metadata->>'payment_id' IS NOT NULL;
    const { data: existingTx } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>payment_id', razorpay_payment_id)
      .maybeSingle();
    if (existingTx) {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
      return res.json({ success: true, alreadyProcessed: true, profile });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature.length !== razorpay_signature.length ||
        !crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature))) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Get order details to determine plan
    const order = await razorpayInstance.orders.fetch(razorpay_order_id);
    const planId = order.notes?.planId;
    const amountINR = order.amount / 100;

    // Price consistency: the paid amount must match the plan's server-side price
    if (order.notes?.userId && order.notes.userId !== userId) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }
    if (planId && PLAN_PRICES[planId] && amountINR !== PLAN_PRICES[planId]) {
      return res.status(400).json({ error: 'Paid amount does not match plan price' });
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) return res.status(404).json({ error: 'User not found' });

    let updates = { updated_at: new Date().toISOString() };
    let description = '';
    const now = new Date();

    if (planId === 'base' || amountINR === 999) {
      updates.plan_type = 'base';
      updates.credits = (profile.credits || 0) + 5;
      updates.plan_started_at = now.toISOString();
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1);
      updates.plan_expires_at = expires.toISOString();
      description = 'Base Plan (5 credits)';
    } else if (planId === 'topup' || amountINR === 249) {
      // Check if user is eligible for topup (must be within base plan month)
      const planExpires = profile.plan_expires_at ? new Date(profile.plan_expires_at) : null;
      const isBaseActive = profile.plan_type === 'base' && planExpires && planExpires > now;
      
      if (!isBaseActive) {
        return res.status(400).json({ error: 'Top-ups are only allowed within an active Base Plan subscription month.' });
      }
      
      updates.credits = (profile.credits || 0) + 1;
      description = 'Credit Top-up (+1 credit)';
    } else if (planId === 'monthly_unlimited' || amountINR === 3999) {
      updates.plan_type = 'monthly_unlimited';
      updates.plan_started_at = now.toISOString();
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1);
      updates.plan_expires_at = expires.toISOString();
      description = 'Monthly Unlimited Plan';
    } else if (planId === 'quarterly_unlimited' || amountINR === 9999) {
      updates.plan_type = 'quarterly_unlimited';
      updates.plan_started_at = now.toISOString();
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 3);
      updates.plan_expires_at = expires.toISOString();
      description = 'Quarterly Unlimited Plan';
    } else {
      const genericCredits = Math.floor(amountINR / 200);
      updates.credits = (profile.credits || 0) + genericCredits;
      description = `Added ${genericCredits} generic credits`;
    }

    await supabase.from('profiles').update(updates).eq('id', userId);

    // Handle Referral System reward: Grant referrer 1 free credit when their referred friend makes their first purchase.
    if (profile.plan_type === 'trial' && profile.referred_by) {
      console.log(`[Referral] User ${userId} is upgrading from trial. Rewarding referrer: ${profile.referred_by}`);
      try {
        // Fetch referrer profile
        const { data: referrer, error: referrerError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profile.referred_by)
          .single();

        if (!referrerError && referrer) {
          const newReferrerCredits = (referrer.credits || 0) + 1;
          await supabase
            .from('profiles')
            .update({ credits: newReferrerCredits, updated_at: new Date().toISOString() })
            .eq('id', profile.referred_by);

          // Log referral reward transaction
          await supabase.from('credit_transactions').insert({
            user_id: profile.referred_by,
            amount: 1,
            reason: 'referral_reward',
            metadata: {
              referred_user_id: userId,
              description: `Granted 1 free credit because referred friend completed their first purchase.`
            }
          });
          console.log(`[Referral] 1 free credit successfully awarded to referrer: ${profile.referred_by}`);
        }
      } catch (refErr) {
        console.error('[Referral] Failed to award referral credit:', refErr);
      }
    }

    // Log transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: planId === 'topup' ? 1 : (planId === 'base' ? 5 : 0),
      reason: 'purchase',
      metadata: { 
        payment_id: razorpay_payment_id, 
        order_id: razorpay_order_id, 
        plan_id: planId, 
        description: description 
      },
    });

    res.json({ success: true, profile: { ...profile, ...updates } });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Serve native desktop app installer download
app.get('/api/download', (req, res) => {
  if (process.env.DESKTOP_APP_DOWNLOAD_URL) {
    return res.redirect(process.env.DESKTOP_APP_DOWNLOAD_URL);
  }

  const fs = require('fs');
  const path = require('path');
  
  // Look for any built macOS or Windows installer files in parent dist-electron folder
  const parentDist = path.join(__dirname, '../dist-electron');
  let fileToDownload = null;
  
  if (fs.existsSync(parentDist)) {
    const files = fs.readdirSync(parentDist);
    // Find first .dmg, .exe, or .zip
    const installer = files.find(f => f.endsWith('.dmg') || f.endsWith('.exe') || f.endsWith('.zip'));
    if (installer) {
      fileToDownload = path.join(parentDist, installer);
    }
  }

  if (fileToDownload) {
    res.download(fileToDownload);
  } else {
    // Send a text file explaining how to build, disguised as a placeholder so the browser downloads it
    res.setHeader('Content-Disposition', 'attachment; filename="AI-Interview-Assistant-Installer.dmg.zip"');
    res.setHeader('Content-Type', 'application/zip');
    res.send(Buffer.from('Placeholder zip representing the native desktop application. Please run "npm run electron:build" in the project directory to generate the actual installer.'));
  }
});

// ── Jd2Job Chrome Extension Sync Routes ──────────────────────────────────────
app.post('/api/jd2job/sync', requireAuth, rateLimiter(20, 60000), async (req, res) => {
  const { jobs } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(jobs)) {
    return res.status(400).json({ error: 'Jobs must be an array' });
  }

  try {
    console.log(`[Jd2Job Sync] Syncing ${jobs.length} jobs for user ${userId}`);
    
    // Fetch existing jobs for this user to deduplicate
    const { data: existingJobs, error: fetchErr } = await supabase
      .from('applied_jobs')
      .select('title, company, applied_at')
      .eq('user_id', userId);

    if (fetchErr) throw fetchErr;

    const existingKeys = new Set(
      (existingJobs || []).map(j => `${(j.title || '').toLowerCase().trim()}|${(j.company || '').toLowerCase().trim()}`)
    );

    const jobsToInsert = [];
    for (const job of jobs) {
      const key = `${job.title?.toLowerCase().trim()}|${job.company?.toLowerCase().trim()}`;
      if (!existingKeys.has(key)) {
        jobsToInsert.push({
          user_id: userId,
          title: job.title || 'Untitled Role',
          company: job.company || 'Unknown Company',
          link: job.link || '',
          tailored_resume: job.tailoredResume || '',
          applied_at: job.date ? new Date(job.date).toISOString() : new Date().toISOString(),
          hiring_team: job.hiringTeam || null
        });
      }
    }

    if (jobsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('applied_jobs')
        .insert(jobsToInsert);
      
      if (insertErr) {
        if (insertErr.message?.includes('hiring_team') || insertErr.message?.includes('schema cache')) {
          console.warn('[Jd2Job Sync] Stale schema cache detected for hiring_team. Retrying sync without hiring_team column...');
          const fallbackJobs = jobsToInsert.map(({ hiring_team, ...rest }) => rest);
          const { error: retryErr } = await supabase
            .from('applied_jobs')
            .insert(fallbackJobs);
          if (retryErr) throw retryErr;
        } else {
          throw insertErr;
        }
      }
      console.log(`[Jd2Job Sync] Successfully inserted ${jobsToInsert.length} new jobs`);
    } else {
      console.log('[Jd2Job Sync] No new jobs to insert (all deduplicated)');
    }

    res.json({ success: true, inserted: jobsToInsert.length });
  } catch (err) {
    console.error('[Jd2Job Sync] Error:', err);
    if (err.code === '42P01' || err.code === 'PGRST205') {
      console.warn('⚠️ Table "applied_jobs" does not exist in Supabase. Please copy and run the applied_jobs SQL schema from supabase_schema.sql in your Supabase SQL Editor!');
      return res.status(400).json({ error: 'Database table "applied_jobs" not found. Please run the SQL schema in supabase_schema.sql in your Supabase Dashboard.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Fetch jobs for dashboard
app.get('/api/jd2job/jobs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applied_jobs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('applied_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, jobs: data || [] });
  } catch (err) {
    console.error('[Jd2Job Get] Error:', err);
    if (err.code === '42P01' || err.code === 'PGRST205') {
      console.warn('⚠️ Table "applied_jobs" does not exist in Supabase. Please copy and run the applied_jobs SQL schema from supabase_schema.sql in your Supabase SQL Editor!');
      return res.status(400).json({ error: 'Database table "applied_jobs" not found. Please run the SQL schema in supabase_schema.sql in your Supabase Dashboard.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Delete a job for dashboard
app.delete('/api/jd2job/jobs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('applied_jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err) {
    console.error('[Jd2Job Delete] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// In-memory tracking of active local user session
let activeLocalUserId = null;

app.post('/api/jd2job/local-session', requireAuth, (req, res) => {
  const { userId } = req.body;
  // Only allow setting your own user ID
  if (userId && userId !== req.user.id) {
    return res.status(403).json({ error: 'Cannot set session for another user' });
  }
  activeLocalUserId = req.user.id;
  res.json({ success: true, userId: activeLocalUserId });
});

app.get('/api/jd2job/local-session', requireAuth, (req, res) => {
  res.json({ success: true, userId: activeLocalUserId });
});

// ════════════════════════════════════════════════════════════════════════════
// EXTENSION API — server-side AI for the Jd2Job Chrome extension
// All routes require a Supabase JWT (Authorization: Bearer <token>).
// ════════════════════════════════════════════════════════════════════════════
const extensionService = require('./services/extensionService');

// Public health check (used by the extension to verify connectivity + API version)
app.get('/api/extension/health', (req, res) => {
  res.json({ status: 'ok', service: 'jd2job-extension-api', version: '2.0', time: new Date().toISOString() });
});

// Account snapshot for the extension popup (credits, plan)
app.get('/api/extension/me', requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, credits, plan_type, plan_expires_at')
      .eq('id', req.user.id)
      .single();

    if (error) return res.status(404).json({ error: 'Profile not found' });

    const now = new Date();
    const planExpired = profile.plan_expires_at && new Date(profile.plan_expires_at) < now;
    const effectivePlan = planExpired ? 'trial' : (profile.plan_type || 'trial');

    res.json({
      id: req.user.id,
      email: req.user.email,
      displayName: profile.display_name,
      credits: profile.credits,
      planType: effectivePlan,
      planExpiresAt: profile.plan_expires_at,
      unlimited: effectivePlan === 'monthly_unlimited' || effectivePlan === 'quarterly_unlimited',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deduct one credit for a paid action. Returns { ok, credits, reason }.
async function deductCreditFor(userId, reason, metadata = {}) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('credits, plan_type, plan_expires_at')
    .eq('id', userId)
    .single();

  // PGRST116 = zero rows → genuinely unknown user. Anything else (network,
  // DB outage) must not masquerade as "User not found".
  if (error) {
    if (error.code === 'PGRST116') return { ok: false, status: 404, reason: 'User not found' };
    console.error('[Credits] profile lookup failed:', error.message);
    return { ok: false, status: 503, reason: 'Account lookup failed. Please try again.' };
  }

  const now = new Date();
  const planExpired = profile.plan_expires_at && new Date(profile.plan_expires_at) < now;
  const unlimited = !planExpired &&
    (profile.plan_type === 'monthly_unlimited' || profile.plan_type === 'quarterly_unlimited');

  if (unlimited) return { ok: true, credits: profile.credits, unlimited: true };

  if ((profile.credits || 0) < 1) {
    return { ok: false, status: 402, reason: 'Insufficient credits. Please upgrade your plan or top up.' };
  }

  // Atomic decrement: only update if credits still >= 1 (prevents TOCTOU double-spend)
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ credits: profile.credits - 1, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .gte('credits', 1)             // guard: don't decrement below 0
    .select('credits')
    .single();

  // If no row matched, another concurrent request already spent the credit
  if (!updated) {
    return { ok: false, status: 402, reason: 'Credit already consumed. Please try again.' };
  }
  if (updateError) return { ok: false, status: 500, reason: updateError.message };

  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -1,
    reason,
    metadata,
  });

  return { ok: true, credits: updated.credits };
}

// Generate a JD-tailored resume. Costs 1 credit (free on unlimited plans).
app.post('/api/extension/tailor-resume', requireAuth, rateLimiter(10, 60000), async (req, res) => {
  const { jobDescription, jobTitle, companyName, baseResumeText } = req.body || {};

  if (!jobDescription || !baseResumeText) {
    return res.status(400).json({ error: 'jobDescription and baseResumeText are required' });
  }

  try {
    const deduction = await deductCreditFor(req.user.id, 'tailored_resume', {
      jobTitle: (jobTitle || '').slice(0, 200),
      companyName: (companyName || '').slice(0, 200),
    });

    if (!deduction.ok) {
      return res.status(deduction.status || 500).json({ error: deduction.reason });
    }

    const result = await extensionService.tailorResume({
      baseResumeText,
      jobDescription,
      jobTitle,
      companyName,
    });

    res.json({ success: true, ...result, credits: deduction.credits });
  } catch (err) {
    console.error('[Extension] tailor-resume error:', err.message);
    // Refund the credit — user was already charged in deductCreditFor above
    try {
      await supabase
        .from('profiles')
        .update({ credits: deduction.credits + 1, updated_at: new Date().toISOString() })
        .eq('id', req.user.id);
      await supabase.from('credit_transactions').insert({
        user_id: req.user.id,
        amount: 1,
        reason: 'refund_tailored_resume_failed',
        metadata: { error: err.message, jobTitle: (jobTitle || '').slice(0, 200) },
      });
    } catch (refundErr) {
      console.error('[Credits] Refund failed:', refundErr.message);
    }
    res.status(502).json({ error: err.message || 'Failed to generate tailored resume' });
  }
});

// Generate a short answer for an application form question. Free (rate limited).
app.post('/api/extension/answer', requireAuth, rateLimiter(30, 60000), async (req, res) => {
  const { question, fieldType, baseResumeText } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const result = await extensionService.generateAnswer({ question, fieldType, baseResumeText });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Extension] answer error:', err.message);
    res.status(502).json({ error: err.message || 'Failed to generate answer' });
  }
});
