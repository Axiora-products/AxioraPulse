import pytest
import json
import uuid

TEST_TOKEN = "eyJraWQiOiJMWTdhWUp6bllSR292SHowVmk1TzlrZlhDbzVjQ1Z2QUdVd3NSQnhZRVVNPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmMWQzYWQ2YS01MDMxLTcwZDUtOWQ2YS01MDEzZWQ4N2U4ZDIiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGgtMV9XMUxTNGxHMFoiLCJjb2duaXRvOnVzZXJuYW1lIjoiZjFkM2FkNmEtNTAzMS03MGQ1LTlkNmEtNTAxM2VkODdlOGQyIiwib3JpZ2luX2p0aSI6IjE4MDBmMzQ5LWRlNTgtNDU1Yy1hYTg0LWIxZWFkYjAwZjdlNCIsImF1ZCI6IjY3N2hya2Fqb2xzdjVlbmtpZnM4M2lnZTcxIiwiZXZlbnRfaWQiOiI2N2UxYzc5NC1kOTQ4LTRlZGItYTRjYS1hMzJmNGNjN2FmZTYiLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTc3OTM2MjU1MywibmFtZSI6ImRlZXB0aGkiLCJleHAiOjE3NzkzNjYxNTMsImlhdCI6MTc3OTM2MjU1MywianRpIjoiZTdhMzJiNzAtYWQxYS00YThlLTg5YjktMWUyMmIyYmUxMGExIiwiZW1haWwiOiJkZWVwdGhpdXBhZGh5YXl1bGFAZ21haWwuY29tIn0.dSLvNS_UA38tsmM62yEe6adTwtrvNPg_S27IUe6Y_Xm-losmbGPWK1nJwCshTqPBTSyyhpLSgRAJ-OTf_ISsM5lV4RPYxTVZiYiC0jtTePezVUIa9tJ20SyKOYF5ZOax2_kCKLMwjLqpwQ8lZrFPaSxjE5ZGcXfheHPsn-vpIZ7YSJh9b9E33QhS6ZZyWXjbdOYd2UrpsFNDuweny6EzMl02agUolozLY0wxeKAuu8lAEUHFDRWxcSwJcsBVj1ukX1MvSiKIWGQPcYprYHPB4ZRg5XrSzP2qUTFDiYzqlXOha1SwC3WZ2sTlw87teFg1qanyburN0BTkqnzglboXRQ"


@pytest.fixture(autouse=True)
def mock_verify_cognito_token(monkeypatch):
    import cognito_utils
    import dependencies
    import routes.auth

    def mock_verify(token):
        if token == TEST_TOKEN:
            return {
                "sub": "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2",
                "email": "dev@axiorapulse.com",
                "name": "Developer User",
                "token_use": "id",
            }
        elif token == "invalidtoken":
            return None
        return None

    monkeypatch.setattr(cognito_utils, "verify_cognito_token", mock_verify)
    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)
    monkeypatch.setattr(routes.auth, "verify_cognito_token", mock_verify)


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


# --- Mock AI / Gemini ---
@pytest.fixture(autouse=True)
def mock_gemini(monkeypatch):
    import routes.ai
    import routes.investor

    monkeypatch.setenv("GEMINI_KEY", "mock_key_123")

    def mock_call_gemini(api_key: str, prompt: str, max_tokens: int = 2048) -> str:
        # Returns a JSON that contains all possible keys for all schemas (Insights, Generate, Suggestions, SurveyIntelligence)
        return json.dumps(
            {
                "sentiment": "positive",
                "insights": [{"type": "info", "title": "Mock Title", "detail": "Mock detail", "metric": "95%"}],
                "summary": "This is a mock AI summary.",
                "key_takeaways": ["Insight 1", "Insight 2"],
                "questions": [
                    {"text": "Mock Question 1", "type": "rating", "options": [1, 2, 3, 4, 5]},
                    {"text": "Mock Question 2", "type": "short_text"},
                ],
                "translated_text": "This is a mock translation of the survey.",
                "suggestions": [
                    {
                        "text": "Add a question about pricing.",
                        "type": "rating",
                        "options": [1, 2, 3, 4, 5],
                        "rationale": "Pricing info",
                    }
                ],
                "metrics": {"nps": 9, "csat": 5},
                "executiveSummary": "This is a mock executive summary.",
                "npsAnalysis": "This is a mock NPS analysis.",
                "topStrengths": ["Strength 1", "Strength 2"],
                "improvementAreas": ["Improvement 1", "Improvement 2"],
                "recommendedActions": [{"priority": "high", "action": "Action 1", "impact": "High impact"}],
                "title": "Mock Generated Title",
                "description": "Mock Generated Description",
                "welcome_message": "Mock Welcome",
                "thank_you_message": "Mock Thank You",
                "category": "Tech",
                "competitors": [
                    {
                        "name": "Competitor 1",
                        "offering": "Mock Offering",
                        "pricing": "Free",
                        "strengths": "Strong brand",
                        "weaknesses": "High price",
                        "diff": "Features",
                        "share": "10%",
                    }
                ],
                "persona": {
                    "name": "Persona 1",
                    "demographics": "Age 20-30",
                    "psychographics": "Tech savvy",
                    "painPoints": "Slow speed",
                    "buyingBehavior": "Online shopping",
                },
                "opportunities": [{"lane": "Opportunity 1", "description": "Expand features"}],
                "viabilityScore": 85,
                "roadmap": [
                    {
                        "name": "Phase 1",
                        "goals": "Build MVP",
                        "resources": "Dev team",
                        "timeline": "1 month",
                        "risks": "Delay",
                        "tools": "VS Code",
                        "cost": "Low",
                    }
                ],
            }
        )

    def mock_investor_call_gemini(*args, **kwargs):
        raise ValueError("Simulated Gemini error for fallback testing")

    monkeypatch.setattr(routes.ai, "_call_gemini", mock_call_gemini)
    monkeypatch.setattr(routes.investor, "_call_gemini", mock_investor_call_gemini)


# --- Mock Whisper Speech-to-Text ---
class MockWhisperModel:
    def transcribe(self, audio_path, **kwargs):
        return {"text": "This is a mocked audio transcription from Whisper.", "language": "en"}


@pytest.fixture(autouse=True)
def mock_whisper(monkeypatch):
    import routes.uploads

    def mock_get_model():
        return MockWhisperModel()

    monkeypatch.setattr(routes.uploads, "get_whisper_model", mock_get_model)


# --- Mock Google Drive SDK ---
class MockDriveFiles:
    def export_media(self, fileId, mimeType):
        class RequestMock:
            def execute(self):
                return b"mock file content"

        return RequestMock()

    def get_media(self, fileId):
        class RequestMock:
            def execute(self):
                return b"mock file content"

        return RequestMock()


class MockDriveService:
    def files(self):
        return MockDriveFiles()


@pytest.fixture(autouse=True)
def mock_google_drive(monkeypatch):
    import routes.uploads

    class DummyCredentials:
        def __init__(self, token):
            self.token = token

    def mock_build(serviceName, version, credentials=None):
        return MockDriveService()

    class MockMediaIoBaseDownload:
        def __init__(self, fh, request):
            self.fh = fh
            self.fh.write(b"mock drive download content")

        def next_chunk(self):
            return None, True

    # Monkeypatch where these are used inside routes.uploads
    monkeypatch.setattr(routes.uploads, "Credentials", DummyCredentials)
    monkeypatch.setattr(routes.uploads, "build", mock_build)
    monkeypatch.setattr(routes.uploads, "MediaIoBaseDownload", MockMediaIoBaseDownload)


# --- Mock Razorpay Client ---
class MockRazorpayOrder:
    def create(self, data):
        # Return a unique order ID using UUID to prevent unique key violation
        return {
            "id": f"order_mock_{uuid.uuid4().hex[:12]}",
            "amount": data["amount"],
            "currency": data["currency"],
            "status": "created",
        }


class MockRazorpayUtility:
    def verify_payment_signature(self, params):
        if params.get("razorpay_signature") == "invalid":
            import razorpay.errors

            raise razorpay.errors.SignatureVerificationError("Invalid signature")
        return True


class MockRazorpayClient:
    def __init__(self, auth=None):
        self.order = MockRazorpayOrder()
        self.utility = MockRazorpayUtility()


@pytest.fixture(autouse=True)
def mock_razorpay(monkeypatch):
    import routes.payments
    from core import config

    config.RAZORPAY_KEY_SECRET = "mock_secret"
    monkeypatch.setattr(routes.payments, "_razorpay_client", lambda: MockRazorpayClient())


# --- Mock AWS Cognito Client & Emails ---
class MockCognitoClient:
    def admin_create_user(self, **kwargs):
        return {
            "User": {
                "Username": kwargs.get("Username"),
                "Attributes": [{"Name": "sub", "Value": "mock-cognito-sub-123"}],
            }
        }

    def admin_delete_user(self, **kwargs):
        return {}

    def admin_set_user_password(self, **kwargs):
        return {}

    def admin_update_user_attributes(self, **kwargs):
        return {}


@pytest.fixture(autouse=True)
def mock_cognito_and_email(monkeypatch):
    import cognito_utils
    import services.email_service

    def mock_get_client():
        return MockCognitoClient()

    def mock_send_email(*args, **kwargs):
        return True

    monkeypatch.setattr(cognito_utils, "get_cognito_client", mock_get_client)
    monkeypatch.setattr(cognito_utils, "admin_delete_user", lambda sub: None)
    monkeypatch.setattr(services.email_service, "send_email", mock_send_email)


@pytest.fixture(scope="session", autouse=True)
def seed_test_data():
    from db.database import SessionLocal
    from db.models import Tenant, UserProfile, Survey, SurveyQuestion, SurveyStatusEnum, QuestionTypeEnum, Plan
    import uuid

    db = SessionLocal()
    try:
        # Create standard plans for payments testing
        plans = [
            {
                "id": uuid.UUID("3c7b3b3a-33c3-448c-9c76-f3b610c3b0f5"),
                "code": "basic",
                "name": "Basic",
                "price_paise": 2900,
                "billing_period": "monthly",
            },
            {
                "id": uuid.UUID("3c7b3b3a-33c3-448c-9c76-f3b610c3b0f6"),
                "code": "pro",
                "name": "Pro",
                "price_paise": 7900,
                "billing_period": "monthly",
            },
        ]
        for p_data in plans:
            existing = db.query(Plan).filter((Plan.id == p_data["id"]) | (Plan.code == p_data["code"])).first()
            if not existing:
                plan = Plan(
                    id=p_data["id"],
                    code=p_data["code"],
                    name=p_data["name"],
                    price_paise=p_data["price_paise"],
                    billing_period=p_data["billing_period"],
                    is_active=True,
                )
                db.add(plan)
        db.commit()

        # Create default Tenant if none exists
        tenant = db.query(Tenant).first()
        if not tenant:
            tenant = Tenant(
                id=uuid.UUID("d3b07384-d113-4956-a5cc-be150efb0f85"), name="Test Organisation", slug="test-org"
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        # Create default UserProfile if none exists
        user = (
            db.query(UserProfile)
            .filter(
                (UserProfile.cognito_sub == "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2")
                | (UserProfile.email == "dev@axiorapulse.com")
            )
            .first()
        )
        from db.models import RoleEnum

        if not user:
            user = UserProfile(
                id=uuid.UUID("f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2"),
                email="dev@axiorapulse.com",
                full_name="Developer User",
                cognito_sub="f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2",
                tenant_id=tenant.id,
                role=RoleEnum.admin,
                is_active=True,
                is_internal=True,
                account_status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.is_active = True
            user.role = RoleEnum.admin
            user.tenant_id = tenant.id
            user.is_internal = True
            if user.cognito_sub != "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2":
                user.cognito_sub = "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2"
            db.commit()
            db.refresh(user)

        # Create target Survey if not exists
        survey_id = uuid.UUID("e0cd2144-b592-4e3a-92a4-9e78eccbe9e9")
        survey = db.query(Survey).filter(Survey.id == survey_id).first()
        if not survey:
            survey = Survey(
                id=survey_id,
                title="Test Survey",
                slug="test-survey",
                status=SurveyStatusEnum.active,
                tenant_id=tenant.id,
                created_by=user.id,
            )
            db.add(survey)
            db.commit()
            db.refresh(survey)
        else:
            survey.tenant_id = tenant.id
            survey.created_by = user.id
            survey.status = SurveyStatusEnum.active
            survey.title = "Test Survey"
            survey.slug = "test-survey"
            db.commit()
            db.refresh(survey)

        # Create a question for this survey if none exists
        question = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).first()
        if not question:
            question = SurveyQuestion(
                id=uuid.UUID("a7803c3b-0c7d-4414-b474-f10ddc9086c5"),
                survey_id=survey_id,
                question_text="How would you rate our service?",
                question_type=QuestionTypeEnum.rating,
                is_required=True,
                sort_order=1,
            )
            db.add(question)
            db.commit()

    finally:
        db.close()
