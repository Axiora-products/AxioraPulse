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
                "token_use": "id"
            }
        elif token == "invalidtoken":
            return None
        return None
    monkeypatch.setattr(cognito_utils, "verify_cognito_token", mock_verify)
    monkeypatch.setattr(dependencies, "verify_cognito_token", mock_verify)
    monkeypatch.setattr(routes.auth, "verify_cognito_token", mock_verify)

@pytest.fixture
def auth_headers():
    return {
        "Authorization": f"Bearer {TEST_TOKEN}"
    }