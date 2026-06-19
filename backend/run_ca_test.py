import asyncio
import json
from sqlalchemy.orm import Session
from db.database import SessionLocal
from db.models import Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
from routes.ca_agent import _build_ca_prompt, _CA_SYSTEM_INSTRUCTION
from services.ai_provider import call_ai_sync
from services.survey_intelligence import extract_survey_intelligence, FounderContext

async def main():
    db = SessionLocal()
    survey_id = "e933a940-6369-44f9-b2dc-6564a129fec5"
    
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    questions = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order).all()
    responses = db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey_id, SurveyResponse.status == "completed").all()
    response_ids = [r.id for r in responses]
    answers = db.query(SurveyAnswer).filter(SurveyAnswer.response_id.in_(response_ids)).all() if response_ids else []
    guidance = survey.ai_intelligence or {}
    
    founder = FounderContext()
    intelligence = extract_survey_intelligence(
        questions=questions,
        answers=answers,
        responses=responses,
        total_responses=len(responses),
        completed_responses=len(responses),
        founder=founder
    )
    
    prompt = _build_ca_prompt(survey, questions, responses, answers, guidance, intelligence)
    print("PROMPT GEOGRAPHY:", [line for line in prompt.split("\n") if "Geography:" in line])
    print("PROMPT CATEGORY:", [line for line in prompt.split("\n") if "Industry Category" in line])
    
    print("\nCalling AI...")
    raw = call_ai_sync(prompt, 12000, _CA_SYSTEM_INSTRUCTION)
    res = json.loads(raw)
    
    print("\nGENERATED VALUES:")
    print("TAM:", res.get("market_opportunity", {}).get("tam"))
    print("SAM:", res.get("market_opportunity", {}).get("sam"))
    print("SOM:", res.get("market_opportunity", {}).get("som"))
    print("CAC:", res.get("financial_projections", {}).get("unit_economics", {}).get("cac"))
    print("LTV:", res.get("financial_projections", {}).get("unit_economics", {}).get("ltv"))
    print("LTV/CAC:", res.get("financial_projections", {}).get("unit_economics", {}).get("ltv_cac_ratio"))
    print("Margin:", res.get("financial_projections", {}).get("unit_economics", {}).get("gross_margin"))
    print("Payback:", res.get("financial_projections", {}).get("unit_economics", {}).get("payback_period"))
    print("Funding Ask:", res.get("funding_requirements", {}).get("ask_amount"))
    print("Runway:", res.get("funding_requirements", {}).get("runway_months"))
    print("Funding Stage:", res.get("funding_requirements", {}).get("funding_stage"))
    print("Moat:", res.get("competitive_analysis", {}).get("competitive_moat"))
    print("Launch Strategy:", res.get("gtm_strategy", {}).get("launch_strategy"))
    
    db.close()

if __name__ == "__main__":
    asyncio.run(main())
