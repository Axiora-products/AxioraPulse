from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"


def test_generate_investor_readiness_report(auth_headers):
    payload = {
        "startup_context": "An AI-powered customer feedback optimization tool",
        "pricing_model": "SaaS subscription $49/month",
        "target_country": "India",
        "target_state": "Telangana",
        "target_district": "Hyderabad",
    }
    response = client.post(f"/investor/surveys/{SURVEY_ID}/readiness", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["survey_id"] == SURVEY_ID
    assert "executive_summary" in data
    assert "scoring" in data
