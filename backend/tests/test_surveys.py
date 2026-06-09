from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
SURVEY_ID = "e0cd2144-b592-4e3a-92a4-9e78eccbe9e9"


def test_list_surveys(auth_headers):
    response = client.get("/surveys/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_survey(auth_headers):
    payload = {
        "title": "New Test Survey",
        "description": "Testing survey creation",
        "questions": [
            {
                "question_text": "Is this working?",
                "question_type": "rating",
                "is_required": True,
                "options": [1, 2, 3, 4, 5],
                "sort_order": 1,
            }
        ],
    }
    response = client.post("/surveys/", json=payload, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "New Test Survey"
    assert "id" in data


def test_get_survey_by_id(auth_headers):
    response = client.get(f"/surveys/{SURVEY_ID}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == SURVEY_ID


def test_get_survey_by_slug():
    response = client.get("/surveys/slug/test-survey")
    assert response.status_code == 200
    assert response.json()["slug"] == "test-survey"


def test_update_survey(auth_headers):
    payload = {
        "title": "Updated Test Survey Title",
        "status": "draft",
        "questions": [
            {"question_text": "Updated question?", "question_type": "short_text", "is_required": False, "sort_order": 1}
        ],
    }
    # Uses PATCH instead of PUT
    response = client.patch(f"/surveys/{SURVEY_ID}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Updated Test Survey Title"


def test_get_questions(auth_headers):
    response = client.get(f"/surveys/{SURVEY_ID}/questions", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_duplicate_survey(auth_headers):
    response = client.post(f"/surveys/{SURVEY_ID}/duplicate", headers=auth_headers)
    assert response.status_code == 201
    assert "id" in response.json()
    assert response.json()["title"] == "Copy of Updated Test Survey Title"


def test_share_survey(auth_headers):
    # Fetch team members first to get a valid user UUID
    list_users = client.get("/users/", headers=auth_headers)
    assert list_users.status_code == 200
    user_id = list_users.json()[0]["id"]

    payload = {"shared_with": user_id, "permission": "editor"}
    # Share survey path ends with /shares
    response = client.post(f"/surveys/{SURVEY_ID}/shares", json=payload, headers=auth_headers)
    assert response.status_code == 200
    share_id = response.json().get("id")

    # Get shares
    get_shares = client.get(f"/surveys/{SURVEY_ID}/shares", headers=auth_headers)
    assert get_shares.status_code == 200

    # Revoke share
    if share_id:
        revoke = client.delete(f"/surveys/{SURVEY_ID}/shares/{share_id}", headers=auth_headers)
        assert revoke.status_code == 200


def test_get_survey_responses_and_answers(auth_headers):
    resp = client.get(f"/surveys/{SURVEY_ID}/responses", headers=auth_headers)
    assert resp.status_code == 200

    ans = client.get(f"/surveys/{SURVEY_ID}/answers", headers=auth_headers)
    assert ans.status_code == 200


def test_survey_feedback(auth_headers):
    # Get feedback
    fb_get = client.get(f"/surveys/{SURVEY_ID}/feedback", headers=auth_headers)
    assert fb_get.status_code == 200

    # Create feedback
    fb_payload = {"feedback_text": "Great survey!", "rating": 5}
    fb_post = client.post(f"/surveys/{SURVEY_ID}/feedback", json=fb_payload, headers=auth_headers)
    assert fb_post.status_code == 200


def test_survey_localization_helper_methods(auth_headers):
    from unittest.mock import patch, MagicMock

    # 1. Create a survey with all question types and localized inputs (matrix, list options, descriptions, etc.)
    survey_payload = {
        "title": "Localization Survey",
        "description": "Please help translate this.",
        "welcome_message": "Welcome!",
        "thank_you_message": "Thank you!",
        "questions": [
            {
                "question_text": "Matrix question",
                "question_type": "matrix",
                "is_required": True,
                "options": {
                    "rows": [{"label": "Row 1", "value": "r1"}],
                    "columns": [{"label": "Col 1", "value": "c1"}],
                    "min_label": "Worst",
                    "max_label": "Best",
                },
                "sort_order": 1,
            },
            {
                "question_text": "Multiple choice",
                "question_type": "single_choice",
                "is_required": False,
                "options": [{"label": "Option A", "description": "Desc A"}],
                "sort_order": 2,
            },
        ],
    }

    create_resp = client.post("/surveys/", json=survey_payload, headers=auth_headers)
    assert create_resp.status_code == 201
    survey_data = create_resp.json()
    slug = survey_data["slug"]

    # 2. Mock google translate API response (happy path)
    mock_google_response = MagicMock()
    mock_google_response.json.return_value = [[["Translated text", "Original text", None, None, 3]]]
    mock_google_response.raise_for_status.return_value = None

    # We will patch requests.get to return this mock response
    with patch("requests.get", return_value=mock_google_response):
        # Fetching survey by slug triggers _localize_public_survey
        resp = client.get(f"/surveys/slug/{slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"]["te"] == "Translated text"
        assert data["title"]["hi"] == "Translated text"

    # 3. Mock google translate API throwing an exception
    from routes.surveys import _translate_with_google

    _translate_with_google.cache_clear()
    with patch("requests.get", side_effect=Exception("Translation connection failed")):
        # It should fallback to returning the original English text
        resp = client.get(f"/surveys/slug/{slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"]["te"] == "Localization Survey"
        assert data["title"]["hi"] == "Localization Survey"

    # 4. Mock Gemini/Generative API translation path (GEMINI_KEY does not start with "mock-")
    mock_gemini_api_response = MagicMock()
    mock_gemini_api_response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"translations": [{"en": "Localization Survey", "te": "Gemini Telugu", "hi": "Gemini Hindi"}]}'
                        }
                    ]
                }
            }
        ]
    }
    mock_gemini_api_response.raise_for_status.return_value = None

    with patch("os.getenv", side_effect=lambda key: "real-gemini-key" if key == "GEMINI_KEY" else None):
        with patch("requests.post", return_value=mock_gemini_api_response):
            resp = client.get(f"/surveys/slug/{slug}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["title"]["te"] == "Gemini Telugu"
            assert data["title"]["hi"] == "Gemini Hindi"


def test_survey_localization_helpers_direct():
    from routes.surveys import (
        _localized_text,
        _translate_texts,
        _collect_option_texts,
        _localize_options,
    )

    # 1. Test _localized_text
    # value is dict
    assert _localized_text({"en": "hello", "te": "namaste"}) == {
        "en": "hello",
        "te": "namaste",
        "hi": "hello",
    }
    # value is string
    assert _localized_text("world", {"te": "te-world", "hi": "hi-world"}) == {
        "en": "world",
        "te": "te-world",
        "hi": "hi-world",
    }

    # 2. Test _translate_texts with empty input
    assert _translate_texts([]) == {}

    # 3. Test _collect_option_texts
    # list input
    opts_list = [{"label": "Label 1", "description": "Desc 1"}, "invalid_item"]
    assert "Label 1" in _collect_option_texts(opts_list)
    assert "Desc 1" in _collect_option_texts(opts_list)

    # dict input (matrix format)
    opts_dict = {
        "rows": [{"label": "Row A"}],
        "columns": [{"label": "Col B"}],
        "min_label": "Min L",
        "max_label": "Max L",
    }
    collected = _collect_option_texts(opts_dict)
    assert "Row A" in collected
    assert "Col B" in collected
    assert "Min L" in collected
    assert "Max L" in collected

    # invalid option type
    assert _collect_option_texts(12345) == []

    # 4. Test _localize_options
    translations = {
        "Row A": {"te": "Row A Telugu", "hi": "Row A Hindi"},
        "Col B": {"te": "Col B Telugu", "hi": "Col B Hindi"},
        "Min L": {"te": "Min Telugu", "hi": "Min Hindi"},
        "Max L": {"te": "Max Telugu", "hi": "Max Hindi"},
        "Label 1": {"te": "Label 1 Telugu", "hi": "Label 1 Hindi"},
        "Desc 1": {"te": "Desc 1 Telugu", "hi": "Desc 1 Hindi"},
    }

    # list options localization
    loc_list = _localize_options(opts_list, translations)
    assert loc_list[0]["label"]["te"] == "Label 1 Telugu"
    assert loc_list[0]["description"]["hi"] == "Desc 1 Hindi"

    # dict options localization
    loc_dict = _localize_options(opts_dict, translations)
    assert loc_dict["rows"][0]["label"]["te"] == "Row A Telugu"
    assert loc_dict["columns"][0]["label"]["hi"] == "Col B Hindi"
    assert loc_dict["min_label"]["te"] == "Min Telugu"
    assert loc_dict["max_label"]["hi"] == "Max Hindi"

    # non-dict/list fallback
    assert _localize_options("plain_string", translations) == "plain_string"
