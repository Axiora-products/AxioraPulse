from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_submit_response(auth_headers):

    payload = {"survey_id": "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"}

    response = client.post("/responses/", json=payload, headers=auth_headers)

    assert response.status_code in [200, 201]
