"""
routes/feedback.py
──────────────────
POST /feedback/         — Submit post-survey feedback (SurveyRespond.jsx thank-you screen)
GET  /feedback/survey/{id} — Get feedback for a survey (SurveyAnalytics.jsx Feedback tab)
"""

import uuid
from datetime import datetime, timezone
from core.rate_limiter import limiter
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi import Request
from db.database import get_db
from db.models import SurveyFeedback, Survey, UserProfile
from schemas import FeedbackCreate, FeedbackOut
from dependencies import get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/", response_model=FeedbackOut, status_code=201)
@limiter.limit("5/minute")
def create_feedback(
    request: Request,   # ✅ ADD THIS
    body: FeedbackCreate,
    db: Session = Depends(get_db)
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
    request: Request,   # ✅ ADD THIS
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all feedback for a survey (analytics Feedback tab)."""
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    rows = db.query(SurveyFeedback).filter(SurveyFeedback.survey_id == survey_id).all()
    return [FeedbackOut.model_validate(r) for r in rows]
