# Jd2Job AI Suite

An end-to-end AI job-search suite:

- **Auto-Apply Chrome Extension** (`extension/`) — LinkedIn Easy Apply automation with AI-generated, JD-tailored resumes and intelligent form answers, synced to your dashboard.
- **Interview Copilot** (`frontend/` + `backend/`) — real-time voice coaching during live interviews (Deepgram STT → LLM → structured STAR answers), plus AI mock interviews with analytics.
- **Job Dashboard** — track every application, tailored resume, and interview session in one place.

## Monorepo layout

| Path | What it is | Deploy target |
| --- | --- | --- |
| `frontend/` | Vite + React web app | Vercel |
| `backend/` | Express API + WebSocket proxy | Railway |
| `extension/` | Chrome MV3 extension (side panel) | Chrome Web Store / unpacked |
| `electron/` | Optional desktop shell | electron-builder |
| `supabase_schema.sql` | Database schema | Supabase SQL editor |

## Running locally

```bash
npm run dev        # backend (:3001) + frontend (:5173)
```

Load `extension/` via `chrome://extensions` → Developer mode → Load unpacked.

## Environment

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env`.
See `deployment_guide.md` for the full production variable list (Supabase, Deepgram, DeepSeek, NVIDIA, Razorpay).

## Testing

```bash
npm test           # AppContext reducer tests (backend/tests/)
```
