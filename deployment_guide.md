# Production Deployment Guide — Jd2Job

Stack: **Vercel** (frontend, `jd2job.com`) · **Railway** (backend API + WebSocket proxies) · **Supabase** (auth + Postgres) · **Razorpay** (payments) · **Chrome Extension** (LinkedIn auto-apply, pairs with the web app).

---

## Step 1: Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → New Query → paste the full contents of [`supabase_schema.sql`](supabase_schema.sql) → Run.
   This creates `profiles`, `sessions`, `transcripts`, `answers`, `credit_transactions`, extension job tables, indexes, and RLS policies.
3. Authentication → Providers → enable **Email** (and **Google** if you offer OAuth).
4. Authentication → URL Configuration:
   - Site URL: `https://jd2job.com`
   - Redirect URLs: `https://jd2job.com/**`, `http://localhost:5173/**`
5. From Settings → API, note: **Project URL**, **anon key** (frontend), **service_role key** (backend only — bypasses RLS, never ship it to the client).

---

## Step 2: Backend (Railway)

1. Railway → New Project → Deploy from GitHub repo, root directory `backend/`.
2. Set every variable from [`backend/.env.example`](backend/.env.example):

   | Variable | Notes |
   |---|---|
   | `PORT` | Railway injects this automatically — do not hardcode |
   | `CORS_ORIGIN` | `https://jd2job.com,http://localhost:5173` |
   | `DEEPGRAM_API_KEY` | Required — copilot STT + voice agent |
   | `DEEPSEEK_API_KEY` | Required — answers, interview agents, extension AI |
   | `GROQ_API_KEY`, `NVIDIA_API_KEY` | Recommended — fallback chain + fast mode |
   | `TOGETHER_AI_KEY` | Optional — vision/screen reading |
   | `ELEVENLABS_API_KEY` | Optional — TTS endpoints |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Required |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payments stay disabled until set |

3. Deploy, then note the public domain, e.g. `https://<app>.up.railway.app`.
4. Verify: `curl https://<app>.up.railway.app/health` → `{"status":"ok"}`.

**WebSockets:** Railway supports WS upgrades on the same service — `/api/deepgram` and `/api/deepgram-agent` work out of the box. Both require `?token=<supabase access_token>`; unauthenticated upgrades are rejected with 401.

---

## Step 3: Frontend (Vercel)

1. Vercel → Import repo, root directory `frontend/`, framework **Vite**.
2. Environment variables (see [`frontend/.env.example`](frontend/.env.example)):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` → `https://<app>.up.railway.app` (**direct Railway URL, not `https://jd2job.com`** — voice features open WebSockets to `<VITE_API_URL>/api/deepgram*`, and Vercel rewrites cannot proxy WS upgrades)
   - `VITE_RAZORPAY_KEY_ID` → your Razorpay key id (publishable, safe to expose)
3. `frontend/vercel.json` contains a rewrite `/api/:path* → https://REPLACE-WITH-YOUR-RAILWAY-URL.up.railway.app/api/:path*`.
   Replace the placeholder with your Railway domain. This lets plain REST calls use same-origin `/api/*` (avoids CORS preflights); WS traffic still goes direct via `VITE_API_URL`.
4. Redeploy after editing `vercel.json`.

---

## Step 4: Payments (Razorpay)

1. Get **live** keys at dashboard.razorpay.com → Settings → API Keys.
2. Backend env: `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`. Frontend env: `VITE_RAZORPAY_KEY_ID`.
3. Plans are priced **server-side only** (`PLAN_PRICES` in `backend/server.js`): Base ₹999/5 credits · Top-up ₹249/1 credit · Monthly Unlimited ₹3999 · Quarterly Unlimited ₹9999. The client sends only `planId`; it cannot set amounts.
4. Test the flow in Razorpay **test mode** first (`rzp_test_...` keys), then switch to live.

---

## Step 5: Chrome Extension

1. The extension lives in `extension/` (Manifest V3). Load it via `chrome://extensions` → Developer mode → Load unpacked.
2. Pairing: when a user is signed into the web app, the app writes `jd2job_extension_auth` to `localStorage`; the extension's content script on `jd2job.com` picks it up and stores the session. The user must open `https://jd2job.com` once while logged in.
3. AI features (`tailor resume`, `generate answer`, ATS score) call `POST <apiBase>/api/extension/*` on the backend with the user's Bearer token. Each tailored resume costs 1 credit (unlimited plans exempt).
4. For store publishing, bump `version` in `extension/manifest.json` and zip the folder.

---

## Step 6: Smoke Test (production)

- [ ] `GET /health` on Railway → ok
- [ ] Sign up / sign in on `https://jd2job.com`
- [ ] Mock interview (conversational): mic connects, agent speaks (proves WS auth + Deepgram)
- [ ] Copilot session start deducts 1 credit; trial user capped at 10 min, paid at 40 min
- [ ] Extension: open jd2job.com logged in → popup shows "Connected"; tailor a resume on a LinkedIn job → credit decrements
- [ ] Razorpay test-mode purchase → credits/plan applied exactly once (re-clicking verify must NOT double-credit — replay protection is in place)
- [ ] `GET /api/extension/health` with the extension's token → ok

---

## Local Development

```bash
# Backend (terminal 1)
cd backend && cp .env.example .env   # fill in keys
npm install && npm start             # http://localhost:3001

# Frontend (terminal 2)
cd frontend && cp .env.example .env  # VITE_API_URL=http://localhost:3001
npm install && npm run dev           # http://localhost:5173
```

Extension: set `apiBaseOverride: "http://localhost:3001/api"` in `chrome.storage.local` (or leave empty to default to `https://jd2job.com/api`).
