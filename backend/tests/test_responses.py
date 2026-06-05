from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_submit_response(auth_headers):
    # Create a survey first to get a valid survey_id
    create_res = client.post("/surveys/", json={"title": "Test Survey"}, headers=auth_headers)
    assert create_res.status_code == 201
    survey_id = create_res.json()["id"]

    payload = {"survey_id": survey_id}

    response = client.post("/responses/", json=payload, headers=auth_headers)

    assert response.status_code in [200, 201]
