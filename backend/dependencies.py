"""
dependencies.py
───────────────
Reusable FastAPI dependencies:
  - get_db       → yields SQLAlchemy session
  - get_current_user → extracts and validates the JWT from Authorization header
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import UserProfile
from auth_utils import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserProfile:
    """
    Extracts Bearer token → decodes JWT → loads UserProfile from DB.
    Raises 401 if token is missing, expired, or the user no longer exists.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
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
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(UserProfile).filter(UserProfile.id == user_id).first()
