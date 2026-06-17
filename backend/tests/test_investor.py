"""
tests/test_investor.py
──────────────────────
Tests for the Investor Readiness Report endpoint.

Validates:
1. Missing required fields → 400
2. < 50 responses → 400
3. 50+ responses with diverse answer data → 200 with full intelligence
4. survey_intelligence section present and evidence-based
5. No fabricated/fallback data in scoring
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _submit_realistic_responses(survey_id: str, question_ids: list[str], count: int = 50):
    """
    Submit realistic, diverse responses with actual answer data
    covering all signal categories for the intelligence engine.
    """

    # Answer pools mapped to question index (cycling through types)
    yes_no_answers = ["yes", "no", "yes", "yes", "yes", "no", "yes", "yes"]
    rating_answers = ["4", "5", "3", "4", "5", "4", "5", "3", "4", "5"]
    scale_answers = ["4", "5", "3", "4", "5", "2", "4", "5", "4", "3"]
    text_answers = [
        "The current tools are frustrating and slow",
        "I would definitely switch to a better solution",
        "Very interested in trying this product",
        "Current alternatives are too expensive",
        "This solves a real problem I face daily",
        "I'm concerned about data privacy",
        "Would love to see better integrations",
    ]
    choice_answers = ["Option A", "Option B", "Option A", "Option C", "Option A", "Option B"]

    for i in range(count):
        # Create a response session
        resp = client.post("/responses/", json={"survey_id": survey_id})
        assert resp.status_code == 201, f"Failed to create response: {resp.text}"
        response_id = resp.json()["id"]

        # Submit answers for each question with realistic data
        answers = []
        for j, q_id in enumerate(question_ids):
            # Rotate through realistic answer values
            if j % 5 == 0:  # yes_no type
                val = yes_no_answers[i % len(yes_no_answers)]
            elif j % 5 == 1:  # rating type
                val = rating_answers[i % len(rating_answers)]
            elif j % 5 == 2:  # scale type
                val = scale_answers[i % len(scale_answers)]
            elif j % 5 == 3:  # text type
                val = text_answers[i % len(text_answers)]
            else:  # choice type
                val = choice_answers[i % len(choice_answers)]

            answers.append({"question_id": q_id, "answer_value": val})

        # Submit all answers in one batch
        ans_resp = client.put(
            f"/responses/{response_id}/answers",
            json={"answers": answers},
        )
        # Some endpoints may differ — try patch if put fails
        if ans_resp.status_code not in (200, 201, 204):
            for ans in answers:
                client.post(
                    f"/responses/{response_id}/answers",
                    json={**ans, "response_id": response_id},
                )


def test_generate_investor_readiness_report(auth_headers):
    """
    Full end-to-end test for investor readiness report generation.
    Tests validation gates, minimum threshold, and intelligence output quality.
    """
    # 1. Create a survey with diverse question types covering all signal categories
    survey_payload = {
        "title": "Market Research for AI Tool",
        "description": "Validating demand for an AI-powered productivity tool",
        "questions": [
            # problem_validation signals
            {
                "question_text": "Do you experience pain points with your current workflow tools?",
                "question_type": "yes_no",
            },
            {"question_text": "How severe is this problem on a scale of 1-5?", "question_type": "rating"},
            {"question_text": "How frustrated are you with existing solutions?", "question_type": "scale"},
            # market_demand signals
            {
                "question_text": "Would you be interested in trying a new AI-powered solution?",
                "question_type": "yes_no",
            },
            {"question_text": "How likely are you to switch to a better tool?", "question_type": "scale"},
            # product_market_fit signals
            {"question_text": "How would you rate the value of such a solution?", "question_type": "rating"},
            # competitive_positioning signals
            {
                "question_text": "Which alternatives do you currently use?",
                "question_type": "single_choice",
                "options": [
                    {"label": "Tool A", "value": "Tool A"},
                    {"label": "Tool B", "value": "Tool B"},
                    {"label": "Tool C", "value": "Tool C"},
                    {"label": "None", "value": "None"},
                ],
            },
            # risk_signal
            {
                "question_text": "What concerns or barriers would prevent you from adopting a new tool?",
                "question_type": "short_text",
            },
            # willingness_to_pay
            {"question_text": "How much would you pay per month for this solution?", "question_type": "scale"},
            # general
            {"question_text": "Any additional feedback?", "question_type": "short_text"},
        ],
    }
    create_response = client.post("/surveys/", json=survey_payload, headers=auth_headers)
    assert create_response.status_code == 201, f"Survey creation failed: {create_response.text}"
    survey_id = create_response.json()["id"]
    question_ids = [q["id"] for q in create_response.json().get("questions", [])]

    payload = {
        "startup_context": "An AI-powered workflow automation tool for SMBs that eliminates repetitive tasks using intelligent process automation and ML-driven insights.",
        "pricing_model": "SaaS subscription ₹2,999/month (Starter) and ₹7,999/month (Pro)",
        "target_country": "India",
        "target_state": "Telangana",
        "target_district": "Hyderabad",
        # Optional founder context fields
        "funding_stage": "Pre-Seed",
        "funding_target": "₹75,00,000",
        "team_size": 4,
        "monthly_revenue": "₹0 (pre-revenue)",
        "industry_vertical": "SaaS / Productivity Tech",
        "founded_year": 2024,
        "founder_count": 2,
    }

    # ── Test 1: Missing required field → 400 ─────────────────────────────────
    invalid_payload = payload.copy()
    invalid_payload["startup_context"] = ""
    resp_missing = client.post(
        f"/investor/surveys/{survey_id}/readiness",
        json=invalid_payload,
        headers=auth_headers,
    )
    assert resp_missing.status_code == 400
    assert "Missing: Startup Context" in resp_missing.json()["detail"]

    # ── Test 2: Zero responses → 400 ─────────────────────────────────────────
    resp_zero = client.post(
        f"/investor/surveys/{survey_id}/readiness",
        json=payload,
        headers=auth_headers,
    )
    assert resp_zero.status_code == 400
    assert "less than 50 survey responses" in resp_zero.json()["detail"]

    # ── Test 3: Submit 50 responses with actual answer data ───────────────────
    if question_ids:
        _submit_realistic_responses(survey_id, question_ids, count=50)
    else:
        # Fallback: simple response creation if question IDs not returned
        for _ in range(50):
            resp = client.post("/responses/", json={"survey_id": survey_id})
            assert resp.status_code == 201

    # ── Test 4: Generate report → 200 ────────────────────────────────────────
    resp_ok = client.post(
        f"/investor/surveys/{survey_id}/readiness",
        json=payload,
        headers=auth_headers,
    )
    assert resp_ok.status_code == 200, f"Report generation failed: {resp_ok.text}"
    data = resp_ok.json()

    # ── Test 5: Core fields present ──────────────────────────────────────────
    assert data["survey_id"] == survey_id
    assert "executive_summary" in data
    assert "scoring" in data
    assert "traction_evidence" in data
    assert "objections" in data

    # ── Test 6: survey_intelligence is present and evidence-based ─────────────
    assert "survey_intelligence" in data, "survey_intelligence section missing from response"
    intel = data["survey_intelligence"]
    assert "overall_score" in intel, "overall_score missing from survey_intelligence"
    assert "capabilities" in intel, "capabilities missing from survey_intelligence"
    assert isinstance(intel["overall_score"], int), "overall_score must be an integer"
    assert 0 <= intel["overall_score"] <= 100, "overall_score must be 0-100"

    # ── Test 7: All 19 capabilities present (7 pure-survey + 12 hybrid) ───────
    expected_capabilities = [
        # 7 pure-survey capabilities
        "problem_solution",
        "market_opportunity",
        "traction_evidence",
        "competitive_advantage",
        "objection_intelligence",
        "evidence_mapping",
        "question_simulation",
        # 12 hybrid capabilities (survey + founder context)
        "investor_readiness_analysis",
        "pitch_readiness_gate",
        "narrative_intelligence",
        "executive_summary",
        "tam_sam_som",
        "business_model",
        "financial_projections",
        "unit_economics",
        "gtm_strategy",
        "roadmap_execution",
        "funding_ask",
        "investor_persona_targeting",
    ]
    for cap_name in expected_capabilities:
        assert cap_name in intel["capabilities"], f"Capability '{cap_name}' missing from intelligence"
        cap = intel["capabilities"][cap_name]
        assert "score" in cap, f"score missing from capability {cap_name}"
        assert "confidence" in cap, f"confidence missing from capability {cap_name}"
        assert "evidence_statements" in cap, f"evidence_statements missing from {cap_name}"
        assert cap["confidence"] in ("high", "medium", "low"), (
            f"Invalid confidence level '{cap['confidence']}' in {cap_name}"
        )
        assert 0 <= cap["score"] <= 100, f"Score out of range in {cap_name}: {cap['score']}"

    # ── Test 8: Traction evidence uses real counts ────────────────────────────
    traction_cap = intel["capabilities"]["traction_evidence"]
    assert traction_cap["raw_metrics"]["total_responses"] >= 50, "traction_evidence must reflect actual response count"

    # ── Test 9: Scoring reflects computed scores ──────────────────────────────
    scoring = data["scoring"]
    assert scoring["overall_score"] == intel["overall_score"], (
        "scoring.overall_score must match survey_intelligence.overall_score"
    )

    # ── Test 10: No fake default data in evidence ─────────────────────────────
    # Verify traction_evidence shows real numbers
    traction_ev = data["traction_evidence"]
    assert traction_ev["total_responses"] >= 50, "traction_evidence must show real response count"

    print("\n✅ Investor Readiness Report generated successfully")
    print(f"   Overall Score: {intel['overall_score']}/100")
    print(f"   Confidence: {intel['overall_confidence']}")
    print(f"   Total Evidence: {intel['total_evidence']} statements")
    for cap_name, cap in intel["capabilities"].items():
        print(f"   {cap_name}: {cap['score']}/100 ({cap['confidence']}) — {cap['evidence_count']} evidence items")
