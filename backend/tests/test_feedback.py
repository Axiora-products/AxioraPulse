from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_submit_response(auth_headers):
    response = client.get("/surveys/", headers=auth_headers)

    assert response.status_code == 200
