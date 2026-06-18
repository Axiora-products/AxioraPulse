"""
tests/test_ca_agent.py
──────────────────────
Unit and integration tests for routes/ca_agent.py — helper functions
and the /ca-agent/surveys/{id}/analyze endpoint.
"""

import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from routes.ca_agent import (
    CAFounderInputs,
    _build_demographics,
    _parse_amount,
    _fmt_inr,
    _build_founder_section,
)

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"
MISSING_ID = "00000000-0000-0000-0000-000000000000"

_MOCK_INTEL = {
    "prompt_section": "Mock intelligence section",
    "overall_score": 75,
    "total_evidence": 20,
    "capabilities": {},
}

_MOCK_CA_RESULT = {
    "survey_id": SURVEY_ID,
    "survey_title": "Test Survey",
    "agent_version": "CA-1.0",
    "data_quality_score": 75,
    "total_data_points_analyzed": 100,
    "geography": "India",
    "industry_vertical": "Tech",
    "business_profile": {},
    "problem_statement": {},
    "solution_overview": {},
    "market_opportunity": {},
    "business_model": {},
    "revenue_streams": [],
    "competitive_analysis": {},
    "gtm_strategy": {},
    "financial_projections": {},
    "funding_requirements": {},
    "product_roadmap": [],
    "team_and_vision": {},
    "traction_highlights": {
        "total_survey_responses": 0,
        "completion_rate": {},
        "positive_validation_ratio": {},
        "average_rating": {},
        "key_traction_points": [],
        "geographic_reach": {},
    },
    "investor_readiness": {},
    "cross_validation_summary": {},
}


# ── _parse_amount ─────────────────────────────────────────────────────────────


def test_parse_amount_none():
    assert _parse_amount(None) is None


def test_parse_amount_empty_string():
    assert _parse_amount("") is None


def test_parse_amount_plain_number():
    assert _parse_amount("500000") == 500000.0


def test_parse_amount_comma_formatted():
    assert _parse_amount("4,00,000") == 400000.0


def test_parse_amount_rupee_symbol():
    assert _parse_amount("₹500000") == 500000.0


def test_parse_amount_lakh_l():
    assert _parse_amount("80l") == pytest.approx(80 * 1_00_000)


def test_parse_amount_lakh_full():
    assert _parse_amount("80lakh") == pytest.approx(80 * 1_00_000)


def test_parse_amount_lakh_plural():
    assert _parse_amount("80lakhs") == pytest.approx(80 * 1_00_000)


def test_parse_amount_crore_short():
    assert _parse_amount("4cr") == pytest.approx(4 * 1_00_00_000)


def test_parse_amount_crore_full():
    assert _parse_amount("4crore") == pytest.approx(4 * 1_00_00_000)


def test_parse_amount_k_suffix():
    assert _parse_amount("500k") == pytest.approx(500 * 1_000)


def test_parse_amount_invalid_returns_none():
    assert _parse_amount("abc") is None


def test_parse_amount_decimal_crore():
    assert _parse_amount("1.5cr") == pytest.approx(1.5 * 1_00_00_000)


def test_parse_amount_strips_spaces():
    assert _parse_amount("  5lakh  ") == pytest.approx(5 * 1_00_000)


# ── _fmt_inr ──────────────────────────────────────────────────────────────────


def test_fmt_inr_small_amount():
    assert _fmt_inr(500) == "₹500"


def test_fmt_inr_exact_lakh():
    result = _fmt_inr(1_00_000)
    assert "L" in result and "₹" in result


def test_fmt_inr_below_lakh():
    result = _fmt_inr(50_000)
    assert "₹50,000" == result


def test_fmt_inr_crore():
    result = _fmt_inr(1_00_00_000)
    assert "Cr" in result and "₹" in result


def test_fmt_inr_large_crore():
    result = _fmt_inr(10_00_00_000)
    assert "Cr" in result


def test_fmt_inr_strips_trailing_zeros():
    result = _fmt_inr(2_00_000)
    assert result.endswith("L") or "L" in result


# ── _build_demographics ───────────────────────────────────────────────────────


class _MockResponse:
    def __init__(self, city=None, occupation=None, age_range=None):
        self.city = city
        self.occupation = occupation
        self.age_range = age_range


def test_build_demographics_empty_list():
    result = _build_demographics([])
    assert result["top_cities"] == []
    assert result["top_occupations"] == []
    assert result["top_age_ranges"] == []
    assert result["distinct_cities"] == 0
    assert result["distinct_occupations"] == 0


def test_build_demographics_none_fields_excluded():
    result = _build_demographics([_MockResponse()])
    assert result["distinct_cities"] == 0
    assert result["distinct_occupations"] == 0


def test_build_demographics_counts_cities():
    responses = [
        _MockResponse("Hyderabad", "Engineer", "25-34"),
        _MockResponse("Hyderabad", "Manager", "35-44"),
        _MockResponse("Mumbai", "Engineer", "25-34"),
    ]
    result = _build_demographics(responses)
    assert result["distinct_cities"] == 2
    assert result["top_cities"][0] == ("Hyderabad", 2)


def test_build_demographics_top5_limit():
    responses = [_MockResponse(f"City{i}") for i in range(10)]
    result = _build_demographics(responses)
    assert len(result["top_cities"]) == 5


def test_build_demographics_occupation_and_age():
    responses = [
        _MockResponse(occupation="Engineer", age_range="25-34"),
        _MockResponse(occupation="Engineer", age_range="35-44"),
        _MockResponse(occupation="Manager", age_range="25-34"),
    ]
    result = _build_demographics(responses)
    assert result["distinct_occupations"] == 2
    assert result["top_occupations"][0] == ("Engineer", 2)


# ── _build_founder_section ────────────────────────────────────────────────────


def test_build_founder_section_all_none_returns_empty():
    assert _build_founder_section(CAFounderInputs()) == ""


def test_build_founder_section_business_model_and_city():
    fi = CAFounderInputs(business_model_type="SaaS", target_launch_city="Hyderabad")
    result = _build_founder_section(fi)
    assert "Business Model: SaaS" in result
    assert "Target Launch City: Hyderabad" in result


def test_build_founder_section_current_stage():
    fi = CAFounderInputs(current_stage="Seed")
    result = _build_founder_section(fi)
    assert "Stage context" in result
    assert "Seed" in result


def test_build_founder_section_monthly_revenue_computes_market():
    fi = CAFounderInputs(monthly_revenue_target="10lakh")
    result = _build_founder_section(fi)
    assert "PRE-COMPUTED MARKET FIGURES" in result
    assert "SAM" in result
    assert "TAM" in result
    assert "SOM" in result
    assert "Market Growth Rate" in result


def test_build_founder_section_price_and_monthly_compute_unit_economics():
    fi = CAFounderInputs(monthly_revenue_target="10lakh", price_per_customer="500")
    result = _build_founder_section(fi)
    assert "PRE-COMPUTED UNIT ECONOMICS" in result
    assert "customers" in result.lower()


def test_build_founder_section_funding_alone():
    fi = CAFounderInputs(funding_ask="50lakh")
    result = _build_founder_section(fi)
    assert "PRE-COMPUTED FUNDING" in result
    assert "₹" in result


def test_build_founder_section_funding_with_monthly_adds_runway():
    fi = CAFounderInputs(monthly_revenue_target="10lakh", funding_ask="50lakh")
    result = _build_founder_section(fi)
    assert "runway" in result


def test_build_founder_section_invalid_amount_skips_market_block():
    fi = CAFounderInputs(monthly_revenue_target="notanumber")
    result = _build_founder_section(fi)
    assert "FOUNDER-PROVIDED INPUTS" in result
    assert "PRE-COMPUTED MARKET FIGURES" not in result


def test_build_founder_section_all_fields():
    fi = CAFounderInputs(
        monthly_revenue_target="5lakh",
        price_per_customer="500",
        funding_ask="50lakh",
        business_model_type="SaaS",
        target_launch_city="Hyderabad",
        current_stage="Seed",
    )
    result = _build_founder_section(fi)
    assert "Business Model: SaaS" in result
    assert "PRE-COMPUTED MARKET FIGURES" in result
    assert "PRE-COMPUTED UNIT ECONOMICS" in result
    assert "PRE-COMPUTED FUNDING" in result
    assert "Stage context" in result
    assert "runway" in result


# ── Endpoint: /ca-agent/surveys/{id}/analyze ─────────────────────────────────


def test_ca_agent_survey_not_found(auth_headers):
    response = client.post(
        f"/ca-agent/surveys/{MISSING_ID}/analyze",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_ca_agent_success(auth_headers):
    with patch("routes.ca_agent.call_ai_sync", return_value=json.dumps(_MOCK_CA_RESULT)), \
         patch("routes.ca_agent.extract_survey_intelligence", return_value=_MOCK_INTEL):
        response = client.post(
            f"/ca-agent/surveys/{SURVEY_ID}/analyze",
            json={},
            headers=auth_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["survey_id"] == SURVEY_ID
    assert data["survey_title"] == "Test Survey"


def test_ca_agent_malformed_json_from_ai(auth_headers):
    with patch("routes.ca_agent.call_ai_sync", return_value="not-valid-json { broken"), \
         patch("routes.ca_agent.extract_survey_intelligence", return_value=_MOCK_INTEL):
        response = client.post(
            f"/ca-agent/surveys/{SURVEY_ID}/analyze",
            json={},
            headers=auth_headers,
        )
    assert response.status_code == 502


def test_ca_agent_ai_provider_error(auth_headers):
    with patch("routes.ca_agent.call_ai_sync", side_effect=Exception("AI down")), \
         patch("routes.ca_agent.extract_survey_intelligence", return_value=_MOCK_INTEL):
        response = client.post(
            f"/ca-agent/surveys/{SURVEY_ID}/analyze",
            json={},
            headers=auth_headers,
        )
    assert response.status_code == 503


def test_ca_agent_with_full_founder_inputs(auth_headers):
    payload = {
        "monthly_revenue_target": "5lakh",
        "price_per_customer": "500",
        "funding_ask": "50lakh",
        "business_model_type": "SaaS",
        "target_launch_city": "Hyderabad",
        "current_stage": "Seed",
    }
    with patch("routes.ca_agent.call_ai_sync", return_value=json.dumps(_MOCK_CA_RESULT)), \
         patch("routes.ca_agent.extract_survey_intelligence", return_value=_MOCK_INTEL):
        response = client.post(
            f"/ca-agent/surveys/{SURVEY_ID}/analyze",
            json=payload,
            headers=auth_headers,
        )
    assert response.status_code == 200


def test_ca_agent_unauthenticated():
    response = client.post(
        f"/ca-agent/surveys/{SURVEY_ID}/analyze",
        json={},
    )
    assert response.status_code == 401
