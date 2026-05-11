"""
routes/surveys.py
─────────────────
Full CRUD for surveys and their questions.
All operations are tenant-scoped.

GET    /surveys/                     — list all surveys
POST   /surveys/                     — create survey + questions
GET    /surveys/{id}                 — get survey (with questions)
PATCH  /surveys/{id}                 — update metadata
PATCH  /surveys/{id}/status          — change status
DELETE /surveys/{id}                 — delete survey
GET    /surveys/{id}/questions       — get questions only
PUT    /surveys/{id}/questions       — replace all questions
POST   /surveys/{id}/duplicate       — duplicate survey
GET    /surveys/slug/{slug}          — PUBLIC fetch by slug (SurveyRespond)
"""

import uuid
import re
import random
import string
import os
from datetime import datetime, timezone
from typing import List
from core.rate_limiter import limiter
from fastapi import Request
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from fastapi import Query

from db.database import get_db
from db.models import (
    UserProfile, Survey, SurveyQuestion, SurveyStatusEnum, QuestionTypeEnum,
    SurveyShare, SharePermissionEnum, Tenant, SurveyResponse, SurveyAnswer,
    SurveyFeedback
)
from schemas import (
    SurveyCreate, SurveyUpdate, SurveyOut, SurveyStatusUpdate,
    QuestionIn, QuestionOut, SurveyShareCreate, SurveyShareOut, MessageResponse,
    ResponseOut, AnswerOut, FeedbackOut,
)
from dependencies import get_current_user
from services.feature_gate import require_feature


router = APIRouter(prefix="/surveys", tags=["surveys"])

# Roles that can create / modify surveys
CREATOR_ROLES = {"super_admin", "admin", "manager", "creator"}


def _require_creator(user: UserProfile):
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in CREATOR_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions to modify surveys")


def _gen_slug(title: str) -> str:
    """Generate a URL slug from a title + random suffix."""
    base = re.sub(r"[^\w\s-]", "", title.lower()).strip()
    base = re.sub(r"[\s_-]+", "-", base)[:40]
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=5))
    return f"{base}-{suffix}" if base else suffix


def _ensure_unique_slug(slug: str, db: Session, exclude_id=None) -> str:
    candidate = slug
    counter = 1
    q = db.query(Survey).filter(Survey.slug == candidate)
    if exclude_id:
        q = q.filter(Survey.id != exclude_id)
    while q.first():
        candidate = f"{slug}-{counter}"
        counter += 1
        q = db.query(Survey).filter(Survey.slug == candidate)
        if exclude_id:
            q = q.filter(Survey.id != exclude_id)
    return candidate


def _question_type(qt: str) -> QuestionTypeEnum:
    try:
        return QuestionTypeEnum(qt)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Unknown question type: {qt}")


def _upsert_questions(survey_id: uuid.UUID, questions: List[QuestionIn], db: Session):
    """Replace all questions for a survey."""
    db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).delete()
    for i, q in enumerate(questions):
        row = SurveyQuestion(
            id=q.id or uuid.uuid4(),
            survey_id=survey_id,
            question_text=q.question_text,
            question_type=_question_type(q.question_type),
            options=q.options,
            is_required=q.is_required,
            description=q.description,
            sort_order=q.sort_order if q.sort_order is not None else i,
            validation_rules=q.validation_rules,
        )
        db.add(row)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[SurveyOut])
@limiter.limit("20/minute")
def list_surveys(
    request: Request,
    q: str = None,
    skip: int = 0,
    limit: int = Query(10, le=100),
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    query = (
        db.query(Survey)
        .options(joinedload(Survey.questions))
        .options(joinedload(Survey.creator))
        .filter(Survey.tenant_id == current_user.tenant_id)
    )

    if q:
        query = query.filter(
            Survey.title.ilike(f"%{q}%")
        )

    surveys = (
        query
        .order_by(Survey.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        SurveyOut.model_validate(s)
        for s in surveys
    ]


# ── Public: fetch by slug (no auth required — SurveyRespond.jsx) ─────────────

@router.get("/slug/{slug}", response_model=SurveyOut)
@limiter.limit("20/minute")
def get_survey_by_slug( request: Request, slug: str, db: Session = Depends(get_db)):
    survey = (
        db.query(Survey)
        .options(joinedload(Survey.questions))
        .filter(Survey.slug == slug)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    out = SurveyOut.model_validate(survey)
    # Embed tenant name so SurveyRespond.jsx skips a second API call
    if survey.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == survey.tenant_id).first()
        if tenant:
            out.tenant_name = tenant.name
    return out


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_survey(
    request: Request,
    body: SurveyCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
    _gate: None = Depends(require_feature("create_survey")),
):
    _require_creator(current_user)

    # Resolve slug
    raw_slug = body.slug or _gen_slug(body.title)
    slug = _ensure_unique_slug(raw_slug, db)

    try:
        sv_status = SurveyStatusEnum(body.status)
    except ValueError:
        sv_status = SurveyStatusEnum.draft

    if sv_status == SurveyStatusEnum.active and (not body.questions or len(body.questions) < 2):
        raise HTTPException(status_code=400, detail="At least 2 questions are required to publish")

    if sv_status == SurveyStatusEnum.active and body.expires_at:
        # Ensure aware comparison in UTC
        exp = body.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        else:
            exp = exp.astimezone(timezone.utc)
        
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Expiry date cannot be in the past for active surveys")

    survey = Survey(
        id=uuid.uuid4(),
        title=body.title,
        description=body.description,
        welcome_message=body.welcome_message,
        thank_you_message=body.thank_you_message,
        expires_at=body.expires_at,
        allow_anonymous=body.allow_anonymous,
        require_email=body.require_email,
        show_progress_bar=body.show_progress_bar,
        theme_color=body.theme_color,
        slug=slug,
        status=sv_status,
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    db.add(survey)
    db.flush()

    if body.questions:
        _upsert_questions(survey.id, body.questions, db)

    db.commit()
    db.refresh(survey)
    # Reload with questions relationship
    survey = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == survey.id).first()
    return SurveyOut.model_validate(survey)


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{survey_id}", response_model=SurveyOut)
@limiter.limit("20/minute")
def get_survey(
    request: Request,
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = (
        db.query(Survey)
        .options(joinedload(Survey.questions))
        .filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return SurveyOut.model_validate(survey)


# ── Update metadata ───────────────────────────────────────────────────────────

@router.patch("/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: uuid.UUID,
    body: SurveyUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator(current_user)
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    update_data = body.model_dump(exclude_unset=True)

    if "status" in update_data:
        try:
            new_status = SurveyStatusEnum(update_data["status"])
            if new_status == SurveyStatusEnum.active:
                q_count = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).count()
                if q_count < 2:
                    raise HTTPException(status_code=400, detail="At least 2 questions are required to publish")
                
                # Check expiry date
                exp = update_data.get("expires_at", survey.expires_at)
                if exp:
                    if isinstance(exp, str): exp = datetime.fromisoformat(exp.replace('Z', '+00:00'))
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    else:
                        exp = exp.astimezone(timezone.utc)
                        
                    if exp < datetime.now(timezone.utc):
                        raise HTTPException(status_code=400, detail="Expiry date cannot be in the past for active surveys")
            
            update_data["status"] = new_status
        except ValueError:
            del update_data["status"]

    if "slug" in update_data and update_data["slug"]:
        update_data["slug"] = _ensure_unique_slug(update_data["slug"], db, exclude_id=survey_id)

    for field, value in update_data.items():
        setattr(survey, field, value)

    db.commit()
    db.refresh(survey)
    survey = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == survey_id).first()
    return SurveyOut.model_validate(survey)


# ── Status ────────────────────────────────────────────────────────────────────

@router.patch("/{survey_id}/status", response_model=SurveyOut)
def update_survey_status(
    survey_id: uuid.UUID,
    body: SurveyStatusUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator(current_user)
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    try:
        new_status = SurveyStatusEnum(body.status)
        if new_status == SurveyStatusEnum.active:
            q_count = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).count()
            if q_count < 2:
                raise HTTPException(status_code=400, detail="At least 2 questions are required to publish")
            
            exp = survey.expires_at
            if exp:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                else:
                    exp = exp.astimezone(timezone.utc)
                
                if exp < datetime.now(timezone.utc):
                    raise HTTPException(status_code=400, detail="Expiry date cannot be in the past for active surveys")
        
        survey.status = new_status
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")

    db.commit()
    db.refresh(survey)
    survey = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == survey_id).first()
    return SurveyOut.model_validate(survey)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{survey_id}", response_model=MessageResponse)
def delete_survey(
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator(current_user)
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    db.delete(survey)
    db.commit()
    return {"message": "Survey deleted"}


# ── Questions ─────────────────────────────────────────────────────────────────

@router.get("/{survey_id}/questions", response_model=List[QuestionOut])
def get_questions(
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    questions = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey_id)
        .order_by(SurveyQuestion.sort_order)
        .all()
    )
    return [QuestionOut.model_validate(q) for q in questions]


@router.put("/{survey_id}/questions", response_model=List[QuestionOut])
def replace_questions(
    survey_id: uuid.UUID,
    questions: List[QuestionIn],
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replace ALL questions for a survey (SurveyCreate/SurveyEdit save flow)."""
    _require_creator(current_user)
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    _upsert_questions(survey.id, questions, db)
    db.commit()

    rows = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey_id)
        .order_by(SurveyQuestion.sort_order)
        .all()
    )
    return [QuestionOut.model_validate(q) for q in rows]


# ── Duplicate ─────────────────────────────────────────────────────────────────

@router.post("/{survey_id}/duplicate", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
def duplicate_survey(
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Duplicate a survey and all its questions (SurveyList.jsx)."""
    _require_creator(current_user)
    original = (
        db.query(Survey)
        .options(joinedload(Survey.questions))
        .filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id)
        .first()
    )
    if not original:
        raise HTTPException(status_code=404, detail="Survey not found")

    new_slug = _ensure_unique_slug(_gen_slug(f"copy-{original.title}"), db)
    copy = Survey(
        id=uuid.uuid4(),
        title=f"Copy of {original.title}",
        description=original.description,
        welcome_message=original.welcome_message,
        thank_you_message=original.thank_you_message,
        expires_at=None,
        allow_anonymous=original.allow_anonymous,
        require_email=original.require_email,
        show_progress_bar=original.show_progress_bar,
        theme_color=original.theme_color,
        slug=new_slug,
        status=SurveyStatusEnum.draft,
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    db.add(copy)
    db.flush()

    for q in original.questions:
        db.add(SurveyQuestion(
            id=uuid.uuid4(),
            survey_id=copy.id,
            question_text=q.question_text,
            question_type=q.question_type,
            options=q.options,
            is_required=q.is_required,
            description=q.description,
            sort_order=q.sort_order,
            validation_rules=q.validation_rules,
        ))

    db.commit()
    db.refresh(copy)
    copy = db.query(Survey).options(joinedload(Survey.questions)).filter(Survey.id == copy.id).first()
    return SurveyOut.model_validate(copy)


# ── Sharing ───────────────────────────────────────────────────────────────────

@router.get("/{survey_id}/shares", response_model=List[SurveyShareOut])
def get_survey_shares(
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all team members this survey has been shared with."""
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    shares = (
        db.query(SurveyShare)
        .options(joinedload(SurveyShare.user))
        .filter(SurveyShare.survey_id == survey_id)
        .all()
    )
    return [SurveyShareOut.model_validate(s) for s in shares]


@router.post("/{survey_id}/shares", response_model=SurveyShareOut)
def share_survey(
    survey_id: uuid.UUID,
    body: SurveyShareCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Share a survey with another team member."""
    _require_creator(current_user)
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Ensure recipient belongs to the same tenant
    target_user = db.query(UserProfile).filter(
        UserProfile.id == body.shared_with, UserProfile.tenant_id == current_user.tenant_id
    ).first()
    if not target_user:
        raise HTTPException(status_code=400, detail="User not found in your team")

    # Check if already shared
    existing = db.query(SurveyShare).filter(
        SurveyShare.survey_id == survey_id, SurveyShare.shared_with == body.shared_with
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already shared with this user")

    share = SurveyShare(
        id=uuid.uuid4(),
        survey_id=survey_id,
        shared_with=body.shared_with,
        permission=SharePermissionEnum(body.permission)
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    # Reload with user relationship
    share = db.query(SurveyShare).options(joinedload(SurveyShare.user)).filter(SurveyShare.id == share.id).first()



    return SurveyShareOut.model_validate(share)


@router.delete("/{survey_id}/shares/{share_id}", response_model=MessageResponse)
def revoke_share(
    survey_id: uuid.UUID,
    share_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a team member's access to a survey."""
    _require_creator(current_user)
    share = db.query(SurveyShare).filter(
        SurveyShare.id == share_id, SurveyShare.survey_id == survey_id
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share record not found")

    db.delete(share)
    db.commit()
    return {"message": "Access revoked"}


# ── Responses for a survey ────────────────────────────────────────────────────

@router.get("/{survey_id}/responses", response_model=List[ResponseOut])
@limiter.limit("10/minute")
def get_survey_responses(
    request: Request,  
    survey_id: uuid.UUID,
    skip: int = 0, limit: int = Query(10, le=100),
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    responses = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey_answers))
        .filter(SurveyResponse.survey_id == survey_id)
        .order_by(SurveyResponse.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()

    )

    return [ResponseOut.model_validate(r) for r in responses]


# ── Answers for a survey (flat list for analytics) ────────────────────────────

@router.get("/{survey_id}/answers", response_model=List[AnswerOut])
@limiter.limit("10/minute")
def get_survey_answers(
     request: Request,  
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    answers = (
        db.query(SurveyAnswer)
        .join(SurveyResponse, SurveyAnswer.response_id == SurveyResponse.id)
        .filter(SurveyResponse.survey_id == survey_id)
        .all()
    )
    return [AnswerOut.model_validate(a) for a in answers]


# ── Feedback for a survey ─────────────────────────────────────────────────────

@router.get("/{survey_id}/feedback", response_model=List[FeedbackOut])
@limiter.limit("10/minute")
def get_survey_feedback(
    request: Request,
    survey_id: uuid.UUID,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(
        Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    feedbacks = db.query(SurveyFeedback).filter(SurveyFeedback.survey_id == survey_id).all()
    return [FeedbackOut.model_validate(f) for f in feedbacks]


@router.post("/{survey_id}/feedback")
@limiter.limit("5/minute")
def create_survey_feedback(
     request: Request, 
    survey_id: uuid.UUID,
    body: dict,
    db: Session = Depends(get_db),
):
    """Public endpoint to submit feedback for a survey."""
    fb = SurveyFeedback(
        id=uuid.uuid4(),
        survey_id=survey_id,
        rating=body.get("rating"),
        comment=body.get("comment"),
        responded_at=datetime.now(timezone.utc),
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback received"}
