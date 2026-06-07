from fastapi.testclient import TestClient
from app.main import app
import random

client = TestClient(app)


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
    email = f"new_team_member_{random.randint(1000, 9999)}@example.com"
    payload = {"email": email, "full_name": "New Team Member", "role": "admin"}
    response = client.post("/users/invite", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == email
    assert data["account_status"] == "invited"


def test_bulk_invite_users(auth_headers):
    email1 = f"bulk1_{random.randint(1000, 9999)}@example.com"
    email2 = f"bulk2_{random.randint(1000, 9999)}@example.com"
    payload = {"emails": [email1, email2], "role": "viewer"}
    response = client.post("/users/bulk-invite", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert len(data["results"]) == 2


def test_update_user_role(auth_headers):
    list_resp = client.get("/users/", headers=auth_headers)
    assert list_resp.status_code == 200
    user_id = list_resp.json()[0]["id"]

    payload = {"role": "manager"}
    response = client.patch(f"/users/{user_id}/role", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "manager"


def test_update_user_status(auth_headers):
    list_resp = client.get("/users/", headers=auth_headers)
    assert list_resp.status_code == 200
    user_id = list_resp.json()[0]["id"]

    payload = {"is_active": False}
    response = client.patch(f"/users/{user_id}/status", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    # Reactivate the user directly in the database since the user cannot authenticate while is_active is False
    from db.database import SessionLocal
    from db.models import UserProfile

    db = SessionLocal()
    try:
        user = db.query(UserProfile).filter(UserProfile.id == user_id).first()
        if user:
            user.is_active = True
            db.commit()
    finally:
        db.close()


def test_accept_invite(auth_headers):
    email = f"accept_invite_{random.randint(1000, 9999)}@example.com"
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
