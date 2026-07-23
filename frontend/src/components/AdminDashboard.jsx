import React, { useState, useEffect } from 'react';
import { getSession } from '../services/supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AdminDashboard({ onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load');
      setStats(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ label, value, icon, color = 'var(--accent, #e08aae)' }) => (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 16, padding: 24, flex: 1, minWidth: 180,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: `${color}15`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.3rem',
      }}>{icon}</div>
      <div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div></div>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      padding: '32px 40px',
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>📊 Admin Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>Platform overview</p>
          </div>
          <button onClick={onBack} className="btn btn-ghost" style={{ padding: '8px 18px' }}>← Back</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading stats...</div>
        ) : error ? (
          <div style={{ padding: 24, color: 'var(--error)', background: 'var(--error-light)', borderRadius: 12 }}>{error}</div>
        ) : stats ? (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
              <StatCard icon="👥" label="Total Users" value={stats.totalUsers} />
              <StatCard icon="🎙️" label="Total Sessions" value={stats.totalSessions} color="var(--success)" />
              <StatCard icon="💰" label="Est. Revenue" value={`₹${(stats.estimatedRevenue || 0).toLocaleString()}`} color="#f59e0b" />
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 24,
            }}>
              <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Recent Transactions</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.recentTransactions || []).map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(t.date).toLocaleDateString()}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.8rem', color: t.amount > 0 ? 'var(--success)' : 'var(--error)' }}>{t.amount > 0 ? '+' : ''}{t.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
