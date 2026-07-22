/**
 * E2E verification for Jd2Job backend — runs against a locally booted server.
 *
 * Covers:
 *  A. REST: /api/interview/next-question, /api/interview/evaluate-answer,
 *           /api/deepseek/chat (SSE), /api/extension/tailor-resume, /api/extension/answer
 *  B. STT WebSocket /api/deepgram with real speech PCM (expects transcript keywords)
 *  C. Agent WebSocket /api/deepgram-agent — logs every upstream message type,
 *     verifies the think.prompt reaches the agent (marker word PINEAPPLE),
 *     and reports whether audio arrives as binary frames or JSON 'Audio'.
 *
 * Usage: PORT=3996 node tests/e2e-full.js
 */
const fs = require('fs');
const WebSocket = require('ws');

const BASE = `http://localhost:${process.env.PORT || 3996}`;
const WS_BASE = BASE.replace(/^http/, 'ws');
const TOKEN = 'mock-token-e2e-user';
const AUTH = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

const results = [];
function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ── WAV → raw PCM (parse the data chunk) ────────────────────────────────────
function wavToPcm(path) {
  const buf = fs.readFileSync(path);
  let offset = 12; // skip RIFF header
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') return buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error('No data chunk in WAV');
}

async function post(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
  return res;
}

// ── Phase A: REST round-trips ───────────────────────────────────────────────
async function phaseA() {
  console.log('\n── Phase A: REST endpoints ──');

  try {
    const res = await post('/api/interview/next-question', {
      interviewType: 'Frontend React Developer (Technical)',
      difficulty: 'medium',
      resumeData: 'Kishore: 5 years React/Node, led monolith→microservices migration.',
      jobDescription: 'Senior React Engineer, requires TypeScript and system design.',
      previousQuestions: [],
      questionNumber: 1,
    });
    const data = await res.json();
    report('A1 next-question', res.ok && !!data.question, data.question?.slice(0, 80) || JSON.stringify(data).slice(0, 120));
  } catch (e) { report('A1 next-question', false, e.message); }

  try {
    const res = await post('/api/interview/evaluate-answer', {
      question: 'How do you handle state in large React apps?',
      userAnswer: 'I use context for low-frequency global state and Zustand for client state, with server state in React Query.',
      resumeData: 'Kishore: 5 years React/Node.',
      difficulty: 'medium',
    });
    const data = await res.json();
    report('A2 evaluate-answer', res.ok && (data.score !== undefined || data.feedback), JSON.stringify(data).slice(0, 100));
  } catch (e) { report('A2 evaluate-answer', false, e.message); }

  try {
    const res = await post('/api/deepseek/chat', {
      provider: 'deepseek', model: 'deepseek-chat', stream: true,
      messages: [{ role: 'user', content: 'Reply with exactly: E2E_STREAM_OK' }],
    });
    let body = '';
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; body += dec.decode(value, { stream: true }); }
    // Accumulate assistant text from SSE delta chunks (content is split across frames)
    let streamed = '';
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      try {
        const j = JSON.parse(line.slice(5).trim());
        streamed += j.choices?.[0]?.delta?.content || j.choices?.[0]?.message?.content || '';
      } catch {}
    }
    report('A3 deepseek/chat SSE', res.ok && streamed.includes('E2E_STREAM_OK'), `streamed="${streamed.slice(0, 80)}"`);
  } catch (e) { report('A3 deepseek/chat SSE', false, e.message); }

  try {
    const res = await post('/api/extension/tailor-resume', {
      baseResumeText: 'Kishore — Software Engineer. React, Node.js, TypeScript. 5 years.',
      jobDescription: 'Senior React Engineer at Acme. TypeScript, system design, microservices.',
    });
    const data = await res.json();
    report('A4 extension tailor-resume', res.ok && !!data.tailoredResume, `status ${res.status} ats=${data.atsScore ?? 'n/a'} ${data.error || ''}`.slice(0, 110));
  } catch (e) { report('A4 extension tailor-resume', false, e.message); }

  try {
    const res = await post('/api/extension/answer', {
      question: 'Why are you a good fit for this role?',
      jobDescription: 'Senior React Engineer at Acme.',
      baseResumeText: 'Kishore — React/Node, 5 years.',
    });
    const data = await res.json();
    report('A5 extension answer', res.ok && !!data.answer, `status ${res.status} ${(data.answer || data.error || '').slice(0, 90)}`);
  } catch (e) { report('A5 extension answer', false, e.message); }
}

// ── Phase B: STT WebSocket with real speech ─────────────────────────────────
function phaseB(pcm) {
  return new Promise((resolve) => {
    console.log('\n── Phase B: /api/deepgram STT with real speech ──');
    const params = new URLSearchParams({
      model: 'nova-2', language: 'en-US', smart_format: 'true', punctuate: 'true',
      interim_results: 'true', endpointing: '150', encoding: 'linear16',
      sample_rate: '16000', channels: '1', token: TOKEN,
    });
    const ws = new WebSocket(`${WS_BASE}/api/deepgram?${params}`);
    let finals = '';
    const done = (ok, detail) => { try { ws.close(); } catch {} report('B1 STT transcript', ok, detail); resolve(); };

    const kill = setTimeout(() => done(false, `timeout. finals="${finals.slice(0, 100)}"`), 45000);

    ws.on('open', () => {
      // stream 100ms chunks (3200 bytes) in real time
      let off = 0;
      const iv = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) { clearInterval(iv); return; }
        if (off >= pcm.length) {
          clearInterval(iv);
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          return;
        }
        ws.send(pcm.subarray(off, off + 3200));
        off += 3200;
      }, 100);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Results') {
          const t = msg.channel?.alternatives?.[0]?.transcript || '';
          if (msg.is_final && t) {
            finals += (finals ? ' ' : '') + t;
            console.log('  [STT final]', t);
          }
          if (/kishore/i.test(finals) && /react/i.test(finals)) {
            clearTimeout(kill); done(true, `"${finals.slice(0, 120)}"`);
          }
        } else if (msg.type === 'Error') {
          clearTimeout(kill); done(false, msg.description || 'upstream error');
        }
      } catch {}
    });
    ws.on('error', (e) => { clearTimeout(kill); done(false, e.message); });
    ws.on('close', (code, reason) => {
      clearTimeout(kill);
      if (!results.find(r => r.name === 'B1 STT transcript')) {
        done(finals.length > 10, `closed ${code} ${reason}. finals="${finals.slice(0, 100)}"`);
      }
    });
  });
}

// ── Phase C: Voice Agent WebSocket ──────────────────────────────────────────
function phaseC(pcm) {
  return new Promise((resolve) => {
    console.log('\n── Phase C: /api/deepgram-agent voice agent ──');
    const ws = new WebSocket(`${WS_BASE}/api/deepgram-agent?agent=true&token=${TOKEN}`);
    const seenTypes = new Map();
    let binaryFrames = 0, binaryBytes = 0, markerSeen = false, settingsApplied = false;
    let audioTimer = null;
    // Latency instrumentation
    let tLastUserAudioSent = 0, tFirstAgentAudio = 0, tFirstAgentText = 0, tSettingsApplied = 0;

    const done = (ok, detail) => {
      if (audioTimer) clearInterval(audioTimer);
      try { ws.close(); } catch {}
      console.log('  Upstream message types seen:', JSON.stringify(Object.fromEntries(seenTypes)));
      if (tLastUserAudioSent && (tFirstAgentAudio || tFirstAgentText)) {
        const first = Math.min(tFirstAgentAudio || Infinity, tFirstAgentText || Infinity);
        console.log(`  ⏱ turn latency (last user audio → first agent response): ${first - tLastUserAudioSent}ms`);
      }
      report('C1 agent handshake (Welcome/SettingsApplied)', settingsApplied, '');
      report('C2 agent prompt delivered (PINEAPPLE marker)', markerSeen, '');
      report('C3 agent audio frames received', binaryFrames > 0, `${binaryFrames} frames, ${binaryBytes} bytes`);
      report('C4 agent full run', ok, detail);
      resolve();
    };
    const kill = setTimeout(() => done(settingsApplied && binaryFrames > 0, 'timeout reached'), 60000);

    ws.on('open', () => {
      const listenModel = process.env.LISTEN_MODEL || 'nova-2';
      const settings = {
        type: 'Settings',
        audio: {
          input: { encoding: 'linear16', sample_rate: 16000 },
          output: { encoding: 'linear16', sample_rate: 16000, container: 'none' },
        },
        agent: {
          language: 'en',
          listen: { provider: { type: 'deepgram', model: listenModel } },
          think: {
            provider: { type: 'open_ai', model: 'gpt-4o-mini' },
            prompt: 'You are a technical interviewer. Begin EVERY response with the exact word PINEAPPLE, then ask one short interview question.',
          },
          speak: { provider: { type: 'deepgram', model: 'aura-2-asteria-en' } },
          greeting: 'PINEAPPLE. Welcome to your mock interview.',
        },
      };
      console.log(`  → sending Settings (listen=${listenModel}, think.prompt + greeting)`);
      ws.send(JSON.stringify(settings));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryFrames++; binaryBytes += data.length;
        if (tLastUserAudioSent && !tFirstAgentAudio) tFirstAgentAudio = Date.now();
        return;
      }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      seenTypes.set(msg.type, (seenTypes.get(msg.type) || 0) + 1);
      if (msg.type === 'Welcome') console.log('  ← Welcome');
      if (msg.type === 'SettingsApplied') {
        settingsApplied = true;
        tSettingsApplied = Date.now();
        console.log('  ← SettingsApplied — streaming user speech');
        const silence = Buffer.alloc(3200); // keep the mic stream alive after speech, like a real browser
        let off = 0, silentChunks = 0;
        audioTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) { clearInterval(audioTimer); return; }
          if (off >= pcm.length) {
            silentChunks++;
            if (silentChunks === 1) { tLastUserAudioSent = Date.now(); console.log('  → user speech fully sent, streaming silence (mic stays open)'); }
            ws.send(silence);
            return;
          }
          ws.send(pcm.subarray(off, off + 3200));
          off += 3200;
        }, 100);
      }
      const text = JSON.stringify(msg);
      if (/PINEAPPLE/i.test(text)) markerSeen = true;
      if (msg.type === 'ConversationText' || msg.type === 'Transcript') {
        if (msg.role === 'assistant' && tLastUserAudioSent && !tFirstAgentText) tFirstAgentText = Date.now();
        console.log(`  ← ${msg.type}:`, (msg.content || msg.transcript || '').slice(0, 100), msg.role ? `(${msg.role})` : '');
      }
      if (msg.type === 'Error') console.log('  ← Error:', msg.description || text.slice(0, 150));
      if (msg.type === 'AgentAudioDone' && tLastUserAudioSent && (markerSeen || tFirstAgentText || tFirstAgentAudio)) {
        clearTimeout(kill);
        done(true, 'agent answered the user turn');
      }
    });
    ws.on('error', (e) => { clearTimeout(kill); done(false, e.message); });
    ws.on('close', (code, reason) => {
      clearTimeout(kill);
      if (!results.find(r => r.name === 'C4 agent full run')) {
        done(false, `closed early ${code} ${reason}`);
      }
    });
  });
}

(async () => {
  const pcm = wavToPcm('/tmp/jd2job_speech.wav');
  console.log(`PCM fixture: ${pcm.length} bytes (~${(pcm.length / 32000).toFixed(1)}s @16kHz)`);

  await phaseA();
  await phaseB(pcm);
  await phaseC(pcm);

  const fails = results.filter(r => !r.ok);
  console.log(`\n══ E2E SUMMARY: ${results.length - fails.length}/${results.length} passed ══`);
  process.exit(fails.length ? 1 : 0);
})();
