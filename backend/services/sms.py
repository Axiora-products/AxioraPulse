import os
import boto3
from functools import lru_cache

MOCK_MODE = os.getenv("MOCK_COGNITO", "false").lower() == "true"
SNS_REGION = os.getenv("COGNITO_REGION", "ap-south-1")


@lru_cache(maxsize=1)
def get_sns_client():
    return boto3.client("sns", region_name=SNS_REGION)


def send_otp_sms(phone_number: str, otp_code: str) -> bool:
    message = f"Your AxioraPulse verification code is: {otp_code}. Valid for 5 minutes. Do not share this code."

    if os.getenv("ENVIRONMENT", "development").lower() != "production":
        print(f"\n{'='*50}")
        print(f"[DEV ONLY] OTP for {phone_number}: {otp_code}")
        print(f"{'='*50}\n")

    if MOCK_MODE:
        return True

    try:
        client = get_sns_client()
        client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional"
                },
                "AWS.SNS.SMS.SenderID": {
                    "DataType": "String",
                    "StringValue": "AxioraPulse"
                }
            }
        )
        return True
    except Exception as e:
        print(f"SNS SMS ERROR: {str(e)}")
        return False
