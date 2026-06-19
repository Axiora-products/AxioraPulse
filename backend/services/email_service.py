import os
import requests


def send_email(to_email: str, subject: str, body: str):
    email_from = os.getenv("EMAIL_FROM", "Axiora Pulse <noreply@axiorapulse.com>")
    api_key = os.getenv("RESEND_API_KEY")

    # Fallback to local stdout logging if API key is missing or mocked
    if not api_key or api_key.startswith("mock") or api_key == "dummy":
        print("\n=== [LOCAL EMAIL SIMULATION] ===")
        print(f"From: {email_from}")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body: {body[:300]}...")
        print("===============================\n")
        return

    # Send using Resend REST API
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": email_from,
        "to": [to_email],
        "subject": subject,
        "html": body,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        try:
            error_detail = response.json().get("message", str(e))
        except Exception:
            error_detail = str(e)
        raise Exception(f"Resend API error: {error_detail}")
