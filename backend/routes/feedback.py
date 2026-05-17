"""
routes/feedback.py
──────────────────
POST /feedback/         — Submit post-survey feedback (SurveyRespond.jsx thank-you screen)
GET  /feedback/survey/{id} — Get feedback for a survey (SurveyAnalytics.jsx Feedback tab)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from core.rate_limiter import limiter
from db.models import Survey, SurveyFeedback
from dependencies import CurrentUser, DBSession
from schemas import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/", response_model=FeedbackOut, status_code=201)
@limiter.limit("5/minute")
def create_feedback(
    request: Request,  # ✅ ADD THIS
    body: FeedbackCreate,
    db: DBSession,
):
    """
    Public endpoint — no auth required.
    Called by submitFeedback() in SurveyRespond.jsx.
    """
    fb = SurveyFeedback(
        id=uuid.uuid4(),
        survey_id=body.survey_id,
        rating=body.rating,
        comment=body.comment,
        responded_at=body.responded_at or datetime.now(timezone.utc),
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return FeedbackOut.model_validate(fb)


@router.get("/survey/{survey_id}")
@limiter.limit("10/minute")
def get_feedback(
    request: Request,  # ✅ ADD THIS
    survey_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """Return all feedback for a survey (analytics Feedback tab)."""
    survey = (
        db.query(Survey)
        .filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    rows = db.query(SurveyFeedback).filter(SurveyFeedback.survey_id == survey_id).all()
    return [FeedbackOut.model_validate(r) for r in rows]
