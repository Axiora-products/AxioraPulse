from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class AIInsightItem(BaseModel):
    type: str # positive, warning, info, action
    title: str
    detail: str
    metric: Optional[str] = None

class AIActionItem(BaseModel):
    priority: str # high, medium, low
    action: str
    impact: str

# ── Deep Analysis Models ──────────────────────────────────────────────────────

class AIThemeItem(BaseModel):
    theme: str
    frequency: str  # e.g. "mentioned by 65% of respondents"
    sentiment: str  # positive, negative, mixed, neutral
    quotes: List[str] = Field(default_factory=list)
    relatedQuestions: List[str] = Field(default_factory=list)

class AICrossPattern(BaseModel):
    pattern: str
    questions: List[str] = Field(default_factory=list)
    significance: str  # high, medium, low
    detail: str

class AIRespondentSegment(BaseModel):
    segment: str
    size: str  # e.g. "~40% of respondents"
    characteristics: str
    sentiment: str  # positive, negative, mixed, neutral
    keyDifference: str

class AIUrgencyItem(BaseModel):
    issue: str
    urgency: str  # critical, high, medium, low
    impact: str   # high, medium, low
    evidence: str

class AIBenchmark(BaseModel):
    metric: str
    value: str
    benchmark: str
    status: str  # above, at, below
    context: str

class AIDataQualityFlag(BaseModel):
    flag: str
    severity: str  # warning, info
    detail: str
    suggestion: str

class AISentimentBreakdown(BaseModel):
    positive: int = 0
    neutral: int = 0
    negative: int = 0
    overall: str = "neutral"  # positive, neutral, negative

# ── Request / Response ────────────────────────────────────────────────────────

class AIInsightsRequest(BaseModel):
    surveyTitle: str
    responses: Dict[str, Any]
    questionSummaries: List[Dict[str, Any]]

class AIInsightsResponse(BaseModel):
    # Core (existing)
    executiveSummary: str
    npsAnalysis: Optional[str] = None
    insights: List[AIInsightItem] = Field(default_factory=list)
    topStrengths: List[str] = Field(default_factory=list)
    improvementAreas: List[str] = Field(default_factory=list)
    recommendedActions: List[AIActionItem] = Field(default_factory=list)
    # Deep analysis (new)
    overallScore: Optional[int] = None  # 0-100
    responseQuality: Optional[str] = None
    sentimentBreakdown: Optional[AISentimentBreakdown] = None
    keyThemes: List[AIThemeItem] = Field(default_factory=list)
    crossQuestionPatterns: List[AICrossPattern] = Field(default_factory=list)
    respondentSegments: List[AIRespondentSegment] = Field(default_factory=list)
    urgencyMatrix: List[AIUrgencyItem] = Field(default_factory=list)
    benchmarkComparison: List[AIBenchmark] = Field(default_factory=list)
    dataQualityFlags: List[AIDataQualityFlag] = Field(default_factory=list)


class AISuggestionItem(BaseModel):
    text: str
    type: str # question_type
    options: Optional[Any] = None
    rationale: Optional[str] = None

class AISuggestionsRequest(BaseModel):
    surveyTitle: str
    surveyDescription: Optional[str] = ""
    existingQuestions: List[Dict[str, Any]]
    aiContext: Optional[str] = ""

class AISuggestionsResponse(BaseModel):
    suggestions: List[AISuggestionItem]

class AIGeneratedQuestionItem(BaseModel):
    text: str
    type: str
    options: Optional[Any] = None

class IdeaProtectionMetadata(BaseModel):
    protection_applied: bool = False
    detected_sensitive_categories: List[str] = Field(default_factory=list)
    protected_context_summary: Optional[str] = None
    leak_validation_applied: bool = False

class AIGenerateRequest(BaseModel):
    aiContext: str
    mode: Optional[str] = "conversational"
    customInstruction: Optional[str] = None
    targetAudience: Optional[str] = None
    engagementGoals: Optional[str] = None
    fileContext: Optional[str] = None
    audioContext: Optional[str] = None

class AIGenerateResponse(BaseModel):
    title: str
    description: str
    welcome_message: str
    questions: List[AIGeneratedQuestionItem]
    protection_metadata: Optional[IdeaProtectionMetadata] = None


# ── Survey Intelligence (Guidance + Roadmap) ──────────────────────────────────

class SurveyIntelCompetitor(BaseModel):
    name: str
    offering: str
    pricing: str
    strengths: str
    weaknesses: str
    diff: str
    share: str

class SurveyIntelPersona(BaseModel):
    name: str
    demographics: str
    psychographics: str
    painPoints: str
    buyingBehavior: str

class SurveyIntelOpportunity(BaseModel):
    lane: str
    description: str

class SurveyIntelRoadmapStep(BaseModel):
    name: str
    goals: str
    resources: str
    timeline: str
    risks: str
    tools: str
    cost: str

class SurveyIntelligenceResponse(BaseModel):
    category: str
    competitors: List[SurveyIntelCompetitor]
    persona: SurveyIntelPersona
    opportunities: List[SurveyIntelOpportunity]
    viabilityScore: int
    roadmap: List[SurveyIntelRoadmapStep]
