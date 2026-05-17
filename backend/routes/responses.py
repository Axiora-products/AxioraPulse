"""
routes/responses.py
───────────────────
Handles survey response sessions — creation, auto-save, answer upsert, and submission.
These endpoints replace the direct Supabase client calls in SurveyRespond.jsx
and the Netlify `respond` function.

POST   /responses/              — create a new response row
GET    /responses/{id}          — get response + answers
PATCH  /responses/{id}          — update metadata / email / last_saved_at
POST   /responses/{id}/answers  — upsert answers (auto-save)
POST   /responses/{id}/submit   — mark as completed (replaces Netlify respond fn)
GET    /responses/session/{token} — find in-progress response by session_token
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

from core.rate_limiter import limiter
from db.models import ResponseStatusEnum, SurveyAnswer, SurveyResponse
from dependencies import DBSession
from schemas import (
    AnswerIn,
    ResponseCreate,
    ResponseOut,
    ResponseUpdate,
)

router = APIRouter(prefix="/responses", tags=["responses"])


# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_response(response_id: uuid.UUID, db: Session) -> SurveyResponse:
    r = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(SurveyResponse.id == response_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
    return r


def _verify_session(response: SurveyResponse, x_session_token: str):
    if not x_session_token:
        raise HTTPException(status_code=401, detail="Session token required")
    if response.session_token != x_session_token:
        raise HTTPException(status_code=403, detail="Forbidden: Session mismatch")


# ── Fetch ─────────────────────────────────────────────────────────────────────


@router.get("/session/{token}", response_model=Optional[ResponseOut])
@limiter.limit("20/minute")
def get_response_by_session(request: Request, token: str, db: DBSession):
    """
    Lookup an existing in-progress response by session_token.
    Used by SurveyRespond.jsx to resume a session.
    """
    r = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(SurveyResponse.session_token == token)
        .first()
    )
    if not r:
        return None
    return ResponseOut.model_validate(r)


@router.get("/{response_id}", response_model=ResponseOut)
@limiter.limit("20/minute")
def get_response(request: Request, response_id: uuid.UUID, db: DBSession):
    return ResponseOut.model_validate(_load_response(response_id, db))


# ── Create ────────────────────────────────────────────────────────────────────


@router.post("/", response_model=ResponseOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_response(request: Request, body: ResponseCreate, db: DBSession):
    """
    Create a new in-progress response row.
    Called by SurveyRespond.jsx → ensureR() when the user first interacts.
    Handles the race-condition guard: if a row already exists for this
    session_token return it instead of inserting a duplicate.
    """
    existing = (
        db.query(SurveyResponse).filter(SurveyResponse.session_token == body.session_token).first()
    )
    if existing:
        return ResponseOut.model_validate(existing)

    new_r = SurveyResponse(
        id=uuid.uuid4(),
        survey_id=body.survey_id,
        session_token=body.session_token,
        status=ResponseStatusEnum.in_progress,
        metadata_=body.metadata or {},
    )
    db.add(new_r)
    db.commit()
    db.refresh(new_r)
    return ResponseOut.model_validate(new_r)


# ── Update ────────────────────────────────────────────────────────────────────


@router.patch("/{response_id}", response_model=ResponseOut)
@limiter.limit("20/minute")
def update_response(
    request: Request,
    response_id: uuid.UUID,
    body: ResponseUpdate,
    db: DBSession,
    x_session_token: Optional[str] = Header(None),
):
    """Update email, status, last_saved_at, or metadata."""
    r = db.query(SurveyResponse).filter(SurveyResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
    _verify_session(r, x_session_token)

    if body.email is not None:
        r.email = body.email
    if body.status:
        r.status = body.status
    if body.last_saved_at:
        r.last_saved_at = body.last_saved_at
    if body.metadata is not None:
        r.response_metadata = {**(r.response_metadata or {}), **body.metadata}

    db.commit()
    db.refresh(r)
    return ResponseOut.model_validate(r)


# ── Answers ───────────────────────────────────────────────────────────────────


@router.post("/{response_id}/answers", response_model=List[AnswerIn])
@limiter.limit("30/minute")
def upsert_answers(
    request: Request,
    response_id: uuid.UUID,
    answers: List[AnswerIn],
    db: DBSession,
    x_session_token: Optional[str] = Header(None),
):
    """
    Upsert one or more answers for a response.
    On conflict (response_id, question_id) update the existing row.
    """
    r = db.query(SurveyResponse).filter(SurveyResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
    _verify_session(r, x_session_token)

    for a in answers:
        # Check if already exists
        existing = (
            db.query(SurveyAnswer)
            .filter(
                SurveyAnswer.response_id == response_id,
                SurveyAnswer.question_id == a.question_id,
            )
            .first()
        )

        if existing:
            existing.answer_value = a.answer_value
            existing.metadata_ = a.metadata or {}
        else:
            new_a = SurveyAnswer(
                id=uuid.uuid4(),
                response_id=response_id,
                question_id=a.question_id,
                answer_value=a.answer_value,
                metadata_=a.metadata or {},
            )
            db.add(new_a)

    r.last_saved_at = datetime.now(timezone.utc)
    db.commit()
    return answers


# ── Submit ────────────────────────────────────────────────────────────────────


@router.post("/{response_id}/submit")
@limiter.limit("5/minute")
def submit_response(
    request: Request,
    response_id: uuid.UUID,
    db: DBSession,
    body: Optional[dict] = None,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a response as completed.
    Replaces the Netlify `respond` function (action='submit').
    Accepts optional `metadata` dict (quality_score etc.).
    """
    if body is None:
        body = {}
    r = db.query(SurveyResponse).filter(SurveyResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
    _verify_session(r, x_session_token)

    r.status = ResponseStatusEnum.completed
    r.completed_at = datetime.now(timezone.utc)

    # Merge any extra metadata (quality_score from useResponseTracking)
    if body.get("metadata"):
        r.response_metadata = {**(r.response_metadata or {}), **body["metadata"]}

    db.commit()
    return {"message": "Response submitted successfully", "response_id": response_id}


# ── Mark as abandoned ─────────────────────────────────────────────────────────


@router.post("/{response_id}/abandon")
@limiter.limit("10/minute")
def abandon_response(
    request: Request,
    response_id: uuid.UUID,
    db: DBSession,
    body: Optional[dict] = None,
    x_session_token: Optional[str] = Header(None),
):
    """
    Mark a response as abandoned + store drop-off metadata.
    Called by useExitDetection.js / useResponseTracking.js onAbandon.
    """
    if body is None:
        body = {}
    r = db.query(SurveyResponse).filter(SurveyResponse.id == response_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Response not found")
    _verify_session(r, x_session_token)

    r.status = ResponseStatusEnum.abandoned
    if body.get("metadata"):
        r.response_metadata = {**(r.response_metadata or {}), **body["metadata"]}

    db.commit()
    return {"message": "Response marked as abandoned", "response_id": response_id}
