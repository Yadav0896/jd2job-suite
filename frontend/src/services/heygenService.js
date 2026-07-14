const HEYGEN_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyYWdhYWlfdXNlciIsImlzcyI6ImhleWdlbiIsImlhdCI6MTc0NzAxNDAwMCwiZXhwIjoxNzQ3MDk2NjAwfQ.yPCh2nP0VJH8LhhK7JZQ5N3VvJ4pJ3kT6tK8fVJnXzI';
const HEYGEN_API_URL = 'https://api.heygen.com/v1';

class HeyGenService {
  constructor() {
    this.session = null;
    this.videoElement = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
  }

  async createSession(avatarId = 'default') {
    try {
      const response = await fetch(`${HEYGEN_API_URL}/streaming/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HEYGEN_API_KEY}`
        },
        body: JSON.stringify({
          quality: 'medium',
          avatar_id: avatarId,
          version: 'v2'
        })
      });

      if (!response.ok) {
        throw new Error(`HeyGen API error: ${response.status}`);
      }

      const data = await response.json();
      this.session = {
        sessionId: data.data.session_id,
        wsUrl: data.data.webrtc_url,
        token: data.data.token
      };

      return this.session;
    } catch (error) {
      console.error('HeyGen session creation failed:', error);
      throw error;
    }
  }

  async connectVideoElement(videoElement) {
    if (!this.session) {
      throw new Error('No session created. Call createSession first.');
    }

    this.videoElement = videoElement;

    const ws = new WebRTCAdapter({
      wsUrl: this.session.wsUrl,
      token: this.session.token,
      videoElement: this.videoElement
    });

    await ws.connect();
    this.isConnected = true;

    return ws;
  }

  async startSpeaking(text) {
    if (!this.session || !this.isConnected) {
      throw new Error('Not connected to HeyGen');
    }

    try {
      const response = await fetch(`${HEYGEN_API_URL}/streaming/talk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HEYGEN_API_KEY}`
        },
        body: JSON.stringify({
          session_id: this.session.sessionId,
          text: text,
          task_mode: 'replay',
          smoothness: 0.5,
          avatar_id: 'default'
        })
      });

      if (!response.ok) {
        throw new Error(`HeyGen talk error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('HeyGen speak error:', error);
      throw error;
    }
  }

  async stopSpeaking() {
    if (!this.session) return;

    try {
      await fetch(`${HEYGEN_API_URL}/streaming/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HEYGEN_API_KEY}`
        },
        body: JSON.stringify({
          session_id: this.session.sessionId
        })
      });
    } catch (error) {
      console.error('HeyGen cancel error:', error);
    }
  }

  async endSession() {
    if (!this.session) return;

    try {
      await fetch(`${HEYGEN_API_URL}/streaming/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HEYGEN_API_KEY}`
        },
        body: JSON.stringify({
          session_id: this.session.sessionId
        })
      });
    } catch (error) {
      console.error('HeyGen end session error:', error);
    }

    this.session = null;
    this.isConnected = false;
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.session?.sessionId || null,
      hasVideo: !!this.videoElement
    };
  }
}

class WebRTCAdapter {
  constructor({ wsUrl, token, videoElement }) {
    this.wsUrl = wsUrl;
    this.token = token;
    this.videoElement = videoElement;
    this.pc = null;
    this.ws = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({
          type: 'jwt',
          jwt: this.token
        }));

        this.setupWebRTC();
        resolve();
      };

      this.ws.onerror = reject;
      this.ws.onmessage = (msg) => this.handleMessage(msg);
    });
  }

  setupWebRTC() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.pc.ontrack = (event) => {
      if (this.videoElement) {
        this.videoElement.srcObject = event.streams[0];
      }
    };

    this.pc.onicecandidate = (candidate) => {
      if (candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice',
          candidate: candidate.candidate
        }));
      }
    };
  }

  handleMessage(msg) {
    const data = JSON.parse(msg.data);

    switch (data.type) {
      case 'offer':
        this.pc.setRemoteDescription(data.sdp).then(() => {
          return this.pc.createAnswer();
        }).then(answer => {
          this.pc.setLocalDescription(answer);
          this.ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
        });
        break;
      case 'ice':
        if (data.candidate) {
          this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;
    }
  }

  close() {
    if (this.pc) this.pc.close();
    if (this.ws) this.ws.close();
  }
}

const heygenService = new HeyGenService();
export default heygenService;