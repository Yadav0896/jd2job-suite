import { getSession } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const DEEPGRAM_AGENT_URL = API_BASE.replace(/^http/, 'ws') + '/api/deepgram-agent';

export const VOICE_OPTIONS = {
  'aura-2-asteria-en': { name: 'Asteria', gender: 'female', style: 'professional' },
  'aura-2-astra-en': { name: 'Astra', gender: 'female', style: 'friendly' },
  'aura-2-luna-en': { name: 'Luna', gender: 'female', style: 'warm' },
  'aura-2-orphus-en': { name: 'Orpheus', gender: 'male', style: 'authoritative' },
  'aura-2-ares-en': { name: 'Ares', gender: 'male', style: 'calm' }
};

export const LLM_PROVIDERS = ['open_ai', 'anthropic', 'google', 'deepseek'];
export const DEFAULT_LLM = 'open_ai';
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';
// nova-2 measured faster end-of-turn than flux-general-en in live tests
// (1132ms vs 2645ms turn latency). Keep nova-2 as the default.
export const DEFAULT_STT_MODEL = 'nova-2';
export const DEFAULT_TTS_MODEL = 'aura-2-asteria-en';

/**
 * Deepgram Voice Agent client.
 *
 * Protocol (verified end-to-end against the live API):
 *  - Client → server: one JSON `Settings` message with nested
 *    `audio.input` / `audio.output` (output must use container: 'none'),
 *    then raw binary linear16 PCM frames from the mic at 16kHz.
 *  - Server → client: JSON control messages (Welcome, SettingsApplied,
 *    ConversationText { role, content }, UserStartedSpeaking, AgentThinking,
 *    AgentAudioDone, History, LatencyReport, Error) and agent speech as
 *    raw binary PCM frames at audio.output.sample_rate.
 *  - There is NO StartConversation / StopConversation / Interrupt message —
 *    the agent starts when Settings is applied and barge-in is detected
 *    upstream (UserStartedSpeaking); we only need to stop local playback.
 */
export class DeepgramVoiceAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.llmProvider = options.llmProvider || DEFAULT_LLM;
    this.llmModel = options.llmModel || DEFAULT_LLM_MODEL;
    this.sttModel = options.sttModel || DEFAULT_STT_MODEL;
    this.ttsModel = options.ttsModel || DEFAULT_TTS_MODEL;
    this.systemPrompt = options.systemPrompt || '';
    this.greeting = options.greeting || '';

    this.onTranscript = options.onTranscript || (() => {});
    this.onAgentResponse = options.onAgentResponse || (() => {});
    this.onSpeakingChanged = options.onSpeakingChanged || (() => {});
    this.onListeningChanged = options.onListeningChanged || (() => {});
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onError = options.onError || ((err) => console.error('Deepgram Agent error:', err));
    this.onVolumeChanged = options.onVolumeChanged || (() => {});

    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.isConnected = false;
    this.isConversationActive = false;
    this.isSpeaking = false;
    this.isListening = false;
    this.audioQueue = [];
    this.isPlayingAudio = false;
    this.sessionReady = false;
    this.pendingStartConversation = false;
    this.keepaliveInterval = null;
    this.connectResolve = null;
    this.connectReject = null;
    this.playbackContext = null;
    this.currentSource = null;
    this.speechEndTimer = null;

    // Auto-reconnect for resilience during long sessions
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectBaseDelay = 800; // ms — exponential backoff
    this._reconnectTimer = null;
    this._intentionalDisconnect = false;
    this._lastSettings = null; // Replay settings on reconnect
  }

  getAgentConfig() {
    const agent = {
      language: 'en',
      listen: {
        provider: { type: 'deepgram', model: this.sttModel }
      },
      think: {
        provider: { type: this.llmProvider, model: this.llmModel },
        prompt: this.systemPrompt
      },
      speak: {
        provider: { type: 'deepgram', model: this.ttsModel }
      }
    };
    if (this.greeting) {
      agent.greeting = this.greeting;
    }
    return {
      type: 'Settings',
      audio: {
        input: { encoding: 'linear16', sample_rate: 16000 },
        output: { encoding: 'linear16', sample_rate: 16000, container: 'none' }
      },
      agent
    };
  }

  async connect() {
    this._intentionalDisconnect = false;
    this._cancelReconnect();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('Already connected to Deepgram Agent');
      return true;
    }

    try {
      const session = await getSession();
      const token = session?.access_token;
      if (!token) {
        const err = new Error('Not authenticated — please sign in to use the voice agent.');
        this.onError(err);
        return false;
      }

      return new Promise((resolve, reject) => {
        const wsUrl = new URL(DEEPGRAM_AGENT_URL);
        wsUrl.searchParams.set('agent', 'true');
        wsUrl.searchParams.set('token', token);

        this.ws = new WebSocket(wsUrl.toString());
        // Agent speech arrives as raw binary PCM frames, not JSON.
        this.ws.binaryType = 'arraybuffer';
        this.connectResolve = resolve;
        this.connectReject = reject;

        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timed out'));
          if (this.ws) {
            this.ws.close(1000, 'Timeout');
          }
        }, 15000);

        this.ws.onopen = () => {
          console.log('Deepgram Agent: Connected, sending Settings...');
          this.ws.send(JSON.stringify(this.getAgentConfig()));
          this.sessionReady = false;
        };

        this.ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            this.handleMessage(event.data);
          } else {
            // Binary frame = agent speech (raw linear16 PCM @ 16kHz)
            this.queueAudio(event.data);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error('Deepgram Agent WebSocket error:', error);
          this.onError(new Error('WebSocket connection error'));
          reject(error);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log('Deepgram Agent: Disconnected', event.code, event.reason);
          this.stopKeepalive();
          this.isConnected = false;
          this.sessionReady = false;
          this.isConversationActive = false;
          this.isSpeaking = false;
          this.isListening = false;
          if (this.connectResolve) {
            this.connectResolve(false);
            this.connectResolve = null;
            this.connectReject = null;
          }
          this.onDisconnected();

          // Auto-reconnect for unexpected disconnects (network blips, server restarts)
          if (!this._intentionalDisconnect && event.code !== 1000) {
            this._attemptReconnect();
          }
          this._intentionalDisconnect = false;
        };
      });
    } catch (error) {
      console.error('Failed to connect to Deepgram Agent:', error);
      this.onError(error);
      return false;
    }
  }

  disconnect() {
    this._intentionalDisconnect = true;
    this._cancelReconnect();
    this.teardownMic();
    this.stopPlayback();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }

    // Close audio contexts to prevent browser-level resource exhaustion
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) { /* ignore */ }
      this.audioContext = null;
    }
    if (this.playbackContext && this.playbackContext.state !== 'closed') {
      try { this.playbackContext.close(); } catch (e) { /* ignore */ }
      this.playbackContext = null;
    }

    this.stopKeepalive();
    this.isConnected = false;
    this.sessionReady = false;
    this.pendingStartConversation = false;
    this.isConversationActive = false;
    this.isSpeaking = false;
    this.isListening = false;
  }

  // ── Auto‑reconnect for long‑session resilience ───────────────────────────
  _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async _attemptReconnect() {
    if (this._intentionalDisconnect) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.warn('[Agent] Max reconnect attempts reached — giving up.');
      this.onError(new Error('Connection lost. Please restart the session.'));
      return;
    }

    this._reconnectAttempts++;
    const delay = this._reconnectBaseDelay * Math.pow(2, this._reconnectAttempts - 1); // 0.8s, 1.6s, 3.2s...
    console.log(`[Agent] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        const ok = await this.connect();
        if (ok) {
          console.log('[Agent] ✓ Reconnected successfully');
          this._reconnectAttempts = 0;
          // Re-establish audio if mic was active before disconnect
          if (this.mediaStream && this.mediaStream.active) {
            await this.setupAudio();
          }
          // If conversation was active, restart it
          if (this.isConversationActive) {
            this.startConversation();
          }
        } else {
          // connect() already called onError — try again
          this._attemptReconnect();
        }
      } catch (err) {
        console.warn('[Agent] Reconnect attempt failed:', err.message);
        this._attemptReconnect();
      }
    }, delay);
  }

  startKeepalive() {
    this.stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 30000);
  }

  stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  async startConversation() {
    if (!this.isConnected || !this.ws) {
      console.error('Not connected to Deepgram Agent');
      return false;
    }

    if (!this.sessionReady) {
      console.log('Deepgram Agent: Waiting for SettingsApplied, queuing start...');
      this.pendingStartConversation = true;
      return true;
    }

    return this.beginMicStreaming();
  }

  async beginMicStreaming() {
    try {
      await this.setupAudio();
      console.log('Deepgram Agent: Mic streaming started');
      this.isConversationActive = true;
      return true;
    } catch (error) {
      console.error('Failed to start conversation:', error);
      this.onError(error);
      return false;
    }
  }

  stopConversation() {
    this.teardownMic();
    this.isConversationActive = false;
    this.isListening = false;
    this.onListeningChanged(false);
  }

  teardownMic() {
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (e) {}
      this.processor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  async setupAudio() {
    try {
      // Force 16kHz so the PCM we ship matches audio.input.sample_rate.
      // (A default-rate context would send 44.1/48kHz audio mislabeled as
      // 16kHz → upstream hears slowed-down speech.)
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      try {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      } catch (e) {
        this.audioContext = new AudioCtx();
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (this.isConversationActive && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);

          // Calculate volume (RMS)
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          const volume = Math.min(100, Math.floor(rms * 400));
          if (this.onVolumeChanged) this.onVolumeChanged(volume);

          const pcmData = this.convertFloatTo16BitPCM(inputData);
          this.ws.send(pcmData);
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      return true;
    } catch (error) {
      console.error('Failed to setup audio:', error);
      throw error;
    }
  }

  convertFloatTo16BitPCM(inputArray) {
    // Resample (nearest-neighbor) if the context refused 16kHz
    const ratio = this.audioContext ? this.audioContext.sampleRate / 16000 : 1;
    const outLen = ratio > 1 ? Math.floor(inputArray.length / ratio) : inputArray.length;
    const outputArray = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const idx = ratio > 1 ? Math.floor(i * ratio) : i;
      const s = Math.max(-1, Math.min(1, inputArray[idx]));
      outputArray[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return outputArray;
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'Welcome':
          console.log('Deepgram Agent: Session open, waiting for SettingsApplied');
          break;

        case 'SettingsApplied':
          console.log('Deepgram Agent: Settings applied, session ready');
          this.sessionReady = true;
          this.isConnected = true;
          this.startKeepalive();
          if (this.connectResolve) {
            this.connectResolve(true);
            this.connectResolve = null;
            this.connectReject = null;
          }
          this.onConnected();
          if (this.pendingStartConversation) {
            this.pendingStartConversation = false;
            this.beginMicStreaming();
          }
          break;

        case 'ConversationText':
          // { role: 'user' | 'assistant', content: string }
          if (message.role === 'user') {
            this.isListening = false;
            this.onListeningChanged(false);
            this.onTranscript(message.content || '', true);
          } else if (message.role === 'assistant') {
            this.onAgentResponse(message.content || '');
          }
          break;

        case 'UserStartedSpeaking':
          // Barge-in: stop agent playback locally; upstream handles the rest.
          this.stopPlayback();
          this.isListening = true;
          this.onListeningChanged(true);
          break;

        case 'AgentThinking':
        case 'AgentAudioDone':
        case 'History':
        case 'LatencyReport':
          // Informational only.
          break;

        case 'Error':
          console.error('Deepgram Agent error:', message.description || message.message);
          this.onError(new Error(message.description || message.message || 'Agent error'));
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  }

  getPlaybackContext() {
    if (!this.playbackContext) {
      this.playbackContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.playbackContext.state === 'suspended') {
      try { this.playbackContext.resume(); } catch (e) {}
    }
    return this.playbackContext;
  }

  stopPlayback() {
    this.audioQueue = [];
    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {}
      this.currentSource = null;
    }
    this.isPlayingAudio = false;
    this.isSpeaking = false;
    this.onSpeakingChanged(false);
  }

  queueAudio(arrayBuffer) {
    try {
      // Raw linear16 PCM @ 16kHz mono → float samples for WebAudio
      const int16Samples = new Int16Array(arrayBuffer);
      const floatSamples = new Float32Array(int16Samples.length);
      for (let i = 0; i < int16Samples.length; i++) {
        floatSamples[i] = int16Samples[i] / 32768.0;
      }

      this.audioQueue.push(floatSamples);
      this.processAudioQueue();
    } catch (error) {
      console.error('Failed to queue audio:', error);
    }
  }

  async processAudioQueue() {
    if (this.isPlayingAudio) return;
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      // Audio frames stream in bursts — debounce the "stopped speaking"
      // signal so the UI doesn't flicker between frames of the same turn.
      if (this.speechEndTimer) clearTimeout(this.speechEndTimer);
      this.speechEndTimer = setTimeout(() => {
        this.speechEndTimer = null;
        if (!this.isPlayingAudio && this.audioQueue.length === 0) {
          this.isSpeaking = false;
          this.onSpeakingChanged(false);
        }
      }, 300);
      return;
    }

    if (this.speechEndTimer) {
      clearTimeout(this.speechEndTimer);
      this.speechEndTimer = null;
    }

    const floatSamples = this.audioQueue.shift();
    this.isPlayingAudio = true;
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.onSpeakingChanged(true);
    }

    try {
      const audioContext = this.getPlaybackContext();
      const audioBuffer = audioContext.createBuffer(1, floatSamples.length, 16000);
      audioBuffer.copyToChannel(floatSamples, 0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      this.currentSource = source;

      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
          this.isPlayingAudio = false;
          this.processAudioQueue();
        }
      };

      source.start(0);
    } catch (error) {
      console.error('Failed to process audio queue chunk:', error);
      this.isPlayingAudio = false;
      this.processAudioQueue();
    }
  }

  injectUserMessage(text) {
    this.stopPlayback();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'InjectUserMessage',
        content: text
      }));
    }
  }

  interrupt() {
    // Barge-in is detected upstream; locally we just stop playback.
    this.stopPlayback();
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  setVoice(voiceModel) {
    this.ttsModel = voiceModel;
  }

  getIsSpeaking() {
    return this.isSpeaking;
  }

  getIsListening() {
    return this.isListening;
  }
}

let agentInstance = null;

export function createVoiceAgent(options) {
  if (agentInstance) {
    agentInstance.disconnect();
  }
  agentInstance = new DeepgramVoiceAgent(options);
  return agentInstance;
}

export function getVoiceAgent() {
  return agentInstance;
}

export function destroyVoiceAgent() {
  if (agentInstance) {
    agentInstance.disconnect();
    agentInstance = null;
  }
}

export default {
  DeepgramVoiceAgent,
  createVoiceAgent,
  getVoiceAgent,
  destroyVoiceAgent,
  VOICE_OPTIONS,
  LLM_PROVIDERS
};
