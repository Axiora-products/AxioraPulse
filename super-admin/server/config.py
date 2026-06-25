import os
from dotenv import load_dotenv

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")

PORT = int(os.getenv("PORT", "8001"))
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Fallback to local postgres if unset
    DATABASE_URL = "postgresql://postgres:root@localhost:5432/axiorapulse"

ADMIN_FRONTEND_URL = os.getenv("ADMIN_FRONTEND_URL", "http://localhost:5175")

# Admin Cognito configurations
COGNITO_USER_POOL_ID = os.getenv("SUPER_ADMIN_COGNITO_USER_POOL_ID", "ap-south-1_mockpool")
COGNITO_APP_CLIENT_ID = os.getenv("SUPER_ADMIN_COGNITO_APP_CLIENT_ID", "mockclientid1234567890")
COGNITO_REGION = os.getenv("SUPER_ADMIN_COGNITO_REGION", "ap-south-1")

MOCK_COGNITO = os.getenv("MOCK_COGNITO", "false").strip().lower() == "true"
MOCK_COGNITO_SECRET = os.getenv("MOCK_COGNITO_SECRET", "mock-secret-key-1234567890")
