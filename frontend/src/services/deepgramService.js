/**
 * deepgramService - Real-time speech-to-text via Deepgram WebSocket
 *
 * Audio: ScriptProcessor → downsample to 16 kHz → linear16 PCM → Deepgram
 * Always using 16 kHz eliminates any AudioContext sample-rate ambiguity.
 */

import { getSession } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEEPGRAM_WS    = API_BASE.replace(/^http/, 'ws') + '/api/deepgram';
const TARGET_SR      = 16000;

export class DeepgramTranscriber {
  constructor({ onPartial, onFinal, onStatus, onError, forceSpeakerLabel = null }) {
    this.onPartial         = onPartial;
    this.onFinal           = onFinal;
    this.onStatus          = onStatus;
    this.onError           = onError;
    this.forceSpeakerLabel = forceSpeakerLabel;

    this.ws         = null;
    this.keepAliveInterval = null;
    this.processor  = null;
    this.analyser   = null;
    this.sourceNode = null;
    this.gainNode   = null;
    this.audioCtx   = null;
    this.stream     = null;
    this.audioData  = new Uint8Array(0);
    this._lastLog   = 0;
    this._nativeSR  = 48000; // updated once AudioContext is created
  }

  async start(stream) {
    this.stream = stream;

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    this._nativeSR = this.audioCtx.sampleRate;
    console.log(`[Audio] AudioContext sample rate: ${this._nativeSR} Hz`);

    await this._connect();
  }

  async _connect() {
    const session = await getSession();
    const token = session?.access_token;
    if (!token) {
      const msg = 'Not authenticated — please sign in to use voice transcription.';
      this.onError?.(msg);
      throw new Error(msg);
    }

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model:           'nova-2',
        language:        'en-US',
        smart_format:    'true',
        punctuate:       'true',
        interim_results: 'true',
        endpointing:     '150',
        encoding:        'linear16',
        sample_rate:     String(TARGET_SR),
        channels:        '1',
        keepalive:       'true',
        diarize:         this.forceSpeakerLabel ? 'false' : 'true',
        token,
      });

      console.log(`[Deepgram] Connecting to ${DEEPGRAM_WS}?${params}`);
      this.ws = new WebSocket(`${DEEPGRAM_WS}?${params}`);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[Deepgram] WebSocket OPEN — starting audio pipeline');
        this.onStatus?.('connected');
        this._startPipeline();
        
        // Prevent Deepgram timeout by sending KeepAlive periodically
        this.keepAliveInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 5000);
        
        resolve();
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'Results') {
            const alt        = msg.channel?.alternatives?.[0];
            const transcript = alt?.transcript?.trim() ?? '';
            if (transcript) {
              const speaker      = alt.words?.[0]?.speaker ?? 0;
              const label        = this.forceSpeakerLabel ?? (speaker === 0 ? 'You' : 'Interviewer');
              console.log(`[Deepgram] ${msg.is_final ? 'FINAL' : 'PARTIAL'} (${label}): "${transcript}"`);
              if (msg.is_final) this.onFinal?.(transcript, label);
              else              this.onPartial?.(transcript, label);
            }
          } else if (msg.type === 'Metadata') {
            console.log('[Deepgram] Metadata:', JSON.stringify(msg).slice(0, 120));
          } else if (msg.type === 'Error') {
            console.error('[Deepgram] Server error:', msg);
            this.onError?.(`Deepgram error: ${msg.description || msg.message || 'unknown'}`);
          } else {
            console.log('[Deepgram] Message type:', msg.type);
          }
        } catch (e) {
          console.warn('[Deepgram] Non-JSON message (ignored):', typeof event.data);
        }
      };

      this.ws.onerror = () => {
        const msg = 'WebSocket error — is the backend running on port 3001?';
        console.error('[Deepgram]', msg);
        this.onError?.(msg);
        reject(new Error(msg));
      };

      this.ws.onclose = (ev) => {
        this.onStatus?.('disconnected');
        if (ev.code !== 1000 && ev.code !== 1001) {
          const reason = ev.reason || `code ${ev.code}`;
          console.error(`[Deepgram] Abnormal close — ${reason}`);
          this.onError?.(`Deepgram closed: ${reason}`);
        }
      };
    });
  }

  _startPipeline() {
    try {
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);

      // Volume meter
      this.analyser         = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.audioData        = new Uint8Array(this.analyser.frequencyBinCount);
      this.sourceNode.connect(this.analyser);

      // Downsample ratio: e.g. 48000→16000 = 3, 44100→16000 ≈ 2.75 (we average)
      const ratio = this._nativeSR / TARGET_SR;

      // ScriptProcessor captures raw float32 from the mic
      // 2048 samples @ 48kHz = ~42ms per chunk (vs 85ms with 4096) — lower latency
      this.processor = this.audioCtx.createScriptProcessor(2048, 1, 1);
      if (typeof window !== 'undefined') {
        window._activeAudioProcessor = this.processor;
      }

      this.processor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;

        const input      = e.inputBuffer.getChannelData(0); // Float32 at _nativeSR
        const outLen     = Math.floor(input.length / ratio);
        const int16      = new Int16Array(outLen);

        // Average-downsample to TARGET_SR
        for (let i = 0; i < outLen; i++) {
          const start  = Math.floor(i * ratio);
          const end    = Math.floor((i + 1) * ratio);
          let   sum    = 0;
          for (let j = start; j < end && j < input.length; j++) sum += input[j];
          const avg    = sum / (end - start);
          int16[i]     = Math.max(-32768, Math.min(32767, avg * 32768));
        }

        try {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(int16);
          }
        } catch (sendErr) {
          console.error('[Deepgram WS Send Error]:', sendErr);
        }

        if (!this._lastLog || Date.now() - this._lastLog > 2000) {
          console.log(`[Audio] Sending PCM: ${outLen} samples @ ${TARGET_SR}Hz, peak=${this.getVolume().toFixed(3)}, bytes=${int16.buffer.byteLength}`);
          this._lastLog = Date.now();
        }
      };

      // Connect: source → processor → silent gain → destination
      // (destination connection required for onaudioprocess to fire in Chrome)
      this.gainNode              = this.audioCtx.createGain();
      this.gainNode.gain.value   = 0;
      this.sourceNode.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      console.log(`[Audio] Pipeline ready: ${this._nativeSR}Hz → downsample ${ratio.toFixed(2)}x → ${TARGET_SR}Hz linear16`);
    } catch (err) {
      console.error('[Audio] Pipeline failed:', err);
      this.onError?.(`Audio pipeline error: ${err.message}`);
    }
  }

  getVolume() {
    if (!this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.audioData);
    let sum = 0;
    for (let i = 0; i < this.audioData.length; i++) sum += this.audioData[i];
    return sum / (this.audioData.length * 255);
  }

  stop() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    try { this.processor?.disconnect();  } catch {}
    try { this.gainNode?.disconnect();   } catch {}
    try { this.sourceNode?.disconnect(); } catch {}
    try { this.audioCtx?.close();        } catch {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      this.ws.close(1000, 'Session ended');
    }
    this.ws = null;

    if (typeof window !== 'undefined') {
      window._activeAudioProcessor = null;
    }

    this.stream?.getTracks().forEach(t => t.stop());
    this.processor  = null;
    this.gainNode   = null;
    this.analyser   = null;
    this.sourceNode = null;
    this.stream     = null;
  }
}

/* ── Stream helpers ──────────────────────────────────────────────────────── */

export async function getMicStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
      channelCount:     1,
      sampleRate:       TARGET_SR,   // hint to OS — browser may honour or ignore
    },
    video: false,
  });
}

export async function getDisplayStream() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 5, max: 10 } },
    audio: true,
    systemAudio: 'include',
  });
}

export function getAudioOnlyStream(displayStream) {
  const tracks = displayStream.getAudioTracks();
  if (tracks.length === 0) return null;
  return new MediaStream(tracks);
}
