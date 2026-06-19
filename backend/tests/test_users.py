from fastapi.testclient import TestClient
from app.main import app
from db.database import SessionLocal
from db.models import RoleEnum, Tenant, UserProfile
import uuid

client = TestClient(app)


def _set_account_type(account_type):
    """Flip the dev user's tenant account_type, returning the previous value."""
    db = SessionLocal()
    try:
        user = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first()
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        previous = tenant.account_type
        tenant.account_type = account_type
        db.commit()
        return previous
    finally:
        db.close()


def test_list_users(auth_headers):
    response = client.get("/users/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_user_by_id(auth_headers):
    list_resp = client.get("/users/", headers=auth_headers)
    assert list_resp.status_code == 200
    user_id = list_resp.json()[0]["id"]

    response = client.get(f"/users/{user_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == user_id


def test_invite_user(auth_headers):
    email = f"new_team_member_{uuid.uuid4().hex}@example.com"
    payload = {"email": email, "full_name": "New Team Member", "role": "admin"}
    response = client.post("/users/invite", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == email
    assert data["account_status"] == "invited"


def test_personal_account_blocks_team_management(auth_headers):
    # Personal accounts cannot invite or delete team members (mutating endpoints 403).
    previous = _set_account_type("personal")
    try:
        invite = client.post(
            "/users/invite",
            json={"email": f"p_{uuid.uuid4().hex}@example.com", "role": "viewer"},
            headers=auth_headers,
        )
        assert invite.status_code == 403

        delete = client.delete(f"/users/{uuid.uuid4()}", headers=auth_headers)
        assert delete.status_code == 403
    finally:
        _set_account_type(previous)


def test_bulk_invite_users(auth_headers):
    email1 = f"bulk1_{uuid.uuid4().hex}@example.com"
    email2 = f"bulk2_{uuid.uuid4().hex}@example.com"
    payload = {"emails": [email1, email2], "role": "viewer"}
    response = client.post("/users/bulk-invite", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) == 2


def test_invite_existing_user_in_another_tenant_blocked(auth_headers):
    db = SessionLocal()
    other_tenant = Tenant(id=uuid.uuid4(), name="Other Org", slug=f"other-{uuid.uuid4().hex}")
    existing = UserProfile(
        id=uuid.uuid4(),
        email=f"external_{uuid.uuid4().hex}@example.com",
        tenant_id=other_tenant.id,
        is_active=True,
        account_status="active",
    )
    try:
        db.add(other_tenant)
        db.add(existing)
        db.commit()

        response = client.post(
            "/users/invite",
            json={"email": existing.email, "full_name": "External User", "role": "viewer"},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert "another organization" in response.json()["detail"]
    finally:
        db.delete(existing)
        db.delete(other_tenant)
        db.commit()
        db.close()


def test_bulk_invite_existing_user_in_another_tenant_reports_failure(auth_headers):
    db = SessionLocal()
    other_tenant = Tenant(id=uuid.uuid4(), name="Bulk Other Org", slug=f"bulk-other-{uuid.uuid4().hex}")
    existing = UserProfile(
        id=uuid.uuid4(),
        email=f"bulk_external_{uuid.uuid4().hex}@example.com",
        tenant_id=other_tenant.id,
        is_active=True,
        account_status="active",
    )
    try:
        db.add(other_tenant)
        db.add(existing)
        db.commit()

        response = client.post(
            "/users/bulk-invite",
            json={"emails": [existing.email], "role": "viewer"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["results"] == [
            {
                "email": existing.email,
                "status": "failed",
                "error": "Registered with another organization",
            }
        ]
    finally:
        db.delete(existing)
        db.delete(other_tenant)
        db.commit()
        db.close()


def test_update_user_role(auth_headers):
    # First, invite a new user to update
    email = f"role_update_{uuid.uuid4().hex}@example.com"
    invite_resp = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Role Update Member", "role": "viewer"},
        headers=auth_headers,
    )
    assert invite_resp.status_code == 200
    user_id = invite_resp.json()["id"]

    payload = {"role": "manager"}
    response = client.patch(f"/users/{user_id}/role", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "manager"


def test_admin_cannot_change_or_assign_super_admin_role(auth_headers):
    db = SessionLocal()
    tenant = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first().tenant
    super_user = UserProfile(
        id=uuid.uuid4(),
        email=f"super_target_{uuid.uuid4().hex}@example.com",
        tenant_id=tenant.id,
        role=RoleEnum.super_admin,
        is_active=True,
        account_status="active",
    )
    viewer = UserProfile(
        id=uuid.uuid4(),
        email=f"viewer_target_{uuid.uuid4().hex}@example.com",
        tenant_id=tenant.id,
        role=RoleEnum.viewer,
        is_active=True,
        account_status="active",
    )
    try:
        db.add(super_user)
        db.add(viewer)
        db.commit()

        change_super = client.patch(f"/users/{super_user.id}/role", json={"role": "admin"}, headers=auth_headers)
        assign_super = client.patch(
            f"/users/{viewer.id}/role",
            json={"role": "super_admin"},
            headers=auth_headers,
        )

        assert change_super.status_code == 403
        assert "Super Admin's role cannot be changed" in change_super.json()["detail"]
        assert assign_super.status_code == 403
        assert "Admins cannot assign" in assign_super.json()["detail"]
    finally:
        db.delete(super_user)
        db.delete(viewer)
        db.commit()
        db.close()


def test_update_user_status(auth_headers):
    # First, invite a new user to update status
    email = f"status_update_{uuid.uuid4().hex}@example.com"
    invite_resp = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Status Update Member", "role": "viewer"},
        headers=auth_headers,
    )
    assert invite_resp.status_code == 200
    user_id = invite_resp.json()["id"]

    payload = {"is_active": False}
    response = client.patch(f"/users/{user_id}/status", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_admin_cannot_disable_or_delete_super_admin(auth_headers):
    db = SessionLocal()
    tenant = db.query(UserProfile).filter(UserProfile.email == "dev@axiorapulse.com").first().tenant
    super_user = UserProfile(
        id=uuid.uuid4(),
        email=f"super_protected_{uuid.uuid4().hex}@example.com",
        tenant_id=tenant.id,
        role=RoleEnum.super_admin,
        is_active=True,
        account_status="active",
    )
    try:
        db.add(super_user)
        db.commit()

        disable = client.patch(f"/users/{super_user.id}/status", json={"is_active": False}, headers=auth_headers)
        delete = client.delete(f"/users/{super_user.id}", headers=auth_headers)

        assert disable.status_code == 403
        assert "Super Admin cannot be disabled" in disable.json()["detail"]
        assert delete.status_code == 403
        assert "Super Admin cannot be deleted" in delete.json()["detail"]
    finally:
        db.delete(super_user)
        db.commit()
        db.close()


def test_self_role_update_blocked(auth_headers):
    list_resp = client.get("/users/", headers=auth_headers)
    assert list_resp.status_code == 200
    own_id = list_resp.json()[0]["id"]

    response = client.patch(f"/users/{own_id}/role", json={"role": "admin"}, headers=auth_headers)
    assert response.status_code == 400
    assert "Cannot change your own role" in response.json()["detail"]


def test_self_status_update_blocked(auth_headers):
    list_resp = client.get("/users/", headers=auth_headers)
    assert list_resp.status_code == 200
    own_id = list_resp.json()[0]["id"]

    response = client.patch(f"/users/{own_id}/status", json={"is_active": False}, headers=auth_headers)
    assert response.status_code == 400
    assert "Cannot change your own status" in response.json()["detail"]


def test_accept_invite(auth_headers):
    email = f"accept_invite_{uuid.uuid4().hex}@example.com"
    # First, invite a user to get an invite_token
    payload = {"email": email, "full_name": "Accept User", "role": "viewer"}
    invite_resp = client.post("/users/invite", json=payload, headers=auth_headers)
    assert invite_resp.status_code == 200
    invite_token = invite_resp.json().get("invite_token")
    assert invite_token is not None

    # Retrieve info using token
    info_resp = client.get(f"/users/invite-info/{invite_token}")
    assert info_resp.status_code == 200
    assert info_resp.json()["email"] == email

    # Accept invitation
    accept_payload = {"full_name": "Active User Name", "password": "SecretPassword123!"}
    accept_resp = client.patch(f"/users/accept-invite?token={invite_token}", json=accept_payload)
    assert accept_resp.status_code == 200


def test_accept_invite_links_existing_cognito_user(auth_headers, monkeypatch):
    import routes.users

    email = f"existing_cognito_{uuid.uuid4().hex}@example.com"
    invite_resp = client.post(
        "/users/invite",
        json={"email": email, "full_name": "Existing Cognito", "role": "viewer"},
        headers=auth_headers,
    )
    assert invite_resp.status_code == 200
    invite_token = invite_resp.json()["invite_token"]

    class MockCognitoClient:
        class exceptions:
            class UsernameExistsException(Exception):
                pass

        def admin_create_user(self, **kwargs):
            raise self.exceptions.UsernameExistsException()

        def admin_get_user(self, **kwargs):
            return {"UserAttributes": [{"Name": "sub", "Value": "existing-cognito-sub"}]}

        def admin_set_user_password(self, **kwargs):
            return {}

    monkeypatch.setattr(routes.users, "get_user_pool_id", lambda: "pool-id")
    monkeypatch.setattr(routes.users, "get_cognito_client", lambda: MockCognitoClient())

    accept_resp = client.patch(
        f"/users/accept-invite?token={invite_token}",
        json={"full_name": "Existing Cognito", "password": "SecretPassword123!"},
    )

    assert accept_resp.status_code == 200

    db = SessionLocal()
    try:
        user = db.query(UserProfile).filter(UserProfile.email == email).first()
        assert user.cognito_sub == "existing-cognito-sub"
    finally:
        db.close()


def test_share_survey_email(auth_headers):
    payload = {
        "email": "someone@example.com",
        "survey_title": "Customer Satisfaction",
        "survey_link": "http://localhost/survey/sat",
        "subject": "Quick Survey",
        "body": "Please fill out this survey.",
    }
    response = client.post("/users/share-survey", json=payload, headers=auth_headers)
    assert response.status_code == 200


def test_bulk_share_survey_email(auth_headers):
    payload = {
        "emails": ["client1@example.com", "client2@example.com", "invalid-email"],
        "survey_title": "Product Feedback",
        "survey_link": "http://localhost/survey/product",
        "subject": "Tell us what you think",
        "body": "Feedback matters.",
    }
    response = client.post("/users/bulk-share-survey", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["sent"] == 2
    assert data["failed"] == 1


def test_bulk_share_whatsapp(auth_headers):
    payload = {
        "numbers": ["+1234567890", "+9876543210"],
        "survey_title": "Mobile App Experience",
        "survey_link": "http://localhost/survey/app",
        "message": "Click to take survey: ",
    }
    response = client.post("/users/bulk-share-whatsapp", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert data["sent"] == 2
