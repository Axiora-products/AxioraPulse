import os
import requests

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to_email: str, subject: str, body: str):
    resend_key = os.getenv("RESEND_API_KEY")
    email_from = os.getenv("EMAIL_FROM", "Axiora Pulse <noreply@axiorapulse.com>")

    if not resend_key:
        raise Exception("RESEND_API_KEY is not configured")

    resp = requests.post(
        RESEND_API_URL,
        headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
        json={"from": email_from, "to": [to_email], "subject": subject, "html": body},
        timeout=10,
    )

    if not resp.ok:
        raise Exception(f"Resend error {resp.status_code}: {resp.json().get('message', 'Email send failed')}")
