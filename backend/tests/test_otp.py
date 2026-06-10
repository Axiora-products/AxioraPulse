import pytest
import uuid
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app
from db.database import SessionLocal
from db.models import UserProfile, OTPVerification, Tenant
from services.sms import send_otp_sms

client = TestClient(app)


@pytest.fixture
def clean_db():
    db = SessionLocal()
    # Create a unique tenant for OTP testing
    tenant_id = uuid.uuid4()
    tenant = Tenant(id=tenant_id, name="OTP Test Org", slug=f"otp-test-org-{uuid.uuid4().hex[:6]}")
    db.add(tenant)
    db.commit()

    # Create test users
    verified_user_id = uuid.uuid4()
    verified_user = UserProfile(
        id=verified_user_id,
        email=f"otp_verified_{uuid.uuid4().hex[:6]}@example.com",
        full_name="OTP Verified User",
        phone_number="+15550199234",
        phone_verified=True,
        tenant_id=tenant_id,
        is_active=True,
    )

    unverified_user_id = uuid.uuid4()
    unverified_user = UserProfile(
        id=unverified_user_id,
        email=f"otp_unverified_{uuid.uuid4().hex[:6]}@example.com",
        full_name="OTP Unverified User",
        phone_number="+15550199235",
        phone_verified=False,
        tenant_id=tenant_id,
        is_active=True,
    )

    db.add(verified_user)
    db.add(unverified_user)
    db.commit()

    yield {"db": db, "tenant_id": tenant_id, "verified_user": verified_user, "unverified_user": unverified_user}

    # Cleanup
    db.query(OTPVerification).filter(
        OTPVerification.phone_number.in_(["+15550199234", "+15550199235", "+15550199236"])
    ).delete(synchronize_session=False)
    db.query(UserProfile).filter(UserProfile.id.in_([verified_user_id, unverified_user_id])).delete(
        synchronize_session=False
    )
    db.query(Tenant).filter(Tenant.id == tenant_id).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_validate_phone_invalid_format():
    # Test POST /auth/otp/send with invalid phone number
    response = client.post("/auth/otp/send", json={"phone_number": "12345"})
    assert response.status_code == 400
    assert "Invalid phone number format" in response.json()["detail"]


def test_otp_send_not_found(clean_db):
    # Test POST /auth/otp/send with unlinked number
    response = client.post("/auth/otp/send", json={"phone_number": "+15550199236"})
    assert response.status_code == 404
    assert "No account linked to this number" in response.json()["detail"]


def test_otp_send_success_and_verify(clean_db):
    db = clean_db["db"]
    phone = clean_db["verified_user"].phone_number

    # Clean number validation checks clean_phone validator
    response = client.post("/auth/otp/send", json={"phone_number": "+1 (555) 019-9234"})
    assert response.status_code == 200
    assert response.json()["message"] == "OTP sent successfully"

    # Fetch OTP from database
    otp_record = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone_number == phone, OTPVerification.purpose == "login")
        .first()
    )
    assert otp_record is not None
    assert otp_record.verified is False

    # Verify invalid OTP
    verify_resp = client.post("/auth/otp/verify", json={"phone_number": phone, "otp_code": "000000"})
    assert verify_resp.status_code == 400
    assert verify_resp.json()["detail"] == "Invalid OTP"

    # Verify correct OTP
    verify_resp = client.post("/auth/otp/verify", json={"phone_number": phone, "otp_code": otp_record.otp_code})
    assert verify_resp.status_code == 200
    assert "id_token" in verify_resp.json()
    assert verify_resp.json()["user"]["email"] == clean_db["verified_user"].email


def test_otp_verify_too_many_attempts(clean_db):
    db = clean_db["db"]
    phone = clean_db["verified_user"].phone_number

    # Generate an OTP directly in the DB
    otp_record = OTPVerification(
        id=uuid.uuid4(),
        phone_number=phone,
        otp_code="123456",
        purpose="login",
        user_id=clean_db["verified_user"].id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        attempts=4,
    )
    db.add(otp_record)
    db.commit()

    # The 5th attempt (attempts is incremented before checking attempts >= 5)
    verify_resp = client.post("/auth/otp/verify", json={"phone_number": phone, "otp_code": "000000"})
    assert verify_resp.status_code == 429
    assert verify_resp.json()["detail"] == "Too many attempts"


def test_otp_verify_expired_or_not_found():
    response = client.post("/auth/otp/verify", json={"phone_number": "+15550199236", "otp_code": "123456"})
    assert response.status_code == 400
    assert "OTP expired or not found" in response.json()["detail"]


def test_phone_link_flows(clean_db, auth_headers):
    db = clean_db["db"]
    # We want to link a new phone number to this user
    new_phone = "+15550199236"

    # Send Link OTP
    response = client.post("/auth/otp/phone/send", json={"phone_number": new_phone}, headers=auth_headers)
    assert response.status_code == 200

    # Retrieve OTP
    otp_record = (
        db.query(OTPVerification)
        .filter(OTPVerification.phone_number == new_phone, OTPVerification.purpose == "link_phone")
        .first()
    )
    assert otp_record is not None

    # Link with invalid OTP
    verify_resp = client.post(
        "/auth/otp/phone/verify", json={"phone_number": new_phone, "otp_code": "000000"}, headers=auth_headers
    )
    assert verify_resp.status_code == 400

    # Link with correct OTP
    verify_resp = client.post(
        "/auth/otp/phone/verify",
        json={"phone_number": new_phone, "otp_code": otp_record.otp_code},
        headers=auth_headers,
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["phone_number"] == new_phone
    assert verify_resp.json()["phone_verified"] is True

    # Try linking a phone number that is already linked to another verified account
    conflict_user_phone = clean_db["unverified_user"].phone_number
    # Temporarily verify it to cause conflict
    clean_db["unverified_user"].phone_verified = True
    db.commit()

    link_conflict_resp = client.post(
        "/auth/otp/phone/send", json={"phone_number": conflict_user_phone}, headers=auth_headers
    )
    assert link_conflict_resp.status_code == 409
    assert "already linked to another account" in link_conflict_resp.json()["detail"]


def test_phone_remove(clean_db, auth_headers):
    db = clean_db["db"]
    # Start with linked phone
    clean_db["verified_user"].phone_number = "+15550199234"
    clean_db["verified_user"].phone_verified = True
    db.commit()

    response = client.delete("/auth/otp/phone/remove", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Phone number removed"

    db.refresh(clean_db["verified_user"])
    assert clean_db["verified_user"].phone_number is None
    assert clean_db["verified_user"].phone_verified is False


def test_sms_service_mock_mode(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "true")
    assert send_otp_sms("+15550199234", "123456") is True


def test_sms_service_real_mode_failure(monkeypatch):
    monkeypatch.setenv("MOCK_COGNITO", "false")
    monkeypatch.setenv("ENVIRONMENT", "production")
    # Calling SNS without valid AWS credentials will throw an error and return False
    # But just in case, we mock sns client to throw Exception
    import services.sms

    def mock_get_sns():
        class MockSNS:
            def publish(self, **kwargs):
                raise Exception("AWS SNS Failed")

        return MockSNS()

    monkeypatch.setattr(services.sms, "get_sns_client", mock_get_sns)
    assert send_otp_sms("+15550199234", "123456") is False
