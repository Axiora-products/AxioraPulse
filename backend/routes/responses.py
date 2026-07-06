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
import re
import uuid
import secrets
import logging
from datetime import datetime, timezone
from typing import List, Optional
from core.rate_limiter import limiter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from fastapi import Request
from db.database import get_db
from db.models import SurveyResponse, SurveyAnswer, ResponseStatusEnum
from schemas import (
    ResponseCreate,
    ResponseUpdate,
    AnswerIn,
    ResponseOut,
    SubmitResponse,
)

router = APIRouter(prefix="/responses", tags=["responses"])
logger = logging.getLogger("axiora.responses")
SUPPORTED_RESPONSE_LANGUAGES = {"en", "te", "hi"}


def _normalize_source(value: str | None) -> str:
    """Normalize the acquisition channel (whatsapp, linkedin, email, qr, …).

    Sanitizes to a safe slug, collapses link/copy variants to 'direct', and keeps
    any other reasonable value (so custom campaign sources are still tracked).
    """
    if not value:
        return "direct"
    slug = re.sub(r"[^a-z0-9_-]", "", str(value).strip().lower())[:50]
    if not slug or slug in {"link", "copy", "direct_link", "directlink"}:
        return "direct"
    return slug


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


def _extract_session_token(request: Request, explicit: str | None = None) -> str | None:
    """Session token the respondent holds, from query (`st`) or header.

    sendBeacon cannot set headers, so the query param is supported too.
    """
    return explicit or request.query_params.get("st") or request.headers.get("x-session-token")


def _load_owned_response(
    response_id: uuid.UUID, request: Request, db: Session, explicit_token: str | None = None
) -> SurveyResponse:
    """Load a response and assert the caller proves ownership via session token.

    The respondent flow is anonymous; the session_token (held only in the
    respondent's browser) is the capability that authorizes reading/mutating a
    specific response. Without it, a response_id alone must NOT grant access.
    (AP-SEC-003)
    """
    r = _load_response(response_id, db)
    token = _extract_session_token(request, explicit_token)
    if not token or not r.session_token or not secrets.compare_digest(token, r.session_token):
        raise HTTPException(status_code=403, detail="Not authorized for this response")
    return r


def _response_language(value: str | None) -> str:
    return value if value in SUPPORTED_RESPONSE_LANGUAGES else "en"


# ── Create ────────────────────────────────────────────────────────────────────


@router.post("/", response_model=ResponseOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_response(request: Request, body: ResponseCreate, db: Session = Depends(get_db)):
    """
    Create a new in-progress response row.
    Called by SurveyRespond.jsx → ensureR() when the user first interacts.
    Handles the race-condition guard: if a row already exists for this
    session_token return it instead of inserting a duplicate.
    """
    if body.session_token:
        existing = db.query(SurveyResponse).filter(SurveyResponse.session_token == body.session_token).first()
        if existing:
            if body.language:
                existing.language = _response_language(body.language)
                db.commit()
                db.refresh(existing)
            logger.info(
                "response_create_existing",
                extra={"response_id": str(existing.id), "survey_id": str(existing.survey_id)},
            )
            return ResponseOut.model_validate(existing)

    row = SurveyResponse(
        id=uuid.uuid4(),
        survey_id=body.survey_id,
        session_token=body.session_token or str(uuid.uuid4()),
        respondent_email=body.respondent_email,
        source=_normalize_source(body.source),
        language=_response_language(body.language),
        age_range=body.age_range,
        gender=body.gender,
        occupation=body.occupation,
        country=body.country,
        state=body.state,
        city=body.city,
        status=ResponseStatusEnum.in_progress,
        started_at=datetime.now(timezone.utc),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if body.session_token:
            existing = (
                db.query(SurveyResponse)
                .filter(SurveyResponse.session_token == body.session_token)
                .first()
            )
            if existing:
                logger.warning(
                    "response_create_duplicate_session_recovered",
                    extra={"response_id": str(existing.id), "survey_id": str(existing.survey_id)},
                )
                return ResponseOut.model_validate(existing)
        logger.exception(
            "response_create_integrity_error",
            extra={"survey_id": str(body.survey_id), "has_session_token": bool(body.session_token)},
        )
        raise HTTPException(status_code=409, detail="Duplicate response session") from exc
    db.refresh(row)
    logger.info(
        "response_created",
        extra={"response_id": str(row.id), "survey_id": str(row.survey_id)},
    )
    return ResponseOut.model_validate(row)


# ── Get by session token ──────────────────────────────────────────────────────


@router.get("/session/{token}", response_model=Optional[ResponseOut])
@limiter.limit("20/minute")
def get_response_by_session(request: Request, token: str, db: Session = Depends(get_db)):
    """
    Lookup an existing in-progress response by session_token.
    Used on SurveyRespond page load to resume a previous session.
    """
    r = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(
            SurveyResponse.session_token == token,
            SurveyResponse.status == ResponseStatusEnum.in_progress,
        )
        .first()
    )
    if not r:
        return None
    return ResponseOut.model_validate(r)


# ── Get by id ─────────────────────────────────────────────────────────────────


@router.get("/{response_id}", response_model=ResponseOut)
@limiter.limit("20/minute")
def get_response(request: Request, response_id: uuid.UUID, db: Session = Depends(get_db)):
    return ResponseOut.model_validate(_load_owned_response(response_id, request, db))


# ── Update metadata ───────────────────────────────────────────────────────────


@router.patch("/{response_id}", response_model=ResponseOut)
@limiter.limit("20/minute")
def update_response(
    request: Request,
    response_id: uuid.UUID,
    body: ResponseUpdate,
    db: Session = Depends(get_db),
):
    """Update email, status, last_saved_at, or metadata."""
    r = _load_owned_response(response_id, request, db)

    logger.info(
        "response_update_requested",
        extra={
            "response_id": str(response_id),
            "fields": list(body.model_fields_set),
        },
    )

    if body.respondent_email is not None:
        r.respondent_email = body.respondent_email
    if body.language is not None:
        r.language = _response_language(body.language)
    if body.status is not None:
        try:
            r.status = ResponseStatusEnum(body.status)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid response status")
    if body.last_saved_at is not None:
        r.last_saved_at = body.last_saved_at
    if body.metadata is not None:
        r.response_metadata = body.metadata
    if body.age_range is not None:
        r.age_range = body.age_range

    if body.gender is not None:
        r.gender = body.gender

    if body.occupation is not None:
        r.occupation = body.occupation
    if body.country is not None:
        r.country = body.country

    if body.state is not None:
        r.state = body.state
    if body.city is not None:
        r.city = body.city

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("response_update_failed", extra={"response_id": str(response_id)})
        raise
    db.refresh(r)
    logger.info("response_updated", extra={"response_id": str(response_id), "status": r.status.value})
    return ResponseOut.model_validate(r)


# ── Upsert answers (auto-save) ────────────────────────────────────────────────


@router.post("/{response_id}/answers")
@limiter.limit("30/minute")
def upsert_answers(
    request: Request,
    response_id: uuid.UUID,
    answers: List[AnswerIn],
    db: Session = Depends(get_db),
):
    """
    Upsert one or more answers for a response.
    On conflict (response_id, question_id) update the existing row.
    Mirrors the Supabase `.upsert()` with onConflict='response_id,question_id'.
    """
    r = _load_owned_response(response_id, request, db)

    for ans in answers:
        existing = (
            db.query(SurveyAnswer)
            .filter(
                SurveyAnswer.response_id == response_id,
                SurveyAnswer.question_id == ans.question_id,
            )
            .first()
        )

        if existing:
            existing.answer_value = ans.answer_value
            existing.answer_json = ans.answer_json
        else:
            db.add(
                SurveyAnswer(
                    id=uuid.uuid4(),
                    response_id=response_id,
                    question_id=ans.question_id,
                    answer_value=ans.answer_value,
                    answer_json=ans.answer_json,
                )
            )

    # Update last_saved_at
    r.last_saved_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "response_answers_save_failed",
            extra={"response_id": str(response_id), "answer_count": len(answers)},
        )
        raise
    logger.info(
        "response_answers_saved",
        extra={"response_id": str(response_id), "answer_count": len(answers)},
    )
    return {"message": "Answers saved", "count": len(answers)}


# ── Submit ────────────────────────────────────────────────────────────────────


@router.post("/{response_id}/submit")
@limiter.limit("5/minute")
def submit_response(
    request: Request,
    response_id: uuid.UUID,
    body: SubmitResponse,
    db: Session = Depends(get_db),
):
    """
    Mark a response as completed.
    Replaces the Netlify `respond` function (action='submit').
    Accepts optional `metadata` dict (quality_score etc.).
    """
    r = _load_owned_response(response_id, request, db)
    if r.status == ResponseStatusEnum.completed:
        logger.info("response_submit_duplicate", extra={"response_id": str(response_id)})
        raise HTTPException(status_code=409, detail="This survey response has already been submitted")

    r.status = ResponseStatusEnum.completed
    r.completed_at = datetime.now(timezone.utc)

    # Merge any extra metadata (quality_score from useResponseTracking)
    if body.metadata:
        r.response_metadata = {**(r.response_metadata or {}), **body.metadata}

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("response_submit_failed", extra={"response_id": str(response_id)})
        raise
    logger.info("response_submitted", extra={"response_id": str(response_id), "survey_id": str(r.survey_id)})
    return {"message": "Response submitted successfully", "response_id": response_id}


# ── Mark as abandoned ─────────────────────────────────────────────────────────


@router.post("/{response_id}/abandon")
@limiter.limit("10/minute")
def abandon_response(
    request: Request,
    response_id: uuid.UUID,
    body: dict = {},
    db: Session = Depends(get_db),
):
    """
    Mark a response as abandoned + store drop-off metadata.
    Called by useExitDetection.js / useResponseTracking.js onAbandon.
    """
    r = _load_owned_response(response_id, request, db)

    r.status = ResponseStatusEnum.abandoned
    if isinstance(body, dict) and body.get("metadata"):
        r.response_metadata = {**(r.response_metadata or {}), **body["metadata"]}

    db.commit()
    return {"message": "Response marked as abandoned"}
