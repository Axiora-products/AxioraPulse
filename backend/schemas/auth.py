from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr
from .user import UserProfileOut
from .tenant import TenantOut


class MeResponse(BaseModel):
    user: UserProfileOut
    profile: UserProfileOut
    tenant: Optional[TenantOut] = None


class SyncRequest(BaseModel):
    id_token: str
    tenant_name: Optional[str] = None
    tenant_slug: Optional[str] = None
    account_type: Optional[str] = None  # 'personal' | 'organization'


class SyncResponse(BaseModel):
    user: UserProfileOut
    tenant: Optional[TenantOut] = None


class MigrateCheckRequest(BaseModel):
    email: EmailStr
    password: str
    secret: str


class CleanupRequest(BaseModel):
    email: EmailStr
