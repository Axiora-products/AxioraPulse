"""
dependencies.py
───────────────
Reusable FastAPI dependencies:
  - get_db           → yields SQLAlchemy session
  - get_current_user → verifies Cognito ID token, loads UserProfile from DB
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from cognito_utils import verify_cognito_token
from db.database import get_db
from db.models import UserProfile

bearer_scheme = HTTPBearer(auto_error=False)


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

        if user is None:
            # 2. Brand new user - create tenant + profile
            import re
            import uuid

            from db.models import RoleEnum, Tenant

            def _slugify(text: str) -> str:
                text = text.lower().strip()
                text = re.sub(r"[^\w\s-]", "", text)
                text = re.sub(r"[\s_-]+", "-", text)
                return text.strip("-") or "org"

            derived_tenant_name = email.split("@")[1].split(".")[0].title() if email else "My Organisation"
            derived_tenant_slug = _slugify(derived_tenant_name)

            # Check if a tenant with this slug already exists — reuse it or find a fallback
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
                    tenant = db.query(Tenant).filter(Tenant.slug == derived_tenant_slug).first()
                    if not tenant:
                        # Fallback: reuse first available tenant or create a default
                        tenant = db.query(Tenant).first()
                        if not tenant:
                            tenant = Tenant(
                                id=uuid.uuid4(),
                                name="Default Organisation",
                                slug="default-org",
                            )
                            db.add(tenant)
                            db.flush()

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

    if user is None or not user.is_active:
        raise credentials_exception

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
