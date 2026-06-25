import sys
import os
import logging
import requests
from functools import lru_cache
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

# Add the main backend folder to path to import database and models
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

import config as admin_config
from db.database import get_db
from db.models import UserProfile, RoleEnum

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _get_jwks(pool_id: str, region: str) -> list:
    """Fetches the JWKS (JSON Web Key Set) for Cognito token verification."""
    # Check if local endpoint is set in main backend configuration (e.g. for LocalStack/Floci)
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    if endpoint_url:
        url = f"{endpoint_url.rstrip('/')}/{pool_id}/.well-known/jwks.json"
    else:
        url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"

    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        return resp.json()["keys"]
    except Exception as exc:
        logger.error("Failed to fetch Cognito JWKS from %s: %s", url, str(exc))
        return []


def verify_cognito_token(token: str) -> dict | None:
    """Verifies the Cognito ID token and returns its decoded payload."""
    if not token:
        return None

    client_id = admin_config.COGNITO_APP_CLIENT_ID
    pool_id = admin_config.COGNITO_USER_POOL_ID
    region = admin_config.COGNITO_REGION

    # ── Mock Mode ──
    if admin_config.MOCK_COGNITO:
        try:
            payload = jwt.decode(token, admin_config.MOCK_COGNITO_SECRET, algorithms=["HS256"], audience=client_id)
            return payload if payload.get("token_use") == "id" else None
        except Exception as exc:
            logger.warning("Mock admin token verification failed: %s", type(exc).__name__)
            return None

    # ── Real Cognito RS256 Verification ──
    try:
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")
        if not kid:
            return None

        keys = _get_jwks(pool_id, region)
        key = next((k for k in keys if k["kid"] == kid), None)
        if key is None:
            raise JWTError("No matching public key found in JWKS")

        payload = jwt.decode(token, key, algorithms=["RS256"], audience=client_id)
        if payload.get("token_use") != "id":
            raise JWTError("Token use is not ID")
        return payload
    except Exception as exc:
        logger.info("Admin Cognito token verification failed: %s", type(exc).__name__)
        return None


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme), db: Session = Depends(get_db)
) -> UserProfile:
    """
    Dependency that extracts the Bearer token, verifies it against the separate admin
    Cognito User Pool, asserts the email ends with @axioraglobalsolutions.com, and resolves
    the UserProfile.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    payload = verify_cognito_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    email = payload.get("email")
    if not email:
        raise credentials_exception

    # Enforce strict domain whitelisting (AP-SEC-002)
    email_clean = email.strip().lower()
    if not email_clean.endswith("@axioraglobalsolutions.com"):
        logger.warning("Access denied: Non-whitelisted email domain %s tried to access admin", email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Only axioraglobalsolutions.com emails are authorized.",
        )

    # Resolve admin user in our shared database
    cognito_sub = payload.get("sub")
    user = (
        db.query(UserProfile)
        .filter((UserProfile.cognito_sub == cognito_sub) | (UserProfile.email == email_clean))
        .first()
    )

    if user is None:
        # Auto-provision whitelisted admins
        logger.info("Auto-provisioning super_admin profile for %s", email_clean)
        user = UserProfile(
            email=email_clean,
            cognito_sub=cognito_sub,
            role=RoleEnum.super_admin,
            is_internal=True,
            full_name=payload.get("name", email_clean.split("@")[0].title()),
            is_active=True,
            account_status="active",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Enforce that existing whitelisted domain users are promoted to super_admin
        needs_update = False
        if user.role != RoleEnum.super_admin:
            user.role = RoleEnum.super_admin
            needs_update = True
        if not user.is_internal:
            user.is_internal = True
            needs_update = True
        if not user.is_active:
            user.is_active = True
            needs_update = True
        if not user.cognito_sub and cognito_sub:
            user.cognito_sub = cognito_sub
            needs_update = True

        if needs_update:
            db.commit()
            db.refresh(user)

    # Bypass Postgres RLS constraints since admins query across all tenants (AP-SEC-002)
    from db.rls import set_bypass_rls, apply_tenant_guc

    set_bypass_rls(True)
    apply_tenant_guc(db)

    return user
