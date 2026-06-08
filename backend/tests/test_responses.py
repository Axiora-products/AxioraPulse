from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"
QUESTION_ID = "a7803c3b-0c7d-4414-b474-f10ddc9086c5"


def test_submit_response(auth_headers):
    # 1. Create a survey first
    survey_payload = {
        "title": "Test Response Survey",
        "description": "Test description",
        "questions": [
            {"question_text": "Is this a test question?", "question_type": "yes_no"},
            {"question_text": "Please rate our service", "question_type": "scale"},
        ],
    }
    create_response = client.post("/surveys/", json=survey_payload, headers=auth_headers)
    assert create_response.status_code == 201
    survey_id = create_response.json()["id"]

    # 2. Submit a response to the created survey
    payload = {"survey_id": survey_id}
    response = client.post("/responses/", json=payload)
    assert response.status_code == 201
    data = response.json()
    response_id = data["id"]
    session_token = data["session_token"]
    assert response_id is not None
    assert session_token is not None

    # 2. Get session by token
    get_session = client.get(f"/responses/session/{session_token}")
    assert get_session.status_code == 200
    assert get_session.json()["id"] == response_id

    # 3. Get session by ID
    get_by_id = client.get(f"/responses/{response_id}")
    assert get_by_id.status_code == 200
    assert get_by_id.json()["session_token"] == session_token

    # 4. Update response details
    update_payload = {"respondent_email": "updated_respondent@example.com"}
    update_resp = client.patch(f"/responses/{response_id}", json=update_payload)
    assert update_resp.status_code == 200
    assert update_resp.json()["respondent_email"] == "updated_respondent@example.com"

    # 5. Submit answers for questions
    answers_payload = [{"question_id": QUESTION_ID, "answer_value": "5"}]
    answers_resp = client.post(f"/responses/{response_id}/answers", json=answers_payload)
    assert answers_resp.status_code == 200
    assert answers_resp.json()["count"] == 1

    # 6. Submit the response (complete survey)
    submit_resp = client.post(f"/responses/{response_id}/submit")
    assert submit_resp.status_code == 200
    assert submit_resp.json()["message"] == "Response submitted successfully"
    # Verify status via GET
    get_by_id = client.get(f"/responses/{response_id}")
    assert get_by_id.json()["status"] == "completed"

    # 7. Create another session and abandon it
    response2 = client.post("/responses/", json={"survey_id": SURVEY_ID})
    assert response2.status_code == 201
    response_id2 = response2.json()["id"]

    abandon_resp = client.post(f"/responses/{response_id2}/abandon")
    assert abandon_resp.status_code == 200
    assert abandon_resp.json()["message"] == "Response marked as abandoned"
    # Verify status via GET
    get_by_id2 = client.get(f"/responses/{response_id2}")
    assert get_by_id2.json()["status"] == "abandoned"
