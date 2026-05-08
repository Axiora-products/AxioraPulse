from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: Optional[str] = "free"
    primary_color: Optional[str] = "#FF4500"
    approved_domains: Optional[List[str]] = []
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    primary_color: Optional[str] = None
    approved_domains: Optional[List[str]] = None
