import pytest

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


@pytest.fixture(scope="session", autouse=True)
def seed_test_data():
    from db.database import SessionLocal
    from db.models import Tenant, UserProfile, Survey, SurveyQuestion, SurveyStatusEnum, QuestionTypeEnum
    import uuid

    db = SessionLocal()
    try:
        # 1. Create default Tenant if none exists
        tenant = db.query(Tenant).first()
        if not tenant:
            tenant = Tenant(
                id=uuid.UUID("d3b07384-d113-4956-a5cc-be150efb0f85"), name="Test Organisation", slug="test-org"
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        # 2. Create default UserProfile if none exists
        user = (
            db.query(UserProfile)
            .filter(
                (UserProfile.cognito_sub == "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2")
                | (UserProfile.email == "dev@axiorapulse.com")
            )
            .first()
        )
        if not user:
            user = UserProfile(
                id=uuid.UUID("f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2"),
                email="dev@axiorapulse.com",
                full_name="Developer User",
                cognito_sub="f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2",
                tenant_id=tenant.id,
                is_active=True,
                account_status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # If the user exists but has a different cognito_sub (e.g. from local AWS seeding),
            # update it to match the hardcoded test token sub so tests authenticate successfully.
            if user.cognito_sub != "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2":
                user.cognito_sub = "f1d3ad6a-5031-70d5-9d6a-5013ed87e8d2"
                db.commit()
                db.refresh(user)

        # 3. Create target Survey if not exists
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

        # 4. Create a question for this survey if none exists
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
