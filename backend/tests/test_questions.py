from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_questions(auth_headers):
    # 1. Create a survey first
    survey_payload = {
        "title": "Test Questions Survey",
        "description": "Test description",
        "questions": [
            {"question_text": "Is this a test question?", "question_type": "yes_no"},
            {"question_text": "Please rate our service", "question_type": "scale"},
        ],
    }
    create_response = client.post("/surveys/", json=survey_payload, headers=auth_headers)
    assert create_response.status_code == 201
    survey_id = create_response.json()["id"]

    # 2. Get the questions of the created survey
    response = client.get(f"/surveys/{survey_id}/questions", headers=auth_headers)

    assert response.status_code == 200
    questions = response.json()
    assert len(questions) == 2
    assert questions[0]["question_text"] == "Is this a test question?"
