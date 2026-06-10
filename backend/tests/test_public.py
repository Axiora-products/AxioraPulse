from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_send_email_share():
    payload = {
        "to": "invitee@example.com",
        "surveyTitle": "Customer Satisfaction Survey",
        "surveyUrl": "https://pulse.axiora.com/s/cust-sat",
        "type": "share",
        "respondentName": "Jane Doe",
    }
    response = client.post("/public/send-email", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True}


def test_send_email_resume():
    payload = {
        "to": "resume@example.com",
        "surveyTitle": "Customer Satisfaction Survey",
        "surveyUrl": "https://pulse.axiora.com/s/cust-sat?token=123",
        "type": "resume",
    }
    response = client.post("/public/send-email", json=payload)
    assert response.status_code == 200
    assert response.json() == {"success": True}


def test_send_email_error(monkeypatch):
    import routes.public

    def mock_send_email_fail(*args, **kwargs):
        raise ValueError("AWS SES connection failed")

    monkeypatch.setattr(routes.public, "send_email", mock_send_email_fail)

    payload = {
        "to": "error@example.com",
        "surveyTitle": "Failing Email Survey",
        "surveyUrl": "https://pulse.axiora.com/s/failing",
    }
    response = client.post("/public/send-email", json=payload)
    assert response.status_code == 500
    assert "AWS SES connection failed" in response.json()["detail"]


def test_join_waitlist():
    import uuid

    email = f"waitlist_{uuid.uuid4().hex}@example.com"
    payload = {"email": email}

    # First signup
    response1 = client.post("/public/waitlist", json=payload)
    assert response1.status_code == 200
    assert response1.json() == {"success": True}

    # Duplicate signup (should trigger IntegrityError and return success)
    response2 = client.post("/public/waitlist", json=payload)
    assert response2.status_code == 200
    assert response2.json() == {"success": True}
