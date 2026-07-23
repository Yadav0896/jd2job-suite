/**
 * supabaseService — Data access layer for all Supabase tables.
 *
 * Each function maps to a table in the schema. Uses the frontend supabase
 * client (anon key). RLS policies enforce per-user data isolation.
 */
import { supabase } from './supabaseClient';

/* ═══════════════════════════════════════════════════════════════════════════
   SESSIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Start a new session. Used when the user clicks "Start Recording".
 */
export async function createSession({ userId, platformMode, resumeData, jobDescription, salesConfig, meetingConfig }) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      platform_mode: platformMode,
      resume_data: resumeData || null,
      job_description: jobDescription || null,
      sales_config: salesConfig || null,
      meeting_config: meetingConfig || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * End a session (mark as completed).
 * NOTE: duration_secs is computed by a database trigger on UPDATE.
 * Add this trigger in your Supabase SQL editor:
 *   CREATE OR REPLACE FUNCTION calc_session_duration()
 *   RETURNS trigger AS $$ BEGIN
 *     IF NEW.ended_at IS NOT NULL AND OLD.started_at IS NOT NULL THEN
 *       NEW.duration_secs := EXTRACT(EPOCH FROM (NEW.ended_at::timestamp - OLD.started_at::timestamp));
 *     END IF;
 *     RETURN NEW;
 *   END; $$ LANGUAGE plpgsql;
 *   CREATE TRIGGER trg_session_duration BEFORE UPDATE ON sessions
 *     FOR EACH ROW EXECUTE FUNCTION calc_session_duration();
 */
export async function endSession(sessionId) {
  const endedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      ended_at: endedAt,
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all sessions for the current user.
 */
export async function getUserSessions(userId, limit = 20) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Get a single session by ID.
 */
export async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRANSCRIPTS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Save a single transcript line.
 */
export async function saveTranscript({ sessionId, speaker, text, isFinal = true }) {
  const { data, error } = await supabase
    .from('transcripts')
    .insert({
      session_id: sessionId,
      speaker,
      text,
      is_final: isFinal,
    });

  if (error) throw error;
  return data;
}

/**
 * Save multiple transcripts in batch.
 */
export async function saveTranscriptsBatch(sessionId, transcripts) {
  const rows = transcripts.map(t => ({
    session_id: sessionId,
    speaker: t.speaker,
    text: t.text,
    is_final: t.isFinal ?? true,
    recorded_at: t.timestamp ? new Date(t.timestamp).toISOString() : undefined,
  }));

  const { data, error } = await supabase.from('transcripts').insert(rows);
  if (error) throw error;
  return data;
}

/**
 * Get all transcripts for a session.
 */
export async function getSessionTranscripts(sessionId) {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANSWERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Save an AI-generated answer.
 */
export async function saveAnswer({
  sessionId,
  question,
  answer,
  bulletPoints = [],
  hints = [],
  reasoning = '',
  detection = '',
  options = [],
  actionItem = null,
  latencyMs = 0,
}) {
  const { data, error } = await supabase
    .from('answers')
    .insert({
      session_id: sessionId,
      question,
      answer,
      bullet_points: bulletPoints.length > 0 ? bulletPoints : null,
      hints: hints.length > 0 ? hints : null,
      reasoning: reasoning || null,
      detection: detection || null,
      options: options.length > 0 ? options : null,
      action_item: actionItem || null,
      latency_ms: latencyMs || null,
    });

  if (error) throw error;
  return data;
}

/**
 * Get all answers for a session.
 */
export async function getSessionAnswers(sessionId) {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SALES BRIEFINGS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Save a generated sales briefing.
 */
export async function saveSalesBriefing({
  userId,
  sessionId,
  clientName,
  clientRole,
  clientCompany,
  clientUrl,
  dealContext,
  methodology,
  briefingData,
}) {
  const { data, error } = await supabase
    .from('sales_briefings')
    .insert({
      user_id: userId,
      session_id: sessionId || null,
      client_name: clientName,
      client_role: clientRole,
      client_company: clientCompany,
      client_url: clientUrl,
      deal_context: dealContext,
      methodology,
      briefing_data: briefingData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get recent briefings for a user.
 */
export async function getUserBriefings(userId, limit = 10) {
  const { data, error } = await supabase
    .from('sales_briefings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEETING RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Create or update meeting record.
 */
export async function upsertMeetingRecord({
  sessionId,
  meetingType,
  agenda,
  projectContext,
  attendees,
  actionItems,
  decisions,
  requirementsGaps,
  contradictions,
  followUpDraft,
}) {
  const { data, error } = await supabase
    .from('meeting_records')
    .upsert({
      session_id: sessionId,
      meeting_type: meetingType,
      agenda,
      project_context: projectContext,
      attendees,
      action_items: actionItems || [],
      decisions: decisions || [],
      requirements_gaps: requirementsGaps || [],
      contradictions: contradictions || [],
      follow_up_draft: followUpDraft || null,
    }, { onConflict: 'session_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROFILES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Get the current user's profile.
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update the current user's profile.
 */
export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Save "My Company" profile (synced to Supabase from localStorage).
 */
export async function saveMyCompany(userId, { name, industry, url, product }) {
  return updateProfile(userId, {
    company_name: name,
    company_industry: industry,
    company_url: url,
    product: product,
  });
}

/**
 * Deduct credits from user profile, taking unlimited plans into account.
 * Uses an atomic conditional update to prevent TOCTOU double-spend.
 */
export async function deductCredits(userId, amount = 1) {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits, plan_type, plan_expires_at')
    .eq('id', userId)
    .single();

  if (error) throw error;
  if (!data) throw new Error('User profile not found');

  const now = new Date().toISOString();
  const hasUnlimited = (data.plan_type === 'monthly_unlimited' || data.plan_type === 'quarterly_unlimited') && data.plan_expires_at && data.plan_expires_at > now;

  if (hasUnlimited) {
    console.log('[Billing] Active unlimited plan detected, bypassing credit deduction.');
    return data;
  }

  if (data.credits < amount) {
    throw new Error('Insufficient credits');
  }

  // Atomic decrement: only update if credits still >= amount (prevents race)
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ credits: data.credits - amount, updated_at: now })
    .eq('id', userId)
    .gte('credits', amount)
    .select()
    .single();

  if (updateError) throw updateError;
  if (!updated) throw new Error('Credit already consumed. Please try again.');
  return updated;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREDIT TRANSACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Log a credit transaction.
 */
export async function logCreditTransaction({ userId, amount, reason, sessionId, metadata }) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount,
      reason,
      session_id: sessionId || null,
      metadata: metadata || null,
    });

  if (error) throw error;
  return data;
}
