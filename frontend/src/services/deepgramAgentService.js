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
export const DEFAULT_STT_MODEL = 'flux-general-en';
export const DEFAULT_TTS_MODEL = 'aura-2-asteria-en';

export class DeepgramVoiceAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.llmProvider = options.llmProvider || DEFAULT_LLM;
    this.llmModel = options.llmModel || DEFAULT_LLM_MODEL;
    this.sttModel = options.sttModel || DEFAULT_STT_MODEL;
    this.ttsModel = options.ttsModel || DEFAULT_TTS_MODEL;
    this.systemPrompt = options.systemPrompt || '';
    
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
  }

  getAgentConfig() {
    return {
      type: 'Settings',
      audio: {
        encoding: 'linear16',
        sample_rate: 16000,
        layout: 'mono'
      },
      agent: {
        think: {
          provider: {
            type: this.llmProvider,
            model: this.llmModel
          }
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: this.ttsModel
          }
        },
        listen: {
          provider: {
            type: 'deepgram',
            model: this.sttModel
          }
        }
      }
    };
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('Already connected to Deepgram Agent');
      return true;
    }

    try {
      return new Promise((resolve, reject) => {
        const wsUrl = new URL(DEEPGRAM_AGENT_URL);
        wsUrl.searchParams.set('agent', 'true');
        
        this.ws = new WebSocket(wsUrl.toString());
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
          
          const config = this.getAgentConfig();
          console.log('Sending config:', JSON.stringify(config, null, 2));
          this.ws.send(JSON.stringify(config));
          
          this.sessionReady = false;
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
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
        };
      });
    } catch (error) {
      console.error('Failed to connect to Deepgram Agent:', error);
      this.onError(error);
      return false;
    }
  }

  disconnect() {
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

    this.stopPlayback();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }

    this.stopKeepalive();
    this.isConnected = false;
    this.sessionReady = false;
    this.pendingStartConversation = false;
    this.isConversationActive = false;
    this.isSpeaking = false;
    this.isListening = false;
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
      console.log('Deepgram Agent: Waiting for session ready, queuing start...');
      this.pendingStartConversation = true;
      return true;
    }

    return this.sendStartConversation();
  }

  async sendStartConversation() {
    try {
      await this.setupAudio();
      
      console.log('Deepgram Agent: Sending StartConversation...');
      this.ws.send(JSON.stringify({
        type: 'StartConversation',
        audio: {
          encoding: 'linear16',
          sample_rate: 16000,
          layout: 'mono'
        }
      }));

      this.isConversationActive = true;
      return true;
    } catch (error) {
      console.error('Failed to start conversation:', error);
      this.onError(error);
      return false;
    }
  }

  stopConversation() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'StopConversation'
      }));
    }

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

    this.isConversationActive = false;
    this.isListening = false;
    this.onListeningChanged(false);
  }

  async setupAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
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
    const outputArray = new Int16Array(inputArray.length);
    for (let i = 0; i < inputArray.length; i++) {
      const s = Math.max(-1, Math.min(1, inputArray[i]));
      outputArray[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return outputArray;
  }

  handleMessage(data) {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      console.log('Deepgram Agent: Received message type:', message.type);
      
      switch (message.type) {
        case 'Welcome':
          console.log('Deepgram Agent: Session ready');
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
            this.sendStartConversation();
          }
          break;
          
        case 'Transcript':
          if (message.transcript) {
            const isFinal = message.is_final;
            this.onTranscript(message.transcript, isFinal);
            
            if (isFinal) {
              this.onListeningChanged(false);
              this.isListening = false;
            } else {
              this.onListeningChanged(true);
              this.isListening = true;
            }
          }
          break;
          
        case 'Audio':
          if (message.data) {
            this.queueAudio(message.data);
          }
          break;
          
        case 'SpeakingStarted':
          // Stop playing if user starts speaking (interruption/barge-in)
          this.stopPlayback();
          this.isSpeaking = true;
          this.onSpeakingChanged(true);
          break;
          
        case 'SpeakingStopped':
          this.isSpeaking = false;
          this.onSpeakingChanged(false);
          break;
          
        case 'ConversationStarted':
          this.isListening = true;
          this.onListeningChanged(true);
          break;
          
        case 'ConversationEnded':
          this.isConversationActive = false;
          this.isListening = false;
          this.onListeningChanged(false);
          break;
          
        case 'Error':
          console.error('Deepgram Agent error:', message.description);
          this.onError(new Error(message.description));
          break;
          
        default:
          if (message.content) {
            this.onAgentResponse(message.content);
          }
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

  async queueAudio(audioData) {
    try {
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert Int16 raw linear PCM samples to float samples
      const int16Samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
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
      this.isSpeaking = false;
      this.onSpeakingChanged(false);
      return;
    }

    const floatSamples = this.audioQueue.shift();
    this.isPlayingAudio = true;
    this.isSpeaking = true;
    this.onSpeakingChanged(true);

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
    this.stopPlayback();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'Interrupt'
      }));
    }
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