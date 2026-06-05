from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_dashboard_stats(auth_headers):
    response = client.get("/dashboard/stats", headers=auth_headers)

    assert response.status_code == 200


def test_dashboard_recent(auth_headers):
    response = client.get("/dashboard/recent", headers=auth_headers)

    assert response.status_code == 200
