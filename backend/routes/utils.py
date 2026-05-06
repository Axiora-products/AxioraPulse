"""
routes/utils.py
───────────────
GET /utils/slug/check?slug={slug}  — Check if a survey slug is available
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Survey, UserProfile
from schemas import MessageResponse
from dependencies import get_current_user


router = APIRouter(prefix="/utils", tags=["utils"])


@router.get("/slug/check")
def check_slug(
    slug: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """
    Returns whether a given slug is available.
    Used by SurveyCreate.jsx when the user types a custom slug.
    """
    exists = db.query(Survey).filter(Survey.slug == slug).first() is not None
    return {"slug": slug, "available": not exists}
