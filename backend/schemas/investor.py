# backend/schemas/investor.py
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class CompetitorEntry(BaseModel):
    name: str = Field(..., description="Name of the competitor")
    offering: str = Field(..., description="Competitor core offering details")
    pricing: str = Field(..., description="Pricing structure and numbers")
    strengths: str = Field(..., description="Key strengths")
    weaknesses: str = Field(..., description="Key weaknesses")
    diff: str = Field(..., description="Unique differentiator")
    share: str = Field(..., description="Estimated market share percentage")


class TAM_SAM_SOM_Structure(BaseModel):
    tam: str = Field(..., description="Total Addressable Market size and explanation")
    sam: str = Field(..., description="Serviceable Addressable Market size and explanation")
    som: str = Field(..., description="Serviceable Obtainable Market size and explanation")
    data_source: str = Field(..., description="Sources or assumptions used")


class UnitEconomicsMetrics(BaseModel):
    cac: str = Field(..., description="Customer Acquisition Cost details and value")
    ltv: str = Field(..., description="Lifetime Value of a customer")
    margin: str = Field(..., description="Gross margin percentage")
    retention: str = Field(..., description="Estimated retention rate percentage")
    payback_period: str = Field(..., description="CAC payback period in months")


class FinancialProjectionYear(BaseModel):
    year: str = Field(..., description="Year (e.g. Year 1, Year 2, Year 3)")
    revenue: str = Field(..., description="Projected Revenue")
    cost: str = Field(..., description="Projected Expenses")
    hiring: str = Field(..., description="Headcount or hiring target")
    margin: str = Field(..., description="Net margin projection")


class ScoringCategoryDetails(BaseModel):
    score: int = Field(..., description="Category score (0-100)")
    weight: float = Field(..., description="Weight in overall calculation (0.0-1.0)")
    status: str = Field(..., description="Status (e.g. Strong, Medium, High Risk)")
    insights: str = Field(..., description="Key drivers for this score")
    gaps: List[str] = Field(default=[], description="Identified improvement gaps")


class ScoringEngineResult(BaseModel):
    overall_score: int = Field(..., description="Overall readiness rating (0-100)")
    confidence_score: int = Field(..., description="AI confidence score based on data density (0-100)")
    growth_potential: str = Field(..., description="Growth potential assessment (High, Moderate, Low)")
    attractiveness_level: str = Field(
        ...,
        description="Investor attractiveness category (Excellent, Strong, Emerging)",
    )
    financial_readiness: ScoringCategoryDetails
    product_readiness: ScoringCategoryDetails
    market_readiness: ScoringCategoryDetails
    team_readiness: ScoringCategoryDetails
    operational_maturity: ScoringCategoryDetails
    key_risks: List[Dict[str, str]] = Field(default=[], description="List of key risks and mitigations")


class ObjectionPreparation(BaseModel):
    objection: str = Field(..., description="Potential investor concern or objection")
    severity: str = Field(..., description="Severity level (High, Medium, Low)")
    suggested_response: str = Field(..., description="Best strategic answer for founders")


class RoadmapPhase(BaseModel):
    phase: str = Field(..., description="Phase identifier (e.g. Phase 1)")
    milestone: str = Field(..., description="Core milestone target")
    timeline: str = Field(..., description="Timeline target (e.g. Month 1-3)")
    funding_required: str = Field(..., description="Required allocation amount")
    focus_area: str = Field(..., description="Key department/focus area")


class InvestorMatchDetails(BaseModel):
    investor_type: str = Field(..., description="Ideal investor type (e.g., Seed VC, Angel Group)")
    average_check: str = Field(..., description="Standard ticket size range")
    key_criteria: List[str] = Field(..., description="Standard parameters they evaluate")
    target_fit: str = Field(..., description="Target fit description (Why they match)")


class PitchDeckQualityDetails(BaseModel):
    overall_rating: str = Field(
        ...,
        description="Pitch quality rating (e.g. Highly Prepared, Refinements Needed)",
    )
    strengths: List[str] = Field(..., description="Key elements working well")
    improvements: List[str] = Field(..., description="Priority items that need polish before pitching")


class InvestorReadinessReportResponse(BaseModel):
    survey_id: str
    survey_title: str
    category: str = Field(..., description="Industry vertical")
    executive_summary: str = Field(..., description="Dynamic VC-grade summary of the venture opportunity")
    problem_solution_narrative: Dict[str, str] = Field(..., description="Problem statement and solution narrative")
    narrative_intelligence: str = Field(..., description="Strategic mission and visionary pitch script")
    market_opportunity_framing: str = Field(..., description="Strategic framing of the market momentum")
    tam_sam_som: TAM_SAM_SOM_Structure
    competitors: List[CompetitorEntry] = Field(
        default=[], description="Real or representative competitors in target area"
    )
    gtm_strategy: str = Field(..., description="Go-to-market and growth framework")
    unit_economics: UnitEconomicsMetrics
    financial_projections: List[FinancialProjectionYear] = Field(default=[], description="3-year financials")
    traction_evidence: Dict[str, Any] = Field(..., description="Survey-based and analytical proof points")
    execution_roadmap: List[RoadmapPhase] = Field(default=[], description="Detailed 18-month roadmap")
    objections: List[ObjectionPreparation] = Field(default=[], description="Investor question simulator answers")
    scoring: ScoringEngineResult = Field(..., description="Complete readiness scores and confidence rating")
    pitch_review: PitchDeckQualityDetails = Field(..., description="Quality review feedback")
    target_investors: List[InvestorMatchDetails] = Field(default=[], description="Target matches")
    funding_ask: Dict[str, Any] = Field(..., description="Ask size and use of funds split")


class InvestorReadinessInitRequest(BaseModel):
    startup_context: str = Field(default="", description="Founder summary of the startup and mission")
    pricing_model: str = Field(default="", description="Planned pricing or monetization details")
    target_country: str = Field(default="", description="Target country")
    target_state: str = Field(default="", description="Target state")
    target_district: str = Field(default="", description="Target city/district")
