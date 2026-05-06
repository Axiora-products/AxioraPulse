from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field

class ResponseCreate(BaseModel):
    survey_id: UUID
    session_token: Optional[str] = None
    respondent_email: Optional[str] = None
    status: str = "in_progress"

class ResponseUpdate(BaseModel):
    respondent_email: Optional[str] = None
    status: Optional[str] = None
    last_saved_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

class AnswerIn(BaseModel):
    question_id: UUID
    answer_value: Optional[str] = None
    answer_json: Optional[Any] = None

class AnswerOut(BaseModel):
    id: UUID
    response_id: UUID
    question_id: UUID
    answer_value: Optional[str] = None
    answer_json: Optional[Any] = None

    model_config = {"from_attributes": True}

class ResponseOut(BaseModel):
    id: UUID
    survey_id: UUID
    session_token: Optional[str] = None
    respondent_email: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_saved_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = Field(None, alias="metadata", validation_alias="response_metadata")
    survey_answers: Optional[List[AnswerOut]] = None

    model_config = {"from_attributes": True}

class SubmitResponse(BaseModel):
    action: str = "submit"
    response_id: UUID
    metadata: Optional[Dict[str, Any]] = None
