import os

from dotenv import load_dotenv

load_dotenv()


# ── Environment ────────────────────────────────────────────────────────────────
# NOTE: defaults to "development". Production MUST set ENVIRONMENT=production
# explicitly — several dev-only shortcuts (predictable OTP, verbose logging) key
# off this value and fail open if it is left unset. (AP-SEC-014)
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")
IS_LOCAL = ENVIRONMENT in ("local", "development", "dev", "test")


# ── Secret hygiene ─────────────────────────────────────────────────────────────
# Values that shipped as hardcoded defaults in the source tree. They are public
# and therefore must NEVER be accepted as real signing secrets. (AP-SEC-001)
_INSECURE_SECRET_VALUES = {
    "otp-secret-key-change-in-production",
    "mock-secret-key-1234567890",
    "change-in-production",
    "local-development-secret-key-1234567890",
}


def _clean_secret(value: str | None) -> str | None:
    """Return a usable secret, or None if it is empty or a known-insecure default."""
    if value is None:
        return None
    value = value.strip()
    if not value or value in _INSECURE_SECRET_VALUES:
        return None
    return value


DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = _clean_secret(os.getenv("SECRET_KEY"))

GEMINI_KEY = os.getenv("GEMINI_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_KEY")
OPENAI_KEY = os.getenv("OPENAI_KEY")

FRONTEND_URL = os.getenv("FRONTEND_URL", "")  # e.g. https://app.axiorapulse.com

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")  # (AP-SEC-004)

DISABLE_PAYMENTS = os.getenv("DISABLE_PAYMENTS", "false").lower() == "true"

# ── Auth secrets (fail-closed: no insecure defaults) ───────────────────────────
# OTP login mints HS256 tokens with this secret; the verifier only accepts such
# tokens when the secret is explicitly configured. Unset => OTP tokens rejected.
OTP_JWT_SECRET = _clean_secret(os.getenv("OTP_JWT_SECRET"))

# Mock Cognito is a local-development aid only. It must never be enabled, nor its
# secret defaulted, in production. (AP-SEC-001, AP-SEC-029)
MOCK_COGNITO = os.getenv("MOCK_COGNITO", "false").strip().lower() == "true"
MOCK_COGNITO_SECRET = _clean_secret(os.getenv("MOCK_COGNITO_SECRET"))

# Comma-separated allowlist of emails granted super_admin. Data/config-driven so
# it is revocable without a code deploy and contains no hardcoded identity.
# (AP-SEC-002)
SUPER_ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("SUPER_ADMIN_EMAILS", "").split(",") if e.strip()}

# ── PII field-level encryption ─────────────────────────────────────────────────
# Comma-separated Fernet keys; the first encrypts, all are tried on decrypt (key
# rotation). Unset => passthrough (plaintext) for local dev; set it in production.
PII_ENCRYPTION_KEYS = [k.strip() for k in os.getenv("PII_ENCRYPTION_KEYS", "").split(",") if k.strip()]

# ── Row-Level Security (defense-in-depth, opt-in) ──────────────────────────────
# When true (and the RLS migration has been applied), the app sets a per-request
# Postgres tenant GUC so the database itself enforces tenant isolation even if app
# code has an authorization slip. Default OFF — enable & test in staging first.
ENABLE_DB_RLS = os.getenv("ENABLE_DB_RLS", "false").strip().lower() == "true"


if not DATABASE_URL:
    raise Exception("DATABASE_URL is missing")

if not SECRET_KEY:
    raise Exception("SECRET_KEY is missing or set to a known-insecure default value")

# Fail closed: mock auth must never be reachable in production.
if IS_PRODUCTION and MOCK_COGNITO:
    raise Exception("MOCK_COGNITO must not be enabled in production")
