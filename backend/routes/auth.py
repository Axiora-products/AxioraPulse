import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.rate_limiter import limiter
from db.database import get_db
from db.models import Tenant, UserProfile, RoleEnum
from schemas import (
    MeResponse,
    UserProfileOut,
    TenantOut,
    UserProfileUpdate,
    SyncRequest,
    SyncResponse,
    MigrateCheckRequest,
    CleanupRequest,
)
from cognito_utils import verify_cognito_token, admin_get_user_status, admin_delete_user
from auth_utils import verify_password
from dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

MIGRATION_LAMBDA_SECRET = os.getenv("MIGRATION_LAMBDA_SECRET", "")


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-") or "org"


# ── /auth/me ─────────────────────────────────────────────────────────────────


@router.get("/me", response_model=MeResponse)
@limiter.limit("30/minute")
def me(
    request: Request,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
    profile = UserProfileOut.model_validate(current_user)
    return {
        "user": profile,
        "profile": profile,
        "tenant": TenantOut.model_validate(tenant) if tenant else None,
    }


# ── /auth/me/profile ──────────────────────────────────────────────────────────


@router.patch("/me/profile")
@limiter.limit("20/minute")
def update_profile(
    request: Request,
    body: UserProfileUpdate,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.full_name = body.full_name
    db.commit()
    db.refresh(current_user)
    return UserProfileOut.model_validate(current_user)


# ── /auth/sync ────────────────────────────────────────────────────────────────


@router.post("/sync", response_model=SyncResponse)
@limiter.limit("10/minute")
def sync(
    request: Request,
    body: SyncRequest,
    db: Session = Depends(get_db),
):
    """
    Called by the frontend after every Cognito sign-in/sign-up.
    - New user: creates Tenant + UserProfile, returns profile.
    - Existing Supabase-migrated user (matched by email): links cognito_sub, returns profile.
    - Already synced user: no-op, returns existing profile.
    """
    payload = verify_cognito_token(body.id_token)
    if not payload:
        raise HTTPException(401, "Invalid Cognito token")

    cognito_sub: str = payload["sub"]
    email: str = payload.get("email", "")
    name: str = payload.get("name", "")

    # Already synced — just return the profile
    user = db.query(UserProfile).filter(UserProfile.cognito_sub == cognito_sub).first()
    if user:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        return SyncResponse(
            user=UserProfileOut.model_validate(user),
            tenant=TenantOut.model_validate(tenant) if tenant else None,
        )

    # Existing user migrated from Supabase — link cognito_sub by email
    if email:
        existing = db.query(UserProfile).filter(UserProfile.email == email).first()
        if existing:
            existing.cognito_sub = cognito_sub
            db.commit()
            db.refresh(existing)
            tenant = db.query(Tenant).filter(Tenant.id == existing.tenant_id).first()
            return SyncResponse(
                user=UserProfileOut.model_validate(existing),
                tenant=TenantOut.model_validate(tenant) if tenant else None,
            )

    # Brand new user — create tenant + profile
    # Auto-derive tenant name from email domain if not provided (handles local dev with fresh DB)
    derived_tenant_name = body.tenant_name or email.split("@")[1].split(".")[0].title() if email else "My Organisation"
    derived_tenant_slug = body.tenant_slug or _slugify(derived_tenant_name)

    # Check if a tenant with this slug already exists — reuse it instead of crashing
    tenant = db.query(Tenant).filter(Tenant.slug == derived_tenant_slug).first()
    if not tenant:
        try:
            tenant = Tenant(
                id=uuid.uuid4(),
                name=derived_tenant_name,
                slug=derived_tenant_slug,
            )
            db.add(tenant)
            db.flush()
        except Exception:
            db.rollback()
            # Race condition: another request created this tenant simultaneously
            tenant = db.query(Tenant).filter(Tenant.slug == derived_tenant_slug).first()
            if not tenant:
                raise HTTPException(500, "Failed to create or find tenant")

    user = UserProfile(
        id=uuid.uuid4(),
        email=email,
        full_name=name,
        cognito_sub=cognito_sub,
        role=RoleEnum.super_admin,
        tenant_id=tenant.id,
        is_active=True,
        account_status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return SyncResponse(
        user=UserProfileOut.model_validate(user),
        tenant=TenantOut.model_validate(tenant),
    )


# ── /auth/migrate-check ───────────────────────────────────────────────────────


@router.post("/migrate-check")
def migrate_check(
    body: MigrateCheckRequest,
    db: Session = Depends(get_db),
):
    """
    Internal endpoint for the Cognito User Migration Lambda only.
    Validates a user's existing password_hash so Lambda can migrate them to Cognito.
    Protected by a shared secret — never expose publicly.
    """
    if not MIGRATION_LAMBDA_SECRET or body.secret != MIGRATION_LAMBDA_SECRET:
        raise HTTPException(403, "Forbidden")

    user = db.query(UserProfile).filter(UserProfile.email == body.email).first()
    if not user or not user.password_hash:
        raise HTTPException(404, "User not found")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    return {
        "email": user.email,
        "name": user.full_name or "",
    }


@router.post("/cleanup-unconfirmed")
def cleanup_unconfirmed(body: CleanupRequest):
    """
    Deletes a user from Cognito ONLY if they are UNCONFIRMED.
    Used during signup retries to allow fresh start.
    """
    status = admin_get_user_status(body.email)
    if status == "UNCONFIRMED":
        success = admin_delete_user(body.email)
        return {"deleted": success, "email": body.email}

    return {"deleted": False, "status": status}


@router.post("/mock-login")
def mock_login(body: dict, db: Session = Depends(get_db)):
    """
    Generate a self-signed JWT token for a local developer.
    Only available when MOCK_COGNITO=true.
    """
    if not os.getenv("MOCK_COGNITO", "false").lower() == "true":
        raise HTTPException(400, "Mock Cognito is not enabled in this environment")

    email = body.get("email")
    if not email:
        raise HTTPException(400, "Email is required")

    name = body.get("name")
    if not name:
        # Split by @, then take the first part, split by dot, and take first part (e.g. roopsai.work -> Roopsai)
        name = email.split("@")[0].split(".")[0].title()

    # Check if user already exists to reuse sub
    user = db.query(UserProfile).filter(UserProfile.email == email).first()
    sub = user.cognito_sub if (user and user.cognito_sub) else f"mock-sub-{uuid.uuid4()}"

    from jose import jwt

    payload = {
        "sub": sub,
        "email": email,
        "name": name,
        "token_use": "id",
        "aud": os.getenv("COGNITO_APP_CLIENT_ID") or "mock-client-id",
        "iss": f"https://cognito-idp.{os.getenv('COGNITO_REGION', 'ap-south-1')}.amazonaws.com/{os.getenv('COGNITO_USER_POOL_ID') or 'mock-user-pool-id'}",
    }

    secret = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")
    token = jwt.encode(payload, secret, algorithm="HS256")

    return {"id_token": token}
