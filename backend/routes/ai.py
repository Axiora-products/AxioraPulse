"""
routes/ai.py
────────────
AI-powered survey insights using OpenAI.
"""

import os
import json
from typing import List
from fastapi import Request
from fastapi import APIRouter, Depends, HTTPException

import google.generativeai as genai

from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from core.rate_limiter import limiter

from sqlalchemy.orm import Session, joinedload
from db.database import get_db
from db.models import UserProfile, Survey, SurveyQuestion, SurveyResponse, SurveyAnswer, ResponseStatusEnum
from schemas import AIInsightsRequest, AIInsightsResponse, AISuggestionsRequest, AISuggestionsResponse, AIGenerateRequest, AIGenerateResponse
from dependencies import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])

@router.get("/ping")
@limiter.limit("30/minute")
async def ping_ai(request: Request):
    return {"status": "AI router is alive"}


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _build_survey_context(survey_id: str, db: Session) -> dict:
    """Fetch survey, questions, and responses to build context for AI."""
    survey = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == survey_id).first()
    if not survey:
        return None

    responses = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(SurveyResponse.survey_id == survey_id)
        .all()
    )

    total = len(responses)
    completed = len([r for r in responses if r.status == ResponseStatusEnum.completed]) if total > 0 else 0
    abandoned = len([r for r in responses if r.status == ResponseStatusEnum.abandoned]) if total > 0 else 0
    completion_rate = round((completed / total) * 100) if total > 0 else 0
    abandon_rate = round((abandoned / total) * 100) if total > 0 else 0

    # Calculate average time for completed responses
    durations = [
        (r.completed_at - r.started_at).total_seconds() 
        for r in responses 
        if r.completed_at and r.started_at and r.status == ResponseStatusEnum.completed
    ]
    avg_time = round(sum(durations) / len(durations) / 60, 1) if durations else 0

    # Basic NPS calculation (assuming 0-10 rating question exists)
    nps_scores = []
    for r in responses:
        for a in r.survey_answers:
            if a.answer_value and a.answer_value.isdigit():
                val = int(a.answer_value)
                if val >= 0 and val <= 10:
                    nps_scores.append(val)
    
    nps_val = None
    if nps_scores:
        promoters = len([s for s in nps_scores if s >= 9])
        detractors = len([s for s in nps_scores if s <= 6])
        nps_val = round(((promoters - detractors) / len(nps_scores)) * 100)

    # Aggregate question data
    question_summaries = []
    for q in survey.questions:
        q_answers = []
        for r in responses:
            ans = next((a for a in r.survey_answers if a.question_id == q.id), None)
            if ans:
                if ans.answer_value: q_answers.append(ans.answer_value)
                elif ans.answer_json: q_answers.append(ans.answer_json)
        
        summary = {
            "id": str(q.id),
            "text": q.question_text,
            "type": q.question_type.value,
            "responseCount": len(q_answers),
            "responses": q_answers[:50] 
        }
        question_summaries.append(summary)

    return {
        "title": survey.title,
        "stats": {
            "total": total,
            "completed": completed,
            "completionRate": completion_rate,
            "abandonRate": abandon_rate,
            "avgTimeMin": avg_time,
            "nps": nps_val
        },
        "questionSummaries": question_summaries
    }

@router.get("/surveys/{survey_id}/insights")
@limiter.limit("3/minute")
async def generate_survey_insights(
    request: Request,   # ✅ ADD
    survey_id: str,
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user)
):
    """
    Generate Deep AI insights for a survey by fetching all data from the database.
    """
    context = _build_survey_context(survey_id, db)
    if not context:
        raise HTTPException(status_code=404, detail="Survey not found")

    body = AIInsightsRequest(
        surveyTitle=context["title"],
        responses=context["stats"],
        questionSummaries=context["questionSummaries"]
    )
    return await generate_insights(request, body, current_user)


@router.post("/insights")
@limiter.limit("3/minute")
async def generate_insights(
    request: Request,   # ✅ ADD
    body: AIInsightsRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    print(f"[AI] Received Gemini request for survey: {body.surveyTitle}")
    
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500, 
            detail="Google API key not configured on server. Please set GOOGLE_API_KEY in .env"
        )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")

        # Construct the prompt
        prompt = f"""
        Analyze the following survey data and provide structured insights.
        
        Survey Title: {body.surveyTitle}
        
        Overall Stats:
        - Total Responses: {body.responses.get('total')}
        - Completion Rate: {body.responses.get('completionRate')}%
        - Abandon Rate: {body.responses.get('abandonRate')}%
        - Avg Time: {body.responses.get('avgTimeMin')} minutes
        - NPS: {json.dumps(body.responses.get('nps'))}
        
        Question Summaries:
        {json.dumps(body.questionSummaries, indent=2)}
        
        Return a JSON object with this structure:
        {{
          "executiveSummary": "string",
          "npsAnalysis": "string (optional)",
          "insights": [
            {{ "type": "positive|warning|info|action", "title": "string", "detail": "string", "metric": "string (optional)" }}
          ],
          "topStrengths": ["string"],
          "improvementAreas": ["string"],
          "recommendedActions": [
            {{ "priority": "high|medium|low", "action": "string", "impact": "string" }}
          ]
        }}
        """

        response = await run_in_threadpool(
            model.generate_content,
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )

        result_json = json.loads(response.text)
        return AIInsightsResponse(**result_json)

    except ValidationError as ve:
        print(f"[AI] Gemini Validation Error: {ve}")
        raise HTTPException(status_code=500, detail="Gemini returned an invalid data structure")
    except Exception as e:
        print(f"[AI] Gemini Error: {e}")
        # Check for quota errors in string
        if "quota" in str(e).lower() or "429" in str(e):
             raise HTTPException(status_code=429, detail="Google API quota exceeded or rate limited.")
        raise HTTPException(status_code=500, detail=f"Failed to generate Gemini insights: {str(e)}")


@router.post("/generate")
@limiter.limit("5/minute")
async def generate_survey(
    request: Request,
    body: AIGenerateRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Google API key not configured on server")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")

        prompt = f"""
        You are a survey design expert. Generate a complete survey based on the following description.

        Description: {body.aiContext}

        Return a JSON object with this exact structure:
        {{
          "title": "string",
          "description": "string",
          "welcome_message": "string",
          "questions": [
            {{
              "text": "The question text",
              "type": "short_text|long_text|single_choice|multiple_choice|rating|scale|yes_no",
              "options": [{{"label": "string", "value": "string"}}]
            }}
          ]
        }}

        Rules:
        - Generate 5-10 relevant questions
        - Only include "options" for single_choice and multiple_choice types
        - For rating/scale types, omit "options"
        - Make questions clear and unbiased
        """

        response = await run_in_threadpool(
            model.generate_content,
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )

        result_json = json.loads(response.text)
        return AIGenerateResponse(**result_json)

    except ValidationError as ve:
        print(f"[AI] Generate Validation Error: {ve}")
        raise HTTPException(status_code=500, detail="Gemini returned an invalid survey structure")
    except Exception as e:
        print(f"[AI] Generate Error: {e}")
        if "quota" in str(e).lower() or "429" in str(e):
            raise HTTPException(status_code=429, detail="Google API quota exceeded or rate limited.")
        raise HTTPException(status_code=500, detail=f"Failed to generate survey: {str(e)}")


@router.post("/suggestions")
@limiter.limit("5/minute")
async def generate_suggestions(
    request: Request,   # ✅ ADD
    body: AISuggestionsRequest,
    current_user: UserProfile = Depends(get_current_user)
):
    print(f"[AI] Received Gemini suggestions request for survey: {body.surveyTitle}")
    
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500, 
            detail="Google API key not configured on server"
        )

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-flash-latest")

        prompt = f"""
        Based on the following survey title and existing questions, suggest 3-5 relevant follow-up questions.
        
        Survey Title: {body.surveyTitle}
        Survey Description: {body.surveyDescription}
        
        Existing Questions:
        {json.dumps(body.existingQuestions, indent=2)}
        
        Return a JSON object with this structure:
        {{
          "suggestions": [
            {{ 
              "text": "The question text", 
              "type": "short_text|long_text|single_choice|multiple_choice|rating|scale|yes_no", 
              "options": [{{ "label": "string", "value": "string" }}] (only for choice types),
              "rationale": "Briefly why this question is useful"
            }}
          ]
        }}
        """

        response = await run_in_threadpool(
            model.generate_content,
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )

        result_json = json.loads(response.text)
        return AISuggestionsResponse(**result_json)

    except ValidationError as ve:
        print(f"[AI] Gemini Validation Error: {ve}")
        raise HTTPException(status_code=500, detail="Gemini returned invalid suggestion structure")
    except Exception as e:
        print(f"[AI] Gemini Error: {e}")
        if "quota" in str(e).lower() or "429" in str(e):
             raise HTTPException(status_code=429, detail="Google API quota exceeded or rate limited.")
        raise HTTPException(status_code=500, detail=f"Failed to generate Gemini suggestions: {str(e)}")
