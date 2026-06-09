from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"


def test_list_surveys(auth_headers):
    response = client.get("/surveys/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_survey(auth_headers):
    payload = {
        "title": "New Test Survey",
        "description": "Testing survey creation",
        "questions": [
            {
                "question_text": "Is this working?",
                "question_type": "rating",
                "is_required": True,
                "options": [1, 2, 3, 4, 5],
                "sort_order": 1,
            }
        ],
    }
    response = client.post("/surveys/", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "New Test Survey"
    assert "id" in data


def test_get_survey_by_id(auth_headers):
    response = client.get(f"/surveys/{SURVEY_ID}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == SURVEY_ID


def test_get_survey_by_slug():
    response = client.get("/surveys/slug/test-survey")
    assert response.status_code == 200
    assert response.json()["slug"] == "test-survey"


def test_update_survey(auth_headers):
    payload = {
        "title": "Updated Test Survey Title",
        "status": "draft",
        "questions": [
            {"question_text": "Updated question?", "question_type": "short_text", "is_required": False, "sort_order": 1}
        ],
    }
    # Uses PATCH instead of PUT
    response = client.patch(f"/surveys/{SURVEY_ID}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Test Survey Title"


def test_get_questions(auth_headers):
    response = client.get(f"/surveys/{SURVEY_ID}/questions", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_duplicate_survey(auth_headers):
    response = client.post(f"/surveys/{SURVEY_ID}/duplicate", headers=auth_headers)
    assert response.status_code == 201
    assert "id" in response.json()
    assert response.json()["title"] == "Copy of Updated Test Survey Title"


def test_share_survey(auth_headers):
    # Fetch team members first to get a valid user UUID
    list_users = client.get("/users/", headers=auth_headers)
    assert list_users.status_code == 200
    user_id = list_users.json()[0]["id"]

    payload = {"shared_with": user_id, "permission": "editor"}
    # Share survey path ends with /shares
    response = client.post(f"/surveys/{SURVEY_ID}/shares", json=payload, headers=auth_headers)
    assert response.status_code == 200
    share_id = response.json().get("id")

    # Get shares
    get_shares = client.get(f"/surveys/{SURVEY_ID}/shares", headers=auth_headers)
    assert get_shares.status_code == 200

    # Revoke share
    if share_id:
        revoke = client.delete(f"/surveys/{SURVEY_ID}/shares/{share_id}", headers=auth_headers)
        assert revoke.status_code == 200


def test_get_survey_responses_and_answers(auth_headers):
    resp = client.get(f"/surveys/{SURVEY_ID}/responses", headers=auth_headers)
    assert resp.status_code == 200

    ans = client.get(f"/surveys/{SURVEY_ID}/answers", headers=auth_headers)
    assert ans.status_code == 200


def test_survey_feedback(auth_headers):
    # Get feedback
    fb_get = client.get(f"/surveys/{SURVEY_ID}/feedback", headers=auth_headers)
    assert fb_get.status_code == 200

    # Create feedback
    fb_payload = {"feedback_text": "Great survey!", "rating": 5}
    fb_post = client.post(f"/surveys/{SURVEY_ID}/feedback", json=fb_payload, headers=auth_headers)
    assert fb_post.status_code == 200
