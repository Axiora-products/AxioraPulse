import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"


def test_feedback_lifecycle(auth_headers):
    # 1. Create survey feedback (Public endpoint)
    fb_payload = {
        "survey_id": SURVEY_ID,
        "rating": 5,
        "comment": "Excellent product!",
    }
    response = client.post("/feedback/", json=fb_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["survey_id"] == SURVEY_ID
    assert data["rating"] == 5
    assert data["comment"] == "Excellent product!"
    assert "id" in data

    # 2. Get feedback for survey
    get_response = client.get(f"/feedback/survey/{SURVEY_ID}", headers=auth_headers)
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert isinstance(get_data, list)
    assert len(get_data) >= 1
    # Check that our created comment is there
    comments = [item["comment"] for item in get_data]
    assert "Excellent product!" in comments

    # 3. Get feedback for non-existent survey (should return 404)
    non_existent_id = str(uuid.uuid4())
    error_response = client.get(f"/feedback/survey/{non_existent_id}", headers=auth_headers)
    assert error_response.status_code == 404
