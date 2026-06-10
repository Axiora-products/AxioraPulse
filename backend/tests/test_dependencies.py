import pytest
import uuid
from fastapi import HTTPException
from dependencies import get_current_user, get_optional_user
from fastapi.security import HTTPAuthorizationCredentials
from db.database import SessionLocal
from db.models import UserProfile, Tenant

TEST_TOKEN = "eyJraWQiOiJMWTdhWUp6bllSR292SHowVmk1TzlrZlhDbzVjQ1Z2QUdVd3NSQnhZRVVNPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmMWQzYWQ2YS01MDMxLTcwZDUtOWQ2YS01MDEzZWQ4N2U4ZDIiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGgtMV9XMUxTNGxHMFoiLCJjb2duaXRvOnVzZXJuYW1lIjoiZjFkM2FkNmEtNTAzMS03MGQ1LTlkNmEtNTAxM2VkODdlOGQyIiwib3JpZ2luX2p0aSI6IjE4MDBmMzQ5LWRlNTgtNDU1Yy1hYTg0LWIxZWFkYjAwZjdlNCIsImF1ZCI6IjY3N2hya2Fqb2xzdjVlbmtpZnM4M2lnZTcxIiwiZXZlbnRfaWQiOiI2N2UxYzc5NC1kOTQ4LTRlZGItYTRjYS1hMzJmNGNjN2FmZTYiLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTc3OTM2MjU1MywibmFtZSI6ImRlZXB0aGkiLCJleHAiOjE3NzkzNjYxNTMsImlhdCI6MTc3OTM2MjU1MywianRpIjoiZTdhMzJiNzAtYWQxYS00YThlLTg5YjktMWUyMmIyYmUxMGExIiwiZW1haWwiOiJkZWVwdGhpdXBhZGh5YXl1bGFAZ21haWwuY29tIn0.dSLvNS_UA38tsmM62yEe6adTwtrvNPg_S27IUe6Y_Xm-losmbGPWK1nJwCshTqPBTSyyhpLSgRAJ-OTf_ISsM5lV4RPYxTVZiYiC0jtTePezVUIa9tJ20SyKOYF5ZOax2_kCKLMwjLqpwQ8lZrFPaSxjE5ZGcXfheHPsn-vpIZ7YSJh9b9E33QhS6ZZyWXjbdOYd2UrpsFNDuweny6EzMl02agUolozLY0wxeKAuu8lAEUHFDRWxcSwJcsBVj1ukX1MvSiKIWGQPcYprYHPB4ZRg5XrSzP2qUTFDiYzqlXOha1SwC3WZ2sTlw87teFg1qanyburN0BTkqnzglboXRQ"


def test_dependencies_get_current_user_success():
    db = SessionLocal()
    try:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=TEST_TOKEN)
        user = get_current_user(credentials=credentials, db=db)
        assert user is not None
        assert user.email == "dev@axiorapulse.com"
    finally:
        db.close()


def test_dependencies_get_current_user_no_credentials():
    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=None, db=db)
        assert exc.value.status_code == 401
    finally:
        db.close()


def test_dependencies_get_current_user_invalid_token():
    db = SessionLocal()
    try:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalidtoken")
        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=credentials, db=db)
        assert exc.value.status_code == 401
    finally:
        db.close()


def test_dependencies_get_current_user_inactive():
    db = SessionLocal()
    try:
        # Find user, set inactive
        user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
        original_active = user.is_active if user else True
        if user:
            user.is_active = False
            db.commit()

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=TEST_TOKEN)
        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials=credentials, db=db)
        assert exc.value.status_code == 401

        # Restore active status
        if user:
            user.is_active = original_active
            db.commit()
    finally:
        db.close()


def test_dependencies_get_current_user_self_healing_link(monkeypatch):
    import dependencies

    new_sub = f"healing-sub-{uuid.uuid4()}"
    email = f"healing_{uuid.uuid4().hex[:6]}@example.com"

    # Seed an invited user with no sub
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).first()
        user = UserProfile(id=uuid.uuid4(), email=email, tenant_id=tenant.id if tenant else None, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    finally:
        db.close()

    def mock_verify(token):
        return {
            "sub": new_sub,
            "email": email,
            "name": "Healing User",
            "token_use": "id",
        }

    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)

    db = SessionLocal()
    try:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        resolved_user = get_current_user(credentials=credentials, db=db)
        assert resolved_user.id == user_id
        assert resolved_user.cognito_sub == new_sub

        # Cleanup
        db.delete(resolved_user)
        db.commit()
    finally:
        db.close()


def test_dependencies_get_current_user_self_healing_new_user(monkeypatch):
    import dependencies

    new_sub = f"new-healing-sub-{uuid.uuid4()}"
    email = f"new_healing_{uuid.uuid4().hex[:6]}@example.com"

    def mock_verify(token):
        return {
            "sub": new_sub,
            "email": email,
            "name": "New Healing User",
            "token_use": "id",
        }

    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)

    db = SessionLocal()
    try:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        resolved_user = get_current_user(credentials=credentials, db=db)
        assert resolved_user.cognito_sub == new_sub
        assert resolved_user.email == email

        # Cleanup resolved user and tenant
        tenant_id = resolved_user.tenant_id
        db.delete(resolved_user)
        if tenant_id:
            tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
            if tenant:
                db.delete(tenant)
        db.commit()
    finally:
        db.close()


def test_dependencies_get_optional_user(monkeypatch):

    # 1. No credentials
    assert get_optional_user(credentials=None, db=None) is None

    # 2. Invalid credentials
    credentials_invalid = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalidtoken")
    db = SessionLocal()
    try:
        assert get_optional_user(credentials=credentials_invalid, db=db) is None
    finally:
        db.close()

    # 3. Valid credentials
    credentials_valid = HTTPAuthorizationCredentials(scheme="Bearer", credentials=TEST_TOKEN)
    db = SessionLocal()
    try:
        user = get_optional_user(credentials=credentials_valid, db=db)
        assert user is not None
        assert user.email == "dev@axiorapulse.com"
    finally:
        db.close()


def test_dependencies_get_current_user_self_healing_link_by_phone(monkeypatch):
    import dependencies

    new_sub = f"healing-sub-phone-{uuid.uuid4()}"
    phone = "+15550199239"

    # Seed a user with a verified phone but NO cognito_sub
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).first()
        user = UserProfile(
            id=uuid.uuid4(),
            email=f"healing_phone_{uuid.uuid4().hex[:6]}@example.com",
            phone_number=phone,
            phone_verified=True,
            tenant_id=tenant.id if tenant else None,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    finally:
        db.close()

    def mock_verify(token):
        return {
            "sub": new_sub,
            "email": f"healing_phone_{uuid.uuid4().hex[:6]}@example.com",
            "phone_number": phone,
            "token_use": "id",
        }

    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)

    db = SessionLocal()
    try:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        resolved_user = get_current_user(credentials=credentials, db=db)
        assert resolved_user.id == user_id
        assert resolved_user.cognito_sub == new_sub

        # Cleanup
        db.delete(resolved_user)
        db.commit()
    finally:
        db.close()
