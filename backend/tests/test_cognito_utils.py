import pytest
import os
import uuid
from jose import jwt, JWTError
import cognito_utils
from db.database import SessionLocal
from db.models import UserProfile, Tenant

# Capture the real implementation at module level, before any autouse fixture can
# replace cognito_utils.verify_cognito_token with a mock.
_real_verify_cognito_token = cognito_utils.verify_cognito_token
_real_get_cognito_client = cognito_utils.get_cognito_client


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


def test_cognito_config_lookups_use_ssm_endpoint(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("COGNITO_USER_POOL_ID", raising=False)
    monkeypatch.delenv("COGNITO_APP_CLIENT_ID", raising=False)
    monkeypatch.setenv("AWS_ENDPOINT_URL", "http://localhost:4566")

    class MockSSMClient:
        def get_parameter(self, Name):
            if Name.endswith("COGNITO_USER_POOL_ID"):
                return {"Parameter": {"Value": "pool-from-ssm"}}
            if Name.endswith("COGNITO_APP_CLIENT_ID"):
                return {"Parameter": {"Value": "client-from-ssm"}}
            raise AssertionError(f"unexpected parameter: {Name}")

    def mock_client(service_name, **kwargs):
        assert service_name == "ssm"
        assert kwargs["endpoint_url"] == "http://localhost:4566"
        return MockSSMClient()

    monkeypatch.setattr(cognito_utils.boto3, "client", mock_client)

    assert cognito_utils.get_user_pool_id() == "pool-from-ssm"
    assert cognito_utils.get_app_client_id() == "client-from-ssm"
    assert os.environ["COGNITO_USER_POOL_ID"] == "pool-from-ssm"
    assert os.environ["COGNITO_APP_CLIENT_ID"] == "client-from-ssm"


def test_cognito_config_lookups_fall_back_to_env_on_ssm_error(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("AWS_ENDPOINT_URL", "http://localhost:4566")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "pool-from-env")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "client-from-env")

    def mock_client(*args, **kwargs):
        raise RuntimeError("ssm unavailable")

    monkeypatch.setattr(cognito_utils.boto3, "client", mock_client)

    assert cognito_utils.get_user_pool_id() == "pool-from-env"
    assert cognito_utils.get_app_client_id() == "client-from-env"


def test_get_cognito_client_uses_local_endpoint(monkeypatch):
    monkeypatch.setattr(cognito_utils, "get_cognito_client", _real_get_cognito_client)
    _real_get_cognito_client.cache_clear()
    monkeypatch.setenv("AWS_ENDPOINT_URL", "http://localhost:4566")
    captured = {}

    def mock_client(service_name, **kwargs):
        captured["service_name"] = service_name
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(cognito_utils.boto3, "client", mock_client)

    client = _real_get_cognito_client()

    assert client is not None
    assert captured["service_name"] == "cognito-idp"
    assert captured["kwargs"]["endpoint_url"] == "http://localhost:4566"
    assert captured["kwargs"]["aws_access_key_id"] == "mock"
    _real_get_cognito_client.cache_clear()


def test_admin_get_user_status_real_client_success(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    monkeypatch.setattr(cognito_utils, "get_user_pool_id", lambda: "pool-id")

    class MockClient:
        class exceptions:
            class UserNotFoundException(Exception):
                pass

        def admin_get_user(self, **kwargs):
            assert kwargs == {"UserPoolId": "pool-id", "Username": "confirmed@example.com"}
            return {"UserStatus": "CONFIRMED"}

    monkeypatch.setattr(cognito_utils, "get_cognito_client", lambda: MockClient())

    assert cognito_utils.admin_get_user_status("confirmed@example.com") == "CONFIRMED"


def test_admin_delete_user_real_client_success(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    monkeypatch.setattr(cognito_utils, "get_user_pool_id", lambda: "pool-id")
    calls = []

    class MockClient:
        def admin_delete_user(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(cognito_utils, "get_cognito_client", lambda: MockClient())

    assert cognito_utils.admin_delete_user("delete@example.com") is True
    assert calls == [{"UserPoolId": "pool-id", "Username": "delete@example.com"}]


def test_verify_cognito_token_mock_invalid_token_use(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "true")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "mock-client")

    # Token signed with HS256 but token_use != "id"
    payload = {"sub": "123", "token_use": "access", "aud": "mock-client"}
    secret = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")
    token = jwt.encode(payload, secret, algorithm="HS256")

    # Use the real implementation (autouse fixture replaces the module attribute with a mock)
    res = _real_verify_cognito_token(token)
    assert res is None


def test_verify_cognito_token_real_flow_no_kid(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")

    # Generate token with no kid header or invalid headers
    token = jwt.encode({"sub": "123"}, "secret", algorithm="HS256")

    # This will fail the cognito flow (as it has no kid) and also fail the OTP flow
    assert _real_verify_cognito_token(token) is None


def test_verify_cognito_token_real_flow_no_matching_public_key(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")

    # Token has kid="wrong-kid"
    token = jwt.encode({"sub": "123"}, "secret", algorithm="HS256", headers={"kid": "wrong-kid"})

    # Mock JWKS keys to have a different kid
    monkeypatch.setattr(cognito_utils, "_get_jwks", lambda: [{"kid": "expected-kid"}])

    # Falls through to OTP since kid doesn't match
    assert _real_verify_cognito_token(token) is None


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

    # Should fail because token_use is not "id"
    assert _real_verify_cognito_token(token) is None


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

    res = _real_verify_cognito_token(token)
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

    res = _real_verify_cognito_token(token)
    assert res is None
