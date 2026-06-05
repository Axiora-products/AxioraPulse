from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_submit_response(auth_headers):
    # 1. Create a survey first
    survey_payload = {
        "title": "Test Response Survey",
        "description": "Test description",
        "questions": [
            {
                "question_text": "Is this a test question?",
                "question_type": "yes_no"
            },
            {
                "question_text": "Please rate our service",
                "question_type": "scale"
            }
        ]
    }
    create_response = client.post(
        "/surveys/",
        json=survey_payload,
        headers=auth_headers
    )
    assert create_response.status_code == 201
    survey_id = create_response.json()["id"]

    # 2. Submit a response to the created survey
    payload = {
        "survey_id": survey_id
    }

    response = client.post(
        "/responses/",
        json=payload,
        headers=auth_headers
    )

    assert response.status_code in [200, 201]