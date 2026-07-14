import { useState, useEffect, useCallback, useRef } from 'react';
import { DeepgramVoiceAgent, createVoiceAgent, destroyVoiceAgent } from '../services/deepgramAgentService';

export function useVoiceAgent(config = {}) {
  const agentRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [agentText, setAgentText] = useState('');
  const [error, setError] = useState(null);

  const initialize = useCallback(async (apiKey, systemPrompt) => {
    try {
      const agent = new DeepgramVoiceAgent({
        apiKey,
        systemPrompt: systemPrompt || config.systemPrompt || '',
        llmProvider: config.llmProvider || 'open_ai',
        llmModel: config.llmModel || 'gpt-4o-mini',
        sttModel: config.sttModel || 'nova-2',
        ttsModel: config.ttsModel || 'aura-2-asteria-en',
        onTranscript: (text, isFinal) => {
          setTranscript(text);
          if (isFinal) {
            setFinalTranscript(prev => prev + (prev ? ' ' : '') + text);
          }
        },
        onAgentResponse: (text) => {
          setAgentText(text);
        },
        onSpeakingChanged: (speaking) => {
          setIsSpeaking(speaking);
        },
        onListeningChanged: (listening) => {
          setIsListening(listening);
        },
        onConnected: () => {
          setIsConnected(true);
          setError(null);
        },
        onDisconnected: () => {
          setIsConnected(false);
          setIsSpeaking(false);
          setIsListening(false);
        },
        onError: (err) => {
          console.error('Voice Agent error:', err);
          setError(err.message || err);
        }
      });

      agentRef.current = agent;
      return agent;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [config]);

  const connect = useCallback(async () => {
    if (!agentRef.current) {
      if (!config.apiKey) {
        setError('API key required');
        return false;
      }
      await initialize(config.apiKey, config.systemPrompt);
    }
    
    if (agentRef.current) {
      return await agentRef.current.connect();
    }
    return false;
  }, [config.apiKey, config.systemPrompt, initialize]);

  const disconnect = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.disconnect();
      agentRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
  }, []);

  const startConversation = useCallback(async () => {
    if (agentRef.current && isConnected) {
      return await agentRef.current.startConversation();
    }
    return false;
  }, [isConnected]);

  const stopConversation = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.stopConversation();
    }
  }, []);

  const interrupt = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.interrupt();
    }
    setIsSpeaking(false);
  }, []);

  const setSystemPrompt = useCallback((prompt) => {
    if (agentRef.current) {
      agentRef.current.setSystemPrompt(prompt);
    }
  }, []);

  const clearTranscripts = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
    setAgentText('');
  }, []);

  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.disconnect();
        agentRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    isSpeaking,
    isListening,
    transcript,
    finalTranscript,
    agentText,
    error,
    connect,
    disconnect,
    startConversation,
    stopConversation,
    interrupt,
    setSystemPrompt,
    clearTranscripts,
    agent: agentRef.current
  };
}

export default useVoiceAgent;