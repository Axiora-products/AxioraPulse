# backend/routes/ca_agent.py
"""
Content Analysis (CA) Agent — Execution Phase
Auto-gathers all platform data and generates investor-ready pitch content
with confidence levels and cross-validated estimates.
"""

import json
import re
from collections import Counter
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from db.database import get_db
from db.models import UserProfile, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
from dependencies import get_current_user
from core.rate_limiter import limiter
from services.ai_provider import call_ai_sync
from services.survey_intelligence import extract_survey_intelligence, FounderContext


class CAFounderInputs(BaseModel):
    monthly_revenue_target: Optional[str] = None
    price_per_customer: Optional[str] = None
    funding_ask: Optional[str] = None
    business_model_type: Optional[str] = None
    target_launch_city: Optional[str] = None
    current_stage: Optional[str] = None


router = APIRouter(prefix="/ca-agent", tags=["ca-agent"])

_CA_SYSTEM_INSTRUCTION = (
    "You are a startup pitch content writer and data analyst. Your job is to turn survey data and business information "
    "into clear, mathematically sound pitch content.\n"
    "EVIDENCE EXTRACTION RULE (CRITICAL):\n"
    "Before generating any section of the report, you MUST first extract structured evidence from the Survey, Guidance, Roadmap, and Execution data modules provided below. "
    "You must build a root-level list of these evidence points called 'evidence_manifest' in the output JSON. Each evidence point must have a unique ID (e.g. 'EVID-1', 'EVID-2', etc.), a source_module ('Survey', 'Guidance', 'Roadmap', or 'Execution'), a metric_or_signal, and a raw_data_reference.\n"
    "TRACEABLE EVIDENCE CHAIN:\n"
    "Every single insight, score, recommendation, and financial estimate generated in the JSON MUST reference one or more extracted evidence points by their IDs in an 'evidence_refs' array field. No metric or value may be generated without a traceable evidence chain pointing to the manifest.\n"
    "\n"
    "MISSING DATA ESTIMATION POLICY (NO EMPTY FIELDS ALLOWED):\n"
    "If required quantitative data (such as TAM/SAM/SOM, CAC, LTV, Return Ratio, Profit Margin, Payback Period, Funding Ask, Runway, or Funding Stage) is unavailable, generate a 'Reasonable Estimate' using category-specific industry benchmarks for the target geography.\n"
    "If qualitative data (such as Vision Statement, Mission Statement, Roadmap Phases, or Pitch Narrative) is unavailable, you MUST generate a plausible, compelling version of it based on the startup's industry, problem, and solution.\n"
    "Under NO circumstances can any field in the JSON structure be left blank, null, or empty. You MUST generate a value for every field.\n"
    "To satisfy the Traceable Evidence Chain rule for these estimated values, you can create a benchmark-based evidence point in the 'evidence_manifest' (e.g. 'Standard B2B SaaS Benchmark for India') and reference its ID in the 'evidence_refs' array. All financial and funding fields must be populated with sector-appropriate estimates tailored to the target geography.\n"
    "ESTIMATION FORMULAS:\n"
    "- If TAM/SAM/SOM is unavailable, estimate using:\n"
    "  TAM = Potential Customers * Estimated Annual Revenue Per Customer\n"
    "  SAM = TAM * Reachable Market %\n"
    "  SOM = SAM * Expected Market Share %\n"
    "- If CAC is unavailable, estimate using industry benchmarks.\n"
    "- If LTV is unavailable, estimate using:\n"
    "  LTV = Estimated Annual Revenue * Estimated Retention Years * Estimated Gross Margin\n"
    "- If Funding Ask is unavailable, estimate runway needs using: Monthly Burn * Desired Runway Months. Provide allocation assumptions.\n"
    "ESTIMATION RULE:\n"
    "Never present estimated values as factual. Every value object in the output JSON has 'source' and 'confidence'.\n"
    "- For actual values (directly supported by survey or founder data), set 'source': 'SURVEY_DATA' or 'CROSS_VALIDATED' and 'confidence': 'HIGH' or 'MEDIUM'.\n"
    "- For estimated values (benchmark-based, derived from benchmarks/assumptions), set 'source': 'ESTIMATED' or 'BENCHMARK' and 'confidence': 'LOW'.\n"
    "For every estimated value, you MUST also add two fields to the object:\n"
    "1. 'estimation_method': A description of the method used to estimate (e.g. standard formulas/benchmarks).\n"
    "2. 'assumptions': An array of strings representing the assumptions used.\n"
    "Example for estimated CAC:\n"
    '"cac": {"value": "₹8,000", "source": "ESTIMATED", "confidence": "LOW", "basis": "Estimated via industry benchmarks", "estimation_method": "Based on average B2B EdTech customer acquisition costs in India and expected pilot-school outreach model.", "assumptions": ["Direct founder-led sales", "Hyderabad-focused launch", "Small sales team"], "evidence_refs": ["EVID-3"]}\n'
    "\n"
    "LANGUAGE RULES (strictly enforced):\n"
    "1. Write like you are explaining to a smart friend who has never run a startup.\n"
    "2. Every 'value' field: maximum 1-2 short sentences. No long paragraphs.\n"
    "3. No jargon. Instead of 'CAC' write 'cost to get one customer'. Use plain words always.\n"
    "4. Numbers must be specific and written simply: '₹500 per order'.\n"
    "5. The 'basis' field: explicitly state the exact calculation or logic used to derive the number.\n"
    "All money values must use the currency for the target geography (₹ for India).\n"
    "Respond with valid raw JSON only — no markdown, no text outside the JSON."
)


def _build_demographics(responses):
    cities = Counter(r.city for r in responses if r.city)
    occupations = Counter(r.occupation for r in responses if r.occupation)
    age_ranges = Counter(r.age_range for r in responses if r.age_range)
    return {
        "top_cities": cities.most_common(5),
        "top_occupations": occupations.most_common(5),
        "top_age_ranges": age_ranges.most_common(5),
        "distinct_cities": len(cities),
        "distinct_occupations": len(occupations),
    }


def _parse_amount(s: str) -> float | None:
    """Extract a numeric rupee value from a user-typed string like '4,00,000' or '₹4L' or '80lakh'."""
    if not s:
        return None
    s = s.strip().replace("₹", "").replace(",", "").replace(" ", "").lower()
    # Handle shorthand: 4cr, 4crore, 80l, 80lakh, 80lakhs
    m = re.match(r"^([\d.]+)(cr|crore|l|lakh|lakhs|k)?$", s)
    if not m:
        return None
    val = float(m.group(1))
    suffix = m.group(2) or ""
    if suffix in ("cr", "crore"):
        val *= 1_00_00_000
    elif suffix in ("l", "lakh", "lakhs"):
        val *= 1_00_000
    elif suffix == "k":
        val *= 1_000
    return val


def _fmt_inr(amount: float) -> str:
    """Format a rupee amount as a human-readable string."""
    cr = 1_00_00_000
    lakh = 1_00_000
    if amount >= cr:
        return f"₹{amount / cr:.2f} Cr".rstrip("0").rstrip(".")
    elif amount >= lakh:
        return f"₹{amount / lakh:.2f} L".rstrip("0").rstrip(".")
    else:
        return f"₹{amount:,.0f}"


def _build_founder_section(fi: CAFounderInputs) -> str:
    has_any = any(
        [
            fi.monthly_revenue_target,
            fi.price_per_customer,
            fi.funding_ask,
            fi.business_model_type,
            fi.target_launch_city,
            fi.current_stage,
        ]
    )
    if not has_any:
        return ""

    lines = ["== FOUNDER-PROVIDED INPUTS (pre-computed — DO NOT override these values) =="]
    if fi.business_model_type:
        lines.append(f"Business Model: {fi.business_model_type}")
    if fi.target_launch_city:
        lines.append(f"Target Launch City: {fi.target_launch_city}")
    if fi.current_stage:
        lines.append(f"Current Stage: {fi.current_stage}")

    # ── Pre-compute financials in Python so the AI cannot override them ─────────
    monthly = _parse_amount(fi.monthly_revenue_target)
    price = _parse_amount(fi.price_per_customer)
    funding = _parse_amount(fi.funding_ask)

    if monthly:
        year1 = monthly * 12
        som = year1  # SOM = what the founder says they'll earn in Year 1
        sam = som / 0.07  # SAM = SOM ÷ 7% early-stage capture rate
        tam = sam / 0.10  # TAM = SAM ÷ 10% market penetration
        growth_rate = int((sam / tam) * 100 + (som / sam) * 100)  # Derive a % from the ratios (e.g., 10 + 7 = 17)

        lines.append("")
        lines.append("PRE-COMPUTED MARKET FIGURES — use these EXACT values, do not recalculate:")
        lines.append(f"  Year 1 Revenue (monthly × 12) = {_fmt_inr(year1)}")
        lines.append(f"  SOM = {_fmt_inr(som)}  ← founder's Year 1 revenue target")
        lines.append(f"  SAM = {_fmt_inr(sam)}  ← SOM ÷ 7% capture rate (Hyderabad-level market)")
        lines.append(f"  TAM = {_fmt_inr(tam)}  ← SAM ÷ 10% penetration (total category market)")
        lines.append(f"  Market Growth Rate = {growth_rate}% per year")
        lines.append(
            "  These are FIXED. market_opportunity.tam/sam/som and market_growth_rate must use these exact figures."
        )
        lines.append("  Source for all: FOUNDER_INPUT. Confidence: HIGH.")
        lines.append(
            f"  Basis: 'Founder stated ₹{_fmt_inr(monthly)}/month target; market sizes and growth rate mathematically derived from standard SAM/TAM penetration ratios.'"
        )

    if price and monthly:
        year1 = monthly * 12
        year1_customers = int(year1 / price)
        lines.append("")
        lines.append("PRE-COMPUTED UNIT ECONOMICS — use these EXACT values:")
        lines.append(f"  Implied Year 1 customers: ~{year1_customers:,} (Year 1 revenue ÷ price per customer)")
        lines.append(f"  Price per customer: {_fmt_inr(price)}")
        lines.append(
            f"  Estimated LTV = price × 6 months retention = {_fmt_inr(price * 6)} (adjust for category if needed)"
        )
        lines.append(f"  All unit economics must be consistent with {year1_customers:,} customers in Year 1.")

    if funding:
        lines.append("")
        lines.append("PRE-COMPUTED FUNDING — use these EXACT values:")
        lines.append(f"  Funding ask = {_fmt_inr(funding)}  (EXACT — source: FOUNDER_INPUT, confidence: HIGH)")
        lines.append(
            f"  Typical split: 35% Product ({_fmt_inr(funding * 0.35)}), 30% Marketing ({_fmt_inr(funding * 0.30)}), 25% Hiring ({_fmt_inr(funding * 0.25)}), 10% Reserve ({_fmt_inr(funding * 0.10)})"
        )
        if monthly:
            year1 = monthly * 12
            monthly_burn = year1 / 12 * 1.5  # burn is ~1.5x revenue in early stage
            runway = funding / monthly_burn
            lines.append(f"  Estimated runway = {runway:.0f} months")

    if fi.current_stage:
        lines.append("")
        lines.append(
            f"Stage context: This is an '{fi.current_stage}' stage startup. All projections, readiness scores, and investor type recommendations must reflect this early stage."
        )

    return "\n".join(lines)


def _build_ca_prompt(
    survey, questions, responses, answers, guidance, intelligence, founder_inputs: CAFounderInputs = None
):
    total = len(responses)
    demo = _build_demographics(responses)

    # Questions summary
    q_lines = [f"  Q{q.sort_order}: [{q.question_type}] {q.question_text}" for q in questions[:35]]
    q_summary = "\n".join(q_lines) if q_lines else "No questions found."

    # Guidance sections
    competitors = guidance.get("competitors", [])
    persona = guidance.get("persona", {})
    roadmap_steps = guidance.get("roadmap", [])
    opportunities = guidance.get("opportunities", [])
    viability = guidance.get("viabilityScore", "N/A")
    category = guidance.get("category", "")
    loc = guidance.get("location") or {}
    country = loc.get("country") or guidance.get("location_country") or ""
    state = loc.get("state") or guidance.get("location_state") or ""
    district = loc.get("district") or guidance.get("location_district") or ""

    parts = [p for p in [district, state, country] if p]
    geography_str = ", ".join(parts) if parts else "Not specified"

    # Intelligence
    intel_section = intelligence.get("prompt_section", "No intelligence computed.")
    overall_score = intelligence.get("overall_score", 0)
    total_evidence = intelligence.get("total_evidence", 0)

    # Capability scores
    caps = intelligence.get("capabilities", {})
    cap_scores = {k: v.get("score", 0) for k, v in caps.items()}

    fi = founder_inputs or CAFounderInputs()
    founder_section = _build_founder_section(fi)

    prompt = f"""You are the CA (Content Analysis) Agent. Analyze ALL platform data below and generate a complete investor pitch content package.

{founder_section}

== SURVEY OVERVIEW ==
Title: {survey.title}
Description: {survey.description or "Not provided"}
Total Completed Responses: {total}
Overall Intelligence Score: {overall_score}/100
Total Evidence Points: {total_evidence}
Industry Category (from guidance): {category or "Not specified — please infer the industry vertical from the survey title and description."}
Geography: {geography_str}

== SURVEY QUESTIONS ({len(questions)} total) ==
{q_summary}

== RESPONDENT DEMOGRAPHICS (from {total} responses) ==
Top Cities: {demo["top_cities"]}
Top Occupations: {demo["top_occupations"]}
Age Ranges: {demo["top_age_ranges"]}
Distinct Cities Represented: {demo["distinct_cities"]}
Distinct Occupations Represented: {demo["distinct_occupations"]}

== PLATFORM GUIDANCE DATA ==
Market Viability Score: {viability}/100
Target Persona: {json.dumps(persona, indent=2) if persona else "Not available"}
Strategic Opportunities Identified: {json.dumps(opportunities, indent=2) if opportunities else "Not available"}

== COMPETITOR INTELLIGENCE (from platform guidance) ==
{json.dumps(competitors[:6], indent=2) if competitors else "No competitor data available — use industry knowledge"}

== EXECUTION ROADMAP (from platform guidance) ==
{json.dumps(roadmap_steps[:5], indent=2) if roadmap_steps else "No roadmap data available"}

== SURVEY INTELLIGENCE (19 capability engines) ==
Capability Scores: {json.dumps(cap_scores, indent=2)}

{intel_section}

== CA AGENT OUTPUT — Generate this EXACT JSON structure ==
STRICT RULES:
1. "value" fields: specific answer, max 1-2 short plain sentences. No paragraphs. No jargon.
2. Write as if explaining to someone who has never heard of startups or investing.
3. For actual values (supported by survey/founder data), set 'source': 'SURVEY_DATA' or 'CROSS_VALIDATED' and 'confidence': 'HIGH' or 'MEDIUM'.
4. For estimated values (benchmark-based), set 'source': 'ESTIMATED' or 'BENCHMARK', 'confidence': 'LOW', and include 'estimation_method' (string) and 'assumptions' (list of strings).
5. Every field MUST contain 'evidence_refs' referencing one or more evidence point IDs from the 'evidence_manifest'.
6. basis: explicitly state the exact calculation or logic used to derive the number.
7. All money in the currency for the target geography (₹ for India).
8. Replace all jargon in values: CAC → "cost to get one customer", LTV → "lifetime value per customer", etc.

{{
  "survey_id": "{survey.id}",
  "survey_title": "{survey.title}",
  "agent_version": "CA-1.0",
  "data_quality_score": <0-100 integer>,
  "total_data_points_analyzed": <integer>,
  "geography": "{geography_str}",
  "industry_vertical": "{category}",

  "evidence_manifest": [
    {{
      "id": "EVID-1",
      "source_module": "Survey|Guidance|Roadmap|Execution",
      "metric_or_signal": "Description of the evidence point",
      "raw_data_reference": "Specific survey question or guidance milestone/row index"
    }}
  ],

  "business_profile": {{
    "industry_vertical": {{"value": "...", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "...", "evidence_refs": ["EVID-1"]}},
    "business_stage": {{"value": "Idea/MVP/Early Traction/Growth", "confidence": "...", "source": "...", "basis": "...", "evidence_refs": []}},
    "geographic_focus": {{"value": "city, state, country", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "based on respondent city distribution", "evidence_refs": []}},
    "target_customer": {{"value": "...", "confidence": "...", "source": "...", "basis": "...", "evidence_refs": []}}
  }},

  "problem_statement": {{
    "headline": {{"value": "Short bold problem title — max 10 words, plain English", "confidence": "...", "source": "...", "basis": "..."}},
    "description": {{"value": "1 sentence: what problem people face and why it hurts them. Plain English only.", "confidence": "...", "source": "...", "basis": "Short plain sentence on how you know this"}},
    "pain_intensity_score": {{"value": "A number from 0-10", "confidence": "...", "source": "...", "basis": "Short plain sentence"}},
    "affected_population": {{"value": "Who has this problem — e.g. 'Working professionals in Hyderabad aged 25-35'", "confidence": "...", "source": "...", "basis": "..."}},
    "current_alternatives": {{"value": "What people do today to solve this — 1 short sentence", "confidence": "...", "source": "...", "basis": "..."}}
  }},

  "solution_overview": {{
    "headline": {{"value": "1 sentence: what the product does, in plain words", "confidence": "...", "source": "...", "basis": "..."}},
    "description": {{"value": "2 short sentences max: what it does and how it helps. No jargon.", "confidence": "...", "source": "...", "basis": "..."}},
    "key_features": [
      {{"value": "Feature in plain words — e.g. 'Order food from local hidden gems near you'", "confidence": "...", "source": "..."}},
      {{"value": "Feature 2 in plain words", "confidence": "...", "source": "..."}},
      {{"value": "Feature 3 in plain words", "confidence": "...", "source": "..."}}
    ],
    "unique_value_proposition": {{"value": "1 sentence: what makes this different from everything else out there", "confidence": "...", "source": "...", "basis": "..."}}
  }},

  "market_opportunity": {{
    "tam": {{"value": "Total market size as a currency figure e.g. ₹18,500 Cr", "confidence": "...", "source": "...", "basis": "Plain sentence: e.g. 'Total food discovery spend across India's urban population'"}},
    "sam": {{"value": "Specific currency figure for the reachable part of that market", "confidence": "...", "source": "...", "basis": "Plain sentence: e.g. 'Food discovery spend in Hyderabad and nearby cities'"}},
    "som": {{"value": "Specific currency figure we can realistically capture", "confidence": "...", "source": "...", "basis": "Plain sentence: e.g. 'Based on X% of survey respondents saying they would use this'"}},
    "adoption_intent_pct": {{"value": "X% of survey respondents said they would use this", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "Directly from survey responses"}},
    "market_growth_rate": {{"value": "X% per year growth", "confidence": "...", "source": "...", "basis": "Short plain sentence"}},
    "key_demand_signals": [{{"value": "1 plain sentence showing real demand — e.g. '8 out of 10 respondents said they struggle to find quality local food options'", "confidence": "...", "source": "SURVEY_DATA"}}]
  }},

  "business_model": {{
    "model_type": {{"value": "Simple label e.g. 'Sells directly to customers online'", "confidence": "...", "source": "...", "basis": "..."}},
    "description": {{"value": "1 sentence: how the business earns money, in plain words", "confidence": "...", "source": "...", "basis": "..."}},
    "pricing_strategy": {{"value": "How much customers pay and how — e.g. '₹499 per order, no subscription needed'", "confidence": "...", "source": "...", "basis": "..."}}
  }},

  "revenue_streams": [
    {{
      "stream_name": "Plain name — e.g. 'Order Commission'",
      "description": {{"value": "1 sentence: how this stream earns money", "confidence": "...", "source": "...", "basis": "..."}},
      "projected_contribution_pct": {{"value": "X% of total revenue", "confidence": "...", "source": "...", "basis": "..."}},
      "timeline_to_revenue": {{"value": "e.g. 'From day one' or 'Month 3'", "confidence": "...", "source": "..."}}
    }}
  ],

  "competitive_analysis": {{
    "positioning_statement": {{"value": "1 sentence: who this is for and why it beats alternatives, in plain words", "confidence": "...", "source": "...", "basis": "..."}},
    "key_differentiators": [
      {{"value": "Short plain phrase — e.g. 'Only app focused on hidden local food spots'", "confidence": "...", "source": "..."}},
      {{"value": "Differentiator 2 in plain words", "confidence": "...", "source": "..."}},
      {{"value": "Differentiator 3 in plain words", "confidence": "...", "source": "..."}}
    ],
    "competitive_moat": {{"value": "1 sentence: what makes this hard for competitors to copy", "confidence": "...", "source": "...", "basis": "..."}},
    "competitors": [
      {{
        "name": "Competitor name",
        "threat_level": "High|Medium|Low",
        "core_offering": "What they do in plain words",
        "pricing": "How much they charge",
        "our_advantage": "Why we win against them — plain words"
      }}
    ]
  }},

  "gtm_strategy": {{
    "primary_channel": {{"value": "Main way to reach customers — e.g. 'Instagram and food influencers'", "confidence": "...", "source": "...", "basis": "..."}},
    "secondary_channels": [{{"value": "Other channel in plain words", "confidence": "...", "source": "..."}}],
    "target_segments": [
      {{"segment": "Who exactly — e.g. 'Office workers aged 25-35 in Hyderabad'", "size_estimate": "Approximate number of people", "priority": "High|Medium|Low", "confidence": "...", "source": "..."}}
    ],
    "launch_strategy": {{"value": "1-2 sentences: how we start — first steps, plain English", "confidence": "...", "source": "...", "basis": "..."}},
    "cac_strategy": {{"value": "How we get customers cheaply — 1 plain sentence", "confidence": "...", "source": "...", "basis": "..."}},
    "growth_lever": {{"value": "The main thing that will make us grow fast — 1 plain sentence", "confidence": "...", "source": "...", "basis": "..."}}
  }},

  "financial_projections": {{
    "unit_economics": {{
      "cac": {{"value": "Cost to get one new customer — e.g. '₹350'", "confidence": "...", "source": "...", "basis": "Short plain sentence"}},
      "ltv": {{"value": "Total money earned from one customer over time — e.g. '₹2,100'", "confidence": "...", "source": "...", "basis": "Short plain sentence"}},
      "ltv_cac_ratio": {{"value": "For every ₹1 spent getting a customer, we earn ₹X — e.g. '6:1'", "confidence": "...", "source": "...", "basis": "..."}},
      "gross_margin": {{"value": "Profit kept after paying direct costs — e.g. '65%'", "confidence": "...", "source": "...", "basis": "..."}},
      "payback_period": {{"value": "How long to recover what we spent getting a customer — e.g. '4 months'", "confidence": "...", "source": "...", "basis": "..."}}
    }},
    "yearly": [
      {{
        "year": "Year 1",
        "revenue": {{"value": "Specific currency figure", "confidence": "...", "basis": "..."}},
        "operating_cost": {{"value": "Specific currency figure", "confidence": "..."}},
        "headcount": {{"value": "X people", "confidence": "..."}},
        "net_margin": {{"value": "X%", "confidence": "..."}}
      }},
      {{
        "year": "Year 2",
        "revenue": {{"value": "Specific currency figure", "confidence": "...", "basis": "..."}},
        "operating_cost": {{"value": "Specific currency figure", "confidence": "..."}},
        "headcount": {{"value": "X people", "confidence": "..."}},
        "net_margin": {{"value": "X%", "confidence": "..."}}
      }},
      {{
        "year": "Year 3",
        "revenue": {{"value": "Specific currency figure", "confidence": "...", "basis": "..."}},
        "operating_cost": {{"value": "Specific currency figure", "confidence": "..."}},
        "headcount": {{"value": "X people", "confidence": "..."}},
        "net_margin": {{"value": "X%", "confidence": "..."}}
      }}
    ]
  }},

  "funding_requirements": {{
    "ask_amount": {{"value": "How much money we are raising — e.g. '₹50,00,000'", "confidence": "...", "source": "...", "basis": "..."}},
    "funding_stage": {{"value": "Stage of funding — e.g. 'Pre-Seed' or 'Seed'", "confidence": "...", "source": "...", "basis": "..."}},
    "runway_months": {{"value": "How many months this funding will last — e.g. '18 months'", "confidence": "...", "source": "..."}},
    "use_of_funds": [
      {{"category": "Building the product", "percentage": "X%", "amount": "₹ figure", "rationale": "1 plain sentence on why"}},
      {{"category": "Getting customers", "percentage": "X%", "amount": "₹ figure", "rationale": "1 plain sentence on why"}},
      {{"category": "Team & operations", "percentage": "X%", "amount": "₹ figure", "rationale": "1 plain sentence on why"}}
    ],
    "key_milestones_for_raise": ["What we will achieve with this money — plain sentence", "Milestone 2 in plain words"]
  }},

  "product_roadmap": [
    {{
      "phase": "Short phase name — e.g. 'Launch & Learn'",
      "timeline": "e.g. Month 1-3",
      "focus_area": "e.g. Product / Marketing / Sales",
      "goals": "1 sentence: what we achieve in this phase, in plain words",
      "key_milestones": ["Short plain milestone", "Another short milestone"],
      "estimated_cost": {{"value": "₹ figure for this phase", "confidence": "...", "source": "..."}}
    }},
    {{
      "phase": "Phase 2 name",
      "timeline": "...",
      "focus_area": "...",
      "goals": "1 sentence in plain words",
      "key_milestones": ["...", "..."],
      "estimated_cost": {{"value": "...", "confidence": "...", "source": "..."}}
    }},
    {{
      "phase": "Phase 3 name",
      "timeline": "...",
      "focus_area": "...",
      "goals": "1 sentence in plain words",
      "key_milestones": ["...", "..."],
      "estimated_cost": {{"value": "...", "confidence": "...", "source": "..."}}
    }}
  ],

  "team_and_vision": {{
    "vision_statement": {{"value": "Where we want to be in 10 years — 1 plain sentence", "confidence": "...", "source": "...", "basis": "..."}},
    "mission_statement": {{"value": "What we do every day and why — 1 plain sentence", "confidence": "...", "source": "...", "basis": "..."}},
    "key_hiring_needs": [
      {{"role": "Job title in plain words", "priority": "High|Medium|Low", "timeline": "When needed — e.g. Month 1", "rationale": "1 plain sentence: why this role is needed"}}
    ]
  }},

  "traction_highlights": {{
    "total_survey_responses": {total},
    "completion_rate": {{"value": "X% of people who started the survey finished it", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "Counted from survey responses"}},
    "positive_validation_ratio": {{"value": "X% of respondents gave positive feedback", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "From survey responses"}},
    "average_rating": {{"value": "X out of 5 stars on average", "confidence": "HIGH", "source": "SURVEY_DATA", "basis": "From rating questions in the survey"}},
    "key_traction_points": [
      {{"value": "Plain sentence showing demand — e.g. '9 out of 10 people said they would pay for this'", "confidence": "HIGH", "source": "SURVEY_DATA"}},
      {{"value": "Another plain demand signal", "confidence": "...", "source": "..."}}
    ],
    "geographic_reach": {{"value": "{demo["distinct_cities"]} different cities responded", "confidence": "HIGH", "source": "SURVEY_DATA"}}
  }},

  "investor_readiness": {{
    "overall_score": {overall_score},
    "pitch_readiness": "Strong|Moderate|Early Stage",
    "key_strengths": [
      {{"value": "Plain sentence strength — e.g. 'Strong demand proven by survey responses'", "confidence": "...", "source": "..."}},
      {{"value": "Another plain strength", "confidence": "...", "source": "..."}}
    ],
    "gaps_to_address": [
      {{"value": "Plain sentence gap — e.g. 'No pricing data yet — need to test what customers will pay'", "priority": "High|Medium|Low"}},
      {{"value": "Another gap in plain words", "priority": "..."}}
    ],
    "recommended_investor_types": ["Angel investor", "Seed VC", "etc."],
    "pitch_narrative": "2-3 short plain sentences telling the full story: the problem, what we built, and why we will win. Write it like you're pitching to someone at a dinner table, not a boardroom."
  }},

  "cross_validation_summary": {{
    "survey_backed_claims": <integer>,
    "guidance_backed_claims": <integer>,
    "cross_validated_claims": <integer>,
    "ai_estimated_claims": <integer>,
    "high_confidence_fields": <integer>,
    "medium_confidence_fields": <integer>,
    "low_confidence_fields": <integer>,
    "data_richness_notes": "1-2 plain sentences: how strong the data is and what would make it stronger"
  }}
}}
"""
    return prompt


@router.post("/surveys/{survey_id}/analyze")
@limiter.limit("3/minute")
async def run_ca_agent(
    request: Request,
    survey_id: str,
    founder_inputs: CAFounderInputs = CAFounderInputs(),
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    # ── 1. Fetch survey ────────────────────────────────────────────────────────
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found.")

    # ── 2. Fetch questions ────────────────────────────────────────────────────
    questions = (
        db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order).all()
    )

    # ── 3. Fetch completed responses ──────────────────────────────────────────
    responses = (
        db.query(SurveyResponse)
        .filter(SurveyResponse.survey_id == survey_id, SurveyResponse.status == "completed")
        .all()
    )
    total = len(responses)
    response_ids = [r.id for r in responses]

    # ── 4. Fetch answers ──────────────────────────────────────────────────────
    answers = []
    if response_ids:
        answers = db.query(SurveyAnswer).filter(SurveyAnswer.response_id.in_(response_ids)).all()

    # ── 5. Guidance + roadmap from ai_intelligence field ─────────────────────
    guidance = survey.ai_intelligence or {}

    # ── 6. Run survey intelligence (19 capability engines) ───────────────────
    founder = FounderContext()
    intelligence = extract_survey_intelligence(
        questions=questions,
        answers=answers,
        responses=responses,
        total_responses=total,
        completed_responses=total,
        founder=founder,
    )

    # ── 7. Build and fire CA prompt ───────────────────────────────────────────
    prompt = _build_ca_prompt(survey, questions, responses, answers, guidance, intelligence, founder_inputs)

    try:
        raw = await run_in_threadpool(call_ai_sync, prompt, 16000, _CA_SYSTEM_INSTRUCTION)
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[CA Agent JSON Error] {e}\nRaw: {raw[:500]}")
        raise HTTPException(status_code=502, detail="CA Agent returned malformed JSON.")
    except Exception as e:
        print(f"[CA Agent Error] {e}")
        raise HTTPException(status_code=503, detail="CA Agent Pulse provider unavailable.")

    # ── 8. Inject authoritative fields ───────────────────────────────────────
    result["survey_id"] = survey_id
    result["survey_title"] = survey.title

    if "traction_highlights" not in result or not isinstance(result["traction_highlights"], dict):
        result["traction_highlights"] = {}
    result["traction_highlights"]["total_survey_responses"] = total

    return result
