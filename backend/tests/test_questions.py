from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_questions(auth_headers):
    # Create a survey first to get a valid survey_id
    create_res = client.post("/surveys/", json={"title": "Test Survey"}, headers=auth_headers)
    assert create_res.status_code == 201
    survey_id = create_res.json()["id"]

    response = client.get(f"/surveys/{survey_id}/questions", headers=auth_headers)

    assert response.status_code == 200
