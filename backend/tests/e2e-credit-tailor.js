/**
 * E2E for the PAID extension path: /api/extension/tailor-resume.
 *
 * Creates a temporary Supabase auth user (service role), seeds 5 credits,
 * signs in to get a real access token, calls tailor-resume, verifies the
 * tailored resume comes back AND exactly 1 credit was deducted with a
 * transaction row, then deletes the temp user (cascade cleans profiles).
 *
 * Usage: PORT=3996 node tests/e2e-credit-tailor.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BASE = `http://localhost:${process.env.PORT || 3996}`;
const EMAIL = `e2e-temp-${Date.now()}@jd2job.test`;
const PASSWORD = 'E2eTemp!Pass123';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  let userId = null;
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (createErr) throw new Error('createUser: ' + createErr.message);
    userId = created.user.id;
    console.log('temp user created:', userId);

    const { error: upsertErr } = await admin.from('profiles').upsert({
      id: userId, credits: 5, plan_type: 'free',
    });
    if (upsertErr) throw new Error('profiles upsert: ' + upsertErr.message);

    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signInErr) throw new Error('signIn: ' + signInErr.message);
    const token = session.session.access_token;

    const res = await fetch(`${BASE}/api/extension/tailor-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        baseResumeText: 'Kishore — Software Engineer. React, Node.js, TypeScript. 5 years.',
        jobDescription: 'Senior React Engineer at Acme. TypeScript, system design, microservices.',
        jobTitle: 'Senior React Engineer',
        companyName: 'Acme',
      }),
    });
    const data = await res.json();
    const resumeOk = res.ok && !!(data.tailoredResume || data.resumeText);
    console.log(`${resumeOk ? '✅ PASS' : '❌ FAIL'}  tailor-resume with real user — status ${res.status}, credits=${data.credits ?? 'n/a'} ats=${data.atsScore ?? 'n/a'} ${data.error || ''}`.slice(0, 160));

    const { data: profile } = await admin.from('profiles').select('credits').eq('id', userId).single();
    const creditsOk = profile && profile.credits === 4;
    console.log(`${creditsOk ? '✅ PASS' : '❌ FAIL'}  credit deducted (5 → 4) — got ${profile?.credits}`);

    const { data: txns } = await admin.from('credit_transactions').select('amount, reason').eq('user_id', userId);
    const txnOk = Array.isArray(txns) && txns.some(t => t.amount === -1 && t.reason === 'tailored_resume');
    console.log(`${txnOk ? '✅ PASS' : '❌ FAIL'}  credit_transactions row — ${JSON.stringify(txns || []).slice(0, 120)}`);

    const ok = resumeOk && creditsOk && txnOk;
    console.log(`\n══ CREDIT PATH: ${ok ? 'ALL GREEN' : 'FAILED'} ══`);
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error('❌ FAIL  setup/flow error:', e.message);
    process.exitCode = 1;
  } finally {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      console.log('temp user deleted:', error ? 'FAILED — ' + error.message : 'ok');
    }
  }
})();
