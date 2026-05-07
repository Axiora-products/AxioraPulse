from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from .user import UserProfileOut
from .tenant import TenantOut

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str
    tenant_name: str
    tenant_slug: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str 
    token_type: str = "bearer"
    user: UserProfileOut
    profile: UserProfileOut
    tenant: Optional[TenantOut] = None

class MeResponse(BaseModel):
    user: UserProfileOut
    profile: UserProfileOut
    tenant: Optional[TenantOut] = None
