import React from 'react';

const PAGES = {
  privacy: {
    title: 'Privacy Policy',
    content: (
      <>
        <p><strong>Last updated:</strong> July 2026</p>

        <h3>1. What We Collect</h3>
        <p>When you use Jd2Job, we collect:</p>
        <ul>
          <li><strong>Account information</strong> — your email address, name, and authentication provider when you sign up.</li>
          <li><strong>Uploaded documents</strong> — your résumé, job descriptions, and assignment documents you choose to upload.</li>
          <li><strong>Interview transcripts</strong> — text transcriptions of your live interview audio, generated in real time for AI coaching.</li>
          <li><strong>Voice recordings</strong> — audio from your microphone during mock interviews or live coaching sessions.</li>
          <li><strong>Usage data</strong> — features used, session duration, and anonymized performance metrics to improve the product.</li>
        </ul>

        <h3>2. How We Use Your Data</h3>
        <ul>
          <li>To provide AI-powered interview coaching tailored to your résumé and job descriptions.</li>
          <li>To save your session history, transcripts, and performance scores so you can review them later.</li>
          <li>To improve our AI models and product experience using anonymized, aggregated data.</li>
          <li>To communicate product updates, billing information, and support responses.</li>
        </ul>
        <p>We <strong>never</strong> sell your personal data to third parties.</p>

        <h3>3. Audio & Voice Data</h3>
        <p>Your voice audio is processed <strong>in memory only</strong> and is never written to disk or permanent storage. Audio streams are sent directly to our transcription provider (Deepgram) over encrypted WebSocket connections and discarded immediately after transcription.</p>
        <p>No audio files are stored on our servers. No audio is used to train any AI model.</p>

        <h3>4. Data Storage & Security</h3>
        <p>Your account data, uploaded documents, and transcripts are stored in Supabase — a SOC 2 Type II certified database provider. All data is encrypted in transit (TLS 1.3) and at rest (AES-256).</p>
        <p>API keys for third-party AI providers (DeepSeek, Deepgram, Groq, NVIDIA) are stored server-side only and are never exposed to the client.</p>

        <h3>5. Third-Party Services</h3>
        <p>To deliver our service, we use the following providers. Each processes data according to their own privacy policies:</p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, and storage</li>
          <li><strong>Deepgram</strong> — speech-to-text transcription</li>
          <li><strong>DeepSeek / Groq / NVIDIA</strong> — AI language model inference</li>
          <li><strong>Razorpay</strong> — payment processing (if you purchase a plan)</li>
          <li><strong>Vercel / Railway</strong> — application hosting</li>
        </ul>

        <h3>6. Your Rights</h3>
        <p>You have the right to:</p>
        <ul>
          <li>Access all personal data we hold about you.</li>
          <li>Request deletion of your account and all associated data.</li>
          <li>Export your session history and transcripts.</li>
          <li>Withdraw consent for data processing at any time.</li>
        </ul>
        <p>To exercise any of these rights, email us at <strong>hello@jd2job.com</strong>.</p>

        <h3>7. Data Retention</h3>
        <p>We retain your account data, session history, and uploaded documents for as long as your account is active. If you delete your account, all associated data is permanently removed within 30 days.</p>
        <p>Anonymized, aggregated usage statistics may be retained indefinitely for product improvement.</p>

        <h3>8. Contact</h3>
        <p>For privacy-related questions or requests, contact our Data Protection Officer at <strong>hello@jd2job.com</strong>.</p>
      </>
    ),
  },

  terms: {
    title: 'Terms of Service',
    content: (
      <>
        <p><strong>Last updated:</strong> July 2026</p>

        <h3>1. Acceptance</h3>
        <p>By accessing or using Jd2Job (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

        <h3>2. Eligibility</h3>
        <p>You must be at least 18 years old to use the Service. By using the Service, you represent that you meet this age requirement.</p>

        <h3>3. Account</h3>
        <p>You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activities that occur under your account. Notify us immediately of any unauthorized use.</p>

        <h3>4. Acceptable Use</h3>
        <p>You agree NOT to:</p>
        <ul>
          <li>Use the Service for any illegal purpose or in violation of any law.</li>
          <li>Use the Service to cheat in interviews, examinations, or assessments where AI assistance is prohibited.</li>
          <li>Attempt to circumvent any usage limits, payment requirements, or security measures.</li>
          <li>Resell, redistribute, or sublicense the Service without explicit written permission.</li>
          <li>Upload malicious code, attempt to breach security, or interfere with the Service's operation.</li>
          <li>Use the Service to generate harmful, abusive, or deceptive content.</li>
        </ul>

        <h3>5. AI-Generated Content</h3>
        <p>Jd2Job provides AI-generated suggestions, answers, and résumé tailoring. While we strive for accuracy, AI outputs may contain errors, omissions, or hallucinations. <strong>You are solely responsible for reviewing and verifying any AI-generated content before using it.</strong> We provide no warranty regarding the accuracy, completeness, or appropriateness of AI outputs.</p>

        <h3>6. Payments & Credits</h3>
        <p>Certain features require credits or a paid subscription. Prices are listed on our Pricing page and are subject to change with 30 days&apos; notice. All payments are processed securely through Razorpay. Credits are non-transferable and expire at the end of your billing period unless otherwise stated.</p>
        <p>Refund requests are handled on a case-by-case basis. Contact <strong>hello@jd2job.com</strong> within 7 days of purchase.</p>

        <h3>7. Intellectual Property</h3>
        <p>The Jd2Job platform, including its code, design, branding, and algorithms, is owned by Jd2Job. You retain all rights to the content you upload (résumés, assignments, job descriptions). We claim no ownership over your uploaded content.</p>

        <h3>8. Limitation of Liability</h3>
        <p>To the maximum extent permitted by law, Jd2Job shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to lost job opportunities, interview outcomes, or hiring decisions.</p>
        <p>Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

        <h3>9. Termination</h3>
        <p>We may suspend or terminate your account for violation of these Terms, with or without notice. You may delete your account at any time through the Settings page or by contacting us.</p>

        <h3>10. Changes</h3>
        <p>We may update these Terms from time to time. Material changes will be communicated via email or in-app notice. Continued use after changes constitutes acceptance.</p>

        <h3>11. Governing Law</h3>
        <p>These Terms are governed by the laws of India. Any disputes shall be resolved in the courts of Bengaluru, Karnataka.</p>

        <h3>12. Contact</h3>
        <p>For legal inquiries: <strong>hello@jd2job.com</strong></p>
      </>
    ),
  },

  about: {
    title: 'About Jd2Job',
    content: (
      <>
        <h3>Our Mission</h3>
        <p>Jd2Job was built to solve a single, frustrating problem: <strong>the job search process is broken.</strong> Candidates spend hours tailoring résumés, filling repetitive forms, and freezing up in interviews — while the tools to help them simply don&apos;t exist.</p>
        <p>We believe AI should do the grind so you can do the talking. Every feature we build — from Auto Apply to real-time voice coaching — is designed to give you back your time and confidence.</p>

        <h3>What We Do</h3>
        <ul>
          <li><strong>Auto Apply</strong> — Our Chrome extension reads job descriptions on LinkedIn, rewrites your résumé for each role, answers screening questions, and submits applications — while you watch from the dashboard.</li>
          <li><strong>Interview Copilot</strong> — Real-time AI coaching during live interviews. It listens, transcribes, and suggests structured answers tailored to your résumé and the job description.</li>
          <li><strong>Mock Interviews</strong> — Full speech-to-speech practice sessions with an AI interviewer that asks realistic questions, listens to your answers, and gives instant feedback with scores.</li>
          <li><strong>ATS Score & Résumé Tailoring</strong> — Every résumé is rewritten for each job description and scored for Applicant Tracking System compatibility before submission.</li>
        </ul>

        <h3>Built For</h3>
        <p>Software engineers, product managers, designers, data scientists, and professionals across tech who are actively job searching or preparing for interviews. Our users range from fresh graduates to senior leaders with 15+ years of experience.</p>

        <h3>Our Stack</h3>
        <p>Jd2Job is built on a modern architecture optimized for speed and reliability:</p>
        <ul>
          <li><strong>Frontend:</strong> React + Vite, with a custom design system featuring WebGL, 3D transforms, and glassmorphic UI</li>
          <li><strong>Backend:</strong> Node.js + Express, with WebSocket proxies for real-time voice</li>
          <li><strong>Database:</strong> Supabase (PostgreSQL) with Row-Level Security</li>
          <li><strong>AI Models:</strong> DeepSeek, Llama 3.1 (Groq/NVIDIA), with smart fallback routing</li>
          <li><strong>Voice:</strong> Deepgram for speech-to-text and text-to-speech</li>
          <li><strong>Desktop:</strong> Electron for native Windows/macOS experience with global shortcuts and stealth mode</li>
        </ul>

        <h3>Privacy First</h3>
        <p>Your voice is processed in memory and discarded immediately. No audio files are ever written to disk or used to train models. Your uploaded documents and transcripts are encrypted and accessible only to you. Read our full <a href="#" onClick={(e) => { e.preventDefault(); }} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Privacy Policy</a> for details.</p>

        <h3>Contact</h3>
        <p>We&apos;re a small, focused team based in India. We read every email and reply within a day.</p>
        <p><strong>Email:</strong> hello@jd2job.com</p>
        <p><strong>Twitter/X:</strong> @jd2job</p>
      </>
    ),
  },
};

export default function LegalModal({ page, onClose }) {
  const data = PAGES[page];
  if (!data) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700, width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', padding: '20px 24px', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {page === 'privacy' ? '🔒' : page === 'terms' ? '📜' : 'ℹ️'} {data.title}
            </h2>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '1.4rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '20px 28px 28px', overflowY: 'auto', flex: 1, fontSize: '0.9rem', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          {data.content}
        </div>
        <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', flexShrink: 0, textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent, #912f56)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 24px', cursor: 'pointer', fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        .modal-body h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-top: 28px;
          margin-bottom: 8px;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .modal-body h3:first-of-type { margin-top: 0; }
        .modal-body p { margin-bottom: 12px; }
        .modal-body ul { padding-left: 20px; margin-bottom: 16px; }
        .modal-body li { margin-bottom: 6px; }
        .modal-body strong { color: var(--text-primary); }
      `}</style>
    </div>
  );
}
