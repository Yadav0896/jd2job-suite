import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

import WorkspaceSelector from './components/WorkspaceSelector';
import TranscriptPanel from './components/TranscriptPanel';
import AnswerPanel from './components/AnswerPanel';
import AudioControls from './components/AudioControls';
import ResumeManager from './components/ResumeManager';
import JobDescriptionInput from './components/JobDescriptionInput';
import LandingPage from './components/LandingPage';
import SettingsModal from './components/SettingsModal';
import PostInterviewModal from './components/PostInterviewModal';
import InterviewerPreview from './components/InterviewerPreview';
import AuthPage from './components/AuthPage';
import ErrorBoundary from './components/ErrorBoundary';
import Jd2JobDashboard from './components/Jd2JobDashboard';
import { signOut } from './services/supabaseClient';
import PricingPage from './components/PricingPage';
import { createOrder, openRazorpayCheckout } from './services/paymentService';
import { getProfile } from './services/supabaseService';
import { generatePrepAnalysis } from './services/prepAnalysisService';
import PostCallAnalyticsModal from './components/PostCallAnalyticsModal';
import SessionArchive from './components/SessionArchive';
import ModelSelector from './components/ModelSelector';
import AIInterviewer from './components/AIInterviewer';
import Jd2JobLogo from './components/Jd2JobLogo';

// ─── Demo steps (static data, safe outside component) ───────────────────────
const DEMO_STEPS = [
  {
    title: 'Greeting & Self-Introduction',
    interviewer: "Hi, thank you for coming in today. Let's start with a quick introduction. Can you tell me a bit about yourself?",
    reasoning: 'Formulating initial pitch: Specialist React Developer, Stripe dashboard lead developer, strong focus on performance.',
    answer: 'Hello! Thank you for having me. I am a frontend developer with 5+ years of experience specializing in building highly responsive React applications. Recently, I led the development of Stripe\'s new dashboard, achieving a 30% speedup in render times.',
    bulletPoints: ['5+ years React experience', 'Led Stripe dashboard development', 'Specialist in app performance & UX'],
    hints: ['Structure with STAR or chronologically', 'Highlight impact (30% speedup)', 'Showcase frontend specialization'],
  },
  {
    title: 'React Performance Optimization',
    interviewer: 'That\'s impressive. Speaking of performance, how would you approach optimizing a React application that is lagging when rendering a list of 10,000 items?',
    reasoning: 'Analyzing lag cause: DOM node count and unnecessary virtual DOM diffing. Solutions: 1. Virtualization, 2. Component memoization, 3. Optimized React keys.',
    answer: 'To handle 10,000 items, I would implement list virtualization (or windowing) using a library like `react-window` to only render elements currently in the viewport. I\'d also use `React.memo` for list items and `useMemo` for any complex sorting/filtering logic.',
    bulletPoints: ['Use list virtualization (react-window)', 'Wrap individual items in React.memo', 'Avoid inline event handlers in list items'],
    hints: ['Mention virtual DOM diffing cost', 'Explain prop equality check', 'Discuss key stability'],
  },
  {
    title: 'State Management Trade-offs',
    interviewer: 'Excellent. How do you decide between using React Context, Redux, or Zustand for state management in a large-scale project?',
    reasoning: 'Comparing state solutions. Context: best for low-frequency updates. Redux: best for complex, trackable state workflows. Zustand: best lightweight, scalable, and atomic state.',
    answer: 'For global but low-frequency updates (like themes/auth), I use React Context. For complex, massive data flows needing devtools, I use Redux. For modern, lightweight, high-performance state without boilerplate, Zustand is my go-to choice.',
    bulletPoints: ['Use React Context for low-frequency updates', 'Use Zustand for lightweight atomic state', 'Use Redux for highly complex workflows'],
    hints: ['Compare re-render performance', 'Explain boilerplate overhead', 'Discuss developer experience (DX)'],
  },
  {
    title: 'Handling Team Conflict (STAR)',
    interviewer: 'Can you tell me about a time you had a technical conflict with another engineer, and how did you resolve it?',
    reasoning: 'Structuring STAR response. Situation: Debate over CSS framework. Task: Align on standard. Action: Set up benchmarks. Result: Peaceful consensus on CSS Modules.',
    answer: 'In a previous project, a peer wanted CSS-in-JS while I advocated CSS Modules for performance. I set up a Lighthouse benchmark showing CSS Modules was 40% faster in time-to-interactive. Seeing the metrics, we collaboratively agreed on CSS Modules.',
    bulletPoints: ['Disagreement on styling frameworks', 'Set up interactive performance benchmark', 'Collaboratively aligned using concrete data'],
    hints: ['Emphasize data over opinion', 'Maintain respect and professional alignment', 'Focus on user-centric results'],
  },
  {
    title: 'System Design - Real-time Sync',
    interviewer: 'How would you design a real-time collaborative document editing tool like Google Docs from a frontend perspective?',
    reasoning: 'Analyzing real-time document sync. Key technologies: WebSockets, CRDTs (Conflict-free Replicated Data Types) or OT (Operational Transformation) for collaborative conflict resolution.',
    answer: 'I would establish a WebSocket connection for real-time bi-directional synchronization. To resolve document edit conflicts, I would implement Operational Transformation (OT) or CRDTs. On the client, I\'d debounce state synchronization to avoid throttling the network.',
    bulletPoints: ['Establish bidirectional WebSockets', 'Implement CRDT or OT for conflict resolution', 'Debounce and queue user input events'],
    hints: ['Explain latency mitigation techniques', 'Compare OT vs CRDT', 'Highlight offline-first capability'],
  },
  {
    title: 'Reverse Interviewing (Closing)',
    interviewer: 'Those are all the questions I have today. Do you have any questions for us?',
    reasoning: 'Formulating strong reverse-interview questions showing long-term engagement, interest in team structure, and product vision.',
    answer: "Yes, thank you! I'd love to know what the biggest engineering challenge the team is facing right now, and how engineering success and developer velocity are measured here?",
    bulletPoints: ['Inquire about active engineering hurdles', 'Ask how success/velocity is measured', 'Showcase passion for contributing to high-quality codebases'],
    hints: ['Ask open-ended and thoughtful questions', "Express enthusiasm for the team's mission", 'Showcase strong alignment with business goals'],
  },
];

function AppContent() {
  const { state, dispatch } = useApp();
  const {
    isRecording, isThinking, resumeData, jobDescription,
    transcripts, theme, platformMode,
    isAuthenticated, authLoading, user, profile,
  } = state;

  // ── ALL hooks must be at the top — no exceptions ─────────────────────────
  const [showLanding, setShowLanding]         = useState(true);
  const [showAuth, setShowAuth]               = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isFocused, setIsFocused]             = useState(true);
  const [demoIndex, setDemoIndex]             = useState(-1);
  const [isDemoRunning, setIsDemoRunning]     = useState(false);
  const [showPricing, setShowPricing]         = useState(false);
  const [showSessionArchive, setShowSessionArchive] = useState(false);
  const demoTimeoutRef                        = useRef(null);

  // When Supabase auth resolves → leave auth page automatically
  useEffect(() => {
    if (isAuthenticated && showAuth) {
      setShowAuth(false);
    }
  }, [isAuthenticated, showAuth]);

  // Theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isElectron) {
      document.body.classList.add('electron-mode');
    }
  }, []);

  // Platform mode attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', platformMode);
  }, [platformMode]);

  // Resume & JD prep analysis trigger
  useEffect(() => {
    if (!resumeData && !jobDescription) {
      dispatch({ type: 'SET_PREP_ANALYSIS', payload: null });
      return;
    }

    const runAnalysis = async () => {
      try {
        const analysis = await generatePrepAnalysis(resumeData, jobDescription);
        dispatch({ type: 'SET_PREP_ANALYSIS', payload: analysis });
      } catch (err) {
        console.error('Error generating prep analysis:', err);
      }
    };

    runAnalysis();
  }, [resumeData, jobDescription, dispatch]);

  // Global keyboard shortcuts + focus tracking
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_GHOST_MODE' });
      }
    };
    const handleFocus = () => setIsFocused(true);
    const handleBlur  = () => setIsFocused(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focus',   handleFocus);
    window.addEventListener('blur',    handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focus',   handleFocus);
      window.removeEventListener('blur',    handleBlur);
    };
  }, [dispatch]);

  // Electron global shortcut IPC listeners
  useEffect(() => {
    if (!isElectron) return;
    try {
      const { ipcRenderer } = window.require('electron');
      // Option+Space: trigger AI using the latest transcript text
      const onTriggerAI = () => {
        // We dispatch a TRIGGER_CUSTOM_QUESTION with a timestamp to force a new trigger
        // AudioControls will grab the latest transcript from its ref
        dispatch({ type: 'TRIGGER_CUSTOM_QUESTION', payload: `__SHORTCUT_${Date.now()}__` });
      };
      // Option+S: toggle stealth mode
      const onToggleStealth = (_event, isClickThrough) => {
        dispatch({ type: 'SET_STEALTH_CLICK_THROUGH', payload: isClickThrough });
      };
      ipcRenderer.on('shortcut:trigger-ai', onTriggerAI);
      ipcRenderer.on('shortcut:toggle-stealth', onToggleStealth);
      return () => {
        ipcRenderer.removeListener('shortcut:trigger-ai', onTriggerAI);
        ipcRenderer.removeListener('shortcut:toggle-stealth', onToggleStealth);
      };
    } catch (e) {
      // Not in Electron, ignore
    }
  }, [dispatch]);

  // Demo step trigger
  const triggerStepAction = useCallback((index) => {
    if (index < 0 || index >= DEMO_STEPS.length) {
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
      setIsDemoRunning(false);
      setDemoIndex(-1);
      dispatch({ type: 'CLEAR_TRANSCRIPTS' });
      setIsPostModalOpen(true);
      return;
    }
    const step = DEMO_STEPS[index];
    dispatch({ type: 'ADD_TRANSCRIPT', payload: { speaker: 'interviewer', text: step.interviewer, timestamp: new Date().toLocaleTimeString() } });
    dispatch({ type: 'SET_THINKING', payload: true });
    dispatch({ type: 'SET_REASONING', payload: step.reasoning });
    dispatch({ type: 'SET_ANSWER', payload: { answer: '', bulletPoints: [], hints: '' } });
    if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
    demoTimeoutRef.current = setTimeout(() => {
      dispatch({ type: 'SET_THINKING', payload: false });
      dispatch({ type: 'SET_ANSWER', payload: { answer: step.answer, bulletPoints: step.bulletPoints, hints: step.hints } });
      demoTimeoutRef.current = setTimeout(() => {
        setDemoIndex(prev => prev + 1);
      }, 8000);
    }, 500);
  }, [dispatch]);

  useEffect(() => {
    if (isDemoRunning && demoIndex >= 0) {
      triggerStepAction(demoIndex);
    }
    return () => { if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current); };
  }, [demoIndex, isDemoRunning, triggerStepAction]);

  // ── Demo controls ─────────────────────────────────────────────────────────
  const startDemo = () => {
    dispatch({ type: 'CLEAR_TRANSCRIPTS' });
    dispatch({ type: 'SET_JOB_DESCRIPTION', payload: 'Software Engineer at Google. Requires expertise in React, System Design, and performance optimization.' });
    dispatch({ type: 'SET_RESUME_DATA', payload: '5 years experience. Built Stripe dashboard. Expert in React and state management.' });
    setIsDemoRunning(true);
    setDemoIndex(0);
  };
  const stopDemo = () => {
    if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
    setIsDemoRunning(false);
    setDemoIndex(-1);
    dispatch({ type: 'CLEAR_TRANSCRIPTS' });
  };
  const nextDemoStep = useCallback(() => {
    if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
    setDemoIndex(prev => prev + 1);
  }, []);

  // ── PiP Popout ────────────────────────────────────────────────────────────
  const [pipWindow, setPipWindow] = useState(null);

  const togglePiP = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    if (!('documentPictureInPicture' in window)) {
      alert("Your browser doesn't support Document Picture-in-Picture. You can pull this tab out into its own small window instead.");
      return;
    }
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 400, height: 600 });
      
      // Copy styles
      [...document.styleSheets].forEach(styleSheet => {
        try {
          const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pip.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = styleSheet.media;
          link.href = styleSheet.href;
          pip.document.head.appendChild(link);
        }
      });
      
      // Force dark background and full stretch
      const overrideStyle = document.createElement('style');
      overrideStyle.textContent = `
        html, body { 
          background: #0a0a0f !important; 
          margin: 0 !important; 
          padding: 0 !important; 
          overflow: hidden !important; 
          width: 100vw !important; 
          height: 100vh !important; 
        }
        body .panel-right,
        body.app-container .panel-right,
        body.app-container.stealth-layout-active .panel-right {
          width: 100vw !important;
          max-width: none !important;
          height: 100vh !important;
          border-radius: 0 !important;
          border: none !important;
          box-shadow: none !important;
          margin: 0 !important;
          background: transparent !important;
          backdrop-filter: none !important;
        }
      `;
      pip.document.head.appendChild(overrideStyle);
      
      // Ensure the body has the right classes
      pip.document.body.className = 'app-container stealth-layout-active';
      
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
    } catch (e) {
      console.error('Failed to open PiP window', e);
    }
  }, [pipWindow]);

  // ── Derived values (not hooks) ─────────────────────────────────────────────
  const getSessionBadge = () => {
    if (isThinking) return { cls: 'thinking', dot: true, label: 'AI Thinking' };
    if (isRecording) return { cls: 'recording', dot: true, label: 'Live Session' };
    return { cls: 'idle', dot: false, label: 'Ready' };
  };
  const badge = getSessionBadge();
  const wpmStatus = state.wpm > 160 ? 'fast' : state.wpm > 100 ? 'good' : 'slow';
  const appClasses = ['app-container', 'dashboard-3d', state.isGhostMode ? 'ghost-mode' : '', state.stealthMode ? 'stealth-layout-active' : '', !isFocused ? 'not-focused' : ''].filter(Boolean).join(' ');
  const platformTitles = { interview: 'Interview Intelligence', sales: 'Sales Intelligence', meeting: 'Meeting Intelligence' };

  const renderRightPanel = () => {
    return <AnswerPanel />;
  };
  const renderConfigModals = () => {
    return (<>{state.showResumeModal && <ResumeManager />}{state.showJobDescriptionModal && <JobDescriptionInput />}</>);
  };

  // 0. Pricing page
  if (showPricing) {
    return (
      <PricingPage 
        user={state.user} 
        onBack={() => setShowPricing(false)} 
        fetchUserBalance={async () => {
          if (!state.user?.id) return 0;
          try {
            const p = await getProfile(state.user.id);
            return p.credits || 0;
          } catch {
            return 0;
          }
        }}
        handlePayment={async (planId, amountINR) => {
          try {
            const orderRes = await createOrder(state.user.id, amountINR, planId);
            const verifyRes = await openRazorpayCheckout({
              orderId: orderRes.orderId,
              amountINR: amountINR,
              userId: state.user.id,
              userName: state.user.user_metadata?.name || '',
              userEmail: state.user.email || '',
            });
            if (verifyRes.success) {
              dispatch({ type: 'SET_CREDITS', payload: verifyRes.profile.credits });
              return { success: true };
            }
            return { success: false };
          } catch (err) {
            console.error('Payment flow failed:', err);
            alert(`Payment failed: ${err.message}`);
            return { success: false };
          }
        }}
        signOut={async () => { await signOut(); dispatch({ type: 'CLEAR_AUTH' }); setShowPricing(false); }}
      />
    );
  }

  // 1. Landing page
  if (showLanding) {
    return (
      <LandingPage
        isAuthenticated={isAuthenticated}
        isAuthLoading={authLoading}
        onShowAuth={() => { setShowLanding(false); setShowAuth(true); }}
        onShowPricing={() => { setShowLanding(false); setShowPricing(true); }}
        onStart={() => {
          setShowLanding(false);
          setShowAuth(false);
          setActiveWorkspace(null);
        }}
      />
    );
  }

  // 2. Auth page
  if (showAuth && !isAuthenticated) {
    return <AuthPage onAuthenticated={() => {}} />;
  }

  // 3. Require authentication for all workspaces
  if (!isAuthenticated && !authLoading) {
    return <AuthPage onAuthenticated={() => {}} />;
  }
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="thinking-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  // 4. Workspace selector
  if (activeWorkspace === null) {

    return (
      <>
        <WorkspaceSelector
          onSelect={(mode) => {
            setActiveWorkspace(mode);
            dispatch({ type: 'SET_PLATFORM_MODE', payload: mode });
          }}
        />
        {state.showSettingsModal && <SettingsModal />}
      </>
    );
  }

  if (platformMode === 'jd2job') {
    return (
      <Jd2JobDashboard 
        onBack={() => {
          setActiveWorkspace(null);
          dispatch({ type: 'SET_PLATFORM_MODE', payload: 'interview' });
        }}
      />
    );
  }

  if (platformMode === 'mock') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 10% 20%, rgb(18, 18, 24) 0%, rgb(9, 9, 12) 90.2%)' }}>
        <header className="header-3d" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(10px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => {
                setActiveWorkspace(null);
                dispatch({ type: 'SET_PLATFORM_MODE', payload: 'interview' });
              }}
              className="header-btn"
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '8px', color: '#fff', fontWeight: 'bold' }}
              title="Return to Product Hub"
            >
              🏠 Hub
            </button>
            <span className="app-title" style={{ color: '#fff', fontWeight: 800 }}>Jd2Job Mock Practice</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Interactive Conversational Interviewer
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '24px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <AIInterviewer 
              apiKey={state.apiKey || 'proxy-key'} 
              systemPrompt={""}
            />
          </div>
        </div>
      </div>
    );
  }

  // 4. Main workspace dashboard
  return (
    <div className={appClasses}>
      {state.stealthClickThrough && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#fff',
          padding: '8px 18px',
          borderRadius: '20px',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          zIndex: 99999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <span>🕶️ Stealth Click-Through Active (Press Alt+S to interact)</span>
        </div>
      )}
      <div className="main-area">
        {/* Header */}
        <header className="app-header">
          <div className="header-brand" style={{ gap: '12px' }}>
            <button 
              onClick={() => setActiveWorkspace(null)}
              className="header-btn"
              style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer' }}
              title="Return to Product Hub"
            >
              🏠 Hub
            </button>
            <Jd2JobLogo width={28} height={28} />
            <span className="app-title">Jd2Job</span>
          </div>

          <div className="header-center">
            <div className={`session-badge session-badge-3d ${badge.cls}`}>
              {badge.dot && <span className="live-dot pulse" />}
              {badge.label}
            </div>
            {isRecording && (
              <div className={`wpm-badge ${wpmStatus}`}>
                <span className="wpm-value">{state.wpm}</span>
                <span className="wpm-label">WPM</span>
              </div>
            )}
            {state.speedMetrics.totalLatency > 0 && (
              <div className="wpm-badge good" style={{ marginLeft: '8px' }}>
                <span className="wpm-value">{state.speedMetrics.totalLatency.toFixed(1)}s</span>
                <span className="wpm-label">speed</span>
              </div>
            )}
          </div>

          <div className="header-actions">
            {state.credits > 0 && (
              <div className="selector-credits-chip" onClick={() => setShowPricing(true)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 12px', height: '32px', cursor: 'pointer' }}>
                <span className="selector-credits-icon">⚡</span>
                <span className="selector-credits-val" style={{ fontSize: '0.8rem' }}>{state.credits}</span>
              </div>
            )}

            <button className="header-btn" onClick={() => dispatch({ type: 'TOGGLE_SETTINGS_MODAL' })} title="Settings">
              ⚙️ Settings
            </button>

            <button className="header-btn" onClick={() => setShowSessionArchive(true)} title="Session History">
              📂 History
            </button>

            {platformMode === 'interview' && (
              <button id="demo-trigger" onClick={startDemo}
                className="demo-play-btn">
                PLAY DEMO
              </button>
            )}

            {platformMode === 'interview' && (
              <>
                <button className={`header-btn ${jobDescription ? 'has-data' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_JOB_DESCRIPTION_MODAL' })}>
                  📋 JD {jobDescription && '✓'}
                </button>
                <button className={`header-btn ${resumeData ? 'has-data' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_RESUME_MODAL' })}>
                  📄 Resume {resumeData && '✓'}
                </button>
              </>
            )}

            {user && (
              <div className="user-chip">
                <span className="user-chip-name">
                  {profile?.display_name || user.user_metadata?.name || user.email?.split('@')[0]}
                </span>
                <span className="user-chip-credits" onClick={() => setShowPricing(true)} style={{ cursor: 'pointer' }}>{profile?.credits ?? 0}⚡</span>
                <button onClick={async () => { await signOut(); dispatch({ type: 'CLEAR_AUTH' }); }}
                  className="user-chip-signout" title="Sign out">
                  🚪
                </button>
              </div>
            )}

            <button className="finish-btn" onClick={() => setIsPostModalOpen(true)} title="End session and generate summary" style={{ WebkitAppRegion: 'no-drag' }}>
              🏁 Finish & Follow-up
            </button>

            {navigator.userAgent.toLowerCase().includes(' electron/') && (
              <>
                <button 
                  className="finish-btn" 
                  style={{ backgroundColor: '#666666', WebkitAppRegion: 'no-drag' }}
                  onClick={() => {
                    if (window.require) {
                      const { ipcRenderer } = window.require('electron');
                      ipcRenderer.send('minimize-app');
                    }
                  }}
                  title="Minimize Application"
                >
                  🗕
                </button>
                <button 
                  className="finish-btn" 
                  style={{ backgroundColor: '#ff4444', WebkitAppRegion: 'no-drag' }}
                  onClick={() => {
                    if (window.require) {
                      const { ipcRenderer } = window.require('electron');
                      ipcRenderer.send('close-app');
                    }
                  }}
                  title="Close Application"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </header>

        {/* Demo banner */}
        {isDemoRunning && (
          <div className="demo-banner">
            <span className="demo-banner-text">
              <span className="demo-banner-dot" />
              LIVE DEMO: Question {demoIndex + 1} of {DEMO_STEPS.length} — "{DEMO_STEPS[demoIndex]?.title}"
            </span>
            <div className="demo-banner-actions">
              <button onClick={nextDemoStep} className="demo-btn-next">NEXT ➡️</button>
              <button onClick={stopDemo} className="demo-btn-stop">STOP ⏹️</button>
            </div>
          </div>
        )}

        {/* Main panels */}
        <main className="main-content">
          <AnimatePresence>
          {state.showTranscript && (
            <motion.div 
              key="transcript-panel"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.4 }}
              className="panel panel-left panel-3d"
            >
              <ErrorBoundary><TranscriptPanel /></ErrorBoundary>
            </motion.div>
          )}
          </AnimatePresence>
          {pipWindow ? (
            createPortal(
              <div 
                className={`panel panel-right panel-3d ${!state.showTranscript ? 'panel-full' : ''}`}
                style={{ touchAction: 'none' }}
              >
                <ErrorBoundary>{renderRightPanel()}</ErrorBoundary>
              </div>,
              pipWindow.document.body
            )
          ) : (
            <motion.div 
              drag={state.stealthMode}
              dragMomentum={false}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`panel panel-right panel-3d ${!state.showTranscript ? 'panel-full' : ''}`}
              style={{ touchAction: 'none' }}
            >
              <ErrorBoundary>{renderRightPanel()}</ErrorBoundary>
            </motion.div>
          )}
        </main>

        <div className="audio-controls-3d">
          <ErrorBoundary><AudioControls /></ErrorBoundary>
        </div>
        <ErrorBoundary><InterviewerPreview /></ErrorBoundary>
      </div>

      {renderConfigModals()}

      <PostInterviewModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        transcripts={transcripts}
        jd={jobDescription}
        resume={resumeData}
      />

      {state.showSettingsModal && <SettingsModal />}
      <PostCallAnalyticsModal />
      {showSessionArchive && <SessionArchive onClose={() => setShowSessionArchive(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
