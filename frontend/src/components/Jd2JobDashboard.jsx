import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../services/supabaseClient';
import ReactMarkdown from 'react-markdown';

export default function Jd2JobDashboard({ onBack }) {
  const { state } = useApp();
  const { user } = state;
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResume, setSelectedResume] = useState(null);
  const [sortBy, setSortBy] = useState('applied_at'); // 'applied_at' | 'company' | 'title'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Recruiter cold outreach generation state
  const [activeModalTab, setActiveModalTab] = useState('resume'); // 'resume' | 'outreach'
  const [outreachPitch, setOutreachPitch] = useState('');
  const [isGeneratingPitch, setIsGeneratingPitch] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${API_BASE}/api/jd2job/jobs`, { headers });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
      } else {
        throw new Error(data.error || 'Failed to load jobs');
      }
    } catch (err) {
      console.error('[Jd2JobDashboard] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateOutreachPitch = async (jobRecord) => {
    const targetJob = jobRecord || selectedResume;
    if (!targetJob) return;
    setIsGeneratingPitch(true);
    setOutreachPitch('');
    try {
      const session = await getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const prompt = `You are a professional copywriter. Write two high-converting outreach message templates written strictly in the FIRST-PERSON ("I", "my") from the perspective of the candidate themselves applying for the position of "${targetJob.title}" at "${targetJob.company}". Do NOT write in the third-person or as an external recruiter.

Write these two templates:
1. **LinkedIn Connection Pitch** (Under 300 characters, short & crisp, with placeholders like [Name]):
2. **Hiring Manager Cold Email** (Under 150 words, clean subject line, direct value pitch, clear call to action, signed off by the candidate):

Format both with clear Markdown headers. Here is the tailored resume details:
${targetJob.tailored_resume}`;

      const res = await fetch(`${API_BASE}/api/deepseek/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!res.ok) throw new Error('Failed to generate outreach pitch');
      const data = await res.json();
      
      if (data.choices?.[0]?.message?.content) {
        setOutreachPitch(data.choices[0].message.content);
      } else if (data.content) {
        setOutreachPitch(data.content);
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (err) {
      console.error(err);
      setOutreachPitch('⚠️ Error generating outreach templates: ' + err.message);
    } finally {
      setIsGeneratingPitch(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job application record?')) return;
    try {
      const session = await getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/api/jd2job/jobs/${jobId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error('Failed to delete job');
      setJobs(jobs.filter(j => j.id !== jobId));
      if (selectedResume?.id === jobId) {
        setSelectedResume(null);
      }
    } catch (err) {
      alert(`Error deleting job: ${err.message}`);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Filter and sort jobs
  const processedJobs = jobs
    .filter(job => 
      job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let valA = a[sortBy] || '';
      let valB = b[sortBy] || '';
      
      if (sortBy === 'applied_at') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Paginated jobs
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentJobs = processedJobs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(processedJobs.length / itemsPerPage);

  // Calculate statistics
  const totalApplied = jobs.length;
  const appliedToday = jobs.filter(job => {
    const today = new Date().toISOString().split('T')[0];
    const appDate = new Date(job.applied_at).toISOString().split('T')[0];
    return today === appDate;
  }).length;

  // Calculate weekly breakdown (last 7 days)
  const getWeeklyBreakdown = () => {
    const counts = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      counts[key] = {
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: 0
      };
    }

    jobs.forEach(job => {
      const appDate = new Date(job.applied_at).toISOString().split('T')[0];
      if (counts[appDate]) {
        counts[appDate].count++;
      }
    });

    return Object.values(counts);
  };

  const weeklyData = getWeeklyBreakdown();
  const maxWeeklyCount = Math.max(...weeklyData.map(d => d.count), 1);

  return (
    <div className="jd2job-dashboard" style={{
      padding: '24px',
      color: 'var(--text-primary)',
      background: 'var(--bg-main, #0a0a0f)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={onBack}
            className="header-btn" 
            style={{ 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ← Exit to Hub
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: '#10b981' }}>Jd2Job</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>LinkedIn Auto-Apply Analytics & Tracker</p>
          </div>
        </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          color: '#10b981',
          fontWeight: 600
        }}>
          <span className="live-dot pulse" style={{ background: '#10b981' }} />
          Extension Synced (Localhost)
        </div>
      </div>

      {/* ── Stats grid ────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        <div className="stat-card" style={{
          background: 'var(--bg-card, rgba(20, 20, 30, 0.6))',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Applications</span>
          <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981' }}>{totalApplied}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Synced from Chrome Extension</span>
        </div>

        <div className="stat-card" style={{
          background: 'var(--bg-card, rgba(20, 20, 30, 0.6))',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Applied Today</span>
          <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#38bdf8' }}>{appliedToday}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completed in last 24 hours</span>
        </div>



        {/* Weekly Chart Card */}
        <div className="stat-card" style={{
          background: 'var(--bg-card, rgba(20, 20, 30, 0.6))',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px 20px',
          gridColumn: 'span 2',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Activity (Last 7 Days)</span>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: '80px',
            gap: '8px'
          }}>
            {weeklyData.map((d, i) => {
              const heightPct = (d.count / maxWeeklyCount) * 100;
              return (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1,
                  gap: '6px'
                }}>
                  <div style={{
                    width: '100%',
                    height: '60px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '4px'
                  }}>
                    <div style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
                      borderRadius: '4px',
                      transition: 'height 0.3s ease',
                      position: 'relative'
                    }} title={`${d.count} jobs`}>
                      {d.count > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: '-18px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          color: '#10b981'
                        }}>{d.count}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Table & Search Section ───────────────────────── */}
      <div style={{
        background: 'var(--bg-card, rgba(20, 20, 30, 0.6))',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        flex: 1
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Application Log</h2>
          <div style={{ display: 'flex', gap: '8px', width: '320px' }}>
            <input 
              type="text" 
              placeholder="Search by company or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(10, 10, 15, 0.8)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: '12px' }}>
            <div className="thinking-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading jobs...</span>
          </div>
        ) : processedJobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '2rem' }}>📂</span>
            <p style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>No job applications found matching your criteria.</p>
            <p style={{ margin: 0, fontSize: '0.75rem' }}>Run the Jd2Job extension in Chrome to populate this dashboard.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            <div style={{ overflowX: 'auto', flex: 1 }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.85rem'
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th 
                      onClick={() => handleSort('company')}
                      style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      Company {sortBy === 'company' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th 
                      onClick={() => handleSort('title')}
                      style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      Job Title {sortBy === 'title' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th 
                      onClick={() => handleSort('applied_at')}
                      style={{ padding: '12px 8px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      Date Applied {sortBy === 'applied_at' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '12px 8px' }}>Hiring Manager</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center' }}>Job Link</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentJobs.map((job) => (
                    <tr key={job.id} style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.2s',
                      cursor: 'default'
                    }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                       onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '14px 8px', fontWeight: 600 }}>{job.company}</td>
                      <td style={{ padding: '14px 8px' }}>{job.title}</td>
                      <td style={{ padding: '14px 8px', color: 'var(--text-secondary)' }}>
                        {new Date(job.applied_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td style={{ padding: '14px 8px' }}>
                        {job.hiring_team ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {job.hiring_team.avatar && (
                              <img src={job.hiring_team.avatar} alt={job.hiring_team.name} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                            )}
                            {job.hiring_team.link ? (
                              <a 
                                href={job.hiring_team.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                              >
                                {job.hiring_team.name}
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                  <polyline points="15 3 21 3 21 9"></polyline>
                                  <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                              </a>
                            ) : (
                              <span style={{ fontWeight: 500 }}>{job.hiring_team.name}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                        {job.link ? (
                          <a 
                            href={job.link} 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{ color: '#10b981', textDecoration: 'none', fontWeight: 500 }}
                          >
                            View Link ↗
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 8px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {job.tailored_resume ? (
                          <>
                            <button 
                              onClick={() => {
                                setSelectedResume(job);
                                setActiveModalTab('resume');
                                setOutreachPitch('');
                              }}
                              className="copy-btn"
                              style={{ 
                                fontSize: '0.75rem', 
                                padding: '6px 12px', 
                                background: 'rgba(145, 47, 86, 0.1)', 
                                color: '#e08aae',
                                border: '1px solid rgba(145, 47, 86, 0.25)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                            >
                              📄 Resume
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedResume(job);
                                setActiveModalTab('outreach');
                                setOutreachPitch('');
                                generateOutreachPitch(job);
                              }}
                              className="copy-btn"
                              style={{ 
                                fontSize: '0.75rem', 
                                padding: '6px 12px', 
                                background: 'rgba(16, 185, 129, 0.1)', 
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                            >
                              ✉️ Outreach
                            </button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: '4px' }}>No assets</span>
                        )}
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          style={{
                            fontSize: '0.75rem',
                            padding: '6px 8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Delete application record"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)'
              }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  style={{
                    background: currentPage === 1 ? 'transparent' : 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  style={{
                    background: currentPage === totalPages ? 'transparent' : 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tailored Resume Preview Modal ────────────────── */}
      {selectedResume && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            background: '#12121a',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#161622'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>Application Assets</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  {selectedResume.title} at {selectedResume.company}
                </p>
              </div>
              <button 
                onClick={() => setSelectedResume(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#94a3b8', 
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
              >
                ✕
              </button>
            </div>

            {/* Tabs Selector */}
            <div style={{
              display: 'flex',
              background: '#14141e',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                onClick={() => setActiveModalTab('resume')}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: 'none',
                  background: 'none',
                  color: activeModalTab === 'resume' ? '#10b981' : '#94a3b8',
                  fontWeight: activeModalTab === 'resume' ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderBottom: activeModalTab === 'resume' ? '2px solid #10b981' : '2px solid transparent',
                  transition: 'all 0.18s'
                }}
              >
                📄 Tailored Resume
              </button>
              <button
                onClick={() => {
                  setActiveModalTab('outreach');
                  if (!outreachPitch) {
                    generateOutreachPitch();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: 'none',
                  background: 'none',
                  color: activeModalTab === 'outreach' ? '#10b981' : '#94a3b8',
                  fontWeight: activeModalTab === 'outreach' ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderBottom: activeModalTab === 'outreach' ? '2px solid #10b981' : '2px solid transparent',
                  transition: 'all 0.18s'
                }}
              >
                ✉️ Recruiter Cold Outreach
              </button>
            </div>
            
            {/* Modal Body */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              whiteSpace: 'pre-wrap',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              background: '#09090d',
              color: '#e2e8f0',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {activeModalTab === 'resume' ? (
                selectedResume.tailored_resume
              ) : isGeneratingPitch ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: '12px' }}>
                  <div className="thinking-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Generating personalized templates via DeepSeek…</span>
                </div>
              ) : (
                <div className="premium-markdown" style={{ color: '#d1d5db', fontFamily: 'sans-serif' }}>
                  {selectedResume.hiring_team && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      {selectedResume.hiring_team.avatar ? (
                        <img 
                          src={selectedResume.hiring_team.avatar} 
                          alt={selectedResume.hiring_team.name} 
                          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '1rem'
                        }}>
                          {selectedResume.hiring_team.name.charAt(0)}
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f8fafc' }}>
                          Hiring Manager: {selectedResume.hiring_team.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {selectedResume.hiring_team.title || 'Hiring Team Member'}
                        </div>
                      </div>
                      {selectedResume.hiring_team.link && (
                        <a 
                          href={selectedResume.hiring_team.link} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                            fontWeight: '600',
                            transition: 'background 0.2s'
                          }}
                        >
                          View LinkedIn ↗
                        </a>
                      )}
                    </div>
                  )}
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 style={{color: '#f8fafc', fontSize: '1.25rem', marginTop: '20px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px'}} {...props} />,
                      h2: ({node, ...props}) => <h2 style={{color: '#f8fafc', fontSize: '1.15rem', marginTop: '16px', marginBottom: '8px'}} {...props} />,
                      h3: ({node, ...props}) => <h3 style={{color: '#38bdf8', fontSize: '1.05rem', marginTop: '16px', marginBottom: '6px', fontWeight: '600'}} {...props} />,
                      p: ({node, ...props}) => <p style={{color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.6', margin: '0 0 12px 0'}} {...props} />,
                      li: ({node, ...props}) => <li style={{color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.6', margin: '0 0 4px 0'}} {...props} />,
                      strong: ({node, ...props}) => <strong style={{color: '#38bdf8', fontWeight: '600'}} {...props} />,
                    }}
                  >
                    {outreachPitch || 'No pitch templates generated.'}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              background: '#161622'
            }}>
              {activeModalTab === 'outreach' && outreachPitch && (
                <button 
                  onClick={() => {
                    const subjectMatch = outreachPitch.match(/\*\*Subject:\*\*\s*(.*)/i) || outreachPitch.match(/Subject:\s*(.*)/i);
                    const subject = subjectMatch ? subjectMatch[1].trim() : `Job Application - ${selectedResume.title} at ${selectedResume.company}`;
                    
                    let emailBody = outreachPitch;
                    const emailIndex = outreachPitch.toLowerCase().indexOf('email');
                    if (emailIndex !== -1) {
                      emailBody = outreachPitch.substring(emailIndex);
                    }
                    emailBody = emailBody
                      .replace(/\*\*Subject:\*\*\s*(.*)/i, '')
                      .replace(/Subject:\s*(.*)/i, '')
                      .replace(/^[#*-\s]+/gm, '')
                      .replace(/\*\*/g, '');

                    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
                    window.open(mailtoUrl, '_blank');
                  }}
                  className="header-btn"
                  style={{ 
                    background: '#a855f7', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem'
                  }}
                >
                  📧 Open Draft Email
                </button>
              )}
              <button 
                onClick={() => {
                  const content = activeModalTab === 'resume' ? selectedResume.tailored_resume : outreachPitch;
                  navigator.clipboard.writeText(content);
                  alert('Copied to clipboard!');
                }}
                className="header-btn"
                style={{ 
                  background: '#10b981', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
                disabled={activeModalTab === 'outreach' && isGeneratingPitch}
              >
                📋 Copy Details
              </button>
              <button 
                onClick={() => {
                  const content = activeModalTab === 'resume' ? selectedResume.tailored_resume : outreachPitch;
                  const suffix = activeModalTab === 'resume' ? 'Resume' : 'Outreach';
                  const element = document.createElement("a");
                  const file = new Blob([content], {type: 'text/plain'});
                  element.href = URL.createObjectURL(file);
                  element.download = `${selectedResume.company.replace(/\s+/g, '_')}_${selectedResume.title.replace(/\s+/g, '_')}_${suffix}.txt`;
                  document.body.appendChild(element);
                  element.click();
                  document.body.removeChild(element);
                }}
                className="header-btn"
                style={{ 
                  background: '#38bdf8', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
                disabled={activeModalTab === 'outreach' && isGeneratingPitch}
              >
                📥 Download Text
              </button>
              <button 
                onClick={() => setSelectedResume(null)}
                className="header-btn"
                style={{ 
                  background: '#232333', 
                  color: '#ffffff', 
                  border: '1px solid rgba(255, 255, 255, 0.15)', 
                  borderRadius: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'background 0.2s'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
