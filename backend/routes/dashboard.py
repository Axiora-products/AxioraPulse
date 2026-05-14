"""
routes/dashboard.py
───────────────────
GET /dashboard/stats   — Summary statistics (Dashboard.jsx)
GET /dashboard/recent  — Last 6 surveys with response counts
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from core.rate_limiter import limiter
from db.database import get_db
from db.models import Survey, SurveyResponse, UserProfile, ResponseStatusEnum, SurveyStatusEnum
from schemas import DashboardStats, RecentSurvey
from dependencies import get_current_user
from fastapi import Request
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
@limiter.limit("30/minute")
def dashboard_stats(
    request: Request,   # ✅ ADD THIS
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Aggregated counts for the dashboard header cards.
    Matches what Dashboard.jsx fetches from Supabase.
    """
    tid = current_user.tenant_id

    total_surveys = db.query(func.count(Survey.id)).filter(Survey.tenant_id == tid).scalar() or 0

    active_surveys = db.query(func.count(Survey.id)).filter(
        Survey.tenant_id == tid,
        Survey.status == SurveyStatusEnum.active,
    ).scalar() or 0

    # Total responses across all tenant surveys
    total_responses = (
        db.query(func.count(SurveyResponse.id))
        .join(Survey, SurveyResponse.survey_id == Survey.id)
        .filter(Survey.tenant_id == tid)
        .scalar() or 0
    )

    completed_responses = (
        db.query(func.count(SurveyResponse.id))
        .join(Survey, SurveyResponse.survey_id == Survey.id)
        .filter(
            Survey.tenant_id == tid,
            SurveyResponse.status == ResponseStatusEnum.completed,
        )
        .scalar() or 0
    )

    completion_rate = (
        round((completed_responses / total_responses) * 100, 1)
        if total_responses > 0 else 0.0
    )

    team_members = (
        db.query(func.count(UserProfile.id))
        .filter(UserProfile.tenant_id == tid, UserProfile.is_active == True)
        .scalar() or 0
    )

    return DashboardStats(
        total_surveys=total_surveys,
        active_surveys=active_surveys,
        total_responses=total_responses,
        completion_rate=completion_rate,
        team_members=team_members,
    )


@router.get("/recent")
@limiter.limit("30/minute")
def recent_surveys(
    request: Request,   # ✅ ADD THIS
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Last 6 surveys with their response counts (Dashboard.jsx recent surveys list).
    """
    tid = current_user.tenant_id

    surveys = (
        db.query(Survey)
        .options(joinedload(Survey.creator))
        .filter(Survey.tenant_id == tid)
        .order_by(Survey.created_at.desc())
        .limit(6)
        .all()
    )

    result = []
    for sv in surveys:
        count = (
            db.query(func.count(SurveyResponse.id))
            .filter(SurveyResponse.survey_id == sv.id)
            .scalar() or 0
        )
        # Using a join or subquery would be more efficient, but keeping it simple for now
        from db.models import Question
        q_count = db.query(func.count(Question.id)).filter(Question.survey_id == sv.id).scalar() or 0
        
        result.append({
            "id": sv.id,
            "title": sv.title,
            "status": sv.status.value if hasattr(sv.status, "value") else sv.status,
            "slug": sv.slug,
            "theme_color": sv.theme_color,
            "creator": {"full_name": sv.creator.full_name} if sv.creator else None,
            "created_at": sv.created_at,
            "response_count": count,
            "question_count": q_count,
        })

    return result


@router.get("/feed")
@limiter.limit("20/minute")
def dashboard_feed(
    request: Request,   # ✅ ADD THIS
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Activity feed for the notification center.
    Returns recent completed responses and recent survey changes.
    """
    tid = current_user.tenant_id

    # 1. Recent completed responses
    resps = (
        db.query(SurveyResponse)
        .options(joinedload(SurveyResponse.survey))
        .join(Survey, SurveyResponse.survey_id == Survey.id)
        .filter(Survey.tenant_id == tid, SurveyResponse.status == ResponseStatusEnum.completed)
        .order_by(SurveyResponse.started_at.desc())
        .limit(12)
        .all()
    )

    # 2. Recent surveys
    survs = (
        db.query(Survey)
        .filter(Survey.tenant_id == tid)
        .order_by(Survey.created_at.desc())
        .limit(8)
        .all()
    )

    feed = []
    for r in resps:
        feed.append({
            "id": f"resp-{r.id}",
            "type": "response",
            "icon": "inbox",
            "text": f"New response on \"{r.survey.title}\"",
            "time": r.started_at,
            "to": f"/surveys/{r.survey.id}/analytics",
        })
    
    for s in survs:
        status_str = s.status.value if hasattr(s.status, "value") else str(s.status)
        feed.append({
            "id": f"sv-{s.id}-{status_str}",
            "type": "survey",
            "icon": "active" if status_str == "active" else "paused" if status_str == "paused" else "survey",
            "text": f"\"{s.title}\" is live" if status_str == "active" else f"\"{s.title}\" was paused" if status_str == "paused" else f"\"{s.title}\" created",
            "time": s.created_at,
            "to": f"/surveys/{s.id}/edit",
        })

    # Sort by time desc
    feed.sort(key=lambda x: x["time"], reverse=True)
    return feed[:12]
