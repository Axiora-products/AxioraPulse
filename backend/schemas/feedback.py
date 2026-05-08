from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel

class FeedbackCreate(BaseModel):
    survey_id: UUID
    rating: Optional[int] = None
    comment: Optional[str] = None
    responded_at: Optional[datetime] = None

class FeedbackOut(BaseModel):
    id: UUID
    survey_id: UUID
    rating: Optional[int] = None
    comment: Optional[str] = None
    responded_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
