import uuid
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

    # 3. Get session by ID — respondent proves ownership with the session token (?st=).
    # The bare response_id alone must NOT grant access (AP-SEC-003).
    get_by_id = client.get(f"/responses/{response_id}?st={session_token}")
    assert get_by_id.status_code == 200
    assert get_by_id.json()["session_token"] == session_token

    # 4. Update response details (incl. country/state demographics)
    update_payload = {
        "respondent_email": "updated_respondent@example.com",
        "country": "India",
        "state": "Telangana",
    }
    update_resp = client.patch(f"/responses/{response_id}?st={session_token}", json=update_payload)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["respondent_email"] == "updated_respondent@example.com"
    assert updated["country"] == "India"
    assert updated["state"] == "Telangana"

    # 5. Submit answers for questions
    answers_payload = [{"question_id": QUESTION_ID, "answer_value": "5"}]
    answers_resp = client.post(f"/responses/{response_id}/answers?st={session_token}", json=answers_payload)
    assert answers_resp.status_code == 200
    assert answers_resp.json()["count"] == 1

    # 6. Submit the response (complete survey)
    submit_resp = client.post(f"/responses/{response_id}/submit?st={session_token}")
    assert submit_resp.status_code == 200
    assert submit_resp.json()["message"] == "Response submitted successfully"
    # Verify status via GET
    get_by_id = client.get(f"/responses/{response_id}?st={session_token}")
    assert get_by_id.json()["status"] == "completed"

    # 7. Create another session and abandon it
    response2 = client.post("/responses/", json={"survey_id": SURVEY_ID})
    assert response2.status_code == 201
    data2 = response2.json()
    response_id2 = data2["id"]
    session_token2 = data2["session_token"]

    abandon_resp = client.post(f"/responses/{response_id2}/abandon?st={session_token2}")
    assert abandon_resp.status_code == 200
    assert abandon_resp.json()["message"] == "Response marked as abandoned"
    # Verify status via GET
    get_by_id2 = client.get(f"/responses/{response_id2}?st={session_token2}")
    assert get_by_id2.json()["status"] == "abandoned"


def test_response_language_tracking(auth_headers):
    # 1. Create a survey first
    survey_payload = {
        "title": "Language Test Survey",
        "questions": [{"question_text": "Is this working?", "question_type": "yes_no"}],
    }
    create_survey_resp = client.post("/surveys/", json=survey_payload, headers=auth_headers)
    assert create_survey_resp.status_code == 201
    survey_id = create_survey_resp.json()["id"]

    # 2. Create response with default language (en)
    payload = {"survey_id": survey_id, "session_token": "lang-session-123", "language": "en"}
    response = client.post("/responses/", json=payload)
    assert response.status_code == 201
    assert response.json()["language"] == "en"

    # 3. Request creation again with the same session_token and different language (hi)
    payload_again = {"survey_id": survey_id, "session_token": "lang-session-123", "language": "hi"}
    response_again = client.post("/responses/", json=payload_again)
    assert response_again.status_code == 201
    assert response_again.json()["language"] == "hi"

    # 4. Update language to 'te' via PATCH (respondent proves ownership via ?st=)
    rid = response_again.json()["id"]
    update_payload = {"language": "te"}
    update_resp = client.patch(f"/responses/{rid}?st=lang-session-123", json=update_payload)
    assert update_resp.status_code == 200
    assert update_resp.json()["language"] == "te"

    # 5. Test with an invalid language (should default to en)
    update_payload_invalid = {"language": "fr"}
    update_resp_invalid = client.patch(f"/responses/{rid}?st=lang-session-123", json=update_payload_invalid)
    assert update_resp_invalid.status_code == 200
    assert update_resp_invalid.json()["language"] == "en"


def test_response_source_tracking():
    # Acquisition source is captured + normalized on the response row.
    # Unique session tokens guarantee a fresh row each run (no dedup early-return).
    suffix = uuid.uuid4().hex

    # 1. An explicit channel source is stored as-is.
    r1 = client.post(
        "/responses/", json={"survey_id": SURVEY_ID, "session_token": f"src-wa-{suffix}", "source": "whatsapp"}
    )
    assert r1.status_code == 201
    assert r1.json()["source"] == "whatsapp"

    # 2. Generic link/copy variants normalize to 'direct'.
    r2 = client.post(
        "/responses/", json={"survey_id": SURVEY_ID, "session_token": f"src-link-{suffix}", "source": "link"}
    )
    assert r2.status_code == 201
    assert r2.json()["source"] == "direct"

    # 3. A missing source defaults to 'direct'.
    r3 = client.post("/responses/", json={"survey_id": SURVEY_ID, "session_token": f"src-none-{suffix}"})
    assert r3.status_code == 201
    assert r3.json()["source"] == "direct"
