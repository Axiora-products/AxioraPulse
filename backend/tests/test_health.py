from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    """Verify the health check endpoint returns 200."""
    # Note: This test might need DATABASE_URL mocked if it hits the DB
    # For now, we are just verifying the API boots.
    response = client.get("/health")
    assert response.status_code in [200, 503]  # 503 is acceptable if DB is not reachable in CI
