import React, { useState, useEffect } from 'react';
import './PricingPage.css';
import Tilt3D from './Tilt3D';
import { PRICING_PACKAGES } from '../services/paymentService';

const PricingPage = ({ 
  user, 
  onBack, 
  fetchUserBalance, 
  handlePayment, 
  signOut 
}) => {
  const [balance, setBalance] = useState(0);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null); // track which plan is loading
  const [success, setSuccess] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

  useEffect(() => {
    if (fetchUserBalance) {
      fetchUserBalance().then(setBalance).catch(console.error);
    }
    // Fetch full profile to display active plan info
    if (user?.id) {
      import('../services/supabaseService').then(m => {
        m.getProfile(user.id).then(setUserProfile).catch(console.error);
      });
    }
  }, [user, fetchUserBalance, success]);

  const handlePurchase = async (plan) => {
    if (!user) return;
    setLoadingPlan(plan.id);
    try {
      const result = await handlePayment(plan.id, plan.amountINR);
      if (result.success) {
        setSuccess(true);
        setShowSuccessAnimation(true);
        setTimeout(() => {
          setShowSuccessAnimation(false);
          setSuccess(false);
          fetchUserBalance().then(setBalance).catch(console.error);
        }, 2000);
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setLoadingPlan(null);
    }
  };

  const planFeatures = {
    auto_apply: [
      '2,000 Application Credits/month',
      'AI-tailored résumé per job',
      'Auto-apply on LinkedIn',
      'ATS match scoring',
      'Dashboard tracking',
    ],
    base: [
      '2,000 Session Credits per month',
      'Real-time AI suggestions',
      'Context-aware reasoning',
      'Resume & JD alignment',
      'Up to 40 mins per session',
      'Top-up eligible'
    ],
    topup: [
      '1 Extra Session Credit',
      'Uses existing plan period',
      'Up to 40 mins duration',
      'Instant activation'
    ],
    monthly_unlimited: [
      '2,000 Credits + Unlimited Voice',
      'No credit limits on mocks',
      'Stealth Ghost Mode',
      'Thank-you mail generator',
      'Priority direct support',
      'Up to 40 mins/session'
    ],
    quarterly_unlimited: [
      '2,000 Credits + Unlimited',
      '3-Month billing cycle',
      'Save over 15% vs Monthly',
      'Stealth Ghost Mode',
      'Thank-you mail generator',
      'Priority direct support'
    ]
  };

  return (
    <div className="pricing-page">
      <div className="pricing-bg-effects">
        <div className="pricing-glow-top"></div>
        <div className="pricing-glow-bottom"></div>
        <div className="pricing-grid-pattern"></div>
      </div>

      {/* Navigation */}
      <nav className="pricing-nav">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M16 10H4M4 10L9 5M4 10L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Copilot
        </button>
        
        {user && (
          <div className="user-menu">
            <div className="user-avatar">
              {user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <button className="signout-btn" onClick={signOut}>
              Sign Out
            </button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pricing-hero">
        <div className="hero-badge">
          <span className="badge-pulse"></span>
          Simple, transparent pricing
        </div>
        
        <h1 className="pricing-title">
          Invest in Your <span className="gradient-text">Career</span>
        </h1>
        
        <p className="pricing-subtitle">
          Choose a plan that fits your interview timeline. Setup securely with Razorpay.
        </p>

        {/* Current status display */}
        {userProfile && (
          <div className="current-status-chip" style={{
            background: 'var(--bg-surface, rgba(26,20,34,.6))',
            border: '1px solid var(--border)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.9rem',
            marginTop: '16px',
            display: 'inline-flex',
            gap: '8px',
            alignItems: 'center'
          }}>
            <span>Active Plan: <strong>{userProfile.plan_type ? userProfile.plan_type.toUpperCase().replace('_', ' ') : 'Free Plan'}</strong></span>
            {userProfile.plan_expires_at && (
              <span style={{ color: 'var(--text-secondary)' }}> (Expires: {new Date(userProfile.plan_expires_at).toLocaleDateString()})</span>
            )}
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>Balance: <strong>{userProfile.credits || 0} credits</strong></span>
          </div>
        )}
      </section>

      {/* Main Pricing Grid */}
      <section className="pricing-main-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 24px 48px'
      }}>
        {PRICING_PACKAGES.map((plan) => {
          const isTopupDisabled = plan.id === 'topup' && (!userProfile || (userProfile.plan_type !== 'base' && userProfile.plan_type !== 'auto_apply'));
          
          return (
            <Tilt3D key={plan.id} tiltMax={4} className="pricing-tilt">
              <div className={`pricing-card ${plan.id === 'monthly_unlimited' ? 'highlighted' : ''} ${isTopupDisabled ? 'disabled' : ''}`} style={{
                opacity: isTopupDisabled ? 0.6 : 1,
                cursor: isTopupDisabled ? 'not-allowed' : 'pointer'
              }}>
                <div className="card-glow"></div>
                
                <div className="card-header">
                  <h2 className="plan-name">{plan.label}</h2>
                  {plan.id === 'quarterly_unlimited' && <p className="plan-badge" style={{ background: 'var(--accent-gradient)' }}>Best Value</p>}
                  {plan.id === 'auto_apply' && <p className="plan-badge" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>Auto-Apply Only</p>}
                  {plan.id === 'topup' && <p className="plan-badge topup-badge" style={{ background: 'rgba(255, 255, 255, 0.15)' }}>Add-On</p>}
                </div>

                <div className="price-container">
                  <span className="price-currency">₹</span>
                  <span className="price-amount">{plan.amountINR}</span>
                  <span className="price-period">
                    {plan.id === 'base' ? '/mo' : plan.id === 'auto_apply' ? '/mo' : plan.id === 'topup' ? '/credit' : plan.id === 'monthly_unlimited' ? '/mo' : '/3 mo'}
                  </span>
                </div>

                <p className="price-subtext" style={{ minHeight: '44px', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '8px' }}>
                  {plan.description}
                </p>

                <div className="features-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(planFeatures[plan.id] || []).map((feature, index) => (
                    <div key={index} className="feature-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ color: 'var(--accent, #e08aae)' }}>
                        <path d="M3 9L7 13L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {feature}
                    </div>
                  ))}
                </div>

                <button 
                  className={`purchase-btn ${loadingPlan === plan.id ? 'loading' : ''}`}
                  onClick={() => !isTopupDisabled && handlePurchase(plan)}
                  disabled={loadingPlan !== null || !user || isTopupDisabled}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: isTopupDisabled ? 'var(--border, rgba(255,255,255,.06))' : 'linear-gradient(135deg, #b03a6b, #912f56)',
                    color: '#fff',
                    fontWeight: '600',
                    marginTop: '24px',
                    cursor: isTopupDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {loadingPlan === plan.id ? (
                    <span className="btn-loader"></span>
                  ) : isTopupDisabled ? (
                    'Requires Active Base Plan'
                  ) : (
                    <>
                      Purchase Plan
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </Tilt3D>
          );
        })}
      </section>

      {/* Trust Indicators */}
      <section className="trust-section">
        <div className="trust-item">
          <span>🔒 Secure Razorpay checkout</span>
        </div>
        <div className="trust-item">
          <span>⚡ Instant credit activation</span>
        </div>
        <div className="trust-item">
          <span>💼 Professional interview feedback</span>
        </div>
      </section>
    </div>
  );
};

export default PricingPage;