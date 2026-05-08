from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from .survey import SurveyCreator

class DashboardStats(BaseModel):
    total_surveys: int
    active_surveys: int
    total_responses: int
    completion_rate: float
    team_members: int

class RecentSurvey(BaseModel):
    id: UUID
    title: str
    status: str
    slug: str
    theme_color: str
    creator: Optional[SurveyCreator] = None
    created_at: Optional[datetime] = None
    response_count: int = 0

    model_config = {"from_attributes": True}
