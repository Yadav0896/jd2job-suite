// Jd2Job backend API client — shared between content scripts, popup, and background.
// Auth: Supabase session captured from the jd2job.com web portal by content-portal.js
// and stored in chrome.storage.local as `jd2jobSession`.
/* global chrome */
/* exported jd2jobGetSession, jd2jobFetch, jd2jobTailorResume, jd2jobGenerateAnswer, jd2jobSyncJobs, jd2jobFetchMe, JD2JOB_API_BASE */

const JD2JOB_API_BASE = 'https://jd2job.com/api';
// For local development, set chrome.storage.sync { apiBaseOverride: 'http://localhost:3001/api' }

async function jd2jobApiBase() {
  try {
    const { apiBaseOverride } = await chrome.storage.sync.get(['apiBaseOverride']);
    return apiBaseOverride || JD2JOB_API_BASE;
  } catch {
    return JD2JOB_API_BASE;
  }
}

function jd2jobSupabaseUrlFromKey(storageKey) {
  // Supabase localStorage keys look like: sb-<project-ref>-auth-token
  const match = /^sb-([a-z0-9]+)-auth-token$/.exec(storageKey || '');
  return match ? `https://${match[1]}.supabase.co` : null;
}

async function jd2jobGetSession() {
  const { jd2jobSession } = await chrome.storage.local.get(['jd2jobSession']);
  if (!jd2jobSession || !jd2jobSession.access_token) return null;

  // Refresh if expired (or expiring within 60s)
  const expiresAt = (jd2jobSession.expires_at || 0) * 1000;
  if (Date.now() < expiresAt - 60000) return jd2jobSession;

  if (!jd2jobSession.refresh_token || !jd2jobSession.supabaseUrl) {
    return jd2jobSession.access_token ? jd2jobSession : null;
  }

  try {
    const res = await fetch(`${jd2jobSession.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: jd2jobSession.anonKey || '' },
      body: JSON.stringify({ refresh_token: jd2jobSession.refresh_token }),
    });
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    const data = await res.json();
    const next = {
      ...jd2jobSession,
      access_token: data.access_token,
      refresh_token: data.refresh_token || jd2jobSession.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    };
    await chrome.storage.local.set({ jd2jobSession: next });
    return next;
  } catch (err) {
    console.warn('[Jd2Job] Session refresh failed:', err.message);
    return jd2jobSession; // try the old token anyway; server will 401 if dead
  }
}

async function jd2jobFetch(path, { method = 'GET', body } = {}) {
  const session = await jd2jobGetSession();
  if (!session) {
    throw new Error('Not connected to Jd2Job. Open the extension and connect your account.');
  }

  const base = await jd2jobApiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    throw new Error('Session expired. Open jd2job.com, sign in, and reconnect the extension.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Server error (${res.status})`);
  }
  return data;
}

function jd2jobTailorResume(payload) {
  return jd2jobFetch('/extension/tailor-resume', { method: 'POST', body: payload });
}

function jd2jobGenerateAnswer(payload) {
  return jd2jobFetch('/extension/answer', { method: 'POST', body: payload });
}

function jd2jobSyncJobs(jobs) {
  return jd2jobFetch('/jd2job/sync', { method: 'POST', body: { jobs } });
}

function jd2jobFetchMe() {
  return jd2jobFetch('/extension/me');
}
