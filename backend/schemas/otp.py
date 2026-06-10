from pydantic import BaseModel, field_validator
import re
from .user import UserProfileOut


class OTPSendRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        # Strip all characters except digits and '+'
        return re.sub(r"[^\d+]", "", v)


class OTPSendResponse(BaseModel):
    message: str
    expires_in: int = 300  # seconds


class OTPVerifyRequest(BaseModel):
    phone_number: str
    otp_code: str

    @field_validator("phone_number")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return re.sub(r"[^\d+]", "", v)


class OTPLoginResponse(BaseModel):
    id_token: str
    user: UserProfileOut


class PhoneLinkVerifyRequest(BaseModel):
    phone_number: str
    otp_code: str

    @field_validator("phone_number")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return re.sub(r"[^\d+]", "", v)
