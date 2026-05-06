import { createClient } from "@supabase/supabase-js";

// BUG FIX: was using SUPABASE_SERVICE_KEY (wrong name) — same issue as save-draft.
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
  // BUG FIX: was missing OPTIONS and method check — CORS preflight would fail
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  // BUG FIX: was missing try/catch — unhandled JSON.parse exception on bad body
  let token;
  try { ({ token } = JSON.parse(event.body || "{}")); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  if (!token) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Missing token" }) };

  try {
    await supabase.rpc("increment_click", { link_token: token });

    const { data: link, error } = await supabase
      .from("survey_links")
      .select("survey_id, status, surveys(*)")
      .eq("token", token)
      .single();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(link),
    };
  } catch (err) {
    console.error("track-click error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message || "Failed" }) };
  }
};
