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
    "into rich, compelling, investor-grade pitch content that is specific, insightful, and actionable.\n"
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
    "CONTENT DEPTH RULES (strictly enforced):\n"
    "NARRATIVE FIELDS (problem description, solution description, UVP, positioning statement, competitive moat, launch strategy, growth lever, business model description, pitch narrative, vision, mission, roadmap goals): "
    "Write 2-4 rich, specific sentences. Include concrete details, named mechanisms, specific demographics, measurable outcomes, or named technologies where relevant. "
    "Do NOT write generic platitudes. Every sentence must add distinct information that a founder or investor could not derive themselves.\n"
    "METRIC FIELDS (pain intensity score, TAM, SAM, SOM, adoption %, CAC, LTV, LTV/CAC ratio, gross margin, payback period, funding ask, runway, funding stage, pricing): "
    "Keep to a specific number or short phrase — no more than one sentence.\n"
    "POPULATION FIELDS (affected population, target customer, target segment): "
    "Name the specific group with at least 2 attributes (e.g. industry + company size, or role + geography + pain context). 1-2 sentences.\n"
    "ALTERNATIVES FIELD (current alternatives): 2-3 sentences describing the existing workarounds, why they fail, and the cost or friction involved.\n"
    "LANGUAGE RULES:\n"
    "1. No jargon in value fields. Instead of 'CAC' write 'cost to get one customer'. Instead of 'TAM' write 'total market size'. Use plain words always.\n"
    "2. Numbers must be specific and written simply: '₹500 per month'.\n"
    "3. The 'basis' field: explicitly state the exact calculation or logic used to derive the number.\n"
    "4. All money values must use the currency for the target geography (₹ for India).\n"
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
1. NARRATIVE "value" fields (description, UVP, positioning, moat, launch strategy, growth lever, business model description, vision, mission, pitch narrative, roadmap goals, current alternatives): Write 2-4 specific, concrete sentences. Include named mechanisms, specific demographics, measurable outcomes, or named technologies. Never write a generic sentence that could apply to any startup.
2. METRIC "value" fields (pain score, TAM, SAM, SOM, adoption %, CAC, LTV, ratios, margins, payback, funding ask, runway, stage, pricing): Keep to one specific number or short phrase — no more than one sentence.
3. No jargon in value fields. CAC → "cost to get one customer", LTV → "total value from one customer over time", TAM → "total addressable market".
4. For actual values (supported by survey/founder data), set 'source': 'SURVEY_DATA' or 'CROSS_VALIDATED' and 'confidence': 'HIGH' or 'MEDIUM'.
5. For estimated values (benchmark-based), set 'source': 'ESTIMATED' or 'BENCHMARK', 'confidence': 'LOW', and include 'estimation_method' (string) and 'assumptions' (list of strings).
6. Every field MUST contain 'evidence_refs' referencing one or more evidence point IDs from the 'evidence_manifest'.
7. basis: explicitly state the exact calculation or logic used to derive the number.
8. All money in the currency for the target geography (₹ for India).

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
    "description": {{"value": "2-4 specific sentences: describe the problem in concrete detail — what happens, why it is painful, what it costs people in time or money, and what triggers it. Name the specific frustration, not a generic category. Use evidence from the survey.", "confidence": "...", "source": "...", "basis": "Short plain sentence on how you know this"}},
    "pain_intensity_score": {{"value": "A number from 0-10", "confidence": "...", "source": "...", "basis": "Short plain sentence"}},
    "affected_population": {{"value": "Describe the exact group with at least 2 specific attributes — e.g. 'Small and mid-size tech startups in Tier-1 Indian cities that are scaling their engineering teams and cannot afford established staffing agencies'. 1-2 sentences.", "confidence": "...", "source": "...", "basis": "..."}},
    "current_alternatives": {{"value": "2-3 sentences: name the specific workarounds people use today, explain why each one fails or is frustrating, and mention the typical cost or time wasted. Be concrete — name real categories of tools or approaches.", "confidence": "...", "source": "...", "basis": "..."}}
  }},

  "solution_overview": {{
    "headline": {{"value": "1 sentence: what the product does, in plain words", "confidence": "...", "source": "...", "basis": "..."}},
    "description": {{"value": "2-4 sentences: explain what the product does, how it works at a high level, and the specific outcome the customer gets. Mention the core mechanism or technology that makes it work. Be concrete — avoid vague claims like 'streamlines' without saying exactly what gets streamlined.", "confidence": "...", "source": "...", "basis": "..."}},
    "key_features": [
      {{"value": "Feature in plain words — e.g. 'AI-powered matching that ranks candidates by skill fit and culture match in under 60 seconds'", "confidence": "...", "source": "..."}},
      {{"value": "Feature 2 in plain words with specific benefit", "confidence": "...", "source": "..."}},
      {{"value": "Feature 3 in plain words with specific benefit", "confidence": "...", "source": "..."}}
    ],
    "unique_value_proposition": {{"value": "2-3 sentences: explain what makes this different from existing solutions, the specific mechanism that creates that advantage, and what the customer gains that they cannot get elsewhere. Do not use generic phrases — be specific about the advantage.", "confidence": "...", "source": "...", "basis": "..."}}
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
    "model_type": {{"value": "Specific label describing both the revenue mechanism and the customer relationship — e.g. 'Monthly SaaS subscription sold directly to HR teams at mid-size tech companies'", "confidence": "...", "source": "...", "basis": "..."}},
    "description": {{"value": "2-3 sentences: explain exactly how the business earns money, who pays, when they pay, and what triggers the payment. Mention whether revenue is recurring or one-time, and name the key metric that drives revenue growth.", "confidence": "...", "source": "...", "basis": "..."}},
    "pricing_strategy": {{"value": "Specific pricing with tiers if applicable — e.g. '₹10,000 per month per company seat, billed annually with a 20% discount; no setup fee and cancel anytime'", "confidence": "...", "source": "...", "basis": "..."}}
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
    "positioning_statement": {{"value": "2-3 sentences: name the specific customer segment being targeted, describe the gap left by existing competitors, and explain the distinct angle this product takes to fill that gap. Name real competitor categories if applicable.", "confidence": "...", "source": "...", "basis": "..."}},
    "key_differentiators": [
      {{"value": "Specific differentiator with the mechanism — e.g. 'Domain-specific AI trained only on cybersecurity job descriptions, giving 3x more relevant candidate rankings than generic ATS tools'", "confidence": "...", "source": "..."}},
      {{"value": "Differentiator 2 with concrete benefit", "confidence": "...", "source": "..."}},
      {{"value": "Differentiator 3 with concrete benefit", "confidence": "...", "source": "..."}}
    ],
    "competitive_moat": {{"value": "2-3 sentences: explain the specific structural advantage that makes this hard to copy — name the asset (data network, proprietary algorithm, exclusive partnerships, switching cost, regulatory approval, community) and explain why building or replicating it takes significant time or capital.", "confidence": "...", "source": "...", "basis": "..."}},
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
    "launch_strategy": {{"value": "2-4 sentences: describe the first 90 days in specific terms — which geography, which customer segment first, what the outreach approach is (direct sales, online ads, partnerships, events), and what success looks like at the end of the launch window. Name concrete channels and first customer types.", "confidence": "...", "source": "...", "basis": "..."}},
    "cac_strategy": {{"value": "2 sentences: describe the specific tactics used to acquire customers at low cost — name the exact channel (e.g. LinkedIn outreach to HR heads, founder-led demos, community partnerships) and why that channel is cost-effective for this market.", "confidence": "...", "source": "...", "basis": "..."}},
    "growth_lever": {{"value": "2-3 sentences: name the single mechanism that will drive compounding growth — describe how it works, why it creates a flywheel or network effect, and what milestone triggers it. Be specific about the mechanism, not just the outcome.", "confidence": "...", "source": "...", "basis": "..."}}
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
      "goals": "2-3 sentences: describe the specific objectives for this phase — what gets built, how many customers are targeted, what revenue or engagement milestone must be hit, and what key learnings are expected. Be concrete with numbers and named deliverables.",
      "key_milestones": ["Specific measurable milestone with target number or date — e.g. 'Onboard first 10 paying customers from Bangalore pilot'", "Another specific measurable milestone"],
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
    "vision_statement": {{"value": "2 sentences: describe the world-state this company is building toward in 10 years — be specific about what changes, for whom, and at what scale. Avoid generic phrases like 'transform the industry'; say exactly what is different.", "confidence": "...", "source": "...", "basis": "..."}},
    "mission_statement": {{"value": "2 sentences: describe what the company does every single day and the specific outcome it delivers to customers. Name the customer and the measurable change produced.", "confidence": "...", "source": "...", "basis": "..."}},
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
    "pitch_narrative": "3-5 sentences telling the complete investor story: open with a vivid description of the specific pain (name the customer and the moment they feel it), then describe what was built and how it solves the pain in a unique way, include one concrete data point from the survey that proves demand, and close with the specific reason this team or approach will win. Write it like a compelling dinner-table story — specific, energetic, and jargon-free."
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

    if "traction_highlights" not in result or not isinstance(result["traction_highlights"], dict):  # pragma: no cover
        result["traction_highlights"] = {}
    result["traction_highlights"]["total_survey_responses"] = total

    return result
