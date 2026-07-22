// content-portal.js — bridges the jd2job.com web portal and the extension.
// Captures the user's session so the extension can call the Jd2Job API.
// The web app publishes `jd2job_extension_auth` in localStorage:
// { access_token, refresh_token, expires_at, supabaseUrl, anonKey, userId, email }
(function () {
  const SESSION_KEY = 'jd2job_extension_auth';

  function readPortalSession() {
    // Preferred: dedicated key written by the web app
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.access_token) return parsed;
      }
    } catch (e) {
      console.warn('[Jd2Job] Failed to parse portal session key:', e.message);
    }

    // Fallback: parse Supabase's own localStorage blob (sb-<ref>-auth-token)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const match = /^sb-([a-z0-9]+)-auth-token$/.exec(key || '');
        if (!match) continue;
        const data = JSON.parse(localStorage.getItem(key) || 'null');
        if (data && data.access_token) {
          return {
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
            expires_at: data.expires_at || 0,
            supabaseUrl: `https://${match[1]}.supabase.co`,
            anonKey: null,
            userId: data.user?.id || null,
            email: data.user?.email || null,
          };
        }
      }
    } catch (e) {
      console.warn('[Jd2Job] Failed to parse Supabase session:', e.message);
    }
    return null;
  }

  async function syncSession() {
    const session = readPortalSession();
    if (session) {
      await chrome.storage.local.set({ jd2jobSession: session });
    } else {
      const { jd2jobSession } = await chrome.storage.local.get(['jd2jobSession']);
      if (jd2jobSession) {
        await chrome.storage.local.remove(['jd2jobSession']);
        console.log('[Jd2Job] Cleared extension session (signed out of portal)');
      }
    }
  }

  syncSession();
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY || (e.key || '').startsWith('sb-')) syncSession();
  });
  // SPA route changes don't reload the page — poll lightly.
  setInterval(syncSession, 5000);
})();
