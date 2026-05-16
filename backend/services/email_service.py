import os
import boto3
from botocore.exceptions import ClientError

_ses_client = None


def _get_ses():
    global _ses_client
    if _ses_client is None:
        region = os.getenv("AWS_SES_REGION", "ap-south-1")
        _ses_client = boto3.client("ses", region_name=region)
    return _ses_client


def send_email(to_email: str, subject: str, body: str):
    email_from = os.getenv("EMAIL_FROM", "Axiora Pulse <noreply@axiorapulse.com>")

    try:
        _get_ses().send_email(
            Source=email_from,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": body, "Charset": "UTF-8"}},
            },
        )
    except ClientError as e:
        raise Exception(f"SES error: {e.response['Error']['Message']}")
