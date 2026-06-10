import pytest
import os
import uuid
from jose import jwt, JWTError
import cognito_utils
from db.database import SessionLocal
from db.models import UserProfile, Tenant


def test_admin_get_user_status_mock(monkeypatch, clean_db_for_cognito):
    monkeypatch.setenv("MOCK_COGNITO", "true")
    # Existing user email
    email = clean_db_for_cognito["user"].email
    status = cognito_utils.admin_get_user_status(email)
    assert status == "CONFIRMED"

    # Non-existent user
    status = cognito_utils.admin_get_user_status("nonexistent@example.com")
    assert status is None


@pytest.fixture
def clean_db_for_cognito():
    db = SessionLocal()
    tenant = Tenant(id=uuid.uuid4(), name="Cognito Org", slug="cognito-org")
    db.add(tenant)
    db.commit()

    user = UserProfile(
        id=uuid.uuid4(),
        email="cognito_user@example.com",
        full_name="Cognito User",
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.commit()

    yield {"db": db, "user": user}

    db.delete(user)
    db.delete(tenant)
    db.commit()
    db.close()


def test_admin_delete_user_mock(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "true")
    assert cognito_utils.admin_delete_user("any@example.com") is True


def test_verify_cognito_token_mock_invalid_token_use(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "true")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "mock-client")

    # Token signed with HS256 but token_use != "id"
    payload = {"sub": "123", "token_use": "access", "aud": "mock-client"}
    secret = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")
    token = jwt.encode(payload, secret, algorithm="HS256")

    # Restore the original verification function for this test (since autouse fixture replaced it)
    from cognito_utils import verify_cognito_token as original_verify

    res = original_verify(token)
    assert res is None


def test_verify_cognito_token_real_flow_no_kid(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")

    # Generate token with no kid header or invalid headers
    token = jwt.encode({"sub": "123"}, "secret", algorithm="HS256")

    from cognito_utils import verify_cognito_token as original_verify

    # This will fail the cognito flow (as it has no kid) and also fail the OTP flow
    assert original_verify(token) is None


def test_verify_cognito_token_real_flow_no_matching_public_key(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")

    # Token has kid="wrong-kid"
    token = jwt.encode({"sub": "123"}, "secret", algorithm="HS256", headers={"kid": "wrong-kid"})

    # Mock JWKS keys to have a different kid
    monkeypatch.setattr(cognito_utils, "_get_jwks", lambda: [{"kid": "expected-kid"}])

    from cognito_utils import verify_cognito_token as original_verify

    # Falls through to OTP since kid doesn't match
    assert original_verify(token) is None


def test_verify_cognito_token_real_flow_not_id_token(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "test-client")

    token = jwt.encode({"sub": "123", "token_use": "access"}, "secret", algorithm="HS256", headers={"kid": "test-kid"})

    # Mock JWKS keys
    monkeypatch.setattr(cognito_utils, "_get_jwks", lambda: [{"kid": "test-kid"}])

    # Mock jwt.decode to return the payload (avoiding RS256 signature verification error)
    def mock_decode(*args, **kwargs):
        if kwargs.get("algorithms") == ["RS256"]:
            return {"sub": "123", "token_use": "access"}
        raise JWTError()

    monkeypatch.setattr(jwt, "decode", mock_decode)

    from cognito_utils import verify_cognito_token as original_verify

    # Should fail because token_use is not "id"
    assert original_verify(token) is None


def test_verify_cognito_token_otp_fallback_success(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "test-client")

    # Prepare a valid OTP token (HS256 signed using OTP_JWT_SECRET)
    OTP_JWT_SECRET = "otp-secret-key-change-in-production"
    payload = {"sub": "user-123", "token_use": "id", "aud": "test-client"}
    token = jwt.encode(payload, OTP_JWT_SECRET, algorithm="HS256")

    # Make Cognito check fail (which will trigger fallback)
    def mock_get_unverified_headers(t):
        raise JWTError("Fail Cognito check")

    monkeypatch.setattr(jwt, "get_unverified_headers", mock_get_unverified_headers)

    from cognito_utils import verify_cognito_token as original_verify

    res = original_verify(token)
    assert res is not None
    assert res["sub"] == "user-123"


def test_verify_cognito_token_otp_fallback_invalid_token_use(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")

    # Prepare an OTP token but token_use != "id"
    OTP_JWT_SECRET = "otp-secret-key-change-in-production"
    payload = {"sub": "user-123", "token_use": "access", "aud": "mock-client-id"}
    token = jwt.encode(payload, OTP_JWT_SECRET, algorithm="HS256")

    def mock_get_unverified_headers(t):
        raise JWTError("Fail Cognito check")

    monkeypatch.setattr(jwt, "get_unverified_headers", mock_get_unverified_headers)

    from cognito_utils import verify_cognito_token as original_verify

    res = original_verify(token)
    assert res is None
