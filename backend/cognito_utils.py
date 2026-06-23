"""
cognito_utils.py
────────────────
Verifies Cognito ID tokens using the User Pool's JWKS endpoint.
Manually matches the token's kid header against the JWKS keys —
python-jose does not do this lookup automatically.
JWKS is cached for the process lifetime; Cognito rotates keys rarely.
"""

import os
import logging
import requests
import boto3
from functools import lru_cache
from jose import jwt, JWTError
from dotenv import load_dotenv

from core import config

load_dotenv()

logger = logging.getLogger(__name__)

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")


def get_user_pool_id() -> str | None:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return os.getenv("COGNITO_USER_POOL_ID")
    endpoint = os.getenv("AWS_ENDPOINT_URL")
    if endpoint:
        try:
            ssm = boto3.client(
                "ssm",
                region_name=COGNITO_REGION,
                endpoint_url=endpoint,
                aws_access_key_id="mock",
                aws_secret_access_key="mock",
            )
            res = ssm.get_parameter(Name="/axiorapulse/dev/COGNITO_USER_POOL_ID")
            pool_id = res["Parameter"]["Value"]
            os.environ["COGNITO_USER_POOL_ID"] = pool_id
            return pool_id
        except Exception:
            pass
    return os.getenv("COGNITO_USER_POOL_ID")


def get_app_client_id() -> str | None:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return os.getenv("COGNITO_APP_CLIENT_ID")
    endpoint = os.getenv("AWS_ENDPOINT_URL")
    if endpoint:
        try:
            ssm = boto3.client(
                "ssm",
                region_name=COGNITO_REGION,
                endpoint_url=endpoint,
                aws_access_key_id="mock",
                aws_secret_access_key="mock",
            )
            res = ssm.get_parameter(Name="/axiorapulse/dev/COGNITO_APP_CLIENT_ID")
            client_id = res["Parameter"]["Value"]
            os.environ["COGNITO_APP_CLIENT_ID"] = client_id
            return client_id
        except Exception:
            pass
    return os.getenv("COGNITO_APP_CLIENT_ID")


# Mock Cognito is gated and secret-checked centrally in core.config (fail-closed,
# never enabled in production). (AP-SEC-001, AP-SEC-029)
MOCK_COGNITO = config.MOCK_COGNITO


@lru_cache(maxsize=1)
def get_cognito_client():
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    if endpoint_url:
        return boto3.client(
            "cognito-idp",
            region_name=COGNITO_REGION,
            endpoint_url=endpoint_url,
            aws_access_key_id="mock",
            aws_secret_access_key="mock",
        )
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
    pool_id = get_user_pool_id()
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
    pool_id = get_user_pool_id()
    try:
        client.admin_delete_user(UserPoolId=pool_id, Username=email)
        return True
    except Exception as e:
        print(f"COGNITO ERROR (delete_user): {str(e)}")
        return False


@lru_cache(maxsize=4)
def _get_jwks(pool_id: str) -> list:
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
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
    Decode and verify an ID token. Returns the payload dict or None on failure.

    Security (AP-SEC-001):
      - The raw token is never logged.
      - Mock verification is only attempted when MOCK_COGNITO is enabled AND a
        real (non-default) MOCK_COGNITO_SECRET is configured. It is impossible in
        production (core.config raises if MOCK_COGNITO is set there).
      - OTP-issued HS256 tokens are only accepted when OTP_JWT_SECRET is explicitly
        configured to a non-default value. With it unset, such tokens are rejected
        rather than being verified against a public default secret.
    """
    if not token:
        return None

    client_id = get_app_client_id()
    if not client_id:
        logger.error("Cognito app client id is not configured; cannot verify tokens")
        return None

    # ── Local mock mode ──────────────────────────────────────────────────────
    if config.MOCK_COGNITO:
        if not config.MOCK_COGNITO_SECRET:
            logger.error("MOCK_COGNITO enabled but MOCK_COGNITO_SECRET is unset/insecure")
            return None
        try:
            payload = jwt.decode(token, config.MOCK_COGNITO_SECRET, algorithms=["HS256"], audience=client_id)
            return payload if payload.get("token_use") == "id" else None
        except Exception as exc:
            logger.warning("Mock token verification failed: %s", type(exc).__name__)
            return None

    # ── Real Cognito RS256 verification ──────────────────────────────────────
    try:
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")

        pool_id = get_user_pool_id()
        keys = _get_jwks(pool_id)
        key = next((k for k in keys if k["kid"] == kid), None)
        if key is None:
            raise JWTError("No matching public key found")

        payload = jwt.decode(token, key, algorithms=["RS256"], audience=client_id)
        if payload.get("token_use") != "id":
            raise JWTError("Token use is not ID")
        return payload
    except Exception as exc:
        # Do not log token contents or stack traces (avoids credential leakage).
        logger.info("Cognito token verification failed: %s", type(exc).__name__)

    # ── OTP-issued token fallback (only if explicitly configured) ─────────────
    if config.OTP_JWT_SECRET:
        try:
            payload = jwt.decode(token, config.OTP_JWT_SECRET, algorithms=["HS256"], audience=client_id)
            return payload if payload.get("token_use") == "id" else None
        except Exception:
            return None

    return None
