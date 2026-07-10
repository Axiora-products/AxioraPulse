import pytest
import requests

from services.email_service import send_email


def test_send_email_posts_to_resend(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "resend-api-key")
    monkeypatch.setenv("EMAIL_FROM", "Sender <sender@example.com>")
    captured = {}

    class MockResponse:
        def raise_for_status(self):
            return None

    def mock_post(url, json, headers, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        captured["timeout"] = timeout
        return MockResponse()

    monkeypatch.setattr("services.email_service.requests.post", mock_post)

    send_email("to@example.com", "Subject", "<p>Hello</p>")

    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["json"] == {
        "from": "Sender <sender@example.com>",
        "to": ["to@example.com"],
        "subject": "Subject",
        "html": "<p>Hello</p>",
    }
    assert captured["headers"]["Authorization"] == "Bearer resend-api-key"
    assert captured["timeout"] == 10


def test_send_email_raises_resend_message(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "resend-api-key")

    class MockResponse:
        def raise_for_status(self):
            raise requests.exceptions.HTTPError("bad request")

        def json(self):
            return {"message": "domain not verified"}

    monkeypatch.setattr("services.email_service.requests.post", lambda *args, **kwargs: MockResponse())

    with pytest.raises(Exception, match="Resend API error: domain not verified"):
        send_email("to@example.com", "Subject", "<p>Hello</p>")


def test_send_email_raises_request_error_when_response_body_unavailable(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "resend-api-key")

    class MockResponse:
        def raise_for_status(self):
            raise requests.exceptions.Timeout("timed out")

        def json(self):
            raise ValueError("not json")

    monkeypatch.setattr("services.email_service.requests.post", lambda *args, **kwargs: MockResponse())

    with pytest.raises(Exception, match="Resend API error: timed out"):
        send_email("to@example.com", "Subject", "<p>Hello</p>")
