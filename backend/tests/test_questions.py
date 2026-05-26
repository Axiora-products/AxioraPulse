from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_questions(auth_headers):

    response = client.get(
        "/surveys/e0cd2144-b592-4e3a-92a4-9e78eccbe9e9/questions",
        headers=auth_headers
    )

    assert response.status_code == 200