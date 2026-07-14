const API_BASE = (import.meta.env ? import.meta.env.VITE_API_URL : null) || 'http://localhost:3001';
const TTS_BASE = `${API_BASE}/api/tts`;

class VoiceService {
  constructor() {
    this.currentAudio = null;
    this.currentUtterance = null;
    this.speechEndCallbacks = [];
    this.isPlaying = false;
    this.voiceId = '21m00Tcm4TlvDq8ikWAM';
    this.emotion = 'neutral';
  }

  setVoice(voiceId) {
    this.voiceId = voiceId;
  }

  setEmotion(emotion) {
    this.emotion = emotion;
  }

  onSpeechEnd(callback) {
    this.speechEndCallbacks.push(callback);
    return () => {
      this.speechEndCallbacks = this.speechEndCallbacks.filter(cb => cb !== callback);
    };
  }

  async speak(text) {
    this.stop();

    try {
      const response = await fetch(`${TTS_BASE}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: this.voiceId,
          emotion: this.emotion
        })
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      this.isPlaying = true;

      this.currentAudio = new Audio(url);
      
      await this.currentAudio.play();

      this.currentAudio.onended = () => {
        this.isPlaying = false;
        URL.revokeObjectURL(url);
        this.speechEndCallbacks.forEach(cb => cb());
      };

      this.currentAudio.onerror = (error) => {
        console.error('Audio playback error:', error);
        this.isPlaying = false;
        this.speechEndCallbacks.forEach(cb => cb());
      };

      return true;
    } catch (error) {
      console.error('Error calling TTS:', error);
      this.isPlaying = false;
      return false;
    }
  }

  async speakWithStreaming(text) {
    this.stop();

    try {
      const response = await fetch(`${TTS_BASE}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: this.voiceId,
          emotion: this.emotion
        })
      });

      if (!response.ok) {
        throw new Error(`TTS stream request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      this.isPlaying = true;

      this.currentAudio = new Audio(url);
      
      await this.currentAudio.play();

      this.currentAudio.onended = () => {
        this.isPlaying = false;
        URL.revokeObjectURL(url);
        this.speechEndCallbacks.forEach(cb => cb());
      };

      return true;
    } catch (error) {
      console.error('Error with streaming TTS:', error);
      return false;
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isPlaying = false;
  }

  getIsPlaying() {
    return this.isPlaying;
  }
}

const voiceService = new VoiceService();
export default voiceService;