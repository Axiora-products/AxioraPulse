# backend/schemas/investor.py
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from schemas.external_data import ExternalDataRequest


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
    attractiveness_level: str = Field(..., description="Investor attractiveness category (Excellent, Strong, Emerging)")
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
    overall_rating: str = Field(..., description="Pitch quality rating (e.g. Highly Prepared, Refinements Needed)")
    strengths: List[str] = Field(..., description="Key elements working well")
    improvements: List[str] = Field(..., description="Priority items that need polish before pitching")


class EvidenceStatement(BaseModel):
    """A traceable evidence statement derived from actual survey response data."""

    category: str = Field(..., description="Signal category (e.g. problem_validation, market_demand)")
    statement: str = Field(..., description="Human-readable evidence statement")
    data_point: str = Field(..., description="The key data point (e.g. '78%', '4.2/5')")
    source_question: str = Field(..., description="The survey question this evidence comes from")
    sample_size: int = Field(..., description="Number of responses this evidence is based on")


class CapabilityIntelligence(BaseModel):
    """Per-capability intelligence result from the survey/external intelligence engines."""

    capability_name: str = Field(..., description="Capability identifier")
    score: int = Field(..., description="Evidence-based score 0-100")
    confidence: str = Field(..., description="Confidence level: high, medium, or low")
    evidence_count: int = Field(..., description="Number of evidence statements")
    data_coverage: float = Field(..., description="How much of this capability has data (0.0-1.0)")
    evidence_statements: List[EvidenceStatement] = Field(default=[], description="Traceable evidence")
    raw_metrics: Dict[str, Any] = Field(default={}, description="Raw computed metrics")
    limitations: List[str] = Field(default=[], description="Data gaps or limitations")


class SurveyIntelligence(BaseModel):
    """Structured output from all 19 capability engines (survey + founder context)."""

    capabilities: Dict[str, CapabilityIntelligence] = Field(
        default={}, description="Per-capability intelligence keyed by capability name"
    )
    overall_score: int = Field(..., description="Weighted aggregate readiness score 0-100")
    overall_confidence: str = Field(..., description="Aggregate confidence: high, medium, or low")
    total_evidence: int = Field(..., description="Total evidence statements across all capabilities")


class ExternalIntelligence(BaseModel):
    """Intelligence from the 32 external-data capability engines."""

    capabilities: Dict[str, CapabilityIntelligence] = Field(default={}, description="32 external capability results")
    capabilities_with_data: int = Field(default=0, description="Number of capabilities with actual data")
    total_capabilities: int = Field(default=32, description="Total external capabilities")
    avg_score: int = Field(default=0, description="Average score across capabilities with data")
    total_evidence: int = Field(default=0, description="Total evidence statements")
    groups: Dict[str, List[str]] = Field(default={}, description="Capability names grouped by category")


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
    survey_intelligence: Optional[SurveyIntelligence] = Field(
        default=None, description="Evidence-based intelligence from 19 capability engines (survey + founder context)"
    )
    external_intelligence: Optional[ExternalIntelligence] = Field(
        default=None,
        description="Intelligence from 32 external-data capabilities (documents, CRM, financials, strategy)",
    )


class InvestorReadinessInitRequest(BaseModel):
    # Required fields
    startup_context: str = Field(default="", description="Founder summary of the startup and mission")
    pricing_model: str = Field(default="", description="Planned pricing or monetization details")
    target_country: str = Field(default="", description="Target country")
    target_state: str = Field(default="", description="Target state")
    target_district: str = Field(default="", description="Target city/district")

    # Optional founder context — enriches the 12 hybrid capabilities
    funding_stage: Optional[str] = Field(default=None, description="e.g. Pre-Seed, Seed, Series A")
    funding_target: Optional[str] = Field(default=None, description="e.g. ₹75,00,000 or $500,000")
    team_size: Optional[int] = Field(default=None, description="Current team size")
    monthly_revenue: Optional[str] = Field(default=None, description="Current MRR if any, e.g. ₹50,000")
    industry_vertical: Optional[str] = Field(default=None, description="e.g. EdTech, FinTech, HealthTech")
    founded_year: Optional[int] = Field(default=None, description="Year the startup was founded")
    founder_count: Optional[int] = Field(default=None, description="Number of co-founders")

    # Optional external data — enriches the 32 external-data capabilities
    external_data: Optional[ExternalDataRequest] = Field(
        default=None, description="Optional: documents, CRM data, financials, and strategic inputs"
    )
