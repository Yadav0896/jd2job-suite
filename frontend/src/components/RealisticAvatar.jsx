import { useState, useEffect, useRef, useCallback } from 'react';
import './RealisticAvatar.css';

const EMOTIONS = {
  neutral: { mouth: 'neutral', eyes: 'neutral', brows: 'neutral' },
  happy: { mouth: 'smile', eyes: 'happy', brows: 'raised' },
  concerned: { mouth: 'frown', eyes: 'worried', brows: 'furrowed' },
  curious: { mouth: 'open', eyes: 'wide', brows: 'raised' },
  thinking: { mouth: 'neutral', eyes: 'looking', brows: 'raised' },
  speaking: { mouth: 'talking', eyes: 'neutral', brows: 'neutral' },
  listening: { mouth: 'neutral', eyes: 'focused', brows: 'neutral' },
  excited: { mouth: 'big-smile', eyes: 'excited', brows: 'raised' }
};

export default function RealisticAvatar({ 
  isSpeaking = false, 
  isListening = false,
  isThinking = false,
  emotion = 'neutral',
  transcript = '',
  avatarSource = null,
  avatarStream = null,
  avatarType = 'video',
  showVideoFrame = true,
  avatarName = 'Interviewer',
  connectionStatus = 'disconnected'
}) {
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [mouthState, setMouthState] = useState(0);
  const [eyeBlink, setEyeBlink] = useState(false);
  const [headPosition, setHeadPosition] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const animationRef = useRef(null);
  const mouthIntervalRef = useRef(null);
  const videoRef = useRef(null);

  const isVideoAvatar = avatarType === 'video' && (avatarSource || avatarStream);

  useEffect(() => {
    if (isSpeaking) {
      setCurrentEmotion('speaking');
      startMouthAnimation();
    } else if (isListening) {
      setCurrentEmotion('listening');
      setMouthState(0);
    } else if (isThinking) {
      setCurrentEmotion('thinking');
      startThinkingAnimation();
    } else {
      setCurrentEmotion(emotion);
      stopMouthAnimation();
    }
  }, [isSpeaking, isListening, isThinking, emotion]);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setEyeBlink(true);
      setTimeout(() => setEyeBlink(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    if (isSpeaking || isThinking) {
      const moveHead = () => {
        setHeadPosition({
          x: (Math.random() - 0.5) * 4,
          y: (Math.random() - 0.5) * 3
        });
      };
      const interval = setInterval(moveHead, 2000 + Math.random() * 1500);
      return () => clearInterval(interval);
    } else {
      setHeadPosition({ x: 0, y: 0 });
    }
  }, [isSpeaking, isThinking]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (avatarStream && videoRef.current) {
      videoRef.current.srcObject = avatarStream;
      setVideoReady(true);
    }
  }, [avatarStream]);

  const startMouthAnimation = useCallback(() => {
    stopMouthAnimation();
    mouthIntervalRef.current = setInterval(() => {
      setMouthState(prev => (prev + 1) % 4);
    }, 100);
  }, []);

  const stopMouthAnimation = useCallback(() => {
    if (mouthIntervalRef.current) {
      clearInterval(mouthIntervalRef.current);
      mouthIntervalRef.current = null;
    }
    setMouthState(0);
  }, []);

  const startThinkingAnimation = useCallback(() => {
    animationRef.current = setInterval(() => {
      setHeadPosition(prev => ({
        x: prev.x === 0 ? 2 : prev.x === 2 ? -2 : 0,
        y: prev.y === 0 ? 1 : 0
      }));
    }, 800);
  }, []);

  const getEyeClass = () => {
    if (eyeBlink) return 'eye-blink';
    const eyeMap = {
      neutral: 'eye-neutral',
      happy: 'eye-happy',
      worried: 'eye-worried',
      wide: 'eye-wide',
      focused: 'eye-focused',
      excited: 'eye-excited',
      looking: 'eye-looking'
    };
    return eyeMap[currentEmotion] || 'eye-neutral';
  };

  const getMouthClass = () => {
    const mouthMap = {
      neutral: 'mouth-neutral',
      smile: 'mouth-smile',
      frown: 'mouth-frown',
      open: 'mouth-open',
      talking: `mouth-talk-${mouthState}`,
      'big-smile': 'mouth-big-smile'
    };
    return mouthMap[currentEmotion] || 'mouth-neutral';
  };

  const getBrowsClass = () => {
    const browMap = {
      neutral: 'brows-neutral',
      raised: 'brows-raised',
      furrowed: 'brows-furrowed'
    };
    return browMap[currentEmotion] || 'brows-neutral';
  };

  const getStatusText = () => {
    if (connectionStatus === 'connecting') return 'Connecting...';
    if (connectionStatus === 'error') return 'Connection Error';
    if (isSpeaking) return 'Speaking';
    if (isListening) return 'Listening';
    if (isThinking) return 'Thinking...';
    return 'Ready';
  };

  const getConnectionStatusClass = () => {
    switch (connectionStatus) {
      case 'connected': return 'status-connected';
      case 'connecting': return 'status-connecting';
      case 'error': return 'status-error';
      default: return 'status-disconnected';
    }
  };

  return (
    <div className={`realistic-avatar-wrapper ${isLoaded ? 'loaded' : ''} ${isVideoAvatar ? 'video-mode' : ''}`}>
      {showVideoFrame && (
        <div className="video-frame">
          <div className="frame-corner top-left"></div>
          <div className="frame-corner top-right"></div>
          <div className="frame-corner bottom-left"></div>
          <div className="frame-corner bottom-right"></div>
          <div className={`recording-indicator ${getConnectionStatusClass()}`}>
            <span className="rec-dot"></span>
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
          </div>
        </div>
      )}

      <div className={`avatar-container ${isSpeaking ? 'speaking' : ''} ${isThinking ? 'thinking' : ''}`}>
        {isVideoAvatar ? (
          <div className="video-avatar-container">
            {avatarStream ? (
              <video
                ref={videoRef}
                className="avatar-video-stream"
                autoPlay
                playsInline
                muted
              />
            ) : avatarSource ? (
              <video
                className="avatar-video-stream"
                src={avatarSource}
                autoPlay
                muted
                loop
                playsInline
                onLoadedData={() => setVideoReady(true)}
              />
            ) : (
              <div className="video-placeholder">
                <div className="placeholder-avatar"></div>
              </div>
            )}
            {videoReady && (
              <div className="video-overlay">
                <div className={`avatar-name-tag ${isSpeaking ? 'speaking' : ''}`}>
                  {avatarName}
                </div>
              </div>
            )}
            {!videoReady && (
              <div className="video-loading">
                <div className="loading-spinner"></div>
                <span>Loading avatar...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="avatar-3d">
            <div 
              className="avatar-head"
              style={{
                transform: `translate(${headPosition.x}px, ${headPosition.y}px)`
              }}
            >
              <div className="avatar-hair"></div>
              <div className="avatar-face">
                <div className={`avatar-eyebrows ${getBrowsClass()}`}>
                  <div className="brow left"></div>
                  <div className="brow right"></div>
                </div>
                <div className={`avatar-eyes ${getEyeClass()}`}>
                  <div className="eye left">
                    <div className="eye-white">
                      <div className="iris">
                        <div className="pupil"></div>
                        <div className="highlight"></div>
                      </div>
                    </div>
                    <div className="eyelid"></div>
                  </div>
                  <div className="eye right">
                    <div className="eye-white">
                      <div className="iris">
                        <div className="pupil"></div>
                        <div className="highlight"></div>
                      </div>
                    </div>
                    <div className="eyelid"></div>
                  </div>
                </div>
                <div className="avatar-nose"></div>
                <div className={`avatar-mouth ${getMouthClass()}`}>
                  <div className="upper-lip"></div>
                  <div className="lower-lip"></div>
                  <div className="teeth"></div>
                </div>
              </div>
              <div className="avatar-ears">
                <div className="ear left"></div>
                <div className="ear right"></div>
              </div>
              <div className="avatar-neck"></div>
              <div className="avatar-shoulders">
                <div className="shoulder left"></div>
                <div className="shoulder right"></div>
              </div>
            </div>
            
            <div className="avatar-lighting">
              <div className="light-key"></div>
              <div className="light-fill"></div>
              <div className="light-rim"></div>
            </div>
          </div>
        )}

        <div className="avatar-glow">
          <div className="glow-inner"></div>
        </div>
      </div>

      <div className="avatar-status">
        <div className={`status-indicator ${isSpeaking ? 'speaking' : isListening ? 'listening' : isThinking ? 'thinking' : 'idle'} ${getConnectionStatusClass()}`}>
          <div className="status-dot"></div>
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>

      {transcript && (
        <div className="avatar-transcript">
          <div className="transcript-text">{transcript}</div>
        </div>
      )}
    </div>
  );
}