from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_unauthorized_access():

    response = client.get("/dashboard/stats")

    assert response.status_code == 401


def test_invalid_token():

    response = client.get("/dashboard/stats", headers={"Authorization": "Bearer invalidtoken"})

    assert response.status_code == 401


def test_authorized_access(auth_headers):

    response = client.get("/dashboard/stats", headers=auth_headers)

    assert response.status_code == 200
