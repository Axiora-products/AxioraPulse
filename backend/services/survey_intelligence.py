"""
services/survey_intelligence.py
───────────────────────────────
Survey Intelligence Extraction Engine for Investor Readiness.

Classifies survey questions into investor signal categories, analyzes
responses to compute per-capability scores with evidence statements,
and produces structured intelligence data for 7 capabilities:

1. Problem-Solution Story Builder
2. Market Opportunity Framing
3. Traction & Validation Evidence Builder
4. Competitive Advantage Framing
5. Investor Objection Intelligence
6. Investor Evidence Mapping
7. Investor Question Simulation Engine

Every metric is computed directly from actual survey response data.
No assumptions. No fabricated data. Every insight is traceable.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from db.models import SurveyQuestion, SurveyResponse, SurveyAnswer


# ── Positive / Negative Classification Constants ─────────────────────────────

_POSITIVE_TEXT_VALUES = frozenset([
    "yes", "true", "agree", "strongly agree", "very high", "high",
    "positive", "interested", "definitely", "very likely", "likely",
    "very satisfied", "satisfied", "excellent", "great", "good",
    "love it", "amazing", "fantastic", "absolutely", "of course",
])

_NEGATIVE_TEXT_VALUES = frozenset([
    "no", "false", "disagree", "strongly disagree", "very low", "low",
    "negative", "not interested", "unlikely", "very unlikely", "never",
    "dissatisfied", "very dissatisfied", "poor", "terrible", "bad",
    "hate", "awful", "not at all", "definitely not",
])

_POSITIVE_KEYWORDS = frozenset([
    "love", "great", "excellent", "definitely", "highly", "amazing",
    "fantastic", "wonderful", "perfect", "impressed", "helpful",
    "useful", "recommend", "satisfied", "happy",
])

_NEGATIVE_KEYWORDS = frozenset([
    "hate", "terrible", "awful", "worst", "useless", "unhelpful",
    "frustrated", "annoyed", "disappointed", "confused", "waste",
    "poor", "bad", "horrible", "difficult",
])


# ── Data Classes ──────────────────────────────────────────────────────────────


@dataclass
class AnswerAnalysis:
    """Analysis result for a single answer value."""
    sentiment: str  # "positive", "negative", "neutral"
    numeric_value: Optional[float] = None


@dataclass
class QuestionAnalysis:
    """Aggregated analysis of all responses to a single question."""
    question_id: str
    question_text: str
    question_type: str
    categories: List[str]
    total_answers: int = 0
    positive_count: int = 0
    negative_count: int = 0
    neutral_count: int = 0
    ratings_sum: float = 0.0
    ratings_count: int = 0
    top_answers: Dict[str, int] = field(default_factory=dict)
    text_snippets: List[str] = field(default_factory=list)

    @property
    def positive_ratio(self) -> float:
        return (self.positive_count / self.total_answers * 100) if self.total_answers > 0 else 0.0

    @property
    def negative_ratio(self) -> float:
        return (self.negative_count / self.total_answers * 100) if self.total_answers > 0 else 0.0

    @property
    def average_rating(self) -> float:
        return round(self.ratings_sum / self.ratings_count, 1) if self.ratings_count > 0 else 0.0


@dataclass
class EvidenceStatement:
    """A traceable evidence statement derived from survey data."""
    category: str
    statement: str
    data_point: str
    source_question: str
    sample_size: int


@dataclass
class CapabilityResult:
    """Output from a single capability engine."""
    capability_name: str
    score: int  # 0-100
    confidence: str  # "high", "medium", "low"
    evidence_count: int
    data_coverage: float  # 0.0-1.0
    evidence_statements: List[EvidenceStatement]
    raw_metrics: Dict[str, Any]
    limitations: List[str]


@dataclass
class FounderContext:
    """Structured container for all founder-provided context fields."""
    startup_context: str = ""
    pricing_model: str = ""
    target_country: str = ""
    target_state: str = ""
    target_district: str = ""
    currency_code: str = "USD"
    currency_symbol: str = "$"
    funding_stage: Optional[str] = None
    funding_target: Optional[str] = None
    team_size: Optional[int] = None
    monthly_revenue: Optional[str] = None
    industry_vertical: Optional[str] = None
    founded_year: Optional[int] = None
    founder_count: Optional[int] = None

    @property
    def has_funding_info(self) -> bool:
        return bool(self.funding_stage or self.funding_target)

    @property
    def has_team_info(self) -> bool:
        return self.team_size is not None and self.team_size > 0

    @property
    def filled_optional_count(self) -> int:
        count = 0
        if self.funding_stage: count += 1
        if self.funding_target: count += 1
        if self.team_size: count += 1
        if self.monthly_revenue: count += 1
        if self.industry_vertical: count += 1
        if self.founded_year: count += 1
        if self.founder_count: count += 1
        return count


def _parse_price_from_text(text: str) -> Optional[float]:
    """
    Extract a numeric price from free-text pricing model descriptions.
    e.g. "₹2,999/month" → 2999.0, "$49/user monthly" → 49.0
    Returns None if no price can be extracted.
    """
    if not text:
        return None
    cleaned = re.sub(r'[₹$€£A-Z]', '', text, flags=re.IGNORECASE)
    cleaned = cleaned.replace(',', '')
    matches = re.findall(r'\d+\.?\d*', cleaned)
    if matches:
        return float(matches[0])
    return None


# ── Signal Rule Registry ──────────────────────────────────────────────────────
#
# Each rule is checked in priority order (highest first).
# A question matches a rule if:
#   (a) ANY text_pattern appears as a substring in the lowercase question text, AND
#   (b) allowed_types is None (any type) OR the question type is in allowed_types.
#
# Multiple rules can match the same question → multiple categories (kept).
# This replaces the old SIGNAL_CATEGORIES keyword dict which had two flaws:
#   1. Type gating was per-category (too coarse) — now per-rule
#   2. Keyword list missed many real-world phrasings

_ANY_TYPE = None  # sentinel: no type restriction

# fmt: off
_SIGNAL_RULES: List[Tuple[int, str, List[str], Optional[set]]] = [
    # (priority, category, text_patterns, allowed_types)

    # ── WILLINGNESS TO PAY (highest priority — very specific phrasing) ─────────
    (100, "willingness_to_pay", [
        "how much would you pay", "how much would you be willing to pay",
        "what price", "what would you pay", "monthly fee", "annual fee",
        "subscription fee", "what budget", "how much budget",
        "₹", "rupee per month", "per month plan", "pricing tier",
        "price point", "cost per month", "cost per year", "pay per",
    ], _ANY_TYPE),

    (95, "willingness_to_pay", [
        "pay", "price", "cost", "spend", "budget", "afford",
        "subscription", "premium", "fee", "charge",
        "money", "dollar", "rupee", "worth", "invest in",
    ], {"rating", "scale", "single_choice", "number", "slider", "short_text", "dropdown", "yes_no"}),

    # ── PRODUCT MARKET FIT (exact NPS / satisfaction phrases) ─────────────────
    (90, "product_market_fit", [
        "nps", "net promoter", "recommend us to", "recommend this to",
        "recommend to a friend", "recommend to a colleague",
        "how likely are you to recommend",
        "very disappointed", "somewhat disappointed", "not disappointed",
        "how disappointed would you be",
        "missing feature", "must-have", "nice to have",
    ], _ANY_TYPE),

    (85, "product_market_fit", [
        "satisfied", "satisfaction", "how satisfied", "overall experience",
        "rate your experience", "rate this product", "rate the product",
        "rate the solution", "rate our", "how useful", "how helpful",
        "quality of", "value for money", "would you continue",
        "would you keep using", "benefit", "impact on your", "love",
        "enjoy using", "how would you rate",
    ], {"rating", "scale", "yes_no", "emoji_reaction", "slider", "single_choice",
        "short_text", "long_text"}),

    # ── PROBLEM VALIDATION (exact pain phrases) ────────────────────────────────
    (80, "problem_validation", [
        "what problem", "biggest problem", "main problem", "key problem",
        "biggest challenge", "main challenge", "key challenge",
        "biggest pain", "main pain point", "biggest frustration",
        "what frustrates", "how frustrated", "how difficult",
        "how often do you face", "how frequently do you encounter",
        "time spent on", "hours spent", "manual process",
        "currently manage", "how do you currently handle",
        "how do you deal with", "what takes the most time",
        "wasted time", "inefficiency", "inefficient",
    ], _ANY_TYPE),

    (75, "problem_validation", [
        "pain", "problem", "frustrat", "struggle", "challeng", "difficult",
        "issue", "annoy", "barrier", "obstacle", "inconvenien", "complain",
        "suffer", "lack", "gap", "unmet", "unsatisf", "broken",
        "tedious", "time-consuming", "error-prone", "manual",
    ], {"yes_no", "rating", "scale", "single_choice", "multiple_choice",
        "short_text", "long_text", "slider", "emoji_reaction"}),

    # ── MARKET DEMAND (adoption intent phrases) ────────────────────────────────
    (70, "market_demand", [
        "would you use", "would you try", "would you adopt",
        "would you switch", "would you sign up", "would you register",
        "would you download", "would you subscribe", "would you join",
        "how soon would you", "when would you", "are you interested in",
        "would you consider", "would you be interested",
        "likelihood of adoption", "probability of using",
        "how likely are you to use", "how likely are you to adopt",
        "how likely are you to try", "how likely are you to buy",
    ], _ANY_TYPE),

    (65, "market_demand", [
        "interest", "try", "adopt", "switch", "need", "want",
        "willing", "consider", "buy", "purchase", "sign up", "subscribe",
        "download", "install", "join", "register", "likely",
        "demand", "intent",
    ], {"yes_no", "rating", "scale", "single_choice", "slider",
        "emoji_reaction", "swipe_choice"}),

    # ── COMPETITIVE POSITIONING ────────────────────────────────────────────────
    (60, "competitive_positioning", [
        "what do you currently use", "what tool do you use",
        "what software do you use", "what app do you use",
        "what solution do you use", "what platform do you use",
        "what product do you use", "currently using",
        "why did you choose", "main drawback of",
        "biggest weakness of your current",
        "what do you wish your current", "what is missing from",
        "why would you switch away from",
        "compared to alternatives", "compared to other tools",
        "how does this compare", "what is better than",
        "what is worse than", "differentiat",
        "unique advantage", "unique value",
    ], _ANY_TYPE),

    (55, "competitive_positioning", [
        "alternative", "competitor", "existing", "replace",
        "compared", "other tool", "other app", "other product",
        "other service", "other solution",
        "similar", "better", "worse", "different from",
    ], {"single_choice", "multiple_choice", "short_text", "long_text",
        "dropdown", "yes_no"}),

    # ── CUSTOMER SEGMENTATION ──────────────────────────────────────────────────
    (50, "customer_segmentation", [
        "how many employees", "company size", "organization size",
        "team size", "number of employees", "how large is your team",
        "department size", "your role", "your job title",
        "what is your role", "what is your position",
        "what best describes your role", "type of business",
        "type of organization", "industry you work in",
        "which sector", "revenue of your company",
        "annual turnover", "years of experience",
        "how long have you worked", "what is your age",
        "age range", "gender", "location", "city", "state",
        "country", "education level", "income range",
    ], _ANY_TYPE),

    (45, "customer_segmentation", [
        "age", "occupation", "role", "industry", "company", "team",
        "department", "gender", "location", "city", "country",
        "education", "income", "experience level", "job title",
        "employee", "sector", "business type",
    ], {"single_choice", "dropdown", "short_text", "number", "multiple_choice"}),

    # ── RISK SIGNAL ────────────────────────────────────────────────────────────
    (40, "risk_signal", [
        "what would stop you", "what would prevent you",
        "what would make you not", "what is your main concern",
        "biggest concern about", "biggest worry about",
        "what barrier", "what obstacle", "what hesitation",
        "privacy concern", "data security concern",
        "trust concern", "reliability concern",
        "would you hesitate", "reason for not", "why not",
        "what would hold you back",
    ], _ANY_TYPE),

    (35, "risk_signal", [
        "concern", "worry", "hesitat", "prevent", "stop",
        "obstacle", "risk", "unlikely", "doubt", "fear", "unsure",
        "disagree", "negative", "dislike", "won't", "would not",
        "not interested", "no need", "drawback", "limitation",
    ], {"yes_no", "rating", "scale", "single_choice", "short_text",
        "long_text", "slider", "emoji_reaction", "multiple_choice"}),
]
# fmt: on

# Pre-compile rules into (priority, category, compiled_patterns, allowed_types) tuples
# sorted by descending priority so highest-priority rules fire first.
_COMPILED_SIGNAL_RULES = sorted(
    [
        (
            priority,
            category,
            [p.lower() for p in patterns],
            allowed_types,
        )
        for priority, category, patterns, allowed_types in _SIGNAL_RULES
    ],
    key=lambda r: -r[0],  # descending priority
)

# All known signal categories (used for fallback logic)
_ALL_SIGNAL_CATEGORIES = {
    "problem_validation", "market_demand", "product_market_fit",
    "willingness_to_pay", "competitive_positioning",
    "customer_segmentation", "risk_signal",
}

# Question types that are almost always about market intent when nothing else matches
_INTENT_TYPE_FALLBACKS = {
    "yes_no": "market_demand",
    "swipe_choice": "market_demand",
    "emoji_reaction": "product_market_fit",
}


def classify_question(question: SurveyQuestion) -> List[str]:
    """
    Classify a survey question into one or more investor signal categories.

    Uses a priority-ordered SignalRule registry instead of the old flat
    keyword dict. Rules are checked in descending priority order. A rule
    matches when ANY of its text_patterns appears in the lowercase question
    text AND the question type is allowed (or allowed_types is None).

    Improvements over the old classifier:
    - Priority ordering prevents low-specificity rules from stomping specific ones
    - Type gating is per-rule (not per-category) → more granular
    - 40+ new patterns added (NPS, "how do you currently", "what would stop you", etc.)
    - Fallback heuristics for yes_no / emoji_reaction / swipe_choice types
    - Never returns "general" for question types with clear investor signal intent

    Returns a deduplicated list of matching category names.
    If no category matches, returns ["general"].
    """
    text_lower = question.question_text.lower()
    q_type = (
        question.question_type.value
        if hasattr(question.question_type, "value")
        else str(question.question_type)
    )

    matched: List[str] = []
    seen: set = set()

    for _priority, category, patterns, allowed_types in _COMPILED_SIGNAL_RULES:
        # Type gate
        if allowed_types is not None and q_type not in allowed_types:
            continue
        # Already matched this category from a higher-priority rule — skip
        if category in seen:
            continue
        # Pattern match — any pattern is sufficient
        for pattern in patterns:
            if pattern in text_lower:
                matched.append(category)
                seen.add(category)
                break  # one pattern match per rule is enough

    # Fallback: for question types with strong implicit investor signal,
    # apply a default category when nothing matched
    if not matched and q_type in _INTENT_TYPE_FALLBACKS:
        matched.append(_INTENT_TYPE_FALLBACKS[q_type])

    return matched if matched else ["general"]


# ── Answer Analyzer ───────────────────────────────────────────────────────────


def _analyze_answer(answer_value: Optional[str], answer_json: Any, question_type: str) -> AnswerAnalysis:
    """
    Classify a single answer as positive, negative, or neutral.
    Also extract numeric value if applicable.
    """
    val = (answer_value or "").strip().lower()
    if not val and not answer_json:
        return AnswerAnalysis(sentiment="neutral")

    # Handle JSON answers (multi-select, ranking, matrix)
    if answer_json and not val:
        if isinstance(answer_json, list) and len(answer_json) > 0:
            return AnswerAnalysis(sentiment="neutral")  # Multi-select — count as participation
        return AnswerAnalysis(sentiment="neutral")

    # Numeric / rating analysis
    if val.replace(".", "", 1).isdigit():
        num = float(val)
        # For rating/scale (typically 1-5 or 1-10)
        if question_type in ("rating", "scale", "slider"):
            if num >= 4:
                return AnswerAnalysis(sentiment="positive", numeric_value=num)
            elif num <= 2:
                return AnswerAnalysis(sentiment="negative", numeric_value=num)
            else:
                return AnswerAnalysis(sentiment="neutral", numeric_value=num)
        # For number type — just record the value
        return AnswerAnalysis(sentiment="neutral", numeric_value=num)

    # Exact text match
    if val in _POSITIVE_TEXT_VALUES:
        return AnswerAnalysis(sentiment="positive")
    if val in _NEGATIVE_TEXT_VALUES:
        return AnswerAnalysis(sentiment="negative")

    # Keyword-based classification for longer text
    has_positive = any(kw in val for kw in _POSITIVE_KEYWORDS)
    has_negative = any(kw in val for kw in _NEGATIVE_KEYWORDS)

    if has_positive and not has_negative:
        return AnswerAnalysis(sentiment="positive")
    elif has_negative and not has_positive:
        return AnswerAnalysis(sentiment="negative")

    return AnswerAnalysis(sentiment="neutral")


# ── Response Analysis Engine ──────────────────────────────────────────────────


def analyze_responses(
    questions: List[SurveyQuestion],
    answers: List[SurveyAnswer],
    responses: List[SurveyResponse],
) -> Dict[str, QuestionAnalysis]:
    """
    Analyze all survey responses and produce per-question analysis.

    Returns a dict keyed by question_id (as string) mapping to QuestionAnalysis.
    """
    # Build lookup: question_id -> SurveyQuestion
    q_lookup: Dict[str, SurveyQuestion] = {str(q.id): q for q in questions}

    # Group answers by question_id
    answers_by_question: Dict[str, List[SurveyAnswer]] = defaultdict(list)
    for ans in answers:
        answers_by_question[str(ans.question_id)].append(ans)

    results: Dict[str, QuestionAnalysis] = {}

    for q_id, question in q_lookup.items():
        q_type = question.question_type.value if hasattr(question.question_type, "value") else str(question.question_type)
        categories = classify_question(question)
        qa = QuestionAnalysis(
            question_id=q_id,
            question_text=question.question_text,
            question_type=q_type,
            categories=categories,
        )

        q_answers = answers_by_question.get(q_id, [])
        answer_values_counter: Counter = Counter()

        for ans in q_answers:
            val_raw = (ans.answer_value or "").strip()
            if not val_raw and not ans.answer_json:
                continue

            qa.total_answers += 1
            analysis = _analyze_answer(ans.answer_value, ans.answer_json, q_type)

            if analysis.sentiment == "positive":
                qa.positive_count += 1
            elif analysis.sentiment == "negative":
                qa.negative_count += 1
            else:
                qa.neutral_count += 1

            if analysis.numeric_value is not None:
                qa.ratings_sum += analysis.numeric_value
                qa.ratings_count += 1

            # Track answer frequency for choice questions
            if q_type in ("single_choice", "multiple_choice", "dropdown", "yes_no", "swipe_choice", "visual_choice"):
                answer_values_counter[val_raw] += 1

            # Collect text snippets (first 5 non-trivial ones)
            if q_type in ("short_text", "long_text") and len(val_raw) > 10 and len(qa.text_snippets) < 5:
                qa.text_snippets.append(val_raw[:200])

            # Handle JSON answers for multi-select
            if ans.answer_json and isinstance(ans.answer_json, list):
                for item in ans.answer_json:
                    if isinstance(item, str):
                        answer_values_counter[item] += 1

        qa.top_answers = dict(answer_values_counter.most_common(10))
        results[q_id] = qa

    return results


# ── Capability Engines ────────────────────────────────────────────────────────


def _get_category_questions(
    analysis: Dict[str, QuestionAnalysis], category: str
) -> List[QuestionAnalysis]:
    """Get all QuestionAnalysis objects for a given signal category."""
    return [qa for qa in analysis.values() if category in qa.categories]


def _compute_confidence(question_count: int, total_answers: int) -> str:
    """Compute confidence level based on data volume."""
    if question_count >= 3 and total_answers >= 50:
        return "high"
    elif question_count >= 1 and total_answers >= 20:
        return "medium"
    return "low"


def build_problem_solution(analysis: Dict[str, QuestionAnalysis]) -> CapabilityResult:
    """
    Capability 1: Problem-Solution Story Builder

    Computes pain point validation percentage, severity scores,
    and solution-fit signals from questions tagged as problem_validation.
    """
    questions = _get_category_questions(analysis, "problem_validation")
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    if not questions:
        return CapabilityResult(
            capability_name="problem_solution",
            score=0,
            confidence="low",
            evidence_count=0,
            data_coverage=0.0,
            evidence_statements=[],
            raw_metrics={"tagged_questions": 0, "total_answers": 0},
            limitations=["No survey questions were identified as problem/pain-point validation questions. "
                         "Consider adding questions about customer challenges, frustrations, or pain points."],
        )

    total_answers = sum(q.total_answers for q in questions)
    total_positive = sum(q.positive_count for q in questions)
    total_negative = sum(q.negative_count for q in questions)
    overall_positive_ratio = (total_positive / total_answers * 100) if total_answers > 0 else 0

    # Generate evidence from each question
    for q in questions:
        if q.total_answers == 0:
            continue

        evidence.append(EvidenceStatement(
            category="problem_validation",
            statement=f"{q.positive_ratio:.0f}% of {q.total_answers} respondents validated this pain point",
            data_point=f"{q.positive_ratio:.0f}%",
            source_question=q.question_text,
            sample_size=q.total_answers,
        ))

        if q.average_rating > 0:
            evidence.append(EvidenceStatement(
                category="problem_validation",
                statement=f"Average severity rating: {q.average_rating}/5 across {q.ratings_count} responses",
                data_point=f"{q.average_rating}/5",
                source_question=q.question_text,
                sample_size=q.ratings_count,
            ))

    # Score: weighted average of positive ratios
    avg_ratings = [q.average_rating for q in questions if q.average_rating > 0]
    avg_severity = sum(avg_ratings) / len(avg_ratings) if avg_ratings else 0

    # Score formula: 60% positive ratio + 40% severity (normalized to 100)
    severity_score = (avg_severity / 5) * 100 if avg_severity > 0 else overall_positive_ratio
    score = int(overall_positive_ratio * 0.6 + severity_score * 0.4)
    score = max(0, min(100, score))

    if total_answers < 30:
        limitations.append(f"Only {total_answers} answers analyzed for problem validation — "
                          f"statistical significance improves with more responses.")

    return CapabilityResult(
        capability_name="problem_solution",
        score=score,
        confidence=_compute_confidence(len(questions), total_answers),
        evidence_count=len(evidence),
        data_coverage=min(1.0, len(questions) / 3),  # Ideal: 3+ problem questions
        evidence_statements=evidence,
        raw_metrics={
            "tagged_questions": len(questions),
            "total_answers": total_answers,
            "positive_count": total_positive,
            "negative_count": total_negative,
            "positive_ratio": round(overall_positive_ratio, 1),
            "average_severity": round(avg_severity, 1) if avg_severity > 0 else None,
        },
        limitations=limitations,
    )


def build_market_opportunity(
    analysis: Dict[str, QuestionAnalysis],
    responses: List[SurveyResponse],
) -> CapabilityResult:
    """
    Capability 2: Market Opportunity Framing

    Computes adoption intent %, demographic spread, and demand
    evidence from questions tagged as market_demand.
    """
    questions = _get_category_questions(analysis, "market_demand")
    seg_questions = _get_category_questions(analysis, "customer_segmentation")
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    if not questions:
        return CapabilityResult(
            capability_name="market_opportunity",
            score=0,
            confidence="low",
            evidence_count=0,
            data_coverage=0.0,
            evidence_statements=[],
            raw_metrics={"tagged_questions": 0},
            limitations=["No survey questions were identified as market demand questions. "
                         "Consider adding questions about adoption intent, interest level, or willingness to try."],
        )

    total_answers = sum(q.total_answers for q in questions)
    total_positive = sum(q.positive_count for q in questions)
    adoption_ratio = (total_positive / total_answers * 100) if total_answers > 0 else 0

    for q in questions:
        if q.total_answers == 0:
            continue
        evidence.append(EvidenceStatement(
            category="market_demand",
            statement=f"{q.positive_ratio:.0f}% of {q.total_answers} respondents expressed interest or adoption intent",
            data_point=f"{q.positive_ratio:.0f}%",
            source_question=q.question_text,
            sample_size=q.total_answers,
        ))

    # Demographic spread from responses
    demographic_data: Dict[str, Any] = {}
    cities = Counter(r.city for r in responses if r.city)
    occupations = Counter(r.occupation for r in responses if r.occupation)
    age_ranges = Counter(r.age_range for r in responses if r.age_range)

    if cities:
        demographic_data["cities"] = dict(cities.most_common(5))
        evidence.append(EvidenceStatement(
            category="customer_segmentation",
            statement=f"Respondents from {len(cities)} distinct cities; top: {', '.join(c for c, _ in cities.most_common(3))}",
            data_point=f"{len(cities)} cities",
            source_question="Respondent demographics (city)",
            sample_size=sum(cities.values()),
        ))

    if occupations:
        demographic_data["occupations"] = dict(occupations.most_common(5))
    if age_ranges:
        demographic_data["age_ranges"] = dict(age_ranges.most_common(5))

    # Segmentation from questions
    for q in seg_questions:
        if q.top_answers:
            evidence.append(EvidenceStatement(
                category="customer_segmentation",
                statement=f"Segmentation data: top answers — {', '.join(f'{k} ({v})' for k, v in list(q.top_answers.items())[:3])}",
                data_point=f"{len(q.top_answers)} segments",
                source_question=q.question_text,
                sample_size=q.total_answers,
            ))

    score = int(adoption_ratio)
    score = max(0, min(100, score))

    if not demographic_data and not seg_questions:
        limitations.append("No demographic data available from respondents. "
                          "Respondent city, age range, and occupation fields are empty.")

    return CapabilityResult(
        capability_name="market_opportunity",
        score=score,
        confidence=_compute_confidence(len(questions), total_answers),
        evidence_count=len(evidence),
        data_coverage=min(1.0, (len(questions) + len(seg_questions)) / 4),
        evidence_statements=evidence,
        raw_metrics={
            "tagged_questions": len(questions),
            "segmentation_questions": len(seg_questions),
            "total_answers": total_answers,
            "adoption_intent_ratio": round(adoption_ratio, 1),
            "demographic_spread": demographic_data,
        },
        limitations=limitations,
    )


def build_traction_evidence(
    analysis: Dict[str, QuestionAnalysis],
    total_responses: int,
    completed_responses: int,
) -> CapabilityResult:
    """
    Capability 3: Traction & Validation Evidence Builder

    Computes response volume, completion rate, engagement depth,
    and overall positive validation ratio from ALL survey data.
    """
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    all_questions = list(analysis.values())
    total_answers = sum(q.total_answers for q in all_questions)
    total_positive = sum(q.positive_count for q in all_questions)
    total_negative = sum(q.negative_count for q in all_questions)
    overall_positive_ratio = (total_positive / total_answers * 100) if total_answers > 0 else 0
    completion_rate = (completed_responses / total_responses * 100) if total_responses > 0 else 0

    # Average answers per response (engagement depth)
    avg_answers_per_response = (total_answers / total_responses) if total_responses > 0 else 0
    engagement_depth = min(1.0, avg_answers_per_response / max(len(all_questions), 1))

    # All ratings across the survey
    all_ratings_sum = sum(q.ratings_sum for q in all_questions)
    all_ratings_count = sum(q.ratings_count for q in all_questions)
    overall_avg_rating = round(all_ratings_sum / all_ratings_count, 1) if all_ratings_count > 0 else 0

    evidence.append(EvidenceStatement(
        category="traction",
        statement=f"Survey collected {total_responses} total responses with {completion_rate:.0f}% completion rate",
        data_point=f"{total_responses} responses",
        source_question="Survey response metadata",
        sample_size=total_responses,
    ))

    evidence.append(EvidenceStatement(
        category="traction",
        statement=f"Overall positive validation ratio: {overall_positive_ratio:.0f}% across {total_answers} analyzed answers",
        data_point=f"{overall_positive_ratio:.0f}%",
        source_question="All survey questions (aggregated)",
        sample_size=total_answers,
    ))

    if overall_avg_rating > 0:
        evidence.append(EvidenceStatement(
            category="traction",
            statement=f"Average rating across all rated questions: {overall_avg_rating}/5 from {all_ratings_count} ratings",
            data_point=f"{overall_avg_rating}/5",
            source_question="All rating/scale questions (aggregated)",
            sample_size=all_ratings_count,
        ))

    evidence.append(EvidenceStatement(
        category="traction",
        statement=f"Engagement depth: {engagement_depth:.0%} — respondents answered {avg_answers_per_response:.1f} of {len(all_questions)} questions on average",
        data_point=f"{engagement_depth:.0%}",
        source_question="Response completion analysis",
        sample_size=total_responses,
    ))

    # Score: weighted combination of volume, positive ratio, engagement
    volume_score = min(100, total_responses * 2)  # 50 responses = 100
    score = int(
        overall_positive_ratio * 0.40
        + volume_score * 0.30
        + completion_rate * 0.15
        + engagement_depth * 100 * 0.15
    )
    score = max(0, min(100, score))

    if total_responses < 100:
        limitations.append(f"Only {total_responses} responses collected. "
                          f"Larger sample sizes (100+) increase statistical confidence.")

    return CapabilityResult(
        capability_name="traction_evidence",
        score=score,
        confidence=_compute_confidence(len(all_questions), total_answers),
        evidence_count=len(evidence),
        data_coverage=1.0,  # Traction uses all data
        evidence_statements=evidence,
        raw_metrics={
            "total_responses": total_responses,
            "completed_responses": completed_responses,
            "completion_rate": round(completion_rate, 1),
            "total_answers_analyzed": total_answers,
            "positive_count": total_positive,
            "negative_count": total_negative,
            "positive_validation_ratio": round(overall_positive_ratio, 1),
            "average_rating": overall_avg_rating,
            "engagement_depth": round(engagement_depth, 2),
            "questions_count": len(all_questions),
        },
        limitations=limitations,
    )


def build_competitive_advantage(analysis: Dict[str, QuestionAnalysis]) -> CapabilityResult:
    """
    Capability 4: Competitive Advantage Framing

    Computes alternative usage rates, dissatisfaction signals,
    and switching intent from questions tagged as competitive_positioning.
    """
    questions = _get_category_questions(analysis, "competitive_positioning")
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    if not questions:
        return CapabilityResult(
            capability_name="competitive_advantage",
            score=0,
            confidence="low",
            evidence_count=0,
            data_coverage=0.0,
            evidence_statements=[],
            raw_metrics={"tagged_questions": 0},
            limitations=["No survey questions about competitors or alternatives were identified. "
                         "Consider adding questions about current solutions, competitor usage, or switching intent."],
        )

    total_answers = sum(q.total_answers for q in questions)
    total_negative_about_alternatives = sum(q.negative_count for q in questions)
    dissatisfaction_ratio = (total_negative_about_alternatives / total_answers * 100) if total_answers > 0 else 0

    for q in questions:
        if q.total_answers == 0:
            continue

        # For competitive questions, "negative" about alternatives = positive for us
        if q.top_answers:
            evidence.append(EvidenceStatement(
                category="competitive_positioning",
                statement=f"Top responses: {', '.join(f'{k} ({v})' for k, v in list(q.top_answers.items())[:3])}",
                data_point=f"{len(q.top_answers)} alternatives identified",
                source_question=q.question_text,
                sample_size=q.total_answers,
            ))

        if q.text_snippets:
            for snippet in q.text_snippets[:2]:
                evidence.append(EvidenceStatement(
                    category="competitive_positioning",
                    statement=f"Respondent quote: \"{snippet[:150]}\"",
                    data_point="qualitative",
                    source_question=q.question_text,
                    sample_size=1,
                ))

        evidence.append(EvidenceStatement(
            category="competitive_positioning",
            statement=f"{q.negative_ratio:.0f}% of {q.total_answers} respondents expressed dissatisfaction with current alternatives",
            data_point=f"{q.negative_ratio:.0f}%",
            source_question=q.question_text,
            sample_size=q.total_answers,
        ))

    # Score: higher dissatisfaction with alternatives = higher competitive opportunity
    # Also factor in the variety of alternatives mentioned (more = bigger market)
    all_alternatives = set()
    for q in questions:
        all_alternatives.update(q.top_answers.keys())

    score = int(dissatisfaction_ratio * 0.6 + min(100, len(all_alternatives) * 15) * 0.4)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="competitive_advantage",
        score=score,
        confidence=_compute_confidence(len(questions), total_answers),
        evidence_count=len(evidence),
        data_coverage=min(1.0, len(questions) / 2),
        evidence_statements=evidence,
        raw_metrics={
            "tagged_questions": len(questions),
            "total_answers": total_answers,
            "dissatisfaction_ratio": round(dissatisfaction_ratio, 1),
            "alternatives_identified": len(all_alternatives),
            "top_alternatives": dict(Counter({k: v for q in questions for k, v in q.top_answers.items()}).most_common(5)),
        },
        limitations=limitations,
    )


def build_objection_intelligence(analysis: Dict[str, QuestionAnalysis]) -> CapabilityResult:
    """
    Capability 5: Investor Objection Intelligence

    Identifies negative signals, low ratings, concern themes,
    and adoption barriers across ALL survey questions.
    """
    risk_questions = _get_category_questions(analysis, "risk_signal")
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Collect negative signals from ALL questions, not just risk-tagged ones
    all_questions = list(analysis.values())
    total_answers = sum(q.total_answers for q in all_questions)
    total_negative = sum(q.negative_count for q in all_questions)
    overall_negative_ratio = (total_negative / total_answers * 100) if total_answers > 0 else 0

    # Identify questions with highest negative ratios (potential objection themes)
    objection_themes: List[Dict[str, Any]] = []
    for q in sorted(all_questions, key=lambda x: x.negative_ratio, reverse=True):
        if q.negative_ratio > 20 and q.total_answers >= 5:
            theme = {
                "question": q.question_text,
                "negative_ratio": round(q.negative_ratio, 1),
                "negative_count": q.negative_count,
                "sample_size": q.total_answers,
            }
            objection_themes.append(theme)
            evidence.append(EvidenceStatement(
                category="risk_signal",
                statement=f"{q.negative_ratio:.0f}% negative response rate — potential investor concern area",
                data_point=f"{q.negative_ratio:.0f}% negative",
                source_question=q.question_text,
                sample_size=q.total_answers,
            ))

    # Evidence from risk-specific questions
    for q in risk_questions:
        if q.total_answers > 0 and q.text_snippets:
            for snippet in q.text_snippets[:2]:
                evidence.append(EvidenceStatement(
                    category="risk_signal",
                    statement=f"Concern expressed: \"{snippet[:150]}\"",
                    data_point="qualitative",
                    source_question=q.question_text,
                    sample_size=1,
                ))

    # Low-rated questions
    low_rated_questions = [q for q in all_questions if q.average_rating > 0 and q.average_rating < 3.0]
    for q in low_rated_questions:
        evidence.append(EvidenceStatement(
            category="risk_signal",
            statement=f"Low average rating of {q.average_rating}/5 — indicates weak area",
            data_point=f"{q.average_rating}/5",
            source_question=q.question_text,
            sample_size=q.ratings_count,
        ))

    evidence.append(EvidenceStatement(
        category="risk_signal",
        statement=f"Overall negative response ratio: {overall_negative_ratio:.0f}% across {total_answers} answers",
        data_point=f"{overall_negative_ratio:.0f}%",
        source_question="All survey questions (aggregated)",
        sample_size=total_answers,
    ))

    # Risk score: higher negative ratio = higher risk (inverted for readiness)
    risk_score = int(overall_negative_ratio)
    # Readiness score = inverse of risk
    readiness_score = max(0, min(100, 100 - risk_score))

    if not risk_questions:
        limitations.append("No survey questions specifically about concerns or barriers were identified. "
                          "Risk assessment is based on negative responses across all questions.")

    if not objection_themes:
        limitations.append("No significant objection themes detected (all questions have <20% negative response rates).")

    return CapabilityResult(
        capability_name="objection_intelligence",
        score=readiness_score,
        confidence=_compute_confidence(len(all_questions), total_answers),
        evidence_count=len(evidence),
        data_coverage=min(1.0, len(risk_questions) / 2) if risk_questions else 0.5,
        evidence_statements=evidence,
        raw_metrics={
            "risk_tagged_questions": len(risk_questions),
            "total_answers_analyzed": total_answers,
            "total_negative_signals": total_negative,
            "overall_negative_ratio": round(overall_negative_ratio, 1),
            "objection_themes_count": len(objection_themes),
            "objection_themes": objection_themes[:5],
            "low_rated_questions_count": len(low_rated_questions),
        },
        limitations=limitations,
    )


def build_evidence_mapping(capabilities: List[CapabilityResult]) -> CapabilityResult:
    """
    Capability 6: Investor Evidence Mapping

    Cross-references all evidence from other capabilities to produce
    a unified evidence package with traceability and confidence levels.
    """
    all_evidence: List[EvidenceStatement] = []
    category_coverage: Dict[str, bool] = {}
    total_evidence = 0
    limitations: List[str] = []

    for cap in capabilities:
        all_evidence.extend(cap.evidence_statements)
        total_evidence += cap.evidence_count
        category_coverage[cap.capability_name] = cap.data_coverage > 0

    # Data coverage: what % of capabilities have evidence
    covered = sum(1 for v in category_coverage.values() if v)
    coverage_ratio = covered / max(len(category_coverage), 1)

    # Confidence based on breadth and depth
    if coverage_ratio >= 0.8 and total_evidence >= 15:
        confidence = "high"
    elif coverage_ratio >= 0.5 and total_evidence >= 8:
        confidence = "medium"
    else:
        confidence = "low"

    # Score: weighted by coverage and evidence density
    score = int(coverage_ratio * 60 + min(40, total_evidence * 2))
    score = max(0, min(100, score))

    # Identify gaps
    uncovered = [k for k, v in category_coverage.items() if not v]
    if uncovered:
        limitations.append(f"Missing evidence for capabilities: {', '.join(uncovered)}")

    # Create summary evidence statements
    summary_evidence = [
        EvidenceStatement(
            category="evidence_mapping",
            statement=f"Total evidence statements collected: {total_evidence} across {covered}/{len(category_coverage)} capabilities",
            data_point=f"{total_evidence} evidence points",
            source_question="Cross-capability analysis",
            sample_size=total_evidence,
        ),
        EvidenceStatement(
            category="evidence_mapping",
            statement=f"Data coverage: {coverage_ratio:.0%} of capability areas have supporting survey evidence",
            data_point=f"{coverage_ratio:.0%}",
            source_question="Capability coverage analysis",
            sample_size=len(category_coverage),
        ),
    ]

    return CapabilityResult(
        capability_name="evidence_mapping",
        score=score,
        confidence=confidence,
        evidence_count=total_evidence,
        data_coverage=coverage_ratio,
        evidence_statements=summary_evidence,
        raw_metrics={
            "total_evidence_statements": total_evidence,
            "capability_coverage": category_coverage,
            "coverage_ratio": round(coverage_ratio, 2),
            "uncovered_capabilities": uncovered,
        },
        limitations=limitations,
    )


def build_question_simulation(capabilities: List[CapabilityResult]) -> CapabilityResult:
    """
    Capability 7: Investor Question Simulation Engine

    Predicts likely investor questions based on data patterns,
    gaps, and weak areas identified across all capabilities.
    """
    predicted_questions: List[Dict[str, str]] = []
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Map capabilities by name for easy access
    cap_map = {c.capability_name: c for c in capabilities}

    # Generate questions based on data patterns

    # 1. Low-score capabilities → investors will probe these
    for cap in capabilities:
        if cap.score < 50 and cap.capability_name != "evidence_mapping":
            predicted_questions.append({
                "question": f"Your {cap.capability_name.replace('_', ' ')} score is {cap.score}/100. "
                           f"What specific evidence do you have to address this gap?",
                "category": cap.capability_name,
                "evidence_answer": "; ".join(
                    e.statement for e in cap.evidence_statements[:2]
                ) if cap.evidence_statements else "Insufficient evidence — this is a gap to address.",
                "severity": "high",
            })

    # 2. Problem validation → "Is this a real problem?"
    ps = cap_map.get("problem_solution")
    if ps:
        metrics = ps.raw_metrics
        ratio = metrics.get("positive_ratio", 0)
        predicted_questions.append({
            "question": "How do you know customers actually have this problem?",
            "category": "problem_validation",
            "evidence_answer": f"Survey data shows {ratio}% positive validation across "
                             f"{metrics.get('total_answers', 0)} responses to problem-related questions.",
            "severity": "medium" if ratio >= 60 else "high",
        })

    # 3. Market demand → "Is there real demand?"
    mo = cap_map.get("market_opportunity")
    if mo:
        metrics = mo.raw_metrics
        ratio = metrics.get("adoption_intent_ratio", 0)
        predicted_questions.append({
            "question": "What evidence do you have of genuine market demand?",
            "category": "market_demand",
            "evidence_answer": f"Survey data shows {ratio}% adoption intent across "
                             f"{metrics.get('total_answers', 0)} responses.",
            "severity": "medium" if ratio >= 60 else "high",
        })

    # 4. Competitive landscape → "Why won't incumbents crush you?"
    ca = cap_map.get("competitive_advantage")
    if ca:
        metrics = ca.raw_metrics
        predicted_questions.append({
            "question": "What is your competitive moat? Why can't existing players replicate your solution?",
            "category": "competitive_positioning",
            "evidence_answer": f"{metrics.get('dissatisfaction_ratio', 0)}% dissatisfaction with current alternatives. "
                             f"{metrics.get('alternatives_identified', 0)} competitors identified in survey responses.",
            "severity": "medium",
        })

    # 5. Objections → "What are the biggest risks?"
    oi = cap_map.get("objection_intelligence")
    if oi:
        metrics = oi.raw_metrics
        themes = metrics.get("objection_themes", [])
        if themes:
            top_theme = themes[0]
            predicted_questions.append({
                "question": f"Respondents flagged concerns about: '{top_theme.get('question', 'N/A')}'. "
                           f"How will you address this?",
                "category": "risk_signal",
                "evidence_answer": f"{top_theme.get('negative_ratio', 0)}% negative response rate "
                                 f"from {top_theme.get('sample_size', 0)} respondents.",
                "severity": "high" if top_theme.get("negative_ratio", 0) > 40 else "medium",
            })

    # 6. Traction → "Do you have enough validation?"
    te = cap_map.get("traction_evidence")
    if te:
        metrics = te.raw_metrics
        predicted_questions.append({
            "question": "How statistically significant is your survey validation?",
            "category": "traction",
            "evidence_answer": f"{metrics.get('total_responses', 0)} total responses, "
                             f"{metrics.get('completion_rate', 0)}% completion rate, "
                             f"{metrics.get('positive_validation_ratio', 0)}% positive validation.",
            "severity": "low" if metrics.get("total_responses", 0) >= 100 else "medium",
        })

    # 7. Data gaps
    for cap in capabilities:
        if cap.limitations:
            for limitation in cap.limitations:
                predicted_questions.append({
                    "question": f"[Data Gap] {limitation}",
                    "category": cap.capability_name,
                    "evidence_answer": "This is an identified data gap. Consider addressing this before investor meetings.",
                    "severity": "medium",
                })

    evidence.append(EvidenceStatement(
        category="question_simulation",
        statement=f"Generated {len(predicted_questions)} predicted investor questions based on survey data patterns",
        data_point=f"{len(predicted_questions)} questions",
        source_question="Cross-capability gap analysis",
        sample_size=len(capabilities),
    ))

    # Score: inversely related to number of high-severity questions
    high_severity = sum(1 for q in predicted_questions if q.get("severity") == "high")
    score = max(0, min(100, 100 - high_severity * 15))

    return CapabilityResult(
        capability_name="question_simulation",
        score=score,
        confidence="high" if len(predicted_questions) >= 5 else "medium",
        evidence_count=len(evidence),
        data_coverage=1.0,
        evidence_statements=evidence,
        raw_metrics={
            "predicted_questions": predicted_questions,
            "total_questions": len(predicted_questions),
            "high_severity_count": high_severity,
        },
        limitations=limitations,
    )


# ── Hybrid Helper Functions ───────────────────────────────────────────────────


def _get_category_questions(
    analysis: Dict[str, "QuestionAnalysis"],
    category: str,
) -> List["QuestionAnalysis"]:
    """Return all QuestionAnalysis objects that were classified into the given category."""
    return [qa for qa in analysis.values() if category in qa.categories]


def _compute_confidence(question_count: int, evidence_count: int) -> str:
    """Compute confidence level from the number of questions and evidence items."""
    if question_count >= 5 and evidence_count >= 8:
        return "high"
    elif question_count >= 2 and evidence_count >= 3:
        return "medium"
    return "low"


# ── Hybrid Capability Engines (Survey + Founder Context) ─────────────────────


def build_investor_readiness_analysis(
    survey_caps: List[CapabilityResult],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.2: Investor Readiness Analysis — composite readiness score with funding gaps."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Aggregate all survey capability scores
    cap_scores = {c.capability_name: c.score for c in survey_caps}
    avg_survey_score = int(sum(cap_scores.values()) / max(len(cap_scores), 1))

    evidence.append(EvidenceStatement(
        category="readiness_analysis",
        statement=f"Average survey capability score: {avg_survey_score}/100 across {len(cap_scores)} capabilities",
        data_point=f"{avg_survey_score}/100",
        source_question="All survey capabilities (aggregated)",
        sample_size=len(cap_scores),
    ))

    # Founder context completeness
    context_score = min(100, founder.filled_optional_count * 14 + 30)  # 30 base (5 required) + 14 per optional
    evidence.append(EvidenceStatement(
        category="readiness_analysis",
        statement=f"Founder context completeness: {founder.filled_optional_count}/7 optional fields provided",
        data_point=f"{founder.filled_optional_count}/7",
        source_question="Initialization form fields",
        sample_size=1,
    ))

    # Funding gaps
    funding_gaps = []
    weak_caps = [c for c in survey_caps if c.score < 50]
    for c in weak_caps:
        funding_gaps.append(f"{c.capability_name.replace('_', ' ').title()}: score {c.score}/100")

    if not founder.has_funding_info:
        limitations.append("No funding stage or target provided — cannot assess capital readiness.")
    if not founder.has_team_info:
        limitations.append("No team size provided — cannot assess execution capacity.")

    score = int(avg_survey_score * 0.7 + context_score * 0.3)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="investor_readiness_analysis",
        score=score,
        confidence=_compute_confidence(len(survey_caps), sum(c.evidence_count for c in survey_caps)),
        evidence_count=len(evidence),
        data_coverage=min(1.0, (len(cap_scores) + founder.filled_optional_count) / 14),
        evidence_statements=evidence,
        raw_metrics={
            "avg_survey_score": avg_survey_score,
            "context_completeness": founder.filled_optional_count,
            "funding_gaps": funding_gaps,
            "weak_capabilities": [c.capability_name for c in weak_caps],
        },
        limitations=limitations,
    )


def build_pitch_readiness_gate(
    survey_caps: List[CapabilityResult],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.3: Pitch Readiness Gate — pass/fail with improvement actions."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    cap_scores = {c.capability_name: c.score for c in survey_caps}

    # Gate criteria
    gates = {
        "problem_solution": {"min": 50, "label": "Problem Validation"},
        "traction_evidence": {"min": 50, "label": "Traction Evidence"},
        "market_opportunity": {"min": 40, "label": "Market Demand"},
    }

    passed_gates = 0
    total_gates = len(gates)
    improvement_actions = []

    for cap_name, criteria in gates.items():
        score = cap_scores.get(cap_name, 0)
        passed = score >= criteria["min"]
        if passed:
            passed_gates += 1
        else:
            improvement_actions.append(
                f"{criteria['label']}: Score {score}/100 (need ≥{criteria['min']}). "
                f"Add more survey questions targeting this area."
            )
        evidence.append(EvidenceStatement(
            category="pitch_gate",
            statement=f"{criteria['label']} gate: {'PASS' if passed else 'FAIL'} ({score}/{criteria['min']})",
            data_point=f"{'PASS' if passed else 'FAIL'}",
            source_question=f"{cap_name} capability score",
            sample_size=1,
        ))

    # Context gate
    context_ready = founder.filled_optional_count >= 3
    if not context_ready:
        improvement_actions.append(
            f"Founder context: Only {founder.filled_optional_count}/7 optional fields filled. "
            f"Provide funding stage, team size, and industry for stronger positioning."
        )

    gate_passed = passed_gates == total_gates
    score = int((passed_gates / total_gates) * 100)

    return CapabilityResult(
        capability_name="pitch_readiness_gate",
        score=score,
        confidence="high",
        evidence_count=len(evidence),
        data_coverage=1.0,
        evidence_statements=evidence,
        raw_metrics={
            "gate_result": "PASS" if gate_passed else "FAIL",
            "gates_passed": passed_gates,
            "total_gates": total_gates,
            "improvement_actions": improvement_actions,
            "context_ready": context_ready,
        },
        limitations=limitations,
    )


def build_narrative_intelligence(
    analysis: Dict[str, QuestionAnalysis],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.5: Narrative Intelligence Engine — structured narrative inputs."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Extract mission/vision keywords from startup_context
    context_words = len(founder.startup_context.split())
    evidence.append(EvidenceStatement(
        category="narrative",
        statement=f"Founder context provided: {context_words} words describing startup mission and vision",
        data_point=f"{context_words} words",
        source_question="startup_context field",
        sample_size=1,
    ))

    # Problem evidence from survey
    problem_qs = _get_category_questions(analysis, "problem_validation")
    if problem_qs:
        total_pos = sum(q.positive_count for q in problem_qs)
        total_ans = sum(q.total_answers for q in problem_qs)
        if total_ans > 0:
            ratio = total_pos / total_ans * 100
            evidence.append(EvidenceStatement(
                category="narrative",
                statement=f"Problem validation backing: {ratio:.0f}% positive across {total_ans} responses",
                data_point=f"{ratio:.0f}%",
                source_question="Problem validation questions (aggregated)",
                sample_size=total_ans,
            ))

    # Text snippets for narrative color
    all_snippets = []
    for qa in analysis.values():
        all_snippets.extend(qa.text_snippets[:2])
    if all_snippets:
        evidence.append(EvidenceStatement(
            category="narrative",
            statement=f"Collected {len(all_snippets)} qualitative quotes from respondents for narrative support",
            data_point=f"{len(all_snippets)} quotes",
            source_question="Open-text survey responses",
            sample_size=len(all_snippets),
        ))

    if context_words < 20:
        limitations.append("Startup context is very brief — provide a longer description for richer narratives.")

    score = min(100, context_words * 2 + len(all_snippets) * 5 + (30 if problem_qs else 0))
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="narrative_intelligence",
        score=score,
        confidence="high" if context_words >= 30 and problem_qs else "medium",
        evidence_count=len(evidence),
        data_coverage=min(1.0, (1 + len(problem_qs) + min(len(all_snippets), 3)) / 5),
        evidence_statements=evidence,
        raw_metrics={
            "context_word_count": context_words,
            "problem_questions_count": len(problem_qs),
            "qualitative_quotes": len(all_snippets),
            "sample_quotes": all_snippets[:5],
        },
        limitations=limitations,
    )


def build_executive_summary(
    analysis: Dict[str, QuestionAnalysis],
    survey_caps: List[CapabilityResult],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.7: Executive Summary Generator — structured summary inputs."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    cap_scores = {c.capability_name: c.score for c in survey_caps}
    all_answers = sum(q.total_answers for q in analysis.values())
    all_positive = sum(q.positive_count for q in analysis.values())
    overall_ratio = (all_positive / all_answers * 100) if all_answers > 0 else 0

    evidence.append(EvidenceStatement(
        category="executive_summary",
        statement=f"Venture overview: {founder.startup_context[:150]}",
        data_point="founder_context",
        source_question="startup_context field",
        sample_size=1,
    ))
    evidence.append(EvidenceStatement(
        category="executive_summary",
        statement=f"Overall survey validation: {overall_ratio:.0f}% positive across {all_answers} data points",
        data_point=f"{overall_ratio:.0f}%",
        source_question="All survey questions",
        sample_size=all_answers,
    ))

    # Key strengths (scores >= 65) and weaknesses (< 50)
    strengths = [n for n, s in cap_scores.items() if s >= 65]
    weaknesses = [n for n, s in cap_scores.items() if s < 50]

    if founder.industry_vertical:
        evidence.append(EvidenceStatement(
            category="executive_summary",
            statement=f"Industry vertical: {founder.industry_vertical}",
            data_point=founder.industry_vertical,
            source_question="industry_vertical field",
            sample_size=1,
        ))

    score = int(overall_ratio * 0.5 + min(100, len(strengths) * 20) * 0.3 + 20)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="executive_summary",
        score=score,
        confidence="high" if all_answers >= 50 else "medium",
        evidence_count=len(evidence),
        data_coverage=1.0,
        evidence_statements=evidence,
        raw_metrics={
            "overall_positive_ratio": round(overall_ratio, 1),
            "total_data_points": all_answers,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "industry": founder.industry_vertical,
            "geography": f"{founder.target_country}, {founder.target_state}",
        },
        limitations=limitations,
    )


def build_tam_sam_som(
    analysis: Dict[str, QuestionAnalysis],
    responses: List[SurveyResponse],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.9: TAM/SAM/SOM Intelligence — market sizing with evidence."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    seg_qs = _get_category_questions(analysis, "customer_segmentation")
    demand_qs = _get_category_questions(analysis, "market_demand")

    # Demographics from responses
    cities = Counter(r.city for r in responses if r.city)
    occupations = Counter(r.occupation for r in responses if r.occupation)
    age_ranges = Counter(r.age_range for r in responses if r.age_range)

    segments_identified = len(cities) + len(occupations) + len(age_ranges)

    if cities:
        evidence.append(EvidenceStatement(
            category="tam_sam_som",
            statement=f"Geographic reach: {len(cities)} cities represented in survey respondents",
            data_point=f"{len(cities)} cities",
            source_question="Respondent demographics",
            sample_size=sum(cities.values()),
        ))
    if occupations:
        evidence.append(EvidenceStatement(
            category="tam_sam_som",
            statement=f"Occupational spread: {len(occupations)} distinct occupations — top: {', '.join(o for o, _ in occupations.most_common(3))}",
            data_point=f"{len(occupations)} occupations",
            source_question="Respondent demographics",
            sample_size=sum(occupations.values()),
        ))

    # Adoption intent for SOM calculation
    if demand_qs:
        total_pos = sum(q.positive_count for q in demand_qs)
        total_ans = sum(q.total_answers for q in demand_qs)
        if total_ans > 0:
            adoption_pct = total_pos / total_ans * 100
            evidence.append(EvidenceStatement(
                category="tam_sam_som",
                statement=f"Adoption intent: {adoption_pct:.0f}% of surveyed respondents — basis for SOM estimation",
                data_point=f"{adoption_pct:.0f}%",
                source_question="Market demand questions",
                sample_size=total_ans,
            ))

    evidence.append(EvidenceStatement(
        category="tam_sam_som",
        statement=f"Geography: {founder.target_country}, {founder.target_state}, {founder.target_district}",
        data_point="geography",
        source_question="Founder initialization fields",
        sample_size=1,
    ))

    if not cities and not occupations:
        limitations.append("No demographic data from respondents — TAM/SAM cannot be segmented by audience profile.")
    if not demand_qs:
        limitations.append("No market demand questions in survey — SOM cannot be estimated from adoption intent.")

    score = min(100, segments_identified * 10 + len(demand_qs) * 15 + 10)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="tam_sam_som",
        score=score,
        confidence=_compute_confidence(len(seg_qs) + len(demand_qs), segments_identified + len(demand_qs)),
        evidence_count=len(evidence),
        data_coverage=min(1.0, (segments_identified + len(demand_qs)) / 6),
        evidence_statements=evidence,
        raw_metrics={
            "segments_identified": segments_identified,
            "cities_count": len(cities),
            "occupations_count": len(occupations),
            "age_ranges_count": len(age_ranges),
            "top_cities": dict(cities.most_common(5)),
            "top_occupations": dict(occupations.most_common(5)),
            "geography": f"{founder.target_country}, {founder.target_state}",
        },
        limitations=limitations,
    )


def build_business_model(
    analysis: Dict[str, QuestionAnalysis],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.10: Business Model & Revenue Slide — revenue model data."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    wtp_qs = _get_category_questions(analysis, "willingness_to_pay")
    price = _parse_price_from_text(founder.pricing_model)

    evidence.append(EvidenceStatement(
        category="business_model",
        statement=f"Pricing model: {founder.pricing_model}",
        data_point=f"{founder.currency_symbol}{price:.0f}" if price else "unparseable",
        source_question="pricing_model field",
        sample_size=1,
    ))

    if wtp_qs:
        total_pos = sum(q.positive_count for q in wtp_qs)
        total_ans = sum(q.total_answers for q in wtp_qs)
        if total_ans > 0:
            wtp_ratio = total_pos / total_ans * 100
            evidence.append(EvidenceStatement(
                category="business_model",
                statement=f"{wtp_ratio:.0f}% of {total_ans} respondents showed positive willingness-to-pay signals",
                data_point=f"{wtp_ratio:.0f}%",
                source_question="Willingness-to-pay questions",
                sample_size=total_ans,
            ))
        # Price preference from answers
        for q in wtp_qs:
            if q.top_answers:
                evidence.append(EvidenceStatement(
                    category="business_model",
                    statement=f"Price preferences: {', '.join(f'{k} ({v})' for k, v in list(q.top_answers.items())[:3])}",
                    data_point="price_preferences",
                    source_question=q.question_text,
                    sample_size=q.total_answers,
                ))
    else:
        limitations.append("No willingness-to-pay questions in survey — revenue assumptions cannot be validated.")

    if not price:
        limitations.append("Could not extract numeric price from pricing model text — provide a clearer format (e.g. '₹2,999/month').")

    score = min(100, (30 if price else 0) + len(wtp_qs) * 20 + 10)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="business_model",
        score=score,
        confidence="high" if price and wtp_qs else "low" if not price and not wtp_qs else "medium",
        evidence_count=len(evidence),
        data_coverage=min(1.0, (1 + len(wtp_qs)) / 3),
        evidence_statements=evidence,
        raw_metrics={
            "parsed_price": price,
            "pricing_model_text": founder.pricing_model,
            "wtp_questions_count": len(wtp_qs),
            "currency": founder.currency_code,
        },
        limitations=limitations,
    )


def build_financial_projections(
    analysis: Dict[str, QuestionAnalysis],
    total_responses: int,
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.11: Financial Projection Builder — evidence-grounded projection inputs."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    price = _parse_price_from_text(founder.pricing_model)
    wtp_qs = _get_category_questions(analysis, "willingness_to_pay")
    demand_qs = _get_category_questions(analysis, "market_demand")

    # Adoption rate from demand questions
    adoption_rate = 0.0
    if demand_qs:
        total_pos = sum(q.positive_count for q in demand_qs)
        total_ans = sum(q.total_answers for q in demand_qs)
        if total_ans > 0:
            adoption_rate = total_pos / total_ans

    if price:
        evidence.append(EvidenceStatement(
            category="financial_projections",
            statement=f"Base price point: {founder.currency_symbol}{price:.0f}/unit from pricing model",
            data_point=f"{founder.currency_symbol}{price:.0f}",
            source_question="pricing_model field",
            sample_size=1,
        ))
    if adoption_rate > 0:
        evidence.append(EvidenceStatement(
            category="financial_projections",
            statement=f"Survey-validated adoption rate: {adoption_rate*100:.0f}% — usable for revenue projections",
            data_point=f"{adoption_rate*100:.0f}%",
            source_question="Market demand questions",
            sample_size=sum(q.total_answers for q in demand_qs),
        ))

    if founder.monthly_revenue:
        evidence.append(EvidenceStatement(
            category="financial_projections",
            statement=f"Current monthly revenue: {founder.monthly_revenue}",
            data_point=founder.monthly_revenue,
            source_question="monthly_revenue field",
            sample_size=1,
        ))
    else:
        limitations.append("No current revenue data provided — projections start from zero.")

    if founder.team_size:
        evidence.append(EvidenceStatement(
            category="financial_projections",
            statement=f"Current team size: {founder.team_size} — basis for cost projections",
            data_point=f"{founder.team_size}",
            source_question="team_size field",
            sample_size=1,
        ))
    else:
        limitations.append("No team size provided — hiring cost projections will be generic.")

    if not price:
        limitations.append("Cannot extract price from pricing model — revenue projections require a clear price point.")

    data_points = sum([bool(price), adoption_rate > 0, bool(founder.monthly_revenue), bool(founder.team_size)])
    score = min(100, data_points * 25)

    return CapabilityResult(
        capability_name="financial_projections",
        score=score,
        confidence="high" if data_points >= 3 else "medium" if data_points >= 2 else "low",
        evidence_count=len(evidence),
        data_coverage=min(1.0, data_points / 4),
        evidence_statements=evidence,
        raw_metrics={
            "parsed_price": price,
            "adoption_rate": round(adoption_rate, 2),
            "monthly_revenue": founder.monthly_revenue,
            "team_size": founder.team_size,
            "currency": founder.currency_code,
        },
        limitations=limitations,
    )


def build_unit_economics(
    analysis: Dict[str, QuestionAnalysis],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.12: Unit Economics Intelligence — CAC/LTV/margins framework."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    price = _parse_price_from_text(founder.pricing_model)
    pmf_qs = _get_category_questions(analysis, "product_market_fit")
    wtp_qs = _get_category_questions(analysis, "willingness_to_pay")

    # Retention proxy from PMF scores
    retention_signal = 0.0
    if pmf_qs:
        total_pos = sum(q.positive_count for q in pmf_qs)
        total_ans = sum(q.total_answers for q in pmf_qs)
        if total_ans > 0:
            retention_signal = total_pos / total_ans
            evidence.append(EvidenceStatement(
                category="unit_economics",
                statement=f"Retention proxy: {retention_signal*100:.0f}% satisfaction — indicator of customer retention",
                data_point=f"{retention_signal*100:.0f}%",
                source_question="Product-market fit questions",
                sample_size=total_ans,
            ))

    if price:
        # Monthly revenue per user
        evidence.append(EvidenceStatement(
            category="unit_economics",
            statement=f"Revenue per user: {founder.currency_symbol}{price:.0f}/month from pricing model",
            data_point=f"{founder.currency_symbol}{price:.0f}",
            source_question="pricing_model field",
            sample_size=1,
        ))
        # Estimated LTV (price * 12 months * retention)
        est_months = max(6, int(retention_signal * 24)) if retention_signal > 0 else 0
        if est_months > 0:
            est_ltv = price * est_months
            evidence.append(EvidenceStatement(
                category="unit_economics",
                statement=f"Estimated LTV: {founder.currency_symbol}{est_ltv:.0f} (price × {est_months} months retention estimate)",
                data_point=f"{founder.currency_symbol}{est_ltv:.0f}",
                source_question="Derived from pricing + retention proxy",
                sample_size=1,
            ))
    else:
        limitations.append("Cannot compute unit economics without a parseable price point.")

    if not pmf_qs:
        limitations.append("No product-market fit questions — retention and LTV estimates are not possible.")

    data_points = sum([bool(price), retention_signal > 0, bool(wtp_qs)])
    score = min(100, data_points * 30 + 10)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="unit_economics",
        score=score,
        confidence="medium" if data_points >= 2 else "low",
        evidence_count=len(evidence),
        data_coverage=min(1.0, data_points / 3),
        evidence_statements=evidence,
        raw_metrics={
            "parsed_price": price,
            "retention_signal": round(retention_signal, 2),
            "wtp_questions": len(wtp_qs),
            "pmf_questions": len(pmf_qs),
            "currency": founder.currency_code,
        },
        limitations=limitations,
    )


def build_gtm_strategy(
    analysis: Dict[str, QuestionAnalysis],
    responses: List[SurveyResponse],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.15: GTM & Growth Strategy Builder."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    seg_qs = _get_category_questions(analysis, "customer_segmentation")
    demand_qs = _get_category_questions(analysis, "market_demand")

    # Audience insights
    cities = Counter(r.city for r in responses if r.city)
    occupations = Counter(r.occupation for r in responses if r.occupation)

    if cities:
        top_city = cities.most_common(1)[0]
        evidence.append(EvidenceStatement(
            category="gtm_strategy",
            statement=f"Top geographic market: {top_city[0]} ({top_city[1]} respondents) — potential launch city",
            data_point=top_city[0],
            source_question="Respondent demographics",
            sample_size=top_city[1],
        ))
    if occupations:
        top_occ = occupations.most_common(1)[0]
        evidence.append(EvidenceStatement(
            category="gtm_strategy",
            statement=f"Primary audience segment: {top_occ[0]} ({top_occ[1]} respondents) — target for initial GTM",
            data_point=top_occ[0],
            source_question="Respondent demographics",
            sample_size=top_occ[1],
        ))

    # Adoption channel signals from demand questions
    if demand_qs:
        total_pos = sum(q.positive_count for q in demand_qs)
        total_ans = sum(q.total_answers for q in demand_qs)
        if total_ans > 0:
            evidence.append(EvidenceStatement(
                category="gtm_strategy",
                statement=f"Demand signal: {total_pos}/{total_ans} respondents showed adoption intent — {total_pos/total_ans*100:.0f}% conversion potential",
                data_point=f"{total_pos/total_ans*100:.0f}%",
                source_question="Market demand questions",
                sample_size=total_ans,
            ))

    evidence.append(EvidenceStatement(
        category="gtm_strategy",
        statement=f"Target geography: {founder.target_country}, {founder.target_state}, {founder.target_district}",
        data_point="geography",
        source_question="Initialization fields",
        sample_size=1,
    ))

    if not cities and not occupations:
        limitations.append("No demographic data from respondents — GTM audience targeting is limited.")

    data_points = sum([bool(cities), bool(occupations), bool(demand_qs)])
    score = min(100, data_points * 25 + 25)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="gtm_strategy",
        score=score,
        confidence=_compute_confidence(len(seg_qs) + len(demand_qs), len(cities) + len(occupations)),
        evidence_count=len(evidence),
        data_coverage=min(1.0, data_points / 3),
        evidence_statements=evidence,
        raw_metrics={
            "top_cities": dict(cities.most_common(5)),
            "top_occupations": dict(occupations.most_common(5)),
            "demand_questions": len(demand_qs),
            "geography": f"{founder.target_country}, {founder.target_state}",
        },
        limitations=limitations,
    )


def build_roadmap_execution(
    survey_caps: List[CapabilityResult],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.16: Roadmap & Execution Slide."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    cap_scores = {c.capability_name: c.score for c in survey_caps}
    weak_areas = [(n, s) for n, s in cap_scores.items() if s < 50]
    strong_areas = [(n, s) for n, s in cap_scores.items() if s >= 65]

    # Milestones derived from gaps
    milestones = []
    for name, score in weak_areas:
        milestones.append(f"Strengthen {name.replace('_', ' ')} (currently {score}/100)")
    for name, score in strong_areas:
        milestones.append(f"Capitalize on {name.replace('_', ' ')} strength ({score}/100)")

    evidence.append(EvidenceStatement(
        category="roadmap",
        statement=f"Identified {len(weak_areas)} areas needing improvement and {len(strong_areas)} strengths to leverage",
        data_point=f"{len(weak_areas)} gaps, {len(strong_areas)} strengths",
        source_question="Capability score analysis",
        sample_size=len(cap_scores),
    ))

    if founder.has_team_info:
        evidence.append(EvidenceStatement(
            category="roadmap",
            statement=f"Current team capacity: {founder.team_size} members — basis for execution timeline",
            data_point=f"{founder.team_size}",
            source_question="team_size field",
            sample_size=1,
        ))
    else:
        limitations.append("No team size provided — execution timeline cannot account for team capacity.")

    score = min(100, len(milestones) * 12 + (20 if founder.has_team_info else 0) + 20)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="roadmap_execution",
        score=score,
        confidence="medium",
        evidence_count=len(evidence),
        data_coverage=min(1.0, len(cap_scores) / 7),
        evidence_statements=evidence,
        raw_metrics={
            "milestones": milestones,
            "weak_areas": weak_areas,
            "strong_areas": strong_areas,
            "team_size": founder.team_size,
        },
        limitations=limitations,
    )


def build_funding_ask(
    survey_caps: List[CapabilityResult],
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.17: Funding Ask & Capital Utilization."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Growth evidence from traction
    traction_cap = next((c for c in survey_caps if c.capability_name == "traction_evidence"), None)
    if traction_cap:
        evidence.append(EvidenceStatement(
            category="funding_ask",
            statement=f"Traction evidence score: {traction_cap.score}/100 — supports funding readiness",
            data_point=f"{traction_cap.score}/100",
            source_question="Traction evidence capability",
            sample_size=1,
        ))

    if founder.funding_target:
        evidence.append(EvidenceStatement(
            category="funding_ask",
            statement=f"Funding target: {founder.funding_target}",
            data_point=founder.funding_target,
            source_question="funding_target field",
            sample_size=1,
        ))
    else:
        limitations.append("No funding target provided — capital utilization breakdown will be generic.")

    if founder.funding_stage:
        evidence.append(EvidenceStatement(
            category="funding_ask",
            statement=f"Funding stage: {founder.funding_stage}",
            data_point=founder.funding_stage,
            source_question="funding_stage field",
            sample_size=1,
        ))
    else:
        limitations.append("No funding stage specified — investor targeting cannot be stage-matched.")

    if founder.team_size:
        evidence.append(EvidenceStatement(
            category="funding_ask",
            statement=f"Current team: {founder.team_size} — informs hiring budget allocation",
            data_point=f"{founder.team_size}",
            source_question="team_size field",
            sample_size=1,
        ))

    data_points = sum([bool(traction_cap), bool(founder.funding_target), bool(founder.funding_stage), bool(founder.team_size)])
    score = min(100, data_points * 25)

    return CapabilityResult(
        capability_name="funding_ask",
        score=score,
        confidence="high" if data_points >= 3 else "medium" if data_points >= 2 else "low",
        evidence_count=len(evidence),
        data_coverage=min(1.0, data_points / 4),
        evidence_statements=evidence,
        raw_metrics={
            "funding_target": founder.funding_target,
            "funding_stage": founder.funding_stage,
            "team_size": founder.team_size,
            "traction_score": traction_cap.score if traction_cap else 0,
            "currency": founder.currency_code,
        },
        limitations=limitations,
    )


def build_investor_persona_targeting(
    survey_caps: List[CapabilityResult],
    total_responses: int,
    founder: FounderContext,
) -> CapabilityResult:
    """Capability 11.18: Investor Persona Targeting — suitable investor categories."""
    evidence: List[EvidenceStatement] = []
    limitations: List[str] = []

    # Stage detection from traction metrics
    traction_cap = next((c for c in survey_caps if c.capability_name == "traction_evidence"), None)
    traction_score = traction_cap.score if traction_cap else 0

    # Infer stage from data if not provided
    inferred_stage = founder.funding_stage
    if not inferred_stage:
        if traction_score >= 75 and total_responses >= 200:
            inferred_stage = "Series A"
        elif traction_score >= 50 and total_responses >= 100:
            inferred_stage = "Seed"
        else:
            inferred_stage = "Pre-Seed"
        evidence.append(EvidenceStatement(
            category="investor_targeting",
            statement=f"Inferred funding stage: {inferred_stage} (based on traction score {traction_score}/100 and {total_responses} responses)",
            data_point=inferred_stage,
            source_question="Stage inference from traction metrics",
            sample_size=total_responses,
        ))
    else:
        evidence.append(EvidenceStatement(
            category="investor_targeting",
            statement=f"Stated funding stage: {inferred_stage}",
            data_point=inferred_stage,
            source_question="funding_stage field",
            sample_size=1,
        ))

    # Industry
    industry = founder.industry_vertical or "General Tech"
    evidence.append(EvidenceStatement(
        category="investor_targeting",
        statement=f"Industry vertical: {industry} — matches investors focused on this sector",
        data_point=industry,
        source_question="industry_vertical field or startup_context",
        sample_size=1,
    ))

    # Geography match
    evidence.append(EvidenceStatement(
        category="investor_targeting",
        statement=f"Geography: {founder.target_country} — target investors active in this market",
        data_point=founder.target_country,
        source_question="target_country field",
        sample_size=1,
    ))

    if not founder.industry_vertical:
        limitations.append("No industry vertical specified — investor matching based on general tech category.")

    data_points = sum([bool(founder.funding_stage), bool(founder.industry_vertical), traction_score > 0])
    score = min(100, data_points * 30 + 10)
    score = max(0, min(100, score))

    return CapabilityResult(
        capability_name="investor_persona_targeting",
        score=score,
        confidence="high" if founder.funding_stage and founder.industry_vertical else "medium",
        evidence_count=len(evidence),
        data_coverage=min(1.0, data_points / 3),
        evidence_statements=evidence,
        raw_metrics={
            "inferred_stage": inferred_stage,
            "stated_stage": founder.funding_stage,
            "industry": industry,
            "geography": founder.target_country,
            "traction_score": traction_score,
            "total_responses": total_responses,
        },
        limitations=limitations,
    )


# ── Master Aggregator ─────────────────────────────────────────────────────────


def extract_survey_intelligence(
    questions: List[SurveyQuestion],
    answers: List[SurveyAnswer],
    responses: List[SurveyResponse],
    total_responses: int,
    completed_responses: int,
    founder: Optional[FounderContext] = None,
) -> Dict[str, Any]:
    """
    Master intelligence extraction function.

    Runs all 19 capability engines (7 pure-survey + 12 hybrid) and returns
    structured intelligence ready for injection into the AI prompt.

    Returns a dict with:
    - "capabilities": dict mapping capability name -> CapabilityResult (as dict)
    - "overall_score": weighted aggregate score
    - "overall_confidence": aggregate confidence level
    - "total_evidence": total evidence statements
    - "prompt_section": pre-formatted text for AI prompt injection
    """
    # Step 1: Analyze all responses per question
    analysis = analyze_responses(questions, answers, responses)

    # Default founder context if not provided
    if founder is None:
        founder = FounderContext()

    # Step 2: Run 7 pure-survey capability engines
    problem_solution = build_problem_solution(analysis)
    market_opportunity = build_market_opportunity(analysis, responses)
    traction_evidence = build_traction_evidence(analysis, total_responses, completed_responses)
    competitive_advantage = build_competitive_advantage(analysis)
    objection_intel = build_objection_intelligence(analysis)

    core_capabilities = [
        problem_solution, market_opportunity, traction_evidence,
        competitive_advantage, objection_intel,
    ]
    evidence_mapping = build_evidence_mapping(core_capabilities)
    question_simulation = build_question_simulation(core_capabilities)

    survey_only_caps = core_capabilities + [evidence_mapping, question_simulation]

    # Step 3: Run 12 hybrid capability engines (survey + founder context)
    hybrid_capabilities = [
        build_investor_readiness_analysis(core_capabilities, founder),
        build_pitch_readiness_gate(core_capabilities, founder),
        build_narrative_intelligence(analysis, founder),
        build_executive_summary(analysis, core_capabilities, founder),
        build_tam_sam_som(analysis, responses, founder),
        build_business_model(analysis, founder),
        build_financial_projections(analysis, total_responses, founder),
        build_unit_economics(analysis, founder),
        build_gtm_strategy(analysis, responses, founder),
        build_roadmap_execution(core_capabilities, founder),
        build_funding_ask(core_capabilities, founder),
        build_investor_persona_targeting(core_capabilities, total_responses, founder),
    ]

    all_capabilities = survey_only_caps + hybrid_capabilities

    # Step 4: Compute aggregate scores
    # Weighted: problem=20%, market=20%, traction=25%, competitive=15%, objection=20%
    weights = {
        "problem_solution": 0.20,
        "market_opportunity": 0.20,
        "traction_evidence": 0.25,
        "competitive_advantage": 0.15,
        "objection_intelligence": 0.20,
    }
    weighted_score = sum(
        cap.score * weights.get(cap.capability_name, 0)
        for cap in core_capabilities
    )
    overall_score = int(max(0, min(100, weighted_score)))

    total_evidence = sum(cap.evidence_count for cap in all_capabilities)

    # Overall confidence
    confidences = [cap.confidence for cap in core_capabilities]
    if confidences.count("high") >= 3:
        overall_confidence = "high"
    elif confidences.count("low") >= 3:
        overall_confidence = "low"
    else:
        overall_confidence = "medium"

    # Step 5: Generate prompt section
    prompt_lines = ["== SURVEY INTELLIGENCE (COMPUTED FROM RAW RESPONSE DATA) ==\n"]
    for i, cap in enumerate(all_capabilities, 1):
        cap_title = cap.capability_name.replace("_", " ").upper()
        prompt_lines.append(f"--- CAPABILITY {i}: {cap_title} ---")
        prompt_lines.append(f"Score: {cap.score}/100 | Confidence: {cap.confidence.title()} | Evidence Count: {cap.evidence_count}")

        if cap.evidence_statements:
            prompt_lines.append("Evidence:")
            for ev in cap.evidence_statements[:5]:  # Limit to 5 per capability in prompt
                prompt_lines.append(f'  • "{ev.statement}" (Q: "{ev.source_question[:80]}")')

        if cap.limitations:
            prompt_lines.append("Limitations:")
            for lim in cap.limitations:
                prompt_lines.append(f"  ⚠ {lim}")

        prompt_lines.append("")

    prompt_lines.append(f"--- AGGREGATE READINESS ---")
    prompt_lines.append(f"Overall Investor Readiness Score: {overall_score}/100")
    prompt_lines.append(f"Overall Confidence: {overall_confidence.title()}")
    prompt_lines.append(f"Total Evidence Statements: {total_evidence}")

    # ── Fix 2: Question → Signal Map ─────────────────────────────────────────
    # Append a deterministic mapping of every survey question to its classified
    # investor signal categories. This lets the AI reference specific questions
    # in its narrative without fabricating which question drove which score.
    prompt_lines.append("")
    prompt_lines.append("== QUESTION → SIGNAL MAP (EXACT CLASSIFICATIONS FROM DATA) ==")
    prompt_lines.append("Use these classifications to cite specific survey evidence in your narrative.")
    prompt_lines.append("Format: Q<n> [Type] \"Question text\" → signals")
    prompt_lines.append("")

    sorted_qas = sorted(analysis.values(), key=lambda qa: qa.question_text)
    for i, qa in enumerate(sorted_qas, 1):
        signals = ", ".join(qa.categories) if qa.categories != ["general"] else "general (no investor signal)"
        q_type_label = qa.question_type.replace("_", " ")
        answered = f"{qa.total_answers} responses"
        avg = f" | avg rating: {qa.average_rating}/5" if qa.average_rating > 0 else ""
        pos = f" | {qa.positive_ratio:.0f}% positive" if qa.total_answers > 0 else ""
        prompt_lines.append(
            f"  Q{i} [{q_type_label}] \"{qa.question_text[:100]}\" → {signals}"
            f" ({answered}{pos}{avg})"
        )

    prompt_section = "\n".join(prompt_lines)


    # Step 6: Build return dict
    def _cap_to_dict(cap: CapabilityResult) -> Dict[str, Any]:
        return {
            "capability_name": cap.capability_name,
            "score": cap.score,
            "confidence": cap.confidence,
            "evidence_count": cap.evidence_count,
            "data_coverage": cap.data_coverage,
            "evidence_statements": [
                {
                    "category": e.category,
                    "statement": e.statement,
                    "data_point": e.data_point,
                    "source_question": e.source_question,
                    "sample_size": e.sample_size,
                }
                for e in cap.evidence_statements
            ],
            "raw_metrics": cap.raw_metrics,
            "limitations": cap.limitations,
        }

    return {
        "capabilities": {cap.capability_name: _cap_to_dict(cap) for cap in all_capabilities},
        "overall_score": overall_score,
        "overall_confidence": overall_confidence,
        "total_evidence": total_evidence,
        "prompt_section": prompt_section,
    }
