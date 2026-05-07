from __future__ import annotations
from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID
from pydantic import BaseModel

class QuestionIn(BaseModel):
    id: Optional[UUID] = None
    question_text: str
    question_type: str
    options: Optional[Any] = None
    is_required: bool = False
    description: Optional[str] = None
    sort_order: int = 0
    validation_rules: Optional[Any] = None

class QuestionOut(BaseModel):
    id: UUID
    survey_id: UUID
    question_text: str
    question_type: str
    options: Optional[Any] = None
    is_required: bool
    description: Optional[str] = None
    sort_order: int
    validation_rules: Optional[Any] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    welcome_message: Optional[str] = None
    thank_you_message: Optional[str] = None
    expires_at: Optional[datetime] = None
    allow_anonymous: bool = True
    require_email: bool = False
    show_progress_bar: bool = True
    theme_color: str = "#FF4500"
    slug: Optional[str] = None
    status: str = "draft"
    questions: Optional[List[QuestionIn]] = []

class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    welcome_message: Optional[str] = None
    thank_you_message: Optional[str] = None
    expires_at: Optional[datetime] = None
    allow_anonymous: Optional[bool] = None
    require_email: Optional[bool] = None
    show_progress_bar: Optional[bool] = None
    theme_color: Optional[str] = None
    slug: Optional[str] = None
    status: Optional[str] = None

class SurveyStatusUpdate(BaseModel):
    status: str

class SurveyCreator(BaseModel):
    full_name: Optional[str] = None
    
    model_config = {"from_attributes": True}

class SurveyOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    welcome_message: Optional[str] = None
    thank_you_message: Optional[str] = None
    expires_at: Optional[datetime] = None
    allow_anonymous: bool
    require_email: bool
    show_progress_bar: bool
    theme_color: str
    slug: str
    status: str
    tenant_id: UUID
    created_by: Optional[UUID] = None
    creator: Optional[SurveyCreator] = None
    created_at: Optional[datetime] = None
    questions: Optional[List[QuestionOut]] = None
    tenant_name: Optional[str] = None

    model_config = {"from_attributes": True}
