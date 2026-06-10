import os
import re
import uuid
import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from jose import jwt

from core.rate_limiter import limiter
from db.database import get_db
from db.models import UserProfile, OTPVerification
from schemas import (
    OTPSendRequest,
    OTPSendResponse,
    OTPVerifyRequest,
    OTPLoginResponse,
    PhoneLinkVerifyRequest,
    UserProfileOut,
)
from services.sms import send_otp_sms
from dependencies import get_current_user

router = APIRouter(prefix="/auth/otp", tags=["otp"])

COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID")
OTP_JWT_SECRET = os.getenv("OTP_JWT_SECRET", "otp-secret-key-change-in-production")

PHONE_REGEX = re.compile(r"^\+\d{10,15}$")


def _validate_phone(phone_number: str) -> None:
    if not PHONE_REGEX.match(phone_number):
        raise HTTPException(400, "Invalid phone number format. Must start with + and contain 10-15 digits.")


# ── POST /auth/otp/send ──────────────────────────────────────────────────────


@router.post("/send", response_model=OTPSendResponse)
@limiter.limit("3/minute")
def otp_send(
    request: Request,
    body: OTPSendRequest,
    db: Session = Depends(get_db),
):
    _validate_phone(body.phone_number)

    # Check if a verified user exists with this phone number
    user = db.query(UserProfile).filter(
        UserProfile.phone_number == body.phone_number,
        UserProfile.phone_verified == True,
    ).first()
    if not user:
        raise HTTPException(404, "No account linked to this number. Please register and link your phone in Settings.")

    # Delete any existing unexpired OTPs for this phone + purpose
    db.query(OTPVerification).filter(
        OTPVerification.phone_number == body.phone_number,
        OTPVerification.purpose == "login",
        OTPVerification.expires_at > datetime.now(timezone.utc),
        OTPVerification.verified == False,
    ).delete(synchronize_session=False)

    # Generate and store OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_record = OTPVerification(
        id=uuid.uuid4(),
        phone_number=body.phone_number,
        otp_code=otp_code,
        purpose="login",
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(otp_record)
    db.commit()

    send_otp_sms(body.phone_number, otp_code)

    return OTPSendResponse(message="OTP sent successfully", expires_in=300)


# ── POST /auth/otp/verify ────────────────────────────────────────────────────


@router.post("/verify", response_model=OTPLoginResponse)
@limiter.limit("5/minute")
def otp_verify(
    request: Request,
    body: OTPVerifyRequest,
    db: Session = Depends(get_db),
):
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.phone_number == body.phone_number,
        OTPVerification.purpose == "login",
        OTPVerification.verified == False,
        OTPVerification.expires_at > datetime.now(timezone.utc),
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record:
        raise HTTPException(400, "OTP expired or not found")

    otp_record.attempts += 1
    db.commit()

    if otp_record.attempts >= 5:
        raise HTTPException(429, "Too many attempts")

    if otp_record.otp_code != body.otp_code:
        raise HTTPException(400, "Invalid OTP")

    # Mark OTP as verified
    otp_record.verified = True
    db.commit()

    # Look up user by phone number
    user = db.query(UserProfile).filter(
        UserProfile.phone_number == body.phone_number,
    ).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Lazy verification — ensure phone_verified is set
    if not user.phone_verified:
        user.phone_verified = True
        db.commit()
        db.refresh(user)

    # Generate JWT token
    issuer_url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID or 'mock-user-pool-id'}"
    payload = {
        "sub": str(user.cognito_sub or user.id),
        "email": user.email,
        "name": user.full_name,
        "phone_number": user.phone_number,
        "token_use": "id",
        "auth_method": "otp",
        "aud": COGNITO_APP_CLIENT_ID or "mock-client-id",
        "iss": issuer_url,
    }
    id_token = jwt.encode(payload, OTP_JWT_SECRET, algorithm="HS256")

    return OTPLoginResponse(
        id_token=id_token,
        user=UserProfileOut.model_validate(user),
    )


# ── POST /auth/otp/phone/send ────────────────────────────────────────────────


@router.post("/phone/send", response_model=OTPSendResponse)
@limiter.limit("3/minute")
def phone_link_send(
    request: Request,
    body: OTPSendRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_phone(body.phone_number)

    # Check if another user already has this phone number verified
    existing = db.query(UserProfile).filter(
        UserProfile.phone_number == body.phone_number,
        UserProfile.phone_verified == True,
        UserProfile.id != current_user.id,
    ).first()
    if existing:
        raise HTTPException(409, "This phone number is already linked to another account")

    # Delete any existing unexpired OTPs for this phone + purpose
    db.query(OTPVerification).filter(
        OTPVerification.phone_number == body.phone_number,
        OTPVerification.purpose == "link_phone",
        OTPVerification.expires_at > datetime.now(timezone.utc),
        OTPVerification.verified == False,
    ).delete(synchronize_session=False)

    # Generate and store OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_record = OTPVerification(
        id=uuid.uuid4(),
        phone_number=body.phone_number,
        otp_code=otp_code,
        purpose="link_phone",
        user_id=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(otp_record)
    db.commit()

    send_otp_sms(body.phone_number, otp_code)

    return OTPSendResponse(message="OTP sent successfully", expires_in=300)


# ── POST /auth/otp/phone/verify ──────────────────────────────────────────────


@router.post("/phone/verify", response_model=UserProfileOut)
@limiter.limit("5/minute")
def phone_link_verify(
    request: Request,
    body: PhoneLinkVerifyRequest,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.phone_number == body.phone_number,
        OTPVerification.purpose == "link_phone",
        OTPVerification.user_id == current_user.id,
        OTPVerification.verified == False,
        OTPVerification.expires_at > datetime.now(timezone.utc),
    ).order_by(OTPVerification.created_at.desc()).first()

    if not otp_record:
        raise HTTPException(400, "OTP expired or not found")

    otp_record.attempts += 1
    db.commit()

    if otp_record.attempts >= 5:
        raise HTTPException(429, "Too many attempts")

    if otp_record.otp_code != body.otp_code:
        raise HTTPException(400, "Invalid OTP")

    # Mark OTP as verified and update user phone
    otp_record.verified = True
    current_user.phone_number = body.phone_number
    current_user.phone_verified = True
    db.commit()
    db.refresh(current_user)

    return UserProfileOut.model_validate(current_user)


# ── DELETE /auth/otp/phone/remove ─────────────────────────────────────────────


@router.delete("/phone/remove")
@limiter.limit("5/minute")
def phone_remove(
    request: Request,
    current_user: UserProfile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.phone_number = None
    current_user.phone_verified = False
    db.commit()

    return {"message": "Phone number removed"}
