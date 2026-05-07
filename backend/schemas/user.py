from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from typing import List
from pydantic import EmailStr

class UserProfileOut(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str] = None
    role: str
    tenant_id: Optional[UUID] = None
    is_active: bool
    account_status: str
    invite_token: Optional[str] = None
    invite_accepted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None

class PasswordUpdate(BaseModel):
    new_password: str = Field(..., min_length=6)

class UserRoleUpdate(BaseModel):
    role: str

class UserStatusUpdate(BaseModel):
    is_active: bool


class BulkInviteRequest(BaseModel):
    emails: List[EmailStr]
    role: str = "viewer"