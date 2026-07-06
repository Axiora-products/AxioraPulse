import requests
from core.config import RESEND_API_KEY, EMAIL_FROM

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, body: str):
    # Fallback to local stdout logging if API key is missing or mocked
    if not RESEND_API_KEY or RESEND_API_KEY.startswith("mock") or RESEND_API_KEY == "dummy":
        print("\n=== [LOCAL EMAIL SIMULATION] ===")
        print(f"From: {EMAIL_FROM}")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body: {body[:300]}...")
        print("===============================\n")
        return

    # Send using Resend REST API
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": EMAIL_FROM,
        "to": [to_email],
        "subject": subject,
        "html": body,
    }

    try:
        response = requests.post(RESEND_API_URL, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        try:
            error_detail = response.json().get("message", str(e))
        except Exception:
            error_detail = str(e)
        raise Exception(f"Resend API error: {error_detail}")
