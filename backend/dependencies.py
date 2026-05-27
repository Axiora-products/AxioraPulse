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

from db.database import get_db
from db.models import UserProfile
from cognito_utils import verify_cognito_token

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
