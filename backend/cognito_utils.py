"""
cognito_utils.py
────────────────
Verifies Cognito ID tokens using the User Pool's JWKS endpoint.
JWKS is cached for the process lifetime — Cognito rotates keys rarely.
"""

import os
import requests
from functools import lru_cache
from jose import jwt, JWTError

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    url = (
        f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
        f"/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.json()


def verify_cognito_token(token: str) -> dict | None:
    """
    Decode and verify a Cognito ID token.
    Returns the payload dict or None on any failure.
    """
    try:
        jwks = _get_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
        )
        # Reject if not an ID token
        if payload.get("token_use") != "id":
            return None
        return payload
    except (JWTError, Exception):
        return None
