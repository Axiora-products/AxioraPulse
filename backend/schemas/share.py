from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel

class SurveyShareUser(BaseModel):
    id: UUID
    full_name: Optional[str] = None
    email: str

    model_config = {"from_attributes": True}

class SurveyShareCreate(BaseModel):
    shared_with: UUID
    permission: str = "viewer"

class SurveyShareOut(BaseModel):
    id: UUID
    survey_id: UUID
    shared_with: UUID
    permission: str
    created_at: datetime
    user: Optional[SurveyShareUser] = None

    model_config = {"from_attributes": True}
