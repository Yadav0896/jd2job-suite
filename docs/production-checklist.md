# Production Checklist — Jd2Job Audit

*Audit date: 2026-07. Status of every finding from the end-to-end review.*

## Critical security fixes (DONE)

- [x] **Unauthenticated WebSocket proxies** — `/api/deepgram` and `/api/deepgram-agent` accepted connections from anyone, letting strangers burn your Deepgram balance. Now both require `?token=<supabase access_token>` verified at upgrade; unauthenticated upgrades get HTTP 401. Token is stripped before forwarding upstream.
- [x] **Client-controlled payment amount** — `/api/payments/create-order` accepted `amount` from the request body (pay ₹1 for a ₹3,999 plan). Prices now come from server-side `PLAN_PRICES`; the client sends only `planId`.
- [x] **Payment replay attack** — `/api/payments/verify` had no idempotency: re-submitting the same valid signature credited the user repeatedly. Now checks `credit_transactions` for an existing `payment_id` and returns `alreadyProcessed`.
- [x] **Cross-user crediting** — `userId` was taken from the request body on both payment routes. Now always `req.user.id`; order notes are also checked against the caller.
- [x] **Broken payment frontend** — `paymentService.js` called `getSession()` without importing it (ReferenceError on every purchase) and dropped the `planId` argument. Fixed; checkout theme moved to brand Berry `#912f56`.
- [x] **Open profile/session/credit endpoints** — `/api/supabase/profile/:userId`, `/api/supabase/sessions/:userId`, `/api/supabase/credits/deduct` were callable for any user id. Now `requireAuth` + self-check (403 on mismatch).
- [x] **Open TTS + enrichment endpoints** — `/api/tts/*`, `/api/company-enrichment` now `requireAuth` + rate-limited; frontend sends Bearer tokens.
- [x] **Dead unauthenticated endpoints removed** — `/api/interview/agent/config|url|voices` (unused by any client) deleted; `/api/deepgram/test` kept for ops but auth-gated.
- [x] **Extension sync endpoint** — `/api/jd2job/sync` was unauthenticated and trusted a body `userId`. Now `requireAuth` + rate limit + `req.user.id`.

## Functional fixes (DONE)

- [x] **Extension AI was effectively dead** — tailoring/answers required the user's own DeepSeek key in the popup. Now backend-first: `/api/extension/tailor-resume` + `/api/extension/answer` with a DeepSeek → NVIDIA → Groq fallback chain (`extensionService.js`), 1 credit per tailored resume, own-key fallback retained.
- [x] **Extension ↔ web pairing** — web app writes `jd2job_extension_auth` (session + Supabase config) to localStorage on sign-in/refresh; the extension's content script on jd2job.com picks it up. Removed the dead `localhost:3001/api/jd2job/local-session` fetches.
- [x] **Popup sync + ATS flow** — jobs sync to cloud via the api client; ATS analyze + tailored PDF generation run through the backend AI with a `lastTailoredText` cache.
- [x] **`jsonrepair` missing from backend deps** — crashed interviewer/evaluator JSON fallback. Added.
- [x] **Stale Groq model id** — `mixtral-8x7b-32768` (decommissioned) replaced with `llama-3.3-70b-versatile` in `modelProvider.js`.
- [x] **WS auth wiring (frontend)** — `deepgramService.js` and `deepgramAgentService.js` fetch the Supabase session and append `?token=`; clear sign-in error when missing.

## Verified behavior (no change needed)

- Copilot session: 1 credit deducted at start (unlimited plans exempt); trial = 10 min, paid = 40 min auto-stop; limit timer is cleared on manual stop.
- Mock interview: conversational (Deepgram agent) + 5-question step mode; per-answer + overall evaluation; free (no credit) — intentional for now, revisit if costs grow.
- `/api/deepseek/chat` streaming proxy with provider routing + fallbacks; 60 req/min per user.

## Deployment state

- [x] `frontend/vercel.json` — `/api/*` rewrite with **placeholder** Railway URL — **USER ACTION**: replace `REPLACE-WITH-YOUR-RAILWAY-URL` and redeploy.
- [x] `backend/.env.example` / `frontend/.env.example` — complete + Razorpay vars documented.
- [x] `deployment_guide.md` — rewritten for Railway + Vercel + Supabase + Razorpay + extension.
- [ ] **USER ACTION**: set Razorpay live keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`) — payments return 500 "Razorpay not configured" until then (safe failure).
- [ ] **USER ACTION**: confirm Railway env includes `CORS_ORIGIN=https://jd2job.com` and that Vercel `VITE_API_URL` points at Railway directly (WS can't traverse Vercel rewrites).

## Deferred (waiting on user's new UI HTML)

- [ ] Frontend visual redesign in Twilight `#eaf2ef` / Berry `#912f56` (extension popup already re-skinned).
- [ ] Landing page copy rewrite (3 pillars, INR pricing, LinkedIn-ToS + ethics FAQ).
- [ ] Legal pages: Privacy Policy, Terms, Refund Policy (route + footer links).

## Test evidence

- Backend boot test (PORT=3997): `/api/deepgram/test` 401, `/api/payments/create-order` 401, removed `/api/interview/agent/config` 404, unauthenticated WS upgrade 401.
- Extension AI endpoint live test: `/api/extension/tailor-resume` returned tailored resume with ATS score 90.
- `npm run build` (frontend) green; backend `npm test` green; all extension JS `node --check` green.
