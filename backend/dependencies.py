"""
dependencies.py
───────────────
Reusable FastAPI dependencies:
  - get_db           → yields SQLAlchemy session
  - get_current_user → verifies Cognito ID token, loads UserProfile from DB
"""

from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from cognito_utils import verify_cognito_token
from db.database import get_db
from db.models import UserProfile

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    """
    Extracts Bearer token → verifies Cognito ID token → loads UserProfile by cognito_sub.
    Raises 401 if token is missing, invalid, the user has not synced yet, or they have
    logged out since the token was issued.
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
    if user is None or not user.is_active:
        raise credentials_exception

    # Reject tokens issued before the user's last logout
    if user.last_logout_at:
        token_iat = payload.get("iat")
        if token_iat and datetime.fromtimestamp(token_iat, tz=timezone.utc) < user.last_logout_at:
            raise credentials_exception

    return user


def get_optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
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


# Centralized Dependency Types
DBSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[UserProfile, Depends(get_current_user)]
OptionalUser = Annotated[Optional[UserProfile], Depends(get_optional_user)]
