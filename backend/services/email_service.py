import requests
from core.config import RESEND_API_KEY, EMAIL_FROM

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, body: str):
    if not RESEND_API_KEY:
        raise Exception("RESEND_API_KEY is not configured")

    resp = requests.post(
        RESEND_API_URL,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": EMAIL_FROM,
            "to": [to_email],
            "subject": subject,
            "html": body,
        },
        timeout=10,
    )

    if not resp.ok:
        try:
            error_msg = resp.json().get("message", "Email send failed")
        except Exception:
            error_msg = "Email send failed"
        raise Exception(f"Resend error {resp.status_code}: {error_msg}")

