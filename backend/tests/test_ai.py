import json
from unittest.mock import MagicMock

from fastapi import HTTPException as FastHTTPException
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"


def test_ai_ping():
    response = client.get("/ai/ping")
    assert response.status_code == 200
    assert response.json()["status"] == "AI router is alive"


def test_get_survey_insights(auth_headers):
    response = client.get(f"/ai/surveys/{SURVEY_ID}/insights", headers=auth_headers)
    # The endpoint might return 200 (if insights exist/mocked) or 404/empty depending on responses
    assert response.status_code in (200, 404)


def test_get_survey_insights_status_not_found(auth_headers):
    """Status endpoint 404s for an unknown survey (covers the not-found branch)."""
    missing_id = "00000000-0000-0000-0000-000000000000"
    response = client.get(f"/ai/surveys/{missing_id}/insights/status", headers=auth_headers)
    assert response.status_code == 404


def test_get_survey_insights_status_envelope(auth_headers):
    """Status endpoint returns the freshness envelope for a known survey."""
    response = client.get(f"/ai/surveys/{SURVEY_ID}/insights/status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Envelope is returned whether or not an analysis has been cached yet.
    assert data["threshold"] == 50
    assert data["needsRefresh"] in (True, False)
    assert "insights" in data
    assert "currentResponses" in data


def test_post_ai_insights(auth_headers):
    payload = {
        "surveyTitle": "Customer Satisfaction",
        "responses": {"q1": "Great service!"},
        "questionSummaries": [{"id": "q1", "text": "Feedback"}],
    }
    response = client.post("/ai/insights", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "executiveSummary" in response.json()


def test_post_ai_generate(auth_headers):
    payload = {
        "aiContext": "A customer feedback survey for a coffee shop",
        "mode": "conversational",
        "engagementGoals": "Gather customer satisfaction details",
    }
    response = client.post("/ai/generate", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "questions" in response.json()


def test_post_ai_suggestions(auth_headers):
    payload = {
        "surveyTitle": "Coffee Shop Survey",
        "surveyDescription": "Feedback from customers",
        "existingQuestions": [{"text": "Do you like the food?"}],
        "aiContext": "Make it friendly",
    }
    response = client.post("/ai/suggestions", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "suggestions" in response.json()


def test_post_survey_intelligence(auth_headers):
    payload = {
        "surveyTitle": "Employee Attrition Analysis",
        "surveyDescription": "Understanding why employees leave",
        "existingQuestions": [{"text": "Why are you leaving?"}],
        "aiContext": "Compare against general IT sector data",
    }
    response = client.post("/ai/survey-intelligence", json=payload, headers=auth_headers)
    assert response.status_code == 200


def test_translate_survey(auth_headers):
    payload = {
        "title": "Welcome Survey",
        "description": "Please fill this in",
        "welcome_message": "Hello",
        "thank_you_message": "Goodbye",
        "questions": [{"text": "How are you?"}],
        "language": "spanish",
    }
    response = client.post("/ai/translate-survey", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "translated_text" in response.json()


def test_post_ai_insights_normalization_branches(auth_headers, monkeypatch):
    """Cover normalization branches: missing top-level fields, overallScore clamping,
    sentimentBreakdown dict, string insight/action items, and all optional arrays."""
    import routes.ai

    rich = json.dumps(
        {
            # Omit executiveSummary/insights/topStrengths/improvementAreas/recommendedActions
            # → triggers the "if X not in result_json" defaults (lines 792-800)
            "overallScore": 150,  # clamped to 100 (lines 805-808)
            "sentimentBreakdown": {
                "positive": 60,
                "neutral": 30,
                "negative": 10,
                "overall": "positive",
            },  # line 813
            "insights": ["string insight"],  # string path lines 832-833
            "recommendedActions": ["string action"],  # string path lines 854-855
            "keyThemes": [
                {
                    "theme": "T1",
                    "frequency": "65%",
                    "sentiment": "positive",
                    "quotes": [],
                    "relatedQuestions": [],
                }
            ],  # lines 867-868
            "crossQuestionPatterns": [
                {"pattern": "P1", "questions": ["Q1"], "significance": "high", "detail": "d"}
            ],  # lines 882-883
            "respondentSegments": [
                {
                    "segment": "S1",
                    "size": "40%",
                    "characteristics": "tech savvy",
                    "sentiment": "positive",
                    "keyDifference": "diff",
                }
            ],  # lines 896-897
            "urgencyMatrix": [
                {"issue": "I1", "urgency": "high", "impact": "medium", "evidence": "ev"}
            ],  # lines 911-912
            "benchmarkComparison": [
                {"metric": "M1", "value": "75%", "benchmark": "80%", "status": "below", "context": "ctx"}
            ],  # lines 925-926
            "dataQualityFlags": [
                {"flag": "F1", "severity": "warning", "detail": "d", "suggestion": "fix"}
            ],  # lines 940-941
        }
    )
    monkeypatch.setattr(routes.ai, "call_ai_sync", MagicMock(return_value=rich))
    payload = {"surveyTitle": "T", "responses": {}, "questionSummaries": []}
    response = client.post("/ai/insights", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["overallScore"] == 100  # clamped


def test_post_ai_insights_http_exception_reraise(auth_headers, monkeypatch):
    """HTTPException raised by call_ai_sync must propagate (line 956-957)."""
    import routes.ai

    monkeypatch.setattr(
        routes.ai,
        "call_ai_sync",
        MagicMock(side_effect=FastHTTPException(status_code=503, detail="AI down")),
    )
    payload = {"surveyTitle": "T", "responses": {}, "questionSummaries": []}
    response = client.post("/ai/insights", json=payload, headers=auth_headers)
    assert response.status_code == 503


def test_post_ai_generate_http_exception_reraise(auth_headers, monkeypatch):
    """HTTPException from call_ai_sync propagates through generate endpoint (lines 1111-1112)."""
    import routes.ai

    monkeypatch.setattr(
        routes.ai,
        "call_ai_sync",
        MagicMock(side_effect=FastHTTPException(status_code=503, detail="AI down")),
    )
    # aiContext must clear content moderation (>= 10 chars, benign) before the
    # handler is reached, so the mocked call_ai_sync's 503 can propagate.
    response = client.post(
        "/ai/generate", json={"aiContext": "Customer feedback survey for a coffee shop"}, headers=auth_headers
    )
    assert response.status_code == 503


def test_post_ai_suggestions_http_exception_reraise(auth_headers, monkeypatch):
    """HTTPException from call_ai_sync propagates through suggestions endpoint (lines 1163-1164)."""
    import routes.ai

    monkeypatch.setattr(
        routes.ai,
        "call_ai_sync",
        MagicMock(side_effect=FastHTTPException(status_code=503, detail="AI down")),
    )
    payload = {"surveyTitle": "T", "surveyDescription": "D", "existingQuestions": []}
    response = client.post("/ai/suggestions", json=payload, headers=auth_headers)
    assert response.status_code == 503


def test_post_survey_intelligence_http_exception_reraise(auth_headers, monkeypatch):
    """HTTPException from call_ai_sync propagates through survey-intelligence (lines 1320-1321)."""
    import routes.ai

    monkeypatch.setattr(
        routes.ai,
        "call_ai_sync",
        MagicMock(side_effect=FastHTTPException(status_code=503, detail="AI down")),
    )
    payload = {"surveyTitle": "T", "surveyDescription": "D", "existingQuestions": []}
    response = client.post("/ai/survey-intelligence", json=payload, headers=auth_headers)
    assert response.status_code == 503


def test_social_share_content_success(auth_headers, monkeypatch):
    import routes.ai
    from db.models import Survey
    from unittest.mock import patch

    mock_survey = MagicMock(spec=Survey)
    mock_survey.title = "Test Survey Title"
    mock_survey.description = "Test description"
    mock_q = MagicMock()
    mock_q.question_text = "What is your feedback?"
    mock_q.question_type.value = "short_text"
    mock_survey.questions = [mock_q]

    mock_query = MagicMock()
    mock_query.options.return_value.filter.return_value.first.return_value = mock_survey

    mock_response = json.dumps(
        {
            "description": "This is a test AI survey description.",
            "tagline": "A punchy tagline",
            "hashtags": ["#TestSurvey", "", "#Feedback"],
            "captions": {
                "linkedin": "LinkedIn: [link] #Feedback",
                "twitter": "Twitter: [link] #Feedback",
                "instagram": "Instagram: [link] #Feedback",
                "whatsapp": "WhatsApp: [link]",
                "telegram": "Telegram: [link]",
                "facebook": "Facebook: [link]",
            },
        }
    )
    monkeypatch.setattr(routes.ai, "call_ai_sync", MagicMock(return_value=mock_response))

    with patch("sqlalchemy.orm.Session.query", return_value=mock_query):
        payload = {"survey_id": SURVEY_ID}
        response = client.post("/ai/social-share-content", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["fallback_used"] is False
        assert data["description"] == "This is a test AI survey description."
        assert data["tagline"] == "A punchy tagline"
        assert data["hashtags"] == ["#TestSurvey", "#Feedback"]
        assert data["captions"]["linkedin"] == "LinkedIn: [link] #Feedback"


def test_social_share_content_ai_invalid_hashtags(auth_headers, monkeypatch):
    import routes.ai
    from db.models import Survey
    from unittest.mock import patch

    mock_survey = MagicMock(spec=Survey)
    mock_survey.title = "Test Survey Title"
    mock_survey.description = "Test description"
    mock_survey.questions = []

    mock_query = MagicMock()
    mock_query.options.return_value.filter.return_value.first.return_value = mock_survey

    mock_response = json.dumps(
        {
            "description": "This is a test AI survey description.",
            "tagline": "A punchy tagline",
            "hashtags": "invalid-string-not-list",
            "captions": {
                "linkedin": "LinkedIn: [link] #Feedback",
                "twitter": "Twitter: [link] #Feedback",
                "instagram": "Instagram: [link] #Feedback",
                "whatsapp": "WhatsApp: [link]",
                "telegram": "Telegram: [link]",
                "facebook": "Facebook: [link]",
            },
        }
    )
    monkeypatch.setattr(routes.ai, "call_ai_sync", MagicMock(return_value=mock_response))

    with patch("sqlalchemy.orm.Session.query", return_value=mock_query):
        payload = {"survey_id": SURVEY_ID}
        response = client.post("/ai/social-share-content", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["fallback_used"] is False
        assert data["hashtags"] == []


def test_social_share_content_fallback_no_desc(auth_headers, monkeypatch):
    import routes.ai
    from db.models import Survey
    from unittest.mock import patch

    mock_survey = MagicMock(spec=Survey)
    mock_survey.title = "Test Survey Title"
    mock_survey.description = None
    mock_survey.questions = []

    mock_query = MagicMock()
    mock_query.options.return_value.filter.return_value.first.return_value = mock_survey

    monkeypatch.setattr(routes.ai, "call_ai_sync", MagicMock(side_effect=Exception("AI error")))

    with patch("sqlalchemy.orm.Session.query", return_value=mock_query):
        payload = {"survey_id": SURVEY_ID}
        response = client.post("/ai/social-share-content", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["fallback_used"] is True
        assert (
            data["description"]
            == "A survey about Test Survey Title. Your opinion matters — take a few minutes to respond!"
        )


def test_social_share_content_not_found(auth_headers, monkeypatch):
    from unittest.mock import patch

    mock_query = MagicMock()
    mock_query.options.return_value.filter.return_value.first.return_value = None

    with patch("sqlalchemy.orm.Session.query", return_value=mock_query):
        payload = {"survey_id": "00000000-0000-0000-0000-000000000000"}
        response = client.post("/ai/social-share-content", json=payload, headers=auth_headers)
        assert response.status_code == 404


def test_download_image_success():
    payload = {
        "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "filename": "custom-card.png",
    }
    response = client.post("/ai/download-image", data=payload)
    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == 'attachment; filename="custom-card.png"'
    assert response.headers["content-type"] == "image/png"


def test_download_image_invalid():
    payload = {"image": "invalid-image-data-no-comma", "filename": "custom-card.png"}
    response = client.post("/ai/download-image", data=payload)
    assert response.status_code == 400

    payload_bad_b64 = {"image": "data:image/png;base64,invalid!!!b64", "filename": "custom-card.png"}
    response = client.post("/ai/download-image", data=payload_bad_b64)
    assert response.status_code == 400


def test_download_qr_success(monkeypatch):
    import requests

    mock_res = MagicMock()
    mock_res.content = b"fake-qr-code-bytes"
    mock_res.raise_for_status.return_value = None
    monkeypatch.setattr(requests, "get", MagicMock(return_value=mock_res))

    response = client.get("/ai/download-qr?url=https://quickchart.io/qr?text=hello&filename=qr.png")
    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == 'attachment; filename="qr.png"'
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"fake-qr-code-bytes"


def test_download_qr_disallowed_host():
    response = client.get("/ai/download-qr?url=https://malicious.com/qr?text=hello&filename=qr.png")
    assert response.status_code == 400
    assert "disallowed" in response.json()["detail"].lower()

    response_http = client.get("/ai/download-qr?url=http://quickchart.io/qr?text=hello&filename=qr.png")
    assert response_http.status_code == 400


def test_download_qr_failure(monkeypatch):
    import requests

    monkeypatch.setattr(requests, "get", MagicMock(side_effect=Exception("Connection timed out")))
    response = client.get("/ai/download-qr?url=https://quickchart.io/qr?text=hello&filename=qr.png")
    assert response.status_code == 400
    assert "failed" in response.json()["detail"].lower()
