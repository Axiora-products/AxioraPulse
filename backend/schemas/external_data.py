"""
schemas/external_data.py
────────────────────────
Pydantic schemas for the 32 external-data capability inputs.

Organised into 4 groups:
  Group D — Document Intelligence  (9 capabilities)
  Group C — CRM / Investor Pipeline (8 capabilities)
  Group F — Financial Intelligence  (8 capabilities)
  Group S — Strategic Intelligence  (7 capabilities)

All fields are Optional — any subset can be provided and the corresponding
capability will compute scores from whatever is available.
File references use the UUID string of an already-uploaded UploadedFile record
(POST /uploads/file). The route resolves each ID to its extracted_text.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ── Group D: Document Intelligence ───────────────────────────────────────────


class PitchDeckInput(BaseModel):
    file_id: Optional[str] = Field(None, description="UUID of uploaded pitch deck PDF")
    slide_count: Optional[int] = Field(None, description="Number of slides")
    last_updated: Optional[str] = Field(None, description="e.g. 'June 2025'")
    deck_version: Optional[str] = Field(None, description="e.g. v1.2")


class TermSheetInput(BaseModel):
    file_id: Optional[str] = Field(None, description="UUID of uploaded term sheet PDF")
    investment_amount: Optional[str] = Field(None, description="e.g. ₹75,00,000")
    pre_money_valuation: Optional[str] = Field(None, description="e.g. ₹3,00,00,000")
    equity_offered: Optional[float] = Field(None, description="% equity offered, e.g. 12.5")
    lead_investor: Optional[str] = Field(None, description="Name of lead investor")
    term_sheet_stage: Optional[str] = Field(None, description="e.g. LOI, Draft, Final, Signed")


class FinancialModelInput(BaseModel):
    file_id: Optional[str] = Field(None, description="UUID of uploaded financial model PDF/Excel")
    projection_years: Optional[int] = Field(None, description="Number of years projected")
    year1_revenue: Optional[str] = Field(None, description="e.g. ₹24,00,000")
    year3_revenue: Optional[str] = Field(None, description="e.g. ₹2,40,00,000")
    break_even_month: Optional[int] = Field(None, description="Month of break-even (from launch)")
    assumptions_documented: Optional[bool] = Field(None, description="Are assumptions documented?")


class DueDiligenceInput(BaseModel):
    incorporation_docs: Optional[bool] = Field(None)
    cap_table_current: Optional[bool] = Field(None)
    audited_financials: Optional[bool] = Field(None)
    ip_assignments: Optional[bool] = Field(None)
    customer_contracts: Optional[bool] = Field(None)
    employment_agreements: Optional[bool] = Field(None)
    board_resolutions: Optional[bool] = Field(None)
    bank_statements_6m: Optional[bool] = Field(None)
    tax_returns: Optional[bool] = Field(None)
    regulatory_filings: Optional[bool] = Field(None)
    founder_backgrounds: Optional[bool] = Field(None)
    reference_checks_done: Optional[bool] = Field(None)


class DataRoomInput(BaseModel):
    data_room_link: Optional[str] = Field(None, description="URL to data room (Notion, Drive, etc.)")
    total_documents: Optional[int] = Field(None, description="Total documents in data room")
    sections_complete: Optional[List[str]] = Field(None, description="Completed sections e.g. ['Financials', 'Legal']")
    last_updated: Optional[str] = Field(None, description="When data room was last updated")


class OnePagerInput(BaseModel):
    file_id: Optional[str] = Field(None, description="UUID of uploaded one-pager PDF")
    target_audience: Optional[str] = Field(None, description="e.g. Angel Investors, VCs, Family Offices")


class ReferenceLettersInput(BaseModel):
    file_ids: Optional[List[str]] = Field(None, description="UUIDs of uploaded reference letter PDFs")
    reference_count: Optional[int] = Field(None, description="Number of references available")
    reference_types: Optional[List[str]] = Field(None, description="e.g. ['Customer', 'Mentor', 'Angel']")


class LegalStatusInput(BaseModel):
    nda_template_ready: Optional[bool] = Field(None)
    ip_ownership_clear: Optional[bool] = Field(None)
    no_pending_litigation: Optional[bool] = Field(None)
    compliance_status: Optional[str] = Field(None, description="e.g. 'Compliant', 'Pending GST', 'Issues'")
    trademarks_filed: Optional[bool] = Field(None)
    patents_filed: Optional[int] = Field(None, description="Number of patents filed")


class MediaKitInput(BaseModel):
    file_id: Optional[str] = Field(None, description="UUID of uploaded media kit PDF")
    press_mentions: Optional[int] = Field(None, description="Number of press mentions")
    press_outlets: Optional[List[str]] = Field(None, description="e.g. ['YourStory', 'Inc42', 'TechCrunch']")
    social_followers: Optional[Dict[str, int]] = Field(None, description="e.g. {'LinkedIn': 2400, 'Twitter': 890}")


# ── Group C: CRM / Investor Pipeline ─────────────────────────────────────────


class InvestorContact(BaseModel):
    name: str
    firm: Optional[str] = None
    type: Optional[str] = None  # Angel, VC, Family Office, Corporate
    stage: Optional[str] = None  # Identified, Intro Sent, Meeting Scheduled, Pitched, Term Sheet, Closed, Passed
    notes: Optional[str] = None


class InvestorPipelineInput(BaseModel):
    contacts: Optional[List[InvestorContact]] = Field(None, description="List of investor contacts being tracked")
    total_targeted: Optional[int] = Field(None, description="Total investors in outreach list")
    meetings_held: Optional[int] = Field(None, description="Number of pitch meetings held")
    term_sheets_received: Optional[int] = Field(None, description="Number of term sheets received")
    soft_commits: Optional[int] = Field(None, description="Number of soft commitments")


class InvestorMeetingPrepInput(BaseModel):
    next_meeting_investor: Optional[str] = Field(None, description="Name of investor for next meeting")
    next_meeting_firm: Optional[str] = Field(None, description="Firm name")
    investor_focus_areas: Optional[List[str]] = Field(None, description="e.g. ['SaaS', 'B2B', 'India']")
    investor_portfolio: Optional[List[str]] = Field(None, description="Known portfolio companies")
    previous_feedback: Optional[str] = Field(None, description="Feedback from past pitches")


class InvestorMatchingInput(BaseModel):
    preferred_investor_type: Optional[str] = Field(None, description="Angel / VC / Family Office / Strategic")
    check_size_min: Optional[str] = Field(None, description="e.g. ₹25,00,000")
    check_size_max: Optional[str] = Field(None, description="e.g. ₹1,00,00,000")
    board_seat_acceptable: Optional[bool] = Field(None)
    looking_for_smart_money: Optional[bool] = Field(None, description="Seeking operational expertise beyond capital")


class VCTargetingInput(BaseModel):
    target_vcs: Optional[List[str]] = Field(None, description="List of target VC firm names")
    warm_intros_available: Optional[int] = Field(None, description="Number of warm introductions available")
    cold_outreach_done: Optional[int] = Field(None, description="Number of cold outreach attempts")
    accelerator_backed: Optional[bool] = Field(None, description="Currently in or graduated from accelerator")
    accelerator_name: Optional[str] = Field(None)


class PitchFeedbackInput(BaseModel):
    pitches_completed: Optional[int] = Field(None, description="Total pitches done so far")
    common_objections: Optional[List[str]] = Field(None, description="Most common objections heard")
    positive_signals: Optional[List[str]] = Field(None, description="Consistent positive feedback received")
    pivot_suggestions: Optional[List[str]] = Field(None, description="Suggestions to change direction")


class ObjectionLibraryInput(BaseModel):
    custom_objections: Optional[List[Dict[str, str]]] = Field(
        None, description="List of {objection: str, response: str} pairs"
    )


# ── Group F: Financial Intelligence ──────────────────────────────────────────


class BurnRunwayInput(BaseModel):
    monthly_burn_rate: Optional[str] = Field(None, description="e.g. ₹3,50,000/month")
    cash_in_bank: Optional[str] = Field(None, description="e.g. ₹18,00,000")
    last_funding_date: Optional[str] = Field(None, description="e.g. 'March 2025'")
    monthly_revenue: Optional[str] = Field(None, description="Current MRR e.g. ₹50,000")
    revenue_growth_mom: Optional[float] = Field(None, description="Month-over-month revenue growth %, e.g. 15.0")


class ValuationInput(BaseModel):
    valuation_method: Optional[str] = Field(None, description="Comparable / Revenue Multiple / DCF / Berkus")
    target_pre_money: Optional[str] = Field(None, description="e.g. ₹3,00,00,000")
    comparable_startups: Optional[List[str]] = Field(None, description="Similar funded startups for benchmarking")
    arr: Optional[str] = Field(None, description="Annual Recurring Revenue e.g. ₹6,00,000")
    revenue_multiple_used: Optional[float] = Field(None, description="e.g. 8.0x")


class CapTableInput(BaseModel):
    founders_equity: Optional[float] = Field(None, description="% equity held by founders combined")
    employee_esop_pool: Optional[float] = Field(None, description="% allocated to ESOP pool")
    existing_investor_equity: Optional[float] = Field(None, description="% held by existing investors")
    advisor_equity: Optional[float] = Field(None, description="% held by advisors")
    new_round_dilution: Optional[float] = Field(None, description="% being offered in this round")
    total_shareholders: Optional[int] = Field(None, description="Total number of shareholders")


class SAFENoteInput(BaseModel):
    instrument_type: Optional[str] = Field(None, description="SAFE / Convertible Note / CCPS")
    valuation_cap: Optional[str] = Field(None, description="e.g. ₹4,00,00,000")
    discount_rate: Optional[float] = Field(None, description="% discount, e.g. 20.0")
    has_mfn_clause: Optional[bool] = Field(None, description="Most Favoured Nation clause?")
    pro_rata_rights: Optional[bool] = Field(None)
    total_raised_via_safe: Optional[str] = Field(None, description="Total already raised via SAFE/notes")


class RevenueMetricsInput(BaseModel):
    mrr: Optional[str] = Field(None, description="Monthly Recurring Revenue e.g. ₹50,000")
    arr: Optional[str] = Field(None, description="Annual Recurring Revenue e.g. ₹6,00,000")
    churn_rate: Optional[float] = Field(None, description="Monthly churn % e.g. 3.5")
    net_revenue_retention: Optional[float] = Field(None, description="NRR % e.g. 108.0")
    paying_customers: Optional[int] = Field(None, description="Number of paying customers")
    free_users: Optional[int] = Field(None, description="Number of free/trial users")
    customer_lifetime_months: Optional[float] = Field(None, description="Average customer lifetime in months")


class UnitEconomicsDetailInput(BaseModel):
    cac_by_channel: Optional[Dict[str, str]] = Field(None, description="e.g. {'Organic': '₹800', 'Paid': '₹4,200'}")
    ltv: Optional[str] = Field(None, description="e.g. ₹18,000")
    payback_period_months: Optional[float] = Field(None, description="CAC payback period in months")
    gross_margin: Optional[float] = Field(None, description="% gross margin e.g. 72.0")
    net_margin: Optional[float] = Field(None, description="% net margin e.g. -45.0 (negative = loss)")


class FundraisingTimelineInput(BaseModel):
    target_close_date: Optional[str] = Field(None, description="e.g. 'September 2025'")
    amount_committed_so_far: Optional[str] = Field(None, description="e.g. ₹20,00,000 soft commit")
    key_milestones_for_close: Optional[List[str]] = Field(
        None, description="e.g. ['Reach 100 paying customers', '₹1L MRR', 'Hire CTO']"
    )
    parallel_grant_applications: Optional[List[str]] = Field(None, description="e.g. ['Startup India', 'BIRAC']")


# ── Group S: Strategic Intelligence ──────────────────────────────────────────


class CompetitiveMatrixInput(BaseModel):
    competitors: Optional[List[Dict[str, Any]]] = Field(
        None, description="List of {name, pricing, strengths, weaknesses, market_share}"
    )
    primary_differentiator: Optional[str] = Field(None, description="Your #1 competitive advantage")
    switching_cost_high: Optional[bool] = Field(None, description="Is switching cost high for your customers?")
    network_effects: Optional[bool] = Field(None, description="Does your product have network effects?")
    defensible_moats: Optional[List[str]] = Field(None, description="e.g. ['Proprietary data', 'Brand', 'Contracts']")


class RegulatoryInput(BaseModel):
    licenses_required: Optional[List[str]] = Field(None, description="e.g. ['NBFC', 'DPIIT Recognition']")
    licenses_obtained: Optional[List[str]] = Field(None)
    gdpr_compliant: Optional[bool] = Field(None)
    iso_certified: Optional[bool] = Field(None)
    data_residency_compliant: Optional[bool] = Field(None, description="Data stored in India?")
    pending_compliance_items: Optional[List[str]] = Field(None)


class IPTrackerInput(BaseModel):
    patents_filed: Optional[int] = Field(None)
    patents_granted: Optional[int] = Field(None)
    patents_pending: Optional[int] = Field(None)
    trademarks_registered: Optional[int] = Field(None)
    trade_secrets_documented: Optional[bool] = Field(None)
    open_source_components_audited: Optional[bool] = Field(None)


class PartnershipInput(BaseModel):
    strategic_partners: Optional[List[Dict[str, str]]] = Field(
        None, description="List of {name, type, status} e.g. {name: 'Razorpay', type: 'Technology', status: 'Active'}"
    )
    distribution_partners: Optional[List[str]] = Field(None)
    channel_partners: Optional[int] = Field(None, description="Number of channel/reseller partners")
    mou_signed: Optional[int] = Field(None, description="Number of MOUs signed")


class AcceleratorGrantInput(BaseModel):
    applied_to: Optional[List[str]] = Field(None, description="Accelerators/grants applied to")
    accepted_by: Optional[List[str]] = Field(None, description="Accelerators/grants accepted")
    grant_funding_received: Optional[str] = Field(None, description="Total grant funding received e.g. ₹10,00,000")
    dpiit_recognized: Optional[bool] = Field(None, description="DPIIT startup recognition?")
    iim_iit_incubated: Optional[bool] = Field(None, description="Incubated at IIM/IIT/premier institution?")


class BoardAdvisorInput(BaseModel):
    board_members: Optional[List[Dict[str, str]]] = Field(None, description="List of {name, background, equity_pct}")
    advisors: Optional[List[Dict[str, str]]] = Field(None, description="List of {name, expertise, equity_pct}")
    total_board_size: Optional[int] = Field(None)
    independent_directors: Optional[int] = Field(None)
    advisor_network_reach: Optional[str] = Field(None, description="e.g. '3 advisors with Fortune 500 CXO backgrounds'")


class ExitStrategyInput(BaseModel):
    preferred_exit: Optional[str] = Field(None, description="IPO / Strategic Acquisition / PE Buyout / Secondary")
    target_exit_timeline: Optional[str] = Field(None, description="e.g. '5-7 years'")
    potential_acquirers: Optional[List[str]] = Field(None, description="e.g. ['Zoho', 'Freshworks', 'SAP']")
    comparable_exits: Optional[List[Dict[str, str]]] = Field(
        None, description="e.g. [{company: 'Capillary Tech', exit_value: '$200M', year: '2023'}]"
    )
    target_exit_valuation: Optional[str] = Field(None, description="e.g. ₹100 Cr")


# ── Master External Data Container ────────────────────────────────────────────


class ExternalDataRequest(BaseModel):
    """
    All 32 external data capability inputs bundled together.
    Every field is optional — provide what you have and only those
    capabilities will be enriched.
    """

    # Group D — Document Intelligence
    pitch_deck: Optional[PitchDeckInput] = None
    term_sheet: Optional[TermSheetInput] = None
    financial_model: Optional[FinancialModelInput] = None
    due_diligence: Optional[DueDiligenceInput] = None
    data_room: Optional[DataRoomInput] = None
    one_pager: Optional[OnePagerInput] = None
    reference_letters: Optional[ReferenceLettersInput] = None
    legal_status: Optional[LegalStatusInput] = None
    media_kit: Optional[MediaKitInput] = None

    # Group C — CRM / Investor Pipeline
    investor_pipeline: Optional[InvestorPipelineInput] = None
    meeting_prep: Optional[InvestorMeetingPrepInput] = None
    investor_matching: Optional[InvestorMatchingInput] = None
    vc_targeting: Optional[VCTargetingInput] = None
    pitch_feedback: Optional[PitchFeedbackInput] = None
    objection_library: Optional[ObjectionLibraryInput] = None

    # Group F — Financial Intelligence
    burn_runway: Optional[BurnRunwayInput] = None
    valuation: Optional[ValuationInput] = None
    cap_table: Optional[CapTableInput] = None
    safe_note: Optional[SAFENoteInput] = None
    revenue_metrics: Optional[RevenueMetricsInput] = None
    unit_economics_detail: Optional[UnitEconomicsDetailInput] = None
    fundraising_timeline: Optional[FundraisingTimelineInput] = None

    # Group S — Strategic Intelligence
    competitive_matrix: Optional[CompetitiveMatrixInput] = None
    regulatory: Optional[RegulatoryInput] = None
    ip_tracker: Optional[IPTrackerInput] = None
    partnerships: Optional[PartnershipInput] = None
    accelerator_grant: Optional[AcceleratorGrantInput] = None
    board_advisors: Optional[BoardAdvisorInput] = None
    exit_strategy: Optional[ExitStrategyInput] = None
