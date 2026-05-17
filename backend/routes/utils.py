"""
routes/utils.py
───────────────
GET /utils/slug/check?slug={slug}  — Check if a survey slug is available
"""

from fastapi import APIRouter, Query

from db.models import Survey
from dependencies import DBSession

router = APIRouter(prefix="/utils", tags=["utils"])


@router.get("/slug/check")
def check_slug(
    db: DBSession,
    slug: str = Query(..., min_length=1),
):
    """
    Returns whether a given slug is available.
    Used by SurveyCreate.jsx when the user types a custom slug.
    """
    exists = db.query(Survey).filter(Survey.slug == slug).first() is not None
    return {"slug": slug, "available": not exists}
