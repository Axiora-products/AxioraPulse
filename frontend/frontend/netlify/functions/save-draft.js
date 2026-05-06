import { createClient } from "@supabase/supabase-js";

// BUG FIX: was using SUPABASE_SERVICE_KEY (wrong name) — client was silently
// initialised with `undefined` key, causing every DB call to 401 quietly.
// Correct name matches all other functions: SUPABASE_SERVICE_ROLE_KEY.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  // BUG FIX: was missing OPTIONS preflight handler — blocked all CORS requests
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  // BUG FIX: was missing try/catch — a malformed body would throw an unhandled
  // exception and return a 500 with no useful message.
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { responseId, linkToken, surveyId, answers, isComplete } = body;

  if (!responseId || !surveyId) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing responseId or surveyId" }) };
  }

  try {
    // BUG FIX: was querying old prototype schema tables "responses" / "answers".
    // Correct tables are "survey_responses" / "survey_answers" (current schema).
    const { data: response, error: rErr } = await supabase
      .from("survey_responses")
      .upsert({
        id:        responseId,
        survey_id: surveyId,
        session_token: linkToken || responseId,
        status:    isComplete ? "completed" : "in_progress",
        ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
      })
      .select()
      .single();

    if (rErr) throw rErr;

    if (answers?.length) {
      const { data: existing } = await supabase
        .from("survey_answers")
        .select("question_id")
        .eq("response_id", responseId);

      const existingQIds = new Set(existing?.map(a => a.question_id) || []);
      const newAnswers = answers
        .filter(a => !existingQIds.has(a.questionId))
        .map(a => ({
          response_id:  responseId,
          question_id:  a.questionId,
          answer_value: typeof a.value === "object" ? null : String(a.value),
          answer_json:  typeof a.value === "object" ? a.value : null,
        }));

      if (newAnswers.length) {
        const { error: aErr } = await supabase.from("survey_answers").insert(newAnswers);
        if (aErr) throw aErr;
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ responseId: response.id }),
    };
  } catch (err) {
    console.error("save-draft error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message || "Save failed" }) };
  }
};
