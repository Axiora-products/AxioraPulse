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
