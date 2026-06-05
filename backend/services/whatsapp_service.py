import os
import re
from typing import Any, Dict

import requests

# Twilio Credentials
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM")  # e.g., "+14155238886" (without "whatsapp:" prefix)

# Meta WhatsApp Cloud API Credentials
META_WHATSAPP_ACCESS_TOKEN = os.getenv("META_WHATSAPP_ACCESS_TOKEN")
META_WHATSAPP_PHONE_NUMBER_ID = os.getenv("META_WHATSAPP_PHONE_NUMBER_ID")


def send_whatsapp_message(to_number: str, message: str) -> Dict[str, Any]:
    """
    Sends a real-time WhatsApp message using configured messaging provider (Meta or Twilio).
    If no provider keys are set in environment variables, it gracefully falls back
    to a mock simulation for seamless development and testing.
    """
    # Clean phone number (keep only digits and '+')
    clean_number = re.sub(r"[^\d+]", "", to_number.strip())
    if not clean_number.startswith("+"):
        clean_number = "+" + clean_number

    # 1. Option A: Meta WhatsApp Cloud API (Primary Direct Channel)
    if META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID:
        url = f"https://graph.facebook.com/v18.0/{META_WHATSAPP_PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {META_WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        }

        # Meta expects the number without the leading '+' for some accounts,
        # but format is generally standard with or without. We clean it to digits only.
        recipient_number = clean_number.replace("+", "")

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_number,
            "type": "text",
            "text": {"body": message},
        }

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=12)
            if response.status_code in [200, 201]:
                return {"status": "sent", "reason": None}
            else:
                try:
                    err_json = response.json()
                    error_msg = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    error_msg = response.text
                return {"status": "failed", "reason": f"Meta API Error: {error_msg}"}
        except Exception as e:
            return {"status": "failed", "reason": f"Meta API request failed: {str(e)}"}

    # 2. Option B: Twilio WhatsApp API (Secondary Standard Broker)
    elif TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"

        # Format sender/recipient WhatsApp tokens
        from_str = TWILIO_WHATSAPP_FROM.strip()
        if not from_str.startswith("+"):
            from_str = "+" + from_str

        data = {
            "To": f"whatsapp:{clean_number}",
            "From": f"whatsapp:{from_str}",
            "Body": message,
        }

        try:
            response = requests.post(url, data=data, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN), timeout=12)
            if response.status_code in [200, 201]:
                return {"status": "sent", "reason": None}
            else:
                try:
                    err_json = response.json()
                    error_msg = err_json.get("message", response.text)
                except Exception:
                    error_msg = response.text
                return {"status": "failed", "reason": f"Twilio API Error: {error_msg}"}
        except Exception as e:
            return {"status": "failed", "reason": f"Twilio request failed: {str(e)}"}

    # 3. Option C: Graceful high-fidelity Mock simulation fallback (Local / Sandbox Development Mode)
    else:
        import time

        # Simulate network roundtrip latency
        time.sleep(0.06)

        # Simulate 5% routing failure rate for numbers ending in 9
        if clean_number.endswith("9"):
            return {
                "status": "failed",
                "reason": "Delivery failed: Temporary routing failure or network congestion (Simulation)",
            }

        return {"status": "sent", "reason": None}
