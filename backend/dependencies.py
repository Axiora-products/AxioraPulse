"""
dependencies.py
───────────────
Reusable FastAPI dependencies:
  - get_db           → yields SQLAlchemy session
  - get_current_user → verifies Cognito ID token, loads UserProfile from DB
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core import config
from db.database import get_db
from db.models import UserProfile
from cognito_utils import verify_cognito_token

bearer_scheme = HTTPBearer(auto_error=False)


def _is_super_admin_email(email: str | None) -> bool:
    """Super-admin grants are config/data-driven, not hardcoded. (AP-SEC-002)"""
    return bool(email) and email.strip().lower() in config.SUPER_ADMIN_EMAILS


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserProfile:
    """
    Extracts Bearer token → verifies Cognito ID token → loads UserProfile by cognito_sub.
    Raises 401 if token is missing, invalid, or the user has not synced yet.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    payload = verify_cognito_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    cognito_sub: str = payload.get("sub")
    if not cognito_sub:
        raise credentials_exception

    user = db.query(UserProfile).filter(UserProfile.cognito_sub == cognito_sub).first()
    if user is None:
        # Self-healing on-the-fly user synchronization
        email = payload.get("email", "")
        name = payload.get("name", "")

        if email:
            # 1. Existing user migrated or invited - link by email
            existing = db.query(UserProfile).filter(UserProfile.email == email).first()
            if existing:
                existing.cognito_sub = cognito_sub
                db.commit()
                db.refresh(existing)
                user = existing

            # Also try phone_number lookup for OTP-authenticated users
            phone_number = payload.get("phone_number", "")
            if not existing and phone_number:
                existing = (
                    db.query(UserProfile)
                    .filter(UserProfile.phone_number == phone_number, UserProfile.phone_verified == True)
                    .first()
                )
                if existing:
                    existing.cognito_sub = cognito_sub
                    db.commit()
                    db.refresh(existing)
                    user = existing

        if user is None:
            # 2. Brand new user - create tenant + profile
            import uuid
            import re
            from db.models import Tenant, RoleEnum

            def _slugify(text: str) -> str:
                text = text.lower().strip()
                text = re.sub(r"[^\w\s-]", "", text)
                text = re.sub(r"[\s_-]+", "-", text)
                return text.strip("-") or "org"

            derived_tenant_name = email.split("@")[1].split(".")[0].title() if email else "My Organisation"
            derived_tenant_slug = _slugify(derived_tenant_name)

            # Ensure the tenant slug is unique for brand new users to prevent placing different users in the same tenant
            base_slug = derived_tenant_slug
            counter = 1
            while db.query(Tenant).filter(Tenant.slug == derived_tenant_slug).first() is not None:
                derived_tenant_slug = f"{base_slug}-{counter}"
                counter += 1

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
                tenant = db.query(Tenant).filter(Tenant.slug == derived_tenant_slug).first()
                if not tenant:
                    # Create a default tenant with a unique slug rather than reusing someone else's tenant
                    fallback_base = "default-org"
                    fallback_slug = fallback_base
                    fallback_counter = 1
                    while db.query(Tenant).filter(Tenant.slug == fallback_slug).first() is not None:
                        fallback_slug = f"{fallback_base}-{fallback_counter}"
                        fallback_counter += 1

                    tenant = Tenant(
                        id=uuid.uuid4(),
                        name="Default Organisation",
                        slug=fallback_slug,
                    )
                    db.add(tenant)
                    db.flush()

            user = UserProfile(
                id=uuid.uuid4(),
                email=email,
                full_name=name,
                cognito_sub=cognito_sub,
                role=RoleEnum.super_admin if _is_super_admin_email(email) else RoleEnum.admin,
                tenant_id=tenant.id,
                is_active=True,
                is_internal=_is_super_admin_email(email),
                account_status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if user is None or not user.is_active:
        raise credentials_exception

    # Self-healing: reconcile super_admin status against the configured allowlist.
    # Emails in SUPER_ADMIN_EMAILS are promoted; any other super_admin that is not
    # marked internal is downgraded to admin. (AP-SEC-002)
    from db.models import RoleEnum

    if _is_super_admin_email(user.email):
        if user.role != RoleEnum.super_admin or not user.is_internal:
            user.role = RoleEnum.super_admin
            user.is_internal = True
            db.commit()
            db.refresh(user)
    elif user.role == RoleEnum.super_admin and not user.is_internal:
        user.role = RoleEnum.admin
        db.commit()
        db.refresh(user)

    # Defense-in-depth: bind this request's DB session to the user's tenant so
    # Postgres RLS constrains every query to that tenant. (no-op unless ENABLE_DB_RLS)
    from db.rls import set_tenant_context, apply_tenant_guc

    set_tenant_context(user.tenant_id)
    apply_tenant_guc(db)

    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    """
    Like get_current_user but returns None instead of raising 401.
    Used for public endpoints that behave differently when authenticated.
    """
    if not credentials:
        return None
    payload = verify_cognito_token(credentials.credentials)
    if payload is None:
        return None
    cognito_sub = payload.get("sub")
    if not cognito_sub:
        return None
    return db.query(UserProfile).filter(UserProfile.cognito_sub == cognito_sub).first()


def get_current_super_admin(
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfile:
    """
    Requires the current user to be a Super Admin.
    """
    from db.models import RoleEnum

    if current_user.role != RoleEnum.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges required.",
        )

    # Super admins operate across all tenants — bypass RLS for this request.
    # (no-op unless ENABLE_DB_RLS)
    from db.rls import set_bypass_rls, apply_tenant_guc

    set_bypass_rls(True)
    apply_tenant_guc(db)

    return current_user
