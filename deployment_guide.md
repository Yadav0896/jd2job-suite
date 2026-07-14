# Production Deployment Guide — Interview Copilot

This guide walks you through deploying the Interview Copilot application to production, using your own live **Supabase** database and hosting platforms.

---

## Step 1: Database Setup (Supabase)

The application uses Supabase for authentication, session logging, transcript storage, and credit management. 

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com) and create a new project.
2. **Execute Database Schema**:
   - Go to the **SQL Editor** tab in your Supabase dashboard.
   - Click **New Query**.
   - Copy and paste the entire contents of [supabase_schema.sql](file:///Users/raga_user/Downloads/kk_interview%20copilot/supabase_schema.sql) from the root folder.
   - Click **Run** to generate the required tables (`profiles`, `sessions`, `transcripts`, `answers`, etc.), indexes, and Row-Level Security (RLS) policies.

---

## Step 2: Configure Authentication (Google OAuth)

To allow users to sign in with Google:

1. **Google Cloud Console Setup**:
   - Open the [Google Cloud Console](https://console.cloud.google.com).
   - Create a project and navigate to **APIs & Services** -> **OAuth consent screen**.
   - Set up the consent screen and create an **OAuth client ID** (Web application).
   - Save the **Client ID** and **Client Secret**.
2. **Enable Google Provider in Supabase**:
   - In Supabase, go to **Authentication** -> **Providers** -> **Google**.
   - Toggle Google authentication **ON**.
   - Paste the Google Client ID and Google Client Secret.
   - Copy the **Redirect URI** provided by Supabase (e.g., `https://<your-project-ref>.supabase.co/auth/v1/callback`).
3. **Configure Google Authorized Redirect URIs**:
   - Return to your Google Cloud Console OAuth Client configuration.
   - Add the Supabase Redirect URI to the **Authorized redirect URIs** section.
4. **Set Production Redirect URIs in Supabase**:
   - In Supabase, go to **Authentication** -> **URL Configuration**.
   - Set the **Site URL** to your production frontend URL (e.g., `https://my-interview-copilot.com`).
   - Add your redirect pattern to **Redirect URLs** (e.g., `https://my-interview-copilot.com/**`).

---

## Step 3: Configure Environment Variables

Create production environment files by copying the templates:

### 1. Backend Proxy Config
- Location: `backend/.env`
- Template: [backend/.env.example](file:///Users/raga_user/Downloads/kk_interview%20copilot/backend/.env.example)
- Set variables:
  ```env
  PORT=3001
  CORS_ORIGIN=https://my-interview-copilot.com
  DEEPGRAM_API_KEY=your-production-deepgram-key
  NVIDIA_API_KEY=your-production-nvidia-key
  DEEPSEEK_API_KEY=your-production-deepseek-key
  SUPABASE_URL=https://<your-project-ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
  ```
  *(Note: The `SUPABASE_SERVICE_ROLE_KEY` is a secret key that bypasses RLS, which is required by the backend to securely manage user credits and transact with the database. Keep it secure and never expose it on the frontend.)*

### 2. Frontend Config
- Location: `frontend/.env`
- Template: [frontend/.env.example](file:///Users/raga_user/Downloads/kk_interview%20copilot/frontend/.env.example)
- Set variables:
  ```env
  VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
  VITE_API_URL=https://api.my-interview-copilot.com
  ```

---

## Step 4: Deploy the Backend (API Server)

You can host the Node.js backend on platforms like **Render**, **Railway**, **Heroku**, or a **VPS** (e.g., AWS EC2, DigitalOcean).

### Option A: Render (Easiest)
1. Create a Web Service on Render and link it to your GitHub repository.
2. Set the **Root Directory** to `backend`.
3. Set the **Build Command** to `npm install`.
4. Set the **Start Command** to `npm start`.
5. Under **Environment Variables**, add all the variables configured in `backend/.env`.

### Option B: PM2 on VPS
1. SSH into your server, pull your code, and navigate to the `backend/` directory.
2. Install PM2: `npm install -g pm2`.
3. Start the server:
   ```bash
   PORT=3001 CORS_ORIGIN=https://my-interview-copilot.com DEEPGRAM_API_KEY=... pm2 start server.js --name "copilot-backend"
   ```

---

## Step 5: Deploy the Frontend (Vite Client)

You can host the React static build on **Vercel**, **Netlify**, **Render Static Site**, or **Cloudflare Pages**.

1. Navigate to the `frontend/` directory.
2. Build the static assets:
   ```bash
   npm run build
   ```
3. Deploy the resulting `dist/` directory to your static hosting provider.
4. Set your frontend environment variables on the hosting platform (specifically `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` pointing to your deployed backend domain).
