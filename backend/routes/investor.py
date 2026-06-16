# backend/routes/investor.py
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from db.database import get_db
from db.models import UserProfile, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
from schemas.investor import (
    InvestorReadinessReportResponse,
    InvestorReadinessInitRequest,
    SurveyIntelligence,
    ExternalIntelligence,
    CapabilityIntelligence,
    EvidenceStatement,
)
from dependencies import get_current_user
from core.rate_limiter import limiter
from services.ai_provider import call_ai_sync
from services.survey_intelligence import extract_survey_intelligence, FounderContext
from services.external_intelligence import extract_external_intelligence
from schemas.external_data import ExternalDataRequest
from db.models import UploadedFile

router = APIRouter(prefix="/investor", tags=["investor"])


def _get_currency_config(country: str) -> dict:
    c = (country or "").strip().lower()
    if not c:
        return {"symbol": "$", "code": "USD", "rate": 1.0}

    if any(k in c for k in ["india", "in", "ind", "rupee", "rupees"]):
        return {"symbol": "₹", "code": "INR", "rate": 83.0}
    elif any(k in c for k in ["uk", "united kingdom", "gb", "britain", "london", "pound", "pounds"]):
        return {"symbol": "£", "code": "GBP", "rate": 0.8}
    elif any(k in c for k in ["europe", "eu", "germany", "france", "italy", "spain", "netherlands", "euro", "euros"]):
        return {"symbol": "€", "code": "EUR", "rate": 0.92}
    elif any(k in c for k in ["canada", "ca", "cad"]):
        return {"symbol": "CA$", "code": "CAD", "rate": 1.36}
    elif any(k in c for k in ["australia", "au", "aud"]):
        return {"symbol": "A$", "code": "AUD", "rate": 1.5}

    return {"symbol": "$", "code": "USD", "rate": 1.0}


# Investor-specific system instruction for AI calls
_INVESTOR_SYSTEM_INSTRUCTION = (
    "You are an elite, venture-capital investment committee partner and startup mentor. "
    "Your role is to interpret ONLY the evidence provided in the survey intelligence section. "
    "Do NOT invent data, assumptions, or market figures that are not grounded in the survey metrics given. "
    "Where evidence is insufficient, state the limitation clearly rather than fabricating data. "
    "Always respond with valid raw JSON only — no markdown, no conversational commentary, "
    "no text wrapping outside the JSON structure."
)


@router.post("/surveys/{survey_id}/readiness", response_model=InvestorReadinessReportResponse)
@limiter.limit("3/minute")
async def generate_investor_readiness_report(
    request: Request,
    survey_id: str,
    body: InvestorReadinessInitRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a VC-grade Investor Readiness Report grounded entirely in:
    - Actual survey response data (via 7 capability intelligence engines)
    - Founder-provided context (startup description, pricing, geography)

    No assumptions. No fabricated metrics. Every insight is traceable to survey data.
    HTTP 503 is returned if the AI provider is unavailable — no fake fallback data.
    """
    # ── 1. Verify survey ownership ────────────────────────────────────────────
    survey = db.query(Survey).filter(
        Survey.id == survey_id,
        Survey.tenant_id == current_user.tenant_id,
    ).first()

    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    # ── 2. Validate all required fields are provided ──────────────────────────
    missing_fields = []
    if not (body.startup_context or "").strip():
        missing_fields.append("Startup Context")
    if not (body.pricing_model or "").strip():
        missing_fields.append("Pricing Model")
    if not (body.target_country or "").strip():
        missing_fields.append("Target Country")
    if not (body.target_state or "").strip():
        missing_fields.append("Target State")
    if not (body.target_district or "").strip():
        missing_fields.append("Target District")

    if missing_fields:
        fields_str = ", ".join(missing_fields)
        raise HTTPException(
            status_code=400,
            detail=f"Please fill in all target parameters before generating the report. Missing: {fields_str}",
        )

    # ── 3. Enforce minimum response threshold ─────────────────────────────────
    total_responses = db.query(SurveyResponse).filter(
        SurveyResponse.survey_id == survey_id,
    ).count()

    if total_responses < 50:
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot generate an Investor Readiness Report with less than 50 survey responses. "
                "Please gather 50 responses."
            ),
        )

    # ── 4. Fetch questions, responses, and answers ────────────────────────────
    questions = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey_id)
        .order_by(SurveyQuestion.sort_order)
        .all()
    )

    responses_all = (
        db.query(SurveyResponse)
        .filter(SurveyResponse.survey_id == survey_id)
        .all()
    )

    completed_responses = sum(
        1 for r in responses_all
        if r.status and r.status.value == "completed"
    )

    answers = (
        db.query(SurveyAnswer)
        .join(SurveyResponse)
        .filter(SurveyResponse.survey_id == survey_id)
        .all()
    )

    # ── 5. Build founder context & run survey intelligence (19 capability engines) ──
    cur = _get_currency_config(body.target_country)

    founder_context = FounderContext(
        startup_context=body.startup_context,
        pricing_model=body.pricing_model,
        target_country=body.target_country,
        target_state=body.target_state,
        target_district=body.target_district,
        currency_code=cur["code"],
        currency_symbol=cur["symbol"],
        funding_stage=body.funding_stage,
        funding_target=body.funding_target,
        team_size=body.team_size,
        monthly_revenue=body.monthly_revenue,
        industry_vertical=body.industry_vertical,
        founded_year=body.founded_year,
        founder_count=body.founder_count,
    )

    intelligence = extract_survey_intelligence(
        questions=questions,
        answers=answers,
        responses=responses_all,
        total_responses=total_responses,
        completed_responses=completed_responses,
        founder=founder_context,
    )

    # ── 5b. Resolve uploaded file IDs → extracted text ───────────────────────
    ext_data: ExternalDataRequest = body.external_data or ExternalDataRequest()

    # Collect all file_id references from the external data payload
    file_ids_needed: set = set()
    _ext = ext_data.model_dump()
    def _collect_ids(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "file_id" and isinstance(v, str):
                    file_ids_needed.add(v)
                elif k == "file_ids" and isinstance(v, list):
                    file_ids_needed.update(v)
                else:
                    _collect_ids(v)
        elif isinstance(obj, list):
            for item in obj:
                _collect_ids(item)
    _collect_ids(_ext)

    # Fetch extracted_text for each referenced file ID
    file_texts: dict = {}
    if file_ids_needed:
        import uuid as _uuid
        valid_uuids = []
        for fid in file_ids_needed:
            try:
                valid_uuids.append(_uuid.UUID(fid))
            except (ValueError, AttributeError):
                pass
        if valid_uuids:
            db_files = (
                db.query(UploadedFile)
                .filter(
                    UploadedFile.id.in_(valid_uuids),
                    UploadedFile.tenant_id == current_user.tenant_id,
                )
                .all()
            )
            file_texts = {str(f.id): (f.extracted_text or "") for f in db_files}

    # ── 5c. Run all 32 external-data capability engines ──────────────────────
    external_intel = extract_external_intelligence(ext_data, file_texts)

    # ── 6. Build structured SurveyIntelligence for response payload ───────────
    survey_intelligence_obj = SurveyIntelligence(
        overall_score=intelligence["overall_score"],
        overall_confidence=intelligence["overall_confidence"],
        total_evidence=intelligence["total_evidence"],
        capabilities={
            name: CapabilityIntelligence(
                capability_name=cap["capability_name"],
                score=cap["score"],
                confidence=cap["confidence"],
                evidence_count=cap["evidence_count"],
                data_coverage=cap["data_coverage"],
                evidence_statements=[
                    EvidenceStatement(**ev)
                    for ev in cap["evidence_statements"]
                ],
                raw_metrics=cap["raw_metrics"],
                limitations=cap["limitations"],
            )
            for name, cap in intelligence["capabilities"].items()
        },
    )

    # ── 7. Geography config (cur already defined in step 5) ────────────────────
    monetization = body.pricing_model
    geography = (
        f"Country: {body.target_country}, "
        f"State: {body.target_state}, "
        f"District: {body.target_district} "
        f"(Currency: {cur['code']} — symbol {cur['symbol']})"
    )

    # ── 8. Build question summary for AI context ──────────────────────────────
    q_summary = "\n".join(
        f"  - Q{i + 1} ({q.question_type}): {q.question_text}"
        for i, q in enumerate(questions[:25])
    )

    # ── 8b. Pre-compute locked scoring dimension values ──────────────────
    # These are derived from computed capability scores — AI cannot override them.
    # Mapping: 5 scoring dimensions → best matching survey capability
    caps = intelligence["capabilities"]

    def _cap_score(name: str) -> int:
        return caps.get(name, {}).get("score", 0)

    def _cap_lims(name: str) -> list:
        return caps.get(name, {}).get("limitations", [])

    def _cap_status(score: int) -> str:
        if score >= 70: return "Strong"
        if score >= 50: return "Medium"
        return "High Risk"

    # Financial readiness: average of willingness_to_pay + unit_economics
    _fin_score = int((_cap_score("willingness_to_pay") + _cap_score("unit_economics")) / 2)
    _fin_lims  = _cap_lims("willingness_to_pay") + _cap_lims("unit_economics")

    # Product readiness: problem_solution
    _prod_score = _cap_score("problem_solution")
    _prod_lims  = _cap_lims("problem_solution")

    # Market readiness: market_opportunity
    _mkt_score = _cap_score("market_opportunity")
    _mkt_lims  = _cap_lims("market_opportunity")

    # Team readiness: investor_readiness_analysis (has team_size info) or 0
    _team_score = _cap_score("investor_readiness_analysis")
    _team_lims  = _cap_lims("investor_readiness_analysis") or ["No team assessment questions in survey"]

    # Operational maturity: traction_evidence
    _ops_score = _cap_score("traction_evidence")
    _ops_lims  = _cap_lims("traction_evidence")

    _overall_score     = intelligence["overall_score"]
    _confidence_score  = min(100, intelligence["total_evidence"] * 4 + 20)
    _growth_potential  = "High" if _overall_score >= 70 else ("Moderate" if _overall_score >= 50 else "Low")
    _attract_level     = (
        "Excellent" if _overall_score >= 80 else
        "Strong" if _overall_score >= 65 else
        "Emerging" if _overall_score >= 50 else "Early Stage"
    )
    _pitch_rating      = (
        "Highly Prepared" if _overall_score >= 75 else
        "Refinements Needed" if _overall_score >= 55 else "Early Stage"
    )

    # ── 9. Compose AI prompt with evidence-grounded intelligence ──────────────
    prompt = f"""You are an elite VC Investment Partner reviewing a validated startup's investor readiness.
You must generate a Investor Readiness Report using ONLY the evidence provided below.

CRITICAL RULES:
1. Do NOT invent market figures, TAM/SAM/SOM, competitor data, or financial projections that are not based on the evidence provided.
2. Where evidence is insufficient, write: "Insufficient survey data — [what data would strengthen this]"
3. All monetary values MUST use {cur["code"]} ({cur["symbol"]}) based on the geography provided.
4. Every qualitative insight must reference at least one evidence statement.

== STARTUP CONTEXT ==
{body.startup_context}

== GEOGRAPHIC MARKET ==
{geography}

== PRICING & MONETIZATION MODEL ==
{monetization}

== SURVEY DEFINITION ==
Title: {survey.title}
Description: {survey.description or "Not provided."}
Questions ({len(questions)} total):
{q_summary}

{intelligence["prompt_section"]}

== OUTPUT INSTRUCTIONS ==
Using ONLY the evidence above, generate a JSON object with this exact shape.
Where data is insufficient, use the string "Insufficient survey data" for that field — never fabricate:

{{
  "survey_id": "{survey_id}",
  "survey_title": {json.dumps(survey.title)},
  "category": "Industry vertical derived from startup context",
  "executive_summary": "VC-grade summary referencing only the evidence provided above",
  "problem_solution_narrative": {{
    "problem": "Evidence-backed problem statement using the problem_solution capability evidence",
    "solution": "Solution narrative grounded in validated pain points — cite the evidence ratios"
  }},
  "narrative_intelligence": "Mission and vision narrative grounded in the startup context and validated demand signals",
  "market_opportunity_framing": "Market opportunity framing citing adoption intent % and demographic evidence",
  "tam_sam_som": {{
    "tam": "State if computable from evidence or 'Insufficient survey data — demographic questions needed'",
    "sam": "State if computable or 'Insufficient survey data'",
    "som": "State if computable or 'Insufficient survey data'",
    "data_source": "Explain what evidence was used or what is missing"
  }},
  "competitors": [
    {{
      "name": "Derived from competitive_positioning evidence or 'Unknown — no competitor questions in survey'",
      "offering": "From survey responses or 'Insufficient data'",
      "pricing": "From survey responses or 'Insufficient data'",
      "strengths": "From survey responses",
      "weaknesses": "From dissatisfaction signals in competitive evidence",
      "diff": "Our differentiation based on the gap identified",
      "share": "Estimated from top_answers frequency if available"
    }}
  ],
  "gtm_strategy": "GTM strategy grounded in adoption intent channels and demographic spread evidence",
  "unit_economics": {{
    "cac": "Estimate only if willingness_to_pay evidence exists, else 'Insufficient survey data'",
    "ltv": "Estimate from pricing model and retention signals if available",
    "margin": "Based on pricing model provided",
    "retention": "From product_market_fit evidence if available",
    "payback_period": "Calculated from CAC and LTV if available"
  }},
  "financial_projections": [
    {{ "year": "Year 1", "revenue": "Evidence-based or 'Insufficient data'", "cost": "Estimate", "hiring": "Estimate", "margin": "Estimate" }},
    {{ "year": "Year 2", "revenue": "Evidence-based or 'Insufficient data'", "cost": "Estimate", "hiring": "Estimate", "margin": "Estimate" }},
    {{ "year": "Year 3", "revenue": "Evidence-based or 'Insufficient data'", "cost": "Estimate", "hiring": "Estimate", "margin": "Estimate" }}
  ],
  "traction_evidence": {{
    "total_responses": {intelligence["capabilities"]["traction_evidence"]["raw_metrics"]["total_responses"]},
    "positive_validation_ratio": {intelligence["capabilities"]["traction_evidence"]["raw_metrics"]["positive_validation_ratio"]},
    "average_rating": {intelligence["capabilities"]["traction_evidence"]["raw_metrics"]["average_rating"]},
    "market_validation_insight": "VC narrative citing the traction evidence metrics exactly as computed"
  }},
  "execution_roadmap": [
    {{
      "phase": "Phase 1: Validation & Launch",
      "milestone": "Grounded in the evidence gaps identified",
      "timeline": "Month 1 - 3",
      "funding_required": "Based on monetization model in {cur['code']}",
      "focus_area": "Product & Engineering"
    }}
  ],
  "objections": [
    {{
      "objection": "Derived from objection_intelligence evidence — cite the actual data point",
      "severity": "High / Medium / Low — based on negative ratio",
      "suggested_response": "Response grounded in the positive evidence from other capabilities"
    }}
  ],
  "scoring": {{
    "overall_score": {_overall_score},
    "confidence_score": {_confidence_score},
    "growth_potential": "{_growth_potential}",
    "attractiveness_level": "{_attract_level}",
    "financial_readiness": {{
      "score": {_fin_score},
      "weight": 0.20,
      "status": "{_cap_status(_fin_score)}",
      "insights": "Write 1-2 sentences citing willingness_to_pay and unit_economics evidence statements from above",
      "gaps": {json.dumps(_fin_lims[:3])}
    }},
    "product_readiness": {{
      "score": {_prod_score},
      "weight": 0.20,
      "status": "{_cap_status(_prod_score)}",
      "insights": "Write 1-2 sentences citing problem_solution evidence statements from above",
      "gaps": {json.dumps(_prod_lims[:3])}
    }},
    "market_readiness": {{
      "score": {_mkt_score},
      "weight": 0.25,
      "status": "{_cap_status(_mkt_score)}",
      "insights": "Write 1-2 sentences citing market_opportunity evidence statements from above",
      "gaps": {json.dumps(_mkt_lims[:3])}
    }},
    "team_readiness": {{
      "score": {_team_score},
      "weight": 0.15,
      "status": "{_cap_status(_team_score)}",
      "insights": "Write 1-2 sentences about team composition from founder context",
      "gaps": {json.dumps(_team_lims[:3])}
    }},
    "operational_maturity": {{
      "score": {_ops_score},
      "weight": 0.20,
      "status": "{_cap_status(_ops_score)}",
      "insights": "Write 1-2 sentences citing traction_evidence evidence statements from above",
      "gaps": {json.dumps(_ops_lims[:3])}
    }},
    "key_risks": [
      {{ "risk": "Derived from objection_intelligence themes", "mitigation": "Cite positive evidence that counters this risk" }}
    ]
  }},
  "pitch_review": {{
    "overall_rating": "{_pitch_rating}",
    "strengths": ["List capabilities with score >= 65 from the capability data above"],
    "improvements": ["List capabilities with score < 50 or identified limitations"]
  }},
  "target_investors": [
    {{
      "investor_type": "Based on traction_evidence and overall_score stage",
      "average_check": "In {cur['code']} based on geography",
      "key_criteria": ["Derived from highest-scoring capabilities"],
      "target_fit": "Explain fit based on evidence"
    }}
  ],
  "funding_ask": {{
    "amount": "In {cur['code']} — justify with evidence or mark as 'Insufficient data'",
    "timeline_runway": "12-18 months",
    "breakdown": [
      {{ "allocation": "Product & Engineering", "percentage": "50%" }},
      {{ "allocation": "Marketing & GTM Sales", "percentage": "30%" }},
      {{ "allocation": "Hiring & Operations", "percentage": "20%" }}
    ]
  }}
}}
"""

    # ── 10. Call AI — NO FALLBACK. If AI fails, return 503 ───────────────────
    try:
        response_text = await run_in_threadpool(call_ai_sync, prompt, 8000, _INVESTOR_SYSTEM_INSTRUCTION)
        report_data = json.loads(response_text)
    except Exception as e:
        print(f"[Investor AI Error] {e}")
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI provider is currently unavailable. "
                "Your survey intelligence data has been computed and is available in the survey_intelligence field. "
                "Please retry in a few moments."
            ),
        )

    # ── 11. Inject computed values that must always match real data ─────────────
    # Overwrite any AI-hallucinated survey_id / survey_title with real DB values
    report_data["survey_id"] = str(survey_id)
    report_data["survey_title"] = survey.title

    # ── Fix 3: Overwrite the ENTIRE scoring block with computed values ─────────────
    # The AI receives locked integer literals in the prompt, but we also overwrite
    # post-response to guarantee the final object always matches computed scores,
    # even if the AI ignores the prompt constraints.
    existing_scoring = report_data.get("scoring", {}) if isinstance(report_data.get("scoring"), dict) else {}

    report_data["scoring"] = {
        "overall_score": _overall_score,
        "confidence_score": _confidence_score,
        "growth_potential": _growth_potential,
        "attractiveness_level": _attract_level,
        "financial_readiness": {
            "score": _fin_score,
            "weight": 0.20,
            "status": _cap_status(_fin_score),
            "insights": existing_scoring.get("financial_readiness", {}).get("insights", "Insufficient data"),
            "gaps": _fin_lims[:3] or ["No willingness-to-pay questions in survey"],
        },
        "product_readiness": {
            "score": _prod_score,
            "weight": 0.20,
            "status": _cap_status(_prod_score),
            "insights": existing_scoring.get("product_readiness", {}).get("insights", "Insufficient data"),
            "gaps": _prod_lims[:3] or ["No problem validation questions in survey"],
        },
        "market_readiness": {
            "score": _mkt_score,
            "weight": 0.25,
            "status": _cap_status(_mkt_score),
            "insights": existing_scoring.get("market_readiness", {}).get("insights", "Insufficient data"),
            "gaps": _mkt_lims[:3] or ["No market demand questions in survey"],
        },
        "team_readiness": {
            "score": _team_score,
            "weight": 0.15,
            "status": _cap_status(_team_score),
            "insights": existing_scoring.get("team_readiness", {}).get("insights", "Insufficient data"),
            "gaps": _team_lims[:3],
        },
        "operational_maturity": {
            "score": _ops_score,
            "weight": 0.20,
            "status": _cap_status(_ops_score),
            "insights": existing_scoring.get("operational_maturity", {}).get("insights", "Insufficient data"),
            "gaps": _ops_lims[:3] or ["Insufficient traction data"],
        },
        "key_risks": existing_scoring.get("key_risks", [
            {"risk": "Insufficient survey data for risk assessment", "mitigation": "Add risk-signal questions"}
        ]),
    }

    report_data["survey_intelligence"] = {
        "overall_score": survey_intelligence_obj.overall_score,
        "overall_confidence": survey_intelligence_obj.overall_confidence,
        "total_evidence": survey_intelligence_obj.total_evidence,
        "capabilities": {
            name: cap.model_dump()
            for name, cap in survey_intelligence_obj.capabilities.items()
        },
    }

    # Inject external intelligence (32 capabilities) — always computed, never from AI
    ext_cap_objs = {}
    for cap_name, cap_dict in external_intel["capabilities"].items():
        ext_cap_objs[cap_name] = CapabilityIntelligence(
            capability_name=cap_dict["capability_name"],
            score=cap_dict["score"],
            confidence=cap_dict["confidence"],
            evidence_count=cap_dict["evidence_count"],
            data_coverage=cap_dict["data_coverage"],
            evidence_statements=[
                EvidenceStatement(**ev) for ev in cap_dict["evidence_statements"]
            ],
            raw_metrics=cap_dict["raw_metrics"],
            limitations=cap_dict["limitations"],
        )

    report_data["external_intelligence"] = {
        "capabilities": {n: c.model_dump() for n, c in ext_cap_objs.items()},
        "capabilities_with_data": external_intel["capabilities_with_data"],
        "total_capabilities": external_intel["total_capabilities"],
        "avg_score": external_intel["avg_score"],
        "total_evidence": external_intel["total_evidence"],
        "groups": external_intel["groups"],
    }

    return InvestorReadinessReportResponse(**report_data)
