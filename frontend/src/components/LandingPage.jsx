import React, { useState } from 'react';
import './LandingPage.css';
import Tilt3D from './Tilt3D';
import Jd2JobLogo from './Jd2JobLogo';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LandingPage = ({ onStart, isAuthenticated, onShowAuth, isAuthLoading, onShowPricing }) => {
  const isElectron = typeof window !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');
  const [openFaq, setOpenFaq] = useState(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [complianceModal, setComplianceModal] = useState(null);

  const handleStart = () => {
    if (isAuthenticated) {
      onStart();
    } else {
      onShowAuth();
    }
  };

  const handlePurchaseClick = () => {
    if (isAuthenticated) {
      if (onShowPricing) {
        onShowPricing();
      } else {
        onStart();
      }
    } else {
      onShowAuth();
    }
  };

  const faqs = [
    {
      question: "How does the Jd2Job work?",
      answer: "Our AI listens to your interview conversations in real-time using your microphone. It analyzes the interviewer's questions and provides structured STAR-method answers, suggestions, and hints tailored to your background."
    },
    {
      question: "Is it detectable on video conferencing tools?",
      answer: "No. Jd2Job runs as a separate application or browser tab. Use our custom 'Ghost Mode' (transparent overlay) to place it directly beside your camera line-of-sight for seamless, stealth note-taking."
    },
    {
      question: "Do you store or train on my audio data?",
      answer: "Absolutely not. We take privacy extremely seriously. Your voice stream is transcribed and processed in memory. No audio files or transcripts are ever stored on our servers."
    },
    {
      question: "Can I customize the interview context?",
      answer: "Yes! You can upload your resume and the target job description to get answers tailored exactly to your experience and the specific role requirements."
    }
  ];

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "Software Engineer at Google",
      avatar: "SC",
      content: "The Interview Assistant helped me land my dream role. The STAR answer structure prompts kept me concise and on track.",
      rating: 5
    },
    {
      name: "Alex Rivera",
      role: "Product Designer at Figma",
      avatar: "AR",
      content: "Having real-time suggestions based on my portfolio during the behavioral rounds was incredibly reassuring.",
      rating: 5
    },
    {
      name: "Emily Rodriguez",
      role: "Principal PM at Stripe",
      avatar: "ER",
      content: "The STAR method layout and performance metrics helped me structure complex engineering management scenarios perfectly.",
      rating: 5
    }
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Upload Resume & JD",
      description: "Provide your resume and the target job description to configure the AI to your profile."
    },
    {
      step: "02",
      title: "Start Live Session",
      description: "Activate the mic when the interview begins. The AI will listen to questions in real-time."
    },
    {
      step: "03",
      title: "Get Live Suggestions",
      description: "Receive structured answer outlines, talking points, and memory reminders as you talk."
    }
  ];

  const pricingPlans = [
    {
      name: "Base Plan",
      price: "₹999",
      period: "/month",
      description: "Ideal for structured interview prep",
      features: ["5 session credits / month", "Max 40 minutes per call", "Real-time AI suggestions", "Context-aware reasoning", "Top-up eligible"],
      highlighted: false
    },
    {
      name: "Credit Top-up",
      price: "₹249",
      period: "/credit",
      description: "Add extra sessions when you need them",
      features: ["1 session credit", "Max 40 minutes duration", "Requires active Base Plan", "Instant activation"],
      highlighted: false
    },
    {
      name: "Monthly Unlimited",
      price: "₹3999",
      period: "/month",
      description: "For intensive daily interview preparation",
      features: ["Unlimited session credits", "Max 40 minutes per call", "Comprehensive interview coaching", "Stealth Ghost Mode", "Post-interview thank-you generator", "Priority support"],
      highlighted: true
    },
    {
      name: "Quarterly Unlimited",
      price: "₹9999",
      period: "/3 months",
      description: "Best value for long-term job seeking",
      features: ["Unlimited sessions for 3 months", "Save over 15% vs Monthly", "Stealth Ghost Mode", "Post-interview thank-you generator", "Priority support"],
      highlighted: false
    }
  ];

  const companies = [
    "Google", "Salesforce", "Stripe", "Snowflake", "Amazon", "Microsoft", "Zoom", "Slack"
  ];

  return (
    <div className="landing-container">
      {/* 3D Floating Orbs */}
      <div className="orb-3d orb-3d-1"></div>
      <div className="orb-3d orb-3d-2"></div>
      <div className="orb-3d orb-3d-3"></div>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-brand">
          <div className="nav-logo">
            <Jd2JobLogo width={36} height={36} />
          </div>
          <span className="nav-title">Jd2Job</span>
        </div>
        <div className="nav-links">
          <a href="#how-it-works">How it Works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          {isAuthLoading ? (
            <span className="nav-cta" style={{ opacity: 0.7, cursor: 'default' }}>
              <span className="thinking-spinner" style={{ width: 14, height: 14, borderWidth: 2, marginRight: 8 }} />
              Loading…
            </span>
          ) : isAuthenticated ? (
            <button className="nav-cta" onClick={onStart}>Start Session</button>
          ) : (
            <>
              <button className="nav-cta" onClick={onShowAuth}>Sign In</button>
              <button className="nav-cta-outline" onClick={onShowAuth}>Sign Up</button>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <div className="hero-glow"></div>
        <div className="hero-content" style={{ transformStyle: 'preserve-3d' }}>
          <div className="hero-badge hero-badge-3d">
            <span className="badge-dot"></span>
            Real-Time Interview Assistant
          </div>
          <h1 className="hero-title" style={{ transform: 'translateZ(40px)', transformStyle: 'preserve-3d' }}>
            Your Real-Time AI <br />
            <span className="gradient-text">Jd2Job Suite</span>
          </h1>
          <p className="hero-subtitle" style={{ transform: 'translateZ(20px)' }}>
            An advanced live-coaching assistant for your job interviews. Listen, analyze, and stream tailored recommendations and structured STAR answers instantly.
          </p>
          <div className="hero-actions" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="hero-primary-btn" onClick={handleStart}>
              <span>Launch Web App</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
             {!isElectron && (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                 <a href={`${API_BASE}/api/download`} download className="hero-secondary-btn" style={{ textDecoration: 'none' }}>
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                     <polyline points="7 10 12 15 17 10"></polyline>
                     <line x1="12" y1="15" x2="12" y2="3"></line>
                   </svg>
                   <span>Download Desktop App</span>
                 </a>
                 <span style={{ fontSize: '0.7rem', color: '#94a3b8', maxWidth: '280px', textAlign: 'center', lineHeight: '1.4' }}>
                    macOS note: Right-click the app icon and select <strong>Open</strong> to bypass the verification warning.
                 </span>
               </div>
             )}
            <button className="hero-secondary-btn" onClick={() => setShowDemoModal(true)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 5L13 10L8 15" fill="currentColor"/>
              </svg>
              <span>Watch Video</span>
            </button>
          </div>

          {showDemoModal && (
            <div className="demo-modal-overlay" onClick={() => setShowDemoModal(false)}>
              <div className="demo-modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-modal" onClick={() => setShowDemoModal(false)}>×</button>
                <div className="video-container">
                  <img src="/demo.webp" alt="AI Copilot Demo" />
                </div>
              </div>
            </div>
          )}
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">98.4%</span>
              <span className="stat-label">Inference Accuracy</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat">
              <span className="stat-value">&lt; 450ms</span>
              <span className="stat-label">Response Latency</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat">
              <span className="stat-value">STAR Method</span>
              <span className="stat-label">Structured Answers</span>
            </div>
          </div>
        </div>

        {/* Hero Mockup */}
        <div className="hero-mockup-container">
          <Tilt3D tiltMax={12} perspective={800} scale={1.03} className="mockup-float-3d shadow-3d edge-glow-3d">
            <div className="mockup-frame">
              <div className="mockup-header">
                <div className="mockup-dot red"></div>
                <div className="mockup-dot yellow"></div>
                <div className="mockup-dot green"></div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '12px', fontFamily: 'monospace' }}>interview-assistant.app</span>
              </div>
              <div className="mockup-body">
                <div className="mockup-sidebar">
                  <div className="mockup-line small" />
                  <div className="mockup-bubble interviewer">
                    <span className="bubble-icon">🎙️</span>
                    "Tell me about a time you resolved conflict in a team."
                  </div>
                  <div className="mockup-bubble you">
                    <span className="bubble-icon">💼</span>
                    "In my previous role at Stripe, we had a debate..."
                  </div>
                </div>
                <div className="mockup-main">
                  <div className="mockup-card reasoning">
                    <div className="mockup-label">
                      <span className="pulse-dot"></span>
                      AI Coach Reasoning
                    </div>
                    <div className="mockup-line" />
                    <div className="mockup-line short" />
                  </div>
                  <div className="mockup-card suggestions">
                    <div className="mockup-label">
                      <span className="pulse-dot"></span>
                      Talking Points
                    </div>
                    <div className="mockup-bullet" />
                    <div className="mockup-bullet" />
                  </div>
                </div>
              </div>
            </div>
          </Tilt3D>
          <div className="mockup-glow"></div>
        </div>
      </header>

      {/* Trust Badges */}
      <section className="trust-section">
        <p>Empowering professionals at leading companies</p>
        <div className="company-logos">
          {companies.map((company, index) => (
            <div key={index} className="company-logo">{company}</div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works-section section-3d">
        <div className="section-header">
          <h2 className="gradient-text">How It Works</h2>
          <p>Get instant live support in three easy steps.</p>
        </div>
        <div className="steps-grid steps-section-3d">
          {howItWorks.map((item, index) => (
            <Tilt3D key={index} tiltMax={10} className="step-card-wrapper" style={{animationDelay: `${index * 150}ms`}}>
              <div className="step-card edge-glow-3d" style={{animationDelay: `${index * 150}ms`}}>
                <div className="step-number step-number-3d">{item.step}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {index < howItWorks.length - 1 && <div className="step-connector"></div>}
              </div>
            </Tilt3D>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="features-section section-3d">
        <div className="section-header">
          <h2 className="gradient-text">Real-Time Interview Intelligence</h2>
          <p>Designed to help you perform flawlessly across all behavioral and technical interview questions.</p>
        </div>
        
        <div className="features-bento feature-grid-3d">
          <Tilt3D tiltMax={8} className="feature-card-tilt">
            <div className="feature-card large edge-glow-3d">
              <div className="feature-icon icon-3d">🎯</div>
              <h3>Interview Intelligence</h3>
              <p>Ace behaviorals and systems design. Matches questions instantly to your resume details and the target job description to structure perfect STAR responses.</p>
              <div className="feature-glow"></div>
            </div>
          </Tilt3D>
          <Tilt3D tiltMax={8} className="feature-card-tilt">
            <div className="feature-card edge-glow-3d">
              <div className="feature-icon icon-3d">📋</div>
              <h3>Resume & JD Matching</h3>
              <p>Upload your resume and the target job description to get highly relevant, personalized answers tailored to the role's requirements.</p>
            </div>
          </Tilt3D>
          <Tilt3D tiltMax={8} className="feature-card-tilt">
            <div className="feature-card edge-glow-3d">
              <div className="feature-icon icon-3d">👁️‍🗨️</div>
              <h3>Stealth Ghost Mode</h3>
              <p>Activate a translucent overlay directly over your video call or presentation layout to keep your eyes locked on the camera.</p>
            </div>
          </Tilt3D>
          <Tilt3D tiltMax={8} className="feature-card-tilt">
            <div className="feature-card large edge-glow-3d">
              <div className="feature-icon icon-3d">⚡</div>
              <h3>Real-time Speech Tracking</h3>
              <p>Powered by advanced Speech-to-Text and AI for instant transcription, live WPM pace monitoring, and rapid verbal suggestions.</p>
              <div className="feature-glow"></div>
            </div>
          </Tilt3D>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials-section section-3d">
        <div className="section-header">
          <h2 className="gradient-text">Trusted by Professionals</h2>
          <p>Read how others are winning their calls using the Copilot.</p>
        </div>
        <div className="testimonials-grid">
          {testimonials.map((testimonial, index) => (
            <Tilt3D key={index} tiltMax={10} className="testimonial-tilt">
              <div className="testimonial-card edge-glow-3d">
                <div className="testimonial-rating">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <span key={i} className="star">★</span>
                  ))}
                </div>
                <p className="testimonial-content">"{testimonial.content}"</p>
                <div className="testimonial-author">
                  <div className="author-avatar">{testimonial.avatar}</div>
                  <div>
                    <div className="author-name">{testimonial.name}</div>
                    <div className="author-role">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            </Tilt3D>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pricing-section section-3d">
        <div className="section-header">
          <h2 className="gradient-text">Flexible Plans for Professionals</h2>
          <p>Select the plan that fits your career or organization needs.</p>
        </div>
        <div className="pricing-grid pricing-grid-3d">
          {pricingPlans.map((plan, index) => (
            <Tilt3D key={index} tiltMax={plan.highlighted ? 8 : 10} scale={plan.highlighted ? 1.0 : 1.03} className="pricing-tilt">
              <div className={`pricing-card ${plan.highlighted ? 'highlighted ring-3d' : 'edge-glow-3d'}`}>
                {plan.highlighted && <div className="popular-badge">Most Popular</div>}
                <h3>{plan.name}</h3>
                <div className="pricing-price">
                  <span className="price">{plan.price}</span>
                  {plan.period && <span className="period">{plan.period}</span>}
                </div>
                <p className="pricing-description">{plan.description}</p>
                <ul className="pricing-features">
                  {plan.features.map((feature, i) => (
                    <li key={i}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button className={`pricing-btn ${plan.highlighted ? 'primary' : 'secondary'}`} onClick={handlePurchaseClick}>
                  Get Started
                </button>
              </div>
            </Tilt3D>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section section-3d">
        <div className="section-header">
          <h2 className="gradient-text">Frequently Asked Questions</h2>
          <p>Everything you need to know about Jd2Job.</p>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className={`faq-item ${openFaq === index ? 'open' : ''} edge-glow-3d`}
              onClick={() => setOpenFaq(openFaq === index ? null : index)}
            >
              <div className="faq-question">
                {faq.question}
                <span className="faq-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
              <div className="faq-answer">{faq.answer}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta cta-3d">
        <div className="cta-glow"></div>
        <div className="cta-3d-content">
          <h2>Ready to Transform Your Conversations?</h2>
          <p>Boost your confidence and efficiency with real-time AI assistance today.</p>
          <button className="hero-primary-btn large" onClick={handleStart}>
            Get Started For Free
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div className="footer-brand">
            <div className="nav-logo">
              <Jd2JobLogo width={28} height={28} />
            </div>
            <span>Jd2Job</span>
          </div>
          <div className="footer-links" style={{ display: 'flex', gap: '24px' }}>
            <button onClick={() => setComplianceModal('privacy')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>Privacy Policy</button>
            <button onClick={() => setComplianceModal('terms')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>Terms of Service</button>
          </div>
          <p>© 2026 Jd2Job. All rights reserved.</p>
        </div>
      </footer>

      {/* Compliance Modals */}
      {complianceModal && (
        <div className="demo-modal-overlay" onClick={() => setComplianceModal(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="demo-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto', padding: '32px', background: 'rgba(10, 10, 15, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '24px', backdropFilter: 'blur(20px)', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <button className="close-modal" onClick={() => setComplianceModal(null)} style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '24px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>&times;</button>
            {complianceModal === 'privacy' ? (
              <div style={{ color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
                <h2 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.8rem', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Privacy Policy</h2>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '12px' }}>Last Updated: July 2026</p>
                <p>Welcome to Jd2Job. We are committed to protecting your privacy and ensuring GDPR, CCPA, and general compliance standards are fully upheld.</p>
                
                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>1. Local-First Processing</h3>
                <p>We process all sensitive interview data, including resumes and job descriptions, directly on your local system or transiently in-memory. They are never sold, rented, or distributed to third parties.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>2. Real-Time Audio Data</h3>
                <p>Your audio and speech streams are transcribed in real-time. Transcription processing is done in-memory. We do not store, archive, or train AI models using your raw voice recordings or generated session transcriptions.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>3. Your Data Rights (GDPR / CCPA)</h3>
                <p>You have full control over your data. At any time, you can clear all stored profile configurations and search histories directly from the Settings/Reset controls inside the application.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>4. Security Compliance</h3>
                <p>We use SSL encryption to safeguard authentication requests, API key handshakes, and dashboard analytics sync. Local configurations are saved strictly within isolated browser sandbox storage.</p>
              </div>
            ) : (
              <div style={{ color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
                <h2 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.8rem', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Terms of Service</h2>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '12px' }}>Last Updated: July 2026</p>
                <p>By using the Jd2Job application or browser extension, you agree to comply with and be bound by the following terms of use.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>1. Permitted Use</h3>
                <p>Jd2Job is intended as a personal preparation tool to assist professionals during mock interview prep and job applications. You agree not to use the tool for malicious automation or site-scraping that violates LinkedIn's terms of service.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>2. Accounts and Credits</h3>
                <p>Account credentials and session credits are personal and non-transferable. You are responsible for maintaining the confidentiality of your credentials.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>3. Limitation of Liability</h3>
                <p>Jd2Job provides real-time tips and assistance, but does not guarantee employment outcomes or job application success. The service is provided "as is" without warranties of any kind.</p>

                <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '20px', marginBottom: '8px' }}>4. Refunding Policy</h3>
                <p>Credit purchases and plan payments are final. Refund requests due to connectivity or technical issues can be evaluated by submitting a ticket to support.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;