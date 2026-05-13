from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

class AIInsightItem(BaseModel):
    type: str # positive, warning, info, action
    title: str
    detail: str
    metric: Optional[str] = None

class AIActionItem(BaseModel):
    priority: str # high, medium, low
    action: str
    impact: str

class AIInsightsRequest(BaseModel):
    surveyTitle: str
    responses: Dict[str, Any]
    questionSummaries: List[Dict[str, Any]]

class AIInsightsResponse(BaseModel):
    executiveSummary: str
    npsAnalysis: Optional[str] = None
    insights: List[AIInsightItem]
    topStrengths: List[str]
    improvementAreas: List[str]
    recommendedActions: List[AIActionItem]

class AISuggestionItem(BaseModel):
    text: str
    type: str # question_type
    options: Optional[List[Dict[str, Any]]] = None
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
    options: Optional[List[Dict[str, Any]]] = None

class AIGenerateRequest(BaseModel):
    aiContext: str
    mode: Optional[str] = "conversational"
    fileContext: Optional[str] = None
    audioContext: Optional[str] = None

class AIGenerateResponse(BaseModel):
    title: str
    description: str
    welcome_message: str
    questions: List[AIGeneratedQuestionItem]
