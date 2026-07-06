from __future__ import annotations
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class InviteRequest(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: str = "viewer"
    tenant_id: Optional[UUID] = None


class AcceptInviteRequest(BaseModel):
    full_name: str
    # Align with the Cognito password policy (min 12 chars). (AP-SEC-040)
    password: str = Field(..., min_length=12)
