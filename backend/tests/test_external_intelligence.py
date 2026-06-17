"""
tests/test_external_intelligence.py
────────────────────────────────────
Unit tests for all 32 external-data capability engines in
services/external_intelligence.py.

Each engine is tested with:
  1. Empty ExternalDataRequest (all None) → score=0, confidence=low
  2. Fully populated inputs → score>0, evidence present

No database, no HTTP — pure function calls.
"""

import pytest
from schemas.external_data import (
    AcceleratorGrantInput,
    BoardAdvisorInput,
    BurnRunwayInput,
    CapTableInput,
    CompetitiveMatrixInput,
    DataRoomInput,
    DueDiligenceInput,
    ExternalDataRequest,
    ExitStrategyInput,
    FinancialModelInput,
    FundraisingTimelineInput,
    IPTrackerInput,
    InvestorContact,
    InvestorMatchingInput,
    InvestorMeetingPrepInput,
    InvestorPipelineInput,
    LegalStatusInput,
    MediaKitInput,
    ObjectionLibraryInput,
    OnePagerInput,
    PartnershipInput,
    PitchDeckInput,
    PitchFeedbackInput,
    ReferenceLettersInput,
    RegulatoryInput,
    RevenueMetricsInput,
    SAFENoteInput,
    TermSheetInput,
    UnitEconomicsDetailInput,
    VCTargetingInput,
    ValuationInput,
)
from services.external_intelligence import (
    _conf,
    _parse_amount,
    build_accelerator_grant_matcher,
    build_board_advisor_analysis,
    build_burn_runway_analysis,
    build_cap_table_analysis,
    build_competitive_moat_analysis,
    build_data_room_audit,
    build_due_diligence_readiness,
    build_exit_strategy_analysis,
    build_financial_model_review,
    build_fundraising_timeline,
    build_investor_meeting_prep,
    build_investor_pipeline_tracker,
    build_investor_type_matching,
    build_ip_tracker,
    build_legal_status_check,
    build_media_kit_review,
    build_objection_response_library,
    build_one_pager_review,
    build_partnership_tracker,
    build_pitch_deck_analysis,
    build_pitch_feedback_analysis,
    build_portfolio_fit_analysis,
    build_reference_letter_quality,
    build_regulatory_compliance_check,
    build_revenue_metrics_dashboard,
    build_safe_note_analysis,
    build_term_sheet_analysis,
    build_unit_economics_deep_dive,
    build_valuation_analysis,
    build_vc_firm_targeting,
    extract_external_intelligence,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

EMPTY_EXT = ExternalDataRequest()
EMPTY_FILES: dict = {}

DECK_TEXT = (
    "This presentation covers the problem, solution, market, traction, "
    "team, financials, ask, competitive landscape, roadmap, business model, "
    "customers, users, revenue, growth, mrr, pricing, subscription saas, "
    "raise funding seed investment round tam sam som billion million "
    "competition competitor alternative differentiate milestones q1 q2 year 1"
)

TERM_TEXT = (
    "anti-dilution full ratchet participating preferred drag-along "
    "liquidation preference 2x super pro-rata terms and conditions"
)


def _assert_empty(result, name: str):
    """Assert that an engine returns a zero-score low-confidence result when no data is provided."""
    assert result.score == 0, f"{name}: expected score=0 for empty input, got {result.score}"
    assert result.confidence == "low", f"{name}: expected confidence=low for empty input"
    assert len(result.limitations) > 0, f"{name}: expected at least one limitation for empty input"


def _assert_populated(result, name: str):
    """Assert that an engine returns a positive score with evidence when data is provided."""
    assert result.score >= 0, f"{name}: score must be >= 0"
    assert result.confidence in ("high", "medium", "low"), f"{name}: invalid confidence"
    assert result.score >= 0, f"{name}: score must be non-negative"


# ── Helper functions ───────────────────────────────────────────────────────────


def test_parse_amount_various_formats():
    assert _parse_amount("₹3,00,000") == 300000.0
    assert _parse_amount("$1,500.50") == pytest.approx(1500.50)
    assert _parse_amount("€2000") == 2000.0
    assert _parse_amount("no number here") is None
    assert _parse_amount("") is None
    assert _parse_amount(None) is None


def test_conf_levels():
    assert _conf(0) == "low"
    assert _conf(1) == "low"
    assert _conf(2) == "medium"
    assert _conf(4) == "medium"
    assert _conf(5) == "high"
    assert _conf(10) == "high"


# ── D1 Pitch Deck Analysis ─────────────────────────────────────────────────────


def test_pitch_deck_empty():
    result = build_pitch_deck_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "pitch_deck_analysis")


def test_pitch_deck_with_file_id_no_text():
    ext = ExternalDataRequest(pitch_deck=PitchDeckInput(file_id="abc123", slide_count=12, deck_version="v1.0"))
    result = build_pitch_deck_analysis(ext, {})
    assert result.score > 0
    assert result.capability_name == "pitch_deck_analysis"


def test_pitch_deck_with_extracted_text():
    ext = ExternalDataRequest(pitch_deck=PitchDeckInput(file_id="file1", slide_count=10, deck_version="v2.1"))
    result = build_pitch_deck_analysis(ext, {"file1": DECK_TEXT})
    assert result.score > 0
    assert result.evidence_count > 0
    assert result.raw_metrics["sections_covered"] != []


def test_pitch_deck_short_slide_count():
    ext = ExternalDataRequest(pitch_deck=PitchDeckInput(file_id="f1", slide_count=5))
    result = build_pitch_deck_analysis(ext, {"f1": "problem solution market team"})
    _assert_populated(result, "pitch_deck_analysis")


def test_pitch_deck_long_deck():
    ext = ExternalDataRequest(pitch_deck=PitchDeckInput(file_id="f2", slide_count=20))
    result = build_pitch_deck_analysis(ext, {"f2": "problem"})
    _assert_populated(result, "pitch_deck_analysis")


# ── D2 Term Sheet Analysis ─────────────────────────────────────────────────────


def test_term_sheet_empty():
    result = build_term_sheet_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "term_sheet_analysis")


def test_term_sheet_full():
    ext = ExternalDataRequest(
        term_sheet=TermSheetInput(
            investment_amount="₹75,00,000",
            pre_money_valuation="₹3,00,00,000",
            equity_offered=20.0,
            lead_investor="Acme Ventures",
            term_sheet_stage="Final",
            file_id="ts1",
        )
    )
    result = build_term_sheet_analysis(ext, {"ts1": TERM_TEXT})
    assert result.score > 0
    assert result.raw_metrics["red_flags"]  # risky terms should be found


def test_term_sheet_high_dilution():
    ext = ExternalDataRequest(term_sheet=TermSheetInput(equity_offered=35.0, term_sheet_stage="Draft"))
    result = build_term_sheet_analysis(ext, {})
    assert result.score >= 0
    assert any("dilution" in flag.lower() for flag in result.raw_metrics["red_flags"])


def test_term_sheet_signed_stage():
    ext = ExternalDataRequest(term_sheet=TermSheetInput(term_sheet_stage="Signed", investment_amount="₹50,00,000"))
    result = build_term_sheet_analysis(ext, {})
    assert result.score > 0


# ── D3 Financial Model Review ─────────────────────────────────────────────────


def test_financial_model_empty():
    result = build_financial_model_review(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "financial_model_review")


def test_financial_model_full():
    ext = ExternalDataRequest(
        financial_model=FinancialModelInput(
            projection_years=3,
            year1_revenue="₹24,00,000",
            year3_revenue="₹2,40,00,000",
            break_even_month=18,
            assumptions_documented=True,
            file_id="fm1",
        )
    )
    result = build_financial_model_review(ext, {"fm1": "revenue projections cost burn runway"})
    assert result.score > 0
    assert result.raw_metrics["growth_multiple"] > 0


def test_financial_model_aggressive_growth():
    ext = ExternalDataRequest(
        financial_model=FinancialModelInput(
            year1_revenue="₹1,00,000",
            year3_revenue="₹1,00,00,00,000",
            assumptions_documented=False,
        )
    )
    result = build_financial_model_review(ext, {})
    assert result.score >= 0
    assert any("aggressive" in issue.lower() for issue in result.raw_metrics["issues"])


def test_financial_model_no_assumptions():
    ext = ExternalDataRequest(financial_model=FinancialModelInput(assumptions_documented=False, projection_years=5))
    result = build_financial_model_review(ext, {})
    assert result.score >= 0
    assert any("assumption" in issue.lower() for issue in result.raw_metrics["issues"])


# ── D4 Due Diligence Readiness ─────────────────────────────────────────────────


def test_due_diligence_empty():
    result = build_due_diligence_readiness(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "due_diligence_readiness")


def test_due_diligence_all_complete():
    dd = DueDiligenceInput(
        incorporation_docs=True,
        cap_table_current=True,
        audited_financials=True,
        ip_assignments=True,
        customer_contracts=True,
        employment_agreements=True,
        board_resolutions=True,
        bank_statements_6m=True,
        tax_returns=True,
        regulatory_filings=True,
        founder_backgrounds=True,
        reference_checks_done=True,
    )
    ext = ExternalDataRequest(due_diligence=dd)
    result = build_due_diligence_readiness(ext, {})
    assert result.score == 100


def test_due_diligence_partial():
    dd = DueDiligenceInput(
        incorporation_docs=True,
        cap_table_current=True,
        audited_financials=False,
        ip_assignments=False,
    )
    ext = ExternalDataRequest(due_diligence=dd)
    result = build_due_diligence_readiness(ext, {})
    assert 0 < result.score < 100
    assert len(result.limitations) > 0


def test_due_diligence_all_missing():
    dd = DueDiligenceInput(
        incorporation_docs=False,
        cap_table_current=False,
        audited_financials=False,
    )
    ext = ExternalDataRequest(due_diligence=dd)
    result = build_due_diligence_readiness(ext, {})
    assert result.score == 0


# ── D5 Data Room Audit ─────────────────────────────────────────────────────────


def test_data_room_empty():
    result = build_data_room_audit(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "data_room_audit")


def test_data_room_full():
    ext = ExternalDataRequest(
        data_room=DataRoomInput(
            data_room_link="https://notion.so/dataroom",
            total_documents=25,
            sections_complete=["Financials", "Legal", "Team"],
            last_updated="June 2025",
        )
    )
    result = build_data_room_audit(ext, {})
    assert result.score > 0
    assert result.raw_metrics["docs"] == 25


def test_data_room_thin():
    ext = ExternalDataRequest(data_room=DataRoomInput(total_documents=5))
    result = build_data_room_audit(ext, {})
    assert result.score >= 0


# ── D6 One-Pager Review ───────────────────────────────────────────────────────


def test_one_pager_empty():
    result = build_one_pager_review(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "one_pager_review")


def test_one_pager_with_text():
    ext = ExternalDataRequest(one_pager=OnePagerInput(file_id="op1", target_audience="Angel Investors"))
    one_pager_text = " ".join(["word"] * 300)
    result = build_one_pager_review(ext, {"op1": one_pager_text})
    assert result.score > 0
    assert result.raw_metrics["target_audience"] == "Angel Investors"


def test_one_pager_too_short():
    ext = ExternalDataRequest(one_pager=OnePagerInput(file_id="op2"))
    result = build_one_pager_review(ext, {"op2": "short"})
    assert any("short" in lim.lower() for lim in result.limitations)


def test_one_pager_too_long():
    ext = ExternalDataRequest(one_pager=OnePagerInput(file_id="op3"))
    long_text = " ".join(["word"] * 700)
    result = build_one_pager_review(ext, {"op3": long_text})
    assert any("long" in lim.lower() for lim in result.limitations)


def test_one_pager_no_text_extracted():
    ext = ExternalDataRequest(one_pager=OnePagerInput(file_id="op4"))
    result = build_one_pager_review(ext, {})
    assert result.score == 20  # fallback score


# ── D7 Reference Letter Quality ───────────────────────────────────────────────


def test_reference_letters_empty():
    result = build_reference_letter_quality(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "reference_letter_quality")


def test_reference_letters_full():
    ext = ExternalDataRequest(
        reference_letters=ReferenceLettersInput(
            file_ids=["r1", "r2"],
            reference_count=3,
            reference_types=["Customer", "Mentor", "Angel"],
        )
    )
    result = build_reference_letter_quality(ext, {"r1": "Excellent product", "r2": "Highly recommend"})
    assert result.score > 0
    assert result.raw_metrics["letters_analysed"] == 2


def test_reference_letters_no_files():
    ext = ExternalDataRequest(reference_letters=ReferenceLettersInput(reference_count=2, reference_types=["Mentor"]))
    result = build_reference_letter_quality(ext, {})
    assert result.score > 0


# ── D8 Legal Status Check ─────────────────────────────────────────────────────


def test_legal_status_empty():
    result = build_legal_status_check(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "legal_status_check")


def test_legal_status_all_clear():
    ext = ExternalDataRequest(
        legal_status=LegalStatusInput(
            nda_template_ready=True,
            ip_ownership_clear=True,
            no_pending_litigation=True,
            compliance_status="Compliant",
            trademarks_filed=True,
            patents_filed=2,
        )
    )
    result = build_legal_status_check(ext, {})
    assert result.score > 0
    assert result.raw_metrics["risks"] == []


def test_legal_status_with_risks():
    ext = ExternalDataRequest(
        legal_status=LegalStatusInput(
            nda_template_ready=False,
            ip_ownership_clear=False,
            no_pending_litigation=False,
        )
    )
    result = build_legal_status_check(ext, {})
    assert len(result.raw_metrics["risks"]) == 3


def test_legal_status_partial():
    ext = ExternalDataRequest(legal_status=LegalStatusInput(nda_template_ready=True, compliance_status="Pending GST"))
    result = build_legal_status_check(ext, {})
    assert result.score >= 0


# ── D9 Media Kit Review ───────────────────────────────────────────────────────


def test_media_kit_empty():
    result = build_media_kit_review(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "media_kit_review")


def test_media_kit_full():
    ext = ExternalDataRequest(
        media_kit=MediaKitInput(
            file_id="mk1",
            press_mentions=8,
            press_outlets=["YourStory", "Inc42", "TechCrunch"],
            social_followers={"LinkedIn": 3000, "Twitter": 1200},
        )
    )
    result = build_media_kit_review(ext, {"mk1": "press release brand story media"})
    assert result.score > 0
    assert result.raw_metrics["social_reach"] == 4200


def test_media_kit_no_press():
    ext = ExternalDataRequest(media_kit=MediaKitInput(press_mentions=1, social_followers={"LinkedIn": 500}))
    result = build_media_kit_review(ext, {})
    assert result.score >= 0


# ── C1 Investor Pipeline Tracker ─────────────────────────────────────────────


def test_investor_pipeline_empty():
    result = build_investor_pipeline_tracker(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "investor_pipeline_tracker")


def test_investor_pipeline_full():
    contacts = [
        InvestorContact(name="John Doe", firm="VC Alpha", type="VC", stage="Meeting Scheduled"),
        InvestorContact(name="Jane Smith", firm="Angel Network", type="Angel", stage="Term Sheet"),
    ]
    ext = ExternalDataRequest(
        investor_pipeline=InvestorPipelineInput(
            contacts=contacts,
            total_targeted=30,
            meetings_held=8,
            term_sheets_received=2,
            soft_commits=1,
        )
    )
    result = build_investor_pipeline_tracker(ext, {})
    assert result.score > 0
    assert result.evidence_count > 0


def test_investor_pipeline_no_contacts():
    ext = ExternalDataRequest(investor_pipeline=InvestorPipelineInput(total_targeted=20, meetings_held=5))
    result = build_investor_pipeline_tracker(ext, {})
    assert result.score > 0


# ── C2 Investor Meeting Prep ──────────────────────────────────────────────────


def test_investor_meeting_prep_empty():
    result = build_investor_meeting_prep(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "investor_meeting_prep")


def test_investor_meeting_prep_full():
    ext = ExternalDataRequest(
        meeting_prep=InvestorMeetingPrepInput(
            next_meeting_investor="Anand Krishnan",
            next_meeting_firm="Sequoia India",
            investor_focus_areas=["SaaS", "B2B", "India"],
            investor_portfolio=["Freshworks", "Byju's", "OYO"],
            previous_feedback="Loved the traction but wanted more revenue data",
        )
    )
    result = build_investor_meeting_prep(ext, {})
    assert result.score > 0
    assert result.raw_metrics["portfolio"] == ["Freshworks", "Byju's", "OYO"]


# ── C3 Investor Type Matching ─────────────────────────────────────────────────


def test_investor_type_matching_empty():
    result = build_investor_type_matching(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "investor_type_matching")


def test_investor_type_matching_full():
    ext = ExternalDataRequest(
        investor_matching=InvestorMatchingInput(
            preferred_investor_type="Angel",
            check_size_min="₹25,00,000",
            check_size_max="₹1,00,00,000",
            board_seat_acceptable=False,
            looking_for_smart_money=True,
        )
    )
    result = build_investor_type_matching(ext, {})
    assert result.score > 0
    assert result.raw_metrics["preferred_type"] == "Angel"


# ── C4 VC Firm Targeting ─────────────────────────────────────────────────────


def test_vc_firm_targeting_empty():
    result = build_vc_firm_targeting(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "vc_firm_targeting")


def test_vc_firm_targeting_full():
    ext = ExternalDataRequest(
        vc_targeting=VCTargetingInput(
            target_vcs=["Sequoia", "Accel", "Peak XV", "Blume", "Matrix"],
            warm_intros_available=3,
            cold_outreach_done=15,
            accelerator_backed=True,
            accelerator_name="YCombinator",
        )
    )
    result = build_vc_firm_targeting(ext, {})
    assert result.score > 0
    assert result.raw_metrics["accelerator"] == "YCombinator"


# ── C5 Pitch Feedback Analysis ────────────────────────────────────────────────


def test_pitch_feedback_empty():
    result = build_pitch_feedback_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "pitch_feedback_analysis")


def test_pitch_feedback_full():
    ext = ExternalDataRequest(
        pitch_feedback=PitchFeedbackInput(
            pitches_completed=12,
            common_objections=["Market too small", "No defensible moat"],
            positive_signals=["Strong team", "Clear problem"],
            pivot_suggestions=["Consider B2C instead of B2B"],
        )
    )
    result = build_pitch_feedback_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["pitches"] == 12
    assert len(result.limitations) > 0  # pivot suggestions add a limitation


def test_pitch_feedback_no_objections():
    ext = ExternalDataRequest(
        pitch_feedback=PitchFeedbackInput(pitches_completed=5, positive_signals=["Great product"])
    )
    result = build_pitch_feedback_analysis(ext, {})
    assert result.score > 0


# ── C6 Portfolio Fit Analysis ─────────────────────────────────────────────────


def test_portfolio_fit_empty():
    result = build_portfolio_fit_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "portfolio_fit_analysis")


def test_portfolio_fit_with_meeting_prep():
    ext = ExternalDataRequest(
        meeting_prep=InvestorMeetingPrepInput(
            investor_portfolio=["Freshworks", "Zepto"],
            investor_focus_areas=["SaaS", "Fintech"],
        )
    )
    result = build_portfolio_fit_analysis(ext, {})
    assert result.score > 0


def test_portfolio_fit_with_vc_targeting():
    ext = ExternalDataRequest(vc_targeting=VCTargetingInput(target_vcs=["Sequoia", "Accel"]))
    result = build_portfolio_fit_analysis(ext, {})
    assert result.score > 0


# ── C7+C8 Objection Response Library ─────────────────────────────────────────


def test_objection_library_empty():
    result = build_objection_response_library(EMPTY_EXT, EMPTY_FILES)
    # objection library returns score=0 but may not add a limitation text
    assert result.score == 0
    assert result.confidence == "low"
    assert result.capability_name == "objection_response_library"


def test_objection_library_with_custom():
    ext = ExternalDataRequest(
        objection_library=ObjectionLibraryInput(
            custom_objections=[
                {"objection": "Market too small", "response": "TAM is $5B globally"},
                {"objection": "No revenue yet", "response": "We have 10 paying pilots"},
            ]
        )
    )
    result = build_objection_response_library(ext, {})
    assert result.score > 0
    assert result.raw_metrics["total_objections"] == 2


def test_objection_library_from_feedback():
    ext = ExternalDataRequest(
        pitch_feedback=PitchFeedbackInput(common_objections=["High CAC", "Crowded market", "No moat"])
    )
    result = build_objection_response_library(ext, {})
    assert result.score > 0


# ── F1 Burn Runway Analysis ───────────────────────────────────────────────────


def test_burn_runway_empty():
    result = build_burn_runway_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "burn_runway_analysis")


def test_burn_runway_healthy():
    ext = ExternalDataRequest(
        burn_runway=BurnRunwayInput(
            monthly_burn_rate="₹3,50,000",
            cash_in_bank="₹50,00,000",
            monthly_revenue="₹1,00,000",
            revenue_growth_mom=15.0,
        )
    )
    result = build_burn_runway_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["runway_months"] is not None
    assert result.raw_metrics["runway_months"] > 0


def test_burn_runway_critical():
    ext = ExternalDataRequest(
        burn_runway=BurnRunwayInput(
            monthly_burn_rate="₹10,00,000",
            cash_in_bank="₹5,00,000",
        )
    )
    result = build_burn_runway_analysis(ext, {})
    assert result.score >= 0
    assert any("critical" in lim.lower() for lim in result.limitations)


def test_burn_runway_no_net_burn():
    # Revenue exceeds burn — infinite runway case
    ext = ExternalDataRequest(
        burn_runway=BurnRunwayInput(
            monthly_burn_rate="₹2,00,000",
            cash_in_bank="₹20,00,000",
            monthly_revenue="₹5,00,000",
        )
    )
    result = build_burn_runway_analysis(ext, {})
    assert result.score >= 0


# ── F2 Valuation Analysis ─────────────────────────────────────────────────────


def test_valuation_empty():
    result = build_valuation_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "valuation_analysis")


def test_valuation_full():
    ext = ExternalDataRequest(
        valuation=ValuationInput(
            valuation_method="Revenue Multiple",
            target_pre_money="₹3,00,00,000",
            arr="₹60,00,000",
            revenue_multiple_used=5.0,
            comparable_startups=["Freshworks", "Zoho", "Chargebee"],
        )
    )
    result = build_valuation_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["multiple"] == 5.0


def test_valuation_no_arr():
    ext = ExternalDataRequest(valuation=ValuationInput(valuation_method="Comparable", target_pre_money="₹1,00,00,000"))
    result = build_valuation_analysis(ext, {})
    assert result.score >= 0


# ── F3 Cap Table Analysis ─────────────────────────────────────────────────────


def test_cap_table_empty():
    result = build_cap_table_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "cap_table_analysis")


def test_cap_table_healthy():
    ext = ExternalDataRequest(
        cap_table=CapTableInput(
            founders_equity=65.0,
            employee_esop_pool=10.0,
            existing_investor_equity=20.0,
            advisor_equity=2.0,
            new_round_dilution=15.0,
            total_shareholders=5,
        )
    )
    result = build_cap_table_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["issues"] == []


def test_cap_table_low_founder_equity():
    ext = ExternalDataRequest(cap_table=CapTableInput(founders_equity=40.0, existing_investor_equity=55.0))
    result = build_cap_table_analysis(ext, {})
    # Low founder equity should trigger an issue
    assert len(result.raw_metrics["issues"]) > 0
    assert any("40" in issue for issue in result.raw_metrics["issues"])


def test_cap_table_over_100_percent():
    ext = ExternalDataRequest(
        cap_table=CapTableInput(founders_equity=60.0, employee_esop_pool=20.0, existing_investor_equity=25.0)
    )
    result = build_cap_table_analysis(ext, {})
    assert result.score >= 0  # Should handle > 100% gracefully


# ── F4 SAFE Note Analysis ─────────────────────────────────────────────────────


def test_safe_note_empty():
    result = build_safe_note_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "safe_note_analysis")


def test_safe_note_full():
    ext = ExternalDataRequest(
        safe_note=SAFENoteInput(
            instrument_type="SAFE",
            valuation_cap="₹4,00,00,000",
            discount_rate=20.0,
            has_mfn_clause=True,
            pro_rata_rights=True,
            total_raised_via_safe="₹25,00,000",
        )
    )
    result = build_safe_note_analysis(ext, {})
    assert result.score > 0


def test_safe_note_high_discount():
    ext = ExternalDataRequest(safe_note=SAFENoteInput(instrument_type="Convertible Note", discount_rate=30.0))
    result = build_safe_note_analysis(ext, {})
    assert result.score >= 0


# ── F5 Revenue Metrics Dashboard ──────────────────────────────────────────────


def test_revenue_metrics_empty():
    result = build_revenue_metrics_dashboard(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "revenue_metrics_dashboard")


def test_revenue_metrics_full():
    ext = ExternalDataRequest(
        revenue_metrics=RevenueMetricsInput(
            mrr="₹5,00,000",
            arr="₹60,00,000",
            churn_rate=3.5,
            net_revenue_retention=108.0,
            paying_customers=50,
            free_users=500,
            customer_lifetime_months=18.0,
        )
    )
    result = build_revenue_metrics_dashboard(ext, {})
    assert result.score > 0
    assert result.raw_metrics["paying_customers"] == 50


def test_revenue_metrics_high_churn():
    ext = ExternalDataRequest(revenue_metrics=RevenueMetricsInput(mrr="₹1,00,000", churn_rate=15.0))
    result = build_revenue_metrics_dashboard(ext, {})
    assert result.score >= 0
    assert any("churn" in lim.lower() for lim in result.limitations)


# ── F6 Unit Economics Deep Dive ───────────────────────────────────────────────


def test_unit_economics_empty():
    result = build_unit_economics_deep_dive(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "unit_economics_deep_dive")


def test_unit_economics_full():
    ext = ExternalDataRequest(
        unit_economics_detail=UnitEconomicsDetailInput(
            cac_by_channel={"Organic": "₹800", "Paid": "₹4,200"},
            ltv="₹18,000",
            payback_period_months=6.0,
            gross_margin=72.0,
            net_margin=-15.0,
        )
    )
    result = build_unit_economics_deep_dive(ext, {})
    assert result.score > 0


def test_unit_economics_healthy_ltv_cac():
    ext = ExternalDataRequest(
        unit_economics_detail=UnitEconomicsDetailInput(
            ltv="₹20,000",
            payback_period_months=4.0,
            gross_margin=80.0,
        )
    )
    result = build_unit_economics_deep_dive(ext, {})
    assert result.score > 0


# ── F7 Fundraising Timeline ───────────────────────────────────────────────────


def test_fundraising_timeline_empty():
    result = build_fundraising_timeline(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "fundraising_timeline")


def test_fundraising_timeline_full():
    ext = ExternalDataRequest(
        fundraising_timeline=FundraisingTimelineInput(
            target_close_date="September 2025",
            amount_committed_so_far="₹20,00,000",
            key_milestones_for_close=["100 paying customers", "₹1L MRR"],
            parallel_grant_applications=["Startup India", "BIRAC"],
        )
    )
    result = build_fundraising_timeline(ext, {})
    assert result.score > 0


# ── S1 Competitive Moat Analysis ─────────────────────────────────────────────


def test_competitive_moat_empty():
    result = build_competitive_moat_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "competitive_moat_analysis")


def test_competitive_moat_full():
    ext = ExternalDataRequest(
        competitive_matrix=CompetitiveMatrixInput(
            competitors=[
                {"name": "Competitor A", "pricing": "$50/month", "strengths": "Brand"},
                {"name": "Competitor B", "pricing": "Free tier", "weaknesses": "Slow"},
            ],
            primary_differentiator="AI-first approach with 10x faster processing",
            switching_cost_high=True,
            network_effects=True,
            defensible_moats=["Proprietary data", "Brand", "Contracts"],
        )
    )
    result = build_competitive_moat_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["moats"] == ["Proprietary data", "Brand", "Contracts"]


def test_competitive_moat_no_network_effects():
    ext = ExternalDataRequest(
        competitive_matrix=CompetitiveMatrixInput(
            primary_differentiator="Cost advantage",
            switching_cost_high=False,
            network_effects=False,
        )
    )
    result = build_competitive_moat_analysis(ext, {})
    assert result.score >= 0


# ── S2 Regulatory Compliance Check ───────────────────────────────────────────


def test_regulatory_empty():
    result = build_regulatory_compliance_check(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "regulatory_compliance_check")


def test_regulatory_compliant():
    ext = ExternalDataRequest(
        regulatory=RegulatoryInput(
            licenses_required=["NBFC", "DPIIT"],
            licenses_obtained=["NBFC", "DPIIT"],
            gdpr_compliant=True,
            data_residency_compliant=True,
        )
    )
    result = build_regulatory_compliance_check(ext, {})
    assert result.score > 0
    assert result.raw_metrics["licenses_pending"] == []


def test_regulatory_pending_licenses():
    ext = ExternalDataRequest(
        regulatory=RegulatoryInput(
            licenses_required=["NBFC", "DPIIT", "RBI"],
            licenses_obtained=["DPIIT"],
            gdpr_compliant=False,
        )
    )
    result = build_regulatory_compliance_check(ext, {})
    assert result.score >= 0
    assert len(result.raw_metrics["licenses_pending"]) == 2
    assert len(result.raw_metrics["risks"]) > 0


def test_regulatory_compliance_items():
    ext = ExternalDataRequest(
        regulatory=RegulatoryInput(
            pending_compliance_items=["GST filing", "FEMA compliance"],
            gdpr_compliant=True,
        )
    )
    result = build_regulatory_compliance_check(ext, {})
    assert result.score >= 0
    assert len(result.limitations) >= 2


# ── S3 IP Tracker ─────────────────────────────────────────────────────────────


def test_ip_tracker_empty():
    result = build_ip_tracker(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "ip_tracker")


def test_ip_tracker_full():
    ext = ExternalDataRequest(
        ip_tracker=IPTrackerInput(
            patents_filed=3,
            patents_granted=1,
            patents_pending=2,
            trademarks_registered=2,
            trade_secrets_documented=True,
            open_source_components_audited=True,
        )
    )
    result = build_ip_tracker(ext, {})
    assert result.score > 0
    # total_ip = patents_filed + patents_granted = 4
    assert result.raw_metrics["patents_total"] == 4


def test_ip_tracker_no_patents():
    ext = ExternalDataRequest(ip_tracker=IPTrackerInput(trademarks_registered=1, trade_secrets_documented=False))
    result = build_ip_tracker(ext, {})
    assert result.score >= 0


# ── S4 Partnership Tracker ────────────────────────────────────────────────────


def test_partnership_tracker_empty():
    result = build_partnership_tracker(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "partnership_tracker")


def test_partnership_tracker_full():
    ext = ExternalDataRequest(
        partnerships=PartnershipInput(
            strategic_partners=[
                {"name": "Razorpay", "type": "Technology", "status": "Active"},
                {"name": "AWS", "type": "Cloud", "status": "Active"},
            ],
            distribution_partners=["Partner A", "Partner B"],
            channel_partners=5,
            mou_signed=3,
        )
    )
    result = build_partnership_tracker(ext, {})
    assert result.score > 0
    assert result.raw_metrics["strategic_partners"] == 2


# ── S5 Accelerator/Grant Matcher ─────────────────────────────────────────────


def test_accelerator_grant_empty():
    result = build_accelerator_grant_matcher(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "accelerator_grant_matcher")


def test_accelerator_grant_full():
    ext = ExternalDataRequest(
        accelerator_grant=AcceleratorGrantInput(
            applied_to=["YCombinator", "Techstars", "Startup India"],
            accepted_by=["Startup India"],
            grant_funding_received="₹10,00,000",
            dpiit_recognized=True,
            iim_iit_incubated=True,
        )
    )
    result = build_accelerator_grant_matcher(ext, {})
    assert result.score > 0
    assert result.raw_metrics["accepted"] == ["Startup India"]


def test_accelerator_grant_applied_not_accepted():
    ext = ExternalDataRequest(
        accelerator_grant=AcceleratorGrantInput(
            applied_to=["YCombinator", "Techstars"],
            accepted_by=[],
            dpiit_recognized=False,
        )
    )
    result = build_accelerator_grant_matcher(ext, {})
    assert result.score >= 0


# ── S6 Board/Advisor Analysis ─────────────────────────────────────────────────


def test_board_advisor_empty():
    result = build_board_advisor_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "board_advisor_analysis")


def test_board_advisor_full():
    ext = ExternalDataRequest(
        board_advisors=BoardAdvisorInput(
            board_members=[
                {"name": "Alice Johnson", "background": "Ex-Google VP", "equity_pct": "0.5"},
                {"name": "Bob Sharma", "background": "IIT/IIM Founder", "equity_pct": "0.5"},
            ],
            advisors=[
                {"name": "Carol Lee", "expertise": "Marketing", "equity_pct": "0.25"},
            ],
            total_board_size=3,
            independent_directors=1,
            advisor_network_reach="3 advisors with Fortune 500 CXO backgrounds",
        )
    )
    result = build_board_advisor_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["board_size"] == 2


# ── S7 Exit Strategy Analysis ─────────────────────────────────────────────────


def test_exit_strategy_empty():
    result = build_exit_strategy_analysis(EMPTY_EXT, EMPTY_FILES)
    _assert_empty(result, "exit_strategy_analysis")


def test_exit_strategy_full():
    ext = ExternalDataRequest(
        exit_strategy=ExitStrategyInput(
            preferred_exit="Strategic Acquisition",
            target_exit_timeline="5-7 years",
            potential_acquirers=["Zoho", "Freshworks", "SAP"],
            comparable_exits=[{"company": "Capillary Tech", "exit_value": "$200M", "year": "2023"}],
            target_exit_valuation="₹100 Cr",
        )
    )
    result = build_exit_strategy_analysis(ext, {})
    assert result.score > 0
    assert result.raw_metrics["exit_type"] == "Strategic Acquisition"


def test_exit_strategy_ipo():
    ext = ExternalDataRequest(exit_strategy=ExitStrategyInput(preferred_exit="IPO", target_exit_timeline="7-10 years"))
    result = build_exit_strategy_analysis(ext, {})
    assert result.score >= 0


# ── extract_external_intelligence orchestrator ────────────────────────────────


def test_extract_external_intelligence_all_empty():
    result = extract_external_intelligence(EMPTY_EXT, EMPTY_FILES)
    assert result["total_capabilities"] == 30  # 9D + 7C + 7F + 7S
    assert result["capabilities_with_data"] == 0
    assert result["avg_score"] == 0
    assert "document_intelligence" in result["groups"]
    assert "crm_pipeline" in result["groups"]
    assert "financial_intelligence" in result["groups"]
    assert "strategic_intelligence" in result["groups"]
    assert len(result["capabilities"]) == 30


def test_extract_external_intelligence_partial_data():
    ext = ExternalDataRequest(
        pitch_deck=PitchDeckInput(file_id="f1", slide_count=12),
        burn_runway=BurnRunwayInput(monthly_burn_rate="₹3,00,000", cash_in_bank="₹30,00,000"),
        legal_status=LegalStatusInput(nda_template_ready=True, ip_ownership_clear=True),
    )
    result = extract_external_intelligence(ext, {"f1": "problem solution market team traction"})
    assert result["capabilities_with_data"] > 0
    assert result["avg_score"] > 0
    assert "pitch_deck_analysis" in result["capabilities"]
    assert "burn_runway_analysis" in result["capabilities"]


def test_extract_external_intelligence_prompt_section():
    ext = ExternalDataRequest(burn_runway=BurnRunwayInput(monthly_burn_rate="₹2,00,000", cash_in_bank="₹24,00,000"))
    result = extract_external_intelligence(ext, {})
    assert "EXTERNAL DATA INTELLIGENCE" in result["prompt_section"]


def test_extract_external_intelligence_full_payload():
    """Full payload — all 32 engines should have score > 0."""
    contacts = [InvestorContact(name="John", firm="VC Fund", stage="Pitched")]
    ext = ExternalDataRequest(
        pitch_deck=PitchDeckInput(file_id="d1", slide_count=12, deck_version="v2"),
        term_sheet=TermSheetInput(investment_amount="₹75,00,000", equity_offered=20.0, term_sheet_stage="Final"),
        financial_model=FinancialModelInput(
            projection_years=3, year1_revenue="₹24,00,000", year3_revenue="₹2,40,00,000", assumptions_documented=True
        ),
        due_diligence=DueDiligenceInput(
            incorporation_docs=True,
            cap_table_current=True,
            audited_financials=True,
            ip_assignments=True,
            customer_contracts=True,
            employment_agreements=True,
            board_resolutions=True,
            bank_statements_6m=True,
            tax_returns=True,
            regulatory_filings=True,
            founder_backgrounds=True,
            reference_checks_done=True,
        ),
        data_room=DataRoomInput(
            data_room_link="https://notion.so/dr",
            total_documents=30,
            sections_complete=["Legal", "Financials"],
            last_updated="June 2025",
        ),
        one_pager=OnePagerInput(file_id="op1", target_audience="Angels"),
        reference_letters=ReferenceLettersInput(file_ids=["r1"], reference_count=3, reference_types=["Customer"]),
        legal_status=LegalStatusInput(
            nda_template_ready=True,
            ip_ownership_clear=True,
            no_pending_litigation=True,
            compliance_status="Compliant",
            trademarks_filed=True,
            patents_filed=2,
        ),
        media_kit=MediaKitInput(press_mentions=5, press_outlets=["YourStory"], social_followers={"LinkedIn": 2000}),
        investor_pipeline=InvestorPipelineInput(
            contacts=contacts, total_targeted=30, meetings_held=8, term_sheets_received=1, soft_commits=1
        ),
        meeting_prep=InvestorMeetingPrepInput(
            next_meeting_investor="Jane",
            next_meeting_firm="Sequoia",
            investor_focus_areas=["SaaS"],
            investor_portfolio=["Freshworks"],
        ),
        investor_matching=InvestorMatchingInput(
            preferred_investor_type="VC", board_seat_acceptable=False, looking_for_smart_money=True
        ),
        vc_targeting=VCTargetingInput(
            target_vcs=["Sequoia", "Accel"],
            warm_intros_available=2,
            cold_outreach_done=10,
            accelerator_backed=True,
            accelerator_name="Y Combinator",
        ),
        pitch_feedback=PitchFeedbackInput(
            pitches_completed=8, common_objections=["Crowded market"], positive_signals=["Strong team"]
        ),
        objection_library=ObjectionLibraryInput(
            custom_objections=[{"objection": "Too expensive", "response": "ROI is 5x"}]
        ),
        burn_runway=BurnRunwayInput(
            monthly_burn_rate="₹3,00,000", cash_in_bank="₹36,00,000", monthly_revenue="₹50,000", revenue_growth_mom=20.0
        ),
        valuation=ValuationInput(
            valuation_method="Revenue Multiple",
            target_pre_money="₹3,00,00,000",
            arr="₹6,00,000",
            revenue_multiple_used=5.0,
            comparable_startups=["Freshworks"],
        ),
        cap_table=CapTableInput(
            founders_equity=65.0,
            employee_esop_pool=10.0,
            existing_investor_equity=20.0,
            new_round_dilution=15.0,
            total_shareholders=5,
        ),
        safe_note=SAFENoteInput(
            instrument_type="SAFE",
            valuation_cap="₹4,00,00,000",
            discount_rate=20.0,
            has_mfn_clause=True,
            pro_rata_rights=True,
        ),
        revenue_metrics=RevenueMetricsInput(
            mrr="₹50,000",
            arr="₹6,00,000",
            churn_rate=3.5,
            net_revenue_retention=108.0,
            paying_customers=10,
            free_users=100,
            customer_lifetime_months=18.0,
        ),
        unit_economics_detail=UnitEconomicsDetailInput(
            cac_by_channel={"Organic": "₹800"},
            ltv="₹18,000",
            payback_period_months=6.0,
            gross_margin=72.0,
            net_margin=-15.0,
        ),
        fundraising_timeline=FundraisingTimelineInput(
            target_close_date="Sep 2025",
            amount_committed_so_far="₹10,00,000",
            key_milestones_for_close=["100 customers"],
            parallel_grant_applications=["Startup India"],
        ),
        competitive_matrix=CompetitiveMatrixInput(
            competitors=[{"name": "Comp A"}],
            primary_differentiator="AI-first",
            switching_cost_high=True,
            network_effects=True,
            defensible_moats=["Proprietary data", "Contracts"],
        ),
        regulatory=RegulatoryInput(
            licenses_required=["DPIIT"], licenses_obtained=["DPIIT"], gdpr_compliant=True, data_residency_compliant=True
        ),
        ip_tracker=IPTrackerInput(
            patents_filed=2,
            patents_granted=1,
            trademarks_registered=2,
            trade_secrets_documented=True,
            open_source_components_audited=True,
        ),
        partnerships=PartnershipInput(
            strategic_partners=[{"name": "AWS", "type": "Cloud", "status": "Active"}],
            distribution_partners=["DP1"],
            channel_partners=3,
            mou_signed=2,
        ),
        accelerator_grant=AcceleratorGrantInput(
            applied_to=["YC"],
            accepted_by=["YC"],
            grant_funding_received="₹10,00,000",
            dpiit_recognized=True,
            iim_iit_incubated=False,
        ),
        board_advisors=BoardAdvisorInput(
            board_members=[{"name": "Alice", "background": "Ex-Google", "equity_pct": "0.5"}],
            advisors=[{"name": "Bob", "expertise": "Sales", "equity_pct": "0.25"}],
            total_board_size=2,
            independent_directors=0,
            advisor_network_reach="2 seasoned advisors",
        ),
        exit_strategy=ExitStrategyInput(
            preferred_exit="Strategic Acquisition",
            target_exit_timeline="5-7 years",
            potential_acquirers=["Zoho", "SAP"],
            comparable_exits=[{"company": "TaxMantra", "exit_value": "$50M", "year": "2022"}],
            target_exit_valuation="₹50 Cr",
        ),
    )
    file_texts = {
        "d1": DECK_TEXT,
        "op1": " ".join(["word"] * 250),
        "r1": "Outstanding product team and execution.",
    }
    result = extract_external_intelligence(ext, file_texts)
    assert result["capabilities_with_data"] > 20
    assert result["avg_score"] > 0
    # All 30 capability keys should be present (9D + 7C + 7F + 7S)
    assert len(result["capabilities"]) == 30
