import sys
import os
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr

# Add the main backend folder to path to import database and models
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

import config as admin_config
from db.database import get_db, engine
from db.models import (
    UserProfile, Tenant, RoleEnum, AuditLog, 
    Subscription, Payment, DemoSchedule, WaitlistEntry, 
    Survey, SurveyResponse, Plan
)
from auth import get_current_admin
from audit import log_admin_action

app = FastAPI(
    title="Axiora Pulse Super Admin API",
    description="Super Admin Console backend for Axiora Pulse",
    version="1.0.0",
)

# ── CORS Middleware ──
# Allow the admin frontend url to connect
allowed_origins = [admin_config.ADMIN_FRONTEND_URL]
if not admin_config.IS_PRODUCTION:
    allowed_origins.append("http://localhost:5175")
    allowed_origins.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Schemas ──
class MockLoginRequest(BaseModel):
    email: str
    name: Optional[str] = None

class UserUpdateSchema(BaseModel):
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None
    is_internal: Optional[bool] = None

class TenantUpdateSchema(BaseModel):
    is_active: Optional[bool] = None
    plan: Optional[str] = None

# ── Mock Cognito Auth Endpoint (Local Dev only) ──
@app.post("/admin/auth/mock-login")
def mock_login(body: MockLoginRequest):
    """
    Local-only helper to generate a mock Cognito ID token for testing the admin panel.
    Only active when MOCK_COGNITO=true.
    """
    if not admin_config.MOCK_COGNITO:
        raise HTTPException(
            status_code=400, 
            detail="Mock Cognito authentication is disabled in this environment"
        )
    
    email = body.email.strip().lower()
    if not email.endswith("@axioraglobalsolutions.com"):
        raise HTTPException(
            status_code=403,
            detail="Mock Login failed: Only @axioraglobalsolutions.com email domain allowed."
        )

    name = body.name or email.split("@")[0].title()
    
    # Sign a mock JWT using python-jose
    from jose import jwt
    payload = {
        "sub": f"mock-admin-sub-{uuid.uuid4()}",
        "email": email,
        "name": name,
        "token_use": "id",
        "aud": admin_config.COGNITO_APP_CLIENT_ID,
        "iss": f"https://cognito-idp.{admin_config.COGNITO_REGION}.amazonaws.com/{admin_config.COGNITO_USER_POOL_ID}",
    }
    
    token = jwt.encode(payload, admin_config.MOCK_COGNITO_SECRET, algorithm="HS256")
    return {"id_token": token}

# ── Dashboard/Analytics ──
@app.get("/admin/analytics")
def get_analytics(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Returns aggregated system statistics and trend details for the dashboard."""
    total_users = db.query(UserProfile).count()
    total_tenants = db.query(Tenant).count()
    total_surveys = db.query(Survey).count()
    total_responses = db.query(SurveyResponse).count()
    
    # Calculate total revenue from successful payments
    revenue_sum = db.query(func.sum(Payment.amount_paise)).filter(Payment.status == "paid").scalar() or 0
    total_revenue = revenue_sum / 100.0  # Convert paise to INR/base currency
    
    total_subscriptions = db.query(Subscription).filter(Subscription.status == "active").count()
    total_demos = db.query(DemoSchedule).count()
    total_waitlist = db.query(WaitlistEntry).count()

    # Aggregate plan types
    plans_raw = db.query(Tenant.plan, func.count(Tenant.id)).group_by(Tenant.plan).all()
    plans_distribution = {plan: count for plan, count in plans_raw}

    # Fetch 5 recent payments
    recent_payments = []
    payments_raw = db.query(Payment).order_by(desc(Payment.created_at)).limit(5).all()
    for p in payments_raw:
        tenant_name = db.query(Tenant.name).filter(Tenant.id == p.tenant_id).scalar() or "Unknown Organization"
        recent_payments.append({
            "id": str(p.id),
            "tenant_name": tenant_name,
            "amount": p.amount_paise / 100.0,
            "status": p.status,
            "created_at": p.created_at
        })

    # Fetch 5 recent audit logs
    recent_logs = []
    logs_raw = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(5).all()
    for l in logs_raw:
        recent_logs.append({
            "id": str(l.id),
            "actor_email": l.actor_email,
            "action": l.action,
            "target_type": l.target_type,
            "created_at": l.created_at
        })

    return {
        "kpis": {
            "total_users": total_users,
            "total_tenants": total_tenants,
            "total_surveys": total_surveys,
            "total_responses": total_responses,
            "total_revenue": total_revenue,
            "total_subscriptions": total_subscriptions,
            "total_demos": total_demos,
            "total_waitlist": total_waitlist
        },
        "plans_distribution": plans_distribution,
        "recent_payments": recent_payments,
        "recent_logs": recent_logs
    }

# ── Users ──
@app.get("/admin/users")
def list_users(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists all user profiles in the database with their associated workspace/tenant."""
    users = db.query(UserProfile).order_by(desc(UserProfile.created_at)).all()
    results = []
    for u in users:
        tenant_name = "None"
        tenant_slug = "None"
        if u.tenant_id:
            t = db.query(Tenant).filter(Tenant.id == u.tenant_id).first()
            if t:
                tenant_name = t.name
                tenant_slug = t.slug
        
        results.append({
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "is_internal": u.is_internal,
            "tenant_id": str(u.tenant_id) if u.tenant_id else None,
            "tenant_name": tenant_name,
            "tenant_slug": tenant_slug,
            "created_at": u.created_at
        })
    return results

@app.patch("/admin/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdateSchema,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Updates a user's role, activation status, or internal flag. Logs action to AuditLog."""
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid User ID format")

    user = db.query(UserProfile).filter(UserProfile.id == user_uuid).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Prevent a super_admin from self-deactivating or de-promoting themselves
    if user.id == current_admin.id:
        if body.is_active is False or (body.role and body.role != RoleEnum.super_admin):
            raise HTTPException(400, "Super admins cannot deactivate or demote themselves")

    changes = {}
    if body.role is not None:
        old_role = user.role
        user.role = body.role
        changes["role"] = {"old": old_role, "new": body.role}
        
    if body.is_active is not None:
        old_status = user.is_active
        user.is_active = body.is_active
        changes["is_active"] = {"old": old_status, "new": body.is_active}

    if body.is_internal is not None:
        old_internal = user.is_internal
        user.is_internal = body.is_internal
        changes["is_internal"] = {"old": old_internal, "new": body.is_internal}

    if changes:
        db.commit()
        db.refresh(user)
        log_admin_action(
            db=db,
            actor_user_id=current_admin.id,
            actor_email=current_admin.email,
            action="user.updated",
            target_type="UserProfile",
            target_id=str(user.id),
            detail=changes,
            ip_address=request.client.host if request.client else None
        )

    return {"ok": True, "user_id": str(user.id)}

@app.delete("/admin/users/{user_id}")
def delete_user(
    user_id: str,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Deletes a user from the database. Logs action to AuditLog."""
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid User ID format")

    if user_uuid == current_admin.id:
        raise HTTPException(400, "Super admins cannot delete themselves")

    user = db.query(UserProfile).filter(UserProfile.id == user_uuid).first()
    if not user:
        raise HTTPException(404, "User not found")

    email = user.email
    db.delete(user)
    db.commit()

    log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        actor_email=current_admin.email,
        action="user.deleted",
        target_type="UserProfile",
        target_id=user_id,
        detail={"email": email},
        ip_address=request.client.host if request.client else None
    )

    return {"ok": True}

# ── Tenants ──
@app.get("/admin/tenants")
def list_tenants(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists all workspaces/tenants."""
    tenants = db.query(Tenant).order_by(desc(Tenant.created_at)).all()
    results = []
    for t in tenants:
        user_count = db.query(UserProfile).filter(UserProfile.tenant_id == t.id).count()
        survey_count = db.query(Survey).filter(Survey.tenant_id == t.id).count()
        
        results.append({
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "plan": t.plan,
            "account_type": t.account_type,
            "is_active": t.is_active,
            "approved_domains": t.approved_domains,
            "created_at": t.created_at,
            "user_count": user_count,
            "survey_count": survey_count
        })
    return results

@app.patch("/admin/tenants/{tenant_id}")
def update_tenant(
    tenant_id: str,
    body: TenantUpdateSchema,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Updates a tenant's billing plan or active status. Logs action to AuditLog."""
    try:
        tenant_uuid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(400, "Invalid Tenant ID format")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    changes = {}
    if body.is_active is not None:
        old_status = tenant.is_active
        tenant.is_active = body.is_active
        changes["is_active"] = {"old": old_status, "new": body.is_active}

    if body.plan is not None:
        old_plan = tenant.plan
        tenant.plan = body.plan
        changes["plan"] = {"old": old_plan, "new": body.plan}

    if changes:
        db.commit()
        db.refresh(tenant)
        log_admin_action(
            db=db,
            actor_user_id=current_admin.id,
            actor_email=current_admin.email,
            action="tenant.updated",
            target_type="Tenant",
            target_id=str(tenant.id),
            detail=changes,
            ip_address=request.client.host if request.client else None
        )

    return {"ok": True, "tenant_id": str(tenant.id)}

@app.delete("/admin/tenants/{tenant_id}")
def delete_tenant(
    tenant_id: str,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Deletes a tenant (cascade deletes associated data). Logs action to AuditLog."""
    try:
        tenant_uuid = uuid.UUID(tenant_id)
    except ValueError:
        raise HTTPException(400, "Invalid Tenant ID format")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    name = tenant.name
    slug = tenant.slug
    db.delete(tenant)
    db.commit()

    log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        actor_email=current_admin.email,
        action="tenant.deleted",
        target_type="Tenant",
        target_id=tenant_id,
        detail={"name": name, "slug": slug},
        ip_address=request.client.host if request.client else None
    )

    return {"ok": True}

# ── Surveys ──
@app.get("/admin/surveys")
def list_surveys(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists all surveys across all tenants."""
    surveys = db.query(Survey).order_by(desc(Survey.created_at)).all()
    results = []
    for s in surveys:
        tenant = db.query(Tenant).filter(Tenant.id == s.tenant_id).first()
        tenant_name = tenant.name if tenant else "Unknown"
        
        response_count = db.query(SurveyResponse).filter(SurveyResponse.survey_id == s.id).count()
        
        results.append({
            "id": str(s.id),
            "title": s.title,
            "status": s.status,
            "tenant_id": str(s.tenant_id),
            "tenant_name": tenant_name,
            "created_at": s.created_at,
            "response_count": response_count
        })
    return results

@app.delete("/admin/surveys/{survey_id}")
def delete_survey(
    survey_id: str,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Deletes a survey globally. Logs action to AuditLog."""
    try:
        survey_uuid = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(400, "Invalid Survey ID format")

    survey = db.query(Survey).filter(Survey.id == survey_uuid).first()
    if not survey:
        raise HTTPException(404, "Survey not found")

    title = survey.title
    db.delete(survey)
    db.commit()

    log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        actor_email=current_admin.email,
        action="survey.deleted",
        target_type="Survey",
        target_id=survey_id,
        detail={"title": title},
        ip_address=request.client.host if request.client else None
    )

    return {"ok": True}

# ── Subscriptions & Payments ──
@app.get("/admin/subscriptions")
def list_subscriptions(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists subscriptions across all tenants."""
    subscriptions = db.query(Subscription).order_by(desc(Subscription.created_at)).all()
    results = []
    for s in subscriptions:
        tenant = db.query(Tenant).filter(Tenant.id == s.tenant_id).first()
        tenant_name = tenant.name if tenant else "Unknown"
        
        plan = db.query(Plan).filter(Plan.id == s.plan_id).first()
        plan_name = plan.name if plan else "Unknown Plan"

        results.append({
            "id": str(s.id),
            "tenant_id": str(s.tenant_id),
            "tenant_name": tenant_name,
            "plan_name": plan_name,
            "status": s.status,
            "razorpay_subscription_id": s.razorpay_subscription_id,
            "current_period_start": s.current_period_start,
            "current_period_end": s.current_period_end,
            "cancel_at_period_end": s.cancel_at_period_end,
            "created_at": s.created_at
        })
    return results

@app.get("/admin/payments")
def list_payments(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists payment transactions across all tenants."""
    payments = db.query(Payment).order_by(desc(Payment.created_at)).all()
    results = []
    for p in payments:
        tenant = db.query(Tenant).filter(Tenant.id == p.tenant_id).first()
        tenant_name = tenant.name if tenant else "Unknown"
        
        plan_name = "None"
        if p.plan_id:
            plan = db.query(Plan).filter(Plan.id == p.plan_id).first()
            plan_name = plan.name if plan else "Unknown Plan"

        results.append({
            "id": str(p.id),
            "tenant_id": str(p.tenant_id),
            "tenant_name": tenant_name,
            "plan_name": plan_name,
            "amount": p.amount_paise / 100.0,
            "currency": p.currency,
            "status": p.status,
            "method": p.method,
            "paid_at": p.paid_at,
            "razorpay_payment_id": p.razorpay_payment_id,
            "created_at": p.created_at
        })
    return results

# ── Demo Bookings & Waitlist ──
@app.get("/admin/demos")
def list_demos(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists scheduled demo sessions booked by potential customers."""
    demos = db.query(DemoSchedule).order_by(desc(DemoSchedule.created_at)).all()
    results = []
    for d in demos:
        results.append({
            "id": str(d.id),
            "name": d.name,
            "email": d.email,
            "demo_date": d.demo_date,
            "time_slot": d.time_slot,
            "meeting_link": d.meeting_link,
            "status": d.status,
            "created_at": d.created_at
        })
    return results

@app.delete("/admin/demos/{demo_id}")
def delete_demo(
    demo_id: str,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Cancels/deletes a scheduled demo. Logs action to AuditLog."""
    demo = db.query(DemoSchedule).filter(DemoSchedule.id == demo_id).first()
    if not demo:
        raise HTTPException(404, "Demo booking not found")

    email = demo.email
    db.delete(demo)
    db.commit()

    log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        actor_email=current_admin.email,
        action="demo.deleted",
        target_type="DemoSchedule",
        target_id=demo_id,
        detail={"email": email},
        ip_address=request.client.host if request.client else None
    )

    return {"ok": True}

@app.get("/admin/waitlist")
def list_waitlist(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Lists all waitlist signups."""
    waitlist = db.query(WaitlistEntry).all()
    results = []
    for w in waitlist:
        results.append({
            "id": str(w.id),
            "email": w.email
        })
    return results

@app.delete("/admin/waitlist/{entry_id}")
def delete_waitlist(
    entry_id: str,
    request: Request,
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Deletes a waitlist entry. Logs action to AuditLog."""
    entry = db.query(WaitlistEntry).filter(WaitlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Waitlist entry not found")

    email = entry.email
    db.delete(entry)
    db.commit()

    log_admin_action(
        db=db,
        actor_user_id=current_admin.id,
        actor_email=current_admin.email,
        action="waitlist.deleted",
        target_type="WaitlistEntry",
        target_id=entry_id,
        detail={"email": email},
        ip_address=request.client.host if request.client else None
    )

    return {"ok": True}

# ── Audit Logs ──
@app.get("/admin/audit-logs")
def list_audit_logs(
    current_admin: UserProfile = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Returns the stream of system audit logs, sorted chronologically."""
    logs = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(200).all()
    results = []
    for l in logs:
        results.append({
            "id": str(l.id),
            "actor_user_id": str(l.actor_user_id) if l.actor_user_id else None,
            "actor_email": l.actor_email,
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "ip_address": l.ip_address,
            "detail": l.detail,
            "created_at": l.created_at
        })
    return results

# ── Entrypoint ──
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=admin_config.PORT)
