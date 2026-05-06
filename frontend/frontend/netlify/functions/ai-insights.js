import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  // ── Route to the right handler ──────────────────────────────────────────
  try {
    if (body.mode === "suggestions") {
      return await handleSuggestions(body);
    } else {
      return await handleInsights(body);
    }
  } catch (err) {
    console.error("ai-insights error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "AI request failed" }) };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MODE 1: ANALYTICS INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════
async function handleInsights({ surveyTitle, responses, questionSummaries }) {
  const prompt = `You are an expert survey analyst. Analyze the following survey data and provide deep, actionable insights.

Survey: "${surveyTitle}"
Total Responses: ${responses.total}
Completion Rate: ${responses.completionRate}%
Abandon Rate: ${responses.abandonRate}%
${responses.avgTimeMin ? `Average completion time: ${responses.avgTimeMin} minutes` : ''}
${responses.nps ? `NPS Score: ${responses.nps.score} (${responses.nps.label})` : ''}

Question Summaries:
${JSON.stringify(questionSummaries, null, 2)}

Provide a JSON response with this EXACT structure (no markdown, no preamble):
{
  "insights": [
    {
      "type": "positive" | "warning" | "info" | "action",
      "title": "Short title (max 8 words)",
      "detail": "2–3 sentence insight with specific numbers and actionable context",
      "metric": "optional key metric string"
    }
  ],
  "executiveSummary": "2–3 sentence executive summary with the most important finding first",
  "npsAnalysis": "NPS interpretation (omit if no NPS data)",
  "topStrengths": ["strength 1", "strength 2", "strength 3"],
  "improvementAreas": ["area 1", "area 2", "area 3"],
  "recommendedActions": [
    { "priority": "high|medium|low", "action": "specific action", "impact": "expected impact" }
  ]
}

Rules:
- insights array: 4–6 items covering completion patterns, question performance, and trends
- recommendedActions: 3 items, ordered high → medium → low priority
- Be specific — cite actual numbers from the data
- Return ONLY the JSON object`;

  const message = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages:   [{ role: "user", content: prompt }],
  });

  const text    = message.content[0].text.replace(/```json\n?|\n?```/g, "").trim();
  const analysis = JSON.parse(text);

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(analysis) };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE 2: QUESTION SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════
async function handleSuggestions({ surveyTitle, surveyDescription, existingQuestions }) {
  const existing = existingQuestions?.length
    ? existingQuestions.map((q, i) => `${i + 1}. [${q.type}] ${q.text}`).join("\n")
    : "None yet";

  const prompt = `You are an expert survey designer. Suggest 4 follow-up questions for this survey.

Survey: "${surveyTitle}"
${surveyDescription ? `Description: "${surveyDescription}"` : ""}

Existing questions:
${existing}

Return ONLY a JSON object (no markdown) in this exact structure:
{
  "suggestions": [
    {
      "text": "Full question text",
      "type": "short_text | long_text | single_choice | multiple_choice | rating | scale | yes_no",
      "rationale": "One sentence on why this question adds value",
      "options": [
        { "label": "Option text", "value": "option_value" }
      ]
    }
  ]
}

Rules:
- Suggest exactly 4 questions
- options array: required for single_choice and multiple_choice (3–5 options each), empty array [] for all other types
- Don't duplicate existing questions — suggest complementary angles
- Mix question types for variety and respondent engagement
- option values must be snake_case
- Return ONLY the JSON`;

  const message = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1200,
    messages:   [{ role: "user", content: prompt }],
  });

  const text = message.content[0].text.replace(/```json\n?|\n?```/g, "").trim();
  const data  = JSON.parse(text);

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
}
