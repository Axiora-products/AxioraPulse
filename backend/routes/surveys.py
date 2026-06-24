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
GET    /surveys/og/{slug}            — PUBLIC OG meta-tag HTML for social-media bots
"""

import uuid
import re
import json
import random
import string
import os
import requests
from functools import lru_cache
from datetime import datetime, timezone
from typing import Any, List
from html import escape
from urllib.parse import quote
from core.rate_limiter import limiter
from fastapi import Request
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session, joinedload
from fastapi import Query

from db.database import get_db
from db.models import (
    UserProfile,
    Survey,
    SurveyQuestion,
    SurveyStatusEnum,
    QuestionTypeEnum,
    SurveyShare,
    SharePermissionEnum,
    Tenant,
    SurveyResponse,
    SurveyAnswer,
    SurveyFeedback,
    Subscription,
)
from core import config
from schemas import (
    SurveyCreate,
    SurveyUpdate,
    SurveyOut,
    SurveyStatusUpdate,
    QuestionIn,
    QuestionOut,
    SurveyShareCreate,
    SurveyShareOut,
    MessageResponse,
    ResponseOut,
    AnswerOut,
    FeedbackOut,
)
from dependencies import get_current_user


router = APIRouter(prefix="/surveys", tags=["surveys"])

# Roles that can create / modify surveys
CREATOR_ROLES = {"super_admin", "admin", "manager", "creator"}
GEMINI_MODEL = "gemini-2.5-flash"


def _require_creator(user: UserProfile):
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in CREATOR_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions to modify surveys")


# Free-trial limit message (kept in sync with the frontend upgrade modal).
SURVEY_LIMIT_DETAIL = (
    "You have reached the maximum limit of 3 surveys available under the free plan. "
    "Upgrade your plan to create additional surveys."
)


def _effective_survey_limit(db: Session, user: UserProfile):
    """Max non-draft surveys allowed for this tenant. A paid plan's own
    ``max_surveys`` wins; tenants with no paid plan fall back to the free
    ceiling. Returns ``None`` when unlimited (or limits are bypassed)."""
    if config.DISABLE_PAYMENTS or getattr(user, "is_internal", False):
        return None
    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == user.tenant_id, Subscription.status == "active")
        .first()
    )
    plan = sub.plan if sub else None
    if plan is not None:
        return plan.max_surveys  # may be None => unlimited
    return config.FREE_PLAN_MAX_SURVEYS


def _assert_within_survey_limit(db: Session, user: UserProfile, exclude_id=None) -> None:
    """Block when the tenant already has the maximum number of non-draft
    (active/paused/expired/closed) surveys. Drafts are never counted. Called
    before creating an active survey or publishing/activating an existing one.
    """
    limit = _effective_survey_limit(db, user)
    if limit is None:
        return
    q = db.query(Survey).filter(
        Survey.tenant_id == user.tenant_id,
        Survey.status != SurveyStatusEnum.draft,
    )
    if exclude_id is not None:
        q = q.filter(Survey.id != exclude_id)
    non_draft_count = q.count()
    if non_draft_count >= limit:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SURVEY_LIMIT_DETAIL)


# Org-level managers may administer any survey in their tenant.
SURVEY_ADMIN_ROLES = {"super_admin", "admin", "manager"}


def _authorize_survey_write(survey, user: UserProfile, db: Session) -> None:
    """Object-level authorization for survey mutations.

    Tenant scoping alone is insufficient: a plain creator must not be able to
    edit/delete a teammate's survey just by knowing its id. Allow org managers,
    the survey's creator, or a user granted an editor share. (AP-SEC-017)
    """
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val in SURVEY_ADMIN_ROLES:
        return
    if survey.created_by == user.id:
        return
    editor_share = (
        db.query(SurveyShare)
        .filter(
            SurveyShare.survey_id == survey.id,
            SurveyShare.shared_with == user.id,
            SurveyShare.permission == SharePermissionEnum.editor,
        )
        .first()
    )
    if editor_share:
        return
    raise HTTPException(status_code=403, detail="You do not have permission to modify this survey")


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


def _localized_text(value: Any, translations: dict[str, str] | None = None) -> dict[str, str]:
    if isinstance(value, dict):
        en = str(value.get("en") or value.get("text") or "")
        return {
            "en": en,
            "te": str(value.get("te") or (translations or {}).get("te") or en),
            "hi": str(value.get("hi") or (translations or {}).get("hi") or en),
        }

    en = str(value or "")
    return {
        "en": en,
        "te": str((translations or {}).get("te") or en),
        "hi": str((translations or {}).get("hi") or en),
    }


@lru_cache(maxsize=1024)
def _translate_with_google(text: str, lang: str) -> str:
    try:
        res = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={
                "client": "gtx",
                "sl": "en",
                "tl": lang,
                "dt": "t",
                "q": text,
            },
            timeout=8,
        )
        res.raise_for_status()
        data = res.json()
        translated = "".join(part[0] for part in data[0] if part and part[0])
        return translated or text
    except Exception as exc:
        print(f"[SURVEY_TRANSLATION] Google fallback failed for {lang}: {exc}")
        return text


def _translate_texts(texts: list[str]) -> dict[str, dict[str, str]]:
    unique_texts = [text for text in dict.fromkeys(t.strip() for t in texts if t and t.strip())]
    if not unique_texts:
        return {}

    api_key = os.getenv("GEMINI_KEY")
    if not api_key or api_key.startswith("mock"):
        return {
            text: {
                "te": _translate_with_google(text, "te"),
                "hi": _translate_with_google(text, "hi"),
            }
            for text in unique_texts
        }

    payload = {
        "texts": unique_texts,
        "target_languages": {
            "te": "Telugu",
            "hi": "Hindi",
        },
    }
    prompt = f"""Translate these survey texts into natural Telugu and Hindi.
Return only valid JSON in this exact shape:
{{"translations": [{{"en": "original text", "te": "Telugu translation", "hi": "Hindi translation"}}]}}

Input:
{json.dumps(payload, ensure_ascii=False)}"""

    try:
        res = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {
                    "parts": [{"text": "You are a careful translator. Always return valid JSON only."}]
                },
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": 4096,
                },
            },
            timeout=20,
        )
        res.raise_for_status()
        data = res.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
    except Exception as exc:
        print(f"[SURVEY_TRANSLATION] Dynamic translation failed: {exc}")
        return {}

    translated = {}
    for item in result.get("translations", []):
        en = str(item.get("en") or "").strip()
        if not en:
            continue
        translated[en] = {
            "te": str(item.get("te") or en),
            "hi": str(item.get("hi") or en),
        }
    return translated


def _collect_option_texts(options: Any) -> list[str]:
    texts = []
    if isinstance(options, list):
        for item in options:
            if isinstance(item, dict):
                for key in ("label", "description"):
                    if isinstance(item.get(key), str):
                        texts.append(item[key])
    elif isinstance(options, dict):
        for key in ("rows", "columns"):
            items = options.get(key)
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        for text_key in ("label", "description"):
                            if isinstance(item.get(text_key), str):
                                texts.append(item[text_key])
        for key in ("min_label", "max_label"):
            if isinstance(options.get(key), str):
                texts.append(options[key])
    return texts


def _localize_options(options: Any, translations: dict[str, dict[str, str]]) -> Any:
    if isinstance(options, list):
        localized = []
        for item in options:
            if not isinstance(item, dict):
                localized.append(item)
                continue
            next_item = dict(item)
            for key in ("label", "description"):
                if isinstance(next_item.get(key), str):
                    text = next_item[key].strip()
                    next_item[key] = _localized_text(next_item[key], translations.get(text))
            localized.append(next_item)
        return localized

    if isinstance(options, dict):
        next_options = dict(options)
        for key in ("rows", "columns"):
            items = next_options.get(key)
            if isinstance(items, list):
                next_options[key] = _localize_options(items, translations)
        for key in ("min_label", "max_label"):
            if isinstance(next_options.get(key), str):
                text = next_options[key].strip()
                next_options[key] = _localized_text(next_options[key], translations.get(text))
        return next_options

    return options


def _localize_public_survey(out: SurveyOut) -> SurveyOut:
    questions = out.questions or []
    source_texts = []

    for value in (out.title, out.description, out.welcome_message, out.thank_you_message):
        if isinstance(value, str):
            source_texts.append(value)

    for q in questions:
        if isinstance(q.question_text, str):
            source_texts.append(q.question_text)
        if isinstance(q.description, str):
            source_texts.append(q.description)
        source_texts.extend(_collect_option_texts(q.options))

    translations = _translate_texts(source_texts)

    if isinstance(out.title, str):
        out.title = _localized_text(out.title, translations.get(out.title.strip()))
    if isinstance(out.description, str):
        out.description = _localized_text(out.description, translations.get(out.description.strip()))
    if isinstance(out.welcome_message, str):
        out.welcome_message = _localized_text(out.welcome_message, translations.get(out.welcome_message.strip()))
    if isinstance(out.thank_you_message, str):
        out.thank_you_message = _localized_text(out.thank_you_message, translations.get(out.thank_you_message.strip()))

    for q in questions:
        if isinstance(q.question_text, str):
            q.question_text = _localized_text(q.question_text, translations.get(q.question_text.strip()))
        else:
            q.question_text = _localized_text(q.question_text)
        if isinstance(q.description, str):
            q.description = _localized_text(q.description, translations.get(q.description.strip()))
        q.options = _localize_options(q.options, translations)
    return out


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


# ── Auto-save draft ──────────────────────────────────────────────────────────


@router.patch("/draft/auto-save")
@limiter.limit("10/minute")
def auto_save_draft(
    request: Request,
    body: dict,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Incrementally save a prompt draft while the user is typing.
    Creates a new draft survey or updates an existing one (by draft_id).
    """
    _require_creator(current_user)

    draft_id = body.get("draft_id")
    prompt_text = body.get("prompt", "")
    mode = body.get("mode", "conversational")
    custom_instruction = body.get("custom_instruction", "")
    attachments = body.get("attachments", [])

    if draft_id:
        # Update existing draft
        try:
            survey = (
                db.query(Survey)
                .filter(
                    Survey.id == draft_id,
                    Survey.tenant_id == current_user.tenant_id,
                    Survey.status == SurveyStatusEnum.draft,
                )
                .first()
            )
        except Exception:
            survey = None

        if survey:
            survey.description = prompt_text
            # Store mode and attachments in a JSONB-safe way via welcome_message
            meta = json.dumps({"mode": mode, "custom_instruction": custom_instruction, "attachments": attachments})
            survey.welcome_message = meta
            db.commit()
            db.refresh(survey)
            return {
                "id": str(survey.id),
                "saved_at": survey.created_at.isoformat() if survey.created_at else None,
            }

    # Create new draft
    slug = _ensure_unique_slug(_gen_slug("auto-draft"), db)
    survey = Survey(
        id=uuid.uuid4(),
        title="Untitled Draft",
        description=prompt_text,
        welcome_message=json.dumps(
            {"mode": mode, "custom_instruction": custom_instruction, "attachments": attachments}
        ),
        slug=slug,
        status=SurveyStatusEnum.draft,
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)

    return {
        "id": str(survey.id),
        "saved_at": survey.created_at.isoformat() if survey.created_at else None,
    }


# ── List ──────────────────────────────────────────────────────────────────────


@router.get("/", response_model=List[SurveyOut])
@limiter.limit("120/minute")
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
        .filter(
            Survey.tenant_id == current_user.tenant_id,
            Survey.created_by == current_user.id,
        )
    )

    if q:
        query = query.filter(Survey.title.ilike(f"%{q}%"))

    surveys = query.order_by(Survey.created_at.desc()).offset(skip).limit(limit).all()

    return [SurveyOut.model_validate(s) for s in surveys]


@router.get("/check-slug", response_model=dict)
@limiter.limit("30/minute")
def check_slug(
    request: Request,
    slug: str,
    exclude_survey_id: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Check if a custom survey slug is valid and unique.
    """
    if not slug or not re.match(r"^[a-z0-9-]+$", slug) or len(slug) > 50:
        return {"available": False, "reason": "invalid"}

    q = db.query(Survey).filter(Survey.slug == slug)
    if exclude_survey_id and exclude_survey_id.strip() not in ("", "null", "undefined"):
        try:
            parsed_uuid = uuid.UUID(exclude_survey_id)
            q = q.filter(Survey.id != parsed_uuid)
        except ValueError:
            pass

    exists = q.first() is not None
    return {"available": not exists}


# ── Public: fetch by slug (no auth required — SurveyRespond.jsx) ─────────────


@router.get("/slug/{slug}", response_model=SurveyOut)
@limiter.limit("20/minute")
def get_survey_by_slug(request: Request, slug: str, db: Session = Depends(get_db)):
    survey = (
        db.query(Survey)
        .options(joinedload(Survey.questions))
        .options(joinedload(Survey.creator))
        .filter(Survey.slug == slug)
        # Never expose unpublished (draft) surveys publicly. (AP-SEC-037)
        .filter(Survey.status != SurveyStatusEnum.draft)
        .first()
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    out = SurveyOut.model_validate(survey)
    out = _localize_public_survey(out)
    # Embed tenant name so SurveyRespond.jsx skips a second API call
    if survey.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == survey.tenant_id).first()
        if tenant:
            out.tenant_name = tenant.name
    return out


# ── Public: OG meta-tag page for social-media bots ───────────────────────────


@router.get("/og/{slug}", response_class=HTMLResponse, include_in_schema=False)
def get_survey_og(slug: str, db: Session = Depends(get_db)):
    """
    Returns a minimal HTML page with Open Graph / Twitter Card meta tags
    for the given survey slug.  Social-media crawlers (WhatsApp, Telegram,
    LinkedIn, Facebook, Twitter) visit this URL and use the tags to render
    rich link previews.  Human visitors are immediately JS-redirected to the
    React SPA at /s/{slug}.

    Nginx bot-detection routes crawler User-Agents from /s/{slug} to
    /api/surveys/og/{slug} so the share URL stays clean.
    """
    survey = db.query(Survey).filter(Survey.slug == slug, Survey.status != SurveyStatusEnum.draft).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    frontend_url = (
        os.environ.get("FRONTEND_URL") or os.environ.get("VITE_FRONTEND_URL") or "https://app.axiorapulse.com"
    ).rstrip("/")

    safe_slug = quote(slug, safe="")
    survey_url = f"{frontend_url}/s/{safe_slug}"
    og_image_url = f"{frontend_url}/og-share-card.png"

    title = escape(survey.title or "Survey", quote=True)
    raw_desc = (
        survey.description
        or f"Take this short survey and share your perspective on: {survey.title or 'User Feedback'}."
    )
    description = escape(raw_desc[:200], quote=True)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — Axiora Pulse</title>
  <meta name="description" content="{description}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="{survey_url}" />
  <meta property="og:title"       content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:image"       content="{og_image_url}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Axiora Pulse" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image"       content="{og_image_url}" />

  <!-- Redirect human visitors to the React SPA immediately -->
  <meta http-equiv="refresh" content="0; url={survey_url}" />
  <script>window.location.replace("{survey_url}");</script>
</head>
<body style="margin:0;background:#160F08;color:#FDF5E8;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <p>Redirecting… <a href="{survey_url}" style="color:#FF4500;">{title}</a></p>
</body>
</html>"""
    return HTMLResponse(content=html)


# ── Create ────────────────────────────────────────────────────────────────────


@router.post("/", response_model=SurveyOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_survey(
    request: Request,
    body: SurveyCreate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator(current_user)

    # Resolve slug
    raw_slug = body.slug or _gen_slug(body.title)
    slug = _ensure_unique_slug(raw_slug, db)

    try:
        sv_status = SurveyStatusEnum(body.status)
    except ValueError:
        sv_status = SurveyStatusEnum.draft

    # Free-plan limit applies to non-draft surveys only; drafts are unlimited.
    if sv_status != SurveyStatusEnum.draft:
        _assert_within_survey_limit(db, current_user)

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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)

    update_data = body.model_dump(exclude_unset=True)

    if "status" in update_data:
        try:
            new_status = SurveyStatusEnum(update_data["status"])
            if new_status == SurveyStatusEnum.active:
                # Publishing/activating counts toward the free-plan limit.
                if survey.status == SurveyStatusEnum.draft:
                    _assert_within_survey_limit(db, current_user, exclude_id=survey_id)
                q_count = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).count()
                if q_count < 2:
                    raise HTTPException(status_code=400, detail="At least 2 questions are required to publish")

                # Check expiry date
                exp = update_data.get("expires_at", survey.expires_at)
                if exp:
                    if isinstance(exp, str):
                        exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    else:
                        exp = exp.astimezone(timezone.utc)

                    if exp < datetime.now(timezone.utc):
                        raise HTTPException(
                            status_code=400, detail="Expiry date cannot be in the past for active surveys"
                        )

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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)

    try:
        new_status = SurveyStatusEnum(body.status)
        if new_status == SurveyStatusEnum.active:
            # Publishing/activating a draft counts toward the free-plan limit.
            if survey.status == SurveyStatusEnum.draft:
                _assert_within_survey_limit(db, current_user, exclude_id=survey_id)
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)

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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    questions = (
        db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order).all()
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)

    _upsert_questions(survey.id, questions, db)
    db.commit()

    rows = (
        db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).order_by(SurveyQuestion.sort_order).all()
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
        db.add(
            SurveyQuestion(
                id=uuid.uuid4(),
                survey_id=copy.id,
                question_text=q.question_text,
                question_type=q.question_type,
                options=q.options,
                is_required=q.is_required,
                description=q.description,
                sort_order=q.sort_order,
                validation_rules=q.validation_rules,
            )
        )

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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    shares = (
        db.query(SurveyShare).options(joinedload(SurveyShare.user)).filter(SurveyShare.survey_id == survey_id).all()
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)

    # Ensure recipient belongs to the same tenant
    target_user = (
        db.query(UserProfile)
        .filter(UserProfile.id == body.shared_with, UserProfile.tenant_id == current_user.tenant_id)
        .first()
    )
    if not target_user:
        raise HTTPException(status_code=400, detail="User not found in your team")

    # Check if already shared
    existing = (
        db.query(SurveyShare)
        .filter(SurveyShare.survey_id == survey_id, SurveyShare.shared_with == body.shared_with)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already shared with this user")

    share = SurveyShare(
        id=uuid.uuid4(),
        survey_id=survey_id,
        shared_with=body.shared_with,
        permission=SharePermissionEnum(body.permission),
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    _authorize_survey_write(survey, current_user, db)
    share = db.query(SurveyShare).filter(SurveyShare.id == share_id, SurveyShare.survey_id == survey_id).first()
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
    skip: int = 0,
    # Analytics aggregates client-side over the full set, so allow fetching all
    # responses. Default stays modest for ad-hoc/paginated callers.
    limit: int = Query(50, le=100000),
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
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
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.tenant_id == current_user.tenant_id).first()
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
