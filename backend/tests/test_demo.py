from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_schedule_demo(monkeypatch):
    import routes.demo

    class MockResponse:
        def __init__(self, json_data, status_code=200):
            self.json_data = json_data
            self.status_code = status_code

        def json(self):
            return self.json_data

    def mock_post(url, *args, **kwargs):
        if "zoom.us/oauth/token" in url:
            return MockResponse({"access_token": "mocked_zoom_access_token"})
        elif "api.zoom.us/v2/users/me/meetings" in url:
            return MockResponse({"join_url": "https://zoom.us/j/mocked_meeting_id", "id": 123456789})
        return MockResponse({})

    # Monkeypatch requests.post in routes.demo
    monkeypatch.setattr(routes.demo.requests, "post", mock_post)

    payload = {
        "name": "Demo User",
        "email": "demouser@example.com",
        "demo_date": "2026-06-10",
        "time_slot": "10:00 AM - 11:00 AM",
    }

    response = client.post("/demo/schedule", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Demo scheduled successfully"
    assert data["zoom_join_url"] == "https://zoom.us/j/mocked_meeting_id"
    assert data["meeting_id"] == "123456789"
