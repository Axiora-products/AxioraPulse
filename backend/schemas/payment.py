from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PlanOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: Optional[str]
    price_paise: int
    currency: str
    billing_period: str
    max_surveys: Optional[int]
    max_responses: Optional[int]
    max_team_members: Optional[int]
    ai_insights_enabled: bool
    razorpay_plan_id: Optional[str]

    model_config = {"from_attributes": True}


class CreateOrderRequest(BaseModel):
    plan_code: str


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    plan_code: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_code: str


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plan: PlanOut
    status: str
    razorpay_subscription_id: Optional[str]
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    cancelled_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
