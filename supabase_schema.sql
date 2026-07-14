-- ============================================================================
-- AI Copilot — Supabase Database Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor to create all tables, indexes, and RLS policies.
-- ============================================================================

-- ── Enable UUID generation ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ════════════════════════════════════════════════════════════════════════════
-- 1. USERS PROFILE (extends Supabase auth.users)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_url    TEXT,
  
  -- My Company (saved once, used for sales research)
  company_name     TEXT,
  company_industry TEXT,
  company_url      TEXT,
  product          TEXT,
  
  -- Preferences
  default_methodology  TEXT DEFAULT 'SPIN',
  default_speed_mode   BOOLEAN DEFAULT true,
  theme_preference     TEXT DEFAULT 'dark',
  
  credits       INTEGER DEFAULT 1,
  plan_type     TEXT DEFAULT 'trial',          -- 'trial', 'base', 'monthly_unlimited', 'quarterly_unlimited'
  plan_started_at TIMESTAMPTZ DEFAULT NULL,
  plan_expires_at TIMESTAMPTZ DEFAULT NULL,
  referred_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SESSIONS (one row per recording session)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform_mode   TEXT NOT NULL CHECK (platform_mode IN ('interview', 'sales', 'meeting')),
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  
  -- Context at session start
  resume_data     JSONB,
  job_description JSONB,
  sales_config    JSONB,   -- { methodology, clientName, clientCompany, dealContext, ... }
  meeting_config  JSONB,   -- { meetingType, agenda, projectContext, attendees, ... }
  
  -- Post-session analysis
  summary             TEXT,            -- AI generated session summary
  score               INTEGER,         -- Overall performance score (1-10)
  questions_answered  INTEGER,         -- Count of Q&As in session
  duration_minutes    INTEGER,         -- Session duration in minutes
  
  started_at      TIMESTAMPTZ DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  duration_secs   INTEGER,
  
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Add columns if they don't exist (safe to run on existing DBs)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS questions_answered INTEGER;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. TRANSCRIPTS (every spoken utterance captured during a session)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.transcripts (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  speaker     TEXT NOT NULL,   -- 'Interviewer' | 'You' | 'Copilot'
  text        TEXT NOT NULL,
  is_final    BOOLEAN DEFAULT true,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. ANSWERS (AI-generated answers per question)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  bullet_points   JSONB,        -- string[]
  hints           JSONB,        -- string[]  
  reasoning       TEXT,
  detection       TEXT,         -- Sales: 'OBJECTION'|'BUYING_SIGNAL' etc. Meeting: 'REQUIREMENT_GAP' etc.
  options         JSONB,        -- Sales response options
  action_item     JSONB,        -- Meeting action item { text, suggestedAssignee, priority }
  
  latency_ms      INTEGER,
  
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. SALES BRIEFINGS (pre-call research documents)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sales_briefings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  
  client_name     TEXT,
  client_role     TEXT,
  client_company  TEXT,
  client_url      TEXT,
  deal_context    TEXT,
  methodology     TEXT DEFAULT 'SPIN',
  
  -- Full AI-generated briefing (JSON)
  briefing_data   JSONB,
  
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. MEETING RECORDS (meeting outcomes, decisions, action items)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.meeting_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  
  meeting_type    TEXT DEFAULT 'technical_review',
  agenda          TEXT,
  project_context TEXT,
  attendees       TEXT,
  
  -- Accumulated outcomes
  action_items    JSONB DEFAULT '[]',    -- [{ text, suggestedAssignee, priority }]
  decisions       JSONB DEFAULT '[]',    -- [{ text, rationale, timestamp }]
  requirements_gaps JSONB DEFAULT '[]',  -- string[]
  contradictions  JSONB DEFAULT '[]',    -- string[]
  follow_up_draft TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. CREDITS / USAGE LOG
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,      -- positive = credit, negative = debit
  reason          TEXT,                  -- 'session_started', 'purchase', 'refund', 'promo'
  session_id      UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_platform     ON public.sessions(platform_mode);
CREATE INDEX IF NOT EXISTS idx_sessions_status       ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_transcripts_session   ON public.transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_session       ON public.answers(session_id);
CREATE INDEX IF NOT EXISTS idx_sales_briefings_user  ON public.sales_briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_records_session ON public.meeting_records(session_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON public.credit_transactions(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_briefings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Sessions: users can CRUD their own sessions
CREATE POLICY "Users can view own sessions"
  ON public.sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON public.sessions FOR DELETE USING (auth.uid() = user_id);

-- Transcripts: access via session ownership
CREATE POLICY "Users can view own transcripts"
  ON public.transcripts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can insert own transcripts"
  ON public.transcripts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Answers: access via session ownership
CREATE POLICY "Users can view own answers"
  ON public.answers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can insert own answers"
  ON public.answers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Sales Briefings: access via user ownership
CREATE POLICY "Users can view own briefings"
  ON public.sales_briefings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own briefings"
  ON public.sales_briefings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Meeting Records: access via session ownership
CREATE POLICY "Users can view own meeting records"
  ON public.meeting_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can insert own meeting records"
  ON public.meeting_records FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE POLICY "Users can update own meeting records"
  ON public.meeting_records FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- Credit transactions: users can view their own
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-create profile on sign-up
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, credits)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-update updated_at
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_meeting_records_updated_at
  BEFORE UPDATE ON public.meeting_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 8. APPLIED JOBS (sync from Jd2Job Chrome Extension)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.applied_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  link            TEXT,
  tailored_resume TEXT,
  hiring_team     JSONB,
  applied_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applied_jobs_user_id ON public.applied_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_applied_jobs_applied_at ON public.applied_jobs(applied_at);

ALTER TABLE public.applied_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applied jobs"
  ON public.applied_jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applied jobs"
  ON public.applied_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applied jobs"
  ON public.applied_jobs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applied jobs"
  ON public.applied_jobs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_applied_jobs_updated_at
  BEFORE UPDATE ON public.applied_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Migration query to add column to existing tables if they already exist
ALTER TABLE public.applied_jobs ADD COLUMN IF NOT EXISTS hiring_team JSONB;
