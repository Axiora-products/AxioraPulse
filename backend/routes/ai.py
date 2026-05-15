"""
routes/ai.py
────────────
AI-powered survey insights using Anthropic Claude.
"""

import os
import json
import re
from fastapi import Request, APIRouter, Depends, HTTPException

import anthropic

from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from core.rate_limiter import limiter

from sqlalchemy.orm import Session, joinedload
from db.database import get_db
from db.models import UserProfile, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer, ResponseStatusEnum
from schemas import AIInsightsRequest, AIInsightsResponse, AISuggestionsRequest, AISuggestionsResponse, AIGenerateRequest, AIGenerateResponse, IdeaProtectionMetadata
from dependencies import get_current_user
from services.feature_gate import require_feature

router = APIRouter(prefix="/ai", tags=["ai"])

MODEL = "claude-sonnet-4-6"


def _get_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Anthropic API key not configured on server")
    return anthropic.Anthropic(api_key=api_key)


def _call_claude(client: anthropic.Anthropic, prompt: str, max_tokens: int = 2048) -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system="You are a helpful AI assistant. Always respond with valid JSON only — no markdown, no explanation.",
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    # Strip markdown code fences if Claude wraps the JSON despite instructions
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


SENSITIVE_CATEGORY_LABELS = {
    "core_idea": "core_idea",
    "business_model": "business_model",
    "differentiators": "differentiators",
    "strategy": "strategy",
    "execution_details": "execution_details",
    "proprietary_insights": "proprietary_insights",
}

SENSITIVE_CATEGORY_KEYWORDS = {
    "core_idea": ["building", "idea", "concept", "platform", "tool", "app", "product", "predicts", "prediction", "attrition"],
    "business_model": ["pricing", "subscription", "revenue", "monetize", "buy", "sell", "business model", "gtm"],
    "differentiators": ["unique", "differentiator", "competitive advantage", "moat", "unlike", "secret"],
    "strategy": ["strategy", "roadmap", "launch", "go-to-market", "positioning", "targeting", "validate"],
    "execution_details": ["using", "integrates", "slack", "microsoft teams", "algorithm", "model", "workflow", "implementation", "scoring"],
    "proprietary_insights": ["proprietary", "insight", "internal", "trend", "behavior", "productivity", "data source", "signals"],
}

SENSITIVE_REPLACEMENTS = [
    (r"\bSlack\b", "workforce signals"),
    (r"\bMicrosoft Teams\b", "workforce signals"),
    (r"\bemployee attrition\b|\battrition\b", "workforce retention risk"),
    (r"\bmanager feedback\b", "workforce signals"),
    (r"\bproductivity trends?\b", "workforce patterns"),
    (r"\bbehavior tracking\b|\bbehaviour tracking\b|\bbehavior\b|\bbehaviour\b", "engagement patterns"),
    (r"\bAI tool\b|\bAI platform\b|\bAI app\b", "analytics solution"),
    (r"\bAI\b", "advanced"),
    (r"\bpredicts?\b|\bprediction\b|\bpredictive model\b", "identifies patterns related to"),
    (r"\bscoring method\b|\binternal scoring\b|\bscore\b", "assessment approach"),
    (r"\balgorithm\b|\bmodel\b", "analytical method"),
]

LEAK_TERM_IGNORE = {
    "using",
    "building",
    "idea",
    "concept",
    "platform",
    "tool",
    "app",
    "product",
    "model",
    "teams",
    "workflow",
    "buy",
    "sell",
    "validate",
    "strategy",
    "insight",
    "trend",
    "internal",
}


def _detect_sensitive_categories(text: str) -> list[str]:
    lowered = text.lower()
    detected = [
        category
        for category, keywords in SENSITIVE_CATEGORY_KEYWORDS.items()
        if any(keyword in lowered for keyword in keywords)
    ]
    return detected


def detect_sensitive_idea_info(text: str) -> dict:
    """Deterministic first-pass classifier that runs before any LLM processing."""
    detected = _detect_sensitive_categories(text)
    return {
        "detected_sensitive_categories": detected,
        "protection_applied": bool(detected),
    }


def _apply_sensitive_replacements(text: str) -> str:
    masked = text
    for pattern, replacement in SENSITIVE_REPLACEMENTS:
        masked = re.sub(pattern, replacement, masked, flags=re.IGNORECASE)
    return masked


def _extract_leak_terms(text: str) -> list[str]:
    lowered = text.lower()
    terms = set()
    for keywords in SENSITIVE_CATEGORY_KEYWORDS.values():
        for keyword in keywords:
            if len(keyword) > 3 and keyword not in LEAK_TERM_IGNORE and keyword in lowered:
                terms.add(keyword)
    for pattern, _replacement in SENSITIVE_REPLACEMENTS:
        cleaned = pattern.replace(r"\b", "").replace("?", "").replace("\\", "")
        for part in cleaned.split("|"):
            part = part.strip("()").lower()
            if len(part) > 3 and part not in LEAK_TERM_IGNORE and part in lowered:
                terms.add(part)
    return sorted(terms, key=len, reverse=True)


def _mask_context_before_llm(original_context: str) -> str:
    masked = _apply_sensitive_replacements(original_context)
    if masked != original_context:
        masked += (
            "\n\nConfidentiality note: specific owner details above were abstracted before "
            "this protection step. Preserve validation intent without restoring or guessing "
            "the original concept, data sources, mechanism, strategy, or differentiators."
        )
    return masked


def _fallback_protect_context(original_context: str) -> dict:
    detected = _detect_sensitive_categories(original_context)
    protection_applied = bool(detected)
    if protection_applied:
        protected_context = (
            "Create a market validation survey for the relevant buyer or user segment. "
            "Ask about the respondent's current workflows, pain points, budget ownership, "
            "buying criteria, perceived value of generalized analytical insights, "
            "adoption barriers, privacy expectations, and willingness to evaluate a new solution. "
            "Do not reveal the exact product concept, data sources, scoring methods, strategy, "
            "business model, differentiators, or execution details from the owner prompt."
        )
    else:
        protected_context = original_context

    return {
        "protected_context": protected_context,
        "detected_sensitive_categories": detected,
        "protection_applied": protection_applied,
        "protected_context_summary": (
            "Sensitive idea details were generalized into validation themes."
            if protection_applied
            else "No sensitive idea details detected."
        ),
    }


def protect_idea_context(client: anthropic.Anthropic, original_context: str) -> dict:
    """
    Idea-protection intelligence layer.
    Runs before final survey generation so public-facing questions validate the market
    without exposing the owner's confidential idea, strategy, model, or execution details.
    """
    if not original_context.strip():
        return _fallback_protect_context(original_context)

    classified = detect_sensitive_idea_info(original_context)
    llm_safe_context = (
        _mask_context_before_llm(original_context)
        if classified["protection_applied"]
        else original_context
    )

    prompt = f"""Analyze this private survey-owner prompt and protect the idea before public survey questions are generated.

Already-masked owner prompt:
{llm_safe_context[:8000]}

Detect sensitive information in these categories:
- core_idea
- business_model
- differentiators
- strategy
- execution_details
- proprietary_insights

Return JSON only with this exact structure:
{{
  "protected_context": "A generalized, abstracted survey-generation brief that preserves validation goals but removes exact confidential details.",
  "detected_sensitive_categories": ["core_idea"],
  "protection_applied": true,
  "protected_context_summary": "One sentence explaining what was generalized."
}}

Protection rules:
- Do not expose exact product concepts, proprietary data sources, algorithms, scoring methods, launch strategy, unique differentiators, or business model details.
- Do not restore, infer, or guess any masked details.
- Replace specific execution details with broad problem/market language.
- Preserve useful validation intent: current workflows, pain points, urgency, perceived value, buying criteria, adoption barriers, privacy/trust concerns, and willingness to explore a solution.
- If no sensitive details are present, return the original intent in protected_context and set protection_applied to false."""

    try:
        text = _call_claude(client, prompt, 1200)
        result = json.loads(text)
        protected_context = str(result.get("protected_context") or "").strip()
        detected = result.get("detected_sensitive_categories") or []
        if not protected_context:
            return _fallback_protect_context(original_context)
        detected = [
            SENSITIVE_CATEGORY_LABELS[c]
            for c in detected
            if c in SENSITIVE_CATEGORY_LABELS
        ]
        if not detected:
            detected = classified["detected_sensitive_categories"]
        return {
            "protected_context": protected_context,
            "detected_sensitive_categories": detected,
            "protection_applied": bool(result.get("protection_applied") or detected or classified["protection_applied"]),
            "protected_context_summary": result.get("protected_context_summary"),
        }
    except Exception as e:
        print(f"[AI] Idea protection fallback used: {e}")
        return _fallback_protect_context(original_context)


def _sanitize_text_for_leaks(text: str, leak_terms: list[str]) -> str:
    sanitized = _apply_sensitive_replacements(text)
    for term in leak_terms:
        sanitized = re.sub(re.escape(term), "generalized workforce signal", sanitized, flags=re.IGNORECASE)
    return sanitized


def _contains_leak(result_json: dict, leak_terms: list[str]) -> bool:
    if not leak_terms:
        return False
    public_payload = json.dumps(
        {
            "title": result_json.get("title"),
            "description": result_json.get("description"),
            "welcome_message": result_json.get("welcome_message"),
            "questions": result_json.get("questions"),
        },
        ensure_ascii=False,
    ).lower()
    return any(term.lower() in public_payload for term in leak_terms)


def _sanitize_generated_survey(result_json: dict, leak_terms: list[str]) -> dict:
    sanitized = dict(result_json)
    for key in ("title", "description", "welcome_message"):
        if isinstance(sanitized.get(key), str):
            sanitized[key] = _sanitize_text_for_leaks(sanitized[key], leak_terms)
    questions = []
    for question in sanitized.get("questions") or []:
        q = dict(question)
        if isinstance(q.get("text"), str):
            q["text"] = _sanitize_text_for_leaks(q["text"], leak_terms)
        if isinstance(q.get("options"), list):
            q["options"] = [
                {
                    **option,
                    "label": _sanitize_text_for_leaks(str(option.get("label", "")), leak_terms),
                    "value": _sanitize_text_for_leaks(str(option.get("value", "")), leak_terms),
                }
                for option in q["options"]
            ]
        questions.append(q)
    sanitized["questions"] = questions
    return sanitized


@router.get("/ping")
@limiter.limit("30/minute")
async def ping_ai(request: Request):
    return {"status": "AI router is alive"}


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _build_survey_context(survey_id: str, db: Session) -> dict:
    """Fetch survey, questions, and responses to build context for AI."""
    survey = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == survey_id).first()
    if not survey:
        return None

    responses = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(SurveyResponse.survey_id == survey_id)
        .all()
    )

    total = len(responses)
    completed = len([r for r in responses if r.status == ResponseStatusEnum.completed]) if total > 0 else 0
    abandoned = len([r for r in responses if r.status == ResponseStatusEnum.abandoned]) if total > 0 else 0
    completion_rate = round((completed / total) * 100) if total > 0 else 0
    abandon_rate = round((abandoned / total) * 100) if total > 0 else 0

    durations = [
        (r.completed_at - r.started_at).total_seconds()
        for r in responses
        if r.completed_at and r.started_at and r.status == ResponseStatusEnum.completed
    ]
    avg_time = round(sum(durations) / len(durations) / 60, 1) if durations else 0

    nps_scores = []
    for r in responses:
        for a in r.survey_answers:
            if a.answer_value and a.answer_value.isdigit():
                val = int(a.answer_value)
                if 0 <= val <= 10:
                    nps_scores.append(val)

    nps_val = None
    if nps_scores:
        promoters = len([s for s in nps_scores if s >= 9])
        detractors = len([s for s in nps_scores if s <= 6])
        nps_val = round(((promoters - detractors) / len(nps_scores)) * 100)

    question_summaries = []
    for q in survey.questions:
        q_answers = []
        for r in responses:
            ans = next((a for a in r.survey_answers if a.question_id == q.id), None)
            if ans:
                if ans.answer_value:
                    q_answers.append(ans.answer_value)
                elif ans.answer_json:
                    q_answers.append(ans.answer_json)

        question_summaries.append({
            "id": str(q.id),
            "text": q.question_text,
            "type": q.question_type.value,
            "responseCount": len(q_answers),
            "responses": q_answers[:50],
        })

    return {
        "title": survey.title,
        "stats": {
            "total": total,
            "completed": completed,
            "completionRate": completion_rate,
            "abandonRate": abandon_rate,
            "avgTimeMin": avg_time,
            "nps": nps_val,
        },
        "questionSummaries": question_summaries,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/surveys/{survey_id}/insights")
@limiter.limit("3/minute")
async def generate_survey_insights(
    request: Request,
    survey_id: str,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    context = _build_survey_context(survey_id, db)
    if not context:
        raise HTTPException(status_code=404, detail="Survey not found")

    body = AIInsightsRequest(
        surveyTitle=context["title"],
        responses=context["stats"],
        questionSummaries=context["questionSummaries"],
    )
    return await generate_insights(request, body, current_user)


@router.post("/insights")
@limiter.limit("3/minute")
async def generate_insights(
    request: Request,
    body: AIInsightsRequest,
    current_user: UserProfile = Depends(get_current_user),
    _gate: None = Depends(require_feature("ai_insights")),
):
    client = _get_client()

    prompt = f"""Analyze the following survey data and provide structured insights.

Survey Title: {body.surveyTitle}

Overall Stats:
- Total Responses: {body.responses.get('total')}
- Completion Rate: {body.responses.get('completionRate')}%
- Abandon Rate: {body.responses.get('abandonRate')}%
- Avg Time: {body.responses.get('avgTimeMin')} minutes
- NPS: {json.dumps(body.responses.get('nps'))}

Question Summaries:
{json.dumps(body.questionSummaries, indent=2)}

Return a JSON object with this exact structure:
{{
  "executiveSummary": "string",
  "npsAnalysis": "string or null",
  "insights": [
    {{ "type": "positive|warning|info|action", "title": "string", "detail": "string", "metric": "string or null" }}
  ],
  "topStrengths": ["string"],
  "improvementAreas": ["string"],
  "recommendedActions": [
    {{ "priority": "high|medium|low", "action": "string", "impact": "string" }}
  ]
}}"""

    try:
        text = await run_in_threadpool(_call_claude, client, prompt, 2048)
        result_json = json.loads(text)
        return AIInsightsResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Insights validation error: {ve}")
        raise HTTPException(status_code=500, detail="Claude returned an invalid data structure")
    except Exception as e:
        print(f"[AI] Insights error: {e}")
        if "rate" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="API rate limit reached, please try again shortly")
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")


@router.post("/generate")
@limiter.limit("5/minute")
async def generate_survey(
    request: Request,
    body: AIGenerateRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    client = _get_client()

    # ── Mode-specific system instructions ─────────────────────────────────
    MODE_PROMPTS = {
        "conversational": (
            "You are a survey design expert who writes in a warm, conversational tone. "
            "Questions should feel like a friendly chat — approachable, natural, and engaging. "
            "Use casual language and follow-up style phrasing."
        ),
        "emotionally_triggering": (
            "You are a survey design expert specializing in emotionally engaging surveys. "
            "Questions should evoke genuine feelings, use evocative language, and probe "
            "deeper emotions. Focus on personal experiences, feelings, and motivations. "
            "Make the respondent feel heard and valued."
        ),
        "deep_analysis": (
            "You are a survey design expert focused on deep analytical research. "
            "Questions should be thorough, multi-layered, and designed to uncover "
            "nuanced insights. Include follow-up questions, matrix-style comparisons, "
            "and scale-based measurements. Prioritize data quality and statistical value."
        ),
        "professional": (
            "You are a survey design expert creating formal, corporate-grade surveys. "
            "Questions should be precise, unbiased, and professionally worded. "
            "Use industry-standard question formats. Maintain a neutral, authoritative tone."
        ),
        "employee_feedback": (
            "You are an HR survey specialist designing employee feedback surveys. "
            "Questions should cover engagement, satisfaction, management effectiveness, "
            "work-life balance, growth opportunities, and workplace culture. "
            "Use empathetic and confidential framing to encourage honest responses."
        ),
        "business_feedback": (
            "You are a business strategist designing customer and stakeholder feedback surveys. "
            "Questions should focus on product/service quality, customer experience, NPS, "
            "competitive positioning, and actionable business improvements. "
            "Use clear, ROI-oriented language."
        ),
        "custom": (
            "You are a versatile survey design expert. Adapt your style, tone, and question "
            "structure to precisely match the user's description. Be flexible and creative."
        ),
    }

    mode = (body.mode or "conversational").lower().replace(" ", "_")
    system_instruction = MODE_PROMPTS.get(mode, MODE_PROMPTS["conversational"])
    if mode == "custom" and body.customInstruction:
        system_instruction = (
            f"{system_instruction}\n\nCustom survey mode instructions from the user:\n"
            f"{body.customInstruction[:2000]}"
        )

    # ── Build the user prompt ─────────────────────────────────────────────
    extra_context = ""
    if body.fileContext:
        extra_context += f"\n\nAdditional context from uploaded documents:\n{body.fileContext[:4000]}"
    if body.audioContext:
        extra_context += f"\n\nAdditional context from audio transcript:\n{body.audioContext[:4000]}"

    original_owner_context = f"{body.aiContext}{extra_context}"
    leak_terms = _extract_leak_terms(original_owner_context)

    # The idea-protection layer runs before final survey generation. The original
    # owner prompt stays internal to this request; the question generator receives
    # only the protected, generalized validation brief below.
    protection_result = await run_in_threadpool(protect_idea_context, client, original_owner_context)
    protected_context = protection_result["protected_context"]
    protection_metadata = IdeaProtectionMetadata(
        protection_applied=protection_result["protection_applied"],
        detected_sensitive_categories=protection_result["detected_sensitive_categories"],
        protected_context_summary=protection_result.get("protected_context_summary"),
    )

    prompt = f"""{system_instruction}

Generate a complete survey based on the following protected validation brief.

Protected validation brief: {protected_context}

Idea-protection requirements:
- The survey must validate the market, pain points, workflows, buying criteria, trust concerns, and perceived value without revealing the owner's confidential idea.
- Do not expose exact product strategy, business model, unique differentiators, execution plans, proprietary insights, internal data sources, scoring methods, or implementation details.
- Do not include or imply any masked source names, data sources, mechanisms, or scoring approaches.
- Generalize any sensitive concept into broad problem or outcome language.

Return a JSON object with this exact structure:
{{
  "title": "string",
  "description": "string",
  "welcome_message": "string",
  "questions": [
    {{
      "text": "The question text",
      "type": "short_text|long_text|single_choice|multiple_choice|rating|scale|yes_no",
      "options": [{{"label": "string", "value": "string"}}]
    }}
  ]
}}

Rules:
- Generate 5-10 relevant questions
- Only include "options" for single_choice and multiple_choice types
- For rating/scale/short_text/long_text/yes_no types, omit "options" entirely
- Make questions clear and unbiased
- Let the selected survey mode affect tone, depth, question style, engagement, and survey structure
- Adapt tone and depth based on the survey style described above"""

    try:
        text = await run_in_threadpool(_call_claude, client, prompt, 2048)
        result_json = json.loads(text)
        if _contains_leak(result_json, leak_terms):
            result_json = _sanitize_generated_survey(result_json, leak_terms)
            protection_metadata.leak_validation_applied = True
        result_json["protection_metadata"] = protection_metadata.model_dump()
        return AIGenerateResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Generate validation error: {ve}")
        raise HTTPException(status_code=500, detail="Claude returned an invalid survey structure")
    except Exception as e:
        print(f"[AI] Generate error: {e}")
        if "rate" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="API rate limit reached, please try again shortly")
        raise HTTPException(status_code=500, detail=f"Failed to generate survey: {str(e)}")


@router.post("/suggestions")
@limiter.limit("5/minute")
async def generate_suggestions(
    request: Request,
    body: AISuggestionsRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    client = _get_client()

    prompt = f"""Based on the following survey title and existing questions, suggest 3-5 relevant follow-up questions.

Survey Title: {body.surveyTitle}
Survey Description: {body.surveyDescription}

Existing Questions:
{json.dumps(body.existingQuestions, indent=2)}

Return a JSON object with this exact structure:
{{
  "suggestions": [
    {{
      "text": "The question text",
      "type": "short_text|long_text|single_choice|multiple_choice|rating|scale|yes_no",
      "options": [{{"label": "string", "value": "string"}}],
      "rationale": "Briefly why this question is useful"
    }}
  ]
}}

Only include "options" for single_choice and multiple_choice types."""

    try:
        text = await run_in_threadpool(_call_claude, client, prompt, 1024)
        result_json = json.loads(text)
        return AISuggestionsResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Suggestions validation error: {ve}")
        raise HTTPException(status_code=500, detail="Claude returned an invalid suggestion structure")
    except Exception as e:
        print(f"[AI] Suggestions error: {e}")
        if "rate" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="API rate limit reached, please try again shortly")
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {str(e)}")
