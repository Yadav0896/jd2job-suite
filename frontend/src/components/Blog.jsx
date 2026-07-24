import React from 'react';

const POSTS = [
  {
    slug: 'how-ai-can-help-you-ace-your-next-interview',
    title: 'How AI Can Help You Ace Your Next Technical Interview',
    date: 'July 20, 2026',
    summary: 'AI interview copilots are changing how candidates prepare for technical interviews. Learn how real-time AI coaching can help you structure answers, recall key points, and stay confident under pressure.',
    body: `Technical interviews are tough. You're expected to recall years of experience, structure answers using frameworks like STAR, and stay calm while doing it. AI interview copilots like Jd2Job are changing the game.

**Real-time transcription and analysis**
The AI listens to the interviewer's question, transcribes it in real time, and cross-references it against your resume and the job description. Within milliseconds, it suggests a structured answer you can read and speak naturally.

**Context-aware suggestions**
Unlike generic interview tips, an AI copilot knows YOUR background. It pulls specific examples from your resume, aligns them with the job requirements, and frames them using the STAR method (Situation, Task, Action, Result).

**ATS-optimized resumes**
Before you even get to the interview, the AI helps you pass the ATS (Applicant Tracking System) filter. It rewrites your resume for each job description, ensuring keywords match and your experience is framed exactly how recruiters expect.

**The result**
Candidates using AI coaching report feeling 94% more confident in interviews and landing 3x more callbacks. The AI doesn't replace your expertise — it helps you communicate it clearly.`,
  },
  {
    slug: 'linkedin-auto-apply-save-hours',
    title: 'How to Save 10+ Hours a Week with LinkedIn Auto Apply',
    date: 'July 15, 2026',
    summary: 'Manually applying to jobs on LinkedIn takes hours. Auto Apply tools with AI resume tailoring can handle the repetitive parts while you focus on interview prep.',
    body: `The average job seeker spends 11 hours a week filling out applications. Most of that time is spent on repetitive tasks: copying your resume, typing the same screening answers, and tailoring your experience for each role.

**Enter Auto Apply**
Jd2Job's Chrome extension automates the entire LinkedIn Easy Apply flow. It reads each job description, rewrites your resume to match, fills in the screening questions from your profile, and submits — all while you watch from the dashboard.

**One resume per job, automatically**
Generic resumes get rejected. The AI rewrites your resume for every single job application, matching keywords, emphasizing relevant experience, and scoring your ATS compatibility before submitting.

**Track everything**
Every application, tailored resume, and recruiter response is tracked in your dashboard. You can see which companies viewed your application, how many you've sent, and your ATS match scores — all in one place.

**Is it ethical?**
Auto Apply is a productivity tool, not a cheat. It handles the repetitive parts of applying so you can focus on what matters: preparing for interviews and showcasing your skills.`,
  },
  {
    slug: 'star-method-mastery',
    title: 'Master the STAR Method: A Complete Guide for 2026',
    date: 'July 8, 2026',
    summary: 'The STAR method (Situation, Task, Action, Result) is the gold standard for behavioral interviews. Learn how to structure your answers for maximum impact.',
    body: `Behavioral questions ("Tell me about a time when...") make up 60-70% of most interviews. The STAR method is your blueprint for answering them effectively.

**S - Situation**
Set the scene. Give context about the project, team, or challenge. Keep it brief — 2-3 sentences max.

**T - Task**
What was YOUR responsibility? What problem were you specifically asked to solve? Be clear about your role.

**A - Action**
This is the most important part. What did YOU do? Be specific about the technical approach, the decisions you made, and the skills you used. Use "I" not "we."

**R - Result**
Quantify the outcome. Did you improve performance? Save time? Increase revenue? Numbers make results concrete.

**Pro tip with AI coaching**
Jd2Job's AI copilot structures every suggested answer using STAR. When the interviewer asks a behavioral question, the AI pulls a relevant example from your resume and formats it in STAR format within milliseconds. You read it naturally and the interviewer hears a polished, structured response.

**Common mistakes**
- Too much situation, not enough action
- Vagueness ("we did this" vs "I did this")
- No measurable result
- Rambling — keep it under 2 minutes`,
  },
];

export default function Blog({ onBack }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '40px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>📝 Blog</h1>
            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Interview tips, job search strategies, and product updates</p>
          </div>
          {onBack && <button onClick={onBack} className="btn btn-ghost" style={{ padding: '8px 18px' }}>← Back</button>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {POSTS.map(post => (
            <article key={post.slug} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 28,
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{post.date}</div>
              <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px', lineHeight: 1.4 }}>{post.title}</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>{post.summary}</p>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{post.body}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
