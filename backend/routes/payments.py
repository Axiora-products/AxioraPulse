"""
routes/payments.py
──────────────────
Razorpay payment integration endpoints.

GET  /payments/plans               — list all active plans (public)
POST /payments/create-order        — create Razorpay order for a plan
POST /payments/verify              — verify payment signature, activate subscription
POST /payments/webhook             — Razorpay webhook receiver
GET  /payments/subscription        — current tenant subscription
"""

import hashlib
import hmac
import logging
from typing import List

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core import config
from db.database import get_db
from db.models import Payment, Plan, Subscription, Tenant, UserProfile
from dependencies import get_current_user
from schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    PlanOut,
    SubscriptionOut,
    VerifyPaymentRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


def _razorpay_client() -> razorpay.Client:
    if not config.RAZORPAY_KEY_ID or not config.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway is not configured.",
        )
    return razorpay.Client(auth=(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET))


# ── Plans ─────────────────────────────────────────────────────────────────────

@router.get("/plans", response_model=List[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    """Return all active plans. Used by the pricing page (no auth required)."""
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.price_paise).all()
    return [PlanOut.model_validate(p) for p in plans]


# ── Create order ──────────────────────────────────────────────────────────────

@router.post("/create-order", response_model=CreateOrderResponse)
def create_order(
    body: CreateOrderRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a Razorpay order for the requested plan.
    Returns the order_id and key_id needed by the frontend Razorpay checkout widget.
    """
    plan = db.query(Plan).filter(Plan.code == body.plan_code, Plan.is_active == True).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan.price_paise == 0:
        raise HTTPException(status_code=400, detail="Free plan does not require a payment order")

    client = _razorpay_client()
    receipt = f"t_{str(current_user.tenant_id).replace('-', '')[:32]}"
    order_data = {
        "amount": plan.price_paise,
        "currency": plan.currency,
        "receipt": receipt,
        "notes": {
            "tenant_id": str(current_user.tenant_id),
            "plan_code": plan.code,
            "user_id": str(current_user.id),
        },
    }
    rzp_order = client.order.create(data=order_data)

    # Persist the pending payment record
    payment = Payment(
        tenant_id=current_user.tenant_id,
        plan_id=plan.id,
        razorpay_order_id=rzp_order["id"],
        amount_paise=plan.price_paise,
        currency=plan.currency,
        status="created",
    )
    db.add(payment)
    db.commit()

    return CreateOrderResponse(
        order_id=rzp_order["id"],
        amount=plan.price_paise,
        currency=plan.currency,
        key_id=config.RAZORPAY_KEY_ID,
        plan_code=plan.code,
    )


# ── Verify payment ────────────────────────────────────────────────────────────

@router.post("/verify")
def verify_payment(
    body: VerifyPaymentRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify Razorpay payment signature.
    On success: marks the Payment as paid and upserts the tenant Subscription.
    """
    # 1. Verify HMAC signature
    expected = hmac.new(
        config.RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # 2. Find the pending payment row
    payment = (
        db.query(Payment)
        .filter(
            Payment.razorpay_order_id == body.razorpay_order_id,
            Payment.tenant_id == current_user.tenant_id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    plan = db.query(Plan).filter(Plan.code == body.plan_code, Plan.is_active == True).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # 3. Update payment row
    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.status = "paid"

    # 4. Upsert subscription
    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == current_user.tenant_id)
        .first()
    )
    if sub:
        sub.plan_id = plan.id
        sub.status = "active"
        sub.cancel_at_period_end = False
        sub.cancelled_at = None
        payment.subscription_id = sub.id
    else:
        sub = Subscription(
            tenant_id=current_user.tenant_id,
            plan_id=plan.id,
            status="active",
        )
        db.add(sub)
        db.flush()
        payment.subscription_id = sub.id

    # 5. Sync plan code on the tenant row for quick reads
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    if tenant:
        tenant.plan = plan.code

    db.commit()
    return {"success": True, "plan": plan.code}


# ── Webhook ───────────────────────────────────────────────────────────────────

@router.post("/webhook", status_code=200)
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive Razorpay webhook events.
    Validates the X-Razorpay-Signature header before processing.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("payment", {}).get("entity", {})

    if event == "payment.captured":
        order_id = entity.get("order_id")
        payment_id = entity.get("id")
        if order_id:
            payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
            if payment and payment.status != "paid":
                payment.razorpay_payment_id = payment_id
                payment.status = "paid"
                payment.method = entity.get("method")
                payment.provider_payload = entity
                db.commit()
                logger.info("payment.captured processed: order=%s payment=%s", order_id, payment_id)

    elif event == "payment.failed":
        order_id = entity.get("order_id")
        if order_id:
            payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
            if payment and payment.status == "created":
                payment.status = "failed"
                payment.failure_reason = entity.get("error_description") or entity.get("error_reason")
                payment.provider_payload = entity
                db.commit()
                logger.info("payment.failed processed: order=%s", order_id)

    elif event == "subscription.cancelled":
        rzp_sub_id = payload.get("payload", {}).get("subscription", {}).get("entity", {}).get("id")
        if rzp_sub_id:
            sub = db.query(Subscription).filter(
                Subscription.razorpay_subscription_id == rzp_sub_id
            ).first()
            if sub:
                sub.status = "cancelled"
                db.commit()
                logger.info("subscription.cancelled processed: rzp_sub=%s", rzp_sub_id)

    return {"status": "ok"}


# ── Current subscription ───────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionOut)
def get_subscription(
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current tenant's active subscription (or 404 if on free plan)."""
    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == current_user.tenant_id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found for this tenant")
    return SubscriptionOut.model_validate(sub)
