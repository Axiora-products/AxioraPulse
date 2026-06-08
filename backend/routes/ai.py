"""
routes/ai.py
────────────
AI-powered survey insights with multi-provider failover
(Gemini → OpenAI → Anthropic).
"""

import json
import re
from fastapi import Request, APIRouter, Depends, HTTPException

from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from core.rate_limiter import limiter

from sqlalchemy.orm import Session, joinedload
from db.database import get_db
from db.models import UserProfile, Survey, SurveyResponse, ResponseStatusEnum
from schemas import (
    AIInsightsRequest,
    AIInsightsResponse,
    AISuggestionsRequest,
    AISuggestionsResponse,
    AIGenerateRequest,
    AIGenerateResponse,
    IdeaProtectionMetadata,
    SurveyIntelligenceResponse,
)
from dependencies import get_current_user
from services.feature_gate import require_feature
from services.ai_provider import call_ai_sync

router = APIRouter(prefix="/ai", tags=["ai"])
SHORT_SURVEY_DEFAULT_QUESTIONS = 12
SHORT_SURVEY_TARGET_MINUTES = 3
SHORT_SURVEY_MAX_WORDS = 18
ADAPTIVE_QUESTION_TYPES = (
    "short_text|long_text|single_choice|multiple_choice|rating|scale|yes_no|"
    "dropdown|number|date|ranking|slider|matrix|emoji_reaction|swipe_choice|visual_choice"
)
ALLOWED_QUESTION_TYPES = set(ADAPTIVE_QUESTION_TYPES.split("|"))
OPTION_TYPES = {
    "single_choice",
    "multiple_choice",
    "dropdown",
    "ranking",
    "emoji_reaction",
    "swipe_choice",
    "visual_choice",
}
FAST_MOBILE_TYPES = ["emoji_reaction", "rating", "scale", "yes_no", "single_choice", "slider"]
DEEP_TYPES = {"long_text", "matrix", "ranking"}

DEFAULT_OPTIONS = {
    "emoji_reaction": [
        {"label": "😞", "value": "negative", "description": "Low"},
        {"label": "😐", "value": "neutral", "description": "Neutral"},
        {"label": "🙂", "value": "positive", "description": "Good"},
        {"label": "😍", "value": "delighted", "description": "Great"},
    ],
    "single_choice": [
        {"label": "Very low", "value": "very_low"},
        {"label": "Low", "value": "low"},
        {"label": "High", "value": "high"},
        {"label": "Very high", "value": "very_high"},
    ],
    "multiple_choice": [
        {"label": "Quality", "value": "quality"},
        {"label": "Speed", "value": "speed"},
        {"label": "Ease of use", "value": "ease_of_use"},
        {"label": "Support", "value": "support"},
    ],
    "swipe_choice": [
        {"label": "Option A", "value": "option_a"},
        {"label": "Option B", "value": "option_b"},
        {"label": "Option C", "value": "option_c"},
    ],
    "visual_choice": [
        {"label": "Option A", "value": "option_a"},
        {"label": "Option B", "value": "option_b"},
    ],
}


def _slug_value(label: str, fallback: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
    return value or fallback


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def _shorten_question(text: str) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = re.sub(r"^(please\s+)?(can you|could you|would you)\s+", "", text, flags=re.I)
    text = re.sub(r"^(tell us about|share your thoughts on)\s+", "What about ", text, flags=re.I)
    words = text.split()
    if len(words) <= SHORT_SURVEY_MAX_WORDS:
        return text
    trimmed = " ".join(words[:SHORT_SURVEY_MAX_WORDS]).rstrip(" ,;:")
    return trimmed if trimmed.endswith("?") else f"{trimmed}?"


def _normalize_options(q_type: str, options):
    if q_type == "matrix":
        if isinstance(options, dict):
            rows = options.get("rows") if isinstance(options.get("rows"), list) else []
            cols = options.get("columns") if isinstance(options.get("columns"), list) else []
            if rows and cols:
                return {"rows": _normalize_option_list(rows), "columns": _normalize_option_list(cols)}
        return {
            "rows": [{"label": "Experience", "value": "experience"}, {"label": "Value", "value": "value"}],
            "columns": [{"label": "Low", "value": "low"}, {"label": "High", "value": "high"}],
        }
    if q_type not in OPTION_TYPES:
        return None
    normalized = _normalize_option_list(options if isinstance(options, list) else [])
    return normalized if len(normalized) >= 2 else DEFAULT_OPTIONS.get(q_type, DEFAULT_OPTIONS["single_choice"])


def _normalize_option_list(options):
    normalized = []
    for i, opt in enumerate(options or []):
        if isinstance(opt, dict):
            label = str(opt.get("label") or opt.get("text") or opt.get("value") or f"Option {i + 1}").strip()
            item = {"label": label, "value": str(opt.get("value") or _slug_value(label, f"option_{i + 1}"))}
            if opt.get("description"):
                item["description"] = str(opt["description"])
            if opt.get("image_url"):
                item["image_url"] = str(opt["image_url"])
            normalized.append(item)
        elif opt:
            label = str(opt).strip()
            normalized.append({"label": label, "value": _slug_value(label, f"option_{i + 1}")})
    return normalized


def _infer_best_format(
    text: str, current_type: str, mode: str, index: int, total: int, context: str = "", has_options: bool = False
) -> str:
    lower = (text or "").lower()
    ctx = (context or "").lower()
    if current_type in ALLOWED_QUESTION_TYPES:
        q_type = current_type
    else:
        q_type = "short_text"

    # Hard structural types — always keep
    if q_type in {"email", "number", "date"}:
        return q_type
    # Last question should be open-ended
    if index == total - 1:
        return "long_text"
    # Don't allow long_text too early
    if q_type == "long_text" and index < total - 2:
        return "short_text"

    # ── If the AI chose a specific interactive type, trust it ──────────────────
    # Prevents destructive overrides like single_choice (with good options) → yes_no
    _AI_INTERACTIVE_TYPES = {
        "single_choice",
        "multiple_choice",
        "dropdown",
        "ranking",
        "emoji_reaction",
        "swipe_choice",
        "visual_choice",
        "rating",
        "scale",
        "slider",
        "matrix",
        "yes_no",
    }
    if q_type in _AI_INTERACTIVE_TYPES:
        # For option-bearing types, trust the AI when it provided valid options
        if q_type in OPTION_TYPES and has_options:
            return q_type
        # For non-option types (rating, scale, yes_no, slider), trust directly
        if q_type not in OPTION_TYPES:
            return q_type

    # ── Only for generic types (short_text) or option types without valid
    #    options, infer a better format from keywords ──────────────────────────
    if any(k in lower for k in ["feel", "emotion", "mood", "reaction", "sentiment"]):
        return "emoji_reaction"
    if any(k in lower for k in ["prefer", "choose", "which option", "pick", "tradeoff"]):
        return "swipe_choice" if index < 4 else "single_choice"
    if any(k in lower for k in ["rate", "satisfied", "satisfaction", "quality", "experience"]):
        return "rating"
    if any(k in lower for k in ["likely", "scale", "how much", "how often", "confidence"]):
        return "scale"
    if any(k in lower for k in ["image", "visual", "design", "look", "concept"]):
        return "visual_choice"
    # Only match genuine polar yes/no questions — not mid-sentence "do you"
    # like "how do you" or "what do you" which are NOT polar questions
    if "yes or no" in lower:
        return "yes_no"
    if re.match(r"^(do you|did you|are you|have you|is there|was there|will you|would you)\b", lower):
        return "yes_no"
    if any(k in ctx for k in ["busy", "mobile", "quick", "consumer", "customer"]) and current_type == "long_text":
        return "short_text"
    if any(k in ctx for k in ["employee", "team", "workplace"]) and index < 3:
        return "rating"
    if any(k in ctx for k in ["design", "creative", "concept", "packaging", "ad creative"]) and q_type in {
        "single_choice",
        "short_text",
    }:
        return "visual_choice"
    if mode in {"emotionally_triggering", "conversational"} and index == 0:
        return "emoji_reaction"
    if mode in {"business_feedback", "employee_feedback"} and index < 2:
        return "rating"
    return q_type if q_type not in DEEP_TYPES else "short_text"


def _flow_bucket(question: dict, original_index: int, total: int) -> tuple:
    q_type = question.get("type", "short_text")
    text = (question.get("text") or "").lower()
    if original_index == total - 1 or q_type == "long_text":
        return (4, original_index)
    if q_type in {"emoji_reaction", "yes_no", "rating", "scale"}:
        return (0, original_index)
    if q_type in {"single_choice", "multiple_choice", "dropdown", "swipe_choice", "visual_choice", "slider"}:
        return (1, original_index)
    if any(k in text for k in ["why", "improve", "reason", "challenge", "frustrat"]):
        return (3, original_index)
    return (2, original_index)


def _optimize_generated_survey(result_json: dict, body: AIGenerateRequest) -> dict:
    mode = (body.mode or "conversational").lower().replace(" ", "_")
    context = " ".join(filter(None, [body.aiContext, body.targetAudience, body.engagementGoals]))
    raw_questions = result_json.get("questions") or []
    questions = []

    for i, raw in enumerate(raw_questions[:SHORT_SURVEY_DEFAULT_QUESTIONS]):
        text = _shorten_question(str(raw.get("text") or raw.get("question") or "").strip())
        if not text:
            continue
        raw_type = str(raw.get("type") or "short_text")
        raw_options = raw.get("options")
        has_options = (isinstance(raw_options, list) and len(raw_options) >= 2) or (
            isinstance(raw_options, dict) and bool(raw_options)
        )
        q_type = _infer_best_format(text, raw_type, mode, i, len(raw_questions), context, has_options)
        questions.append(
            {
                "text": text,
                "type": q_type,
                "options": _normalize_options(q_type, raw_options),
                "_original_index": i,
            }
        )

    questions.sort(key=lambda q: _flow_bucket(q, q["_original_index"], len(questions)))

    long_text_seen = False
    previous_type = None
    repeat_count = 0
    optimized = []
    for i, q in enumerate(questions):
        q_type = q["type"]
        if q_type == "long_text":
            if long_text_seen or i < len(questions) - 2:
                q_type = "short_text"
            long_text_seen = q_type == "long_text"
        if q_type == previous_type:
            repeat_count += 1
        else:
            repeat_count = 1
        if repeat_count > 2:
            q_type = FAST_MOBILE_TYPES[i % len(FAST_MOBILE_TYPES)]
            repeat_count = 1
        previous_type = q_type

        item = {"text": q["text"], "type": q_type}
        options = _normalize_options(q_type, q.get("options"))
        if options is not None:
            item["options"] = options
        optimized.append(item)

    return {
        **result_json,
        "questions": optimized,
    }


# _get_client() and _call_gemini() removed — now using services.ai_provider.call_ai_sync


SENSITIVE_CATEGORY_LABELS = {
    "core_idea": "core_idea",
    "business_model": "business_model",
    "differentiators": "differentiators",
    "strategy": "strategy",
    "execution_details": "execution_details",
    "proprietary_insights": "proprietary_insights",
}

SENSITIVE_CATEGORY_KEYWORDS = {
    "core_idea": [
        "building",
        "idea",
        "concept",
        "platform",
        "tool",
        "app",
        "product",
        "predicts",
        "prediction",
        "attrition",
    ],
    "business_model": ["pricing", "subscription", "revenue", "monetize", "buy", "sell", "business model", "gtm"],
    "differentiators": ["unique", "differentiator", "competitive advantage", "moat", "unlike", "secret"],
    "strategy": ["strategy", "roadmap", "launch", "go-to-market", "positioning", "targeting", "validate"],
    "execution_details": [
        "using",
        "integrates",
        "slack",
        "microsoft teams",
        "algorithm",
        "model",
        "workflow",
        "implementation",
        "scoring",
    ],
    "proprietary_insights": [
        "proprietary",
        "insight",
        "internal",
        "trend",
        "behavior",
        "productivity",
        "data source",
        "signals",
    ],
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


def protect_idea_context(original_context: str) -> dict:
    """
    Idea-protection intelligence layer.
    Runs before final survey generation so public-facing questions validate the market
    without exposing the owner's confidential idea, strategy, model, or execution details.
    """
    if not original_context.strip():
        return _fallback_protect_context(original_context)

    classified = detect_sensitive_idea_info(original_context)
    llm_safe_context = (
        _mask_context_before_llm(original_context) if classified["protection_applied"] else original_context
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
        text = call_ai_sync(prompt, 1200)
        result = json.loads(text)
        protected_context = str(result.get("protected_context") or "").strip()
        detected = result.get("detected_sensitive_categories") or []
        if not protected_context:
            return _fallback_protect_context(original_context)
        detected = [SENSITIVE_CATEGORY_LABELS[c] for c in detected if c in SENSITIVE_CATEGORY_LABELS]
        if not detected:
            detected = classified["detected_sensitive_categories"]
        return {
            "protected_context": protected_context,
            "detected_sensitive_categories": detected,
            "protection_applied": bool(
                result.get("protection_applied") or detected or classified["protection_applied"]
            ),
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

        question_summaries.append(
            {
                "id": str(q.id),
                "text": q.question_text,
                "type": q.question_type.value,
                "responseCount": len(q_answers),
                "responses": q_answers[:50],
            }
        )

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
    # AI provider is resolved automatically by call_ai_sync

    prompt = f"""You are a senior survey research analyst performing a comprehensive, multi-dimensional analysis.
Analyze the following survey data with the depth and rigor of a professional research report.

== SURVEY DATA ==
Survey Title: {body.surveyTitle}

Overall Stats:
- Total Responses: {body.responses.get("total")}
- Completed: {body.responses.get("completed")}
- Completion Rate: {body.responses.get("completionRate")}%
- Abandon Rate: {body.responses.get("abandonRate")}%
- Avg Time: {body.responses.get("avgTimeMin")} minutes
- NPS Score: {json.dumps(body.responses.get("nps"))}

Question-by-Question Data:
{json.dumps(body.questionSummaries, indent=2)}

== ANALYSIS INSTRUCTIONS ==

Perform ALL of the following analyses. Be specific, quantitative, and evidence-based.
Reference exact response counts, percentages, and specific answer text wherever possible.

1. **Executive Summary** — A 3-5 sentence strategic overview covering the most important findings, the overall health of the survey, and the single most actionable takeaway. Write as if briefing a CEO.

2. **Overall Score** — Rate the survey results 0-100 based on: response quality (engagement depth, completion rate), sentiment balance, actionability of responses, and NPS if available. Be realistic — don't inflate.

3. **NPS Analysis** — If NPS data exists, provide a detailed interpretation: what the score means in context, comparison to typical benchmarks, and what's driving promoters vs detractors. If no NPS, set to null.

4. **Response Quality** — Assess engagement quality: are respondents giving thoughtful answers or rushing? Look at completion rate, time spent, text response length/quality, and answer patterns.

5. **Sentiment Breakdown** — Estimate the overall sentiment distribution across all responses as percentages (positive/neutral/negative must sum to 100). Look at text responses, ratings, and choice patterns.

6. **Key Findings** (insights) — Generate 5-8 specific, data-backed findings. Each must cite evidence from the responses. Mix types: positive (strengths), warning (concerns), info (patterns), action (opportunities).

7. **Key Themes** — Identify 3-5 thematic clusters that emerge across multiple questions. For each theme, note frequency, overall sentiment, and include 1-2 direct quotes from text responses if available.

8. **Cross-Question Patterns** — Find 2-4 correlations or patterns across different questions. Example: "Respondents who rated X highly also tended to choose Y in Q3." Rate significance as high/medium/low.

9. **Respondent Segments** — Identify 2-4 distinct respondent groups based on their answer patterns. Describe each segment's size, characteristics, sentiment, and what differentiates them.

10. **Urgency Matrix** — Classify 3-5 issues by urgency (critical/high/medium/low) and impact (high/medium/low). Provide evidence for each classification.

11. **Benchmark Comparison** — Compare 3-5 key metrics against typical survey/industry benchmarks. For example: completion rate vs typical survey benchmarks, NPS vs industry averages, response time vs expected.

12. **Data Quality Flags** — Flag 1-3 potential data quality concerns: possible survey fatigue, contradictory answers, suspiciously fast completions, leading question effects, low sample size caveats, etc. Include constructive suggestions.

13. **Top Strengths** — List 3-5 clear strengths evidenced by the data.

14. **Improvement Areas** — List 3-5 areas needing improvement with specific evidence.

15. **Recommended Actions** — Provide 4-6 prioritized, specific, actionable recommendations. Each must include priority (high/medium/low), the concrete action to take, and the expected impact.

== OUTPUT FORMAT ==
Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{{
  "executiveSummary": "string",
  "overallScore": 72,
  "npsAnalysis": "string or null",
  "responseQuality": "string describing quality assessment",
  "sentimentBreakdown": {{
    "positive": 45,
    "neutral": 35,
    "negative": 20,
    "overall": "positive|neutral|negative"
  }},
  "insights": [
    {{ "type": "positive|warning|info|action", "title": "string", "detail": "string with evidence", "metric": "stat or null" }}
  ],
  "keyThemes": [
    {{ "theme": "string", "frequency": "mentioned by X% of respondents", "sentiment": "positive|negative|mixed|neutral", "quotes": ["direct quote 1"], "relatedQuestions": ["Q1 text snippet"] }}
  ],
  "crossQuestionPatterns": [
    {{ "pattern": "string", "questions": ["Q1 snippet", "Q3 snippet"], "significance": "high|medium|low", "detail": "string" }}
  ],
  "respondentSegments": [
    {{ "segment": "name", "size": "~X% of respondents", "characteristics": "string", "sentiment": "positive|negative|mixed|neutral", "keyDifference": "string" }}
  ],
  "urgencyMatrix": [
    {{ "issue": "string", "urgency": "critical|high|medium|low", "impact": "high|medium|low", "evidence": "string" }}
  ],
  "benchmarkComparison": [
    {{ "metric": "string", "value": "actual value", "benchmark": "typical value", "status": "above|at|below", "context": "string" }}
  ],
  "dataQualityFlags": [
    {{ "flag": "string", "severity": "warning|info", "detail": "string", "suggestion": "string" }}
  ],
  "topStrengths": ["string with evidence"],
  "improvementAreas": ["string with evidence"],
  "recommendedActions": [
    {{ "priority": "high|medium|low", "action": "specific action", "impact": "expected outcome" }}
  ]
}}

== CRITICAL RULES ==
- Every claim MUST reference specific data from the responses (counts, percentages, quoted text).
- Do NOT fabricate data. If insufficient data exists for an analysis, provide what you can and note the limitation.
- Be genuinely analytical — surface non-obvious patterns, not just restatements of the raw numbers.
- The overall score must be realistic and calibrated: 80+ is excellent, 60-79 is good, 40-59 is needs improvement, below 40 is concerning.
- All percentage breakdowns must sum correctly.
- Prioritize actionable, specific insights over generic observations."""

    text = None
    try:
        text = await run_in_threadpool(call_ai_sync, prompt, 4096)
        result_json = json.loads(text)

        # ── Normalize AI response: fill missing required fields with defaults ──
        if "executiveSummary" not in result_json:
            result_json["executiveSummary"] = "No executive summary was generated."
        if "insights" not in result_json:
            result_json["insights"] = []
        if "topStrengths" not in result_json:
            result_json["topStrengths"] = []
        if "improvementAreas" not in result_json:
            result_json["improvementAreas"] = []
        if "recommendedActions" not in result_json:
            result_json["recommendedActions"] = []

        # Normalize overallScore
        score = result_json.get("overallScore")
        if score is not None:
            try:
                result_json["overallScore"] = max(0, min(100, int(score)))
            except (ValueError, TypeError):
                result_json["overallScore"] = None

        # Normalize sentimentBreakdown
        sb = result_json.get("sentimentBreakdown")
        if isinstance(sb, dict):
            result_json["sentimentBreakdown"] = {
                "positive": int(sb.get("positive", 0)),
                "neutral": int(sb.get("neutral", 0)),
                "negative": int(sb.get("negative", 0)),
                "overall": sb.get("overall", "neutral"),
            }

        # Normalize nested insight items
        normalized_insights = []
        for item in result_json.get("insights", []):
            if isinstance(item, dict):
                normalized_insights.append(
                    {
                        "type": item.get("type", "info"),
                        "title": item.get("title", "Insight"),
                        "detail": item.get("detail", item.get("description", "")),
                        "metric": item.get("metric"),
                    }
                )
            elif isinstance(item, str):
                normalized_insights.append(
                    {
                        "type": "info",
                        "title": "Insight",
                        "detail": item,
                        "metric": None,
                    }
                )
        result_json["insights"] = normalized_insights

        # Normalize action items
        normalized_actions = []
        for item in result_json.get("recommendedActions", []):
            if isinstance(item, dict):
                normalized_actions.append(
                    {
                        "priority": item.get("priority", "medium"),
                        "action": item.get("action", item.get("title", "")),
                        "impact": item.get("impact", item.get("description", "")),
                    }
                )
            elif isinstance(item, str):
                normalized_actions.append(
                    {
                        "priority": "medium",
                        "action": item,
                        "impact": "",
                    }
                )
        result_json["recommendedActions"] = normalized_actions

        # Normalize theme items
        normalized_themes = []
        for item in result_json.get("keyThemes", []):
            if isinstance(item, dict):
                normalized_themes.append(
                    {
                        "theme": item.get("theme", item.get("name", "Theme")),
                        "frequency": item.get("frequency", ""),
                        "sentiment": item.get("sentiment", "neutral"),
                        "quotes": item.get("quotes", []),
                        "relatedQuestions": item.get("relatedQuestions", []),
                    }
                )
        result_json["keyThemes"] = normalized_themes

        # Normalize cross-question patterns
        normalized_patterns = []
        for item in result_json.get("crossQuestionPatterns", []):
            if isinstance(item, dict):
                normalized_patterns.append(
                    {
                        "pattern": item.get("pattern", ""),
                        "questions": item.get("questions", []),
                        "significance": item.get("significance", "medium"),
                        "detail": item.get("detail", item.get("description", "")),
                    }
                )
        result_json["crossQuestionPatterns"] = normalized_patterns

        # Normalize respondent segments
        normalized_segments = []
        for item in result_json.get("respondentSegments", []):
            if isinstance(item, dict):
                normalized_segments.append(
                    {
                        "segment": item.get("segment", item.get("name", "Segment")),
                        "size": item.get("size", ""),
                        "characteristics": item.get("characteristics", ""),
                        "sentiment": item.get("sentiment", "neutral"),
                        "keyDifference": item.get("keyDifference", item.get("key_difference", "")),
                    }
                )
        result_json["respondentSegments"] = normalized_segments

        # Normalize urgency matrix
        normalized_urgency = []
        for item in result_json.get("urgencyMatrix", []):
            if isinstance(item, dict):
                normalized_urgency.append(
                    {
                        "issue": item.get("issue", ""),
                        "urgency": item.get("urgency", "medium"),
                        "impact": item.get("impact", "medium"),
                        "evidence": item.get("evidence", ""),
                    }
                )
        result_json["urgencyMatrix"] = normalized_urgency

        # Normalize benchmarks
        normalized_benchmarks = []
        for item in result_json.get("benchmarkComparison", []):
            if isinstance(item, dict):
                normalized_benchmarks.append(
                    {
                        "metric": item.get("metric", ""),
                        "value": item.get("value", ""),
                        "benchmark": item.get("benchmark", ""),
                        "status": item.get("status", "at"),
                        "context": item.get("context", ""),
                    }
                )
        result_json["benchmarkComparison"] = normalized_benchmarks

        # Normalize data quality flags
        normalized_flags = []
        for item in result_json.get("dataQualityFlags", []):
            if isinstance(item, dict):
                normalized_flags.append(
                    {
                        "flag": item.get("flag", item.get("title", "")),
                        "severity": item.get("severity", "info"),
                        "detail": item.get("detail", item.get("description", "")),
                        "suggestion": item.get("suggestion", item.get("recommendation", "")),
                    }
                )
        result_json["dataQualityFlags"] = normalized_flags

        return AIInsightsResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Insights validation error: {ve}")
        print(f"[AI] Raw AI response: {text[:500] if text else 'N/A'}")
        raise HTTPException(status_code=500, detail="AI provider returned an invalid data structure")
    except HTTPException:
        raise
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
    # AI provider is resolved automatically by call_ai_sync

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
            f"{system_instruction}\n\nCustom survey mode instructions from the user:\n{body.customInstruction[:2000]}"
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
    protection_result = await run_in_threadpool(protect_idea_context, original_owner_context)
    protected_context = protection_result["protected_context"]
    protection_metadata = IdeaProtectionMetadata(
        protection_applied=protection_result["protection_applied"],
        detected_sensitive_categories=protection_result["detected_sensitive_categories"],
        protected_context_summary=protection_result.get("protected_context_summary"),
    )

    prompt = f"""Generate a complete survey based on the following protected validation brief.

Protected validation brief: {protected_context}
Target audience: {body.targetAudience or "Infer from the protected validation brief"}
Engagement goals: {body.engagementGoals or "High completion, low fatigue, mobile-friendly participation"}

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
      "type": "question_type_string",
      "options": []
    }}
  ]
}}

Options Schema Rules:
- For single_choice, multiple_choice, dropdown, ranking, emoji_reaction, swipe_choice, and visual_choice types, "options" must be a list of objects: [{{"label": "string", "value": "string"}}]
- For the "matrix" type, "options" must be an object with "rows" and "columns": {{"rows": [{{"label": "string", "value": "string"}}], "columns": [{{"label": "string", "value": "string"}}]}}
- For short_text, long_text, rating, scale, yes_no, number, date, and slider types, "options" should be null or omitted.
- Use the exact question types: {ADAPTIVE_QUESTION_TYPES}

Rules:
- Generate exactly {SHORT_SURVEY_DEFAULT_QUESTIONS} relevant questions by default.
- Design for a target completion time of {SHORT_SURVEY_TARGET_MINUTES} minutes.
- Keep each question concise and high-signal, ideally under {SHORT_SURVEY_MAX_WORDS} words.
- Sequence from easy context questions, to diagnostic questions, to one open-ended closer.
- Infer the best format from the survey purpose, target audience, selected mode ({mode}), and engagement goals.
- Favor simple, tappable, mobile-friendly interactions over long text questions.
- Use no more than one long_text question, and place it near the end only when it captures high-value context.
- Adapt question formats to the objective: use rating/scale/yes_no/emoji_reaction for fast sentiment, single_choice/multiple_choice/dropdown for structured diagnosis, swipe_choice for lightweight preference tradeoffs, visual_choice for image-led choices, ranking/slider/matrix only when they reduce effort, and long_text sparingly for high-value context.
- For visual_choice options, include image_url when a concrete image URL is available; otherwise use clear labels.
- For emoji_reaction options, use emoji characters as labels and stable lowercase values.
- Make questions clear, unbiased, engaging, and fatigue-resistant.
- Adapt tone and depth based on the survey style described above.
- CRITICAL: Every question MUST be directly relevant to the validation brief topic. Do not generate generic filler questions unrelated to the domain.
- CRITICAL: Question type MUST semantically match the question content. Never assign yes_no to questions starting with "how", "what", "which", "where", or "why" — use single_choice or multiple_choice with relevant answer options instead.
- CRITICAL: Options for choice-type questions MUST be contextually meaningful answers to the specific question. Generic "Yes/No" options must ONLY appear on genuine polar yes/no questions. A question like "How do you acquire X?" must have options like specific methods, channels, or approaches — never Yes/No.
- For each single_choice, multiple_choice, or dropdown question, provide 3-6 specific, meaningful options that directly address the question asked."""

    try:
        text = await run_in_threadpool(
            call_ai_sync,
            prompt,
            8192,
            system_instruction + " Always respond with valid JSON only — no markdown, no explanation.",
        )
        result_json = json.loads(text)
        result_json = _optimize_generated_survey(result_json, body)
        if _contains_leak(result_json, leak_terms):
            result_json = _sanitize_generated_survey(result_json, leak_terms)
            protection_metadata.leak_validation_applied = True
        result_json["protection_metadata"] = protection_metadata.model_dump()
        return AIGenerateResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Generate validation error: {ve}")
        raise HTTPException(status_code=500, detail="AI provider returned an invalid survey structure")
    except HTTPException:
        raise
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
    # AI provider is resolved automatically by call_ai_sync

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
      "type": "{ADAPTIVE_QUESTION_TYPES}",
      "options": [{{"label": "string", "value": "string"}}] or {{"rows": [{{"label": "string", "value": "string"}}], "columns": [{{"label": "string", "value": "string"}}]}},
      "rationale": "Briefly why this question is useful"
    }}
  ]
}}

Rules:
- Prefer suggestions that keep the survey near {SHORT_SURVEY_DEFAULT_QUESTIONS} questions and within {SHORT_SURVEY_TARGET_MINUTES} minutes.
- Keep each suggested question under {SHORT_SURVEY_MAX_WORDS} words when possible.
- Suggest formats that improve flow, engagement, and completion quality instead of repeating the same format.
- Use emoji_reaction for quick sentiment, swipe_choice for preference selections, and visual_choice when image-led answers would be clearer.
- Only include "options" for single_choice, multiple_choice, dropdown, ranking, matrix, emoji_reaction, swipe_choice, and visual_choice types."""

    try:
        text = await run_in_threadpool(call_ai_sync, prompt, 1024)
        result_json = json.loads(text)
        return AISuggestionsResponse(**result_json)
    except ValidationError as ve:
        print(f"[AI] Suggestions validation error: {ve}")
        raise HTTPException(status_code=500, detail="AI provider returned an invalid suggestion structure")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI] Suggestions error: {e}")
        if "rate" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="API rate limit reached, please try again shortly")
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {str(e)}")


# ── Survey Intelligence (Guidance + Roadmap) ──────────────────────────────────


@router.post("/survey-intelligence")
@limiter.limit("3/minute")
async def generate_survey_intelligence(
    request: Request,
    body: dict,
    current_user: UserProfile = Depends(get_current_user),
):
    """
    Generate AI-powered competitor landscape, target persona, opportunity mapping,
    viability score, and development roadmap — all contextually aligned with the
    survey idea, title, description, and questions.
    """
    # AI provider is resolved automatically by call_ai_sync

    title = body.get("title", "")
    description = body.get("description", "")
    questions = body.get("questions", [])
    welcome = body.get("welcome_message", "")
    location_country = body.get("location_country", "")
    location_state = body.get("location_state", "")
    location_district = body.get("location_district", "")

    q_summary = "\n".join(
        f"  - Q{i + 1} ({q.get('type', 'text')}): {q.get('text', '')}" for i, q in enumerate(questions[:20])
    )

    location_section = ""
    if location_country or location_state or location_district:
        parts = []
        if location_country:
            parts.append(f"Country: {location_country}")
        else:
            parts.append("Country: Global Level (No country specified)")
        if location_state:
            parts.append(f"State/Region: {location_state}")
        else:
            parts.append("State/Region: National Level (No state/region specified)")
        if location_district:
            parts.append(f"District/City/County: {location_district}")
        else:
            parts.append("District/City/County: State Level (No district/city specified)")
        location_section = "== TARGET GEOGRAPHIC LOCATION ==\n" + "\n".join(parts) + "\n"

    prompt = f"""You are a senior market research strategist and startup advisor.
Analyze the following survey concept thoroughly and generate deep, highly specific intelligence.

== SURVEY CONTEXT ==
Title: {title}
Description: {description}
Welcome message: {welcome}
Questions:
{q_summary}

{location_section}
== YOUR TASK ==
Based on the survey's idea, industry, problem statement, research objectives, and the specified target location/geography (if provided), generate:

1. **category** — The industry/vertical this survey belongs to (e.g. "EdTech", "FinTech", "HealthTech", "E-commerce", "SaaS", "HR Tech", "PropTech", "FoodTech", etc.). Be specific.

2. **competitors** — 5 real companies that are direct or adjacent competitors in this specific space (tailored to the target geographic location if provided). For each:
   - name: company name
   - offering: what they sell/provide (one line)
   - pricing: their pricing model with actual numbers (e.g. local currency if applicable)
   - strengths: key competitive advantages
   - weaknesses: known limitations
   - diff: their unique differentiator
   - share: estimated relative market share as percentage string (e.g. "24%")

3. **persona** — The ideal target customer for this survey/product:
   - name: persona archetype name (e.g. "Growth-Stage Startup Founder")
   - demographics: age range, role, location (should align with target state/country), professional background
   - psychographics: values, motivations, decision-making style
   - painPoints: specific frustrations this persona faces related to the survey topic
   - buyingBehavior: how they evaluate and purchase solutions

4. **opportunities** — 3 strategic innovation lanes specific to this survey's domain:
   - lane: short title (e.g. "Lane 1: AI-Powered Personalization")
   - description: 2-3 sentence actionable description

5. **viabilityScore** — An integer 0-100 estimating market viability based on market size, competition intensity, timing, and problem urgency.

6. **roadmap** — 6-8 execution phases tailored to this specific idea. For each phase:
   - name: e.g. "Phase 1: Idea Validation"
   - goals: specific objectives for this phase in context of the survey idea
   - resources: what people/assets are needed
   - timeline: estimated duration (e.g. "2 - 3 weeks")
   - risks: key risk + mitigation in format "Risk description. Mitigation: mitigation description"
   - tools: recommended tools/platforms
   - cost: estimated budget (e.g. "$500")

== CRITICAL RULES ==
- Every output MUST be directly aligned with the survey's specific idea, industry, and research context.
- Highly tailor the insights (competitors, personas, pricing/currency, and roadmap steps) specifically to the level of location details provided:
  * If a district/city is given, make the insights highly local to that city/district.
  * If only a state is given, make them state-level.
  * If only a country is given, make them national.
  * If no location details are specified, make them globally applicable.
- Do NOT use generic or template-like outputs. Tailor everything to the survey content.
- Competitors must be real companies relevant to the survey's problem space. If a specific district/city/town is specified, do NOT assume or claim that any national, global, or metro-only competitor (regardless of industry—whether hyperlocal delivery, IT services, retail, EdTech, healthcare, etc.) is physically active or operating there unless you are certain of their active local presence. If they are a major national/global competitor but do not operate in the local city, explicitly mention this (e.g., in the 'offering' or 'pricing' field add '(National/Global player - not active in [City] yet)').
- Persona must match the likely respondent/customer profile for this specific survey.
- Roadmap phases must contain actionable steps connected to the survey's concept.
- Return ONLY valid JSON with no markdown, no explanation.


Return this exact JSON structure:
{{
  "category": "string",
  "competitors": [{{
    "name": "string",
    "offering": "string",
    "pricing": "string",
    "strengths": "string",
    "weaknesses": "string",
    "diff": "string",
    "share": "string"
  }}],
  "persona": {{
    "name": "string",
    "demographics": "string",
    "psychographics": "string",
    "painPoints": "string",
    "buyingBehavior": "string"
  }},
  "opportunities": [
    {{
      "lane": "string",
      "description": "string"
    }}
  ],
  "viabilityScore": 82,
  "roadmap": [{{
    "name": "string",
    "goals": "string",
    "resources": "string",
    "timeline": "string",
    "risks": "string",
    "tools": "string",
    "cost": "string"
  }}]
}}"""

    try:
        text = await run_in_threadpool(call_ai_sync, prompt, 8192)
        result_json = json.loads(text)
        return SurveyIntelligenceResponse(**result_json)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[AI] Survey intelligence error: {e}")
        if "rate" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="API rate limit reached, please try again shortly")
        raise HTTPException(status_code=500, detail=f"Failed to generate survey intelligence: {str(e)}")


class AITranslateRequest(BaseModel):
    title: str
    description: str | None = None
    welcome_message: str | None = None
    thank_you_message: str | None = None
    questions: list[dict]
    language: str


@router.post("/translate-survey")
async def translate_survey(body: AITranslateRequest):
    # AI provider is resolved automatically by call_ai_sync

    lang_name = "Hindi" if body.language == "hi" else "Telugu" if body.language == "te" else body.language

    # Extract only translatable parts from the input questions to make the payload smaller and extremely safe
    simple_questions = []
    for q in body.questions:
        sq = {
            "id": q.get("id"),
            "type": q.get("type", "short_text"),
            "question_text": q.get("question_text", ""),
            "description": q.get("description", ""),
        }
        if q.get("options") is not None:
            opts = q.get("options")
            if isinstance(opts, list):
                sq["options"] = [
                    {"label": o.get("label"), "value": o.get("value")} for o in opts if isinstance(o, dict)
                ]
            elif isinstance(opts, dict):  # for matrix type
                sq["options"] = opts
        simple_questions.append(sq)

    survey_data = {
        "title": body.title,
        "description": body.description,
        "welcome_message": body.welcome_message,
        "thank_you_message": body.thank_you_message,
        "questions": simple_questions,
    }

    prompt = f"""You are an expert translator. Translate the following survey data into natural, fluent, and culturally appropriate {lang_name}.

CRITICAL RULES:
1. Translate only these fields:
   - "title"
   - "description"
   - "welcome_message"
   - "thank_you_message"
   - "question_text"
   - "description" (inside questions)
   - "label" (inside options or matrix choices)
2. DO NOT translate or modify "id", "type", "value", "key", or any other structural identifier. Keep them exactly as they are.
3. Keep the output JSON structure identical to the input JSON structure.
4. Return ONLY a raw JSON object containing the translations. Do not include markdown code fences, comments, or extra conversational text.

Original Survey JSON:
{json.dumps(survey_data, ensure_ascii=False)}"""

    try:
        text = await run_in_threadpool(call_ai_sync, prompt, 4096)
        result_json = json.loads(text)
        return result_json
    except Exception as e:
        print(f"[AI] Survey translation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to translate survey: {str(e)}")
