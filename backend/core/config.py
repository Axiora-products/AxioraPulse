
import os

from dotenv import load_dotenv

load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = os.getenv("SECRET_KEY")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

FRONTEND_URL = os.getenv("FRONTEND_URL", "")  # e.g. https://app.axiorapulse.com

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")


if not DATABASE_URL:
    raise Exception("DATABASE_URL is missing")

if not SECRET_KEY:
    raise Exception("SECRET_KEY is missing")
