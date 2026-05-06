/**
 * respond.js — Netlify Function for public survey response operations.
 *
 * Uses the service role key so all writes bypass RLS entirely.
 * This eliminates the anon-key / RLS policy issues on the public /s/:slug route.
 *
 * Actions:
 *   create  — create a new in_progress response row
 *   save    — upsert answers + update last_saved_at
 *   submit  — upsert final answers + mark completed
 *   meta    — update metadata (tracking) only
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ok  = body => ({ statusCode: 200, headers: CORS, body: JSON.stringify(body) });
const err = (msg, code = 500) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) });

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST")    return err("Method not allowed", 405);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return err("Invalid JSON", 400); }

  const { action } = body;

  try {
    switch (action) {

      // ── Create response row ──────────────────────────────────────────────
      case "create": {
        const { surveyId, sessionToken, email } = body;
        if (!surveyId || !sessionToken) return err("Missing surveyId or sessionToken", 400);
        const { data, error } = await supabase
          .from("survey_responses")
          .insert({ survey_id: surveyId, session_token: sessionToken, respondent_email: email || null, status: "in_progress" })
          .select("id").single();
        if (error) throw error;
        return ok({ id: data.id });
      }

      // ── Save answers (autosave) ──────────────────────────────────────────
      case "save": {
        const { responseId, answers } = body;
        if (!responseId || !answers) return err("Missing responseId or answers", 400);
        for (const [qId, v] of Object.entries(answers)) {
          const isObj = v !== null && typeof v === "object";
          const { error } = await supabase.from("survey_answers").upsert(
            { response_id: responseId, question_id: qId,
              answer_value: isObj ? null : String(v),
              answer_json:  isObj ? v    : null },
            { onConflict: "response_id,question_id" }
          );
          if (error) console.warn("answer upsert:", error.message);
        }
        await supabase.from("survey_responses")
          .update({ last_saved_at: new Date().toISOString() })
          .eq("id", responseId);
        return ok({ saved: true });
      }

      // ── Submit (final) ──────────────────────────────────────────────────
      case "submit": {
        const { responseId, answers, metadata } = body;
        if (!responseId) return err("Missing responseId", 400);
        if (answers) {
          for (const [qId, v] of Object.entries(answers)) {
            const isObj = v !== null && typeof v === "object";
            await supabase.from("survey_answers").upsert(
              { response_id: responseId, question_id: qId,
                answer_value: isObj ? null : String(v),
                answer_json:  isObj ? v    : null },
              { onConflict: "response_id,question_id" }
            );
          }
        }
        const { error } = await supabase.from("survey_responses")
          .update({ status: "completed", completed_at: new Date().toISOString(), ...(metadata ? { metadata } : {}) })
          .eq("id", responseId);
        if (error) throw error;
        return ok({ submitted: true });
      }

      // ── Update metadata only (tracking) ─────────────────────────────────
      case "meta": {
        const { responseId, metadata } = body;
        if (!responseId) return err("Missing responseId", 400);
        await supabase.from("survey_responses").update({ metadata }).eq("id", responseId);
        return ok({ updated: true });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    console.error("respond error:", action, e);
    return err(e.message || "Server error");
  }
};
