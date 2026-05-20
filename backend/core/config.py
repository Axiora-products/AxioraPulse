
import os
import boto3
from dotenv import load_dotenv
from functools import lru_cache

load_dotenv()

@lru_cache(maxsize=None)
def get_ssm_parameter(name: str):
    """Fetch a parameter from AWS SSM Parameter Store."""
    try:
        ssm = boto3.client("ssm", region_name="ap-south-1")
        return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    except Exception as e:
        # Fallback to None if SSM fails or parameter doesn't exist
        return None

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "")  # e.g. https://app.axiorapulse.com

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

# Email / Resend Configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY") or get_ssm_parameter("/axiorapulse/production/RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM") or get_ssm_parameter("/axiorapulse/production/EMAIL_FROM") or "Axiora Pulse <noreply@axiorapulse.com>"

if not DATABASE_URL:
    raise Exception("DATABASE_URL is missing")

if not SECRET_KEY:
    raise Exception("SECRET_KEY is missing")
