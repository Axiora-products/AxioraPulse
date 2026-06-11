"""
cognito_utils.py
────────────────
Verifies Cognito ID tokens using the User Pool's JWKS endpoint.
Manually matches the token's kid header against the JWKS keys —
python-jose does not do this lookup automatically.
JWKS is cached for the process lifetime; Cognito rotates keys rarely.
"""

import os
import requests
import boto3
from functools import lru_cache
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")

MOCK_COGNITO = os.getenv("MOCK_COGNITO", "false").lower() == "true"
MOCK_COGNITO_SECRET = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")


@lru_cache(maxsize=1)
def get_cognito_client():
    return boto3.client("cognito-idp", region_name=COGNITO_REGION)


def admin_get_user_status(email: str) -> str | None:
    """Returns 'UNCONFIRMED', 'CONFIRMED', etc. or None if user doesn't exist."""
    mock = os.getenv("MOCK_COGNITO", "false").lower() == "true"
    if mock:
        try:
            from db.database import SessionLocal
            from db.models import UserProfile

            db = SessionLocal()
            try:
                user = db.query(UserProfile).filter(UserProfile.email == email).first()
                if user:
                    return "CONFIRMED"
                return None
            finally:
                db.close()
        except Exception as e:
            print(f"MOCK COGNITO ERROR (get_status): {str(e)}")
            return None

    client = get_cognito_client()
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    try:
        resp = client.admin_get_user(UserPoolId=pool_id, Username=email)
        return resp.get("UserStatus")
    except client.exceptions.UserNotFoundException:
        return None
    except Exception as e:
        print(f"COGNITO ERROR (get_status): {str(e)}")
        return None


def admin_delete_user(email: str) -> bool:
    """Force delete a user. Returns True if successful."""
    mock = os.getenv("MOCK_COGNITO", "false").lower() == "true"
    if mock:
        return True

    client = get_cognito_client()
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    try:
        client.admin_delete_user(UserPoolId=pool_id, Username=email)
        return True
    except Exception as e:
        print(f"COGNITO ERROR (delete_user): {str(e)}")
        return False


@lru_cache(maxsize=1)
def _get_jwks() -> list:
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    pool_id = os.getenv("COGNITO_USER_POOL_ID")
    region = os.getenv("COGNITO_REGION", "ap-south-1")
    if endpoint_url:
        url = f"{endpoint_url.rstrip('/')}/{pool_id}/.well-known/jwks.json"
    else:
        url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.json()["keys"]


def verify_cognito_token(token: str) -> dict | None:
    """
    Decode and verify a Cognito ID token.
    Returns the payload dict or None on any failure.
    """
    mock = os.getenv("MOCK_COGNITO", "false").lower() == "true"
    client_id = os.getenv("COGNITO_APP_CLIENT_ID") or "mock-client-id"
    mock_secret = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")

    if mock:
        try:
            # Under mock mode, tokens are self-signed locally using HS256
            payload = jwt.decode(token, mock_secret, algorithms=["HS256"], audience=client_id)
            if payload.get("token_use") != "id":
                return None
            return payload
        except Exception as e:
            print(f"MOCK COGNITO VERIFICATION ERROR: {str(e)}")
            return None

    try:
        # Find the matching public key by kid
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")

        keys = _get_jwks()
        key = next((k for k in keys if k["kid"] == kid), None)
        if key is None:
            raise JWTError("No matching public key found")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=client_id,
        )

        if payload.get("token_use") != "id":
            raise JWTError("Token use is not ID")

        return payload
    except Exception:
        pass

    # If Cognito verification failed, try OTP token verification
    OTP_JWT_SECRET = os.getenv("OTP_JWT_SECRET", "otp-secret-key-change-in-production")
    try:
        payload = jwt.decode(token, OTP_JWT_SECRET, algorithms=["HS256"], audience=client_id)
        if payload.get("token_use") != "id":
            return None
        return payload
    except Exception:
        return None
