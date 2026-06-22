import os
import logging
import boto3
from functools import lru_cache

from core import config

logger = logging.getLogger(__name__)

MOCK_MODE = os.getenv("MOCK_COGNITO", "false").lower() == "true"
SNS_REGION = os.getenv("COGNITO_REGION", "ap-south-1")


@lru_cache(maxsize=1)
def get_sns_client():
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    if endpoint_url:
        return boto3.client(
            "sns",
            region_name=SNS_REGION,
            endpoint_url=endpoint_url,
            aws_access_key_id="mock",
            aws_secret_access_key="mock",
        )
    return boto3.client("sns", region_name=SNS_REGION)


def send_otp_sms(phone_number: str, otp_code: str) -> bool:
    message = f"Your AxioraPulse verification code is: {otp_code}. Valid for 5 minutes. Do not share this code."

    # Only echo the OTP on explicit local development — never in any deployed
    # environment, and gated on an allowlist rather than "not production". (AP-SEC-014)
    if config.IS_LOCAL and not config.IS_PRODUCTION:
        print(f"\n{'=' * 50}")
        print(f"[LOCAL DEV ONLY] OTP for {phone_number}: {otp_code}")
        print(f"{'=' * 50}\n")

    if MOCK_MODE:
        return True

    try:
        client = get_sns_client()
        client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"},
                "AWS.SNS.SMS.SenderID": {"DataType": "String", "StringValue": "AxioraPulse"},
            },
        )
        return True
    except Exception as exc:
        logger.error("SNS SMS publish failed: %s", type(exc).__name__)
        return False
