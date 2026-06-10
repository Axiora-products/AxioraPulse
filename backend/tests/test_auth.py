import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
TEST_TOKEN = "eyJraWQiOiJMWTdhWUp6bllSR292SHowVmk1TzlrZlhDbzVjQ1Z2QUdVd3NSQnhZRVVNPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmMWQzYWQ2YS01MDMxLTcwZDUtOWQ2YS01MDEzZWQ4N2U4ZDIiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGgtMV9XMUxTNGxHMFoiLCJjb2duaXRvOnVzZXJuYW1lIjoiZjFkM2FkNmEtNTAzMS03MGQ1LTlkNmEtNTAxM2VkODdlOGQyIiwib3JpZ2luX2p0aSI6IjE4MDBmMzQ5LWRlNTgtNDU1Yy1hYTg0LWIxZWFkYjAwZjdlNCIsImF1ZCI6IjY3N2hya2Fqb2xzdjVlbmtpZnM4M2lnZTcxIiwiZXZlbnRfaWQiOiI2N2UxYzc5NC1kOTQ4LTRlZGItYTRjYS1hMzJmNGNjN2FmZTYiLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTc3OTM2MjU1MywibmFtZSI6ImRlZXB0aGkiLCJleHAiOjE3NzkzNjYxNTMsImlhdCI6MTc3OTM2MjU1MywianRpIjoiZTdhMzJiNzAtYWQxYS00YThlLTg5YjktMWUyMmIyYmUxMGExIiwiZW1haWwiOiJkZWVwdGhpdXBhZGh5YXl1bGFAZ21haWwuY29tIn0.dSLvNS_UA38tsmM62yEe6adTwtrvNPg_S27IUe6Y_Xm-losmbGPWK1nJwCshTqPBTSyyhpLSgRAJ-OTf_ISsM5lV4RPYxTVZiYiC0jtTePezVUIa9tJ20SyKOYF5ZOax2_kCKLMwjLqpwQ8lZrFPaSxjE5ZGcXfheHPsn-vpIZ7YSJh9b9E33QhS6ZZyWXjbdOYd2UrpsFNDuweny6EzMl02agUolozLY0wxeKAuu8lAEUHFDRWxcSwJcsBVj1ukX1MvSiKIWGQPcYprYHPB4ZRg5XrSzP2qUTFDiYzqlXOha1SwC3WZ2sTlw87teFg1qanyburN0BTkqnzglboXRQ"


def test_unauthorized_access():
    response = client.get("/dashboard/stats")
    assert response.status_code == 401


def test_invalid_token():
    response = client.get("/dashboard/stats", headers={"Authorization": "Bearer invalidtoken"})
    assert response.status_code == 401


def test_authorized_access(auth_headers):
    response = client.get("/dashboard/stats", headers=auth_headers)
    assert response.status_code == 200


def test_auth_me(auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert "profile" in data
    assert "tenant" in data


def test_auth_me_profile(auth_headers):
    payload = {"full_name": "Updated Dev Name"}
    response = client.patch("/auth/me/profile", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated Dev Name"


def test_auth_sync_existing_user(auth_headers):
    response = client.post("/auth/sync", json={"id_token": TEST_TOKEN})
    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert data["user"]["email"] == "dev@axiorapulse.com"


def test_auth_sync_invalid_token():
    response = client.post("/auth/sync", json={"id_token": "invalidtoken"})
    assert response.status_code == 401


def test_auth_sync_new_user(monkeypatch):
    import routes.auth

    new_sub = f"new-sub-{uuid.uuid4()}"

    def mock_verify(token):
        return {
            "sub": new_sub,
            "email": "newuser@example.com",
            "name": "New Cognito User",
            "token_use": "id",
        }

    monkeypatch.setattr(routes.auth, "verify_cognito_token", mock_verify)

    payload = {"id_token": "some-valid-looking-token", "tenant_name": "New Organization"}
    response = client.post("/auth/sync", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "newuser@example.com"
    assert data["tenant"]["name"] == "New Organization"

    # Cleanup the newly created user and tenant
    from db.database import SessionLocal
    from db.models import UserProfile, Tenant

    db = SessionLocal()
    try:
        new_user = db.query(UserProfile).filter(UserProfile.cognito_sub == new_sub).first()
        if new_user:
            t_id = new_user.tenant_id
            db.delete(new_user)
            if t_id:
                tenant = db.query(Tenant).filter(Tenant.id == t_id).first()
                if tenant:
                    db.delete(tenant)
            db.commit()
    finally:
        db.close()


def test_migrate_check(monkeypatch):
    import routes.auth

    monkeypatch.setattr(routes.auth, "MIGRATION_LAMBDA_SECRET", "test-secret")

    # Add a user to DB with password hash
    from db.database import SessionLocal
    from db.models import UserProfile
    from auth_utils import hash_password

    db = SessionLocal()
    user_id = uuid.uuid4()
    try:
        hashed = hash_password("correct-pass")
        user = UserProfile(
            id=user_id,
            email="migrate@example.com",
            password_hash=hashed,
            is_active=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    try:
        # Secret mismatch -> 403
        response = client.post(
            "/auth/migrate-check",
            json={"secret": "wrong", "email": "migrate@example.com", "password": "correct-pass"},
        )
        assert response.status_code == 403

        # User not found -> 404
        response = client.post(
            "/auth/migrate-check",
            json={"secret": "test-secret", "email": "nonexistent@example.com", "password": "pass"},
        )
        assert response.status_code == 404

        # Password mismatch -> 401
        response = client.post(
            "/auth/migrate-check",
            json={"secret": "test-secret", "email": "migrate@example.com", "password": "wrong-pass"},
        )
        assert response.status_code == 401

        # Success -> 200
        response = client.post(
            "/auth/migrate-check",
            json={"secret": "test-secret", "email": "migrate@example.com", "password": "correct-pass"},
        )
        assert response.status_code == 200
        assert response.json()["email"] == "migrate@example.com"

    finally:
        # Cleanup
        db = SessionLocal()
        try:
            db_user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
            if db_user:
                db.delete(db_user)
                db.commit()
        finally:
            db.close()


def test_cleanup_unconfirmed(monkeypatch):
    import routes.auth

    monkeypatch.setattr(routes.auth, "admin_get_user_status", lambda email: "UNCONFIRMED")
    monkeypatch.setattr(routes.auth, "admin_delete_user", lambda email: True)

    response = client.post("/auth/cleanup-unconfirmed", json={"email": "unconfirmed@example.com"})
    assert response.status_code == 200
    assert response.json()["deleted"] is True

    monkeypatch.setattr(routes.auth, "admin_get_user_status", lambda email: "CONFIRMED")
    response = client.post("/auth/cleanup-unconfirmed", json={"email": "confirmed@example.com"})
    assert response.status_code == 200
    assert response.json()["deleted"] is False


def test_mock_login(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    response = client.post("/auth/mock-login", json={"email": "test@example.com"})
    assert response.status_code == 400

    monkeypatch.setenv("MOCK_COGNITO", "true")
    response = client.post("/auth/mock-login", json={})
    assert response.status_code == 400

    response = client.post("/auth/mock-login", json={"email": "test@example.com"})
    assert response.status_code == 200
    assert "id_token" in response.json()


def test_auth_utils_helpers():
    from auth_utils import create_access_token, decode_access_token, create_refresh_token
    from datetime import timedelta

    payload = {"sub": "user-123", "role": "admin"}
    token = create_access_token(payload)
    assert token is not None

    decoded = decode_access_token(token)
    assert decoded["sub"] == "user-123"
    assert decoded["role"] == "admin"

    token_delta = create_access_token(payload, expires_delta=timedelta(minutes=5))
    assert token_delta is not None
    decoded_delta = decode_access_token(token_delta)
    assert decoded_delta["sub"] == "user-123"

    assert decode_access_token("completely-invalid-token-string") is None

    refresh = create_refresh_token(payload)
    assert refresh is not None
    decoded_refresh = decode_access_token(refresh)
    assert decoded_refresh["type"] == "refresh"


def test_get_auth_config(monkeypatch):
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "test-user-pool-id")
    monkeypatch.setenv("COGNITO_APP_CLIENT_ID", "test-app-client-id")
    monkeypatch.setenv("COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("MOCK_COGNITO", "true")

    response = client.get("/auth/config")
    assert response.status_code == 200
    data = response.json()
    assert data["COGNITO_USER_POOL_ID"] == "test-user-pool-id"
    assert data["COGNITO_APP_CLIENT_ID"] == "test-app-client-id"
    assert data["COGNITO_REGION"] == "us-east-1"
    assert data["MOCK_COGNITO"] is True
