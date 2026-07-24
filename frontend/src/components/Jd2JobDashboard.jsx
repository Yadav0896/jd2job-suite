import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getSession } from '../services/supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function StatCard({ icon, label, value, color = 'var(--accent, #e08aae)' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 22px', flex: 1, minWidth: 150,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: `${color}14`, border: `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.2rem', flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function Jd2JobDashboard({ onBack }) {
  const { state } = useApp();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [sortBy, setSortBy] = useState('applied_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchJobs = async () => {
    setLoading(true); setError(null);
    try {
      const session = await getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch(`${API_BASE}/api/jd2job/jobs`, { headers });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setJobs(data.success ? (data.jobs || []) : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId) => {
    if (!window.confirm('Delete this job record?')) return;
    try {
      const session = await getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      await fetch(`${API_BASE}/api/jd2job/jobs/${jobId}`, { method: 'DELETE', headers });
      setJobs(jobs.filter(j => j.id !== jobId));
      if (selectedJob?.id === jobId) setSelectedJob(null);
    } catch (err) { alert('Failed to delete: ' + err.message); }
  };

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(s => s === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  useEffect(() => { fetchJobs(); }, []);

  const filteredJobs = jobs
    .filter(j => (j.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || (j.company || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      let va = a[sortBy] || '', vb = b[sortBy] || '';
      if (sortBy === 'applied_at') { va = new Date(va).getTime() || 0; vb = new Date(vb).getTime() || 0; }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      return sortOrder === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

  const totalApplied = jobs.length;
  const today = new Date().toISOString().split('T')[0];
  const appliedToday = jobs.filter(j => { if (!j.applied_at) return false; const d = new Date(j.applied_at); return !isNaN(d.getTime()) && d.toISOString().split('T')[0] === today; }).length;
  const uniqueCompanies = [...new Set(jobs.map(j => j.company).filter(Boolean))].length;

  const SortIcon = ({ field }) => (
    <span style={{ marginLeft: 4, opacity: sortBy === field ? 1 : 0.3, fontSize: '0.65rem' }}>
      {sortBy === field ? (sortOrder === 'asc' ? '▲' : '▼') : '▼'}
    </span>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 68, flexShrink: 0,
        background: 'var(--glass-bg)', backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} className="header-btn" style={{ padding: '7px 14px', fontSize: '0.82rem' }}>← Exit</button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Auto-Apply Analytics</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => window.open('https://chromewebstore.google.com/detail/ijeadagkdnlaidobdoojmcfpojepocpk', '_blank')}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 600,
              fontSize: '0.8rem', fontFamily: 'inherit',
            }}>🧩 Get Extension</button>
          <button onClick={fetchJobs} className="header-btn" style={{ padding: '7px 14px', fontSize: '0.82rem' }}>↻ Refresh</button>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
            <div className="thinking-spinner" style={{ margin: '0 auto 16px', width: 32, height: 32 }} />
            Loading your applications...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔌</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Couldn't load data</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.88rem' }}>{error}</p>
            <button onClick={fetchJobs} className="btn btn-primary" style={{ padding: '10px 24px' }}>Try Again</button>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '4rem', marginBottom: 16 }}>📭</div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No applications yet</h2>
            <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.7, fontSize: '0.9rem' }}>
              Install the Jd2Job Chrome Extension and start auto-applying on LinkedIn. Your applications will appear here automatically.
            </p>
            <button onClick={() => window.open('https://chromewebstore.google.com/detail/ijeadagkdnlaidobdoojmcfpojepocpk', '_blank')}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
                borderRadius: 10, padding: '12px 28px', cursor: 'pointer', fontWeight: 700,
                fontSize: '0.9rem', fontFamily: 'inherit',
              }}>🧩 Install Chrome Extension</button>
          </div>
        ) : (
          <>
            {/* Stats Row */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
              <StatCard icon="📤" label="Total Applied" value={totalApplied} />
              <StatCard icon="📅" label="Today" value={appliedToday} color="var(--success, #10b981)" />
              <StatCard icon="🏢" label="Companies" value={uniqueCompanies} color="var(--holo-purple, #8b5cf6)" />
            </div>

            {/* Search + Table */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Search bar */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <input
                  type="text" placeholder="🔍 Search by job title or company..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border-medium)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                      {[
                        { key: 'title', label: 'Job Title' },
                        { key: 'company', label: 'Company' },
                        { key: 'applied_at', label: 'Applied' },
                      ].map(col => (
                        <th key={col.key} onClick={() => handleSort(col.key)}
                          style={{
                            padding: '12px 16px', textAlign: 'left', cursor: 'pointer',
                            fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
                            userSelect: 'none',
                          }}>
                          {col.label}<SortIcon field={col.key} />
                        </th>
                      ))}
                      <th style={{ padding: '12px 16px', textAlign: 'right', width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map(job => (
                      <tr key={job.id}
                        onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          background: selectedJob?.id === job.id ? 'var(--accent-light, rgba(224,138,174,.08))' : 'transparent',
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (selectedJob?.id !== job.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { if (selectedJob?.id !== job.id) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {job.title || '—'}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {job.company || '—'}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {job.applied_at ? new Date(job.applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button onClick={e => { e.stopPropagation(); handleDelete(job.id); }}
                            style={{
                              background: 'none', border: '1px solid transparent', borderRadius: 6,
                              padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)',
                              fontSize: '0.78rem', transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                          >🗑</button>
                        </td>
                      </tr>
                    ))}
                    {filteredJobs.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No matches</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected job detail */}
            {selectedJob && (
              <div style={{
                marginTop: 20, padding: 24,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{selectedJob.title}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>{selectedJob.company} · Applied {selectedJob.applied_at ? new Date(selectedJob.applied_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <button onClick={() => setSelectedJob(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                </div>
                {selectedJob.tailored_resume && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>Tailored Resume</div>
                    <div style={{
                      background: 'var(--bg-input)', border: '1px solid var(--border-light)',
                      borderRadius: 10, padding: '16px 20px',
                      fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
                      fontFamily: 'inherit',
                    }}>
                      {selectedJob.tailored_resume}
                    </div>
                  </div>
                )}
                {selectedJob.hiring_team && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>Hiring Team</div>
                    <pre style={{
                      background: 'var(--bg-input)', border: '1px solid var(--border-light)',
                      borderRadius: 10, padding: '12px 16px',
                      fontSize: '0.8rem', color: 'var(--text-muted)', overflowX: 'auto',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{JSON.stringify(selectedJob.hiring_team, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
