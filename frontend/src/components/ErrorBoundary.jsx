import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          gap: '20px',
          color: 'var(--text-primary, #fff)',
          background: 'radial-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(20, 20, 35, 0.8) 100%)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          minHeight: '300px',
          fontFamily: "'Outfit', sans-serif",
          maxWidth: '500px',
          margin: '40px auto',
          textAlign: 'center'
        }}>
          <div style={{ 
            fontSize: '3rem', 
            background: 'linear-gradient(135deg, #ef4444 0%, #f43f5e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>⚠️</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#f43f5e' }}>Application Error</h2>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary, #9ca3af)' }}>
              An unexpected crash was intercepted safely.
            </p>
          </div>
          <div style={{ 
            fontSize: '0.8rem', 
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            color: '#e5e7eb',
            width: '100%',
            maxHeight: '120px',
            overflowY: 'auto',
            textAlign: 'left',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.stack || this.state.error?.message || 'Unknown error occurred'}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              transition: 'transform 0.15s ease'
            }}
          >
            Reload Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
