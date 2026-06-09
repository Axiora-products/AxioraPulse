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
    response = client.post("/ai/generate", json={"aiContext": "test"}, headers=auth_headers)
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
