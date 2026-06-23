from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_ok():
    """/health returns 200 + healthy status when the DB is reachable."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


def test_root():
    """/ returns the running message."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Axiora Pulse API is running" in resp.json()["message"]
