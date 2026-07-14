/**
 * supabaseClient — Supabase client singleton for the frontend.
 *
 * Uses anon key (safe for client-side). Row-Level Security (RLS) on Supabase
 * enforces data access rules. Authenticated users can only see their own data.
 *
 * Persists data to localStorage if the configured Supabase endpoint is the default
 * or unreachable.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

// Auto-detect if we should run in local offline/mock mode
const isOfflineOrPlaceholder = 
  supabaseUrl.includes('aavfvqzvqsfziagltbvg.supabase.co') || 
  supabaseUrl.includes('your-project.supabase.co') ||
  !supabaseUrl ||
  supabaseAnonKey === 'your-anon-key';

const useMock = isOfflineOrPlaceholder || localStorage.getItem('supabase_force_mock') === 'true';

// ── Mock Supabase Client ──
class MockSupabaseClient {
  constructor() {
    this.listeners = [];
    this.auth = {
      getSession: async () => {
        const session = localStorage.getItem('mock_supabase_session');
        return { data: { session: session ? JSON.parse(session) : null }, error: null };
      },
      getUser: async () => {
        const user = localStorage.getItem('mock_supabase_user');
        return { data: { user: user ? JSON.parse(user) : null }, error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        console.log(`[MockAuth] Reset password email sent to ${email}`);
        return { data: {}, error: null };
      },
      updateUser: async (attributes) => {
        console.log('[MockAuth] User attributes updated:', attributes);
        return { data: { user: JSON.parse(localStorage.getItem('mock_supabase_user') || '{}') }, error: null };
      },
      signUp: async ({ email, password, options }) => {
        const user = {
          id: 'mock-user-id-' + email.replace(/[^a-zA-Z0-9]/g, ''),
          email,
          user_metadata: options?.data || {},
          created_at: new Date().toISOString()
        };
        const profile = {
          id: user.id,
          display_name: options?.data?.name || email.split('@')[0],
          credits: 1,
          plan_type: 'trial',
          plan_started_at: null,
          plan_expires_at: null,
          referred_by: options?.data?.referred_by || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        // Save profile
        const profiles = JSON.parse(localStorage.getItem('mock_table_profiles') || '[]');
        if (!profiles.some(p => p.id === user.id)) {
          profiles.push(profile);
          localStorage.setItem('mock_table_profiles', JSON.stringify(profiles));
        }

        const session = { user, access_token: 'mock-token-' + user.id };
        localStorage.setItem('mock_supabase_session', JSON.stringify(session));
        localStorage.setItem('mock_supabase_user', JSON.stringify(user));
        
        this._notifyAuthStateChange('SIGNED_IN', session);
        return { data: { user, session }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        const user = {
          id: 'mock-user-id-' + email.replace(/[^a-zA-Z0-9]/g, ''),
          email,
          user_metadata: { name: email.split('@')[0] },
          created_at: new Date().toISOString()
        };
        
        const profiles = JSON.parse(localStorage.getItem('mock_table_profiles') || '[]');
        if (!profiles.some(p => p.id === user.id)) {
          profiles.push({
            id: user.id,
            display_name: user.user_metadata.name,
            credits: 1,
            plan_type: 'trial',
            plan_started_at: null,
            plan_expires_at: null,
            referred_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          localStorage.setItem('mock_table_profiles', JSON.stringify(profiles));
        }

        const session = { user, access_token: 'mock-token-' + user.id };
        localStorage.setItem('mock_supabase_session', JSON.stringify(session));
        localStorage.setItem('mock_supabase_user', JSON.stringify(user));

        this._notifyAuthStateChange('SIGNED_IN', session);
        return { data: { user, session }, error: null };
      },
      signInWithOAuth: async ({ provider }) => {
        const email = `${provider}_user@example.com`;
        return this.auth.signInWithPassword({ email });
      },
      signOut: async () => {
        localStorage.removeItem('mock_supabase_session');
        localStorage.removeItem('mock_supabase_user');
        this._notifyAuthStateChange('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange: (callback) => {
        this.listeners.push(callback);
        const session = localStorage.getItem('mock_supabase_session');
        const parsed = session ? JSON.parse(session) : null;
        setTimeout(() => {
          callback(parsed ? 'SIGNED_IN' : 'SIGNED_OUT', parsed);
        }, 10);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.listeners = this.listeners.filter(l => l !== callback);
              }
            }
          }
        };
      }
    };
  }

  _notifyAuthStateChange(event, session) {
    this.listeners.forEach(l => {
      try { l(event, session); } catch (e) { console.error(e); }
    });
  }

  from(table) {
    const getStorageKey = () => `mock_table_${table}`;
    const getItems = () => JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    const setItems = (items) => localStorage.setItem(getStorageKey(), JSON.stringify(items));

    class QueryBuilder {
      constructor() {
        this.items = getItems();
        this.filters = [];
        this.orderCol = null;
        this.orderAsc = true;
        this.limitVal = null;
        this.isSingle = false;
        this.insertData = null;
        this.updateData = null;
        this.upsertData = null;
        this.upsertOptions = null;
        this.deleteAction = false;
      }

      select(cols) {
        return this;
      }

      insert(data) {
        this.insertData = data;
        return this;
      }

      update(updates) {
        this.updateData = updates;
        return this;
      }

      upsert(data, options) {
        this.upsertData = data;
        this.upsertOptions = options;
        return this;
      }

      delete() {
        this.deleteAction = true;
        return this;
      }

      eq(col, val) {
        this.filters.push(item => item[col] === val);
        return this;
      }

      order(col, { ascending = true } = {}) {
        this.orderCol = col;
        this.orderAsc = ascending;
        return this;
      }

      limit(val) {
        this.limitVal = val;
        return this;
      }

      single() {
        this.isSingle = true;
        return this;
      }

      // Chain execution when then() or await is called
      async then(resolve, reject) {
        try {
          if (this.insertData) {
            const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
            const inserted = rows.map(r => {
              const newRow = { ...r };
              if (!newRow.id && table !== 'transcripts' && table !== 'credit_transactions') {
                newRow.id = Math.random().toString(36).substring(2, 15);
              }
              if (table === 'transcripts' || table === 'credit_transactions') {
                newRow.id = Math.floor(Math.random() * 1000000);
              }
              if (!newRow.created_at) {
                newRow.created_at = new Date().toISOString();
              }
              this.items.push(newRow);
              return newRow;
            });
            setItems(this.items);
            const res = Array.isArray(this.insertData) ? inserted : inserted[0];
            resolve({
              data: this.isSingle ? inserted[0] : res,
              error: null
            });
          } else if (this.updateData) {
            const updatedItems = this.items.map(item => {
              const matches = this.filters.every(f => f(item));
              if (matches) {
                return { ...item, ...this.updateData, updated_at: new Date().toISOString() };
              }
              return item;
            });
            this.items = updatedItems;
            setItems(this.items);
            
            const matchedUpdated = this.items.filter(item => this.filters.every(f => f(item)));
            resolve({
              data: this.isSingle ? (matchedUpdated[0] || null) : matchedUpdated,
              error: null
            });
          } else if (this.upsertData) {
            const rows = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData];
            const onConflict = this.upsertOptions?.onConflict || 'id';
            const insertedOrUpdated = rows.map(r => {
              const index = this.items.findIndex(item => item[onConflict] === r[onConflict]);
              const newRow = { ...r };
              if (!newRow.created_at) newRow.created_at = new Date().toISOString();
              newRow.updated_at = new Date().toISOString();

              if (index !== -1) {
                this.items[index] = { ...this.items[index], ...newRow };
                return this.items[index];
              } else {
                if (!newRow.id && table !== 'transcripts' && table !== 'credit_transactions') {
                  newRow.id = Math.random().toString(36).substring(2, 15);
                }
                this.items.push(newRow);
                return newRow;
              }
            });
            setItems(this.items);
            const res = Array.isArray(this.upsertData) ? insertedOrUpdated : insertedOrUpdated[0];
            resolve({
              data: this.isSingle ? insertedOrUpdated[0] : res,
              error: null
            });
          } else if (this.deleteAction) {
            const toKeep = this.items.filter(item => !this.filters.every(f => f(item)));
            const deleted = this.items.filter(item => this.filters.every(f => f(item)));
            this.items = toKeep;
            setItems(toKeep);
            resolve({
              data: this.isSingle ? (deleted[0] || null) : deleted,
              error: null
            });
          } else {
            const result = this._execute();
            resolve({
              data: this.isSingle ? (result[0] || null) : result,
              error: this.isSingle && result.length === 0 ? { message: 'Row not found', code: 'PGRST116' } : null
            });
          }
        } catch (e) {
          if (reject) reject(e);
          else resolve({ data: null, error: e });
        }
      }

      _execute() {
        let filtered = this.items.filter(item => this.filters.every(f => f(item)));
        if (this.orderCol) {
          filtered.sort((a, b) => {
            const valA = a[this.orderCol];
            const valB = b[this.orderCol];
            if (valA < valB) return this.orderAsc ? -1 : 1;
            if (valA > valB) return this.orderAsc ? 1 : -1;
            return 0;
          });
        }
        if (this.limitVal !== null) {
          filtered = filtered.slice(0, this.limitVal);
        }
        return filtered;
      }
    }

    return new QueryBuilder();
  }

  rpc(name, args) {
    return null;
  }
}

// Instantiate either real or mock client
export const supabase = useMock
  ? new MockSupabaseClient()
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // Disabled for Electron email/password flow stability
      },
      db: {
        schema: 'public',
      },
    });

console.log(useMock ? '⚠️ Supabase initialized in Local Mock mode.' : '⚡ Supabase initialized with real client.');

/**
 * Get the current user session (null if not logged in).
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/**
 * Get the current user (null if not logged in).
 */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

/**
 * Sign up with email + password.
 */
export async function signUp(email, password, metadata = {}) {
  return supabase.auth.signUp({ email, password, options: { data: metadata } });
}

/**
 * Sign in with email + password.
 */
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign in with OAuth provider (Google, GitHub, etc.).
 */
export async function signInWithOAuth(provider) {
  const baseUrl = window.location.origin === 'http://localhost:5173'
    ? 'http://localhost:5173'
    : window.location.origin;
  
  return supabase.auth.signInWithOAuth({
    provider,
    options: { 
      redirectTo: baseUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      }
    },
  });
}

/**
 * Sign out.
 */
export async function signOut() {
  return supabase.auth.signOut();
}

/**
 * Send password reset email.
 */
export async function resetPasswordForEmail(email) {
  const baseUrl = window.location.origin === 'http://localhost:5173'
    ? 'http://localhost:5173'
    : window.location.origin;
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}?view=reset-password`
  });
}

/**
 * Update user password.
 */
export async function updateUserPassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword });
}
